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

  // 饼图参数
  const cx = 80;
  const cy = 80;
  const outerRadius = 65;
  const innerRadius = 48; // 环形
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

  return (
    <div className="flex items-center justify-center gap-6">
      {/* 左侧：饼图 */}
      <div className="relative flex-shrink-0">
        <svg width={svgSize} height={svgSize} className="transform -rotate-0">
          {sectors.map((sector, i) => (
            <path
              key={i}
              d={donutPath(sector.startAngle, sector.endAngle)}
              fill={sector.color}
              className={`transition-all duration-700 ${animated ? 'opacity-100' : 'opacity-0'}`}
              style={{
                transitionDelay: `${i * 100}ms`,
              }}
            />
          ))}
        </svg>
        
        {/* 中心文字 */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xs text-gray-400">总股本</div>
          <div className="text-2xl font-bold text-gray-900">100%</div>
        </div>
      </div>

      {/* 右侧：图例 */}
      <div className="space-y-2">
        {validParts.map((part, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 transition-all duration-500 ${
              animated ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
            }`}
            style={{ transitionDelay: `${i * 100 + 200}ms` }}
          >
            <div
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: part.color }}
            />
            <div className="text-xs">
              <div className="font-medium text-gray-700">{part.label}</div>
              <div className="text-[10px] text-gray-400">{part.description}</div>
            </div>
            <div className="ml-auto text-sm font-bold text-gray-900">
              {part.value.toFixed(2)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
