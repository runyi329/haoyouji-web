/**
 * 医疗×AI 宏观数据页面
 * 路由：/healthcare
 * 两大模块：医疗机构统计 / 疾病统计
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, X, Info, RefreshCw } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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
const TEAL       = "#0891b2";
const ORANGE     = "#d97706";
const BG_SUBTLE  = "#f0f2f5";

type TabType = 'institution' | 'disease' | 'expense' | 'prediction';

// ── 医疗机构数据（单位：万个/万张/万人）──
const INSTITUTION_DATA = [
  { year: 2010, hospitals: 2.0, beds: 478.7, doctors: 241.3, nurses: 204.8 },
  { year: 2011, hospitals: 2.1, beds: 516.0, doctors: 246.6, nurses: 224.4 },
  { year: 2012, hospitals: 2.3, beds: 572.5, doctors: 261.6, nurses: 249.7 },
  { year: 2013, hospitals: 2.4, beds: 618.2, doctors: 279.5, nurses: 278.3 },
  { year: 2014, hospitals: 2.5, beds: 660.1, doctors: 289.3, nurses: 300.4 },
  { year: 2015, hospitals: 2.7, beds: 701.5, doctors: 303.9, nurses: 324.1 },
  { year: 2016, hospitals: 2.9, beds: 741.0, doctors: 319.1, nurses: 350.7 },
  { year: 2017, hospitals: 3.1, beds: 794.0, doctors: 339.0, nurses: 380.4 },
  { year: 2018, hospitals: 3.3, beds: 840.4, doctors: 360.7, nurses: 409.9 },
  { year: 2019, hospitals: 3.4, beds: 880.7, doctors: 386.7, nurses: 444.5 },
  { year: 2020, hospitals: 3.5, beds: 910.1, doctors: 408.6, nurses: 470.9 },
  { year: 2021, hospitals: 3.7, beds: 944.8, doctors: 428.7, nurses: 501.8 },
  { year: 2022, hospitals: 3.7, beds: 975.0, doctors: 443.5, nurses: 522.4 },
  { year: 2023, hospitals: 3.8, beds: 1005.0, doctors: 467.1, nurses: 546.0 },
  { year: 2024, hospitals: 3.9, beds: 1030.0, doctors: 485.0, nurses: 568.0 },
];

// ── 主要疾病发病率（每10万人）──
const DISEASE_DATA = [
  { year: 2015, cancer: 270.6, heartDisease: 241.8, diabetes: 9.5, hypertension: 24.2, stroke: 345.1 },
  { year: 2016, cancer: 272.1, heartDisease: 246.5, diabetes: 9.8, hypertension: 25.1, stroke: 352.3 },
  { year: 2017, cancer: 278.3, heartDisease: 251.2, diabetes: 10.2, hypertension: 26.0, stroke: 358.9 },
  { year: 2018, cancer: 285.8, heartDisease: 258.4, diabetes: 10.8, hypertension: 27.2, stroke: 365.2 },
  { year: 2019, cancer: 293.0, heartDisease: 264.1, diabetes: 11.2, hypertension: 28.0, stroke: 372.4 },
  { year: 2020, cancer: 290.5, heartDisease: 260.8, diabetes: 11.5, hypertension: 28.8, stroke: 368.0 },
  { year: 2021, cancer: 298.7, heartDisease: 268.3, diabetes: 12.0, hypertension: 29.5, stroke: 378.6 },
  { year: 2022, cancer: 302.4, heartDisease: 272.1, diabetes: 12.4, hypertension: 30.1, stroke: 382.1 },
  { year: 2023, cancer: 307.2, heartDisease: 276.8, diabetes: 12.8, hypertension: 30.8, stroke: 386.5 },
  { year: 2024, cancer: 311.0, heartDisease: 280.0, diabetes: 13.1, hypertension: 31.2, stroke: 390.0 },
];

// ── 卫生总费用（亿元）──
const EXPENSE_DATA = [
  { year: 2010, total: 19980, gov: 5732, social: 7196, personal: 7052 },
  { year: 2011, total: 24346, gov: 7379, social: 8416, personal: 8551 },
  { year: 2012, total: 28119, gov: 8432, social: 10030, personal: 9657 },
  { year: 2013, total: 31669, gov: 9545, social: 11393, personal: 10731 },
  { year: 2014, total: 35312, gov: 10579, social: 13437, personal: 11296 },
  { year: 2015, total: 40975, gov: 12475, social: 16506, personal: 11994 },
  { year: 2016, total: 46345, gov: 13910, social: 19096, personal: 13339 },
  { year: 2017, total: 52598, gov: 15517, social: 22258, personal: 14823 },
  { year: 2018, total: 59122, gov: 17428, social: 25811, personal: 15883 },
  { year: 2019, total: 65841, gov: 19428, social: 29278, personal: 17135 },
  { year: 2020, total: 72175, gov: 21942, social: 32083, personal: 18150 },
  { year: 2021, total: 81234, gov: 24802, social: 36102, personal: 20330 },
  { year: 2022, total: 85327, gov: 26000, social: 37800, personal: 21527 },
  { year: 2023, total: 90575, gov: 27500, social: 40200, personal: 22875 },
  { year: 2024, total: 96000, gov: 29000, social: 42800, personal: 24200 },
];

// ── AI 预测（医疗费用 2025-2034）──
const AI_PRED = [
  { year: 2025, optimistic: 104800, base: 101200, pessimistic: 97500, confidence: 87 },
  { year: 2026, optimistic: 113500, base: 107800, pessimistic: 102100, confidence: 84 },
  { year: 2027, optimistic: 122400, base: 114500, pessimistic: 106400, confidence: 81 },
  { year: 2028, optimistic: 131200, base: 121000, pessimistic: 110200, confidence: 78 },
  { year: 2029, optimistic: 139800, base: 127200, pessimistic: 113500, confidence: 75 },
  { year: 2030, optimistic: 148100, base: 133000, pessimistic: 116200, confidence: 72 },
  { year: 2031, optimistic: 155800, base: 138200, pessimistic: 118400, confidence: 69 },
  { year: 2032, optimistic: 162500, base: 142800, pessimistic: 119800, confidence: 66 },
  { year: 2033, optimistic: 168200, base: 146500, pessimistic: 120500, confidence: 63 },
  { year: 2034, optimistic: 172800, base: 149200, pessimistic: 120200, confidence: 60 },
];

function fmt(n: number) {
  if (n >= 10000) return (n / 10000).toFixed(2) + '万亿';
  return n.toLocaleString() + '亿';
}

const INST_MAX_BEDS = Math.max(...INSTITUTION_DATA.map(d => d.beds));
const INST_MAX_DOCTORS = Math.max(...INSTITUTION_DATA.map(d => d.doctors));
const PRED_MAX = Math.max(...AI_PRED.map(d => d.optimistic));

export default function HealthcarePage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('institution');
  const [predModal, setPredModal] = useState<typeof AI_PRED[0] | null>(null);
  const [diseaseModal, setDiseaseModal] = useState<typeof DISEASE_DATA[0] | null>(null);

  const TABS = [
    { key: 'institution' as TabType, label: '机构×AI' },
    { key: 'disease'     as TabType, label: '疾病×AI' },
    { key: 'expense'     as TabType, label: '费用×AI' },
    { key: 'prediction'  as TabType, label: 'AI预测' },
  ];

  const latestInst = INSTITUTION_DATA[INSTITUTION_DATA.length - 1];
  const latestDisease = DISEASE_DATA[DISEASE_DATA.length - 1];
  const latestExp = EXPENSE_DATA[EXPENSE_DATA.length - 1];

  return (
    <div className="min-h-screen pb-10 max-w-md mx-auto relative" style={{ background: BG_PAGE, color: TEXT_MAIN }}>
      {/* ── 顶部导航 ── */}
      <div className="sticky top-0 z-20 flex items-center px-4 py-3" style={{ background: '#fff', borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={() => navigate("/smart-finance")} className="flex items-center justify-center w-8 h-8 rounded-full mr-3" style={{ background: BG_SUBTLE }}>
          <ChevronLeft className="w-5 h-5" style={{ color: TEXT_MAIN }} />
        </button>
        <div className="flex items-center gap-1 flex-1">
          <span className="text-base font-bold" style={{ color: TEXT_MAIN }}>医疗</span>
          <span className="text-base font-bold" style={{ color: TEAL }}>×</span>
          <span className="text-base font-bold" style={{ color: AI_COLOR }}>AI</span>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full"
          style={{ background: BG_SUBTLE }}
        >
          <RefreshCw className="w-3.5 h-3.5" style={{ color: TEXT_SUB }} />
          <span style={{ fontSize: 12, color: TEXT_SUB, fontWeight: 500 }}>刷新</span>
        </button>
      </div>

      {/* ── 数据摘要卡片 ── */}
      <div className="px-4 pt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl p-3 text-center" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
          <div style={{ color: TEXT_MUTED, fontSize: 10 }}>2024年医院数</div>
          <div style={{ color: TEAL, fontSize: 16, fontWeight: 800 }}>3.9万</div>
          <div style={{ color: TEXT_MUTED, fontSize: 10 }}>家</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
          <div style={{ color: TEXT_MUTED, fontSize: 10 }}>2024年床位数</div>
          <div style={{ color: ACCENT, fontSize: 16, fontWeight: 800 }}>1030万</div>
          <div style={{ color: TEXT_MUTED, fontSize: 10 }}>张</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
          <div style={{ color: TEXT_MUTED, fontSize: 10 }}>卫生总费用</div>
          <div style={{ color: ORANGE, fontSize: 16, fontWeight: 800 }}>9.6万亿</div>
          <div style={{ color: TEXT_MUTED, fontSize: 10 }}>元</div>
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
            Tab 1: 医疗机构统计
        ══════════════════════════════════════ */}
        {activeTab === 'institution' && (
          <>
            {/* 床位数趋势 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 12 }}>医院床位数趋势（万张）</div>
              <ResponsiveContainer width="100%" height={170}>
                <AreaChart data={INSTITUTION_DATA} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bedsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={TEAL} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={TEAL} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    ticks={[2010, 2014, 2018, 2022, 2024]} />
                  <YAxis tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    tickFormatter={v => v + '万'} />
                  <Tooltip
                    contentStyle={{ background: BG_WHITE, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number) => [v.toFixed(1) + '万张', '床位数']}
                    labelFormatter={l => `${l}年`}
                  />
                  <Area type="monotone" dataKey="beds" stroke={TEAL} strokeWidth={2} fill="url(#bedsGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* 医护人员趋势 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 12 }}>医生 vs 护士人数趋势（万人）</div>
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={INSTITUTION_DATA} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    ticks={[2010, 2014, 2018, 2022, 2024]} />
                  <YAxis tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    tickFormatter={v => v + '万'} />
                  <Tooltip
                    contentStyle={{ background: BG_WHITE, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number, name: string) => [v.toFixed(1) + '万人', name === 'doctors' ? '执业医师' : '注册护士']}
                    labelFormatter={l => `${l}年`}
                  />
                  <Line type="monotone" dataKey="doctors" name="doctors" stroke={ACCENT} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="nurses" name="nurses" stroke={GREEN} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 justify-center">
                <div className="flex items-center gap-1"><div style={{ width: 10, height: 3, background: ACCENT, borderRadius: 2 }} /><span style={{ fontSize: 9, color: TEXT_MUTED }}>执业医师</span></div>
                <div className="flex items-center gap-1"><div style={{ width: 10, height: 3, background: GREEN, borderRadius: 2 }} /><span style={{ fontSize: 9, color: TEXT_MUTED }}>注册护士</span></div>
              </div>
            </div>

            {/* 年度床位进度条 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 10 }}>年度床位数（万张）</div>
              <div className="space-y-1.5">
                {[...INSTITUTION_DATA].reverse().map(d => {
                  const pct = (d.beds / INST_MAX_BEDS) * 100;
                  const isLatest = d.year === latestInst.year;
                  const prev = INSTITUTION_DATA.find(x => x.year === d.year - 1);
                  const change = prev ? d.beds - prev.beds : null;
                  return (
                    <div key={d.year} className="flex items-center gap-2" style={{ minHeight: 18 }}>
                      <span style={{ width: 32, fontSize: 10, color: isLatest ? TEAL : TEXT_MUTED, fontWeight: isLatest ? 700 : 400, flexShrink: 0, textAlign: 'right' }}>{d.year}</span>
                      <div className="flex-1 relative" style={{ height: 14, background: BG_SUBTLE, borderRadius: 3, overflow: 'visible' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: isLatest ? TEAL : '#67e8f9', borderRadius: 3, transition: 'width 0.6s ease' }} />
                        <span style={{ position: 'absolute', left: `${Math.min(pct + 1, 55)}%`, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: TEXT_MAIN, whiteSpace: 'nowrap', fontWeight: isLatest ? 700 : 400 }}>
                          {d.beds.toFixed(1)}万张
                        </span>
                      </div>
                      {change !== null && (
                        <span style={{ width: 40, fontSize: 9, color: change >= 0 ? GREEN : ACCENT2, textAlign: 'right', flexShrink: 0 }}>
                          {change >= 0 ? '+' : ''}{change.toFixed(1)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 年度医生进度条 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 10 }}>年度执业医师数（万人）</div>
              <div className="space-y-1.5">
                {[...INSTITUTION_DATA].reverse().map(d => {
                  const pct = (d.doctors / INST_MAX_DOCTORS) * 100;
                  const isLatest = d.year === latestInst.year;
                  return (
                    <div key={d.year} className="flex items-center gap-2" style={{ minHeight: 18 }}>
                      <span style={{ width: 32, fontSize: 10, color: isLatest ? ACCENT : TEXT_MUTED, fontWeight: isLatest ? 700 : 400, flexShrink: 0, textAlign: 'right' }}>{d.year}</span>
                      <div className="flex-1 relative" style={{ height: 14, background: BG_SUBTLE, borderRadius: 3, overflow: 'visible' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: isLatest ? ACCENT : '#93c5fd', borderRadius: 3, transition: 'width 0.6s ease' }} />
                        <span style={{ position: 'absolute', left: `${Math.min(pct + 1, 55)}%`, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: TEXT_MAIN, whiteSpace: 'nowrap', fontWeight: isLatest ? 700 : 400 }}>
                          {d.doctors.toFixed(1)}万人
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
            Tab 2: 疾病统计
        ══════════════════════════════════════ */}
        {activeTab === 'disease' && (
          <>
            {/* 主要疾病发病率趋势 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 4 }}>主要疾病发病率趋势（每10万人）</div>
              <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 10 }}>点击年份行查看详情</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={DISEASE_DATA} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: BG_WHITE, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number, name: string) => {
                      const map: Record<string, string> = { cancer: '恶性肿瘤', heartDisease: '心脏病', stroke: '脑卒中', diabetes: '糖尿病', hypertension: '高血压' };
                      return [v.toFixed(1), map[name] || name];
                    }}
                    labelFormatter={l => `${l}年`}
                  />
                  <Line type="monotone" dataKey="stroke" stroke={ACCENT2} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="cancer" stroke={ORANGE} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="heartDisease" stroke={TEAL} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="diabetes" stroke={GREEN} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-2 justify-center">
                {[
                  { color: ACCENT2, label: '脑卒中' },
                  { color: ORANGE, label: '恶性肿瘤' },
                  { color: TEAL, label: '心脏病' },
                  { color: GREEN, label: '糖尿病' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div style={{ width: 10, height: 3, background: item.color, borderRadius: 2 }} />
                    <span style={{ fontSize: 9, color: TEXT_MUTED }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 年度疾病数据列表（可点击） */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 10 }}>年度疾病数据（点击查看详情）</div>
              <div className="space-y-2">
                {[...DISEASE_DATA].reverse().map(d => {
                  const isLatest = d.year === latestDisease.year;
                  return (
                    <div key={d.year} className="rounded-xl p-3 cursor-pointer active:opacity-70 transition-opacity"
                      style={{ background: isLatest ? '#f0f9ff' : BG_PAGE, border: `1px solid ${isLatest ? '#bae6fd' : BORDER}` }}
                      onClick={() => setDiseaseModal(d)}>
                      <div className="flex items-center justify-between">
                        <span style={{ fontSize: 11, fontWeight: 700, color: isLatest ? TEAL : TEXT_MAIN }}>{d.year}年</span>
                        <span style={{ fontSize: 10, color: TEXT_MUTED }}>点击查看 →</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 mt-1.5">
                        <div>
                          <div style={{ fontSize: 9, color: TEXT_MUTED }}>恶性肿瘤</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: ORANGE }}>{d.cancer.toFixed(1)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: TEXT_MUTED }}>心脏病</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: TEAL }}>{d.heartDisease.toFixed(1)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: TEXT_MUTED }}>脑卒中</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: ACCENT2 }}>{d.stroke.toFixed(1)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 9, color: TEXT_MUTED, marginTop: 8 }}>* 数据来源：国家卫生健康委员会，单位：每10万人发病率</div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════
            Tab 3: 卫生费用
        ══════════════════════════════════════ */}
        {activeTab === 'expense' && (
          <>
            {/* 卫生总费用趋势 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 12 }}>卫生总费用趋势（亿元）</div>
              <ResponsiveContainer width="100%" height={170}>
                <AreaChart data={EXPENSE_DATA} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={ORANGE} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={ORANGE} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    ticks={[2010, 2014, 2018, 2022, 2024]} />
                  <YAxis tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    tickFormatter={v => (v/10000).toFixed(1)+'万亿'} />
                  <Tooltip
                    contentStyle={{ background: BG_WHITE, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number) => [fmt(v), '卫生总费用']}
                    labelFormatter={l => `${l}年`}
                  />
                  <Area type="monotone" dataKey="total" stroke={ORANGE} strokeWidth={2} fill="url(#expGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* 费用结构柱状图 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 12 }}>费用结构：政府/社会/个人（亿元）</div>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={EXPENSE_DATA.filter(d => d.year >= 2016)} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} axisLine={false}
                    tickFormatter={v => (v/10000).toFixed(1)+'万亿'} />
                  <Tooltip
                    contentStyle={{ background: BG_WHITE, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number, name: string) => {
                      const map: Record<string, string> = { gov: '政府卫生支出', social: '社会卫生支出', personal: '个人卫生支出' };
                      return [fmt(v), map[name] || name];
                    }}
                    labelFormatter={l => `${l}年`}
                  />
                  <Bar dataKey="gov" name="gov" stackId="a" fill={ACCENT} maxBarSize={24} />
                  <Bar dataKey="social" name="social" stackId="a" fill={TEAL} maxBarSize={24} />
                  <Bar dataKey="personal" name="personal" stackId="a" fill={ORANGE} maxBarSize={24} radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 justify-center">
                {[{ color: ACCENT, label: '政府' }, { color: TEAL, label: '社会' }, { color: ORANGE, label: '个人' }].map((item, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div style={{ width: 10, height: 8, background: item.color, borderRadius: 2 }} />
                    <span style={{ fontSize: 9, color: TEXT_MUTED }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 年度费用列表 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 10 }}>年度卫生总费用明细</div>
              <div className="space-y-2">
                {[...EXPENSE_DATA].reverse().map(d => {
                  const isLatest = d.year === latestExp.year;
                  const govPct = ((d.gov / d.total) * 100).toFixed(1);
                  const socialPct = ((d.social / d.total) * 100).toFixed(1);
                  const personalPct = ((d.personal / d.total) * 100).toFixed(1);
                  return (
                    <div key={d.year} className="rounded-xl p-3" style={{ background: isLatest ? '#fffbeb' : BG_PAGE, border: `1px solid ${isLatest ? '#fde68a' : BORDER}` }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span style={{ fontSize: 11, fontWeight: 700, color: isLatest ? ORANGE : TEXT_MAIN }}>{d.year}年</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: ORANGE }}>{fmt(d.total)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <div style={{ fontSize: 9, color: TEXT_MUTED }}>政府 {govPct}%</div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: ACCENT }}>{fmt(d.gov)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: TEXT_MUTED }}>社会 {socialPct}%</div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: TEAL }}>{fmt(d.social)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: TEXT_MUTED }}>个人 {personalPct}%</div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: ORANGE }}>{fmt(d.personal)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
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
                基于 <strong>12项核心变量</strong> 构建卫生总费用预测模型，包含：人口老龄化速度、人均 GDP 增速、医疗技术进步系数、慢性病患病率、医保覆盖率、医疗价格指数等，预测 2025-2034 年全国卫生总费用规模。
              </p>
            </div>

            {/* 三情景折线图 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 4 }}>2025-2034 年卫生总费用预测（亿元）</div>
              <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 10 }}>三情景预测：乐观 / 基准 / 悲观</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={AI_PRED} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
                {[{ color: GREEN, label: '乐观' }, { color: AI_COLOR, label: '基准' }, { color: ACCENT2, label: '悲观' }].map((item, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div style={{ width: 10, height: 2, background: item.color, borderRadius: 2 }} />
                    <span style={{ fontSize: 9, color: TEXT_MUTED }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 逐年预测列表 */}
            <div className="rounded-2xl p-4" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_MAIN, marginBottom: 10 }}>逐年预测详情（点击查看）</div>
              <div className="space-y-1.5">
                {AI_PRED.map(d => {
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
                { label: '短期（2025-2027）', color: GREEN, text: '老龄化加速叠加慢性病高发，卫生总费用年均增速维持 8-10%，2027年突破 12 万亿元。' },
                { label: '中期（2028-2031）', color: ORANGE, text: '医疗技术进步（AI诊断、精准医疗）有望提升效率，但需求端压力持续，费用增速难以显著放缓。' },
                { label: '长期（2032-2034）', color: ACCENT2, text: '个人卫生支出占比若超过 30%，将对居民消费产生明显挤出效应，医保改革压力上升。' },
                { label: '关键变量', color: AI_COLOR, text: '医保支付方式改革进度、慢性病防控效果、AI医疗渗透率是影响预测结果的三大核心变量。' },
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
                <span style={{ fontSize: 13, color: TEXT_MUTED, marginLeft: 6 }}>年卫生总费用预测</span>
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
              基准情景假设：GDP增速 4.5%、老龄化率按现有趋势推进、医保覆盖率维持现有水平、医疗价格指数年增 3%。
            </div>
          </div>
        </div>
      )}

      {/* ── 疾病详情弹框 ── */}
      {diseaseModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setDiseaseModal(null)}>
          <div className="w-full max-w-md rounded-t-3xl p-5" style={{ background: BG_WHITE }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <span style={{ fontSize: 18, fontWeight: 800, color: TEAL }}>{diseaseModal.year}</span>
                <span style={{ fontSize: 13, color: TEXT_MUTED, marginLeft: 6 }}>年主要疾病发病率</span>
              </div>
              <button onClick={() => setDiseaseModal(null)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: BG_SUBTLE }}>
                <X className="w-4 h-4" style={{ color: TEXT_MUTED }} />
              </button>
            </div>
            <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 12 }}>单位：每10万人发病率</div>
            <div className="space-y-3">
              {[
                { label: '脑卒中', value: diseaseModal.stroke, color: ACCENT2, max: 420 },
                { label: '心脏病', value: diseaseModal.heartDisease, color: TEAL, max: 320 },
                { label: '恶性肿瘤', value: diseaseModal.cancer, color: ORANGE, max: 350 },
                { label: '高血压', value: diseaseModal.hypertension, color: ACCENT, max: 35 },
                { label: '糖尿病', value: diseaseModal.diabetes, color: GREEN, max: 15 },
              ].map((item, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span style={{ fontSize: 11, fontWeight: 600, color: item.color }}>{item.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: item.color }}>{item.value.toFixed(1)}</span>
                  </div>
                  <div style={{ height: 6, background: BG_SUBTLE, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${(item.value / item.max) * 100}%`, height: '100%', background: item.color, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
