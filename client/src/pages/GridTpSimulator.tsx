import React, { useState, useCallback, useRef, useEffect } from "react";
import { ChevronLeft, Play, RotateCcw, TrendingUp, BarChart2, AlertCircle, CheckCircle } from "lucide-react";
import { useLocation } from "wouter";

// ─── 主题色（与 GridTradeSimulator 保持一致）──────────────────
const BG_PAGE    = "#f5f6f8";
const BG_WHITE   = "#ffffff";
const BORDER     = "#e4e7ed";
const TEXT_MAIN  = "#1a1a2e";
const TEXT_SUB   = "#6b7280";
const TEXT_MUTED = "#9ca3af";
const ACCENT     = "#1a56db";
const ACCENT_BG  = "#eff6ff";
const ACCENT_LIGHT = "#dbeafe";
const BG_SUBTLE  = "#f0f2f5";
const GREEN      = "#16a34a";
const RED        = "#dc2626";
const ORANGE     = "#d97706";

// ─── 类型定义 ─────────────────────────────────────────────────
interface TpParams {
  priceMin: number;
  priceMax: number;
  interval: number;
  qtyPerSlot: number;
  takeProfit: number;
  feeRate: number;
}

interface ScenarioConfig {
  label: string;
  desc: string;
  pricePathFn: (priceMin: number, priceMax: number) => number[];
}

interface SlotResult {
  buyPrice: number;
  sellPrice: number;
  triggered: boolean;
  realizedProfit: number;
  fee: number;
  netProfit: number;
  holdingQty: number;
  holdingValue: number;
  floatPnl: number;
  totalReturn: number;
}

interface SimResult {
  slots: SlotResult[];
  totalSlots: number;
  totalCapital: number;
  totalRealized: number;
  totalFee: number;
  totalTriggered: number;
  totalHoldingQty: number;
  totalHoldingValue: number;
  totalFloatPnl: number;
  totalNetProfit: number;
  totalReturn: number;
  finalPrice: number;
  priceHigh: number;
  priceLow: number;
  segProfits: { label: string; realized: number; float: number; net: number }[];
  sensitivity: { tp: number; netProfit: number; triggered: number }[];
}

// ─── 场景配置 ─────────────────────────────────────────────────
const SCENARIOS: Record<string, ScenarioConfig> = {
  bear_mild: {
    label: "温和熊市（-30%，低位震荡）",
    desc: "价格从区间中部下跌30%后在低位震荡，止盈差价档位被少量触发。",
    pricePathFn: (min, max) => {
      const mid = (min + max) / 2;
      const path: number[] = [];
      const steps = 200;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // 先跌30%，再在低位±10%震荡
        const trend = mid * (1 - 0.3 * t);
        const osc = mid * 0.1 * Math.sin(t * Math.PI * 8);
        path.push(Math.max(min * 0.5, trend + osc));
      }
      return path;
    },
  },
  bear_deep: {
    label: "深度熊市（-70%，持续下跌）",
    desc: "价格从区间中部持续下跌70%，大量档位买入但止盈几乎无法触发。",
    pricePathFn: (min, max) => {
      const mid = (min + max) / 2;
      const path: number[] = [];
      const steps = 200;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const trend = mid * (1 - 0.7 * t);
        const osc = mid * 0.05 * Math.sin(t * Math.PI * 4);
        path.push(Math.max(min * 0.2, trend + osc));
      }
      return path;
    },
  },
  sideways: {
    label: "横盘震荡（±15%，高频往返）",
    desc: "价格在区间中部±15%范围内高频往返，是固定差价网格的最优场景。",
    pricePathFn: (min, max) => {
      const mid = (min + max) / 2;
      const path: number[] = [];
      const steps = 200;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const osc = mid * 0.15 * Math.sin(t * Math.PI * 12);
        const osc2 = mid * 0.05 * Math.sin(t * Math.PI * 25);
        path.push(mid + osc + osc2);
      }
      return path;
    },
  },
  bull_mild: {
    label: "温和牛市（+50%，缓慢上涨）",
    desc: "价格从区间下部缓慢上涨50%，高价位档位止盈频繁触发。",
    pricePathFn: (min, max) => {
      const start = min + (max - min) * 0.2;
      const path: number[] = [];
      const steps = 200;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const trend = start * (1 + 0.5 * t);
        const osc = start * 0.08 * Math.sin(t * Math.PI * 10);
        path.push(trend + osc);
      }
      return path;
    },
  },
  bull_strong: {
    label: "强势牛市（+200%，快速拉升）",
    desc: "价格从区间下部快速拉升200%，高价位档位大量止盈，低价位持仓浮盈丰厚。",
    pricePathFn: (min, max) => {
      const start = min + (max - min) * 0.1;
      const path: number[] = [];
      const steps = 200;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const trend = start * (1 + 2.0 * t);
        const osc = start * 0.1 * Math.sin(t * Math.PI * 6);
        path.push(trend + osc);
      }
      return path;
    },
  },
};

