import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList
} from 'recharts';
import { trpc } from "@/lib/trpc";
import { useColorTheme } from "@/contexts/ColorThemeContext";

type TabType = "all" | "my" | "shared";
type TimePeriodType = "day" | "week" | "month";
type ChartType = "bar" | "line" | "calendar";

// 获取当前主题色的hook
function useThemeColors() {
  const { currentTheme, customColors } = useColorTheme();
  const colors = customColors || currentTheme.colors;
  
  // 计算一个较浅的主题色用于背景
  const primaryLight = `${colors.primary}15`; // 15% opacity
  const primaryMedium = `${colors.primary}50`; // 50% opacity
  
  return {
    primary: colors.primary,
    secondary: colors.secondary,
    primaryLight,
    primaryMedium,
    text: colors.text,
  };
}

export default function DataComparison() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const themeColors = useThemeColors();

  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶部导航区 - 使用主题色渐变背景 */}
      <div 
        className="text-white"
        style={{ 
          background: `linear-gradient(to right, ${themeColors.primary}, ${themeColors.secondary})` 
        }}
      >
        {/* 顶部导航栏：返回 + 标题 + Tab切换 */}
        <div className="flex items-center justify-between px-4 py-3">
          <button 
            onClick={() => setLocation('/parent/contacts')}
            className="flex items-center"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center">
            <span className="font-medium">数据分析</span>
          </div>
          {/* 标签页切换 - 放在标题右边 */}
          <div className="flex bg-white/20 rounded-lg overflow-hidden">
            <button
              onClick={() => setActiveTab("all")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: activeTab === "all" ? "white" : "transparent",
                color: activeTab === "all" ? themeColors.primary : "white"
              }}
            >
              全部
            </button>
            <button
              onClick={() => setActiveTab("my")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: activeTab === "my" ? "white" : "transparent",
                color: activeTab === "my" ? themeColors.primary : "white"
              }}
            >
              我的
            </button>
            <button
              onClick={() => setActiveTab("shared")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: activeTab === "shared" ? "white" : "transparent",
                color: activeTab === "shared" ? themeColors.primary : "white"
              }}
            >
              共享
            </button>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 bg-gray-50 overflow-auto">
        {activeTab === "all" && (
          <AllDataContent themeColors={themeColors} />
        )}
        {activeTab === "my" && (
          <MyDataContent themeColors={themeColors} />
        )}
        {activeTab === "shared" && (
          <SharedDataContent themeColors={themeColors} />
        )}
      </div>
    </div>
  );
}

interface ThemeColors {
  primary: string;
  secondary: string;
  primaryLight: string;
  primaryMedium: string;
  text: string;
}

interface DataContentProps {
  themeColors: ThemeColors;
}

