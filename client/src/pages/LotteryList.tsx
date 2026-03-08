/**
 * A1 定制账本 - 共享抽奖：历史记录列表页
 * 路由：/lottery/list/:ledgerId
 * 入口：账本详情页 → 共享抽奖入口
 */
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ChevronLeft, Plus, Trophy, Users, Clock, Zap, Layers } from "lucide-react";

const MODE_CONFIG: Record<string, { label: string; icon: React.ReactNode; bgColor: string; textColor: string; borderColor: string }> = {
  instant: {
    label: "即时刮刮乐",
    icon: <Zap className="w-3 h-3" />,
    bgColor: "#F3E5F5",
    textColor: "#7B1FA2",
    borderColor: "#E1BEE7",
  },
  scheduled: {
    label: "定时集体开奖",
    icon: <Clock className="w-3 h-3" />,
    bgColor: "#E3F2FD",
    textColor: "#1565C0",
    borderColor: "#BBDEFB",
  },
  milestone: {
    label: "阶段解锁",
    icon: <Layers className="w-3 h-3" />,
    bgColor: "#FFF8E1",
    textColor: "#E65100",
    borderColor: "#FFE082",
  },
};

const STATUS_CONFIG: Record<string, { label: string; bgColor: string; textColor: string; dotColor: string }> = {
  draft:     { label: "草稿",   bgColor: "#F5F5F5", textColor: "#757575", dotColor: "#9E9E9E" },
  open:      { label: "报名中", bgColor: "#E8F5E9", textColor: "#2E7D32", dotColor: "#4CAF50" },
  drawing:   { label: "开奖中", bgColor: "#FFF3E0", textColor: "#E65100", dotColor: "#FF9800" },
  completed: { label: "已结束", bgColor: "#F5F5F5", textColor: "#757575", dotColor: "#9E9E9E" },
  cancelled: { label: "已取消", bgColor: "#FFEBEE", textColor: "#C62828", dotColor: "#EF5350" },
};

import React from "react";

export default function LotteryList() {
  const [, params] = useRoute("/lottery/list/:ledgerId");
  const ledgerId = parseInt(params?.ledgerId ?? "0");
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const { data: activities, isLoading } = trpc.lottery.listByLedger.useQuery({ ledgerId });

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#FAF3ED" }}>
      {/* 顶部导航栏 */}
      <div
        className="bg-white sticky top-0 z-10"
        style={{ borderBottom: "1px solid #EEEEEE" }}
      >
        <div className="flex items-center justify-between h-14 px-4">
          <button
            onClick={() => window.history.back()}
            className="p-2 -ml-2 rounded-lg active:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" style={{ color: "#424242" }} />
          </button>
          <h1 className="text-base font-semibold" style={{ color: "#212121" }}>
            共享抽奖
          </h1>
          <button
            onClick={() => navigate(`/lottery/create?ledgerId=${ledgerId}`)}
            className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full text-white font-medium active:opacity-80 transition-opacity"
            style={{ backgroundColor: "#D32F2F" }}
          >
            <Plus className="w-3.5 h-3.5" />
            新建
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 pb-6 max-w-lg mx-auto">
        {/* 说明卡片 */}
        <div
          className="bg-white rounded-2xl p-4 mb-4 flex items-start gap-3"
          style={{ border: "1px solid #EEEEEE" }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "#FFEBEE" }}
          >
            <Trophy className="w-4.5 h-4.5" style={{ color: "#D32F2F" }} />
          </div>
          <div>
            <div className="text-sm font-semibold mb-0.5" style={{ color: "#212121" }}>
              共享抽奖
            </div>
            <div className="text-xs leading-relaxed" style={{ color: "#757575" }}>
              以共享账本为底座，每场抽奖对应一个子账本，每条报名记录对应一条账目。支持即时刮刮乐、定时集体开奖、阶段解锁三种模式，内置公平验证机制。
            </div>
          </div>
        </div>

        {/* 加载中 */}
        {isLoading && (
          <div className="text-center py-12">
            <div className="inline-block w-6 h-6 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: "#D32F2F" }} />
            <div className="text-sm mt-2" style={{ color: "#9E9E9E" }}>加载中...</div>
          </div>
        )}

        {/* 空状态 */}
        {!isLoading && (!activities || activities.length === 0) && (
          <div className="text-center py-14">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: "#FFEBEE" }}
            >
              <Trophy className="w-8 h-8" style={{ color: "#D32F2F" }} />
            </div>
            <div className="font-semibold mb-1" style={{ color: "#212121" }}>
              还没有抽奖活动
            </div>
            <div className="text-sm mb-6" style={{ color: "#9E9E9E" }}>
              点击右上角「新建」创建第一场抽奖
            </div>
            <button
              onClick={() => navigate(`/lottery/create?ledgerId=${ledgerId}`)}
              className="px-8 py-3 rounded-2xl text-white font-bold active:opacity-80 transition-opacity"
              style={{ backgroundColor: "#D32F2F" }}
            >
              创建抽奖活动
            </button>
          </div>
        )}

        {/* 活动列表 */}
        {activities && activities.length > 0 && (
          <div className="space-y-3">
            {activities.map((activity: any) => {
              const mode = MODE_CONFIG[activity.mode];
              const status = STATUS_CONFIG[activity.status] ?? STATUS_CONFIG.draft;

              return (
                <div
                  key={activity.id}
                  onClick={() => navigate(`/lottery/${activity.id}`)}
                  className="bg-white rounded-2xl p-4 cursor-pointer active:scale-[0.99] transition-all"
                  style={{ border: "1px solid #EEEEEE" }}
                >
                  {/* 标题行 */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <h3
                      className="font-semibold text-sm flex-1 min-w-0 truncate"
                      style={{ color: "#212121" }}
                    >
                      {activity.title}
                    </h3>
                    {/* 状态标签 */}
                    <span
                      className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
                      style={{
                        backgroundColor: status.bgColor,
                        color: status.textColor,
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: status.dotColor }}
                      />
                      {status.label}
                    </span>
                  </div>

                  {activity.description && (
                    <p className="text-xs truncate mb-2.5" style={{ color: "#757575" }}>
                      {activity.description}
                    </p>
                  )}

                  {/* 标签行 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {mode && (
                      <span
                        className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: mode.bgColor,
                          color: mode.textColor,
                          border: `1px solid ${mode.borderColor}`,
                        }}
                      >
                        {mode.icon}
                        {mode.label}
                      </span>
                    )}
                    <span
                      className="flex items-center gap-1 text-xs"
                      style={{ color: "#9E9E9E" }}
                    >
                      <Users className="w-3 h-3" />
                      {activity.participantCount} 人参与
                    </span>
                    {activity.winnerCount > 0 && (
                      <span className="text-xs font-medium" style={{ color: "#D32F2F" }}>
                        {activity.winnerCount} 人中奖
                      </span>
                    )}
                  </div>

                  {/* 开奖时间 */}
                  {activity.draw_at && activity.status === "open" && (
                    <div
                      className="mt-2.5 text-xs flex items-center gap-1"
                      style={{ color: "#9E9E9E" }}
                    >
                      <Clock className="w-3 h-3" />
                      开奖：{new Date(activity.draw_at).toLocaleString("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  )}

                  {/* 创建时间 */}
                  <div
                    className="mt-1.5 text-xs"
                    style={{ color: "#BDBDBD" }}
                  >
                    创建于 {new Date(activity.created_at).toLocaleDateString("zh-CN")}
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
