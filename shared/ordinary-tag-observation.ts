import { calculateOrdinaryTagDownsideSeries, type OrdinaryTagDownsideRule } from './ordinary-tag-downside';

/** 独立观察口径；这里的金额不是押金、权益、分红或可提现余额。 */
export const ORDINARY_TAG_OBSERVATION_LEDGER_ID = 37 as const;
export const ORDINARY_TAG_OBSERVATION_SUFFIX = '__ordinaryObservation';

export type OrdinaryTagObservationConfig = {
  enabled: boolean;
  /** 管理员明确填写的参考账户初始余额，不是成员可提现余额。 */
  initialAmount: number;
  ratio: number;
  startDate: string;
  pauseDate: string | null;
};
export type OrdinaryTagObservationPoint = {
  date: string;
  balance: number;
  pnl: number;
  dailyPnl: number | null;
  /** 规则派生参考余额，不是真实余额、权益或可提现金额。 */
  countedBalance?: number;
  /** 同日真实余额/资金流按原观察公式得到的未调节收益。 */
  rawPnl?: number;
  ruleVersion?: number | null;
};
export type OrdinaryTagObservationSummary = {
  ledgerId: 37;
  userId: number;
  categoryId: number;
  categoryName: string;
  config: OrdinaryTagObservationConfig;
  status: 'active' | 'paused' | 'pending' | 'no_data' | 'disabled' | 'invalid_config';
  latestDate: string | null;
  latestBalance: number | null;
  capitalChange: number;
  withdrawTotal: number;
  totalPnl: number | null;
  todayPnl: number | null;
  points: OrdinaryTagObservationPoint[];
  countedBalance?: number | null;
  rawPnl?: number | null;
  ruleVersion?: number | null;
};
export type OrdinaryTagObservationOverview = {
  userId: number;
  observations: OrdinaryTagObservationSummary[];
};

/** 只接受真实流水；备注仅用于识别 capital_，不会出现在计算输出中。 */
export type OrdinaryTagObservationRecord = {
  ledgerId: number;
  categoryId: number | null;
  recordDate: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number | string | null;
  description?: string | null;
  deletedAt?: string | null;
  recordId?: number;
  createdAt?: string | Date | null;
};
export type OrdinaryTagObservationCalculationInput = {
  ledgerId: 37;
  userId: number;
  categoryId: number;
  categoryName: string;
  config: OrdinaryTagObservationConfig;
  records: readonly OrdinaryTagObservationRecord[];
  /** 明确传入账本业务日期，禁止计算函数使用隐式系统时间。 */
  today: string;
  /** 仅传入此category已保存的规则；缺省/空数组严格保留旧逐字段输出。 */
  downsideRules?: readonly OrdinaryTagDownsideRule[];
};

/** 观察模式不占实际比例；关闭不自动恢复原份额。只改变配置，不产生资金流水。 */
export function ordinaryObservationAllocationPatch(
  tagName: string,
  config: OrdinaryTagObservationConfig,
): Record<string, number | string> {
  const checked = validateOrdinaryTagObservationConfig(config);
  return {
    [ordinaryTagObservationKey(tagName)]: JSON.stringify(checked),
    ...(checked.enabled ? { [`${tagName}__ratio`]: 0, [`${tagName}__targetAmount`]: 0 } : {}),
  };
}

/** 旧编辑入口不能在观察开启时重新分配真实权益；须先通过专用开关关闭观察。 */
export function assertOrdinaryObservationAllocationChange(
  previous: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>,
  tagName: string,
): void {
  if (!readOrdinaryTagObservationConfig(previous, tagName)?.enabled) return;
  for (const key of [`${tagName}__ratio`, `${tagName}__targetAmount`]) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const value = patch[key];
    const isExplicitNumber = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '');
    if (!isExplicitNumber || !Number.isFinite(Number(value)) || Number(value) !== 0) {
      throw new Error(`「${tagName}」已开启观察，请先关闭观察再分配真实比例`);
    }
  }
}

