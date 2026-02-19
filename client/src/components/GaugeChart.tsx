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
  const size = 180;
  const center = size / 2;
  const radius = 60;
  const strokeWidth = 12;
  
  // 计算指针终点坐标
  const pointerLength = radius - 10;
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
  
  // 生成更密集的刻度（每0.05一个小刻度，共21个刻度）
  const generateTicks = () => {
    const ticks = [];
    const step = 0.05; // 每5%一个刻度
    for (let i = 0; i <= 1; i += step) {
      ticks.push(i);
    }
    return ticks;
  };
  
  // 生成主要刻度标签（1.0, 1.5, 2.0, 2.5, 3.0）
  const majorTicks = [0, 0.25, 0.5, 0.75, 1];
  
  // 生成次要刻度标签（每0.1，即1.1, 1.2, ... 2.9）
  const minorLabelTicks = [];
  for (let i = 0.1; i < 1; i += 0.1) {
    if (!majorTicks.includes(i)) {
      minorLabelTicks.push(i);
    }
  }
  
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.65} viewBox={`0 ${size * 0.15} ${size} ${size * 0.65}`}>
        <defs>
          {/* 玻璃质感渐变 */}
          <linearGradient id="glassGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
            <stop offset="50%" stopColor="#ffffff" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.05" />
          </linearGradient>
          
          {/* 背景弧线渐变 */}
          <linearGradient id="bgArcGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#F3F4F6" />
            <stop offset="100%" stopColor="#E5E7EB" />
          </linearGradient>
          
          {/* 指针阴影 */}
          <filter id="pointerShadow">
            <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
            <feOffset dx="1" dy="2" result="offsetblur"/>
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.3"/>
            </feComponentTransfer>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          {/* 外圈阴影 */}
          <filter id="outerShadow">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
            <feOffset dx="0" dy="2" result="offsetblur"/>
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.2"/>
            </feComponentTransfer>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* 外圈装饰（立体感） */}
        <path
          d={arcPath}
          fill="none"
          stroke="#D1D5DB"
          strokeWidth={strokeWidth + 4}
          strokeLinecap="round"
          opacity="0.3"
          filter="url(#outerShadow)"
        />
        
        {/* 背景弧线（渐变） */}
        <path
          d={arcPath}
          fill="none"
          stroke="url(#bgArcGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        
        {/* 玻璃质感覆盖层 */}
        <path
          d={arcPath}
          fill="none"
          stroke="url(#glassGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        
        {/* 刻度线 */}
        {generateTicks().map((tick, i) => {
          // 从180度（9点钟）到0度（3点钟）
          const tickAngle = 180 - (tick * 180);
          const tickRad = (tickAngle * Math.PI) / 180;
          const isMajor = majorTicks.includes(tick);
          const isMinorLabel = minorLabelTicks.includes(Math.round(tick * 100) / 100);
          const tickLength = isMajor ? 12 : isMinorLabel ? 8 : 5;
          const tickWidth = isMajor ? 2.5 : isMinorLabel ? 1.5 : 1;
          
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
              stroke={isMajor ? "#4B5563" : isMinorLabel ? "#9CA3AF" : "#D1D5DB"}
              strokeWidth={tickWidth}
              strokeLinecap="round"
            />
          );
        })}
        
        {/* 主要刻度标签 - 沿着圆弧外侧分布 */}
        {majorTicks.map((tick, i) => {
          const tickAngle = 180 - (tick * 180);
          const tickRad = (tickAngle * Math.PI) / 180;
          // 标签放在刻度线外侧，距离圆心更远
          const labelRadius = radius + 18;
          const labelX = center + labelRadius * Math.cos(tickRad);
          const labelY = center + labelRadius * Math.sin(tickRad);
          const tickValue = minValue + tick * range;
          
          // 调整边缘标签位置避免重叠
          let adjustedX = labelX;
          let adjustedY = labelY;
          let textAnchor: 'start' | 'middle' | 'end' = 'middle';
          
          // 左边缘标签 (1.0) - 向左偏移
          if (tick === 0) {
            adjustedX = labelX - 8;
            textAnchor = 'end';
          }
          // 右边缘标签 (3.0) - 向右偏移
          else if (tick === 1) {
            adjustedX = labelX + 8;
            textAnchor = 'start';
          }
          
          return (
            <text
              key={i}
              x={adjustedX}
              y={adjustedY}
              textAnchor={textAnchor}
              dominantBaseline="middle"
              fontSize="11"
              fill="#374151"
              fontFamily="monospace"
              fontWeight="600"
            >
              {tickValue.toFixed(1)}
            </text>
          );
        })}
        
        {/* 指针阴影 */}
        <line
          x1={center}
          y1={center}
          x2={pointerX + 2}
          y2={pointerY + 2}
          stroke="#000000"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.2"
        />
        
        {/* 指针 */}
        <line
          x1={center}
          y1={center}
          x2={pointerX}
          y2={pointerY}
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          filter="url(#pointerShadow)"
        />
        
        {/* 指针高光 */}
        <line
          x1={center}
          y1={center}
          x2={pointerX}
          y2={pointerY}
          stroke="#ffffff"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.6"
          strokeDasharray="0,4"
        />
        
        {/* 中心圆点外圈（立体感） */}
        <circle
          cx={center}
          cy={center}
          r="8"
          fill="#D1D5DB"
          opacity="0.3"
        />
        
        {/* 中心圆点 */}
        <circle
          cx={center}
          cy={center}
          r="6"
          fill={color}
        />
        
        {/* 中心圆点高光 */}
        <circle
          cx={center - 1}
          cy={center - 1}
          r="3"
          fill="#ffffff"
          opacity="0.5"
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
