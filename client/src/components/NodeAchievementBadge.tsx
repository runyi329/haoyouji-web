import { useState } from 'react';

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
  totalEquity?: number;
  investmentEquity?: number;
  contribEquity?: number;
  inviteEquity?: number;
  referralNetworkEquity?: number;
  inviteCount?: number;
  referralNetworkCount?: number;
  dynamicLeverage?: {
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
// 主组件
// ============================================================
const NodeAchievementBadge: React.FC<NodeAchievementBadgeProps> = ({
  level,
  equityBonus,
  contactCount = 0,
  tagAverage = 0,
  contactFrequency = 0,
  standardNodeCount = 0,
  advancedNodeCount = 0,
  contribEquity = 0,
  inviteCount = 0,
  referralNetworkCount = 0,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showRules, setShowRules] = useState(false);

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

  // 顶部卡片样式
  const getTopCardStyle = () => {
    switch (level) {
      case 'none': return 'bg-[#F5F5F5] text-[#757575]';
      case 'standard': return 'bg-gradient-to-br from-[#A80000] to-[#8a0000] text-white';
      case 'advanced': return 'bg-gradient-to-br from-[#0a1628] to-[#1a2744] text-white';
      case 'super': return 'bg-gradient-to-br from-[#1a1a2e] via-[#2d2d44] to-[#1a1a2e] text-white';
    }
  };

  return (
    <>
      <div className="space-y-0">
        {/* ====== 顶部红卡结果区 ====== */}
        <div
          className={`relative overflow-hidden p-4 rounded-t-2xl rounded-b-none shadow-none border-none cursor-pointer transition-all ${getTopCardStyle()}`}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {/* 标题行 */}
          <div className="flex items-center justify-between mb-2.5">
            <span className={`text-sm ${level === 'none' ? 'text-[#757575]' : 'opacity-90'}`}>
              市场贡献激励
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={(e) => { e.stopPropagation(); setShowRules(true); }}
                className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <span className="text-xs">?</span>
              </button>
              <svg
                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* 左右布局：我的身份 | 市场权重 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 左侧：我的身份 */}
            <div>
              <div className={`text-xs ${level === 'none' ? 'text-[#757575]' : 'opacity-70'} mb-1`}>我的身份</div>
              <div className="text-2xl font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {config.name}
              </div>
              <div className={`text-[10px] ${level === 'none' ? 'text-[#757575]' : 'opacity-60'} mt-0.5`}>
                由个人人脉贡献决定
              </div>
            </div>

            {/* 右侧：市场权重 */}
            <div className="text-right">
              <div className={`text-xs ${level === 'none' ? 'text-[#757575]' : 'opacity-70'} mb-1`}>市场权重</div>
              <div className="text-2xl font-bold text-[#FFA726]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                +{(contribEquity).toFixed(4)}%
              </div>
              <div className={`text-[10px] ${level === 'none' ? 'text-[#757575]' : 'opacity-60'} mt-0.5`}>
                由共享人脉贡献决定
              </div>
            </div>
          </div>
        </div>

        {/* ====== 展开内容：极简双清单 ====== */}
        {isExpanded && (
          <div className="bg-[#F9F9F9] rounded-b-2xl p-4 space-y-5">
            {/* ====== 第一板块：个人人脉贡献（你的"底薪"） ====== */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-[#424242]">个人人脉贡献</h4>
                <span className="text-[10px] text-[#757575]">你的"底薪"</span>
              </div>

              {/* 4行极简进度条（无边框，直接平铺） */}
              <div className="space-y-2.5">
                {/* 人脉规模 */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[#757575]">人脉规模</span>
                    <span className={`text-[10px] font-medium ${contactCount >= (nextTier?.contactMin || 50) ? 'text-[#4CAF50]' : 'text-[#757575]'}`}>
                      {contactCount >= (nextTier?.contactMin || 50) ? '✅ 已达标' : '⚠️ 待提升'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${contactCount >= (nextTier?.contactMin || 50) ? 'bg-[#4CAF50]' : 'bg-[#A80000]'}`}
                      style={{ width: `${Math.min(100, (contactCount / (nextTier?.contactMin || 50)) * 100)}%` }}
                    />
                  </div>
                  <div className="text-[9px] text-[#757575] mt-0.5">
                    规模: {contactCount} / {nextTier?.contactMin || 50}
                  </div>
                </div>

                {/* 标签完善 */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[#757575]">标签完善</span>
                    <span className={`text-[10px] font-medium ${tagAverage >= (nextTier?.tagMin || 1) ? 'text-[#4CAF50]' : 'text-[#757575]'}`}>
                      {tagAverage >= (nextTier?.tagMin || 1) ? '✅ 已达标' : '⚠️ 待提升'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${tagAverage >= (nextTier?.tagMin || 1) ? 'bg-[#4CAF50]' : 'bg-[#A80000]'}`}
                      style={{ width: `${Math.min(100, (tagAverage / (nextTier?.tagMin || 1)) * 100)}%` }}
                    />
                  </div>
                  <div className="text-[9px] text-[#757575] mt-0.5">
                    标签完善度: {tagAverage.toFixed(1)} / {nextTier?.tagMin || 1}
                  </div>
                </div>

                {/* 联络频率 */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[#757575]">联络频率</span>
                    <span className={`text-[10px] font-medium ${contactFrequency >= (nextTier?.frequencyMin || 3) ? 'text-[#4CAF50]' : 'text-[#D32F2F]'}`}>
                      {contactFrequency >= (nextTier?.frequencyMin || 3) ? '✅ 已达标' : '❌ 未开启'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${contactFrequency >= (nextTier?.frequencyMin || 3) ? 'bg-[#4CAF50]' : 'bg-[#A80000]'}`}
                      style={{ width: `${Math.min(100, (contactFrequency / (nextTier?.frequencyMin || 3)) * 100)}%` }}
                    />
                  </div>
                  <div className="text-[9px] text-[#757575] mt-0.5">
                    本周活跃: {contactFrequency} / {nextTier?.frequencyMin || 3} 人/日
                  </div>
                </div>
              </div>

              {/* 状态结项：本周个人贡献分 */}
              <div className="mt-3 pt-3 border-t border-[#E0E0E0]">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#757575]">本周个人贡献分</span>
                  <span className="text-sm font-bold text-[#1976D2]">+100 点</span>
                </div>
              </div>
            </div>

            {/* ====== 第二板块：共享人脉贡献（你的"奖金"） ====== */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-[#424242]">共享人脉贡献</h4>
                <span className="text-[10px] text-[#757575]">你的"奖金"</span>
              </div>

              {/* 3行核心资产清单（无边框，极简风格） */}
              <div className="space-y-2">
                {/* 已培育标准节点 */}
                <div className="flex items-center justify-between py-2 border-b border-[#E0E0E0]">
                  <span className="text-xs text-[#757575]">已培育标准节点</span>
                  {standardNodeCount > 0 ? (
                    <span className="text-sm font-bold text-[#424242]">{standardNodeCount} 名</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#757575]">0 名</span>
                      <button className="text-[10px] text-[#757575] hover:text-[#A80000] transition-colors px-2 py-0.5 border border-[#E0E0E0] rounded">[去培育]</button>
                    </div>
                  )}
                </div>

                {/* 已培育高级节点 */}
                <div className="flex items-center justify-between py-2 border-b border-[#E0E0E0]">
                  <span className="text-xs text-[#757575]">已培育高级节点</span>
                  {advancedNodeCount > 0 ? (
                    <span className="text-sm font-bold text-[#424242]">{advancedNodeCount} 名</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#757575]">0 名</span>
                      <button className="text-[10px] text-[#757575] hover:text-[#A80000] transition-colors px-2 py-0.5 border border-[#E0E0E0] rounded">[去培育]</button>
                    </div>
                  )}
                </div>

                {/* 已培育超级节点 */}
                <div className="flex items-center justify-between py-2 border-b border-[#E0E0E0]">
                  <span className="text-xs text-[#757575]">已培育超级节点</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-[#757575]">0 名</span>
                    <button className="text-[10px] text-[#757575] hover:text-[#A80000] transition-colors px-2 py-0.5 border border-[#E0E0E0] rounded">[去培育]</button>
                  </div>
                </div>
              </div>

              {/* 状态结项：共享加成权重 */}
              <div className="mt-3 pt-3 border-t border-[#E0E0E0]">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#757575]">共享加成权重</span>
                  <span className="text-base font-extrabold text-[#FFA726]">+{(contribEquity).toFixed(4)}%</span>
                </div>
              </div>
            </div>

            {/* 本周结算倒计时 */}
            <div className="pt-3 border-t border-[#E0E0E0]">
              <div className="text-center text-[10px] text-[#757575] bg-white py-2 px-3 rounded-lg">
                ⏰ 距离本周资产定格还剩：<span className="font-bold text-[#A80000]">3天 14小时</span>
              </div>
            </div>

            {/* 底部总结文案 */}
            <div className="pt-3">
              <div className="relative text-center text-[10px] text-[#757575] italic bg-gray-50 py-3 px-4 rounded-lg">
                {/* 印章图标背景 */}
                <div className="absolute inset-0 flex items-center justify-center opacity-5">
                  <svg className="w-16 h-16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </div>
                {/* 文案内容 */}
                <div className="relative z-10">
                  📜 "您的每一份市场经营行为，均已转化为不可篡改的权证资产。"
                </div>
              </div>
            </div>

            {/* 查阅规则入口 */}
            <div className="text-center space-y-2">
              <button
                onClick={() => setShowRules(true)}
                className="text-xs text-[#757575] hover:text-[#A80000] transition-colors underline underline-offset-2"
              >
                查阅合伙人晋升准则
              </button>
              <div className="text-xs text-[#757575]">/</div>
              <button
                onClick={() => {/* TODO: 打开历史确权账单 */}}
                className="text-xs text-[#757575] hover:text-[#A80000] transition-colors underline underline-offset-2"
              >
                查阅历史确权周报 →
              </button>
            </div>
          </div>
        )}
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
                <h3 className="text-lg font-bold text-[#424242]">合伙人晋升准则</h3>
                <button onClick={() => setShowRules(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
                  <svg className="w-4 h-4 text-[#757575]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 对比表 */}
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#E0E0E0]">
                      <th className="text-left py-2.5 px-1.5 text-[#757575] font-medium">维度</th>
                      <th className="text-center py-2.5 px-1.5 text-[#424242] font-bold">
                        <div className="flex flex-col items-center">
                          <span className="text-[#A80000]">L1</span>
                          <span className="text-[10px]">标准节点</span>
                        </div>
                      </th>
                      <th className="text-center py-2.5 px-1.5 text-[#424242] font-bold">
                        <div className="flex flex-col items-center">
                          <span className="text-[#1976D2]">L2</span>
                          <span className="text-[10px]">高级节点</span>
                        </div>
                      </th>
                      <th className="text-center py-2.5 px-1.5 text-[#424242] font-bold">
                        <div className="flex flex-col items-center">
                          <span className="text-[#FFA726]">L3</span>
                          <span className="text-[10px]">超级节点</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-[#E0E0E0]">
                      <td className="py-2.5 px-1.5 text-[#757575]">人脉基数</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 50</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 100</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 150</td>
                    </tr>
                    <tr className="border-b border-[#E0E0E0]">
                      <td className="py-2.5 px-1.5 text-[#757575]">人均标签</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 1</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 3</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 5</td>
                    </tr>
                    <tr className="border-b border-[#E0E0E0]">
                      <td className="py-2.5 px-1.5 text-[#757575]">联络频率</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 3人/日</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 6人/日</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 9人/日</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-1.5 text-[#757575]">节点共享</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">-</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 5名</td>
                      <td className="py-2.5 px-1.5 text-center font-semibold">≥ 5名</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-[#757575] leading-relaxed">
                  <p className="mb-2"><strong>说明：</strong></p>
                  <p className="mb-1">• 联络频率为本周日均联络人数</p>
                  <p className="mb-1">• 节点共享指已培育的下级节点数量</p>
                  <p>• 所有条件需同时满足方可晋升</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NodeAchievementBadge;
