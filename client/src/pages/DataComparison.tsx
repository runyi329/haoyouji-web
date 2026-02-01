import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList
} from 'recharts';
import { trpc } from "@/lib/trpc";

type TabType = "all" | "my" | "shared";

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
  // 模拟每周新增人脉数据（后续从API获取）
  const weeklyData = useMemo(() => {
    const data = [];
    for (let i = 1; i <= 12; i++) {
      data.push({
        week: `${i}周`,
        count: i === 6 ? 100 : Math.floor(Math.random() * 20) + 5, // 第6周测试100的数据
      });
    }
    return data;
  }, []);

  // 计算平均值
  const avgWeekly = useMemo(() => {
    const total = weeklyData.reduce((sum, item) => sum + item.count, 0);
    return (total / weeklyData.length).toFixed(1);
  }, [weeklyData]);

  return (
    <div className="p-2.5 space-y-4">
      {/* 每周新增人脉统计 */}
      <div className="bg-white rounded-lg p-2.5">
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-6 bg-purple-600 rounded"></div>
          <h2 className="text-lg font-medium">最近12周新增人脉</h2>
        </div>

        {/* 图表 */}
        <ResponsiveContainer width="100%" height={250}>
          <BarChart 
            data={weeklyData}
            margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="week" 
              tick={{ fontSize: 11, fill: '#6b7280' }}
              stroke="#9ca3af"
              interval={0}
            />
            <YAxis 
              tick={{ fontSize: 11, fill: '#6b7280' }}
              stroke="#9ca3af"
              width={45}
              tickFormatter={(value) => `${value}人`}
              domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px'
              }}
              formatter={(value: any) => [`${value}人`, '新增人脉']}
            />
            <Bar 
              dataKey="count" 
              fill="#8b5cf6" 
              radius={[4, 4, 0, 0]}
              animationBegin={0}
              animationDuration={1500}
              animationEasing="ease-out"
            >
              <LabelList 
                dataKey="count" 
                position="top" 
                style={{ fontSize: '12px', fill: '#6b7280', fontWeight: 500 }}
                formatter={(value: number) => value}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* 统计数据 */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">12周平均新增</span>
            <span className="text-lg font-medium text-purple-600">{avgWeekly}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 我的数据内容
function MyDataContent() {
  // 模拟每周新增人脉数据（后续从API获取，只统计自己的）
  const weeklyData = useMemo(() => {
    const data = [];
    for (let i = 1; i <= 12; i++) {
      data.push({
        week: `${i}周`,
        count: Math.floor(Math.random() * 15) + 3, // 模拟数据，比全部少一些
      });
    }
    return data;
  }, []);

  // 计算平均值
  const avgWeekly = useMemo(() => {
    const total = weeklyData.reduce((sum, item) => sum + item.count, 0);
    return (total / weeklyData.length).toFixed(1);
  }, [weeklyData]);

  return (
    <div className="p-2.5 space-y-4">
      {/* 每周新增人脉统计 */}
      <div className="bg-white rounded-lg p-2.5">
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-6 bg-purple-600 rounded"></div>
          <h2 className="text-lg font-medium">最近12周新增人脉（我的）</h2>
        </div>

        {/* 图表 */}
        <ResponsiveContainer width="100%" height={250}>
          <BarChart 
            data={weeklyData}
            margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="week" 
              tick={{ fontSize: 11, fill: '#6b7280' }}
              stroke="#9ca3af"
              interval={0}
            />
            <YAxis 
              tick={{ fontSize: 11, fill: '#6b7280' }}
              stroke="#9ca3af"
              width={45}
              tickFormatter={(value) => `${value}人`}
              domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px'
              }}
              formatter={(value: any) => [`${value}人`, '新增人脉']}
            />
            <Bar 
              dataKey="count" 
              fill="#8b5cf6" 
              radius={[4, 4, 0, 0]}
              animationBegin={0}
              animationDuration={1500}
              animationEasing="ease-out"
            >
              <LabelList 
                dataKey="count" 
                position="top" 
                style={{ fontSize: '12px', fill: '#6b7280', fontWeight: 500 }}
                formatter={(value: number) => value}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* 统计数据 */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">12周平均新增</span>
            <span className="text-lg font-medium text-purple-600">{avgWeekly}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 共享数据内容
function SharedDataContent() {
  // 模拟每周新增人脉数据（后续从API获取，只统计共享者的）
  const weeklyData = useMemo(() => {
    const data = [];
    for (let i = 1; i <= 12; i++) {
      data.push({
        week: `${i}周`,
        count: Math.floor(Math.random() * 10) + 2, // 模拟数据，比我的更少一些
      });
    }
    return data;
  }, []);

  // 计算平均值
  const avgWeekly = useMemo(() => {
    const total = weeklyData.reduce((sum, item) => sum + item.count, 0);
    return (total / weeklyData.length).toFixed(1);
  }, [weeklyData]);

  return (
    <div className="p-2.5 space-y-4">
      {/* 每周新增人脉统计 */}
      <div className="bg-white rounded-lg p-2.5">
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-6 bg-purple-600 rounded"></div>
          <h2 className="text-lg font-medium">最近12周新增人脉（共享）</h2>
        </div>

        {/* 图表 */}
        <ResponsiveContainer width="100%" height={250}>
          <BarChart 
            data={weeklyData}
            margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="week" 
              tick={{ fontSize: 11, fill: '#6b7280' }}
              stroke="#9ca3af"
              interval={0}
            />
            <YAxis 
              tick={{ fontSize: 11, fill: '#6b7280' }}
              stroke="#9ca3af"
              width={45}
              tickFormatter={(value) => `${value}人`}
              domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.15)]}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px'
              }}
              formatter={(value: any) => [`${value}人`, '新增人脉']}
            />
            <Bar 
              dataKey="count" 
              fill="#8b5cf6" 
              radius={[4, 4, 0, 0]}
              animationBegin={0}
              animationDuration={1500}
              animationEasing="ease-out"
            >
              <LabelList 
                dataKey="count" 
                position="top" 
                style={{ fontSize: '12px', fill: '#6b7280', fontWeight: 500 }}
                formatter={(value: number) => value}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* 统计数据 */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">12周平均新增</span>
            <span className="text-lg font-medium text-purple-600">{avgWeekly}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
