/**
 * Public image sources used by the wallet asset renderer.
 * Existing on-chain tokens use the project's COS icon pack. 52号新增的证券、ETF 和
 * 商品标的没有链上币标，因此以品牌官方识别图标或固定交易代码徽章补齐，避免钱包、
 * 邀请快照和流水页退回为单个首字母。
 */
const COS_CRYPTO_ICON_BASE_URL = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/crypto-icons";
const SIMPLE_ICON_BASE_URL = "https://cdn.simpleicons.org";

const CRYPTO_ASSET_ICON_SOURCES: Readonly<Record<string, string>> = {
  USDT: `${COS_CRYPTO_ICON_BASE_URL}/usdt.png`,
  BTC: `${COS_CRYPTO_ICON_BASE_URL}/btc.png`,
  ETH: `${COS_CRYPTO_ICON_BASE_URL}/eth.png`,
  SOL: `${COS_CRYPTO_ICON_BASE_URL}/sol.png`,
  BNB: `${COS_CRYPTO_ICON_BASE_URL}/bnb.png`,
  HYPE: `${COS_CRYPTO_ICON_BASE_URL}/hype.png`,
  TRUMP: `${COS_CRYPTO_ICON_BASE_URL}/trump.png`,
  PENGU: `${COS_CRYPTO_ICON_BASE_URL}/pengu.png`,
  XPL: `${COS_CRYPTO_ICON_BASE_URL}/xpl.png`,
  WLFI: `${COS_CRYPTO_ICON_BASE_URL}/wlfi.png`,
  AVAX: `${COS_CRYPTO_ICON_BASE_URL}/avax.png`,
  DOGE: `${COS_CRYPTO_ICON_BASE_URL}/doge.png`,
  XLM: `${COS_CRYPTO_ICON_BASE_URL}/xlm.png`,
  TIA: `${COS_CRYPTO_ICON_BASE_URL}/tia.png`,
  EIGEN: `${COS_CRYPTO_ICON_BASE_URL}/eigen.png`,
  FET: `${COS_CRYPTO_ICON_BASE_URL}/fet.png`,
  AAVE: `${COS_CRYPTO_ICON_BASE_URL}/aave.png`,
  SUI: `${COS_CRYPTO_ICON_BASE_URL}/sui.png`,
  ONDO: `${COS_CRYPTO_ICON_BASE_URL}/ondo.png`,
  ASTER: `${COS_CRYPTO_ICON_BASE_URL}/aster.png`,
  LDO: `${COS_CRYPTO_ICON_BASE_URL}/ldo.png`,
  ENA: `${COS_CRYPTO_ICON_BASE_URL}/ena.png`,
  ARKM: `${COS_CRYPTO_ICON_BASE_URL}/arkm.png`,
  UNI: `${COS_CRYPTO_ICON_BASE_URL}/uni.png`,
  SEI: `${COS_CRYPTO_ICON_BASE_URL}/sei.png`,
  PLUME: `${COS_CRYPTO_ICON_BASE_URL}/plume.png`,
  ADA: `${COS_CRYPTO_ICON_BASE_URL}/ada.png`,
  ZRO: `${COS_CRYPTO_ICON_BASE_URL}/zro.png`,
  WLD: `${COS_CRYPTO_ICON_BASE_URL}/wld.png`,
  LINK: `${COS_CRYPTO_ICON_BASE_URL}/link.png`,
  POL: `${COS_CRYPTO_ICON_BASE_URL}/pol.png`,
  CRV: `${COS_CRYPTO_ICON_BASE_URL}/crv.png`,
  PEPE: `${COS_CRYPTO_ICON_BASE_URL}/pepe.png`,
  B2: `${COS_CRYPTO_ICON_BASE_URL}/b2.png`,
};

const officialFavicon = (domain: string) =>
  `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${domain}`)}&sz=256`;

/** Brand marks for the newly enabled 52号市场资产。 */
const MARKET_ASSET_ICON_SOURCES: Readonly<Record<string, string>> = {
  MSTR: `${SIMPLE_ICON_BASE_URL}/microstrategy`,
  COIN: `${SIMPLE_ICON_BASE_URL}/coinbase`,
  HOOD: `${SIMPLE_ICON_BASE_URL}/robinhood`,
  TSLA: `${SIMPLE_ICON_BASE_URL}/tesla`,
  NVDA: `${SIMPLE_ICON_BASE_URL}/nvidia`,
  AAPL: `${SIMPLE_ICON_BASE_URL}/apple`,
  GOOGL: `${SIMPLE_ICON_BASE_URL}/google`,
  META: `${SIMPLE_ICON_BASE_URL}/meta`,
  NFLX: `${SIMPLE_ICON_BASE_URL}/netflix`,
  AMD: `${SIMPLE_ICON_BASE_URL}/amd`,
  CRCL: `${SIMPLE_ICON_BASE_URL}/circle`,
  SLV: officialFavicon("ishares.com"),
  MSFT: officialFavicon("microsoft.com"),
  AMZN: officialFavicon("amazon.com"),
  QQQ: officialFavicon("invesco.com"),
  ORCL: officialFavicon("oracle.com"),
  TSM: officialFavicon("tsmc.com"),
  MU: officialFavicon("micron.com"),
  SKHYNIX: officialFavicon("skhynix.com"),
};

type TickerBadgeDefinition = { label: string; sublabel: string; color: string };

/**
 * ETF、商品和 DRAM 指数没有统一的可复用官方圆形标识；使用固定的交易代码徽章，
 * 与普通首字母回退明确区分，并保证同一代码在钱包每个入口外观一致。
 */
const TICKER_BADGE_DEFINITIONS: Readonly<Record<string, TickerBadgeDefinition>> = {
  AAOI: { label: "AAOI", sublabel: "OPTICS", color: "#6D28D9" },
  SPY: { label: "SPY", sublabel: "500", color: "#1A56DB" },
  CL: { label: "OIL", sublabel: "WTI", color: "#8B4513" },
  NG: { label: "GAS", sublabel: "NG", color: "#4A90D9" },
  DRAM: { label: "RAM", sublabel: "DRAM", color: "#8E24AA" },
  BZ: { label: "OIL", sublabel: "BRENT", color: "#6D4C41" },
};

function createTickerBadgeSrc({ label, sublabel, color }: TickerBadgeDefinition): string {
  const labelSize = label.length > 3 ? 48 : 61;
  const svg = `<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><circle cx="128" cy="128" r="122" fill="url(#g)"/><circle cx="128" cy="128" r="113" fill="none" stroke="white" stroke-opacity=".22" stroke-width="4"/><text x="128" y="121" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${labelSize}" font-weight="800" fill="white">${label}</text><text x="128" y="161" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" letter-spacing="3" fill="white" fill-opacity=".78">${sublabel}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const TICKER_BADGE_SOURCES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(TICKER_BADGE_DEFINITIONS).map(([code, definition]) => [code, createTickerBadgeSrc(definition)]),
);

export function getCryptoAssetIconSrc(assetCode: unknown): string | null {
  const normalizedCode = String(assetCode || "").trim().toUpperCase();
  return CRYPTO_ASSET_ICON_SOURCES[normalizedCode]
    || MARKET_ASSET_ICON_SOURCES[normalizedCode]
    || TICKER_BADGE_SOURCES[normalizedCode]
    || null;
}
