import React, { useEffect, useState } from 'react';

interface NodeAchievementBadgeProps {
  // 当前节点等级
  level: 'none' | 'standard' | 'advanced' | 'super';
  // 节点共享奖（如 0.009 表示 0.9%）
  equityBonus: number;
  // 贡献分
  contributionScore: number;
  // 市场占比（如 0.06 表示 6%）
  marketShare: number;
  // 是否已达标
  isQualified: boolean;
  // 预计节点共享奖（未达标时显示）
  estimatedEquityBonus?: number;
}

const NodeAchievementBadge: React.FC<NodeAchievementBadgeProps> = ({
  level,
  equityBonus,
  contributionScore,
  marketShare,
  isQualified,
  estimatedEquityBonus = 0.0015,
}) => {
  const [displayedBonus, setDisplayedBonus] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  // Count-up 动画
  useEffect(() => {
    if (!isQualified) {
      setDisplayedBonus(0);
      return;
    }

    const duration = 1500; // 1.5秒
    const steps = 60;
    const increment = equityBonus / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current += increment;
      
      if (step >= steps) {
        setDisplayedBonus(equityBonus);
        clearInterval(timer);
      } else {
        setDisplayedBonus(current);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [equityBonus, isQualified]);

  // 节点配置
  const nodeConfig = {
    none: {
      icon: '📍',
      name: '准合伙人',
      color: '#999999',
    },
    standard: {
      icon: '📍',
      name: '标准节点',
      color: '#C0C0C0',
    },
    advanced: {
      icon: '🔷',
      name: '高级节点',
      color: '#5B9BD5',
    },
    super: {
      icon: '💎',
      name: '超级节点',
      color: '#FFD700',
    },
  };

  const config = nodeConfig[level];

  return (
    <div className="space-y-0">
      {/* 红色顶盖（对标第一层） */}
      <div 
        className="bg-gradient-to-br from-[#A80000] to-[#8a0000] text-white p-5 rounded-t-2xl rounded-b-none shadow-none border-none cursor-pointer transition-all"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm opacity-90">节点共享权证</span>
          <div className="flex items-center space-x-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: isQualified ? '#10B981' : '#F59E0B',
              }}
            />
            <svg
              className={`w-5 h-5 opacity-90 transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        
        <div className="flex items-baseline space-x-2">
          <span className="text-5xl font-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {isQualified ? (
              <>+{(displayedBonus * 100).toFixed(4)}</>
            ) : (
              <>+{(estimatedEquityBonus * 100).toFixed(4)}</>
            )}
          </span>
          <span className="text-2xl opacity-90">%</span>
        </div>
        
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs opacity-60">
            {isQualified ? '节点共享加成收益' : '预计激活后收益'}
          </span>
          <span className="text-xs opacity-60 bg-white/10 px-2 py-0.5 rounded-full">
            {config.name}
          </span>
        </div>

        {/* 展开后的详细内容 */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-white/20 space-y-3">
            {/* 左右分列：贡献分 vs 市场占比 */}
            <div className="grid grid-cols-2 gap-3">
              {/* 左侧：贡献分 */}
              <div className="bg-white/10 rounded-xl p-3">
                <div className="text-xs opacity-70 mb-1">贡献分</div>
                <div className="text-2xl font-bold">{contributionScore}</div>
                <div className="text-xs opacity-60 mt-1">累计节点贡献</div>
              </div>
              
              {/* 右侧：市场占比 */}
              <div className="bg-white/10 rounded-xl p-3">
                <div className="text-xs opacity-70 mb-1">市场占比</div>
                <div className="text-2xl font-bold">{(marketShare * 100).toFixed(2)}%</div>
                <div className="text-xs opacity-60 mt-1">在贡献池中</div>
              </div>
            </div>

            {/* 节点等级说明 */}
            <div className="bg-white/10 rounded-xl p-3">
              <div className="text-xs font-semibold opacity-90 mb-2">
                {config.icon} {config.name}
              </div>
              <div className="text-xs opacity-70 leading-relaxed">
                {isQualified ? (
                  <>当前已激活节点共享权证，享受 +{(equityBonus * 100).toFixed(4)}% 股权加成</>
                ) : (
                  <>完成基础确权后即可激活节点共享权证，预计享受 +{(estimatedEquityBonus * 100).toFixed(4)}% 股权加成</>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 白色/浅灰容器（对标第一层） */}
      <div className="bg-gray-50 rounded-t-none rounded-b-3xl shadow-sm border-none p-5">
        {/* 左右双列：身份成就 vs 加成收益 */}
        <div className="grid grid-cols-2 gap-6 mb-5 relative">
          {/* 左侧：身份成就 */}
          <div>
            <div className="text-xs text-gray-500 mb-1 flex items-center">
              <span className="mr-1">{config.icon}</span>
              身份成就
            </div>
            <div className="flex items-baseline space-x-1">
              <span className="text-2xl font-bold text-gray-900">{config.name}</span>
            </div>
            <div className="mt-1 text-xs text-gray-400">
              {isQualified ? '权益激活中' : '待激活状态'}
            </div>
          </div>
          
          {/* 中间分割线 */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300" style={{transform: 'translateX(-50%)'}}></div>
          
          {/* 右侧：加成收益 */}
          <div className="text-right">
            <div className="text-xs text-gray-500 mb-1 flex items-center justify-end">
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              加成收益
            </div>
            <div className="text-2xl font-bold text-orange-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {isQualified ? (
                <>+{(displayedBonus * 100).toFixed(4)}%</>
              ) : (
                <>+{(estimatedEquityBonus * 100).toFixed(4)}%</>
              )}
            </div>
            <div className="mt-1 text-xs text-gray-400">
              {isQualified ? '实时生效中' : '预计收益'}
            </div>
          </div>
        </div>
        
        {/* 虚线分割 */}
        <div className="border-t border-dashed border-gray-300 my-4"></div>
        
        {/* 底部数据展示 */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <div className="text-gray-500 mb-1">贡献分</div>
            <div className="text-lg font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {contributionScore}
            </div>
          </div>
          <div className="text-right">
            <div className="text-gray-500 mb-1">市场占比</div>
            <div className="text-lg font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {(marketShare * 100).toFixed(2)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NodeAchievementBadge;
