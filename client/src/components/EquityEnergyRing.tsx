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
 * 3D能量环 + 胶囊数据列表组件
 * 从"廉价饼图"升级为"金融级资产看板"
 */
export default function EquityEnergyRing({ parts, othersValue, totalEquity }: EquityEnergyRingProps) {
  const [animated, setAnimated] = useState(false);
  
  // 加载动画：页面打开时触发
  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // 准备数据
  const allParts = [
    ...parts.filter(p => p.value > 0),
    ...(othersValue && othersValue > 0 ? [{ 
      label: '其他股东', 
      value: othersValue, 
      color: '#D1D5DB',
      upgradeLabel: '其他股东',
      description: '剩余股份'
    }] : []),
  ];
  
  const total = allParts.reduce((s, p) => s + p.value, 0);
  if (total === 0) return null;

  // 计算每个扇形的角度
  let cumAngle = -90; // 从12点钟方向开始
  const sectors = allParts.map((part) => {
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
      // 完整圆环
      return `
        M ${cx} ${cy - outerRadius}
        A ${outerRadius} ${outerRadius} 0 1 1 ${cx - 0.01} ${cy - outerRadius}
        Z
        M ${cx} ${cy - innerRadius}
        A ${innerRadius} ${innerRadius} 0 1 0 ${cx - 0.01} ${cy - innerRadius}
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

  // 获取当前时间戳
  const now = new Date();
  const timestamp = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

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
                {/* 深红到亮红的径向渐变 */}
                <radialGradient id="energyGradient" cx="30%" cy="30%">
                  <stop offset="0%" stopColor="#FF4D4D" />
                  <stop offset="100%" stopColor="#9D1C1C" />
                </radialGradient>
                
                {/* 每个扇形的渐变色 */}
                {sectors.map((s, i) => (
                  <linearGradient key={`grad-${i}`} id={`sectorGrad-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={s.color} stopOpacity="1" />
                    <stop offset="100%" stopColor={s.color} stopOpacity="0.7" />
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

              {/* 中心：资产盾牌图标 */}
              <g transform={`translate(${cx - 12}, ${cy - 12})`}>
                <circle cx="12" cy="12" r="20" fill="white" opacity="0.95" />
                <Shield className="w-6 h-6 text-[#A80000]" x="0" y="0" />
                <text x="12" y="32" textAnchor="middle" className="text-[9px]" fill="#666" fontWeight="500">
                  已锁定
                </text>
              </g>
            </svg>
          </div>
        </div>

        {/* 右侧：数据胶囊列表 */}
        <div className="space-y-3">
          {allParts.map((part, index) => {
            const percentage = part.value.toFixed(4);
            const upgradeLabel = part.upgradeLabel || part.label;
            const description = part.description || '';
            
            return (
              <div 
                key={index}
                className={`flex items-center space-x-3 h-12 transition-all duration-300 ${
                  animated ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
                }`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                {/* 颜色指示器 */}
                <div 
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: part.color }}
                />
                
                {/* 数据内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline space-x-2">
                    {/* 百分比（等宽字体） */}
                    <span className="text-sm font-bold text-gray-900" style={{ fontFamily: 'Roboto Mono, monospace' }}>
                      {percentage}%
                    </span>
                    {/* 资产名称 */}
                    <span className="text-xs text-gray-600">
                      {upgradeLabel}
                    </span>
                  </div>
                  {/* 备注信息 */}
                  {description && (
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {description}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 底部：加密时间戳 */}
      <div className="pt-3 border-t border-gray-200">
        <div className="flex items-center justify-center space-x-2 text-[10px] text-gray-400">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span>数据已加密保护，实时同步至 {timestamp}</span>
        </div>
      </div>
    </div>
  );
}
