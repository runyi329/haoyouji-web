import { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';

interface EquityPart {
  label: string;
  value: number;
  color: string;
  upgradeLabel?: string;
  description?: string;
}

interface EquityEnergyRingProps {
  parts: EquityPart[];
  othersValue?: number;
  totalEquity: number;
}

/**
 * 个人资产结构图 - 双色扇区版本
 * 只显示"资本权证"和"贡献加成"两个部分，不显示其他股东
 */
export default function EquityEnergyRing({ parts, othersValue, totalEquity }: EquityEnergyRingProps) {
  const [animated, setAnimated] = useState(false);
  
  // 加载动画：页面打开时触发
  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // 准备数据：只取有值的部分，不包括"其他股东"
  // 将所有贡献类型合并为一个"贡献加成"
  const capitalEquity = parts.find(p => p.label === '投资股份')?.value || 0;
  const contributionEquity = parts
    .filter(p => p.label !== '投资股份')
    .reduce((sum, p) => sum + p.value, 0);
  
  // 构建双色扇区数据
  const simplifiedParts = [
    {
      label: '资本权证',
      value: capitalEquity,
      color: '#800000', // 深绯红
      upgradeLabel: '资本权证',
      description: '静态资金投入'
    },
    {
      label: '资源权证',
      value: contributionEquity,
      color: '#C5B358', // 香槟金
      upgradeLabel: '资源权证',
      description: '动态资源投入'
    }
  ].filter(p => p.value > 0);
  
  const total = simplifiedParts.reduce((s, p) => s + p.value, 0);
  if (total === 0) return null;

  // 计算每个扇形的角度
  let cumAngle = -90; // 从12点钟方向开始
  const sectors = simplifiedParts.map((part) => {
    const angle = (part.value / total) * 360;
    const startAngle = cumAngle;
    const endAngle = cumAngle + angle;
    cumAngle = endAngle;
    return { ...part, startAngle, endAngle, angle };
  });

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  // 3D环形参数
  const cx = 80;
  const cy = 80;
  const outerRadius = 65;
  const innerRadius = 48; // 环粗细占半径的 25% (65-48=17, 17/65≈26%)
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
      {/* 主体：左图右表布局 */}
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
                  <linearGradient key={`grad-${i}`} id={`sectorGrad-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
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
                  fill={`url(#sectorGrad-${i})`}
                  stroke="white"
                  strokeWidth="2"
                  className="transition-all duration-300 hover:opacity-90"
                  style={{
                    transformOrigin: `${cx}px ${cy}px`,
                  }}
                />
              ))}

              {/* 中心：资产盾牌图标（香槟金线条） */}
              <g transform={`translate(${cx - 12}, ${cy - 12})`}>
                <circle cx="12" cy="12" r="20" fill="white" opacity="0.95" />
                <Shield className="w-6 h-6 text-[#C5B358]" x="0" y="0" strokeWidth="2" />
                <text x="12" y="32" textAnchor="middle" className="text-[9px]" fill="#666" fontWeight="500">
                  已锁定
                </text>
              </g>
            </svg>
          </div>
        </div>

        {/* 右侧：精简的两行数据 */}
        <div className="space-y-3 flex flex-col justify-center">
          {simplifiedParts.map((part, index) => {
            const percentage = ((part.value / total) * 100).toFixed(1);
            
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
                  
                  {/* 资产名称 */}
                  <span className="text-xs font-semibold text-[#424242]">
                    {part.upgradeLabel}：
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
                <div className="text-[10px] text-[#757575] mt-0.5 ml-4">
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
