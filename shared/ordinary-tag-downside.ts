/** 37号普通标签欠保证金：仅派生读口径，绝不改变本金、余额登记、transfer或钱包。
 * B必须是已核验的真实账户余额；initialAmount是实际参与参考账户本金，可来自已核验initialBalances。
 * 两者都不是钱包押金；不能用行情或initial+Pnl反推缺失的真实余额。
 * 日级cash-before-performance是明确的派生日末结算契约，不是对真实成交/资金流顺序的推断。
 */
export type OrdinaryTagDownsideRule = {
  ledgerId: 37; categoryId: number; userId: number; version: number; enabled: boolean;
  thresholdAmount: number;
  /** 剩余比例r，百分数而非小数。 */
  downsidePercent: number;
  /** 北京业务日期YYYY-MM-DD；createdAt只是审计时间，不参与生效排序。 */
  startDate: string; createdAt: string;
};
export function validateOrdinaryTagDownsideStartDate(date: string): void {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1000-01-01' || date > '9999-12-31') throw new Error('启用日期必须是1000–9999年的有效YYYY-MM-DD日期');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('启用日期必须是真实的YYYY-MM-DD日期');
}
export function validateOrdinaryTagDownsideSettings(thresholdAmount: number, downsidePercent: number): void {
  if (typeof thresholdAmount !== 'number' || !Number.isFinite(thresholdAmount) || thresholdAmount <= 0) throw new Error('账户金额门槛必须大于0');
  if (typeof downsidePercent !== 'number' || !Number.isFinite(downsidePercent) || downsidePercent < 0 || downsidePercent > 100) throw new Error('剩余比例必须为0–100%');
}
const validAmount = (amount: unknown): amount is number => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0;
const validNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const validId = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0;
function validDate(date: unknown): date is string {
  try { validateOrdinaryTagDownsideStartDate(date as string); return true; } catch { return false; }
}
function validRule(rule: OrdinaryTagDownsideRule): boolean {
  if (rule.ledgerId !== 37 || !validId(rule.categoryId) || !validId(rule.userId) || !validId(rule.version)
    || typeof rule.enabled !== 'boolean' || !validDate(rule.startDate)) return false;
  try { validateOrdinaryTagDownsideSettings(rule.thresholdAmount, rule.downsidePercent); return true; } catch { return false; }
}
/** 无状态F(B)：真零可计算，缺值/负值/NaN不转成0；门槛以上100%恢复，往返没有棘轮。 */
export function countedOrdinaryTagBalance(raw: number, rule: OrdinaryTagDownsideRule | null): number | null {
  if (!validAmount(raw)) return null;
  if (rule === null) return raw;
  if (!validRule(rule)) return null;
  if (!rule.enabled || raw >= rule.thresholdAmount) return raw;
  const counted = rule.thresholdAmount + (raw - rule.thresholdAmount) * rule.downsidePercent / 100;
  return Number.isFinite(counted) ? counted : null;
}
/** 与stock一致：startDate<=asOf过滤后，最高保存version优先，日期只同版本次排序。
 * 回填较早启用日的新版本覆盖已适用旧版，不在旧启用日倒退；未来版本不提前，不能跨账本/分类。
 */
export function selectOrdinaryTagDownsideRule(rules: readonly OrdinaryTagDownsideRule[], categoryId: number, asOfDate: string): OrdinaryTagDownsideRule | null {
  if (!validId(categoryId) || !validDate(asOfDate)) return null;
  let selected: OrdinaryTagDownsideRule | null = null;
  for (const rule of rules) {
    if (rule.ledgerId !== 37 || rule.categoryId !== categoryId || !validDate(rule.startDate) || !validId(rule.version) || rule.startDate > asOfDate) continue;
    if (!selected || rule.version > selected.version || (rule.version === selected.version && rule.startDate > selected.startDate)) selected = rule;
  }
  return selected;
}
export type OrdinaryTagDownsideEntryInput = {
  rules: readonly OrdinaryTagDownsideRule[]; categoryId: number; ledgerId?: number;
  entryAmount: number | null | undefined; entryDate: string | null | undefined; asOfDate: string;
};
/** 基础入场F(entry)-entry helper（不是正式收益adapter）。实际入场早于当前版本startDate时为0；
 * 当前版本直接重算，不继承旧carry。关闭完全raw。缺实际入场证据为pending。
 */
