import React from 'react';

interface GaugeChartProps {
  value: number;
  maxValue: number;
  label: string;
  color?: string;
}

export function GaugeChart({ value, maxValue, label, color = '#C5B358' }: GaugeChartProps) {
  // 计算角度（180度半圆，从-90度到90度）
  const percentage = Math.min(value / maxValue, 1);
  const angle = -90 + (percentage * 180);
  
  // SVG尺寸
  const size = 120;
  const center = size / 2;
  const radius = 45;
  const strokeWidth = 8;
  
  // 计算指针终点坐标
  const pointerLength = radius - 5;
  const pointerAngleRad = (angle * Math.PI) / 180;
  const pointerX = center + pointerLength * Math.cos(pointerAngleRad);
  const pointerY = center + pointerLength * Math.sin(pointerAngleRad);
  
  // 生成弧形路径
  const startAngle = -90;
  const endAngle = 90;
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;
  
  const x1 = center + radius * Math.cos(startRad);
  const y1 = center + radius * Math.sin(startRad);
  const x2 = center + radius * Math.cos(endRad);
  const y2 = center + radius * Math.sin(endRad);
  
  const arcPath = `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
  
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.6}`}>
        {/* 背景弧线 */}
        <path
          d={arcPath}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        
        {/* 刻度线 */}
        {[0, 0.25, 0.5, 0.75, 1].map((tick, i) => {
          const tickAngle = -90 + (tick * 180);
          const tickRad = (tickAngle * Math.PI) / 180;
          const tickX1 = center + (radius - strokeWidth / 2 - 3) * Math.cos(tickRad);
          const tickY1 = center + (radius - strokeWidth / 2 - 3) * Math.sin(tickRad);
          const tickX2 = center + (radius - strokeWidth / 2 - 8) * Math.cos(tickRad);
          const tickY2 = center + (radius - strokeWidth / 2 - 8) * Math.sin(tickRad);
          
          return (
            <line
              key={i}
              x1={tickX1}
              y1={tickY1}
              x2={tickX2}
              y2={tickY2}
              stroke="#9CA3AF"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          );
        })}
        
        {/* 指针 */}
        <line
          x1={center}
          y1={center}
          x2={pointerX}
          y2={pointerY}
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
        />
        
        {/* 中心圆点 */}
        <circle
          cx={center}
          cy={center}
          r="4"
          fill={color}
        />
      </svg>
      
      {/* 数值显示 */}
      <div className="text-center -mt-2">
        <div className="text-2xl font-bold font-mono" style={{ color }}>
          {value.toFixed(value >= 10 ? 1 : 2)}x
        </div>
        <div className="text-xs text-gray-500 mt-0.5">{label}</div>
      </div>
    </div>
  );
}
