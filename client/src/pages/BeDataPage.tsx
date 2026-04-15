import { useState, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, ReferenceLine
} from "recharts";

const SYMBOLS = [
  { key: "BTCUSDT", label: "比特币 BTC" },
  { key: "ETHUSDT", label: "以太坊 ETH" },
];

const PAGE_SIZE = 60;
const TABS = [
  { key: "data", label: "日线数据" },
  { key: "analysis", label: "数据分析" },
];

// 颜色常量（与 StockDetail 保持一致）
const RED = "#D32F2F";
const GREEN_A = "#388E3C";
const MUTED = "#888";
const CARD = "#fff";
const BG = "#f5f5f5";

function formatPrice(val: number): string {
  return val.toFixed(2);
}

function formatPct(val: number | null): string {
  if (val == null) return "-";
  return (val >= 0 ? "+" : "") + val.toFixed(2) + "%";
}

// 连涨连跌统计计算函数（与 StockDetail 一致）
function calcStreakFromItems(data: { changePct: number | null }[]): {
  upStreakMap: Record<number, number>;
  downStreakMap: Record<number, number>;
  maxUpStreak: number;
  maxDownStreak: number;
} {
  const upMap: Record<number, number> = {};
  const downMap: Record<number, number> = {};
  let streak = 0;
  let dir: 'up' | 'down' | 'flat' | null = null;
  for (const item of data) {
    const pct = item.changePct;
    if (pct == null) continue;
    const d = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
    if (d === dir) {
      streak++;
    } else {
      if (dir !== null && streak > 0) {
        if (dir === 'up') upMap[streak] = (upMap[streak] || 0) + 1;
        else if (dir === 'down') downMap[streak] = (downMap[streak] || 0) + 1;
      }
      streak = 1;
      dir = d;
    }
  }
  if (dir !== null && streak > 0) {
    if (dir === 'up') upMap[streak] = (upMap[streak] || 0) + 1;
    else if (dir === 'down') downMap[streak] = (downMap[streak] || 0) + 1;
  }
  const maxUp = Math.max(0, ...Object.keys(upMap).map(Number));
  const maxDown = Math.max(0, ...Object.keys(downMap).map(Number));
  return { upStreakMap: upMap, downStreakMap: downMap, maxUpStreak: maxUp, maxDownStreak: maxDown };
}

