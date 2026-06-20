import { useState, useEffect } from 'react';

interface EquityPoolPart {
  label: string;
  value: number;
  color: string;
  description: string;
}

interface CompanyEquityPieChartProps {
  parts: EquityPoolPart[];
}

/**
 * 公司股权分配饼图组件
 * 展示公司股份池的分配比例
 * 样式与EquityEnergyRing完全一致
 */
export default function CompanyEquityPieChart({ parts }: CompanyEquityPieChartProps) {
  const [animated, setAnimated] = useState(false);
  
  // 加载动画：页面打开时触发
  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // 过滤掉值为0的部分
  const validParts = parts.filter(p => p.value > 0);
  const total = validParts.reduce((s, p) => s + p.value, 0);
  if (total === 0) return null;

  // 计算每个扇形的角度
  let cumAngle = -90; // 从12点钟方向开始
  const sectors = validParts.map((part) => {
    const angle = (part.value / total) * 360;
    const startAngle = cumAngle;
    const endAngle = cumAngle + angle;
    cumAngle = endAngle;
    return { ...part, startAngle, endAngle, angle };
  });

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  // 3D环形参数（与EquityEnergyRing完全一致）
  const cx = 80;
  const cy = 80;
  const outerRadius = 65;
  const innerRadius = 48;
  const svgSize = 160;

  // 生成环形路径（donut shape）
  const donutPath = (startAngle: number, endAngle: number) => {
    if (endAngle - startAngle >= 359.99) {
      // 完整圆环：外圆顺时针 + 内圆逆时针，形成环形
      return `
        M ${cx} ${cy - outerRadius}
        A ${outerRadius} ${outerRadius} 0 1 1 ${cx - 0.01} ${cy - outerRadius}
        L ${cx - 0.01} ${cy - innerRadius}
        A ${innerRadius} ${innerRadius} 0 1 0 ${cx} ${cy - innerRadius}
        Z
      `;
    }
    
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    
    // 外圆弧起点和终点
    const x1Outer = cx + outerRadius * Math.cos(toRad(startAngle));
    const y1Outer = cy + outerRadius * Math.sin(toRad(startAngle));
    const x2Outer = cx + outerRadius * Math.cos(toRad(endAngle));
    const y2Outer = cy + outerRadius * Math.sin(toRad(endAngle));
    
    // 内圆弧起点和终点
    const x1Inner = cx + innerRadius * Math.cos(toRad(startAngle));
    const y1Inner = cy + innerRadius * Math.sin(toRad(startAngle));
    const x2Inner = cx + innerRadius * Math.cos(toRad(endAngle));
    const y2Inner = cy + innerRadius * Math.sin(toRad(endAngle));
    
    return `
      M ${x1Outer} ${y1Outer}
      A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}
      L ${x2Inner} ${y2Inner}
      A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x1Inner} ${y1Inner}
      Z
    `;
  };

  return (
    <div className="space-y-4">
      {/* 主体：左图右表布局（与EquityEnergyRing完全一致） */}
      <div className="grid grid-cols-[40%_60%] gap-4">
        {/* 左侧：3D能量环 */}
        <div className="flex items-center justify-center">
          <div className="relative" style={{ width: svgSize, height: svgSize }}>
            <svg 
              viewBox={`0 0 ${svgSize} ${svgSize}`} 
              className={`w-full h-full transition-all duration-1000 ${animated ? 'opacity-100' : 'opacity-0'}`}
              style={{ 
                filter: 'drop-shadow(0 4px 10px rgba(0, 0, 0, 0.15))',
                transform: animated ? 'rotate(0deg)' : 'rotate(-90deg)',
              }}
            >
              <defs>
                {/* 每个扇形的渐变色 */}
                {sectors.map((s, i) => (
                  <linearGradient key={`grad-${i}`} id={`companyGrad-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={s.color} stopOpacity="1" />
                    <stop offset="100%" stopColor={s.color} stopOpacity="0.8" />
                  </linearGradient>
                ))}
              </defs>

              {/* 绘制环形扇区 */}
              {sectors.map((s, i) => (
                <path
                  key={i}
                  d={donutPath(s.startAngle, s.endAngle)}
                  fill={`url(#companyGrad-${i})`}
                  stroke="white"
                  strokeWidth="2"
                  className="transition-all duration-300 hover:opacity-90"
                  style={{
                    transformOrigin: `${cx}px ${cy}px`,
                  }}
                />
              ))}

              {/* 中心：总股本文字 */}
              <g transform={`translate(${cx}, ${cy})`}>
                <text 
                  x="0" 
                  y="-8" 
                  textAnchor="middle" 
                  className="text-[9px]" 
                  fill="#999" 
                  fontWeight="400"
                >
                  总股本
                </text>
                <text 
                  x="0" 
                  y="8" 
                  textAnchor="middle" 
                  className="text-[20px]" 
                  fill="#333" 
                  fontWeight="700"
                >
                  100%
                </text>
              </g>
            </svg>
          </div>
        </div>

        {/* 右侧：精简的数据列表 */}
        <div className="space-y-3 flex flex-col justify-center">
          {validParts.map((part, index) => {
            return (
              <div 
                key={index}
                className={`transition-all duration-300 ${
                  animated ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
                }`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                {/* 数据内容 */}
                <div className="flex items-center space-x-2">
                  {/* 颜色指示器 */}
                  <div 
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: part.color }}
                  />
                  
                  {/* 股东名称 */}
                  <span className="text-xs font-semibold text-gray-700">
                    {part.label}：
                  </span>
                  
                  {/* 百分比（等宽字体） */}
                  <span 
                    className="text-sm font-bold"
                    style={{ 
                      fontFamily: 'Roboto Mono, monospace',
                      color: part.color
                    }}
                  >
                    {part.value.toFixed(4)}%
                  </span>
                </div>
                
                {/* 备注信息 */}
                <div className="text-[10px] text-gray-400 mt-0.5 ml-4">
                  {part.description}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
