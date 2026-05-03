/**
 * 房产×AI 宏观数据页面
 * 路由：/real-estate
 * 风格：白色/浅灰官方风格（与人口×AI 一致）
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, RefreshCw } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from "recharts";

// ── 颜色常量 ──────────────────────────────────────────────────────────────────
const BG_PAGE    = "#f5f6f8";
const BG_WHITE   = "#ffffff";
const BG_SUBTLE  = "#f0f2f5";
const BORDER     = "#e4e7ed";
const ACCENT     = "#1a56db";
const ACCENT2    = "#e53935";
const TEXT_MAIN  = "#1a1a2e";
const TEXT_SUB   = "#6b7280";
const TEXT_MUTED = "#9ca3af";
const GOLD_LINE  = "#d97706";
const AI_COLOR   = "#7c3aed";

// ── Tab 类型 ──────────────────────────────────────────────────────────────────
type TabType = 'price' | 'sales' | 'city' | 'prediction';

// ── 全国商品房均价历史数据（元/㎡，1998-2024）─────────────────────────────────
const PRICE_DATA = [
  { year: 1998, price: 1854 },
  { year: 1999, price: 1857 },
  { year: 2000, price: 1948 },
  { year: 2001, price: 2017 },
  { year: 2002, price: 2092 },
  { year: 2003, price: 2197 },
  { year: 2004, price: 2408 },
  { year: 2005, price: 2937 },
  { year: 2006, price: 3119 },
  { year: 2007, price: 3645 },
  { year: 2008, price: 3576 },
  { year: 2009, price: 4459 },
  { year: 2010, price: 4725 },
  { year: 2011, price: 4993 },
  { year: 2012, price: 5430 },
  { year: 2013, price: 6237 },
  { year: 2014, price: 6324 },
  { year: 2015, price: 6473 },
  { year: 2016, price: 7203 },
  { year: 2017, price: 7892 },
  { year: 2018, price: 8544 },
  { year: 2019, price: 9310 },
  { year: 2020, price: 9860 },
  { year: 2021, price: 10139 },
  { year: 2022, price: 9970 },
  { year: 2023, price: 9588 },
  { year: 2024, price: 9200 },
];

// ── 全国商品房销售面积（亿㎡，2000-2024）─────────────────────────────────────
const SALES_DATA = [
  { year: 2000, area: 1.86 },
  { year: 2001, area: 2.16 },
  { year: 2002, area: 2.50 },
  { year: 2003, area: 3.41 },
  { year: 2004, area: 3.38 },
  { year: 2005, area: 5.55 },
  { year: 2006, area: 6.18 },
  { year: 2007, area: 7.64 },
  { year: 2008, area: 6.60 },
  { year: 2009, area: 9.37 },
  { year: 2010, area: 10.43 },
  { year: 2011, area: 10.99 },
  { year: 2012, area: 11.13 },
  { year: 2013, area: 13.06 },
  { year: 2014, area: 12.06 },
  { year: 2015, area: 12.85 },
  { year: 2016, area: 15.73 },
  { year: 2017, area: 16.94 },
  { year: 2018, area: 17.17 },
  { year: 2019, area: 17.16 },
  { year: 2020, area: 17.61 },
  { year: 2021, area: 17.94 },
  { year: 2022, area: 13.58 },
  { year: 2023, area: 11.17 },
  { year: 2024, area: 9.73 },
];

// ── 主要城市二手房均价（2024年，元/㎡）──────────────────────────────────────
const CITY_PRICE_DATA = [
  { city: '北京', price: 58200, change: -8.2 },
  { city: '上海', price: 55800, change: -6.5 },
  { city: '深圳', price: 52300, change: -12.4 },
  { city: '广州', price: 28600, change: -14.1 },
  { city: '杭州', price: 27800, change: -9.3 },
  { city: '南京', price: 22400, change: -11.2 },
  { city: '苏州', price: 21600, change: -10.8 },
  { city: '成都', price: 18900, change: -7.6 },
  { city: '武汉', price: 16200, change: -13.5 },
  { city: '西安', price: 13800, change: -9.1 },
  { city: '重庆', price: 12400, change: -8.7 },
  { city: '郑州', price: 11600, change: -15.3 },
];

// ── AI 预测数据（2025-2034）────────────────────────────────────────────────────
const AI_PREDICTION_DATA = [
  { year: 2025, price: 8800, optimistic: 9200, pessimistic: 8200, confidence: 85, keyFactor: '政策托底效果有限，人口下行与库存高企双重压制' },
  { year: 2026, price: 8500, optimistic: 9100, pessimistic: 7800, confidence: 83, keyFactor: '新房库存去化周期仍超24个月，需求端持续萎缩' },
  { year: 2027, price: 8300, optimistic: 9000, pessimistic: 7500, confidence: 81, keyFactor: '人口出生率下降导致长期需求减弱，城镇化率接近天花板' },
  { year: 2028, price: 8100, optimistic: 8800, pessimistic: 7200, confidence: 79, keyFactor: '老龄化加速，二手房供给增加，整体市场供过于求' },
  { year: 2029, price: 7900, optimistic: 8600, pessimistic: 7000, confidence: 77, keyFactor: '人口净减少效应显现，三四线城市价格持续下行' },
  { year: 2030, price: 7700, optimistic: 8400, pessimistic: 6800, confidence: 75, keyFactor: '城镇化率趋于稳定，增量需求基本消失，存量市场主导' },
  { year: 2031, price: 7500, optimistic: 8200, pessimistic: 6600, confidence: 73, keyFactor: '老龄化房屋释放加速，遗产房大量入市，供给压力增大' },
  { year: 2032, price: 7300, optimistic: 8000, pessimistic: 6400, confidence: 71, keyFactor: '人口持续萎缩，房屋空置率上升，租售比进一步恶化' },
  { year: 2033, price: 7100, optimistic: 7800, pessimistic: 6200, confidence: 69, keyFactor: '结构性供过于求格局固化，核心城市分化加剧' },
  { year: 2034, price: 6900, optimistic: 7600, pessimistic: 6000, confidence: 67, keyFactor: '长期人口趋势不可逆，房产作为投资品属性持续弱化' },
];

// ── 进度条常量 ────────────────────────────────────────────────────────────────
const ROW_H = 14;
const BAR_H = 11;
const LABEL_W = 30;

// ── 自定义 Tooltip ─────────────────────────────────────────────────────────────
const PriceTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <div style={{ color: TEXT_SUB, fontSize: 11, marginBottom: 2 }}>{label}年</div>
      <div style={{ color: TEXT_MAIN, fontSize: 14, fontWeight: 700 }}>
        {payload[0]?.value?.toLocaleString()} <span style={{ color: TEXT_MUTED, fontSize: 11 }}>元/㎡</span>
      </div>
    </div>
  );
};

const SalesTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <div style={{ color: TEXT_SUB, fontSize: 11, marginBottom: 2 }}>{label}年</div>
      <div style={{ color: TEXT_MAIN, fontSize: 14, fontWeight: 700 }}>
        {payload[0]?.value?.toFixed(2)} <span style={{ color: TEXT_MUTED, fontSize: 11 }}>亿㎡</span>
      </div>
    </div>
  );
};

export default function RealEstatePage() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('price');
  const [predictionModal, setPredictionModal] = useState<typeof AI_PREDICTION_DATA[0] | null>(null);

  const TABS = [
    { key: 'price' as TabType, label: '均价×AI' },
    { key: 'sales' as TabType, label: '销量×AI' },
    { key: 'city' as TabType, label: '城市×AI' },
    { key: 'prediction' as TabType, label: 'AI预测' },
  ];

  const maxPrice = useMemo(() => Math.max(...PRICE_DATA.map(d => d.price)), []);
  const maxSales = useMemo(() => Math.max(...SALES_DATA.map(d => d.area)), []);
  const maxCityPrice = useMemo(() => Math.max(...CITY_PRICE_DATA.map(d => d.price)), []);
  const maxPredPrice = useMemo(() => Math.max(...AI_PREDICTION_DATA.map(d => d.price)), []);

  // 均价进度条：合并历史+预测
  const priceRows = useMemo(() => {
    const hist = [...PRICE_DATA].reverse().map(d => ({ year: d.year, price: d.price, isPrediction: false }));
    const pred = AI_PREDICTION_DATA.map(d => ({ year: d.year, price: d.price, isPrediction: true, confidence: d.confidence }));
    return [...pred.slice().reverse(), ...hist];
  }, []);

  const overallMax = useMemo(() => Math.max(maxPrice, maxPredPrice), [maxPrice, maxPredPrice]);

  return (
    <div className="min-h-screen pb-10 max-w-md mx-auto relative" style={{ background: BG_PAGE, color: TEXT_MAIN }}>
      {/* ── 顶部导航 ── */}
      <div className="sticky top-0 z-20 flex items-center px-4 py-3" style={{ background: '#fff', borderBottom: `1px solid ${BORDER}` }}>
        <button
          onClick={() => navigate("/")}
          className="flex items-center justify-center w-8 h-8 rounded-full mr-3"
          style={{ background: BG_SUBTLE }}
        >
          <ChevronLeft className="w-5 h-5" style={{ color: TEXT_MAIN }} />
        </button>
        <div className="flex items-center gap-1 flex-1">
          <span className="text-base font-bold" style={{ color: TEXT_MAIN }}>房产</span>
          <span className="text-base font-bold" style={{ color: ACCENT }}>×</span>
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

      {/* ── Tab 栏 ── */}
      <div className="sticky top-[53px] z-10 flex px-4 gap-2 py-2" style={{ background: BG_PAGE, borderBottom: `1px solid ${BORDER}` }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: activeTab === tab.key ? (tab.key === 'prediction' ? AI_COLOR : ACCENT) : BG_WHITE,
              color: activeTab === tab.key ? '#fff' : TEXT_SUB,
              border: `1px solid ${activeTab === tab.key ? 'transparent' : BORDER}`,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-4 pt-3 space-y-4">

        {/* ══ 均价×AI Tab ══ */}
        {activeTab === 'price' && (
          <>
            {/* 关键指标卡片 */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '2024均价', value: '9,200', unit: '元/㎡', color: ACCENT2 },
                { label: '历史峰值', value: '10,139', unit: '元/㎡（2021）', color: GOLD_LINE },
                { label: '较峰值', value: '-9.3%', unit: '已回调', color: ACCENT2 },
              ].map((item, i) => (
                <div key={i} className="rounded-xl p-3 text-center" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.value}</div>
                  <div style={{ fontSize: 9, color: TEXT_MUTED }}>{item.unit}</div>
                </div>
              ))}
            </div>

            {/* 均价趋势折线图 */}
            <div className="rounded-xl p-3" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div className="flex items-center justify-between mb-2">
                <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_MAIN }}>全国商品房均价趋势（1998-2024）</span>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={PRICE_DATA} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={ACCENT} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={ACCENT} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<PriceTooltip />} />
                  <ReferenceLine x={2008} stroke={GOLD_LINE} strokeDasharray="3 3" label={{ value: '金融危机', position: 'top', fontSize: 8, fill: GOLD_LINE }} />
                  <ReferenceLine x={2021} stroke={ACCENT2} strokeDasharray="3 3" label={{ value: '调控峰值', position: 'top', fontSize: 8, fill: ACCENT2 }} />
                  <Area type="monotone" dataKey="price" stroke={ACCENT} strokeWidth={2} fill="url(#priceGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* 年度均价进度条列表（含AI预测） */}
            <div className="rounded-xl p-3" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div className="flex items-center justify-between mb-2">
                <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_MAIN }}>年度均价列表</span>
                <div className="flex items-center gap-2" style={{ fontSize: 9, color: TEXT_MUTED }}>
                  <span style={{ display: 'inline-block', width: 12, height: 8, borderRadius: 2, background: AI_COLOR, opacity: 0.85 }} />AI预测
                </div>
              </div>
              {(() => {
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {priceRows.map((row, idx, arr) => {
                      const isPrediction = row.isPrediction;
                      const prev = arr[idx + 1];
                      const pct = prev ? ((row.price - prev.price) / prev.price * 100) : null;
                      const isDown = pct !== null && pct < 0;
                      const isPeak = !isPrediction && row.price === maxPrice;
                      const barPct = (row.price / overallMax) * 100;
                      const barColor = isPrediction
                        ? `linear-gradient(90deg, ${AI_COLOR} 0%, #a78bfa 100%)`
                        : isPeak
                          ? `linear-gradient(90deg, ${GOLD_LINE} 0%, #f59e0b 100%)`
                          : isDown
                            ? `linear-gradient(90deg, ${ACCENT2} 0%, #f87171 100%)`
                            : `linear-gradient(90deg, ${ACCENT} 0%, #60a5fa 100%)`;
                      const numLabel = `${row.price.toLocaleString()}`;
                      const pctLabel = pct !== null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '';
                      const confidence = isPrediction ? (row as any).confidence : null;
                      const isFirstHistorical = !isPrediction && (idx === 0 || (arr[idx - 1] as any).isPrediction);
                      return (
                        <>
                          {isFirstHistorical && (
                            <div key={`sep-${row.year}`} style={{ height: 1, background: BORDER, margin: '4px 0', width: '100%' }} />
                          )}
                          <div
                            key={row.year}
                            className="flex items-center"
                            style={{ height: isPrediction ? ROW_H + 4 : ROW_H, marginBottom: isPrediction ? 2 : 0, opacity: isPrediction ? 0.95 : 1, cursor: isPrediction ? 'pointer' : 'default', borderRadius: isPrediction ? 3 : 0, padding: isPrediction ? '0 2px' : 0 }}
                            onClick={() => isPrediction ? setPredictionModal(AI_PREDICTION_DATA.find(d => d.year === row.year) ?? null) : undefined}
                          >
                            <div className="flex-shrink-0 text-right pr-1.5" style={{ width: LABEL_W, fontSize: 9, color: isPrediction ? AI_COLOR : isPeak ? GOLD_LINE : TEXT_MUTED, fontWeight: isPeak ? 700 : 400, lineHeight: `${ROW_H}px` }}>
                              {row.year}
                            </div>
                            <div className="relative flex-1" style={{ height: BAR_H, borderRadius: 2, background: '#E8E0D8' }}>
                              <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${Math.max(barPct, 0.5)}%`, background: barColor, borderRadius: '2px 3px 3px 2px', transition: `width 0.75s cubic-bezier(0.4,0,0.2,1) ${idx * 12}ms`, boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)' }} />
                              <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', ...(isPrediction ? { left: `${Math.max(barPct, 0.5)}%`, paddingLeft: 3, color: AI_COLOR } : barPct >= 20 ? { right: `${100 - Math.max(barPct, 0.5)}%`, paddingRight: 3, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.4)' } : { left: `${Math.max(barPct, 0.5)}%`, paddingLeft: 3, color: TEXT_MAIN }), fontSize: 8, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
                                {numLabel}{isPrediction && <span style={{ marginLeft: 2, fontSize: 7, fontWeight: 700, color: AI_COLOR, background: 'rgba(124,58,237,0.1)', borderRadius: 2, padding: '0 2px' }}>AI</span>}
                              </div>
                            </div>
                            <div className="flex-shrink-0 pl-1.5" style={{ fontSize: 8, color: isPrediction ? AI_COLOR : isDown ? ACCENT2 : (pct !== null && pct > 0) ? '#16a34a' : TEXT_MUTED, fontWeight: 600, lineHeight: `${ROW_H}px`, width: 42, textAlign: 'right' }}>
                              {isPrediction ? `${confidence}%` : pctLabel}
                            </div>
                          </div>
                        </>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </>
        )}

        {/* ══ 销量×AI Tab ══ */}
        {activeTab === 'sales' && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '2024销售面积', value: '9.73', unit: '亿㎡', color: ACCENT2 },
                { label: '历史峰值', value: '17.94', unit: '亿㎡（2021）', color: GOLD_LINE },
                { label: '较峰值', value: '-45.8%', unit: '已腰斩', color: ACCENT2 },
              ].map((item, i) => (
                <div key={i} className="rounded-xl p-3 text-center" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
                  <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.value}</div>
                  <div style={{ fontSize: 9, color: TEXT_MUTED }}>{item.unit}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-3" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div className="mb-2">
                <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_MAIN }}>全国商品房销售面积（2000-2024）</span>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={SALES_DATA} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} tickFormatter={v => `${v}`} />
                  <Tooltip content={<SalesTooltip />} />
                  <ReferenceLine y={17.94} stroke={GOLD_LINE} strokeDasharray="3 3" label={{ value: '峰值', position: 'right', fontSize: 8, fill: GOLD_LINE }} />
                  <Bar dataKey="area" radius={[2, 2, 0, 0]}>
                    {SALES_DATA.map((entry, index) => (
                      <Cell key={index} fill={entry.year >= 2022 ? ACCENT2 : entry.area === 17.94 ? GOLD_LINE : ACCENT} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 销售面积进度条 */}
            <div className="rounded-xl p-3" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div className="mb-2">
                <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_MAIN }}>年度销售面积列表</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {[...SALES_DATA].reverse().map((row, idx, arr) => {
                  const prev = arr[idx + 1];
                  const pct = prev ? ((row.area - prev.area) / prev.area * 100) : null;
                  const isDown = pct !== null && pct < 0;
                  const isPeak = row.area === maxSales;
                  const barPct = (row.area / maxSales) * 100;
                  const barColor = isPeak
                    ? `linear-gradient(90deg, ${GOLD_LINE} 0%, #f59e0b 100%)`
                    : isDown
                      ? `linear-gradient(90deg, ${ACCENT2} 0%, #f87171 100%)`
                      : `linear-gradient(90deg, ${ACCENT} 0%, #60a5fa 100%)`;
                  const numLabel = `${row.area.toFixed(1)}亿`;
                  const pctLabel = pct !== null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%` : '';
                  return (
                    <div key={row.year} className="flex items-center" style={{ height: ROW_H }}>
                      <div className="flex-shrink-0 text-right pr-1.5" style={{ width: LABEL_W, fontSize: 9, color: isPeak ? GOLD_LINE : TEXT_MUTED, fontWeight: isPeak ? 700 : 400, lineHeight: `${ROW_H}px` }}>
                        {row.year}
                      </div>
                      <div className="relative flex-1" style={{ height: BAR_H, borderRadius: 2, background: '#E8E0D8' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${Math.max(barPct, 0.5)}%`, background: barColor, borderRadius: '2px 3px 3px 2px', transition: `width 0.75s cubic-bezier(0.4,0,0.2,1) ${idx * 12}ms`, boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)' }} />
                        <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', ...(barPct >= 20 ? { right: `${100 - Math.max(barPct, 0.5)}%`, paddingRight: 3, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.4)' } : { left: `${Math.max(barPct, 0.5)}%`, paddingLeft: 3, color: TEXT_MAIN }), fontSize: 8, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
                          {numLabel}
                        </div>
                      </div>
                      <div className="flex-shrink-0 pl-1.5" style={{ fontSize: 8, color: isDown ? ACCENT2 : (pct !== null && pct > 0) ? '#16a34a' : TEXT_MUTED, fontWeight: 600, lineHeight: `${ROW_H}px`, width: 42, textAlign: 'right' }}>
                        {pctLabel}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ══ 城市×AI Tab ══ */}
        {activeTab === 'city' && (
          <>
            <div className="rounded-xl p-3" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div className="mb-2">
                <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_MAIN }}>主要城市二手房均价（2024年，元/㎡）</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {CITY_PRICE_DATA.map((row, idx) => {
                  const barPct = (row.price / maxCityPrice) * 100;
                  const isDown = row.change < 0;
                  const barColor = idx === 0
                    ? `linear-gradient(90deg, ${GOLD_LINE} 0%, #f59e0b 100%)`
                    : `linear-gradient(90deg, ${ACCENT} 0%, #60a5fa 100%)`;
                  return (
                    <div key={row.city} className="flex items-center" style={{ height: ROW_H + 2 }}>
                      <div className="flex-shrink-0 text-right pr-1.5" style={{ width: 26, fontSize: 9, color: idx === 0 ? GOLD_LINE : TEXT_MUTED, fontWeight: idx === 0 ? 700 : 400, lineHeight: `${ROW_H}px` }}>
                        {row.city}
                      </div>
                      <div className="relative flex-1" style={{ height: BAR_H, borderRadius: 2, background: '#E8E0D8' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${Math.max(barPct, 0.5)}%`, background: barColor, borderRadius: '2px 3px 3px 2px', transition: `width 0.75s cubic-bezier(0.4,0,0.2,1) ${idx * 30}ms`, boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)' }} />
                        <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', ...(barPct >= 30 ? { right: `${100 - Math.max(barPct, 0.5)}%`, paddingRight: 3, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.4)' } : { left: `${Math.max(barPct, 0.5)}%`, paddingLeft: 3, color: TEXT_MAIN }), fontSize: 8, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
                          {row.price.toLocaleString()}
                        </div>
                      </div>
                      <div className="flex-shrink-0 pl-1.5" style={{ fontSize: 8, color: isDown ? ACCENT2 : '#16a34a', fontWeight: 600, lineHeight: `${ROW_H}px`, width: 42, textAlign: 'right' }}>
                        {row.change > 0 ? '+' : ''}{row.change}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI 城市分析 */}
            <div className="rounded-xl p-3" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div className="flex items-center gap-1 mb-2">
                <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_MAIN }}>AI城市分化分析</span>
                <span style={{ fontSize: 9, background: AI_COLOR, color: '#fff', borderRadius: 3, padding: '1px 4px' }}>AI</span>
              </div>
              {[
                { tier: '一线核心', cities: '北上深', trend: '缓慢下行', color: ACCENT2, desc: '高基数+调控压制，但需求韧性强，跌幅有限' },
                { tier: '强二线', cities: '杭州/南京/苏州', trend: '持续调整', color: GOLD_LINE, desc: '前期涨幅过大，去化周期拉长，价格回归合理' },
                { tier: '普通二线', cities: '成都/武汉/西安', trend: '底部震荡', color: ACCENT, desc: '人口流入支撑，但供给过剩压制反弹空间' },
                { tier: '三四线', cities: '多数城市', trend: '持续下行', color: ACCENT2, desc: '人口净流出+库存高企，长期下行趋势难逆转' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 py-2" style={{ borderBottom: i < 3 ? `1px solid ${BORDER}` : 'none' }}>
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: item.color, marginTop: 5, flexShrink: 0 }} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 11, fontWeight: 600, color: TEXT_MAIN }}>{item.tier}</span>
                      <span style={{ fontSize: 10, color: TEXT_MUTED }}>（{item.cities}）</span>
                      <span style={{ fontSize: 10, color: item.color, fontWeight: 600 }}>{item.trend}</span>
                    </div>
                    <div style={{ fontSize: 10, color: TEXT_SUB, marginTop: 1 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ══ AI预测 Tab ══ */}
        {activeTab === 'prediction' && (
          <>
            {/* AI预测折线图 */}
            <div className="rounded-xl p-3" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div className="flex items-center gap-1 mb-2">
                <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_MAIN }}>AI预测：全国均价走势（2025-2034）</span>
                <span style={{ fontSize: 9, background: AI_COLOR, color: '#fff', borderRadius: 3, padding: '1px 4px' }}>AI</span>
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={AI_PREDICTION_DATA} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="predGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={AI_COLOR} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={AI_COLOR} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="year" tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: TEXT_MUTED }} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<PriceTooltip />} />
                  <Area type="monotone" dataKey="optimistic" stroke="#a78bfa" strokeWidth={1} strokeDasharray="3 3" fill="none" name="乐观" />
                  <Area type="monotone" dataKey="price" stroke={AI_COLOR} strokeWidth={2} fill="url(#predGrad)" name="基准" />
                  <Area type="monotone" dataKey="pessimistic" stroke="#c4b5fd" strokeWidth={1} strokeDasharray="3 3" fill="none" name="悲观" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-1">
                {[{ label: '乐观', color: '#a78bfa' }, { label: '基准', color: AI_COLOR }, { label: '悲观', color: '#c4b5fd' }].map(l => (
                  <div key={l.label} className="flex items-center gap-1">
                    <div style={{ width: 16, height: 2, background: l.color }} />
                    <span style={{ fontSize: 9, color: TEXT_MUTED }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AI预测列表 */}
            <div className="rounded-xl p-3" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div className="mb-2">
                <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_MAIN }}>逐年预测（点击查看详情）</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {AI_PREDICTION_DATA.map((row, idx) => {
                  const barPct = (row.price / 12000) * 100;
                  return (
                    <div
                      key={row.year}
                      className="flex items-center"
                      style={{ height: ROW_H + 4, cursor: 'pointer', borderRadius: 3, padding: '0 2px' }}
                      onClick={() => setPredictionModal(row)}
                    >
                      <div className="flex-shrink-0 text-right pr-1.5" style={{ width: LABEL_W, fontSize: 9, color: AI_COLOR, fontWeight: 600, lineHeight: `${ROW_H}px` }}>
                        {row.year}
                      </div>
                      <div className="relative flex-1" style={{ height: BAR_H, borderRadius: 2, background: '#E8E0D8' }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${Math.max(barPct, 0.5)}%`, background: `linear-gradient(90deg, ${AI_COLOR} 0%, #a78bfa 100%)`, borderRadius: '2px 3px 3px 2px', transition: `width 0.75s cubic-bezier(0.4,0,0.2,1) ${idx * 30}ms`, boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)' }} />
                        <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: `${Math.max(barPct, 0.5)}%`, paddingLeft: 3, color: AI_COLOR, fontSize: 8, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', pointerEvents: 'none' }}>
                          {row.price.toLocaleString()}<span style={{ marginLeft: 2, fontSize: 7, fontWeight: 700, color: AI_COLOR, background: 'rgba(124,58,237,0.1)', borderRadius: 2, padding: '0 2px' }}>AI</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 pl-1.5" style={{ fontSize: 8, color: AI_COLOR, fontWeight: 600, lineHeight: `${ROW_H}px`, width: 42, textAlign: 'right' }}>
                        {row.confidence}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI 核心判断 */}
            <div className="rounded-xl p-3" style={{ background: BG_WHITE, border: `1px solid ${BORDER}` }}>
              <div className="flex items-center gap-1 mb-2">
                <span style={{ fontSize: 12, fontWeight: 600, color: TEXT_MAIN }}>AI核心判断</span>
                <span style={{ fontSize: 9, background: AI_COLOR, color: '#fff', borderRadius: 3, padding: '1px 4px' }}>AI</span>
              </div>
              <div style={{ fontSize: 11, color: TEXT_SUB, lineHeight: 1.7 }}>
                <p style={{ marginBottom: 8 }}>中国房地产市场已进入<strong style={{ color: TEXT_MAIN }}>长期下行通道</strong>，核心驱动因素为：</p>
                {[
                  { factor: '人口结构', desc: '出生人口持续下降，新增住房需求长期萎缩' },
                  { factor: '城镇化放缓', desc: '城镇化率接近70%天花板，增量需求趋近消失' },
                  { factor: '库存高企', desc: '全国新房去化周期超24个月，供给严重过剩' },
                  { factor: '老龄化释放', desc: '老龄人口房产逐步释放，二手房供给持续增加' },
                  { factor: '投资属性弱化', desc: '限购限贷+房产税预期，投资需求大幅萎缩' },
                ].map((item, i) => (
                  <div key={i} className="flex gap-2 mb-1.5">
                    <span style={{ fontSize: 10, fontWeight: 700, color: AI_COLOR, flexShrink: 0, minWidth: 48 }}>{item.factor}</span>
                    <span style={{ fontSize: 10, color: TEXT_SUB }}>{item.desc}</span>
                  </div>
                ))}
                <p style={{ marginTop: 8, padding: '6px 8px', background: 'rgba(124,58,237,0.06)', borderRadius: 6, borderLeft: `3px solid ${AI_COLOR}`, fontSize: 10, color: TEXT_MAIN }}>
                  预计2025-2034年全国均价从约8,800元/㎡下降至约6,900元/㎡，累计跌幅约<strong>21.6%</strong>。核心一线城市跌幅相对较小（10-15%），三四线城市跌幅可能超过<strong>30%</strong>。
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── AI 预测详情弹框 ── */}
      {predictionModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => setPredictionModal(null)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl p-5"
            style={{ background: '#fff', maxHeight: '80vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            {/* 标题 */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <span style={{ fontSize: 18, fontWeight: 700, color: AI_COLOR }}>{predictionModal.year}</span>
                <span style={{ fontSize: 13, color: TEXT_SUB, marginLeft: 6 }}>年 AI 预测报告</span>
              </div>
              <button onClick={() => setPredictionModal(null)} style={{ fontSize: 18, color: TEXT_MUTED, lineHeight: 1 }}>×</button>
            </div>

            {/* 核心数据 */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: '基准预测', value: `${predictionModal.price.toLocaleString()}`, unit: '元/㎡', color: AI_COLOR },
                { label: '乐观情景', value: `${predictionModal.optimistic.toLocaleString()}`, unit: '元/㎡', color: '#16a34a' },
                { label: '悲观情景', value: `${predictionModal.pessimistic.toLocaleString()}`, unit: '元/㎡', color: ACCENT2 },
              ].map((item, i) => (
                <div key={i} className="rounded-lg p-2 text-center" style={{ background: BG_SUBTLE }}>
                  <div style={{ fontSize: 9, color: TEXT_MUTED, marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: item.color }}>{item.value}</div>
                  <div style={{ fontSize: 9, color: TEXT_MUTED }}>{item.unit}</div>
                </div>
              ))}
            </div>

            {/* 置信度 */}
            <div className="flex items-center gap-2 mb-4">
              <span style={{ fontSize: 11, color: TEXT_SUB }}>模型置信度</span>
              <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: BG_SUBTLE }}>
                <div style={{ width: `${predictionModal.confidence}%`, height: '100%', background: `linear-gradient(90deg, ${AI_COLOR}, #a78bfa)`, borderRadius: 9999, transition: 'width 0.6s ease' }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: AI_COLOR }}>{predictionModal.confidence}%</span>
            </div>

            {/* 关键驱动因素 */}
            <div className="rounded-lg p-3 mb-4" style={{ background: 'rgba(124,58,237,0.06)', border: `1px solid rgba(124,58,237,0.15)` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: AI_COLOR, marginBottom: 4 }}>关键驱动因素</div>
              <div style={{ fontSize: 11, color: TEXT_SUB, lineHeight: 1.6 }}>{predictionModal.keyFactor}</div>
            </div>

            {/* 方法论 */}
            <div style={{ fontSize: 10, color: TEXT_MUTED, lineHeight: 1.6, borderTop: `1px solid ${BORDER}`, paddingTop: 10 }}>
              <div style={{ fontWeight: 600, color: TEXT_SUB, marginBottom: 4 }}>预测方法说明</div>
              本预测基于多变量加权模型，综合考量：人口结构（出生率/老龄化）、城镇化进程、库存去化周期、货币政策、土地供给、居民杠杆率、租售比、人均收入增速等核心指标，结合日本、韩国、香港等地房地产周期经验进行修正。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
