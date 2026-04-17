import { useState, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, ReferenceLine
} from "recharts";

const CDN = "https://d2xsxph8kpxj0f.cloudfront.net/310519663279996243/ivirPqo3t2YCdg32vqitTK";
const SYMBOLS = [
  { key: "BTCUSDT", label: "比特币 BTC", shortLabel: "BTC",  icon: `${CDN}/btc_732a725a.png` },
  { key: "ETHUSDT", label: "以太坊 ETH", shortLabel: "ETH",  icon: `${CDN}/eth_6ebbf353.png` },
  { key: "AAPL",   label: "苹果 AAPL",   shortLabel: "AAPL", icon: `${CDN}/aapl_3d0ebe4b.png` },
  { key: "MSFT",   label: "微软 MSFT",   shortLabel: "MSFT", icon: `${CDN}/msft_6f03ba12.png` },
  { key: "GOOGL",  label: "谷歌 GOOGL",  shortLabel: "GOOGL",icon: `${CDN}/googl_f5e51fc9.png` },
  { key: "AMZN",   label: "亚马逊 AMZN",  shortLabel: "AMZN", icon: `${CDN}/amzn_62fb91c5.png` },
  { key: "NVDA",   label: "英伟达 NVDA",  shortLabel: "NVDA", icon: `${CDN}/nvda_027844b0.png` },
  { key: "TSLA",   label: "特斯拉 TSLA",  shortLabel: "TSLA", icon: `${CDN}/tsla_ce7ce165.png` },
  { key: "META",   label: "Meta META",   shortLabel: "META", icon: `${CDN}/meta_c6a365b1.png` },
];

