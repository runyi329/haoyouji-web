import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { Clock } from 'lucide-react';

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
// 主组件（红白双引擎全展示版本）
// ============================================================
const NodeAchievementBadgeRedWhite: React.FC<NodeAchievementBadgeProps> = ({
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
  const [, setLocation] = useLocation();
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
      case 'none': return 'bg-[#F5F5F5] text-gray-600';
      case 'standard': return 'bg-gradient-to-br from-[#A80000] to-[#8a0000] text-white';
      case 'advanced': return 'bg-gradient-to-br from-[#0a1628] to-[#1a2744] text-white';
      case 'super': return 'bg-gradient-to-br from-[#1a1a2e] via-[#2d2d44] to-[#1a1a2e] text-white';
    }
  };

  // 计算倒计时（到本周日24:00）
  const getCountdown = () => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=周日, 1=周一, ..., 6=周六
    const daysUntilSunday = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + daysUntilSunday);
    nextSunday.setHours(24, 0, 0, 0);
    
    const diff = nextSunday.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    return `${days}天${hours}小时`;
  };

  return (
    <>
      <div className="space-y-0">
        {/* ====== 红色区域（汇总） ====== */}
        <div className={`relative overflow-hidden p-4 rounded-t-2xl ${getTopCardStyle()}`}>
          {/* 标题行 */}
          <div className="flex items-center justify-between mb-3">
            <span className={`text-sm font-medium ${level === 'none' ? 'text-gray-500' : 'opacity-90'}`}>
              市场贡献激励
            </span>
            <div className="flex items-center space-x-2">
              {/* 倒计时 */}
              <span className={`text-[10px] font-mono ${level === 'none' ? 'text-gray-400' : 'opacity-60'} bg-white/10 px-2 py-0.5 rounded flex items-center space-x-1`}>
                <Clock className="w-3 h-3" style={{ color: '#C5B358' }} />
                <span>距离资产定格还剩 {getCountdown()}</span>
              </span>
              {/* 问号按钮 */}
              <button
                onClick={() => setShowRules(true)}
                className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <span className="text-xs">?</span>
              </button>
            </div>
          </div>

          {/* 左右布局：我的身份 | 市场权重 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 左侧：我的身份 */}
            <div>
              <div className={`text-xs ${level === 'none' ? 'text-gray-400' : 'opacity-70'} mb-1`}>我的身份</div>
              <div className="text-2xl font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {config.name}
              </div>
              <div className={`text-[10px] ${level === 'none' ? 'text-gray-400' : 'opacity-60'} mt-0.5`}>
                由个人人脉贡献决定
              </div>
            </div>

            {/* 右侧：市场权重 */}
            <div className="text-right">
              <div className={`text-xs ${level === 'none' ? 'text-gray-400' : 'opacity-70'} mb-1`}>市场权重</div>
              <div className="text-2xl font-bold text-[#C5B358]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                +{(contribEquity).toFixed(4)}%
              </div>
              <div className={`text-[10px] ${level === 'none' ? 'text-gray-400' : 'opacity-60'} mt-0.5`}>
                由共享人脉贡献决定
              </div>
            </div>
          </div>
        </div>

        {/* ====== 白色区域（明细）- 全展示，无需点击 ====== */}
        <div className="bg-[#F9F9F9] rounded-b-3xl p-4 space-y-5">
          {/* ====== 第一板块：个人人脉贡献（你的"底薪"） ====== */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-gray-700">个人人脉贡献</h4>
              <span className="text-[10px] text-gray-400">你的"底薪"</span>
            </div>

            {/* 3行极简进度条（无边框，直接平铺） */}
            <div className="space-y-2.5">
              {/* 人脉规模 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">人脉规模</span>
                  <span className={`text-[10px] font-medium ${contactCount >= (nextTier?.contactMin || 50) ? 'text-[#C5B358]' : 'text-gray-400'}`}>
                    {contactCount >= (nextTier?.contactMin || 50) ? '✓' : '●'}
                  </span>
                </div>
                <div className="bg-gray-100 rounded-full overflow-hidden" style={{ height: '3px' }}>
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${contactCount >= (nextTier?.contactMin || 50) ? 'bg-[#C5B358]' : 'bg-[#A80000]'}`}
                    style={{ width: `${Math.min(100, (contactCount / (nextTier?.contactMin || 50)) * 100)}%` }}
                  />
                </div>
                <div className="text-[9px] text-gray-400 mt-0.5">
                  规模: {contactCount} / {nextTier?.contactMin || 50}
                </div>
              </div>

              {/* 标签完善 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">标签完善</span>
                  <span className={`text-[10px] font-medium ${tagAverage >= (nextTier?.tagMin || 1) ? 'text-[#C5B358]' : 'text-gray-400'}`}>
                    {tagAverage >= (nextTier?.tagMin || 1) ? '✓' : '●'}
                  </span>
                </div>
                <div className="bg-gray-100 rounded-full overflow-hidden" style={{ height: '3px' }}>
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${tagAverage >= (nextTier?.tagMin || 1) ? 'bg-[#C5B358]' : 'bg-[#A80000]'}`}
                    style={{ width: `${Math.min(100, (tagAverage / (nextTier?.tagMin || 1)) * 100)}%` }}
                  />
                </div>
                <div className="text-[9px] text-gray-400 mt-0.5">
                  标签完善度: {tagAverage.toFixed(1)} / {nextTier?.tagMin || 1}
                </div>
              </div>

              {/* 联络频率 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">联络频率</span>
                  <span className={`text-[10px] font-medium ${contactFrequency >= (nextTier?.frequencyMin || 3) ? 'text-[#C5B358]' : 'text-gray-400'}`}>
                    {contactFrequency >= (nextTier?.frequencyMin || 3) ? '✓' : '●'}
                  </span>
                </div>
                <div className="bg-gray-100 rounded-full overflow-hidden" style={{ height: '3px' }}>
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${contactFrequency >= (nextTier?.frequencyMin || 3) ? 'bg-[#C5B358]' : 'bg-[#A80000]'}`}
                    style={{ width: `${Math.min(100, (contactFrequency / (nextTier?.frequencyMin || 3)) * 100)}%` }}
                  />
                </div>
                <div className="text-[9px] text-gray-400 mt-0.5">
                  本周活跃: {contactFrequency} / {nextTier?.frequencyMin || 3} 人/日
                </div>
              </div>
            </div>

            {/* 状态结项：本周个人贡献分 */}
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">本周个人贡献分</span>
                <span className="text-sm font-bold" style={{ color: '#333333' }}>+100 点</span>
              </div>
            </div>
          </div>

          {/* ====== 第二板块：共享人脉贡献（你的"奖金"） ====== */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-gray-700">共享人脉贡献</h4>
              <span className="text-[10px] text-gray-400">你的"奖金"</span>
            </div>

            {/* 3行核心资产清单（无边框，极简风格） */}
            <div className="space-y-2">
              {/* 已培育标准节点 */}
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <span className="text-xs text-gray-600">已培育高级节点</span>
                {standardNodeCount > 0 ? (
                  <span className="text-sm font-bold text-gray-900">{standardNodeCount} 名</span>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <span className="text-lg font-bold text-gray-400">0</span>
                    <span className="text-[#C5B358]">→</span>
                  </div>
                )}
              </div>

              {/* 已培育高级节点 */}
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <span className="text-xs text-gray-600">已培育高端节点</span>
                {advancedNodeCount > 0 ? (
                  <span className="text-sm font-bold text-gray-900">{advancedNodeCount} 名</span>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <span className="text-lg font-bold text-gray-400">0</span>
                    <span className="text-[#C5B358]">→</span>
                  </div>
                )}
              </div>

              {/* 已培育超级节点 */}
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <span className="text-xs text-gray-600">已培育超端节点</span>
                <div className="flex items-center justify-between w-full">
                  <span className="text-lg font-bold text-gray-400">0</span>
                  <span className="text-[#C5B358]">→</span>
                </div>
              </div>
            </div>

            {/* 状态结项：共享加成权重 */}
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">共享加成权重</span>
                <span className="text-base font-extrabold text-[#C5B358]">+{(contribEquity).toFixed(4)}%</span>
              </div>
            </div>
          </div>

          {/* 底部仪式感区域 */}
          <div className="pt-3 border-t border-gray-200 space-y-3">
            {/* 印章图标 + 确权状态 */}
            <div className="relative text-center py-2">
              {/* 印章图标背景 */}
              <div className="absolute inset-0 flex items-center justify-center opacity-5">
                <svg className="w-16 h-16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
              </div>
              {/* 文案内容 */}
              <div className="relative z-10 space-y-1">
                <div className="text-[10px] text-[#C5B358]">距离本周资产定格还剩 {getCountdown()}</div>
                <div className="text-[10px] text-gray-500">
                  “每周日晚，一份诚实的财富存证，任何时候不可更改、不可篡改。”
                </div>
              </div>
            </div>

            {/* 查阅规则入口 - 官方文件入口风格 */}
            <div className="flex items-center justify-center space-x-3 text-xs">
              <button
                onClick={() => setShowRules(true)}
                className="flex items-center space-x-1 px-3 py-2 rounded-lg border border-gray-300 bg-white hover:border-[#A80000] hover:bg-[#FFEBEE] transition-all text-gray-600 hover:text-[#A80000]"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="font-medium">查阅合伙人晋升准则</span>
              </button>
              <button
                onClick={() => setLocation('/parent/equity-history')}
                className="flex items-center space-x-1 px-3 py-2 rounded-lg border border-[#C5B358] bg-[#C5B358]/5 hover:bg-[#C5B358]/10 transition-all text-[#C5B358] hover:text-[#A80000] shadow-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                <span className="font-medium">查阅历史确权周报</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
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

              {/* 对比表 */}
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-200 px-2 py-2 text-left font-semibold text-gray-700">等级</th>
                      <th className="border border-gray-200 px-2 py-2 text-left font-semibold text-gray-700">人脉规模</th>
                      <th className="border border-gray-200 px-2 py-2 text-left font-semibold text-gray-700">标签完善</th>
                      <th className="border border-gray-200 px-2 py-2 text-left font-semibold text-gray-700">联络频率</th>
                      <th className="border border-gray-200 px-2 py-2 text-left font-semibold text-gray-700">节点培育</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-gray-200 px-2 py-2 font-medium text-gray-900">标准节点</td>
                      <td className="border border-gray-200 px-2 py-2 text-gray-600">≥50人</td>
                      <td className="border border-gray-200 px-2 py-2 text-gray-600">≥1标签/人</td>
                      <td className="border border-gray-200 px-2 py-2 text-gray-600">≥3人/日</td>
                      <td className="border border-gray-200 px-2 py-2 text-gray-600">-</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 px-2 py-2 font-medium text-gray-900">高级节点</td>
                      <td className="border border-gray-200 px-2 py-2 text-gray-600">≥100人</td>
                      <td className="border border-gray-200 px-2 py-2 text-gray-600">≥3标签/人</td>
                      <td className="border border-gray-200 px-2 py-2 text-gray-600">≥6人/日</td>
                      <td className="border border-gray-200 px-2 py-2 text-gray-600">≥5个标准节点</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 px-2 py-2 font-medium text-gray-900">超级节点</td>
                      <td className="border border-gray-200 px-2 py-2 text-gray-600">≥150人</td>
                      <td className="border border-gray-200 px-2 py-2 text-gray-600">≥5标签/人</td>
                      <td className="border border-gray-200 px-2 py-2 text-gray-600">≥9人/日</td>
                      <td className="border border-gray-200 px-2 py-2 text-gray-600">≥5个高级节点</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-4 text-xs text-gray-500 space-y-2">
                <p>• <strong>人脉规模</strong>：您的人脉总数</p>
                <p>• <strong>标签完善</strong>：平均每个人脉的标签数量</p>
                <p>• <strong>联络频率</strong>：本周平均每天联络的人数</p>
                <p>• <strong>节点培育</strong>：您培育的下级节点数量</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NodeAchievementBadgeRedWhite;
