import { TRPCError } from '@trpc/server';
import { assertOrdinaryObservationAllocationChange, readOrdinaryTagObservationConfig } from '../shared/ordinary-tag-observation';

export type OrdinaryTagDetailSaveInput = {
  ledgerId: number;
  targetUserId: number;
  scopedOrdinaryCategoryId: number;
  actorUserId: number;
  balances: Record<string, number | string>;
};
const SUFFIXES = ['', '__ratio', '__targetAmount', '__startDate', '__pauseDate', '__endDate', '__pauseHistory', '__margins', '__margin', '__marginCoin'] as const;
function reject(message: string): never { throw new TRPCError({ code: 'PRECONDITION_FAILED', message }); }
function configOf(raw: unknown): Record<string, unknown> {
  if (raw === null || raw === '') return {};
  if (typeof raw !== 'string') reject('成员配置格式异常，未保存');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { reject('成员配置JSON损坏，未保存'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject('成员配置必须是JSON对象，未保存');
  return value as Record<string, unknown>;
}
function date(value: unknown, label: string): void {
  if (value === '') return;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) reject(`${label}格式不正确`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) reject(`${label}不是有效日期`);
}
export function validateOrdinaryDetailPatch(name: string, balances: Record<string, number | string>, previous: Record<string, unknown>): void {
  if (!balances || typeof balances !== 'object' || Array.isArray(balances) || Object.keys(balances).length === 0) reject('没有待保存的修改');
  const allowed = new Set(SUFFIXES.map(suffix => `${name}${suffix}`));
  for (const [key, value] of Object.entries(balances)) {
    if (!allowed.has(key)) reject('详情保存只接受当前普通标签配置；可见性和清空须使用独立入口');
    if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) reject('配置只接受字符串或有限数字');
    if (['__startDate', '__pauseDate', '__endDate'].some(suffix => key === `${name}${suffix}`)) date(value, '日期');
    if (key === `${name}__pauseHistory`) {
      let history: unknown;
      try { history = JSON.parse(String(value)); } catch { reject('暂停历史格式不正确'); }
      if (!Array.isArray(history)) reject('暂停历史必须是数组');
      for (const item of history) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) reject('暂停历史格式不正确');
        date(item.pauseDate, '暂停日期');
        if (item.pauseDate === '') reject('已登记的暂停日期不能为空');
        if (item.resumeDate != null) date(item.resumeDate, '重启日期');
        if (item.resumeDate && item.resumeDate < item.pauseDate) reject('重启日期不能早于暂停日期');
      }
    }
    if (key === `${name}__margins`) {
      let margins: unknown;
      try { margins = JSON.parse(String(value)); } catch { reject('押金配置格式不正确'); }
      if (!Array.isArray(margins) || margins.some(item => !item || typeof item !== 'object' || Array.isArray(item) || !Number.isFinite(Number(item.amount)))) reject('押金配置必须是有效明细数组');
    }
  }
  const actualKeys = [name, `${name}__ratio`, `${name}__targetAmount`];
  if (actualKeys.some(key => Object.hasOwn(balances, key))) {
    if (!actualKeys.every(key => Object.hasOwn(balances, key))) reject('金额、比例和实际权益须一并保存');
    const values = actualKeys.map(key => balances[key]);
    if (values.some(value => typeof value !== 'number' || !Number.isFinite(value))) reject('金额比例须为明确有效数字');
    const [amount, ratio, target] = values as number[];
    const zeroExit = amount === 0 && ratio === 0 && target === 0;
    if ((!zeroExit && amount <= 0) || ratio < 0 || ratio > 100 || target < 0 || Math.abs(target - amount * ratio / 100) > 0.01) reject('金额比例及权益不一致');
  }
  if (Object.hasOwn(balances, `${name}__margin`) && (typeof balances[`${name}__margin`] !== 'number' || !Number.isFinite(balances[`${name}__margin`]))) reject('押金参考金额无效');
  if (Object.hasOwn(balances, `${name}__marginCoin`) && typeof balances[`${name}__marginCoin`] !== 'string') reject('押金币种无效');
  const observationRaw = previous[`${name}__ordinaryObservation`];
  if (observationRaw !== undefined && observationRaw !== null && !readOrdinaryTagObservationConfig(previous, name)) reject('观察配置格式异常，请先核对观察设置');
  assertOrdinaryObservationAllocationChange(previous, balances, name);
  const next = { ...previous, ...balances };
  const wasConfigured = Boolean(previous[`${name}__startDate`]) || [name, `${name}__ratio`, `${name}__targetAmount`].some(key => Number(previous[key] || 0) > 0);
  const fullyEmpty = [name, `${name}__ratio`, `${name}__targetAmount`].every(key => Number(next[key] || 0) === 0) && !next[`${name}__startDate`];
  if (wasConfigured && fullyEmpty) reject('完整清空须点击“清空”，先核对受影响天数再确认');
}

