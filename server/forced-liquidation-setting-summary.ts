import { decryptValue, isEncrypted } from './encryption';
import { calculateOrdinaryTagDownsideSeries, type OrdinaryTagDownsidePoint, type OrdinaryTagDownsideRule } from '../shared/ordinary-tag-downside';
import { stockLotDownsideEffectiveAt, isStockLotDownsideAutoWaiting, isStockLotDownsideAutoRuleValid, type StockLotDownsideRule } from '../shared/stock-lot-downside';
import { portfolioCurrency, isCryptoPortfolioSymbol, isValidCryptoPortfolioQuantity } from '../shared/portfolio-instruments';
import { chooseLatestStockQuote, forcedLiquidationLevelPercents, segmentedForcedLiquidationPriceDrop,
  type ForcedLiquidationSettingDetail, type ForcedLiquidationStockQuote } from '../shared/forced-liquidation-display';
import type { ForcedLiquidationSettingDetailInput } from './forced-liquidation-setting-detail';
import { USDT_USD_PARITY_POLICY, USDT_USD_PARITY_RATE } from '../shared/usdt-usd-parity-policy';

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

/** Injected upstream quote, structurally compatible with StockUsdCnyQuote; never fetched here. */
export type ForcedLiquidationCnyFx = {
  rate: number;
  pair: 'USD/CNY';
  stale: boolean;
  source: string;
  asOf: string;
};
export type ForcedLiquidationIneffectiveSummary = {
  /** Only present for enabled targets. Null means missing/pending, not zero. */
  ineffectiveFunds?: number | null;
  /** Native unit; omitted for mixed-currency aggregates, never category.currency FX. */
  ineffectiveCurrency?: 'CNY' | 'USD' | 'USDT';
  ineffectiveNotice?: string | null;
  ineffectiveStatus?: 'ready' | 'pending' | 'no_data';
  ineffectiveCurrencies?: Array<'CNY' | 'USD' | 'USDT'>;
  /** Display-only CNY, rounded per enabled child to two decimals; never a native accounting input. */
  ineffectiveFundsCny?: number | null;
  ineffectiveCnyStatus?: 'ready' | 'pending' | 'no_data';
  ineffectiveCnyNotice?: string | null;
  /** Only validated conversion evidence; CNY passthrough and parent sums need no quote. */
  ineffectiveCnyFx?: ForcedLiquidationCnyFx;
  ineffectiveCnyPolicy?: typeof USDT_USD_PARITY_POLICY;
};
const nativeCurrency = (value: string): 'CNY' | 'USD' | 'USDT' | undefined =>
  value === 'CNY' || value === 'USD' || value === 'USDT' ? value : undefined;
/** Decimal half-away-from-zero display rounding, including signed ordinary recovery amounts.
 * Exponent shifting avoids the usual 1.005 * 100 binary rounding trap. Reject values whose
 * safe cents cannot survive number/2-decimal rendering, rather than display a different cent.
 */
