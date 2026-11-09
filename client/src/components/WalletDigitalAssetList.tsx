import { getCryptoAssetIconSrc } from "@/lib/cryptoAssetIcons";
import { formatDigitalAssetAmount, type WalletDigitalAsset } from "@/lib/walletDigitalAssets";

const COLORS = {
  white: "var(--wallet-text, rgba(var(--wallet-neutral-rgb,255,255,255),0.88))",
  whiteDim: "var(--wallet-text-muted, rgba(var(--wallet-neutral-rgb,255,255,255),0.45))",
  goldLight: "var(--wallet-accent-light, #F5D78E)",
  divider: "var(--wallet-divider, rgba(var(--wallet-neutral-rgb,255,255,255),0.06))",
};

/** 正式钱包、管理员成员视角与推荐成员快照唯一的资产行；不包含任何资金操作。 */
export function WalletDigitalAssetList({ assets, usdtCnyRate, mask = value => value }: {
  assets: ReadonlyArray<WalletDigitalAsset>;
  usdtCnyRate: number;
  mask?: (value: string) => string;
}) {
  return <div className="overflow-hidden rounded-xl" style={{ background: "var(--wallet-asset-surface, rgba(0,0,0,0.14))", border: `1px solid ${COLORS.divider}` }}>
    {assets.map((asset, index) => {
      const assetCode = String(asset.assetCode || "").toUpperCase();
      const amount = asset.totalBalance;
      const availableAmount = asset.availableBalance;
      const frozenAmount = asset.frozenBalance;
      const valueUsdt = amount * Number(asset.priceUsdt ?? 0);
      const valueCny = valueUsdt * usdtCnyRate;
      const hasMarketPrice = Number(asset.priceUsdt ?? 0) > 0;
      const isUsdtAsset = assetCode === "USDT";
      const hasCollateral = frozenAmount !== null && frozenAmount > 0;
      const assetAccent = assetCode === "USDT" ? "#26A17B" : assetCode === "ETH" ? "#627EEA" : assetCode === "BTC" ? "#F7931A" : assetCode === "SOL" ? "#A55CFF" : assetCode === "BNB" ? "#F3BA2F" : assetCode === "SUI" ? "#4DA2FF" : "#8AA0B8";
      const assetIconSrc = getCryptoAssetIconSrc(assetCode);
      return <div key={assetCode} className="relative px-3 py-3" style={{ background: hasCollateral ? "linear-gradient(90deg, rgba(var(--wallet-accent-rgb,201,168,76),0.075) 0%, rgba(var(--wallet-accent-rgb,201,168,76),0.018) 42%, transparent 72%)" : "transparent", borderBottom: index < assets.length - 1 ? "1px solid rgba(var(--wallet-neutral-rgb,255,255,255),0.10)" : "none" }}>
        {hasCollateral && <div className="absolute inset-y-3 left-0 w-px rounded-full" style={{ background: "linear-gradient(180deg, transparent, rgba(245,215,142,0.82), transparent)" }} />}
        <div className="grid w-full min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_auto] grid-rows-[1.25rem_1rem_1rem] items-start gap-x-2.5 text-left">
          <div className="row-span-3 flex h-9 w-9 shrink-0 items-center justify-center self-start overflow-hidden rounded-full text-xs font-bold" style={{ background: `${assetAccent}25`, color: assetAccent, border: `1px solid ${assetAccent}55` }}>
            {assetIconSrc ? <img src={assetIconSrc} alt={`${assetCode} 币种图标`} className="h-full w-full object-contain" /> : assetCode.slice(0, 1)}
          </div>
          <div className="min-w-0 truncate text-sm font-semibold leading-5" style={{ color: COLORS.white }}>{assetCode}</div>
          <div className="shrink-0 text-right text-xl font-bold leading-5 tabular-nums" style={{ color: COLORS.white }}>{mask(formatDigitalAssetAmount(assetCode, amount))}</div>
          <div className="min-w-0 truncate text-[10px] leading-4 tabular-nums" style={{ color: COLORS.whiteDim }}>可用 {availableAmount === null ? "—" : mask(formatDigitalAssetAmount(assetCode, availableAmount))}</div>
          <div className="shrink-0 text-right text-[11px] leading-4 tabular-nums" style={{ color: COLORS.whiteDim }}>{hasMarketPrice ? (isUsdtAsset ? `≈ ¥${mask(valueCny.toLocaleString("zh-CN", { maximumFractionDigits: 2 }))}` : `≈ ${mask(valueUsdt.toLocaleString("zh-CN", { maximumFractionDigits: 2 }))} u`) : "行情加载中"}</div>
          <div className="min-w-0 truncate text-[10px] leading-4 tabular-nums" style={{ color: hasCollateral ? COLORS.goldLight : COLORS.whiteDim }}>担保 {frozenAmount === null ? "—" : mask(formatDigitalAssetAmount(assetCode, frozenAmount))}</div>
          {!isUsdtAsset && <div className="shrink-0 text-right text-[11px] leading-4 tabular-nums" style={{ color: COLORS.whiteDim }}>{hasMarketPrice ? `≈ ${mask(valueCny.toLocaleString("zh-CN", { maximumFractionDigits: 2 }))}元` : "—"}</div>}
        </div>
      </div>;
    })}
  </div>;
}
