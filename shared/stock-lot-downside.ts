/** 欠保证金：逐笔、原币种、可回溯的派生计入口径；成交/quote/FX永不覆盖。 */
import { isStockMarketSession, previousStockMarketSession } from './stock-market-session';
export type StockLotDownsideRule = {
  ledgerId: number; categoryId: number; lotId: number; userId: number;
  version: number; enabled: boolean; thresholdPrice: number; downsidePercent: number;
  /** Absent activationMode retains the historical manual contract. */
  activationMode?: 'manual' | 'auto_drop'; autoDropPercent?: number; autoEntryPrice?: number;
  armedAt?: string; triggeredAt?: string; triggerPrice?: number; triggerQuoteAsOf?: string; triggerSource?: string;
  /** Optional only for legacy rows; new API versions always supply YYYY-MM-DD (Beijing). */
  startDate?: string;
  /** Business effective instant, distinct from the real server audit timestamp. */
  effectiveAt: string;
  baselineRawPrice: number; baselineCountedPrice: number;
  /** owner_threshold is an administrator's native-price basis, never a market quote. */
  baselineStatus?: 'ready' | 'pending'; baselineSource?: 'opening' | 'verified_close' | 'owner_threshold';
  holdingStartAt?: string;
  currency: 'CNY' | 'USD' | 'USDT';
  quoteAsOf?: string; createdAt?: string;
};
export type StockLotDownsideAudit = {
  lotId: number; version: number; rawPrice: number; countedPrice: number; effectiveAt: string;
};
export type StockLotDownsideMemberEpoch = {
  ledgerId: number; categoryId: number; lotId: number; participationId: number; userId: number;
  effectiveAt: string; rawPrice: number; countedPrice: number; entryCountedOffset: number;
  ruleVersion?: number;
};
export function validateStockLotDownsideStartDate(date: string): void {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('启用日期必须是有效的YYYY-MM-DD日期');
}
export function stockLotDownsideEffectiveAt(date: string): string {
  validateStockLotDownsideStartDate(date);
  return new Date(`${date}T00:00:00+08:00`).toISOString();
}
export function latestStockLotDownsideRule(rules: readonly StockLotDownsideRule[], lotId: number): StockLotDownsideRule | null {
  return rules.filter(r => r.lotId === lotId).sort((a, b) => b.version - a.version)[0] ?? null;
}
/** Latest saved revision wins within its applicable date range, including retroactive revisions. */
export function selectStockLotDownsideRule(rules: readonly StockLotDownsideRule[], lotId: number, asOf: string | Date): StockLotDownsideRule | null {
  const at = asOf instanceof Date ? asOf.getTime() : Date.parse(asOf);
  if (!Number.isFinite(at)) return null;
  return rules.filter(rule => rule.lotId === lotId && Date.parse(rule.effectiveAt) <= at
    && (!rule.holdingStartAt || Date.parse(rule.holdingStartAt) <= at))
    .sort((a, b) => b.version - a.version || Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt))[0] ?? null;
}
/** Reprice immutable entry proof after a revision; never inherit a stale counted epoch. */
export function stockLotDownsideMemberOffset(input: {
  lotId: number; participationId: number; assignedAt: string; startDate?: string;
  rules: readonly StockLotDownsideRule[]; epochs: readonly StockLotDownsideMemberEpoch[]; asOf: string | Date;
  entryRawPrice?: number | null; entryQuoteAsOf?: string;
  /** Already verified participation scope cutoff; distinct from an earlier carried market close. */
  participationAsOf?: string | Date;
}): number | null {
  const at = input.asOf instanceof Date ? input.asOf.getTime() : Date.parse(input.asOf);
  const entryAt = input.startDate ? stockLotDownsideMemberEntryAt(input.assignedAt, input.startDate) : input.assignedAt;
  if (!Number.isFinite(Date.parse(entryAt))) return input.rules.some(r => r.lotId === input.lotId && Date.parse(r.effectiveAt) <= at) ? null : 0;
  const entryRule = selectStockLotDownsideRule(input.rules, input.lotId, entryAt);
  let ownerBasisRule = entryRule;
  if (Date.parse(entryAt) > at) {
    if (entryRule?.baselineSource !== 'owner_threshold' || input.participationAsOf === undefined) return 0;
    const scopeAt = input.participationAsOf instanceof Date ? input.participationAsOf.getTime() : Date.parse(input.participationAsOf);
    if (!Number.isFinite(scopeAt) || Date.parse(entryAt) >= scopeAt) return null;
    // The older quote retains its own applicable rule; scope timing never activates a future rule.
    ownerBasisRule = selectStockLotDownsideRule(input.rules, input.lotId, input.asOf);
    if (ownerBasisRule?.baselineSource !== 'owner_threshold') return 0;
  }
  if (!entryRule) return 0;
  const epoch = input.epochs.filter(e => e.lotId === input.lotId && e.participationId === input.participationId
    && Date.parse(e.effectiveAt) <= at && Date.parse(e.effectiveAt) >= Date.parse(entryAt)
    && Date.parse(e.effectiveAt) - Date.parse(entryAt) <= 120_000)
    .sort((a, b) => (b.ruleVersion ?? 0) - (a.ruleVersion ?? 0))[0];
  if (entryRule.baselineSource === 'owner_threshold') {
    if (!Number.isFinite(Date.parse(input.assignedAt))) return null;
    const scopeAt = input.participationAsOf === undefined ? at
      : input.participationAsOf instanceof Date ? input.participationAsOf.getTime() : Date.parse(input.participationAsOf);
    if (!Number.isFinite(scopeAt) || Date.parse(entryAt) > scopeAt) return null;
    // A real participation price is a business entry basis, not external historical quote proof.
    // Only an exact entry epoch may substitute for a missing explicit participation price.
    const exactEpoch = input.epochs.filter(e => e.lotId === input.lotId && e.participationId === input.participationId
      && Date.parse(e.effectiveAt) === Date.parse(entryAt) && Date.parse(e.effectiveAt) <= scopeAt)
      .sort((a, b) => (b.ruleVersion ?? 0) - (a.ruleVersion ?? 0))[0];
    // Auto owner_threshold uses this same real-entry branch, without external entry proof.
    // An explicit damaged price (including null) must not be laundered through an epoch.
    const raw = input.entryRawPrice !== undefined ? input.entryRawPrice : exactEpoch?.rawPrice;
    if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
    const counted = countedStockLotPrice(raw, ownerBasisRule);
    return counted === null ? null : counted - raw;
  }
  // Legacy epoch evidence is sufficient for legacy rules; preserve its prospective contract.
  if (epoch && !entryRule.startDate && epoch.ruleVersion === undefined) return epoch.entryCountedOffset;
  const raw = epoch?.rawPrice ?? input.entryRawPrice;
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  if (!epoch && (!input.entryQuoteAsOf || Date.parse(input.entryQuoteAsOf) > Date.parse(entryAt))) return null;
  const counted = countedStockLotPrice(raw, entryRule);
  return counted === null ? null : counted - raw;
}
export function validateStockLotDownsideSettings(thresholdPrice: number, downsidePercent: number): void {
  if (!Number.isFinite(thresholdPrice) || thresholdPrice <= 0) throw new Error('价格门槛必须大于0');
  if (!Number.isFinite(downsidePercent) || downsidePercent < 0 || downsidePercent > 100) throw new Error('剩余保证金比例必须为0–100%');
}
/** DECIMAL(12,8) must preserve the owner's decline exactly; reject, never silently round. */
export function validateStockLotDownsideAutoDropPercent(dropPercent: number): void {
  if (!Number.isFinite(dropPercent) || dropPercent <= 0 || dropPercent >= 100) throw new Error('自动触发下跌比例必须大于0且小于100%');
  if (Number(dropPercent.toFixed(8)) !== dropPercent) throw new Error('自动触发下跌比例最多支持8位小数');
}
/** Native buy basis; round exactly as the DECIMAL(30,12) rule threshold is persisted. */
export function stockLotDownsideAutoThreshold(entryPrice: number, dropPercent: number): number {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) throw new Error('自动触发买入价必须大于0');
  validateStockLotDownsideAutoDropPercent(dropPercent);
  const threshold = Number((entryPrice * (1 - dropPercent / 100)).toFixed(12));
  if (!Number.isFinite(threshold) || threshold <= 0) throw new Error('自动触发价格门槛必须大于0');
  return threshold;
}
function stockLotDownsideBeijingDate(at: number): string {
  return new Date(at + 8 * 60 * 60_000).toISOString().slice(0, 10);
}
/** Stored auto configuration and first-confirmation audit must agree; never infer missing evidence. */
export function isStockLotDownsideAutoRuleValid(rule: StockLotDownsideRule | null | undefined): boolean {
  if (!rule || rule.activationMode !== 'auto_drop' || rule.baselineSource !== 'owner_threshold'
    || !isOwnerStockLotDownsideBasisValid(rule) || rule.downsidePercent !== 0) return false;
  let threshold: number;
  try { threshold = stockLotDownsideAutoThreshold(rule.autoEntryPrice!, rule.autoDropPercent!); }
  catch { return false; }
  const armed = typeof rule.armedAt === 'string' ? Date.parse(rule.armedAt) : NaN;
  const effective = typeof rule.effectiveAt === 'string' ? Date.parse(rule.effectiveAt) : NaN;
  if (rule.thresholdPrice !== threshold || !Number.isFinite(armed) || !Number.isFinite(effective)
    || rule.startDate !== stockLotDownsideBeijingDate(effective)
    || (rule.createdAt !== undefined && !Number.isFinite(Date.parse(rule.createdAt)))) return false;
  if (rule.triggeredAt === undefined) {
    return effective === armed && rule.triggerPrice === undefined
      && rule.triggerQuoteAsOf === undefined && rule.triggerSource === undefined;
  }
  const triggered = typeof rule.triggeredAt === 'string' ? Date.parse(rule.triggeredAt) : NaN;
  const observed = typeof rule.triggerQuoteAsOf === 'string' ? Date.parse(rule.triggerQuoteAsOf) : NaN;
  return Number.isFinite(triggered) && Number.isFinite(observed) && effective === triggered
    && armed <= observed && observed <= triggered
    && Number.isFinite(rule.triggerPrice) && rule.triggerPrice! > 0 && rule.triggerPrice! <= threshold
    && typeof rule.triggerSource === 'string' && rule.triggerSource.trim().length > 0;
}
/** Disabled presets are waiting too, but cannot be scanned until explicitly enabled. */
export function isStockLotDownsideAutoWaiting(rule: StockLotDownsideRule | null | undefined): boolean {
  return isStockLotDownsideAutoRuleValid(rule) && rule!.triggeredAt === undefined;
}
/** Stateless F(P): repeated threshold crossings never permanently freeze the lot. */
export function applyStockLotDownsidePrice(price: number | null, thresholdPrice: number, downsidePercent: number): number | null {
  if (price === null || !Number.isFinite(price) || price <= 0) return null;
  validateStockLotDownsideSettings(thresholdPrice, downsidePercent);
  return price >= thresholdPrice ? price : thresholdPrice + (price - thresholdPrice) * downsidePercent / 100;
}
/** Persisted manual data must already be valid; never repair a damaged basis with K or a quote. */
function isOwnerStockLotDownsideBasisValid(rule: StockLotDownsideRule): boolean {
  return rule.baselineStatus === 'ready' && typeof rule.enabled === 'boolean'
    && Number.isFinite(rule.thresholdPrice) && rule.thresholdPrice > 0
    && Number.isFinite(rule.downsidePercent) && rule.downsidePercent >= 0 && rule.downsidePercent <= 100
    && Number.isFinite(rule.baselineRawPrice) && rule.baselineRawPrice > 0
    && Number.isFinite(rule.baselineCountedPrice) && rule.baselineCountedPrice > 0
    && rule.baselineRawPrice === rule.thresholdPrice && rule.baselineCountedPrice === rule.thresholdPrice;
}
/** Missing baseline proof stays pending, never zero or today's quote. */
export function countedStockLotPrice(price: number | null, rule: StockLotDownsideRule | null): number | null {
  if (price === null || !Number.isFinite(price) || price <= 0) return null;
  if (!rule) return price;
  if (rule.activationMode === 'auto_drop') {
    if (!isStockLotDownsideAutoRuleValid(rule)) return null;
    return !rule.enabled || rule.triggeredAt === undefined ? price : Math.max(price, rule.thresholdPrice);
  }
  if (rule.baselineSource === 'owner_threshold') {
    if (!isOwnerStockLotDownsideBasisValid(rule)) return null;
    return rule.enabled ? applyStockLotDownsidePrice(price, rule.thresholdPrice, rule.downsidePercent) : price;
  }
  if (rule.baselineStatus === 'pending' || !Number.isFinite(rule.baselineRawPrice) || rule.baselineRawPrice <= 0
    || !Number.isFinite(rule.baselineCountedPrice)) return null;
  const f = (p: number) => rule.enabled ? applyStockLotDownsidePrice(p, rule.thresholdPrice, rule.downsidePercent)! : p;
  return rule.baselineCountedPrice + f(price) - f(rule.baselineRawPrice);
}
export function valueStockLotDownside(input: {
  lotId: number; quantity: number; entryPrice: number; rawPrice: number | null;
  rules: readonly StockLotDownsideRule[]; asOf: string | Date; direction?: 'long' | 'counterparty';
  entryAt?: string | Date; entryCountedOffset?: number | null;
}) {
  const rule = selectStockLotDownsideRule(input.rules, input.lotId, input.asOf);
  const globalPrice = countedStockLotPrice(input.rawPrice, rule);
  const entryRule = input.entryAt && Date.parse(String(input.entryAt)) <= Date.parse(String(input.asOf))
    ? selectStockLotDownsideRule(input.rules, input.lotId, input.entryAt) : null;
  const entryCounted = entryRule ? countedStockLotPrice(input.entryPrice, entryRule) : input.entryPrice;
  const entryCarry = input.entryCountedOffset !== undefined ? input.entryCountedOffset
    : entryCounted === null ? null : entryCounted - input.entryPrice;
  const countedMarketPrice = globalPrice === null || entryCarry === null ? null : globalPrice - entryCarry;
  const countedMarketValue = countedMarketPrice === null ? null : countedMarketPrice * input.quantity;
  const pnl = countedMarketPrice === null ? null : (countedMarketPrice - input.entryPrice) * input.quantity * (input.direction === 'counterparty' ? -1 : 1);
  const countedFloatingPnl = pnl === 0 ? 0 : pnl;
  return { countedMarketPrice, countedMarketValue, countedFloatingPnl, countedPnl: countedFloatingPnl,
    downsideRule: rule, downsideRuleVersion: rule?.version ?? 0 };
}
export function stockLotDownsideMemberEntryAt(assignedAt: string, startDate: string): string {
  const start = `${startDate}T00:00:00+08:00`;
  return Date.parse(assignedAt) > Date.parse(start) ? assignedAt : start;
}
/** Close applicability, NOT quote capture/import time. NY offset is DST-safe. */
export function stockLotDownsidePriceAsOf(symbol: string, date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))) return '';
  if (/^CRYPTO:/.test(symbol)) return `${date}T15:05:00+08:00`;
  if (/^\d{6}\.(SH|SZ|BJ)$/.test(symbol)) return `${date}T15:00:00+08:00`;
  const probe = new Date(`${date}T20:00:00Z`);
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' }).format(probe));
  return `${date}T${String(36 - hour).padStart(2, '0')}:00:00Z`;
}
export function isStockLotDownsideBaselineQuoteValid(input: {
  price: number; quoteAsOf: string; priceDate: string; now: Date; kind: 'live' | 'close' | 'reference';
  marketOpen?: boolean; expectedCloseDate?: string | null;
}): boolean {
  const age = input.now.getTime() - Date.parse(input.quoteAsOf);
  if (!Number.isFinite(input.price) || input.price <= 0 || !Number.isFinite(age) || age < -5_000 || input.kind === 'reference') return false;
  if (input.kind === 'live') return age <= 120_000;
  return !input.marketOpen && !!input.expectedCloseDate && input.priceDate === input.expectedCloseDate
    && age <= 14 * 24 * 60 * 60_000;
}
/** Latest saved version is the CAS anchor; beforeStartRule is the carry anchor, NOT necessarily that version. */
export function createStockLotDownsideVersion(input: {
  ledgerId: number; categoryId: number; lotId: number; userId: number; currency: StockLotDownsideRule['currency'];
  enabled: boolean; thresholdPrice?: number; downsidePercent?: number; expectedVersion: number;
  activationMode?: StockLotDownsideRule['activationMode']; autoDropPercent?: number; autoEntryPrice?: number;
  armedAt?: string; triggeredAt?: string; triggerPrice?: number; triggerQuoteAsOf?: string; triggerSource?: string;
  currentRawPrice: number; effectiveAt: string; quoteAsOf?: string;
  startDate?: string; createdAt?: string; baselineStatus?: 'ready' | 'pending';
  baselineSource?: StockLotDownsideRule['baselineSource']; holdingStartAt?: string;
  beforeStartRule?: StockLotDownsideRule | null;
}, previous: StockLotDownsideRule | null): StockLotDownsideRule {
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || input.expectedVersion !== (previous?.version ?? 0)) throw new Error('欠保证金版本冲突，请刷新后重试');
  if (typeof input.enabled !== 'boolean') throw new Error('欠保证金开关必须是布尔值');
  if (input.activationMode !== undefined && input.activationMode !== 'manual' && input.activationMode !== 'auto_drop') throw new Error('欠保证金启用模式无效');
  if (input.activationMode === 'auto_drop') {
    const thresholdPrice = stockLotDownsideAutoThreshold(input.autoEntryPrice!, input.autoDropPercent!);
    if ((input.thresholdPrice !== undefined && input.thresholdPrice !== thresholdPrice)
      || (input.downsidePercent !== undefined && input.downsidePercent !== 0)) throw new Error('自动触发门槛和剩余保证金比例必须由买入价及下跌比例计算');
    // startDate is only a Beijing label: never turn save/scan confirmation into midnight.
    const effective = Date.parse(input.triggeredAt ?? input.effectiveAt);
    const armed = input.triggeredAt === undefined ? Date.parse(input.effectiveAt)
      : Date.parse(input.armedAt ?? (previous?.activationMode === 'auto_drop' ? previous.armedAt ?? '' : ''));
    const created = Date.parse(input.createdAt ?? input.triggeredAt ?? input.effectiveAt);
    if (!Number.isFinite(effective) || !Number.isFinite(armed) || !Number.isFinite(created)
      || (input.armedAt !== undefined && Date.parse(input.armedAt) !== armed)) throw new Error('自动触发确认时间或审计无效');
    // A future manual business date is not a future server audit: an owner may replace that
    // planned mode with a new preset waiting from now. Actual auto confirmations remain monotonic.
    if (previous?.activationMode === 'auto_drop' && effective < Date.parse(previous.effectiveAt)) throw new Error('服务器生效时间不能早于上一版本');
    if (input.triggeredAt !== undefined && previous?.activationMode === 'auto_drop'
      && armed !== Date.parse(previous.armedAt ?? '')) throw new Error('自动触发必须保留原预设时间');
    const rule: StockLotDownsideRule = {
      ledgerId: input.ledgerId, categoryId: input.categoryId, lotId: input.lotId, userId: input.userId,
      currency: input.currency, version: input.expectedVersion + 1, enabled: input.enabled,
      activationMode: 'auto_drop', autoDropPercent: input.autoDropPercent, autoEntryPrice: input.autoEntryPrice,
      thresholdPrice, downsidePercent: 0, effectiveAt: new Date(effective).toISOString(),
      startDate: stockLotDownsideBeijingDate(effective), armedAt: new Date(armed).toISOString(),
      baselineRawPrice: thresholdPrice, baselineCountedPrice: thresholdPrice,
      baselineStatus: 'ready', baselineSource: 'owner_threshold', holdingStartAt: input.holdingStartAt,
      createdAt: new Date(created).toISOString(),
      ...(input.triggeredAt === undefined ? {} : { triggeredAt: new Date(effective).toISOString(),
        triggerPrice: input.triggerPrice, triggerQuoteAsOf: input.triggerQuoteAsOf, triggerSource: input.triggerSource }),
    };
    if ((input.startDate !== undefined && input.startDate !== rule.startDate)
      || (input.triggeredAt === undefined && (input.triggerPrice !== undefined || input.triggerQuoteAsOf !== undefined || input.triggerSource !== undefined))
      || !isStockLotDownsideAutoRuleValid(rule)) throw new Error('自动触发配置或首次触发审计无效');
    return rule;
  }
  if (input.startDate !== undefined) validateStockLotDownsideStartDate(input.startDate);
  const effectiveAt = input.startDate === undefined ? input.effectiveAt : stockLotDownsideEffectiveAt(input.startDate);
  const createdAt = input.createdAt ?? (input.startDate ? new Date().toISOString() : input.effectiveAt);
  const ownerThreshold = input.baselineSource === 'owner_threshold';
  if (!Number.isFinite(Date.parse(effectiveAt)) || !Number.isFinite(Date.parse(createdAt))
    || (!ownerThreshold && input.baselineStatus !== 'pending' && (!Number.isFinite(input.currentRawPrice) || input.currentRawPrice <= 0))) throw new Error('缺少可核验历史基准，请选择更晚的启用日期');
  // Legacy direct helper callers retain their old server-time monotonic safety.
  if (!input.startDate && previous && Date.parse(effectiveAt) < Date.parse(previous.effectiveAt)) throw new Error('服务器生效时间不能早于上一版本');
  const thresholdPrice = input.thresholdPrice ?? previous?.thresholdPrice ?? (ownerThreshold ? NaN : input.currentRawPrice);
  const downsidePercent = input.downsidePercent ?? previous?.downsidePercent ?? 100;
  validateStockLotDownsideSettings(thresholdPrice, downsidePercent);
  if (ownerThreshold) {
    return { ledgerId: input.ledgerId, categoryId: input.categoryId, lotId: input.lotId, userId: input.userId,
      currency: input.currency, version: input.expectedVersion + 1, enabled: input.enabled, thresholdPrice, downsidePercent,
      ...(input.startDate ? { startDate: input.startDate } : {}), effectiveAt, baselineRawPrice: thresholdPrice,
      baselineCountedPrice: thresholdPrice, baselineStatus: 'ready', baselineSource: 'owner_threshold',
      quoteAsOf: undefined, createdAt, holdingStartAt: input.holdingStartAt };
  }
  const carryRule = input.beforeStartRule !== undefined ? input.beforeStartRule
    : previous && Date.parse(previous.effectiveAt) < Date.parse(effectiveAt) ? previous : null;
  const baselineCountedPrice = input.baselineStatus === 'pending' ? NaN : countedStockLotPrice(input.currentRawPrice, carryRule);
  if (baselineCountedPrice === null) throw new Error('缺少可核验历史基准，请选择更晚的启用日期');
  return { ledgerId: input.ledgerId, categoryId: input.categoryId, lotId: input.lotId, userId: input.userId,
    currency: input.currency, version: input.expectedVersion + 1, enabled: input.enabled, thresholdPrice, downsidePercent,
    ...(input.startDate ? { startDate: input.startDate } : {}), effectiveAt, baselineRawPrice: input.currentRawPrice,
    baselineCountedPrice, quoteAsOf: input.quoteAsOf, createdAt,
    baselineStatus: input.baselineStatus ?? 'ready', baselineSource: input.baselineSource, holdingStartAt: input.holdingStartAt };
}
export type StockLotDownsideHistoricalQuote = {
  symbol: string; price: number; priceDate: string; quoteAsOf: string; verified: boolean;
};
export type StockLotDownsideHistoricalLot = { lotId: number; symbol: string; openedAt: string; unitCost: number };
/** Latest completed immutable close before a business instant; open-session gaps fail closed. */
export function stockLotDownsideHistoricalEntryProof(symbol: string, at: string, quotes: readonly StockLotDownsideHistoricalQuote[], now: Date): StockLotDownsideHistoricalQuote | null {
  const instant = Date.parse(at);
  if (!Number.isFinite(instant) || instant > now.getTime()) return null;
  const date = new Date(instant + 8 * 60 * 60_000).toISOString().slice(0, 10);
  const expected = /^CRYPTO:/.test(symbol)
    ? (Date.parse(stockLotDownsidePriceAsOf(symbol, date)) < instant ? date : new Date(Date.parse(`${date}T00:00:00Z`) - 86400_000).toISOString().slice(0, 10))
    : stockLotDownsideBaselineMarketContext(symbol, new Date(instant)).expectedCloseDate;
  const proofs = quotes.filter(q => q.symbol === symbol && q.verified && q.priceDate === expected
    && Number.isFinite(q.price) && q.price > 0 && Number.isFinite(Date.parse(q.quoteAsOf))
    && Date.parse(q.quoteAsOf) <= now.getTime() && Date.parse(stockLotDownsidePriceAsOf(symbol, q.priceDate)) < instant);
  if (!proofs.length || proofs.some(q => q.price !== proofs[0].price)) return null;
  return proofs.sort((a, b) => Date.parse(b.quoteAsOf) - Date.parse(a.quoteAsOf))[0];
}
/** SELECT-only caller supplies verified raw history. Returns new objects; raw rules/quotes never change. */
export function resolveStockLotDownsideHistoricalRules(input: {
  rules: readonly StockLotDownsideRule[]; lots: readonly StockLotDownsideHistoricalLot[];
  quotes: readonly StockLotDownsideHistoricalQuote[]; now: Date;
}): StockLotDownsideRule[] {
  const resolved: StockLotDownsideRule[] = [];
  for (const original of [...input.rules].sort((a, b) => a.version - b.version)) {
    if (original.baselineSource === 'owner_threshold' || original.activationMode === 'auto_drop') {
      const lot = input.lots.find(l => l.lotId === original.lotId);
      const opened = lot ? Date.parse(lot.openedAt) : NaN;
      const validHolding = !!lot && Number.isFinite(opened) && opened <= input.now.getTime();
      const validBasis = original.activationMode === 'auto_drop' ? isStockLotDownsideAutoRuleValid(original)
        && lot?.unitCost === original.autoEntryPrice && opened <= Date.parse(original.armedAt!)
        : isOwnerStockLotDownsideBasisValid(original);
      // Future effective dates need no market proof. Actual holding evidence still gates applicability.
      resolved.push({ ...original, holdingStartAt: validHolding ? lot!.openedAt : undefined,
        baselineStatus: validHolding && Number.isFinite(Date.parse(original.effectiveAt))
          && validBasis ? 'ready' : 'pending' });
      continue;
    }
    if (!original.startDate) { resolved.push({ ...original }); continue; }
    const rule = { ...original, baselineRawPrice: NaN, baselineCountedPrice: NaN, baselineStatus: 'pending' as const } as StockLotDownsideRule;
    const lot = input.lots.find(l => l.lotId === rule.lotId);
    const start = Date.parse(rule.effectiveAt), opened = lot ? Date.parse(lot.openedAt) : NaN;
    if (!lot || !Number.isFinite(opened) || start > input.now.getTime() || opened > input.now.getTime()) { resolved.push(rule); continue; }
    const openingBaseline = opened >= start;
    const proof = openingBaseline ? null : stockLotDownsideHistoricalEntryProof(lot.symbol, rule.effectiveAt, input.quotes, input.now);
    const raw = openingBaseline ? lot.unitCost : proof?.price;
    if (raw == null || !Number.isFinite(raw) || raw <= 0) { resolved.push(rule); continue; }
    const previous = selectStockLotDownsideRule(resolved, rule.lotId, new Date(start - 1));
    const counted = countedStockLotPrice(raw, previous);
    resolved.push({ ...rule, holdingStartAt: lot.openedAt, baselineRawPrice: raw,
      baselineCountedPrice: counted ?? NaN, baselineStatus: counted === null ? 'pending' : 'ready',
      baselineSource: openingBaseline ? 'opening' : 'verified_close', quoteAsOf: openingBaseline ? lot.openedAt : proof!.quoteAsOf });
  }
  return resolved;
}
export function stockLotDownsideBaselineMarketContext(symbol: string, now: Date): { marketOpen: boolean; expectedCloseDate: string | null } {
  const market = /^\d{6}\.(SH|SZ|BJ)$/.test(symbol) ? 'A' : 'US';
  const zone = market === 'A' ? 'Asia/Shanghai' : 'America/New_York';
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`, time = `${get('hour')}:${get('minute')}`;
  const session = isStockMarketSession(date, market);
  const marketOpen = session && (market === 'A' ? time >= '09:30' && time < '15:00' : time >= '09:30' && time < '16:00');
  const expectedCloseDate = session && time >= (market === 'A' ? '15:00' : '16:00') ? date : previousStockMarketSession(date, market);
  return { marketOpen, expectedCloseDate };
}
