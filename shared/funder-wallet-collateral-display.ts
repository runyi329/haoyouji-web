/** 纯展示：钱包余额/冻结只信任已加载台账；历史镜像仅作为原登记证据。 */
export type FunderWalletCollateralAsset = { coin: string; qty: string; note?: string; source?: string };
export function isFunderWalletCollateralAsset(asset: Partial<FunderWalletCollateralAsset> | null | undefined): boolean {
  return asset?.source === 'wallet' || String(asset?.note || '').startsWith('钱包担保冻结');
}
export function selectFunderWalletCollateralDisplay(order: any, assets: FunderWalletCollateralAsset[]) {
  const raw = order?.wallet_collateral_contributors;
  // 后端不得把查询失败包装成 []；false/null 保留“未知”，[] 表示成功且无冻结。
  const state = order?.wallet_collateral_contributors_loaded === false || order?.wallet_collateral_contributors_status === 'error'
    ? 'unavailable' as const
    : Array.isArray(raw) ? 'loaded' as const : 'not_loaded' as const;
  const expectedSegmentId = String(order?.joint_segment_id || '__primary__');
  const manualAssets = assets.filter(asset => !isFunderWalletCollateralAsset(asset));
  const registeredWalletAssets = assets.filter(isFunderWalletCollateralAsset);
  const currentWalletAssets: FunderWalletCollateralAsset[] = state !== 'loaded' ? [] : raw.flatMap((contributor: any) =>
    (Array.isArray(contributor?.assets) ? contributor.assets : [])
      .filter((asset: any) => String(asset?.jointSegmentId || '__primary__') === expectedSegmentId)
      .flatMap((asset: any) => {
        const coin = String(asset?.coin || '').trim().toUpperCase();
        const qty = String(asset?.qty ?? '').trim();
        return coin && Number.isFinite(Number(qty)) && Number(qty) > 0
          ? [{ coin, qty, source: 'wallet', note: `钱包担保冻结 · ${String(contributor?.name || '拥有者')}` }] : [];
      }));
  return { state, currentWalletAssets, registeredWalletAssets, currentAssets: [...manualAssets, ...currentWalletAssets] };
}
