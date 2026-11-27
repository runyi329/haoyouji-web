import { CRYPTO_ASSET_CODES, CRYPTO_ASSET_NAMES, type CryptoAssetCode } from "./crypto-asset-catalog";

/**
 * AI 智能钱包的全局资产目录。
 *
 * `funding` 为历史兼容的 CNY / USDT 资金账户；`market` 与 37 / 52 共用数字币目录，
 * 并保留证券 / 商品。目录内资产具备独立余额、不可变流水、后台手动加减、站内转账
 * 和钱包担保能力，但目录不代表已经取得实时行情，也不自动开放商城支付。
 * 链上充值、提现地址仅适用于数字币，仍须按币种网络单独配置后才会开放。
 */
export const AI_WALLET_FUNDING_ASSETS = ["CNY", "USDT"] as const;

/** 独立钱包数字资产的唯一共享 tuple；216 币不会因目录展开而自动请求报价。 */
export const AI_WALLET_CRYPTO_MARKET_ASSETS = CRYPTO_ASSET_CODES;

/**
 * 52 号账本融资付息订单下拉中可独立记账的证券与商品标的。
 *
 * 这些资产与数字币一样按“代码 + 数量”独立记账，不同的是它们不开放链上充提；价格
 * 统一由 price-scanner 的证券/商品行情链路提供。CRCL（Circle）在此清单中，避免
 * 管理员手动调账、站内转账和担保冻结与订单目录脱节。
 */
export const AI_WALLET_SECURITIES_AND_COMMODITIES_ASSETS = [
  "MSTR", "COIN", "AAOI", "HOOD", "SLV",
  "TSLA", "NVDA", "AAPL", "MSFT", "GOOGL", "META", "AMZN", "SPY", "QQQ",
  "NFLX", "ORCL", "TSM", "AMD", "CL", "NG", "CRCL", "DRAM", "MU", "SKHYNIX", "BZ",
] as const;

/** 可独立记账市场资产：统一数字币与原有 52 号证券 / 商品。 */
export const AI_WALLET_MARKET_ASSETS = [
  ...AI_WALLET_CRYPTO_MARKET_ASSETS,
  ...AI_WALLET_SECURITIES_AND_COMMODITIES_ASSETS,
] as const;

export const AI_WALLET_SETTLEMENT_ASSETS = [...AI_WALLET_MARKET_ASSETS] as const;
export type AiWalletSettlementAsset = (typeof AI_WALLET_SETTLEMENT_ASSETS)[number];

export const AI_WALLET_ASSETS = [...AI_WALLET_FUNDING_ASSETS, ...AI_WALLET_MARKET_ASSETS] as const;
export type AiWalletAsset = (typeof AI_WALLET_ASSETS)[number];
export type AiWalletFundingAsset = (typeof AI_WALLET_FUNDING_ASSETS)[number];
export type AiWalletMarketAsset = (typeof AI_WALLET_MARKET_ASSETS)[number];

export type AiWalletAssetDefinition = {
  code: AiWalletAsset;
  name: string;
  category: "funding" | "market";
  currentSupport: boolean;
  walletLedgerEnabled: boolean;
  detail: string;
};

const ASSET_NAMES: Record<AiWalletAsset, string> = {
  ...CRYPTO_ASSET_NAMES,
  CNY: "人民币",
  USDT: "泰达币",
  MSTR: "Strategy",
  COIN: "Coinbase",
  AAOI: "Applied Optoelectronics",
  HOOD: "Robinhood",
  SLV: "iShares 白银 ETF",
  TSLA: "Tesla",
  NVDA: "NVIDIA",
  AAPL: "Apple",
  MSFT: "Microsoft",
  GOOGL: "Alphabet",
  META: "Meta",
  AMZN: "Amazon",
  SPY: "标普500 ETF",
  QQQ: "纳斯达克100 ETF",
  NFLX: "Netflix",
  ORCL: "Oracle",
  TSM: "台积电",
  AMD: "AMD",
  CL: "WTI 原油",
  NG: "天然气",
  CRCL: "Circle Internet Group",
  DRAM: "DRAM ETF",
  MU: "Micron",
  SKHYNIX: "SK hynix",
  BZ: "布伦特原油",
};