const PAGE_SIZE = 60;
const TABS = [
  { key: "data", label: "日线数据" },
  { key: "analysis", label: "数据分析" },
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

      {/* 连涨连跌赔率表 */}
      {maxStreak > 0 && (() => {
        const totalDays = allSorted.length;
        const COL = '60px 1fr 1fr 1fr 1fr 1fr';
        const hStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: COL, gap: 0, background: '#fafafa', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', padding: '3px 0' };
        const rStyle = (i: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: COL, gap: 0, borderBottom: '1px solid #f0f0f0', padding: '2px 0', alignItems: 'center', background: i % 2 === 0 ? '#fff' : '#fafafa' });
        const Header = () => (
          <div style={hStyle}>
            <span style={{ fontSize: 9, textAlign: 'center', color: '#9ca3af', fontWeight: 600 }}>天数</span>
            <span style={{ fontSize: 9, textAlign: 'center', color: '#9ca3af', fontWeight: 600 }}>概率</span>
            {['10%优', '15%优', '20%优', '25%优'].map(t => (
              <span key={t} style={{ fontSize: 9, textAlign: 'center', color: '#b45309', fontWeight: 600 }}>{t}</span>
            ))}
          </div>
        );
        const makeRows = (streakMap: Record<number, number>, maxN: number, keyPrefix: string) => {
          // 计算总段数（所有连涨/连跌段的总次数，即 ≥1天 的总次数）
          const totalSegments = Object.values(streakMap).reduce((s, v) => s + v, 0);
          return Array.from({ length: maxN }, (_, i) => i + 1).map(n => {
            const cnt = streakMap[n] ?? 0;
            // 条件概率：恰好连涨/连跌N天的次数 ÷ 总段数
            const prob = totalSegments > 0 ? cnt / totalSegments : 0;
            const fairOdds = prob > 0 ? 1 / prob : 0;
            if (cnt === 0) return (
              <div key={`${keyPrefix}-${n}`} style={rStyle(n)}>
                <span style={{ fontSize: 9, textAlign: 'center', color: '#888', fontFamily: 'monospace' }}>{n}天</span>
                <span style={{ fontSize: 9, textAlign: 'center', color: '#ccc', fontFamily: 'monospace' }}>-</span>
                {[0.10, 0.15, 0.20, 0.25].map(edge => (
                  <span key={edge} style={{ fontSize: 9, textAlign: 'center', color: '#ccc', fontFamily: 'monospace' }}>-</span>
                ))}
              </div>
            );
            return (
              <div key={`${keyPrefix}-${n}`} style={rStyle(n)}>
                <span style={{ fontSize: 9, textAlign: 'center', color: '#888', fontFamily: 'monospace' }}>{n}天</span>
                <span style={{ fontSize: 9, textAlign: 'center', color: '#6b7280', fontFamily: 'monospace' }}>{(prob * 100).toFixed(2)}%</span>
                {[0.10, 0.15, 0.20, 0.25].map(edge => (
                  <span key={edge} style={{ fontSize: 9, textAlign: 'center', color: '#92400e', fontFamily: 'monospace', fontWeight: 600 }}>
                    {(fairOdds * (1 - edge)).toFixed(2)}
                  </span>
                ))}
              </div>
            );
          });
        };
        return (
          <div className="px-4 pb-3">
            <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', margin: '4px 0 4px 0' }}>赔率参考表
              <span style={{ fontSize: 9, fontWeight: 400, color: '#9ca3af', marginLeft: 6 }}>含本金 · 概率基于当前时间段统计</span>
            </div>
            <div style={{ fontSize: 9, color: RED, fontWeight: 600, margin: '4px 0 2px 0' }}>↑ 连涨赔率</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
              <Header />
              {makeRows(upStreakMap, maxUpStreak, 'up')}
            </div>
            <div style={{ fontSize: 9, color: GREEN_A, fontWeight: 600, margin: '8px 0 2px 0' }}>↓ 连跌赔率</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
              <Header />
              {makeRows(downStreakMap, maxDownStreak, 'down')}
            </div>
            <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 6 }}>注：赔率含本金。条件概率 = 该连涨/连跌N天出现次数 ÷ 所有连涨/连跌段总次数，各天数概率之和 = 100%。</div>
          </div>
        );
      })()}
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

      {/* 区间明细表格：涨幅 vs 跌幅对称展示 */}
      <div className="border-t border-gray-100 px-4 pt-2 pb-3">
        <div className="text-xs font-semibold text-gray-500 mb-2">区间明细统计</div>
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
      </div>

      {/* 赔率表 */}
      <div className="border-t border-gray-100 px-4 pt-2 pb-3">
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
      </div>

      {/* ── 时间切片对比表 ── */}
      <SliceCompareTable allData={allData} />
      {/* ── 4档竞猜分界点热力图 ── */}
      <FourTierTable allData={allData} />
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
      const yy = String(d.getFullYear()).slice(-2).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yy}/${mm}/${dd}`;
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
    const all = { label: '全量', cutDate: '00/01/01', group: 'year' };
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

  return (
    <div className="border-t border-gray-100 px-4 pt-3 pb-4">
      <div className="text-xs font-semibold text-gray-600 mb-1">区间×时段概率热力图</div>
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
    </div>
  );
}

// 4档竞猜分界点热力图：行=4档（大涨/小涨/小跌/大跌），列=18个时间切片
function FourTierTable({ allData }: { allData: { date: string; changePct: number | null }[] }) {
  const HOUSE_EDGE = 0.25;

  // 时间切片：近1~12月 + 近1~5年 + 全量（与 SliceCompareTable 完全一致）
  const periods = useMemo(() => {
    const now = new Date();
    const fmtDate = (d: Date) => {
      const yy = String(d.getFullYear()).slice(-2).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yy}/${mm}/${dd}`;
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
    const all = { label: '全量', cutDate: '00/01/01', group: 'year' };
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
    <div className="flex-1 overflow-auto pb-10" style={{
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
    { enabled: activeTab === "analysis" || activeTab === "predict", staleTime: 5 * 60 * 1000 }
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

        {/* 币种 Tab - 横向滚动，只显示Logo图标 */}
        <div className="flex overflow-x-auto border-b border-gray-200 scrollbar-hide px-2 gap-1 py-1.5" style={{ WebkitOverflowScrolling: 'touch' }}>
          {SYMBOLS.map((s) => (
            <button
              key={s.key}
              onClick={() => handleSymbolChange(s.key)}
              title={s.label}
              className={`shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${
                activeSymbol === s.key
                  ? "border-2 border-[#D32F2F] bg-red-50 shadow-sm"
                  : "border-2 border-transparent hover:bg-gray-50"
              }`}
            >
              <img
                src={s.icon}
                alt={s.shortLabel}
                className="w-6 h-6 rounded-sm object-contain"
              />
              <span className={`text-[9px] font-bold mt-0.5 ${
                activeSymbol === s.key ? 'text-[#D32F2F]' : 'text-gray-400'
              }`}>{s.shortLabel}</span>
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

              {/* 涨跌幅频率分布图（正态分布直方图） */}
              {allChangePcts && allChangePcts.length > 0 && (
                <ChangePctDistChart allData={allChangePcts} />
              )}

            </div>
          )}
        </div>
      )}

      {/* ===== 预测未来 Tab ===== */}
      {activeTab === "predict" && (
        <PredictTab allData={allChangePcts ?? []} symbol={activeSymbol} />
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
