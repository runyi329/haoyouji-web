/**
 * 宏观数据页面 - 中国出生人口数据
 * 路由：/macro-data
 * 风格：白色/浅灰官方风格
 */
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from "recharts";

// ── 颜色常量（白色官方风格）────────────────────────────────────────────────────
const BG_PAGE    = "#f5f6f8";
const BG_WHITE   = "#ffffff";
const BG_SUBTLE  = "#f0f2f5";
const BORDER     = "#e4e7ed";
const ACCENT     = "#1a56db";   // 官方蓝
const ACCENT2    = "#e53935";   // 强调红
const TEXT_MAIN  = "#1a1a2e";
const TEXT_SUB   = "#6b7280";
const TEXT_MUTED = "#9ca3af";
const MALE_COLOR  = "#3b82f6";
const FEMALE_COLOR = "#f472b6";
const GOLD_LINE  = "#d97706";   // 参考线颜色（深琥珀，在白底可见）

// ── Tab 类型 ──────────────────────────────────────────────────────────────────
type TabType = 'national' | 'provincial' | 'gender' | 'prediction';

// ── AI 预测数据（2026-2035，由 AI 大模型基于17变量测算）────────────────────────
const AI_PREDICTION_DATA = [
  { year: 2026, births: 750, optimistic: 780, pessimistic: 720, confidence: 88, keyFactor: '00后主力进入生育期但规模偏小，TFR维持1.0低位' },
  { year: 2027, births: 720, optimistic: 750, pessimistic: 690, confidence: 87, keyFactor: '育龄女性人口进一步减少，城镇化率提升，房价压力持续' },
  { year: 2028, births: 690, optimistic: 720, pessimistic: 660, confidence: 86, keyFactor: '00后进入生育后期，TFR持续承压，女性受教育年限增加' },
  { year: 2029, births: 660, optimistic: 690, pessimistic: 630, confidence: 85, keyFactor: '育龄女性人口规模加速萎缩，东亚低生育率结构性影响显著' },
  { year: 2030, births: 630, optimistic: 660, pessimistic: 600, confidence: 84, keyFactor: '育龄女性人口基数大幅下降，初婚年龄推迟效应累积' },
  { year: 2031, births: 600, optimistic: 630, pessimistic: 570, confidence: 83, keyFactor: '05后开始接棒，育龄女性人口规模进一步缩小，TFR难有起色' },
  { year: 2032, births: 580, optimistic: 610, pessimistic: 550, confidence: 82, keyFactor: '育龄女性人口结构性下降，城镇化率持续提升，生育意愿低迷' },
  { year: 2033, births: 560, optimistic: 590, pessimistic: 530, confidence: 81, keyFactor: '育龄女性人口规模持续萎缩，房价与教育成本抑制效应显著' },
  { year: 2034, births: 540, optimistic: 570, pessimistic: 510, confidence: 80, keyFactor: '育龄女性人口基数持续缩小，TFR维持在0.9-1.0区间' },
  { year: 2035, births: 520, optimistic: 550, pessimistic: 490, confidence: 79, keyFactor: '育龄女性人口结构性下降趋势不可逆，政策边际效应有限' },
];

const AI_METHODOLOGY = `## AI人口预测方法说明

本预测模型基于**多变量加权分析法**，结合历史数据趋势、人口学原理、社会经济因素和政策影响，对中国未来出生人口进行综合评估。

### 核心模型
采用**队列-组分模型（Cohort-Component Model）**结合机器学习修正，将17个关键变量分三层赋权，通过量化各变量对出生人口的贡献度，构建动态预测框架。

### 三大情景假设
- **基准情景**：TFR维持1.0，育龄女性按现有趋势萎缩，政策边际效应有限
- **乐观情景**：TFR在补贴大幅加码下维持1.05，房价压力有所缓解
- **悲观情景**：TFR继续下滑至0.85，育龄女性下降速度加快

### 关键结论
预计出生人口从2026年约750万，逐步下降至2035年约520万，甚至可能跌破500万大关。核心制约因素是育龄女性规模的**结构性萎缩**，这是不可逆的人口学规律。`;

