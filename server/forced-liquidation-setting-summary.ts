import { decryptValue, isEncrypted } from './encryption';
import { calculateOrdinaryTagDownsideSeries, type OrdinaryTagDownsidePoint, type OrdinaryTagDownsideRule } from '../shared/ordinary-tag-downside';
import { stockLotDownsideEffectiveAt, type StockLotDownsideRule } from '../shared/stock-lot-downside';
import { portfolioCurrency, isCryptoPortfolioSymbol, isValidCryptoPortfolioQuantity } from '../shared/portfolio-instruments';
import { chooseLatestStockQuote, forcedLiquidationLevelPercents, segmentedForcedLiquidationPriceDrop,
  type ForcedLiquidationSettingDetail, type ForcedLiquidationStockQuote } from '../shared/forced-liquidation-display';
import type { ForcedLiquidationSettingDetailInput } from './forced-liquidation-setting-detail';

/** SQL-returned quotes are rechecked at the tenant/category/symbol/time boundary. */
export function decodeForcedLiquidationStockQuotes(found: readonly any[], categoryId: number, symbol: string,
  table: string, source: string, now: number): ForcedLiquidationStockQuote[] {
  const today = new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
  const quotes: ForcedLiquidationStockQuote[] = [];
  for (const q of found) {
    const priceDate = date(q.price_date), updated = wallTime(q.captured_at);
    if (number(q.ledger_id) !== 37 || number(q.category_id) !== categoryId || q.symbol !== symbol
      || !priceDate || priceDate > today || !updated || Date.parse(updated) > now) continue;
    const price = amount(q.price);
    quotes.push({ symbol: q.symbol, price: price !== null && price > 0 ? price : null,
      priceDate, updatedAt: updated, source: `${table}:${source}` });
  }
  return quotes;
}

export type ForcedLiquidationIneffectiveSummary = {
  /** Only present for enabled targets. Null means missing/pending, not zero. */
  ineffectiveFunds?: number | null;
  /** Native unit; omitted for mixed-currency aggregates, never category.currency FX. */
  ineffectiveCurrency?: 'CNY' | 'USD' | 'USDT';
  ineffectiveNotice?: string | null;
  ineffectiveStatus?: 'ready' | 'pending' | 'no_data';
  ineffectiveCurrencies?: Array<'CNY' | 'USD' | 'USDT'>;
};
const nativeCurrency = (value: string): 'CNY' | 'USD' | 'USDT' | undefined =>
  value === 'CNY' || value === 'USD' || value === 'USDT' ? value : undefined;
export function forcedLiquidationDetailSummary(dto: ForcedLiquidationSettingDetail): ForcedLiquidationIneffectiveSummary {
  return { ineffectiveFunds: dto.status === 'ready' ? dto.ineffectiveFunds : null,
    ineffectiveCurrency: nativeCurrency(dto.currency), ineffectiveNotice: dto.notice, ineffectiveStatus: dto.status };
}
/** Caller passes only enabled real stocks; never cross-FX or sum partial evidence. */
export function aggregateForcedLiquidationStockSummaries(stocks: readonly ForcedLiquidationIneffectiveSummary[]): ForcedLiquidationIneffectiveSummary {
  if (stocks.length === 0) return {};
  const currencies = Array.from(new Set(stocks.flatMap(s => s.ineffectiveCurrency ? [s.ineffectiveCurrency] : [])));
  const common = currencies.length === 1 && stocks.every(s => s.ineffectiveCurrency === currencies[0]);
  const evidence = { ineffectiveCurrencies: currencies, ...(common ? { ineffectiveCurrency: currencies[0] } : {}) };
  if (!common) return { ...evidence, ineffectiveFunds: null, ineffectiveStatus: 'pending',
    ineffectiveNotice: `已开启持仓币种混合或缺失（${currencies.join('/') || '未知'}），不跨币种换算或相加` };
  if (stocks.some(s => s.ineffectiveStatus !== 'ready' || typeof s.ineffectiveFunds !== 'number' || !Number.isFinite(s.ineffectiveFunds))) {
    return { ...evidence, ineffectiveFunds: null, ineffectiveStatus: 'pending',
      ineffectiveNotice: '任一已开启真实持仓金额证据缺失或待核验，不展示不完整汇总；' +
        stocks.filter(s => s.ineffectiveStatus !== 'ready').map(s => s.ineffectiveNotice).filter(Boolean).join('；') };
  }
  const sum = stocks.reduce((total, s) => total + s.ineffectiveFunds!, 0);
  if (!Number.isFinite(sum)) return { ...evidence, ineffectiveFunds: null, ineffectiveStatus: 'pending', ineffectiveNotice: '同币种已开启持仓汇总溢出' };
  return { ...evidence, ineffectiveFunds: sum === 0 ? 0 : sum, ineffectiveStatus: 'ready',
    ineffectiveNotice: '仅汇总同币种已开启真实持仓的当期分段无效金额，不含未开启持仓、历史PnL或钱包余额' };
}

