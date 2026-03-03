/**
 * 减肥账本详情页
 * - 教练（owner）：顶部显示"学员管理"入口，可查看所有学员概览
 * - 学员（member）：顶部显示自己的专属减肥面板（由教练设置的档案）
 */
import { useParams, useLocation } from "wouter";
import {
  ChevronLeft, Scale, Flame, Brain, Plus, Settings,
  TrendingDown, Target, Users, User, Clock, Edit2
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

export default function DietLedger() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const ledgerId = Number(id);

  // 获取账本基础信息（含当前用户角色）
  const { data: ledgerData } = trpc.ledger.getById.useQuery({ ledgerId });
  // 获取当前用户自己的减肥档案
  const { data: myConfig } = trpc.diet.getMyConfig.useQuery({ ledgerId });
  // 获取当前用户的减肥统计
  const { data: stats } = trpc.diet.getStats.useQuery({ ledgerId });
  // 获取体重历史（图表）
  const { data: weightHistory = [] } = trpc.diet.getWeightHistory.useQuery({ ledgerId, days: 60 });
  // 获取卡路里历史（图表）
  const { data: calorieHistory = [] } = trpc.diet.getCalorieHistory.useQuery({ ledgerId, days: 60 });
  // 教练：获取所有学员档案概览
  const isOwner = (ledgerData as any)?.userRole === 'owner';
  const { data: allConfigs = [] } = trpc.diet.getAllMemberConfigs.useQuery(
    { ledgerId },
    { enabled: isOwner }
  );

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
    return Object.values(dateMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({ ...d, dateLabel: d.date.slice(5) }));
  })();

  const config = myConfig || stats?.config;
  const initialWeight = config ? Number(config.initialWeight) : null;
  const targetWeight = config ? Number(config.targetWeight) : null;
  const currentWeight = stats?.currentWeight ?? (config?.currentWeight ? Number(config.currentWeight) : null);
  const totalCalories = stats?.totalCaloriesBurned ?? 0;
  const lostWeight = (initialWeight && currentWeight) ? Math.max(0, initialWeight - currentWeight) : 0;
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
          {(ledgerData as any)?.name || "减肥账本"}
        </h1>
        <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="p-1">
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* ===== 教练视角：学员管理入口 + 学员概览 ===== */}
      {isOwner && (
        <div className="mx-4 mt-4 space-y-3">
          {/* 学员管理按钮 */}
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/diet-members`)}
            className="w-full bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
                <Users className="w-5 h-5 text-rose-500" />
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-gray-800">学员管理</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {(allConfigs as any[]).length > 0
                    ? `${(allConfigs as any[]).length} 位学员已设置档案`
                    : "为学员设置减肥档案"}
                </div>
              </div>
            </div>
            <ChevronLeft className="w-4 h-4 text-gray-400 rotate-180" />
          </button>

          {/* 学员进度概览（最多显示3个） */}
          {(allConfigs as any[]).length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-800">学员进度</span>
                {(allConfigs as any[]).length > 3 && (
                  <button
                    onClick={() => setLocation(`/ledger/${ledgerId}/diet-members`)}
                    className="text-xs text-rose-500"
                  >
                    查看全部
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {(allConfigs as any[]).slice(0, 3).map((c: any) => {
                  const ini = Number(c.initialWeight);
                  const tgt = Number(c.targetWeight);
                  const cur = Number(c.currentWeight || c.initialWeight);
                  const totalLose = ini - tgt;
                  const lost = Math.max(0, ini - cur);
                  const pct = totalLose > 0 ? Math.min(100, Math.round((lost / totalLose) * 100)) : 0;
                  return (
                    <div key={c.userId}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-rose-100 flex items-center justify-center">
                            <User className="w-3 h-3 text-rose-400" />
                          </div>
                          <span className="text-xs font-medium text-gray-700">
                            {c.nickname || `学员${c.userId}`}
                          </span>
                        </div>
                        <span className="text-xs text-rose-500">
                          已减 {lost.toFixed(1)} 斤 ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-rose-400 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== 学员视角（或教练自己的减肥面板） ===== */}
      <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm overflow-hidden">
        {config ? (
          <>
            {/* 进度条区域 */}
            <div className="bg-gradient-to-r from-rose-500 to-pink-400 px-4 pt-4 pb-5">
              <div className="flex items-center justify-between text-white mb-3">
                <div className="text-center">
                  <div className="text-xs opacity-80">初始体重</div>
                  <div className="text-lg font-bold">
                    {initialWeight ?? "--"}<span className="text-xs font-normal ml-0.5">斤</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs opacity-80">当前体重</div>
                  <div className="text-2xl font-bold">
                    {currentWeight ?? "--"}<span className="text-xs font-normal ml-0.5">斤</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs opacity-80">目标体重</div>
                  <div className="text-lg font-bold">
                    {targetWeight ?? "--"}<span className="text-xs font-normal ml-0.5">斤</span>
                  </div>
                </div>
              </div>
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
                  {Number(totalCalories).toLocaleString()}<span className="text-xs text-gray-500 ml-0.5">kcal</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* 未设置档案时的提示 */
          <div className="p-6 text-center">
            <Clock className="w-10 h-10 text-amber-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-700">
              {isOwner ? "你还没有设置自己的减肥档案" : "教练还未为你设置减肥档案"}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {isOwner
                ? "在学员管理中为自己设置档案，或直接开始打卡"
                : "档案设置完成后，这里会显示你的减肥进度"}
            </p>
            {isOwner && (
              <button
                onClick={() => setLocation(`/ledger/${ledgerId}/diet-members`)}
                className="mt-3 px-4 py-2 bg-rose-500 text-white text-xs rounded-full"
              >
                去设置档案
              </button>
            )}
          </div>
        )}
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
            <span className="text-sm font-semibold text-gray-800">我的趋势图</span>
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
                yAxisId="weight" type="monotone" dataKey="weight"
                stroke="#F43F5E" strokeWidth={2}
                dot={{ r: 3, fill: "#F43F5E" }} name="体重(斤)" connectNulls
              />
              <Line
                yAxisId="calorie" type="monotone" dataKey="calories"
                stroke="#F97316" strokeWidth={2}
                dot={{ r: 3, fill: "#F97316" }} name="消耗(kcal)" connectNulls
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

      {/* 邀请成员 */}
      <div className="mx-4 mt-3 bg-white rounded-2xl shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-800">邀请学员 & 拉拉队</p>
            <p className="text-xs text-gray-500 mt-0.5">让更多人加入减肥计划</p>
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
