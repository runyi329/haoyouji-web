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
  // 临时测试：强制显示标准节点光环
  const testLevel = 'standard';
  console.log('AvatarWithGlow rendered, nodeLevel:', nodeLevel, 'testLevel:', testLevel);
  // 根据节点等级确定光环样式
  const getGlowStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      position: 'relative',
      borderRadius: '50%',
      overflow: 'hidden',
      border: '2px solid rgba(255, 255, 255, 0.3)',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    };

    // 使用testLevel进行测试
    const level = testLevel || nodeLevel;

    if (level === 'standard' || level === 'standard_user') {
      // 标准节点 - 金色光环
      return {
        ...baseStyle,
        boxShadow: `
          0 0 0 4px rgba(245, 158, 11, 0.6),
          0 0 20px 4px rgba(251, 191, 36, 0.4),
          0 10px 15px -3px rgba(0, 0, 0, 0.1)
        `,
        animation: 'glow-breathe-standard 3s ease-in-out infinite',
      };
    } else if (level === 'advanced' || level === 'advanced_user') {
      // 高级节点 - 橙红色双层光环
      return {
        ...baseStyle,
        boxShadow: `
          0 0 0 4px rgba(239, 68, 68, 0.5),
          0 0 0 6px rgba(249, 115, 22, 0.3),
          0 0 30px 6px rgba(239, 68, 68, 0.4),
          0 10px 15px -3px rgba(0, 0, 0, 0.1)
        `,
        animation: 'glow-breathe-advanced 2.5s ease-in-out infinite',
      };
    } else if (level === 'super' || level === 'super_user') {
      // 超级节点 - 彩虹渐变光环
      return {
        ...baseStyle,
        boxShadow: `
          0 0 0 4px rgba(245, 158, 11, 0.4),
          0 0 0 8px rgba(139, 92, 246, 0.2),
          0 0 40px 8px rgba(245, 158, 11, 0.3),
          0 0 60px 12px rgba(139, 92, 246, 0.2),
          0 10px 15px -3px rgba(0, 0, 0, 0.1)
        `,
        animation: 'glow-breathe-super 2s ease-in-out infinite, glow-rainbow 5s linear infinite',
      };
    }

    return baseStyle;
  };

  return (
    <>
      <style>{`
        @keyframes glow-breathe-standard {
          0%, 100% {
            transform: scale(1);
            filter: brightness(1);
          }
          50% {
            transform: scale(1.02);
            filter: brightness(1.1);
          }
        }

        @keyframes glow-breathe-advanced {
          0%, 100% {
            transform: scale(1);
            filter: brightness(1);
          }
          50% {
            transform: scale(1.04);
            filter: brightness(1.15);
          }
        }

        @keyframes glow-breathe-super {
          0%, 100% {
            transform: scale(1);
            filter: brightness(1) hue-rotate(0deg);
          }
          50% {
            transform: scale(1.06);
            filter: brightness(1.2) hue-rotate(10deg);
          }
        }

        @keyframes glow-rainbow {
          0% {
            filter: hue-rotate(0deg);
          }
          50% {
            filter: hue-rotate(30deg);
          }
          100% {
            filter: hue-rotate(0deg);
          }
        }
      `}</style>
      <div 
        className={className}
        style={getGlowStyle()}
      >
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
        />
      </div>
    </>
  );
};