// ─── 核心计算引擎 ─────────────────────────────────────────────
function runTpSimulation(params: TpParams, scenarioKey: string): SimResult {
  const { priceMin, priceMax, interval, qtyPerSlot, takeProfit, feeRate } = params;
  const scenario = SCENARIOS[scenarioKey];
  const pricePath = scenario.pricePathFn(priceMin, priceMax);
  const finalPrice = pricePath[pricePath.length - 1];
  const priceHigh = Math.max(...pricePath);
  const priceLow = Math.min(...pricePath);

  // 生成所有档位（从 priceMin 到 priceMax，步长 interval）
  const slots: SlotResult[] = [];
  for (let buyPrice = priceMin; buyPrice <= priceMax; buyPrice += interval) {
    const sellPrice = buyPrice + takeProfit;
    // 判断价格路径是否触发止盈
    // 逻辑：价格先跌到 buyPrice（买入），然后涨到 sellPrice（卖出）
    let triggered = false;
    let bought = false;
    for (const price of pricePath) {
      if (!bought && price <= buyPrice) {
        bought = true;
      }
      if (bought && price >= sellPrice) {
        triggered = true;
        break;
      }
    }
    // 如果起始价格已在 buyPrice 以上，视为已建仓（初始持仓）
    if (!bought && pricePath[0] >= buyPrice) {
      bought = true;
      // 检查后续是否触发止盈
      for (const price of pricePath) {
        if (price >= sellPrice) {
          triggered = true;
          break;
        }
      }
    }

    const capital = buyPrice * qtyPerSlot;
    let realizedProfit = 0;
    let fee = 0;
    let holdingQty = 0;
    let holdingValue = 0;
    let floatPnl = 0;

    if (triggered) {
      realizedProfit = takeProfit * qtyPerSlot;
      fee = (buyPrice + sellPrice) * qtyPerSlot * feeRate / 100;
      holdingQty = 0;
      holdingValue = 0;
      floatPnl = 0;
    } else if (bought) {
      // 买入但未止盈，持有中
      holdingQty = qtyPerSlot;
      holdingValue = holdingQty * finalPrice;
      floatPnl = holdingQty * (finalPrice - buyPrice);
      fee = buyPrice * qtyPerSlot * feeRate / 100;
      realizedProfit = 0;
    }
    // 未买入：capital 闲置，无收益无损失
    const netProfit = realizedProfit - fee + floatPnl;
    const totalReturn = capital > 0 ? (netProfit / capital) * 100 : 0;

    slots.push({
      buyPrice: Math.round(buyPrice * 100) / 100,
      sellPrice: Math.round(sellPrice * 100) / 100,
      triggered,
      realizedProfit,
      fee,
      netProfit,
      holdingQty: bought ? qtyPerSlot : 0,
      holdingValue,
      floatPnl,
      totalReturn,
    });
  }

  // 汇总
  const totalSlots = slots.length;
  const totalCapital = slots.reduce((s, sl) => s + sl.buyPrice * qtyPerSlot, 0);
  const totalRealized = slots.reduce((s, sl) => s + sl.realizedProfit, 0);
  const totalFee = slots.reduce((s, sl) => s + sl.fee, 0);
  const totalTriggered = slots.filter(sl => sl.triggered).length;
  const totalHoldingQty = slots.reduce((s, sl) => s + sl.holdingQty, 0);
  const totalHoldingValue = slots.reduce((s, sl) => s + sl.holdingValue, 0);
  const totalFloatPnl = slots.reduce((s, sl) => s + sl.floatPnl, 0);
  const totalNetProfit = slots.reduce((s, sl) => s + sl.netProfit, 0);
  const totalReturn = totalCapital > 0 ? (totalNetProfit / totalCapital) * 100 : 0;

  // 按价格区段统计（5段）
  const segSize = (priceMax - priceMin) / 5;
  const segProfits = Array.from({ length: 5 }, (_, i) => {
    const segMin = priceMin + i * segSize;
    const segMax = segMin + segSize;
    const segSlots = slots.filter(sl => sl.buyPrice >= segMin && sl.buyPrice < segMax);
    return {
      label: `${Math.round(segMin)}~${Math.round(segMax)}`,
      realized: segSlots.reduce((s, sl) => s + sl.realizedProfit, 0),
      float: segSlots.reduce((s, sl) => s + sl.floatPnl, 0),
      net: segSlots.reduce((s, sl) => s + sl.netProfit, 0),
    };
  });

  // 止盈差价敏感性分析（TP=10~500，步长递增）
  const tpValues = [10, 20, 30, 50, 80, 100, 150, 200, 300, 500];
  const sensitivity = tpValues.map(tp => {
    let netP = 0, trig = 0;
    for (let buyPrice = priceMin; buyPrice <= priceMax; buyPrice += interval) {
      const sellPrice = buyPrice + tp;
      let triggered = false;
      let bought = false;
      for (const price of pricePath) {
        if (!bought && price <= buyPrice) bought = true;
        if (bought && price >= sellPrice) { triggered = true; break; }
      }
      if (!bought && pricePath[0] >= buyPrice) {
        bought = true;
        for (const price of pricePath) {
          if (price >= sellPrice) { triggered = true; break; }
        }
      }
      if (triggered) {
        netP += tp * qtyPerSlot - (buyPrice + sellPrice) * qtyPerSlot * feeRate / 100;
        trig++;
      } else if (bought) {
        netP += qtyPerSlot * (finalPrice - buyPrice) - buyPrice * qtyPerSlot * feeRate / 100;
      }
    }
    return { tp, netProfit: netP, triggered: trig };
  });

  return {
    slots, totalSlots, totalCapital, totalRealized, totalFee,
    totalTriggered, totalHoldingQty, totalHoldingValue, totalFloatPnl,
    totalNetProfit, totalReturn, finalPrice, priceHigh, priceLow,
    segProfits, sensitivity,
  };
}

