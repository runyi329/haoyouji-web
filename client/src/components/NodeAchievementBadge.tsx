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
      iconOpacity: 0.3,
    },
    standard: {
      icon: '📍',
      name: '标准节点',
      color: '#C0C0C0', // 银灰色渐变
      iconOpacity: 1,
    },
    advanced: {
      icon: '🔷',
      name: '高级节点',
      color: '#5B9BD5',
      iconOpacity: 1,
    },
    super: {
      icon: '💎',
      name: '超级节点',
      color: '#FFD700',
      iconOpacity: 1,
    },
  };

  const config = nodeConfig[level];

  return (
    <div
      className="relative overflow-hidden"
      style={{
        backgroundColor: '#1A1A1A',
        borderRadius: '16px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
        padding: '28px',
        aspectRatio: '16 / 9',
      }}
    >
      {/* 呼吸灯光圈背景（仅已达标） */}
      {isQualified && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 25% 50%, ${config.color}25 0%, transparent 50%)`,
            animation: 'breathe 3s ease-in-out infinite',
          }}
        />
      )}

      {/* 右上角状态指示灯 */}
      <div className="absolute top-5 right-6 flex items-center gap-2">
        <div
          className="rounded-full"
          style={{
            width: '6px',
            height: '6px',
            backgroundColor: isQualified ? '#10B981' : '#F59E0B',
            animation: isQualified ? 'breathe 2s ease-in-out infinite' : 'none',
          }}
        />
        <span
          style={{
            fontSize: '10px',
            color: '#999999',
            fontWeight: '400',
            letterSpacing: '0.5px',
          }}
        >
          {isQualified ? '权益激活中' : '资质待核验'}
        </span>
      </div>

      {/* 主体内容：左右布局 */}
      <div className="relative z-10 flex items-center gap-8 h-full pt-4">
        {/* 左侧：勋章区（40%） */}
        <div className="flex-shrink-0 flex items-center justify-center relative" style={{ width: '40%' }}>
          {/* 勋章背景光晕（仅已达标） */}
          {isQualified && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{
                filter: 'blur(50px)',
                opacity: 0.4,
              }}
            >
              <div
                className="rounded-full"
                style={{
                  width: '140px',
                  height: '140px',
                  background: `radial-gradient(circle, ${config.color} 0%, transparent 70%)`,
                  animation: 'breathe 2.5s ease-in-out infinite',
                }}
              />
            </div>
          )}

          {/* 勋章图标 */}
          <div className="relative flex items-center justify-center">
            {/* 银灰色渐变背景（仅标准节点） */}
            {isQualified && level === 'standard' && (
              <div
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, #E8E8E8 0%, #C0C0C0 30%, #A8A8A8 60%, transparent 80%)',
                  width: '130px',
                  height: '130px',
                  borderRadius: '50%',
                  opacity: 0.15,
                  filter: 'blur(8px)',
                }}
              />
            )}
            
            <div
              style={{
                fontSize: '120px',
                lineHeight: '1',
                opacity: config.iconOpacity,
                filter: isQualified
                  ? `drop-shadow(0 0 30px ${config.color}80) brightness(1.1) contrast(1.05)`
                  : 'none',
                transform: isAnimating ? 'scale(1.05)' : 'scale(1)',
                transition: 'transform 0.3s ease',
              }}
            >
              {config.icon}
            </div>

            {/* 未激活锁头 */}
            {!isQualified && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  fontSize: '48px',
                  opacity: 0.5,
                }}
              >
                🔒
              </div>
            )}
          </div>
        </div>

        {/* 右侧：核心数值区（60%） */}
        <div className="flex-1 flex flex-col justify-center" style={{ paddingRight: '8px' }}>
          {/* 顶部小标签 */}
          <div
            style={{
              fontSize: '11px',
              color: '#666666',
              marginBottom: '12px',
              fontWeight: '400',
            }}
          >
            {isQualified ? '当前成就' : '身份状态'}：
            <span style={{ color: isQualified ? '#CCCCCC' : '#999999', marginLeft: '4px' }}>
              {config.name}
            </span>
          </div>

          {/* 核心大数字 */}
          <div style={{ marginBottom: '8px' }}>
            <div
              style={{
                fontSize: '56px',
                fontWeight: '600',
                color: isQualified ? '#FF4D4D' : '#666666',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.02em',
                lineHeight: '1',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              }}
            >
              {isQualified ? (
                <>+{(displayedBonus * 100).toFixed(4)}%</>
              ) : (
                <>预计 +{(estimatedEquityBonus * 100).toFixed(4)}%</>
              )}
            </div>
            <div
              style={{
                fontSize: '11px',
                color: '#666666',
                marginTop: '8px',
                fontWeight: '400',
              }}
            >
              {isQualified ? '节点共享权证收益 (活跃中)' : '完成基础确权后激活'}
            </div>
          </div>
        </div>
      </div>

      {/* 底部数据槽 */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '16px 28px',
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
        }}
      >
        <div className="flex items-center justify-between">
          {/* 左侧：贡献分 */}
          <div
            style={{
              fontSize: '12px',
              color: '#666666',
              fontWeight: '400',
            }}
          >
            {isQualified ? '贡献分' : '当前贡献'}：
            <span
              style={{
                color: '#CCCCCC',
                marginLeft: '6px',
                fontWeight: '500',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {contributionScore}
              {isQualified && ' 分'}
            </span>
          </div>

          {/* 中间分割线 */}
          <div
            style={{
              width: '1px',
              height: '14px',
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
            }}
          />

          {/* 右侧：市场占比或解锁条件 */}
          <div
            style={{
              fontSize: '12px',
              color: '#666666',
              fontWeight: '400',
            }}
          >
            {isQualified ? (
              <>
                市场占比：
                <span
                  style={{
                    color: '#CCCCCC',
                    marginLeft: '6px',
                    fontWeight: '500',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {(marketShare * 100).toFixed(2)}%
                </span>
              </>
            ) : (
              <>
                解锁条件：
                <span style={{ color: '#F59E0B', marginLeft: '6px' }}>
                  还需完善资质
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes breathe {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
        }
      `}</style>
    </div>
  );
};

export default NodeAchievementBadge;