// 全部数据内容
function AllDataContent({ themeColors }: DataContentProps) {
  const [timePeriod, setTimePeriod] = useState<TimePeriodType>("week");
  const [chartType, setChartType] = useState<ChartType>("bar");

  // 使用API获取真实数据
  const { data: apiData, isLoading } = trpc.analytics.contactGrowthStats.useQuery({
    type: 'all',
    period: timePeriod,
  });

  // 处理API数据
  const chartData = useMemo(() => {
    if (!apiData) return [];
    return apiData;
  }, [apiData]);

  // 计算平均值
  const avgValue = useMemo(() => {
    const total = chartData.reduce((sum, item) => sum + item.value, 0);
    return (total / chartData.length).toFixed(1);
  }, [chartData]);

  // 获取标题文字和统计信息
  const periodText = timePeriod === "day" ? "天" : timePeriod === "week" ? "周" : "月";
  const titleText = `最近${timePeriod === "day" ? 30 : 12}${periodText}新增人脉`;
  const totalCount = useMemo(() => {
    return chartData.reduce((sum, item) => sum + item.value, 0);
  }, [chartData]);
  const avgUnit = timePeriod === "day" ? "日均" : timePeriod === "week" ? "周均" : "月均";

  // 渲染图表
  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 15, left: timePeriod === "day" ? 5 : -10, bottom: 5 }
    };

    const commonAxisProps = {
      xAxis: {
        dataKey: timePeriod === "day" ? "displayName" : "name",
        tick: { fontSize: 11, fill: '#6b7280' },
        stroke: "#9ca3af",
        interval: timePeriod === "day" ? 1 : 0
      },
      yAxis: {
        tick: { fontSize: 11, fill: '#6b7280' },
        stroke: "#9ca3af",
        width: 45,
        tickFormatter: (value: number) => `${value}人`,
        domain: [0, (dataMax: number) => Math.ceil(dataMax * 1.15)]
      },
      tooltip: {
        contentStyle: {
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          fontSize: '14px'
        },
        formatter: (value: any) => [`${value}人`, '新增人脉']
      }
    };

    if (chartType === "bar") {
      return (
        <BarChart {...commonProps} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis {...commonAxisProps.xAxis} />
          <YAxis {...commonAxisProps.yAxis} />
          <Tooltip {...commonAxisProps.tooltip} />
          <Bar 
            dataKey="value" 
            fill={themeColors.primary}
            radius={[4, 4, 0, 0]}
            animationBegin={0}
            animationDuration={1500}
            animationEasing="ease-out"
          >
            <LabelList 
              dataKey="value" 
              position="top" 
              style={{ fontSize: '12px', fill: '#6b7280', fontWeight: 500 }}
            />
          </Bar>
        </BarChart>
      );
    } else if (chartType === "line") {
      return (
        <LineChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis {...commonAxisProps.xAxis} />
          <YAxis {...commonAxisProps.yAxis} />
          <Tooltip {...commonAxisProps.tooltip} />
          <Line 
            type="monotone"
            dataKey="value" 
            stroke={themeColors.primary}
            strokeWidth={2}
            dot={{ fill: themeColors.primary, r: 4 }}
            activeDot={{ r: 6 }}
            animationBegin={0}
            animationDuration={1500}
            animationEasing="ease-out"
          >
            <LabelList 
              dataKey="value" 
              position="top" 
              style={{ fontSize: '12px', fill: '#6b7280', fontWeight: 500 }}
            />
          </Line>
        </LineChart>
      );
    } else {
      // 日历热力图
      const maxValue = Math.max(...chartData.map(d => d.value));
      
      // 根据时间维度设置列数
      const gridCols = timePeriod === "day" ? 7 : 4;
      const gridColsClass = timePeriod === "day" ? "grid-cols-7" : "grid-cols-4";
      
      // 星期标题（只在日维度显示）
      const weekHeaders = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      
      return (
        <div className="p-1.5 rounded-lg" style={{ backgroundColor: themeColors.primary }}>
          {/* 星期标题（只在日维度显示） */}
          {timePeriod === "day" && (
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {weekHeaders.map((day, i) => (
                <div key={i} className="text-center text-white text-[9px] py-0">{day}</div>
              ))}
            </div>
          )}
          {/* 日历格子 */}
          <div className={`grid ${gridColsClass} gap-0.5`}>
            {chartData.map((item, index) => {
              const hasData = item.value > 0;
              return (
                <div
                  key={index}
                  className="rounded flex flex-col items-center justify-center cursor-pointer transition-opacity hover:opacity-80"
                  style={{ 
                    aspectRatio: '1 / 0.95',
                    backgroundColor: hasData ? '#fffbeb' : themeColors.primaryMedium
                  }}
                  title={`${item.name}: ${item.value}人`}
                >
                  {/* 周数/月份 */}
                  <div 
                    className="text-[8px]"
                    style={{ color: hasData ? themeColors.primary : 'white' }}
                  >
                    {timePeriod === "week" ? `第${item.name}` : timePeriod === "month" ? `第${item.name}` : item.name}
                  </div>
                  {/* 日期范围（周和月维度显示） */}
                  {(timePeriod === "week" || timePeriod === "month") && (item as any).dateRange && (
                    <div 
                      className="text-[8px]"
                      style={{ color: hasData ? themeColors.primary : 'white' }}
                    >
                      {(item as any).dateRange}
                    </div>
                  )}
                  {/* 数据 */}
                  <div 
                    className="flex items-baseline gap-0.5"
                    style={{ color: hasData ? '#16a34a' : 'rgba(255,255,255,0.7)' }}
                  >
                    <span className="text-xl font-bold">{item.value}</span>
                    <span className="text-[8px]">人</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
  };

  return (
    <div className="p-2.5 space-y-4">
      {/* 每周新增人脉统计 */}
      <div className="bg-white rounded-lg p-2.5">
        {/* 标题 + 统计信息 */}
        <div className="flex items-center justify-between mb-4 flex-nowrap gap-2">
          <div className="flex items-center gap-1.5 flex-shrink-0 min-w-0">
            <div 
              className="w-1 h-5 rounded flex-shrink-0"
              style={{ backgroundColor: themeColors.primary }}
            ></div>
            <h2 className="font-medium whitespace-nowrap" style={{ fontSize: 'clamp(0.8rem, 3.8vw, 1.125rem)' }}>{titleText}</h2>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span 
              className="px-1.5 py-0.5 rounded whitespace-nowrap" 
              style={{ 
                fontSize: 'clamp(0.6rem, 2.8vw, 0.75rem)',
                backgroundColor: `${themeColors.secondary}20`,
                color: themeColors.secondary
              }}
            >
              {avgUnit}{avgValue}人
            </span>
            <span 
              className="px-1.5 py-0.5 rounded whitespace-nowrap" 
              style={{ 
                fontSize: 'clamp(0.6rem, 2.8vw, 0.75rem)',
                backgroundColor: `${themeColors.primary}15`,
                color: themeColors.primary
              }}
            >
              共计{totalCount}人
            </span>
          </div>
        </div>

        {/* 图表 */}
        {isLoading ? (
          <div className="h-[250px] flex items-center justify-center text-gray-400">
            加载中...
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[250px] flex items-center justify-center text-gray-400">
            暂无数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            {renderChart()}
          </ResponsiveContainer>
        )}

        {/* 按钮区域：时间维度 + 图表类型 */}
        <div className="mt-3 mb-3 flex items-center justify-between gap-3">
          {/* 时间维度切换按钮 */}
          <div className="flex bg-gray-100 rounded-lg overflow-hidden w-fit">
            <button
              onClick={() => setTimePeriod("day")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: timePeriod === "day" ? "white" : "transparent",
                color: timePeriod === "day" ? themeColors.primary : "#4b5563"
              }}
            >
              日
            </button>
            <button
              onClick={() => setTimePeriod("week")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: timePeriod === "week" ? "white" : "transparent",
                color: timePeriod === "week" ? themeColors.primary : "#4b5563"
              }}
            >
              周
            </button>
            <button
              onClick={() => setTimePeriod("month")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: timePeriod === "month" ? "white" : "transparent",
                color: timePeriod === "month" ? themeColors.primary : "#4b5563"
              }}
            >
              月
            </button>
          </div>

          {/* 图表类型切换按钮 */}
          <div className="flex bg-gray-100 rounded-lg overflow-hidden w-fit">
            <button
              onClick={() => setChartType("bar")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: chartType === "bar" ? "white" : "transparent",
                color: chartType === "bar" ? themeColors.primary : "#4b5563"
              }}
            >
              柱状图
            </button>
            <button
              onClick={() => setChartType("line")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: chartType === "line" ? "white" : "transparent",
                color: chartType === "line" ? themeColors.primary : "#4b5563"
              }}
            >
              折线图
            </button>
            <button
              onClick={() => setChartType("calendar")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: chartType === "calendar" ? "white" : "transparent",
                color: chartType === "calendar" ? themeColors.primary : "#4b5563"
              }}
            >
              日历图
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// 我的数据内容
function MyDataContent({ themeColors }: DataContentProps) {
  const [timePeriod, setTimePeriod] = useState<TimePeriodType>("week");
  const [chartType, setChartType] = useState<ChartType>("bar");

  // 使用API获取真实数据
  const { data: apiData, isLoading } = trpc.analytics.contactGrowthStats.useQuery({
    type: 'my',
    period: timePeriod,
  });

  // 处理API数据
  const chartData = useMemo(() => {
    if (!apiData) return [];
    return apiData;
  }, [apiData]);

  // 计算平均值
  const avgValue = useMemo(() => {
    const total = chartData.reduce((sum, item) => sum + item.value, 0);
    return (total / chartData.length).toFixed(1);
  }, [chartData]);

  // 获取标题文字和统计信息
  const periodText = timePeriod === "day" ? "天" : timePeriod === "week" ? "周" : "月";
  const titleText = `最近${timePeriod === "day" ? 30 : 12}${periodText}新增人脉（我的）`;
  const totalCount = useMemo(() => {
    return chartData.reduce((sum, item) => sum + item.value, 0);
  }, [chartData]);
  const avgUnit = timePeriod === "day" ? "日均" : timePeriod === "week" ? "周均" : "月均";

  // 渲染图表
  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 15, left: timePeriod === "day" ? 5 : -10, bottom: 5 }
    };

    const commonAxisProps = {
      xAxis: {
        dataKey: timePeriod === "day" ? "displayName" : "name",
        tick: { fontSize: 11, fill: '#6b7280' },
        stroke: "#9ca3af",
        interval: timePeriod === "day" ? 1 : 0
      },
      yAxis: {
        tick: { fontSize: 11, fill: '#6b7280' },
        stroke: "#9ca3af",
        width: 45,
        tickFormatter: (value: number) => `${value}人`,
        domain: [0, (dataMax: number) => Math.ceil(dataMax * 1.15)]
      },
      tooltip: {
        contentStyle: {
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          fontSize: '14px'
        },
        formatter: (value: any) => [`${value}人`, '新增人脉']
      }
    };

    if (chartType === "bar") {
      return (
        <BarChart {...commonProps} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis {...commonAxisProps.xAxis} />
          <YAxis {...commonAxisProps.yAxis} />
          <Tooltip {...commonAxisProps.tooltip} />
          <Bar 
            dataKey="value" 
            fill={themeColors.primary}
            radius={[4, 4, 0, 0]}
            animationBegin={0}
            animationDuration={1500}
            animationEasing="ease-out"
          >
            <LabelList 
              dataKey="value" 
              position="top" 
              style={{ fontSize: '12px', fill: '#6b7280', fontWeight: 500 }}
            />
          </Bar>
        </BarChart>
      );
    } else if (chartType === "line") {
      return (
        <LineChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis {...commonAxisProps.xAxis} />
          <YAxis {...commonAxisProps.yAxis} />
          <Tooltip {...commonAxisProps.tooltip} />
          <Line 
            type="monotone"
            dataKey="value" 
            stroke={themeColors.primary}
            strokeWidth={2}
            dot={{ fill: themeColors.primary, r: 4 }}
            activeDot={{ r: 6 }}
            animationBegin={0}
            animationDuration={1500}
            animationEasing="ease-out"
          >
            <LabelList 
              dataKey="value" 
              position="top" 
              style={{ fontSize: '12px', fill: '#6b7280', fontWeight: 500 }}
            />
          </Line>
        </LineChart>
      );
    } else {
      // 日历热力图
      const maxValue = Math.max(...chartData.map(d => d.value));
      
      // 根据时间维度设置列数
      const gridCols = timePeriod === "day" ? 7 : 4;
      const gridColsClass = timePeriod === "day" ? "grid-cols-7" : "grid-cols-4";
      
      // 星期标题（只在日维度显示）
      const weekHeaders = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      
      return (
        <div className="p-1.5 rounded-lg" style={{ backgroundColor: themeColors.primary }}>
          {/* 星期标题（只在日维度显示） */}
          {timePeriod === "day" && (
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {weekHeaders.map((day, i) => (
                <div key={i} className="text-center text-white text-[9px] py-0">{day}</div>
              ))}
            </div>
          )}
          {/* 日历格子 */}
          <div className={`grid ${gridColsClass} gap-0.5`}>
            {chartData.map((item, index) => {
              const hasData = item.value > 0;
              return (
                <div
                  key={index}
                  className="rounded flex flex-col items-center justify-center cursor-pointer transition-opacity hover:opacity-80"
                  style={{ 
                    aspectRatio: '1 / 0.95',
                    backgroundColor: hasData ? '#fffbeb' : themeColors.primaryMedium
                  }}
                  title={`${item.name}: ${item.value}人`}
                >
                  {/* 周数/月份 */}
                  <div 
                    className="text-[8px]"
                    style={{ color: hasData ? themeColors.primary : 'white' }}
                  >
                    {timePeriod === "week" ? `第${item.name}` : timePeriod === "month" ? `第${item.name}` : item.name}
                  </div>
                  {/* 日期范围（周和月维度显示） */}
                  {(timePeriod === "week" || timePeriod === "month") && (item as any).dateRange && (
                    <div 
                      className="text-[8px]"
                      style={{ color: hasData ? themeColors.primary : 'white' }}
                    >
                      {(item as any).dateRange}
                    </div>
                  )}
                  {/* 数据 */}
                  <div 
                    className="flex items-baseline gap-0.5"
                    style={{ color: hasData ? '#16a34a' : 'rgba(255,255,255,0.7)' }}
                  >
                    <span className="text-xl font-bold">{item.value}</span>
                    <span className="text-[8px]">人</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
  };

  return (
    <div className="p-2.5 space-y-4">
      {/* 每周新增人脉统计 */}
      <div className="bg-white rounded-lg p-2.5">
        {/* 标题 + 统计信息 */}
        <div className="flex items-center justify-between mb-4 flex-nowrap gap-2">
          <div className="flex items-center gap-1.5 flex-shrink-0 min-w-0">
            <div 
              className="w-1 h-5 rounded flex-shrink-0"
              style={{ backgroundColor: themeColors.primary }}
            ></div>
            <h2 className="font-medium whitespace-nowrap" style={{ fontSize: 'clamp(0.8rem, 3.8vw, 1.125rem)' }}>{titleText}</h2>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span 
              className="px-1.5 py-0.5 rounded whitespace-nowrap" 
              style={{ 
                fontSize: 'clamp(0.6rem, 2.8vw, 0.75rem)',
                backgroundColor: `${themeColors.secondary}20`,
                color: themeColors.secondary
              }}
            >
              {avgUnit}{avgValue}人
            </span>
            <span 
              className="px-1.5 py-0.5 rounded whitespace-nowrap" 
              style={{ 
                fontSize: 'clamp(0.6rem, 2.8vw, 0.75rem)',
                backgroundColor: `${themeColors.primary}15`,
                color: themeColors.primary
              }}
            >
              共计{totalCount}人
            </span>
          </div>
        </div>

        {/* 图表 */}
        {isLoading ? (
          <div className="h-[250px] flex items-center justify-center text-gray-400">
            加载中...
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[250px] flex items-center justify-center text-gray-400">
            暂无数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            {renderChart()}
          </ResponsiveContainer>
        )}

        {/* 按钮区域：时间维度 + 图表类型 */}
        <div className="mt-3 mb-3 flex items-center justify-between gap-3">
          {/* 时间维度切换按钮 */}
          <div className="flex bg-gray-100 rounded-lg overflow-hidden w-fit">
            <button
              onClick={() => setTimePeriod("day")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: timePeriod === "day" ? "white" : "transparent",
                color: timePeriod === "day" ? themeColors.primary : "#4b5563"
              }}
            >
              日
            </button>
            <button
              onClick={() => setTimePeriod("week")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: timePeriod === "week" ? "white" : "transparent",
                color: timePeriod === "week" ? themeColors.primary : "#4b5563"
              }}
            >
              周
            </button>
            <button
              onClick={() => setTimePeriod("month")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: timePeriod === "month" ? "white" : "transparent",
                color: timePeriod === "month" ? themeColors.primary : "#4b5563"
              }}
            >
              月
            </button>
          </div>

          {/* 图表类型切换按钮 */}
          <div className="flex bg-gray-100 rounded-lg overflow-hidden w-fit">
            <button
              onClick={() => setChartType("bar")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: chartType === "bar" ? "white" : "transparent",
                color: chartType === "bar" ? themeColors.primary : "#4b5563"
              }}
            >
              柱状图
            </button>
            <button
              onClick={() => setChartType("line")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: chartType === "line" ? "white" : "transparent",
                color: chartType === "line" ? themeColors.primary : "#4b5563"
              }}
            >
              折线图
            </button>
            <button
              onClick={() => setChartType("calendar")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: chartType === "calendar" ? "white" : "transparent",
                color: chartType === "calendar" ? themeColors.primary : "#4b5563"
              }}
            >
              日历图
            </button>
          </div>
        </div>


      </div>
    </div>
  );
}

