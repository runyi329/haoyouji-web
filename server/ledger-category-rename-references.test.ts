import { describe, expect, it, vi } from 'vitest';
import { renameCurrentTagReferences } from './ledger-category-rename-references';

const OLD = '旧标签';
const NEW = '新标签';
const FIELDS = [
  'tagName', 'floatingPnlTagName', 'collateralTagName', 'marginRateTagName',
  'pendingInterestTagName', 'paidInterestTagName', 'interestTagName',
] as const;
const ORDERS = 'ledger_orders';
const PARTICIPANTS = 'ledger_order_participants';
type Row = Record<string, any>;

function schema(entries: Array<[string, string[]]> = [
  [ORDERS, ['id', 'collateral_source']],
  [PARTICIPANTS, ['id', 'order_snapshot']],
]): ReadonlyMap<string, ReadonlySet<string>> {
  return new Map(entries.map(([table, columns]) => [table, new Set(columns)]));
}

// No database module, environment loading, router, network, or real connection
// is imported. This fake rejects every SQL statement except the exact contract.
function offlineConnection(orders: Row[] = [], participants: Row[] = []) {
  const updates: Array<{ table: string; column: string; id: any; json: string }> = [];
  const execute = vi.fn(async (sql: string, values?: any[]) => {
    const select = /^SELECT id, (collateral_source|order_snapshot) FROM (ledger_orders|ledger_order_participants) WHERE \1 IS NOT NULL AND CHAR_LENGTH\(\1\) > 0 FOR UPDATE$/.exec(sql);
    if (select) {
      const rows = select[2] === ORDERS ? orders : participants;
      return [rows.filter(row => row[select[1]] !== null && row[select[1]] !== undefined && row[select[1]] !== ''), []];
    }
    const update = /^UPDATE (ledger_orders|ledger_order_participants) SET (collateral_source|order_snapshot) = \? WHERE id = \?$/.exec(sql);
    if (update && values?.length === 2) {
      updates.push({ table: update[1], column: update[2], id: values[1], json: values[0] });
      return [{ affectedRows: 1 }, []];
    }
    throw new Error(`Forbidden offline SQL: ${sql}`);
  });
  const forbidden = () => { throw new Error('Caller owns the transaction and connection'); };
  return {
    execute, updates,
    beginTransaction: vi.fn(forbidden), commit: vi.fn(forbidden),
    rollback: vi.fn(forbidden), release: vi.fn(forbidden), query: vi.fn(forbidden),
  };
}

async function rename(connection: ReturnType<typeof offlineConnection>, columns = schema(), ledgerId = 37, oldName = OLD, newName = NEW) {
  await renameCurrentTagReferences(connection, ledgerId, oldName, newName, columns);
}

const allFields = (): Record<(typeof FIELDS)[number], string> =>
  Object.fromEntries(FIELDS.map(field => [field, OLD])) as Record<(typeof FIELDS)[number], string>;

// Historical references are deliberately present in multiple representations.
const history = () => ({
  settlement_snapshot: {
    external37: { tags: { [OLD]: { config: { tag_name: OLD }, amount: '123.4500', notes: OLD } } },
    collateral_source: { ledgerId: 37, ...allFields() },
  },
  before: { collateral_source: { ledgerId: 37, ...allFields() }, name: OLD },
  after: { collateral_source: { ledgerId: 37, tagName: OLD }, name: OLD },
  audit: [{ before: OLD, after: OLD }],
  joint_order_segments: [{ collateral_source: { ledgerId: 37, tagName: OLD } }],
  historical_snapshot: '{ "tagName" : "旧标签", "amount": "123.4500" }',
});

