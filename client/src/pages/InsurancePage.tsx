import { useState } from "react";
import { useLocation } from "wouter";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, AreaChart, Area
} from "recharts";

// ── 大陆保险数据 ──────────────────────────────────────────────────
const mainlandPremiumData = [
  { year: '2010', total: 1.45, life: 0.89, property: 0.56 },
  { year: '2011', total: 1.43, life: 0.86, property: 0.57 },
  { year: '2012', total: 1.55, life: 0.90, property: 0.65 },
  { year: '2013', total: 1.72, life: 0.99, property: 0.73 },
  { year: '2014', total: 2.02, life: 1.19, property: 0.83 },
  { year: '2015', total: 2.43, life: 1.54, property: 0.89 },
  { year: '2016', total: 3.10, life: 2.13, property: 0.97 },
  { year: '2017', total: 3.66, life: 2.58, property: 1.08 },
  { year: '2018', total: 3.80, life: 2.61, property: 1.19 },
  { year: '2019', total: 4.26, life: 3.00, property: 1.26 },
  { year: '2020', total: 4.53, life: 3.20, property: 1.33 },
  { year: '2021', total: 4.49, life: 3.10, property: 1.39 },
  { year: '2022', total: 4.70, life: 3.25, property: 1.45 },
  { year: '2023', total: 5.12, life: 3.58, property: 1.54 },
  { year: '2024', total: 5.42, life: 3.82, property: 1.60 },
];

const mainlandBarData = [
  { name: '寿险', value: 3.82, color: '#6366f1' },
  { name: '财险', value: 1.60, color: '#f59e0b' },
  { name: '健康险', value: 0.98, color: '#10b981' },
  { name: '意外险', value: 0.12, color: '#ef4444' },
];

// ── 香港保险数据 ──────────────────────────────────────────────────
const hkPremiumData = [
  { year: '2015', total: 2980, mainland: 316 },
  { year: '2016', total: 3287, mainland: 727 },
  { year: '2017', total: 3490, mainland: 508 },
  { year: '2018', total: 3609, mainland: 476 },
  { year: '2019', total: 3717, mainland: 434 },
  { year: '2020', total: 3454, mainland: 68 },
  { year: '2021', total: 3520, mainland: 78 },
  { year: '2022', total: 3566, mainland: 96 },
  { year: '2023', total: 3820, mainland: 590 },
  { year: '2024', total: 4150, mainland: 619 },
];

const hkProductData = [
  { name: '储蓄分红险', value: 42, color: '#6366f1' },
  { name: '终身寿险', value: 28, color: '#8b5cf6' },
  { name: '重疾险', value: 18, color: '#a855f7' },
  { name: '医疗险', value: 8, color: '#c084fc' },
  { name: '其他', value: 4, color: '#e879f9' },
];

// ── AI预测数据 ────────────────────────────────────────────────────
const aiPredictionData = [
  { year: '2025', optimistic: 5.95, base: 5.75, pessimistic: 5.50 },
  { year: '2026', optimistic: 6.55, base: 6.20, pessimistic: 5.80 },
  { year: '2027', optimistic: 7.20, base: 6.70, pessimistic: 6.10 },
  { year: '2028', optimistic: 7.90, base: 7.20, pessimistic: 6.40 },
  { year: '2029', optimistic: 8.65, base: 7.75, pessimistic: 6.70 },
  { year: '2030', optimistic: 9.45, base: 8.30, pessimistic: 7.00 },
];

const hkAiData = [
  { year: '2025', optimistic: 680, base: 650, pessimistic: 580 },
  { year: '2026', optimistic: 760, base: 710, pessimistic: 620 },
  { year: '2027', optimistic: 850, base: 770, pessimistic: 660 },
  { year: '2028', optimistic: 940, base: 830, pessimistic: 700 },
  { year: '2029', optimistic: 1040, base: 895, pessimistic: 740 },
  { year: '2030', optimistic: 1150, base: 960, pessimistic: 780 },
];

