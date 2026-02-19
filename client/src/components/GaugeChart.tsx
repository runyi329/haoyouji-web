import React from 'react';

interface GaugeChartProps {
  value: number;
  minValue: number;
  maxValue: number;
  label: string;
  color?: string;
}

export function GaugeChart({ value, minValue, maxValue, label, color = '#C5B358' }: GaugeChartProps) {
  // 计算角度（从9点钟方向180度到3点钟方向，即从180度到0度）
  const range = maxValue - minValue;
  const normalizedValue = (value - minValue) / range;
  const percentage = Math.max(0, Math.min(normalizedValue, 1));
  // 从180度（9点钟）到0度（3点钟）
  const angle = 180 - (percentage * 180);
  
  // SVG尺寸 - 增加尺寸以容纳标签
  const size = 160;
  const center = size / 2;
  const radius = 55;
  const strokeWidth = 10;
  
  // 计算指针终点坐标
  const pointerLength = radius - 8;
  const pointerAngleRad = (angle * Math.PI) / 180;
  const pointerX = center + pointerLength * Math.cos(pointerAngleRad);
  const pointerY = center + pointerLength * Math.sin(pointerAngleRad);
  
  // 生成弧形路径（从9点钟到3点钟，顺时针）
  const startAngle = 180; // 9点钟方向
  const endAngle = 0;     // 3点钟方向
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;
  
  const x1 = center + radius * Math.cos(startRad);
  const y1 = center + radius * Math.sin(startRad);
  const x2 = center + radius * Math.cos(endRad);
  const y2 = center + radius * Math.sin(endRad);
  
  // 使用大弧标志，从9点钟顺时针到3点钟
  const arcPath = `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
  
  // 生成刻度（更密集的刻度）
  const generateTicks = () => {
    const ticks = [];
    const step = 0.1; // 每10%一个刻度
    for (let i = 0; i <= 1; i += step) {
      ticks.push(i);
    }
    return ticks;
  };
  
  // 生成主要刻度标签（0, 0.25, 0.5, 0.75, 1）
  const majorTicks = [0, 0.25, 0.5, 0.75, 1];
  
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.75} viewBox={`0 0 ${size} ${size * 0.75}`}>
        {/* 背景弧线 */}
        <path
          d={arcPath}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        
        {/* 刻度线 */}
        {generateTicks().map((tick, i) => {
          // 从180度（9点钟）到0度（3点钟）
          const tickAngle = 180 - (tick * 180);
          const tickRad = (tickAngle * Math.PI) / 180;
          const isMajor = majorTicks.includes(tick);
          const tickLength = isMajor ? 10 : 5;
          const tickWidth = isMajor ? 2 : 1;
          
          const tickX1 = center + (radius - strokeWidth / 2 - 2) * Math.cos(tickRad);
          const tickY1 = center + (radius - strokeWidth / 2 - 2) * Math.sin(tickRad);
          const tickX2 = center + (radius - strokeWidth / 2 - 2 - tickLength) * Math.cos(tickRad);
          const tickY2 = center + (radius - strokeWidth / 2 - 2 - tickLength) * Math.sin(tickRad);
          
          return (
            <line
              key={i}
              x1={tickX1}
              y1={tickY1}
              x2={tickX2}
              y2={tickY2}
              stroke={isMajor ? "#6B7280" : "#D1D5DB"}
              strokeWidth={tickWidth}
              strokeLinecap="round"
            />
          );
        })}
        
        {/* 刻度标签 - 沿着圆弧外侧分布 */}
        {majorTicks.map((tick, i) => {
          const tickAngle = 180 - (tick * 180);
          const tickRad = (tickAngle * Math.PI) / 180;
          // 标签放在刻度线外侧，距离圆心更远
          const labelRadius = radius + 15;
          const labelX = center + labelRadius * Math.cos(tickRad);
          const labelY = center + labelRadius * Math.sin(tickRad);
          const tickValue = minValue + tick * range;
          
          return (
            <text
              key={i}
              x={labelX}
              y={labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10"
              fill="#6B7280"
              fontFamily="monospace"
              fontWeight="500"
            >
              {tickValue.toFixed(1)}
            </text>
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
      </svg>
      
      {/* 数值显示 */}
      <div className="text-center -mt-6">
        <div className="text-2xl font-bold font-mono" style={{ color }}>
          {value.toFixed(2)}x
        </div>
        <div className="text-xs text-gray-500 mt-0.5">{label}</div>
      </div>
    </div>
  );
}
