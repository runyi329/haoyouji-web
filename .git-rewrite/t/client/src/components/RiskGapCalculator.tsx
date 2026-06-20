import { useState } from "react";
import { ChevronDown, ChevronUp, Calculator, AlertTriangle, TrendingDown, Coins, Share2 } from "lucide-react";

/**
 * 三联动补足模拟计算器 v2 - ETH 担保物 + 撬动倍数
 * 逻辑：以太坊担保物 → 撬动倍数 → 借款买入更多ETH → 价格下跌触发补足
 * 纯前端，仅管理员可见
 */

const TIERS = [
  { name: "优享档", minRate: 200, fee: 2,  color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC" },
  { name: "标准档", minRate: 150, fee: 4,  color: "#2563EB", bg: "#EFF6FF", border: "#93C5FD" },
  { name: "提醒档", minRate: 120, fee: 8,  color: "#D97706", bg: "#FFFBEB", border: "#FCD34D" },
  { name: "补足档", minRate: 110, fee: 16, color: "#DC2626", bg: "#FEF2F2", border: "#FCA5A5" },
  { name: "处置档", minRate: 0,   fee: 30, color: "#7C3AED", bg: "#F5F3FF", border: "#C4B5FD" },
];

function getTier(rate: number) {
  for (const t of TIERS) {
    if (rate >= t.minRate) return t;
  }
  return TIERS[TIERS.length - 1];
}

function getPrevTier(t: typeof TIERS[0]) {
  const idx = TIERS.indexOf(t);
  return idx > 0 ? TIERS[idx - 1] : null;
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default function RiskGapCalculator() {
  // 基础参数
  const [collateralEth, setCollateralEth] = useState(10);
  const [ethPrice, setEthPrice] = useState(2000);
  const [leverage, setLeverage] = useState(1);
  const [annualRate, setAnnualRate] = useState(12);
  const [daysElapsed, setDaysElapsed] = useState(30);
  const [triggerPrice, setTriggerPrice] = useState(1600);

  // UI 状态
  const [showParams, setShowParams] = useState(true);
  const [showTrigger, setShowTrigger] = useState(true);
  const [activeScheme, setActiveScheme] = useState<"A" | "B" | "C">("A");

  // 核心计算
  const collateralValue = collateralEth * ethPrice;
  const loanAmount = collateralValue * leverage;
  const boughtEth = ethPrice > 0 ? loanAmount / ethPrice : 0;
  const totalEth = collateralEth + boughtEth;
  const accruedInterest = loanAmount * (annualRate / 100) * (daysElapsed / 365);
  const totalDebt = loanAmount + accruedInterest;
  const currentAssetValue = totalEth * ethPrice;
  const currentRate = totalDebt > 0 ? (currentAssetValue / totalDebt) * 100 : 999;
  const currentTier = getTier(currentRate);

  // 触发价格下的状态
  const triggerAssetValue = totalEth * triggerPrice;
  const triggerRate = totalDebt > 0 ? (triggerAssetValue / totalDebt) * 100 : 999;
  const triggerTier = getTier(triggerRate);
  const triggerPrevTier = getPrevTier(triggerTier);
  const targetTier = triggerPrevTier ?? triggerTier;
  const targetRateDecimal = targetTier.minRate / 100;

  const priceDrop = ethPrice > 0 ? ((ethPrice - triggerPrice) / ethPrice * 100) : 0;

  // 三种补足方案
  const gapA_U = Math.max(0, totalDebt * targetRateDecimal - triggerAssetValue);
  const gapA_ETH = triggerPrice > 0 ? gapA_U / triggerPrice : 0;
  const gapB_U = Math.max(0, totalDebt - triggerAssetValue / targetRateDecimal);
  const rawC = triggerAssetValue > 0 && totalDebt > 0
    ? (1 - triggerAssetValue / (totalDebt * targetRateDecimal)) * 100
    : 0;
  const gapC_pct = Math.max(0, rawC);

  // 多档位跌幅预演
  const dropScenarios = [10, 20, 30, 40, 50].map(dropPct => {
    const p = ethPrice * (1 - dropPct / 100);
    const av = totalEth * p;
    const rate = totalDebt > 0 ? (av / totalDebt) * 100 : 999;
    const tier = getTier(rate);
    const tgt = (getPrevTier(tier) ?? tier).minRate / 100;
    const a = Math.max(0, totalDebt * tgt - av);
    const b = Math.max(0, totalDebt - av / tgt);
    const c = av > 0 && totalDebt > 0 ? Math.max(0, (1 - av / (totalDebt * tgt)) * 100) : 0;
    return { dropPct, price: p, rate, tier, gapA: a, gapA_eth: p > 0 ? a / p : 0, gapB: b, gapC: c };
  });

  return (
    <div className="mx-4 mt-4 mb-6 rounded-2xl overflow-hidden" style={{ border: '1px solid #E0E8FF', boxShadow: '0 2px 12px rgba(26,86,219,0.08)' }}>

      {/* 标题栏 */}
      <div className="px-4 py-3 flex items-center gap-2" style={{ background: 'linear-gradient(135deg, #1A2340 0%, #2563EB 100%)' }}>
        <Calculator className="w-5 h-5 text-white flex-shrink-0" />
        <span className="font-bold text-white text-sm">ETH 三联动补足模拟计算器</span>
        <span className="ml-auto text-[10px] text-blue-200 bg-blue-900/40 px-2 py-0.5 rounded-full flex-shrink-0">仅管理员</span>
      </div>

      {/* 第一步：基础参数 */}
      <div style={{ background: '#F8FAFF', borderBottom: '1px solid #E0E8FF' }}>
        <button className="w-full px-4 py-2.5 flex items-center justify-between" onClick={() => setShowParams(!showParams)}>
          <span className="text-sm font-bold" style={{ color: '#1A2340' }}>① 基础参数设置</span>
          {showParams ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        {showParams && (
          <div className="px-4 pb-4 space-y-3">
            {/* ETH 价格 */}
            <div>
              <div className="text-xs text-gray-500 mb-1">当前 ETH 价格（U）</div>
              <input type="number" value={ethPrice} onChange={e => setEthPrice(Number(e.target.value))}
                className="w-full border rounded-xl px-3 py-2 text-sm font-semibold"
                style={{ borderColor: '#BFDBFE', background: '#fff', color: '#1A2340' }} />
            </div>

            {/* 担保物 ETH */}
            <div>
              <div className="text-xs text-gray-500 mb-1">初始担保物（ETH 数量）</div>
              <input type="number" step="0.1" value={collateralEth} onChange={e => setCollateralEth(Number(e.target.value))}
                className="w-full border rounded-xl px-3 py-2 text-sm font-semibold"
                style={{ borderColor: '#BFDBFE', background: '#fff', color: '#1A2340' }} />
              <div className="text-xs text-blue-500 mt-1">= {fmt(collateralValue)} U 市值</div>
            </div>

            {/* 撬动倍数滑块 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">撬动倍数（1 : {leverage}）</span>
                <span className="text-xs font-bold text-blue-600">借款 {fmt(loanAmount)} U</span>
              </div>
              <input type="range" min={0.5} max={10} step={0.5} value={leverage}
                onChange={e => setLeverage(Number(e.target.value))}
                className="w-full accent-blue-600" />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>0.5×</span><span>2×</span><span>4×</span><span>6×</span><span>8×</span><span>10×</span>
              </div>
              <div className="mt-2 p-2.5 rounded-xl text-xs" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                <div className="flex justify-between"><span className="text-gray-500">担保物</span><span className="font-semibold text-blue-800">{fmt(collateralEth, 2)} ETH = {fmt(collateralValue)} U</span></div>
                <div className="flex justify-between mt-1"><span className="text-gray-500">借款买入</span><span className="font-semibold text-blue-800">{fmt(boughtEth, 2)} ETH（{fmt(loanAmount)} U）</span></div>
                <div className="flex justify-between mt-1 pt-1" style={{ borderTop: '1px solid #BFDBFE' }}>
                  <span className="text-gray-500">总持仓</span><span className="font-bold text-blue-900">{fmt(totalEth, 2)} ETH</span>
                </div>
              </div>
            </div>

            {/* 年化利率 + 已借天数 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-500 mb-1">年化利率（%）</div>
                <input type="number" step="0.5" value={annualRate} onChange={e => setAnnualRate(Number(e.target.value))}
                  className="w-full border rounded-xl px-3 py-2 text-sm font-semibold"
                  style={{ borderColor: '#BFDBFE', background: '#fff', color: '#1A2340' }} />
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">已借天数</div>
                <input type="number" value={daysElapsed} onChange={e => setDaysElapsed(Number(e.target.value))}
                  className="w-full border rounded-xl px-3 py-2 text-sm font-semibold"
                  style={{ borderColor: '#BFDBFE', background: '#fff', color: '#1A2340' }} />
              </div>
            </div>
            <div className="text-xs text-gray-400">已欠利息：{fmt(accruedInterest)} U &nbsp;|&nbsp; 总债务：{fmt(totalDebt)} U</div>

            {/* 当前担保率 */}
            <div className="p-3 rounded-xl" style={{ background: currentTier.bg, border: `1px solid ${currentTier.border}` }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500">当前担保率</div>
                  <div className="text-2xl font-bold mt-0.5" style={{ color: currentTier.color }}>{fmt(currentRate, 1)}%</div>
                </div>
                <div className="text-right">
                  <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-white" style={{ background: currentTier.color }}>
                    {currentTier.name}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">费率 {currentTier.fee}%/年</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 第二步：触发价格 */}
      <div style={{ background: '#FFFBEB', borderBottom: '1px solid #FCD34D' }}>
        <button className="w-full px-4 py-2.5 flex items-center justify-between" onClick={() => setShowTrigger(!showTrigger)}>
          <span className="text-sm font-bold" style={{ color: '#92400E' }}>② 设置触发价格（跌到多少时）</span>
          {showTrigger ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-amber-400" />}
        </button>

        {showTrigger && (
          <div className="px-4 pb-4 space-y-3">
            <div>
              <div className="text-xs text-amber-700 mb-1">触发价格（U）</div>
              <input type="number" value={triggerPrice} onChange={e => setTriggerPrice(Number(e.target.value))}
                className="w-full border rounded-xl px-3 py-2 text-sm font-semibold"
                style={{ borderColor: '#FCD34D', background: '#fff', color: '#92400E' }} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-amber-700">快速设置跌幅</span>
                <span className="text-xs font-bold text-red-600">跌 {fmt(priceDrop, 1)}%</span>
              </div>
              <input type="range" min={0} max={80} step={5}
                value={Math.min(80, Math.max(0, Math.round(priceDrop / 5) * 5))}
                onChange={e => setTriggerPrice(Math.round(ethPrice * (1 - Number(e.target.value) / 100)))}
                className="w-full accent-amber-500" />
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>0%</span><span>-20%</span><span>-40%</span><span>-60%</span><span>-80%</span>
              </div>
            </div>

            <div className="p-3 rounded-xl" style={{ background: triggerTier.bg, border: `1px solid ${triggerTier.border}` }}>
              <div className="text-xs font-semibold mb-2" style={{ color: triggerTier.color }}>
                ETH 跌至 {fmt(triggerPrice)} U 时（跌幅 -{fmt(priceDrop, 1)}%）
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500">届时担保率</div>
                  <div className="text-2xl font-bold" style={{ color: triggerTier.color }}>{fmt(triggerRate, 1)}%</div>
                </div>
                <div className="text-right">
                  <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-white" style={{ background: triggerTier.color }}>
                    <AlertTriangle className="w-3 h-3" />
                    {triggerTier.name}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">费率 {triggerTier.fee}%/年</div>
                </div>
              </div>
              {triggerPrevTier && (
                <div className="mt-2 text-xs" style={{ color: triggerTier.color }}>
                  目标：回到 <span className="font-bold">{triggerPrevTier.name}</span>（担保率 ≥ {triggerPrevTier.minRate}%）
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 第三步：三种补足方案 */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E0E8FF' }}>
        <div className="px-4 pt-3 pb-4">
          <div className="text-sm font-bold mb-3" style={{ color: '#1A2340' }}>③ 触发时三种补足方案</div>
          <div className="flex gap-2 mb-3">
            {(["A", "B", "C"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveScheme(tab)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                style={{ background: activeScheme === tab ? '#1A2340' : '#F1F5F9', color: activeScheme === tab ? '#fff' : '#64748B' }}>
                {tab === "A" ? "🏦 补担保物" : tab === "B" ? "💰 补利息" : "🔄 让渡收益"}
              </button>
            ))}
          </div>

          {activeScheme === "A" && (
            <div className="p-4 rounded-2xl space-y-3" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-bold text-blue-900">方案 A：追加 ETH 担保物</span>
              </div>
              <div className="text-xs text-blue-700 leading-relaxed">
                当 ETH 跌至 <span className="font-bold">{fmt(triggerPrice)} U</span> 时，需追加担保物才能回到 <span className="font-bold">{targetTier.name}</span>（担保率 ≥ {targetTier.minRate}%）
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl text-center" style={{ background: '#fff', border: '1px solid #BFDBFE' }}>
                  <div className="text-xs text-gray-500 mb-1">需追加（U）</div>
                  <div className="text-xl font-bold text-blue-700">{fmt(gapA_U)}</div>
                  <div className="text-xs text-blue-500">U</div>
                </div>
                <div className="p-3 rounded-xl text-center" style={{ background: '#fff', border: '1px solid #BFDBFE' }}>
                  <div className="text-xs text-gray-500 mb-1">折合 ETH</div>
                  <div className="text-xl font-bold text-blue-700">{fmt(gapA_ETH, 4)}</div>
                  <div className="text-xs text-blue-500">ETH</div>
                </div>
              </div>
              <div className="text-xs text-blue-500 text-center">按触发价 {fmt(triggerPrice)} U/ETH 折算</div>
            </div>
          )}

          {activeScheme === "B" && (
            <div className="p-4 rounded-2xl space-y-3" style={{ background: '#FFFBEB', border: '1px solid #FCD34D' }}>
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-bold text-amber-900">方案 B：补交利息 / 费用</span>
              </div>
              <div className="text-xs text-amber-700 leading-relaxed">
                通过补交利息减少债务分母，使担保率回到 <span className="font-bold">{targetTier.name}</span>（担保率 ≥ {targetTier.minRate}%）
              </div>
              <div className="p-3 rounded-xl text-center" style={{ background: '#fff', border: '1px solid #FCD34D' }}>
                <div className="text-xs text-gray-500 mb-1">需补交利息（U）</div>
                <div className="text-3xl font-bold text-amber-700">{fmt(gapB_U)}</div>
                <div className="text-xs text-amber-500 mt-1">U</div>
              </div>
              <div className="text-xs text-amber-600 leading-relaxed">
                补交后：总债务从 {fmt(totalDebt)} U 降至 {fmt(Math.max(0, totalDebt - gapB_U))} U，担保率恢复至 {targetTier.minRate}%
              </div>
            </div>
          )}

          {activeScheme === "C" && (
            <div className="p-4 rounded-2xl space-y-3" style={{ background: '#F5F3FF', border: '1px solid #C4B5FD' }}>
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-bold text-purple-900">方案 C：让渡收益权</span>
              </div>
              <div className="text-xs text-purple-700 leading-relaxed">
                通过让渡未来收益权，等效降低债务压力，使担保率回到 <span className="font-bold">{targetTier.name}</span>
              </div>
              <div className="p-3 rounded-xl text-center" style={{ background: '#fff', border: '1px solid #C4B5FD' }}>
                <div className="text-xs text-gray-500 mb-1">需让渡收益权比例</div>
                <div className="text-3xl font-bold text-purple-700">{fmt(gapC_pct, 2)}%</div>
              </div>
              <div className="text-xs text-purple-600 leading-relaxed">
                即：未来 ETH 上涨收益中，让出 {fmt(gapC_pct, 2)}% 给资方，换取本次不追加担保物。
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 第四步：多档位跌幅预演表 */}
      <div style={{ background: '#F8FAFF' }}>
        <div className="px-4 pt-3 pb-4">
          <div className="text-sm font-bold mb-3" style={{ color: '#1A2340' }}>④ 各跌幅补足需求一览</div>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E0E8FF' }}>
            <div className="grid text-center text-[10px] font-semibold py-2" style={{ gridTemplateColumns: '1fr 1.2fr 1fr 1.2fr 1.2fr', background: '#1A2340', color: '#93C5FD' }}>
              <div>跌幅</div>
              <div>ETH价(U)</div>
              <div>担保率</div>
              <div>补A(ETH)</div>
              <div>补B(U)</div>
            </div>
            {dropScenarios.map((s, i) => (
              <div key={i} className="grid text-center text-xs py-2.5" style={{
                gridTemplateColumns: '1fr 1.2fr 1fr 1.2fr 1.2fr',
                background: i % 2 === 0 ? '#fff' : '#F8FAFF',
                borderTop: '1px solid #E0E8FF',
              }}>
                <div className="font-semibold text-red-600">-{s.dropPct}%</div>
                <div style={{ color: '#374151' }}>{fmt(s.price, 0)}</div>
                <div className="font-bold" style={{ color: s.tier.color }}>{fmt(s.rate, 0)}%</div>
                <div style={{ color: '#2563EB' }}>{fmt(s.gapA_eth, 3)}</div>
                <div style={{ color: '#D97706' }}>{fmt(s.gapB, 0)}</div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-gray-400 mt-2 text-center">
            补A = 追加担保物（按触发价折算ETH）&nbsp;|&nbsp;补B = 补交利息（U）
          </div>
        </div>
      </div>

    </div>
  );
}