function cnyDisplayCents(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const [mantissa, exponent = '0'] = Math.abs(value).toString().split('e');
  const scaled = Number(`${mantissa}e${Number(exponent) + 2}`);
  if (!Number.isFinite(scaled)) return null;
  const cents = Math.round(scaled) * (value < 0 ? -1 : 1);
  if (!Number.isSafeInteger(cents)) return null;
  const renderedCents = Number((cents / 100).toFixed(2).replace('.', ''));
  if (renderedCents !== cents) return null;
  return cents === 0 ? 0 : cents;
}
function validCnyFx(fx: ForcedLiquidationCnyFx | null, now: number): fx is ForcedLiquidationCnyFx {
  if (!fx || fx.pair !== 'USD/CNY' || fx.stale !== false || typeof fx.rate !== 'number'
    || !Number.isFinite(fx.rate) || fx.rate <= 0 || typeof fx.source !== 'string' || !fx.source.trim()
    || typeof fx.asOf !== 'string' || !fx.asOf.trim() || !date(fx.asOf.slice(0, 10)) || !Number.isFinite(now)) return false;
  const asOf = Date.parse(fx.asOf);
  // Upstream owns holiday/market-close freshness; do not introduce a second age limit.
  return Number.isFinite(asOf) && asOf <= now;
}
function detailCnySummary(dto: ForcedLiquidationSettingDetail, fx: ForcedLiquidationCnyFx | null,
  now: number): ForcedLiquidationIneffectiveSummary {
  const pending = (notice: string): ForcedLiquidationIneffectiveSummary => ({ ineffectiveFundsCny: null,
    ineffectiveCnyStatus: 'pending', ineffectiveCnyNotice: notice });
  if (dto.status !== 'ready' || typeof dto.ineffectiveFunds !== 'number' || !Number.isFinite(dto.ineffectiveFunds)) {
    return pending(`原币金额证据缺失或待核验，人民币展示待核验${dto.notice ? `；${dto.notice}` : ''}`);
  }
  const currency = nativeCurrency(dto.currency);
  if (!currency) return pending('原币币种未知，不回退原币金额或推测人民币金额');
  let converted = dto.ineffectiveFunds;
  let evidence: ForcedLiquidationIneffectiveSummary = {};
  if (currency !== 'CNY') {
    if (!validCnyFx(fx, now)) return pending('有效USD/CNY汇率证据缺失、过期或异常，人民币展示待核验');
    converted *= fx.rate * (currency === 'USDT' ? USDT_USD_PARITY_RATE : 1);
    evidence = { ineffectiveCnyFx: { rate: fx.rate, pair: fx.pair, stale: fx.stale, source: fx.source, asOf: fx.asOf },
      ...(currency === 'USDT' ? { ineffectiveCnyPolicy: USDT_USD_PARITY_POLICY } : {}) };
  }
  const cents = cnyDisplayCents(converted);
  if (cents === null) return pending('人民币展示金额溢出或不能以安全整数分值准确展示，等待核验');
  return { ...evidence, ineffectiveFundsCny: cents / 100, ineffectiveCnyStatus: 'ready',
    ineffectiveCnyNotice: currency === 'CNY' ? '原币人民币金额仅为列表展示取两位小数，保留原币原始精度及符号'
      : `仅列表展示按有效USD/CNY换算人民币并取两位小数，不改变原币规则或资金算法${currency === 'USDT' ? '；按已授权USDT=USD政策' : ''}` };
}
export function forcedLiquidationDetailSummary(dto: ForcedLiquidationSettingDetail,
  fx: ForcedLiquidationCnyFx | null = null, now: number = Date.now()): ForcedLiquidationIneffectiveSummary {
  return { ineffectiveFunds: dto.status === 'ready' ? dto.ineffectiveFunds : null,
    ineffectiveCurrency: nativeCurrency(dto.currency), ineffectiveNotice: dto.notice, ineffectiveStatus: dto.status,
    ...detailCnySummary(dto, fx, now) };
}
/** Caller passes only enabled real stocks. CNY sums the exact displayed child cents, never
 * converts a native aggregate, fetches another quote, or sums partial/legacy evidence.
 */
