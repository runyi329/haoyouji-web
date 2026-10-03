import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, RefreshCw } from "lucide-react";
import { trpc } from "../lib/trpc";
import { restoreLedgerViewAsState } from "../lib/authIdentity";
import { getCryptoAssetIconSrc } from "../lib/cryptoAssetIcons";
import { getInternalTransferPresentation } from "../lib/walletTransferPresentation";
import { AI_WALLET_SETTLEMENT_ASSETS } from "@shared/ai-wallet-assets";

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "时间未知";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

function cleanNote(value: unknown) {
  return String(value || "")
    .replace(/^\[CNY\]\s*/i, "")
    .replace(/\[站内转账\]\s*/g, "")
    .trim();
}

function summarizeNote(value: unknown) {
  const note = cleanNote(value).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!note) return "";
  if (/历史.*手工/.test(note) && /担保/.test(note) && /应收账款/.test(note)) {
    return /解冻|释放/.test(note) ? "历史手工担保 · 应收账款解冻" : "历史手工担保 · 应收账款冻结";
  }
  if (/应收账款/.test(note) && /冻结|占用/.test(note)) return "应收账款冻结";
  if (/应收账款/.test(note) && /解冻|释放/.test(note)) return "应收账款解冻";
  return note.length > 40 ? `${note.slice(0, 40).replace(/[，、；\s]+$/, "")}…` : note;
}

function getCnyFlowPresentation(noteValue: unknown, isIn: boolean) {
  const rawNote = cleanNote(noteValue);
  const detail = summarizeNote(noteValue);
  const transfer = getInternalTransferPresentation(String(noteValue || ""), isIn ? "in" : "out");
  if (transfer) return { primary: transfer.primary, secondary: transfer.secondary || detail, status: isIn ? "已入账" : "已扣除" };
  if (/担保.*(冻结|占用)|冻结/.test(rawNote)) return { primary: "担保冻结", secondary: detail, status: "担保" };
  if (/解冻|释放/.test(rawNote)) return { primary: "担保解冻", secondary: detail, status: "已恢复" };
  if (/提现/.test(rawNote)) return { primary: "提现", secondary: detail, status: "已扣除" };
  if (/充值/.test(rawNote)) return { primary: "充值到账", secondary: detail, status: "已入账" };
  if (/退款/.test(rawNote)) return { primary: "退款", secondary: detail, status: "已入账" };
  if (/(订单|谷底|征筹|增筹|净收益|卖出|成交|结算|委托|融资)/.test(rawNote)) return { primary: isIn ? "订单入账" : "订单扣除", secondary: detail, status: isIn ? "已入账" : "已扣除" };
  if (/手工|手动|调账/.test(rawNote)) return { primary: isIn ? "入账" : "扣除", secondary: detail, status: isIn ? "已入账" : "已扣除" };
  return { primary: isIn ? "入账" : "扣除", secondary: detail, status: isIn ? "已入账" : "已扣除" };
}

