import React from 'react';

interface AvatarWithGlowProps {
  src: string;
  alt: string;
  nodeLevel?: string;
  className?: string;
}

export const AvatarWithGlow: React.FC<AvatarWithGlowProps> = ({ 
  src, 
  alt, 
  nodeLevel,
  className = "w-16 h-16"
}) => {
  // 临时测试：强制显示标准节点效果
  const testLevel = 'standard';
  const level = testLevel || nodeLevel;

  // 根据节点等级确定粒子数量和颜色
  const getParticleConfig = () => {
    if (level === 'standard' || level === 'standard_user') {
      return {
        count: 3,
        color: '#F59E0B', // 金色
        size: 4,
        duration: 8, // 环绕周期（秒）
      };
    } else if (level === 'advanced' || level === 'advanced_user') {
      return {
        count: 4,
        color: '#EF4444', // 橙红色
        size: 5,
        duration: 6,
      };
    } else if (level === 'super' || level === 'super_user') {
      return {
        count: 6,
        color: '#8B5CF6', // 紫色
        size: 6,
        duration: 5,
      };
    }
    return null;
  };

  const config = getParticleConfig();

  if (!config) {
    // 非节点用户，不显示粒子
    return (
      <div className={className} style={{ borderRadius: '50%', overflow: 'hidden' }}>
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      </div>
    );
  }

  // 生成粒子
  const particles = Array.from({ length: config.count }, (_, i) => {
    const delay = (i / config.count) * config.duration;
    return (
      <div
        key={i}
        className="particle"
        style={{
          '--delay': `${delay}s`,
          '--duration': `${config.duration}s`,
          '--color': config.color,
          '--size': `${config.size}px`,
        } as React.CSSProperties}
      />
    );
  });

  return (
    <>
      <style>{`
        @keyframes orbit {
          0% {
            transform: rotate(0deg) translateX(40px) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: rotate(360deg) translateX(40px) rotate(-360deg);
            opacity: 0;
          }
        }

        .avatar-container {
          position: relative;
          display: inline-block;
        }

        .avatar-container .particle {
          position: absolute;
          top: 50%;
          left: 50%;
          width: var(--size);
          height: var(--size);
          background: var(--color);
          border-radius: 50%;
          box-shadow: 0 0 8px var(--color), 0 0 12px var(--color);
          animation: orbit var(--duration) linear infinite;
          animation-delay: var(--delay);
          pointer-events: none;
        }

        .avatar-container .avatar-image {
          border-radius: 50%;
          overflow: hidden;
          position: relative;
          z-index: 1;
        }
      `}</style>
      <div className={`avatar-container ${className}`}>
        <div className="avatar-image" style={{ width: '100%', height: '100%' }}>
          <img src={src} alt={alt} className="w-full h-full object-cover" />
        </div>
        {particles}
      </div>
    </>
  );
};