const AI_DIMENSIONS = [
  { name: '育龄女性人口规模（20-34岁）', weight: 35, layer: 1 },
  { name: '总和生育率（TFR）趋势', weight: 25, layer: 1 },
  { name: '初婚年龄推迟趋势', weight: 10, layer: 1 },
  { name: '城镇化率', weight: 8, layer: 2 },
  { name: '房价收入比', weight: 7, layer: 2 },
  { name: '女性受教育年限', weight: 5, layer: 2 },
  { name: '人均可支配收入增速', weight: 3, layer: 2 },
  { name: '生育补贴力度', weight: 2, layer: 3 },
  { name: '参照国家经验（韩/日/台）', weight: 2, layer: 3 },
  { name: '疫情后补偿效应衰减', weight: 1, layer: 3 },
  { name: '龙年/吉年效应', weight: 0.5, layer: 3 },
  { name: '性别比失衡修复效应', weight: 0.5, layer: 3 },
  { name: '二孩/三孩政策存量释放', weight: 0.5, layer: 3 },
  { name: '人口流动与区域集中效应', weight: 0.3, layer: 3 },
  { name: '托育服务覆盖率', weight: 0.2, layer: 3 },
  { name: '辅助生殖技术普及', weight: 0.1, layer: 3 },
  { name: '气候与环境因素', weight: 0.1, layer: 3 },
];

// ── 自定义 Tooltip ─────────────────────────────────────────────────────────────
const NationalTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <div style={{ color: TEXT_SUB, fontSize: 11, marginBottom: 2 }}>{label}年</div>
      <div style={{ color: TEXT_MAIN, fontSize: 14, fontWeight: 700 }}>
        {val?.toLocaleString()} <span style={{ color: TEXT_MUTED, fontSize: 11 }}>万人</span>
      </div>
    </div>
  );
};

const BarTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <div style={{ color: TEXT_SUB, fontSize: 11, marginBottom: 2 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color, fontSize: 13, fontWeight: 600 }}>
          {p.name}: {p.value?.toFixed(2)} <span style={{ color: TEXT_MUTED, fontSize: 11 }}>‰</span>
        </div>
      ))}
    </div>
  );
};

// ── 关键事件标注 ───────────────────────────────────────────────────────────────
const KEY_EVENTS = [
  { year: 1963, label: '峰值',    position: 'top' as const },
  { year: 1980, label: '独生子女', position: 'top' as const },
  { year: 2016, label: '全面二孩', position: 'insideBottomRight' as const },
  { year: 2021, label: '三孩',    position: 'top' as const },
];

