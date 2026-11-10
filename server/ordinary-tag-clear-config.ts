import { createHash, timingSafeEqual } from 'node:crypto';
import { TRPCError } from '@trpc/server';

export type OrdinaryTagClearInput = {
  ledgerId: number;
  targetUserId: number;
  categoryId: number;
  /** 必须来自认证上下文的真实操作者，不接受客户端角色/用户名。 */
  actorUserId: number;
  impactHash?: string;
};
export type OrdinaryTagClearDeps = { connection: any; readOnly?: boolean };
export type OrdinaryTagClearImpact = {
  ledgerId: 37; userId: number; categoryId: number; categoryName: string;
  affectedDays: number; firstDate: string | null; lastDate: string | null;
  impactHash: string; hasConfiguredStartDate: boolean;
};
type Category = {
  id: number; ledgerId: number; name: string; parentId: number | null;
  isDefault: number; accountingMode: string;
};
type Member = {
  id: number; ledgerId: number; userId: number; role: string; memberType: string;
  realUserId: number | null; permissionView: string; initialBalances: string | null;
};
type RecordRow = {
  id: number; ledgerId: number; categoryId: number; recordDate: string | null;
  type: string; amount: string | number | null; createdBy: number; deletedAt: unknown;
  description: string | null;
};
type Pause = { pauseDate: string; resumeDate: string | null };
function invalid(message: string): never {
  throw new TRPCError({ code: 'PRECONDITION_FAILED', message });
}
function checkInput(input: OrdinaryTagClearInput, deps: OrdinaryTagClearDeps): void {
  if (input.ledgerId !== 37) throw new TRPCError({ code: 'BAD_REQUEST', message: '普通标签清空仅适用于37号账本' });
  for (const [key, id] of [['actorUserId', input.actorUserId], ['targetUserId', input.targetUserId], ['categoryId', input.categoryId]] as const) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new TRPCError({ code: 'BAD_REQUEST', message: `${key}无效` });
  }
  if (!deps.connection || typeof deps.connection.execute !== 'function') invalid('独占数据库连接不可用');
}
async function rows<T>(connection: any, sql: string, values: unknown[]): Promise<T[]> {
  const [result] = await connection.execute(sql, values);
  if (!Array.isArray(result)) invalid('数据库读取结果异常，不能确定清空影响');
  return result as T[];
}
function validDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01') invalid(`${label}缺失或格式异常`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid(`${label}不是有效日期`);
  return value;
}
function optionalDate(value: unknown, label: string): string | null {
  return value === undefined || value === null || value === '' ? null : validDate(value, label);
}
/** 仅解析以验证与计数；精确顶层value原文参与hash，绝不回写JS序列化旧JSON。
 * 拒绝重复顶层键，避免JS last-wins和MySQL JSON语义不一致。
 */
