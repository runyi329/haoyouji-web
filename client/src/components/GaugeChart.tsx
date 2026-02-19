import React from 'react';

interface GaugeChartProps {
  value: number;
  minValue: number;
  maxValue: number;
  label: string;
  color?: string;
}

export function GaugeChart({ value, minValue, maxValue, label, color = '#C5B358' }: GaugeChartProps) {
  // 仪表盘配置
  const size = 200;
  const center = size / 2;
  const radius = 70;
  const strokeWidth = 10;
  
  // 计算数值对应的角度（从180度到0度，即9点钟到3点钟）
  const range = maxValue - minValue;
  const normalizedValue = Math.max(0, Math.min((value - minValue) / range, 1));
  const valueAngle = 180 - (normalizedValue * 180); // 180度表示最小值，0度表示最大值
  
  // 生成背景弧线路径（从9点钟到3点钟）
  const startAngle = 180;
  const endAngle = 0;
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;
  
  const arcStartX = center + radius * Math.cos(startRad);
  const arcStartY = center + radius * Math.sin(startRad);
  const arcEndX = center + radius * Math.cos(endRad);
  const arcEndY = center + radius * Math.sin(endRad);
  
  const backgroundArc = `M ${arcStartX} ${arcStartY} A ${radius} ${radius} 0 0 1 ${arcEndX} ${arcEndY}`;
  
  // 生成刻度（1.0, 1.5, 2.0, 2.5, 3.0）
  const majorTicks = [1.0, 1.5, 2.0, 2.5, 3.0];
  const minorTicks: number[] = [];
  for (let i = 1.0; i <= 3.0; i += 0.1) {
    const rounded = Math.round(i * 10) / 10;
    if (!majorTicks.includes(rounded)) {
      minorTicks.push(rounded);
    }
  }
  
  // 计算指针位置
  const pointerLength = radius - 15;
  const pointerAngleRad = (valueAngle * Math.PI) / 180;
  const pointerX = center + pointerLength * Math.cos(pointerAngleRad);
  const pointerY = center + pointerLength * Math.sin(pointerAngleRad);
  
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.6}`}>
        <defs>
          {/* 背景渐变 */}
          <linearGradient id={`bgGradient-${label}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#E5E7EB" />
            <stop offset="100%" stopColor="#F3F4F6" />
          </linearGradient>
        </defs>
        
        {/* 背景弧线 */}
        <path
          d={backgroundArc}
          fill="none"
          stroke={`url(#bgGradient-${label})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        
        {/* 主刻度线和标签 */}
        {majorTicks.map((tickValue, i) => {
          const tickPercent = (tickValue - minValue) / range;
          const tickAngle = 180 - (tickPercent * 180);
          const tickRad = (tickAngle * Math.PI) / 180;
          
          // 刻度线位置
          const tickOuterRadius = radius + strokeWidth / 2;
          const tickInnerRadius = tickOuterRadius - 10;
          const tickX1 = center + tickOuterRadius * Math.cos(tickRad);
          const tickY1 = center + tickOuterRadius * Math.sin(tickRad);
          const tickX2 = center + tickInnerRadius * Math.cos(tickRad);
          const tickY2 = center + tickInnerRadius * Math.sin(tickRad);
          
          // 标签位置（在刻度线外侧）
          const labelRadius = radius + strokeWidth / 2 + 20;
          const labelX = center + labelRadius * Math.cos(tickRad);
          const labelY = center + labelRadius * Math.sin(tickRad);
          
          // 根据位置调整文本对齐方式
          let textAnchor: 'start' | 'middle' | 'end' = 'middle';
          if (tickAngle > 90 && tickAngle < 180) {
            textAnchor = 'end';
          } else if (tickAngle > 0 && tickAngle < 90) {
            textAnchor = 'start';
          }
          
          return (
            <g key={`major-${i}`}>
              {/* 刻度线 */}
              <line
                x1={tickX1}
                y1={tickY1}
                x2={tickX2}
                y2={tickY2}
                stroke="#374151"
                strokeWidth="2"
                strokeLinecap="round"
              />
              {/* 刻度标签 */}
              <text
                x={labelX}
                y={labelY}
                textAnchor={textAnchor}
                dominantBaseline="middle"
                fontSize="12"
                fill="#374151"
                fontWeight="600"
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                {tickValue.toFixed(1)}
              </text>
            </g>
          );
        })}
        
        {/* 次刻度线 */}
        {minorTicks.map((tickValue, i) => {
          const tickPercent = (tickValue - minValue) / range;
          const tickAngle = 180 - (tickPercent * 180);
          const tickRad = (tickAngle * Math.PI) / 180;
          
          const tickOuterRadius = radius + strokeWidth / 2;
          const tickInnerRadius = tickOuterRadius - 5;
          const tickX1 = center + tickOuterRadius * Math.cos(tickRad);
          const tickY1 = center + tickOuterRadius * Math.sin(tickRad);
          const tickX2 = center + tickInnerRadius * Math.cos(tickRad);
          const tickY2 = center + tickInnerRadius * Math.sin(tickRad);
          
          return (
            <line
              key={`minor-${i}`}
              x1={tickX1}
              y1={tickY1}
              x2={tickX2}
              y2={tickY2}
              stroke="#9CA3AF"
              strokeWidth="1"
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
          r="5"
          fill={color}
        />
        <circle
          cx={center}
          cy={center}
          r="3"
          fill="#ffffff"
          opacity="0.7"
        />
      </svg>
      
      {/* 数值显示 */}
      <div className="text-center -mt-4">
        <div className="text-2xl font-bold" style={{ color }}>
          {value.toFixed(2)}x
        </div>
        <div className="text-xs text-gray-500 mt-1">{label}</div>
      </div>
    </div>
  );
}