export function ordinaryTagObservationKey(tagName: string): string {
  return `${tagName}${ORDINARY_TAG_OBSERVATION_SUFFIX}`;
}

export function isOrdinaryTagObservationDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01') return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** 不补默认启用、比例、日期或参考金额；显式零金额/零比例是合法的已填参数。 */
export function validateOrdinaryTagObservationConfig(value: unknown): OrdinaryTagObservationConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('观察配置不能为空');
  const c = value as Record<string, unknown>;
  if (typeof c.enabled !== 'boolean') throw new Error('观察开关必须明确指定');
  if (typeof c.initialAmount !== 'number' || !Number.isFinite(c.initialAmount) || c.initialAmount < 0) {
    throw new Error('参考初始金额必须是非负有限数字');
  }
  if (typeof c.ratio !== 'number' || !Number.isFinite(c.ratio) || c.ratio < 0) {
    throw new Error('观察比例必须是非负有限数字');
  }
  if (!Number.isFinite(c.initialAmount * (c.ratio / 100))) throw new Error('观察金额与比例计算溢出');
  if (!isOrdinaryTagObservationDate(c.startDate)) throw new Error('观察开始日期必须是有效的YYYY-MM-DD日期');
  if (c.pauseDate !== null && !isOrdinaryTagObservationDate(c.pauseDate)) throw new Error('观察暂停日期必须是有效日期或null');
  if (c.pauseDate !== null && c.pauseDate < c.startDate) throw new Error('观察暂停日期不能早于开始日期');
  return { enabled: c.enabled, initialAmount: c.initialAmount, ratio: c.ratio, startDate: c.startDate, pauseDate: c.pauseDate };
}

/** 只读取专用JSON字符串键，不把真实金额或 __ratio 等字段当作观察配置。 */
export function readOrdinaryTagObservationConfig(
  balances: Readonly<Record<string, unknown>>,
  tagName: string,
): OrdinaryTagObservationConfig | null {
  const stored = balances[ordinaryTagObservationKey(tagName)];
  if (typeof stored !== 'string') return null;
  try {
    const c: unknown = JSON.parse(stored);
    if (c === null || typeof c !== 'object' || Array.isArray(c)) return null;
    const obj = c as Record<string, unknown>;
    // 结构完整但参数值非法的旧配置可由管理员修复，并在观察摘要中明确invalid_config。
    if (typeof obj.enabled !== 'boolean' || typeof obj.initialAmount !== 'number' || typeof obj.ratio !== 'number'
      || typeof obj.startDate !== 'string' || (obj.pauseDate !== null && typeof obj.pauseDate !== 'string')) return null;
    return { enabled: obj.enabled, initialAmount: obj.initialAmount, ratio: obj.ratio, startDate: obj.startDate, pauseDate: obj.pauseDate };
  } catch {
    return null;
  }
}

function realAmount(value: OrdinaryTagObservationRecord['amount']): number | null {
  if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? Math.abs(amount) : null;
}

export type OrdinaryTagObservationCanonicalDay = {
  date: string;
  /** 日末非transfer的真实B；显式0有效，缺失金额不转为0。 */
  balance: number | null;
  /** 当日真实本金净变动和提现，独立于余额排序。 */
  capitalChange: number;
  withdrawTotal: number;
};

