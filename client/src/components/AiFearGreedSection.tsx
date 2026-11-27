import { useMemo, useState } from "react";
import { AlertCircle, ChevronDown, Gauge, Info } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { trpc } from "@/lib/trpc";
import { AI_STOCK_THEME as theme } from "@/lib/ai-stock-theme";
import { AI_FEAR_GREED_BAND_LABELS, aiFearGreedBand, type AiFearGreedResult } from "../../../shared/ai-fear-greed";

type Period = "1m" | "3m" | "1y" | "all";
export type AiFearGreedSectionViewProps = {
  data?: AiFearGreedResult;
  isLoading?: boolean;
  hasError?: boolean;
};
const PERIODS: { value: Period; label: string }[] = [
  { value: "1m", label: "1月" }, { value: "3m", label: "3月" },
  { value: "1y", label: "1年" }, { value: "all", label: "全部" },
];
const BAND_COLORS = [theme.fall, theme.fallSoft, "#A7B3BE", theme.riseSoft, theme.rise];
const BAND_NAMES = ["极度恐惧", "恐惧", "中性", "贪婪", "极度贪婪"];
const validScore = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
const scoreText = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);

function dateText(value: string | null | undefined) {
  if (!value) return "—";
  const match = value.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : value;
}
function dateStamp(value: string | null | undefined) {
  const text = dateText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const stamp = Date.parse(`${text}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === text ? stamp : null;
}
function polar(score: number, radius: number) {
  const angle = (180 + score * 1.8) * Math.PI / 180;
  return { x: 160 + Math.cos(angle) * radius, y: 142 + Math.sin(angle) * radius };
}
function arc(start: number, end: number) {
  const from = polar(start, 105);
  const to = polar(end, 105);
  return `M ${from.x} ${from.y} A 105 105 0 0 1 ${to.x} ${to.y}`;
}
function FearGreedGauge({ score }: { score: number | null }) {
  const pointer = score === null ? null : polar(score, 87);
  const color = score === null ? theme.dim : BAND_COLORS[Math.min(4, Math.floor(score / 20))];
  return (
    <svg viewBox="0 0 320 207" className="mx-auto block w-full max-w-[340px]" role="img"
      aria-label={score === null ? "贪婪恐惧指数暂无可用分数，未显示指针" : `贪婪恐惧指数 ${scoreText(score)}，${AI_FEAR_GREED_BAND_LABELS[aiFearGreedBand(score)]}`}>
      <path d={arc(0, 100)} fill="none" stroke={theme.surface} strokeWidth={21} />
      {BAND_COLORS.map((segmentColor, index) => (
        <path key={segmentColor} d={arc(index * 20 + 0.7, (index + 1) * 20 - 0.7)}
          fill="none" stroke={segmentColor} strokeWidth={17} />
      ))}
      {[0, 20, 40, 60, 80, 100].map(tick => {
        const point = polar(tick, 130);
        return <text key={tick} x={point.x} y={point.y + 4} fill={theme.dim} fontSize="11" textAnchor="middle" fontFamily="inherit">{tick}</text>;
      })}
      {pointer && <g data-testid="fear-greed-pointer">
        <line x1={160} y1={142} x2={pointer.x} y2={pointer.y} stroke={theme.card} strokeWidth={6} strokeLinecap="round" />
        <line x1={160} y1={142} x2={pointer.x} y2={pointer.y} stroke={theme.text} strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={160} cy={142} r={6} fill={theme.card} stroke={theme.text} strokeWidth={2.5} />
      </g>}
      <text x={160} y={195} fill={color} fontSize="43" fontWeight="750" textAnchor="middle" fontFamily="inherit" style={{ fontVariantNumeric: "tabular-nums" }} data-testid="fear-greed-score">
        {score === null ? "—" : scoreText(score)}
      </text>
      <text x={210} y={192} fill={theme.dim} fontSize="11" fontFamily="inherit">/ 100</text>
    </svg>
  );
}

/** Pure display component: no query or fabricated observations; period controls filter the supplied daily history only. */
export function AiFearGreedSectionView({ data, isLoading = false, hasError = false }: AiFearGreedSectionViewProps) {
  const [period, setPeriod] = useState<Period>("3m");
  const [explanationOpen, setExplanationOpen] = useState(false);
  // A stale successful result must not disguise an unavailable/insufficient response or request failure.
  const score = !hasError && !isLoading && data?.status === "provisional" && validScore(data.score) ? data.score : null;
  const band = score === null ? null : aiFearGreedBand(score);
  const color = score === null ? theme.muted : BAND_COLORS[Math.min(4, Math.floor(score / 20))];
  const previous = data?.previousScore;
  const change = score !== null && validScore(previous) ? score - previous : null;
  const history = useMemo(() => {
    if (hasError) return [];
    const points = (data?.history ?? []).flatMap(point => {
      const stamp = dateStamp(point.date);
      return stamp === null ? [] : [{ date: dateText(point.date), stamp, score: validScore(point.score) ? point.score : null }];
    }).sort((a, b) => a.stamp - b.stamp);
    if (period === "all" || !points.length) return points;
    const end = new Date(Math.max(dateStamp(data?.latestDate) ?? 0, points[points.length - 1].stamp));
    const months = period === "1m" ? 1 : period === "3m" ? 3 : 12;
    const cutoff = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months, 1));
    const daysInMonth = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate();
    cutoff.setUTCDate(Math.min(end.getUTCDate(), daysInMonth));
    return points.filter(point => point.stamp >= cutoff.getTime());
  }, [data?.history, data?.latestDate, hasError, period]);
  const realPointCount = history.filter(point => point.score !== null).length;
  const statusText = isLoading ? "正在读取真实行情…"
    : hasError || data?.status === "unavailable" ? "指数暂不可用，请稍后再试"
    : data?.status === "insufficient" ? "真实行情样本不足，暂不计算指数"
    : score === null ? "暂无可用分数，等待真实行情样本"
    : AI_FEAR_GREED_BAND_LABELS[band!];

  return (
    <section id="fear-greed-index" className="min-w-0 scroll-mt-20 overflow-hidden rounded-2xl border" style={{ background: theme.card, borderColor: theme.border, boxShadow: theme.shadow }} aria-label="贪婪恐惧指数" data-testid="ai-fear-greed-section" aria-busy={isLoading}>
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Gauge size={17} style={{ color: theme.accent }} aria-hidden="true" />
            <h2 className="text-[15px] font-bold tracking-wide" style={{ color: theme.text }}>贪婪恐惧指数</h2>
            <span className="rounded border px-1.5 py-0.5 text-[10px] font-medium" style={{ background: theme.accentSoft, color: theme.accent, borderColor: "#C2E4E8" }}>试算</span>
          </div>
          <p className="mt-1 text-[11px]" style={{ color: theme.muted }}>脉动自研 · A 股市场情绪</p>
        </div>
        <div className="shrink-0 pt-0.5 text-right text-[10px]" style={{ color: theme.dim }}>
          <p>行情截止</p><p className="mt-1 tabular-nums">{dateText(data?.latestDate)}</p>
        </div>
      </div>

      <div className="px-3 pt-2">
        <FearGreedGauge score={score} />
        <div className="flex flex-col items-center gap-1.5 pb-3 text-center" aria-live="polite">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ color, background: score === null || band === "neutral" ? theme.surface : score < 40 ? theme.fallBackground : theme.riseBackground }}>
            {score === null && !isLoading && <AlertCircle size={13} aria-hidden="true" />}{statusText}
          </span>
          {change !== null && <p className="text-[10px]" style={{ color: theme.muted }}>较前一交易日 <span className="font-medium tabular-nums" style={{ color: change > 0 ? theme.rise : change < 0 ? theme.fall : theme.muted }}>{change > 0 ? "+" : ""}{scoreText(change)}</span> 点</p>}
        </div>
        <div className="grid grid-cols-5 gap-1 px-1 pb-3">
          {BAND_NAMES.map((name, index) => <div key={name} className="text-center text-[9px] sm:text-[10px]" style={{ color: BAND_COLORS[index] }}><span className="mx-auto mb-1 block h-0.5 w-5 rounded-full" style={{ background: BAND_COLORS[index] }} />{name}</div>)}
        </div>
      </div>

      <div className="mx-3 rounded-xl border px-2 pb-2 pt-3" style={{ background: "linear-gradient(180deg, #F7FAFC 0%, #FFFFFF 100%)", borderColor: theme.border }}>
        <div className="mb-3 flex items-center justify-between gap-2 px-1">
          <h3 className="text-xs font-semibold" style={{ color: theme.text }}>情绪走势</h3>
          <div className="flex rounded-lg p-0.5" style={{ background: theme.surface }} aria-label="历史时间范围">
            {PERIODS.map(option => <button key={option.value} type="button" aria-pressed={period === option.value} onClick={() => setPeriod(option.value)} className="min-h-8 rounded-md px-2.5 text-[10px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1" style={{ background: period === option.value ? theme.card : "transparent", color: period === option.value ? theme.accent : theme.muted, boxShadow: period === option.value ? "0 1px 4px rgba(21,53,77,.08)" : undefined, outlineColor: theme.accent }}>{option.label}</button>)}
          </div>
        </div>
        <div className="relative h-[172px] w-full min-w-0" data-testid="fear-greed-history">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={theme.border} strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="date" tickFormatter={value => String(value).slice(5).replace("-", "/")} tick={{ fontSize: 9, fill: theme.dim }} tickLine={false} axisLine={false} minTickGap={35} height={24} />
              <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fontSize: 9, fill: theme.dim }} tickLine={false} axisLine={false} allowDataOverflow width={42} />
              <ReferenceLine y={50} stroke={theme.dim} strokeDasharray="3 5" strokeOpacity={0.4} />
              <Tooltip filterNull labelFormatter={label => `行情日期 ${label}`} formatter={value => [validScore(Number(value)) ? scoreText(Number(value)) : "—", "试算指数"]} contentStyle={{ borderRadius: 10, borderColor: theme.border, fontSize: 11, color: theme.text }} cursor={{ stroke: theme.border }} />
              <Line type="linear" dataKey="score" name="试算指数" stroke={theme.accent} strokeWidth={2} connectNulls={false} dot={realPointCount < 3 ? { r: 3, fill: theme.accent, strokeWidth: 0 } : false} activeDot={{ r: 4, stroke: theme.card, strokeWidth: 2 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          {realPointCount === 0 && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 pl-4 text-center">
            <span className="rounded-md px-3 py-1.5 text-[11px]" style={{ background: theme.card, color: theme.muted }}>{isLoading ? "正在读取历史行情…" : hasError ? "历史数据读取失败" : "该区间暂无可用历史指数"}</span>
            <span className="rounded px-2 text-[10px]" style={{ background: theme.card, color: theme.dim }}>仅展示真实数据，不补点</span>
          </div>}
        </div>
        {realPointCount > 0 && <p className="px-1 text-right text-[9px]" style={{ color: theme.dim }}>已显示 {realPointCount} 个有效交易日{realPointCount === 1 ? " · 单点暂未形成曲线" : " · 缺失值断开"}</p>}
      </div>

      <div className="px-4 pb-3 pt-3">
        <p className="flex items-start gap-1.5 text-[10px] leading-relaxed" style={{ color: theme.muted }}><Info size={12} className="mt-0.5 shrink-0" aria-hidden="true" /><span>真实日行情四因子试算，尚未纳入涨跌停压力。数值越低越恐惧，仅供市场观察，不构成投资建议。</span></p>
        <button type="button" onClick={() => setExplanationOpen(open => !open)} aria-expanded={explanationOpen} className="mt-2 flex min-h-9 w-full items-center justify-between border-t pt-2 text-[11px] font-medium focus-visible:outline focus-visible:outline-2" style={{ borderColor: theme.border, color: theme.muted, outlineColor: theme.accent }}>
          <span>计算说明</span><ChevronDown size={14} className={explanationOpen ? "rotate-180 transition-transform" : "transition-transform"} aria-hidden="true" />
        </button>
        {explanationOpen && <div className="mt-2 space-y-2 rounded-lg p-3 text-[10px] leading-relaxed" style={{ background: theme.surface, color: theme.muted }}>
          {data?.factors?.length ? <div className="space-y-2">{data.factors.map(factor => <div key={factor.key} className="flex items-center justify-between gap-2"><span>{factor.label} <span style={{ color: theme.dim }}>· 权重 {Number.isFinite(factor.weight) ? `${Number((factor.weight * 100).toFixed(1))}%` : "—"}</span></span><span className="shrink-0 font-medium tabular-nums" style={{ color: theme.text }}>{validScore(factor.score) ? scoreText(factor.score) : "—"}</span></div>)}</div> : <p>因子明细尚未返回，不预填权重或分数。</p>}
          <p className="border-t pt-2 break-words" style={{ borderColor: theme.border }}>数据来源：{data?.source || "暂未提供"}</p>
          {data && <p>样本 {data.sampleDays} 个交易日 · 回看 {data.lookback} 个交易日</p>}
          {data?.notes?.map((note, index) => <p key={`${index}-${note}`} className="break-words">{note}</p>)}
          {data && <p className="break-all text-[9px]" style={{ color: theme.dim }}>方法版本：{data.methodVersion}</p>}
        </div>}
      </div>
    </section>
  );
}

export default function AiFearGreedSection() {
  const query = trpc.aiDashboardFearGreed.useQuery(undefined, {
    retry: false,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });
  return <AiFearGreedSectionView data={query.data} isLoading={query.isLoading} hasError={query.isError} />;
}