export function aggregateForcedLiquidationStockSummaries(stocks: readonly ForcedLiquidationIneffectiveSummary[]): ForcedLiquidationIneffectiveSummary {
  if (stocks.length === 0) return {};
  return { ...aggregateNativeStockSummaries(stocks), ...aggregateCnyStockSummaries(stocks) };
}
function aggregateCnyStockSummaries(stocks: readonly ForcedLiquidationIneffectiveSummary[]): ForcedLiquidationIneffectiveSummary {
  const pending = (notice: string): ForcedLiquidationIneffectiveSummary => ({ ineffectiveFundsCny: null,
    ineffectiveCnyStatus: 'pending', ineffectiveCnyNotice: notice });
  let totalCents = 0;
  for (const stock of stocks) {
    if (stock.ineffectiveCnyStatus !== 'ready' || typeof stock.ineffectiveFundsCny !== 'number'
      || !Number.isFinite(stock.ineffectiveFundsCny)) {
      return pending('任一已开启真实持仓人民币展示证据缺失或待核验，不展示不完整汇总');
    }
    const cents = cnyDisplayCents(stock.ineffectiveFundsCny);
    if (cents === null || cents / 100 !== stock.ineffectiveFundsCny) {
      return pending('单笔人民币展示金额不是准确的安全整数分值，不重新取汇率或取整补齐');
    }
    totalCents += cents;
    if (!Number.isSafeInteger(totalCents)) return pending('人民币展示汇总整数分值溢出，等待核验');
  }
  const display = totalCents / 100;
  if (cnyDisplayCents(display) !== totalCents) return pending('人民币展示汇总不能准确显示到分，等待核验');
  return { ineffectiveFundsCny: display === 0 ? 0 : display, ineffectiveCnyStatus: 'ready',
    ineffectiveCnyNotice: '仅按全部已开启真实持仓的单笔人民币显示分值相加，不另取汇率、不含未开启持仓或部分汇总' };
}
/** Legacy native aggregation stays independent, including mixed-currency pending behavior. */
function aggregateNativeStockSummaries(stocks: readonly ForcedLiquidationIneffectiveSummary[]): ForcedLiquidationIneffectiveSummary {
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
      baselineStatus: s.baseline_status, holdingStartAt: s.holding_start_at, currency: s.currency,
      ...(s.activation_mode != null ? { activationMode: s.activation_mode, autoDropPercent: number(s.auto_drop_percent) ?? NaN,
        autoEntryPrice: number(s.auto_entry_price) ?? NaN, armedAt: s.armed_at ?? undefined,
        triggeredAt: s.triggered_at ?? undefined, triggerPrice: s.trigger_price == null ? undefined : number(s.trigger_price) ?? NaN,
        triggerQuoteAsOf: s.trigger_quote_as_of ?? undefined, triggerSource: s.trigger_source ?? undefined } : {}) };
    if (id(rule.version) && Number.isFinite(rule.thresholdPrice) && Number.isFinite(rule.downsidePercent)) {
      dto.rule = { version: rule.version, enabled: rule.enabled, threshold: rule.thresholdPrice, downsidePercent: rule.downsidePercent,
        startDate: rule.startDate ?? '', baselineSource: rule.baselineSource, baselineStatus: rule.baselineStatus,
        ...(rule.activationMode === 'auto_drop' ? { activationMode: rule.activationMode, autoDropPercent: rule.autoDropPercent,
          armedAt: rule.armedAt, triggeredAt: rule.triggeredAt, triggerPrice: rule.triggerPrice,
          triggerQuoteAsOf: rule.triggerQuoteAsOf, triggerSource: rule.triggerSource } : {}) };
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
  const automatic = rule.activationMode === 'auto_drop';
  if (automatic && (!isStockLotDownsideAutoRuleValid(rule) || rule.autoEntryPrice !== dto.initialValue)) {
    dto.notice = '自动预设或触发审计与真实买入价格不一致，等待核验'; return dto;
  }
  if (rule.startDate > today || !Number.isFinite(Date.parse(rule.effectiveAt))
    || (automatic ? Date.parse(rule.effectiveAt) > now
      : Date.parse(rule.effectiveAt) > Date.parse(latest.updatedAt)
        || stockLotDownsideEffectiveAt(rule.startDate) !== new Date(rule.effectiveAt).toISOString())) {
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
    remainingQuantity: dto.remainingQuantity, threshold: rule.thresholdPrice, downsidePercent: rule.downsidePercent,
    enabled: rule.enabled && !isStockLotDownsideAutoWaiting(rule) }));
  if (dto.effectiveFunds === null) { dto.notice = '分段收益金额溢出或证据无效'; return dto; }
  dto.status = 'ready'; dto.notice = '按已保存门槛、剩余比例和真实剩余股数，展示初始到最新的两段下跌金额；不是钱包余额或历史累计实得收益';
  if (automatic) dto.notice += !rule.enabled ? '；自动预设已关闭，当前全部正常计入'
    : isStockLotDownsideAutoWaiting(rule) ? '；已预设待触发，当前全部正常计入；页面读取不会触发，需后台扫描确认'
      : '；已按后台扫描确认的精确时刻启用，门槛以下按0%，涨回门槛以上恢复正常计入';
  if (rule.baselineSource !== 'owner_threshold') dto.notice += '；此笔旧规则的历史日结和客户收益仍沿用原算法，不自动转换';
  if (rule.baselineStatus === 'pending') dto.notice += '；历史收益核验状态仍保留，不影响此处按真实数据分段展示';
  return dto;
}

