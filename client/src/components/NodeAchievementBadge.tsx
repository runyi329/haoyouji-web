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
  const [isAnimating, setIsAnimating] = useState(true);

  // Count-up 动画
  useEffect(() => {
    if (!isQualified) {
      setDisplayedBonus(0);
      setIsAnimating(false);
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
        setIsAnimating(false);
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
      bgGradient: 'from-gray-700 to-gray-800',
    },
    standard: {
      icon: '📍',
      name: '标准节点',
      color: '#4A90E2',
      bgGradient: 'from-gray-900 to-black',
    },
    advanced: {
      icon: '🔷',
      name: '高级节点',
      color: '#5B9BD5',
      bgGradient: 'from-gray-900 to-black',
    },
    super: {
      icon: '💎',
      name: '超级节点',
      color: '#FFD700',
      bgGradient: 'from-gray-900 to-black',
    },
  };

  const config = nodeConfig[level];

  return (
    <div
      className={`
        relative overflow-hidden rounded-2xl
        ${isQualified ? `bg-gradient-to-br ${config.bgGradient}` : 'bg-gradient-to-br from-gray-600 to-gray-700'}
        shadow-2xl
        p-6
        transition-all duration-500
      `}
      style={{
        aspectRatio: '16 / 9',
      }}
    >
      {/* 呼吸灯光圈背景 */}
      {isQualified && (
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: `radial-gradient(circle at 30% 50%, ${config.color}40 0%, transparent 60%)`,
            animation: 'pulse 3s ease-in-out infinite',
          }}
        />
      )}

      {/* 顶部状态栏 */}
      <div className="relative z-10 flex items-center justify-between mb-4">
        {/* 左侧：身份标签 */}
        <div className="text-xs text-gray-400">
          [ {isQualified ? '当前成就' : '身份状态'}：
          <span className={`ml-1 ${isQualified ? 'text-white' : 'text-gray-300'}`}>
            {config.name}
          </span> ]
        </div>

        {/* 右侧：状态指示灯 */}
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${
              isQualified ? 'bg-green-500' : 'bg-orange-500'
            }`}
            style={{
              animation: isQualified ? 'none' : 'pulse 2s ease-in-out infinite',
            }}
          />
          <span className="text-xs text-gray-400">
            {isQualified ? '权益激活中' : '资质待核验'}
          </span>
        </div>
      </div>

      {/* 主体内容 */}
      <div className="relative z-10 flex items-center gap-6 h-[calc(100%-80px)]">
        {/* 左侧：3D勋章 */}
        <div className="flex-shrink-0 w-[35%] h-full flex items-center justify-center relative">
          {/* 勋章背景光晕 */}
          {isQualified && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{
                filter: 'blur(40px)',
                opacity: 0.3,
              }}
            >
              <div
                className="w-32 h-32 rounded-full"
                style={{
                  background: config.color,
                  animation: 'pulse 2s ease-in-out infinite',
                }}
              />
            </div>
          )}

          {/* 勋章图标 */}
          <div className="relative">
            <div
              className={`text-8xl ${!isQualified ? 'opacity-40' : ''}`}
              style={{
                filter: isQualified ? 'drop-shadow(0 0 20px rgba(255,255,255,0.3))' : 'none',
                transform: isAnimating ? 'scale(1.05)' : 'scale(1)',
                transition: 'transform 0.3s ease',
              }}
            >
              {config.icon}
            </div>

            {/* 未激活锁头 */}
            {!isQualified && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-4xl opacity-60">🔒</div>
              </div>
            )}
          </div>
        </div>

        {/* 右侧：核心收益区 */}
        <div className="flex-1 flex flex-col justify-center">
          {/* 核心数字 */}
          <div className="mb-2">
            <div
              className={`text-5xl font-semibold tabular-nums ${
                isQualified ? 'text-red-500' : 'text-gray-300'
              }`}
              style={{
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.05em',
              }}
            >
              {isQualified ? (
                <>+{(displayedBonus * 100).toFixed(4)}%</>
              ) : (
                <>预计 +{(estimatedEquityBonus * 100).toFixed(4)}%</>
              )}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {isQualified ? '节点共享权证' : '完成基础确权后激活'}
            </div>
          </div>
        </div>
      </div>

      {/* 底部数据槽 */}
      <div
        className="relative z-10 pt-4 mt-4"
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.15)',
        }}
      >
        <div className="flex items-center justify-between text-xs">
          {/* 左侧：贡献分 */}
          <div className="text-gray-400">
            {isQualified ? '贡献分' : '当前贡献'}：
            <span className="ml-1 text-white font-medium tabular-nums">
              {contributionScore}
              {isQualified && ' 分'}
            </span>
          </div>

          {/* 中间分割线 */}
          <div className="w-px h-3 bg-gray-600" />

          {/* 右侧：市场占比或解锁条件 */}
          <div className="text-gray-400">
            {isQualified ? (
              <>
                市场占比：
                <span className="ml-1 text-white font-medium tabular-nums">
                  {(marketShare * 100).toFixed(2)}%
                </span>
              </>
            ) : (
              <>
                解锁条件：
                <span className="ml-1 text-orange-400">
                  还需完善资质
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
};

export default NodeAchievementBadge;