/** 仅供saved-rule路径；旧income/expense聚合不调用此规范化。 */
export function canonicalOrdinaryTagObservationDays(
  input: OrdinaryTagObservationCalculationInput,
  cutoff: string,
): OrdinaryTagObservationCanonicalDay[] {
  const days = new Map<string, OrdinaryTagObservationCanonicalDay>();
  const createdOrder = (value: OrdinaryTagObservationRecord['createdAt']): string => {
    const text = value instanceof Date ? (Number.isFinite(value.getTime()) ? value.toISOString() : '')
      : typeof value === 'string' ? value : '';
    const normalized = text.replace('T', ' ').replace(/Z$/, '');
    const parts = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?$/.exec(normalized);
    return parts ? `${parts[1]}.${(parts[2] ?? '').padEnd(6, '0')}` : normalized;
  };
  // sort只操作副本；同date/createdAt/id时稳定保留SQL原始顺序。
  const records = input.records.filter(record => record.ledgerId === input.ledgerId
    && record.categoryId === input.categoryId && !record.deletedAt
    && isOrdinaryTagObservationDate(record.recordDate) && record.recordDate <= cutoff)
    .slice().sort((a, b) => a.recordDate.localeCompare(b.recordDate)
      || createdOrder(a.createdAt).localeCompare(createdOrder(b.createdAt))
      || (a.recordId ?? 0) - (b.recordId ?? 0));
  for (const record of records) {
    const day = days.get(record.recordDate) ?? {
      date: record.recordDate, balance: null, capitalChange: 0, withdrawTotal: 0,
    };
    const amount = realAmount(record.amount);
    if (record.type === 'income' || record.type === 'expense') day.balance = amount;
    else if (record.type === 'transfer' && record.recordDate >= input.config.startDate) {
      if (record.description?.startsWith('capital_')) {
        day.capitalChange += amount === null ? NaN : record.description.startsWith('capital_add') ? amount : -amount;
      } else day.withdrawTotal += amount === null ? NaN : amount;
    }
    days.set(record.recordDate, day);
  }
  return Array.from(days.values());
}

