import { useState, useEffect } from 'react';

// ============================================================
// 晋升规则配置（四维）
// ============================================================
const TIER_RULES = {
  standard: { contactMin: 50, tagMin: 1, frequencyMin: 3, nodeShare: 0, label: '标准节点', weightLabel: '基础加成' },
  advanced: { contactMin: 100, tagMin: 3, frequencyMin: 6, nodeShare: 5, label: '高级节点', weightLabel: '2× 权重' },
  super: { contactMin: 150, tagMin: 5, frequencyMin: 9, nodeShare: 5, label: '超级节点', weightLabel: '5× 权重' },
};

// ============================================================
// Props
// ============================================================
interface NodeAchievementBadgeProps {
  level: 'none' | 'standard' | 'advanced' | 'super';
  equityBonus: number;
  contributionScore: number;
  marketShare: number;
  isQualified: boolean;
  estimatedEquityBonus?: number;
  contactCount?: number;
  tagAverage?: number;
  contactFrequency?: number;
  standardNodeCount?: number;
  advancedNodeCount?: number;
  totalEquity?: number;        // 总权重（与第一层相同）
  investmentEquity?: number;   // 基础权证（资本部分）
  contribEquity?: number;      // 贡献加成（市场贡献部分）
  inviteEquity?: number;       // 邀请贡献股权
  referralNetworkEquity?: number; // 人脉网络股权
  inviteCount?: number;        // 邀请人数
  referralNetworkCount?: number; // 人脉网络人数
  dynamicLeverage?: {            // 动态杠杆数据
    leverage: number;
    seatNumber: number;
    totalSeats: number;
    currentRound: {
      name: string;
      label: string;
      maxLeverage: number;
      minLeverage: number;
      progress: number;
    };
    nextRound: { name: string; label: string; maxLeverage: number } | null;
    nextRoundLeverage: number;
    hesitationCost: number;
  } | null;
}

// ============================================================
// 胶囊进度条子组件
// ============================================================
const CapsuleIndicator: React.FC<{
  label: string;
  current: number;
  target: number;
  unit?: string;
  isDynamic?: boolean;
}> = ({ label, current, target, unit = '', isDynamic = false }) => {
  const done = current >= target;
  const pct = Math.min(100, (current / target) * 100);

  return (
    <div className="flex items-center space-x-3">
      {/* 左侧标签 */}
      <div className="w-[72px] flex-shrink-0">
        <div className="text-[11px] text-gray-600 font-medium leading-tight">{label}</div>
        {isDynamic && (
          <div className="text-[9px] text-gray-400 mt-0.5">7日均值</div>
        )}
      </div>

      {/* 中间进度条 */}
      <div className="flex-1 min-w-0">
        <div className="h-[18px] bg-gray-200 rounded-full overflow-hidden relative">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              done ? 'bg-gradient-to-r from-green-500 to-green-400' : 'bg-gradient-to-r from-[#A80000] to-[#cc3333]'
            }`}
            style={{ width: `${Math.max(pct, 3)}%` }}
          />
          {/* 进度条内文字 */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-[10px] font-bold ${pct > 50 ? 'text-white' : 'text-gray-500'}`}>
              {current}{unit} / {target}{unit}
            </span>
          </div>
        </div>
      </div>

      {/* 右侧状态 */}
      <div className="w-5 flex-shrink-0 flex justify-center">
        {done ? (
          <svg className="w-4 h-4 text-[#4CAF50]" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        ) : (
          <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
        )}
      </div>
    </div>
  );
};

