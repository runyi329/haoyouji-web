import React, { useState } from 'react';

interface ChartDataPoint {
  week: string;
  weight: number;
}

interface AssetGrowthChartProps {
  data: ChartDataPoint[];
}

const AssetGrowthChart: React.FC<AssetGrowthChartProps> = ({ data }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // 计算图表尺寸
  const chartWidth = 320;
  const chartHeight = 140;
  const padding = { top: 20, right: 10, bottom: 30, left: 40 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // 计算数据范围
  const maxWeight = Math.max(...data.map(d => d.weight));
  const minWeight = Math.min(...data.map(d => d.weight));
  const weightRange = maxWeight - minWeight;

  // 坐标转换函数
  const getX = (index: number) => {
    return padding.left + (index / (data.length - 1)) * innerWidth;
  };

  const getY = (weight: number) => {
    const normalized = weightRange > 0 ? (weight - minWeight) / weightRange : 0.5;
    return padding.top + innerHeight - normalized * innerHeight;
  };

  // 生成路径
  const pathData = data.map((point, index) => {
    const x = getX(index);
    const y = getY(point.weight);
    return index === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
  }).join(' ');

  // 生成填充区域路径
  const fillPathData = `
    ${pathData}
    L ${getX(data.length - 1)} ${padding.top + innerHeight}
    L ${getX(0)} ${padding.top + innerHeight}
    Z
  `;

  return (
    <div className="relative">
      <svg
        width={chartWidth}
        height={chartHeight}
        className="mx-auto"
      >
        {/* 背景网格线 */}
        <g>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding.top + innerHeight * (1 - ratio);
            return (
              <line
                key={ratio}
                x1={padding.left}
                y1={y}
                x2={padding.left + innerWidth}
                y2={y}
                stroke="#F0F0F0"
                strokeWidth="1"
              />
            );
          })}
        </g>

        {/* Y轴刻度 */}
        <g>
          {[0, 0.5, 1].map((ratio) => {
            const y = padding.top + innerHeight * (1 - ratio);
            const value = minWeight + weightRange * ratio;
            return (
              <text
                key={ratio}
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="#888888"
              >
                {value.toFixed(2)}%
              </text>
            );
          })}
        </g>

        {/* 填充区域 */}
        <path
          d={fillPathData}
          fill="url(#gradient)"
          opacity="0.2"
        />

        {/* 渐变定义 */}
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#C5B358" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#C5B358" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 曲线 */}
        <path
          d={pathData}
          fill="none"
          stroke="#C5B358"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 数据点 */}
        {data.map((point, index) => {
          const x = getX(index);
          const y = getY(point.weight);
          const isHovered = hoveredIndex === index;

          return (
            <g key={index}>
              {/* 悬停时的垂直线 */}
              {isHovered && (
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={padding.top + innerHeight}
                  stroke="#C5B358"
                  strokeWidth="1"
                  strokeDasharray="4 2"
                  opacity="0.5"
                />
              )}

              {/* 数据点 */}
              <circle
                cx={x}
                cy={y}
                r={isHovered ? 5 : 3}
                fill={isHovered ? '#C5B358' : '#FFFFFF'}
                stroke="#C5B358"
                strokeWidth="2"
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                className="cursor-pointer transition-all duration-200"
              />

              {/* 悬停时的数值标签 */}
              {isHovered && (
                <g>
                  <rect
                    x={x - 35}
                    y={y - 35}
                    width="70"
                    height="26"
                    rx="4"
                    fill="#333333"
                    opacity="0.9"
                  />
                  <text
                    x={x}
                    y={y - 23}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#FFFFFF"
                    fontWeight="600"
                  >
                    {point.week}
                  </text>
                  <text
                    x={x}
                    y={y - 13}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#C5B358"
                    fontWeight="700"
                  >
                    +{point.weight.toFixed(4)}%
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* X轴标签 */}
        <g>
          {data.map((point, index) => {
            // 只显示第一个、最后一个和中间的标签
            const shouldShow = index === 0 || index === data.length - 1 || index === Math.floor(data.length / 2);
            if (!shouldShow) return null;

            const x = getX(index);
            return (
              <text
                key={index}
                x={x}
                y={padding.top + innerHeight + 20}
                textAnchor="middle"
                fontSize="10"
                fill="#888888"
              >
                {point.week}
              </text>
            );
          })}
        </g>
      </svg>

      {/* 图例 */}
      <div className="flex items-center justify-center mt-2 text-xs text-[#757575]">
        <div className="flex items-center space-x-1">
          <div className="w-3 h-0.5 bg-[#C5B358]"></div>
          <span>权重增长趋势</span>
        </div>
      </div>
    </div>
  );
};

export default AssetGrowthChart;