describe('renameCurrentTagReferences: future explicit current references only', () => {
  it.each(FIELDS)('精确替换当前来源字段 %s，其它字段保持', async field => {
    const original = {
      ledgerId: 37, [field]: OLD, notes: OLD, amount: '123.4500', status: OLD,
      request_id: OLD, unknownTagName: OLD, ...history(),
    };
    const connection = offlineConnection([{ id: 1, collateral_source: JSON.stringify(original) }]);
    await rename(connection);
    expect(connection.updates).toHaveLength(1);
    expect(JSON.parse(connection.updates[0].json)).toEqual({ ...original, [field]: NEW });
  });

  it.each(['string', 'object', 'buffer'] as const)('订单来源为%s时，7字段全部替换但不递归修改', async representation => {
    const original = {
      ledgerId: 37, ...allFields(), ...history(), notes: OLD, amount: OLD, status: 'settled',
      requestId: OLD, request_id: OLD, alias: OLD, nested: { tagName: OLD },
      stockPositions: [{ name: OLD, quantity: '12.3000' }],
    };
    const json = JSON.stringify(original);
    const source = representation === 'object' ? original : representation === 'buffer' ? Buffer.from(json) : json;
    const connection = offlineConnection([{ id: 11, ledger_id: 52, collateral_source: source }]);
    await rename(connection);
    expect(connection.updates).toEqual([{
      table: ORDERS, column: 'collateral_source', id: 11,
      json: JSON.stringify({ ...original, ...Object.fromEntries(FIELDS.map(field => [field, NEW])) }),
    }]);
    expect(original.tagName).toBe(OLD); // No mutation of driver-provided objects.
    expect(connection.beginTransaction).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).not.toHaveBeenCalled();
    expect(connection.query).not.toHaveBeenCalled();
  });

  it.each(['string', 'object'] as const)('参与者嵌套%s来源保持表示类型，历史与其它设置完整保留', async sourceType => {
    const source = { ledgerId: 37, ...allFields(), notes: OLD, amount: '123.4500', nested: { tagName: OLD } };
    const snapshot = {
      collateral_source: sourceType === 'string' ? JSON.stringify(source) : source,
      amount: '999.0000', notes: OLD, admin_note: OLD, public_note: OLD, status: 'settled',
      request_id: OLD, tags: [OLD], display_config: { label: OLD }, ...history(),
    };
    const connection = offlineConnection([], [{ id: 21, order_snapshot: JSON.stringify(snapshot) }]);
    await rename(connection);
    expect(connection.updates).toHaveLength(1);
    const result = JSON.parse(connection.updates[0].json);
    expect(typeof result.collateral_source).toBe(sourceType);
    const changedSource = { ...source, ...Object.fromEntries(FIELDS.map(field => [field, NEW])) };
    expect(result).toEqual({
      ...snapshot, collateral_source: sourceType === 'string' ? JSON.stringify(changedSource) : changedSource,
    });
    expect(result.historical_snapshot).toBe(snapshot.historical_snapshot);
    expect(result.settlement_snapshot.external37.tags[OLD]).toEqual(snapshot.settlement_snapshot.external37.tags[OLD]);
    expect(result.settlement_snapshot.external37.tags).not.toHaveProperty(NEW);
  });

  it('参与者外层对象兼容，不修改原始对象', async () => {
    const original = { collateral_source: { ledgerId: 37, tagName: OLD }, ...history() };
    const connection = offlineConnection([], [{ id: 31, order_snapshot: original }]);
    await rename(connection);
    expect(JSON.parse(connection.updates[0].json)).toEqual({ ...original, collateral_source: { ledgerId: 37, tagName: NEW } });
    expect(original.collateral_source.tagName).toBe(OLD);
  });

  it('来源账本不匹配、ledgerId缺失或非数字时绝不改名', async () => {
    const sources = [
      { ledgerId: 52, ...allFields() }, { ...allFields() },
      { ledgerId: '37', ...allFields() }, { ledger_id: 37, ...allFields() },
    ];
    const connection = offlineConnection(
      sources.map((source, id) => ({ id, collateral_source: JSON.stringify(source) })),
      sources.map((source, id) => ({ id, order_snapshot: JSON.stringify({ collateral_source: source, ...history() }) })),
    );
    await rename(connection);
    expect(connection.updates).toEqual([]);
  });

  it('非37账本根本不读取动态来源，也不被其它账本坏JSON阻塞', async () => {
    const connection = offlineConnection([{ id: 1, collateral_source: '{broken' }]);
    await rename(connection, schema(), 52);
    expect(connection.execute).not.toHaveBeenCalled();
  });

  it('不会替换子串、空白变体、数组、非字符串或已存在的新名，也不追溯alias', async () => {
    const source = {
      ledgerId: 37, tagName: `${OLD}额外`, floatingPnlTagName: ` ${OLD}`,
      collateralTagName: `${OLD} `, marginRateTagName: [OLD], pendingInterestTagName: 12,
      paidInterestTagName: null, interestTagName: NEW, alias: OLD, previousName: OLD,
    };
    const connection = offlineConnection([{ id: 1, collateral_source: source }]);
    await rename(connection);
    expect(connection.updates).toEqual([]);
  });

  it('本次oldName只改对应字段，不合并、不覆盖已指向newName的字段', async () => {
    const source = { ledgerId: 37, tagName: OLD, collateralTagName: NEW, interestTagName: '更早旧名', alias: OLD };
    const connection = offlineConnection([{ id: 1, collateral_source: source }]);
    await rename(connection);
    expect(JSON.parse(connection.updates[0].json)).toEqual({ ...source, tagName: NEW });
  });

  it('名称包含引号、反斜杠等字符时通过参数化JSON精确保存', async () => {
    const oldName = 'old\"\\\n';
    const newName = "new'\\\n";
    const connection = offlineConnection([{ id: 1, collateral_source: { ledgerId: 37, tagName: oldName } }]);
    await rename(connection, schema(), 37, oldName, newName);
    expect(JSON.parse(connection.updates[0].json).tagName).toBe(newName);
  });

  it('同名请求无读取和写入', async () => {
    const connection = offlineConnection([{ id: 1, collateral_source: '{bad' }]);
    await rename(connection, schema(), 37, OLD, OLD);
    expect(connection.execute).not.toHaveBeenCalled();
  });

  it('空source和无当前source的历史快照无需写入', async () => {
    const empty = [null, undefined, '', 'null', '""', '{}', {}];
    const connection = offlineConnection(
      empty.map((value, id) => ({ id, collateral_source: value })),
      [
        ...empty.map((value, id) => ({ id, order_snapshot: value })),
        ...empty.map((value, id) => ({ id: id + 20, order_snapshot: { collateral_source: value, ...history() } })),
        { id: 50, order_snapshot: history() },
      ],
    );
    await rename(connection);
    expect(connection.updates).toEqual([]);
  });

  it.each(['{broken', '   ', '[1,', '{"ledgerId":37,"tagName":"旧标签"'])('订单损坏JSON %s 必须报错，不用JSON_VALID隐藏', async bad => {
    const connection = offlineConnection([{ id: 1, collateral_source: bad }]);
    await expect(rename(connection)).rejects.toThrow('损坏的 JSON');
    expect(connection.updates).toEqual([]);
  });

  it('参与者外层损坏JSON必须报错，全部校验先于订单写入', async () => {
    const connection = offlineConnection(
      [{ id: 1, collateral_source: { ledgerId: 37, tagName: OLD } }],
      [{ id: 2, order_snapshot: '{bad' }],
    );
    await expect(rename(connection)).rejects.toThrow('ledger_order_participants.order_snapshot');
    expect(connection.updates).toEqual([]);
  });

  it('参与者嵌套来源损坏JSON必须报错，不能因无法判断ledgerId而跳过', async () => {
    const connection = offlineConnection([], [{ id: 2, order_snapshot: { collateral_source: '{bad', ...history() } }]);
    await expect(rename(connection)).rejects.toThrow('collateral_source 包含损坏的 JSON');
    expect(connection.updates).toEqual([]);
  });

  it.each(['[]', '42', 'false', '"non-object"'])('非空但不符合来源对象contract的JSON %s 拒绝', async value => {
    const connection = offlineConnection([{ id: 1, collateral_source: value }]);
    await expect(rename(connection)).rejects.toThrow('必须是 JSON 对象');
    expect(connection.updates).toEqual([]);
  });

  it('不存在的表和未启用来源/快照列跳过，不查询information_schema或执行DDL', async () => {
    const connection = offlineConnection();
    await rename(connection, schema([]));
    await rename(connection, schema([[ORDERS, ['id']], [PARTICIPANTS, ['id']]]));
    expect(connection.execute).not.toHaveBeenCalled();
  });

  it.each([ORDERS, PARTICIPANTS])('%s存在但缺少id必须在任何SQL之前报错', async table => {
    const connection = offlineConnection([{ id: 1, collateral_source: { ledgerId: 37, tagName: OLD } }]);
    const columns = new Map(schema());
    columns.set(table, new Set());
    await expect(rename(connection, columns)).rejects.toThrow(`${table} 缺少必需列 id`);
    expect(connection.execute).not.toHaveBeenCalled();
  });

  it('旧环境单表缺功能列不影响另一表处理', async () => {
    const connection = offlineConnection([], [{ id: 2, order_snapshot: { collateral_source: { ledgerId: 37, tagName: OLD } } }]);
    await rename(connection, schema([[ORDERS, ['id']], [PARTICIPANTS, ['id', 'order_snapshot']]]));
    expect(connection.updates).toHaveLength(1);
    expect(connection.updates[0].table).toBe(PARTICIPANTS);
    expect(connection.execute.mock.calls.filter(([sql]) => sql.startsWith('SELECT'))).toHaveLength(1);
  });

  it('只锁定读取两表id与JSON列，只UPDATE变更行的同一列WHERE id，不改其它SQL列', async () => {
    const connection = offlineConnection(
      [
        { id: 1, ledger_id: 52, status: 'settled', collateral_source: { ledgerId: 37, tagName: OLD } },
        { id: 2, collateral_source: { ledgerId: 37, tagName: '其它标签' } },
      ],
      [{ id: 3, order_snapshot: { collateral_source: { ledgerId: 37, tagName: OLD }, ...history() } }],
    );
    await rename(connection);
    expect(connection.updates.map(({ table, column, id }) => ({ table, column, id }))).toEqual([
      { table: ORDERS, column: 'collateral_source', id: 1 },
      { table: PARTICIPANTS, column: 'order_snapshot', id: 3 },
    ]);
    expect(connection.execute.mock.calls.map(([sql]) => sql)).toEqual([
      'SELECT id, collateral_source FROM ledger_orders WHERE collateral_source IS NOT NULL AND CHAR_LENGTH(collateral_source) > 0 FOR UPDATE',
      'SELECT id, order_snapshot FROM ledger_order_participants WHERE order_snapshot IS NOT NULL AND CHAR_LENGTH(order_snapshot) > 0 FOR UPDATE',
      'UPDATE ledger_orders SET collateral_source = ? WHERE id = ?',
      'UPDATE ledger_order_participants SET order_snapshot = ? WHERE id = ?',
    ]);
  });

  it('读取结果异常不能默默丢失引用', async () => {
    const connection = offlineConnection();
    connection.execute.mockResolvedValueOnce([null as any, []]);
    await expect(rename(connection)).rejects.toThrow('无法读取');
    expect(connection.updates).toEqual([]);
  });

  it('缺行id拒绝写入，SQL失败交由调用者回滚，不接管事务', async () => {
    const missingId = offlineConnection([{ collateral_source: { ledgerId: 37, tagName: OLD } }]);
    await expect(rename(missingId)).rejects.toThrow('引用行缺少 id');
    expect(missingId.updates).toEqual([]);
    const failure = offlineConnection();
    failure.execute.mockRejectedValueOnce(new Error('offline SQL failed'));
    await expect(rename(failure)).rejects.toThrow('offline SQL failed');
    expect(failure.rollback).not.toHaveBeenCalled();
    expect(failure.release).not.toHaveBeenCalled();
  });
});