export function ordinaryTagDownsideEntryOffset(input: OrdinaryTagDownsideEntryInput): number | null {
  if ((input.ledgerId !== undefined && input.ledgerId !== 37) || !validId(input.categoryId) || !validDate(input.asOfDate)) return null;
  const rule = selectOrdinaryTagDownsideRule(input.rules, input.categoryId, input.asOfDate);
  if (!rule || (validRule(rule) && !rule.enabled)) return 0;
  if (!validRule(rule) || !validDate(input.entryDate) || input.entryDate > input.asOfDate || !validAmount(input.entryAmount)) return null;
  if (input.entryDate < rule.startDate) return 0;
  const counted = countedOrdinaryTagBalance(input.entryAmount, rule);
  return counted === null ? null : counted - input.entryAmount;
}
export type OrdinaryTagDownsidePoint = {
  date: string;
  /** null/undefined是没有实际余额点，绝不等同于0；该点pending，已核验流量可累积至下一真实余额点。 */
  rawBalance: number | null | undefined;
  /** 自上一输入点起的真实净加减本金（正加/负减）。含只有transfer、无余额的日期；不得凭余额反推。 */
  capitalChange: number | null | undefined;
  /** 同期间真实withdraw，非负；不得再重复放入capitalChange。没有资金流必须明确传0。 */
  withdraw: number | null | undefined;
};
export type OrdinaryTagDownsideSeriesInput = {
  ledgerId: 37; categoryId: number;
  /** 已核验的实际参与参考账户本金(initialBalances)及真实__startDate，不是钱包押金。缺任何一项不得造基准。 */
  initialAmount: number | null | undefined; entryDate: string | null | undefined; ratio: number;
  points: readonly OrdinaryTagDownsidePoint[]; rules: readonly OrdinaryTagDownsideRule[];
};
export type OrdinaryTagDownsideSeriesPoint = {
  date: string; rawBalance: number | null; countedBalance: number | null;
  rawPnl: number | null; countedPnl: number | null; dailyRawPnl: number | null; dailyCountedPnl: number | null;
  status: 'ready' | 'pending' | 'before-entry'; ruleVersion: number;
};
type ReplayState = { baselineH: number | null; flowH: number; pending: boolean };
const cleanZero = (value: number): number => value === 0 ? 0 : value;
/** 正式收益只走本日级现金流中性系列引擎，不能用A-F(B)或朴素端点差替代。
 * 原raw累计=(A+Σ(capitalChange-withdraw)-B)*ratio/100，不改原本金和资金流。
 * 每真实余额点先以Q=Bprev+D作派生比较基准：dailyPerformance=(F(Q)-F(Btoday))*ratio/100。
 * Q不是实际行情、余额或真实成交前后顺序。缺流量/初始证据或非法Q，受影响计入结果pending。
 * 每日使用该日生效版本，并用其自身startDate窗口fresh replay：
 * countedCum=rawCum+[baselineH+Σwindow(H(Q)-H(Bprev))-H(Btoday)]*ratio/100，H(B)=F(B)-B。
 * 窗口前最后真实B（若没有则实际entry A）提供baselineH，保留启用前raw累计；
 * 新加入belowK无虚亏，纯本金/withdraw且Btoday=Q时收益0，资金本身不按r缩小。
 * 关闭直接恢复当日raw累计；dailyCounted=当前countedCum-上一ready余额点countedCum，可包含补回。
 * 无余额日期不伪造余额，其已核验流量只累积给下一真实余额点（daily此时代表两真实余额点间变化）。
 * 调用者必须提供完整范围真实余额和全部流量；本纯函数不能证明外部查询完整性或观察权限。
 */