// ============================================================
// 主组件
// ============================================================
const NodeAchievementBadge: React.FC<NodeAchievementBadgeProps> = ({
  level,
  equityBonus,
  contributionScore,
  marketShare,
  isQualified,
  estimatedEquityBonus = 0.0015,
  contactCount = 0,
  tagAverage = 0,
  contactFrequency = 0,
  standardNodeCount = 0,
  advancedNodeCount = 0,
  totalEquity = 0,
  investmentEquity = 0,
  contribEquity = 0,
  inviteEquity = 0,
  referralNetworkEquity = 0,
  inviteCount = 0,
  referralNetworkCount = 0,
  dynamicLeverage = null,
}) => {
  const [displayedBonus, setDisplayedBonus] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showRules, setShowRules] = useState(false);

  // Count-up 动画
  useEffect(() => {
    if (!isQualified) { setDisplayedBonus(0); return; }
    const duration = 1500;
    const steps = 60;
    const increment = equityBonus / steps;
    let current = 0;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      current += increment;
      if (step >= steps) { setDisplayedBonus(equityBonus); clearInterval(timer); }
      else { setDisplayedBonus(current); }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [equityBonus, isQualified]);

  // 等级配置
  const nodeConfig: Record<string, { name: string; badge: string }> = {
    none: { name: '准合伙人', badge: 'L0' },
    standard: { name: '标准节点', badge: 'L1' },
    advanced: { name: '高级节点', badge: 'L2' },
    super: { name: '超级节点', badge: 'L3' },
  };
  const config = nodeConfig[level];

  // 下一等级
  const getNextTier = () => {
    if (level === 'super') return null;
    if (level === 'advanced') return { key: 'super' as const, ...TIER_RULES.super };
    if (level === 'standard') return { key: 'advanced' as const, ...TIER_RULES.advanced };
    return { key: 'standard' as const, ...TIER_RULES.standard };
  };
  const nextTier = getNextTier();

  // 四维指标（针对下一等级）
  const getFourDimensions = () => {
    if (!nextTier) return [];
    const dims: { label: string; current: number; target: number; unit: string; isDynamic: boolean }[] = [
      { label: '人脉规模', current: contactCount, target: nextTier.contactMin, unit: '人', isDynamic: false },
      { label: '标签质量', current: tagAverage, target: nextTier.tagMin, unit: '', isDynamic: false },
      { label: '联络频率', current: contactFrequency, target: nextTier.frequencyMin, unit: '人/日', isDynamic: true },
    ];
    if (nextTier.key === 'advanced') {
      dims.push({ label: '节点共享', current: standardNodeCount, target: nextTier.nodeShare, unit: '名', isDynamic: false });
    } else if (nextTier.key === 'super') {
      dims.push({ label: '节点共享', current: advancedNodeCount, target: nextTier.nodeShare, unit: '名', isDynamic: false });
    } else {
      dims.push({ label: '节点共享', current: 0, target: 0, unit: '', isDynamic: false });
    }
    return dims;
  };
  const fourDims = getFourDimensions();
  const doneCount = fourDims.filter(d => d.target > 0 && d.current >= d.target).length;
  const totalDims = fourDims.filter(d => d.target > 0).length;

  // 顶部卡片样式
  const getTopCardStyle = () => {
    switch (level) {
      case 'none': return 'bg-[#F5F5F5] text-gray-600';
      case 'standard': return 'bg-gradient-to-br from-[#A80000] to-[#8a0000] text-white';
      case 'advanced': return 'bg-gradient-to-br from-[#0a1628] to-[#1a2744] text-white';
      case 'super': return 'bg-gradient-to-br from-[#1a1a2e] via-[#2d2d44] to-[#1a1a2e] text-white';
    }
  };
  const getBonusColor = () => {
    switch (level) {
      case 'none': return 'text-gray-400';
      case 'standard': return 'text-white';
      case 'advanced': return 'text-amber-400';
      case 'super': return 'text-amber-300';
    }
  };
  const getStatusDotColor = () => {
    if (!isQualified) return '#F59E0B';
    switch (level) {
      case 'standard': return '#10B981';
      case 'advanced': return '#60A5FA';
      case 'super': return '#FBBF24';
      default: return '#F59E0B';
    }
  };
  const bonusValue = isQualified
    ? `+${(displayedBonus * 100).toFixed(4)}`
    : level === 'none'
      ? `+${(estimatedEquityBonus * 100).toFixed(4)}`
      : `+X.XXXX`;

  return (
    <>
      <div className="space-y-0">
        {/* ====== 顶部进化卡片 ====== */}
        <div
          className={`relative overflow-hidden p-5 rounded-t-2xl rounded-b-none shadow-none border-none cursor-pointer transition-all ${getTopCardStyle()}`}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {/* 超级节点：钛金流光 */}
          {level === 'super' && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%]" style={{
                background: 'conic-gradient(from 0deg, transparent 0%, rgba(251,191,36,0.08) 10%, transparent 20%, rgba(251,191,36,0.05) 30%, transparent 40%)',
                animation: 'titaniumSpin 8s linear infinite',
              }} />
            </div>
          )}
          {/* 高级节点：微光粒子 */}
          {level === 'advanced' && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="absolute w-1 h-1 rounded-full bg-blue-400/30" style={{
                  left: `${15 + i * 15}%`, top: `${20 + (i % 3) * 25}%`,
                  animation: `floatParticle ${3 + i * 0.5}s ease-in-out infinite`,
                  animationDelay: `${i * 0.3}s`,
                }} />
              ))}
            </div>
          )}
          {/* 未达成：半透明勋章水印 */}
          {level === 'none' && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-[0.06] pointer-events-none">
              <svg width="100" height="100" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
          )}

          <div className="relative z-10">
            {/* 标题行 */}
            <div className="flex items-center justify-between mb-3">
              <span className={`text-sm ${level === 'none' ? 'text-gray-500' : 'opacity-90'}`}>
                市场贡献激励
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowRules(true); }}
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    level === 'none' ? 'bg-gray-300 text-gray-600 hover:bg-gray-400' : 'bg-white/20 text-white/80 hover:bg-white/30'
                  }`}
                >?</button>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getStatusDotColor() }} />
                <svg className={`w-5 h-5 transition-transform ${level === 'none' ? 'text-gray-400' : 'opacity-90'} ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* 核心数值：与第一层相同的总权重 */}
            <div className="flex items-baseline space-x-2">
              <span className={`text-5xl font-bold ${level === 'none' ? 'text-gray-800' : 'text-white'}`} style={{
                fontVariantNumeric: 'tabular-nums',
              }}>
                {totalEquity.toFixed(4)}
              </span>
              <span className={`text-2xl ${level === 'none' ? 'text-gray-400' : 'opacity-90'}`}>%</span>
            </div>

            {/* 副标题 */}
            <div className="mt-2 flex items-center justify-between">
              <span className={`text-xs ${level === 'none' ? 'text-gray-400' : 'opacity-60'}`}>
                当前综合权重
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                level === 'none' ? 'bg-gray-300 text-gray-600'
                  : level === 'advanced' ? 'bg-[#1976D2]/20 text-blue-300'
                    : level === 'super' ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-white/10 text-white/80'
              }`}>
                {config.name}
              </span>
            </div>

            {/* === 权重拆解区域（始终可见，与第一层对称） === */}
            {(() => {
              const baseEq = investmentEquity || 0;
              const contribEq = contribEquity || 0;
              const totalEq = baseEq + contribEq;
              const basePct = totalEq > 0 ? (baseEq / totalEq) * 100 : 100;
              const contribPct = totalEq > 0 ? (contribEq / totalEq) * 100 : 0;
              return (
                <div className="mt-4 pt-3 border-t border-white/15">
                  {/* 拆解数值 */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-1.5">
                      <div className="w-2 h-2 rounded-full bg-white/80" />
                      <span className="text-xs opacity-70">基础权证</span>
                      <span className="text-sm font-bold">{baseEq.toFixed(4)}%</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <div className="w-2 h-2 rounded-full bg-yellow-400" />
                      <span className="text-xs opacity-70">贡献加成</span>
                      <span className="text-sm font-bold text-yellow-300">+{contribEq.toFixed(4)}%</span>
                    </div>
                  </div>
                  {/* 横向比例条 */}
                  <div className="h-2 rounded-full overflow-hidden bg-white/10 flex">
                    <div
                      className="h-full bg-white/70 transition-all duration-700"
                      style={{ width: `${Math.max(basePct, 2)}%` }}
                    />
                    <div
                      className="h-full bg-gradient-to-r from-yellow-400 to-orange-400 transition-all duration-700"
                      style={{ width: `${Math.max(contribPct, contribEq > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] opacity-50">
                    <span>资本底盘 · 静态确权</span>
                    <span>市场贡献 · 动态增长</span>
                  </div>
                </div>
              );
            })()}

            {/* 未达成状态：激活条件预览 */}
            {level === 'none' && (
              <div className="mt-4 pt-4 border-t border-gray-300/50 space-y-2">
                <div className="text-xs text-gray-500 font-semibold">激活条件预览</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className={`text-xs px-2 py-1.5 rounded-lg ${contactCount >= 50 ? 'bg-[#E8F5E9] text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                    人脉 {contactCount}/50 {contactCount >= 50 ? '✓' : ''}
                  </div>
                  <div className={`text-xs px-2 py-1.5 rounded-lg ${tagAverage >= 1 ? 'bg-[#E8F5E9] text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                    标签 {tagAverage}/1 {tagAverage >= 1 ? '✓' : ''}
                  </div>
                  <div className={`text-xs px-2 py-1.5 rounded-lg ${contactFrequency >= 3 ? 'bg-[#E8F5E9] text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                    频率 {contactFrequency}/3 {contactFrequency >= 3 ? '✓' : ''}
                  </div>
                  <div className="text-xs px-2 py-1.5 rounded-lg bg-gray-100 text-gray-400">
                    共享 —
                  </div>
                </div>
                <div className="text-xs text-gray-400 italic">
                  补齐资料即可激活贡献加成收益
                </div>
              </div>
            )}

            {/* 达成后展开的详细内容：累计确权筹码 + 实时市场权重 + 组织培育收益 + 社会化资产溢价 */}
            {isExpanded && level !== 'none' && (
              <div className="mt-4 pt-4 border-t border-white/20 space-y-3">
                {/* 顶部主数据：左右布局 */}
                <div className="grid grid-cols-2 gap-3">
                  {/* 左侧：累计确权筹码 */}
                  <div className={`rounded-xl p-3 ${level === 'advanced' ? 'bg-[#424242]/30' : level === 'super' ? 'bg-amber-900/20' : 'bg-white/10'}`}>
                    <div className="text-[10px] opacity-60 mb-1">累计确权筹码</div>
                    <div className="text-2xl font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {contributionScore.toLocaleString()}
                    </div>
                    <div className="text-[10px] opacity-50 mt-0.5">点</div>
                  </div>
                  {/* 右侧：实时市场权重 */}
                  <div className={`rounded-xl p-3 ${level === 'advanced' ? 'bg-[#424242]/30' : level === 'super' ? 'bg-amber-900/20' : 'bg-white/10'}`}>
                    <div className="text-[10px] opacity-60 mb-1">实时市场权重</div>
                    <div className="text-2xl font-bold text-yellow-300" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      +{contribEquity.toFixed(4)}%
                    </div>
                    <div className="text-[10px] opacity-50 mt-0.5">全场占比</div>
                  </div>
                </div>

                {/* 中部方块：组织培育收益 + 社会化资产溢价 */}
                <div className="grid grid-cols-2 gap-3">
                  {/* 左侧：组织培育收益 */}
                  <div className={`rounded-xl p-3 border ${level === 'advanced' ? 'bg-[#424242]/20 border-[#1976D2]/20' : level === 'super' ? 'bg-amber-900/10 border-amber-500/20' : 'bg-white/5 border-white/10'}`}>
                    <div className="text-[10px] opacity-60 mb-1">组织培育收益</div>
                    <div className="text-xl font-bold text-green-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      +{(inviteEquity * 100).toFixed(4)}%
                    </div>
                    <div className="text-[10px] opacity-50 mt-1">
                      {inviteCount} 位核心节点贡献
                    </div>
                  </div>
                  {/* 右侧：社会化资产溢价 */}
                  <div className={`rounded-xl p-3 border ${level === 'advanced' ? 'bg-[#424242]/20 border-[#1976D2]/20' : level === 'super' ? 'bg-amber-900/10 border-amber-500/20' : 'bg-white/5 border-white/10'}`}>
                    <div className="text-[10px] opacity-60 mb-1">社会化资产溢价</div>
                    <div className="text-xl font-bold text-blue-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      +{(referralNetworkEquity * 100).toFixed(4)}%
                    </div>
                    <div className="text-[10px] opacity-50 mt-1">
                      {referralNetworkCount.toLocaleString()} 人脉网络资产
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ====== 灰色底座 ====== */}
        <div className="bg-gray-50 rounded-t-none rounded-b-3xl shadow-sm border-none p-5">
          {/* === 2x2 经营矩阵 === */}
          {(() => {
            // 等级系数
            // 动态杠杆系数（优先使用动态值，回退到等级固定值）
            const levelMultiplier = dynamicLeverage ? dynamicLeverage.leverage : (level === 'super' ? 5.0 : level === 'advanced' ? 2.0 : level === 'standard' ? 1.0 : 0);
            const levelLabel = dynamicLeverage ? `×${dynamicLeverage.leverage.toFixed(4)}` : (level === 'super' ? '×5.0' : level === 'advanced' ? '×2.0' : level === 'standard' ? '×1.0' : '×0');
            
            // 四维活跃度计算（A系数）
            const targetTier = level === 'none' ? TIER_RULES.standard 
              : level === 'standard' ? TIER_RULES.standard 
              : level === 'advanced' ? TIER_RULES.advanced 
              : TIER_RULES.super;
            const contactPct = Math.min(1, contactCount / targetTier.contactMin);
            const tagPct = Math.min(1, tagAverage / targetTier.tagMin);
            const freqPct = Math.min(1, contactFrequency / targetTier.frequencyMin);
            const nodeShareTarget = targetTier.nodeShare;
            const nodeShareCurrent = level === 'advanced' ? standardNodeCount : advancedNodeCount;
            const nodeSharePct = nodeShareTarget > 0 ? Math.min(1, nodeShareCurrent / nodeShareTarget) : 0;
            
            // 计算本周剩余天数（到周日）
            const now = new Date();
            const dayOfWeek = now.getDay();
            const daysLeft = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
            
            // 状态标签
            const getStatusLabel = (pct: number) => {
              if (pct >= 1) return { text: '✅ 已达标', color: 'text-[#4CAF50]' };
              if (pct >= 0.5) return { text: '🏃 进行中', color: 'text-yellow-600' };
              return { text: '⚠️ 待提升', color: 'text-[#FFA000]' };
            };
            
            const contactStatus = getStatusLabel(contactPct);
            const tagStatus = getStatusLabel(tagPct);
            const freqStatus = getStatusLabel(freqPct);
            
            return (
              <div className="mb-5">
                {/* 标题 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-1 h-4 bg-[#A80000] rounded-full" />
                    <span className="text-sm font-bold text-gray-900">市场经营仪表盘</span>
                  </div>
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {daysLeft > 0 ? `本周剩余 ${daysLeft} 天` : '本周已结算'}
                  </span>
                </div>
                
                {/* 2x2 矩阵方块 */}
                <div className="grid grid-cols-2 gap-3">
                  {/* 左上 A：资源基石 */}
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-800">资源基石</span>
                      <span className={`text-[10px] font-medium ${contactStatus.color}`}>{contactStatus.text}</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {contactCount.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      规模: {contactCount} / {targetTier.contactMin}
                    </div>
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${contactPct >= 1 ? 'bg-[#4CAF50]' : 'bg-[#A80000]'}`} style={{ width: `${Math.min(100, contactPct * 100)}%` }} />
                    </div>
                    <div className="text-[9px] text-gray-400 mt-1">支撑社会化资产的人脉底座</div>
                  </div>

                  {/* 右上 B：资产质量 */}
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-800">资产质量</span>
                      <span className={`text-[10px] font-medium ${tagStatus.color}`}>{tagStatus.text}</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {tagAverage.toFixed(1)}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      标签完善度: {tagAverage.toFixed(1)} / {targetTier.tagMin}
                    </div>
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${tagPct >= 1 ? 'bg-[#4CAF50]' : 'bg-[#A80000]'}`} style={{ width: `${Math.min(100, tagPct * 100)}%` }} />
                    </div>
                    <div className="text-[9px] text-gray-400 mt-1">决定人脉产出效率与权重释放</div>
                  </div>

                  {/* 左下 C：经营活跃 */}
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-800">经营活跃</span>
                      <span className={`text-[10px] font-medium ${freqStatus.color}`}>{freqStatus.text}</span>
                    </div>
                    <div className="text-2xl font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {contactFrequency}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      本周活跃: {contactFrequency} / {targetTier.frequencyMin} 人/日
                    </div>
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${freqPct >= 1 ? 'bg-[#4CAF50]' : 'bg-[#A80000]'}`} style={{ width: `${Math.min(100, freqPct * 100)}%` }} />
                    </div>
                    <div className="text-[9px] text-gray-400 mt-1">决定每周权证点入账速度</div>
                  </div>

                  {/* 右下 D：组织溢价（动态杠杆） */}
                  <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-800">组织溢价</span>
                      <span className="text-[10px] font-medium text-[#1976D2]">🚀 {levelLabel}</span>
                    </div>
                    <div className="text-2xl font-bold text-[#A80000] font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {dynamicLeverage ? `×${dynamicLeverage.leverage.toFixed(4)}` : config.name}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">
                      {dynamicLeverage ? `编号 ${String(dynamicLeverage.seatNumber).padStart(4, '0')} · ${config.name}` : `节点等级: ${config.badge}`}
                    </div>
                    <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#A80000] to-yellow-500 transition-all duration-500" style={{ width: `${dynamicLeverage ? Math.min(100, (dynamicLeverage.leverage / 2.0) * 100) : (level === 'super' ? 100 : level === 'advanced' ? 66 : level === 'standard' ? 33 : 10)}%` }} />
                    </div>
                    <div className="text-[9px] text-gray-400 mt-1">放大所有产出的核心杠杆</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ====== 四维胶囊指标矩阵 ====== */}
          {nextTier && (
            <>
              <div className="border-t border-dashed border-gray-300 my-4" />

              {/* 木桶效应引导语 */}
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-semibold text-gray-700">
                  晋升条件 → {nextTier.label}
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className={`text-xs font-bold ${doneCount === totalDims ? 'text-[#4CAF50]' : 'text-[#A80000]'}`}>
                    {doneCount}/{totalDims} 项达成
                  </span>
                  {doneCount < totalDims && (
                    <span className="text-[10px] text-gray-400">补齐短板，收益翻倍</span>
                  )}
                </div>
              </div>

              {/* 胶囊进度条 */}
              <div className="space-y-3 bg-white rounded-xl p-4">
                {fourDims.filter(d => d.target > 0).map((dim, idx) => (
                  <CapsuleIndicator
                    key={idx}
                    label={dim.label}
                    current={dim.current}
                    target={dim.target}
                    unit={dim.unit}
                    isDynamic={dim.isDynamic}
                  />
                ))}
              </div>

              {/* 联络活跃度微缩提示 */}
              <div className="mt-3 flex items-center space-x-2 px-1">
                <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-[10px] text-gray-400">
                  联络活跃度：本周日均 {contactFrequency}人/日 | 目标 {nextTier.frequencyMin}人/日
                </span>
              </div>
            </>
          )}

          {/* 已达最高等级 */}
          {!nextTier && level === 'super' && (
            <>
              <div className="border-t border-dashed border-gray-300 my-4" />
              <div className="text-center py-4">
                <div className="text-amber-600 text-sm font-bold mb-1">🏆 已达最高等级</div>
                <div className="text-xs text-gray-400">超级节点 · 5× 权重加成 · 钛金流光特效</div>
              </div>
            </>
          )}

          {/* 通往下一等级的悬浮微缩卡片 */}
          {level === 'standard' && (
            <>
              <div className="border-t border-dashed border-gray-300 my-4" />
              <div className="bg-gradient-to-r from-[#0a1628] to-[#1a2744] rounded-xl p-3 cursor-pointer hover:shadow-md transition-all"
                onClick={() => setShowRules(true)}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-blue-300 font-semibold">通往高级节点</div>
                    <div className="text-[10px] text-blue-400/60 mt-0.5">解锁 2× 权重加成</div>
                  </div>
                  <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </>
          )}
          {level === 'advanced' && (
            <>
              <div className="border-t border-dashed border-gray-300 my-4" />
              <div className="bg-gradient-to-r from-[#1a1a2e] to-[#2d2d44] rounded-xl p-3 cursor-pointer hover:shadow-md transition-all"
                onClick={() => setShowRules(true)}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-amber-300 font-semibold">通往超级节点</div>
                    <div className="text-[10px] text-amber-400/60 mt-0.5">解锁 5× 权重加成 + 钛金流光特效</div>
                  </div>
                  <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </>
          )}

          {/* 底部总结文案 */}
          <div className="mt-4 pt-3 border-t border-gray-200">
            <div className="text-center text-[10px] text-gray-400 italic">
              “您的每一份市场经营行为，均已转化为不可篡改的权证资产。”
            </div>
          </div>

          {/* 查阅规则入口 */}
          <div className="mt-3 text-center">
            <button
              onClick={() => setShowRules(true)}
              className="text-xs text-gray-400 hover:text-[#A80000] transition-colors underline underline-offset-2"
            >
              查阅合伙人晋升准则
            </button>
          </div>
        </div>
      </div>

      {/* ====== 规则白皮书 Bottom Sheet ====== */}
      {showRules && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40 transition-opacity" onClick={() => setShowRules(false)} />
          <div className="relative w-full max-w-md bg-white rounded-t-2xl shadow-xl max-h-[85vh] overflow-y-auto animate-slide-up">
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="px-5 pb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">合伙人晋升准则</h3>
                <button onClick={() => setShowRules(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 对比表（含联络频率） */}
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2.5 px-1.5 text-gray-500 font-medium">维度</th>
                      <th className="text-center py-2.5 px-1.5 text-gray-700 font-bold">
                        <div className="flex flex-col items-center">
                          <span className={`${level === 'standard' ? 'text-[#A80000] underline' : 'text-[#A80000]'}`}>L1</span>
                          <span className="text-[10px]">标准节点</span>
                        </div>
                      </th>
                      <th className="text-center py-2.5 px-1.5 text-gray-700 font-bold">
                        <div className="flex flex-col items-center">
                          <span className={`${level === 'advanced' ? 'text-[#1976D2] underline' : 'text-[#1976D2]'}`}>L2</span>
                          <span className="text-[10px]">高级节点</span>
                        </div>
                      </th>
                      <th className="text-center py-2.5 px-1.5 text-gray-700 font-bold">
                        <div className="flex flex-col items-center">
                          <span className={`${level === 'super' ? 'text-amber-600 underline' : 'text-amber-600'}`}>L3</span>
                          <span className="text-[10px]">超级节点</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-2.5 px-1.5 text-gray-600">人脉基数</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 50</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 100</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 150</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2.5 px-1.5 text-gray-600">人均标签</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 1</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 3</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 5</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2.5 px-1.5 text-gray-600">联络频率</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 3人/日</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 6人/日</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 9人/日</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2.5 px-1.5 text-gray-600">节点共享</td>
                      <td className="py-2.5 px-1.5 text-center text-gray-400">—</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold text-[11px]">5名标准节点</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold text-[11px]">5名高级节点</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="py-2.5 px-1.5 text-gray-600">收益权重</td>
                      <td className="py-2.5 px-1.5 text-center">
                        <span className="px-1.5 py-0.5 bg-[#FFEBEE] text-[#A80000] rounded-full font-semibold text-[10px]">基础</span>
                      </td>
                      <td className="py-2.5 px-1.5 text-center">
                        <span className="px-1.5 py-0.5 bg-[#F5F5F5] text-[#1976D2] rounded-full font-semibold text-[10px]">2× 权重</span>
                      </td>
                      <td className="py-2.5 px-1.5 text-center">
                        <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-full font-semibold text-[10px]">5× 权重</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 当前状态指示 */}
              <div className="mt-5 p-3 bg-gray-50 rounded-xl">
                <div className="text-xs text-gray-500 mb-1">您当前的等级</div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-900">{config.name}</span>
                  {nextTier && <span className="text-xs text-gray-400">下一目标：{nextTier.label}</span>}
                </div>
                {nextTier && (
                  <div className="mt-2 flex items-center space-x-2">
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#A80000] rounded-full transition-all duration-500"
                        style={{ width: `${totalDims > 0 ? (doneCount / totalDims) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-500 flex-shrink-0">{doneCount}/{totalDims}</span>
                  </div>
                )}
              </div>

              {/* 说明文案 */}
              <div className="mt-4 space-y-3 text-xs text-gray-500 leading-relaxed">
                <p>
                  <strong className="text-gray-700">关于联络频率：</strong>
                  系统按自然周（周一到周日）统计您每天联络的不同联系人数量，取日均值。每周日 24:00 定格结算，周一重新计算。联络频率越高，说明您的人脉网络越活跃。
                </p>
                <p>
                  <strong className="text-gray-700">关于节点共享：</strong>
                  当您帮助其他股东达到标准节点/高级节点等级时，即视为完成一次"节点共享"。这不仅提升您的等级，也壮大了整个合伙人网络。
                </p>
                <p>
                  <strong className="text-gray-700">关于权重加成：</strong>
                  权重直接影响您在贡献池中的分配比例。高级节点享受 2 倍权重，意味着同等贡献分下，您的股权加成是标准节点的 2 倍。
                </p>
                <p>
                  <strong className="text-gray-700">等级保持：</strong>
                  一旦达成某等级，只要持续满足基础条件（人脉基数和标签），等级不会降低。联络频率低于阈值时，会收到提醒但不会立即降级。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====== CSS 动画 ====== */}
      <style>{`
        @keyframes titaniumSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes breathePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.92; transform: scale(1.01); }
        }
        @keyframes floatParticle {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.3; }
          50% { transform: translateY(-8px) scale(1.5); opacity: 0.6; }
        }
        @keyframes animate-slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: animate-slide-up 0.3s ease-out;
        }
      `}</style>
    </>
  );
};

export default NodeAchievementBadge;
