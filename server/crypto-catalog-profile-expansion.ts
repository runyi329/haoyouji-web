import { CRYPTO_CATALOG_ADDITIONS_20261127, CRYPTO_EXISTING_MAIN_ADDITIONS, LEGACY_WALLET_CRYPTO_ASSET_CODES } from '../shared/crypto-asset-catalog';

/** 只补本轮182个钱包缺项，不把管理员主动隐藏的旧34币或证券强行加回。 */
export function expandCryptoCatalogProfileAssets(targetKey: string, visibleAssets: readonly string[]): string[] {
  const original = Array.from(new Set(visibleAssets));
  if (!['ledger:37', 'ledger:52'].includes(targetKey)
    || !original.some(code => (LEGACY_WALLET_CRYPTO_ASSET_CODES as readonly string[]).includes(code))) return original;
  return Array.from(new Set([...original, ...CRYPTO_EXISTING_MAIN_ADDITIONS, ...CRYPTO_CATALOG_ADDITIONS_20261127]));
}
