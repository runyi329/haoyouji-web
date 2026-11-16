/** 37号混合持仓的资产身份；数字币必须显式命名，不通过裸ticker猜测。 */
export type PortfolioMarket = 'A' | 'US' | 'CRYPTO';
export type PortfolioCurrency = 'CNY' | 'USD' | 'USDT';
export type PortfolioInstrument = {
  symbol: string;
  market: PortfolioMarket;
  currency: PortfolioCurrency;
  baseAsset: string;
  displaySymbol: string;
  quantityUnit: '股' | '币';
};

const CRYPTO_SYMBOL = /^CRYPTO:([A-Z0-9][A-Z0-9_]{0,29})-USDT$/;
const ASHARE_SYMBOL = /^\d{6}\.(SH|SZ|BJ)$/;
const US_SYMBOL = /^[A-Z][A-Z0-9.\-]{0,14}$/;

export function parsePortfolioInstrument(value: unknown): PortfolioInstrument | null {
  const symbol = String(value ?? '').trim().toUpperCase();
  const crypto = CRYPTO_SYMBOL.exec(symbol);
  if (crypto && crypto[1] !== 'USDT') {
    return { symbol, market: 'CRYPTO', currency: 'USDT', baseAsset: crypto[1], displaySymbol: `${crypto[1]}/USDT`, quantityUnit: '币' };
  }
  if (ASHARE_SYMBOL.test(symbol)) return { symbol, market: 'A', currency: 'CNY', baseAsset: symbol, displaySymbol: symbol, quantityUnit: '股' };
  if (US_SYMBOL.test(symbol)) return { symbol, market: 'US', currency: 'USD', baseAsset: symbol, displaySymbol: symbol, quantityUnit: '股' };
  return null;
}

export function normalizePortfolioSymbol(value: unknown): string {
  const instrument = parsePortfolioInstrument(value);
  if (!instrument) throw new Error('请选择已核验的A股、美股或数字币现货交易对');
  return instrument.symbol;
}

export function cryptoPortfolioSymbol(baseAsset: string): string {
  return normalizePortfolioSymbol(`CRYPTO:${String(baseAsset).trim().toUpperCase()}-USDT`);
}
export const isCryptoPortfolioSymbol = (symbol: unknown): boolean => parsePortfolioInstrument(symbol)?.market === 'CRYPTO';
export const cryptoPortfolioBase = (symbol: unknown): string | null => {
  const instrument = parsePortfolioInstrument(symbol);
  return instrument?.market === 'CRYPTO' ? instrument.baseAsset : null;
};
export const portfolioCurrency = (symbol: unknown): PortfolioCurrency => parsePortfolioInstrument(symbol)?.currency ?? 'CNY';
export const portfolioMarket = (symbol: unknown): PortfolioMarket => parsePortfolioInstrument(symbol)?.market ?? 'A';
export const portfolioDisplaySymbol = (symbol: unknown): string => parsePortfolioInstrument(symbol)?.displaySymbol ?? String(symbol ?? '');
export const portfolioQuantityUnit = (symbol: unknown): '股' | '币' => parsePortfolioInstrument(symbol)?.quantityUnit ?? '股';
export const portfolioQuotePrefix = (currency: string): string => currency === 'USDT' ? 'USDT ' : currency === 'USD' ? 'US$' : '¥';

/** USDT与USD是不同币种，不能因缺USDT汇率而静默套用USD或固定数值。 */
export function portfolioCashMultiplier(currency: string, usdCnyRate: number | null | undefined, usdtCnyRate: number | null | undefined): number | null {
  const rate = currency === 'USDT' ? usdtCnyRate : currency === 'USD' ? usdCnyRate : currency === 'CNY' ? 1 : null;
  return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** 只对新数字币记录实施8位精度上限，保留既有股票输入规则。 */
export function isValidCryptoPortfolioQuantity(value: unknown): boolean {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity < 1e-8 || quantity >= 1e16) return false;
  const [coefficient, exponent = '0'] = String(quantity).toLowerCase().split('e');
  const decimals = coefficient.split('.')[1]?.length ?? 0;
  return Math.max(0, decimals - Number(exponent)) <= 8;
}

/** 8位最小币量不能被股票原有的<=EPSILON规则当成空仓。 */
export function portfolioQuantityIsEmpty(symbol: unknown, quantity: number): boolean {
  return isCryptoPortfolioSymbol(symbol) ? quantity < 1e-8 : quantity <= 1e-8;
}