const id = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
function number(value: unknown): number | null {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === ''
    || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(value))) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
const amount = (value: unknown) => { const n = number(value); return n !== null && n >= 0 ? n : null; };
function date(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const at = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value ? value : null;
}
function wallTime(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(value)
    || !date(value.slice(0, 10))) return null;
  const [base, fraction = ''] = value.replace(' ', 'T').split('.');
  const iso = `${base}.${fraction.padEnd(6, '0')}+08:00`;
  return Number.isFinite(Date.parse(iso)) ? iso : null;
}
function empty(input: ForcedLiquidationSettingDetailInput, kind: 'stock' | 'ordinary'): ForcedLiquidationSettingDetail {
  return { ledgerId: 37, categoryId: input.categoryId, lotId: input.lotId ?? null, kind, currency: 'CNY',
    initialValue: null, latestValue: null, latestDate: null, latestSource: null, remainingQuantity: null, rule: null,
    status: 'pending', notice: null, capitalChange: kind === 'stock' ? 0 : null, withdraw: kind === 'stock' ? 0 : null,
    effectiveFunds: null, ineffectiveFunds: null, fundBasis: kind === 'stock' ? 'segmented_price_drop' : 'cashflow_neutral_replay',
    initialToThresholdPercent: null, thresholdToLatestPercent: null };
}

