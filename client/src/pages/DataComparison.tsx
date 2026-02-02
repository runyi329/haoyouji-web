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
  const [tableTab, setTableTab] = useState<TabType>("all"); // 第二个独立的标签状态
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
            <span className="font-medium">人脉资产负债表</span>
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
          <AllDataContent themeColors={themeColors} tableTab={tableTab} setTableTab={setTableTab} />
        )}
        {activeTab === "my" && (
          <MyDataContent themeColors={themeColors} tableTab={tableTab} setTableTab={setTableTab} />
        )}
        {activeTab === "shared" && (
          <SharedDataContent themeColors={themeColors} tableTab={tableTab} setTableTab={setTableTab} />
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
  tableTab: TabType;
  setTableTab: (tab: TabType) => void;
}

// 全部数据内容
function AllDataContent({ themeColors, tableTab, setTableTab }: DataContentProps) {
  const [timePeriod, setTimePeriod] = useState<TimePeriodType>("week");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [tableType, setTableType] = useState<"health" | "activity" | "importance">("activity");

  // 使用API获取真实数据
  const { data: apiData, isLoading } = trpc.analytics.contactGrowthStats.useQuery({
    type: 'all',
    period: timePeriod,
  });

  // 获取人脉互动分层统计数据 - 使用tableTab状态
  const { data: layerData, isLoading: layerLoading } = trpc.analytics.contactLayerStats.useQuery({
    type: tableTab,
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
        tick: { fontSize: 10, fill: '#6b7280' },
        stroke: "#9ca3af",
        width: 50,
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

    // 日维度时只显示非零值的标签，避免重叠
    const renderLabel = (props: any) => {
      const { x, y, width, value } = props;
      if (timePeriod === 'day' && value === 0) return null;
      return (
        <text 
          x={x + width / 2} 
          y={y - 5} 
          fill="#6b7280" 
          textAnchor="middle" 
          fontSize={timePeriod === 'day' ? 9 : 12}
          fontWeight={500}
        >
          {value}
        </text>
      );
    };

    if (chartType === "bar") {
      return (
        <BarChart {...commonProps} barCategoryGap={timePeriod === 'day' ? '5%' : '20%'}>
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
              content={renderLabel}
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
            dot={timePeriod === 'day' ? false : { fill: themeColors.primary, r: 4 }}
            activeDot={{ r: 6 }}
            animationBegin={0}
            animationDuration={1500}
            animationEasing="ease-out"
          >
            {timePeriod !== 'day' && (
              <LabelList 
                dataKey="value" 
                position="top" 
                style={{ fontSize: '12px', fill: '#6b7280', fontWeight: 500 }}
              />
            )}
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
                    <span 
                      className="font-bold"
                      style={{
                        fontSize: item.value >= 100 ? 'clamp(0.9rem, 4vw, 1.1rem)' : 'clamp(1rem, 5vw, 1.25rem)'
                      }}
                    >
                      {item.value}
                    </span>
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

      {/* 互动与关系健康度 - 完整标题栏 */}
      <div 
        className="text-white -mx-2.5 mb-2.5"
        style={{ 
          background: `linear-gradient(to right, ${themeColors.primary}, ${themeColors.secondary})` 
        }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <span className="font-medium">互动与关系健康度</span>
          </div>
                    {/* 标签页切换 */}
          <div className="flex bg-white/20 rounded-lg overflow-hidden">
            <button
              onClick={() => setTableTab("all")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: tableTab === "all" ? "white" : "transparent",
                color: tableTab === "all" ? themeColors.primary : "white"
              }}
            >
              全部
            </button>
            <button
              onClick={() => setTableTab("my")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: tableTab === "my" ? "white" : "transparent",
                color: tableTab === "my" ? themeColors.primary : "white"
              }}
            >
              我的
            </button>
            <button
              onClick={() => setTableTab("shared")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: tableTab === "shared" ? "white" : "transparent",
                color: tableTab === "shared" ? themeColors.primary : "white"
              }}
            >
              共享
            </button>
          </div>
        </div>
      </div>

      {/* 人脉互动分层统计表 */}
      <div className="bg-white rounded-lg p-2.5">
        {/* 标题和切换按钮 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <div 
              className="w-1 h-5 rounded flex-shrink-0"
              style={{ backgroundColor: themeColors.primary }}
            ></div>
            <h2 className="font-medium" style={{ fontSize: 'clamp(0.8rem, 3.8vw, 1.125rem)' }}>人脉互动分层统计表</h2>
          </div>
          {/* 表格类型切换按钮 */}
          <div className="flex bg-gray-100 rounded-lg overflow-hidden w-fit">
            <button
              onClick={() => setTableType("health")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: tableType === "health" ? "white" : "transparent",
                color: tableType === "health" ? themeColors.primary : "#4b5563"
              }}
            >
              健康度
            </button>
            <button
              onClick={() => setTableType("activity")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: tableType === "activity" ? "white" : "transparent",
                color: tableType === "activity" ? themeColors.primary : "#4b5563"
              }}
            >
              活跃度
            </button>
            <button
              onClick={() => setTableType("importance")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: tableType === "importance" ? "white" : "transparent",
                color: tableType === "importance" ? themeColors.primary : "#4b5563"
              }}
            >
              重要度
            </button>
          </div>
        </div>
        {tableType === "activity" && (

          <>

            {layerLoading ? (

              <div className="text-center py-8 text-gray-400">加载中...</div>

            ) : layerData ? (
        <div className="overflow-x-auto -mx-2.5 px-2.5">
          <table className="w-full border-collapse" style={{ fontSize: 'clamp(0.7rem, 3.2vw, 0.875rem)', border: '1px solid #e5e7eb' }}>
          <thead>
            <tr className="border-b-2" style={{ borderColor: themeColors.primary, backgroundColor: '#f3f4f6' }}>
              <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>关系层级</th>
              <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>人数</th>
              <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>占比</th>
              <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>频率</th>
              <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>建议行动</th>
            </tr>
          </thead>
          <tbody>
            {layerData.layers.map((layer: any, index: number) => {
              const layerConfig: any = {
                '活跃层': { color: themeColors.primary, action: '维持现状', actionColor: 'text-green-600', days: '≤7天' },
                '常温层': { color: themeColors.secondary, action: '本月需联系', actionColor: 'text-orange-600', days: '8-30天' },
                '低温层': { color: '#f97316', action: '季度内激活', actionColor: 'text-red-600', days: '31-90天' },
                '失联层': { color: '#dc2626', action: '制定激活计划', actionColor: 'text-red-700 font-medium', days: '>180天' },
              };
              const config = layerConfig[layer.layer] || {};
              
              return (
                <tr key={index} className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">
                    <div className="font-medium" style={{ color: config.color || themeColors.text }}>{layer.layer}</div>
                    <div className="text-xs text-gray-500">{config.days}</div>
                  </td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">{layer.count}</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">{layer.percentage}%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">{layer.avgDays}天</td>
                  <td className={`text-center py-2 px-1.5 border border-gray-200 align-middle ${config.actionColor || ''}`}>{config.action || ''}</td>
                </tr>
              );
            })}
            <tr className="font-bold" style={{ backgroundColor: `${themeColors.primary}10` }}>
              <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>总计</td>
              <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>{layerData.total}</td>
              <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>100%</td>
              <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>{layerData.totalAvgDays}天</td>
              <td className="py-2 px-1.5 border border-gray-200 align-middle"></td>
            </tr>
          </tbody>
        </table>
        </div>
        ) : (

          <div className="text-center py-8 text-gray-400">暂无数据</div>

        )}

          </>

        )}

        {tableType === "health" && (
          <div className="overflow-x-auto -mx-2.5 px-2.5">
            <table className="w-full border-collapse" style={{ fontSize: 'clamp(0.7rem, 3.2vw, 0.875rem)', border: '1px solid #e5e7eb' }}>
              <thead>
                <tr className="border-b-2" style={{ borderColor: themeColors.primary, backgroundColor: '#f3f4f6' }}>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>指标</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>数值</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>趋势</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>健康状态</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">30天互动率</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">68% (340/500人)</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-green-600">↑ 5%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-green-600">良好</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">平均互动频率</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">每45天一次</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-orange-600">↓ 3天</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-orange-600">注意</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">失联人脉数</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">120人 (24%)</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-green-600">↓ 8人</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-orange-600">待改善</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">待跟进承诺数</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">47项</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-red-600">↑ 12项</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-red-600">预警</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">高价值互动占比</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">35%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-green-600">↑ 8%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-green-600">优秀</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {tableType === "importance" && (
          <div className="overflow-x-auto -mx-2.5 px-2.5">
            <table className="w-full border-collapse" style={{ fontSize: 'clamp(0.7rem, 3.2vw, 0.875rem)', border: '1px solid #e5e7eb' }}>
              <thead>
                <tr className="border-b-2" style={{ borderColor: themeColors.primary, backgroundColor: '#f3f4f6' }}>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>互动类型</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>次数</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>占比</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>平均重要性</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">会议/见面</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">85</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">28%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">4.2</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-green-600">高质量互动</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">电话沟通</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">120</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">40%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">3.1</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">主要沟通方式</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">消息往来</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">65</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">22%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">2.5</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">轻量维护</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">添加备注</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">30</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">10%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">3.8</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">信息更新</td>
                </tr>
                <tr className="font-bold" style={{ backgroundColor: `${themeColors.primary}10` }}>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>总计</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>300</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>100%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>3.4</td>
                  <td className="py-2 px-1.5 border border-gray-200 align-middle"></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// 我的数据内容
function MyDataContent({ themeColors, tableTab, setTableTab }: DataContentProps) {
  const [timePeriod, setTimePeriod] = useState<TimePeriodType>("week");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [tableType, setTableType] = useState<"health" | "activity" | "importance">("activity");

  // 使用API获取真实数据
  const { data: apiData, isLoading } = trpc.analytics.contactGrowthStats.useQuery({
    type: 'my',
    period: timePeriod,
  });

  // 获取人脉互动分层统计数据 - 使用tableTab状态
  const { data: layerData, isLoading: layerLoading } = trpc.analytics.contactLayerStats.useQuery({
    type: tableTab,
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
        tick: { fontSize: 10, fill: '#6b7280' },
        stroke: "#9ca3af",
        width: 50,
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

    // 日维度时只显示非零值的标签，避免重叠
    const renderLabel = (props: any) => {
      const { x, y, width, value } = props;
      if (timePeriod === 'day' && value === 0) return null;
      return (
        <text 
          x={x + width / 2} 
          y={y - 5} 
          fill="#6b7280" 
          textAnchor="middle" 
          fontSize={timePeriod === 'day' ? 9 : 12}
          fontWeight={500}
        >
          {value}
        </text>
      );
    };

    if (chartType === "bar") {
      return (
        <BarChart {...commonProps} barCategoryGap={timePeriod === 'day' ? '5%' : '20%'}>
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
              content={renderLabel}
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
            dot={timePeriod === 'day' ? false : { fill: themeColors.primary, r: 4 }}
            activeDot={{ r: 6 }}
            animationBegin={0}
            animationDuration={1500}
            animationEasing="ease-out"
          >
            {timePeriod !== 'day' && (
              <LabelList 
                dataKey="value" 
                position="top" 
                style={{ fontSize: '12px', fill: '#6b7280', fontWeight: 500 }}
              />
            )}
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
                    <span 
                      className="font-bold"
                      style={{
                        fontSize: item.value >= 100 ? 'clamp(0.9rem, 4vw, 1.1rem)' : 'clamp(1rem, 5vw, 1.25rem)'
                      }}
                    >
                      {item.value}
                    </span>
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

      {/* 互动与关系健康度 - 完整标题栏 */}
      <div 
        className="text-white -mx-2.5 mb-2.5"
        style={{ 
          background: `linear-gradient(to right, ${themeColors.primary}, ${themeColors.secondary})` 
        }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <span className="font-medium">互动与关系健康度</span>
          </div>
                    {/* 标签页切换 */}
          <div className="flex bg-white/20 rounded-lg overflow-hidden">
            <button
              onClick={() => setTableTab("all")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: tableTab === "all" ? "white" : "transparent",
                color: tableTab === "all" ? themeColors.primary : "white"
              }}
            >
              全部
            </button>
            <button
              onClick={() => setTableTab("my")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: tableTab === "my" ? "white" : "transparent",
                color: tableTab === "my" ? themeColors.primary : "white"
              }}
            >
              我的
            </button>
            <button
              onClick={() => setTableTab("shared")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: tableTab === "shared" ? "white" : "transparent",
                color: tableTab === "shared" ? themeColors.primary : "white"
              }}
            >
              共享
            </button>
          </div>
        </div>
      </div>

      {/* 人脉互动分层统计表 */}
      <div className="bg-white rounded-lg p-2.5">
        {/* 标题和切换按钮 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <div 
              className="w-1 h-5 rounded flex-shrink-0"
              style={{ backgroundColor: themeColors.primary }}
            ></div>
            <h2 className="font-medium" style={{ fontSize: 'clamp(0.8rem, 3.8vw, 1.125rem)' }}>人脉互动分层统计表</h2>
          </div>
          {/* 表格类型切换按钮 */}
          <div className="flex bg-gray-100 rounded-lg overflow-hidden w-fit">
            <button
              onClick={() => setTableType("health")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: tableType === "health" ? "white" : "transparent",
                color: tableType === "health" ? themeColors.primary : "#4b5563"
              }}
            >
              健康度
            </button>
            <button
              onClick={() => setTableType("activity")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: tableType === "activity" ? "white" : "transparent",
                color: tableType === "activity" ? themeColors.primary : "#4b5563"
              }}
            >
              活跃度
            </button>
            <button
              onClick={() => setTableType("importance")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: tableType === "importance" ? "white" : "transparent",
                color: tableType === "importance" ? themeColors.primary : "#4b5563"
              }}
            >
              重要度
            </button>
          </div>
        </div>
        {tableType === "activity" && (

          <>

            {layerLoading ? (

              <div className="text-center py-8 text-gray-400">加载中...</div>

            ) : layerData ? (
        <div className="overflow-x-auto -mx-2.5 px-2.5">
          <table className="w-full border-collapse" style={{ fontSize: 'clamp(0.7rem, 3.2vw, 0.875rem)', border: '1px solid #e5e7eb' }}>
          <thead>
            <tr className="border-b-2" style={{ borderColor: themeColors.primary, backgroundColor: '#f3f4f6' }}>
              <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>关系层级</th>
              <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>人数</th>
              <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>占比</th>
              <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>频率</th>
              <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>建议行动</th>
            </tr>
          </thead>
          <tbody>
            {layerData.layers.map((layer: any, index: number) => {
              const layerConfig: any = {
                '活跃层': { color: themeColors.primary, action: '维持现状', actionColor: 'text-green-600', days: '≤7天' },
                '常温层': { color: themeColors.secondary, action: '本月需联系', actionColor: 'text-orange-600', days: '8-30天' },
                '低温层': { color: '#f97316', action: '季度内激活', actionColor: 'text-red-600', days: '31-90天' },
                '失联层': { color: '#dc2626', action: '制定激活计划', actionColor: 'text-red-700 font-medium', days: '>180天' },
              };
              const config = layerConfig[layer.layer] || {};
              
              return (
                <tr key={index} className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">
                    <div className="font-medium" style={{ color: config.color || themeColors.text }}>{layer.layer}</div>
                    <div className="text-xs text-gray-500">{config.days}</div>
                  </td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">{layer.count}</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">{layer.percentage}%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">{layer.avgDays}天</td>
                  <td className={`text-center py-2 px-1.5 border border-gray-200 align-middle ${config.actionColor || ''}`}>{config.action || ''}</td>
                </tr>
              );
            })}
            <tr className="font-bold" style={{ backgroundColor: `${themeColors.primary}10` }}>
              <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>总计</td>
              <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>{layerData.total}</td>
              <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>100%</td>
              <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>{layerData.totalAvgDays}天</td>
              <td className="py-2 px-1.5 border border-gray-200 align-middle"></td>
            </tr>
          </tbody>
        </table>
        </div>
        ) : (

          <div className="text-center py-8 text-gray-400">暂无数据</div>

        )}

          </>

        )}

        {tableType === "health" && (
          <div className="overflow-x-auto -mx-2.5 px-2.5">
            <table className="w-full border-collapse" style={{ fontSize: 'clamp(0.7rem, 3.2vw, 0.875rem)', border: '1px solid #e5e7eb' }}>
              <thead>
                <tr className="border-b-2" style={{ borderColor: themeColors.primary, backgroundColor: '#f3f4f6' }}>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>指标</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>数值</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>趋势</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>健康状态</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">30天互动率</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">68% (340/500人)</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-green-600">↑ 5%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-green-600">良好</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">平均互动频率</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">每45天一次</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-orange-600">↓ 3天</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-orange-600">注意</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">失联人脉数</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">120人 (24%)</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-green-600">↓ 8人</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-orange-600">待改善</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">待跟进承诺数</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">47项</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-red-600">↑ 12项</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-red-600">预警</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">高价值互动占比</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">35%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-green-600">↑ 8%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-green-600">优秀</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {tableType === "importance" && (
          <div className="overflow-x-auto -mx-2.5 px-2.5">
            <table className="w-full border-collapse" style={{ fontSize: 'clamp(0.7rem, 3.2vw, 0.875rem)', border: '1px solid #e5e7eb' }}>
              <thead>
                <tr className="border-b-2" style={{ borderColor: themeColors.primary, backgroundColor: '#f3f4f6' }}>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>互动类型</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>次数</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>占比</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>平均重要性</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">会议/见面</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">85</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">28%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">4.2</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-green-600">高质量互动</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">电话沟通</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">120</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">40%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">3.1</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">主要沟通方式</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">消息往来</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">65</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">22%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">2.5</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">轻量维护</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">添加备注</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">30</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">10%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">3.8</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">信息更新</td>
                </tr>
                <tr className="font-bold" style={{ backgroundColor: `${themeColors.primary}10` }}>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>总计</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>300</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>100%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>3.4</td>
                  <td className="py-2 px-1.5 border border-gray-200 align-middle"></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// 共享数据内容
function SharedDataContent({ themeColors, tableTab, setTableTab }: DataContentProps) {
  const [timePeriod, setTimePeriod] = useState<TimePeriodType>("week");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [tableType, setTableType] = useState<"health" | "activity" | "importance">("activity");

  // 使用API获取真实数据
  const { data: apiData, isLoading } = trpc.analytics.contactGrowthStats.useQuery({
    type: 'shared',
    period: timePeriod,
  });

  // 获取人脉互动分层统计数据 - 使用tableTab状态
  const { data: layerData, isLoading: layerLoading } = trpc.analytics.contactLayerStats.useQuery({
    type: tableTab,
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
        tick: { fontSize: 10, fill: '#6b7280' },
        stroke: "#9ca3af",
        width: 50,
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

    // 日维度时只显示非零值的标签，避免重叠
    const renderLabel = (props: any) => {
      const { x, y, width, value } = props;
      if (timePeriod === 'day' && value === 0) return null;
      return (
        <text 
          x={x + width / 2} 
          y={y - 5} 
          fill="#6b7280" 
          textAnchor="middle" 
          fontSize={timePeriod === 'day' ? 9 : 12}
          fontWeight={500}
        >
          {value}
        </text>
      );
    };

    if (chartType === "bar") {
      return (
        <BarChart {...commonProps} barCategoryGap={timePeriod === 'day' ? '5%' : '20%'}>
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
              content={renderLabel}
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
            dot={timePeriod === 'day' ? false : { fill: themeColors.primary, r: 4 }}
            activeDot={{ r: 6 }}
            animationBegin={0}
            animationDuration={1500}
            animationEasing="ease-out"
          >
            {timePeriod !== 'day' && (
              <LabelList 
                dataKey="value" 
                position="top" 
                style={{ fontSize: '12px', fill: '#6b7280', fontWeight: 500 }}
              />
            )}
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
                    <span 
                      className="font-bold"
                      style={{
                        fontSize: item.value >= 100 ? 'clamp(0.9rem, 4vw, 1.1rem)' : 'clamp(1rem, 5vw, 1.25rem)'
                      }}
                    >
                      {item.value}
                    </span>
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

      {/* 互动与关系健康度 - 完整标题栏 */}
      <div 
        className="text-white -mx-2.5 mb-2.5"
        style={{ 
          background: `linear-gradient(to right, ${themeColors.primary}, ${themeColors.secondary})` 
        }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <span className="font-medium">互动与关系健康度</span>
          </div>
                    {/* 标签页切换 */}
          <div className="flex bg-white/20 rounded-lg overflow-hidden">
            <button
              onClick={() => setTableTab("all")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: tableTab === "all" ? "white" : "transparent",
                color: tableTab === "all" ? themeColors.primary : "white"
              }}
            >
              全部
            </button>
            <button
              onClick={() => setTableTab("my")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: tableTab === "my" ? "white" : "transparent",
                color: tableTab === "my" ? themeColors.primary : "white"
              }}
            >
              我的
            </button>
            <button
              onClick={() => setTableTab("shared")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: tableTab === "shared" ? "white" : "transparent",
                color: tableTab === "shared" ? themeColors.primary : "white"
              }}
            >
              共享
            </button>
          </div>
        </div>
      </div>

      {/* 人脉互动分层统计表 */}
      <div className="bg-white rounded-lg p-2.5">
        {/* 标题和切换按钮 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <div 
              className="w-1 h-5 rounded flex-shrink-0"
              style={{ backgroundColor: themeColors.primary }}
            ></div>
            <h2 className="font-medium" style={{ fontSize: 'clamp(0.8rem, 3.8vw, 1.125rem)' }}>人脉互动分层统计表</h2>
          </div>
          {/* 表格类型切换按钮 */}
          <div className="flex bg-gray-100 rounded-lg overflow-hidden w-fit">
            <button
              onClick={() => setTableType("health")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: tableType === "health" ? "white" : "transparent",
                color: tableType === "health" ? themeColors.primary : "#4b5563"
              }}
            >
              健康度
            </button>
            <button
              onClick={() => setTableType("activity")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: tableType === "activity" ? "white" : "transparent",
                color: tableType === "activity" ? themeColors.primary : "#4b5563"
              }}
            >
              活跃度
            </button>
            <button
              onClick={() => setTableType("importance")}
              className="px-3 py-1 text-sm"
              style={{ 
                backgroundColor: tableType === "importance" ? "white" : "transparent",
                color: tableType === "importance" ? themeColors.primary : "#4b5563"
              }}
            >
              重要度
            </button>
          </div>
        </div>
        {tableType === "activity" && (

          <>

            {layerLoading ? (

              <div className="text-center py-8 text-gray-400">加载中...</div>

            ) : layerData ? (
        <div className="overflow-x-auto -mx-2.5 px-2.5">
          <table className="w-full border-collapse" style={{ fontSize: 'clamp(0.7rem, 3.2vw, 0.875rem)', border: '1px solid #e5e7eb' }}>
          <thead>
            <tr className="border-b-2" style={{ borderColor: themeColors.primary, backgroundColor: '#f3f4f6' }}>
              <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>关系层级</th>
              <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>人数</th>
              <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>占比</th>
              <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>频率</th>
              <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>建议行动</th>
            </tr>
          </thead>
          <tbody>
            {layerData.layers.map((layer: any, index: number) => {
              const layerConfig: any = {
                '活跃层': { color: themeColors.primary, action: '维持现状', actionColor: 'text-green-600', days: '≤7天' },
                '常温层': { color: themeColors.secondary, action: '本月需联系', actionColor: 'text-orange-600', days: '8-30天' },
                '低温层': { color: '#f97316', action: '季度内激活', actionColor: 'text-red-600', days: '31-90天' },
                '失联层': { color: '#dc2626', action: '制定激活计划', actionColor: 'text-red-700 font-medium', days: '>180天' },
              };
              const config = layerConfig[layer.layer] || {};
              
              return (
                <tr key={index} className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">
                    <div className="font-medium" style={{ color: config.color || themeColors.text }}>{layer.layer}</div>
                    <div className="text-xs text-gray-500">{config.days}</div>
                  </td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">{layer.count}</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">{layer.percentage}%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">{layer.avgDays}天</td>
                  <td className={`text-center py-2 px-1.5 border border-gray-200 align-middle ${config.actionColor || ''}`}>{config.action || ''}</td>
                </tr>
              );
            })}
            <tr className="font-bold" style={{ backgroundColor: `${themeColors.primary}10` }}>
              <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>总计</td>
              <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>{layerData.total}</td>
              <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>100%</td>
              <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>{layerData.totalAvgDays}天</td>
              <td className="py-2 px-1.5 border border-gray-200 align-middle"></td>
            </tr>
          </tbody>
        </table>
        </div>
        ) : (

          <div className="text-center py-8 text-gray-400">暂无数据</div>

        )}

          </>

        )}

        {tableType === "health" && (
          <div className="overflow-x-auto -mx-2.5 px-2.5">
            <table className="w-full border-collapse" style={{ fontSize: 'clamp(0.7rem, 3.2vw, 0.875rem)', border: '1px solid #e5e7eb' }}>
              <thead>
                <tr className="border-b-2" style={{ borderColor: themeColors.primary, backgroundColor: '#f3f4f6' }}>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>指标</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>数值</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>趋势</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>健康状态</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">30天互动率</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">68% (340/500人)</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-green-600">↑ 5%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-green-600">良好</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">平均互动频率</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">每45天一次</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-orange-600">↓ 3天</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-orange-600">注意</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">失联人脉数</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">120人 (24%)</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-green-600">↓ 8人</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-orange-600">待改善</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">待跟进承诺数</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">47项</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-red-600">↑ 12项</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-red-600">预警</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">高价值互动占比</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">35%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-green-600">↑ 8%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-green-600">优秀</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {tableType === "importance" && (
          <div className="overflow-x-auto -mx-2.5 px-2.5">
            <table className="w-full border-collapse" style={{ fontSize: 'clamp(0.7rem, 3.2vw, 0.875rem)', border: '1px solid #e5e7eb' }}>
              <thead>
                <tr className="border-b-2" style={{ borderColor: themeColors.primary, backgroundColor: '#f3f4f6' }}>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>互动类型</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>次数</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>占比</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>平均重要性</th>
                  <th className="text-center py-1.5 px-1.5 font-semibold border border-gray-200 align-middle" style={{ color: themeColors.text }}>说明</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">会议/见面</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">85</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">28%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">4.2</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle text-green-600">高质量互动</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">电话沟通</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">120</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">40%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">3.1</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">主要沟通方式</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">消息往来</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">65</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">22%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">2.5</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">轻量维护</td>
                </tr>
                <tr className="border-b hover:bg-gray-50">
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">添加备注</td>
                  <td className="text-center py-2 px-1.5 font-medium border border-gray-200 align-middle">30</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">10%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">3.8</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle">信息更新</td>
                </tr>
                <tr className="font-bold" style={{ backgroundColor: `${themeColors.primary}10` }}>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>总计</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>300</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>100%</td>
                  <td className="text-center py-2 px-1.5 border border-gray-200 align-middle" style={{ color: themeColors.primary }}>3.4</td>
                  <td className="py-2 px-1.5 border border-gray-200 align-middle"></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