type Day = { date: string; hasBalance: boolean; balance: number | null; source: string | null;
  capitalChange: number | null; withdraw: number | null; hasFlow: boolean };
/** Shared configured-principal/first-real-balance cash-neutral replay; never an endpoint shortcut.
 * Dates are observable replay boundaries, not proof of account opening or config input time.
 */
export function buildForcedLiquidationOrdinaryDetail(input: ForcedLiquidationSettingDetailInput, name: string,
  configs: readonly any[], records: readonly any[], rules: readonly OrdinaryTagDownsideRule[], today: string): ForcedLiquidationSettingDetail {
  const dto = empty(input, 'ordinary'); dto.rawPnl = null; dto.countedPnl = null; dto.initialDate = null;
  const config = configs.length === 1 && number(configs[0]?.ledger_id) === 37 && configs[0]?.tag_name === name ? configs[0] : null;
  const configuredEmpty = config?.initial_amount == null
    || (typeof config.initial_amount === 'string' && config.initial_amount.trim() === '');
  if (config && !configuredEmpty) {
    dto.initialValue = amount(typeof config.initial_amount === 'string' ? config.initial_amount.trim() : config.initial_amount);
    dto.initialBasis = 'configured'; dto.initialSource = 'ledger_tag_config:initial_amount';
  }
  const scopedRules = rules.filter(r => r.ledgerId === 37 && r.categoryId === input.categoryId);
  const latestRule = scopedRules
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
  if (!latest) { dto.status = 'no_data'; dto.notice = '没有真实非transfer余额记录，不能用本金或transfer代替余额'; return dto; }
  // A nonempty mismatched/duplicate result is not absence: never wash ambiguous evidence
  // by filtering it into an apparently valid config or a first-balance fallback.
  if (configs.length > 0 && !config) {
    dto.notice = 'ledger_tag_config范围不匹配或配置重复，初始本金待核验；不回退首余额或使用任何成员本金'; return dto;
  }
  if (dto.initialBasis === 'configured') dto.initialDate = history[0].date;
  else {
    dto.initialBasis = 'first_balance'; dto.initialSource = first.source;
    dto.initialValue = first.balance; dto.initialDate = first.date;
  }
  const sourceNotice = dto.initialBasis === 'configured'
    ? '初始本金优先采用管理员配置ledger_tag_config.initial_amount；最早范围内历史日仅为计算观察起日，不代表真实开户日或管理员填写日；全部真实历史日及首日/前置资金流参与重放'
    : '管理员未填写初始本金，采用首个canonical真实余额作为参考本金与观察基线；此前和同日资金流已包含于首余额，不重复计入；基线日期不代表真实开户日';
  const pending = (notice: string) => { dto.notice = `${sourceNotice}；${notice}`; return dto; };
  if (dto.rule) Object.assign(dto, forcedLiquidationLevelPercents(dto.initialValue, dto.rule.threshold, dto.latestValue));
  if (dto.initialValue === null && dto.initialBasis === 'configured') {
    return pending('管理员明确输入的初始本金无效，不能回退首余额；不使用任何成员本金、account_balance或门槛推测基准');
  }
  if (first.balance === null) return pending('首个canonical真实余额无效，不能跳到以后有效余额建立基线');
  if (latest.balance === null) return pending('最后canonical非transfer余额无效，不回退旧有效余额');
  if (!latestRule) return pending('尚无保存规则，计入收益金额待设置核验');
  if (scopedRules.some(r => !id(r.version)) || !id(latestRule.userId) || typeof latestRule.enabled !== 'boolean'
    || !date(latestRule.startDate) || !Number.isFinite(latestRule.thresholdAmount) || latestRule.thresholdAmount <= 0
    || !Number.isFinite(latestRule.downsidePercent) || latestRule.downsidePercent < 0 || latestRule.downsidePercent > 100) {
    return pending('最新保存规则或版本证据无效，不自动回退旧版本');
  }
  if (latestRule.startDate > latest.date) return pending('最新保存规则在余额观察日尚未生效，不自动回退旧版本');
  // Even excluded baseline flows cannot turn damaged transfer evidence into a ready result.
  if (history.some(d => d.capitalChange === null || d.withdraw === null || (d.hasBalance && d.balance === null))) {
    return pending('真实历史资金流/余额无效或无法解密，不能跳过损坏证据');
  }
  let evidenceCapital = 0, evidenceWithdraw = 0, evidenceNet = 0;
  for (const d of history) {
    evidenceCapital += d.capitalChange!; evidenceWithdraw += d.withdraw!;
    evidenceNet += d.capitalChange! - d.withdraw!;
    if (![evidenceCapital, evidenceWithdraw, evidenceNet].every(Number.isFinite)) {
      return pending('真实历史资金流累计溢出，不能通过回退基线跳过损坏证据');
    }
  }
  const replayDays = dto.initialBasis === 'configured' ? history : history.filter(d => d.date >= first.date);
  const points: OrdinaryTagDownsidePoint[] = replayDays.map(d => ({ date: d.date,
    rawBalance: d.hasBalance ? d.balance : null,
    capitalChange: dto.initialBasis === 'first_balance' && d.date === first.date ? 0 : d.capitalChange,
    withdraw: dto.initialBasis === 'first_balance' && d.date === first.date ? 0 : d.withdraw }));
  const sum = (key: 'capitalChange' | 'withdraw') => {
    let total = 0;
    for (const p of points) { if (p[key] == null) return null; total += p[key]!; if (!Number.isFinite(total)) return null; }
    return total === 0 ? 0 : total;
  };
  dto.capitalChange = sum('capitalChange'); dto.withdraw = sum('withdraw');
  if (dto.capitalChange === null || dto.withdraw === null) return pending('完整观察范围加减本金/取回累计溢出，等待核验');
  const series = calculateOrdinaryTagDownsideSeries({ ledgerId: 37, categoryId: input.categoryId,
    initialAmount: dto.initialValue, entryDate: dto.initialDate, ratio: 100, points, rules });
  const final = series.at(-1);
  dto.rawPnl = final?.rawPnl ?? null; dto.countedPnl = final?.countedPnl ?? null;
  if (final?.status !== 'ready' || dto.rawPnl === null || dto.countedPnl === null) {
    return pending('完整观察范围资金流/余额或规则证据缺失、无效或溢出，计入收益等待核验');
  }
  const difference = dto.rawPnl - dto.countedPnl;
  if (!Number.isFinite(difference)) return pending('真实收益与计入收益差额溢出');
  dto.effectiveFunds = dto.countedPnl === 0 ? 0 : dto.countedPnl;
  dto.ineffectiveFunds = difference === 0 ? 0 : difference;
  dto.status = 'ready';
  dto.notice = `${sourceNotice}；参考本金100%口径按既有日级cash-before-performance资金流中性重放；启用日期前保留raw收益，不追溯门槛影响；有效为真实计入收益，无效为raw收益与计入收益之差（保留回升符号），不是钱包金额或实际成交`;
  if (points.some(p => p.capitalChange !== 0 || p.withdraw !== 0)) dto.notice += '；存在加减本金/取回，不是初始与最新两端简单相减';
  return dto;
}
