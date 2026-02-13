import { Shield, Users, Briefcase, Lock, TrendingUp } from 'lucide-react';

interface EquityPool {
  name: string;
  percentage: number;
  description: string;
  color: string;
  icon: any;
}

/**
 * 公司全球股权分配架构
 * 从"简单饼图"升级为"深色系多层圆环"
 */
export default function CompanyEquityStructure() {
  const pools: EquityPool[] = [
    {
      name: '创始团队',
      percentage: 40,
      description: '核心创始人及早期团队',
      color: '#1E3A8A', // 深蓝
      icon: Briefcase,
    },
    {
      name: '投资股份池',
      percentage: 20,
      description: '660位创始股东投资池',
      color: '#A80000', // 深红
      icon: Users,
    },
    {
      name: '预留期权池',
      percentage: 25,
      description: '用于未来融资及员工激励',
      color: '#059669', // 深绿
      icon: Lock,
    },
    {
      name: '战略投资人',
      percentage: 15,
      description: 'Pre-A轮机构投资',
      color: '#7C3AED', // 深紫
      icon: TrendingUp,
    },
  ];

  const total = pools.reduce((sum, pool) => sum + pool.percentage, 0);
  const svgSize = 240;
  const centerX = svgSize / 2;
  const centerY = svgSize / 2;
  const outerRadius = 90;
  const innerRadius = 50;

  // 计算扇形路径
  const getArcPath = (startAngle: number, endAngle: number, outerR: number, innerR: number) => {
    const startOuter = polarToCartesian(centerX, centerY, outerR, endAngle);
    const endOuter = polarToCartesian(centerX, centerY, outerR, startAngle);
    const startInner = polarToCartesian(centerX, centerY, innerR, endAngle);
    const endInner = polarToCartesian(centerX, centerY, innerR, startAngle);
    
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    
    return [
      'M', startOuter.x, startOuter.y,
      'A', outerR, outerR, 0, largeArcFlag, 0, endOuter.x, endOuter.y,
      'L', endInner.x, endInner.y,
      'A', innerR, innerR, 0, largeArcFlag, 1, startInner.x, startInner.y,
      'Z'
    ].join(' ');
  };

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
  };

  let currentAngle = 0;

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">公司全球股权分配架构</h3>
        <div className="flex items-center space-x-1 text-xs text-gray-400">
          <Shield className="w-3 h-3" />
          <span>透明 · 规范</span>
        </div>
      </div>

      {/* 主体：左图右表 */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-5">
        <div className="grid grid-cols-[45%_55%] gap-4">
          {/* 左侧：多层圆环 */}
          <div className="flex items-center justify-center">
            <div className="relative" style={{ width: svgSize, height: svgSize }}>
              <svg 
                viewBox={`0 0 ${svgSize} ${svgSize}`} 
                className="w-full h-full"
                style={{ 
                  filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3))',
                }}
              >
                <defs>
                  {/* 每个扇形的渐变 */}
                  {pools.map((pool, i) => (
                    <linearGradient key={`grad-${i}`} id={`poolGrad-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={pool.color} stopOpacity="1" />
                      <stop offset="100%" stopColor={pool.color} stopOpacity="0.7" />
                    </linearGradient>
                  ))}
                </defs>

                {/* 绘制环形扇区 */}
                {pools.map((pool, i) => {
                  const startAngle = currentAngle;
                  const sweepAngle = (pool.percentage / total) * 360;
                  const endAngle = startAngle + sweepAngle;
                  currentAngle = endAngle;

                  return (
                    <g key={i} className="transition-all hover:opacity-90 cursor-pointer">
                      <path
                        d={getArcPath(startAngle, endAngle, outerRadius, innerRadius)}
                        fill={`url(#poolGrad-${i})`}
                        stroke="rgba(255,255,255,0.1)"
                        strokeWidth="1"
                      />
                    </g>
                  );
                })}

                {/* 中心圆 */}
                <circle
                  cx={centerX}
                  cy={centerY}
                  r={innerRadius - 5}
                  fill="rgba(255,255,255,0.05)"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="1"
                />

                {/* 中心文字 */}
                <text
                  x={centerX}
                  y={centerY - 8}
                  textAnchor="middle"
                  className="text-xs fill-white opacity-70"
                >
                  总股本
                </text>
                <text
                  x={centerX}
                  y={centerY + 12}
                  textAnchor="middle"
                  className="text-2xl font-bold fill-white"
                >
                  100%
                </text>
              </svg>
            </div>
          </div>

          {/* 右侧：数据列表 */}
          <div className="space-y-2.5">
            {pools.map((pool, i) => {
              const Icon = pool.icon;
              return (
                <div
                  key={i}
                  className="bg-white/5 rounded-lg p-3 border border-white/10 hover:bg-white/10 transition-all cursor-pointer"
                >
                  <div className="flex items-start space-x-3">
                    {/* 颜色指示器 + 图标 */}
                    <div 
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: pool.color }}
                    >
                      <Icon className="w-4 h-4 text-white" />
                    </div>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-sm font-semibold text-white">{pool.name}</span>
                        <span className="text-lg font-bold text-white font-mono">
                          {pool.percentage}%
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 leading-relaxed">
                        {pool.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 底部说明 */}
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex items-start space-x-2">
            <Shield className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-gray-300 leading-relaxed">
                <span className="font-semibold text-white">透明承诺：</span>
                所有股权池比例已在《公司章程》中明确约定，
                <span className="text-green-400 font-semibold">预留期权池</span>
                专用于未来融资及核心员工激励，
                <span className="text-red-400 font-semibold">投资股份池</span>
                中您的占比受法律保护，不受其他池子调整影响。
              </p>
            </div>
          </div>
        </div>

        {/* 关键数据 */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/10">
            <div className="text-xs text-gray-400 mb-1">创始股东数</div>
            <div className="text-xl font-bold text-white">660</div>
          </div>
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/10">
            <div className="text-xs text-gray-400 mb-1">当前估值</div>
            <div className="text-xl font-bold text-white">6600万</div>
          </div>
          <div className="bg-white/5 rounded-lg p-2.5 border border-white/10">
            <div className="text-xs text-gray-400 mb-1">期权池余额</div>
            <div className="text-xl font-bold text-green-400">25%</div>
          </div>
        </div>
      </div>

      {/* 架构说明 */}
      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
        <div className="flex items-start space-x-2">
          <div className="w-1 h-1 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
          <p className="text-xs text-gray-700 leading-relaxed">
            <span className="font-semibold text-blue-900">架构设计原则：</span>
            创始团队保持控制权（40%），投资股东享有充分权益（20%），
            预留足够空间用于未来发展（25%期权池），引入战略资源（15%机构投资）。
            这是经过专业律师审核的标准化股权结构，确保各方利益平衡。
          </p>
        </div>
      </div>
    </div>
  );
}