export function calculateOrdinaryTagDownsideSeries(input: OrdinaryTagDownsideSeriesInput): OrdinaryTagDownsideSeriesPoint[] {
  const points = [...input.points].sort((a, b) => a.date.localeCompare(b.date));
  const scopedRules = input.rules.filter(rule => rule.ledgerId === 37 && rule.categoryId === input.categoryId);
  const duplicateDates = new Set<string>();
  for (let i = 1; i < points.length; i++) if (points[i].date === points[i - 1].date) duplicateDates.add(points[i].date);
  // Ambiguous/invalid date or duplicate balance observations invalidate the entire range, not last-wins.
  const validRange = input.ledgerId === 37 && validId(input.categoryId) && validAmount(input.initialAmount)
    && validDate(input.entryDate) && validNumber(input.ratio) && input.ratio >= 0
    && points.every(point => validDate(point.date)) && duplicateDates.size === 0;
  const replay = new Map<OrdinaryTagDownsideRule, ReplayState>();
  for (const rule of scopedRules) replay.set(rule, { baselineH: null, flowH: 0, pending: !validRule(rule) });
  let previousBalance = validAmount(input.initialAmount) ? input.initialAmount : NaN;
  let cumulativeFlow = 0, carriedFlow = 0;
  let rawEvidenceBroken = !validRange;
  let previousRawPnl = 0, previousCountedPnl: number | null = 0;
  const result: OrdinaryTagDownsideSeriesPoint[] = [];
  for (const point of points) {
    const rule = selectOrdinaryTagDownsideRule(scopedRules, input.categoryId, point.date);
    const rawBalance = validAmount(point.rawBalance) ? point.rawBalance : null;
    const countedBalance = rawBalance === null ? null : countedOrdinaryTagBalance(rawBalance, rule);
    const output: OrdinaryTagDownsideSeriesPoint = { date: point.date, rawBalance, countedBalance,
      rawPnl: null, countedPnl: null, dailyRawPnl: null, dailyCountedPnl: null,
      status: 'pending', ruleVersion: rule?.version ?? 0 };
    result.push(output);
    if (!validRange) continue;
    if (point.date < input.entryDate!) { output.status = 'before-entry'; continue; }
    if (!validNumber(point.capitalChange) || !validAmount(point.withdraw)) rawEvidenceBroken = true;
    if (rawEvidenceBroken) continue;
    const flow = point.capitalChange! - point.withdraw!;
    carriedFlow += flow; cumulativeFlow += flow;
    if (!Number.isFinite(carriedFlow) || !Number.isFinite(cumulativeFlow)) { rawEvidenceBroken = true; continue; }
    // Missing observation is pending but does not destroy explicit flow evidence for the next actual balance.
    if (point.rawBalance === null || point.rawBalance === undefined) continue;
    if (rawBalance === null) { rawEvidenceBroken = true; continue; }
    const q = previousBalance + carriedFlow;
    for (const [candidate, state] of Array.from(replay.entries())) {
      if (point.date < candidate.startDate || !candidate.enabled || state.pending) continue;
      const fPrevious = countedOrdinaryTagBalance(previousBalance, candidate);
      const fQ = countedOrdinaryTagBalance(q, candidate);
      if (fPrevious === null || fQ === null) { state.pending = true; continue; }
      if (state.baselineH === null) state.baselineH = fPrevious - previousBalance;
      state.flowH += (fQ - q) - (fPrevious - previousBalance);
      if (!Number.isFinite(state.flowH)) state.pending = true;
    }
    const rawPnl = (input.initialAmount! + cumulativeFlow - rawBalance) * input.ratio / 100;
    if (!Number.isFinite(rawPnl)) { rawEvidenceBroken = true; continue; }
    output.rawPnl = cleanZero(rawPnl);
    output.dailyRawPnl = cleanZero(rawPnl - previousRawPnl);
    let countedPnl: number | null = rawPnl;
    if (rule) {
      const state = replay.get(rule)!;
      if (!validRule(rule) || (rule.enabled && (state.pending || state.baselineH === null || countedBalance === null))) countedPnl = null;
      else if (rule.enabled) countedPnl = rawPnl + (state.baselineH! + state.flowH - (countedBalance! - rawBalance)) * input.ratio / 100;
    }
    if (countedPnl !== null && Number.isFinite(countedPnl)) {
      output.countedPnl = cleanZero(countedPnl);
      output.dailyCountedPnl = previousCountedPnl === null ? null : cleanZero(countedPnl - previousCountedPnl);
      output.status = 'ready';
    }
    previousRawPnl = rawPnl;
    previousCountedPnl = output.countedPnl;
    previousBalance = rawBalance; carriedFlow = 0;
  }
  return result;
}
export type OrdinaryTagDownsidePnlInput = {
  ledgerId?: number; categoryId: number; rules: readonly OrdinaryTagDownsideRule[];
  rawPnl: number | null | undefined; rawBalance: number | null | undefined;
  initialAmount: number | null | undefined; entryDate: string | null | undefined; asOfDate: string; ratio: number;
  /** Active rule requires full flow-neutral series evidence. Endpoints alone are insufficient. */
  points?: readonly OrdinaryTagDownsidePoint[];
};
/** 统一read adapter：无规则/关闭不碰已有raw；开启必须有完整series并与已有raw累计/实际余额吻合。
 * 不提供朴素raw端点调整；不能证明资金流时返回null，不能当0差额使用。
 */
export function ordinaryTagDownsidePnlAdjustment(input: OrdinaryTagDownsidePnlInput): number | null {
  if ((input.ledgerId !== undefined && input.ledgerId !== 37) || !validId(input.categoryId) || !validDate(input.asOfDate)
    || !validNumber(input.rawPnl) || !validNumber(input.ratio) || input.ratio < 0) return null;
  const rule = selectOrdinaryTagDownsideRule(input.rules, input.categoryId, input.asOfDate);
  if (!rule || (validRule(rule) && !rule.enabled)) return 0;
  if (!input.points || !validAmount(input.rawBalance)) return null;
  const series = calculateOrdinaryTagDownsideSeries({ ...input, ledgerId: 37, points: input.points });
  const final = series.find(point => point.date === input.asOfDate);
  if (!final || final.status !== 'ready' || final.rawBalance !== input.rawBalance || final.rawPnl === null || final.countedPnl === null
    || Math.abs(final.rawPnl - input.rawPnl) > 1e-8 * Math.max(1, Math.abs(final.rawPnl), Math.abs(input.rawPnl))) return null;
  return cleanZero(final.countedPnl - final.rawPnl);
}
export function ordinaryTagCountedPnl(input: OrdinaryTagDownsidePnlInput): number | null {
  if (!validNumber(input.rawPnl)) return null;
  const adjustment = ordinaryTagDownsidePnlAdjustment(input);
  if (adjustment === null) return null;
  const counted = input.rawPnl + adjustment;
  return Number.isFinite(counted) ? cleanZero(counted) : null;
}