/** saved-rule日级派生观察；真实B和资金流不被counted替换。 */
function calculateDownsideObservation(
  input: OrdinaryTagObservationCalculationInput,
  result: OrdinaryTagObservationSummary,
  cutoff: string,
  paused: boolean,
): OrdinaryTagObservationSummary {
  const days = canonicalOrdinaryTagObservationDays(input, cutoff);
  let previousBalance: number | null = null;
  for (const day of days) {
    if (day.date >= input.config.startDate) break;
    if (day.balance !== null) previousBalance = day.balance;
  }
  const visibleDays = days.filter(day => day.date >= input.config.startDate);
  // initialAmount/startDate/ratio只取观察自己的config，绝不借用真实成员本金或份额。
  // 区分真正无余额的资金流日期与已登记但日末金额无效的日期；后者不能沿用旧ready摘要。
  const balanceDates = new Set(input.records.filter(record => record.ledgerId === input.ledgerId
    && record.categoryId === input.categoryId && !record.deletedAt
    && (record.type === 'income' || record.type === 'expense')
    && isOrdinaryTagObservationDate(record.recordDate) && record.recordDate <= cutoff)
    .map(record => record.recordDate));
  const series = calculateOrdinaryTagDownsideSeries({
    ledgerId: input.ledgerId, categoryId: input.categoryId,
    initialAmount: input.config.initialAmount, entryDate: input.config.startDate, ratio: input.config.ratio,
    rules: input.downsideRules!,
    points: visibleDays.map(day => ({ date: day.date, rawBalance: day.balance,
      capitalChange: day.capitalChange, withdraw: day.withdrawTotal })),
  });
  let capital = 0, withdraw = 0;
  let observedBalance = false;
  let pendingEvidence = false;
  let latestPending = false;
  result.countedBalance = result.rawPnl = null;
  result.ruleVersion = null;
  for (let index = 0; index < visibleDays.length; index++) {
    const day = visibleDays[index], derived = series[index];
    capital += day.capitalChange;
    withdraw += day.withdrawTotal;
    if (![capital, withdraw].every(Number.isFinite)) pendingEvidence = true;
    if (day.balance === null) {
      if (balanceDates.has(day.date)) {
        result.latestDate = day.date;
        result.latestBalance = result.countedBalance = result.rawPnl = result.totalPnl = result.todayPnl = null;
        result.capitalChange = Number.isFinite(capital) ? capital : 0;
        result.withdrawTotal = Number.isFinite(withdraw) ? withdraw : 0;
        result.ruleVersion = derived.ruleVersion;
        latestPending = true;
      }
      continue;
    }
    result.latestDate = day.date;
    result.latestBalance = day.balance;
    result.capitalChange = Number.isFinite(capital) ? capital : 0;
    result.withdrawTotal = Number.isFinite(withdraw) ? withdraw : 0;
    result.countedBalance = derived.countedBalance;
    result.rawPnl = derived.rawPnl;
    result.ruleVersion = derived.ruleVersion;
    if (derived.status !== 'ready' || derived.countedPnl === null || derived.rawPnl === null
      || derived.countedBalance === null || pendingEvidence) {
      result.totalPnl = result.todayPnl = null;
      latestPending = true;
      observedBalance = true;
      continue;
    }
    // 引擎累计从config初始额起算；首daily只减开始前最后真实B的raw基准。
    // 基准不包含开始日起任何cash，防止首日本金/withdraw被重复减去。
    const firstRawBaseline = previousBalance === null ? null
      : (input.config.initialAmount - previousBalance) * input.config.ratio / 100;
    const daily = observedBalance ? derived.dailyCountedPnl
      : firstRawBaseline === null ? null : derived.countedPnl - firstRawBaseline;
    if (daily !== null && !Number.isFinite(daily)) {
      result.totalPnl = result.todayPnl = null;
      pendingEvidence = true;
      observedBalance = true;
      continue;
    }
    const dailyPnl = daily === 0 ? 0 : daily;
    result.points.push({ date: day.date, balance: day.balance, pnl: derived.countedPnl,
      dailyPnl, countedBalance: derived.countedBalance, rawPnl: derived.rawPnl,
      ruleVersion: derived.ruleVersion });
    result.totalPnl = derived.countedPnl;
    if (day.date === input.today) result.todayPnl = dailyPnl;
    observedBalance = true;
    latestPending = false;
  }
  if (!observedBalance) {
    result.capitalChange = Number.isFinite(capital) ? capital : 0;
    result.withdrawTotal = Number.isFinite(withdraw) ? withdraw : 0;
  }
  if (latestPending || (!observedBalance && pendingEvidence)) {
    result.status = 'pending';
    result.totalPnl = result.todayPnl = null;
  } else if (observedBalance) result.status = paused ? 'paused' : 'active';
  return result;
}

/**
 * 严格复用 LedgerDetailAA 的manual_balance对赌方向：
 * (参考初始金额 + 开始日起本金变动 - 真实余额 - 开始日起提现) × ratio / 100。
 * 同日income>0优先income，否则expense；零值无效日不伪造余额点。
 * 开始日前最后一个真实余额只作为首个dailyPnl基准，永不成为观察收益点。
 */
