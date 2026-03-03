/**
 * 减肥账本详情页
 * 设计风格：温暖粉红色调，双轨数据（体重+卡路里），双线图表
 */
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, Scale, Flame, Brain, Plus, Settings, TrendingDown, TrendingUp, Target, Camera } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function DietLedger() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const ledgerId = Number(id);
  const [activeTab, setActiveTab] = useState<"overview" | "records" | "meal">("overview");

  // 获取账本基础信息
  const { data: ledgerData } = trpc.ledger.getById.useQuery({ ledgerId });
  // 获取减肥统计
  const { data: stats, refetch: refetchStats } = trpc.diet.getStats.useQuery({ ledgerId });
  // 获取体重历史（图表）
  const { data: weightHistory = [] } = trpc.diet.getWeightHistory.useQuery({ ledgerId, days: 60 });
  // 获取卡路里历史（图表）
  const { data: calorieHistory = [] } = trpc.diet.getCalorieHistory.useQuery({ ledgerId, days: 60 });

  // 合并图表数据
  const chartData = (() => {
    const dateMap: Record<string, { date: string; weight?: number; calories?: number }> = {};
    (weightHistory as any[]).forEach((r: any) => {
      const d = String(r.recordDate).slice(0, 10);
      if (!dateMap[d]) dateMap[d] = { date: d };
      dateMap[d].weight = Number(r.weight);
    });
    (calorieHistory as any[]).forEach((r: any) => {
      const d = String(r.recordDate).slice(0, 10);
      if (!dateMap[d]) dateMap[d] = { date: d };
      dateMap[d].calories = Number(r.totalCalories);
    });
    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
      ...d,
      dateLabel: d.date.slice(5), // MM-DD
    }));
  })();

  const config = stats?.config;
  const initialWeight = config ? Number(config.initialWeight) : null;
  const targetWeight = config ? Number(config.targetWeight) : null;
  const currentWeight = stats?.currentWeight ?? (weightHistory.length > 0 ? Number((weightHistory as any[])[weightHistory.length - 1].weight) : null);
  const totalCalories = stats?.totalCaloriesBurned ?? 0;

  const lostWeight = (initialWeight && currentWeight) ? (initialWeight - currentWeight) : 0;
  const needToLose = (initialWeight && targetWeight) ? (initialWeight - targetWeight) : 0;
  const progress = needToLose > 0 ? Math.min(100, Math.round((lostWeight / needToLose) * 100)) : 0;

  return (
    <div className="min-h-screen bg-[#FFF5F5] pb-20">
      {/* 顶部导航 */}
      <div className="bg-gradient-to-r from-rose-500 to-pink-400 text-white px-3 py-3 flex items-center">
        <button onClick={() => setLocation("/ledger")} className="p-1 -ml-1">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold pr-6">
          {ledgerData?.name || "减肥账本"}
        </h1>
        <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="p-1">
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* 顶部面板 */}
      <div className="mx-4 mt-4 bg-white rounded-2xl shadow-sm overflow-hidden">
        {/* 进度条区域 */}
        <div className="bg-gradient-to-r from-rose-500 to-pink-400 px-4 pt-4 pb-5">
          <div className="flex items-center justify-between text-white mb-3">
            <div className="text-center">
              <div className="text-xs opacity-80">初始体重</div>
              <div className="text-lg font-bold">{initialWeight ?? "--"}<span className="text-xs font-normal ml-0.5">斤</span></div>
            </div>
            <div className="text-center">
              <div className="text-xs opacity-80">当前体重</div>
              <div className="text-2xl font-bold">{currentWeight ?? "--"}<span className="text-xs font-normal ml-0.5">斤</span></div>
            </div>
            <div className="text-center">
              <div className="text-xs opacity-80">目标体重</div>
              <div className="text-lg font-bold">{targetWeight ?? "--"}<span className="text-xs font-normal ml-0.5">斤</span></div>
            </div>
          </div>
          {/* 进度条 */}
          <div className="bg-white/30 rounded-full h-2.5 mb-1">
            <div
              className="bg-white rounded-full h-2.5 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-white text-xs opacity-80">
            <span>已减 {lostWeight > 0 ? lostWeight.toFixed(1) : 0} 斤</span>
            <span>{progress}%</span>
            <span>还差 {needToLose > 0 ? Math.max(0, needToLose - lostWeight).toFixed(1) : "--"} 斤</span>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 divide-x divide-gray-100">
          <div className="px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1 text-rose-500 mb-1">
              <TrendingDown className="w-4 h-4" />
              <span className="text-xs font-medium">累计减重</span>
            </div>
            <div className="text-xl font-bold text-gray-800">
              {lostWeight > 0 ? lostWeight.toFixed(1) : "0"}<span className="text-xs text-gray-500 ml-0.5">斤</span>
            </div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1 text-orange-500 mb-1">
              <Flame className="w-4 h-4" />
              <span className="text-xs font-medium">累计消耗</span>
            </div>
            <div className="text-xl font-bold text-gray-800">
              {totalCalories.toLocaleString()}<span className="text-xs text-gray-500 ml-0.5">kcal</span>
            </div>
          </div>
        </div>
      </div>

      {/* 快捷操作 */}
      <div className="mx-4 mt-3 grid grid-cols-3 gap-2">
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/diet-add?type=weight`)}
          className="bg-white rounded-xl p-3 flex flex-col items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
            <Scale className="w-5 h-5 text-rose-500" />
          </div>
          <span className="text-xs text-gray-600 font-medium">体重打卡</span>
        </button>
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/diet-add?type=calorie`)}
          className="bg-white rounded-xl p-3 flex flex-col items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
            <Flame className="w-5 h-5 text-orange-500" />
          </div>
          <span className="text-xs text-gray-600 font-medium">记录消耗</span>
        </button>
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/diet-meal`)}
          className="bg-white rounded-xl p-3 flex flex-col items-center gap-1.5 shadow-sm active:scale-95 transition-transform"
        >
          <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
            <Brain className="w-5 h-5 text-purple-500" />
          </div>
          <span className="text-xs text-gray-600 font-medium">AI营养师</span>
        </button>
      </div>

      {/* 图表区域 */}
      {chartData.length > 0 ? (
        <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-rose-500" />
            <span className="text-sm font-semibold text-gray-800">趋势图</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="dateLabel" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="weight" orientation="left" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
              <YAxis yAxisId="calorie" orientation="right" tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(value: any, name: string) => [
                  name === "体重(斤)" ? `${value} 斤` : `${value} kcal`,
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                yAxisId="weight"
                type="monotone"
                dataKey="weight"
                stroke="#F43F5E"
                strokeWidth={2}
                dot={{ r: 3, fill: "#F43F5E" }}
                name="体重(斤)"
                connectNulls
              />
              <Line
                yAxisId="calorie"
                type="monotone"
                dataKey="calories"
                stroke="#F97316"
                strokeWidth={2}
                dot={{ r: 3, fill: "#F97316" }}
                name="消耗(kcal)"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-1">
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-rose-500 rounded" />
              <span className="text-xs text-gray-500">体重走势（左轴）</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-0.5 bg-orange-500 rounded" />
              <span className="text-xs text-gray-500">每日消耗（右轴）</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm p-6 text-center">
          <Target className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">开始打卡后，这里会显示你的减肥趋势图</p>
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/diet-add?type=weight`)}
            className="mt-3 px-4 py-2 bg-rose-500 text-white text-sm rounded-full"
          >
            立即打卡
          </button>
        </div>
      )}

      {/* 初始化提示（未设置目标时） */}
      {!config && (
        <div className="mx-4 mt-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <Target className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">还未设置减肥目标</p>
            <p className="text-xs text-amber-600 mt-0.5">设置初始体重和目标体重，开始你的减肥之旅</p>
            <button
              onClick={() => setLocation(`/ledger/${ledgerId}/diet-config`)}
              className="mt-2 px-3 py-1.5 bg-amber-500 text-white text-xs rounded-full"
            >
              去设置
            </button>
          </div>
        </div>
      )}

      {/* 底部邀请成员提示 */}
      <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">邀请教练 & 拉拉队</p>
            <p className="text-xs text-gray-500 mt-0.5">让他们一起见证你的蜕变</p>
          </div>
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/invite`)}
            className="flex items-center gap-1 px-3 py-1.5 bg-rose-500 text-white text-xs rounded-full"
          >
            <Plus className="w-3 h-3" />
            邀请
          </button>
        </div>
      </div>
    </div>
  );
}
