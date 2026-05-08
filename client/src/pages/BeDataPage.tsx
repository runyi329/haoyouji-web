import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { MarketBetPanelWithTabs } from "./CryptoPrediction";
import { useLocation, useParams } from "wouter";
import { ChevronLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, ReferenceLine,
  ComposedChart, Line, Area, PieChart, Pie, Legend
} from "recharts";

const CDN = "https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK";
const COS_BE = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets";
const ALL_SYMBOLS = [
  { key: "BTCUSDT", label: "比特币 Bitcoin", shortLabel: "BTC",  icon: "/btc-circle-icon.webp", type: "crypto", symbol: "BTCUSDT" },
  { key: "ETHUSDT", label: "以太坊 Ethereum", shortLabel: "ETH",  icon: "/eth-circle-icon.webp", type: "crypto", symbol: "ETHUSDT" },
  { key: "SOLUSDT", label: "索拉纳 Solana", shortLabel: "SOL",  icon: "/sol-circle-icon.webp", type: "crypto", symbol: "SOLUSDT" },
  { key: "AAPL",   label: "Apple",   shortLabel: "AAPL", icon: `${COS_BE}/logo_apple_3d_t_16b8b55f.png`, type: "stock", symbol: "AAPL.US" },
  { key: "MSFT",   label: "Microsoft",   shortLabel: "MSFT", icon: `${COS_BE}/logos/logo_microsoft_3d.png`, type: "stock", symbol: "MSFT.US" },
  { key: "GOOGL",  label: "Alphabet",  shortLabel: "GOOGL", icon: `${COS_BE}/logos/logo_google_3d.png`, type: "stock", symbol: "GOOGL.US" },
  { key: "AMZN",   label: "Amazon",  shortLabel: "AMZN", icon: `${COS_BE}/logo_amazon_3d_t_0c61d380.png`, type: "stock", symbol: "AMZN.US" },
  { key: "NVDA",   label: "NVIDIA",  shortLabel: "NVDA", icon: `${COS_BE}/logo_nvidia_3d_t_d451eb3d.png`, type: "stock", symbol: "NVDA.US" },
  { key: "TSLA",   label: "Tesla",  shortLabel: "TSLA", icon: `${COS_BE}/logo_tesla_3d_t_0d585ca4.png`, type: "stock", symbol: "TSLA.US" },
  { key: "META",   label: "Meta",   shortLabel: "META", icon: `${COS_BE}/logo_meta_3d_t_5b7237ab.png`, type: "stock", symbol: "META.US" },
];
const SYMBOLS = ALL_SYMBOLS; // 兼容旧引用

