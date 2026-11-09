import {
  ORDINARY_TAG_OBSERVATION_LEDGER_ID,
  ORDINARY_TAG_OBSERVATION_SUFFIX,
  assertOrdinaryObservationAllocationChange,
} from '../shared/ordinary-tag-observation';

function balancesOf(raw: unknown): Record<string, unknown> {
  // SQL NULL / 未配置空字符串合法；JSON null、数组、损坏文本不能被清空覆盖。
  if (raw === null || raw === '') return {};
  if (typeof raw !== 'string') throw new Error('成员初始设置必须是JSON对象文本');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('成员初始设置JSON损坏，请先修复原始数据');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('成员初始设置必须是JSON对象');
  }
  return parsed as Record<string, unknown>;
}

/** 调用方提供独占 mysql2 连接并在 finally release；本服务只拥有事务。
 * 普通成员与旧管理员入口共同走这里，角色权限仍由原入口负责。
 * 不回写解析后的旧JSON，避免历史数字经JS序列化而丢失精度。
 */
export async function updateLedger37InitialBalances(
  connection: any,
  userId: number,
  balances: Record<string, number | string>,
): Promise<void> {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('成员ID无效');
  if (balances === null || typeof balances !== 'object' || Array.isArray(balances)) {
    throw new Error('初始设置补丁必须是对象');
  }
  const entries = Object.entries(balances);
  for (const [key, value] of entries) {
    // 即使值完全相同也禁止：观察配置仅由专用管理员原子JSON_SET入口保存。
    if (key.endsWith(ORDINARY_TAG_OBSERVATION_SUFFIX)) {
      throw new Error('观察专用配置不能通过初始金额入口修改');
    }
    if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new Error('初始设置补丁只接受字符串或有限数字');
    }
  }

  const ledgerId = ORDINARY_TAG_OBSERVATION_LEDGER_ID;
  await connection.beginTransaction();
  try {
    // 与显式rename保持相同锁次序；只使用锁下当下分类名称，不恢复历史别名。
    const [ledgers] = await connection.execute(
      'SELECT id FROM ledgers WHERE id = ? FOR UPDATE', [ledgerId],
    );
    if (ledgers.length !== 1) throw new Error('账本不存在');
    const [categories] = await connection.execute(
      `SELECT id, ledgerId, name, parentId, isDefault, accounting_mode AS accountingMode
       FROM ledger_categories WHERE ledgerId = ? ORDER BY id FOR UPDATE`, [ledgerId],
    );
    const [members] = await connection.execute(
      `SELECT id, initial_balances FROM ledger_members
       WHERE ledgerId = ? AND userId = ? FOR UPDATE`, [ledgerId, userId],
    );
    if (members.length !== 1) throw new Error('您不是此账本的成员');
    const member = members[0];
    const previous = balancesOf(member.initial_balances);
    const removeKeys = new Set<string>();
    for (const category of categories) {
      if (Number(category.ledgerId) !== ledgerId || category.parentId !== null) continue;
      const name = String(category.name);
      if (category.accountingMode === 'manual_balance' && Number(category.isDefault) === 0) {
        assertOrdinaryObservationAllocationChange(previous, balances, name);
      }
      // 保留原股票清理语义：仅顶层stock_portfolio的主额、比例、权益三键。
      if (category.accountingMode === 'stock_portfolio') {
        removeKeys.add(name);
        removeKeys.add(`${name}__ratio`);
        removeKeys.add(`${name}__targetAmount`);
      }
    }

    let expression = "COALESCE(NULLIF(initial_balances, ''), JSON_OBJECT())";
    const values: Array<number | string> = [];
    const patchEntries = entries.filter(([key]) => !removeKeys.has(key));
    if (patchEntries.length) {
      expression = `JSON_SET(${expression}, ${patchEntries.map(() => '?, ?').join(', ')})`;
      for (const [key, value] of patchEntries) values.push(`$.${JSON.stringify(key)}`, value);
    }
    if (removeKeys.size) {
      const keys = Array.from(removeKeys);
      expression = `JSON_REMOVE(${expression}, ${keys.map(() => '?').join(', ')})`;
      for (const key of keys) values.push(`$.${JSON.stringify(key)}`);
    }
    if (patchEntries.length || removeKeys.size) {
      const [result] = await connection.execute(
        `UPDATE ledger_members SET initial_balances = ${expression}
         WHERE id = ? AND ledgerId = ? AND userId = ?`,
        [...values, member.id, ledgerId, userId],
      );
      if (result.affectedRows !== 1) throw new Error('初始设置未保存，成员记录已变化');
    }
    await connection.commit();
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], '初始设置保存失败，且事务回滚失败');
    }
    throw error;
  }
}
