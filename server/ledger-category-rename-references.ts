const CURRENT_SOURCE_TAG_FIELDS = [
  'tagName',
  'floatingPnlTagName',
  'collateralTagName',
  'marginRateTagName',
  'pendingInterestTagName',
  'paidInterestTagName',
  'interestTagName',
] as const;

const REFERENCE_TABLES = [
  { table: 'ledger_orders', column: 'collateral_source' },
  { table: 'ledger_order_participants', column: 'order_snapshot' },
] as const;

type JsonObject = Record<string, unknown>;

function parseReferenceObject(value: unknown, context: string): JsonObject | null {
  if (value === null || value === undefined || value === '') return null;
  let parsed: unknown = value;
  if (typeof value === 'string' || Buffer.isBuffer(value)) {
    try {
      parsed = JSON.parse(Buffer.isBuffer(value) ? value.toString('utf8') : value as string);
    } catch {
      // Do not leak source contents or silently strand a reference on the old name.
      throw new Error(`标签改名失败：${context} 包含损坏的 JSON`);
    }
  }
  if (parsed === null || parsed === '') return null;
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`标签改名失败：${context} 必须是 JSON 对象`);
  }
  return parsed as JsonObject;
}

function renameSource(
  value: unknown,
  ledgerId: number,
  oldName: string,
  newName: string,
  context: string,
): { changed: boolean; value: unknown } {
  const source = parseReferenceObject(value, context);
  // The current source schema uses a numeric ledgerId. Never infer a ledger from
  // the containing order (37's dynamic sources can belong to orders in ledger 52).
  if (!source || source.ledgerId !== ledgerId) return { changed: false, value };
  let renamed: JsonObject | undefined;
  for (const field of CURRENT_SOURCE_TAG_FIELDS) {
    if (typeof source[field] === 'string' && source[field] === oldName) {
      renamed ??= { ...source };
      renamed[field] = newName;
    }
  }
  if (!renamed) return { changed: false, value };
  return {
    changed: true,
    // Preserve the string/object representation of a nested collateral_source.
    value: typeof value === 'string' || Buffer.isBuffer(value) ? JSON.stringify(renamed) : renamed,
  };
}

/**
 * Rename only live collateral-source tag references, using the caller's existing
 * transaction and information_schema snapshot. No connection/transaction/DDL is
 * created here. JSON column values are serialized only at the SQL boundary;
 * nested sources retain their original string/object representation.
 */
export async function renameCurrentTagReferences(
  connection: any,
  ledgerId: number,
  oldName: string,
  newName: string,
  columns: ReadonlyMap<string, ReadonlySet<string>>,
): Promise<void> {
  // Only ledger 37 currently provides dynamic cross-ledger tag references.
  if (ledgerId !== 37 || oldName === newName) return;

  // Validate the whole contract before querying or updating either table.
  const available = REFERENCE_TABLES.filter(({ table, column }) => {
    const tableColumns = columns.get(table);
    if (!tableColumns) return false;
    if (!tableColumns.has('id')) {
      throw new Error(`标签改名失败：${table} 缺少必需列 id`);
    }
    // Older installations may not yet have enabled the snapshot/source feature.
    return tableColumns.has(column);
  });

  const updates: Array<{ table: string; column: string; id: unknown; json: string }> = [];
  for (const { table, column } of available) {
    // Do not use JSON_VALID/JSON_EXTRACT as filters: malformed JSON must abort
    // instead of being hidden. Lock all non-empty candidates, reading only id
    // and the one JSON column. No status/owner-ledger filter may hide references.
    const [rows] = await connection.execute(
      `SELECT id, ${column} FROM ${table} WHERE ${column} IS NOT NULL AND CHAR_LENGTH(${column}) > 0 FOR UPDATE`,
    );
    if (!Array.isArray(rows)) throw new Error(`标签改名失败：无法读取 ${table}.${column}`);
    for (const row of rows) {
      const context = `${table}.${column} (id=${String(row.id)})`;
      let changed = false;
      let value: unknown = row[column];
      if (column === 'collateral_source') {
        ({ changed, value } = renameSource(value, ledgerId, oldName, newName, context));
      } else {
        const snapshot = parseReferenceObject(value, context);
        if (snapshot) {
          const source = renameSource(snapshot.collateral_source, ledgerId, oldName, newName, `${context}.collateral_source`);
          changed = source.changed;
          if (changed) value = { ...snapshot, collateral_source: source.value };
        }
      }
      if (changed) {
        if (row.id === null || row.id === undefined) {
          throw new Error(`标签改名失败：${table} 引用行缺少 id`);
        }
        updates.push({ table, column, id: row.id, json: typeof value === 'string' ? value : JSON.stringify(value) });
      }
    }
  }

  // Parse all candidate rows before the first write. The caller still owns
  // rollback if a later SQL operation fails; errors deliberately propagate.
  for (const { table, column, id, json } of updates) {
    await connection.execute(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, [json, id]);
  }
}
