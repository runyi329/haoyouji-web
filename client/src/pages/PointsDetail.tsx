import { ArrowLeft, TrendingUp, TrendingDown, Award, Info } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PointsDetail() {
  const [, navigate] = useLocation();
  const { data: stats, isLoading: statsLoading } = trpc.rewards.getPointStats.useQuery();
  const { data: history, isLoading: historyLoading } = trpc.rewards.getPointHistory.useQuery({ limit: 50 });

  // 格式化日期
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // 获取交易类型的中文名称和颜色
  const getTypeInfo = (type: string) => {
    const typeMap: Record<string, { label: string; color: string }> = {
      game: { label: "游戏奖励", color: "text-green-600 dark:text-green-400" },
      task: { label: "任务完成", color: "text-blue-600 dark:text-blue-400" },
      reward: { label: "兑换奖品", color: "text-red-600 dark:text-red-400" },
      admin: { label: "系统调整", color: "text-purple-600 dark:text-purple-400" },
    };
    return typeMap[type] || { label: "其他", color: "text-gray-600 dark:text-gray-400" };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 dark:from-gray-900 dark:to-gray-800 pb-8">
      {/* 头部 */}
      <div className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/profile")}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-semibold">我的积分</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* 积分统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 当前积分 */}
          <Card className="p-6 bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
            {statsLoading ? (
              <Skeleton className="h-20 bg-white/20" />
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <Award className="w-5 h-5" />
                  <span className="text-sm opacity-90">当前积分</span>
                </div>
                <div className="text-3xl font-bold">{stats?.currentPoints || 0}</div>
              </>
            )}
          </Card>

          {/* 本月获得 */}
          <Card className="p-6">
            {statsLoading ? (
              <Skeleton className="h-20" />
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2 text-green-600 dark:text-green-400">
                  <TrendingUp className="w-5 h-5" />
                  <span className="text-sm">本月获得</span>
                </div>
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                  +{stats?.monthEarned || 0}
                </div>
              </>
            )}
          </Card>

          {/* 本月使用 */}
          <Card className="p-6">
            {statsLoading ? (
              <Skeleton className="h-20" />
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2 text-red-600 dark:text-red-400">
                  <TrendingDown className="w-5 h-5" />
                  <span className="text-sm">本月使用</span>
                </div>
                <div className="text-3xl font-bold text-red-600 dark:text-red-400">
                  -{stats?.monthSpent || 0}
                </div>
              </>
            )}
          </Card>
        </div>

        {/* 积分获取规则 */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-500" />
            积分获取规则
          </h2>
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5"></div>
              <div>
                <span className="font-medium">游戏奖励:</span> 完成游戏可获得积分,积分 = 游戏得分 ÷ 10
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5"></div>
              <div>
                <span className="font-medium">任务完成:</span> 完成每日任务、每周任务可获得相应积分
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5"></div>
              <div>
                <span className="font-medium">系统奖励:</span> 特殊活动和成就可获得额外积分
              </div>
            </div>
          </div>
        </Card>

        {/* 积分使用说明 */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Info className="w-5 h-5 text-amber-500" />
            积分使用说明
          </h2>
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5"></div>
              <div>
                <span className="font-medium">兑换奖品:</span> 使用积分在奖品商店兑换心仪的奖品
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5"></div>
              <div>
                <span className="font-medium">注意事项:</span> 积分一旦使用无法退回,请谨慎兑换
              </div>
            </div>
          </div>
        </Card>

        {/* 积分历史记录 */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">积分历史</h2>
          
          {historyLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : history && history.length > 0 ? (
            <div className="space-y-3">
              {history.map((record) => {
                const typeInfo = getTypeInfo(record.type);
                const isPositive = record.amount > 0;
                
                return (
                  <div
                    key={record.id}
                    className="flex items-center justify-between p-4 bg-slate-50 dark:bg-gray-700 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-600 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-medium ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {record.description || "无描述"}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        {formatDate(record.createdAt)}
                      </div>
                    </div>
                    <div
                      className={`text-lg font-bold ${
                        isPositive
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {isPositive ? "+" : ""}{record.amount}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400">
              <Award className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>暂无积分记录</p>
              <p className="text-sm mt-1">完成游戏和任务即可获得积分</p>
            </div>
          )}
        </Card>

        {/* 累计统计 */}
        {stats && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">累计统计</h2>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {stats.totalEarned}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  累计获得
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {stats.totalSpent}
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  累计使用
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