/** Shared CURRENT builder: no SQL, portfolio, historical stock PnL, cache or mutation. */
export function buildForcedLiquidationStockDetail(input: ForcedLiquidationSettingDetailInput,
  lots: readonly any[], quotes: readonly ForcedLiquidationStockQuote[], saved: readonly any[], now: number): ForcedLiquidationSettingDetail {
  const dto = empty(input, 'stock');
  const lot = lots[0];
  if (lots.length !== 1 || number(lot?.id) !== input.lotId || number(lot?.ledger_id) !== 37
    || number(lot?.category_id) !== input.categoryId || lot.opening_status !== 'active'
    || !['buy', 'add'].includes(lot.opening_event_type) || typeof lot.symbol !== 'string') throw new Error('持仓不属于该分类或真实开仓已作废');
  dto.currency = portfolioCurrency(lot.symbol);
  const initial = amount(lot.unit_cost), quantity = amount(lot.initial_quantity), sold = amount(lot.allocated_quantity);
  const openedAt = wallTime(lot.actual_traded_at);
  dto.initialValue = initial !== null && initial > 0 ? initial : null;
  dto.initialDate = openedAt?.slice(0, 10) ?? null;
  if (quantity !== null && quantity > 0 && sold !== null && sold <= quantity
    && (!isCryptoPortfolioSymbol(lot.symbol) || (isValidCryptoPortfolioQuantity(quantity)
      && (sold === 0 || isValidCryptoPortfolioQuantity(sold))))) {
    const remaining = quantity - sold;
    dto.remainingQuantity = isCryptoPortfolioSymbol(lot.symbol) ? Number(remaining.toFixed(8)) : remaining;
  }
  const today = new Date(now + 8 * 3600_000).toISOString().slice(0, 10);
  const latest = chooseLatestStockQuote(quotes, lot.symbol);
  dto.latestValue = latest?.price ?? null; dto.latestDate = latest?.priceDate ?? null; dto.latestSource = latest?.source ?? null;
  const s = saved[0];
  let rule: StockLotDownsideRule | null = null;
  if (s && number(s.ledger_id) === 37 && number(s.category_id) === input.categoryId && number(s.lot_id) === input.lotId) {
    rule = { ledgerId: 37, categoryId: input.categoryId, lotId: input.lotId!, userId: number(s.user_id) ?? NaN,
      version: number(s.version) ?? NaN, enabled: number(s.enabled) === 1, thresholdPrice: number(s.threshold_price) ?? NaN,
      downsidePercent: number(s.downside_percent) ?? NaN, startDate: date(s.start_date) ?? undefined,
      effectiveAt: s.effective_at, baselineRawPrice: number(s.baseline_raw_price) ?? NaN,
      baselineCountedPrice: number(s.baseline_counted_price) ?? NaN, baselineSource: s.baseline_source,
      baselineStatus: s.baseline_status, holdingStartAt: s.holding_start_at, currency: s.currency };
    if (id(rule.version) && Number.isFinite(rule.thresholdPrice) && Number.isFinite(rule.downsidePercent)) {
      dto.rule = { version: rule.version, enabled: rule.enabled, threshold: rule.thresholdPrice, downsidePercent: rule.downsidePercent,
        startDate: rule.startDate ?? '', baselineSource: rule.baselineSource, baselineStatus: rule.baselineStatus };
      Object.assign(dto, forcedLiquidationLevelPercents(dto.initialValue, rule.thresholdPrice, dto.latestValue));
    }
  }
  if (dto.initialValue === null || dto.remainingQuantity === null || !openedAt || Date.parse(openedAt) > now) {
    dto.notice = '真实开仓价格、时间或剩余数量证据缺失/无效，不能计算收益跌幅金额'; return dto;
  }
  if (!latest) { dto.status = 'no_data'; dto.notice = '现有行情表没有该持仓的真实报价；不以开仓价或未来行情代替'; return dto; }
  if (latest.price === null || Date.parse(latest.updatedAt) < Date.parse(openedAt)) {
    dto.notice = '最新行情无效或早于真实开仓，不回退旧报价'; return dto;
  }
  if (!rule || !dto.rule) { dto.notice = '尚无有效保存规则，收益金额待设置核验'; return dto; }
  if (!rule.startDate) {
    dto.notice = '旧规则缺少有效启用日期，无法确认当前展示适用范围；不自动转换或推测日期'; return dto;
  }
  if (rule.startDate > today || !Number.isFinite(Date.parse(rule.effectiveAt))
    || Date.parse(rule.effectiveAt) > Date.parse(latest.updatedAt)
    || stockLotDownsideEffectiveAt(rule.startDate) !== new Date(rule.effectiveAt).toISOString()) {
    dto.notice = '最新保存版本尚未在报价日生效或日期证据无效，不自动回退旧版本'; return dto;
  }
  if (![0, 1].includes(number(s.enabled) ?? NaN) || rule.currency !== dto.currency || !id(rule.userId)
    || rule.thresholdPrice <= 0 || rule.downsidePercent < 0 || rule.downsidePercent > 100) {
    dto.notice = '已保存门槛、比例或币种证据无效，等待核验'; return dto;
  }
  // User-defined CURRENT segmented price-drop display, not historical counted PnL.
  // A legacy baseline or pending historical replay cannot invalidate these five real inputs.
  // This read never converts rules or changes the historical/day/member accounting engine.
  Object.assign(dto, segmentedForcedLiquidationPriceDrop({ initialPrice: dto.initialValue, latestPrice: dto.latestValue,
    remainingQuantity: dto.remainingQuantity, threshold: rule.thresholdPrice, downsidePercent: rule.downsidePercent, enabled: rule.enabled }));
  if (dto.effectiveFunds === null) { dto.notice = '分段收益金额溢出或证据无效'; return dto; }
  dto.status = 'ready'; dto.notice = '按已保存门槛、剩余比例和真实剩余股数，展示初始到最新的两段下跌金额；不是钱包余额或历史累计实得收益';
  if (rule.baselineSource !== 'owner_threshold') dto.notice += '；此笔旧规则的历史日结和客户收益仍沿用原算法，不自动转换';
  if (rule.baselineStatus === 'pending') dto.notice += '；历史收益核验状态仍保留，不影响此处按真实数据分段展示';
  return dto;
}

