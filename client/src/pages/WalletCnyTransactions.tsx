import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, RefreshCw } from "lucide-react";
import { trpc } from "../lib/trpc";

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0)
    return `今天 ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  if (days === 1)
    return `昨天 ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  if (days < 7) return `${days}天前`;
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "numeric", day: "numeric" });
}

export default function WalletCnyTransactions() {
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState<"all" | "in" | "out">("all");

  const cnyBalanceQuery = trpc.recharge.getCnyBalance.useQuery();
  const cnyHistoryQuery = trpc.recharge.getCnyHistory.useQuery({ limit: 200 });

  const cnyBalance = typeof cnyBalanceQuery.data === "number" ? cnyBalanceQuery.data : 0;

  const allTx = (cnyHistoryQuery.data ?? []).map((m: any) => ({
    id: m.id,
    amount: Math.abs(Number(m.amount)),
    isIn: Number(m.amount) > 0,
    note: (m.note || "").replace(/^\[CNY\]/, ""),
    createdAt: m.created_at,
  }));

  const filtered = allTx.filter((tx) => {
    if (filter === "in") return tx.isIn;
    if (filter === "out") return !tx.isIn;
    return true;
  });

  // 统计
  const totalIn = allTx.filter((t) => t.isIn).reduce((s, t) => s + t.amount, 0);
  const totalOut = allTx.filter((t) => !t.isIn).reduce((s, t) => s + t.amount, 0);

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(160deg, #0d0d0d 0%, #1a1a1a 50%, #111111 100%)" }}
    >
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between px-4 py-3"
        style={{
          background: "rgba(13,13,13,0.95)",
          borderBottom: "1px solid rgba(229,57,53,0.2)",
          backdropFilter: "blur(10px)",
        }}
      >
        <button
          onClick={() => setLocation("/wallet")}
          className="flex items-center justify-center w-9 h-9 rounded-full"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(229,57,53,0.3)" }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: "#ff8a80" }} />
        </button>
        <span className="text-base font-bold tracking-widest" style={{ color: "#ff8a80" }}>
          人民币明细
        </span>
        <button
          onClick={() => { cnyBalanceQuery.refetch(); cnyHistoryQuery.refetch(); }}
          className="flex items-center justify-center w-9 h-9 rounded-full"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(229,57,53,0.3)" }}
        >
          <RefreshCw className="w-4 h-4" style={{ color: "#e53935" }} />
        </button>
      </div>

      <div className="px-4 pb-24 pt-4 space-y-4">
        {/* 余额 + 统计卡片 */}
        <div
          className="relative rounded-2xl overflow-hidden p-5"
          style={{
            background: "linear-gradient(135deg, #130000 0%, #2a0a0a 45%, #1a0000 100%)",
            border: "1px solid rgba(229,57,53,0.45)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
          }}
        >
          {/* 红色高光线 */}
          <div
            className="absolute inset-x-0 top-0 h-px"
            style={{
              background: "linear-gradient(90deg, transparent 5%, #ff8a80 40%, #e53935 60%, transparent 95%)",
            }}
          />
          <div className="mb-4">
            <div className="text-xs mb-1" style={{ color: "rgba(229,57,53,0.5)" }}>当前余额</div>
            <div className="flex items-baseline space-x-2">
              <span className="text-4xl font-bold tabular-nums" style={{ color: "#ff8a80", textShadow: "0 0 20px rgba(229,57,53,0.3)" }}>
                {cnyBalance.toFixed(2)}
              </span>
              <span className="text-base font-medium" style={{ color: "rgba(255,138,128,0.6)" }}>CNY</span>
            </div>
          </div>
          <div
            className="grid grid-cols-2 gap-3 pt-3"
            style={{ borderTop: "1px solid rgba(229,57,53,0.15)" }}
          >
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "rgba(74,222,128,0.15)" }}>
                <ArrowDownCircle className="w-4 h-4 text-green-400" />
              </div>
              <div>
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>累计充值</div>
                <div className="text-sm font-bold tabular-nums text-green-400">+{totalIn.toFixed(2)}</div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "rgba(248,113,113,0.15)" }}>
                <ArrowUpCircle className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>累计提现</div>
                <div className="text-sm font-bold tabular-nums text-red-400">-{totalOut.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* 筛选 Tab */}
        <div
          className="flex rounded-xl p-1"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {(["all", "in", "out"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
              style={
                filter === f
                  ? { background: "rgba(229,57,53,0.25)", color: "#ff8a80", border: "1px solid rgba(229,57,53,0.4)" }
                  : { color: "rgba(255,255,255,0.35)" }
              }
            >
              {f === "all" ? "全部" : f === "in" ? "充值" : "提现"}
            </button>
          ))}
        </div>

        {/* 流水列表 */}
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #111111 0%, #1e1e1e 100%)",
            border: "1px solid rgba(229,57,53,0.2)",
          }}
        >
          {cnyHistoryQuery.isLoading ? (
            <div className="py-12 text-center text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
              加载中...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
              暂无{filter === "in" ? "充值" : filter === "out" ? "提现" : ""}记录
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              {filtered.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between px-5 py-4">
                  {/* 左侧 */}
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        background: tx.isIn ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                      }}
                    >
                      {tx.isIn
                        ? <ArrowDownCircle className="w-4 h-4 text-green-400" />
                        : <ArrowUpCircle className="w-4 h-4 text-red-400" />
                      }
                    </div>
                    <div>
                      <div className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.85)" }}>
                        {tx.note || (tx.isIn ? "充值" : "提现")}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                        {formatTime(tx.createdAt)}
                      </div>
                    </div>
                  </div>
                  {/* 右侧金额 */}
                  <div
                    className="text-base font-bold tabular-nums"
                    style={{ color: tx.isIn ? "#4ade80" : "#f87171" }}
                  >
                    {tx.isIn ? "+" : "-"}{tx.amount.toFixed(2)}
                    <span className="text-xs font-normal ml-1" style={{ color: "rgba(255,255,255,0.3)" }}>
                      CNY
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