export default function MacroDataPage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('national');
  const [selectedYear, setSelectedYear] = useState<number>(2019);

  const { data: nationalData, isLoading: loadingNational } = trpc.macro.getNationalBirthData.useQuery();
  const { data: provincialData, isLoading: loadingProvincial } = trpc.macro.getProvincialBirthRate.useQuery();
  const { data: genderData, isLoading: loadingGender } = trpc.macro.getProvincialGender2020.useQuery();

  const chartData = useMemo(() => nationalData?.data ?? [], [nationalData]);

  const xTicks = useMemo(() => {
    return chartData.filter(d => d.year % 10 === 0).map(d => d.year);
  }, [chartData]);

  const latestData = useMemo(() => {
    if (!nationalData?.data?.length) return null;
    const arr = nationalData.data;
    const latest = arr[arr.length - 1];
    const prev = arr[arr.length - 2];
    const peak = arr.reduce((a, b) => a.births > b.births ? a : b);
    return { latest, prev, peak, change: latest.births - prev.births };
  }, [nationalData]);

  const provincialRanking = useMemo(() => {
    if (!provincialData?.data?.byProvince) return [];
    return provincialData.data.byProvince.map(p => ({
      province: p.province,
      rate: p.data.find(d => d.year === selectedYear)?.rate ?? 0,
    })).sort((a, b) => b.rate - a.rate);
  }, [provincialData, selectedYear]);

  const isLoading = loadingNational || loadingProvincial || loadingGender;

  const TABS = [
    { key: 'national' as TabType, label: '趋势×AI' },
    { key: 'provincial' as TabType, label: '分省×AI' },
    { key: 'gender' as TabType, label: '性别×AI' },
    { key: 'prediction' as TabType, label: 'AI预测' },
  ];

  // AI 预测弹出框状态
  const [predictionModal, setPredictionModal] = useState<typeof AI_PREDICTION_DATA[0] | null>(null);

  return (
    <div
      className="min-h-screen pb-10 max-w-md mx-auto relative"
      style={{ background: BG_PAGE, color: TEXT_MAIN }}
    >
      {/* ── 顶部导航 ── */}
      <div
        className="sticky top-0 z-20 flex items-center px-4 py-3"
        style={{ background: '#fff', borderBottom: `1px solid ${BORDER}` }}
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center justify-center w-8 h-8 rounded-full mr-3"
          style={{ background: BG_SUBTLE }}
        >
          <ChevronLeft className="w-5 h-5" style={{ color: TEXT_MAIN }} />
        </button>
        <div className="flex items-center gap-1 flex-1">
          <span className="text-base font-bold" style={{ color: TEXT_MAIN }}>人口</span>
          <span className="text-base font-bold" style={{ color: ACCENT }}>×</span>
          <span className="text-base font-bold" style={{ color: ACCENT }}>AI</span>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center justify-center px-3 h-7 rounded-full text-xs font-semibold"
          style={{ background: BG_SUBTLE, color: TEXT_SUB }}
        >
          刷新
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: ACCENT }} />
            <div style={{ color: TEXT_MUTED, fontSize: 13 }}>加载数据中...</div>
          </div>
        </div>
      ) : (
        <>
          {/* ── 数据摘要卡片 ── */}
          {latestData && (
            <div className="px-4 pt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl p-3 text-center" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                <div style={{ color: TEXT_MUTED, fontSize: 10 }}>2025年出生</div>
                <div style={{ color: ACCENT2, fontSize: 18, fontWeight: 800 }}>{latestData.latest.births}</div>
                <div style={{ color: TEXT_MUTED, fontSize: 10 }}>万人</div>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                <div style={{ color: TEXT_MUTED, fontSize: 10 }}>历史峰值</div>
                <div style={{ color: GOLD_LINE, fontSize: 18, fontWeight: 800 }}>{latestData.peak.births}</div>
                <div style={{ color: TEXT_MUTED, fontSize: 10 }}>{latestData.peak.year}年</div>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                <div style={{ color: TEXT_MUTED, fontSize: 10 }}>较上年</div>
                <div style={{ color: latestData.change < 0 ? ACCENT2 : '#16a34a', fontSize: 18, fontWeight: 800 }}>
                  {latestData.change > 0 ? '+' : ''}{latestData.change}
                </div>
                <div style={{ color: TEXT_MUTED, fontSize: 10 }}>万人</div>
              </div>
            </div>
          )}

          {/* ── Tab 切换 ── */}
          <div className="px-4 mt-4">
            <div className="flex rounded-xl p-1" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              {TABS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: activeTab === key ? ACCENT : 'transparent',
                    color: activeTab === key ? '#fff' : TEXT_SUB,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Tab 内容 ── */}
          <div className="px-4 mt-3">

            {/* 全国趋势 */}
            {activeTab === 'national' && (
              <div>
                <div className="rounded-xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                  <div className="flex items-center justify-between mb-3">
                    <span style={{ color: TEXT_MAIN, fontSize: 13, fontWeight: 700 }}>出生人口×AI（万人）</span>
                    <span style={{ color: TEXT_MUTED, fontSize: 11 }}>1949—2025</span>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={chartData} margin={{ top: 16, right: 5, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="birthGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={ACCENT} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={ACCENT} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                      <XAxis
                        dataKey="year"
                        ticks={xTicks}
                        tick={{ fill: TEXT_MUTED, fontSize: 10 }}
                        axisLine={{ stroke: BORDER }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: TEXT_MUTED, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        domain={[0, 3200]}
                        ticks={[0, 500, 1000, 1500, 2000, 2500, 3000]}
                      />
                      <Tooltip content={<NationalTooltip />} />
                      {KEY_EVENTS.map(ev => (
                        <ReferenceLine
                          key={ev.year}
                          x={ev.year}
                          stroke={GOLD_LINE}
                          strokeDasharray="4 3"
                          strokeWidth={1.5}
                          label={{ value: ev.label, position: ev.position, fill: GOLD_LINE, fontSize: 9, fontWeight: 600 }}
                        />
                      ))}
                      <Area
                        type="monotone"
                        dataKey="births"
                        stroke={ACCENT}
                        strokeWidth={2}
                        fill="url(#birthGrad)"
                        dot={false}
                        activeDot={{ r: 4, fill: ACCENT }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* 关键节点说明 */}
                <div className="mt-3 rounded-xl p-3" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                  <div style={{ color: TEXT_SUB, fontSize: 11, fontWeight: 600, marginBottom: 6 }}>关键政策节点</div>
                  <div className="space-y-1.5">
                    {[
                      { year: '1963', desc: '历史峰值 2934 万，天灾后婴儿潮' },
                      { year: '1971', desc: '开始实行计划生育政策' },
                      { year: '1980', desc: '独生子女政策正式实施' },
                      { year: '2016', desc: '全面二孩政策，出生小幅反弹' },
                      { year: '2021', desc: '三孩政策，但效果有限' },
                      { year: '2025', desc: '792 万，历史新低' },
                    ].map(item => (
                      <div key={item.year} className="flex items-start gap-2">
                        <span className="text-xs font-bold shrink-0 mt-0.5" style={{ color: GOLD_LINE, minWidth: 32 }}>{item.year}</span>
                        <span style={{ color: TEXT_SUB, fontSize: 11 }}>{item.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* 年度数据进度条列表（参照 TradingCostBar 格式） */}
                {(() => {
                  const maxBirths = Math.max(...chartData.map(d => d.births));
                  const sortedDesc = [...chartData].reverse();
                  // 行高常量（与 TradingCostBar 一致）
                  const ROW_H = 14;
                  const BAR_H = 11;
                  const LABEL_W = 32;
                  return (
                    <div className="mt-3 rounded-xl overflow-hidden px-3 py-2" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                      <p className="text-xs font-medium mb-2" style={{ color: TEXT_SUB }}>历年出生人口（万人）</p>
                      {/* 图例 */}
                      <div className="flex gap-3 mb-2">
                        <span className="flex items-center gap-1" style={{ fontSize: 10, color: TEXT_MUTED }}>
                          <span style={{ display: 'inline-block', width: 12, height: 8, borderRadius: 2, background: GOLD_LINE }} />历史峰値
                        </span>
                        <span className="flex items-center gap-1" style={{ fontSize: 10, color: TEXT_MUTED }}>
                          <span style={{ display: 'inline-block', width: 12, height: 8, borderRadius: 2, background: ACCENT2 }} />出生减少
                        </span>
                        <span className="flex items-center gap-1" style={{ fontSize: 10, color: TEXT_MUTED }}>
                          <span style={{ display: 'inline-block', width: 12, height: 8, borderRadius: 2, background: ACCENT }} />出生增加
                        </span>
                      </div>
                      {/* 数据行 */}
                      {sortedDesc.map((row, idx, arr) => {
                        const prev = arr[idx + 1];
                        const pct  = prev ? ((row.births - prev.births) / prev.births * 100) : null;
                        const isDown = pct !== null && pct < 0;
                        const isPeak = row.births === maxBirths;
                        const barPct = (row.births / maxBirths) * 100;
                        const barColor = isPeak
                          ? `linear-gradient(90deg, ${GOLD_LINE} 0%, #f59e0b 100%)`
                          : isDown
                            ? `linear-gradient(90deg, ${ACCENT2} 0%, #f87171 100%)`
                            : `linear-gradient(90deg, ${ACCENT} 0%, #60a5fa 100%)`;
                        const numLabel = `${row.births.toLocaleString()}万`;
                        const pctLabel = pct !== null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '';
                        return (
                          <div key={row.year} className="flex items-center" style={{ height: ROW_H, marginBottom: 0 }}>
                            {/* 年份标签 */}
                            <div
                              className="flex-shrink-0 text-right pr-1.5"
                              style={{
                                width: LABEL_W,
                                fontSize: 9,
                                color: isPeak ? GOLD_LINE : TEXT_MUTED,
                                fontWeight: isPeak ? 700 : 400,
                                lineHeight: `${ROW_H}px`,
                              }}
                            >
                              {row.year}
                            </div>
                            {/* 条形轨道 */}
                            <div
                              className="relative flex-1"
                              style={{ height: BAR_H, borderRadius: 2, background: '#E8E0D8' }}
                            >
                              {/* 动效条形 */}
                              <div
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  height: '100%',
                                  width: `${Math.max(barPct, 0.5)}%`,
                                  background: barColor,
                                  borderRadius: '2px 3px 3px 2px',
                                  transition: `width 0.75s cubic-bezier(0.4,0,0.2,1) ${idx * 12}ms`,
                                  boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)',
                                }}
                              />
                              {/* 数值标签：条形内显示（宽度足够）或条形外显示 */}
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  ...(barPct >= 20
                                    ? { right: `${100 - Math.max(barPct, 0.5)}%`, paddingRight: 3, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }
                                    : { left: `${Math.max(barPct, 0.5)}%`, paddingLeft: 3, color: TEXT_MAIN }
                                  ),
                                  fontSize: 8,
                                  fontWeight: barPct >= 20 ? 700 : 600,
                                  lineHeight: 1,
                                  whiteSpace: 'nowrap',
                                  fontVariantNumeric: 'tabular-nums',
                                  pointerEvents: 'none',
                                }}
                              >
                                {numLabel}
                              </div>
                            </div>
                            {/* 变化率：条形右侧外显示 */}
                            {pctLabel && (
                              <div
                                className="flex-shrink-0 pl-1.5"
                                style={{
                                  fontSize: 8,
                                  color: isDown ? ACCENT2 : (pct !== null && pct > 0) ? '#16a34a' : TEXT_MUTED,
                                  fontWeight: 600,
                                  lineHeight: `${ROW_H}px`,
                                  width: 38,
                                  textAlign: 'right',
                                }}
                              >
                                {pctLabel}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* 分省排行 */}
            {activeTab === 'provincial' && (
              <div>
                <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
                  {[2010, 2012, 2014, 2016, 2017, 2018, 2019].map(y => (
                    <button
                      key={y}
                      onClick={() => setSelectedYear(y)}
                      className="shrink-0 px-3 py-1 rounded-lg text-xs font-semibold"
                      style={{
                        background: selectedYear === y ? ACCENT : BG_WHITE,
                        color: selectedYear === y ? '#fff' : TEXT_SUB,
                        border: `1px solid ${selectedYear === y ? ACCENT : BORDER}`,
                      }}
                    >
                      {y}年
                    </button>
                  ))}
                </div>

                <div className="rounded-xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                  <div className="flex items-center justify-between mb-3">
                    <span style={{ color: TEXT_MAIN, fontSize: 13, fontWeight: 700 }}>分省出生率×AI（‰）</span>
                    <span style={{ color: TEXT_MUTED, fontSize: 11 }}>{selectedYear}年</span>
                  </div>
                  <ResponsiveContainer width="100%" height={500}>
                    <BarChart
                      data={provincialRanking}
                      layout="vertical"
                      margin={{ top: 0, right: 30, left: 30, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fill: TEXT_MUTED, fontSize: 9 }}
                        axisLine={{ stroke: BORDER }}
                        tickLine={false}
                        domain={[0, 20]}
                      />
                      <YAxis
                        type="category"
                        dataKey="province"
                        tick={{ fill: TEXT_SUB, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                      />
                      <Tooltip content={<BarTooltip />} />
                      <Bar dataKey="rate" name="出生率" radius={[0, 3, 3, 0]}>
                        {provincialRanking.map((entry, index) => (
                          <Cell
                            key={entry.province}
                            fill={index < 5 ? ACCENT2 : index < 10 ? '#f97316' : index > 25 ? ACCENT : '#10b981'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-2 rounded-xl p-3" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                  <div style={{ color: TEXT_MUTED, fontSize: 11 }}>
                    数据来源：国家统计局（2010-2019年）。出生率 = 当年出生人口 / 年末总人口 × 1000‰。
                    西藏、广西、贵州、海南等省份出生率持续偏高；东北三省出生率最低。
                  </div>
                </div>
              </div>
            )}

            {/* 性别比例 */}
            {activeTab === 'gender' && genderData && (
              <div>
                <div className="rounded-xl p-4 mb-3" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                  <div style={{ color: TEXT_SUB, fontSize: 12, fontWeight: 600, marginBottom: 8 }}>全国总体（七普 2020年）</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <div style={{ color: MALE_COLOR, fontSize: 20, fontWeight: 800 }}>{genderData.national.malePct}%</div>
                      <div style={{ color: TEXT_MUTED, fontSize: 10 }}>男性占比</div>
                    </div>
                    <div className="text-center">
                      <div style={{ color: TEXT_MAIN, fontSize: 20, fontWeight: 800 }}>{genderData.national.sexRatio}</div>
                      <div style={{ color: TEXT_MUTED, fontSize: 10 }}>性别比</div>
                      <div style={{ color: TEXT_MUTED, fontSize: 9 }}>（女=100）</div>
                    </div>
                    <div className="text-center">
                      <div style={{ color: FEMALE_COLOR, fontSize: 20, fontWeight: 800 }}>{genderData.national.femalePct}%</div>
                      <div style={{ color: TEXT_MUTED, fontSize: 10 }}>女性占比</div>
                    </div>
                  </div>
                  <div className="mt-3 h-3 rounded-full overflow-hidden flex">
                    <div style={{ width: `${genderData.national.malePct}%`, background: MALE_COLOR }} />
                    <div style={{ width: `${genderData.national.femalePct}%`, background: FEMALE_COLOR }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span style={{ color: MALE_COLOR, fontSize: 10 }}>男 {genderData.national.malePct}%</span>
                    <span style={{ color: FEMALE_COLOR, fontSize: 10 }}>女 {genderData.national.femalePct}%</span>
                  </div>
                </div>

                <div className="rounded-xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                  <div className="flex items-center justify-between mb-3">
                    <span style={{ color: TEXT_MAIN, fontSize: 13, fontWeight: 700 }}>分省性别比×AI</span>
                    <span style={{ color: TEXT_MUTED, fontSize: 11 }}>七普 2020年</span>
                  </div>
                  <div className="space-y-2">
                    {genderData.data.map((item, index) => (
                      <div key={item.province} className="flex items-center gap-2">
                        <span
                          className="text-xs font-bold w-5 text-center shrink-0"
                          style={{ color: index < 3 ? GOLD_LINE : TEXT_MUTED }}
                        >
                          {index + 1}
                        </span>
                        <span style={{ color: TEXT_MAIN, fontSize: 12, minWidth: 36 }}>{item.province}</span>
                        <div className="flex-1 h-4 rounded overflow-hidden flex">
                          <div style={{ width: `${item.malePct}%`, background: MALE_COLOR, opacity: 0.8 }} />
                          <div style={{ width: `${item.femalePct}%`, background: FEMALE_COLOR, opacity: 0.8 }} />
                        </div>
                        <span
                          style={{
                            color: item.sexRatio > 110 ? ACCENT2 : item.sexRatio > 105 ? '#d97706' : TEXT_SUB,
                            fontSize: 11,
                            fontWeight: 700,
                            minWidth: 38,
                            textAlign: 'right',
                          }}
                        >
                          {item.sexRatio.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded" style={{ background: MALE_COLOR }} />
                      <span style={{ color: TEXT_MUTED, fontSize: 10 }}>男性</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded" style={{ background: FEMALE_COLOR }} />
                      <span style={{ color: TEXT_MUTED, fontSize: 10 }}>女性</span>
                    </div>
                    <span style={{ color: TEXT_MUTED, fontSize: 10 }}>右侧数字为性别比（女=100）</span>
                  </div>
                </div>

                <div className="mt-2 rounded-xl p-3" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                  <div style={{ color: TEXT_MUTED, fontSize: 11 }}>
                    数据来源：第七次全国人口普查（2020年）。广东（113.1）、海南（112.9）性别比最高；
                    辽宁（99.7）、吉林（99.7）性别比低于100，女性略多于男性。
                  </div>
                </div>
              </div>
            )}
            {/* AI 预测 */}
            {activeTab === 'prediction' && (
              <div>
                {/* AI 标识卡片 */}
                <div className="rounded-xl p-4 mb-3" style={{ background: 'linear-gradient(135deg, #1a56db 0%, #1e40af 100%)', border: 'none' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}>
                      <span style={{ fontSize: 12, color: '#fff', fontWeight: 800 }}>AI</span>
                    </div>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>AI人口预测×17变量模型</span>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, lineHeight: 1.6 }}>
                    基于队列-组分模型，综合17个变量（人口学基础70% + 社会经济23% + 政策外部7%）测算中国2026-2035年出生人口趋势。
                  </div>
                  <div className="flex gap-2 mt-3">
                    <div className="flex items-center gap-1 px-2 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }}>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.9)' }}>点击每行查看详细分析</span>
                    </div>
                  </div>
                </div>

                {/* 图例 */}
                <div className="flex gap-3 mb-2 px-1">
                  <span className="flex items-center gap-1" style={{ fontSize: 10, color: TEXT_MUTED }}>
                    <span style={{ display: 'inline-block', width: 12, height: 8, borderRadius: 2, background: ACCENT }} />基准预测
                  </span>
                  <span className="flex items-center gap-1" style={{ fontSize: 10, color: TEXT_MUTED }}>
                    <span style={{ display: 'inline-block', width: 12, height: 8, borderRadius: 2, background: '#16a34a' }} />乐观情景
                  </span>
                  <span className="flex items-center gap-1" style={{ fontSize: 10, color: TEXT_MUTED }}>
                    <span style={{ display: 'inline-block', width: 12, height: 8, borderRadius: 2, background: ACCENT2 }} />悲观情景
                  </span>
                </div>

                {/* 预测进度条列表 */}
                {(() => {
                  const maxVal = Math.max(...AI_PREDICTION_DATA.map(d => d.optimistic));
                  const ROW_H = 14;
                  const BAR_H = 11;
                  const LABEL_W = 32;
                  return (
                    <div className="rounded-xl overflow-hidden px-3 py-2" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                      {AI_PREDICTION_DATA.map((row, idx) => {
                        const barPct = (row.births / maxVal) * 100;
                        const numLabel = `${row.births}万`;
                        return (
                          <div
                            key={row.year}
                            className="flex items-center cursor-pointer hover:bg-blue-50 rounded transition-colors"
                            style={{ height: ROW_H, marginBottom: 0 }}
                            onClick={() => setPredictionModal(row)}
                          >
                            {/* 年份标签 */}
                            <div
                              className="flex-shrink-0 text-right pr-1.5"
                              style={{
                                width: LABEL_W,
                                fontSize: 9,
                                color: ACCENT,
                                fontWeight: 700,
                                lineHeight: `${ROW_H}px`,
                              }}
                            >
                              {row.year}
                            </div>
                            {/* 条形轨道 */}
                            <div
                              className="relative flex-1"
                              style={{ height: BAR_H, borderRadius: 2, background: '#E8E0D8' }}
                            >
                              {/* 基准条形 */}
                              <div
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  height: '100%',
                                  width: `${Math.max(barPct, 0.5)}%`,
                                  background: `linear-gradient(90deg, ${ACCENT} 0%, #60a5fa 100%)`,
                                  borderRadius: '2px 3px 3px 2px',
                                  transition: `width 0.75s cubic-bezier(0.4,0,0.2,1) ${idx * 60}ms`,
                                  boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)',
                                }}
                              />
                              {/* 数值标签 */}
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '50%',
                                  transform: 'translateY(-50%)',
                                  ...(barPct >= 20
                                    ? { right: `${100 - Math.max(barPct, 0.5)}%`, paddingRight: 3, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }
                                    : { left: `${Math.max(barPct, 0.5)}%`, paddingLeft: 3, color: TEXT_MAIN }
                                  ),
                                  fontSize: 8,
                                  fontWeight: 700,
                                  lineHeight: 1,
                                  whiteSpace: 'nowrap',
                                  fontVariantNumeric: 'tabular-nums',
                                  pointerEvents: 'none',
                                }}
                              >
                                {numLabel}
                              </div>
                            </div>
                            {/* 置信度 */}
                            <div
                              className="flex-shrink-0 pl-1.5"
                              style={{
                                fontSize: 8,
                                color: TEXT_MUTED,
                                fontWeight: 600,
                                lineHeight: `${ROW_H}px`,
                                width: 38,
                                textAlign: 'right',
                              }}
                            >
                              {row.confidence}%
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* 变量权重说明 */}
                <div className="mt-3 rounded-xl p-3" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                  <div style={{ color: TEXT_MAIN, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>17变量权重体系</div>
                  {[1, 2, 3].map(layer => (
                    <div key={layer} className="mb-2">
                      <div style={{ color: TEXT_SUB, fontSize: 10, fontWeight: 600, marginBottom: 4 }}>
                        {layer === 1 ? '第一层：人口学基础（70%）' : layer === 2 ? '第二层：社会经济（23%）' : '第三层：政策与外部（7%）'}
                      </div>
                      {AI_DIMENSIONS.filter(d => d.layer === layer).map((dim, i) => (
                        <div key={i} className="flex items-center gap-2 mb-1">
                          <div
                            className="flex-1 h-2 rounded overflow-hidden"
                            style={{ background: '#E8E0D8' }}
                          >
                            <div
                              style={{
                                height: '100%',
                                width: `${(dim.weight / 35) * 100}%`,
                                background: layer === 1 ? ACCENT : layer === 2 ? '#16a34a' : '#d97706',
                                borderRadius: 2,
                              }}
                            />
                          </div>
                          <span style={{ color: TEXT_MUTED, fontSize: 9, minWidth: 28, textAlign: 'right' }}>{dim.weight}%</span>
                          <span style={{ color: TEXT_SUB, fontSize: 9, flex: 2 }}>{dim.name}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </>
      )}

      {/* AI 预测详情弹出框 */}
      {predictionModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setPredictionModal(null)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl p-5 pb-8"
            style={{ background: '#fff', maxHeight: '80vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            {/* 弹框标题 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: ACCENT }}>
                  <span style={{ fontSize: 11, color: '#fff', fontWeight: 800 }}>AI</span>
                </div>
                <div>
                  <div style={{ color: TEXT_MAIN, fontSize: 15, fontWeight: 800 }}>{predictionModal.year}年 出生人口预测</div>
                  <div style={{ color: TEXT_MUTED, fontSize: 11 }}>AI × 17变量模型测算</div>
                </div>
              </div>
              <button
                onClick={() => setPredictionModal(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: BG_SUBTLE, color: TEXT_SUB, fontSize: 16 }}
              >×</button>
            </div>

            {/* 三情景数据 */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="rounded-xl p-3 text-center" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <div style={{ color: '#1d4ed8', fontSize: 10, fontWeight: 600 }}>基准预测</div>
                <div style={{ color: '#1d4ed8', fontSize: 22, fontWeight: 800 }}>{predictionModal.births}</div>
                <div style={{ color: '#93c5fd', fontSize: 10 }}>万人</div>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div style={{ color: '#15803d', fontSize: 10, fontWeight: 600 }}>乐观情景</div>
                <div style={{ color: '#15803d', fontSize: 22, fontWeight: 800 }}>{predictionModal.optimistic}</div>
                <div style={{ color: '#86efac', fontSize: 10 }}>万人</div>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: '#fff1f2', border: '1px solid #fecdd3' }}>
                <div style={{ color: '#be123c', fontSize: 10, fontWeight: 600 }}>悲观情景</div>
                <div style={{ color: '#be123c', fontSize: 22, fontWeight: 800 }}>{predictionModal.pessimistic}</div>
                <div style={{ color: '#fda4af', fontSize: 10 }}>万人</div>
              </div>
            </div>

            {/* 置信度 */}
            <div className="flex items-center gap-3 mb-4 p-3 rounded-xl" style={{ background: BG_SUBTLE }}>
              <span style={{ color: TEXT_SUB, fontSize: 12 }}>AI置信度</span>
              <div className="flex-1 h-2 rounded overflow-hidden" style={{ background: '#E8E0D8' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${predictionModal.confidence}%`,
                    background: `linear-gradient(90deg, ${ACCENT} 0%, #60a5fa 100%)`,
                    borderRadius: 2,
                  }}
                />
              </div>
              <span style={{ color: ACCENT, fontSize: 13, fontWeight: 700 }}>{predictionModal.confidence}%</span>
            </div>

            {/* 核心驱动因素 */}
            <div className="mb-4 p-3 rounded-xl" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
              <div style={{ color: '#92400e', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>核心驱动因素</div>
              <div style={{ color: '#78350f', fontSize: 12, lineHeight: 1.6 }}>{predictionModal.keyFactor}</div>
            </div>

            {/* 预测方法说明 */}
            <div className="p-3 rounded-xl" style={{ background: BG_SUBTLE }}>
              <div style={{ color: TEXT_MAIN, fontSize: 11, fontWeight: 700, marginBottom: 6 }}>预测方法说明</div>
              <div style={{ color: TEXT_SUB, fontSize: 11, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                {AI_METHODOLOGY.replace(/##\s*/g, '').replace(/\*\*/g, '').replace(/^###\s*/gm, '').trim()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
