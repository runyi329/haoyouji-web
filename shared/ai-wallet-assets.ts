/**
 * AI 智能钱包的全局资产目录。
 *
 * 说明：`funding` 资产为历史兼容的 CNY / USDT 资金账户；52 号账本订单币种目录
 * 中的 `market` 数字资产全部具备独立钱包余额、不可变流水、后台手动加减、站内
 * 转账和钱包担保能力。链上充值、提现地址仍须按币种网络单独配置后才会开放。
 */
export const AI_WALLET_FUNDING_ASSETS = ["CNY", "USDT"] as const;

/** 与 52 号账本融资付息订单、price-scanner 的数字资产报价集合保持一致。 */
export const AI_WALLET_MARKET_ASSETS = [
  "BTC", "ETH", "SOL", "BNB",
  "HYPE", "TRUMP", "PENGU", "XPL", "WLFI",
  "AVAX", "DOGE", "XLM", "TIA", "EIGEN", "FET",
  "AAVE", "SUI", "ONDO", "ASTER", "LDO", "ENA", "ARKM", "SEI",
  "PLUME", "ADA", "ZRO", "WLD", "LINK", "POL", "CRV", "PEPE", "B2",
] as const;

/**
 * 52号账本融资付息订单下拉中的全部数字货币，均启用“独立余额 + 手动加减 +
 * 站内转账 + 钱包担保”。股票、ETF、商品期货等非数字资产绝不混入数字币资金账本。
 */
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
  CNY: "人民币",
  USDT: "泰达币",
  BTC: "比特币",
  ETH: "以太坊",
  SOL: "Solana",
  BNB: "BNB",
  HYPE: "Hyperliquid",
  TRUMP: "Official Trump",
  PENGU: "Pudgy Penguins",
  XPL: "Plasma",
  WLFI: "World Liberty Financial",
  AVAX: "Avalanche",
  DOGE: "狗狗币",
  XLM: "恒星币",
  TIA: "Celestia",
  EIGEN: "EigenLayer",
  FET: "Fetch.ai",
  AAVE: "Aave",
  SUI: "Sui",
  ONDO: "Ondo",
  ASTER: "Aster",
  LDO: "Lido DAO",
  ENA: "Ethena",
  ARKM: "Arkham",
  SEI: "Sei",
  PLUME: "Plume",
  ADA: "艾达币",
  ZRO: "LayerZero",
  WLD: "Worldcoin",
  LINK: "Chainlink",
  POL: "Polygon",
  CRV: "Curve DAO",
  PEPE: "Pepe",
  B2: "B² Network",
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
      : ((AI_WALLET_SETTLEMENT_ASSETS as readonly string[]).includes(code)
        ? "多资产钱包：已启用独立余额、不可变流水、后台手动加减和站内转账；链上充值地址须在配置完成后另行开放。"
        : "已接入 52 号账本的实时行情与仓位展示；尚未纳入独立钱包资金账本。"),
  };
});

export const AI_WALLET_ASSET_COLORS: Record<AiWalletAsset, string> = {
  CNY: "#DE2910", USDT: "#26A17B", BTC: "#F7931A", ETH: "#627EEA", SOL: "#9945FF", BNB: "#F3BA2F",
  HYPE: "#5C6BC0", TRUMP: "#D71920", PENGU: "#66C5E0", XPL: "#6B5CFF", WLFI: "#1F2937",
  AVAX: "#E84142", DOGE: "#C2A633", XLM: "#14B8A6", TIA: "#7C3AED", EIGEN: "#8B5CF6", FET: "#1A73E8",
  AAVE: "#B6509E", SUI: "#4DA2FF", ONDO: "#1A1A2E", ASTER: "#00D4AA", LDO: "#F68B1E", ENA: "#00C4B4",
  ARKM: "#FF6B00", SEI: "#9C1FFF", PLUME: "#7B5EA7", ADA: "#0033AD", ZRO: "#111111", WLD: "#111111",
  LINK: "#2A5ADA", POL: "#8247E5", CRV: "#406C9A", PEPE: "#479F53", B2: "#F59E0B",
};
