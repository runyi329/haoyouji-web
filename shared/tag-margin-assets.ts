export type TagMarginCurrencyRecord = {
  assetType: 'currency';
  coin: string;
  amount: number;
  label: string;
  date: string;
};

export type TagMarginStockRecord = {
  assetType: 'stock';
  symbol: string;
  code: string;
  name: string;
  quantity: number;
  /** Explicitly entered purchase price only; never inferred from a quote. */
  purchasePrice?: number;
  /** Sale registrations do not change the original quantity or execute a trade. */
  sales?: Array<{ quantity: number; price: number }>;
  /** Selected quote retained as a temporary fallback before a 15:05 close snapshot exists. */
  referencePrice: number;
  priceDate: string;
  priceUpdatedAt: string;
  label: string;
  date: string;
};

export type TagMarginRecord = TagMarginCurrencyRecord | TagMarginStockRecord;

export type TagMarginStockQuote = {
  price?: number | string;
  currency?: string;
  priceDate?: string;
  updatedAt?: string;
};

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function numeric(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 将服务端快照的 ISO 时间统一显示为北京时间中文月日与时分。 */
export function formatTagMarginStockQuoteUpdatedAt(value: unknown): string {
  const raw = text(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [, , month, day] = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
    return month && day ? `${Number(month)}月${Number(day)}日` : '';
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  // 兼容旧服务的 Z 结尾时间与新服务明确的 +08:00 时间，均统一转为北京时间显示。
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  const month = part('month');
  const day = part('day');
  const hour = part('hour');
  const minute = part('minute');
  return month && day && hour && minute ? `${Number(month)}月${Number(day)}日 ${hour}:${minute}` : '';
}

function normalizeSymbol(value: unknown): string {
  return text(value).toUpperCase();
}

function normalizeCoin(value: unknown): string {
  return text(value).toUpperCase() || 'CNY';
}

/** 保证金展示将 USDT 简写为小写 u；底层币种代码与计算口径保持不变。 */
export function formatTagMarginCoinLabel(value: unknown): string {
  const raw = text(value);
  return raw.toUpperCase() === 'USDT' ? 'u' : raw;
}

function normalizeStockRecord(value: unknown): TagMarginStockRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const symbol = normalizeSymbol(record.symbol);
  const quantity = numeric(record.quantity ?? record.amount);
  const hasNewFields = Object.prototype.hasOwnProperty.call(record, 'purchasePrice')
    || Object.prototype.hasOwnProperty.call(record, 'sales');
  // Keep rows with new fields even when malformed, so they remain visible for correction.
  if (!hasNewFields && (!/^\d{6}\.(?:SH|SZ|BJ)$/.test(symbol) || quantity === null || quantity === 0)) return null;
  const code = text(record.code) || symbol.slice(0, 6);
  const referencePrice = numeric(record.referencePrice ?? record.latestPrice ?? record.initialPrice) ?? 0;
  const normalized: TagMarginStockRecord = {
    assetType: 'stock',
    symbol,
    code,
    name: text(record.name),
    quantity: quantity ?? NaN,
    referencePrice: referencePrice > 0 ? referencePrice : 0,
    priceDate: text(record.priceDate ?? record.latestPriceDate ?? record.initialPriceDate),
    priceUpdatedAt: text(record.priceUpdatedAt ?? record.latestPriceUpdatedAt),
    label: text(record.label ?? record.note),
    date: text(record.date ?? record.createdAt),
  };
  // Do not coerce, discard, or repair invalid historical additions: valuation fails closed.
  if (Object.prototype.hasOwnProperty.call(record, 'purchasePrice')) normalized.purchasePrice = record.purchasePrice as number;
  if (Object.prototype.hasOwnProperty.call(record, 'sales')) normalized.sales = record.sales as TagMarginStockRecord['sales'];
  return normalized;
}

function normalizeCurrencyRecord(value: unknown): TagMarginCurrencyRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const amount = numeric(record.amount);
  if (amount === null) return null;
  return {
    assetType: 'currency',
    coin: normalizeCoin(record.coin),
    amount,
    label: text(record.label ?? record.note),
    date: text(record.date ?? record.createdAt),
  };
}

/**
 * Parses the current array format and the legacy `{ coin: amount }` format.
 * Bad rows are ignored so one historical malformed record cannot hide valid collateral.
 * Stock rows carrying invalid new fields are retained for correction, not treated as unsold.
 */
export function parseTagMarginRecords(raw: unknown): TagMarginRecord[] {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) {
    const records: TagMarginRecord[] = [];
    for (const entry of value) {
      if (entry && typeof entry === 'object' && (entry as Record<string, unknown>).assetType === 'stock') {
        const stock = normalizeStockRecord(entry);
        if (stock) records.push(stock);
        continue;
      }
      const currency = normalizeCurrencyRecord(entry);
      if (currency) records.push(currency);
    }
    return records;
  }
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([coin, amount]) => {
    const parsedAmount = numeric(amount);
    return parsedAmount === null ? [] : [{ assetType: 'currency' as const, coin: normalizeCoin(coin), amount: parsedAmount, label: '', date: '' }];
  });
}