function configOf(raw: unknown): { config: Record<string, unknown>; tokens: Map<string, string> } {
  if (raw === null) return { config: {}, tokens: new Map() };
  if (typeof raw !== 'string' || raw.trim() === '') invalid('成员initial_balances不是有效JSON对象文本');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { invalid('成员initial_balances JSON损坏，请先修复'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) invalid('成员initial_balances必须为JSON对象');
  const tokens = new Map<string, string>();
  const stringEnd = (start: number) => {
    let i = start + 1;
    while (i < raw.length) {
      if (raw[i] === '\\') i += 2;
      else if (raw[i++] === '"') return i;
    }
    return invalid('成员配置字符串损坏');
  };
  let i = raw.indexOf('{') + 1;
  while (i < raw.length) {
    while (i < raw.length && /\s/.test(raw[i])) i++;
    if (raw[i] === '}') break;
    const end = stringEnd(i);
    const key = JSON.parse(raw.slice(i, end)) as string;
    if (tokens.has(key)) invalid('成员initial_balances存在重复键');
    i = raw.indexOf(':', end) + 1;
    const start = i;
    let depth = 0;
    while (i < raw.length) {
      if (raw[i] === '"') { i = stringEnd(i); continue; }
      if (raw[i] === '{' || raw[i] === '[') depth++;
      else if (raw[i] === '}' || raw[i] === ']') { if (depth === 0) break; depth--; }
      else if (raw[i] === ',' && depth === 0) break;
      i++;
    }
    tokens.set(key, raw.slice(start, i).trim());
    if (raw[i] === '}') break;
    i++;
  }
  return { config: parsed as Record<string, unknown>, tokens };
}
function numberConfig(value: unknown, fallback: number, label: string): number {
  if (value === undefined || value === null) return fallback;
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === ''
    || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(value))) invalid(`${label}不是明确的有效数字`);
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) invalid(`${label}不是有效非负数字`);
  return number;
}
function pauseHistory(config: Record<string, unknown>, name: string): Pause[] {
  const legacy = optionalDate(config[`${name}__pauseDate`], '暂停日期');
  const raw = config[`${name}__pauseHistory`];
  if (raw === undefined || raw === null || raw === '') return legacy ? [{ pauseDate: legacy, resumeDate: null }] : [];
  let history: unknown = raw;
  if (typeof raw === 'string') {
    try { history = JSON.parse(raw); } catch { invalid('暂停历史JSON损坏'); }
  }
  if (!Array.isArray(history)) invalid('暂停历史必须为数组');
  const result: Pause[] = [];
  for (const item of history) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid('暂停历史片段损坏');
    const pauseDate = validDate(item.pauseDate, '历史暂停日期');
    const resumeDate = optionalDate(item.resumeDate, '历史重启日期');
    if (resumeDate && resumeDate < pauseDate) invalid('重启日期不能早于暂停日期');
    const previous = result[result.length - 1];
    if (previous && (!previous.resumeDate || pauseDate <= previous.pauseDate || pauseDate < previous.resumeDate)) invalid('暂停历史片段乱序或重叠');
    result.push({ pauseDate, resumeDate });
  }
  return result;
}
function checkObservation(config: Record<string, unknown>, name: string): void {
  const raw = config[`${name}__ordinaryObservation`];
  if (raw === undefined || raw === null) return;
  if (typeof raw !== 'string') invalid('观察配置格式异常，请先修复或关闭观察');
  let value: any;
  try { value = JSON.parse(raw); } catch { invalid('观察配置JSON损坏，请先修复或关闭观察'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.enabled !== 'boolean') invalid('观察配置开关不明确');
  if (value.enabled) invalid('此成员的标签已开启观察，请先关闭观察再清空真实配置');
}
function requireRealMember(members: Member[], userId: number): Member {
  const matches = members.filter(member => member.userId === userId && member.ledgerId === 37);
  if (matches.length !== 1 || matches[0].memberType !== 'real' || matches[0].realUserId !== userId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '操作者和目标必须是37号账本中有真实用户的真人成员' });
  }
  return matches[0];
}
async function readImpact(input: OrdinaryTagClearInput, deps: OrdinaryTagClearDeps, locked: boolean): Promise<{ impact: OrdinaryTagClearImpact; target: Member }> {
  const connection = deps.connection;
  const lock = locked ? ' FOR UPDATE' : '';
  // 清空使用current locking READ；顺序严格为ledger→categories(id)→members(userId)。
  const ledgers = await rows<{ id: number; ownerId: number }>(connection,
    `SELECT id, ownerId FROM ledgers WHERE id = ?${lock}`, [37]);
  if (ledgers.length !== 1 || ledgers[0].id !== 37) throw new TRPCError({ code: 'NOT_FOUND', message: '37号账本不存在' });
  const categories = await rows<Category>(connection,
    `SELECT id, ledgerId, name, parentId, isDefault, accounting_mode AS accountingMode
     FROM ledger_categories WHERE ledgerId = ? ORDER BY id${lock}`, [37]);
  const category = categories.find(item => item.id === input.categoryId);
  if (!category || category.ledgerId !== 37 || category.parentId !== null || Number(category.isDefault) !== 0
    || category.accountingMode !== 'manual_balance' || typeof category.name !== 'string' || !category.name.trim()) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '目标必须是37号账本manual_balance普通顶级非默认标签' });
  }
  if (categories.some(item => item.id !== category.id && item.name === category.name)) invalid('标签名称被其他分类共享，不能安全清空配置');
  const ids = [...new Set([input.actorUserId, input.targetUserId])].sort((a, b) => a - b);
  const members = await rows<Member>(connection,
    `SELECT m.id, m.ledgerId, m.userId, m.role, m.member_type AS memberType,
            u.id AS realUserId, m.permission_view AS permissionView, m.initial_balances AS initialBalances
     FROM ledger_members m LEFT JOIN users u ON u.id = m.userId
     WHERE m.ledgerId = ? AND m.userId IN (${ids.map(() => '?').join(', ')})
     ORDER BY m.userId, m.id${lock}`, [37, ...ids]);
  const actor = requireRealMember(members, input.actorUserId);
  if (actor.role !== 'owner' && actor.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: '仅37号账本真实owner/admin可清空普通标签配置' });
  const target = requireRealMember(members, input.targetUserId);
  const { config, tokens } = configOf(target.initialBalances);
  const name = category.name;
  checkObservation(config, name);
  numberConfig(config[name], 0, '起始金额');
  numberConfig(config[`${name}__targetAmount`], 0, '实际权益');
  // 与allTagsChartData累计回报相同：缺失/null比例默认100%，明确0比例没有实际收益。
  const ratio = numberConfig(config[`${name}__ratio`], 100, '实际比例');
  const start = optionalDate(config[`${name}__startDate`], '开始日期');
  const end = optionalDate(config[`${name}__endDate`], '结束日期');
  if (start && end && end < start) invalid('结束日期早于开始日期，请先核实配置');
  const pauses = pauseHistory(config, name);
  if (!['all', 'own', 'none'].includes(target.permissionView)) invalid('成员记录可见范围异常');
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const scopeCategories = categories.filter(item => item.id === category.id || item.parentId === category.id);
  const scopeIds = new Set(scopeCategories.map(item => item.id));
  // 不使用limit/自然日补齐。读全部此标签余额登记（含未来/已删除指纹），坏日期不伪成0。
  // income/expense是ledger_records真实余额登记类型；transfer不是余额收益日。
  const records = await rows<RecordRow>(connection,
    `SELECT r.id, r.ledgerId, r.categoryId, DATE_FORMAT(r.recordDate, '%Y-%m-%d') AS recordDate,
            r.type, r.amount, r.createdBy, r.deleted_at AS deletedAt, r.description
     FROM ledger_records r
     WHERE r.ledgerId = ? AND r.categoryId IN (${[...scopeIds].map(() => '?').join(', ')})
       AND r.type IN ('income', 'expense', 'transfer')
     ORDER BY r.id${lock}`, [37, ...scopeIds]);
  const days = new Map<string, { income: number; expense: number }>();
  const fingerprints: unknown[] = [];
  for (const record of records) {
    if (record.ledgerId !== 37 || !scopeIds.has(record.categoryId) || !Number.isSafeInteger(record.id)
      || record.id <= 0 || !['income', 'expense', 'transfer'].includes(record.type)) invalid('余额登记范围或字段异常');
    if (record.deletedAt === undefined || !Number.isSafeInteger(record.createdBy) || record.createdBy < 0) invalid(`记录${record.id}删除状态或登记者缺失`);
    const date = validDate(record.recordDate, `记录${record.id}日期`);
    // 真实DB金额为DECIMAL；绝对值沿用db-ledger的Math.abs(Number(amount))。
    if ((typeof record.amount !== 'number' && typeof record.amount !== 'string') || String(record.amount).trim() === ''
      || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(record.amount)) || !Number.isFinite(Number(record.amount))) invalid(`记录${record.id}金额异常`);
    // transfer本金/提现影响普通回报：只hash原始备注，不解密/结算，也不计为余额收益日。
    fingerprints.push([record.id, record.ledgerId, record.categoryId, date, record.type, String(record.amount), record.createdBy, record.deletedAt, record.description]);
    if (record.type === 'transfer' || record.deletedAt !== null || date > today || !start || ratio <= 0 || date < start || (end && date > end)
      || pauses.some(period => date > period.pauseDate && (!period.resumeDate || date < period.resumeDate))
      || target.permissionView === 'none' || (target.permissionView === 'own' && record.createdBy !== target.userId)) continue;
    const day = days.get(date) ?? { income: 0, expense: 0 };
    if (record.type === 'income') day.income += Math.abs(Number(record.amount));
    else day.expense += Math.abs(Number(record.amount));
    if (!Number.isFinite(day.income) || !Number.isFinite(day.expense)) invalid('同日余额合计异常');
    days.set(date, day);
  }
  // 同日income>0优先income，否则expense；0/0无效，不要求pnl>0（真实零收益/亏损同样受影响）。
  const dates = [...days].filter(([, day]) => (day.income > 0 ? day.income : day.expense) > 0)
    .map(([date]) => date).sort();
  const keys = [name, `${name}__ratio`, `${name}__targetAmount`, `${name}__startDate`, `${name}__endDate`,
    `${name}__pauseHistory`, `${name}__pauseDate`, `${name}__visible`, `${name}__ordinaryObservation`, '__tagVisibilityDefault'];
  const impactHash = createHash('sha256').update(JSON.stringify({ version: 1, today, ledger: ledgers[0],
    actor: [actor.id, actor.userId, actor.role, actor.memberType, actor.realUserId, actor.permissionView],
    target: [target.id, target.userId, target.role, target.memberType, target.realUserId, target.permissionView],
    categories: scopeCategories, config: keys.map(key => [key, tokens.get(key) ?? null]), records: fingerprints,
  })).digest('hex');
  return { target, impact: { ledgerId: 37, userId: input.targetUserId, categoryId: category.id, categoryName: name,
    affectedDays: dates.length, firstDate: dates[0] ?? null, lastDate: dates[dates.length - 1] ?? null,
    impactHash, hasConfiguredStartDate: start !== null } };
}

