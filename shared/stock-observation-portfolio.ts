/**
 * 观察账户只用于展示对赌回报，不是实际参与、分红、押金或钱包资产。
 * 禁止将这里的 holdings / summary 传入真实参与或结算函数。
 */
export const MAX_STOCK_OBSERVATION_QUANTITY = 1_000_000_000;
export type StockObservationCurrency = 'CNY' | 'USD';
export type StockObservationQuoteSource = 'intraday' | 'close' | 'reference' | 'sale' | 'unavailable';

export type StockLotObservation = {
  lotId: number;
  userId: number;
  enabled: boolean;
  quantity: number;
  entryPrice: number;
  startDate: string;
  /** 仅此股观察账户；空/未配置继续实时估值。 */
  pauseDate?: string | null;
  assignedBy: number;
  createdAt: string;
  updatedAt: string;
  symbol: string;
  stockName: string;
  initialQuantity: number;
  lotCurrentQuantity: number;
  soldQuantity: number;
  /** 实际批次卖出价值，不含手续费；缺失实际卖价时为 null。 */
  soldValue: number | null;
  soldAt: string | null;
  soldDate: string | null;
};

/** 暂停观察必须传截至暂停日的售出汇总，不能使用该批次未来的全量售出。 */
export type StockObservationValuation = Pick<StockLotObservation,
  'initialQuantity' | 'lotCurrentQuantity' | 'soldQuantity' | 'soldValue' | 'soldAt' | 'soldDate'>;

export type StockObservationQuote = {
  price: number;
  updatedAt: string | null;
  priceDate: string | null;
  source: StockObservationQuoteSource;
};

export type StockObservationHolding = {
  lotId: number;
  symbol: string;
  stockName: string;
  currency: StockObservationCurrency;
  /** 管理员填写的原始观察股数，不是实际获配股数。 */
  quantity: number;
  /** 仅观察口径：原始股数 × 批次当前剩余/初始数量。 */
  currentQuantity: number;
  closedQuantity: number;
  entryPrice: number;
  startDate: string;
  pauseDate: string | null;
  marketPrice: number | null;
  marketQuoteUpdatedAt: string | null;
  marketQuoteDate: string | null;
  marketQuoteSource: StockObservationQuoteSource;
  /** 全平仓时 marketPrice 为实际加权卖价；部分平仓的冻结价另列于此。 */
  frozenSalePrice: number | null;
  costValue: number;
  /** 剩余观察股数的市值 + 已平观察股数的冻结卖出价值。 */
  marketValue: number | null;
  floatingPnl: number | null;
  /** 仅展示用，不写 participation_closures，不是可提现/可分红的已实现收益。 */
  closedPnl: number | null;
  totalPnl: number | null;
  status: 'active' | 'partial_closed' | 'closed' | 'pending' | 'paused';
};

export type StockObservationCurrencySummary = {
  currency: StockObservationCurrency;
  costValue: number | null;
  marketValue: number | null;
  floatingPnl: number | null;
  closedPnl: number | null;
  totalPnl: number | null;
  holdingCount: number;
  activeHoldingCount: number;
  closedHoldingCount: number;
  scheduledHoldingCount: number;
  unpricedHoldingCount: number;
};

export type StockObservationSummary = Omit<StockObservationCurrencySummary, 'currency'> & {
  /** 单币种返回该币种；空或混币返回 null。混币所有顶层金额为 null。 */
  reportingCurrency: StockObservationCurrency | null;
  isMixedCurrency: boolean;
  currencySummaries: StockObservationCurrencySummary[];
};

export function validateStockObservationQuantity(quantity: number): number {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0 || quantity > MAX_STOCK_OBSERVATION_QUANTITY) {
    throw new Error('观察股数必须是 0 到 10亿之间的有限数字');
  }
  return quantity;
}

/**
 * 真实份额切换观察时只释放未结算余量，不是卖出，不生成收益或资金操作。
 * allocated - remaining 是已真实卖出部分；调用方必须保留 participation ID 和 closures。
 * remaining 已为0时结果不变，重复开启观察幂等；关闭观察不调用本转换。
 */
