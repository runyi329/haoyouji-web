import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { restoreLedgerViewAsState } from "@/lib/authIdentity";
import { getCryptoAssetIconSrc } from "@/lib/cryptoAssetIcons";
import { getInternalTransferPresentation } from "@/lib/walletTransferPresentation";
import { AI_WALLET_SETTLEMENT_ASSETS } from "@shared/ai-wallet-assets";

type PeriodFilter = "7d" | "30d" | "90d" | "all";
type TypeFilter = "all" | "recharge" | "transfer" | "order" | "reward" | "withdraw" | "adjustment";

type HistoryEntry = {
  id: string;
  assetCode: string;
  amount: number;
  balanceAfter: number | null;
  createdAt: string;
  primary: string;
  secondary: string;
  status: string;
  type: Exclude<TypeFilter, "all">;
};

const theme = {
  bg: "#0d0d0d",
  panel: "#171717",
  border: "rgba(201,168,76,0.22)",
  divider: "rgba(255,255,255,.07)",
  gold: "#C9A84C",
  goldLight: "#F5D78E",
  muted: "rgba(255,255,255,0.48)",
  green: "#34d399",
  red: "#f87171",
};

const periodOptions: Array<{ value: PeriodFilter; label: string }> = [
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
  { value: "90d", label: "近 90 天" },
  { value: "all", label: "全部时间" },
];

const typeOptions: Array<{ value: TypeFilter; label: string }> = [
  { value: "all", label: "全部类型" },
  { value: "recharge", label: "充值" },
  { value: "transfer", label: "转账" },
  { value: "order", label: "订单" },
  { value: "reward", label: "奖励/入账" },
  { value: "withdraw", label: "提现" },
  { value: "adjustment", label: "调整" },
];

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  const pad = (entry: number) => String(entry).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function cleanNote(value: unknown) {
  return String(value || "")
    .replace(/^\[CNY\]\s*/i, "")
    .replace(/\[站内转账\]\s*/g, "")
    .trim();
}

function hasOrderContext(note: string) {
  return /(订单|谷底|征筹|增筹|净收益|卖出|成交|结算|委托|融资)/.test(note);
}

function getUsdtEntry(item: any): HistoryEntry {
  const amount = Number(item.amount ?? 0);
  const incoming = amount >= 0;
  const rawNote = String(item.note || item.description || "");
  const note = cleanNote(rawNote);
  const transfer = getInternalTransferPresentation(rawNote, incoming ? "in" : "out", item.counterpartyName);
  let type: Exclude<TypeFilter, "all"> = "adjustment";
  let primary = incoming ? "入账" : "扣除";
  let secondary = note || "USDT 资金流水";
  let status = incoming ? "已入账" : "已扣除";

  if (transfer) {
    type = "transfer";
    primary = transfer.primary;
    secondary = transfer.secondary;
  } else if (item.sourceType === "recharge") {
    type = "recharge";
    primary = "充值到账";
    secondary = "链上充值已完成";
    status = item.status === "completed" ? "已完成" : String(item.status || "处理中");
  } else if (hasOrderContext(note)) {
    type = "order";
    primary = incoming ? "订单入账" : "订单扣除";
  } else if (item.sourceType === "balance_history" && item.type === "reward") {
    type = "reward";
    primary = "奖励入账";
    secondary = note || "奖励已入账";
  } else if (item.sourceType === "balance_history" && item.type === "withdraw") {
    type = "withdraw";
    primary = "提现";
    secondary = note || "提现已扣除";
    status = "已完成";
  } else if (incoming && /(奖励|返利|收益|入账)/.test(note)) {
    type = "reward";
    primary = "入账";
  } else if (item.sourceType === "manual") {
    primary = incoming ? "入账" : "扣除";
  }

  return {
    id: `usdt-${item.id}`,
    assetCode: "USDT",
    amount,
    balanceAfter: item.balanceAfter == null ? null : Number(item.balanceAfter),
    createdAt: String(item.createdAt || ""),
    primary,
    secondary,
    status,
    type,
  };
}

function getAssetEntry(item: any): HistoryEntry {
  const amount = Number(item.amount ?? 0);
  const incoming = amount >= 0;
  const assetCode = String(item.assetCode || "").toUpperCase();
  const isTransfer = item.eventType === "transfer_in" || item.eventType === "transfer_out";
  const transfer = isTransfer
    ? getInternalTransferPresentation(item.note, item.eventType === "transfer_in" ? "in" : "out", item.counterpartyName)
    : null;
  return {
    id: `asset-${item.id}`,
    assetCode,
    amount,
    balanceAfter: item.balanceAfter == null ? null : Number(item.balanceAfter),
    createdAt: String(item.createdAt || ""),
    primary: transfer?.primary || (incoming ? "入账" : "扣除"),
    secondary: transfer?.secondary || cleanNote(item.note) || "数字资产调整",
    status: isTransfer ? (incoming ? "已入账" : "已扣除") : (incoming ? "已入账" : "已扣除"),
    type: isTransfer ? "transfer" : "adjustment",
  };
}