// 共享数据内容
function SharedDataContent({ themeColors }: DataContentProps) {
  const [timePeriod, setTimePeriod] = useState<TimePeriodType>("week");
  const [chartType, setChartType] = useState<ChartType>("bar");

  // 使用API获取真实数据
  const { data: apiData, isLoading } = trpc.analytics.contactGrowthStats.useQuery({
    type: 'shared',
    period: timePeriod,
  });

  // 处理API数据
  const chartData = useMemo(() => {
    if (!apiData) return [];
    return apiData;
  }, [apiData]);

  // 计算平均值
  const avgValue = useMemo(() => {
    const total = chartData.reduce((sum, item) => sum + item.value, 0);
    return (total / chartData.length).toFixed(1);
  }, [chartData]);

  // 获取标题文字和统计信息
  const periodText = timePeriod === "day" ? "天" : timePeriod === "week" ? "周" : "月";
  const titleText = `最近${timePeriod === "day" ? 30 : 12}${periodText}新增人脉（共享）`;
  const totalCount = useMemo(() => {
    return chartData.reduce((sum, item) => sum + item.value, 0);
  }, [chartData]);
  const avgUnit = timePeriod === "day" ? "日均" : timePeriod === "week" ? "周均" : "月均";

  // 渲染图表
  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 15, left: timePeriod === "day" ? 5 : -10, bottom: 5 }
    };

    const commonAxisProps = {
      xAxis: {
        dataKey: timePeriod === "day" ? "displayName" : "name",
        tick: { fontSize: 11, fill: '#6b7280' },
        stroke: "#9ca3af",
        interval: timePeriod === "day" ? 1 : 0
      },
      yAxis: {
        tick: { fontSize: 11, fill: '#6b7280' },
        stroke: "#9ca3af",
        width: 45,
        tickFormatter: (value: number) => `${value}人`,
        domain: [0, (dataMax: number) => Math.ceil(dataMax * 1.15)]
      },
      tooltip: {
        contentStyle: {
          backgroundColor: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: '8px',
          fontSize: '14px'
        },
        formatter: (value: any) => [`${value}人`, '新增人脉']
      }
    };

    if (chartType === "bar") {
      return (
        <BarChart {...commonProps} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis {...commonAxisProps.xAxis} />
          <YAxis {...commonAxisProps.yAxis} />
          <Tooltip {...commonAxisProps.tooltip} />
          <Bar 
            dataKey="value" 
            fill={themeColors.primary}
            radius={[4, 4, 0, 0]}
            animationBegin={0}
            animationDuration={1500}
            animationEasing="ease-out"
          >
            <LabelList 
              dataKey="value" 
              position="top" 
              style={{ fontSize: '12px', fill: '#6b7280', fontWeight: 500 }}
            />
          </Bar>
        </BarChart>
      );
    } else if (chartType === "line") {
      return (
        <LineChart {...commonProps}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis {...commonAxisProps.xAxis} />
          <YAxis {...commonAxisProps.yAxis} />
          <Tooltip {...commonAxisProps.tooltip} />
          <Line 
            type="monotone"
            dataKey="value" 
            stroke={themeColors.primary}
            strokeWidth={2}
            dot={{ fill: themeColors.primary, r: 4 }}
            activeDot={{ r: 6 }}
            animationBegin={0}
            animationDuration={1500}
            animationEasing="ease-out"
          >
            <LabelList 
              dataKey="value" 
              position="top" 
              style={{ fontSize: '12px', fill: '#6b7280', fontWeight: 500 }}
            />
          </Line>
        </LineChart>
      );
    } else {
      // 日历热力图
      const maxValue = Math.max(...chartData.map(d => d.value));
      
      // 根据时间维度设置列数
      const gridCols = timePeriod === "day" ? 7 : 4;
      const gridColsClass = timePeriod === "day" ? "grid-cols-7" : "grid-cols-4";
      
      // 星期标题（只在日维度显示）
      const weekHeaders = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      
      return (
        <div className="p-1.5 rounded-lg" style={{ backgroundColor: themeColors.primary }}>
          {/* 星期标题（只在日维度显示） */}
          {timePeriod === "day" && (
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {weekHeaders.map((day, i) => (
                <div key={i} className="text-center text-white text-[9px] py-0">{day}</div>
              ))}
            </div>
          )}
          {/* 日历格子 */}
          <div className={`grid ${gridColsClass} gap-0.5`}>
            {chartData.map((item, index) => {
              const hasData = item.value > 0;
              return (
                <div
                  key={index}
                  className="rounded flex flex-col items-center justify-center cursor-pointer transition-opacity hover:opacity-80"
                  style={{ 
                    aspectRatio: '1 / 0.95',
                    backgroundColor: hasData ? '#fffbeb' : themeColors.primaryMedium
                  }}
                  title={`${item.name}: ${item.value}人`}
                >
                  {/* 周数/月份 */}
                  <div 
                    className="text-[8px]"
                    style={{ color: hasData ? themeColors.primary : 'white' }}
                  >
                    {timePeriod === "week" ? `第${item.name}` : timePeriod === "month" ? `第${item.name}` : item.name}
                  </div>
                  {/* 日期范围（周和月维度显示） */}
                  {(timePeriod === "week" || timePeriod === "month") && (item as any).dateRange && (
                    <div 
                      className="text-[8px]"
                      style={{ color: hasData ? themeColors.primary : 'white' }}
                    >
                      {(item as any).dateRange}
                    </div>
                  )}
                  {/* 数据 */}
                  <div 
                    className="flex items-baseline gap-0.5"
                    style={{ color: hasData ? '#16a34a' : 'rgba(255,255,255,0.7)' }}
                  >
                    <span className="text-xl font-bold">{item.value}</span>
                    <span className="text-[8px]">人</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
  };

  return (
    <div className="p-2.5 space-y-4">
      {/* 每周新增人脉统计 */}
      <div className="bg-white rounded-lg p-2.5">
        {/* 标题 + 统计信息 */}
        <div className="flex items-center justify-between mb-4 flex-nowrap gap-2">
          <div className="flex items-center gap-1.5 flex-shrink-0 min-w-0">
            <div 
              className="w-1 h-5 rounded flex-shrink-0"
              style={{ backgroundColor: themeColors.primary }}
            ></div>
            <h2 className="font-medium whitespace-nowrap" style={{ fontSize: 'clamp(0.8rem, 3.8vw, 1.125rem)' }}>{titleText}</h2>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span 
              className="px-1.5 py-0.5 rounded whitespace-nowrap" 
              style={{ 
                fontSize: 'clamp(0.6rem, 2.8vw, 0.75rem)',
                backgroundColor: `${themeColors.secondary}20`,
                color: themeColors.secondary
              }}
            >
              {avgUnit}{avgValue}人
            </span>
            <span 
              className="px-1.5 py-0.5 rounded whitespace-nowrap" 
              style={{ 
                fontSize: 'clamp(0.6rem, 2.8vw, 0.75rem)',
                backgroundColor: `${themeColors.primary}15`,
                color: themeColors.primary
              }}
            >
              共计{totalCount}人
            </span>
          </div>
        </div>

        {/* 图表 */}
        {isLoading ? (
          <div className="h-[250px] flex items-center justify-center text-gray-400">
            加载中...
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[250px] flex items-center justify-center text-gray-400">
            暂无数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            {renderChart()}
          </ResponsiveContainer>
        )}

        {/* 按钮区域：时间维度 + 图表类型 */}
        <div className="mt-3 mb-3 flex items-center justify-between gap-3">
          {/* 时间维度切换按钮 */}
          <div className="flex bg-gray-100 rounded-lg overflow-hidden w-fit">
            <button
              onClick={() => setTimePeriod("day")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: timePeriod === "day" ? "white" : "transparent",
                color: timePeriod === "day" ? themeColors.primary : "#4b5563"
              }}
            >
              日
            </button>
            <button
              onClick={() => setTimePeriod("week")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: timePeriod === "week" ? "white" : "transparent",
                color: timePeriod === "week" ? themeColors.primary : "#4b5563"
              }}
            >
              周
            </button>
            <button
              onClick={() => setTimePeriod("month")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: timePeriod === "month" ? "white" : "transparent",
                color: timePeriod === "month" ? themeColors.primary : "#4b5563"
              }}
            >
              月
            </button>
          </div>

          {/* 图表类型切换按钮 */}
          <div className="flex bg-gray-100 rounded-lg overflow-hidden w-fit">
            <button
              onClick={() => setChartType("bar")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: chartType === "bar" ? "white" : "transparent",
                color: chartType === "bar" ? themeColors.primary : "#4b5563"
              }}
            >
              柱状图
            </button>
            <button
              onClick={() => setChartType("line")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: chartType === "line" ? "white" : "transparent",
                color: chartType === "line" ? themeColors.primary : "#4b5563"
              }}
            >
              折线图
            </button>
            <button
              onClick={() => setChartType("calendar")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: chartType === "calendar" ? "white" : "transparent",
                color: chartType === "calendar" ? themeColors.primary : "#4b5563"
              }}
            >
              日历图
            </button>
          </div>
        </div>


      </div>
    </div>
  );
}
