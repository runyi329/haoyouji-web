import { useState } from "react";
import { useLocation, useSearch } from "wouter";
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

// 从交易备注中提取世界杯球队 code（大写），如 [ES] → 'es'
function extractWcTeamCode(note: string): string | null {
  const isWcRelated = note.includes('世界杯投注') || note.includes('订单作废-退回投注');
  if (!isWcRelated) return null;
  const codeMatch = note.match(/\[([A-Z]{2,10})\]/);
  if (codeMatch) return codeMatch[1].toLowerCase();
  const nameToCode: Record<string, string> = {
    '西班牙': 'es', '法国': 'fr', '英格兰': 'gb-eng', '巴西': 'br', '阿根廷': 'ar',
    '葡萄牙': 'pt', '德国': 'de', '荷兰': 'nl', '挪威': 'no', '比利时': 'be',
    '哥伦比亚': 'co', '摩洛哥': 'ma', '日本': 'jp', '美国': 'us', '瑞士': 'ch',
    '乌拉圭': 'uy', '墨西哥': 'mx', '厄瓜多尔': 'ec', '克罗地亚': 'hr', '土耳其': 'tr',
    '塞内加尔': 'sn', '瑞典': 'se', '奥地利': 'at', '苏格兰': 'gb-sct', '加拿大': 'ca',
    '科特迪瓦': 'ci', '巴拉圭': 'py', '捷克': 'cz', '埃及': 'eg', '波黑': 'ba',
    '韩国': 'kr', '阿尔及利亚': 'dz', '加纳': 'gh', '澳大利亚': 'au', '突尼斯': 'tn',
    '伊朗': 'ir', '刚果民主共和国': 'cd', '南非': 'za', '沙特阿拉伯': 'sa', '巴拿马': 'pa',
    '卡塔尔': 'qa', '佛得角': 'cv', '新西兰': 'nz', '伊拉克': 'iq', '乌兹别克斯坦': 'uz',
    '库拉索': 'cw', '约旦': 'jo', '海地': 'ht',
  };
  for (const [name, code] of Object.entries(nameToCode)) {
    if (note.includes(name)) return code;
  }
  return null;
}