function amountDigits(assetCode: string) {
  return assetCode === "USDT" ? 2 : 8;
}

export default function CryptoWalletTransactions() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const query = new URLSearchParams(search);
  const viewAsUserId = restoreLedgerViewAsState(query.get("viewAs"));
  const walletQuery = viewAsUserId
    ? "?fromLedger=52&account=CRYPTO&viewAs=" + viewAsUserId
    : "?fromLedger=52&account=CRYPTO";
  const queryInput = viewAsUserId ? { viewAsUserId } : undefined;
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [assetFilter, setAssetFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const usdtHistoryQuery = trpc.ledger.afGetMyRechargeHistory.useQuery(
    { ledgerId: 52, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { staleTime: 30_000 },
  );
  const assetHistoryQuery = trpc.recharge.getMultiAssetHistory.useQuery(
    { limit: 100, ...(queryInput || {}) },
    { staleTime: 30_000 },
  );

  const allEntries = useMemo<HistoryEntry[]>(() => {
    const usdt = (usdtHistoryQuery.data ?? []).map((item: any) => getUsdtEntry(item));
    const assets = (assetHistoryQuery.data ?? [])
      // 担保冻结/解冻只改变可用与冻结分层，不是对外资金收支，不放入完整资金流水。
      .filter((item: any) => item.eventType !== "collateral_lock" && item.eventType !== "collateral_release")
      .map((item: any) => getAssetEntry(item));
    return [...usdt, ...assets]
      .filter((item) => item.assetCode === "USDT" || (AI_WALLET_SETTLEMENT_ASSETS as readonly string[]).includes(item.assetCode))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [assetHistoryQuery.data, usdtHistoryQuery.data]);

  const availableAssetCodes = useMemo(() => Array.from(new Set([
    "USDT",
    ...allEntries.map((entry) => entry.assetCode),
  ])), [allEntries]);

  const entries = useMemo(() => {
    const now = Date.now();
    const periodDays: Partial<Record<PeriodFilter, number>> = { "7d": 7, "30d": 30, "90d": 90 };
    const cutoff = periodDays[period] ? now - periodDays[period]! * 24 * 60 * 60 * 1000 : null;
    return allEntries.filter((entry) => {
      if (assetFilter !== "ALL" && entry.assetCode !== assetFilter) return false;
      if (typeFilter !== "all" && entry.type !== typeFilter) return false;
      if (cutoff != null) {
        const timestamp = new Date(entry.createdAt).getTime();
        if (Number.isNaN(timestamp) || timestamp < cutoff) return false;
      }
      return true;
    });
  }, [allEntries, assetFilter, period, typeFilter]);

  const isLoading = usdtHistoryQuery.isLoading || assetHistoryQuery.isLoading;
  const refresh = () => {
    void usdtHistoryQuery.refetch();
    void assetHistoryQuery.refetch();
  };

  return (
    <div className="min-h-screen pb-12" style={{ background: theme.bg }}>
      <header className="sticky top-0 z-20 border-b px-4 py-3" style={{ background: "rgba(13,13,13,.98)", borderColor: theme.border }}>
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setLocation(`/wallet${walletQuery}`)} className="rounded-full p-1.5" aria-label="返回数字币账户">
            <ArrowLeft className="h-6 w-6" style={{ color: theme.goldLight }} />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-base font-semibold tracking-wide" style={{ color: theme.goldLight }}>资金明细</p>
            <p className="mt-0.5 text-[10px]" style={{ color: theme.muted }}>数字币账户 · 全部真实资金流水</p>
          </div>
          <button onClick={refresh} className="rounded-full p-2" aria-label="刷新资金明细">
            <RefreshCw className="h-4 w-4" style={{ color: theme.gold }} />
          </button>
        </div>
      </header>

      <main className="space-y-3 px-4 pt-4">
        <section className="rounded-2xl p-3.5" style={{ background: theme.panel, border: `1px solid ${theme.border}` }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,.9)" }}>筛选明细</p>
              <p className="mt-0.5 text-[10px]" style={{ color: theme.muted }}>时段、币种和资金类型可组合筛选</p>
            </div>
            <span className="rounded-full px-2 py-1 text-[10px]" style={{ background: "rgba(201,168,76,.12)", color: theme.goldLight }}>{entries.length} 笔</span>
          </div>

          <div className="mt-3">
            <p className="mb-1.5 text-[10px] font-medium" style={{ color: theme.muted }}>时段</p>
            <div className="-mx-0.5 flex gap-1.5 overflow-x-auto px-0.5 pb-1">
              {periodOptions.map((option) => {
                const selected = period === option.value;
                return <button key={option.value} type="button" onClick={() => setPeriod(option.value)} className="h-7 shrink-0 rounded-full px-3 text-[11px] font-semibold" style={{ background: selected ? "linear-gradient(135deg, #F5D78E 0%, #C9A84C 100%)" : "rgba(255,255,255,.06)", color: selected ? "#15110A" : theme.muted, border: selected ? "1px solid transparent" : `1px solid ${theme.border}` }}>{option.label}</button>;
              })}
            </div>
          </div>

          <div className="mt-2">
            <p className="mb-1.5 text-[10px] font-medium" style={{ color: theme.muted }}>币种</p>
            <div className="-mx-0.5 flex gap-1.5 overflow-x-auto px-0.5 pb-1">
              {["ALL", ...availableAssetCodes].map((assetCode) => {
                const selected = assetFilter === assetCode;
                const iconSrc = assetCode === "ALL" ? null : getCryptoAssetIconSrc(assetCode);
                return <button key={assetCode} type="button" onClick={() => setAssetFilter(assetCode)} className="flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold" style={{ background: selected ? "linear-gradient(135deg, #F5D78E 0%, #C9A84C 100%)" : "rgba(255,255,255,.06)", color: selected ? "#15110A" : theme.muted, border: selected ? "1px solid transparent" : `1px solid ${theme.border}` }}>
                  {iconSrc && <img src={iconSrc} alt="" aria-hidden="true" className="h-3.5 w-3.5 rounded-full object-contain" />}
                  {assetCode === "ALL" ? "全部币种" : assetCode}
                </button>;
              })}
            </div>
          </div>

          <div className="mt-2">
            <p className="mb-1.5 text-[10px] font-medium" style={{ color: theme.muted }}>类型</p>
            <div className="-mx-0.5 flex gap-1.5 overflow-x-auto px-0.5 pb-1">
              {typeOptions.map((option) => {
                const selected = typeFilter === option.value;
                return <button key={option.value} type="button" onClick={() => setTypeFilter(option.value)} className="h-7 shrink-0 rounded-full px-3 text-[11px] font-semibold" style={{ background: selected ? "rgba(201,168,76,.22)" : "rgba(255,255,255,.06)", color: selected ? theme.goldLight : theme.muted, border: `1px solid ${selected ? "rgba(201,168,76,.52)" : theme.border}` }}>{option.label}</button>;
              })}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl" style={{ background: theme.panel, border: `1px solid ${theme.border}` }}>
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin" style={{ color: theme.gold }} /></div>
          ) : entries.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,.78)" }}>此筛选条件下暂无资金明细</p>
              <p className="mt-1 text-xs" style={{ color: theme.muted }}>可调整时段、币种或类型后再查看</p>
            </div>
          ) : (
            <div>
              {entries.map((entry, index) => {
                const iconSrc = getCryptoAssetIconSrc(entry.assetCode);
                const incoming = entry.amount >= 0;
                return <div key={entry.id} className="flex items-start justify-between gap-3 px-4 py-3.5" style={{ borderBottom: index < entries.length - 1 ? `1px solid ${theme.divider}` : "none" }}>
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,.06)", border: `1px solid ${theme.border}` }}>
                      {iconSrc ? <img src={iconSrc} alt={`${entry.assetCode} 币种图标`} className="h-full w-full object-contain" /> : <span className="text-xs font-bold" style={{ color: theme.goldLight }}>{entry.assetCode.slice(0, 1)}</span>}
                      <span className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border-2" style={{ background: incoming ? theme.green : theme.red, borderColor: theme.panel }} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" style={{ color: "rgba(255,255,255,.9)" }}>{entry.primary} <span className="font-normal" style={{ color: theme.muted }}>· {entry.assetCode}</span></p>
                      <p className="mt-0.5 text-[11px]" style={{ color: theme.muted }}>{formatTime(entry.createdAt)}</p>
                      <p className="mt-1 max-w-52 truncate text-[10px]" style={{ color: theme.muted }}>{entry.secondary}</p>
                      <p className="mt-1 text-[10px]" style={{ color: theme.muted }}>{entry.status}{entry.balanceAfter != null ? ` · 该笔后余额 ${entry.balanceAfter.toLocaleString("zh-CN", { maximumFractionDigits: amountDigits(entry.assetCode) })} ${entry.assetCode}` : ""}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums" style={{ color: incoming ? theme.green : theme.red }}>{incoming ? "+" : "-"}{Math.abs(entry.amount).toLocaleString("zh-CN", { minimumFractionDigits: entry.assetCode === "USDT" ? 2 : 0, maximumFractionDigits: amountDigits(entry.assetCode) })}</p>
                    <p className="mt-0.5 text-[10px] font-medium" style={{ color: theme.muted }}>{entry.assetCode}</p>
                  </div>
                </div>;
              })}
            </div>
          )}
        </section>

        <p className="px-1 text-center text-[10px] leading-4" style={{ color: theme.muted }}>仅展示真实影响资产余额的流水；担保冻结和解冻仅改变可用/冻结分层，不在资金明细中重复展示。</p>
      </main>
    </div>
  );
}