type Day = { date: string; hasBalance: boolean; balance: number | null; source: string | null;
  capitalChange: number | null; withdraw: number | null; hasFlow: boolean };
/** Shared global-initial/full-history cash-neutral replay; never an endpoint shortcut. */
export function buildForcedLiquidationOrdinaryDetail(input: ForcedLiquidationSettingDetailInput, name: string,
  configs: readonly any[], records: readonly any[], rules: readonly OrdinaryTagDownsideRule[], today: string): ForcedLiquidationSettingDetail {
  const dto = empty(input, 'ordinary'); dto.rawPnl = null; dto.countedPnl = null; dto.initialDate = null;
  const config = configs.length === 1 && number(configs[0].ledger_id) === 37 && configs[0].tag_name === name ? configs[0] : null;
  dto.initialValue = amount(config?.initial_amount);
  const latestRule = rules.filter(r => r.ledgerId === 37 && r.categoryId === input.categoryId)
    .reduce<(typeof rules)[number] | null>((latest, rule) => !latest || rule.version > latest.version ? rule : latest, null);
  if (latestRule) dto.rule = { version: latestRule.version, enabled: latestRule.enabled, threshold: latestRule.thresholdAmount,
    downsidePercent: latestRule.downsidePercent, startDate: latestRule.startDate };
  const scoped = records.filter(r => number(r.ledgerId) === 37 && number(r.categoryId) === input.categoryId
    && !r.deletedAt && !r.deleted_at && date(r.recordDate) && r.recordDate <= today)
    .sort((a, b) => a.recordDate.localeCompare(b.recordDate) || String(a.createdAt).localeCompare(String(b.createdAt))
      || (number(a.id) ?? 0) - (number(b.id) ?? 0));
  const days = new Map<string, Day>();
  for (const row of scoped) {
    const day = days.get(row.recordDate) ?? { date: row.recordDate, hasBalance: false, balance: null, source: null, capitalChange: 0, withdraw: 0, hasFlow: false };
    if (row.type === 'income' || row.type === 'expense') {
      day.hasBalance = true; day.balance = amount(row.amount); day.source = `ledger_records:${row.id}`;
    } else if (row.type === 'transfer') {
      const n = number(row.amount);
      const description = typeof row.description === 'string' ? decryptValue(row.description) : '';
      if (n !== 0 || isEncrypted(description)) day.hasFlow = true;
      if (n === null || isEncrypted(description)) { day.capitalChange = null; day.withdraw = null; }
      else if (description.startsWith('capital_')) {
        if (day.capitalChange !== null) day.capitalChange += description.startsWith('capital_add') ? Math.abs(n) : -Math.abs(n);
      } else if (day.withdraw !== null) day.withdraw += Math.abs(n);
      if (day.capitalChange !== null && !Number.isFinite(day.capitalChange)) day.capitalChange = null;
      if (day.withdraw !== null && !Number.isFinite(day.withdraw)) day.withdraw = null;
    }
    days.set(day.date, day);
  }
  const history = Array.from(days.values());
  const balanceDays = history.filter(d => d.hasBalance), latest = balanceDays.at(-1), first = balanceDays[0];
  dto.latestValue = latest?.balance ?? null; dto.latestDate = latest?.date ?? null; dto.latestSource = latest?.source ?? null;
  if (dto.rule) Object.assign(dto, forcedLiquidationLevelPercents(dto.initialValue, dto.rule.threshold, dto.latestValue));
  if (!latest) { dto.status = 'no_data'; dto.notice = '没有真实非transfer余额记录，不能用本金或transfer代替余额'; return dto; }
  if (dto.initialValue === null) { dto.notice = '全局ledger_tag_config.initial_amount缺失或无效；不使用任何成员本金推测基准'; return dto; }
  // There is no global initial/start-date pair in the existing config schema. The only
  // supported proof is the first canonical real balance exactly matching global initial,
  // with no preceding/same-day nonzero or invalid flow. Never borrow member __startDate,
  // config audit time, interest/balance date, or rule activation as an account entry date.
  const beforeInitial = history.filter(d => d.date <= first.date);
  if (first.balance !== dto.initialValue || beforeInitial.some(d => d.hasFlow || d.capitalChange !== 0 || d.withdraw !== 0)) {
    dto.notice = '全局初始金额存在，但缺少有效全局起始余额证据：首个canonical余额须等于初始且此前无资金流；不推测成员起始日期'; return dto;
  }
  dto.initialDate = first.date;
  if (latest.balance === null) { dto.notice = '最后canonical非transfer余额无效，不回退旧有效余额'; return dto; }
  if (!latestRule) { dto.notice = '尚无保存规则，计入收益金额待设置核验'; return dto; }
  if (latestRule.startDate > latest.date) { dto.notice = '最新保存规则在余额观察日尚未生效，不自动回退旧版本'; return dto; }
  const replayDays = history.filter(d => d.date > first.date && d.date <= latest.date);
  const points: OrdinaryTagDownsidePoint[] = [{ date: first.date, rawBalance: first.balance, capitalChange: 0, withdraw: 0 },
    ...replayDays.map(d => ({ date: d.date, rawBalance: d.hasBalance ? d.balance : null, capitalChange: d.capitalChange, withdraw: d.withdraw }))];
  const sum = (key: 'capitalChange' | 'withdraw') => {
    let total = 0;
    for (const d of replayDays) { if (d[key] === null) return null; total += d[key]!; if (!Number.isFinite(total)) return null; }
    return total === 0 ? 0 : total;
  };
  dto.capitalChange = sum('capitalChange'); dto.withdraw = sum('withdraw');
  const series = calculateOrdinaryTagDownsideSeries({ ledgerId: 37, categoryId: input.categoryId,
    initialAmount: dto.initialValue, entryDate: first.date, ratio: 100, points, rules });
  const final = series.at(-1);
  dto.rawPnl = final?.rawPnl ?? null; dto.countedPnl = final?.countedPnl ?? null;
  if (final?.status !== 'ready' || dto.rawPnl === null || dto.countedPnl === null) {
    dto.notice = '完整历史资金流/余额或规则证据缺失、无效或溢出，计入收益等待核验'; return dto;
  }
  const difference = dto.rawPnl - dto.countedPnl;
  if (!Number.isFinite(difference)) { dto.notice = '真实收益与计入收益差额溢出'; return dto; }
  dto.effectiveFunds = dto.countedPnl === 0 ? 0 : dto.countedPnl;
  dto.ineffectiveFunds = difference === 0 ? 0 : difference;
  dto.status = 'ready';
  dto.notice = '全局本金100%口径：完整历史按既有日级cash-before-performance资金流中性重放；有效为真实计入收益，无效为raw收益与计入收益之差（保留回升符号），非钱包金额';
  if (replayDays.some(d => d.capitalChange !== 0 || d.withdraw !== 0)) dto.notice += '；存在加减本金/取回，不是初始与最新两端简单相减';
  return dto;
}