// ─── 简易条形图组件 ────────────────────────────────────────────
function MiniBarChart({
  data,
  valueKey,
  labelKey,
  color,
  title,
}: {
  data: { [key: string]: any }[];
  valueKey: string;
  labelKey: string;
  color: string;
  title: string;
}) {
  const maxVal = Math.max(...data.map(d => Math.abs(d[valueKey])));
  return (
    <div style={{ background: BG_WHITE, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '14px 12px' }}>
      <div className="text-xs font-semibold mb-3" style={{ color: TEXT_MAIN }}>{title}</div>
      <div className="flex flex-col gap-2">
        {data.map((d, i) => {
          const val = d[valueKey];
          const pct = maxVal > 0 ? Math.abs(val) / maxVal * 100 : 0;
          const isPos = val >= 0;
          return (
            <div key={i} className="flex items-center gap-2">
              <div className="text-xs flex-shrink-0" style={{ color: TEXT_MUTED, width: 72, textAlign: 'right' }}>{d[labelKey]}</div>
              <div className="flex-1 relative" style={{ height: 18 }}>
                <div
                  style={{
                    position: 'absolute', left: 0, top: 3, bottom: 3,
                    width: `${pct}%`,
                    background: isPos ? color : RED,
                    borderRadius: 3,
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
              <div className="text-xs font-semibold flex-shrink-0" style={{ color: isPos ? color : RED, width: 70, textAlign: 'right' }}>
                {val >= 0 ? '+' : ''}{val.toFixed(0)} U
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 敏感性曲线组件 ────────────────────────────────────────────
function SensitivityChart({ data, bestTp }: { data: { tp: number; netProfit: number; triggered: number }[]; bestTp: number }) {
  const maxVal = Math.max(...data.map(d => Math.abs(d.netProfit)));
  const minVal = Math.min(...data.map(d => d.netProfit));
  const range = maxVal - minVal;
  return (
    <div style={{ background: BG_WHITE, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '14px 12px' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold" style={{ color: TEXT_MAIN }}>止盈差价敏感性分析</div>
        <div className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: ACCENT_BG, color: ACCENT }}>
          最优 TP={bestTp} U
        </div>
      </div>
      <div className="flex items-end gap-1.5" style={{ height: 80 }}>
        {data.map((d, i) => {
          const heightPct = range > 0 ? ((d.netProfit - minVal) / range) * 80 + 10 : 50;
          const isPos = d.netProfit >= 0;
          const isBest = d.tp === bestTp;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <div
                style={{
                  width: '100%',
                  height: `${heightPct}%`,
                  background: isBest ? ACCENT : (isPos ? '#93c5fd' : '#fca5a5'),
                  borderRadius: '3px 3px 0 0',
                  transition: 'height 0.4s ease',
                  border: isBest ? `2px solid ${ACCENT}` : 'none',
                }}
              />
              <div className="text-xs" style={{ color: isBest ? ACCENT : TEXT_MUTED, fontWeight: isBest ? 700 : 400, fontSize: 9 }}>
                {d.tp}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-xs" style={{ color: TEXT_MUTED }}>
        各止盈差价（USDT）下的综合净利润对比，蓝色柱为当前场景最优差价
      </div>
    </div>
  );
}

// ─── 主页面组件 ───────────────────────────────────────────────
export default function GridTpSimulator() {
  const [, setLocation] = useLocation();
  const [params, setParams] = useState<TpParams>({
    priceMin: 1000,
    priceMax: 3000,
    interval: 1,
    qtyPerSlot: 1,
    takeProfit: 100,
    feeRate: 0.1,
  });
  const [scenario, setScenario] = useState("sideways");
  const [result, setResult] = useState<SimResult | null>(null);
  const [activeTab, setActiveTab] = useState<"params" | "result" | "slots">("params");
  const [running, setRunning] = useState(false);

  const updateParam = (key: keyof TpParams, val: number) =>
    setParams(p => ({ ...p, [key]: val }));

  const handleRun = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const res = runTpSimulation(params, scenario);
      setResult(res);
      setRunning(false);
      setActiveTab("result");
    }, 300);
  }, [params, scenario]);

  const handleReset = () => {
    setResult(null);
    setParams({ priceMin: 1000, priceMax: 3000, interval: 1, qtyPerSlot: 1, takeProfit: 100, feeRate: 0.1 });
    setScenario("sideways");
    setActiveTab("params");
  };

  const bestTp = result
    ? result.sensitivity.reduce((best, d) => d.netProfit > best.netProfit ? d : best, result.sensitivity[0]).tp
    : 100;

  // 档位数预估
  const estSlots = params.interval > 0
    ? Math.floor((params.priceMax - params.priceMin) / params.interval) + 1
    : 0;
  const estCapital = estSlots * ((params.priceMin + params.priceMax) / 2) * params.qtyPerSlot;

  return (
    <div style={{ background: BG_PAGE, minHeight: '100vh', paddingBottom: 40 }}>
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{ background: BG_WHITE, borderBottom: `1px solid ${BORDER}` }}
      >
        <button
          onClick={() => setLocation(`/ledger/52/grid-simulator`)}
          className="flex items-center justify-center rounded-full active:opacity-70"
          style={{ width: 32, height: 32, background: BG_SUBTLE }}
        >
          <ChevronLeft style={{ width: 18, height: 18, color: TEXT_MAIN }} />
        </button>
        <div className="flex-1">
          <div className="font-semibold text-base" style={{ color: TEXT_MAIN }}>固定差价止盈网格</div>
          <div className="text-xs" style={{ color: TEXT_MUTED }}>第二类策略 · 需自定义程序</div>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center justify-center rounded-full active:opacity-70"
          style={{ width: 32, height: 32, background: BG_SUBTLE }}
        >
          <RotateCcw style={{ width: 16, height: 16, color: TEXT_SUB }} />
        </button>
      </div>

      {/* 策略说明卡片 */}
      <div className="px-4 pt-4">
        <div className="rounded-xl p-3" style={{ background: ACCENT_BG, border: `1px solid ${ACCENT_LIGHT}` }}>
          <div className="flex items-start gap-2">
            <AlertCircle style={{ width: 15, height: 15, color: ACCENT, flexShrink: 0, marginTop: 1 }} />
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: ACCENT }}>策略说明</div>
              <div className="text-xs leading-relaxed" style={{ color: TEXT_SUB }}>
                止盈价 = 买入价 + 固定差价（与档位编号无关）。例如差价=100时，1500买→1600卖；1501买→1601卖。
                <span className="font-semibold" style={{ color: RED }}> ❌ OKX/币安不支持，必须自定义 API 程序。</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="px-4 pt-4">
        <div className="flex rounded-xl overflow-hidden" style={{ background: BG_SUBTLE, padding: 3, gap: 2 }}>
          {([
            { key: "params", label: "参数设置" },
            { key: "result", label: "模拟结果" },
            { key: "slots", label: "档位明细" },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-2 text-xs font-semibold rounded-lg transition-all"
              style={{
                background: activeTab === tab.key ? BG_WHITE : 'transparent',
                color: activeTab === tab.key ? ACCENT : TEXT_MUTED,
                boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 参数设置 Tab ── */}
      {activeTab === "params" && (
        <div className="px-4 pt-4 flex flex-col gap-3">
          {/* 价格区间 */}
          <div style={{ background: BG_WHITE, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '14px 12px' }}>
            <div className="text-xs font-semibold mb-3" style={{ color: TEXT_MAIN }}>价格区间参数</div>
            <div className="flex flex-col gap-4">
              {/* 买入区间下限 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs" style={{ color: TEXT_SUB }}>买入区间下限（USDT）</span>
                  <span className="text-sm font-bold" style={{ color: ACCENT }}>{params.priceMin.toLocaleString()}</span>
                </div>
                <input
                  type="range" min={100} max={4000} step={100}
                  value={params.priceMin}
                  onChange={e => updateParam('priceMin', Number(e.target.value))}
                  className="w-full" style={{ accentColor: ACCENT }}
                />
                <div className="flex justify-between text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
                  <span>100</span><span>4,000</span>
                </div>
              </div>
              {/* 买入区间上限 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs" style={{ color: TEXT_SUB }}>买入区间上限（USDT）</span>
                  <span className="text-sm font-bold" style={{ color: ACCENT }}>{params.priceMax.toLocaleString()}</span>
                </div>
                <input
                  type="range" min={500} max={8000} step={100}
                  value={params.priceMax}
                  onChange={e => updateParam('priceMax', Number(e.target.value))}
                  className="w-full" style={{ accentColor: ACCENT }}
                />
                <div className="flex justify-between text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
                  <span>500</span><span>8,000</span>
                </div>
              </div>
              {/* 档位间距 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs" style={{ color: TEXT_SUB }}>档位间距（USDT）</span>
                  <span className="text-sm font-bold" style={{ color: ACCENT }}>{params.interval}</span>
                </div>
                <input
                  type="range" min={1} max={100} step={1}
                  value={params.interval}
                  onChange={e => updateParam('interval', Number(e.target.value))}
                  className="w-full" style={{ accentColor: ACCENT }}
                />
                <div className="flex justify-between text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
                  <span>1</span><span>100</span>
                </div>
              </div>
              {/* 每档买入量 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs" style={{ color: TEXT_SUB }}>每档买入量（ETH）</span>
                  <span className="text-sm font-bold" style={{ color: ACCENT }}>{params.qtyPerSlot.toFixed(2)}</span>
                </div>
                <input
                  type="range" min={0.1} max={10} step={0.01}
                  value={params.qtyPerSlot}
                  onChange={e => updateParam('qtyPerSlot', Number(e.target.value))}
                  className="w-full" style={{ accentColor: ACCENT }}
                />
                <div className="flex justify-between text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
                  <span>0.10 ETH</span><span>10.00 ETH</span>
                </div>
              </div>
            </div>
          </div>

          {/* 止盈与市场参数 */}
          <div style={{ background: BG_WHITE, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '14px 12px' }}>
            <div className="text-xs font-semibold mb-3" style={{ color: TEXT_MAIN }}>止盈与市场参数</div>
            <div className="flex flex-col gap-4">
              {/* 止盈差价 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs" style={{ color: TEXT_SUB }}>止盈差价（USDT）</span>
                  <span className="text-base font-bold" style={{ color: ORANGE }}>{params.takeProfit}</span>
                </div>
                <input
                  type="range" min={10} max={500} step={10}
                  value={params.takeProfit}
                  onChange={e => updateParam('takeProfit', Number(e.target.value))}
                  className="w-full" style={{ accentColor: ORANGE }}
                />
                <div className="flex justify-between text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
                  <span>10 U</span><span>500 U</span>
                </div>
                <div className="mt-1.5 text-xs rounded-lg px-2 py-1.5" style={{ background: '#fff7ed', color: ORANGE }}>
                  示例：买入价 {params.priceMin.toLocaleString()} U → 止盈价 {(params.priceMin + params.takeProfit).toLocaleString()} U（+{params.takeProfit} U）
                </div>
              </div>
              {/* 手续费率 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs" style={{ color: TEXT_SUB }}>手续费率（%）</span>
                  <span className="text-sm font-bold" style={{ color: ACCENT }}>{params.feeRate.toFixed(2)}%</span>
                </div>
                <input
                  type="range" min={0} max={0.5} step={0.01}
                  value={params.feeRate}
                  onChange={e => updateParam('feeRate', Number(e.target.value))}
                  className="w-full" style={{ accentColor: ACCENT }}
                />
                <div className="flex justify-between text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
                  <span>0%</span><span>0.5%</span>
                </div>
              </div>
              {/* 场景选择 */}
              <div>
                <div className="text-xs mb-1.5" style={{ color: TEXT_SUB }}>回测场景</div>
                <select
                  value={scenario}
                  onChange={e => setScenario(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm"
                  style={{ background: BG_SUBTLE, border: `1px solid ${BORDER}`, color: TEXT_MAIN, outline: 'none' }}
                >
                  {Object.entries(SCENARIOS).map(([key, sc]) => (
                    <option key={key} value={key}>{sc.label}</option>
                  ))}
                </select>
                <div className="mt-1.5 text-xs" style={{ color: TEXT_MUTED }}>
                  {SCENARIOS[scenario]?.desc}
                </div>
              </div>
            </div>
          </div>

          {/* 预估信息 */}
          <div className="rounded-xl p-3" style={{ background: BG_SUBTLE, border: `1px solid ${BORDER}` }}>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-center">
                <div className="text-xs" style={{ color: TEXT_MUTED }}>预估档位数</div>
                <div className="text-base font-bold" style={{ color: TEXT_MAIN }}>{estSlots.toLocaleString()} 档</div>
              </div>
              <div className="text-center">
                <div className="text-xs" style={{ color: TEXT_MUTED }}>预估最大资金</div>
                <div className="text-base font-bold" style={{ color: TEXT_MAIN }}>
                  {estCapital >= 10000 ? `${(estCapital / 10000).toFixed(1)}万` : estCapital.toFixed(0)} U
                </div>
              </div>
            </div>
          </div>

          {/* 运行按钮 */}
          <button
            onClick={handleRun}
            disabled={running || params.priceMin >= params.priceMax}
            className="w-full py-3.5 rounded-xl font-semibold text-white text-base flex items-center justify-center gap-2 active:opacity-90"
            style={{
              background: running ? TEXT_MUTED : `linear-gradient(135deg, ${ACCENT} 0%, #3b82f6 100%)`,
              boxShadow: running ? 'none' : '0 4px 12px rgba(26,86,219,0.3)',
            }}
          >
            {running ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                计算中...
              </>
            ) : (
              <>
                <Play style={{ width: 16, height: 16 }} />
                开始差价止盈模拟测算
              </>
            )}
          </button>
        </div>
      )}

      {/* ── 模拟结果 Tab ── */}
      {activeTab === "result" && (
        <div className="px-4 pt-4 flex flex-col gap-3">
          {!result ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <BarChart2 style={{ width: 40, height: 40, color: TEXT_MUTED }} />
              <div className="text-sm" style={{ color: TEXT_MUTED }}>请先在「参数设置」中运行模拟</div>
            </div>
          ) : (
            <>
              {/* 核心指标卡片 */}
              <div style={{ background: BG_WHITE, borderRadius: 12, border: `1px solid ${BORDER}`, padding: '14px 12px' }}>
                <div className="text-xs font-semibold mb-3" style={{ color: TEXT_MAIN }}>核心指标</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: '总档位数', value: `${result.totalSlots.toLocaleString()} 档`, color: TEXT_MAIN },
                    { label: '最大资金投入', value: `${result.totalCapital >= 10000 ? (result.totalCapital / 10000).toFixed(1) + '万' : result.totalCapital.toFixed(0)} U`, color: TEXT_MAIN },
                    { label: '已实现利润', value: `${result.totalRealized >= 0 ? '+' : ''}${result.totalRealized.toFixed(0)} U`, color: result.totalRealized >= 0 ? RED : GREEN },
                    { label: '持仓浮动盈亏', value: `${result.totalFloatPnl >= 0 ? '+' : ''}${result.totalFloatPnl.toFixed(0)} U`, color: result.totalFloatPnl >= 0 ? RED : GREEN },
                    { label: '综合净利润', value: `${result.totalNetProfit >= 0 ? '+' : ''}${result.totalNetProfit.toFixed(0)} U`, color: result.totalNetProfit >= 0 ? RED : GREEN },
                    { label: '综合收益率', value: `${result.totalReturn >= 0 ? '+' : ''}${result.totalReturn.toFixed(2)}%`, color: result.totalReturn >= 0 ? RED : GREEN },
                    { label: '止盈触发次数', value: `${result.totalTriggered.toLocaleString()} 次`, color: ACCENT },
                    { label: '已触发档位数', value: `${result.totalTriggered.toLocaleString()} 档`, color: ACCENT },
                    { label: '手续费总计', value: `-${result.totalFee.toFixed(0)} U`, color: TEXT_SUB },
                  ].map((item, i) => (
                    <div key={i} className="rounded-lg p-2.5 text-center" style={{ background: BG_SUBTLE }}>
                      <div className="text-xs mb-1" style={{ color: TEXT_MUTED }}>{item.label}</div>
                      <div className="text-sm font-bold" style={{ color: item.color }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 场景信息 */}
              <div className="rounded-xl p-3" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp style={{ width: 13, height: 13, color: GREEN }} />
                  <span className="text-xs font-semibold" style={{ color: GREEN }}>场景：{SCENARIOS[scenario]?.label}</span>
                </div>
                <div className="text-xs" style={{ color: TEXT_SUB }}>
                  期末价格 {result.finalPrice.toFixed(0)} U · 区间最高 {result.priceHigh.toFixed(0)} U · 区间最低 {result.priceLow.toFixed(0)} U
                </div>
              </div>

              {/* 各区段已实现利润 */}
              <MiniBarChart
                data={result.segProfits}
                valueKey="realized"
                labelKey="label"
                color={RED}
                title="各价格区段已实现利润（U）"
              />

              {/* 各区段浮动盈亏 */}
              <MiniBarChart
                data={result.segProfits}
                valueKey="float"
                labelKey="label"
                color="#7c3aed"
                title="各价格区段持仓浮动盈亏（U）"
              />

              {/* 止盈差价敏感性分析 */}
              <SensitivityChart data={result.sensitivity} bestTp={bestTp} />

              {/* 最优差价推荐 */}
              <div className="rounded-xl p-3" style={{ background: ACCENT_BG, border: `1px solid ${ACCENT_LIGHT}` }}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <CheckCircle style={{ width: 14, height: 14, color: ACCENT }} />
                  <span className="text-xs font-semibold" style={{ color: ACCENT }}>当前场景最优止盈差价推荐</span>
                </div>
                <div className="text-2xl font-bold mb-1" style={{ color: ACCENT }}>TP = {bestTp} USDT</div>
                <div className="text-xs" style={{ color: TEXT_SUB }}>
                  在「{SCENARIOS[scenario]?.label}」场景下，止盈差价设为 {bestTp} USDT 时综合净利润最大，
                  为 {result.sensitivity.find(d => d.tp === bestTp)?.netProfit.toFixed(0)} U。
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── 档位明细 Tab ── */}
      {activeTab === "slots" && (
        <div className="px-4 pt-4">
          {!result ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <BarChart2 style={{ width: 40, height: 40, color: TEXT_MUTED }} />
              <div className="text-sm" style={{ color: TEXT_MUTED }}>请先在「参数设置」中运行模拟</div>
            </div>
          ) : (
            <div style={{ background: BG_WHITE, borderRadius: 12, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
              <div className="px-3 py-2.5" style={{ borderBottom: `1px solid ${BORDER}`, background: BG_SUBTLE }}>
                <div className="text-xs font-semibold" style={{ color: TEXT_MAIN }}>
                  档位明细（共 {result.totalSlots.toLocaleString()} 档，显示前 100 档）
                </div>
              </div>
              {/* 表头 */}
              <div className="grid text-xs font-semibold px-3 py-2" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr', color: TEXT_MUTED, borderBottom: `1px solid ${BORDER}`, background: BG_SUBTLE }}>
                <span>买入价</span>
                <span>止盈价</span>
                <span>状态</span>
                <span className="text-right">净利润</span>
              </div>
              {/* 数据行 */}
              {result.slots.slice(0, 100).map((slot, i) => (
                <div
                  key={i}
                  className="grid text-xs px-3 py-2"
                  style={{
                    gridTemplateColumns: '1fr 1fr 1fr 1fr',
                    borderBottom: i < 99 ? `1px solid ${BORDER}` : 'none',
                    background: i % 2 === 0 ? BG_WHITE : BG_PAGE,
                  }}
                >
                  <span style={{ color: TEXT_MAIN }}>{slot.buyPrice.toLocaleString()}</span>
                  <span style={{ color: TEXT_SUB }}>{slot.sellPrice.toLocaleString()}</span>
                  <span>
                    {slot.triggered ? (
                      <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: '#fef2f2', color: RED }}>已止盈</span>
                    ) : slot.holdingQty > 0 ? (
                      <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: '#eff6ff', color: ACCENT }}>持仓中</span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: BG_SUBTLE, color: TEXT_MUTED }}>未触发</span>
                    )}
                  </span>
                  <span className="text-right font-semibold" style={{ color: slot.netProfit >= 0 ? RED : GREEN }}>
                    {slot.netProfit >= 0 ? '+' : ''}{slot.netProfit.toFixed(1)}
                  </span>
                </div>
              ))}
              {result.slots.length > 100 && (
                <div className="px-3 py-2.5 text-xs text-center" style={{ color: TEXT_MUTED, background: BG_SUBTLE }}>
                  仅显示前 100 档，共 {result.totalSlots.toLocaleString()} 档
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