export function releaseStockParticipationForObservation(participation: Readonly<{
  allocatedQuantity: number;
  remainingQuantity: number;
}>): { allocatedQuantity: number; remainingQuantity: 0; releasedQuantity: number } {
  const { allocatedQuantity, remainingQuantity } = participation;
  if (!Number.isFinite(allocatedQuantity) || !Number.isFinite(remainingQuantity)
    || remainingQuantity < 0 || allocatedQuantity < remainingQuantity) {
    throw new Error('真实参与股数异常，拒绝转换观察');
  }
  return {
    allocatedQuantity: Number((allocatedQuantity - remainingQuantity).toFixed(8)),
    remainingQuantity: 0,
    releasedQuantity: remainingQuantity,
  };
}

export function validateStockObservationEntryPrice(price: number): number {
  // DECIMAL(20,8) 最多12位整数；严格避免数据库溢出或把非有限数存入观察表。
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price >= 1e12) {
    throw new Error('观察入场价必须是大于0且小于1万亿的有限数字');
  }
  return price;
}

export function validateStockObservationStartDate(date: string): string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1000-01-01'
    || Number.isNaN(Date.parse(`${date}T00:00:00.000Z`))
    || new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date) {
    throw new Error('观察开始日期必须是有效的 YYYY-MM-DD 日期');
  }
  return date;
}

/** undefined/空串均表示未暂停；保存时undefined由调用方保留原配置。 */
export function validateStockObservationPauseDate(date: string | undefined, startDate: string): string | null {
  if (date === undefined || date === '') return null;
  try {
    validateStockObservationStartDate(date);
  } catch {
    throw new Error('观察暂停日期必须是有效的 YYYY-MM-DD 日期');
  }
  if (date < startDate) throw new Error('观察暂停日期不能早于观察开始日期');
  return date;
}

function nullableFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * 全实配仍可以观察：本函数不接收真实参与余额/额度，也不修改任何输入。
 * 观察股数按整个批次售出比例拆分（不按个人真实参与的FIFO结算拆分）。
 * 起始日期仅决定未来配置尚未生效；不反推历史入场价或重写真实历史快照。
 * pauseDate已到时，调用方须提供as-of售出汇总与历史quote（缺报价传null）。
 */
export function buildStockObservationHolding(
  observation: Readonly<StockLotObservation>,
  quote: Readonly<StockObservationQuote> | null,
  today: string,
): StockObservationHolding | null {
  if (!observation.enabled || observation.quantity <= 0) return null;
  validateStockObservationQuantity(observation.quantity);
  validateStockObservationEntryPrice(observation.entryPrice);
  const initial = nullableFinite(observation.initialQuantity);
  const current = nullableFinite(observation.lotCurrentQuantity);
  if (initial === null || initial <= 0 || current === null) return null;
  const scheduled = observation.startDate > today;
  const pauseDate = observation.pauseDate || null;
  const paused = !scheduled && pauseDate !== null && pauseDate <= today;
  const ratio = Math.min(1, Math.max(0, current / initial));
  const currentQuantity = scheduled ? 0 : observation.quantity * ratio;
  const closedQuantity = scheduled ? 0 : observation.quantity - currentQuantity;
  const fullyClosed = !scheduled && ratio === 0;
  const soldQuantity = nullableFinite(observation.soldQuantity);
  const soldValue = nullableFinite(observation.soldValue);
  const frozenSalePrice = soldQuantity !== null && soldQuantity > 0 && soldValue !== null && soldValue >= 0
    ? nullableFinite(soldValue / soldQuantity) : null;
  // 日期/捕获时间都不允许跨过暂停日；未知日期也不能冒充冻结报价。
  const historicalQuote = !paused || (quote?.priceDate && quote.priceDate <= pauseDate!
    && (!quote.updatedAt || (!Number.isNaN(Date.parse(quote.updatedAt))
      && Date.parse(quote.updatedAt) < Date.parse(`${pauseDate}T00:00:00+08:00`) + 86400000)));
  const valuationQuote = historicalQuote ? quote : null;
  const quotePrice = nullableFinite(valuationQuote?.price);
  const livePrice = quotePrice !== null && quotePrice > 0 ? quotePrice : null;
  // 全平仓绝不回退实时价。实际卖价缺失时保留 null，仍是 closed 状态。
  const marketPrice = fullyClosed ? frozenSalePrice : livePrice;
  const costValue = scheduled ? 0 : observation.quantity * observation.entryPrice;
  const floatingPnl = currentQuantity === 0 ? 0
    : marketPrice === null ? null : nullableFinite((observation.entryPrice - marketPrice) * currentQuantity);
  const closedPnl = closedQuantity === 0 ? 0
    : frozenSalePrice === null ? null : nullableFinite((observation.entryPrice - frozenSalePrice) * closedQuantity);
  const totalPnl = floatingPnl === null || closedPnl === null ? null : nullableFinite(floatingPnl + closedPnl);
  const marketValue = scheduled ? 0 : totalPnl === null ? null : nullableFinite(costValue - totalPnl);
  return {
    lotId: observation.lotId,
    symbol: observation.symbol,
    stockName: observation.stockName,
    currency: /^\d{6}\.(SH|SZ|BJ)$/.test(observation.symbol) ? 'CNY' : 'USD',
    quantity: observation.quantity,
    currentQuantity,
    closedQuantity,
    entryPrice: observation.entryPrice,
    startDate: observation.startDate,
    pauseDate,
    marketPrice,
    marketQuoteUpdatedAt: fullyClosed ? observation.soldAt : valuationQuote?.updatedAt ?? null,
    marketQuoteDate: fullyClosed ? observation.soldDate : valuationQuote?.priceDate ?? null,
    marketQuoteSource: fullyClosed ? (frozenSalePrice === null ? 'unavailable' : 'sale')
      : (livePrice === null ? 'unavailable' : valuationQuote?.source ?? 'unavailable'),
    frozenSalePrice,
    costValue,
    marketValue,
    floatingPnl,
    closedPnl,
    totalPnl,
    status: scheduled ? 'pending' : fullyClosed ? 'closed' : paused ? 'paused' : ratio < 1 ? 'partial_closed' : 'active',
  };
}

