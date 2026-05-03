/**
 * 宏观数据页面 - 中国出生人口数据
 * 路由：/macro-data
 * 包含：
 * 1. 全国年度出生人口趋势图（1949-2025）
 * 2. 分省出生率排行（2019年）
 * 3. 七普分省性别比（2020年）
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Baby, Users, TrendingDown, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from "recharts";

// ── 颜色常量 ──────────────────────────────────────────────────────────────────
const BG_DARK = "#0f1117";
const BG_CARD = "#1a1d27";
const BG_CARD2 = "#1e2130";
const ACCENT = "#e53935";
const ACCENT_LIGHT = "#ff6b6b";
const GOLD = "#F5D78E";
const GOLD_DARK = "#C9A84C";
const TEXT_PRIMARY = "#f0f0f0";
const TEXT_MUTED = "#8a8fa8";
const MALE_COLOR = "#4A90D9";
const FEMALE_COLOR = "#E57373";

// ── Tab 类型 ──────────────────────────────────────────────────────────────────
type TabType = 'national' | 'provincial' | 'gender';

// ── 自定义 Tooltip ─────────────────────────────────────────────────────────────
const NationalTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  return (
    <div style={{ background: '#2a2d3e', border: '1px solid #3a3d4e', borderRadius: 8, padding: '8px 12px' }}>
      <div style={{ color: GOLD, fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{label}年</div>
      <div style={{ color: TEXT_PRIMARY, fontSize: 14, fontWeight: 700 }}>
        {val?.toLocaleString()} <span style={{ color: TEXT_MUTED, fontSize: 11 }}>万人</span>
      </div>
    </div>
  );
};

const BarTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#2a2d3e', border: '1px solid #3a3d4e', borderRadius: 8, padding: '8px 12px' }}>
      <div style={{ color: GOLD, fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{label}</div>
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
  { year: 1963, label: '历史峰值' },
  { year: 1980, label: '独生子女' },
  { year: 2016, label: '全面二孩' },
  { year: 2021, label: '三孩政策' },
];

export default function MacroDataPage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('national');
  const [selectedYear, setSelectedYear] = useState<number>(2019);

  // 获取数据
  const { data: nationalData, isLoading: loadingNational } = trpc.macro.getNationalBirthData.useQuery();
  const { data: provincialData, isLoading: loadingProvincial } = trpc.macro.getProvincialBirthRate.useQuery();
  const { data: genderData, isLoading: loadingGender } = trpc.macro.getProvincialGender2020.useQuery();

  // 全国趋势图数据（每5年一个刻度，避免拥挤）
  const chartData = useMemo(() => {
    if (!nationalData?.data) return [];
    return nationalData.data;
  }, [nationalData]);

  // X轴刻度：每10年显示一次
  const xTicks = useMemo(() => {
    return chartData.filter(d => d.year % 10 === 0).map(d => d.year);
  }, [chartData]);

  // 最新数据摘要
  const latestData = useMemo(() => {
    if (!nationalData?.data?.length) return null;
    const arr = nationalData.data;
    const latest = arr[arr.length - 1];
    const prev = arr[arr.length - 2];
    const peak = arr.reduce((a, b) => a.births > b.births ? a : b);
    return { latest, prev, peak, change: latest.births - prev.births };
  }, [nationalData]);

  // 分省排行（按选中年份）
  const provincialRanking = useMemo(() => {
    if (!provincialData?.data?.byProvince) return [];
    return provincialData.data.byProvince.map(p => ({
      province: p.province,
      rate: p.data.find(d => d.year === selectedYear)?.rate ?? 0,
    })).sort((a, b) => b.rate - a.rate);
  }, [provincialData, selectedYear]);

  const isLoading = loadingNational || loadingProvincial || loadingGender;

  return (
    <div
      className="min-h-screen pb-8 max-w-md mx-auto relative"
      style={{ background: BG_DARK, color: TEXT_PRIMARY }}
    >
      {/* ── 顶部导航 ── */}
      <div
        className="sticky top-0 z-20 flex items-center px-4 py-3"
        style={{ background: 'rgba(15,17,23,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center justify-center w-8 h-8 rounded-full mr-3"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <ChevronLeft className="w-5 h-5" style={{ color: TEXT_PRIMARY }} />
        </button>
        <div className="flex items-center space-x-2 flex-1">
          <Baby className="w-5 h-5" style={{ color: GOLD }} />
          <span className="text-base font-bold" style={{ color: TEXT_PRIMARY }}>人口</span>
          <span className="text-base font-bold" style={{ color: GOLD }}>×</span>
          <span className="text-base font-bold" style={{ color: ACCENT_LIGHT }}>AI</span>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center justify-center w-8 h-8 rounded-full"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <RefreshCw className="w-4 h-4" style={{ color: TEXT_MUTED }} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: GOLD }} />
            <div style={{ color: TEXT_MUTED, fontSize: 13 }}>加载数据中...</div>
          </div>
        </div>
      ) : (
        <>
          {/* ── 数据摘要卡片 ── */}
          {latestData && (
            <div className="px-4 pt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl p-3 text-center" style={{ background: BG_CARD, border: '1px solid rgba(229,57,53,0.3)' }}>
                <div style={{ color: TEXT_MUTED, fontSize: 10 }}>2025年出生</div>
                <div style={{ color: ACCENT_LIGHT, fontSize: 18, fontWeight: 800 }}>{latestData.latest.births}</div>
                <div style={{ color: TEXT_MUTED, fontSize: 10 }}>万人</div>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: BG_CARD, border: '1px solid rgba(245,215,142,0.3)' }}>
                <div style={{ color: TEXT_MUTED, fontSize: 10 }}>历史峰值</div>
                <div style={{ color: GOLD, fontSize: 18, fontWeight: 800 }}>{latestData.peak.births}</div>
                <div style={{ color: TEXT_MUTED, fontSize: 10 }}>{latestData.peak.year}年</div>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: BG_CARD, border: '1px solid rgba(74,144,217,0.3)' }}>
                <div style={{ color: TEXT_MUTED, fontSize: 10 }}>较上年</div>
                <div style={{ color: latestData.change < 0 ? ACCENT_LIGHT : '#4CAF50', fontSize: 18, fontWeight: 800 }}>
                  {latestData.change > 0 ? '+' : ''}{latestData.change}
                </div>
                <div style={{ color: TEXT_MUTED, fontSize: 10 }}>万人</div>
              </div>
            </div>
          )}

          {/* ── Tab 切换 ── */}
          <div className="px-4 mt-4">
            <div className="flex rounded-xl p-1" style={{ background: BG_CARD }}>
              {([
                { key: 'national', label: '趋势×AI', icon: TrendingDown },
                { key: 'provincial', label: '分省×AI', icon: Users },
                { key: 'gender', label: '性别×AI', icon: Baby },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: activeTab === key ? ACCENT : 'transparent',
                    color: activeTab === key ? '#fff' : TEXT_MUTED,
                  }}
                >
                  <Icon className="w-3 h-3" />
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
                <div className="rounded-xl p-4" style={{ background: BG_CARD }}>
                  <div className="flex items-center justify-between mb-3">
                    <span style={{ color: TEXT_PRIMARY, fontSize: 13, fontWeight: 700 }}>出生人口×AI（万人）</span>
                    <span style={{ color: TEXT_MUTED, fontSize: 11 }}>1949—2025</span>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="birthGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={ACCENT} stopOpacity={0.4} />
                          <stop offset="95%" stopColor={ACCENT} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="year"
                        ticks={xTicks}
                        tick={{ fill: TEXT_MUTED, fontSize: 10 }}
                        axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
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
                          stroke={GOLD_DARK}
                          strokeDasharray="4 3"
                          strokeWidth={1}
                          label={{ value: ev.label, position: 'top', fill: GOLD_DARK, fontSize: 9 }}
                        />
                      ))}
                      <Area
                        type="monotone"
                        dataKey="births"
                        stroke={ACCENT}
                        strokeWidth={2}
                        fill="url(#birthGrad)"
                        dot={false}
                        activeDot={{ r: 4, fill: ACCENT_LIGHT }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* 关键节点说明 */}
                <div className="mt-3 rounded-xl p-3" style={{ background: BG_CARD2 }}>
                  <div style={{ color: TEXT_MUTED, fontSize: 11, marginBottom: 6 }}>关键政策节点</div>
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
                        <span className="text-xs font-bold shrink-0 mt-0.5" style={{ color: GOLD, minWidth: 32 }}>{item.year}</span>
                        <span style={{ color: TEXT_MUTED, fontSize: 11 }}>{item.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 分省排行 */}
            {activeTab === 'provincial' && (
              <div>
                {/* 年份选择 */}
                <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
                  {[2010, 2012, 2014, 2016, 2017, 2018, 2019].map(y => (
                    <button
                      key={y}
                      onClick={() => setSelectedYear(y)}
                      className="shrink-0 px-3 py-1 rounded-lg text-xs font-semibold"
                      style={{
                        background: selectedYear === y ? ACCENT : BG_CARD,
                        color: selectedYear === y ? '#fff' : TEXT_MUTED,
                        border: `1px solid ${selectedYear === y ? ACCENT : 'rgba(255,255,255,0.08)'}`,
                      }}
                    >
                      {y}年
                    </button>
                  ))}
                </div>

                <div className="rounded-xl p-4" style={{ background: BG_CARD }}>
                  <div className="flex items-center justify-between mb-3">
                    <span style={{ color: TEXT_PRIMARY, fontSize: 13, fontWeight: 700 }}>分省出生率×AI（‰）</span>
                    <span style={{ color: TEXT_MUTED, fontSize: 11 }}>{selectedYear}年</span>
                  </div>
                  <ResponsiveContainer width="100%" height={500}>
                    <BarChart
                      data={provincialRanking}
                      layout="vertical"
                      margin={{ top: 0, right: 30, left: 30, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fill: TEXT_MUTED, fontSize: 9 }}
                        axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
                        tickLine={false}
                        domain={[0, 20]}
                      />
                      <YAxis
                        type="category"
                        dataKey="province"
                        tick={{ fill: TEXT_MUTED, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                      />
                      <Tooltip content={<BarTooltip />} />
                      <Bar dataKey="rate" name="出生率" radius={[0, 3, 3, 0]}>
                        {provincialRanking.map((entry, index) => (
                          <Cell
                            key={entry.province}
                            fill={index < 5 ? ACCENT : index < 10 ? '#E57373' : index > 25 ? '#4A90D9' : '#5a8a6a'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-2 rounded-xl p-3" style={{ background: BG_CARD2 }}>
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
                {/* 全国数据 */}
                <div className="rounded-xl p-4 mb-3" style={{ background: BG_CARD, border: `1px solid rgba(245,215,142,0.2)` }}>
                  <div style={{ color: GOLD, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>性别×AI 全国总体（七普 2020年）</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <div style={{ color: MALE_COLOR, fontSize: 20, fontWeight: 800 }}>{genderData.national.malePct}%</div>
                      <div style={{ color: TEXT_MUTED, fontSize: 10 }}>男性占比</div>
                    </div>
                    <div className="text-center">
                      <div style={{ color: GOLD, fontSize: 20, fontWeight: 800 }}>{genderData.national.sexRatio}</div>
                      <div style={{ color: TEXT_MUTED, fontSize: 10 }}>性别比</div>
                      <div style={{ color: TEXT_MUTED, fontSize: 9 }}>（女=100）</div>
                    </div>
                    <div className="text-center">
                      <div style={{ color: FEMALE_COLOR, fontSize: 20, fontWeight: 800 }}>{genderData.national.femalePct}%</div>
                      <div style={{ color: TEXT_MUTED, fontSize: 10 }}>女性占比</div>
                    </div>
                  </div>
                  {/* 进度条 */}
                  <div className="mt-3 h-3 rounded-full overflow-hidden flex">
                    <div style={{ width: `${genderData.national.malePct}%`, background: MALE_COLOR }} />
                    <div style={{ width: `${genderData.national.femalePct}%`, background: FEMALE_COLOR }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span style={{ color: MALE_COLOR, fontSize: 10 }}>男 {genderData.national.malePct}%</span>
                    <span style={{ color: FEMALE_COLOR, fontSize: 10 }}>女 {genderData.national.femalePct}%</span>
                  </div>
                </div>

                {/* 分省性别比排行 */}
                <div className="rounded-xl p-4" style={{ background: BG_CARD }}>
                  <div className="flex items-center justify-between mb-3">
                    <span style={{ color: TEXT_PRIMARY, fontSize: 13, fontWeight: 700 }}>分省性别比×AI</span>
                    <span style={{ color: TEXT_MUTED, fontSize: 11 }}>七普 2020年</span>
                  </div>
                  <div className="space-y-2">
                    {genderData.data.map((item, index) => (
                      <div key={item.province} className="flex items-center gap-2">
                        <span
                          className="text-xs font-bold w-5 text-center shrink-0"
                          style={{ color: index < 3 ? GOLD : TEXT_MUTED }}
                        >
                          {index + 1}
                        </span>
                        <span style={{ color: TEXT_PRIMARY, fontSize: 12, minWidth: 36 }}>{item.province}</span>
                        <div className="flex-1 h-4 rounded overflow-hidden flex">
                          <div
                            style={{
                              width: `${item.malePct}%`,
                              background: MALE_COLOR,
                              opacity: 0.85,
                            }}
                          />
                          <div
                            style={{
                              width: `${item.femalePct}%`,
                              background: FEMALE_COLOR,
                              opacity: 0.85,
                            }}
                          />
                        </div>
                        <span
                          style={{
                            color: item.sexRatio > 110 ? ACCENT_LIGHT : item.sexRatio > 105 ? GOLD : TEXT_MUTED,
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
                  <div className="flex items-center gap-4 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
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

                <div className="mt-2 rounded-xl p-3" style={{ background: BG_CARD2 }}>
                  <div style={{ color: TEXT_MUTED, fontSize: 11 }}>
                    数据来源：第七次全国人口普查（2020年）。广东（113.1）、海南（112.9）性别比最高；
                    辽宁（99.7）、吉林（99.7）性别比低于100，女性略多于男性。
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