export const AI_WALLET_ASSET_CATALOG: readonly AiWalletAssetDefinition[] = AI_WALLET_ASSETS.map((code) => {
  const category = (AI_WALLET_FUNDING_ASSETS as readonly string[]).includes(code) ? "funding" : "market";
  return {
    code,
    name: ASSET_NAMES[code],
    category,
    currentSupport: true,
    walletLedgerEnabled: (AI_WALLET_SETTLEMENT_ASSETS as readonly string[]).includes(code),
    detail: category === "funding"
      ? (code === "CNY"
        ? "现有余额、后台调账与站内转账已支持；用户端法币充值/提现申请闭环尚未接入。"
        : "现有余额、充值订单、提现审核、站内转账与链网络能力已接入。")
      : "37/52共享市场资产钱包：已启用独立余额、不可变流水、后台手动加减、站内转账和担保冻结；行情按需求获取，数字币链上充提须完成网络配置后另行开放。",
  };
});

// 新币使用按代码哈希的确定性色，不使用随机数或把默认色冒充官方品牌色。
const DEFAULT_CRYPTO_COLOR_PALETTE = [
  "#2563EB", "#7C3AED", "#059669", "#D97706", "#DB2777", "#0891B2",
  "#4F46E5", "#0D9488", "#9333EA", "#C2410C", "#475569", "#BE123C",
] as const;
const DEFAULT_CRYPTO_COLORS = Object.fromEntries(CRYPTO_ASSET_CODES.map((code) => {
  let hash = 0;
  for (const char of code) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return [code, DEFAULT_CRYPTO_COLOR_PALETTE[hash % DEFAULT_CRYPTO_COLOR_PALETTE.length]];
})) as Record<CryptoAssetCode, string>;

export const AI_WALLET_ASSET_COLORS: Record<AiWalletAsset, string> = {
  ...DEFAULT_CRYPTO_COLORS,
  CNY: "#DE2910", USDT: "#26A17B", BTC: "#F7931A", ETH: "#627EEA", SOL: "#9945FF", BNB: "#F3BA2F",
  HYPE: "#5C6BC0", TRUMP: "#D71920", PENGU: "#66C5E0", XPL: "#6B5CFF", WLFI: "#1F2937",
  AVAX: "#E84142", DOGE: "#C2A633", XLM: "#14B8A6", TIA: "#7C3AED", EIGEN: "#8B5CF6", FET: "#1A73E8",
  AAVE: "#B6509E", SUI: "#4DA2FF", ONDO: "#1A1A2E", ASTER: "#00D4AA", LDO: "#F68B1E", ENA: "#00C4B4",
  ARKM: "#FF6B00", UNI: "#FF007A", SEI: "#9C1FFF", PLUME: "#7B5EA7", ADA: "#0033AD", ZRO: "#111111", WLD: "#111111",
  LINK: "#2A5ADA", POL: "#8247E5", CRV: "#406C9A", PEPE: "#479F53", B2: "#F59E0B", BTY: "#F3BA2F",
  MSTR: "#F7931A", COIN: "#1652F0", AAOI: "#6D28D9", HOOD: "#00C805", SLV: "#8B95A5",
  TSLA: "#CC0000", NVDA: "#76B900", AAPL: "#555555", MSFT: "#00A4EF", GOOGL: "#4285F4",
  META: "#0866FF", AMZN: "#FF9900", SPY: "#1A56DB", QQQ: "#7C3AED", NFLX: "#E50914",
  ORCL: "#F80000", TSM: "#0070C0", AMD: "#ED1C24", CL: "#8B4513", NG: "#4A90D9",
  CRCL: "#1E88D6", DRAM: "#E040FB", MU: "#0097A7", SKHYNIX: "#EB1C24", BZ: "#8B4513",
  INJ: "#0096FF", NEAR: "#00A67D", TAO: "#111827", PENDLE: "#2563EB", STRK: "#EC796B",
};