/** 调用方提供独占mysql2连接并在finally释放。只JSON_SET本标签明确修改，不删除任何其他键或历史记录。 */
export async function saveOrdinaryTagMemberDetailConfig(input: OrdinaryTagDetailSaveInput, connection: any): Promise<{ success: true }> {
  if (input.ledgerId !== 37 || ![input.actorUserId, input.targetUserId, input.scopedOrdinaryCategoryId].every(id => Number.isSafeInteger(id) && id > 0)) throw new TRPCError({ code: 'BAD_REQUEST', message: '仅支持37号普通标签有效成员配置' });
  await connection.beginTransaction();
  try {
    const [ledgers] = await connection.execute('SELECT id FROM ledgers WHERE id = ? FOR UPDATE', [37]);
    if (ledgers.length !== 1) reject('账本不存在');
    const [categories] = await connection.execute('SELECT id, name, parentId, isDefault, accounting_mode AS accountingMode FROM ledger_categories WHERE ledgerId = ? ORDER BY id FOR UPDATE', [37]);
    const category = categories.find((item: any) => Number(item.id) === input.scopedOrdinaryCategoryId);
    if (!category || category.parentId !== null || Number(category.isDefault) !== 0 || category.accountingMode !== 'manual_balance' || typeof category.name !== 'string' || !category.name.trim()) reject('目标必须是37号普通顶级非默认标签');
    if (categories.some((item: any) => item.id !== category.id && item.name === category.name)) reject('标签名称存在冲突，未保存');
    const userIds = Array.from(new Set([input.actorUserId, input.targetUserId])).sort((a, b) => a - b);
    const [members] = await connection.execute(`SELECT m.id, m.userId, m.role, m.member_type AS memberType, m.initial_balances AS initialBalances, u.id AS realUserId FROM ledger_members m LEFT JOIN users u ON u.id = m.userId WHERE m.ledgerId = ? AND m.userId IN (${userIds.map(() => '?').join(', ')}) ORDER BY m.userId, m.id FOR UPDATE`, [37, ...userIds]);
    const realMember = (id: number) => {
      const found = members.filter((item: any) => Number(item.userId) === id);
      if (found.length !== 1 || found[0].memberType !== 'real' || Number(found[0].realUserId) !== id) throw new TRPCError({ code: 'FORBIDDEN', message: '操作者和目标必须是账本真人成员' });
      return found[0];
    };
    const actor = realMember(input.actorUserId);
    if (actor.role !== 'admin' && actor.role !== 'owner') throw new TRPCError({ code: 'FORBIDDEN', message: '仅真实账本管理员可保存配置' });
    const target = realMember(input.targetUserId);
    const previous = configOf(target.initialBalances);
    validateOrdinaryDetailPatch(category.name, input.balances, previous);
    const entries = Object.entries(input.balances);
    const values = entries.flatMap(([key, value]) => [`$.${JSON.stringify(key)}`, value]);
    const [result] = await connection.execute(`UPDATE ledger_members SET initial_balances = JSON_SET(COALESCE(NULLIF(initial_balances, ''), JSON_OBJECT()), ${entries.map(() => '?, ?').join(', ')}) WHERE id = ? AND ledgerId = ? AND userId = ?`, [...values, target.id, 37, input.targetUserId]);
    if (result.affectedRows !== 1) reject('成员配置已变化，未保存');
    await connection.commit();
    return { success: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}