export function calculateOrdinaryTagObservationSummary(
  input: OrdinaryTagObservationCalculationInput,
): OrdinaryTagObservationSummary {
  const { config, today } = input;
  const result: OrdinaryTagObservationSummary = {
    ledgerId: ORDINARY_TAG_OBSERVATION_LEDGER_ID,
    userId: input.userId,
    categoryId: input.categoryId,
    categoryName: input.categoryName,
    config: { ...config },
    status: 'no_data',
    latestDate: null,
    latestBalance: null,
    capitalChange: 0,
    withdrawTotal: 0,
    totalPnl: null,
    todayPnl: null,
    points: [],
  };
  const invalidCalculation = (): OrdinaryTagObservationSummary => {
    result.status = 'invalid_config';
    result.points = [];
    result.latestDate = result.latestBalance = result.totalPnl = result.todayPnl = null;
    result.capitalChange = result.withdrawTotal = 0;
    return result;
  };
  try {
    validateOrdinaryTagObservationConfig(config);
    if (input.ledgerId !== ORDINARY_TAG_OBSERVATION_LEDGER_ID || !isOrdinaryTagObservationDate(today)) throw new Error('非法计算边界');
  } catch {
    result.status = 'invalid_config';
    return result;
  }
  if (!config.enabled) { result.status = 'disabled'; return result; }
  if (config.startDate > today) { result.status = 'pending'; return result; }
  const paused = config.pauseDate !== null && config.pauseDate <= today;
  const cutoff = paused ? config.pauseDate! : today;
  if (input.downsideRules?.some(rule => rule.ledgerId === input.ledgerId && rule.categoryId === input.categoryId)) {
    return calculateDownsideObservation(input, result, cutoff, paused);
  }
  const days = new Map<string, { income: number; expense: number; capital: number; withdraw: number }>();
  for (const record of input.records) {
    if (record.ledgerId !== input.ledgerId || record.categoryId !== input.categoryId || record.deletedAt
      || !isOrdinaryTagObservationDate(record.recordDate) || record.recordDate > cutoff) continue;
    const amount = realAmount(record.amount);
    if (amount === null) continue;
    const day = days.get(record.recordDate) ?? { income: 0, expense: 0, capital: 0, withdraw: 0 };
    if (record.type === 'income') day.income += amount;
    else if (record.type === 'expense') day.expense += amount;
    else if (record.type === 'transfer' && record.recordDate >= config.startDate) {
      if (record.description?.startsWith('capital_')) day.capital += record.description.startsWith('capital_add') ? amount : -amount;
      else day.withdraw += amount;
    }
    if (![day.income, day.expense, day.capital, day.withdraw].every(Number.isFinite)) return invalidCalculation();
    days.set(record.recordDate, day);
  }
  let previousBalance: number | null = null;
  let capital = 0, withdraw = 0, intervalCapital = 0, intervalWithdraw = 0;
  const ratio = config.ratio / 100;
  for (const [date, day] of Array.from(days).sort(([a], [b]) => a.localeCompare(b))) {
    capital += day.capital;
    withdraw += day.withdraw;
    intervalCapital += day.capital;
    intervalWithdraw += day.withdraw;
    if (![capital, withdraw, intervalCapital, intervalWithdraw].every(Number.isFinite)) return invalidCalculation();
    // AA原算法明确跳过income=expense=0的无效日期。
    if (day.income === 0 && day.expense === 0) continue;
    const balance = day.income > 0 ? day.income : day.expense;
    if (!Number.isFinite(balance)) continue;
    if (date >= config.startDate) {
      const pnl = (config.initialAmount + capital - balance - withdraw) * ratio;
      const dailyPnl = previousBalance === null ? null
        : (previousBalance + intervalCapital - intervalWithdraw - balance) * ratio;
      if (!Number.isFinite(pnl) || (dailyPnl !== null && !Number.isFinite(dailyPnl))) {
        return invalidCalculation();
      }
      // 仅规范已计算出来的真实零，不把缺失余额/收益转换为0。
      const normalizedPnl = pnl === 0 ? 0 : pnl;
      const normalizedDailyPnl = dailyPnl === 0 ? 0 : dailyPnl;
      result.points.push({ date, balance, pnl: normalizedPnl, dailyPnl: normalizedDailyPnl });
      result.latestDate = date;
      result.latestBalance = balance;
      result.capitalChange = capital;
      result.withdrawTotal = withdraw;
      result.totalPnl = normalizedPnl;
      if (date === today) result.todayPnl = normalizedDailyPnl;
    }
    previousBalance = balance;
    intervalCapital = intervalWithdraw = 0;
  }
  // 缺少开始日后的真实余额时不反推/造0；资金流累计为已知真实流，而非估值。
  if (result.points.length === 0) {
    result.capitalChange = capital;
    result.withdrawTotal = withdraw;
    return result;
  }
  result.status = paused ? 'paused' : 'active';
  return result;
}
