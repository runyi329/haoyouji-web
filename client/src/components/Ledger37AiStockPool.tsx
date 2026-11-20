import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { Ledger37AiStockPool } from "@shared/ledger37-ai-presentation";
import { buildLedger37AiStockPoolChart } from "@/lib/ledger37AiStockPool";
import { r1ParticipationMoney } from "@/lib/r1StockPresentation";

export function Ledger37AiStockPoolRenderer({ pool, loading = false, error = false, updating = false }: {
  pool?: Ledger37AiStockPool; loading?: boolean; error?: boolean; updating?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const model = buildLedger37AiStockPoolChart(pool?.stocks ?? []);
  const holdingCount = model.rows.filter(row => row.status === "holding").length;
  const closedCount = model.rows.filter(row => row.status === "closed").length;
  return <section aria-label="AI选股池" className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
    <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="flex min-h-[48px] w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF6900]">
      <h2 className="text-[15px] font-semibold text-[#1F2937]">AI选股池</h2>
      <span className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-[#FFF1E7] px-2 py-1 text-[11px] tabular-nums text-[#C75512]">{pool ? `${model.rows.length} 只` : "—"}</span><ChevronDown size={16} className={`text-[#8B8D93] transition-transform ${expanded ? "rotate-180" : ""}`} /></span>
    </button>
    {expanded && <div className="border-t border-[#F1F1F1]">
      {error ? <p role="alert" className="px-4 py-6 text-center text-xs leading-6 text-[#8B8D93]">选股池暂不可用，请稍后重试</p>
        : loading || !pool ? <div role="status" className="flex items-center justify-center gap-2 px-4 py-6 text-xs text-[#8B8D93]"><Loader2 size={16} className="animate-spin" />正在加载选股池…</div>
          : model.rows.length === 0 ? <p className="px-4 py-7 text-center text-xs text-[#8B8D93]">暂无股票记录</p> : <>
            <div className="flex items-center gap-4 px-4 py-4">
              <div role="img" aria-label={model.gradient ? `股票分配收益构成：${model.rows.filter(row => row.share !== null).map(row => `${row.label} ${row.share!.toFixed(1)}%`).join("，")}。扇区按收益金额绝对值，不表示资金比例或收益率。` : "暂无可绘制的分配收益构成"} className="relative h-[112px] w-[112px] shrink-0 rounded-full border-[5px] border-white shadow-sm" style={{ background: model.gradient || "#ECEDEF" }}>
                <div className="absolute inset-[18px] flex flex-col items-center justify-center rounded-full bg-white"><span className="text-[10px] text-[#8B8D93]">选股池</span><span className="mt-1 text-xl font-semibold tabular-nums text-[#1F2937]">{model.rows.length}</span></div>
              </div>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#1F2937]">收益构成</p><dl className="mt-2 space-y-1 text-xs"><div className="flex justify-between gap-2"><dt className="text-[#8B8D93]">当前</dt><dd className="tabular-nums text-[#1F2937]">{holdingCount}</dd></div><div className="flex justify-between gap-2"><dt className="text-[#8B8D93]">已结束</dt><dd className="tabular-nums text-[#1F2937]">{closedCount}</dd></div></dl><p className="mt-2 text-[10px] leading-5 text-[#8B8D93]">{model.gradient ? "扇区展示分配收益构成" : "暂无分配收益构成"}</p></div>
            </div>
            <div className="flex items-center justify-between gap-3 bg-[#FAFAFA] px-4 py-2 text-[11px] text-[#8B8D93]"><span>全部股票</span><span>分配收益 · 人民币</span></div>
            <div role="list" className="divide-y divide-[#F1F1F1]">{model.rows.map(row => <button type="button" key={row.key} role="listitem" onClick={() => setSelectedKey(value => value === row.key ? null : row.key)} aria-label={`${row.label} ${row.symbol} 分配收益 ${row.hasParticipation ? r1ParticipationMoney(row.pnlCny) : "未参与"}`} className={`flex min-h-[48px] w-full items-center gap-2 px-4 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF6900] ${selectedKey === row.key ? "bg-[#FFF8F0]" : "bg-white"}`}>
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
              <span className="min-w-0 flex-1"><span className="block break-words text-xs font-medium leading-5 text-[#1F2937]">{row.label}</span><span className="flex flex-wrap items-center gap-x-1.5 text-[10px] leading-5 text-[#8B8D93]"><span className="break-all">{row.symbol}</span><span>{row.currency}</span><span className={`rounded px-1 text-[9px] ${row.status === "closed" ? "bg-[#F3F4F6]" : "bg-[#FFF1E7] text-[#C75512]"}`}>{row.status === "closed" ? "已结束" : "当前"}</span></span></span>
              <span className="min-w-0 max-w-[44%] text-right"><span className={`block break-words text-xs font-semibold tabular-nums [overflow-wrap:anywhere] ${row.pnlCny === null ? "text-[#8B8D93]" : row.pnlCny > 0 ? "text-[#D32F2F]" : row.pnlCny < 0 ? "text-[#2E7D32]" : "text-[#1F2937]"}`}>{row.hasParticipation ? r1ParticipationMoney(row.pnlCny) : "未参与"}</span><span className="block text-[10px] tabular-nums text-[#8B8D93]">{row.share === null ? row.hasParticipation && row.pnlCny === null ? "待更新" : "" : `${row.share.toFixed(1)}%`}</span></span>
            </button>)}</div>
            <div className="border-t border-[#F1F1F1] px-4 py-2.5 text-[10px] leading-5 text-[#8B8D93]">按已确认分配收益的绝对值构成，不是资金比例或收益率。{model.hasPending && " 部分收益待更新。"}</div>
          </>}
    </div>}
    <p role="status" className="sr-only">{updating ? "后台更新中，保留当前选股池" : "选股池股票完整展示"}</p>
  </section>;
}

export default function Ledger37AiStockPool({ viewerUserId, adminPreview = false }: { viewerUserId: number; adminPreview?: boolean }) {
  const query = trpc.ledger.getMyLedger37AiStockPool.useQuery(
    { ledgerId: 37, viewAsUserId: viewerUserId },
    { enabled: Number.isSafeInteger(viewerUserId) && viewerUserId > 0, placeholderData: undefined, retry: false, staleTime: 10_000, refetchInterval: 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true },
  );
  const pool = !query.error && query.data?.viewerUserId === viewerUserId && (query.data.aiEnabled || adminPreview) ? query.data : undefined;
  return <Ledger37AiStockPoolRenderer key={viewerUserId} pool={pool} loading={!pool && !query.error} error={Boolean(query.error)} updating={query.isFetching} />;
}
