import { renameCurrentTagReferences } from "./ledger-category-rename-references";

type NameReference = {
  table: string;
  scopeColumn?: "ledger_id";
  nameColumns: readonly string[];
  requiredColumns?: readonly string[];
  fixedLedgerId?: number;
};

// Only audited identifiers may enter SQL. Add newly audited references here.
const NAME_REFERENCES: readonly NameReference[] = [
  {
    table: "ledger_tag_config",
    scopeColumn: "ledger_id",
    nameColumns: ["tag_name"],
  },
  {
    table: "tag_interest_periods",
    scopeColumn: "ledger_id",
    nameColumns: ["tag_name"],
  },
  {
    table: "tag_interest_operation_logs",
    scopeColumn: "ledger_id",
    nameColumns: ["tag_name"],
  },
  {
    table: "ledger_admin_notes",
    scopeColumn: "ledger_id",
    nameColumns: ["tag_name"],
  },
  {
    table: "ledger_margin_logs",
    scopeColumn: "ledger_id",
    nameColumns: ["tag_name"],
  },
  {
    table: "ai_wallet_project_holds",
    scopeColumn: "ledger_id",
    nameColumns: ["tag_name"],
  },
  {
    table: "ai_wallet_project_hold_migrations",
    scopeColumn: "ledger_id",
    nameColumns: ["tag_name"],
  },
  {
    table: "ai_wallet_project_hold_transfers",
    scopeColumn: "ledger_id",
    nameColumns: ["source_tag_name", "target_tag_name"],
  },
  {
    table: "dividend_records",
    scopeColumn: "ledger_id",
    nameColumns: ["tag_name"],
  },
  {
    table: "ledger37_dividend_recovery_actions",
    fixedLedgerId: 37,
    requiredColumns: ["user_id"],
    nameColumns: ["tag_name"],
  },
  {
    table: "ledger37_dividend_batch_actions",
    fixedLedgerId: 37,
    requiredColumns: ["user_id"],
    nameColumns: ["tag_name"],
  },
  {
    table: "ledger37_pause_settlement_actions",
    fixedLedgerId: 37,
    requiredColumns: ["user_id"],
    nameColumns: ["tag_name"],
  },
];

type KeySpan = { key: string; start: number; end: number };

/** Locate only top-level key tokens; JSON.parse validates syntax, not value storage.
 * Replacing those tokens preserves every value's original bytes (including large
 * numbers, nested JSON strings, whitespace, unknown fields and historical IDs).
 */
function topLevelKeys(
  raw: unknown,
  memberId: number
): { raw: string; keys: KeySpan[] } {
  if (typeof raw !== "string") {
    throw new Error(
      `成员 ${memberId} 的 initial_balances 必须是 JSON 对象文本`
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`成员 ${memberId} 的 initial_balances JSON 损坏`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`成员 ${memberId} 的 initial_balances 必须是 JSON 对象`);
  }
  const stringEnd = (start: number): number => {
    let i = start + 1;
    while (i < raw.length) {
      if (raw[i] === "\\") i += 2;
      else if (raw[i++] === '"') return i;
    }
    throw new Error(`成员 ${memberId} 的 initial_balances 字符串未闭合`);
  };
  const keys: KeySpan[] = [];
  const seen = new Set<string>();
  let i = raw.indexOf("{") + 1;
  while (i < raw.length) {
    while (/\s/.test(raw[i] ?? "") && i < raw.length) i++;
    if (raw[i] === "}") break;
    const start = i;
    const end = stringEnd(start);
    const key = JSON.parse(raw.slice(start, end)) as string;
    if (seen.has(key))
      throw new Error(`成员 ${memberId} 的 initial_balances 有重复键`);
    seen.add(key);
    keys.push({ key, start, end });
    i = end;
    while (raw[i] !== ":") i++;
    i++;
    // Skip the entire value without parsing/re-serializing it.
    let depth = 0;
    while (i < raw.length) {
      const char = raw[i];
      if (char === '"') {
        i = stringEnd(i);
        continue;
      }
      if (char === "{" || char === "[") depth++;
      else if (char === "}" || char === "]") {
        if (depth === 0) break;
        depth--;
      } else if (char === "," && depth === 0) break;
      i++;
    }
    if (raw[i] === "}") break;
    i++;
  }
  return { raw, keys };
}

