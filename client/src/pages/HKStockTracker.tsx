/**
 * HKStockTracker.tsx
 * 港股全景仪表盘
 * 路径: /hk-stock-tracker
 * 风格与 LedgerAIDatabase 一致，主色改为深蓝 #1565C0
 */
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, Cell, Area, AreaChart, Legend
} from "recharts";

// ─── 配色 ────────────────────────────────────────────────
const BLUE = "#1565C0";
const BG = "#EEF2F8";
const CARD = "#FFFFFF";
const BORDER = "#D8E0EC";
const TEXT = "#1A1A1A";
const MUTED = "#555555";
const DIM = "#666666";
const RED = "#D32F2F";
const GREEN = "#4CAF50";
const CARD_SHADOW = "0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)";

// ─── 工具函数 ──────────────────────────────────────────────
function pct(n: number, total: number) {
  if (!total) return "0.0";
  return ((n / total) * 100).toFixed(1);
}
function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("zh-CN");
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

function Skeleton() {
  return <div className="animate-pulse rounded-lg h-4 w-full" style={{ background: "#E0E8F0" }} />;
}

// ─── 数字滚动 hook ─────────────────────────────────────────
function useCountUp(target: number, duration: number, active: boolean) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!active) { setValue(0); return; }
    const start = performance.now();
    const from = 0;
    const to = target;
    function step(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (to - from) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration, active]);
  return value;
}

// ─── SectionTitle ──────────────────────────────────────────
function SectionTitle({ title, sub, extra }: { title: string; sub?: string; extra?: React.ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
      <div>
        <p className="font-bold text-base" style={{ color: TEXT }}>{title}</p>
        {sub && <p className="text-[11px] mt-0.5" style={{ color: DIM }}>{sub}</p>}
      </div>
      {extra && <div className="flex-shrink-0">{extra}</div>}
    </div>
  );
}