export default function WalletCnyTransactions() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const isYaban = new URLSearchParams(search).get("from") === "yaban";
  const [filter, setFilter] = useState<"all" | "in" | "out">("all");

  const cnyBalanceQuery = trpc.recharge.getCnyBalance.useQuery();
  const cnyHistoryQuery = trpc.recharge.getCnyHistory.useQuery({ limit: 200 });

  const cnyBalance = typeof cnyBalanceQuery.data === "number" ? cnyBalanceQuery.data : 0;

  const allTx = (cnyHistoryQuery.data ?? []).map((m: any) => {
    const rawNote = (m.note || "").replace(/^\[CNY\]/, "");
    const wcCode = extractWcTeamCode(rawNote);
    return {
      id: m.id,
      amount: Math.abs(Number(m.amount)),
      isIn: Number(m.amount) > 0,
      note: rawNote,
      wcCode,
      createdAt: m.created_at,
    };
  });

  const filtered = allTx.filter((tx) => {
    if (filter === "in") return tx.isIn;
    if (filter === "out") return !tx.isIn;
    return true;
  });

  const totalIn = allTx.filter((t) => t.isIn).reduce((s, t) => s + t.amount, 0);
  const totalOut = allTx.filter((t) => !t.isIn).reduce((s, t) => s + t.amount, 0);

  // ============ 牙伴蓝白主题 ============
  if (isYaban) {
    return (
      <div className="min-h-screen" style={{ background: "#F4F8FB" }}>
        {/* 顶部导航 */}
        <div
          className="sticky top-0 z-20 flex items-center justify-between px-4 py-3"
          style={{ background: "linear-gradient(135deg,#2196C8,#3BA9E0)" }}
        >
          <button
            onClick={() => setLocation("/yaban/wallet")}
            className="flex items-center justify-center w-9 h-9 rounded-full"
            style={{ background: "rgba(255,255,255,0.18)" }}
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <span className="text-base font-bold text-white">人民币明细</span>
          <button
            onClick={() => { cnyBalanceQuery.refetch(); cnyHistoryQuery.refetch(); }}
            className="flex items-center justify-center w-9 h-9 rounded-full"
            style={{ background: "rgba(255,255,255,0.18)" }}
          >
            <RefreshCw className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="px-4 pb-24 pt-4 space-y-4">
          {/* 余额 + 统计卡片 */}
          <div
            className="rounded-2xl p-5"
            style={{ background: "#fff", boxShadow: "0 4px 16px rgba(33,150,200,0.12)" }}
          >
            <div className="mb-4">
              <div className="text-xs mb-1 text-gray-400">当前余额</div>
              <div className="flex items-baseline space-x-2">
                <span className="text-4xl font-bold tabular-nums text-[#0E5A9E]">
                  {cnyBalance.toFixed(2)}
                </span>
                <span className="text-base font-medium text-[#1E88D6]">CNY</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "rgba(34,197,94,0.12)" }}>
                  <ArrowDownCircle className="w-4 h-4 text-green-500" />
                </div>
                <div>
                  <div className="text-xs text-gray-400">累计充值</div>
                  <div className="text-sm font-bold tabular-nums text-green-600">+{totalIn.toFixed(2)}</div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "rgba(239,68,68,0.1)" }}>
                  <ArrowUpCircle className="w-4 h-4 text-red-500" />
                </div>
                <div>
                  <div className="text-xs text-gray-400">累计提现</div>
                  <div className="text-sm font-bold tabular-nums text-red-500">-{totalOut.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 筛选 Tab */}
          <div className="flex rounded-xl p-1" style={{ background: "#E8F3FA" }}>
            {(["all", "in", "out"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                style={
                  filter === f
                    ? { background: "#1E88D6", color: "#fff" }
                    : { color: "#5A7A92", background: "transparent" }
                }
              >
                {f === "all" ? "全部" : f === "in" ? "充值" : "提现"}
              </button>
            ))}
          </div>

          {/* 流水列表 */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "#fff", boxShadow: "0 4px 16px rgba(33,150,200,0.1)" }}>
            {cnyHistoryQuery.isLoading ? (
              <div className="py-12 text-center text-xs text-gray-400">加载中...</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400">
                暂无{filter === "in" ? "充值" : filter === "out" ? "提现" : ""}记录
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filtered.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                        style={{ background: tx.isIn ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.08)" }}
                      >
                        {tx.wcCode ? (
                          <img
                            src={`/flags/${tx.wcCode}.png`}
                            alt={tx.wcCode}
                            className="w-9 h-9 object-cover rounded-full"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          tx.isIn
                            ? <ArrowDownCircle className="w-4 h-4 text-green-500" />
                            : <ArrowUpCircle className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                      <div>
                        {!tx.wcCode && (
                          <div className="text-sm font-medium text-gray-700">
                            {tx.note || (tx.isIn ? "充值" : "提现")}
                          </div>
                        )}
                        <div className="text-xs mt-0.5 text-gray-400">{formatTime(tx.createdAt)}</div>
                      </div>
                    </div>
                    <div className="text-base font-bold tabular-nums" style={{ color: tx.isIn ? "#16a34a" : "#ef4444" }}>
                      {tx.isIn ? "+" : "-"}{tx.amount.toFixed(2)}
                      <span className="text-xs font-normal ml-1 text-gray-400">CNY</span>
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

  // ============ 原黑红主题 ============
  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(160deg, #0d0d0d 0%, #1a1a1a 50%, #111111 100%)" }}
    >
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
        <div
          className="relative rounded-2xl overflow-hidden p-5"
          style={{
            background: "linear-gradient(135deg, #130000 0%, #2a0a0a 45%, #1a0000 100%)",
            border: "1px solid rgba(229,57,53,0.45)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
          }}
        >
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
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                      style={{
                        background: tx.isIn ? "rgba(74,222,128,0.12)" : "rgba(248,113,113,0.12)",
                      }}
                    >
                      {tx.wcCode ? (
                        <img
                          src={`/flags/${tx.wcCode}.png`}
                          alt={tx.wcCode}
                          className="w-9 h-9 object-cover rounded-full"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).parentElement!.innerHTML = tx.isIn
                              ? '<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>'
                              : '<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="16 12 12 8 8 12"/><line x1="12" y1="16" x2="12" y2="8"/></svg>';
                          }}
                        />
                      ) : (
                        tx.isIn
                          ? <ArrowDownCircle className="w-4 h-4 text-green-400" />
                          : <ArrowUpCircle className="w-4 h-4 text-red-400" />
                      )}
                    </div>
                    <div>
                      {!tx.wcCode && (
                        <div className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.85)" }}>
                          {tx.note || (tx.isIn ? "充值" : "提现")}
                        </div>
                      )}
                      <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                        {formatTime(tx.createdAt)}
                      </div>
                    </div>
                  </div>
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
