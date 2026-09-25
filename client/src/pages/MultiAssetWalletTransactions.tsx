import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { ArrowDownCircle, ArrowLeft, ArrowUpCircle, Loader2, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { restoreLedgerViewAsState } from "@/lib/authIdentity";
import { getInternalTransferPresentation } from "@/lib/walletTransferPresentation";
import { getCryptoAssetIconSrc } from "@/lib/cryptoAssetIcons";
import { AI_WALLET_ASSET_CATALOG, AI_WALLET_SETTLEMENT_ASSETS, type AiWalletSettlementAsset } from "@shared/ai-wallet-assets";

type FlowFilter = "all" | "in" | "out";

const theme = {
  bg: "#0d0d0d",
  panel: "#171717",
  border: "rgba(201,168,76,0.22)",
  gold: "#C9A84C",
  goldLight: "#F5D78E",
  muted: "rgba(255,255,255,0.45)",
  green: "#34d399",
  red: "#f87171",
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const pad = (entry: number) => String(entry).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getDigitalFlowPresentation(entry: { eventType?: string; amount?: number; note?: string; counterpartyName?: string | null }) {
  const incoming = Number(entry.amount ?? 0) > 0;
  switch (entry.eventType) {
    case "collateral_lock":
      return { label: "担保冻结", state: "已参与联合担保", incoming: false };
    case "collateral_release":
      return { label: "担保解冻", state: "已解冻入账", incoming: true };
    case "transfer_in":
    case "transfer_out": {
      const transfer = getInternalTransferPresentation(
        entry.note,
        entry.eventType === "transfer_in" ? "in" : "out",
        entry.counterpartyName,
      );
      return {
        label: transfer?.primary || (entry.eventType === "transfer_in" ? "站内转账收款" : "站内转账汇款"),
        detail: transfer?.secondary,
        state: entry.eventType === "transfer_in" ? "已入账" : "已扣除",
        incoming: entry.eventType === "transfer_in",
      };
    }
    default:
      return { label: incoming ? "入账" : "扣除", state: incoming ? "已入账" : "已扣除", incoming };
  }
}

export default function MultiAssetWalletTransactions() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const query = new URLSearchParams(search);
  const viewAsUserId = restoreLedgerViewAsState(query.get("viewAs"));
  // 从单币种明细返回时保持数字币账户选中，不回退到默认稳定币账户。
  const walletQuery = viewAsUserId ? `?fromLedger=52&account=CRYPTO&viewAs=${viewAsUserId}` : "?fromLedger=52&account=CRYPTO";
  const walletQueryForAccount = (account: "USDT" | "CNY" | "CRYPTO") => viewAsUserId
    ? `?fromLedger=52&account=${account}&viewAs=${viewAsUserId}`
    : `?fromLedger=52&account=${account}`;
  const requestedAsset = String(query.get("asset") || "BTC").toUpperCase();
  const assetCode = (AI_WALLET_SETTLEMENT_ASSETS as readonly string[]).includes(requestedAsset)
    ? requestedAsset as AiWalletSettlementAsset
    : "BTC";
  const [filter, setFilter] = useState<FlowFilter>("all");
  const balancesQuery = trpc.recharge.getMultiAssetBalances.useQuery(undefined, { staleTime: 15_000 });
  const historyQuery = trpc.recharge.getMultiAssetHistory.useQuery({ limit: 100 }, { staleTime: 15_000 });
  const asset = AI_WALLET_ASSET_CATALOG.find((item) => item.code === assetCode);
  const assetIconSrc = getCryptoAssetIconSrc(assetCode);
  const balance = (balancesQuery.data ?? []).find((item: any) => String(item.assetCode).toUpperCase() === assetCode) as any;
  const availableAmount = Number(balance?.availableBalance ?? 0);
  const frozenAmount = Number(balance?.frozenBalance ?? 0);
  const amount = Number(balance?.totalBalance ?? (availableAmount + frozenAmount));
  const priceUsdt = Number(balance?.priceUsdt ?? 0);
  const history = useMemo(() => (historyQuery.data ?? [])
    .filter((item: any) => String(item.assetCode).toUpperCase() === assetCode)
    // 冻结/解冻仅变更可用与冻结分层，不改变总持有，不放入用户资金流水。
    .filter((item: any) => item.eventType !== "collateral_lock" && item.eventType !== "collateral_release")
    .filter((item: any) => filter === "all" ? true : filter === "in" ? Number(item.amount) > 0 : Number(item.amount) < 0), [historyQuery.data, assetCode, filter]);
  const availableAssets = (balancesQuery.data ?? [])
    .map((item: any) => String(item.assetCode).toUpperCase())
    .filter((code: string) => (AI_WALLET_SETTLEMENT_ASSETS as readonly string[]).includes(code));

  const handleAssetChange = (nextAsset: string) => {
    if (nextAsset === "USDT") return setLocation(`/wallet/transactions${walletQueryForAccount("USDT")}`);
    if (nextAsset === "CNY") return setLocation(`/wallet/cny-transactions${walletQueryForAccount("CNY")}`);
    setLocation(`/wallet/asset-transactions?asset=${encodeURIComponent(nextAsset)}&fromLedger=52${viewAsUserId ? `&viewAs=${viewAsUserId}` : ""}`);
  };

  return (
    <div className="min-h-screen pb-12" style={{ background: theme.bg }}>
      <header className="sticky top-0 z-10 border-b px-4 py-3" style={{ background: "rgba(13,13,13,.97)", borderColor: theme.border }}>
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setLocation(`/wallet${walletQuery}`)} className="rounded-full p-1.5" aria-label="返回钱包">
            <ArrowLeft className="h-6 w-6" style={{ color: theme.goldLight }} />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-base font-semibold tracking-wide" style={{ color: theme.goldLight }}>资产明细</p>
            <p className="mt-0.5 text-[10px]" style={{ color: theme.muted }}>单币种独立账本，不混合不同币种金额</p>
          </div>
          <button onClick={() => { void balancesQuery.refetch(); void historyQuery.refetch(); }} className="rounded-full p-2" aria-label="刷新">
            <RefreshCw className="h-4 w-4" style={{ color: theme.gold }} />
          </button>
        </div>
        <select
          value={assetCode}
          onChange={(event) => handleAssetChange(event.target.value)}
          className="mt-3 h-10 w-full rounded-xl border bg-[#1b1b1b] px-3 text-sm font-semibold outline-none"
          style={{ borderColor: theme.border, color: theme.goldLight }}
          aria-label="切换明细币种"
        >
          <option value="USDT">USDT · 泰达币</option>
          <option value="CNY">CNY · 人民币</option>
          {AI_WALLET_SETTLEMENT_ASSETS.map((code) => {
            const definition = AI_WALLET_ASSET_CATALOG.find((item) => item.code === code);
            return <option key={code} value={code} disabled={!availableAssets.includes(code) && code !== assetCode}>{code} · {definition?.name || code}{availableAssets.includes(code) ? "" : "（暂无余额）"}</option>;
          })}
        </select>
      </header>

      <main className="space-y-3 px-4 pt-4">
        <section className="rounded-2xl p-4" style={{ background: theme.panel, border: `1px solid ${theme.border}` }}>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,.06)", border: `1px solid ${theme.border}` }}>
              {assetIconSrc ? <img src={assetIconSrc} alt={`${assetCode} 币种图标`} className="h-full w-full object-contain" /> : <span className="text-xs font-bold" style={{ color: theme.goldLight }}>{assetCode.slice(0, 1)}</span>}
            </div>
            <p className="text-xs" style={{ color: theme.muted }}>当前 {assetCode} 余额</p>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums" style={{ color: theme.goldLight }}>{amount.toLocaleString("zh-CN", { maximumFractionDigits: 8 })}</span>
            <span className="text-sm font-medium" style={{ color: theme.gold }}>{assetCode}</span>
          </div>
          <p className="mt-2 text-xs" style={{ color: theme.muted }}>
            {priceUsdt > 0 ? `约等于 ${(amount * priceUsdt).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} USDT · 行情仅用于展示` : `${asset?.name || assetCode} · 行情加载中`}
          </p>
          {frozenAmount > 0 && <p className="mt-1 text-xs" style={{ color: theme.gold }}>可用 {availableAmount.toLocaleString("zh-CN", { maximumFractionDigits: 8 })} · 担保冻结 {frozenAmount.toLocaleString("zh-CN", { maximumFractionDigits: 8 })} {assetCode}</p>}
        </section>

        <div className="flex rounded-xl p-1" style={{ background: "rgba(255,255,255,.05)", border: `1px solid ${theme.border}` }}>
          {(["all", "in", "out"] as FlowFilter[]).map((item) => (
            <button key={item} onClick={() => setFilter(item)} className="flex-1 rounded-lg py-2 text-xs font-semibold" style={{ background: filter === item ? "rgba(201,168,76,.22)" : "transparent", color: filter === item ? theme.goldLight : theme.muted }}>
              {item === "all" ? "全部" : item === "in" ? "收入" : "支出"}
            </button>
          ))}
        </div>

        <section className="overflow-hidden rounded-2xl" style={{ background: theme.panel, border: `1px solid ${theme.border}` }}>
          {historyQuery.isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="h-7 w-7 animate-spin" style={{ color: theme.gold }} /></div>
          ) : history.length === 0 ? (
            <p className="py-16 text-center text-sm" style={{ color: theme.muted }}>暂无 {assetCode} 资金明细</p>
          ) : (
            <div className="divide-y" style={{ borderColor: "rgba(255,255,255,.06)" }}>
              {history.map((entry: any) => {
                const change = Number(entry.amount ?? 0);
                const presentation = getDigitalFlowPresentation(entry);
                const previewNote = presentation.detail || String(entry.note || "—").replace(/\[.*?\]/g, "").trim();
                return (
                  <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="rounded-full p-2" style={{ background: presentation.incoming ? "rgba(52,211,153,.12)" : "rgba(248,113,113,.12)" }}>
                        {presentation.incoming ? <ArrowDownCircle className="h-4 w-4" style={{ color: theme.green }} /> : <ArrowUpCircle className="h-4 w-4" style={{ color: theme.red }} />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" style={{ color: "rgba(255,255,255,.88)" }}>{presentation.label}</p>
                        <p className="mt-0.5 truncate text-[11px]" style={{ color: theme.muted }}>{formatTime(entry.createdAt)}{previewNote ? ` · ${previewNote}` : ""}</p>
                        <p className="mt-1 text-[10px]" style={{ color: theme.muted }}>{presentation.state}</p>
                        <p className="mt-1 text-[10px]" style={{ color: theme.muted }}>该笔后余额 {Number(entry.balanceAfter ?? 0).toLocaleString("zh-CN", { maximumFractionDigits: 8 })} {assetCode}</p>
                      </div>
                    </div>
                    <span className="shrink-0 text-right text-sm font-bold tabular-nums" style={{ color: presentation.incoming ? theme.green : theme.red }}>{presentation.incoming ? "+" : ""}{change.toLocaleString("zh-CN", { maximumFractionDigits: 8 })}<span className="ml-1 text-[10px] font-medium">{assetCode}</span></span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
