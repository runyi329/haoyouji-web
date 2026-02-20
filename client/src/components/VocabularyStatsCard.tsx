import { Card } from "@/components/ui/card";

interface TrendData {
  date: string;
  chineseChar: number;
  chineseWord: number;
  english: number;
  total: number;
}

interface VocabularyStatsCardProps {
  stats: {
    chineseCharCount: number;
    chineseWordCount: number;
    englishCount: number;
    recentAddedCount: number;
    trendData: TrendData[];
  };
}

// 简单的趋势曲线图组件
function TrendChart({ data, dataKey }: { data: TrendData[]; dataKey: keyof TrendData }) {
  if (!data || data.length === 0) {
    return <div className="w-20 sm:w-32 h-6 sm:h-8 bg-gray-100 rounded" />;
  }

  // 获取数据点
  const values = data.map((d) => (typeof d[dataKey] === 'number' ? d[dataKey] : 0)) as number[];
  const maxValue = Math.max(...values, 1); // 至少为1，避免除以0
  
  // SVG尺寸（移动端更小）
  const width = typeof window !== 'undefined' && window.innerWidth < 640 ? 80 : 120;
  const height = typeof window !== 'undefined' && window.innerWidth < 640 ? 24 : 32;
  const padding = 2;
  
  // 计算点的位置
  const points = values.map((value, index) => {
    const x = padding + (index / (values.length - 1 || 1)) * (width - padding * 2);
    const y = height - padding - (value / maxValue) * (height - padding * 2);
    return { x, y };
  });
  
  // 生成路径
  const pathData = points.map((point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }
    return `L ${point.x} ${point.y}`;
  }).join(' ');
  
  return (
    <svg width={width} height={height} className="inline-block">
      <path
        d={pathData}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-[#4CAF50]"
      />
      {points.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r="2"
          fill="currentColor"
          className="text-[#4CAF50]"
        />
      ))}
    </svg>
  );
}

export function VocabularyStatsCard({ stats }: VocabularyStatsCardProps) {
  const items = [
    {
      label: "中文字",
      count: stats.chineseCharCount,
      dataKey: "chineseChar" as keyof TrendData,
    },
    {
      label: "中文词",
      count: stats.chineseWordCount,
      dataKey: "chineseWord" as keyof TrendData,
    },
    {
      label: "英文单词",
      count: stats.englishCount,
      dataKey: "english" as keyof TrendData,
    },
    {
      label: "近七天新增",
      count: stats.recentAddedCount,
      dataKey: "total" as keyof TrendData,
    },
  ];

  return (
    <Card className="p-4 sm:p-6 bg-gradient-to-br from-white to-white border-green-200">
      <h3 className="text-base sm:text-lg font-semibold text-green-800 mb-3 sm:mb-4">词库概览</h3>
      <div className="space-y-2 sm:space-y-3">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex items-center justify-between py-2 border-b border-green-100 last:border-b-0"
          >
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span className="text-sm sm:text-base text-gray-700 font-medium whitespace-nowrap">{item.label}</span>
              <span className="text-xl sm:text-2xl font-bold text-[#4CAF50]">{item.count}</span>
            </div>
            <div className="flex-shrink-0 ml-2">
              <TrendChart data={stats.trendData} dataKey={item.dataKey} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