/** GET只SELECT，不开启事务、不建表、不写数据。调用者负责finally release独占连接。 */
export async function getOrdinaryTagClearImpact(input: OrdinaryTagClearInput, deps: OrdinaryTagClearDeps): Promise<OrdinaryTagClearImpact> {
  checkInput(input, deps);
  return (await readImpact(input, deps, false)).impact;
}

/** 本服务拥有事务及rollback；连接的release仅由调用者finally负责。 */
export async function clearOrdinaryTagMemberConfig(input: OrdinaryTagClearInput, deps: OrdinaryTagClearDeps) {
  checkInput(input, deps);
  if (deps.readOnly) invalid('只读预览禁止清空真实配置');
  if (typeof input.impactHash !== 'string' || !/^[a-f0-9]{64}$/.test(input.impactHash)) invalid('缺少有效清空预检，请重新确认');
  const connection = deps.connection;
  // 仅配置下一事务，不改变session默认；RR范围locking READ的next-key锁阻止登记插入phantom。
  await connection.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await connection.beginTransaction();
  try {
    const { impact, target } = await readImpact(input, deps, true);
    if (!timingSafeEqual(Buffer.from(impact.impactHash, 'hex'), Buffer.from(input.impactHash, 'hex'))) invalid('配置或登记记录已变化，请重新预检确认');
    const name = impact.categoryName;
    const keys = [name, `${name}__ratio`, `${name}__targetAmount`, `${name}__startDate`];
    // MySQL原子JSON_SET：仅四键；不删除其它stock兼容keys、不回写整个历史JSON。
    const [result] = await connection.execute(
      `UPDATE ledger_members
       SET initial_balances = JSON_SET(COALESCE(initial_balances, JSON_OBJECT()), ?, ?, ?, ?, ?, ?, ?, ?)
       WHERE id = ? AND ledgerId = ? AND userId = ? AND member_type = 'real'`,
      [keys[0], keys[1], keys[2], keys[3]].flatMap((key, index) => [`$.${JSON.stringify(key)}`, index === 3 ? '' : 0])
        .concat([target.id, 37, input.targetUserId]),
    );
    if (!result || result.affectedRows !== 1) invalid('目标成员发生变化，清空未保存');
    await connection.commit();
    return { success: true as const, ledgerId: 37 as const, userId: input.targetUserId, categoryId: impact.categoryId,
      categoryName: name, affectedDays: impact.affectedDays,
      cleared: { amount: '0', ratio: '0', targetAmount: '0', startDate: '' } as const };
  } catch (error) {
    try { await connection.rollback(); }
    catch (rollbackError) { throw new AggregateError([error, rollbackError], '清空失败，且事务回滚失败'); }
    throw error;
  }
}
