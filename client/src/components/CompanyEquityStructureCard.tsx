import React from 'react';
import { Users, Briefcase, Lock, TrendingUp } from 'lucide-react';

interface EquityPool {
  name: string;
  percentage: number;
  description: string;
  color: string;
  icon: any;
}

/**
 * 公司股权分配 - 内容组件（无外壳）
 * 用于嵌入 ShareholderSection 手风琴中
 */
export default function CompanyEquityStructureCard() {
  const pools: EquityPool[] = [
    {
      name: '创始团队',
      percentage: 40,
      description: '核心创始人及早期团队',
      color: '#1E3A8A',
      icon: Briefcase,
    },
    {
      name: '投资股份池',
      percentage: 20,
      description: '660位创始股东投资池',
      color: '#A80000',
      icon: Users,
    },
    {
      name: '预留期权池',
      percentage: 25,
      description: '用于未来融资及员工激励',
      color: '#059669',
      icon: Lock,
    },
    {
      name: '战略投资人',
      percentage: 15,
      description: 'Pre-A轮机构投资',
      color: '#7C3AED',
      icon: TrendingUp,
    },
  ];

  const total = pools.reduce((sum, pool) => sum + pool.percentage, 0);
  const svgSize = 200;
  const centerX = svgSize / 2;
  const centerY = svgSize / 2;
  const outerRadius = 80;
  const innerRadius = 45;

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
    <div>
      {/* 股权池 2x2 网格 */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {pools.map((pool, i) => (
          <div key={i} className="bg-white rounded-xl p-3 border border-gray-100">
            <div className="flex items-center gap-2 mb-1">
              <div 
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: pool.color }}
              />
              <div className="text-xs text-gray-500">{pool.name}</div>
            </div>
            <div className="text-xl font-bold text-gray-900">{pool.percentage}%</div>
            <div className="text-xs text-gray-400 mt-0.5">{pool.description}</div>
          </div>
        ))}
      </div>

      {/* 圆环图 */}
      <div className="flex justify-center mb-4">
        <div className="relative" style={{ width: svgSize, height: svgSize }}>
          <svg 
            viewBox={`0 0 ${svgSize} ${svgSize}`} 
            className="w-full h-full"
          >
            <defs>
              {pools.map((pool, i) => (
                <linearGradient key={`grad-${i}`} id={`poolGrad-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={pool.color} stopOpacity="1" />
                  <stop offset="100%" stopColor={pool.color} stopOpacity="0.8" />
                </linearGradient>
              ))}
            </defs>

            {pools.map((pool, i) => {
              const startAngle = currentAngle;
              const sweepAngle = (pool.percentage / total) * 360;
              const endAngle = startAngle + sweepAngle;
              currentAngle = endAngle;

              return (
                <g key={i}>
                  <path
                    d={getArcPath(startAngle, endAngle, outerRadius, innerRadius)}
                    fill={`url(#poolGrad-${i})`}
                    stroke="white"
                    strokeWidth="2"
                  />
                </g>
              );
            })}

            <circle
              cx={centerX}
              cy={centerY}
              r={innerRadius - 5}
              fill="white"
              stroke="#E5E7EB"
              strokeWidth="2"
            />

            <text
              x={centerX}
              y={centerY - 6}
              textAnchor="middle"
              className="text-xs fill-gray-500"
            >
              总股本
            </text>
            <text
              x={centerX}
              y={centerY + 12}
              textAnchor="middle"
              className="text-2xl font-bold fill-gray-900"
            >
              100%
            </text>
          </svg>
        </div>
      </div>

      {/* 虚线分割 */}
      <div className="border-t border-dashed border-gray-200 my-3"></div>

      {/* 底部数据 */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-gray-500 mb-1">创始股东</div>
          <div className="text-lg font-bold text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
            660人
          </div>
        </div>
        <div className="text-center">
          <div className="text-gray-500 mb-1">当前估值</div>
          <div className="text-lg font-bold text-orange-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
            6600万
          </div>
        </div>
        <div className="text-right">
          <div className="text-gray-500 mb-1">期权池余额</div>
          <div className="text-lg font-bold text-green-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
            25%
          </div>
        </div>
      </div>
    </div>
  );
}
