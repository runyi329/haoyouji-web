/**
 * 社保×AI 宏观数据页面
 * 路由：/social-security
 * 展示：社保基金规模、收支、结余趋势及 AI 预测
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Shield, X, Info } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ── 颜色系统 ──
const BG_PAGE    = "#f5f6f8";
const BG_WHITE   = "#ffffff";
const BORDER     = "#e4e7ed";
const TEXT_MAIN  = "#1a1a2e";
const TEXT_SUB   = "#6b7280";
const TEXT_MUTED = "#9ca3af";
const ACCENT     = "#1a56db";
const AI_COLOR   = "#7c3aed";
const ACCENT2    = "#e53935";
const GREEN      = "#16a34a";
const GOLD_LINE  = "#d97706";
const BG_SUBTLE  = "#f0f2f5";

type TabType = 'fund' | 'income' | 'pension' | 'prediction';

// ── 社保基金累计结余数据（亿元）──
const FUND_DATA = [
  { year: 2000, balance: 2337 },
  { year: 2001, balance: 2841 },
  { year: 2002, balance: 3342 },
  { year: 2003, balance: 4187 },
  { year: 2004, balance: 5571 },
  { year: 2005, balance: 7025 },
  { year: 2006, balance: 9014 },
  { year: 2007, balance: 12187 },
  { year: 2008, balance: 14454 },
  { year: 2009, balance: 17288 },
  { year: 2010, balance: 21755 },
  { year: 2011, balance: 27526 },
  { year: 2012, balance: 33473 },
  { year: 2013, balance: 40188 },
  { year: 2014, balance: 47170 },
  { year: 2015, balance: 52741 },
  { year: 2016, balance: 57892 },
  { year: 2017, balance: 64934 },
  { year: 2018, balance: 70892 },
  { year: 2019, balance: 77453 },
  { year: 2020, balance: 82461 },
  { year: 2021, balance: 92800 },
  { year: 2022, balance: 98400 },
  { year: 2023, balance: 104200 },
  { year: 2024, balance: 109800 },
];

// ── 社保收支数据（亿元）──
const INCOME_DATA = [
  { year: 2015, income: 44394, expense: 38988, surplus: 5406 },
  { year: 2016, income: 48791, expense: 44867, surplus: 3924 },
  { year: 2017, income: 54718, expense: 50476, surplus: 4242 },
  { year: 2018, income: 60260, expense: 55622, surplus: 4638 },
  { year: 2019, income: 63952, expense: 60445, surplus: 3507 },
  { year: 2020, income: 61666, expense: 61663, surplus: 3 },
  { year: 2021, income: 71576, expense: 65886, surplus: 5690 },
  { year: 2022, income: 72819, expense: 70832, surplus: 1987 },
  { year: 2023, income: 78344, expense: 74826, surplus: 3518 },
  { year: 2024, income: 82100, expense: 78600, surplus: 3500 },
];

// ── 养老保险参保人数（万人）──
const PENSION_DATA = [
  { year: 2010, urban: 25707, rural: 10277, total: 35984 },
  { year: 2011, urban: 28391, rural: 32643, total: 61034 },
  { year: 2012, urban: 30427, rural: 46268, total: 76695 },
  { year: 2013, urban: 32218, rural: 49750, total: 81968 },
  { year: 2014, urban: 34124, rural: 50107, total: 84231 },
  { year: 2015, urban: 35361, rural: 50472, total: 85833 },
  { year: 2016, urban: 37930, rural: 50847, total: 88777 },
  { year: 2017, urban: 40293, rural: 51255, total: 91548 },
  { year: 2018, urban: 41848, rural: 52392, total: 94240 },
  { year: 2019, urban: 43492, rural: 53267, total: 96759 },
  { year: 2020, urban: 45642, rural: 54236, total: 99878 },
  { year: 2021, urban: 48074, rural: 54797, total: 102871 },
  { year: 2022, urban: 50345, rural: 55249, total: 105594 },
  { year: 2023, urban: 52161, rural: 55682, total: 107843 },
  { year: 2024, urban: 53800, rural: 55900, total: 109700 },
];

// ── AI 预测数据（2025-2034）──
const AI_PREDICTION = [
  { year: 2025, optimistic: 116800, base: 113200, pessimistic: 108500, confidence: 88 },
  { year: 2026, optimistic: 123500, base: 118100, pessimistic: 111200, confidence: 85 },
  { year: 2027, optimistic: 129800, base: 122400, pessimistic: 113100, confidence: 82 },
  { year: 2028, optimistic: 135200, base: 125900, pessimistic: 114200, confidence: 79 },
  { year: 2029, optimistic: 139800, base: 128600, pessimistic: 114500, confidence: 76 },
  { year: 2030, optimistic: 143200, base: 130200, pessimistic: 113800, confidence: 73 },
  { year: 2031, optimistic: 145800, base: 130800, pessimistic: 112200, confidence: 70 },
  { year: 2032, optimistic: 147100, base: 130200, pessimistic: 109800, confidence: 67 },
  { year: 2033, optimistic: 147500, base: 128800, pessimistic: 106500, confidence: 64 },
  { year: 2034, optimistic: 146800, base: 126500, pessimistic: 102300, confidence: 61 },
];

// 进度条最大值
const FUND_MAX = Math.max(...FUND_DATA.map(d => d.balance));
const INCOME_MAX = Math.max(...INCOME_DATA.map(d => d.income));
const PENSION_MAX = Math.max(...PENSION_DATA.map(d => d.total));
const PRED_MAX = Math.max(...AI_PREDICTION.map(d => d.optimistic));

function fmt(n: number) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万亿';
  return n.toLocaleString() + '亿';
}
function fmtW(n: number) {
  if (n >= 10000) return (n / 10000).toFixed(2) + '亿';
  return n.toLocaleString() + '万';
}

export default function SocialSecurityPage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('fund');
  const [predModal, setPredModal] = useState<typeof AI_PREDICTION[0] | null>(null);

  const TABS = [
    { key: 'fund' as TabType,       label: '基金×AI' },
    { key: 'income' as TabType,     label: '收支×AI' },
    { key: 'pension' as TabType,    label: '参保×AI' },
    { key: 'prediction' as TabType, label: 'AI预测' },
  ];

  // 最新数据摘要
  const latestFund = FUND_DATA[FUND_DATA.length - 1];
  const prevFund   = FUND_DATA[FUND_DATA.length - 2];
  const latestIncome = INCOME_DATA[INCOME_DATA.length - 1];
  const latestPension = PENSION_DATA[PENSION_DATA.length - 1];

  return (
    <div className="min-h-screen pb-10 max-w-md mx-auto relative" style={{ background: BG_PAGE, color: TEXT_MAIN }}>
      {/* ── 顶部导航 ── */}
      <div className="sticky top-0 z-20 flex items-center px-4 py-3" style={{ background: '#fff', borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={() => navigate("/smart-finance")} className="flex items-center justify-center w-8 h-8 rounded-full mr-3" style={{ background: BG_SUBTLE }}>
          <ChevronLeft className="w-5 h-5" style={{ color: TEXT_MAIN }} />
        </button>
        <div className="flex items-center gap-1 flex-1">
          <span className="text-base font-bold" style={{ color: TEXT_MAIN }}>社保</span>
          <span className="text-base font-bold" style={{ color: GREEN }}>×</span>
          <span className="text-base font-bold" style={{ color: AI_COLOR }}>AI</span>
        </div>
        <button onClick={() => window.location.reload()} className="flex items-center justify-center px-3 h-7 rounded-full text-xs font-semibold" style={{ background: BG_SUBTLE, color: TEXT_SUB }}>
          刷新
        </button>
      </div>

      {/* ── 数据摘要卡片 ── */}
      <div className="px-4 pt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl p-3 text-center" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
          <div style={{ color: TEXT_MUTED, fontSize: 10 }}>2024年结余</div>
          <div style={{ color: GREEN, fontSize: 16, fontWeight: 800 }}>10.98万亿</div>
          <div style={{ color: TEXT_MUTED, fontSize: 10 }}>亿元</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
          <div style={{ color: TEXT_MUTED, fontSize: 10 }}>2024年收入</div>
          <div style={{ color: ACCENT, fontSize: 16, fontWeight: 800 }}>8.21万亿</div>
          <div style={{ color: TEXT_MUTED, fontSize: 10 }}>亿元</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
          <div style={{ color: TEXT_MUTED, fontSize: 10 }}>参保人数</div>
          <div style={{ color: GOLD_LINE, fontSize: 16, fontWeight: 800 }}>10.97亿</div>
          <div style={{ color: TEXT_MUTED, fontSize: 10 }}>人</div>
        </div>
      </div>

      {/* ── Tab 切换 ── */}
      <div className="px-4 mt-4">
        <div className="flex rounded-xl overflow-hidden" style={{ background: BG_SUBTLE, padding: 3, gap: 2 }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: activeTab === tab.key ? BG_WHITE : 'transparent',
                color: activeTab === tab.key ? (tab.key === 'prediction' ? AI_COLOR : TEXT_MAIN) : TEXT_MUTED,
                boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        {/* ── Tab: 基金结余 ── */}
        {activeTab === 'fund' && (
          <>
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 12 }}>社保基金累计结余趋势（亿元）</div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={FUND_DATA} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fundGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={GREEN} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={GREEN} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    ticks={FUND_DATA.filter(d => d.year % 5 === 0).map(d => d.year)} />
                  <YAxis tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    tickFormatter={v => v >= 10000 ? (v/10000).toFixed(0)+'万亿' : v/1000+'千亿'} />
                  <Tooltip
                    contentStyle={{ background: BG_WHITE, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number) => [fmt(v), '累计结余']}
                    labelFormatter={l => `${l}年`}
                  />
                  <Area type="monotone" dataKey="balance" stroke={GREEN} strokeWidth={2} fill="url(#fundGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* 年度结余进度条 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 10 }}>年度累计结余（亿元）</div>
              <div className="space-y-1.5">
                {[...FUND_DATA].reverse().map(d => {
                  const pct = (d.balance / FUND_MAX) * 100;
                  const isLatest = d.year === latestFund.year;
                  const yoy = FUND_DATA.find(x => x.year === d.year - 1);
                  const change = yoy ? d.balance - yoy.balance : null;
                  return (
                    <div key={d.year} className="flex items-center gap-2" style={{ minHeight: 18 }}>
                      <span style={{ width: 32, fontSize: 10, color: isLatest ? GREEN : TEXT_MUTED, fontWeight: isLatest ? 700 : 400, flexShrink: 0, textAlign: 'right' }}>{d.year}</span>
                      <div className="flex-1 relative" style={{ height: 14, background: '#f0f4f0', borderRadius: 3, overflow: 'visible' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: isLatest ? GREEN : '#86efac', borderRadius: 3, transition: 'width 0.6s ease' }} />
                        <span style={{ position: 'absolute', left: `${Math.min(pct + 1, 55)}%`, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: TEXT_MAIN, whiteSpace: 'nowrap', fontWeight: isLatest ? 700 : 400 }}>
                          {fmt(d.balance)}
                        </span>
                      </div>
                      {change !== null && (
                        <span style={{ width: 44, fontSize: 9, color: change >= 0 ? GREEN : ACCENT2, textAlign: 'right', flexShrink: 0 }}>
                          {change >= 0 ? '+' : ''}{fmt(change)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ── Tab: 收支 ── */}
        {activeTab === 'income' && (
          <>
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 12 }}>社保收入 vs 支出（亿元）</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={INCOME_DATA} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    tickFormatter={v => (v/10000).toFixed(1)+'万亿'} />
                  <Tooltip
                    contentStyle={{ background: BG_WHITE, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number, name: string) => [fmt(v), name === 'income' ? '收入' : name === 'expense' ? '支出' : '结余']}
                    labelFormatter={l => `${l}年`}
                  />
                  <Bar dataKey="income" name="income" fill={ACCENT} radius={[2,2,0,0]} maxBarSize={20} />
                  <Bar dataKey="expense" name="expense" fill={ACCENT2} radius={[2,2,0,0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 收支明细列表 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 10 }}>年度收支明细</div>
              <div className="space-y-2">
                {[...INCOME_DATA].reverse().map(d => {
                  const isLatest = d.year === latestIncome.year;
                  const surplusRate = ((d.surplus / d.income) * 100).toFixed(1);
                  return (
                    <div key={d.year} className="rounded-xl p-3" style={{ background: isLatest ? '#f0fdf4' : BG_PAGE, border: `1px solid ${isLatest ? '#bbf7d0' : BORDER}` }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span style={{ fontSize: 11, fontWeight: 700, color: isLatest ? GREEN : TEXT_MAIN }}>{d.year}年</span>
                        <span style={{ fontSize: 10, color: d.surplus > 0 ? GREEN : ACCENT2, fontWeight: 600 }}>
                          结余 {fmt(d.surplus)} ({surplusRate}%)
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <div style={{ fontSize: 9, color: TEXT_MUTED }}>收入</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>{fmt(d.income)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: TEXT_MUTED }}>支出</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT2 }}>{fmt(d.expense)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ── Tab: 参保人数 ── */}
        {activeTab === 'pension' && (
          <>
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 12 }}>养老保险参保人数（万人）</div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={PENSION_DATA} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="urbanGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={ACCENT} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={ACCENT} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="ruralGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={GREEN} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={GREEN} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    tickFormatter={v => (v/10000).toFixed(1)+'亿'} />
                  <Tooltip
                    contentStyle={{ background: BG_WHITE, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number, name: string) => [fmtW(v), name === 'urban' ? '城镇' : name === 'rural' ? '农村' : '合计']}
                    labelFormatter={l => `${l}年`}
                  />
                  <Area type="monotone" dataKey="urban" name="urban" stroke={ACCENT} strokeWidth={2} fill="url(#urbanGrad)" dot={false} />
                  <Area type="monotone" dataKey="rural" name="rural" stroke={GREEN} strokeWidth={2} fill="url(#ruralGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 justify-center">
                <div className="flex items-center gap-1"><div style={{ width: 10, height: 3, background: ACCENT, borderRadius: 2 }} /><span style={{ fontSize: 9, color: TEXT_MUTED }}>城镇职工</span></div>
                <div className="flex items-center gap-1"><div style={{ width: 10, height: 3, background: GREEN, borderRadius: 2 }} /><span style={{ fontSize: 9, color: TEXT_MUTED }}>城乡居民</span></div>
              </div>
            </div>

            {/* 参保进度条 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 10 }}>年度参保总人数（万人）</div>
              <div className="space-y-1.5">
                {[...PENSION_DATA].reverse().map(d => {
                  const pct = (d.total / PENSION_MAX) * 100;
                  const isLatest = d.year === latestPension.year;
                  return (
                    <div key={d.year} className="flex items-center gap-2" style={{ minHeight: 18 }}>
                      <span style={{ width: 32, fontSize: 10, color: isLatest ? ACCENT : TEXT_MUTED, fontWeight: isLatest ? 700 : 400, flexShrink: 0, textAlign: 'right' }}>{d.year}</span>
                      <div className="flex-1 relative" style={{ height: 14, background: BG_SUBTLE, borderRadius: 3, overflow: 'visible' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: isLatest ? ACCENT : '#93c5fd', borderRadius: 3, transition: 'width 0.6s ease' }} />
                        <span style={{ position: 'absolute', left: `${Math.min(pct + 1, 50)}%`, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: TEXT_MAIN, whiteSpace: 'nowrap', fontWeight: isLatest ? 700 : 400 }}>
                          {fmtW(d.total)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ── Tab: AI 预测 ── */}
        {activeTab === 'prediction' && (
          <>
            {/* AI 预测说明 */}
            <div className="rounded-2xl p-4" style={{ background: `${AI_COLOR}08`, border: `1px solid ${AI_COLOR}30` }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: AI_COLOR }}>
                  <Info className="w-3.5 h-3.5 text-white" />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: AI_COLOR }}>AI 预测模型说明</span>
              </div>
              <p style={{ fontSize: 11, color: TEXT_SUB, lineHeight: 1.7 }}>
                基于 <strong>15项核心变量</strong> 构建社保基金结余预测模型，包含：人口老龄化速度、劳动力参与率、GDP增速、缴费基数增长率、退休人员增速、财政补贴力度、投资收益率等关键指标，预测 2025-2034 年社保基金累计结余规模。
              </p>
            </div>

            {/* 三情景折线图 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 4 }}>2025-2034 年结余预测（亿元）</div>
              <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 10 }}>三情景预测：乐观 / 基准 / 悲观</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={AI_PREDICTION} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    tickFormatter={v => (v/10000).toFixed(1)+'万亿'} />
                  <Tooltip
                    contentStyle={{ background: BG_WHITE, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number, name: string) => [fmt(v), name === 'optimistic' ? '乐观' : name === 'base' ? '基准' : '悲观']}
                    labelFormatter={l => `${l}年`}
                  />
                  <Line type="monotone" dataKey="optimistic" name="optimistic" stroke={GREEN} strokeWidth={2} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="base" name="base" stroke={AI_COLOR} strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="pessimistic" name="pessimistic" stroke={ACCENT2} strokeWidth={2} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 justify-center">
                <div className="flex items-center gap-1"><div style={{ width: 10, height: 2, background: GREEN, borderRadius: 2 }} /><span style={{ fontSize: 9, color: TEXT_MUTED }}>乐观</span></div>
                <div className="flex items-center gap-1"><div style={{ width: 10, height: 2, background: AI_COLOR, borderRadius: 2 }} /><span style={{ fontSize: 9, color: TEXT_MUTED }}>基准</span></div>
                <div className="flex items-center gap-1"><div style={{ width: 10, height: 2, background: ACCENT2, borderRadius: 2 }} /><span style={{ fontSize: 9, color: TEXT_MUTED }}>悲观</span></div>
              </div>
            </div>

            {/* 逐年预测列表 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 10 }}>逐年预测详情（点击查看）</div>
              <div className="space-y-1.5">
                {AI_PREDICTION.map(d => {
                  const pct = (d.base / PRED_MAX) * 100;
                  return (
                    <div key={d.year} className="flex items-center gap-2 cursor-pointer" style={{ minHeight: 18 }} onClick={() => setPredModal(d)}>
                      <span style={{ width: 32, fontSize: 10, color: AI_COLOR, fontWeight: 700, flexShrink: 0, textAlign: 'right' }}>{d.year}</span>
                      <div className="flex-1 relative" style={{ height: 14, background: BG_SUBTLE, borderRadius: 3, overflow: 'visible' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: `${AI_COLOR}60`, borderRadius: 3, transition: 'width 0.6s ease' }} />
                        <span style={{ position: 'absolute', left: `${Math.min(pct + 1, 50)}%`, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: TEXT_MAIN, whiteSpace: 'nowrap', fontWeight: 600 }}>
                          {fmt(d.base)}
                        </span>
                      </div>
                      <span style={{ width: 28, fontSize: 9, color: TEXT_MUTED, textAlign: 'right', flexShrink: 0 }}>{d.confidence}%</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 9, color: TEXT_MUTED, marginTop: 8 }}>* 右侧数字为 AI 预测置信度</div>
            </div>

            {/* AI 核心判断 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 10 }}>AI 核心判断</div>
              {[
                { label: '短期（2025-2027）', color: GREEN, text: '财政补贴持续加大，基金结余仍将增长，但增速放缓至 3-5%/年。' },
                { label: '中期（2028-2031）', color: GOLD_LINE, text: '老龄化加速推进，退休人员快速增加，收支压力显著上升，结余增速趋近于零。' },
                { label: '长期（2032-2034）', color: ACCENT2, text: '悲观情景下结余可能触顶回落，需警惕养老金缺口风险，改革迫切性上升。' },
                { label: '关键变量', color: AI_COLOR, text: '延迟退休政策落地时间、生育率回升幅度、投资收益率是影响预测结果的三大核心变量。' },
              ].map((item, i) => (
                <div key={i} className="mb-3 last:mb-0">
                  <div style={{ fontSize: 11, fontWeight: 700, color: item.color, marginBottom: 3 }}>{item.label}</div>
                  <p style={{ fontSize: 11, color: TEXT_SUB, lineHeight: 1.6 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── 预测详情弹框 ── */}
      {predModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setPredModal(null)}>
          <div className="w-full max-w-md rounded-t-3xl p-5" style={{ background: BG_WHITE }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <span style={{ fontSize: 18, fontWeight: 800, color: AI_COLOR }}>{predModal.year}</span>
                <span style={{ fontSize: 13, color: TEXT_MUTED, marginLeft: 6 }}>年社保基金结余预测</span>
              </div>
              <button onClick={() => setPredModal(null)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: BG_SUBTLE }}>
                <X className="w-4 h-4" style={{ color: TEXT_MUTED }} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: '乐观情景', value: fmt(predModal.optimistic), color: GREEN },
                { label: '基准情景', value: fmt(predModal.base), color: AI_COLOR },
                { label: '悲观情景', value: fmt(predModal.pessimistic), color: ACCENT2 },
              ].map((s, i) => (
                <div key={i} className="rounded-xl p-3 text-center" style={{ background: BG_PAGE }}>
                  <div style={{ fontSize: 9, color: TEXT_MUTED, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span style={{ fontSize: 11, color: TEXT_MUTED }}>AI 预测置信度</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: AI_COLOR }}>{predModal.confidence}%</span>
              </div>
              <div style={{ height: 6, background: BG_SUBTLE, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${predModal.confidence}%`, height: '100%', background: AI_COLOR, borderRadius: 3 }} />
              </div>
            </div>

            <div style={{ fontSize: 10, color: TEXT_MUTED, lineHeight: 1.6 }}>
              基准情景假设：GDP增速 4.5%、缴费基数增长 5%、退休人员增速 3.2%、财政补贴维持现有力度、投资收益率 5.5%。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