// ── 进度条组件 ────────────────────────────────────────────────────
function ProgressBar({
  label, value, max, unit, color, sub, isAI = false
}: {
  label: string; value: number; max: number; unit: string;
  color: string; sub?: string; isAI?: boolean;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="mb-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm text-gray-600">{label}</span>
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
      </div>
      <div className="relative w-full h-3 bg-gray-100 rounded-full overflow-visible">
        <div
          className="h-3 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
        <span
          className="absolute top-1/2 -translate-y-1/2 text-xs font-bold whitespace-nowrap"
          style={{ left: `calc(${pct}% + 6px)`, color: isAI ? color : '#374151' }}
        >
          {value}{unit}{isAI ? ' AI' : ''}
        </span>
      </div>
    </div>
  );
}

// ── 主页面 ────────────────────────────────────────────────────────
export default function InsurancePage() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<'mainland' | 'hk' | 'compare' | 'ai'>('mainland');
  const [selectedYear, setSelectedYear] = useState<typeof aiPredictionData[0] | null>(null);

  const tabs = [
    { key: 'mainland', label: '大陆×AI' },
    { key: 'hk', label: '香港×AI' },
    { key: 'compare', label: '对比×AI' },
    { key: 'ai', label: 'AI预测' },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50 pb-8 max-w-md mx-auto">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <button onClick={() => setLocation('/smart-finance')} className="text-gray-500 text-sm">← 返回</button>
        <span className="font-bold text-base text-gray-800">保险×AI</span>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-purple-600 font-medium"
        >
          刷新
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="flex bg-white border-b border-gray-100 px-2">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? 'text-purple-600 border-b-2 border-purple-600'
                : 'text-gray-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4">

        {/* ── 大陆保险 ── */}
        {activeTab === 'mainland' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-gray-700 mb-3">大陆保费规模趋势（万亿元）</div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={mainlandPremiumData}>
                  <defs>
                    <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} interval={2} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [`${v}万亿`, '']} />
                  <Area type="monotone" dataKey="total" stroke="#6366f1" fill="url(#totalGrad)" strokeWidth={2} name="总保费" />
                  <Area type="monotone" dataKey="life" stroke="#10b981" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="寿险" />
                  <Area type="monotone" dataKey="property" stroke="#f59e0b" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="财险" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-gray-700 mb-3">2024年各险种保费（万亿元）</div>
              {mainlandBarData.map(item => (
                <ProgressBar
                  key={item.name}
                  label={item.name}
                  value={item.value}
                  max={4.5}
                  unit="万亿"
                  color={item.color}
                />
              ))}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-gray-700 mb-2">历年总保费（万亿元）</div>
              {/* 图例 */}
              <div className="flex flex-wrap gap-3 mb-2">
                <span className="flex items-center gap-1" style={{ fontSize: 10, color: '#9ca3af' }}>
                  <span style={{ display: 'inline-block', width: 12, height: 7, borderRadius: 2, background: 'linear-gradient(90deg,#6366f1,#818cf8)' }} />总保费
                </span>
                <span className="flex items-center gap-1" style={{ fontSize: 10, color: '#9ca3af' }}>
                  <span style={{ display: 'inline-block', width: 12, height: 7, borderRadius: 2, background: '#10b981' }} />寿险
                </span>
                <span className="flex items-center gap-1" style={{ fontSize: 10, color: '#9ca3af' }}>
                  <span style={{ display: 'inline-block', width: 12, height: 7, borderRadius: 2, background: '#f59e0b' }} />财险
                </span>
              </div>
              {(() => {
                const ROW_H = 14;
                const BAR_H = 10;
                const LABEL_W = 36;
                const maxTotal = Math.max(...mainlandPremiumData.map(d => d.total));
                const rows = mainlandPremiumData.slice().reverse();
                return rows.map((d, idx) => {
                  const prev = rows[idx + 1];
                  const pct = prev ? ((d.total - prev.total) / prev.total * 100) : null;
                  const barPct = (d.total / maxTotal) * 100;
                  const lifePct = (d.life / maxTotal) * 100;
                  const propPct = (d.property / maxTotal) * 100;
                  const isUp = pct !== null && pct > 0;
                  const pctLabel = pct !== null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '';
                  return (
                    <div
                      key={d.year}
                      className="flex items-center"
                      style={{ height: ROW_H, marginBottom: 1 }}
                    >
                      {/* 年份标签 */}
                      <div
                        className="flex-shrink-0 text-right pr-1.5"
                        style={{
                          width: LABEL_W,
                          fontSize: 9,
                          color: '#9ca3af',
                          fontWeight: 400,
                          lineHeight: `${ROW_H}px`,
                        }}
                      >
                        {d.year}
                      </div>
                      {/* 条形轨道 */}
                      <div
                        className="relative flex-1"
                        style={{ height: BAR_H, borderRadius: 2, background: '#ede9fe' }}
                      >
                        {/* 总保费条 */}
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            height: '100%',
                            width: `${Math.max(barPct, 0.5)}%`,
                            background: 'linear-gradient(90deg,#6366f1 0%,#818cf8 100%)',
                            borderRadius: '2px 3px 3px 2px',
                            transition: `width 0.75s cubic-bezier(0.4,0,0.2,1) ${idx * 15}ms`,
                            boxShadow: 'inset 0 -1px 3px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2)',
                          }}
                        />
                        {/* 寿险细条（叠加在上方，半透明） */}
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            height: '50%',
                            width: `${Math.max(lifePct, 0.5)}%`,
                            background: 'rgba(16,185,129,0.55)',
                            borderRadius: '2px 0 0 0',
                            transition: `width 0.75s cubic-bezier(0.4,0,0.2,1) ${idx * 15 + 80}ms`,
                            pointerEvents: 'none',
                          }}
                        />
                        {/* 财险细条（叠加在下方，半透明） */}
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            height: '50%',
                            width: `${Math.max(propPct, 0.5)}%`,
                            background: 'rgba(245,158,11,0.55)',
                            borderRadius: '0 0 0 2px',
                            transition: `width 0.75s cubic-bezier(0.4,0,0.2,1) ${idx * 15 + 160}ms`,
                            pointerEvents: 'none',
                          }}
                        />
                        {/* 数值标签：总保费值 + 同比 */}
                        <div
                          style={{
                            position: 'absolute',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            ...(barPct >= 25
                              ? { right: `${100 - Math.max(barPct, 0.5)}%`, paddingRight: 3, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.35)' }
                              : { left: `${Math.max(barPct, 0.5)}%`, paddingLeft: 3, color: '#374151' }
                            ),
                            fontSize: 8,
                            fontWeight: 700,
                            lineHeight: 1,
                            whiteSpace: 'nowrap',
                            fontVariantNumeric: 'tabular-nums',
                            pointerEvents: 'none',
                          }}
                        >
                          {d.total}万亿{pctLabel ? ` ${pctLabel}` : ''}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* ── 香港保险 ── */}
        {activeTab === 'hk' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-gray-700 mb-1">香港保费趋势（亿港元）</div>
              <div className="text-xs text-gray-400 mb-3">含内地访客保费</div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={hkPremiumData}>
                  <defs>
                    <linearGradient id="hkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [`${v}亿港元`, '']} />
                  <Area type="monotone" dataKey="total" stroke="#a855f7" fill="url(#hkGrad)" strokeWidth={2} name="总保费" />
                  <Line type="monotone" dataKey="mainland" stroke="#f59e0b" strokeWidth={2} name="内地访客" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-gray-700 mb-3">香港热门险种占比</div>
              {hkProductData.map(item => (
                <ProgressBar
                  key={item.name}
                  label={item.name}
                  value={item.value}
                  max={50}
                  unit="%"
                  color={item.color}
                />
              ))}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-gray-700 mb-3">内地访客赴港投保趋势</div>
              {hkPremiumData.slice().reverse().map(d => (
                <ProgressBar
                  key={d.year}
                  label={`${d.year}年`}
                  value={d.mainland}
                  max={800}
                  unit="亿港元"
                  color="#a855f7"
                  sub={`占总保费${((d.mainland / d.total) * 100).toFixed(1)}%`}
                />
              ))}
            </div>

            {/* 香港保险优势说明 */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-4 border border-purple-100">
              <div className="text-sm font-bold text-purple-800 mb-2">香港保险核心优势</div>
              <div className="space-y-2 text-xs text-purple-700">
                <div className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">▸</span>
                  <span><strong>保费低、保额高：</strong>同等保障比大陆便宜30%-50%，重疾险保额更高</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">▸</span>
                  <span><strong>分红率高：</strong>储蓄险历史分红率6%-8%，远高于大陆产品</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">▸</span>
                  <span><strong>美元计价：</strong>可对冲人民币汇率风险，资产配置更灵活</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">▸</span>
                  <span><strong>全球理赔：</strong>不受地域限制，适合有海外资产配置需求人群</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 对比 ── */}
        {activeTab === 'compare' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-gray-700 mb-3">大陆 vs 香港保险对比</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-gray-500 font-medium">维度</th>
                      <th className="text-center py-2 text-indigo-600 font-medium">大陆保险</th>
                      <th className="text-center py-2 text-purple-600 font-medium">香港保险</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {[
                      ['市场规模', '5.42万亿元', '4,150亿港元'],
                      ['保费增速', '+5.9%/年', '+8.6%/年'],
                      ['重疾险保额', '50-100万', '100-300万'],
                      ['储蓄险分红', '3%-4%', '6%-8%'],
                      ['货币', '人民币', '港元/美元'],
                      ['理赔范围', '境内为主', '全球理赔'],
                      ['监管机构', '国家金融监管总局', '保险业监管局'],
                      ['购买门槛', '本地居民', '需赴港面签'],
                    ].map(([dim, ml, hk]) => (
                      <tr key={dim}>
                        <td className="py-2 text-gray-500">{dim}</td>
                        <td className="py-2 text-center text-gray-700">{ml}</td>
                        <td className="py-2 text-center text-purple-700">{hk}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-gray-700 mb-3">大陆保费 vs 香港内地访客保费趋势</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={[
                  { year: '2019', mainland: 42600, hk: 434 },
                  { year: '2020', mainland: 45300, hk: 68 },
                  { year: '2021', mainland: 44900, hk: 78 },
                  { year: '2022', mainland: 47000, hk: 96 },
                  { year: '2023', mainland: 51200, hk: 590 },
                  { year: '2024', mainland: 54200, hk: 619 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar yAxisId="left" dataKey="mainland" fill="#6366f1" name="大陆保费(亿)" radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="right" dataKey="hk" fill="#a855f7" name="港险内地客(亿港元)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-gray-700 mb-3">适合人群分析</div>
              <div className="space-y-3">
                {[
                  { type: '大陆保险适合', items: ['本地居民基础保障', '中低收入人群', '不方便出境人群', '需要快速理赔'], color: '#6366f1' },
                  { type: '香港保险适合', items: ['高净值人群资产配置', '有海外资产需求', '追求高分红储蓄', '需要全球医疗保障'], color: '#a855f7' },
                ].map(group => (
                  <div key={group.type} className="rounded-xl p-3" style={{ background: `${group.color}10`, border: `1px solid ${group.color}30` }}>
                    <div className="text-xs font-bold mb-2" style={{ color: group.color }}>{group.type}</div>
                    <div className="grid grid-cols-2 gap-1">
                      {group.items.map(item => (
                        <div key={item} className="text-xs text-gray-600 flex items-center gap-1">
                          <span style={{ color: group.color }}>✓</span> {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── AI预测 ── */}
        {activeTab === 'ai' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-gray-700 mb-1">大陆保费规模预测（万亿元）</div>
              <div className="text-xs text-gray-400 mb-3">2025-2030年三情景预测</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={aiPredictionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} domain={[5, 10]} />
                  <Tooltip formatter={(v: number) => [`${v}万亿`, '']} />
                  <Line type="monotone" dataKey="optimistic" stroke="#10b981" strokeWidth={2} name="乐观" dot={false} />
                  <Line type="monotone" dataKey="base" stroke="#6366f1" strokeWidth={2.5} name="基准" dot={false} />
                  <Line type="monotone" dataKey="pessimistic" stroke="#ef4444" strokeWidth={2} name="悲观" dot={false} strokeDasharray="5 3" />
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-gray-700 mb-3">大陆保费逐年预测</div>
              {aiPredictionData.map(d => (
                <div
                  key={d.year}
                  className="mb-3 cursor-pointer"
                  onClick={() => setSelectedYear(selectedYear?.year === d.year ? null : d)}
                >
                  <ProgressBar
                    label={`${d.year}年`}
                    value={d.base}
                    max={10}
                    unit="万亿"
                    color="#6366f1"
                    isAI
                  />
                  {selectedYear?.year === d.year && (
                    <div className="mt-2 p-3 bg-indigo-50 rounded-xl text-xs space-y-2">
                      <div className="font-bold text-indigo-700 mb-1">{d.year}年三情景预测</div>
                      {[
                        { label: '乐观', value: d.optimistic, color: '#10b981' },
                        { label: '基准', value: d.base, color: '#6366f1' },
                        { label: '悲观', value: d.pessimistic, color: '#ef4444' },
                      ].map(s => (
                        <div key={s.label} className="flex justify-between items-center">
                          <span style={{ color: s.color }} className="font-medium">{s.label}</span>
                          <div className="flex-1 mx-3 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${(s.value / 10) * 100}%`, background: s.color }} />
                          </div>
                          <span className="font-bold" style={{ color: s.color }}>{s.value}万亿</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="text-sm font-semibold text-gray-700 mb-1">香港内地访客保费预测（亿港元）</div>
              <div className="text-xs text-gray-400 mb-3">2025-2030年三情景预测</div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={hkAiData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [`${v}亿港元`, '']} />
                  <Line type="monotone" dataKey="optimistic" stroke="#10b981" strokeWidth={2} name="乐观" dot={false} />
                  <Line type="monotone" dataKey="base" stroke="#a855f7" strokeWidth={2.5} name="基准" dot={false} />
                  <Line type="monotone" dataKey="pessimistic" stroke="#ef4444" strokeWidth={2} name="悲观" dot={false} strokeDasharray="5 3" />
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* AI核心判断 */}
            <div className="bg-gradient-to-br from-purple-900 to-indigo-900 rounded-2xl p-4 text-white">
              <div className="text-sm font-bold mb-3">🤖 AI核心判断</div>
              <div className="space-y-2 text-xs text-purple-100">
                <div className="flex items-start gap-2">
                  <span className="text-purple-300 mt-0.5">▸</span>
                  <span><strong className="text-white">大陆保险：</strong>老龄化加速推动健康险、养老险需求，预计2030年总保费突破8万亿，年均增速约8%</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-purple-300 mt-0.5">▸</span>
                  <span><strong className="text-white">香港保险：</strong>内地访客恢复强劲，2024年已达619亿港元，预计2026年突破700亿，储蓄险仍是主力</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-purple-300 mt-0.5">▸</span>
                  <span><strong className="text-white">风险提示：</strong>利率下行压缩险企利差，大陆寿险公司面临资产负债匹配压力，港险分红实现率需关注</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-purple-300 mt-0.5">▸</span>
                  <span><strong className="text-white">投资机会：</strong>健康险、养老险赛道长期看好，头部险企（平安、国寿、友邦）具备穿越周期能力</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
