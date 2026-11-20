import { ArrowLeft, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { isR1StockPresentationScope, type R1AiParticipationPortfolio, type R1AiParticipationRow, type R1AiParticipationSummary } from "@shared/r1-stock-presentation";
import { r1ParticipationMoney, r1ParticipationQuantity, r1ParticipationToCny, r1RecordedMarginAmount, r1SummaryAtDisplayFx } from "@/lib/r1StockPresentation";

const participationStatus: Record<R1AiParticipationRow["status"], string> = {
  pending: "待开始", active: "进行中", paused: "已暂停", closed: "已结束",
};

function ParticipationSummary({ summary }: { summary: R1AiParticipationSummary }) {
  // 纯展示色彩，不改变收益符号、金额或未知值。函数内定义以兼容独立 renderer 测试。
  const pnlTone = (value: number | null) => value == null || !Number.isFinite(value)
    ? "text-gray-500" : value === 0 ? "text-[#142A3F]" : value > 0 ? "text-[#D32F2F]" : "text-[#2E7D32]";
  // DTO summary 已是人民币，直接展示；不能从行数据再次累加或换汇。
  return <dl className="overflow-hidden rounded-xl border border-[#DCE7F0]">
    {[
      { label: "当前分配收益", value: summary.floatingPnl },
      { label: "历史分配收益", value: summary.realizedPnl },
    ].map(item => <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] border-b border-[#DCE7F0]">
      <dt className="content-center border-r border-[#DCE7F0] bg-[#E4F4F6] px-3 py-2.5 text-[11px] leading-5 text-[#087987]">{item.label}</dt>
      <dd className={`min-w-0 break-words bg-white px-3 py-2.5 text-right text-[14px] font-semibold leading-6 tabular-nums [overflow-wrap:anywhere] ${pnlTone(item.value)}`}>{r1ParticipationMoney(item.value)}</dd>
    </div>)}
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] bg-[#EAF2F7]">
      <dt className="content-center border-r border-[#DCE7F0] px-3 py-2.5 text-[11px] font-medium leading-5 text-[#142A3F]">累计分配收益</dt>
      <dd className={`min-w-0 break-words px-3 py-2.5 text-right text-[24px] font-semibold leading-8 tracking-tight tabular-nums [overflow-wrap:anywhere] ${pnlTone(summary.totalPnl)}`}>
        {r1ParticipationMoney(summary.totalPnl)}
      </dd>
    </div>
  </dl>;
}

function ParticipationRows({ rows, usdCnyRate, usdtCnyRate }: { rows: R1AiParticipationRow[]; usdCnyRate: number | null; usdtCnyRate: number | null }) {
  const pnlTone = (value: number | null) => value == null || !Number.isFinite(value)
    ? "text-gray-500" : value === 0 ? "text-[#142A3F]" : value > 0 ? "text-[#D32F2F]" : "text-[#2E7D32]";
  const statusTone: Record<R1AiParticipationRow["status"], string> = {
    pending: "border-[#DCE7F0] bg-[#EAF2F7] text-[#61758A]",
    active: "border-[#087987]/20 bg-[#E4F4F6] text-[#087987]",
    paused: "border-[#DCE7F0] bg-[#EAF2F7] text-[#61758A]",
    closed: "border-[#DCE7F0] bg-[#F2F6FA] text-gray-500",
  };
  return <div className="space-y-3">{rows.length === 0
    ? <div className="rounded-xl border border-[#DCE7F0] bg-white px-4 py-5 shadow-sm text-center">
      <p className="text-sm font-medium text-[#142A3F]">暂无参与记录</p>
      <p className="mt-1 text-xs leading-5 text-[#61758A]">参与份额与分配收益将在这里展示</p>
    </div>
    : rows.map(row => {
      const totalCny = r1ParticipationToCny(row.totalPnl, row.currency, usdCnyRate, usdtCnyRate);
      return <article key={row.id} className="min-w-0 overflow-hidden rounded-xl border border-[#DCE7F0] bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-[#DCE7F0] bg-[#EAF2F7] px-3 py-2.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
            <h3 className="min-w-0 break-words text-sm font-semibold leading-5 text-[#142A3F] [overflow-wrap:anywhere]">{row.stockName}</h3>
            <span className="break-all text-[11px] leading-5 text-[#61758A]">{row.symbol}</span>
            <span className="text-[10px] leading-5 text-[#61758A]">{row.currency}</span>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-4 ${statusTone[row.status] || statusTone.pending}`}>{participationStatus[row.status] || "状态待确认"}</span>
        </div>
        <div className="space-y-2 p-3">
          <p className="break-words text-[10px] leading-4 text-[#61758A]">开始于 <span className="tabular-nums">{row.startDate || "—"}</span></p>
          <dl className="grid grid-cols-3 divide-x divide-[#DCE7F0] overflow-hidden rounded-lg border border-[#DCE7F0] text-center">{[
            { label: "参与股数", value: r1ParticipationQuantity(row.quantity) },
            { label: "已分配份额", value: r1ParticipationQuantity(row.allocatedQuantity) },
            { label: "参与比例", value: row.allocationRatio == null || !Number.isFinite(row.allocationRatio) ? "—" : `${r1ParticipationQuantity(row.allocationRatio * 100)}%` },
          ].map(item => <div key={item.label} className="min-w-0">
            <dt className="border-b border-[#DCE7F0] bg-[#E4F4F6] px-1 py-1.5 text-[10px] leading-4 text-[#087987]">{item.label}</dt>
            <dd className="break-words bg-white px-1 py-2 text-[13px] font-semibold leading-5 tabular-nums text-[#142A3F] [overflow-wrap:anywhere]">{item.value}</dd>
          </div>)}</dl>
          <dl className="overflow-hidden rounded-lg border border-[#DCE7F0]">
            {[
              { label: "当前分配收益", value: row.floatingPnl },
              { label: "历史分配收益", value: row.realizedPnl },
            ].map(item => {
              const cny = r1ParticipationToCny(item.value, row.currency, usdCnyRate, usdtCnyRate);
              return <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] border-b border-[#DCE7F0]">
                <dt className="content-center border-r border-[#DCE7F0] bg-[#E4F4F6] px-2 py-2 text-[10px] leading-5 text-[#087987]">{item.label}</dt>
                <div className="min-w-0 px-2 py-2 text-right">
                  <dd className={`break-words text-[14px] font-semibold leading-5 tabular-nums [overflow-wrap:anywhere] ${pnlTone(cny)}`}>{r1ParticipationMoney(cny)}</dd>
                  {row.currency !== "CNY" && <dd className="break-words text-[10px] leading-4 tabular-nums text-[#61758A] [overflow-wrap:anywhere]">原币 {r1ParticipationMoney(item.value, row.currency)}</dd>}
                </div>
              </div>;
            })}
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] bg-[#EAF2F7]">
              <dt className="content-center border-r border-[#DCE7F0] px-2 py-2 text-[10px] font-medium leading-5 text-[#142A3F]">累计分配收益</dt>
              <div className="min-w-0 px-2 py-2 text-right">
                <dd className={`break-words text-[24px] font-semibold leading-8 tracking-tight tabular-nums [overflow-wrap:anywhere] ${pnlTone(totalCny)}`}>{r1ParticipationMoney(totalCny)}</dd>
                {row.currency !== "CNY" && <dd className="break-words text-[10px] leading-4 tabular-nums text-[#61758A] [overflow-wrap:anywhere]">原币 {r1ParticipationMoney(row.totalPnl, row.currency)}</dd>}
              </div>
            </div>
          </dl>
        </div>
      </article>;
    })}</div>;
}

/** 独立安全 renderer；即使输入意外多出字段也只逐字段读取允许展示的 DTO。 */
export function R1AiParticipationRenderer({ portfolio, updating = false, displayUsdCnyRate = portfolio.usdCnyRate }: { portfolio: R1AiParticipationPortfolio; updating?: boolean; displayUsdCnyRate?: number | null }) {
  // 与旧用户页相同：数字币 summary 使用成员 API 汇总；证券按当前 USD/CNY 换汇。
  // 汇率一致时直接展示 DTO CNY summary，不重复换算，更不翻转其方向。
  const summary = displayUsdCnyRate === portfolio.usdCnyRate || portfolio.participations.some(row => row.currency === "USDT")
    ? portfolio.summary : r1SummaryAtDisplayFx(portfolio.participations, displayUsdCnyRate, portfolio.usdtCnyRate);
  // 原观察接口的summary可能是单一原币；只消费安全逐笔已算收益，不把原币当人民币。
  const observationSummary = portfolio.observation && r1SummaryAtDisplayFx(portfolio.observation.participations, displayUsdCnyRate, portfolio.usdtCnyRate);
  return <main className="mx-auto w-full max-w-[480px] space-y-3 bg-[#F2F6FA] px-3 py-3 text-[#142A3F] min-[375px]:px-4">
    <section aria-label="参与收益汇总" className="overflow-hidden rounded-2xl border border-[#DCE7F0] bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-[#DCE7F0] bg-white px-4 py-3">
        <h2 className="text-sm font-semibold text-[#142A3F]">收益概览</h2>
        <span className="rounded-full bg-[#E4F4F6] px-2 py-0.5 text-[10px] font-medium text-[#087987]">人民币</span>
      </div>
      <div className="space-y-2 p-3">
        <ParticipationSummary summary={summary} />
        <p className="text-[11px] leading-5 text-[#61758A]">当前收益来自仍参与部分，会随数据变化；历史收益来自已结束部分（含部分结束），不代表现金到账。</p>
        <p className="border-t border-[#DCE7F0] pt-2 text-[10px] leading-4 text-[#61758A] [overflow-wrap:anywhere]">
          {portfolio.updatedAt ? `数据更新于 ${portfolio.updatedAt}` : "更新时间待获取"}
        </p>
      </div>
      {/* 后台刷新不改变可见布局，不反复播报；保留原更新语义供离线 renderer 回归。 */}
      {updating && <span className="sr-only" aria-hidden="true">更新中，保留上次数据</span>}
    </section>
    <section aria-label="已登记保证金" className="rounded-xl border border-[#DCE7F0] bg-white p-3 shadow-sm">
      <h2 className="text-sm font-semibold text-[#142A3F]">已登记保证金</h2>
      {portfolio.recordedMargins === null
        ? <p className="mt-2 text-base tabular-nums text-gray-500">—</p>
        : portfolio.recordedMargins.length === 0
          ? <p className="mt-2 text-xs leading-5 text-[#61758A]">暂无登记记录</p>
          : <dl className="mt-2 overflow-hidden rounded-lg border border-[#DCE7F0] divide-y divide-[#DCE7F0]">{portfolio.recordedMargins.map((margin, index) => <div key={`${margin.assetCode}:${index}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
            <dt className="break-all content-center border-r border-[#DCE7F0] bg-[#E4F4F6] px-2 py-2 text-xs font-medium leading-5 text-[#087987]">{margin.assetCode}</dt>
            <dd className="min-w-0 break-words bg-white px-2 py-2 text-right text-[14px] font-semibold leading-6 tabular-nums text-[#142A3F] [overflow-wrap:anywhere]">{r1RecordedMarginAmount(margin.amount)}</dd>
          </div>)}</dl>}
    </section>
    <section aria-label="我的参与记录" className="space-y-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-sm font-semibold text-[#142A3F]">参与份额</h2>
        <span className="text-[11px] tabular-nums text-[#61758A]">{portfolio.participations.length} 项记录</span>
      </div>
      <ParticipationRows rows={portfolio.participations} usdCnyRate={displayUsdCnyRate} usdtCnyRate={portfolio.usdtCnyRate} />
    </section>
    {portfolio.observation !== null && observationSummary && <details className="group rounded-xl border border-[#DCE7F0] bg-white px-3 shadow-sm">
      <summary className="min-h-[44px] cursor-pointer content-center rounded-lg py-2.5 text-sm font-semibold leading-6 text-[#087987] marker:text-[#087987] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#087987] focus-visible:ring-offset-2">观察 · 不结算</summary>
      <div className="space-y-3 border-t border-[#DCE7F0] pb-3 pt-3">
        <p className="rounded-lg bg-[#E4F4F6] px-3 py-2 text-[11px] leading-5 text-[#087987]">观察记录单独展示，不计入上方参与收益。</p>
        <ParticipationSummary summary={observationSummary} />
        <ParticipationRows rows={portfolio.observation.participations} usdCnyRate={displayUsdCnyRate} usdtCnyRate={portfolio.usdtCnyRate} />
      </div>
    </details>}
    <p className="px-1 pb-2 text-[11px] leading-5 text-[#61758A]">该视图展示参与份额与分配收益，不表示直接持有股票，不保证回报。</p>
  </main>;
}

export default function R1AiParticipationView({ ledgerId, categoryId, viewerUserId, onBack }: { ledgerId: 37; categoryId: number; viewerUserId: number; onBack: () => void }) {
  const validScope = isR1StockPresentationScope(ledgerId, categoryId) && Number.isSafeInteger(viewerUserId) && viewerUserId > 0;
  const query = trpc.ledger.getMyR1AiParticipationPortfolio.useQuery(
    { ledgerId, categoryId, viewAsUserId: viewerUserId },
    { enabled: validScope, placeholderData: undefined, retry: false, staleTime: 10_000, refetchInterval: 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true },
  );
  // 仅汇率，不读取任何标的行情/原始组合。周期和成功校验与旧用户页一致。
  const fxQuery = trpc.stock.getUsdCnyRate.useQuery(undefined, { enabled: validScope, staleTime: 30_000, refetchInterval: 30_000, refetchIntervalInBackground: false });
  const quotedUsdCnyRate = Number(fxQuery.data?.rate);
  const displayUsdCnyRate = fxQuery.data?.success && Number.isFinite(quotedUsdCnyRate) && quotedUsdCnyRate > 0 ? quotedUsdCnyRate : null;
  const portfolio = query.data?.viewerUserId === viewerUserId ? query.data : undefined;
  return <div className="min-h-screen bg-[#F2F6FA] pb-8">
    <header className="sticky top-0 z-20 text-[#EAF2F7] shadow-sm" style={{ background: "#FFFFFF", color: "#142A3F" }}>
      <div className="mx-auto flex max-w-[480px] items-center gap-2 px-3 py-2">
        <button type="button" onClick={onBack} aria-label="返回" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EAF2F7]"><ArrowLeft size={20} /></button>
        <h1 className="text-base font-semibold">收益</h1>
      </div>
    </header>
    {!validScope || (query.error && !portfolio)
      ? <div role="alert" className="mx-auto max-w-[480px] px-4 py-10 text-center text-sm leading-6 text-[#61758A]">参与数据暂不可用，请稍后重试</div>
      : !portfolio
        ? <div role="status" className="flex justify-center gap-2 px-4 py-10 text-sm text-[#61758A]"><Loader2 size={18} className="animate-spin" />正在加载参与数据…</div>
        : <>{query.error && <p role="status" className="mx-auto mt-3 max-w-[448px] rounded-xl border border-[#DCE7F0] bg-[#EAF2F7] px-3 py-2 text-center text-xs leading-5 text-[#61758A]">暂未更新，保留上次数据</p>}<R1AiParticipationRenderer portfolio={portfolio} displayUsdCnyRate={displayUsdCnyRate} updating={query.isFetching} /></>}
  </div>;
}