function planMemberRename(
  raw: unknown,
  memberId: number,
  oldName: string,
  newName: string
): string | undefined {
  // initial_balances 是可空 TEXT；未配置成员保持原状，不生成空配置，更不补历史数据。
  // JSON 文本 "null"、数组或损坏内容仍由下面的严格校验拒绝。
  if (raw === null || raw === "") return undefined;
  const document = topLevelKeys(raw, memberId);
  const belongsTo = (key: string, name: string) =>
    key === name || key.startsWith(`${name}__`);
  const moving = new Set(
    document.keys
      .filter(({ key }) => belongsTo(key, oldName))
      .map(({ key }) => key)
  );
  // Reject destination residue, even if newName is nested under oldName.
  // When shrinking A__B -> A, source keys necessarily live inside destination
  // namespace; those move simultaneously, but any other A key is a conflict.
  const shrinkingNamespace = oldName.startsWith(`${newName}__`);
  for (const { key } of document.keys) {
    if (belongsTo(key, newName) && !(shrinkingNamespace && moving.has(key))) {
      throw new Error(`成员 ${memberId} 的目标标签配置空间已有数据，不能合并`);
    }
  }
  if (moving.size === 0) return undefined;
  const destinations = new Set<string>();
  for (const { key } of document.keys) {
    const destination = moving.has(key)
      ? newName + key.slice(oldName.length)
      : key;
    if (destinations.has(destination))
      throw new Error(`成员 ${memberId} 的目标配置键冲突`);
    destinations.add(destination);
  }
  let result = "";
  let cursor = 0;
  for (const span of document.keys) {
    if (!moving.has(span.key)) continue;
    result +=
      document.raw.slice(cursor, span.start) +
      JSON.stringify(newName + span.key.slice(oldName.length));
    cursor = span.end;
  }
  return result + document.raw.slice(cursor);
}