const PAGE_SIZE = 100; // 每页显示100条
const TABS = [
  { key: "analysis", label: "数据分析" },
  { key: "data", label: "日线数据" },
  { key: "funding", label: "资金费率" },
  { key: "predict", label: "预测未来" },
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
function StreakStatsPanel({ allData, latestDate, coinIcon }: { allData: { date: string; changePct: number | null }[]; latestDate?: string; coinIcon?: string }) {
  const [streakTab, setStreakTab] = useState<30 | 60 | 90 | 180 | 'all'>('all');

  // 各时间段统计（前端计算）
  const allSorted = allData; // 已按日期升序
  const recentData30 = useMemo(() => calcStreakFromItems(allSorted.slice(-30)), [allSorted]);
  const recentData60 = useMemo(() => calcStreakFromItems(allSorted.slice(-60)), [allSorted]);
  const recentData90 = useMemo(() => calcStreakFromItems(allSorted.slice(-90)), [allSorted]);
  const recentData180 = useMemo(() => calcStreakFromItems(allSorted.slice(-180)), [allSorted]);
  const allStreakData = useMemo(() => calcStreakFromItems(allSorted), [allSorted]);

  // 全量最长连涨/连跌（始终取全量）
  const globalMaxUp = allStreakData.maxUpStreak;
  const globalMaxDown = allStreakData.maxDownStreak;

  const curData = streakTab === 'all' ? allStreakData
    : streakTab === 30 ? recentData30
    : streakTab === 60 ? recentData60
    : streakTab === 90 ? recentData90
    : recentData180;

  const { upStreakMap, downStreakMap, maxUpStreak, maxDownStreak } = curData;
  const maxStreak = Math.max(maxUpStreak, maxDownStreak);

  return (
    <div style={{ background: CARD, borderTop: `8px solid ${BG}` }}>
      {/* 标题（最顶部） */}
      <div className="px-4 pt-3 pb-2">
        <span className="text-sm font-semibold text-gray-700 flex items-center gap-1">
          {coinIcon && <img src={coinIcon} alt="" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />}
          连涨 / 连跌统计
        </span>
      </div>
      {/* 最长连涨/连跌（全量）展示区，标题下方 */}
      <div className="flex items-center justify-around px-4 py-2.5 border-b border-gray-100 border-t border-gray-50">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs text-gray-400">最长连涨</span>
          <span className="text-2xl font-bold text-red-500">{globalMaxUp}</span>
          <span className="text-xs text-gray-400">天</span>
        </div>
        <div className="w-px h-5 bg-gray-100" />
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs text-gray-400">最长连跌</span>
          <span className="text-2xl font-bold text-green-600">{globalMaxDown}</span>
          <span className="text-xs text-gray-400">天</span>
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
      {/* 时间段切换按鈕（表格下方） */}
      <div className="px-3 pb-3 pt-2 flex flex-nowrap items-center gap-1 border-t border-gray-50 overflow-x-auto">
        {([30, 60, 90, 180, 'all'] as const).map(n => (
          <button
            key={n}
            onClick={() => setStreakTab(n)}
            style={{
              background: streakTab === n ? RED : '#F0F0F0',
              color: streakTab === n ? '#fff' : MUTED,
              fontWeight: streakTab === n ? 700 : 400,
              borderRadius: 4,
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              padding: '3px 8px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >{n === 'all' ? `全量(${allSorted.length}天)` : `${n}天`}</button>
        ))}
      </div>


    </div>
  );
}

// 涨跌幅频率分布图组件（正态分布直方图）
function ChangePctDistChart({ allData, latestDate, coinIcon }: { allData: { date: string; changePct: number | null }[]; latestDate?: string; coinIcon?: string }) {
  const [rangeExpanded, setRangeExpanded] = useState(false);
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
          <span className="text-sm font-semibold text-gray-700 flex items-center gap-1">
            {coinIcon && <img src={coinIcon} alt="" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />}
            涨跌幅频率分布
          </span>
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
                const pct = totalDays > 0 ? ((val / totalDays) * 100).toFixed(2) : '0';
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

      {/* 区间明细表格：折叠式 */}
      <div className="border-t border-gray-100">
        <div
          className="px-4 py-2 flex items-center justify-between cursor-pointer select-none"
          onClick={() => setRangeExpanded(v => !v)}
        >
          <span className="text-xs font-semibold text-gray-500">区间明细统计</span>
          <span className="text-xs text-gray-400">{rangeExpanded ? '▲ 收起' : '▼ 展开'}</span>
        </div>
        {rangeExpanded && <div className="px-4 pb-3">
        {/* 表头 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 1fr 1fr', gap: 0 }} className="mb-1">
          <span className="text-xs text-right pr-2 font-medium" style={{ color: RED }}>涨天数</span>
          <span className="text-xs text-right pr-2 font-medium" style={{ color: RED }}>占比</span>
          <span className="text-xs text-center font-medium text-gray-400">区间</span>
          <span className="text-xs text-left pl-2 font-medium" style={{ color: GREEN_A }}>跌天数</span>
          <span className="text-xs text-left pl-2 font-medium" style={{ color: GREEN_A }}>占比</span>
        </div>
        {/* 表行：涨幅对称跌幅 */}
        {Array.from({ length: 21 }, (_, i) => i).map(n => {
          const upEntry = distData.find(d => d.bucket === n);
          const downEntry = distData.find(d => d.bucket === -(n + 1));
          const upCnt = upEntry?.count ?? 0;
          const downCnt = downEntry?.count ?? 0;
          if (upCnt === 0 && downCnt === 0) return null;
          const totalAllDaysForRow = distData.reduce((s, d) => s + d.count, 0);
          const upPct = totalAllDaysForRow > 0 ? (upCnt / totalAllDaysForRow * 100).toFixed(2) : '0.00';
          const downPct = totalAllDaysForRow > 0 ? (downCnt / totalAllDaysForRow * 100).toFixed(2) : '0.00';
          const rangeLabel = `≥${n}% <${n+1}%`;
          return (
            <div
              key={n}
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 1fr 1fr', gap: 0, borderTop: '1px solid #f5f5f5', padding: '4px 0', alignItems: 'center' }}
            >
              <span className="text-xs text-right pr-2 font-mono" style={{ color: upCnt > 0 ? RED : '#ccc' }}>{upCnt > 0 ? upCnt : '-'}</span>
              <span className="text-xs text-right pr-2 font-mono" style={{ color: upCnt > 0 ? '#ef9999' : '#ccc' }}>{upCnt > 0 ? `${upPct}%` : '-'}</span>
              <span className="font-mono font-semibold text-center" style={{ fontSize: 9, color: '#888' }}>{rangeLabel}</span>
              <span className="text-xs text-left pl-2 font-mono" style={{ color: downCnt > 0 ? GREEN_A : '#ccc' }}>{downCnt > 0 ? downCnt : '-'}</span>
              <span className="text-xs text-left pl-2 font-mono" style={{ color: downCnt > 0 ? '#6dba72' : '#ccc' }}>{downCnt > 0 ? `${downPct}%` : '-'}</span>
            </div>
          );
        })}
        </div>}
      </div>

      {/* 赔率表 已删除 */}
      {false && <div className="border-t border-gray-100 px-4 pt-2 pb-3">
        <div className="text-xs font-semibold text-gray-500 mb-1">赔率参考表
          <span className="text-xs font-normal text-gray-400 ml-2">含本金 · 绝对概率 · 庄家优势百分比越高赔率越低</span>
        </div>
        {/* 公用表头组件 */}
        {(() => {
          // 计算所有时段切片（近1月~近12月 + 近1年~近5年 + 全量）
          const now = new Date();
          const fmtDate = (d: Date) => {
            const yy = String(d.getFullYear()).slice(-2).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${yy}/${mm}/${dd}`;
          };
          const allPeriodCuts: string[] = [
            ...Array.from({ length: 12 }, (_, i) => { const d = new Date(now); d.setMonth(d.getMonth() - (i + 1)); return fmtDate(d); }),
            ...Array.from({ length: 5 }, (_, i) => { const d = new Date(now); d.setFullYear(d.getFullYear() - (i + 1)); return fmtDate(d); }),
            '00/01/01', // 全量
          ];
          // 对每个区间（n=0~11），在所有时段里找涨幅/跌幅最高概率
          const SLICE_RANGE = 12; // 只统计0~12%内的区间
          const bestUpProb: number[] = Array(SLICE_RANGE).fill(0);
          const bestDownProb: number[] = Array(SLICE_RANGE).fill(0);
          for (const cutDate of allPeriodCuts) {
            const subset = allData.filter(d => d.changePct != null && d.date >= cutDate);
            const total = subset.length;
            if (total === 0) continue;
            for (let ri = 0; ri < SLICE_RANGE; ri++) {
              const upCnt = subset.filter(d => { const p = d.changePct!; return p >= 0 && Math.floor(p) === ri; }).length;
              const downCnt = subset.filter(d => { const p = d.changePct!; return p < 0 && Math.floor(Math.abs(p)) === ri; }).length;
              const upP = upCnt / total * 100;
              const downP = downCnt / total * 100;
              if (upP > bestUpProb[ri]) bestUpProb[ri] = upP;
              if (downP > bestDownProb[ri]) bestDownProb[ri] = downP;
            }
          }

          const COL = '72px 1fr 1fr 1fr 1fr 1fr 1fr';
          const headerStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: COL, gap: 0, background: '#fafafa', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '3px 0' };
          const rowStyle = (i: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: COL, gap: 0, borderBottom: '1px solid #f0f0f0', padding: '2px 0', alignItems: 'center', background: i % 2 === 0 ? '#fff' : '#fafafa' });
          const Header = () => (
            <div style={headerStyle}>
              <span style={{ fontSize: 9, textAlign: 'center', color: '#9ca3af', fontWeight: 600 }}>区间</span>
              <span style={{ fontSize: 9, textAlign: 'center', color: '#9ca3af', fontWeight: 600 }}>概率</span>
              {['10%优', '15%优', '20%优', '25%优'].map(t => (
                <span key={t} style={{ fontSize: 9, textAlign: 'center', color: '#b45309', fontWeight: 600 }}>{t}</span>
              ))}
              <span style={{ fontSize: 9, textAlign: 'center', color: '#7c3aed', fontWeight: 700 }}>最优25%</span>
            </div>
          );
          // 绝对概率：每个区间天数 ÷ 总天数（涨跌所有天），所有区间概率之和 = 100%
          const totalAllDays = distData.reduce((s, d) => s + d.count, 0);
          const upRows = Array.from({ length: 21 }, (_, i) => i).map(n => {
            const entry = distData.find(d => d.bucket === n);
            const cnt = entry?.count ?? 0;
            if (cnt === 0) return null;
            const prob = totalAllDays > 0 ? cnt / totalAllDays : 0;
            const fairOdds = prob > 0 ? 1 / prob : 0;
            // 最优时段最高概率（只对应0~11区间）
            const bestP = n < SLICE_RANGE ? bestUpProb[n] : 0;
            const bestFair = bestP > 0 ? 100 / bestP : 0;
            const bestOdds25 = bestFair > 0 ? (bestFair * 0.75).toFixed(2) : '-';
            return (
              <div key={`up-${n}`} style={rowStyle(n)}>
                <span style={{ fontSize: 8, textAlign: 'center', color: '#888', fontFamily: 'monospace' }}>≥{n}% &lt;{n+1}%</span>
                <span style={{ fontSize: 9, textAlign: 'center', color: '#6b7280', fontFamily: 'monospace' }}>{(prob * 100).toFixed(2)}%</span>
                {[0.10, 0.15, 0.20, 0.25].map(edge => (
                  <span key={edge} style={{ fontSize: 9, textAlign: 'center', color: '#92400e', fontFamily: 'monospace', fontWeight: 600 }}>
                    {(fairOdds * (1 - edge)).toFixed(2)}
                  </span>
                ))}
                <span style={{ fontSize: 9, textAlign: 'center', color: '#7c3aed', fontFamily: 'monospace', fontWeight: 700 }}>{bestOdds25}</span>
              </div>
            );
          });
          // 涨幅概率求和行
          const upProbSum = Array.from({ length: 21 }, (_, i) => i).reduce((s, n) => {
            const entry = distData.find(d => d.bucket === n);
            const cnt = entry?.count ?? 0;
            return s + (totalAllDays > 0 ? cnt / totalAllDays : 0);
          }, 0);
          const upSumRow = (
            <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 1fr 1fr 1fr 1fr 1fr', gap: 0, padding: '4px 0', background: '#fef3c7', borderTop: '1px solid #d97706' }}>
              <span style={{ fontSize: 9, textAlign: 'center', color: '#92400e', fontWeight: 700 }}>合计</span>
              <span style={{ fontSize: 9, textAlign: 'center', color: '#92400e', fontWeight: 700, fontFamily: 'monospace' }}>{(upProbSum * 100).toFixed(2)}%</span>
              {[0.10, 0.15, 0.20, 0.25].map(edge => (
                <span key={edge} style={{ fontSize: 9, textAlign: 'center', color: '#92400e', fontFamily: 'monospace' }}>—</span>
              ))}
              <span style={{ fontSize: 9, textAlign: 'center', color: '#7c3aed', fontFamily: 'monospace' }}>—</span>
            </div>
          );
          const downRows = Array.from({ length: 21 }, (_, i) => i).map(n => {
            const entry = distData.find(d => d.bucket === -(n + 1));
            const cnt = entry?.count ?? 0;
            if (cnt === 0) return null;
            const prob = totalAllDays > 0 ? cnt / totalAllDays : 0;
            const fairOdds = prob > 0 ? 1 / prob : 0;
            const bestP = n < SLICE_RANGE ? bestDownProb[n] : 0;
            const bestFair = bestP > 0 ? 100 / bestP : 0;
            const bestOdds25 = bestFair > 0 ? (bestFair * 0.75).toFixed(2) : '-';
            return (
              <div key={`down-${n}`} style={rowStyle(n)}>
                <span style={{ fontSize: 8, textAlign: 'center', color: '#888', fontFamily: 'monospace' }}>≥{n}% &lt;{n+1}%</span>
                <span style={{ fontSize: 9, textAlign: 'center', color: '#6b7280', fontFamily: 'monospace' }}>{(prob * 100).toFixed(2)}%</span>
                {[0.10, 0.15, 0.20, 0.25].map(edge => (
                  <span key={edge} style={{ fontSize: 9, textAlign: 'center', color: '#92400e', fontFamily: 'monospace', fontWeight: 600 }}>
                    {(fairOdds * (1 - edge)).toFixed(2)}
                  </span>
                ))}
                <span style={{ fontSize: 9, textAlign: 'center', color: '#7c3aed', fontFamily: 'monospace', fontWeight: 700 }}>{bestOdds25}</span>
              </div>
            );
          });
          // 跌幅概率求和行
          const downProbSum = Array.from({ length: 21 }, (_, i) => i).reduce((s, n) => {
            const entry = distData.find(d => d.bucket === -(n + 1));
            const cnt = entry?.count ?? 0;
            return s + (totalAllDays > 0 ? cnt / totalAllDays : 0);
          }, 0);
          const downSumRow = (
            <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr 1fr 1fr 1fr 1fr 1fr', gap: 0, padding: '4px 0', background: '#f0fdf4', borderTop: '1px solid #16a34a' }}>
              <span style={{ fontSize: 9, textAlign: 'center', color: '#15803d', fontWeight: 700 }}>合计</span>
              <span style={{ fontSize: 9, textAlign: 'center', color: '#15803d', fontWeight: 700, fontFamily: 'monospace' }}>{(downProbSum * 100).toFixed(2)}%</span>
              {[0.10, 0.15, 0.20, 0.25].map(edge => (
                <span key={edge} style={{ fontSize: 9, textAlign: 'center', color: '#15803d', fontFamily: 'monospace' }}>—</span>
              ))}
              <span style={{ fontSize: 9, textAlign: 'center', color: '#7c3aed', fontFamily: 'monospace' }}>—</span>
            </div>
          );
          return (
            <>
              {/* 涨幅区 */}
              <div style={{ fontSize: 9, color: RED, fontWeight: 600, margin: '6px 0 2px 2px' }}>↑ 涨幅赔率</div>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                <Header />
                {upRows}
                {upSumRow}
              </div>
              {/* 跌幅区 */}
              <div style={{ fontSize: 9, color: GREEN_A, fontWeight: 600, margin: '8px 0 2px 2px' }}>↓ 跌幅赔率</div>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                <Header />
                {downRows}
                {downSumRow}
              </div>
            </>
          );
        })()}
        <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 6 }}>注：赔率含本金。绝对概率：各区间天数 ÷ 总天数，所有涨跌区间概率之和 = 100%。</div>
      </div>}

      {/* ── 时间切片对比表 ── */}
      <SliceCompareTable allData={allData} />
    </div>
  );
}

// 时间切片对比表：行=区间，列=近1/2/3/5年+全量
function SliceCompareTable({ allData }: { allData: { date: string; changePct: number | null }[] }) {
  const [activeTab, setActiveTab] = useState<'up' | 'down'>('up');

  // 12档区间：0~1, 1~2, ..., 11~12%
  const RANGE_COUNT = 12;
  const RANGES_LABELS = Array.from({ length: RANGE_COUNT }, (_, i) => `${i}%~${i+1}%`);

  // 时间切片：近1~12月 + 近1~5年 + 全量
  const periods = useMemo(() => {
    const now = new Date();
    const fmtDate = (d: Date) => {
      const yyyy = String(d.getFullYear()).padStart(4, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}/${mm}/${dd}`;
    };
    const byMonth = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now);
      d.setMonth(d.getMonth() - (i + 1));
      return { label: `近${i+1}月`, cutDate: fmtDate(d), group: 'month' };
    });
    const byYear = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - (i + 1));
      return { label: `近${i+1}年`, cutDate: fmtDate(d), group: 'year' };
    });
    const all = { label: '全量', cutDate: '2000/01/01', group: 'year' };
    return [...byMonth, ...byYear, all];
  }, []);

  // 计算每个切片×每个区间的涨/跌概率
  const sliceData = useMemo(() => {
    return periods.map(({ label, cutDate, group }) => {
      const subset = allData.filter(d => d.changePct != null && d.date >= cutDate);
      const total = subset.length;
      const upCnts = Array(RANGE_COUNT).fill(0);
      const downCnts = Array(RANGE_COUNT).fill(0);
      for (const d of subset) {
        const pct = d.changePct!;
        const b = pct >= 0 ? Math.floor(pct) : Math.ceil(pct) - 1;
        if (b >= 0 && b < RANGE_COUNT) upCnts[b]++;
        const db = -(b + 1); // e.g. -1% ~ 0% → bucket=-1
        const di = -(b) - 1; // index: 0~11
        if (pct < 0) {
          const absB = Math.floor(Math.abs(pct));
          if (absB < RANGE_COUNT) downCnts[absB]++;
        }
      }
      // re-compute downCnts correctly
      const downCnts2 = Array(RANGE_COUNT).fill(0);
      for (const d of subset) {
        const pct = d.changePct!;
        if (pct < 0) {
          const absB = Math.floor(Math.abs(pct)); // 0.x~1% → 0, 1.x~2% → 1
          if (absB < RANGE_COUNT) downCnts2[absB]++;
        }
      }
      return { label, total, group, upCnts, downCnts: downCnts2 };
    });
  }, [allData, periods]);

  // 热力图：全局最大值归一化，颜色更有区分度
  const maxUpPct = useMemo(() => {
    let m = 0;
    for (const s of sliceData) for (let i = 0; i < RANGE_COUNT; i++) {
      const p = s.total > 0 ? s.upCnts[i] / s.total * 100 : 0;
      if (p > m) m = p;
    }
    return m || 1;
  }, [sliceData]);
  const maxDownPct = useMemo(() => {
    let m = 0;
    for (const s of sliceData) for (let i = 0; i < RANGE_COUNT; i++) {
      const p = s.total > 0 ? s.downCnts[i] / s.total * 100 : 0;
      if (p > m) m = p;
    }
    return m || 1;
  }, [sliceData]);

  const heatUp = (pct: number) => {
    const t = Math.min(1, pct / maxUpPct);
    // 白→浅红→深红
    const r = Math.round(255);
    const g = Math.round(255 - t * 200);
    const b2 = Math.round(255 - t * 220);
    return `rgb(${r},${g},${b2})`;
  };
  const heatDown = (pct: number) => {
    const t = Math.min(1, pct / maxDownPct);
    // 白→浅绿→深绿
    const r2 = Math.round(255 - t * 200);
    const g2 = Math.round(255);
    const b3 = Math.round(255 - t * 200);
    return `rgb(${r2},${g2},${b3})`;
  };
  const textColor = (t: number) => t > 0.5 ? '#fff' : '#374151';

  // 行=区间，列=时段（所有切片合并为一张表）
  // 同一行横向扫：看同一区间在不同时段的概率变化
  const renderTable = (isUp: boolean) => {
    // 每行独立计算最大、最小概率，用 (pct - rowMin) / (rowMax - rowMin) 归一化
    // 最小值映射到白色，最大值映射到最深红，行与行完全独立
    const rowRanges = RANGES_LABELS.map((_, ri) => {
      let maxP = 0, minP = Infinity;
      for (const s of sliceData) {
        const cnt = isUp ? s.upCnts[ri] : s.downCnts[ri];
        const p = s.total > 0 ? cnt / s.total * 100 : 0;
        if (p > maxP) maxP = p;
        if (p < minP) minP = p;
      }
      if (minP === Infinity) minP = 0;
      const span = maxP - minP;
      return { maxP, minP, span: span > 0 ? span : 1 };
    });
    // 保留向下兼容（rowMaxPcts 不再使用，但不删除避免引用错误）
    const rowMaxPcts = rowRanges.map(r => r.maxP || 1);
    return (
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 9, minWidth: 'max-content' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={{ padding: '4px 8px', textAlign: 'left', color: '#9ca3af', fontWeight: 600, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#f9fafb', zIndex: 1 }}>区间</th>
              {sliceData.map((s, si) => (
                <th key={s.label} style={{
                  padding: '3px 4px', textAlign: 'center', color: '#6b7280', fontWeight: 600,
                  borderBottom: '2px solid #e5e7eb', borderLeft: si === 12 ? '2px solid #d1d5db' : '1px solid #e5e7eb',
                  whiteSpace: 'nowrap', minWidth: 36, fontSize: 8,
                  background: si === 12 ? '#f0f4ff' : '#f9fafb'
                }}>
                  {s.label}
                  <div style={{ fontSize: 7, color: '#9ca3af', fontWeight: 400 }}>{s.total}天</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RANGES_LABELS.map((rl, ri) => {
              // 找出该行最大值的列索引
              let rowMaxVal = 0;
              let rowMaxIdx = -1;
              sliceData.forEach((s, si) => {
                const cnt = isUp ? s.upCnts[ri] : s.downCnts[ri];
                const p = s.total > 0 ? cnt / s.total * 100 : 0;
                if (p > rowMaxVal) { rowMaxVal = p; rowMaxIdx = si; }
              });
              return (
                <tr key={rl}>
                  <td style={{ padding: '3px 8px', fontFamily: 'monospace', color: '#374151', whiteSpace: 'nowrap', borderBottom: '1px solid #f0f0f0', position: 'sticky', left: 0, background: '#fff', zIndex: 1, fontWeight: 600, fontSize: 9 }}>{rl}</td>
                  {sliceData.map((s, si) => {
                    const cnt = isUp ? s.upCnts[ri] : s.downCnts[ri];
                    const pct = s.total > 0 ? cnt / s.total * 100 : 0;
                    // 行内归一化：(pct - rowMin) / (rowMax - rowMin)
                    // 最小值 = 白色，最大值 = 最深红，行与行完全独立
                    const { minP, span } = rowRanges[ri];
                    const t = Math.min(1, Math.max(0, (pct - minP) / span));
                    const g2 = Math.round(255 - t * 210);
                    const bg = `rgb(255,${g2},${g2})`;
                    const isMax = si === rowMaxIdx && rowMaxVal > 0;
                    // 最大值：黄色字体加粗标注；其他：根据背景深浅决定白/深灰
                    const tc = isMax ? '#fbbf24' : (t > 0.55 ? '#fff' : '#374151');
                    return (
                      <td key={si} style={{
                        padding: '3px 3px', textAlign: 'center', background: bg,
                        borderLeft: si === 12 ? '2px solid #d1d5db' : '1px solid #e5e7eb',
                        borderBottom: '1px solid #f0f0f0',
                        outline: isMax ? '1.5px solid #fbbf24' : 'none',
                        outlineOffset: '-1px'
                      }}>
                        <span style={{ color: tc, fontFamily: 'monospace', fontWeight: isMax ? 800 : 600, fontSize: 8 }}>
                          {pct.toFixed(1)}%{isMax ? ' ★' : ''}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const [heatmapExpanded, setHeatmapExpanded] = useState(false);

  return (
    <div className="border-t border-gray-100">
      <div
        className="px-4 py-2 flex items-center justify-between cursor-pointer select-none"
        onClick={() => setHeatmapExpanded(v => !v)}
      >
        <span className="text-xs font-semibold text-gray-600">区间×时段概率热力图</span>
        <span className="text-xs text-gray-400">{heatmapExpanded ? '▲ 收起' : '▼ 展开'}</span>
      </div>
      {heatmapExpanded && <div className="px-4 pt-1 pb-4">
      <div className="text-xs text-gray-400 mb-3">行 = 区间（横向看同一区间在不同时段的概率变化）· 列 = 时段（近1月→近12月 │ 近1年→全量）· 颜色深浅为行内归一化</div>

      {/* Tab 切换 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setActiveTab('up')}
          style={{ padding: '4px 16px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: activeTab === 'up' ? '#ef4444' : '#f3f4f6',
            color: activeTab === 'up' ? '#fff' : '#6b7280' }}
        >↑ 涨幅</button>
        <button
          onClick={() => setActiveTab('down')}
          style={{ padding: '4px 16px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: activeTab === 'down' ? '#ef4444' : '#f3f4f6',
            color: activeTab === 'down' ? '#fff' : '#6b7280' }}
        >↓ 跌幅</button>
      </div>

      {renderTable(activeTab === 'up')}

      <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 4 }}>注：热力图深浅为行内归一化，即同一区间内最高概率为最深色，方便看同一区间在不同时段的变化。第13列起为年度切片（加粗分隔线）。</div>
      </div>}
    </div>
  );
}

// ===== 按年涨跌幅明细组件（可折叠） =====
function YearlyBreakdown({
  allChangePcts,
  totalUpPct,
  totalDownPct,
  coinIcon,
}: {
  allChangePcts: { date: string; changePct: number | null; close?: number | null }[];
  totalUpPct: number;
  totalDownPct: number;
  coinIcon?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  // 按年分组计算每年累计涨幅、跌幅、线性净值、实际涨幅
  const yearlyData = useMemo(() => {
    const map: Record<string, { upPct: number; downPct: number; firstClose: number | null; lastClose: number | null }> = {};
    for (const item of allChangePcts) {
      const year = item.date.slice(0, 4);
      if (!map[year]) map[year] = { upPct: 0, downPct: 0, firstClose: null, lastClose: null };
      if (item.changePct != null) {
        if (item.changePct > 0) map[year].upPct += item.changePct;
        else if (item.changePct < 0) map[year].downPct += Math.abs(item.changePct);
      }
      // 记录首末收盘价
      if (item.close != null) {
        if (map[year].firstClose === null) map[year].firstClose = item.close;
        map[year].lastClose = item.close;
      }
    }
    return Object.entries(map)
      .sort((a, b) => b[0].localeCompare(a[0])) // 降序（最新年在上）
      .map(([year, v]) => {
        const linearNet = v.upPct - v.downPct;
        const actualPct = (v.firstClose != null && v.lastClose != null && v.firstClose > 0)
          ? ((v.lastClose - v.firstClose) / v.firstClose) * 100
          : null;
        return {
          year,
          upPct: parseFloat(v.upPct.toFixed(2)),
          downPct: parseFloat(v.downPct.toFixed(2)),
          downPctNeg: -parseFloat(v.downPct.toFixed(2)),
          linearNet: parseFloat(linearNet.toFixed(2)),
          actualPct: actualPct != null ? parseFloat(actualPct.toFixed(2)) : null,
        };
      });
  }, [allChangePcts]);

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtSigned = (n: number) => (n >= 0 ? '+' : '') + fmt(n);

  return (
    <div className="bg-white mx-3 rounded-xl border border-gray-200 overflow-hidden mb-3">
      {/* 标题行：总计 + 展开按钮 */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
      >
        <div>
          <span className="text-sm font-semibold text-gray-700 flex items-center gap-1">
            {coinIcon && <img src={coinIcon} alt="" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />}
            累计涨跌幅
          </span>
          <span className="text-xs text-gray-400 ml-2">所有上涨/下跌日涨跌幅累加</span>
        </div>
        <span className="text-xs text-gray-400">{expanded ? '▲ 收起' : '▼ 按年明细'}</span>
      </div>
      {/* 总计数据 */}
      <div className="grid grid-cols-2 divide-x divide-gray-100 border-t border-gray-100">
        <div className="flex flex-col items-center py-4">
          <span className="text-xl font-bold text-red-500">+{fmt(totalUpPct)}%</span>
          <span className="text-xs text-gray-400 mt-1">累计涨幅</span>
        </div>
        <div className="flex flex-col items-center py-4">
          <span className="text-xl font-bold text-green-600">-{fmt(totalDownPct)}%</span>
          <span className="text-xs text-gray-400 mt-1">累计跌幅</span>
        </div>
      </div>
      {/* 按年明细（可折叠） */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* 表头 - 5列，像Excel表格用细线分割 */}
          <div className="grid grid-cols-5 border-b border-gray-200 bg-gray-50">
            <div className="px-2 py-2 border-r border-gray-200">
              <span className="text-xs font-semibold text-gray-500">年份</span>
            </div>
            <div className="px-2 py-2 border-r border-gray-200 text-right">
              <span className="text-xs font-semibold text-red-500">涨幅累加</span>
            </div>
            <div className="px-2 py-2 border-r border-gray-200 text-right">
              <span className="text-xs font-semibold text-green-600">跌幅累加</span>
            </div>
            <div className="px-2 py-2 border-r border-gray-200 text-right">
              <span className="text-xs font-semibold text-gray-500">线性净值</span>
            </div>
            <div className="px-2 py-2 text-right">
              <span className="text-xs font-semibold text-blue-600">实际涨幅</span>
            </div>
          </div>
          {yearlyData.map((row, idx) => (
            <div key={row.year} className={`grid grid-cols-5 border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
              <div className="px-2 py-0.5 border-r border-gray-100">
                <span className="text-xs font-medium text-gray-700">{row.year}年</span>
              </div>
              <div className="px-2 py-0.5 border-r border-gray-100 text-right">
                <span className="text-xs font-mono text-red-500">+{fmt(row.upPct)}%</span>
              </div>
              <div className="px-2 py-0.5 border-r border-gray-100 text-right">
                <span className="text-xs font-mono text-green-600">-{fmt(row.downPct)}%</span>
              </div>
              <div className="px-2 py-0.5 border-r border-gray-100 text-right">
                <span className={`text-xs font-mono ${row.linearNet >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                  {fmtSigned(row.linearNet)}%
                </span>
              </div>
              <div className="px-2 py-0.5 text-right">
                <span className={`text-xs font-mono ${row.actualPct == null ? 'text-gray-400' : row.actualPct >= 0 ? 'text-red-500' : 'text-green-600'}`}>
                  {row.actualPct != null ? fmtSigned(row.actualPct) + '%' : '-'}
                </span>
              </div>
            </div>
          ))}
          {/* 说明 */}
          <div className="px-4 py-1.5 bg-gray-50 border-t border-gray-200">
            <p className="text-xs text-gray-400">线性净值=涨幅累加-跌幅累加；实际涨幅=年末/年初收盘价</p>
          </div>
          {/* 图表：分组柱状图（涨幅累加/跌幅累加）+ 实际涨幅折线 */}
          <div className="px-2 pt-3 pb-3 border-t border-gray-100">
            <div className="text-xs text-gray-400 px-2 mb-1">按年可视化</div>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart
                data={[...yearlyData].reverse()}
                margin={{ top: 8, right: 8, left: -20, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="year" tick={{ fontSize: 9, fill: '#999' }} angle={-45} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 9, fill: '#999' }} />
                <ReferenceLine y={0} stroke="#ccc" strokeWidth={1} />
                <Tooltip
                  contentStyle={{ fontSize: 11, padding: '4px 8px' }}
                  formatter={(value: number, name: string) => [
                    `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`,
                    name === 'linearNet' ? '线性净值' : name === 'actualPct' ? '实际涨幅' : name
                  ]}
                  labelFormatter={(label) => `${label}年`}
                />
                <Bar dataKey="linearNet" name="linearNet" radius={[2,2,2,2]} opacity={0.85}>
                  {([...yearlyData].reverse()).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.linearNet >= 0 ? '#ef4444' : '#22c55e'} />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="actualPct" name="actualPct" stroke="#3b82f6" strokeWidth={1.5} dot={{ r: 2, fill: '#3b82f6' }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-3 px-2 mt-1">
              <span className="flex items-center gap-1 text-xs text-gray-400"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-400"></span>线性净值（正）</span>
              <span className="flex items-center gap-1 text-xs text-gray-400"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-500"></span>线性净值（负）</span>
              <span className="flex items-center gap-1 text-xs text-gray-400"><span className="inline-block w-5 h-0.5 bg-blue-500"></span>实际涨幅</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// FourTierTable 已删除
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _FourTierTable_REMOVED({ allData }: { allData: { date: string; changePct: number | null }[] }) {
  const HOUSE_EDGE = 0.25;

  // 时间切片：近1~12月 + 近1~5年 + 全量（与 SliceCompareTable 完全一致）
  const periods = useMemo(() => {
    const now = new Date();
    const fmtDate = (d: Date) => {
      const yyyy = String(d.getFullYear()).padStart(4, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}/${mm}/${dd}`;
    };
    const byMonth = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now);
      d.setMonth(d.getMonth() - (i + 1));
      return { label: `近${i+1}月`, cutDate: fmtDate(d), group: 'month' };
    });
    const byYear = Array.from({ length: 5 }, (_, i) => {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - (i + 1));
      return { label: `近${i+1}年`, cutDate: fmtDate(d), group: 'year' };
    });
    const all = { label: '全量', cutDate: '2000/01/01', group: 'year' };
    return [...byMonth, ...byYear, all];
  }, []);

  // 每个切片计算 4 档分界点 X/Y 及各档概率
  const sliceData = useMemo(() => {
    return periods.map(({ label, cutDate, group }) => {
      const subset = allData
        .filter(d => d.changePct != null && d.date >= cutDate)
        .map(d => d.changePct as number);
      const total = subset.length;
      if (total === 0) {
        return { label, total, group, X: 0, Y: 0, bigUp: 0, smallUp: 0, smallDown: 0, bigDown: 0 };
      }

      // 涨幅中位数 X：所有 pct > 0 的排序，取第50百分位
      const upVals = subset.filter(p => p > 0).sort((a, b) => a - b);
      const downVals = subset.filter(p => p < 0).map(p => Math.abs(p)).sort((a, b) => a - b);

      let X = 0, Y = 0;
      if (upVals.length > 0) {
        const mid = (upVals.length - 1) / 2;
        const lo = Math.floor(mid), hi = Math.ceil(mid);
        X = parseFloat(((upVals[lo] + upVals[hi]) / 2).toFixed(6));
      }
      if (downVals.length > 0) {
        const mid = (downVals.length - 1) / 2;
        const lo = Math.floor(mid), hi = Math.ceil(mid);
        Y = parseFloat(((downVals[lo] + downVals[hi]) / 2).toFixed(6));
      }

      const bigUpCnt   = subset.filter(p => p >= X).length;
      const smallUpCnt = subset.filter(p => p >= 0 && p < X).length;
      const smallDownCnt = subset.filter(p => p < 0 && p > -Y).length;
      const bigDownCnt = subset.filter(p => p <= -Y).length;

      return {
        label, total, group,
        X, Y,
        bigUp:    parseFloat((bigUpCnt   / total).toFixed(6)),
        smallUp:  parseFloat((smallUpCnt / total).toFixed(6)),
        smallDown:parseFloat((smallDownCnt / total).toFixed(6)),
        bigDown:  parseFloat((bigDownCnt  / total).toFixed(6)),
      };
    });
  }, [allData, periods]);

  // 4 档标签
  const TIERS = [
    { key: 'bigUp',    label: '大涨', isUp: true },
    { key: 'smallUp',  label: '小涨', isUp: true },
    { key: 'smallDown',label: '小跌', isUp: false },
    { key: 'bigDown',  label: '大跌', isUp: false },
  ] as const;

  // 行内归一化：每行独立计算 min/max
  const rowRanges = useMemo(() => {
    return TIERS.map(tier => {
      let maxP = 0, minP = Infinity;
      for (const s of sliceData) {
        const p = s[tier.key] * 100;
        if (p > maxP) maxP = p;
        if (p < minP) minP = p;
      }
      if (minP === Infinity) minP = 0;
      const span = maxP - minP;
      return { maxP, minP, span: span > 0 ? span : 1 };
    });
  }, [sliceData]);

  const heatColor = (t: number, isUp: boolean) => {
    // 涨档：白→深红；跌档：白→深绿
    if (isUp) {
      const g = Math.round(255 - t * 210);
      return `rgb(255,${g},${g})`;
    } else {
      const r = Math.round(255 - t * 210);
      return `rgb(${r},255,${r})`;
    }
  };

  return (
    <div className="border-t border-gray-100 px-4 pt-3 pb-4">
      <div className="text-xs font-semibold text-gray-600 mb-1">4档竞猜分界点×时段热力图</div>
      <div className="text-xs text-gray-400 mb-3">
        行 = 4档（大涨/小涨/小跌/大跌）· 列 = 时段（近1月→近12月 │ 近1年→全量）· 分界点 X/Y 取各切片涨跌中位数
      </div>
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 9, minWidth: 'max-content' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={{ padding: '4px 8px', textAlign: 'left', color: '#9ca3af', fontWeight: 600, borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: '#f9fafb', zIndex: 1 }}>档位</th>
              {sliceData.map((s, si) => (
                <th key={s.label} style={{
                  padding: '3px 4px', textAlign: 'center', color: '#6b7280', fontWeight: 600,
                  borderBottom: '2px solid #e5e7eb', borderLeft: si === 12 ? '2px solid #d1d5db' : '1px solid #e5e7eb',
                  whiteSpace: 'nowrap', minWidth: 44, fontSize: 8,
                  background: si === 12 ? '#f0f4ff' : '#f9fafb'
                }}>
                  {s.label}
                  <div style={{ fontSize: 7, color: '#9ca3af', fontWeight: 400 }}>{s.total}天</div>
                  {s.total > 0 && (
                    <div style={{ fontSize: 7, color: '#b45309', fontWeight: 400 }}>X={s.X.toFixed(2)}%</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIERS.map((tier, ri) => {
              // 找出该行最大值的列索引
              let rowMaxVal = 0;
              let rowMaxIdx = -1;
              sliceData.forEach((s, si) => {
                const p = s[tier.key] * 100;
                if (p > rowMaxVal) { rowMaxVal = p; rowMaxIdx = si; }
              });
              const { minP, span } = rowRanges[ri];
              return (
                <tr key={tier.key}>
                  <td style={{
                    padding: '3px 8px', fontFamily: 'monospace', whiteSpace: 'nowrap',
                    borderBottom: '1px solid #f0f0f0', position: 'sticky', left: 0, background: '#fff', zIndex: 1,
                    fontWeight: 700, fontSize: 9,
                    color: tier.isUp ? '#dc2626' : '#16a34a'
                  }}>{tier.label}</td>
                  {sliceData.map((s, si) => {
                    const prob = s[tier.key];
                    const pct = prob * 100;
                    const t = Math.min(1, Math.max(0, (pct - minP) / span));
                    const bg = heatColor(t, tier.isUp);
                    const isMax = si === rowMaxIdx && rowMaxVal > 0;
                    const tc = isMax ? '#fbbf24' : (t > 0.55 ? '#fff' : '#374151');
                    const odds = prob > 0 ? (1 / prob * (1 - HOUSE_EDGE)) : 0;
                    return (
                      <td key={si} style={{
                        padding: '3px 3px', textAlign: 'center', background: bg,
                        borderLeft: si === 12 ? '2px solid #d1d5db' : '1px solid #e5e7eb',
                        borderBottom: '1px solid #f0f0f0',
                        outline: isMax ? '1.5px solid #fbbf24' : 'none',
                        outlineOffset: '-1px'
                      }}>
                        <span style={{ color: tc, fontFamily: 'monospace', fontWeight: isMax ? 800 : 600, fontSize: 8 }}>
                          {pct.toFixed(1)}%{isMax ? ' ★' : ''}
                        </span>
                        <div style={{ color: tc, fontFamily: 'monospace', fontWeight: 600, fontSize: 7, opacity: 0.85 }}>
                          {odds > 0 ? `${odds.toFixed(2)}x` : '-'}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 4 }}>
        注：X=涨幅中位数（大涨≥X），Y=跌幅中位数（大跌≥Y），分界点按各切片独立计算。赔率含25%优势扣。热力图深浅为行内归一化。
      </div>
    </div>
  );
}

// ===== 预测未来 Tab 组件 =====
function PredictTab({ allData, symbol }: { allData: { date: string; changePct: number | null }[]; symbol: string }) {
  const symbolLabel = symbol === 'BTCUSDT' ? 'BTC 比特币' : 'ETH 以太坊';
  const HOUSE_EDGE = 0.25;
  const MAX_POINTS = 1000;
  const MIN_POINTS = 10;
  const MAX_RANGE = 11; // 最大区间下标（≥1% <12%），共12档：0~11

  const [dir, setDir] = useState<'up' | 'down' | null>(null);
  const [rangeIdx, setRangeIdx] = useState(0);
  const [points, setPoints] = useState(100);
  const [confirmed, setConfirmed] = useState(false);

  const distMap = useMemo(() => {
    const m: Record<number, number> = {};
    for (const item of allData) {
      const pct = item.changePct;
      if (pct == null) continue;
      const bucket = pct >= 0 ? Math.floor(pct) : Math.ceil(pct) - 1;
      const clamped = Math.max(-20, Math.min(20, bucket));
      m[clamped] = (m[clamped] || 0) + 1;
    }
    return m;
  }, [allData]);

  // 绝对概率：÷总天数（涨跌所有天），与赔率参考表保持一致
  const totalAllDays = useMemo(() => Object.values(distMap).reduce((s, v) => s + v, 0), [distMap]);

  // 最多12档：≥0%<1%, ≥1%<2%, ..., ≥11%<12%
  const upRanges = useMemo(() => Array.from({ length: MAX_RANGE + 1 }, (_, i) => ({
    rangeLabel: `≥${i}% <${i + 1}%`,
    bucket: i,
    count: distMap[i] ?? 0,
    prob: totalAllDays > 0 ? (distMap[i] ?? 0) / totalAllDays : 0,
  })), [distMap, totalAllDays]);

  const downRanges = useMemo(() => Array.from({ length: MAX_RANGE + 1 }, (_, i) => ({
    rangeLabel: `≥${i}% <${i + 1}%`,
    bucket: -(i + 1),
    count: distMap[-(i + 1)] ?? 0,
    prob: totalAllDays > 0 ? (distMap[-(i + 1)] ?? 0) / totalAllDays : 0,
  })), [distMap, totalAllDays]);

  const ranges = dir === 'down' ? downRanges : upRanges;
  const safeRangeIdx = Math.min(rangeIdx, MAX_RANGE);
  const currentRange = ranges[safeRangeIdx];
  const currentOdds = currentRange && currentRange.prob > 0
    ? parseFloat((1 / currentRange.prob * (1 - HOUSE_EDGE)).toFixed(2))
    : 0;
  const payout = currentOdds > 0 ? Math.floor(points * currentOdds) : 0;

  // 配色方案：涨=红霸光，跌=绿霸光
  const isUp = dir !== 'down';
  const neonUp = { main: '#ff4d4d', glow: 'rgba(255,77,77,0.6)', bg: 'linear-gradient(135deg,#3a0000,#8b0000)', border: '#ff4d4d', card: 'rgba(255,77,77,0.08)' };
  const neonDown = { main: '#00e676', glow: 'rgba(0,230,118,0.6)', bg: 'linear-gradient(135deg,#003a1a,#006633)', border: '#00e676', card: 'rgba(0,230,118,0.08)' };
  // 未选方向时用金色，选了方向后用对应的涨跌霸光色
  const neonGold = { main: '#d4af37', glow: 'rgba(212,175,55,0.6)', bg: 'linear-gradient(135deg,#1a1200,#3d2e00)', border: '#d4af37', card: 'rgba(212,175,55,0.08)' };
  const neon = dir === 'down' ? neonDown : dir === 'up' ? neonUp : neonGold;

  const handleConfirm = () => {
    if (!dir || points <= 0) return;
    setConfirmed(true);
    setTimeout(() => setConfirmed(false), 3000);
  };

  const sliderBg = (val: number, min: number, max: number, color: string) =>
    `linear-gradient(to right, ${color} 0%, ${color} ${((val - min) / (max - min)) * 100}%, rgba(255,255,255,0.08) ${((val - min) / (max - min)) * 100}%, rgba(255,255,255,0.08) 100%)`;

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-auto pb-10" style={{
      background: 'linear-gradient(160deg, #0a0800 0%, #110e00 50%, #0a0800 100%)',
      minHeight: '100%',
    }}>
      {/* 黑金光晕背景装饰 */}
      <div style={{ position: 'absolute', top: 40, left: '5%', width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(212,175,55,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 80, right: '5%', width: 100, height: 100, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,215,0,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 200, left: '40%', width: 80, height: 80, borderRadius: '50%', background: 'radial-gradient(circle, rgba(184,142,4,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* 头部 */}
      <div className="px-4 pt-5 pb-4 relative">        <div className="text-xs font-medium" style={{ color: 'rgba(212,175,55,0.6)', letterSpacing: 2 }}>{symbolLabel.toUpperCase()}</div>
        <div className="text-xl font-black mt-1" style={{
          background: 'linear-gradient(90deg, #d4af37, #ffd700, #b8860b, #ffd700)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: 1,
          textShadow: 'none',
        }}>明日涨跌预测</div>
      </div>

      {/* 方向选择——两个霸光大按钮 */}
      <div className="px-4 grid grid-cols-2 gap-3 mb-6">
        {/* 涨按钮 */}
        <button
          onClick={() => { setDir('up'); setRangeIdx(0); setConfirmed(false); }}
          className="py-6 rounded-2xl flex flex-col items-center gap-1.5 transition-all active:scale-95"
          style={{
            background: dir === 'up' ? neonUp.bg : 'rgba(255,255,255,0.04)',
            border: `2px solid ${dir === 'up' ? neonUp.border : 'rgba(255,255,255,0.08)'}`,
            boxShadow: dir === 'up' ? `0 0 20px ${neonUp.glow}, 0 0 40px rgba(255,77,77,0.2), inset 0 1px 0 rgba(255,255,255,0.1)` : 'none',
          }}
        >
          <span className="text-4xl" style={{ filter: dir === 'up' ? `drop-shadow(0 0 8px ${neonUp.main})` : 'none' }}>↑</span>
          <span className="text-lg font-black" style={{ color: dir === 'up' ? neonUp.main : 'rgba(255,255,255,0.5)', textShadow: dir === 'up' ? `0 0 10px ${neonUp.main}` : 'none' }}>涨</span>
          <span className="text-xs" style={{ color: dir === 'up' ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)' }}>预测上涨</span>
        </button>
        {/* 跌按钮 */}
        <button
          onClick={() => { setDir('down'); setRangeIdx(0); setConfirmed(false); }}
          className="py-6 rounded-2xl flex flex-col items-center gap-1.5 transition-all active:scale-95"
          style={{
            background: dir === 'down' ? neonDown.bg : 'rgba(255,255,255,0.04)',
            border: `2px solid ${dir === 'down' ? neonDown.border : 'rgba(255,255,255,0.08)'}`,
            boxShadow: dir === 'down' ? `0 0 20px ${neonDown.glow}, 0 0 40px rgba(0,230,118,0.2), inset 0 1px 0 rgba(255,255,255,0.1)` : 'none',
          }}
        >
          <span className="text-4xl" style={{ filter: dir === 'down' ? `drop-shadow(0 0 8px ${neonDown.main})` : 'none' }}>↓</span>
          <span className="text-lg font-black" style={{ color: dir === 'down' ? neonDown.main : 'rgba(255,255,255,0.5)', textShadow: dir === 'down' ? `0 0 10px ${neonDown.main}` : 'none' }}>跌</span>
          <span className="text-xs" style={{ color: dir === 'down' ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)' }}>预测下跌</span>
        </button>
      </div>

      {dir && (
        <>
          {/* 赔率展示卡 */}
          <div className="mx-4 mb-4 rounded-2xl px-5 py-4" style={{
            background: 'rgba(212,175,55,0.06)',
            border: '1px solid rgba(212,175,55,0.25)',
            boxShadow: '0 0 20px rgba(212,175,55,0.1)',
          }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>涨跌幅区间</div>
                <div className="text-2xl font-black text-white" style={{ textShadow: `0 0 8px ${neon.main}88` }}>
                  {currentRange?.rangeLabel ?? '-'}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>赔率（含本金）</div>
                <div className="text-4xl font-black" style={{ color: neon.main, textShadow: `0 0 12px ${neon.glow}` }}>
                  {currentOdds > 0 ? `${currentOdds}x` : '-'}
                </div>
              </div>
            </div>
            <div className="text-xs mt-2" style={{ color: 'rgba(212,175,55,0.5)' }}>
              历史概率 {currentRange ? (currentRange.prob * 100).toFixed(2) : '0.00'}%　共 {currentRange?.count ?? 0} 天
            </div>
          </div>

          {/* 区间滑动条 */}
          <div className="mx-4 mb-5">
            <div className="flex justify-between text-xs mb-2" style={{ color: 'rgba(212,175,55,0.5)' }}>
              <span>≥0%</span>
              <span style={{ color: 'rgba(212,175,55,0.7)' }}>拖动选择幅度区间</span>
              <span>≥11%</span>
            </div>
            <input
              type="range" min={0} max={MAX_RANGE} step={1} value={safeRangeIdx}
              onChange={e => { setRangeIdx(Number(e.target.value)); setConfirmed(false); }}
              className="w-full h-3 rounded-full appearance-none cursor-pointer"
              style={{ background: sliderBg(safeRangeIdx, 0, MAX_RANGE, '#d4af37'), accentColor: '#d4af37' }}
            />
          </div>

          {/* 预期获得数字展示 */}
          <div className="mx-4 mb-3 rounded-2xl px-5 py-4 flex items-center justify-between" style={{
            background: 'rgba(212,175,55,0.06)',
            border: '1px solid rgba(212,175,55,0.2)',
          }}>
            <div>
              <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>投入</div>
              <div className="text-xl font-bold text-white">{points}<span className="text-xs font-normal ml-1" style={{ color: 'rgba(255,255,255,0.4)' }}>分</span></div>
            </div>
            <div className="text-2xl" style={{ color: 'rgba(212,175,55,0.4)' }}>→</div>
            <div className="text-right">
              <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>预期获得</div>
              <div className="text-3xl font-black" style={{ color: neon.main, textShadow: `0 0 12px ${neon.glow}` }}>
                {payout > 0 ? payout : '-'}<span className="text-sm font-normal ml-1" style={{ color: 'rgba(255,255,255,0.4)' }}>分</span>
              </div>
            </div>
          </div>

          {/* 积分滑动条（在数字展示下方） */}
          <div className="mx-4 mb-5">
            <input
              type="range" min={MIN_POINTS} max={MAX_POINTS} step={10} value={points}
              onChange={e => { setPoints(Number(e.target.value)); setConfirmed(false); }}
              className="w-full h-3 rounded-full appearance-none cursor-pointer"
              style={{ background: sliderBg(points, MIN_POINTS, MAX_POINTS, '#d4af37'), accentColor: '#d4af37' }}
            />
            <div className="flex justify-between text-xs mt-1" style={{ color: 'rgba(212,175,55,0.4)' }}>
              <span>{MIN_POINTS}分</span>
              <span>{MAX_POINTS}分</span>
            </div>
          </div>

          {/* 确认按钮 */}
          <div className="mx-4">
            <button
              onClick={handleConfirm}
              disabled={currentOdds === 0}
              className="w-full py-4 rounded-2xl text-white text-base font-black transition-all active:scale-95 disabled:opacity-30"
              style={{
                background: confirmed ? 'rgba(255,255,255,0.1)' : neon.bg,
                border: `2px solid ${confirmed ? 'rgba(255,255,255,0.1)' : neon.border}`,
                boxShadow: confirmed ? 'none' : `0 0 20px ${neon.glow}, 0 4px 20px ${neon.glow}`,
                letterSpacing: 1,
              }}
            >
              {confirmed
                ? '✓ 已提交（功能开发中）'
                : `确认预测  ${dir === 'up' ? '↑ 涨' : '↓ 跌'}  ${currentRange?.rangeLabel ?? ''}`
              }
            </button>
            {confirmed && (
              <div className="mt-2 text-center text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>预测功能开发中，暂不扣除积分</div>
            )}
          </div>

          {/* 底部说明 */}
          <div className="mx-4 mt-5 text-xs leading-relaxed" style={{ color: 'rgba(212,175,55,0.35)' }}>
            · 赔率含本金 · 庄家优势 25% · 历史概率基于全量日线
          </div>
        </>
      )}

      {!dir && (
        <div className="mx-4 text-center py-10">
          <div className="text-5xl mb-4" style={{ filter: 'drop-shadow(0 0 12px rgba(212,175,55,0.8))' }}>🎰</div>
          <div className="text-sm font-medium" style={{ color: 'rgba(212,175,55,0.6)' }}>选择涨或跌，开始预测</div>
        </div>
      )}
    </div>
  );
}

// 历年多空资金费率统计折叠组件
function FundingYearlyStats({
  years,
  yearMap,
  rawData,
}: {
  years: string[];
  yearMap: Record<string, { sumRate: number; count: number; periodH: number }>;
  rawData: { fundingTime: number; fundingRate: number }[];
}) {
  const [open, setOpen] = useState(false);

  // 动态计算近N天的平均年化（实时，每次打开都基于最新数据）
  const recentStats = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];
    // 数据是正序（最旧在前），最后一条是最新的
    const now = rawData[rawData.length - 1].fundingTime;
    const intervals = [
      { label: '近半年', days: 182 },
      { label: '近1年', days: 365 },
      { label: '近2年', days: 730 },
      { label: '近3年', days: 1095 },
    ];
    return intervals.map(({ label, days }) => {
      const cutoff = now - days * 24 * 3600 * 1000;
      const slice = rawData.filter(d => d.fundingTime >= cutoff);
      const count = slice.length;
      const sumRate = slice.reduce((s, d) => s + d.fundingRate, 0);
      // 年化 = 平均单次费率 × 1095
      const avgRate = count > 0 ? sumRate / count : 0;
      const longAnnual = avgRate * 1095 * 100;
      const shortAnnual = -avgRate * 1095 * 100;
      return { label, count, longAnnual, shortAnnual };
    });
  }, [rawData]);
  return (
    <div className="border-t border-gray-100">
      {/* 折叠触发按钮 */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium text-gray-600">历年多空资金费率统计</span>
        <span style={{ fontSize: 10, color: '#9CA3AF', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '18%' }} />
            </colgroup>
            <thead>
              <tr style={{ background: '#F3F4F6' }}>
                <th style={{ border: '1px solid #D1D5DB', padding: '5px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 10 }}>年份</th>
                <th style={{ border: '1px solid #D1D5DB', padding: '5px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 10 }}>结算次数</th>
                <th style={{ border: '1px solid #D1D5DB', padding: '5px 2px', textAlign: 'center', color: '#EF4444', fontWeight: 500, fontSize: 10 }}>多头年化</th>
                <th style={{ border: '1px solid #D1D5DB', padding: '5px 2px', textAlign: 'center', color: '#EF4444', fontWeight: 500, fontSize: 10 }}>多头方向</th>
                <th style={{ border: '1px solid #D1D5DB', padding: '5px 2px', textAlign: 'center', color: '#16A34A', fontWeight: 500, fontSize: 10 }}>空头年化</th>
                <th style={{ border: '1px solid #D1D5DB', padding: '5px 2px', textAlign: 'center', color: '#16A34A', fontWeight: 500, fontSize: 10 }}>空头方向</th>
              </tr>
            </thead>
            <tbody>
              {/* 全周期汇总行 */}
              {(() => {
                const totalCount = years.reduce((s, y) => s + yearMap[y].count, 0);
                const totalSumRate = years.reduce((s, y) => s + yearMap[y].sumRate, 0);
                // 全周期平均年化 = 全期平均单次费率 × 1095
                const avgRate = totalCount > 0 ? totalSumRate / totalCount : 0;
                const longAnnual = avgRate * 1095 * 100;
                const shortAnnual = -avgRate * 1095 * 100;
                const longDir = longAnnual > 0.001 ? '净付出' : longAnnual < -0.001 ? '净收入' : '持平';
                const shortDir = shortAnnual > 0.001 ? '净付出' : shortAnnual < -0.001 ? '净收入' : '持平';
                const longColor = longAnnual > 0.001 ? '#EF4444' : longAnnual < -0.001 ? '#16A34A' : '#9CA3AF';
                const shortColor = shortAnnual > 0.001 ? '#EF4444' : shortAnnual < -0.001 ? '#16A34A' : '#9CA3AF';
                const cellStyle: React.CSSProperties = {
                  border: '1px solid #D1D5DB',
                  padding: '5px 2px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: 10.5,
                  whiteSpace: 'nowrap',
                  background: '#EFF6FF',
                };
                return (
                  <tr key="total">
                    <td style={{ ...cellStyle, color: '#1D4ED8', fontWeight: 700 }}>全周期</td>
                    <td style={{ ...cellStyle, color: '#6B7280' }}>{totalCount}</td>
                    <td style={{ ...cellStyle, color: longColor, fontWeight: 700 }}>
                      {(longAnnual >= 0 ? '+' : '') + longAnnual.toFixed(2)}%
                    </td>
                    <td style={{ ...cellStyle, color: longColor }}>{longDir}</td>
                    <td style={{ ...cellStyle, color: shortColor, fontWeight: 700 }}>
                      {(shortAnnual >= 0 ? '+' : '') + shortAnnual.toFixed(2)}%
                    </td>
                    <td style={{ ...cellStyle, color: shortColor }}>{shortDir}</td>
                  </tr>
                );
              })()}
              {/* 动态近期区间行 */}
              {recentStats.map((r) => {
                const longDir = r.longAnnual > 0.001 ? '净付出' : r.longAnnual < -0.001 ? '净收入' : '持平';
                const shortDir = r.shortAnnual > 0.001 ? '净付出' : r.shortAnnual < -0.001 ? '净收入' : '持平';
                const longColor = r.longAnnual > 0.001 ? '#EF4444' : r.longAnnual < -0.001 ? '#16A34A' : '#9CA3AF';
                const shortColor = r.shortAnnual > 0.001 ? '#EF4444' : r.shortAnnual < -0.001 ? '#16A34A' : '#9CA3AF';
                const cellStyle: React.CSSProperties = {
                  border: '1px solid #D1D5DB',
                  padding: '5px 2px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: 10.5,
                  whiteSpace: 'nowrap',
                  background: '#F0FDF4',
                };
                return (
                  <tr key={r.label}>
                    <td style={{ ...cellStyle, color: '#166534', fontWeight: 700 }}>{r.label}</td>
                    <td style={{ ...cellStyle, color: '#6B7280' }}>{r.count}</td>
                    <td style={{ ...cellStyle, color: longColor, fontWeight: 700 }}>
                      {(r.longAnnual >= 0 ? '+' : '') + r.longAnnual.toFixed(2)}%
                    </td>
                    <td style={{ ...cellStyle, color: longColor }}>{longDir}</td>
                    <td style={{ ...cellStyle, color: shortColor, fontWeight: 700 }}>
                      {(r.shortAnnual >= 0 ? '+' : '') + r.shortAnnual.toFixed(2)}%
                    </td>
                    <td style={{ ...cellStyle, color: shortColor }}>{shortDir}</td>
                  </tr>
                );
              })}
              {years.map((year, idx) => {
                const { sumRate, count } = yearMap[year];
                const longPay = sumRate * 100;
                const shortPay = -sumRate * 100;
                const longDir = longPay > 0.001 ? '净付出' : longPay < -0.001 ? '净收入' : '持平';
                const shortDir = shortPay > 0.001 ? '净付出' : shortPay < -0.001 ? '净收入' : '持平';
                const longColor = longPay > 0.001 ? '#EF4444' : longPay < -0.001 ? '#16A34A' : '#9CA3AF';
                const shortColor = shortPay > 0.001 ? '#EF4444' : shortPay < -0.001 ? '#16A34A' : '#9CA3AF';
                const rowBg = idx % 2 === 0 ? '#fff' : '#F9FAFB';
                const cellStyle: React.CSSProperties = {
                  border: '1px solid #E5E7EB',
                  padding: '4px 2px',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  fontSize: 10.5,
                  whiteSpace: 'nowrap',
                };
                return (
                  <tr key={year} style={{ background: rowBg }}>
                    <td style={{ ...cellStyle, color: '#374151', fontWeight: 600 }}>{year}</td>
                    <td style={{ ...cellStyle, color: '#6B7280' }}>{count}</td>
                    <td style={{ ...cellStyle, color: longColor, fontWeight: 600 }}>
                      {(longPay >= 0 ? '+' : '') + longPay.toFixed(2)}%
                    </td>
                    <td style={{ ...cellStyle, color: longColor }}>{longDir}</td>
                    <td style={{ ...cellStyle, color: shortColor, fontWeight: 600 }}>
                      {(shortPay >= 0 ? '+' : '') + shortPay.toFixed(2)}%
                    </td>
                    <td style={{ ...cellStyle, color: shortColor }}>{shortDir}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-2 text-xs text-gray-400 leading-relaxed">
假设持有固定数量持满全年。年化 = 全年实际累计费率之和；全周期年化 = 全期平均单次费率 × 1095（8h周期）。正值=净付出（红），负值=净收入（绿）。
          </div>
        </div>
      )}
    </div>
  );
}

export default function BeDataPage() {
  const params = useParams();
  const [location, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 52;

  // 解析 URL filter 参数：crypto=数字币模式, stocks=美股模式, 默认=全部
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const urlFilter = urlParams.get('filter');
  const urlSymbol = urlParams.get('symbol'); // 美股模式下直接指定的股票（如 AAPL.US）
  const filteredSymbols = urlFilter === 'crypto'
    ? ALL_SYMBOLS.filter(s => s.type === 'crypto')
    : urlFilter === 'stocks'
    ? ALL_SYMBOLS.filter(s => s.type === 'stock')
    : ALL_SYMBOLS;
  const pageTitle = urlFilter === 'crypto' ? '数字币日线数据' : urlFilter === 'stocks' ? '美股日线数据' : 'BE数据';
  const backPath = urlFilter === 'crypto' ? '/' : urlFilter === 'stocks' ? '/us-stock-tracker' : `/ledger/${ledgerId}/settings`;
  // 美股模式和数字币模式下都使用蓝色头部，隐藏股票切换 tab
  const hideSymbolTabs = urlFilter === 'stocks' || urlFilter === 'crypto';

  // 美股模式下，优先用 URL 中的 symbol 参数确定初始股票
  // 数字币模式下，也优先读 URL 中的 symbol 参数（切换币种时写入）
  const initialSymbol = urlSymbol
    ? (ALL_SYMBOLS.find(s => s.symbol === urlSymbol || s.key === urlSymbol || s.key === urlSymbol.replace('.US', ''))?.key ?? filteredSymbols[0]?.key ?? ALL_SYMBOLS[0].key)
    : (filteredSymbols[0]?.key ?? ALL_SYMBOLS[0].key);

  const [activeSymbol, setActiveSymbol] = useState(initialSymbol);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 待恢复的滚动位置（切换币种时设置，数据加载完后执行）
  const pendingScrollRef = useRef<number | null>(
    typeof window !== 'undefined'
      ? (() => { const s = sessionStorage.getItem(`bedata_scroll_${initialSymbol}`); return s ? parseInt(s, 10) : null; })()
      : null
  );
  // 监听滚动事件，实时保存滚动位置到 sessionStorage
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          sessionStorage.setItem(`bedata_scroll_${activeSymbol}`, String(container.scrollTop));
          ticking = false;
        });
        ticking = true;
      }
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [activeSymbol]);

  // 美股模式和数字币模式下默认显示数据分析
  const [activeTab, setActiveTab] = useState(hideSymbolTabs ? "analysis" : "data");
  const [page, setPage] = useState(1);
  // 历史数据子Tab：日线 / 小时 / 分钟（仅数字币显示）
  const [dataSubTab, setDataSubTab] = useState<'daily' | 'hourly' | 'minute'>('daily');
  const [hourlyPage, setHourlyPage] = useState(1);
  // 分钟数据实时计数器（每分钟 +1）
  const [minuteCounter, setMinuteCounter] = useState(0);
  // isSyncing已不再使用，保留占位避免引用错误
  const isSyncing = false;

  const utils = trpc.useUtils();

  // 当前股票信息（用于美股模式下显示 logo 和名称）
  const currentStockInfo = ALL_SYMBOLS.find(s => s.key === activeSymbol);

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
    { enabled: activeTab === "analysis" || activeTab === "predict", staleTime: 5 * 60 * 1000 }
  );

  // 从数据库读取元数据（起始日期、条数）
  const metaSymbol = currentStockInfo?.symbol ?? activeSymbol; // 美股用 AAPL.US，数字币用 BTCUSDT
  const metaSymbolKey = currentStockInfo?.type === 'stock'
    ? (currentStockInfo.symbol.replace('.US', ''))  // AAPL.US -> AAPL
    : activeSymbol; // BTCUSDT / ETHUSDT / SOLUSDT
  const { data: metaData } = trpc.cryptoData.getMeta.useQuery(
    { symbol: metaSymbolKey },
    { staleTime: 5 * 60 * 1000, refetchInterval: 5 * 60 * 1000 } // 5分钟自动刷新，随数据库更新同步最新日期
  );

  // 小时 K 线数据（仅数字币且切换到小时Tab时加载）
  const isCryptoSymbol = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].includes(activeSymbol);
  const { data: hourlyData, isLoading: hourlyLoading } = trpc.cryptoData.getHourlyKlines.useQuery(
    { symbol: activeSymbol, page: hourlyPage, pageSize: PAGE_SIZE },
    { enabled: activeTab === 'data' && dataSubTab === 'hourly' && isCryptoSymbol, keepPreviousData: true } as any
  );
  const { data: hourlyMeta } = trpc.cryptoData.getHourlyMeta.useQuery(
    { symbol: activeSymbol },
    { enabled: isCryptoSymbol, staleTime: 5 * 60 * 1000 }
  );

  // 分钟 K 线元数据（仅数字币）
  const { data: minuteMeta } = trpc.cryptoData.getMinuteMeta.useQuery(
    { symbol: activeSymbol },
    { enabled: isCryptoSymbol && activeTab === 'data' && dataSubTab === 'minute', staleTime: 60 * 1000 }
  );

  // 分钟数据实时计数器：切到分钟Tab后每分钟自动+1
  useEffect(() => {
    if (dataSubTab !== 'minute') return;
    const timer = setInterval(() => {
      setMinuteCounter(c => c + 1);
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, [dataSubTab]);

  const handleSync = useCallback(() => {
    window.location.reload();
  }, []);

  const rows = data?.rows ?? [];
  const total = metaData?.total ?? data?.total ?? 0;

  // 数据加载完成后，恢复待恢复的滚动位置
  useEffect(() => {
    if (!isLoading && pendingScrollRef.current !== null) {
      const target = pendingScrollRef.current;
      pendingScrollRef.current = null;
      // 稍延一帧，确保 DOM 已完全渲染
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = target;
        }
      });
    }
  }, [isLoading]);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hourlyTotal = hourlyMeta?.total ?? hourlyData?.total ?? 0;
  const hourlyTotalPages = Math.ceil(hourlyTotal / PAGE_SIZE);

  const latestRow = page === 1 ? rows[0] : null;
  const oldestDate = metaData?.oldestDate ?? (total > 0 ? "-" : "-");
  const latestDate = metaData?.latestDate ?? (latestRow ? latestRow.date : "-");
  const latestClose = latestRow ? latestRow.close : null;
  const latestChangePct = latestRow ? latestRow.changePct : null;
  const isUp = latestChangePct != null && latestChangePct > 0;
  const isDown = latestChangePct != null && latestChangePct < 0;
  const pctColor = isUp ? "text-red-500" : isDown ? "text-green-600" : "text-gray-500";

  // 数字币实时价格查询
  const isCryptoMode = urlFilter === 'crypto';
  const isBtcActive = activeSymbol === 'BTCUSDT';
  const isEthActive = activeSymbol === 'ETHUSDT';
  const isSolActive = activeSymbol === 'SOLUSDT';

  const { data: btcPriceData } = trpc.cryptoData.getBtcPrice.useQuery(
    undefined,
    { enabled: isCryptoMode && isBtcActive, refetchInterval: 3000 }
  );
  const { data: ethPriceData } = trpc.cryptoData.getEthPrice.useQuery(
    undefined,
    { enabled: isCryptoMode && isEthActive, refetchInterval: 3000 }
  );
  const { data: solPriceData } = trpc.cryptoData.getSolPrice.useQuery(
    undefined,
    { enabled: isCryptoMode && isSolActive, refetchInterval: 3000 }
  );

  // 实时价格（数字币模式下优先用实时价格，否则用日线数据的收盘价）
  const livePriceData = isBtcActive ? btcPriceData : isEthActive ? ethPriceData : isSolActive ? solPriceData : null;
  const displayPrice = isCryptoMode && livePriceData?.success ? livePriceData.price : latestClose;
  const displayChangePct = isCryptoMode && livePriceData?.success ? livePriceData.changePercent : latestChangePct;

  // AI 分析查询（仅美股模式且数据加载完成后才请求）
  const [aiExpanded, setAiExpanded] = useState(false);
  const [aiTriggered, setAiTriggered] = useState(false); // 用户主动点击「生成分析」才为true

  // 相关性统计：选择对比币
  const CRYPTO_SYMBOLS = ALL_SYMBOLS.filter(s => s.type === 'crypto');
  const corrBaseSymbol = activeSymbol; // 当前币为基准
  // 默认对比所有其他币种，固定不变
  const corrCompare = CRYPTO_SYMBOLS.filter(s => s.key !== corrBaseSymbol).map(s => s.key);
  const { data: corrData, isLoading: corrLoading } = trpc.cryptoData.getCorrelation.useQuery(
    {
      baseSymbol: corrBaseSymbol,
      compareSymbols: corrCompare,
    },
    { enabled: activeTab === 'analysis' && corrCompare.length > 0, staleTime: 10 * 60 * 1000 }
  );
  // 资金费率分页查询
  const [fundingPage, setFundingPage] = useState(1);
  const { data: fundingData, isLoading: fundingLoading } = trpc.cryptoData.getFundingRates.useQuery(
    { symbol: activeSymbol, page: fundingPage, pageSize: 100 },
    { enabled: isCryptoMode, staleTime: 5 * 60 * 1000 }
  );
  // 资金费率折线图数据（数据分析Tab使用）
  const { data: fundingChartData } = trpc.cryptoData.getFundingRateChart.useQuery(
    { symbol: activeSymbol, limit: 10000 },
    { enabled: activeTab === 'analysis' && isCryptoMode, staleTime: 5 * 60 * 1000 }
  );
  const { data: aiData, isLoading: aiLoading } = trpc.cryptoData.getAIAnalysis.useQuery(
    {
      symbol: currentStockInfo?.symbol ?? activeSymbol,
      stockName: currentStockInfo?.label ?? activeSymbol,
      latestClose: latestClose ?? undefined,
      latestChangePct: latestChangePct ?? undefined,
      total,
      oldestDate,
      latestDate,
    },
    {
      enabled: hideSymbolTabs && !isLoading && aiExpanded && aiTriggered,
      staleTime: 10 * 60 * 1000, // 10分钟内不重新请求
    }
  );

  // 币种基本信息（CoinGecko）
  const { data: coinInfoData } = trpc.cryptoData.getCoinInfo.useQuery(
    { symbol: activeSymbol },
    { enabled: isCryptoMode, staleTime: 5 * 60 * 1000 }
  );

  const handleSymbolChange = (sym: string) => {
    // 保存当前币种的滚动位置到 sessionStorage
    const currentScrollTop = scrollContainerRef.current?.scrollTop ?? 0;
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`bedata_scroll_${activeSymbol}`, String(currentScrollTop));
    }
    // 更新 URL 中的 symbol 参数（刷新页面后能恢复币种）
    if (typeof window !== 'undefined') {
      const newParams = new URLSearchParams(window.location.search);
      newParams.set('symbol', sym);
      const newUrl = window.location.pathname + '?' + newParams.toString();
      window.history.replaceState(null, '', newUrl);
    }
    setActiveSymbol(sym);
    setPage(1);
    setFundingPage(1);
    // 把新币种的历史滚动位置存入 pendingScrollRef，等数据加载完成后再恢复
    const savedScroll = typeof window !== 'undefined' ? sessionStorage.getItem(`bedata_scroll_${sym}`) : null;
    pendingScrollRef.current = savedScroll ? parseInt(savedScroll, 10) : 0;
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
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: hideSymbolTabs ? "#EEF2F8" : "#F5F5F5" }}>

      {/* 底部居中悬浮币种切换按鈕（仅数字币模式显示） */}
      {urlFilter === 'crypto' && (
        <div style={{
          position: 'fixed', bottom: 24, left: 0, right: 0, zIndex: 100,
          display: 'flex', flexDirection: 'row', gap: 16,
          justifyContent: 'center', alignItems: 'center',
          pointerEvents: 'none',
        }}>
          {filteredSymbols.map(s => {
            const isActive = activeSymbol === s.key;
            return (
              <button
                key={s.key}
                onClick={() => handleSymbolChange(s.key)}
                style={{
                  width: isActive ? 50 : 42, height: isActive ? 50 : 42, borderRadius: '50%', padding: 0,
                  border: 'none',
                  background: 'rgba(255,255,255,0.92)',
                  boxShadow: isActive ? '0 6px 20px rgba(0,0,0,0.22)' : '0 2px 8px rgba(0,0,0,0.12)',
                  cursor: 'pointer', transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  pointerEvents: 'auto',
                  opacity: isActive ? 1 : 0.6,
                }}
              >
                <img src={s.icon} alt={s.shortLabel} style={{ width: 26, height: 26, objectFit: 'contain', borderRadius: '50%' }} />
              </button>
            );
          })}
        </div>
      )}

      {/* 顶部导航 */}
      {hideSymbolTabs ? (
        // 美股模式：全新设计蓝色头部
        <div style={{ background: "linear-gradient(160deg, #1565C0 0%, #0D47A1 60%, #0A3880 100%)", padding: "10px 14px 12px", flexShrink: 0, position: "sticky", top: 0, zIndex: 10 }}>

          {/* 第一行：返回 + logo+名称 + 更新按鈕 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: urlFilter === 'crypto' ? 6 : 10 }}>
            <button
              onClick={() => setLocation(backPath)}
              style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.18)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
            >
              <ChevronLeft style={{ width: 16, height: 16, color: "#fff" }} />
            </button>
            {currentStockInfo && (
              <img src={currentStockInfo.icon} alt={currentStockInfo.shortLabel} style={{ width: 30, height: 30, objectFit: "contain", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.35))", flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0, lineHeight: 1.2 }}>
                {currentStockInfo?.label ?? "AI 数据追踪"}
              </p>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.3 }}>
                {currentStockInfo?.shortLabel ?? ""} &middot; AI 数据追踪
              </p>
            </div>
            {isCryptoMode && (
              <button
                onClick={() => setLocation(`/ledger/${ledgerId}/position-calc`)}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer", flexShrink: 0 }}
              >
                计划
              </button>
            )}
            <button
              onClick={handleSync}
              disabled={isSyncing}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer", flexShrink: 0 }}
            >
              更新
            </button>
          </div>



          {/* AI × 股票名 三段式分析（在基本信息上方） */}
          <div
            onClick={() => setAiExpanded(v => !v)}
            style={{
              borderRadius: 12,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.18)",
              padding: "9px 12px",
              cursor: "pointer",
              marginBottom: 10,
            }}
          >
            {/* 标题行 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: 0.3 }}>
                  AI × {currentStockInfo?.shortLabel ?? activeSymbol}
                </span>
                {aiLoading && (
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>分析中...</span>
                )}
              </div>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{aiExpanded ? '▲ 收起' : '▼ 展开'}</span>
            </div>

            {/* 展开后显示 AI 深度分析报告（6段式） */}
            {aiExpanded && (
              <div style={{ marginTop: 10 }}>
                {/* 未触发时显示生成按钮 */}
                {!aiTriggered && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "12px 0" }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "center", marginBottom: 4 }}>点击下方按钮，AI 将整合实时市场数据进行深度分析</div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setAiTriggered(true); }}
                      style={{
                        background: "linear-gradient(135deg, #1565C0, #0D47A1)",
                        border: "none",
                        borderRadius: 20,
                        padding: "8px 24px",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                        letterSpacing: 0.5,
                        boxShadow: "0 2px 8px rgba(21,101,192,0.4)",
                      }}
                    >
                      生成 AI 分析
                    </button>
                  </div>
                )}
                {aiTriggered && aiLoading && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "16px 0" }}>
                    <div style={{ width: 28, height: 28, border: "2.5px solid rgba(255,255,255,0.15)", borderTop: "2.5px solid #90CAF9", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", textAlign: "center" }}>
                      顶级交易员正在分析中...<br />
                      <span style={{ fontSize: 10, opacity: 0.7 }}>整合实时市场数据 · 历史统计 · 资金费率</span>
                    </div>
                  </div>
                )}
                {aiTriggered && !aiLoading && (() => {
                  const sections = (aiData as any)?.sections ?? {};
                  const hasSections = Object.keys(sections).length > 0;
                  const sectionConfig = [
                    { key: 'marketSentiment', icon: '', label: '市场情绪与宏观环境', color: '#CE93D8' },
                    { key: 'trend', icon: '', label: '趋势判断', color: '#90CAF9' },
                    { key: 'fundingSignal', icon: '', label: '资金费率信号', color: '#FFE082' },
                    { key: 'positionSignal', icon: '', label: '持仓量与多空信号', color: '#FFAB91' },
                    { key: 'historicalPattern', icon: '', label: '历史规律', color: '#80DEEA' },
                    { key: 'tradingAdvice', icon: '', label: '交易建议', color: '#A5D6A7' },
                  ];

                  if (hasSections) {
                    // 实时数据摘要行
                    const md = (aiData as any)?.marketData;
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {/* 实时数据速览 */}
                        {md && (
                          <div style={{ borderRadius: 8, background: "rgba(255,255,255,0.06)", padding: "7px 10px", border: "1px solid rgba(255,255,255,0.1)" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)", marginBottom: 5, letterSpacing: 0.5 }}>实时数据速览</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 8px" }}>
                              {md.fngValue && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)" }}>恐贪指数: <span style={{ color: '#FFE082', fontWeight: 600 }}>{md.fngValue}</span></div>}
                              {md.btcDominance && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)" }}>BTC占有率: <span style={{ color: '#90CAF9', fontWeight: 600 }}>{md.btcDominance}%</span></div>}
                              {md.longRatio && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)" }}>多空比: <span style={{ color: '#A5D6A7', fontWeight: 600 }}>多{md.longRatio}/空{md.shortRatio}</span></div>}
                              {md.openInterest && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)" }}>持仓量: <span style={{ color: '#FFAB91', fontWeight: 600 }}>{md.openInterest}</span></div>}
                              {md.nextFundingRate && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.75)" }}>下期费率: <span style={{ color: '#CE93D8', fontWeight: 600 }}>{md.nextFundingRate}</span></div>}
                            </div>
                          </div>
                        )}
                        {/* 6段式分析 */}
                        {sectionConfig.map(({ key, icon, label, color }) => {
                          const text = sections[key];
                          if (!text) return null;
                          return (
                            <div key={key} style={{ borderRadius: 8, background: "rgba(255,255,255,0.07)", padding: "8px 10px", border: "1px solid rgba(255,255,255,0.08)" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color, marginBottom: 5 }}>
                                {label}
                              </div>
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.88)", lineHeight: 1.7 }}>{text}</div>
                            </div>
                          );
                        })}
                        {/* 免责声明 */}
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textAlign: "center", paddingTop: 2 }}>
                          以上分析仅供参考，不构成投资建议。数字货币市场风险极高，请谨慎决策。
                        </div>
                      </div>
                    );
                  }
                  // 降级：显示原始文本
                  const raw = String(aiData?.analysis ?? '');
                  return (
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.88)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                      {raw || '暂无分析结果'}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* 基本信息 + 实时行情 左右分栏 */}
          {(() => {
            const cardLoading = isLoading || !metaData;
            // 格式化大数字（如市値）
            const fmtBig = (v: number | null | undefined) => {
              if (v == null) return '—';
              if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}兆`;
              if (v >= 1e8) return `$${(v / 1e8).toFixed(2)}亿`;
              if (v >= 1e4) return `$${(v / 1e4).toFixed(0)}万`;
              return `$${v.toLocaleString()}`;
            };
            const fmtSupply = (v: number | null | undefined, sym: string) => {
              if (v == null) return '—';
              const unit = sym.replace('USDT', '');
              if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿 ${unit}`;
              if (v >= 1e4) return `${(v / 1e4).toFixed(0)}万 ${unit}`;
              return `${v.toLocaleString()} ${unit}`;
            };
            const skeletonStyle: React.CSSProperties = { height: 10, borderRadius: 4, background: "rgba(255,255,255,0.15)", marginBottom: 4 };
            return (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              {/* 左列：币种基本信息 */}
              <div style={{ borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", fontWeight: 600, letterSpacing: 0.5, marginBottom: 5, textTransform: "uppercase" }}>基本信息</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {isCryptoMode ? (
                    // 数字币模式：显示6行基本信息（与右侧实时行情行数对齐）
                    (() => {
                      const COIN_STATIC: Record<string, { genesisDate: string; maxSupply: string; circulatingSupply: string }> = {
                        BTCUSDT: { genesisDate: '2009-01-03', maxSupply: '2,100万 BTC', circulatingSupply: '1,976万 BTC' },
                        ETHUSDT: { genesisDate: '2015-07-30', maxSupply: '无上限', circulatingSupply: '1.20亿 ETH' },
                        SOLUSDT: { genesisDate: '2020-03-16', maxSupply: '无上限', circulatingSupply: '5.10亿 SOL' },
                      };
                      const info = COIN_STATIC[activeSymbol] ?? { genesisDate: '—', maxSupply: '—', circulatingSupply: '—' };
                      // 市值和市场占比从 coinInfoData 读取
                      const marketCap = coinInfoData?.marketCap != null
                        ? (coinInfoData.marketCap >= 1e12 ? `$${(coinInfoData.marketCap / 1e12).toFixed(2)}T`
                          : coinInfoData.marketCap >= 1e9 ? `$${(coinInfoData.marketCap / 1e9).toFixed(0)}B`
                          : `$${(coinInfoData.marketCap / 1e6).toFixed(0)}M`)
                        : '—';
                      const dominance = coinInfoData?.dominance != null
                        ? `${coinInfoData.dominance.toFixed(1)}%` : '—';
                      const rows = [
                        { label: '发行日期', value: info.genesisDate },
                        { label: '最大供给', value: info.maxSupply },
                        { label: '流通数量', value: info.circulatingSupply },
                        { label: '总市值', value: marketCap },
                        { label: '市场占比', value: dominance },
                        { label: '全球排名', value: coinInfoData?.marketCapRank != null ? `#${coinInfoData.marketCapRank}` : '—' },
                      ];
                      return rows.map(({ label, value }) => (
                        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 20 }}>
                          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", flexShrink: 0 }}>{label}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", textAlign: 'right', maxWidth: '65%' }}>{value}</span>
                        </div>
                      ));
                    })()
                  ) : (
                    // 非数字币模式：保持原交易所显示
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 20 }}>
                      <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>交易所</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#E3F2FD" }}>NASDAQ</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 右列：动态信息 */}
              <div style={{ borderRadius: 10, padding: "8px 10px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", fontWeight: 600, letterSpacing: 0.5, marginBottom: 5, textTransform: "uppercase" }}>实时行情</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {/* 最新收盘 / 实时价格 */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 20 }}>
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>{isCryptoMode ? "实时价格" : "最新收盘"}</span>
                    {isLoading
                      ? <div style={{ width: 52, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.15)" }} />
                      : <span style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>{displayPrice != null ? formatPrice(displayPrice) : "—"}</span>
                    }
                  </div>
                  {/* 当日涨跌 */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 20 }}>
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>当日涨跌</span>
                    {isLoading
                      ? <div style={{ width: 40, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.15)" }} />
                      : <span style={{ fontSize: 12, fontWeight: 700, color: (displayChangePct ?? 0) >= 0 ? "#FF8A80" : "#69F0AE" }}>
                          {displayChangePct != null ? ((displayChangePct >= 0 ? "+" : "") + displayChangePct.toFixed(2) + "%") : "—"}
                        </span>
                    }
                  </div>
                  {/* 开盘价 */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 20 }}>
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>开盘价</span>
                    {isLoading
                      ? <div style={{ width: 52, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.15)" }} />
                      : <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
                          {(isCryptoMode && livePriceData?.success && livePriceData.todayOpen > 0)
                            ? formatPrice(livePriceData.todayOpen)
                            : "—"}
                        </span>
                    }
                  </div>
                  {/* 24h最高 */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 20 }}>
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>24h最高</span>
                    {isLoading
                      ? <div style={{ width: 52, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.15)" }} />
                      : <span style={{ fontSize: 11, fontWeight: 700, color: "#FF8A80" }}>
                          {(isCryptoMode && livePriceData?.success && livePriceData.high24h > 0)
                            ? formatPrice(livePriceData.high24h)
                            : "—"}
                        </span>
                    }
                  </div>
                  {/* 24h最低 */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 20 }}>
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>24h最低</span>
                    {isLoading
                      ? <div style={{ width: 52, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.15)" }} />
                      : <span style={{ fontSize: 11, fontWeight: 700, color: "#69F0AE" }}>
                          {(isCryptoMode && livePriceData?.success && livePriceData.low24h > 0)
                            ? formatPrice(livePriceData.low24h)
                            : "—"}
                        </span>
                    }
                  </div>
                  {/* 24h成交量 */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 20 }}>
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.55)" }}>24h成交量</span>
                    {isLoading
                      ? <div style={{ width: 52, height: 10, borderRadius: 4, background: "rgba(255,255,255,0.15)" }} />
                      : <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
                          {(isCryptoMode && livePriceData?.success && livePriceData.quoteVolume24h > 0)
                            ? (livePriceData.quoteVolume24h >= 1e9
                              ? `${(livePriceData.quoteVolume24h / 1e9).toFixed(2)}B`
                              : livePriceData.quoteVolume24h >= 1e6
                              ? `${(livePriceData.quoteVolume24h / 1e6).toFixed(2)}M`
                              : livePriceData.quoteVolume24h.toFixed(0)) + ' USDT'
                            : "—"}
                        </span>
                    }
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

        </div>
      ) : (
        // 其他模式：保持原来的白色导航栏
        <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="flex items-center h-12 px-3">
            <button onClick={() => setLocation(backPath)} className="flex items-center text-gray-600 mr-2">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="font-semibold text-gray-800 text-base flex-1">{pageTitle}</span>
            <button onClick={handleSync} className="text-xs font-medium text-white bg-[#D32F2F] rounded-full px-3 py-1 active:opacity-70">更新</button>
          </div>

          {/* 统计栏 */}
          {!isLoading && total > 0 && (
            <div className="bg-white border-b border-gray-200 px-3 py-2.5">
              <div className="flex flex-col gap-1.5">
                <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-400 shrink-0">数据范围</span>
                  <span className="text-xs font-medium text-gray-700 font-mono ml-2">{oldestDate} ~ {latestDate}</span>
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
        </div>
      )}

      {/* 功能 Tab */}
      <div style={{ background: "#fff", borderBottom: hideSymbolTabs ? "1px solid #D8E0EC" : "1px solid #E5E7EB", display: "flex", flexShrink: 0 }}>
        {TABS.filter((t) => {
            if ((urlFilter === 'stocks' || urlFilter === 'crypto') && t.key === 'predict') return false;
            if (t.key === 'funding' && urlFilter !== 'crypto') return false;
            return true;
          }).map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 500,
              color: activeTab === t.key ? (hideSymbolTabs ? "#1565C0" : "#D32F2F") : "#9CA3AF",
              borderBottom: activeTab === t.key ? `2px solid ${hideSymbolTabs ? "#1565C0" : "#D32F2F"}` : "2px solid transparent",
              background: "none", border: "none",
              cursor: "pointer", transition: "color 0.2s",
            }}
          >
            {t.key === 'data'
              ? `历史数据${total > 0 ? `（${total}条）` : ''}`
              : t.key === 'analysis' && latestDate && latestDate !== '-'
                ? (() => { const parts = latestDate.split('/'); return `数据分析（${parts[1] ? (+parts[1]) + '/' + (+parts[2]) : latestDate}）`; })()
                : t.key === 'funding'
                  ? `资金费率${fundingData?.total ? `（${fundingData.total}条）` : ''}`
                  : t.label}
          </button>
        ))}
      </div>

      {/* ===== 历史数据 Tab ===== */}
      {activeTab === "data" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 日线 / 小时 / 分钟 子Tab（仅数字币显示） */}
          {isCryptoSymbol && (
            <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', display: 'flex', flexShrink: 0 }}>
              <button
                onClick={() => { setDataSubTab('daily'); setPage(1); }}
                style={{
                  flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 500,
                  color: dataSubTab === 'daily' ? '#D32F2F' : '#9CA3AF',
                  borderBottom: dataSubTab === 'daily' ? '2px solid #D32F2F' : '2px solid transparent',
                  background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                {`日线${total > 0 ? `（${total}条）` : ''}`}
              </button>
              <button
                onClick={() => { setDataSubTab('hourly'); setHourlyPage(1); }}
                style={{
                  flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 500,
                  color: dataSubTab === 'hourly' ? '#D32F2F' : '#9CA3AF',
                  borderBottom: dataSubTab === 'hourly' ? '2px solid #D32F2F' : '2px solid transparent',
                  background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                {`小时${hourlyTotal > 0 ? `（${hourlyTotal}条）` : ''}`}
              </button>
              <button
                onClick={() => { setDataSubTab('minute'); }}
                style={{
                  flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 500,
                  color: dataSubTab === 'minute' ? '#D32F2F' : '#9CA3AF',
                  borderBottom: dataSubTab === 'minute' ? '2px solid #D32F2F' : '2px solid transparent',
                  background: 'none', border: 'none', cursor: 'pointer',
                }}
              >
                分钟
              </button>
            </div>
          )}
          {/* 日线数据内容 */}
          {(!isCryptoSymbol || dataSubTab === 'daily') && (
          <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">加载中...</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-sm gap-2">
              <span>暂无数据</span>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                {/* 日期列固定宽度，其他列平分剩余空间 */}
                <col style={{ width: '15%' }} />
                <col style={{ width: '14.2%' }} />
                <col style={{ width: '14.2%' }} />
                <col style={{ width: '14.2%' }} />
                <col style={{ width: '14.2%' }} />
                <col style={{ width: '14.2%' }} />
                <col style={{ width: '14%' }} />
              </colgroup>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr style={{ background: '#F3F4F6' }}>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>日期</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>开盘</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>收盘</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>最高</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>最低</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>涨跌%</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>振幅%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const up = row.changePct != null && row.changePct > 0;
                  const down = row.changePct != null && row.changePct < 0;
                  const color = up ? '#EF4444' : down ? '#16A34A' : '#9CA3AF';
                  const rowBg = idx % 2 === 0 ? '#fff' : '#F9FAFB';
                  // 日期格式：将 2026/05/02 或 26/05/02 统一转为 26/05/02
                  const shortDate = (() => {
                    const d = row.date || '';
                    // 支持 YYYY/MM/DD 和 YY/MM/DD 格式
                    const parts = d.replace(/-/g, '/').split('/');
                    if (parts.length === 3) {
                      const yy = parts[0].length === 4 ? parts[0].slice(-2) : parts[0];
                      return `${yy}/${parts[1]}/${parts[2]}`;
                    }
                    return d;
                  })();
                  return (
                    <tr key={row.date} style={{ background: rowBg }}>
                      <td style={{ border: '1px solid #E5E7EB', padding: '4px 0', textAlign: 'center', color: '#6B7280', fontFamily: 'monospace', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden' }}>{shortDate}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '4px 0', textAlign: 'center', color: '#374151', fontFamily: 'monospace', fontSize: 10 }}>{formatPrice(row.open)}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '4px 0', textAlign: 'center', color, fontFamily: 'monospace', fontSize: 10, fontWeight: 600 }}>{formatPrice(row.close)}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '4px 0', textAlign: 'center', color: '#4B5563', fontFamily: 'monospace', fontSize: 10 }}>{formatPrice(row.high)}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '4px 0', textAlign: 'center', color: '#4B5563', fontFamily: 'monospace', fontSize: 10 }}>{formatPrice(row.low)}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '4px 0', textAlign: 'center', color, fontFamily: 'monospace', fontSize: 10 }}>{formatPct(row.changePct)}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '4px 0', textAlign: 'center', color: '#6B7280', fontFamily: 'monospace', fontSize: 10 }}>
                        {row.amplitudePct != null ? row.amplitudePct.toFixed(2) + '%' : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          </div>
          )}
          {/* 小时数据内容 */}
          {isCryptoSymbol && dataSubTab === 'hourly' && (
          <div className="flex-1 overflow-auto">
          {hourlyLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">加载中...</div>
          ) : !hourlyData || hourlyData.rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-sm gap-2">
              <span>暂无小时数据</span>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '15%' }} />
                <col style={{ width: '14.5%' }} />
                <col style={{ width: '14.5%' }} />
                <col style={{ width: '14.5%' }} />
                <col style={{ width: '14.5%' }} />
                <col style={{ width: '13.5%' }} />
                <col style={{ width: '13.5%' }} />
              </colgroup>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr style={{ background: '#F3F4F6' }}>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>时间</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>开盘</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>收盘</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>最高</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>最低</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>涨跌%</th>
                  <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>振幅%</th>
                </tr>
              </thead>
              <tbody>
                {hourlyData.rows.map((row, idx) => {
                  const up = row.changePct != null && row.changePct > 0;
                  const down = row.changePct != null && row.changePct < 0;
                  const color = up ? '#EF4444' : down ? '#16A34A' : '#9CA3AF';
                  const rowBg = idx % 2 === 0 ? '#fff' : '#F9FAFB';
                  // 时间格式：两行显示 "26/05/06" 和 "08:00"
                  const shortDt = (() => {
                    const d = row.datetime || '';
                    // datetime 格式：2026-05-06 08:00:00 或 2026/05/06 08:00
                    const spaceIdx = d.indexOf(' ');
                    if (spaceIdx > 0) {
                      const datePart = d.slice(0, spaceIdx).replace(/-/g, '/');
                      const timePart = d.slice(spaceIdx + 1, spaceIdx + 6); // HH:mm
                      const yy = datePart.length >= 8 ? datePart.slice(2) : datePart; // 去掉世纪
                      return { date: yy, time: timePart };
                    }
                    return { date: d, time: '' };
                  })();
                  return (
                    <tr key={row.openTime} style={{ background: rowBg }}>
                      <td style={{ border: '1px solid #E5E7EB', padding: '3px 0', textAlign: 'center', color: '#6B7280', fontFamily: 'monospace', fontSize: 9, lineHeight: 1.3 }}>
                        <div style={{ whiteSpace: 'nowrap' }}>{shortDt.date}</div>
                        <div style={{ whiteSpace: 'nowrap', color: '#9CA3AF' }}>{shortDt.time}</div>
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '4px 0', textAlign: 'center', color: '#374151', fontFamily: 'monospace', fontSize: 10 }}>{formatPrice(row.open)}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '4px 0', textAlign: 'center', color, fontFamily: 'monospace', fontSize: 10, fontWeight: 600 }}>{formatPrice(row.close)}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '4px 0', textAlign: 'center', color: '#4B5563', fontFamily: 'monospace', fontSize: 10 }}>{formatPrice(row.high)}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '4px 0', textAlign: 'center', color: '#4B5563', fontFamily: 'monospace', fontSize: 10 }}>{formatPrice(row.low)}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '4px 0', textAlign: 'center', color, fontFamily: 'monospace', fontSize: 10 }}>{formatPct(row.changePct)}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '4px 0', textAlign: 'center', color: '#6B7280', fontFamily: 'monospace', fontSize: 10 }}>
                        {row.amplitudePct != null ? row.amplitudePct.toFixed(2) + '%' : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          </div>
          )}
        </div>
      )}

      {/* ===== 分钟数据 Tab（权限锁定） ===== */}
      {activeTab === 'data' && isCryptoSymbol && dataSubTab === 'minute' && (
        <div className="flex-1 overflow-auto flex flex-col items-center justify-center" style={{ background: '#fff', minHeight: 320 }}>
          {/* 数据条数展示 */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 8 }}>分钟数据总量</div>
            <div style={{ fontSize: 36, fontWeight: 700, color: '#D32F2F', fontFamily: 'monospace', letterSpacing: 1 }}>
              {minuteMeta ? (minuteMeta.total + minuteCounter).toLocaleString() : '--'}
            </div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>条（每分钟实时更新）</div>
            {minuteMeta?.latestDatetime && (
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>最新数据：{String(minuteMeta.latestDatetime).slice(0, 16)}</div>
            )}
          </div>
          {/* 锁定提示 */}
          <div style={{
            background: '#FEF3C7',
            border: '1px solid #FDE68A',
            borderRadius: 8,
            padding: '16px 24px',
            maxWidth: 280,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 13, color: '#92400E', fontWeight: 600, marginBottom: 6 }}>需要更高权限</div>
            <div style={{ fontSize: 12, color: '#B45309', lineHeight: 1.6 }}>查看分钟详细数据需要更高级别的访问权限，请联系管理员开通</div>
          </div>
        </div>
      )}

      {/* ===== 资金费率 Tab ===== */}
      {activeTab === "funding" && (
        <div className="flex-1 overflow-auto">
          {fundingLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">加载中...</div>
          ) : !fundingData || fundingData.rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-sm gap-2">
              <span>暂无资金费率数据</span>
              <span className="text-xs text-gray-300">数据每8小时同步一次</span>
            </div>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '26%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                </colgroup>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ background: '#F3F4F6' }}>
                    <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>时间 (北京)</th>
                    <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>周期</th>
                    <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>方向</th>
                    <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>费率</th>
                    <th style={{ border: '1px solid #D1D5DB', padding: '6px 2px', textAlign: 'center', color: '#6B7280', fontWeight: 500, fontSize: 11 }}>年化</th>
                  </tr>
                </thead>
                <tbody>
                  {fundingData.rows.map((row, idx) => {
                    const rate = row.fundingRate;
                    const rateColor = rate > 0 ? '#EF4444' : rate < 0 ? '#16A34A' : '#9CA3AF';
                    const rowBg = idx % 2 === 0 ? '#fff' : '#F9FAFB';
                    const dt = new Date(row.fundingTime);
                    // 时间：26/05/05 08:00 格式
                    const yy = String(dt.getUTCFullYear()).slice(-2);
                    const mm = String(dt.getUTCMonth()+1).padStart(2,'0');
                    const dd = String(dt.getUTCDate()).padStart(2,'0');
                    const hh = String(dt.getUTCHours()).padStart(2,'0');
                    const timeStr = `${yy}/${mm}/${dd} ${hh}:00`;
                    // 周期
                    const prevRow = fundingData.rows[idx + 1];
                    const periodH = prevRow ? Math.round((row.fundingTime - prevRow.fundingTime) / 1000 / 3600) : 8;
                    const periodStr = `${periodH}h`;
                    // 年化
                    const annualRate = rate * (8760 / periodH) * 100;
                    const annualStr = (annualRate >= 0 ? '+' : '') + annualRate.toFixed(2) + '%';
                    // 方向
                    const dirLabel = rate > 0 ? '多付空' : rate < 0 ? '空付多' : '平衡';
                    const dirColor = rate > 0 ? '#EF4444' : rate < 0 ? '#16A34A' : '#9CA3AF';
                    const rateStr = (rate * 100).toFixed(4) + '%';
                    // 按日分隔线
                    const isNewDay = idx === 0 || (() => {
                      const prevDt = new Date(fundingData.rows[idx - 1].fundingTime + 8 * 3600 * 1000);
                      return dt.getUTCDate() !== prevDt.getUTCDate() || dt.getUTCMonth() !== prevDt.getUTCMonth();
                    })();
                    const topBorder = isNewDay && idx > 0 ? '1px solid #D1D5DB' : '1px solid #E5E7EB';
                    const cellStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
                      border: '1px solid #E5E7EB',
                      borderTop: topBorder,
                      padding: '4px 0',
                      textAlign: 'center' as const,
                      fontFamily: 'monospace',
                      fontSize: 11,
                      whiteSpace: 'nowrap' as const,
                      overflow: 'hidden',
                      ...extra,
                    });
                    return (
                      <tr key={row.fundingTime} style={{ background: rowBg }}>
                        <td style={cellStyle({ color: '#6B7280' })}>{timeStr}</td>
                        <td style={cellStyle({ color: '#9CA3AF' })}>{periodStr}</td>
                        <td style={cellStyle({ color: dirColor, fontWeight: 600 })}>{dirLabel}</td>
                        <td style={cellStyle({ color: rateColor, fontWeight: 600 })}>{rateStr}</td>
                        <td style={cellStyle({ color: rateColor })}>{annualStr}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* 分页 */}
              {fundingData.total > 100 && (
                <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
                  <button
                    onClick={() => setFundingPage((p) => Math.max(1, p - 1))}
                    disabled={fundingPage <= 1 || fundingLoading}
                    className="px-4 py-1.5 text-sm rounded border border-gray-200 text-gray-600 disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <span className="text-xs text-gray-400">
                    第 {fundingPage} / {Math.ceil(fundingData.total / 100)} 页 · 共 {fundingData.total} 条
                  </span>
                  <button
                    onClick={() => setFundingPage((p) => Math.min(Math.ceil(fundingData.total / 100), p + 1))}
                    disabled={fundingPage >= Math.ceil(fundingData.total / 100) || fundingLoading}
                    className="px-4 py-1.5 text-sm rounded border border-gray-200 text-gray-600 disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
              )}
            </>
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

              {/* 历史价格折线图 */}
              {allChangePcts && allChangePcts.length > 0 && (() => {
                const priceData = [...allChangePcts].filter(d => d.close != null).map(d => ({
                  date: d.date,
                  close: d.close as number,
                }));
                const minPrice = Math.min(...priceData.map(d => d.close));
                const maxPrice = Math.max(...priceData.map(d => d.close));
                const maxIdx = priceData.findIndex(d => d.close === maxPrice);
                const minIdx = priceData.findIndex(d => d.close === minPrice);
                const lastIdx = priceData.length - 1;
                // 格式化价格标签（强制转Number防止toFixed报错）
                const fmtPrice = (v: number | string) => { const n = Number(v); if (isNaN(n)) return String(v); return n >= 1000000 ? (n/1000000).toFixed(2).concat('M') : n >= 1000 ? (n/1000).toFixed(1).concat('k') : n.toFixed(2); };
                // 自定义dot：仅在最高价点渲染标注（带白底标签，不混淆坐标轴）
                const renderDot = (props: any) => {
                  const { cx, cy, index, payload } = props;
                  const isMax = index === maxIdx;
                  if (!isMax) return null;
                  const n = Number(payload?.close ?? payload?.value);
                  if (isNaN(n) || !cx || !cy) return null;
                  const fullPrice = n >= 1 ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : n.toFixed(4);
                  const labelText = '\u2191 \u6700\u9ad8 $'.concat(fullPrice);
                  const labelW = labelText.length * 5.5 + 8;
                  const labelH = 14;
                  const lx = cx - labelW / 2;
                  const ly = cy - labelH - 8;
                  return (
                    <g key={'dot-max'}>
                      <circle cx={cx} cy={cy} r={5} fill="#f59e0b" stroke="#fff" strokeWidth={2} />
                      <rect x={lx} y={ly} width={labelW} height={labelH} rx={3} fill="#fff" stroke="#f59e0b" strokeWidth={1} />
                      <text x={cx} y={ly + 10} textAnchor="middle" fontSize={8} fill="#d97706" fontWeight={700}>{labelText}</text>
                    </g>
                  );
                };
                return (
                  <div className="bg-white mx-3 rounded-xl border border-gray-200 overflow-hidden mb-3">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                        {currentStockInfo?.icon && <img src={currentStockInfo.icon} alt="" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />}
                        历史价格
                      </span>
                      <span className="text-xs text-gray-400">{priceData[0]?.date} ~ {priceData[priceData.length - 1]?.date}</span>
                    </div>
                    <div className="px-2 py-3">
                      <ResponsiveContainer width="100%" height={200}>
                        <ComposedChart data={priceData} margin={{ top: 20, right: 40, left: -10, bottom: 0 }}>
                          <defs>
                            <linearGradient id="priceAreaGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.45} />
                              <stop offset="60%" stopColor="#ef4444" stopOpacity={0.15} />
                              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                            </linearGradient>
                            <filter id="priceLineShadow" x="-5%" y="-20%" width="110%" height="140%">
                              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#ef4444" floodOpacity="0.35" />
                            </filter>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 8, fill: '#bbb' }}
                            tickFormatter={(v: string) => v.slice(0, 4)}
                            interval={Math.floor(priceData.length / 6)}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 8, fill: '#bbb' }}
                            domain={[minPrice * 0.92, maxPrice * 1.08]}
                            tickFormatter={(v: number) => v >= 1000 ? (v/1000).toFixed(0).concat('k') : v.toFixed(0)}
                            width={40}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{ fontSize: 10, padding: '3px 7px', borderRadius: 6, border: '1px solid #fecaca', background: 'rgba(255,255,255,0.95)' }}
                            formatter={(value: number) => ['$'.concat(value.toLocaleString()), '收盘价']}
                            labelFormatter={(label: string) => label}
                          />
                          <Area
                            type="monotone"
                            dataKey="close"
                            stroke="#ef4444"
                            strokeWidth={2}
                            fill="url(#priceAreaGradient)"
                            dot={renderDot}
                            activeDot={{ r: 4, fill: '#ef4444' }}
                            connectNulls
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ filter: 'url(#priceLineShadow)' }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })()}

              {/* 涨跌天数概览 */}
              <div className="bg-white mx-3 rounded-xl border border-gray-200 overflow-hidden mb-3">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                    {currentStockInfo?.icon && <img src={currentStockInfo.icon} alt="" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />}
                    涨跌天数统计
                  </span>
                  <span className="text-xs text-gray-400">共 {stats.total} 天</span>
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
                      {stats.total > 0 ? (stats.flatDays / stats.total * 100).toFixed(2) : 0}%
                    </span>
                  </div>
                </div>
                {/* 涨跌比例条 */}
                <div className="mx-4 mb-3 h-2 rounded-full overflow-hidden flex">
                  <div className="bg-red-400" style={{ width: `${stats.upPct}%` }} />
                  <div className="bg-gray-200" style={{ width: `${(stats.flatDays / stats.total * 100).toFixed(2)}%` }} />
                  <div className="bg-green-500 flex-1" />
                </div>
              </div>

              {/* 累计涨跌幅 */}
              <YearlyBreakdown allChangePcts={allChangePcts ?? []} totalUpPct={stats.totalUpPct} totalDownPct={stats.totalDownPct} coinIcon={currentStockInfo?.icon} />

              {/* 连涨/连跌统计（已内嵌最长连涨/连跌） */}
              {allChangePcts && allChangePcts.length > 0 && (
                <div className="bg-white border border-gray-200 mx-3 rounded-xl overflow-hidden mb-3">
                  <StreakStatsPanel allData={allChangePcts} latestDate={latestDate} coinIcon={currentStockInfo?.icon} />
                </div>
              )}

              {/* 涨跌幅频率分布图（正态分布直方图） */}
              {allChangePcts && allChangePcts.length > 0 && (
                <ChangePctDistChart allData={allChangePcts} latestDate={latestDate} coinIcon={currentStockInfo?.icon} />
              )}

              {/* 资金费率历史走势图（仅数字币模式） */}
              {isCryptoMode && fundingChartData && fundingChartData.length > 0 && (() => {
                const chartData = fundingChartData.map(d => ({
                  date: (() => {
                    const dt = new Date(d.fundingTime + 8 * 3600 * 1000); // UTC+8 北京时间
                    return `${dt.getUTCFullYear()}/${String(dt.getUTCMonth()+1).padStart(2,'0')}/${String(dt.getUTCDate()).padStart(2,'0')}`;
                  })(),
                  rate: parseFloat((d.fundingRate * 100).toFixed(4)),
                }));
                const minRate = Math.min(...chartData.map(d => d.rate));
                const maxRate = Math.max(...chartData.map(d => d.rate));
                const absMax = Math.max(Math.abs(minRate), Math.abs(maxRate));
                const yDomain: [number, number] = [-absMax * 1.2, absMax * 1.2];
                return (
                  <div className="bg-white mx-3 rounded-xl border border-gray-200 overflow-hidden mb-3">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                        {currentStockInfo?.icon && <img src={currentStockInfo.icon} alt="" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />}
                        资金费率走势
                      </span>
                      <span className="text-xs text-gray-400">{chartData[0]?.date} ~ {chartData[chartData.length - 1]?.date}</span>
                    </div>
                    <div className="px-2 py-3">
                      <ResponsiveContainer width="100%" height={180}>
                        <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: -10, bottom: 0 }}>
                          <defs>
                            <linearGradient id="fundingAreaGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 8, fill: '#bbb' }}
                            tickFormatter={(v: string) => v.slice(0, 4)}
                            interval={Math.floor(chartData.length / 5)}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 8, fill: '#bbb' }}
                            tickFormatter={(v: number) => v.toFixed(3) + '%'}
                            domain={yDomain}
                            axisLine={false}
                            tickLine={false}
                            width={52}
                          />
                          <Tooltip
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb', padding: '6px 10px' }}
                            formatter={(value: number) => [value.toFixed(4) + '%', '资金费率']}
                            labelFormatter={(label: string) => `时间: ${label}`}
                          />
                          <ReferenceLine y={0} stroke="#9CA3AF" strokeDasharray="3 3" />
                          <Area
                            type="monotone"
                            dataKey="rate"
                            stroke="#3B82F6"
                            strokeWidth={1.5}
                            fill="url(#fundingAreaGradient)"
                            dot={false}
                            activeDot={{ r: 3, fill: '#3B82F6' }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    {/* 简要统计 */}
                    <div className="px-4 pb-3 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-xs text-gray-400">平均费率</div>
                        <div className="text-sm font-semibold" style={{ color: (chartData.reduce((s, d) => s + d.rate, 0) / chartData.length) >= 0 ? '#D32F2F' : '#388E3C' }}>
                          {(chartData.reduce((s, d) => s + d.rate, 0) / chartData.length).toFixed(4)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">最高费率</div>
                        <div className="text-sm font-semibold text-red-500">{maxRate.toFixed(4)}%</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">最低费率</div>
                        <div className="text-sm font-semibold text-green-600">{minRate.toFixed(4)}%</div>
                      </div>
                    </div>

                    {/* 年度年化资金费率趋势图（多空两条线） */}
                    {(() => {
                      // 按年分组，每年实际累计费率之和即为年化
                      const yearMap2: Record<string, { sumRate: number; count: number }> = {};
                      fundingChartData.forEach(d => {
                        const year = String(new Date(d.fundingTime + 8 * 3600 * 1000).getUTCFullYear()); // 北京时间
                        if (!yearMap2[year]) yearMap2[year] = { sumRate: 0, count: 0 };
                        yearMap2[year].sumRate += d.fundingRate;
                        yearMap2[year].count += 1;
                      });
                      const yearlyData = Object.keys(yearMap2).sort().map(year => {
                        const longAnnual = parseFloat((yearMap2[year].sumRate * 100).toFixed(2));
                        return { year, long: longAnnual, short: parseFloat((-longAnnual).toFixed(2)) };
                      });
                      if (yearlyData.length === 0) return null;
                      const allVals = yearlyData.flatMap(d => [d.long, d.short]);
                      const yMin = Math.min(...allVals);
                      const yMax = Math.max(...allVals);
                      const yPad = (yMax - yMin) * 0.15 || 5;
                      return (
                        <div className="border-t border-gray-100 pt-3 pb-1 px-3 mb-1">
                          <div className="text-xs font-medium text-gray-600 mb-2 px-1">年度资金费率年化趋势</div>
                          <ResponsiveContainer width="100%" height={160}>
                            <ComposedChart data={yearlyData} margin={{ top: 4, right: 28, left: -10, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                              <XAxis
                                dataKey="year"
                                tick={{ fontSize: 9, fill: '#9CA3AF' }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                tick={{ fontSize: 8, fill: '#bbb' }}
                                tickFormatter={(v: number) => v.toFixed(0) + '%'}
                                domain={[yMin - yPad, yMax + yPad]}
                                axisLine={false}
                                tickLine={false}
                                width={40}
                              />
                              <Tooltip
                                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb', padding: '6px 10px' }}
                                formatter={(value: number, name: string) => [value.toFixed(2) + '%', name === 'long' ? '多头年化' : '空头年化']}
                                labelFormatter={(label: string) => `${label}年`}
                              />
                              <ReferenceLine y={0} stroke="#9CA3AF" strokeDasharray="3 3" />
                              <Line type="monotone" dataKey="long" stroke="#EF4444" strokeWidth={2} dot={{ r: 3, fill: '#EF4444' }} name="long">
                                <LabelList dataKey="long" position="top" style={{ fontSize: 8, fill: '#EF4444', fontWeight: 600 }} formatter={(v: number) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'} />
                              </Line>
                              <Line type="monotone" dataKey="short" stroke="#16A34A" strokeWidth={2} dot={{ r: 3, fill: '#16A34A' }} name="short">
                                <LabelList dataKey="short" position="bottom" style={{ fontSize: 8, fill: '#16A34A', fontWeight: 600 }} formatter={(v: number) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'} />
                              </Line>
                            </ComposedChart>
                          </ResponsiveContainer>
                          <div className="flex gap-4 justify-center mt-1 mb-1">
                            <span className="text-xs flex items-center gap-1"><span style={{ display: 'inline-block', width: 16, height: 2, background: '#EF4444', verticalAlign: 'middle' }}></span><span className="text-gray-500">多头年化（正=付出）</span></span>
                            <span className="text-xs flex items-center gap-1"><span style={{ display: 'inline-block', width: 16, height: 2, background: '#16A34A', verticalAlign: 'middle' }}></span><span className="text-gray-500">空头年化（正=收入）</span></span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* 历年多空资金费率统计（可折叠） */}
                    {(() => {
                      // 按年分组计算
                      const yearMap: Record<string, { sumRate: number; count: number; periodH: number }> = {};
                      fundingChartData.forEach((d, i) => {
                        const dt = new Date(d.fundingTime + 8 * 3600 * 1000); // 北京时间
                        const year = String(dt.getUTCFullYear());
                        const next = fundingChartData[i + 1];
                        const ph = next ? Math.round((d.fundingTime - next.fundingTime) / 1000 / 3600) : 8;
                        const safePh = (ph > 0 && ph <= 24) ? ph : 8;
                        if (!yearMap[year]) yearMap[year] = { sumRate: 0, count: 0, periodH: safePh };
                        yearMap[year].sumRate += d.fundingRate;
                        yearMap[year].count += 1;
                        yearMap[year].periodH = safePh;
                      });
                      const years = Object.keys(yearMap).sort((a, b) => Number(b) - Number(a));
                      // 每年实际结算次数 = count，年化 = sumRate * (8760 / periodH) * 100
                      // 多头年化 = 如果 sumRate > 0，多头净付出 sumRate*100%；空头净收入
                      // 空头年化 = 如果 sumRate < 0，空头净付出 |sumRate|*100%；多头净收入
                      return (
                        <FundingYearlyStats years={years} yearMap={yearMap} rawData={fundingChartData} />
                      );
                    })()}

                  </div>
                );
              })()}

              {/* 相关性统计模块 */}
              {(() => {
                const baseInfo = ALL_SYMBOLS.find(s => s.key === corrBaseSymbol);
                return (
                  <div className="bg-white mx-3 rounded-xl border border-gray-200 overflow-hidden mb-3">
                    {/* 标题行 */}
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-700 flex items-center gap-1">
                        {baseInfo?.icon && <img src={baseInfo.icon} alt="" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />}
                        相关性统计
                      </span>
                    </div>

                    {/* 统计结果 */}
                    {corrCompare.length === 0 && (
                      <div className="px-4 py-6 text-center text-gray-400 text-xs">请选择至少一个对比币</div>
                    )}
                    {corrLoading && corrCompare.length > 0 && (
                      <div className="px-4 py-6 text-center text-gray-400 text-xs">加载中...</div>
                    )}
                    {!corrLoading && corrCompare.length > 0 && corrData && corrData.pairs.length === 0 && (
                      <div className="px-4 py-6 text-center text-gray-400 text-xs">数据未初始化，请联系管理员触发计算</div>
                    )}
                    {corrData && corrData.pairs.length > 0 && (
                      <div className="px-4 pb-4 pt-2 space-y-5">
                        {/* 数字统计表格：全部币对并排展示 */}
                        <div className="border border-gray-100 rounded-xl overflow-hidden mb-4">
                          {/* 表头 */}
                          <div className="grid bg-gray-50 border-b border-gray-100" style={{ gridTemplateColumns: `80px repeat(${corrData.pairs.length}, 1fr)` }}>
                            <div className="px-2 py-2 flex items-center justify-center gap-1">
                              {baseInfo?.icon && <img src={baseInfo.icon} alt="" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover' }} />}
                              <span className="text-xs text-gray-500 font-medium">vs</span>
                            </div>
                            {corrData.pairs.map(pair => {
                              const compInfo = ALL_SYMBOLS.find(s => s.key === pair.symbol);
                              return (
                                <div key={pair.symbol} className="px-1 py-2 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    {compInfo?.icon && <img src={compInfo.icon} alt="" style={{ width: 14, height: 14, borderRadius: '50%', objectFit: 'cover' }} />}
                                    <span className="text-xs font-semibold text-gray-700">{compInfo?.shortLabel ?? pair.symbol}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {/* 六行数据 */}
                          {([
                            { arrow: '↑↑', text: '同涨', key: 'bothUp', bg: 'bg-red-50', color: 'text-red-600' },
                            { arrow: '↑↓', text: '涨跌', key: 'baseUpCompDown', bg: 'bg-orange-50', color: 'text-orange-500' },
                            { arrow: '↓↓', text: '同跌', key: 'bothDown', bg: 'bg-green-50', color: 'text-green-600' },
                            { arrow: '↓↑', text: '跌涨', key: 'baseDownCompUp', bg: 'bg-emerald-50', color: 'text-emerald-500' },
                            { arrow: '', text: '同向天数', key: 'sameDirection', bg: 'bg-gray-50', color: 'text-gray-800' },
                            { arrow: '', text: '反向天数', key: 'oppositeDirection', bg: 'bg-gray-50', color: 'text-gray-700' },
                          ] as { arrow: string; text: string; key: keyof typeof corrData.pairs[0]; bg: string; color: string }[]).map((row, ri) => (
                            <div key={ri} className={`grid border-b border-gray-100 last:border-b-0 ${row.bg}`} style={{ gridTemplateColumns: `80px repeat(${corrData.pairs.length}, 1fr)` }}>
                              <div className="px-2 py-2 text-xs text-gray-500 flex items-center gap-0.5">
                                {row.arrow && <span className="font-bold">{row.arrow}</span>}
                                <span>{row.text}</span>
                              </div>
                              {corrData.pairs.map(pair => {
                                const val = Number(pair[row.key]);
                                const pct = pair.validDays > 0 ? ((val / pair.validDays) * 100).toFixed(1) : '0.0';
                                return (
                                  <div key={pair.symbol} className="px-1 py-2 text-center">
                                    <div className={`text-sm font-bold ${row.color}`}>{val}</div>
                                    <div className="text-xs text-gray-400">{pct}%</div>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>

                        {/* 各币对共同日期范围说明 */}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 pb-1">
                          {corrData.pairs.map(pair => {
                            const compInfo = ALL_SYMBOLS.find(s => s.key === pair.symbol);
                            return (
                              <span key={pair.symbol} className="text-xs text-gray-400">
                                {baseInfo?.shortLabel} vs {compInfo?.shortLabel ?? pair.symbol}：共同 {pair.validDays} 天
                                {(pair as any).dateStart && <span className="text-gray-300 ml-1">({(pair as any).dateStart?.slice(0,7)} ~ {(pair as any).dateEnd?.slice(0,7)})</span>}
                              </span>
                            );
                          })}
                        </div>

                        {/* 饵图可视化：每个币对一个饵图，并排 */}
                        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(corrData.pairs.length, 2)}, 1fr)` }}>
                          {corrData.pairs.map(pair => {
                            const compInfo = ALL_SYMBOLS.find(s => s.key === pair.symbol);
                            const pieData = [
                              { name: `${baseInfo?.shortLabel}涨+${compInfo?.shortLabel}涨`, value: pair.bothUp, color: '#ef4444' },
                              { name: `${baseInfo?.shortLabel}涨+${compInfo?.shortLabel}跌`, value: pair.baseUpCompDown, color: '#f97316' },
                              { name: `${baseInfo?.shortLabel}跌+${compInfo?.shortLabel}跌`, value: pair.bothDown, color: '#22c55e' },
                              { name: `${baseInfo?.shortLabel}跌+${compInfo?.shortLabel}涨`, value: pair.baseDownCompUp, color: '#86efac' },
                            ];
                            return (
                              <div key={pair.symbol} className="border border-gray-100 rounded-xl pt-2 pb-1">
                                <div className="text-xs text-center text-gray-500 font-medium mb-1">
                                  {baseInfo?.shortLabel} vs {compInfo?.shortLabel ?? pair.symbol}
                                </div>
                                <ResponsiveContainer width="100%" height={190}>
                                  <PieChart margin={{ top: 12, right: 5, bottom: 0, left: 5 }}>
                                    <Pie
                                      data={pieData}
                                      cx="50%"
                                      cy="42%"
                                      innerRadius={28}
                                      outerRadius={50}
                                      paddingAngle={2}
                                      dataKey="value"
                                      label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                                      labelLine={false}
                                      fontSize={9}
                                    >
                                      {pieData.map((entry, i) => (
                                        <Cell key={i} fill={entry.color} />
                                      ))}
                                    </Pie>
                                    <Legend
                                      iconType="circle"
                                      iconSize={7}
                                      wrapperStyle={{ fontSize: 8, paddingTop: 4 }}
                                      formatter={(value) => <span style={{ fontSize: 8, color: '#666' }}>{value}</span>}
                                    />
                                    <Tooltip
                                      formatter={(value: number, name: string) => [`${value}天`, name]}
                                      contentStyle={{ fontSize: 10, padding: '3px 7px', borderRadius: 6 }}
                                    />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

            </div>
          )}
        </div>
      )}

      {/* ===== 预测未来 Tab ===== */}
      {activeTab === "predict" && (
        <div className="flex-1 overflow-auto bg-gray-50" style={{ minHeight: 0 }}>
          <div className="px-3 py-3">
            <MarketBetPanelWithTabs ledgerId={ledgerId} />
          </div>
        </div>
      )}

      {/* 分页（日线数据） */}
      {activeTab === "data" && dataSubTab === 'daily' && totalPages > 1 && (
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
      {/* 分页（小时数据） */}
      {activeTab === "data" && dataSubTab === 'hourly' && hourlyTotalPages > 1 && (
        <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setHourlyPage((p) => Math.max(1, p - 1))}
            disabled={hourlyPage <= 1 || hourlyLoading}
            className="px-4 py-1.5 text-sm rounded border border-gray-200 text-gray-600 disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-xs text-gray-400">
            第 {hourlyPage} / {hourlyTotalPages} 页 · 共 {hourlyTotal} 条
          </span>
          <button
            onClick={() => setHourlyPage((p) => Math.min(hourlyTotalPages, p + 1))}
            disabled={hourlyPage >= hourlyTotalPages || hourlyLoading}
            className="px-4 py-1.5 text-sm rounded border border-gray-200 text-gray-600 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