/** 只汇总观察行；同币种缺报价则该项金额返回 null，不把未知当作零。 */
export function summarizeStockObservationHoldings(holdings: readonly StockObservationHolding[]): StockObservationSummary {
  // 未开始观察仍可展示配置，但不影响币种、金额、未知报价或有效观察行计数。
  const effectiveHoldings = holdings.filter((row) => row.status !== 'pending');
  const counts = (rows: readonly StockObservationHolding[]) => ({
    holdingCount: rows.length,
    activeHoldingCount: rows.filter((row) => row.currentQuantity > 0).length,
    closedHoldingCount: rows.filter((row) => row.status === 'closed').length,
    scheduledHoldingCount: rows.filter((row) => row.status === 'pending').length,
    unpricedHoldingCount: rows.filter((row) => row.totalPnl === null || row.marketValue === null).length,
  });
  const sum = (rows: readonly StockObservationHolding[], key: 'costValue' | 'marketValue' | 'floatingPnl' | 'closedPnl' | 'totalPnl') => {
    if (rows.some((row) => nullableFinite(row[key]) === null)) return null;
    return nullableFinite(rows.reduce((total, row) => total + (row[key] ?? 0), 0));
  };
  const currencySummaries = (['CNY', 'USD'] as const).flatMap((currency) => {
    const rows = effectiveHoldings.filter((row) => row.currency === currency);
    return rows.length === 0 ? [] : [{
      currency,
      costValue: sum(rows, 'costValue'), marketValue: sum(rows, 'marketValue'),
      floatingPnl: sum(rows, 'floatingPnl'), closedPnl: sum(rows, 'closedPnl'), totalPnl: sum(rows, 'totalPnl'),
      ...counts(rows),
    }];
  });
  const isMixedCurrency = currencySummaries.length > 1;
  return {
    reportingCurrency: currencySummaries.length === 1 ? currencySummaries[0].currency : null,
    isMixedCurrency,
    currencySummaries,
    costValue: isMixedCurrency ? null : sum(effectiveHoldings, 'costValue'),
    marketValue: isMixedCurrency ? null : sum(effectiveHoldings, 'marketValue'),
    floatingPnl: isMixedCurrency ? null : sum(effectiveHoldings, 'floatingPnl'),
    closedPnl: isMixedCurrency ? null : sum(effectiveHoldings, 'closedPnl'),
    totalPnl: isMixedCurrency ? null : sum(effectiveHoldings, 'totalPnl'),
    ...counts(effectiveHoldings),
    scheduledHoldingCount: holdings.filter((row) => row.status === 'pending').length,
  };
}