export function getTagMarginStockRecords(records: TagMarginRecord[]): TagMarginStockRecord[] {
  return records.filter((record): record is TagMarginStockRecord => record.assetType === 'stock');
}

export function getTagMarginCurrencyRecords(records: TagMarginRecord[]): TagMarginCurrencyRecord[] {
  return records.filter((record): record is TagMarginCurrencyRecord => record.assetType === 'currency');
}

/** Strict validation of explicit additions; legacy unsold negative/fractional holdings are unchanged. */
export function getTagMarginStockSaleSummary(record: TagMarginStockRecord): {
  soldQuantity: number; saleValue: number; remainingQuantity: number; valid: boolean;
} {
  const invalid = () => ({ soldQuantity: 0, saleValue: 0, remainingQuantity: record.quantity, valid: false });
  const hasPurchasePrice = Object.prototype.hasOwnProperty.call(record, 'purchasePrice');
  const hasSales = Object.prototype.hasOwnProperty.call(record, 'sales');
  if ((hasPurchasePrice || hasSales) && (!/^\d{6}\.(?:SH|SZ|BJ)$/.test(record.symbol)
    || !Number.isFinite(record.quantity) || record.quantity === 0)) return invalid();
  if (hasPurchasePrice && (typeof record.purchasePrice !== 'number'
    || !Number.isFinite(record.purchasePrice) || record.purchasePrice <= 0)) return invalid();
  if (!hasSales) return { soldQuantity: 0, saleValue: 0, remainingQuantity: record.quantity, valid: true };
  if (!Array.isArray(record.sales) || record.quantity <= 0) return invalid();
  let soldQuantity = 0;
  let saleValue = 0;
  for (const sale of record.sales) {
    if (!sale || typeof sale !== 'object' || Array.isArray(sale)
      || !Number.isSafeInteger(sale.quantity) || sale.quantity <= 0
      || typeof sale.price !== 'number' || !Number.isFinite(sale.price) || sale.price <= 0) return invalid();
    soldQuantity += sale.quantity;
    saleValue += sale.quantity * sale.price;
    // Safe integer totals prevent floating-point rounding from permitting an oversale.
    if (!Number.isSafeInteger(soldQuantity) || soldQuantity > record.quantity || !Number.isFinite(saleValue)) return invalid();
  }
  return { soldQuantity, saleValue, remainingQuantity: record.quantity - soldQuantity, valid: true };
}

export function getTagMarginStockSymbols(records: TagMarginRecord[]): string[] {
  return Array.from(new Set(getTagMarginStockRecords(records).filter((record) => {
    const summary = getTagMarginStockSaleSummary(record);
    return summary.valid && (!Object.prototype.hasOwnProperty.call(record, 'sales') || summary.remainingQuantity !== 0);
  }).map((record) => record.symbol))).slice(0, 100);
}

/** A 15:05 close snapshot always wins; the selected quote is only the pre-snapshot fallback. */
export function resolveTagMarginStockQuote(
  record: TagMarginStockRecord,
  quotes: Record<string, TagMarginStockQuote | undefined> | undefined,
): { price: number | null; priceDate: string; updatedAt: string; isCloseSnapshot: boolean } {
  const snapshot = quotes?.[record.symbol];
  const snapshotPrice = numeric(snapshot?.price);
  if (snapshotPrice !== null && snapshotPrice > 0) {
    return {
      price: snapshotPrice,
      priceDate: text(snapshot?.priceDate) || record.priceDate,
      updatedAt: text(snapshot?.updatedAt) || record.priceUpdatedAt,
      isCloseSnapshot: true,
    };
  }
  return {
    price: record.referencePrice > 0 ? record.referencePrice : null,
    priceDate: record.priceDate,
    updatedAt: record.priceUpdatedAt,
    isCloseSnapshot: false,
  };
}

export function getTagMarginStockMarketValue(
  record: TagMarginStockRecord,
  quotes: Record<string, TagMarginStockQuote | undefined> | undefined,
): number | null {
  const summary = getTagMarginStockSaleSummary(record);
  if (!summary.valid) return null;
  if (!Object.prototype.hasOwnProperty.call(record, 'sales')) {
    const quote = resolveTagMarginStockQuote(record, quotes);
    return quote.price === null ? null : quote.price * record.quantity;
  }
  // Fully sold collateral is registered cash and no longer depends on any quote.
  if (summary.remainingQuantity === 0) return summary.saleValue;
  const quote = resolveTagMarginStockQuote(record, quotes);
  return quote.price === null ? null : summary.saleValue + quote.price * summary.remainingQuantity;
}

/** Only an unloaded canonical query may use local values; an explicit unknown stays unknown. */
export function resolveTagMarginTotalCny(
  canonical: { totalCny?: unknown } | null | undefined,
  localTotal: number | null,
): number | null {
  if (canonical === undefined) return localTotal !== null && Number.isFinite(localTotal) ? localTotal : null;
  const value = canonical?.totalCny;
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
