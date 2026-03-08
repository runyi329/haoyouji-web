/**
 * A1 定制账本 - 共享抽奖：历史记录列表页
 * 路由：/lottery/list/:ledgerId
 * 入口：账本详情页 → 共享抽奖入口
 */
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

const MODE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  instant:   { label: "即时自助", icon: "🎰", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
  scheduled: { label: "定时开奖", icon: "⏰", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  milestone: { label: "阶段解锁", icon: "🏆", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:     { label: "草稿", color: "text-gray-400 bg-gray-700/30 border-gray-600/30" },
  open:      { label: "报名中", color: "text-green-400 bg-green-500/10 border-green-500/30" },
  drawing:   { label: "开奖中", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" },
  completed: { label: "已结束", color: "text-gray-400 bg-gray-700/30 border-gray-600/30" },
  cancelled: { label: "已取消", color: "text-red-400 bg-red-500/10 border-red-500/30" },
};

export default function LotteryList() {
  const [, params] = useRoute("/lottery/list/:ledgerId");
  const ledgerId = parseInt(params?.ledgerId ?? "0");
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const { data: activities, isLoading } = trpc.lottery.listByLedger.useQuery({ ledgerId });

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-24">
      {/* 顶部 */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border-b border-gray-800/50 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1 as any)} className="text-gray-400 hover:text-white">← 返回</button>
        <h1 className="flex-1 text-center font-bold text-amber-400">共享抽奖</h1>
        <button
          onClick={() => navigate(`/lottery/create?ledgerId=${ledgerId}`)}
          className="text-xs px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
        >
          + 新建
        </button>
      </div>

      <div className="px-4 py-6 max-w-lg mx-auto">

        {/* 说明卡片 */}
        <div className="bg-gradient-to-br from-amber-900/20 to-gray-900/40 rounded-2xl p-4 mb-6 border border-amber-700/20">
          <div className="flex items-start gap-3">
            <span className="text-3xl">🎰</span>
            <div>
              <div className="font-bold text-amber-300 mb-1">共享抽奖</div>
              <div className="text-xs text-gray-400 leading-relaxed">
                以共享账本为底座，每场抽奖对应一个子账本，每条报名记录对应一条账目。
                支持即时刮刮乐、定时集体开奖、阶段解锁三种模式，内置公平验证机制。
              </div>
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="text-center py-12 text-amber-400 animate-pulse">加载中...</div>
        )}

        {!isLoading && (!activities || activities.length === 0) && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🎟️</div>
            <div className="text-gray-400 mb-2">还没有抽奖活动</div>
            <div className="text-gray-500 text-sm mb-6">点击右上角「+ 新建」创建第一场抽奖</div>
            <button
              onClick={() => navigate(`/lottery/create?ledgerId=${ledgerId}`)}
              className="px-6 py-3 rounded-2xl bg-amber-500 text-gray-950 font-bold hover:bg-amber-400 transition-colors"
            >
              🎉 创建抽奖活动
            </button>
          </div>
        )}

        {activities && activities.length > 0 && (
          <div className="space-y-3">
            {activities.map((activity: any) => {
              const mode = MODE_LABELS[activity.mode] ?? { label: activity.mode, icon: "🎲", color: "text-gray-400" };
              const status = STATUS_LABELS[activity.status] ?? { label: activity.status, color: "text-gray-400" };

              return (
                <div
                  key={activity.id}
                  onClick={() => navigate(`/lottery/${activity.id}`)}
                  className="bg-gray-800/50 rounded-2xl p-4 border border-gray-700/40 cursor-pointer hover:border-amber-700/40 hover:bg-gray-800/70 transition-all active:scale-98"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold truncate">{activity.title}</h3>
                      {activity.description && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{activity.description}</p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${status.color}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className={`px-2 py-0.5 rounded-full border ${mode.color}`}>
                      {mode.icon} {mode.label}
                    </span>
                    <span className="text-gray-400">👥 {activity.participantCount} 人</span>
                    {activity.winnerCount > 0 && (
                      <span className="text-amber-400">🏆 {activity.winnerCount} 人中奖</span>
                    )}
                  </div>

                  {activity.draw_at && activity.status === "open" && (
                    <div className="mt-2 text-xs text-gray-500">
                      开奖时间：{new Date(activity.draw_at).toLocaleString()}
                    </div>
                  )}

                  <div className="mt-2 text-xs text-gray-600">
                    创建于 {new Date(activity.created_at).toLocaleDateString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
