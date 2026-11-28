/** Server-only: reuse the project's existing stock data authorization. Never export to client/shared. */
export const LEGACY_TUSHARE_MARKET_TOKEN = '5762b219a162bab92c913a2281663934b2e20e5e02c07ce7e42dfd79';

export function getTushareMarketToken(): string {
  return process.env.TUSHARE_TOKEN?.trim() || process.env.TS_TOKEN?.trim() || LEGACY_TUSHARE_MARKET_TOKEN;
}