// ─── 全生命周期折线图 ──────────────────────────────────────
function HKSurvivalSection() {
  const [animated, setAnimated] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [trendGranularity, setTrendGranularity] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const { data: trendData, isLoading: trendLoading } = trpc.stock.hkTrendData.useQuery({ granularity: trendGranularity });

  const latestPoint = trendData?.points?.[trendData.points.length - 1];
  const latestTotal = latestPoint ? (latestPoint.above + latestPoint.below + latestPoint.equal) : 0;
  const latestAbove = latestPoint?.above ?? 0;
  const latestBelow = latestPoint?.below ?? 0;
  const latestEqual = latestPoint?.equal ?? 0;

  useEffect(() => {
    setAnimated(false);
    setTransitioning(true);
    const t1 = setTimeout(() => {
      setTransitioning(false);
      const t2 = setTimeout(() => setAnimated(true), 30);
      return () => clearTimeout(t2);
    }, 50);
    return () => clearTimeout(t1);
  }, [trendGranularity]);

  const countAbove = useCountUp(latestAbove, 850, animated);
  const countBelow = useCountUp(latestBelow, 850, animated);
  const countEqual = useCountUp(latestEqual, 850, animated);
  const abovePct = parseFloat(pct(latestAbove, latestTotal));
  const belowPct = parseFloat(pct(latestBelow, latestTotal));
  const pctAboveAnim = useCountUp(Math.round(abovePct * 10), 850, animated) / 10;
  const pctBelowAnim = useCountUp(Math.round(belowPct * 10), 850, animated) / 10;

  return (
    <div>
      <SectionTitle
        title="全生命周期"
        sub="上市首日至今现价相对首日开盘价的盈亏分布"
        extra={
          <p className="text-[11px] text-right leading-tight whitespace-nowrap" style={{ color: DIM }}>
            {trendLoading ? '数据加载中...' : trendData ? `数据截至 ${fmtDate(trendData.latestDate)}` : '数据加载中...'}
          </p>
        }
      />
      <div className="mx-4 rounded-xl overflow-hidden" style={{ background: CARD, boxShadow: CARD_SHADOW, border: `1px solid ${BORDER}` }}>
        {/* 盈亏色条 */}
        <div className="px-4 pt-4 pb-3">
          {trendLoading ? (
            <Skeleton />
          ) : (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium" style={{ color: RED }}>盈利 {pctAboveAnim}%</span>
                <span className="text-xs font-medium" style={{ color: GREEN }}>亏损 {pctBelowAnim}%</span>
              </div>
              <div className="flex rounded-full overflow-hidden h-4" style={{ background: "#E0E8F0" }}>
                <div
                  className="h-full rounded-l-full"
                  style={{
                    width: transitioning ? '0%' : `${abovePct}%`,
                    background: RED,
                    transition: transitioning ? 'none' : 'width 0.85s cubic-bezier(0.4,0,0.2,1)',
                  }}
                />
                <div
                  className="h-full rounded-r-full"
                  style={{
                    width: transitioning ? '0%' : `${belowPct}%`,
                    background: GREEN,
                    transition: transitioning ? 'none' : 'width 0.85s cubic-bezier(0.4,0,0.2,1)',
                  }}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex flex-col items-start">
                  <span className="text-lg font-bold" style={{ color: RED }}>{fmt(countAbove)}</span>
                  <span className="text-[10px]" style={{ color: DIM }}>只盈利</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-base font-bold" style={{ color: MUTED }}>{fmt(countEqual)}</span>
                  <span className="text-[10px]" style={{ color: DIM }}>持平</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-lg font-bold" style={{ color: GREEN }}>{fmt(countBelow)}</span>
                  <span className="text-[10px]" style={{ color: DIM }}>只亏损</span>
                </div>
              </div>
            </>
          )}
        </div>
        {/* 分隔线 */}
        <div className="mx-4 border-t" style={{ borderColor: BORDER }} />
        {/* 趋势折线图 */}
        <div className="px-4 pt-3 pb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium" style={{ color: MUTED }}>历史趋势</span>
            <div className="flex gap-1">
              {(['day', 'week', 'month', 'year'] as const).map(g => (
                <button
                  key={g}
                  onClick={() => setTrendGranularity(g)}
                  className="px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                  style={{
                    background: trendGranularity === g ? BLUE : '#EEF2F8',
                    color: trendGranularity === g ? '#fff' : MUTED,
                  }}
                >
                  {g === 'day' ? '日' : g === 'week' ? '周' : g === 'month' ? '月' : '年'}
                </button>
              ))}
            </div>
          </div>
          {trendLoading ? (
            <div className="h-32 flex items-center justify-center">
              <span className="text-xs" style={{ color: DIM }}>加载中...</span>
            </div>
          ) : trendData && trendData.points.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={trendData.points} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 8 }} axisLine={false} tickLine={false}
                  tickFormatter={(v: string) => {
                    if (trendGranularity === 'day') return v.slice(5);
                    if (trendGranularity === 'week') return v.slice(5);
                    return v;
                  }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 11, background: CARD, border: `1px solid ${BORDER}` }}
                  formatter={(value: any, name: string) => [fmt(Number(value)), name === 'above' ? '盈利' : name === 'below' ? '亏损' : '持平']}
                />
                <Area type="monotone" dataKey="above" stackId="1" stroke={RED} fill={RED} fillOpacity={0.3} name="above" />
                <Area type="monotone" dataKey="equal" stackId="1" stroke="#9E9E9E" fill="#9E9E9E" fillOpacity={0.2} name="equal" />
                <Area type="monotone" dataKey="below" stackId="1" stroke={GREEN} fill={GREEN} fillOpacity={0.3} name="below" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-32 flex items-center justify-center">
              <span className="text-xs" style={{ color: DIM }}>暂无数据，等待每日16:00更新</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 涨跌幅分布（替代A股涨停聚集效应） ─────────────────────