async function existingReferences(connection: any): Promise<{
  references: NameReference[];
  columns: ReadonlyMap<string, ReadonlySet<string>>;
}> {
  const names = [
    ...NAME_REFERENCES.map(({ table }) => table),
    "ledger_orders",
    "ledger_order_participants",
  ];
  const [rows] = await connection.execute(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${names.map(() => "?").join(", ")})`,
    names
  );
  const columnsByTable = new Map<string, Set<string>>();
  for (const row of rows) {
    // Never turn metadata-provided identifiers into executable SQL.
    if (!names.includes(row.tableName)) continue;
    const columns = columnsByTable.get(row.tableName) ?? new Set<string>();
    columns.add(row.columnName);
    columnsByTable.set(row.tableName, columns);
  }
  const references = NAME_REFERENCES.filter(reference => {
    const columns = columnsByTable.get(reference.table);
    if (!columns) return false; // Absence is established by metadata, not swallowed errors.
    const required = [
      ...reference.nameColumns,
      ...(reference.requiredColumns ?? []),
      ...(reference.scopeColumn ? [reference.scopeColumn] : []),
    ];
    if (required.some(column => !columns.has(column))) {
      throw new Error(`关联表 ${reference.table} 缺少必要列，拒绝不完整迁移`);
    }
    return true;
  });
  return { references, columns: columnsByTable };
}

/** Caller supplies an exclusive mysql2 connection and releases it in finally.
 * This module owns only its transaction; authorization belongs to the caller.
 */
export async function renameLedgerCategoryPreservingConfig(
  connection: any,
  categoryId: number,
  data: { name: string; icon?: string; color?: string }
): Promise<true> {
  const newName = typeof data?.name === "string" ? data.name.trim() : "";
  if (!newName || Array.from(newName).length > 50)
    throw new Error("标签名称须为 1–50 个字符");
  if (!Number.isSafeInteger(categoryId) || categoryId <= 0)
    throw new Error("分类 ID 无效");
  await connection.beginTransaction();
  try {
    const [initial] = await connection.execute(
      "SELECT id, ledgerId, name, parentId FROM ledger_categories WHERE id = ?",
      [categoryId]
    );
    if (initial.length !== 1) throw new Error("分类不存在");
    const ledgerId = Number(initial[0].ledgerId);
    if (!Number.isSafeInteger(ledgerId) || ledgerId <= 0)
      throw new Error("分类所属账本无效");
    const [ledgers] = await connection.execute(
      "SELECT id FROM ledgers WHERE id = ? FOR UPDATE",
      [ledgerId]
    );
    if (ledgers.length !== 1) throw new Error("账本不存在");
    const [categories] = await connection.execute(
      "SELECT id, ledgerId, name, parentId FROM ledger_categories WHERE ledgerId = ? ORDER BY id FOR UPDATE",
      [ledgerId]
    );
    const target = categories.find((row: any) => Number(row.id) === categoryId);
    if (!target || Number(target.ledgerId) !== ledgerId)
      throw new Error("分类所属账本发生变化");
    const oldName = target.name;
    if (typeof oldName !== "string" || !oldName)
      throw new Error("原标签名称无效");
    if (oldName !== newName && oldName.toLowerCase() === newName.toLowerCase())
      throw new Error("拒绝仅大小写变化的标签改名，避免数据库排序规则歧义");
    // Use database equality too, so case/accent-insensitive collations cannot make
    // two names silently share a config namespace. All ledger categories are locked.
    for (const name of Array.from(new Set([oldName, newName]))) {
      const [conflicts] = await connection.execute(
        "SELECT id FROM ledger_categories WHERE ledgerId = ? AND name = ? AND id <> ? FOR UPDATE",
        [ledgerId, name, categoryId]
      );
      if (conflicts.length)
        throw new Error(
          name === oldName
            ? "旧标签名称被其他分类共享"
            : "目标标签名称已被其他分类占用"
        );
    }
    if (oldName !== newName) {
      const { references, columns } = await existingReferences(connection);
      const [members] = await connection.execute(
        "SELECT id, initial_balances FROM ledger_members WHERE ledgerId = ? FOR UPDATE",
        [ledgerId]
      );
      // Validate and plan EVERY member before executing the first mutation.
      const memberPlans = members.map((member: any) => ({
        id: member.id,
        raw: planMemberRename(
          member.initial_balances,
          member.id,
          oldName,
          newName
        ),
      }));
      const referencePlans: { sql: string; params: unknown[] }[] = [];
      for (const reference of references) {
        if (
          reference.fixedLedgerId !== undefined &&
          reference.fixedLedgerId !== ledgerId
        )
          continue;
        const scope = reference.scopeColumn
          ? `\`${reference.scopeColumn}\` = ? AND `
          : "";
        const scopeParams = reference.scopeColumn ? [ledgerId] : [];
        for (const column of reference.nameColumns) {
          const [residual] = await connection.execute(
            `SELECT \`${column}\` FROM \`${reference.table}\` WHERE ${scope}\`${column}\` = ? FOR UPDATE`,
            [...scopeParams, newName]
          );
          if (residual.length)
            throw new Error(
              `目标标签已有残留 ${reference.table} 配置或关联记录，拒绝合并`
            );
          await connection.execute(
            `SELECT \`${column}\` FROM \`${reference.table}\` WHERE ${scope}\`${column}\` = ? FOR UPDATE`,
            [...scopeParams, oldName]
          );
          referencePlans.push({
            sql: `UPDATE \`${reference.table}\` SET \`${column}\` = ? WHERE ${scope}\`${column}\` = ?`,
            params: [newName, ...scopeParams, oldName],
          });
        }
      }
      for (const plan of memberPlans) {
        if (plan.raw !== undefined) {
          await connection.execute(
            "UPDATE ledger_members SET initial_balances = ? WHERE id = ? AND ledgerId = ?",
            [plan.raw, plan.id, ledgerId]
          );
        }
      }
      for (const plan of referencePlans)
        await connection.execute(plan.sql, plan.params);
      await renameCurrentTagReferences(
        connection,
        ledgerId,
        oldName,
        newName,
        columns
      );
    }
    const set = ["name = ?"];
    const values: unknown[] = [newName];
    if (data.icon !== undefined) {
      set.push("icon = ?");
      values.push(data.icon);
    }
    if (data.color !== undefined) {
      set.push("color = ?");
      values.push(data.color);
    }
    // Category identity and all unmentioned columns remain unchanged; this is last.
    await connection.execute(
      `UPDATE ledger_categories SET ${set.join(", ")} WHERE id = ? AND ledgerId = ?`,
      [...values, categoryId, ledgerId]
    );
    await connection.commit();
    return true;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "标签改名失败，且事务回滚失败"
      );
    }
    throw error;
  }
}
