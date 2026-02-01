import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList
} from 'recharts';
import { trpc } from "@/lib/trpc";

type TabType = "all" | "my" | "shared";
type TimePeriodType = "day" | "week" | "month";
type ChartType = "bar" | "line" | "calendar";

export default function DataComparison() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>("all");

  return (
    <div className="min-h-screen flex flex-col">
      {/* 顶部导航区 - 蓝色渐变背景 */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
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
              className={`px-3 py-1 text-sm ${ 
                activeTab === "all"
                  ? "bg-white text-blue-600" 
                  : "text-white"
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setActiveTab("my")}
              className={`px-3 py-1 text-sm ${
                activeTab === "my" 
                  ? "bg-white text-blue-600" 
                  : "text-white"
              }`}
            >
              我的
            </button>
            <button
              onClick={() => setActiveTab("shared")}
              className={`px-3 py-1 text-sm ${
                activeTab === "shared" 
                  ? "bg-white text-blue-600" 
                  : "text-white"
              }`}
            >
              共享
            </button>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 bg-gray-50 overflow-auto">
        {activeTab === "all" && (
          <AllDataContent />
        )}
        {activeTab === "my" && (
          <MyDataContent />
        )}
        {activeTab === "shared" && (
          <SharedDataContent />
        )}
      </div>
    </div>
  );
}

// 全部数据内容
function AllDataContent() {
  const [timePeriod, setTimePeriod] = useState<TimePeriodType>("week");
  const [chartType, setChartType] = useState<ChartType>("bar");

  // 根据时间维度生成数据
  const chartData = useMemo(() => {
    const data = [];
    const count = 12;
    
    if (timePeriod === "day") {
      for (let i = 1; i <= 30; i++) {
        data.push({
          name: `${i}天`,
          value: Math.floor(Math.random() * 10) + 1,
        });
      }
    } else if (timePeriod === "week") {
      for (let i = 1; i <= count; i++) {
        data.push({
          name: `${i}周`,
          value: i === 6 ? 100 : Math.floor(Math.random() * 25) + 5,
        });
      }
    } else {
      for (let i = 1; i <= count; i++) {
        data.push({
          name: `${i}月`,
          value: Math.floor(Math.random() * 50) + 20,
        });
      }
    }
    return data;
  }, [timePeriod]);

  // 计算平均值
  const avgValue = useMemo(() => {
    const total = chartData.reduce((sum, item) => sum + item.value, 0);
    return (total / chartData.length).toFixed(1);
  }, [chartData]);

  // 获取标题文字
  const periodText = timePeriod === "day" ? "天" : timePeriod === "week" ? "周" : "月";
  const titleText = `最近${timePeriod === "day" ? 30 : 12}${periodText}新增人脉`;
  const avgText = `${timePeriod === "day" ? 30 : 12}${periodText}平均新增`;

  // 渲染图表
  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 5, left: 5, bottom: 5 }
    };

    const commonAxisProps = {
      xAxis: {
        dataKey: "name",
        tick: { fontSize: 11, fill: '#6b7280' },
        stroke: "#9ca3af",
        interval: 0
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
            fill="#8b5cf6" 
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
            stroke="#8b5cf6" 
            strokeWidth={2}
            dot={{ fill: '#8b5cf6', r: 4 }}
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
      
      return (
        <div className="bg-purple-600 p-1.5 rounded-lg">
          {/* 星期标题 */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((day, i) => (
              <div key={i} className="text-center text-white text-[9px] py-0">{day}</div>
            ))}
          </div>
          {/* 日历格子 */}
          <div className="grid grid-cols-7 gap-0.5">
            {chartData.map((item, index) => {
              const hasData = item.value > 0;
              return (
                <div
                  key={index}
                  className={`rounded flex flex-col items-center justify-center cursor-pointer transition-opacity hover:opacity-80 ${
                    hasData ? 'bg-amber-50' : 'bg-purple-700/50'
                  }`}
                  style={{ aspectRatio: '1 / 0.8' }}
                  title={`${item.name}: ${item.value}人`}
                >
                  <div className={`text-xs font-bold ${
                    hasData ? 'text-purple-600' : 'text-white'
                  }`}>
                    {index + 1}
                  </div>
                  <div className={`text-[9px] ${
                    hasData ? 'text-green-600 font-medium' : 'text-white/70'
                  }`}>
                    {item.value}
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
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-6 bg-purple-600 rounded"></div>
          <h2 className="text-lg font-medium">{titleText}</h2>
        </div>

        {/* 图表 */}
        <ResponsiveContainer width="100%" height={250}>
          {renderChart()}
        </ResponsiveContainer>

        {/* 按钮区域：时间维度 + 图表类型 */}
        <div className="mt-3 mb-3 flex items-center justify-between gap-3">
          {/* 时间维度切换按钮 */}
          <div className="flex bg-gray-100 rounded-lg overflow-hidden w-fit">
            <button
              onClick={() => setTimePeriod("day")}
              className={`px-3 py-1 text-sm ${
                timePeriod === "day"
                  ? "bg-white text-purple-600" 
                  : "text-gray-600"
              }`}
            >
              日
            </button>
            <button
              onClick={() => setTimePeriod("week")}
              className={`px-3 py-1 text-sm ${
                timePeriod === "week" 
                  ? "bg-white text-purple-600" 
                  : "text-gray-600"
              }`}
            >
              周
            </button>
            <button
              onClick={() => setTimePeriod("month")}
              className={`px-3 py-1 text-sm ${
                timePeriod === "month" 
                  ? "bg-white text-purple-600" 
                  : "text-gray-600"
              }`}
            >
              月
            </button>
          </div>

          {/* 图表类型切换按钮 */}
          <div className="flex bg-gray-100 rounded-lg overflow-hidden w-fit">
            <button
              onClick={() => setChartType("bar")}
              className={`px-3 py-1 text-sm ${
                chartType === "bar"
                  ? "bg-white text-purple-600" 
                  : "text-gray-600"
              }`}
            >
              柱状图
            </button>
            <button
              onClick={() => setChartType("line")}
              className={`px-3 py-1 text-sm ${
                chartType === "line" 
                  ? "bg-white text-purple-600" 
                  : "text-gray-600"
              }`}
            >
              折线图
            </button>
            <button
              onClick={() => setChartType("calendar")}
              className={`px-3 py-1 text-sm ${
                chartType === "calendar"
                  ? "bg-white text-purple-600" 
                  : "text-gray-600"
              }`}
            >
              日历图
            </button>
          </div>
        </div>

        {/* 统计数据 */}
        <div className="pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">{avgText}</span>
            <span className="text-lg font-medium text-purple-600">{avgValue}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 我的数据内容
function MyDataContent() {
  const [timePeriod, setTimePeriod] = useState<TimePeriodType>("week");
  const [chartType, setChartType] = useState<ChartType>("bar");

  // 根据时间维度生成数据
  const chartData = useMemo(() => {
    const data = [];
    const count = 12;
    
    if (timePeriod === "day") {
      for (let i = 1; i <= 30; i++) {
        data.push({
          name: `${i}天`,
          value: Math.floor(Math.random() * 8) + 1,
        });
      }
    } else if (timePeriod === "week") {
      for (let i = 1; i <= count; i++) {
        data.push({
          name: `${i}周`,
          value: Math.floor(Math.random() * 15) + 3,
        });
      }
    } else {
      for (let i = 1; i <= count; i++) {
        data.push({
          name: `${i}月`,
          value: Math.floor(Math.random() * 40) + 15,
        });
      }
    }
    return data;
  }, [timePeriod]);

  // 计算平均值
  const avgValue = useMemo(() => {
    const total = chartData.reduce((sum, item) => sum + item.value, 0);
    return (total / chartData.length).toFixed(1);
  }, [chartData]);

  // 获取标题文字
  const periodText = timePeriod === "day" ? "天" : timePeriod === "week" ? "周" : "月";
  const titleText = `最近${timePeriod === "day" ? 30 : 12}${periodText}新增人脉（我的）`;
  const avgText = `${timePeriod === "day" ? 30 : 12}${periodText}平均新增`;

  // 渲染图表
  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 5, left: 5, bottom: 5 }
    };

    const commonAxisProps = {
      xAxis: {
        dataKey: "name",
        tick: { fontSize: 11, fill: '#6b7280' },
        stroke: "#9ca3af",
        interval: 0
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
            fill="#8b5cf6" 
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
            stroke="#8b5cf6" 
            strokeWidth={2}
            dot={{ fill: '#8b5cf6', r: 4 }}
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
      
      return (
        <div className="bg-purple-600 p-1.5 rounded-lg">
          {/* 星期标题 */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((day, i) => (
              <div key={i} className="text-center text-white text-[9px] py-0">{day}</div>
            ))}
          </div>
          {/* 日历格子 */}
          <div className="grid grid-cols-7 gap-0.5">
            {chartData.map((item, index) => {
              const hasData = item.value > 0;
              return (
                <div
                  key={index}
                  className={`rounded flex flex-col items-center justify-center cursor-pointer transition-opacity hover:opacity-80 ${
                    hasData ? 'bg-amber-50' : 'bg-purple-700/50'
                  }`}
                  style={{ aspectRatio: '1 / 0.8' }}
                  title={`${item.name}: ${item.value}人`}
                >
                  <div className={`text-xs font-bold ${
                    hasData ? 'text-purple-600' : 'text-white'
                  }`}>
                    {index + 1}
                  </div>
                  <div className={`text-[9px] ${
                    hasData ? 'text-green-600 font-medium' : 'text-white/70'
                  }`}>
                    {item.value}
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
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-6 bg-purple-600 rounded"></div>
          <h2 className="text-lg font-medium">{titleText}</h2>
        </div>

        {/* 图表 */}
        <ResponsiveContainer width="100%" height={250}>
          {renderChart()}
        </ResponsiveContainer>

        {/* 按钮区域：时间维度 + 图表类型 */}
        <div className="mt-3 mb-3 flex items-center justify-between gap-3">
          {/* 时间维度切换按钮 */}
          <div className="flex bg-gray-100 rounded-lg overflow-hidden w-fit">
            <button
              onClick={() => setTimePeriod("day")}
              className={`px-3 py-1 text-sm ${
                timePeriod === "day"
                  ? "bg-white text-purple-600" 
                  : "text-gray-600"
              }`}
            >
              日
            </button>
            <button
              onClick={() => setTimePeriod("week")}
              className={`px-3 py-1 text-sm ${
                timePeriod === "week" 
                  ? "bg-white text-purple-600" 
                  : "text-gray-600"
              }`}
            >
              周
            </button>
            <button
              onClick={() => setTimePeriod("month")}
              className={`px-3 py-1 text-sm ${
                timePeriod === "month" 
                  ? "bg-white text-purple-600" 
                  : "text-gray-600"
              }`}
            >
              月
            </button>
          </div>

          {/* 图表类型切换按钮 */}
          <div className="flex bg-gray-100 rounded-lg overflow-hidden w-fit">
            <button
              onClick={() => setChartType("bar")}
              className={`px-3 py-1 text-sm ${
                chartType === "bar"
                  ? "bg-white text-purple-600" 
                  : "text-gray-600"
              }`}
            >
              柱状图
            </button>
            <button
              onClick={() => setChartType("line")}
              className={`px-3 py-1 text-sm ${
                chartType === "line" 
                  ? "bg-white text-purple-600" 
                  : "text-gray-600"
              }`}
            >
              折线图
            </button>
            <button
              onClick={() => setChartType("calendar")}
              className={`px-3 py-1 text-sm ${
                chartType === "calendar" 
                  ? "bg-white text-purple-600" 
                  : "text-gray-600"
              }`}
            >
              日历图
            </button>
          </div>
        </div>

        {/* 统计数据 */}
        <div className="pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">{avgText}</span>
            <span className="text-lg font-medium text-purple-600">{avgValue}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 共享数据内容
function SharedDataContent() {
  const [timePeriod, setTimePeriod] = useState<TimePeriodType>("week");
  const [chartType, setChartType] = useState<ChartType>("bar");

  // 根据时间维度生成数据
  const chartData = useMemo(() => {
    const data = [];
    const count = 12;
    
    if (timePeriod === "day") {
      for (let i = 1; i <= 30; i++) {
        data.push({
          name: `${i}天`,
          value: Math.floor(Math.random() * 5) + 1,
        });
      }
    } else if (timePeriod === "week") {
      for (let i = 1; i <= count; i++) {
        data.push({
          name: `${i}周`,
          value: Math.floor(Math.random() * 10) + 2,
        });
      }
    } else {
      for (let i = 1; i <= count; i++) {
        data.push({
          name: `${i}月`,
          value: Math.floor(Math.random() * 30) + 10,
        });
      }
    }
    return data;
  }, [timePeriod]);

  // 计算平均值
  const avgValue = useMemo(() => {
    const total = chartData.reduce((sum, item) => sum + item.value, 0);
    return (total / chartData.length).toFixed(1);
  }, [chartData]);

  // 获取标题文字
  const periodText = timePeriod === "day" ? "天" : timePeriod === "week" ? "周" : "月";
  const titleText = `最近${timePeriod === "day" ? 30 : 12}${periodText}新增人脉（共享）`;
  const avgText = `${timePeriod === "day" ? 30 : 12}${periodText}平均新增`;

  // 渲染图表
  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 5, left: 5, bottom: 5 }
    };

    const commonAxisProps = {
      xAxis: {
        dataKey: "name",
        tick: { fontSize: 11, fill: '#6b7280' },
        stroke: "#9ca3af",
        interval: 0
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
            fill="#8b5cf6" 
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
            stroke="#8b5cf6" 
            strokeWidth={2}
            dot={{ fill: '#8b5cf6', r: 4 }}
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
      
      return (
        <div className="bg-purple-600 p-1.5 rounded-lg">
          {/* 星期标题 */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((day, i) => (
              <div key={i} className="text-center text-white text-[9px] py-0">{day}</div>
            ))}
          </div>
          {/* 日历格子 */}
          <div className="grid grid-cols-7 gap-0.5">
            {chartData.map((item, index) => {
              const hasData = item.value > 0;
              return (
                <div
                  key={index}
                  className={`rounded flex flex-col items-center justify-center cursor-pointer transition-opacity hover:opacity-80 ${
                    hasData ? 'bg-amber-50' : 'bg-purple-700/50'
                  }`}
                  style={{ aspectRatio: '1 / 0.8' }}
                  title={`${item.name}: ${item.value}人`}
                >
                  <div className={`text-xs font-bold ${
                    hasData ? 'text-purple-600' : 'text-white'
                  }`}>
                    {index + 1}
                  </div>
                  <div className={`text-[9px] ${
                    hasData ? 'text-green-600 font-medium' : 'text-white/70'
                  }`}>
                    {item.value}
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
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-6 bg-purple-600 rounded"></div>
          <h2 className="text-lg font-medium">{titleText}</h2>
        </div>

        {/* 图表 */}
        <ResponsiveContainer width="100%" height={250}>
          {renderChart()}
        </ResponsiveContainer>

        {/* 按钮区域：时间维度 + 图表类型 */}
        <div className="mt-3 mb-3 flex items-center justify-between gap-3">
          {/* 时间维度切换按钮 */}
          <div className="flex bg-gray-100 rounded-lg overflow-hidden w-fit">
            <button
              onClick={() => setTimePeriod("day")}
              className={`px-3 py-1 text-sm ${
                timePeriod === "day"
                  ? "bg-white text-purple-600" 
                  : "text-gray-600"
              }`}
            >
              日
            </button>
            <button
              onClick={() => setTimePeriod("week")}
              className={`px-3 py-1 text-sm ${
                timePeriod === "week" 
                  ? "bg-white text-purple-600" 
                  : "text-gray-600"
              }`}
            >
              周
            </button>
            <button
              onClick={() => setTimePeriod("month")}
              className={`px-3 py-1 text-sm ${
                timePeriod === "month" 
                  ? "bg-white text-purple-600" 
                  : "text-gray-600"
              }`}
            >
              月
            </button>
          </div>

          {/* 图表类型切换按钮 */}
          <div className="flex bg-gray-100 rounded-lg overflow-hidden w-fit">
            <button
              onClick={() => setChartType("bar")}
              className={`px-3 py-1 text-sm ${
                chartType === "bar"
                  ? "bg-white text-purple-600" 
                  : "text-gray-600"
              }`}
            >
              柱状图
            </button>
            <button
              onClick={() => setChartType("line")}
              className={`px-3 py-1 text-sm ${
                chartType === "line" 
                  ? "bg-white text-purple-600" 
                  : "text-gray-600"
              }`}
            >
              折线图
            </button>
            <button
              onClick={() => setChartType("calendar")}
              className={`px-3 py-1 text-sm ${
                chartType === "calendar" 
                  ? "bg-white text-purple-600" 
                  : "text-gray-600"
              }`}
            >
              日历图
            </button>
          </div>
        </div>

        {/* 统计数据 */}
        <div className="pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">{avgText}</span>
            <span className="text-lg font-medium text-purple-600">{avgValue}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
