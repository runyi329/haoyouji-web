/**
 * 存款×AI 银行存贷款利率数据页面
 * 路由：/bank-rate
 * 四个 Tab：存款利率 / 贷款利率 / 利差×AI / AI预测
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, X, Info, RefreshCw } from "lucide-react";
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ── 颜色 ──
const BG_PAGE   = "#f5f6f8";
const BG_WHITE  = "#ffffff";
const BORDER    = "#e4e7ed";
const TEXT_MAIN = "#1a1a2e";
const TEXT_SUB  = "#6b7280";
const TEXT_MUTED = "#9ca3af";
const ACCENT    = "#1a56db";
const AI_COLOR  = "#7c3aed";
const GOLD      = "#d97706";
const GREEN     = "#16a34a";
const ACCENT2   = "#e53935";
const TEAL      = "#0891b2";
const BG_SUBTLE = "#f0f2f5";

type TabType = 'deposit' | 'loan' | 'spread' | 'prediction';

// ── 存款基准利率（央行官方，%）──
// 一年期定期存款利率（2004-2024）
const DEPOSIT_DATA = [
  { year: 2004, rate1y: 2.25, rate3y: 2.70, rate5y: 2.88 },
  { year: 2005, rate1y: 2.25, rate3y: 2.70, rate5y: 2.88 },
  { year: 2006, rate1y: 2.52, rate3y: 3.06, rate5y: 3.24 },
  { year: 2007, rate1y: 3.87, rate3y: 4.41, rate5y: 4.95 },
  { year: 2008, rate1y: 3.33, rate3y: 3.78, rate5y: 4.14 },
  { year: 2009, rate1y: 2.25, rate3y: 2.70, rate5y: 2.88 },
  { year: 2010, rate1y: 2.75, rate3y: 3.33, rate5y: 3.60 },
  { year: 2011, rate1y: 3.50, rate3y: 4.25, rate5y: 4.55 },
  { year: 2012, rate1y: 3.00, rate3y: 3.75, rate5y: 4.00 },
  { year: 2013, rate1y: 3.00, rate3y: 3.75, rate5y: 4.00 },
  { year: 2014, rate1y: 2.75, rate3y: 3.25, rate5y: 3.50 },
  { year: 2015, rate1y: 1.50, rate3y: 2.10, rate5y: 2.10 },
  { year: 2016, rate1y: 1.50, rate3y: 2.10, rate5y: 2.10 },
  { year: 2017, rate1y: 1.50, rate3y: 2.10, rate5y: 2.10 },
  { year: 2018, rate1y: 1.50, rate3y: 2.10, rate5y: 2.10 },
  { year: 2019, rate1y: 1.50, rate3y: 2.10, rate5y: 2.10 },
  { year: 2020, rate1y: 1.50, rate3y: 2.10, rate5y: 2.10 },
  { year: 2021, rate1y: 1.50, rate3y: 2.10, rate5y: 2.10 },
  { year: 2022, rate1y: 1.50, rate3y: 2.10, rate5y: 2.10 },
  { year: 2023, rate1y: 1.50, rate3y: 1.95, rate5y: 2.00 },
  { year: 2024, rate1y: 1.10, rate3y: 1.25, rate5y: 1.30 },
];

// ── 贷款基准利率（%）──
// LPR 1年期 / 5年期（2019年后LPR改革）
const LOAN_DATA = [
  { year: 2004, lpr1y: 5.31, lpr5y: 5.76, mortgage: 5.31 },
  { year: 2005, lpr1y: 5.58, lpr5y: 6.12, mortgage: 5.58 },
  { year: 2006, lpr1y: 6.12, lpr5y: 6.39, mortgage: 6.12 },
  { year: 2007, lpr1y: 7.29, lpr5y: 7.56, mortgage: 7.29 },
  { year: 2008, lpr1y: 5.31, lpr5y: 5.76, mortgage: 5.31 },
  { year: 2009, lpr1y: 5.31, lpr5y: 5.76, mortgage: 5.31 },
  { year: 2010, lpr1y: 5.81, lpr5y: 6.40, mortgage: 5.81 },
  { year: 2011, lpr1y: 6.56, lpr5y: 6.80, mortgage: 6.56 },
  { year: 2012, lpr1y: 6.00, lpr5y: 6.15, mortgage: 6.00 },
  { year: 2013, lpr1y: 6.00, lpr5y: 6.15, mortgage: 6.00 },
  { year: 2014, lpr1y: 5.60, lpr5y: 6.15, mortgage: 5.60 },
  { year: 2015, lpr1y: 4.35, lpr5y: 4.90, mortgage: 4.90 },
  { year: 2016, lpr1y: 4.35, lpr5y: 4.90, mortgage: 4.90 },
  { year: 2017, lpr1y: 4.35, lpr5y: 4.90, mortgage: 4.90 },
  { year: 2018, lpr1y: 4.35, lpr5y: 4.90, mortgage: 4.90 },
  { year: 2019, lpr1y: 4.15, lpr5y: 4.80, mortgage: 4.80 },
  { year: 2020, lpr1y: 3.85, lpr5y: 4.65, mortgage: 4.65 },
  { year: 2021, lpr1y: 3.80, lpr5y: 4.65, mortgage: 4.65 },
  { year: 2022, lpr1y: 3.65, lpr5y: 4.30, mortgage: 4.30 },
  { year: 2023, lpr1y: 3.45, lpr5y: 4.20, mortgage: 4.20 },
  { year: 2024, lpr1y: 3.10, lpr5y: 3.60, mortgage: 3.60 },
];

// ── 利差数据（贷款-存款，%）──
const SPREAD_DATA = DEPOSIT_DATA.map((d, i) => ({
  year: d.year,
  spread1y: parseFloat((LOAN_DATA[i].lpr1y - d.rate1y).toFixed(2)),
  spread5y: parseFloat((LOAN_DATA[i].lpr5y - d.rate5y).toFixed(2)),
  netInterestMargin: parseFloat(((LOAN_DATA[i].lpr1y - d.rate1y) * 0.85).toFixed(2)), // 估算净息差
}));

// ── AI 预测（2025-2034）──
const AI_PRED = [
  { year: 2025, deposit1y: 0.95, lpr1y: 2.90, lpr5y: 3.35, spread: 1.95, confidence: 88 },
  { year: 2026, deposit1y: 0.85, lpr1y: 2.75, lpr5y: 3.15, spread: 1.90, confidence: 84 },
  { year: 2027, deposit1y: 0.80, lpr1y: 2.65, lpr5y: 3.00, spread: 1.85, confidence: 80 },
  { year: 2028, deposit1y: 0.75, lpr1y: 2.55, lpr5y: 2.90, spread: 1.80, confidence: 76 },
  { year: 2029, deposit1y: 0.70, lpr1y: 2.50, lpr5y: 2.85, spread: 1.80, confidence: 72 },
  { year: 2030, deposit1y: 0.65, lpr1y: 2.45, lpr5y: 2.80, spread: 1.80, confidence: 68 },
  { year: 2031, deposit1y: 0.60, lpr1y: 2.40, lpr5y: 2.75, spread: 1.80, confidence: 64 },
  { year: 2032, deposit1y: 0.55, lpr1y: 2.35, lpr5y: 2.70, spread: 1.80, confidence: 60 },
  { year: 2033, deposit1y: 0.50, lpr1y: 2.30, lpr5y: 2.65, spread: 1.80, confidence: 56 },
  { year: 2034, deposit1y: 0.50, lpr1y: 2.30, lpr5y: 2.65, spread: 1.80, confidence: 52 },
];

const PRED_MAX_DEP = Math.max(...AI_PRED.map(d => d.deposit1y));
const PRED_MAX_LPR = Math.max(...AI_PRED.map(d => d.lpr1y));

export default function BankRatePage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('deposit');
  const [predModal, setPredModal] = useState<typeof AI_PRED[0] | null>(null);

  const TABS = [
    { key: 'deposit' as TabType, label: '存款×AI' },
    { key: 'loan'    as TabType, label: '贷款×AI' },
    { key: 'spread'  as TabType, label: '利差×AI' },
    { key: 'prediction' as TabType, label: 'AI预测' },
  ];

  const latestDep = DEPOSIT_DATA[DEPOSIT_DATA.length - 1];
  const latestLoan = LOAN_DATA[LOAN_DATA.length - 1];

  return (
    <div className="min-h-screen pb-10 max-w-md mx-auto relative" style={{ background: BG_PAGE, color: TEXT_MAIN }}>
      {/* ── 顶部导航 ── */}
      <div className="sticky top-0 z-20 flex items-center px-4 py-3" style={{ background: '#fff', borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={() => navigate("/smart-finance")} className="flex items-center justify-center w-8 h-8 rounded-full mr-3" style={{ background: BG_SUBTLE }}>
          <ChevronLeft className="w-5 h-5" style={{ color: TEXT_MAIN }} />
        </button>
        <div className="flex items-center gap-1 flex-1">
          <span className="text-base font-bold" style={{ color: TEXT_MAIN }}>存款</span>
          <span className="text-base font-bold" style={{ color: GOLD }}>×</span>
          <span className="text-base font-bold" style={{ color: AI_COLOR }}>AI</span>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full"
          style={{ background: BG_SUBTLE }}
        >
          <RefreshCw className="w-3.5 h-3.5" style={{ color: TEXT_MUTED }} />
          <span style={{ fontSize: 12, color: TEXT_MUTED, fontWeight: 500 }}>刷新</span>
        </button>
      </div>

      {/* ── 数据摘要卡片 ── */}
      <div className="px-4 pt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl p-3 text-center" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
          <div style={{ color: TEXT_MUTED, fontSize: 10 }}>1年期存款</div>
          <div style={{ color: GOLD, fontSize: 18, fontWeight: 800 }}>{latestDep.rate1y}%</div>
          <div style={{ color: TEXT_MUTED, fontSize: 9 }}>2024年</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
          <div style={{ color: TEXT_MUTED, fontSize: 10 }}>1年期LPR</div>
          <div style={{ color: ACCENT2, fontSize: 18, fontWeight: 800 }}>{latestLoan.lpr1y}%</div>
          <div style={{ color: TEXT_MUTED, fontSize: 9 }}>2024年</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
          <div style={{ color: TEXT_MUTED, fontSize: 10 }}>5年期LPR</div>
          <div style={{ color: TEAL, fontSize: 18, fontWeight: 800 }}>{latestLoan.lpr5y}%</div>
          <div style={{ color: TEXT_MUTED, fontSize: 9 }}>2024年</div>
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

        {/* ══════════════════════════════════════
            Tab 1: 存款利率
        ══════════════════════════════════════ */}
        {activeTab === 'deposit' && (
          <>
            {/* 存款利率趋势折线图 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 4 }}>存款基准利率趋势（%）</div>
              <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 10 }}>1年期 / 3年期 / 5年期定期存款</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={DEPOSIT_DATA} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    ticks={[2004, 2008, 2012, 2016, 2020, 2024]} />
                  <YAxis tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    tickFormatter={v => v + '%'} domain={[0, 5.5]} />
                  <Tooltip
                    contentStyle={{ background: BG_WHITE, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number, name: string) => {
                      const map: Record<string, string> = { rate1y: '1年期', rate3y: '3年期', rate5y: '5年期' };
                      return [v.toFixed(2) + '%', map[name] || name];
                    }}
                    labelFormatter={l => `${l}年`}
                  />
                  <Line type="monotone" dataKey="rate1y" stroke={GOLD} strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="rate3y" stroke={ACCENT} strokeWidth={2} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="rate5y" stroke={GREEN} strokeWidth={2} dot={false} strokeDasharray="2 3" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 justify-center">
                {[{ color: GOLD, label: '1年期' }, { color: ACCENT, label: '3年期' }, { color: GREEN, label: '5年期' }].map((item, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div style={{ width: 10, height: 3, background: item.color, borderRadius: 2 }} />
                    <span style={{ fontSize: 9, color: TEXT_MUTED }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 年度存款利率进度条 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 10 }}>年度1年期存款利率（%）</div>
              <div className="space-y-1.5">
                {[...DEPOSIT_DATA].reverse().map(d => {
                  const maxRate = 4.14;
                  const pct = (d.rate1y / maxRate) * 100;
                  const isLatest = d.year === latestDep.year;
                  const prev = DEPOSIT_DATA.find(x => x.year === d.year - 1);
                  const change = prev ? parseFloat((d.rate1y - prev.rate1y).toFixed(2)) : null;
                  return (
                    <div key={d.year} className="flex items-center gap-2" style={{ minHeight: 18 }}>
                      <span style={{ width: 32, fontSize: 10, color: isLatest ? GOLD : TEXT_MUTED, fontWeight: isLatest ? 700 : 400, flexShrink: 0, textAlign: 'right' }}>{d.year}</span>
                      <div className="flex-1 relative" style={{ height: 14, background: BG_SUBTLE, borderRadius: 3, overflow: 'visible' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: isLatest ? GOLD : '#fcd34d', borderRadius: 3, transition: 'width 0.6s ease' }} />
                        <span style={{ position: 'absolute', left: `${Math.min(pct + 1, 60)}%`, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: TEXT_MAIN, whiteSpace: 'nowrap', fontWeight: isLatest ? 700 : 400 }}>
                          {d.rate1y.toFixed(2)}%
                        </span>
                      </div>
                      {change !== null && (
                        <span style={{ width: 40, fontSize: 9, color: change > 0 ? ACCENT2 : change < 0 ? GREEN : TEXT_MUTED, textAlign: 'right', flexShrink: 0 }}>
                          {change > 0 ? '+' : ''}{change.toFixed(2)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 9, color: TEXT_MUTED, marginTop: 8 }}>* 数据来源：中国人民银行，取年末基准利率</div>
            </div>

            {/* 关键时间节点 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 10 }}>关键利率节点</div>
              {[
                { year: '2007年', rate: '3.87%', desc: '历史峰值，通胀压力下连续加息', color: ACCENT2 },
                { year: '2015年', rate: '1.50%', desc: '降息周期，去杠杆+稳增长', color: GOLD },
                { year: '2023年', rate: '1.50%→1.10%', desc: '多次降息，刺激消费与投资', color: TEAL },
                { year: '2024年', rate: '1.10%', desc: '历史最低，接近零利率时代', color: AI_COLOR },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 mb-3 last:mb-0">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: item.color }} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 11, fontWeight: 700, color: item.color }}>{item.year}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: TEXT_MAIN }}>{item.rate}</span>
                    </div>
                    <p style={{ fontSize: 10, color: TEXT_SUB }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ══════════════════════════════════════
            Tab 2: 贷款利率
        ══════════════════════════════════════ */}
        {activeTab === 'loan' && (
          <>
            {/* 贷款利率趋势 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 4 }}>LPR 贷款利率趋势（%）</div>
              <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 10 }}>1年期LPR / 5年期LPR（2019年后LPR改革）</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={LOAN_DATA} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    ticks={[2004, 2008, 2012, 2016, 2020, 2024]} />
                  <YAxis tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    tickFormatter={v => v + '%'} domain={[2.5, 8.5]} />
                  <Tooltip
                    contentStyle={{ background: BG_WHITE, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number, name: string) => {
                      const map: Record<string, string> = { lpr1y: '1年期LPR', lpr5y: '5年期LPR', mortgage: '房贷参考' };
                      return [v.toFixed(2) + '%', map[name] || name];
                    }}
                    labelFormatter={l => `${l}年`}
                  />
                  <Line type="monotone" dataKey="lpr1y" stroke={ACCENT2} strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="lpr5y" stroke={TEAL} strokeWidth={2} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 justify-center">
                {[{ color: ACCENT2, label: '1年期LPR' }, { color: TEAL, label: '5年期LPR' }].map((item, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div style={{ width: 10, height: 3, background: item.color, borderRadius: 2 }} />
                    <span style={{ fontSize: 9, color: TEXT_MUTED }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 年度LPR进度条 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 10 }}>年度1年期LPR（%）</div>
              <div className="space-y-1.5">
                {[...LOAN_DATA].reverse().map(d => {
                  const maxRate = 7.47;
                  const pct = (d.lpr1y / maxRate) * 100;
                  const isLatest = d.year === latestLoan.year;
                  const prev = LOAN_DATA.find(x => x.year === d.year - 1);
                  const change = prev ? parseFloat((d.lpr1y - prev.lpr1y).toFixed(2)) : null;
                  return (
                    <div key={d.year} className="flex items-center gap-2" style={{ minHeight: 18 }}>
                      <span style={{ width: 32, fontSize: 10, color: isLatest ? ACCENT2 : TEXT_MUTED, fontWeight: isLatest ? 700 : 400, flexShrink: 0, textAlign: 'right' }}>{d.year}</span>
                      <div className="flex-1 relative" style={{ height: 14, background: BG_SUBTLE, borderRadius: 3, overflow: 'visible' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: isLatest ? ACCENT2 : '#fca5a5', borderRadius: 3, transition: 'width 0.6s ease' }} />
                        <span style={{ position: 'absolute', left: `${Math.min(pct + 1, 60)}%`, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: TEXT_MAIN, whiteSpace: 'nowrap', fontWeight: isLatest ? 700 : 400 }}>
                          {d.lpr1y.toFixed(2)}%
                        </span>
                      </div>
                      {change !== null && (
                        <span style={{ width: 40, fontSize: 9, color: change > 0 ? ACCENT2 : change < 0 ? GREEN : TEXT_MUTED, textAlign: 'right', flexShrink: 0 }}>
                          {change > 0 ? '+' : ''}{change.toFixed(2)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 5年期LPR进度条（房贷参考）*/}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 10 }}>年度5年期LPR（%）— 房贷参考</div>
              <div className="space-y-1.5">
                {[...LOAN_DATA].reverse().map(d => {
                  const maxRate = 7.83;
                  const pct = (d.lpr5y / maxRate) * 100;
                  const isLatest = d.year === latestLoan.year;
                  return (
                    <div key={d.year} className="flex items-center gap-2" style={{ minHeight: 18 }}>
                      <span style={{ width: 32, fontSize: 10, color: isLatest ? TEAL : TEXT_MUTED, fontWeight: isLatest ? 700 : 400, flexShrink: 0, textAlign: 'right' }}>{d.year}</span>
                      <div className="flex-1 relative" style={{ height: 14, background: BG_SUBTLE, borderRadius: 3, overflow: 'visible' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: isLatest ? TEAL : '#67e8f9', borderRadius: 3, transition: 'width 0.6s ease' }} />
                        <span style={{ position: 'absolute', left: `${Math.min(pct + 1, 60)}%`, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: TEXT_MAIN, whiteSpace: 'nowrap', fontWeight: isLatest ? 700 : 400 }}>
                          {d.lpr5y.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════
            Tab 3: 利差分析
        ══════════════════════════════════════ */}
        {activeTab === 'spread' && (
          <>
            {/* 利差趋势面积图 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 4 }}>存贷利差趋势（%）</div>
              <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 10 }}>1年期贷款利率 - 1年期存款利率</div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={SPREAD_DATA} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spreadGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={AI_COLOR} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={AI_COLOR} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    ticks={[2004, 2008, 2012, 2016, 2020, 2024]} />
                  <YAxis tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    tickFormatter={v => v + '%'} domain={[0, 5]} />
                  <Tooltip
                    contentStyle={{ background: BG_WHITE, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number, name: string) => {
                      const map: Record<string, string> = { spread1y: '1年期利差', spread5y: '5年期利差', netInterestMargin: '估算净息差' };
                      return [v.toFixed(2) + '%', map[name] || name];
                    }}
                    labelFormatter={l => `${l}年`}
                  />
                  <Area type="monotone" dataKey="spread1y" stroke={AI_COLOR} strokeWidth={2.5} fill="url(#spreadGrad)" dot={false} />
                  <Line type="monotone" dataKey="netInterestMargin" stroke={GOLD} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 justify-center">
                {[{ color: AI_COLOR, label: '1年期利差' }, { color: GOLD, label: '估算净息差' }].map((item, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div style={{ width: 10, height: 3, background: item.color, borderRadius: 2 }} />
                    <span style={{ fontSize: 9, color: TEXT_MUTED }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 年度利差进度条 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 10 }}>年度1年期存贷利差（%）</div>
              <div className="space-y-1.5">
                {[...SPREAD_DATA].reverse().map(d => {
                  const maxSpread = 4.14;
                  const pct = Math.max((d.spread1y / maxSpread) * 100, 2);
                  const isLatest = d.year === SPREAD_DATA[SPREAD_DATA.length - 1].year;
                  return (
                    <div key={d.year} className="flex items-center gap-2" style={{ minHeight: 18 }}>
                      <span style={{ width: 32, fontSize: 10, color: isLatest ? AI_COLOR : TEXT_MUTED, fontWeight: isLatest ? 700 : 400, flexShrink: 0, textAlign: 'right' }}>{d.year}</span>
                      <div className="flex-1 relative" style={{ height: 14, background: BG_SUBTLE, borderRadius: 3, overflow: 'visible' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: isLatest ? AI_COLOR : '#c4b5fd', borderRadius: 3, transition: 'width 0.6s ease' }} />
                        <span style={{ position: 'absolute', left: `${Math.min(pct + 1, 60)}%`, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: TEXT_MAIN, whiteSpace: 'nowrap', fontWeight: isLatest ? 700 : 400 }}>
                          {d.spread1y.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 利差分析说明 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 10 }}>利差对银行业影响分析</div>
              {[
                { label: '净息差收窄压力', color: ACCENT2, text: '2024年商业银行净息差已降至1.54%，逼近1.5%的监管警戒线，银行盈利能力承压。' },
                { label: '存款成本刚性', color: GOLD, text: '居民储蓄意愿强，存款定期化趋势明显，银行负债成本难以快速下降。' },
                { label: '资产端收益下行', color: TEAL, text: 'LPR持续下调，叠加房贷重定价，银行资产端收益率持续走低。' },
                { label: '政策导向', color: AI_COLOR, text: '监管引导银行让利实体经济，预计利差将在低位维持较长时间，银行需通过中间业务弥补利差损失。' },
              ].map((item, i) => (
                <div key={i} className="mb-3 last:mb-0">
                  <div style={{ fontSize: 11, fontWeight: 700, color: item.color, marginBottom: 3 }}>{item.label}</div>
                  <p style={{ fontSize: 11, color: TEXT_SUB, lineHeight: 1.6 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ══════════════════════════════════════
            Tab 4: AI 预测
        ══════════════════════════════════════ */}
        {activeTab === 'prediction' && (
          <>
            {/* AI 说明 */}
            <div className="rounded-2xl p-4" style={{ background: `${AI_COLOR}08`, border: `1px solid ${AI_COLOR}30` }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: AI_COLOR }}>
                  <Info className="w-3.5 h-3.5 text-white" />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: AI_COLOR }}>AI 预测模型说明</span>
              </div>
              <p style={{ fontSize: 11, color: TEXT_SUB, lineHeight: 1.7 }}>
                综合 <strong>8项核心变量</strong> 预测 2025-2034 年存贷款利率走势：GDP增速、CPI通胀率、M2增速、外汇储备变化、美联储利率、银行净息差、居民储蓄率、房地产景气指数。
              </p>
            </div>

            {/* 预测折线图 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 4 }}>2025-2034 年利率预测（%）</div>
              <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 10 }}>1年期存款 / 1年期LPR / 5年期LPR</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={AI_PRED} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    tickFormatter={v => v + '%'} domain={[0, 4]} />
                  <Tooltip
                    contentStyle={{ background: BG_WHITE, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number, name: string) => {
                      const map: Record<string, string> = { deposit1y: '1年期存款', lpr1y: '1年期LPR', lpr5y: '5年期LPR', spread: '存贷利差' };
                      return [v.toFixed(2) + '%', map[name] || name];
                    }}
                    labelFormatter={l => `${l}年`}
                  />
                  <Line type="monotone" dataKey="deposit1y" stroke={GOLD} strokeWidth={2} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="lpr1y" stroke={ACCENT2} strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="lpr5y" stroke={TEAL} strokeWidth={2} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex gap-3 mt-2 justify-center flex-wrap">
                {[{ color: GOLD, label: '1年期存款' }, { color: ACCENT2, label: '1年期LPR' }, { color: TEAL, label: '5年期LPR' }].map((item, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div style={{ width: 10, height: 2, background: item.color, borderRadius: 2 }} />
                    <span style={{ fontSize: 9, color: TEXT_MUTED }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 逐年预测：存款利率 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 10 }}>逐年预测详情（点击查看）</div>
              <div className="space-y-1.5">
                {AI_PRED.map(d => {
                  const pct = (d.lpr1y / PRED_MAX_LPR) * 100;
                  return (
                    <div key={d.year} className="flex items-center gap-2 cursor-pointer" style={{ minHeight: 18 }} onClick={() => setPredModal(d)}>
                      <span style={{ width: 32, fontSize: 10, color: AI_COLOR, fontWeight: 700, flexShrink: 0, textAlign: 'right' }}>{d.year}</span>
                      <div className="flex-1 relative" style={{ height: 14, background: BG_SUBTLE, borderRadius: 3, overflow: 'visible' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: `${AI_COLOR}60`, borderRadius: 3, transition: 'width 0.6s ease' }} />
                        <span style={{ position: 'absolute', left: `${Math.min(pct + 1, 55)}%`, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: TEXT_MAIN, whiteSpace: 'nowrap', fontWeight: 600 }}>
                          LPR {d.lpr1y.toFixed(2)}%
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
                { label: '短期（2025-2026）', color: GREEN, text: '美联储降息周期打开中国货币政策空间，存款利率有望再降 20-30bp，LPR跟随下调。' },
                { label: '中期（2027-2030）', color: GOLD, text: '经济复苏若不及预期，利率或维持低位较长时间，类似日本"低利率陷阱"风险值得关注。' },
                { label: '长期（2031-2034）', color: ACCENT2, text: '若通胀回升或外部冲击，不排除利率阶段性反弹，但整体趋势仍以低利率为主基调。' },
                { label: '投资者建议', color: AI_COLOR, text: '低利率环境下，纯储蓄收益持续缩水，建议关注权益类资产配置机会，同时警惕信用风险。' },
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
                <span style={{ fontSize: 13, color: TEXT_MUTED, marginLeft: 6 }}>年利率预测</span>
              </div>
              <button onClick={() => setPredModal(null)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: BG_SUBTLE }}>
                <X className="w-4 h-4" style={{ color: TEXT_MUTED }} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {[
                { label: '1年期存款利率', value: predModal.deposit1y.toFixed(2) + '%', color: GOLD },
                { label: '1年期LPR', value: predModal.lpr1y.toFixed(2) + '%', color: ACCENT2 },
                { label: '5年期LPR', value: predModal.lpr5y.toFixed(2) + '%', color: TEAL },
                { label: '存贷利差', value: predModal.spread.toFixed(2) + '%', color: AI_COLOR },
              ].map((s, i) => (
                <div key={i} className="rounded-xl p-3 text-center" style={{ background: BG_PAGE }}>
                  <div style={{ fontSize: 9, color: TEXT_MUTED, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
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
              基准假设：GDP增速 4.5%、CPI约 1.5%、美联储利率温和下行、国内经济稳步复苏。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
