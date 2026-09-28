/** Public COS URLs for the verified token artwork used in the wallet. */
const COS_CRYPTO_ICON_BASE_URL = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/crypto-icons";

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

export function getCryptoAssetIconSrc(assetCode: unknown): string | null {
  const normalizedCode = String(assetCode || "").trim().toUpperCase();
  return CRYPTO_ASSET_ICON_SOURCES[normalizedCode] || null;
}