export default function WalletCnyTransactions() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const isYaban = params.get("from") === "yaban";
  const viewAsUserId = restoreLedgerViewAsState(params.get("viewAs"));
  const sourceLedgerId = params.get("fromLedger") === "37" ? "37" : "52";
  const walletQuery = viewAsUserId ? `?fromLedger=${sourceLedgerId}&account=CNY&viewAs=${viewAsUserId}` : `?fromLedger=${sourceLedgerId}&account=CNY`;
  const walletQueryForAccount = (account: "USDT" | "CNY" | "CRYPTO") => viewAsUserId
    ? `?fromLedger=${sourceLedgerId}&account=${account}&viewAs=${viewAsUserId}`
    : `?fromLedger=${sourceLedgerId}&account=${account}`;
  const switchAsset = (asset: string) => {
    if (asset === "CNY") return;
    if (asset === "USDT") return setLocation(`/wallet/transactions${walletQueryForAccount("USDT")}`);
    setLocation(`/wallet/asset-transactions?asset=${encodeURIComponent(asset)}&fromLedger=${sourceLedgerId}&account=CRYPTO${viewAsUserId ? `&viewAs=${viewAsUserId}` : ""}`);
  };
  const [filter, setFilter] = useState<"all" | "in" | "out">("all");

  const cnyBalanceQuery = trpc.recharge.getCnyBalance.useQuery();
  const cnyBalanceSummaryQuery = trpc.recharge.getCnyBalanceSummary.useQuery();
  const cnyHistoryQuery = trpc.recharge.getCnyHistory.useQuery({ limit: 200 });

  const cnyBalance = typeof cnyBalanceQuery.data === "number" ? cnyBalanceQuery.data : 0;
  const cnySummary = cnyBalanceSummaryQuery.data ?? { total: cnyBalance, frozen: 0, available: cnyBalance };

  const allTx = (cnyHistoryQuery.data ?? []).map((m: any) => {
    const rawNote = (m.note || "").replace(/^\[CNY\]/, "");
    const isIn = Number(m.amount) > 0;
    const presentation = getCnyFlowPresentation(m.note, isIn);
    const wcCode = extractWcTeamCode(rawNote);
    return {
      id: m.id,
      amount: Math.abs(Number(m.amount)),
      isIn,
      balanceAfter: Number(m.balance_after),
      availableAfter: Number(m.available_after),
      primaryLabel: presentation.primary,
      secondaryLabel: presentation.secondary,
      status: presentation.status,
      wcCode,
      createdAt: m.created_at,
    };
  });

  const filtered = allTx.filter((tx) => {
    if (filter === "in") return tx.isIn;
    if (filter === "out") return !tx.isIn;
    return true;
  });

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
          <select value="CNY" onChange={(event) => switchAsset(event.target.value)} className="ml-auto max-w-[104px] rounded-lg border border-white/30 bg-white/10 px-2 py-1 text-xs font-semibold text-white outline-none" aria-label="切换明细币种">
            <option value="USDT">USDT</option><option value="CNY">CNY</option>{AI_WALLET_SETTLEMENT_ASSETS.map((asset) => <option key={asset} value={asset}>{asset}</option>)}
          </select>
          <button
            onClick={() => { cnyBalanceQuery.refetch(); cnyBalanceSummaryQuery.refetch(); cnyHistoryQuery.refetch(); }}
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
              <div className="mt-2 flex gap-3 text-xs">
                <span className="text-gray-400">可用 <b className="font-semibold text-[#0E5A9E]">{Number(cnySummary.available).toFixed(2)}</b></span>
                {Number(cnySummary.frozen) > 0 && <span className="text-gray-400">冻结 <b className="font-semibold text-[#5A7A92]">{Number(cnySummary.frozen).toFixed(2)}</b></span>}
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
                            {tx.primaryLabel}
                          </div>
                        )}
                        <div className="text-xs mt-0.5 text-gray-400">{formatTime(tx.createdAt)}{tx.secondaryLabel ? ` · ${tx.secondaryLabel}` : ""}</div>
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

  // ============ 全局钱包黑金主题 ============
  return (
    <div
      className="min-h-screen"
      style={{ background: "#0d0d0d" }}
    >
      <div
        className="sticky top-0 z-20 flex items-center justify-between px-4 py-3"
        style={{
          background: "rgba(13,13,13,0.95)",
          borderBottom: "1px solid rgba(201,168,76,0.22)",
          backdropFilter: "blur(10px)",
        }}
      >
        <button
          onClick={() => setLocation(`/wallet${walletQuery}`)}
          className="flex items-center justify-center w-9 h-9 rounded-full"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(201,168,76,0.22)" }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: "#F5D78E" }} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-base font-semibold tracking-wide" style={{ color: "#F5D78E" }}>资金明细</p>
          <p className="mt-0.5 text-[10px]" style={{ color: "rgba(255,255,255,0.48)" }}>人民币账户 · 全部真实资金流水</p>
        </div>
        <button
          onClick={() => { cnyBalanceQuery.refetch(); cnyBalanceSummaryQuery.refetch(); cnyHistoryQuery.refetch(); }}
          className="flex items-center justify-center w-9 h-9 rounded-full"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(201,168,76,0.22)" }}
        >
          <RefreshCw className="w-4 h-4" style={{ color: "#C9A84C" }} />
        </button>
      </div>

      <main className="space-y-3 px-4 pb-12 pt-4">
        <section className="rounded-2xl p-3.5" style={{ background: "#171717", border: "1px solid rgba(201,168,76,0.22)" }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,.9)" }}>筛选明细</p>
              <p className="mt-0.5 text-[10px]" style={{ color: "rgba(255,255,255,.48)" }}>查看全部、收入或支出资金流水</p>
            </div>
            <span className="rounded-full px-2 py-1 text-[10px]" style={{ background: "rgba(201,168,76,.12)", color: "#F5D78E" }}>{filtered.length} 笔</span>
          </div>
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {(["all", "in", "out"] as const).map((f) => {
              const selected = filter === f;
              return <button key={f} type="button" onClick={() => setFilter(f)} className="h-7 shrink-0 rounded-full px-3 text-[11px] font-semibold" style={{ background: selected ? "linear-gradient(135deg, #F5D78E 0%, #C9A84C 100%)" : "rgba(255,255,255,.06)", color: selected ? "#15110A" : "rgba(255,255,255,.48)", border: selected ? "1px solid transparent" : "1px solid rgba(201,168,76,0.22)" }}>{f === "all" ? "全部类型" : f === "in" ? "收入" : "支出"}</button>;
            })}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl" style={{ background: "#171717", border: "1px solid rgba(201,168,76,0.22)" }}>
          {cnyHistoryQuery.isLoading ? (
            <div className="py-20 text-center text-xs" style={{ color: "rgba(255,255,255,.25)" }}>加载中...</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,.78)" }}>此筛选条件下暂无资金明细</p>
              <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,.48)" }}>可调整筛选条件后再查看</p>
            </div>
          ) : (
            <div>
              {filtered.map((tx, index) => {
                const iconSrc = tx.wcCode ? `/flags/${tx.wcCode}.png` : getCryptoAssetIconSrc("CNY");
                return <div key={tx.id} className="flex items-start justify-between gap-3 px-4 py-3.5" style={{ borderBottom: index < filtered.length - 1 ? "1px solid rgba(255,255,255,.07)" : "none" }}>
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(201,168,76,0.22)" }}>
                      {iconSrc ? <img src={iconSrc} alt={tx.wcCode ? tx.wcCode : "人民币图标"} className="h-full w-full object-cover" /> : <span className="text-xs font-bold" style={{ color: "#F5D78E" }}>¥</span>}
                      <span className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border-2" style={{ background: tx.isIn ? "#34d399" : "#f87171", borderColor: "#171717" }} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" style={{ color: "rgba(255,255,255,.9)" }}>{tx.primaryLabel} <span className="font-normal" style={{ color: "rgba(255,255,255,.48)" }}>· CNY</span></p>
                      <p className="mt-0.5 text-[11px]" style={{ color: "rgba(255,255,255,.48)" }}>{formatTime(tx.createdAt)}</p>
                      {tx.secondaryLabel && <p className="mt-1 max-w-52 truncate text-[10px]" style={{ color: "rgba(255,255,255,.48)" }}>{tx.secondaryLabel}</p>}
                      <p className="mt-1 text-[10px]" style={{ color: "rgba(255,255,255,.48)" }}>{tx.status}</p>
                    </div>
                  </div>
                  <div className="w-[108px] shrink-0 text-right">
                    <p className="whitespace-nowrap text-sm font-bold tabular-nums" style={{ color: tx.isIn ? "#34d399" : "#f87171" }}>{tx.isIn ? "+" : "-"}¥{tx.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    {Number.isFinite(tx.balanceAfter) && <p className="mt-0.5 text-[10px] tabular-nums" style={{ color: "rgba(255,255,255,.48)" }}>余额 ¥{tx.balanceAfter.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
                    {Number.isFinite(tx.availableAfter) && <p className="mt-0.5 text-[10px] tabular-nums" style={{ color: "rgba(255,255,255,.48)" }}>可用 ¥{tx.availableAfter.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
                  </div>
                </div>;
              })}
            </div>
          )}
        </section>

        <p className="px-1 text-center text-[10px] leading-4" style={{ color: "rgba(255,255,255,.48)" }}>仅展示真实影响人民币余额的流水；担保仅改变可用额，已在每笔明细中体现。</p>
      </main>
    </div>
  );
}
