import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Calculator, AlertTriangle, TrendingUp, Coins, Share2 } from "lucide-react";

/**
 * 三联动补足模拟计算器
 * 纯前端模拟，不连接后端，仅供管理员测试使用
 */

// 档位定义
const TIERS = [
  { name: "优享档", minRate: 80, fee: 2, color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC" },
  { name: "标准档", minRate: 65, fee: 4, color: "#2563EB", bg: "#EFF6FF", border: "#93C5FD" },
  { name: "提醒档", minRate: 50, fee: 8, color: "#D97706", bg: "#FFFBEB", border: "#FCD34D" },
  { name: "补足档", minRate: 35, fee: 16, color: "#DC2626", bg: "#FEF2F2", border: "#FCA5A5" },
  { name: "处置档", minRate: 0, fee: 30, color: "#7C3AED", bg: "#F5F3FF", border: "#C4B5FD" },
];

function getTier(rate: number) {
  for (const t of TIERS) {
    if (rate >= t.minRate) return t;
  }
  return TIERS[TIERS.length - 1];
}

function getNextTier(currentTier: typeof TIERS[0]) {
  const idx = TIERS.indexOf(currentTier);
  return idx > 0 ? TIERS[idx - 1] : null;
}

export default function RiskGapCalculator() {
  // ── 基础参数 ──
  const [assetValue, setAssetValue] = useState(10000); // 当前资产市值（U）
  const [loanAmount, setLoanAmount] = useState(6000);  // 借款本金（U）
  const [accruedInterest, setAccruedInterest] = useState(300); // 已欠利息（U）
  const [yieldRate, setYieldRate] = useState(1);        // 当前收益让渡比例（%）
  const [exchangeRate, setExchangeRate] = useState(7.3); // 汇率 U→元

  // ── 方案输入 ──
  const [combineMode, setCombineMode] = useState(false);
  const [addCollateral, setAddCollateral] = useState(0);   // 方案A：追加担保物（U）
  const [addInterest, setAddInterest] = useState(0);       // 方案B：补交利息（U）
  const [addYield, setAddYield] = useState(0);             // 方案C：额外让渡收益（%）
  const [activeTab, setActiveTab] = useState<"A" | "B" | "C">("A");

  // ── 展开/折叠 ──
  const [showParams, setShowParams] = useState(false);

  // ── 计算逻辑 ──
  const totalDebt = loanAmount + accruedInterest;
  const currentRate = assetValue > 0 ? Math.round((assetValue / totalDebt) * 100) : 0;
  const currentTier = getTier(currentRate);
  const nextTier = getNextTier(currentTier);

  // 回到上一档位需要的担保率
  const targetRate = nextTier ? nextTier.minRate : currentRate;
  // 缺口：需要多少资产才能达到目标档位
  const gapAmount = nextTier
    ? Math.max(0, Math.ceil(totalDebt * (targetRate / 100) - assetValue))
    : 0;

  // 方案A效果：追加担保物后的担保率
  const effectiveAddCollateral = combineMode ? addCollateral : (activeTab === "A" ? addCollateral : 0);
  const effectiveAddInterest = combineMode ? addInterest : (activeTab === "B" ? addInterest : 0);
  const effectiveAddYield = combineMode ? addYield : (activeTab === "C" ? addYield : 0);

  // 方案B补交利息：减少欠息，等效于减少分母
  const newDebt = Math.max(0, totalDebt - effectiveAddInterest);
  // 方案C让渡收益权：等效于补足一定金额（让渡比例×资产市值×系数）
  const yieldEquivalent = (effectiveAddYield / 100) * assetValue * 2; // 1%让渡≈2%资产市值等效补足

  const newAssetValue = assetValue + effectiveAddCollateral + yieldEquivalent;
  const newRate = newDebt > 0 ? Math.round((newAssetValue / newDebt) * 100) : 100;
  const newTier = getTier(newRate);

  const gapCovered = Math.min(gapAmount, effectiveAddCollateral + effectiveAddInterest + yieldEquivalent);
  const gapRemaining = Math.max(0, gapAmount - gapCovered);
  const newYieldRate = yieldRate + effectiveAddYield;

  const isGapFilled = gapRemaining === 0 && gapAmount > 0;

  return (
    <div className="mx-4 mt-4 mb-6 rounded-2xl overflow-hidden" style={{ border: '1px solid #E0E8FF', boxShadow: '0 2px 12px rgba(26,86,219,0.08)' }}>
      {/* 标题栏 */}
      <div className="px-4 py-3 flex items-center gap-2" style={{ background: 'linear-gradient(135deg, #1A2340 0%, #2563EB 100%)' }}>
        <Calculator className="w-5 h-5 text-white" />
        <span className="font-bold text-white text-base">三联动补足模拟计算器</span>
        <span className="ml-auto text-xs text-blue-200 bg-blue-900/40 px-2 py-0.5 rounded-full">仅管理员可见</span>
      </div>

      {/* 当前风险状态卡片 */}
      <div className="px-4 pt-4 pb-3" style={{ background: currentTier.bg }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-xs text-gray-500">当前有效担保率</span>
            <div className="text-3xl font-bold mt-0.5" style={{ color: currentTier.color }}>{currentRate}%</div>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold" style={{ background: currentTier.color, color: '#fff' }}>
              <AlertTriangle className="w-3.5 h-3.5" />
              {currentTier.name}
            </div>
            <div className="text-xs text-gray-400 mt-1">综合费率 {currentTier.fee}%/年</div>
          </div>
        </div>

        {/* 担保率进度条 */}
        <div className="relative h-3 rounded-full bg-gray-200 overflow-hidden mt-1">
          <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(currentRate, 100)}%`, background: currentTier.color }} />
          {/* 档位分界线 */}
          {TIERS.slice(0, -1).map(t => (
            <div key={t.minRate} className="absolute top-0 h-full w-px bg-white/60" style={{ left: `${t.minRate}%` }} />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
          <span>0%</span>
          <span>35%</span>
          <span>50%</span>
          <span>65%</span>
          <span>80%</span>
          <span>100%</span>
        </div>

        {/* 缺口说明 */}
        {nextTier && gapAmount > 0 && (
          <div className="mt-3 p-3 rounded-xl" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5' }}>
            <div className="text-xs font-semibold text-red-700 mb-1">📌 需补足缺口</div>
            <div className="text-sm text-red-800">
              还差 <span className="font-bold text-lg">{gapAmount.toLocaleString()} U</span> 等值补足额，可回到 <span className="font-semibold">{nextTier.name}</span>（费率 {nextTier.fee}%/年）
            </div>
          </div>
        )}
        {!nextTier && (
          <div className="mt-3 p-3 rounded-xl" style={{ background: '#F0FDF4', border: '1px solid #86EFAC' }}>
            <div className="text-xs font-semibold text-green-700">✅ 已处于最优档位，无需补足</div>
          </div>
        )}
      </div>

      {/* 参数设置（可折叠） */}
      <div style={{ background: '#F8FAFF', borderTop: '1px solid #E0E8FF' }}>
        <button
          className="w-full px-4 py-2.5 flex items-center justify-between text-sm font-medium"
          style={{ color: '#2563EB' }}
          onClick={() => setShowParams(!showParams)}
        >
          <span>⚙️ 调整基础参数</span>
          {showParams ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showParams && (
          <div className="px-4 pb-4 grid grid-cols-2 gap-3">
            {[
              { label: "资产市值 (U)", value: assetValue, setter: setAssetValue },
              { label: "借款本金 (U)", value: loanAmount, setter: setLoanAmount },
              { label: "已欠利息 (U)", value: accruedInterest, setter: setAccruedInterest },
              { label: "当前让渡比例 (%)", value: yieldRate, setter: setYieldRate },
              { label: "汇率 (U→元)", value: exchangeRate, setter: setExchangeRate },
            ].map(({ label, value, setter }) => (
              <div key={label}>
                <div className="text-xs text-gray-500 mb-1">{label}</div>
                <input
                  type="number"
                  value={value}
                  onChange={e => setter(Number(e.target.value))}
                  className="w-full border rounded-lg px-2.5 py-1.5 text-sm font-medium"
                  style={{ borderColor: '#BFDBFE', background: '#fff', color: '#1A2340' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 三联动补足面板 */}
      <div className="px-4 pt-4 pb-2" style={{ background: '#fff', borderTop: '1px solid #E0E8FF' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold" style={{ color: '#1A2340' }}>补足方案</div>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <div
              className="relative w-10 h-5 rounded-full transition-colors"
              style={{ background: combineMode ? '#2563EB' : '#D1D5DB' }}
              onClick={() => setCombineMode(!combineMode)}
            >
              <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all" style={{ left: combineMode ? '22px' : '2px' }} />
            </div>
            <span className="text-xs text-gray-500">组合补足</span>
          </label>
        </div>

        {/* Tab 切换（单选模式） */}
        {!combineMode && (
          <div className="flex gap-2 mb-3">
            {(["A", "B", "C"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: activeTab === tab ? '#2563EB' : '#F1F5F9',
                  color: activeTab === tab ? '#fff' : '#64748B',
                  border: activeTab === tab ? '1px solid #2563EB' : '1px solid transparent',
                }}
              >
                {tab === "A" ? "🏦 补担保物" : tab === "B" ? "💰 补利息" : "🔄 让渡收益"}
              </button>
            ))}
          </div>
        )}

        {/* 方案 A：补担保物 */}
        {(combineMode || activeTab === "A") && (
          <div className="mb-3 p-3 rounded-xl" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-semibold text-blue-800">方案 A：追加担保物</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={addCollateral || ""}
                placeholder="追加金额 (U)"
                onChange={e => setAddCollateral(Number(e.target.value) || 0)}
                className="flex-1 border rounded-lg px-2.5 py-1.5 text-sm"
                style={{ borderColor: '#93C5FD', background: '#fff' }}
              />
              <span className="text-xs text-blue-600 font-medium">U</span>
            </div>
            {addCollateral > 0 && (
              <div className="mt-2 text-xs text-blue-700">
                追加 {addCollateral.toLocaleString()} U 后，担保率预计提升 +{Math.round((addCollateral / totalDebt) * 100)}%
              </div>
            )}
          </div>
        )}

        {/* 方案 B：补利息 */}
        {(combineMode || activeTab === "B") && (
          <div className="mb-3 p-3 rounded-xl" style={{ background: '#FFFBEB', border: '1px solid #FCD34D' }}>
            <div className="flex items-center gap-2 mb-2">
              <Coins className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-800">方案 B：补交利息/费用</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={addInterest || ""}
                placeholder="补交金额 (U)"
                onChange={e => setAddInterest(Number(e.target.value) || 0)}
                className="flex-1 border rounded-lg px-2.5 py-1.5 text-sm"
                style={{ borderColor: '#FCD34D', background: '#fff' }}
              />
              <span className="text-xs text-amber-600 font-medium">U</span>
            </div>
            {addInterest > 0 && (
              <div className="mt-2 text-xs text-amber-700">
                补交 {addInterest.toLocaleString()} U 后，欠息缺口缩小至 {Math.max(0, accruedInterest - addInterest).toLocaleString()} U
              </div>
            )}
          </div>
        )}

        {/* 方案 C：让渡收益权 */}
        {(combineMode || activeTab === "C") && (
          <div className="mb-3 p-3 rounded-xl" style={{ background: '#F5F3FF', border: '1px solid #C4B5FD' }}>
            <div className="flex items-center gap-2 mb-2">
              <Share2 className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-semibold text-purple-800">方案 C：额外让渡收益权</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={addYield || ""}
                placeholder="额外让渡比例 (%)"
                step="0.5"
                onChange={e => setAddYield(Number(e.target.value) || 0)}
                className="flex-1 border rounded-lg px-2.5 py-1.5 text-sm"
                style={{ borderColor: '#C4B5FD', background: '#fff' }}
              />
              <span className="text-xs text-purple-600 font-medium">%</span>
            </div>
            {addYield > 0 && (
              <div className="mt-2 text-xs text-purple-700">
                额外让渡 {addYield}%，等效补足约 {Math.round(yieldEquivalent).toLocaleString()} U，收益让渡比例升至 {newYieldRate.toFixed(1)}%
              </div>
            )}
            <div className="mt-2 text-xs text-purple-500 leading-relaxed">
              💡 若暂时不想追加资金，可通过提高收益让渡比例维持当前仓位。未来上涨收益的保留比例将相应下降。
            </div>
          </div>
        )}
      </div>

      {/* 实时结果预览 */}
      <div className="px-4 pb-4 pt-2" style={{ background: '#F8FAFF', borderTop: '1px solid #E0E8FF' }}>
        <div className="text-sm font-bold mb-3" style={{ color: '#1A2340' }}>📊 操作后预览</div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="p-3 rounded-xl text-center" style={{ background: newTier.bg, border: `1px solid ${newTier.border}` }}>
            <div className="text-xs text-gray-500 mb-1">操作后担保率</div>
            <div className="text-2xl font-bold" style={{ color: newTier.color }}>{Math.min(newRate, 999)}%</div>
            <div className="text-xs mt-0.5" style={{ color: newTier.color }}>{newTier.name}</div>
          </div>
          <div className="p-3 rounded-xl text-center" style={{ background: '#F0FDF4', border: '1px solid #86EFAC' }}>
            <div className="text-xs text-gray-500 mb-1">操作后费率</div>
            <div className="text-2xl font-bold text-green-700">{newTier.fee}%</div>
            <div className="text-xs text-green-600 mt-0.5">/年</div>
          </div>
        </div>

        {/* 变化对比 */}
        <div className="p-3 rounded-xl space-y-2" style={{ background: '#fff', border: '1px solid #E0E8FF' }}>
          {[
            { label: "担保率", from: `${currentRate}%`, to: `${Math.min(newRate, 999)}%`, improved: newRate > currentRate },
            { label: "档位", from: currentTier.name, to: newTier.name, improved: TIERS.indexOf(newTier) < TIERS.indexOf(currentTier) },
            { label: "综合费率", from: `${currentTier.fee}%/年`, to: `${newTier.fee}%/年`, improved: newTier.fee < currentTier.fee },
            { label: "收益让渡", from: `${yieldRate}%`, to: `${newYieldRate.toFixed(1)}%`, improved: newYieldRate <= yieldRate },
          ].map(({ label, from, to, improved }) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-gray-500 text-xs">{label}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400 text-xs">{from}</span>
                <span className="text-gray-300">→</span>
                <span className="font-semibold text-xs" style={{ color: improved ? '#16A34A' : (from === to ? '#6B7280' : '#DC2626') }}>{to}</span>
              </div>
            </div>
          ))}
          {gapAmount > 0 && (
            <div className="flex items-center justify-between text-sm pt-1 border-t border-gray-100">
              <span className="text-gray-500 text-xs">剩余缺口</span>
              <span className="font-bold text-sm" style={{ color: gapRemaining === 0 ? '#16A34A' : '#DC2626' }}>
                {gapRemaining === 0 ? "✅ 已补足" : `${gapRemaining.toLocaleString()} U`}
              </span>
            </div>
          )}
        </div>

        {/* 汇率换算 */}
        {(effectiveAddCollateral > 0 || effectiveAddInterest > 0) && (
          <div className="mt-2 text-xs text-gray-400 text-center">
            参考汇率 1U ≈ {exchangeRate} 元 | 补足总额 ≈ {Math.round((effectiveAddCollateral + effectiveAddInterest) * exchangeRate).toLocaleString()} 元
          </div>
        )}
      </div>
    </div>
  );
}
