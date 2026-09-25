/** Public COS URLs for the verified token artwork used in the wallet. */
const COS_CRYPTO_ICON_BASE_URL = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/crypto-icons";

const CRYPTO_ASSET_ICON_SOURCES: Readonly<Record<string, string>> = {
  USDT: `${COS_CRYPTO_ICON_BASE_URL}/usdt.png`,
  BTC: `${COS_CRYPTO_ICON_BASE_URL}/btc.png`,
  ETH: `${COS_CRYPTO_ICON_BASE_URL}/eth.png`,
  SOL: `${COS_CRYPTO_ICON_BASE_URL}/sol.png`,
  BNB: `${COS_CRYPTO_ICON_BASE_URL}/bnb.png`,
  SUI: `${COS_CRYPTO_ICON_BASE_URL}/sui.png`,
};

export function getCryptoAssetIconSrc(assetCode: unknown): string | null {
  const normalizedCode = String(assetCode || "").trim().toUpperCase();
  return CRYPTO_ASSET_ICON_SOURCES[normalizedCode] || null;
}