// 连涨连跌统计组件（三列对称布局，参照 StockDetail）
function StreakStatsPanel({ allData }: { allData: { date: string; changePct: number | null }[] }) {
  const [streakTab, setStreakTab] = useState<30 | 60 | 90 | 180 | 'all'>(60);

  // 各时间段统计（前端计算）
  const allSorted = allData; // 已按日期升序
  const recentData30 = useMemo(() => calcStreakFromItems(allSorted.slice(-30)), [allSorted]);
  const recentData60 = useMemo(() => calcStreakFromItems(allSorted.slice(-60)), [allSorted]);
  const recentData90 = useMemo(() => calcStreakFromItems(allSorted.slice(-90)), [allSorted]);
  const recentData180 = useMemo(() => calcStreakFromItems(allSorted.slice(-180)), [allSorted]);
  const allStreakData = useMemo(() => calcStreakFromItems(allSorted), [allSorted]);

  const curData = streakTab === 'all' ? allStreakData
    : streakTab === 30 ? recentData30
    : streakTab === 60 ? recentData60
    : streakTab === 90 ? recentData90
    : recentData180;

  const { upStreakMap, downStreakMap, maxUpStreak, maxDownStreak } = curData;
  const maxStreak = Math.max(maxUpStreak, maxDownStreak);

  return (
    <div style={{ background: CARD, borderTop: `8px solid ${BG}` }}>
      {/* 标题 + 时间段切换 */}
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: MUTED }}>连涨 / 连跌统计</span>
        <div className="flex items-center gap-1">
          {([30, 60, 90, 180, 'all'] as const).map(n => (
            <button
              key={n}
              onClick={() => setStreakTab(n)}
              className="text-xs px-2 py-0.5"
              style={{
                background: streakTab === n ? RED : '#F0F0F0',
                color: streakTab === n ? '#fff' : MUTED,
                fontWeight: streakTab === n ? 700 : 400,
                borderRadius: 2,
              }}
            >{n === 'all' ? '全量' : `${n}天`}</button>
          ))}
        </div>
      </div>
      {/* 表头 */}
      <div className="px-4 pb-1" style={{ display: 'grid', gridTemplateColumns: '1fr 36px 1fr', gap: 0 }}>
        <span className="text-xs font-medium text-right pr-2" style={{ color: RED }}>连涨次数</span>
        <span className="text-xs font-medium text-center" style={{ color: MUTED }}>天数</span>
        <span className="text-xs font-medium text-left pl-2" style={{ color: GREEN_A }}>连跌次数</span>
      </div>
      {/* 表行 */}
      {Array.from({ length: maxStreak }, (_, i) => i + 1).map(n => {
        const upCnt = upStreakMap[n] || 0;
        const downCnt = downStreakMap[n] || 0;
        const maxCnt = Math.max(
          ...Array.from({ length: maxStreak }, (_, i) => Math.max(upStreakMap[i + 1] || 0, downStreakMap[i + 1] || 0)),
          1
        );
        const BAR_MAX = 80;
        const upW = upCnt > 0 ? Math.max(Math.round((upCnt / maxCnt) * BAR_MAX), 4) : 0;
        const downW = downCnt > 0 ? Math.max(Math.round((downCnt / maxCnt) * BAR_MAX), 4) : 0;
        return (
          <div
            key={n}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 36px 1fr',
              gap: 0,
              borderTop: `1px solid ${BG}`,
              padding: '5px 16px',
              alignItems: 'center',
            }}
          >
            {/* 涨：数字在左，进度条靠右对齐到中间 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
              <span className="text-xs font-bold" style={{ color: upCnt > 0 ? RED : MUTED, minWidth: 28, textAlign: 'right' }}>
                {upCnt > 0 ? `${upCnt}次` : '-'}
              </span>
              <div style={{ width: upW, height: 8, background: RED, borderRadius: '2px 0 0 2px', opacity: 0.85, flexShrink: 0 }} />
            </div>
            {/* 天数居中 */}
            <span className="text-xs font-semibold text-center" style={{ color: MUTED }}>{n}天</span>
            {/* 跌：进度条靠左对齐到中间，数字在右 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 4 }}>
              <div style={{ width: downW, height: 8, background: GREEN_A, borderRadius: '0 2px 2px 0', opacity: 0.85, flexShrink: 0 }} />
              <span className="text-xs font-bold" style={{ color: downCnt > 0 ? GREEN_A : MUTED, minWidth: 28 }}>
                {downCnt > 0 ? `${downCnt}次` : '-'}
              </span>
            </div>
          </div>
        );
      })}
      {maxStreak === 0 && (
        <div className="px-4 py-3 text-xs" style={{ color: MUTED }}>暂无连涨/连跌数据</div>
      )}
      {maxStreak > 0 && (
        <div className="px-4 py-2 text-xs" style={{ color: MUTED }}>
          最长连涨{maxUpStreak}天 · 最长连跌{maxDownStreak}天
          {streakTab === 'all'
            ? <span style={{ marginLeft: 6 }}>（全历史 {allSorted.length} 天）</span>
            : <span style={{ marginLeft: 6 }}>（近{streakTab}天）</span>
          }
        </div>
      )}
    </div>
  );
}

// 涨跌幅频率分布图组件（正态分布直方图）
function ChangePctDistChart({ allData }: { allData: { date: string; changePct: number | null }[] }) {
  const distData = useMemo(() => {
    // 统计每1%区间的出现次数
    const bucketMap: Record<number, number> = {};
    for (const item of allData) {
      const pct = item.changePct;
      if (pct == null) continue;
      // 向下取整到最近的1%区间（如 +2.3% → +2，-1.7% → -2）
      const bucket = pct >= 0 ? Math.floor(pct) : Math.ceil(pct) - 1;
      // 极端值合并到±20%
      const clampedBucket = Math.max(-20, Math.min(20, bucket));
      bucketMap[clampedBucket] = (bucketMap[clampedBucket] || 0) + 1;
    }
    // 找出最小和最大 bucket（确保包含0）
    const keys = Object.keys(bucketMap).map(Number);
    if (keys.length === 0) return [];
    const minB = Math.min(-1, ...keys);
    const maxB = Math.max(0, ...keys);
    const result = [];
    for (let b = minB; b <= maxB; b++) {
      const cnt = bucketMap[b] || 0;
      const label = b === 0 ? '0%' : b > 0 ? `+${b}%` : `${b}%`;
      result.push({ bucket: b, label, count: cnt, isUp: b >= 0, isDown: b < 0 });
    }
    return result;
  }, [allData]);

  const maxCount = useMemo(() => Math.max(1, ...distData.map(d => d.count)), [distData]);

  const totalDays = allData.filter(d => d.changePct != null).length;
  const upDays = allData.filter(d => d.changePct != null && d.changePct > 0).length;
  const downDays = allData.filter(d => d.changePct != null && d.changePct < 0).length;

  // 找出众数（出现最多的区间）
  const modeEntry = distData.reduce((a, b) => b.count > a.count ? b : a, { bucket: 0, label: '0%', count: 0, isUp: false, isDown: false });

  return (
    <div className="bg-white mx-3 rounded-xl border border-gray-200 overflow-hidden mb-3">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-gray-700">涨跌幅频率分布</span>
          <span className="text-xs text-gray-400 ml-2">每1%一个区间 · 共{totalDays}天</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-red-500 font-medium">{upDays}涨</span>
          <span className="text-gray-300">|</span>
          <span className="text-green-600 font-medium">{downDays}跌</span>
        </div>
      </div>
      {/* 图表主体 */}
      <div className="px-2 pt-3 pb-1">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={distData}
            margin={{ top: 16, right: 4, left: -20, bottom: 24 }}
            barCategoryGap={1}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "#9ca3af" }}
              axisLine={{ stroke: "#e5e7eb" }}
              tickLine={false}
              interval={1}
              angle={-45}
              textAnchor="end"
              height={36}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(val: any, _name: any, props: any) => {
                const pct = totalDays > 0 ? ((val / totalDays) * 100).toFixed(1) : '0';
                const b = props?.payload?.bucket;
                const rangeLabel = b != null ? (b >= 0 ? `+${b}% ~ +${b + 1}%` : `${b}% ~ ${b + 1}%`) : '';
                return [`${val} 天 (${pct}%)`, rangeLabel];
              }}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
              labelFormatter={() => ''}
            />
            {/* 0% 参考线 */}
            <ReferenceLine x="0%" stroke="#888" strokeDasharray="4 2" strokeWidth={1.5} />
            <Bar dataKey="count" maxBarSize={28} radius={[2, 2, 0, 0]}>
              {distData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.bucket === 0 ? '#9ca3af' : entry.isUp ? '#ef4444' : '#22c55e'}
                  fillOpacity={entry.count === maxCount ? 1 : 0.65 + (entry.count / maxCount) * 0.35}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* 图例说明 */}
      <div className="px-4 pb-3 flex items-center gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-400"></span>上涨区间</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500"></span>下跌区间</span>
        <span className="ml-auto">众数：{modeEntry.label}（{modeEntry.count}天）</span>
      </div>
    </div>
  );
}

