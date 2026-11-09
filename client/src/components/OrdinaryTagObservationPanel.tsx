import { useEffect, useState } from 'react';
import { Eye, ChevronDown, RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import type { OrdinaryTagObservationConfig, OrdinaryTagObservationOverview, OrdinaryTagObservationSummary } from '@shared/ordinary-tag-observation';

export type OrdinaryTagObservationPanelProps = {
  ledgerId: number;
  userId: number;
  categoryId?: number | null;
};

type PreviewOverride = { categoryId: number; config: OrdinaryTagObservationConfig };
export function readOrdinaryObservationPreviewOverrides(userId: number): PreviewOverride[] {
  if (!import.meta.env.DEV || typeof window === 'undefined') return [];
  try {
    const overrides: PreviewOverride[] = [];
    const prefix = `ordinary-tag-observation-preview:${userId}:`;
    for (let index = 0; index < sessionStorage.length; index++) {
      const key = sessionStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const categoryId = Number(key.slice(prefix.length));
      if (!Number.isInteger(categoryId) || categoryId <= 0) continue;
      const config = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (config && typeof config.enabled === 'boolean') overrides.push({ categoryId, config });
    }
    return overrides.sort((left, right) => left.categoryId - right.categoryId);
  } catch { return []; }
}

const money = (value: number | null) => value === null || !Number.isFinite(value)
  ? '—'
  : `${value > 0 ? '+' : value < 0 ? '−' : ''}¥${Math.abs(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusText: Record<OrdinaryTagObservationSummary['status'], string> = {
  active: '观察中', paused: '已暂停', pending: '尚未开始', no_data: '暂无余额记录', disabled: '已关闭', invalid_config: '配置需完善',
};

function ObservationRow({ summary }: { summary: OrdinaryTagObservationSummary }) {
  const [expanded, setExpanded] = useState(false);
  const amount = summary.totalPnl;
  const color = amount === null ? '#8A919B' : amount >= 0 ? '#D32F2F' : '#2E7D32';
  return (
    <article data-ordinary-observation-category={summary.categoryId} className="rounded-xl border border-[#DCEAEC] bg-[#FAFDFD] px-3 py-2.5">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-between gap-2 text-left">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5"><span className="truncate text-sm font-semibold text-[#263746]">{summary.categoryName}</span><span className="shrink-0 rounded bg-[#E7F1F3] px-1.5 py-0.5 text-[10px] text-[#397985]">观察</span></div>
          <div className="mt-1 text-[10px] text-[#88959E]">{statusText[summary.status]}{summary.latestDate ? ` · ${summary.latestDate}` : ''}</div>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="break-all text-right text-base font-bold tabular-nums" style={{ color }}>{money(amount)}</span>
          <ChevronDown size={14} className={`shrink-0 text-[#91A2AC] transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {expanded && <div className="mt-2 space-y-2 border-t border-[#E2EDEF] pt-2 text-xs text-[#71818C]">
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          <span>参考初始金额</span><span className="text-right tabular-nums">¥{summary.config.initialAmount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</span>
          <span>观察比例</span><span className="text-right tabular-nums">{summary.config.ratio}%</span>
          <span>开始日期</span><span className="text-right">{summary.config.startDate || '—'}</span>
          {summary.config.pauseDate && <><span>暂停日期</span><span className="text-right">{summary.config.pauseDate}</span></>}
          <span>最近一日观察回报</span><span className="text-right tabular-nums">{money(summary.todayPnl)}</span>
        </div>
        <p className="text-[10px] leading-4 text-[#8797A0]">根据该标签真实余额及期间资金变动，按设定比例计算观察回报；仅供体验，不计入实际账户、押金、分红或钱包。</p>
        {summary.points.length > 0 && <div className="max-h-36 overflow-y-auto rounded-md bg-white px-2 py-1">
          {summary.points.slice(-30).reverse().map((point) => <div key={point.date} className="flex justify-between gap-2 py-1 text-[11px] tabular-nums"><span>{point.date}</span><span style={{ color: point.pnl >= 0 ? '#D32F2F' : '#2E7D32' }}>{money(point.pnl)}</span></div>)}
        </div>}
      </div>}
    </article>
  );
}

/** 独立查询与独立展示：这里的数据绝不进入真实allTagsStats或钱包金额。 */
export default function OrdinaryTagObservationPanel({ ledgerId, userId, categoryId }: OrdinaryTagObservationPanelProps) {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener('ordinary-tag-observation-preview-change', refresh);
    return () => window.removeEventListener('ordinary-tag-observation-preview-change', refresh);
  }, [userId]);
  // 预览草稿只送到沙箱的GET计算适配器；正式契约没有该字段，更不执行保存mutation。
  const previewOverrides = import.meta.env.DEV ? readOrdinaryObservationPreviewOverrides(userId) : undefined;
  void revision;
  const query = (trpc as any).ledger.getMyOrdinaryTagObservationOverview.useQuery(
    { ledgerId: 37, viewAsUserId: userId, ...(import.meta.env.DEV ? { previewOverrides } : {}) },
    { enabled: ledgerId === 37 && Number.isInteger(userId) && userId > 0, staleTime: 20_000, retry: false, refetchOnWindowFocus: false },
  );
  const data = query.data as OrdinaryTagObservationOverview | undefined;
  // query key绑定有效成员；切换身份时不使用其他成员的旧结果或placeholder。
  const summaries = data?.userId === userId
    ? data.observations.filter((row) => row.userId === userId && row.config.enabled && (!categoryId || row.categoryId === categoryId))
    : [];
  if (ledgerId !== 37 || userId <= 0) return null;
  if (!summaries.length && !query.error) return null;
  return (
    <section aria-label="普通标签观察账户" className="mx-3 mt-3 rounded-xl border border-[#D7E8EC] bg-white px-3 py-3 shadow-sm">
      <header className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-[#397985]"><Eye size={14} />观察账户</span>
        <span className="text-[10px] text-[#91A0A8]">独立体验 · 不计入实账</span>
      </header>
      {query.error && <div role="alert" className="flex items-center justify-between gap-2 text-xs text-[#8A919B]"><span>观察数据读取失败</span><button type="button" disabled={query.isFetching} onClick={() => void query.refetch()} className="inline-flex items-center gap-1 text-[#397985]"><RefreshCw size={12} />重试</button></div>}
      <div className="space-y-2">{summaries.map((summary) => <ObservationRow key={`${userId}:${summary.categoryId}`} summary={summary} />)}</div>
    </section>
  );
}
