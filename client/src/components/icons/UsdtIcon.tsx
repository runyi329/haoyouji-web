import React from 'react';

interface UsdtIconProps {
  className?: string;
  size?: number;
}

export const UsdtIcon: React.FC<UsdtIconProps> = ({ className = '', size = 24 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* 绿色圆形背景 */}
      <circle cx="50" cy="50" r="50" fill="#26A17B" />
      
      {/* 白色 T 字母和椭圆环 */}
      <g fill="white">
        {/* T 字母上方横条 */}
        <rect x="25" y="25" width="50" height="8" />
        
        {/* T 字母竖条 */}
        <rect x="43" y="25" width="14" height="45" />
        
        {/* 椭圆环装饰 */}
        <ellipse 
          cx="50" 
          cy="50" 
          rx="22" 
          ry="5" 
          fill="none" 
          stroke="white" 
          strokeWidth="2.5"
        />
      </g>
    </svg>
  );
};