export default function BeDataPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 52;

  const [activeSymbol, setActiveSymbol] = useState(SYMBOLS[0].key);
  const [activeTab, setActiveTab] = useState("data");
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = trpc.cryptoData.getKlines.useQuery(
    { symbol: activeSymbol, page, pageSize: PAGE_SIZE },
    { keepPreviousData: true } as any
  );

  const { data: stats, isLoading: statsLoading } = trpc.cryptoData.getStats.useQuery(
    { symbol: activeSymbol },
    { enabled: activeTab === "analysis" }
  );

  // 全量涨跌幅数组（用于前端分段计算连涨连跌统计）
  const { data: allChangePcts, isLoading: changePctsLoading } = trpc.cryptoData.getAllChangePcts.useQuery(
    { symbol: activeSymbol },
    { enabled: activeTab === "analysis", staleTime: 5 * 60 * 1000 }
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const latestRow = page === 1 ? rows[0] : null;
  const oldestDate = total > 0 ? "17/08/17" : "-";
  const latestDate = latestRow ? latestRow.date : "-";
  const latestClose = latestRow ? latestRow.close : null;
  const latestChangePct = latestRow ? latestRow.changePct : null;
  const isUp = latestChangePct != null && latestChangePct > 0;
  const isDown = latestChangePct != null && latestChangePct < 0;
  const pctColor = isUp ? "text-red-500" : isDown ? "text-green-600" : "text-gray-500";

  const handleSymbolChange = (sym: string) => {
    setActiveSymbol(sym);
    setPage(1);
  };

  // 构建连涨/连跌图表数据（最多显示到10天，用于柱状图）
  const MAX_CONSEC = 10;
  const buildConsecData = (map: Record<number, number>, maxKey: number) => {
    const result = [];
    for (let i = 1; i <= Math.min(maxKey, MAX_CONSEC); i++) {
      result.push({ days: `${i}天`, count: map[i] ?? 0, key: i });
    }
    if (maxKey > MAX_CONSEC) {
      const rest = Object.entries(map)
        .filter(([k]) => parseInt(k) > MAX_CONSEC)
        .reduce((s, [, v]) => s + v, 0);
      if (rest > 0) result.push({ days: `>${MAX_CONSEC}天`, count: rest, key: MAX_CONSEC + 1 });
    }
    return result;
  };

  const upData = stats ? buildConsecData(stats.consecutiveUp, stats.maxConsecUp) : [];
  const downData = stats ? buildConsecData(stats.consecutiveDown, stats.maxConsecDown) : [];

  const analysisLoading = statsLoading || changePctsLoading;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center h-12 px-3">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
            className="flex items-center text-gray-600 mr-2"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-gray-800 text-base flex-1">BE数据</span>
          <button
            onClick={() => window.location.reload()}
            className="text-xs font-medium text-white bg-[#D32F2F] rounded-full px-3 py-1 active:opacity-70"
          >
            更新
          </button>
        </div>

        {/* 币种 Tab */}
        <div className="flex border-b border-gray-200">
          {SYMBOLS.map((s) => (
            <button
              key={s.key}
              onClick={() => handleSymbolChange(s.key)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeSymbol === s.key
                  ? "text-[#D32F2F] border-b-2 border-[#D32F2F]"
                  : "text-gray-500"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 统计栏 */}
      {!isLoading && total > 0 && (
        <div className="bg-white border-b border-gray-200 px-3 py-2.5">
          <div className="flex flex-col gap-1.5">
            <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400 shrink-0">数据范围</span>
              <span className="text-xs font-medium text-gray-700 font-mono ml-2">
                {oldestDate} ~ {latestDate}
              </span>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400 shrink-0">历史数据</span>
              <span className="text-xs font-medium text-gray-700 ml-2">
                <span className="text-[#D32F2F] font-bold">{total}</span> 天 &nbsp;
                <span className="text-[#D32F2F] font-bold">{total}</span> 条日线
              </span>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400 shrink-0">最新收盘</span>
              <span className="text-xs text-gray-400 font-mono ml-2 mr-auto pl-1.5">{latestDate}</span>
              <span className={`text-xs font-bold font-mono ${pctColor}`}>
                {latestClose != null ? formatPrice(latestClose) : "-"}
                <span className="ml-1.5 font-normal">{formatPct(latestChangePct)}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 功能 Tab */}
      <div className="bg-white border-b border-gray-200 flex">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? "text-[#D32F2F] border-b-2 border-[#D32F2F]"
                : "text-gray-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== 日线数据 Tab ===== */}
      {activeTab === "data" && (
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">加载中...</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-sm gap-2">
              <span>暂无数据</span>
            </div>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-1.5 py-2 text-center text-gray-500 font-medium w-[68px]">日期</th>
                  <th className="border border-gray-300 px-1 py-2 text-center text-gray-500 font-medium">开盘</th>
                  <th className="border border-gray-300 px-1 py-2 text-center text-gray-500 font-medium">收盘</th>
                  <th className="border border-gray-300 px-1 py-2 text-center text-gray-500 font-medium">最高</th>
                  <th className="border border-gray-300 px-1 py-2 text-center text-gray-500 font-medium">最低</th>
                  <th className="border border-gray-300 px-1 py-2 text-center text-gray-500 font-medium w-[58px]">涨跌</th>
                  <th className="border border-gray-300 px-1 py-2 text-center text-gray-500 font-medium w-[52px]">振幅</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const up = row.changePct != null && row.changePct > 0;
                  const down = row.changePct != null && row.changePct < 0;
                  const color = up ? "text-red-500" : down ? "text-green-600" : "text-gray-400";
                  const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";
                  return (
                    <tr key={row.date} className={rowBg}>
                      <td className="border border-gray-200 px-1.5 py-2 text-gray-500 font-mono">{row.date}</td>
                      <td className="border border-gray-200 px-1 py-2 text-right text-gray-700 font-mono">{formatPrice(row.open)}</td>
                      <td className={`border border-gray-200 px-1 py-2 text-right font-mono font-medium ${color}`}>{formatPrice(row.close)}</td>
                      <td className="border border-gray-200 px-1 py-2 text-right text-gray-600 font-mono">{formatPrice(row.high)}</td>
                      <td className="border border-gray-200 px-1 py-2 text-right text-gray-600 font-mono">{formatPrice(row.low)}</td>
                      <td className={`border border-gray-200 px-1 py-2 text-right font-mono ${color}`}>{formatPct(row.changePct)}</td>
                      <td className="border border-gray-200 px-1 py-2 text-right text-gray-500 font-mono">
                        {row.amplitudePct != null ? row.amplitudePct.toFixed(2) + "%" : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ===== 数据分析 Tab ===== */}
      {activeTab === "analysis" && (
        <div className="flex-1 overflow-auto pb-6">
          {analysisLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">计算中...</div>
          ) : !stats ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">暂无数据</div>
          ) : (
            <div className="pt-3 space-y-0">

              {/* 涨跌天数概览 */}
              <div className="bg-white mx-3 rounded-xl border border-gray-200 overflow-hidden mb-3">
                <div className="px-4 py-3 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">涨跌天数统计</span>
                  <span className="text-xs text-gray-400 ml-2">共 {stats.total} 天</span>
                </div>
                <div className="grid grid-cols-3 divide-x divide-gray-100">
                  <div className="flex flex-col items-center py-4">
                    <span className="text-2xl font-bold text-red-500">{stats.upDays}</span>
                    <span className="text-xs text-gray-400 mt-1">上涨天数</span>
                    <span className="text-xs text-red-400 font-medium mt-0.5">{stats.upPct}%</span>
                  </div>
                  <div className="flex flex-col items-center py-4">
                    <span className="text-2xl font-bold text-green-600">{stats.downDays}</span>
                    <span className="text-xs text-gray-400 mt-1">下跌天数</span>
                    <span className="text-xs text-green-500 font-medium mt-0.5">{stats.downPct}%</span>
                  </div>
                  <div className="flex flex-col items-center py-4">
                    <span className="text-2xl font-bold text-gray-400">{stats.flatDays}</span>
                    <span className="text-xs text-gray-400 mt-1">平盘天数</span>
                    <span className="text-xs text-gray-400 font-medium mt-0.5">
                      {stats.total > 0 ? (stats.flatDays / stats.total * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>
                {/* 涨跌比例条 */}
                <div className="mx-4 mb-3 h-2 rounded-full overflow-hidden flex">
                  <div className="bg-red-400" style={{ width: `${stats.upPct}%` }} />
                  <div className="bg-gray-200" style={{ width: `${(stats.flatDays / stats.total * 100).toFixed(1)}%` }} />
                  <div className="bg-green-500 flex-1" />
                </div>
              </div>

              {/* 最长连涨/连跌 */}
              <div className="grid grid-cols-2 gap-3 mx-3 mb-3">
                <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-col items-center">
                  <span className="text-xs text-gray-400 mb-1">最长连涨</span>
                  <span className="text-3xl font-bold text-red-500">{stats.maxConsecUp}</span>
                  <span className="text-xs text-gray-400 mt-1">天</span>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-col items-center">
                  <span className="text-xs text-gray-400 mb-1">最长连跌</span>
                  <span className="text-3xl font-bold text-green-600">{stats.maxConsecDown}</span>
                  <span className="text-xs text-gray-400 mt-1">天</span>
                </div>
              </div>

              {/* 连涨/连跌统计（三列对称布局，参照 StockDetail） */}
              {allChangePcts && allChangePcts.length > 0 && (
                <div className="bg-white border border-gray-200 mx-3 rounded-xl overflow-hidden mb-3">
                  <StreakStatsPanel allData={allChangePcts} />
                </div>
              )}

              {/* 连涨次数分布图（柱状图，全量数据） */}
              <div className="bg-white mx-3 rounded-xl border border-gray-200 overflow-hidden mb-3">
                <div className="px-4 py-3 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">连涨次数分布</span>
                  <span className="text-xs text-gray-400 ml-2">连续上涨N天出现的次数（全量）</span>
                </div>
                <div className="px-2 pt-3 pb-2">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={upData} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="days" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={{ stroke: "#e5e7eb" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(val: any) => [`${val} 次`, "出现次数"]}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={32}>
                        {upData.map((_, i) => (
                          <Cell key={i} fill="#ef4444" fillOpacity={0.75 + (i / upData.length) * 0.25} />
                        ))}
                        <LabelList dataKey="count" position="top" style={{ fontSize: 10, fill: "#ef4444", fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 连跌次数分布图（柱状图，全量数据） */}
              <div className="bg-white mx-3 rounded-xl border border-gray-200 overflow-hidden mb-3">
                <div className="px-4 py-3 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">连跌次数分布</span>
                  <span className="text-xs text-gray-400 ml-2">连续下跌N天出现的次数（全量）</span>
                </div>
                <div className="px-2 pt-3 pb-2">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={downData} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="days" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={{ stroke: "#e5e7eb" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(val: any) => [`${val} 次`, "出现次数"]}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={32}>
                        {downData.map((_, i) => (
                          <Cell key={i} fill="#22c55e" fillOpacity={0.75 + (i / downData.length) * 0.25} />
                        ))}
                        <LabelList dataKey="count" position="top" style={{ fontSize: 10, fill: "#16a34a", fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 涨跌幅频率分布图（正态分布直方图） */}
              {allChangePcts && allChangePcts.length > 0 && (
                <ChangePctDistChart allData={allChangePcts} />
              )}

            </div>
          )}
        </div>
      )}

      {/* 分页（仅日线数据 Tab 显示） */}
      {activeTab === "data" && totalPages > 1 && (
        <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isFetching}
            className="px-4 py-1.5 text-sm rounded border border-gray-200 text-gray-600 disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-xs text-gray-400">
            第 {page} / {totalPages} 页 · 共 {total} 条
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isFetching}
            className="px-4 py-1.5 text-sm rounded border border-gray-200 text-gray-600 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
