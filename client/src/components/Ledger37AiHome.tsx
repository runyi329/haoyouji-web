import { useState, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, Layers3, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { Ledger37AiOverview, Ledger37AiProject, Ledger37PresentationContext } from "@shared/ledger37-ai-presentation";
import { resolveR1EffectiveUserId, r1ParticipationMoney, r1RecordedMarginAmount } from "@/lib/r1StockPresentation";
import { R1AiParticipationRenderer } from "@/components/R1AiParticipationView";
import Ledger37AiIdentityHeader from "@/components/Ledger37AiIdentityHeader";
import { Ledger37HoldingSourcesRenderer } from "@/components/Ledger37HoldingSources";
import Ledger37CalendarRecorder from "@/components/Ledger37CalendarRecorder";
import type { Ledger37HoldingSourceId, Ledger37HoldingSources } from "@shared/ledger37-ai-holdings";
/** 全账本37共用同一身份级query key，不包含category或旧标签开关。 */
export function useLedger37PresentationContext({ ledgerId, search, effectiveUserId, authUserId }: { ledgerId: number; search: string; effectiveUserId?: number | null; authUserId?: number }) {
  let storedViewAs: string | null = null;
  try { storedViewAs = sessionStorage.getItem("view-as-user-id"); } catch { /* URL/有效身份仍可用，权限只由服务端决定。 */ }
  const viewerUserId = resolveR1EffectiveUserId(search, storedViewAs, effectiveUserId ?? undefined, authUserId);
  const contextQuery = trpc.ledger.getLedger37PresentationContext.useQuery(
    { ledgerId: 37, viewAsUserId: viewerUserId },
    { enabled: ledgerId === 37 && viewerUserId !== undefined, placeholderData: undefined, retry: false, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: true },
  );
  // 首次挂载必须完成服务端确认；确认后isFetching不卸载原树。error始终fail-closed。
  const context: Ledger37PresentationContext | undefined = ledgerId === 37 && !contextQuery.error && contextQuery.isFetchedAfterMount && contextQuery.data?.viewerUserId === viewerUserId
    ? contextQuery.data : undefined;
  const knownSelfAIgate = Boolean(context?.aiEnabled && !context.canManage);
  const canReadRaw = ledgerId !== 37 || Boolean(context && !knownSelfAIgate);
  return { viewerUserId, contextQuery, context, knownSelfAIgate, canReadRaw };
}

type Presentation = ReturnType<typeof useLedger37PresentationContext>;

export function Ledger37PresentationPending({ presentation, onBack }: { presentation: Presentation; onBack: () => void }) {
  if (presentation.contextQuery.error) return <div className="min-h-screen bg-[#F2F6FA] p-5"><button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-gray-600"><ArrowLeft size={16} />返回</button><p role="alert" className="mt-10 text-center text-sm text-gray-500">展示配置暂不可用，请稍后重试</p><button type="button" onClick={() => void presentation.contextQuery.refetch()} className="mt-3 w-full text-center text-xs text-[#087987]">重试</button></div>;
  return <div role="status" className="flex min-h-screen items-center justify-center gap-2 bg-[#F2F6FA] text-sm text-gray-500"><Loader2 size={18} className="animate-spin" />正在确认展示配置…</div>;
}

/** 仅决定展示，不写用户身份，不扩大账户管理权限；未确认时children不挂载。 */
export function Ledger37PresentationGate({ ledgerId, presentation, onBack, children }: { ledgerId: number; presentation: Presentation; onBack: () => void; children: ReactNode }) {
  if (ledgerId !== 37) return <>{children}</>;
  const { context, viewerUserId, knownSelfAIgate } = presentation;
  if (!context || viewerUserId === undefined) return <Ledger37PresentationPending presentation={presentation} onBack={onBack} />;
  const modeKey = `37:${viewerUserId}:${context.canManage}:${context.aiEnabled}`;
  if (knownSelfAIgate) return <Ledger37AiHome key={modeKey} viewerUserId={viewerUserId} onBack={onBack} canRecordCalendar={context.canRecordCalendar === true} />;
  return <div key={modeKey}>{children}</div>;
}

/** 仅选择展示颜色；不格式化、换汇、合计或改变收益符号。 */
function ledger37AiMoneyTone(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "text-[#61758A]";
  return value > 0 ? "text-[#D32F2F]" : value < 0 ? "text-[#2E7D32]" : "text-[#142A3F]";
}

function ledger37AiProjectTone(kind: Ledger37AiProject["kind"]): string {
  return kind === "stock" ? "bg-[#E4F4F6] text-[#087987]" : "bg-[#EAF2F7] text-[#087987]";
}

function Ledger37AiProjectCard({ project, onOpenStock }: { project: Ledger37AiProject; onOpenStock: (categoryId: number) => void }) {
  const isStock = project.kind === "stock";
  const primary = isStock ? project.summary?.totalPnl : project.receivedDividends;
  return <article className="overflow-hidden rounded-2xl border border-[#DCE7F0] bg-white shadow-sm">
    <div className="flex items-center gap-3 px-4 pt-3">
      <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ledger37AiProjectTone(project.kind)}`}><Layers3 size={19} strokeWidth={1.7} /></span>
      <div className="min-w-0 flex-1"><h2 className="break-words text-[15px] font-semibold leading-6 text-[#142A3F]">{project.displayName}</h2><p className="text-[11px] leading-5 text-[#61758A]">{isStock ? "股票参与项目" : "其他参与项目"}</p></div>
      {isStock && <button type="button" onClick={() => onOpenStock(project.categoryId)} aria-label={`查看${project.displayName}参与记录`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#087987] transition-colors hover:bg-[#E4F4F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DCE7F0]"><ChevronRight size={20} /></button>}
    </div>
    <div className="px-4 pb-3 pt-3">
      <div className="text-xs text-[#61758A]">{isStock ? "累计分配收益" : "实收分配收益"}<span className="ml-2 text-[11px]">人民币</span></div>
      <p className={`mt-1 break-words text-[24px] font-semibold leading-tight tracking-tight tabular-nums [overflow-wrap:anywhere] ${ledger37AiMoneyTone(primary)}`}>{r1ParticipationMoney(primary)}</p>
      {isStock && <dl className="mt-3 grid grid-cols-2 divide-x divide-[#DCE7F0] border-t border-[#DCE7F0] bg-[#EAF2F7] pt-3">{[
        { label: "当前分配收益", value: project.summary?.floatingPnl },
        { label: "历史分配收益", value: project.summary?.realizedPnl },
      ].map(item => <div key={item.label} className="min-w-0"><dt className="text-[11px] leading-5 text-[#61758A]">{item.label}</dt><dd className={`mt-1 break-words text-sm font-semibold tabular-nums [overflow-wrap:anywhere] ${ledger37AiMoneyTone(item.value)}`}>{r1ParticipationMoney(item.value)}</dd></div>)}</dl>}
      {isStock && <dl className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-[#EAF2F7] px-3 py-2 text-xs"><dt className="text-[#61758A]">实收分配收益</dt><dd className={`min-w-0 break-words font-medium tabular-nums [overflow-wrap:anywhere] ${ledger37AiMoneyTone(project.receivedDividends)}`}>{r1ParticipationMoney(project.receivedDividends)}</dd></dl>}
      <p className="mt-3 text-[11px] leading-5 text-[#61758A]">开始日期 {project.startDate || "—"}</p>
    </div>
    <section aria-label="登记保证金" className="border-t border-[#DCE7F0] bg-[#EAF2F7] px-4"><details className="group"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-xs text-[#087987] [&::-webkit-details-marker]:hidden"><span>登记保证金</span><span className="flex items-center gap-1 text-[11px] text-[#61758A]">原币记录<ChevronRight size={14} className="transition-transform group-open:rotate-90" /></span></summary><div className="pb-3">{project.recordedMargins === null ? <p className="text-xs text-[#61758A]">—</p> : project.recordedMargins.length === 0 ? <p className="text-xs text-[#61758A]">暂无登记记录</p> : <dl className="space-y-2">{project.recordedMargins.map((margin, index) => <div key={`${margin.assetCode}:${index}`} className="flex justify-between gap-3 text-xs"><dt className="text-[#087987]">{margin.assetCode}</dt><dd className="min-w-0 break-words font-medium tabular-nums text-[#142A3F] [overflow-wrap:anywhere]">{r1RecordedMarginAmount(margin.amount)}</dd></div>)}</dl>}</div></details></section>
  </article>;
}

/** 白名单逐字段renderer：不展开DTO、不累加跨项目金额、不把观察写入实际收益。 */
export function Ledger37AiHomeRenderer({ overview, updating = false, onOpenStock }: { overview: Ledger37AiOverview; updating?: boolean; onOpenStock: (categoryId: number) => void }) {
  const orderedProjects = [...overview.projects.filter(project => project.kind === "stock"), ...overview.projects.filter(project => project.kind === "ordinary")];
  return <main className="mx-auto max-w-[480px] space-y-3 px-3 pb-6 pt-3">
    <div className="flex items-center justify-between gap-3"><h2 className="text-[15px] font-semibold text-[#142A3F]">参与项目</h2><p className="text-[11px] text-[#61758A]">收益以人民币展示</p></div>
    <p role="status" aria-live="polite" className="sr-only">{updating ? "更新中，保留上次数据" : "各项目独立展示；收益为人民币，保证金保留登记币种；不汇总不同项目金额。"}</p>
    <section aria-label="我的AI项目" className="space-y-4">{overview.projects.length === 0 ? <div className="rounded-2xl border border-dashed border-[#DCE7F0] bg-white/70 px-5 py-10 text-center"><span aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E4F4F6] text-[#087987]"><Layers3 size={22} strokeWidth={1.5} /></span><p className="mt-3 text-sm font-medium text-[#087987]">暂无参与项目</p><p className="mt-2 text-xs leading-5 text-[#61758A]">有参与记录后，份额与收益将在这里展示</p></div> : orderedProjects.map(project => <Ledger37AiProjectCard key={project.categoryId} project={project} onOpenStock={onOpenStock} />)}</section>
    <footer className="space-y-2 px-1 text-[11px] leading-5 text-[#61758A]"><p>各项目独立展示，保证金保留登记币种，不汇总不同项目金额。</p><p>展示参与份额与分配收益，不表示直接持有股票，不保证回报。普通项目仅展示安全概要，不表示参与股票。</p></footer>
  </main>;
}

export default function Ledger37AiHome({ viewerUserId, onBack, adminPreview = false, canRecordCalendar = false }: { viewerUserId: number; onBack: () => void; /** 仅父级已确认context.canManage传入，不改变或保存实际开关。 */ adminPreview?: boolean; canRecordCalendar?: boolean }) {
  const [selectedSourceId, setSelectedSourceId] = useState<Ledger37HoldingSourceId | null>(null);
  const validViewer = Number.isSafeInteger(viewerUserId) && viewerUserId > 0;
  const query = trpc.ledger.getMyLedger37HoldingSources.useQuery(
    { ledgerId: 37, viewAsUserId: viewerUserId },
    { enabled: validViewer, placeholderData: undefined, retry: false, staleTime: 60_000, refetchOnMount: "always", refetchInterval: 60_000, refetchIntervalInBackground: false },
  );
  // 首次挂载强制重新确认，禁止短期缓存、错身份或关闭AI的响应进入可见树。
  const data: Ledger37HoldingSources | undefined = validViewer && !query.error && query.isFetchedAfterMount && query.data?.viewerUserId === viewerUserId && (query.data.aiEnabled || adminPreview) ? query.data : undefined;
  const backToSources = () => { setSelectedSourceId(null); if (typeof window !== "undefined") window.scrollTo(0, 0); };
  return <div className="min-h-screen bg-[#F2F6FA] pb-8 [color-scheme:light]"><Ledger37AiIdentityHeader key={viewerUserId} viewerUserId={viewerUserId} onBack={selectedSourceId ? backToSources : onBack} />
    {!validViewer || query.error ? <div role="alert" className="mx-auto max-w-[480px] p-8 text-center text-sm leading-6 text-[#61758A]">持仓来源暂不可用，请稍后重试</div> : !data ? <div role="status" className="mx-auto flex max-w-[480px] justify-center gap-2 p-10 text-sm text-[#61758A]"><Loader2 size={18} className="animate-spin" />正在确认持仓来源…</div> : <Ledger37HoldingSourcesRenderer key={viewerUserId} data={data} selectedSourceId={selectedSourceId} updating={query.isFetching} onOpen={id => { if (id !== "berkshire" && id !== "nvidia" && data.sources.some(source => source.id === id && source.status === "available" && (source.holdings.length > 0 || source.id === "r1" && (source.memberPortfolio?.closedTrades?.length || 0) > 0))) { setSelectedSourceId(id); if (typeof window !== "undefined") window.scrollTo(0, 0); } }} />}
    {validViewer && !query.error && data && canRecordCalendar && <Ledger37CalendarRecorder key={`calendar-recorder-${viewerUserId}`} viewerUserId={viewerUserId} />}
  </div>;
}

/** 全37股票安全包装：复用R1安全renderer及其原FX/收益算法，不读取原始组合。 */
export function Ledger37AiStockParticipationView({ ledgerId, categoryId, viewerUserId, onBack, adminPreview = false }: { ledgerId: 37; categoryId: number; viewerUserId: number; onBack: () => void; adminPreview?: boolean }) {
  const validScope = ledgerId === 37 && Number.isSafeInteger(categoryId) && categoryId > 0 && Number.isSafeInteger(viewerUserId) && viewerUserId > 0;
  const query = trpc.ledger.getMyR1AiParticipationPortfolio.useQuery(
    { ledgerId, categoryId, viewAsUserId: viewerUserId },
    { enabled: validScope, placeholderData: undefined, retry: false, staleTime: 10_000, refetchInterval: 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true },
  );
  const fxQuery = trpc.stock.getUsdCnyRate.useQuery(undefined, { enabled: validScope, staleTime: 30_000, refetchInterval: 30_000, refetchIntervalInBackground: false });
  const quotedUsdCnyRate = Number(fxQuery.data?.rate);
  const displayUsdCnyRate = fxQuery.data?.success && Number.isFinite(quotedUsdCnyRate) && quotedUsdCnyRate > 0 ? quotedUsdCnyRate : null;
  const portfolio = query.data?.viewerUserId === viewerUserId && (query.data.aiEnabled || adminPreview) ? query.data : undefined;
  return <div className="min-h-screen bg-[#F2F6FA] pb-8 [color-scheme:light]"><Ledger37AiIdentityHeader key={viewerUserId} viewerUserId={viewerUserId} onBack={onBack} />
    {!validScope || (query.error && !portfolio) ? <div role="alert" className="mx-auto max-w-[480px] p-8 text-center text-sm leading-6 text-[#61758A]">参与数据暂不可用，请稍后重试</div> : !portfolio ? <div role="status" className="mx-auto flex max-w-[480px] justify-center gap-2 p-10 text-sm text-[#61758A]"><Loader2 size={18} className="animate-spin" />正在加载参与数据…</div> : <>{query.error && <p role="status" className="px-4 pt-3 text-center text-xs text-[#61758A]">暂未更新，保留上次数据</p>}<R1AiParticipationRenderer portfolio={portfolio} displayUsdCnyRate={displayUsdCnyRate} updating={query.isFetching} /></>}
  </div>;
}