function HKPctDistSection() {
  const { data, isLoading } = trpc.stock.hkPctDistribution.useQuery();

  return (
    <div>
      <SectionTitle
        title="涨跌幅分布"
        sub="全历史每日涨跌幅分布（港股无涨跌停限制）"
        extra={
          data?.dataReady ? (
            <p className="text-[11px] text-right leading-tight whitespace-nowrap" style={{ color: DIM }}>
              截至 {fmtDate(data.latestDate)}
            </p>
          ) : null
        }
      />
      <div className="mx-4 rounded-xl overflow-hidden" style={{ background: CARD, boxShadow: CARD_SHADOW, border: `1px solid ${BORDER}` }}>
        <div className="px-3 pt-3 pb-4">
          {isLoading ? (
            <div className="h-40 flex items-center justify-center">
              <span className="text-xs" style={{ color: DIM }}>加载中...</span>
            </div>
          ) : !data?.dataReady ? (
            <div className="h-40 flex items-center justify-center">
              <span className="text-xs" style={{ color: DIM }}>暂无数据，等待每日16:00更新</span>
            </div>
          ) : (
            <>
              {/* 统计摘要 */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="text-center p-2 rounded-lg" style={{ background: '#FFF0F0' }}>
                  <p className="text-xs font-bold" style={{ color: RED }}>{fmt(data.up5Count)}</p>
                  <p className="text-[9px]" style={{ color: DIM }}>涨幅≥5%</p>
                </div>
                <div className="text-center p-2 rounded-lg" style={{ background: '#FFF0F0' }}>
                  <p className="text-xs font-bold" style={{ color: RED }}>{fmt(data.up10Count)}</p>
                  <p className="text-[9px]" style={{ color: DIM }}>涨幅≥10%</p>
                </div>
                <div className="text-center p-2 rounded-lg" style={{ background: '#F0FFF0' }}>
                  <p className="text-xs font-bold" style={{ color: GREEN }}>{fmt(data.down5Count)}</p>
                  <p className="text-[9px]" style={{ color: DIM }}>跌幅≥5%</p>
                </div>
                <div className="text-center p-2 rounded-lg" style={{ background: '#F0FFF0' }}>
                  <p className="text-xs font-bold" style={{ color: GREEN }}>{fmt(data.down10Count)}</p>
                  <p className="text-[9px]" style={{ color: DIM }}>跌幅≥10%</p>
                </div>
              </div>
              {/* 柱状图 */}
              {data.buckets.length > 0 && (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={data.buckets} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                    <XAxis
                      dataKey="bucket"
                      tick={{ fill: MUTED, fontSize: 8 }}
                      axisLine={{ stroke: BORDER }}
                      tickLine={false}
                      tickFormatter={(v) => v % 5 === 0 ? `${v}%` : ''}
                      interval={0}
                    />
                    <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} />
                    <Tooltip
                      formatter={(value: any) => [`${Number(value).toLocaleString('zh-CN')} 次`, '出现次数']}
                      labelFormatter={(label) => `涨幅 ${label}%`}
                      contentStyle={{ fontSize: 11, background: CARD, border: `1px solid ${BORDER}` }}
                    />
                    <Bar dataKey="count" name="count" radius={[1, 1, 0, 0]}>
                      {data.buckets.map((entry, i) => {
                        const color = entry.bucket > 0 ? "#EF9A9A" : entry.bucket < 0 ? "#A5D6A7" : "#BDBDBD";
                        return <Cell key={i} fill={color} />;
                      })}
                    </Bar>
                    <ReferenceLine x={0} stroke="#9E9E9E" strokeDasharray="3 3" strokeWidth={1} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="mt-2 px-2 py-1.5 rounded-lg" style={{ background: "#F5F5F5", border: `1px solid ${BORDER}` }}>
                <span className="text-[10px]" style={{ color: MUTED }}>样本：全历史 {fmt(data.totalCount)} 条日涨跌幅记录</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 个股全生命周期列表 ────────────────────────────────────
function HKStockLifecycleSection() {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<'up' | 'down' | 'flat' | 'total' | 'upRate'>('upRate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [keyword, setKeyword] = useState('');
  const [inputKw, setInputKw] = useState('');
  const pageSize = 50;

  const { data, isLoading } = trpc.stock.hkStockLifecycle.useQuery({
    page,
    pageSize,
    sortBy,
    sortDir,
    keyword: keyword || undefined,
    minTotalDays: 0,
  });

  const totalPages = data ? Math.ceil(data.total / pageSize) : 1;

  function handleSort(col: typeof sortBy) {
    if (sortBy === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
    setPage(1);
  }

  function SortIcon({ col }: { col: typeof sortBy }) {
    if (sortBy !== col) return <span style={{ color: '#ccc' }}>↕</span>;
    return <span style={{ color: BLUE }}>{sortDir === 'desc' ? '↓' : '↑'}</span>;
  }

  return (
    <div>
      <SectionTitle
        title="个股全生命周期"
        sub="上市以来每只股票的涨跌天数统计"
        extra={
          data ? (
            <p className="text-[11px] text-right leading-tight whitespace-nowrap" style={{ color: DIM }}>
              共 {fmt(data.total)} 只
            </p>
          ) : null
        }
      />
      <div className="mx-4 rounded-xl overflow-hidden" style={{ background: CARD, boxShadow: CARD_SHADOW, border: `1px solid ${BORDER}` }}>
        {/* 搜索框 */}
        <div className="px-3 pt-3 pb-2 flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-1.5 text-sm outline-none"
            style={{ borderColor: BORDER, background: BG, color: TEXT }}
            placeholder="搜索股票代码或名称..."
            value={inputKw}
            onChange={e => setInputKw(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { setKeyword(inputKw); setPage(1); } }}
          />
          <button
            className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: BLUE, color: '#fff' }}
            onClick={() => { setKeyword(inputKw); setPage(1); }}
          >
            搜索
          </button>
        </div>
        {/* 表头 */}
        <div className="grid grid-cols-6 px-3 py-1.5 text-[10px] font-medium border-b" style={{ borderColor: BORDER, color: MUTED }}>
          <div className="col-span-2">股票</div>
          <div className="text-center cursor-pointer" onClick={() => handleSort('up')}>涨天 <SortIcon col="up" /></div>
          <div className="text-center cursor-pointer" onClick={() => handleSort('down')}>跌天 <SortIcon col="down" /></div>
          <div className="text-center cursor-pointer" onClick={() => handleSort('total')}>总天 <SortIcon col="total" /></div>
          <div className="text-center cursor-pointer" onClick={() => handleSort('upRate')}>涨天率 <SortIcon col="upRate" /></div>
        </div>
        {/* 列表 */}
        {isLoading ? (
          <div className="px-3 py-8 text-center text-xs" style={{ color: DIM }}>加载中...</div>
        ) : !data || data.list.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs" style={{ color: DIM }}>暂无数据，等待每日16:00更新</div>
        ) : (
          data.list.map((item, i) => (
            <div
              key={item.tsCode}
              className="grid grid-cols-6 px-3 py-2 border-b text-xs"
              style={{ borderColor: BORDER, background: i % 2 === 0 ? CARD : '#F8FAFD' }}
            >
              <div className="col-span-2 flex flex-col">
                <span className="font-medium text-[11px]" style={{ color: TEXT }}>{item.name}</span>
                <span className="text-[9px]" style={{ color: DIM }}>{item.tsCode}</span>
              </div>
              <div className="text-center font-medium" style={{ color: RED }}>{item.upDays}</div>
              <div className="text-center font-medium" style={{ color: GREEN }}>{item.downDays}</div>
              <div className="text-center" style={{ color: MUTED }}>{item.totalDays}</div>
              <div className="text-center font-bold" style={{ color: item.upRate >= 50 ? RED : GREEN }}>
                {item.upRate.toFixed(1)}%
              </div>
            </div>
          ))
        )}
        {/* 分页 */}
        {data && totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2">
            <button
              className="px-3 py-1 rounded text-xs disabled:opacity-40"
              style={{ background: BLUE, color: '#fff' }}
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >上一页</button>
            <span className="text-xs" style={{ color: DIM }}>{page} / {totalPages}</span>
            <button
              className="px-3 py-1 rounded text-xs disabled:opacity-40"
              style={{ background: BLUE, color: '#fff' }}
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >下一页</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────
export default function HKStockTracker() {
  const [, setLocation] = useLocation();

  return (
    <div className="h-screen flex flex-col" style={{ background: BG }}>
      {/* 顶部蓝色导航 */}
      <div className="px-4 py-3 flex items-center gap-3 flex-shrink-0" style={{ background: BLUE, color: "#fff" }}>
        <button
          onClick={() => setLocation('/')}
          className="w-7 h-7 flex items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1">
          <p className="font-bold text-lg">港股AI实时追踪</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center justify-center px-3 h-7 rounded-full text-sm font-medium"
          style={{
            backgroundColor: "rgba(255,255,255,0.9)",
            color: BLUE,
            border: "1px solid rgba(255,255,255,0.4)",
            minWidth: "44px",
          }}
        >
          刷新
        </button>
      </div>
      {/* 全部内容单页展开，上下滚动 */}
      <div className="flex-1 overflow-y-auto pb-8">
        <HKSurvivalSection />
        <div className="mx-4 my-1 border-t" style={{ borderColor: BORDER }} />
        <HKPctDistSection />
        <div className="mx-4 my-1 border-t" style={{ borderColor: BORDER }} />
        <HKStockLifecycleSection />
      </div>
    </div>
  );
}
