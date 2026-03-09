/**
 * A1 定制账本 - 共享抽奖：管理后台列表页（仅管理员/创建者可访问）
 * 路由：/lottery/list/:ledgerId
 * 功能：查看、编辑、发布、暂停、恢复、取消活动
 */
import React, { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ChevronLeft, Plus, Trophy, Users, Clock, Zap, Layers,
  Edit2, PlayCircle, PauseCircle, XCircle, Eye, Trash2,
} from "lucide-react";

const MODE_CONFIG: Record<string, { label: string; icon: React.ReactNode; bgColor: string; textColor: string; borderColor: string }> = {
  instant: {
    label: "即时刮刮乐",
    icon: <Zap className="w-3 h-3" />,
    bgColor: "#F3E5F5",
    textColor: "#7B1FA2",
    borderColor: "#E1BEE7",
  },
  scheduled: {
    label: "定时开奖",
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

export default function LotteryList() {
  const [, params] = useRoute("/lottery/list/:ledgerId");
  const ledgerId = parseInt(params?.ledgerId ?? "0");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const { data: activities, isLoading, refetch } = trpc.lottery.listByLedger.useQuery({ ledgerId });
  const updateMutation = trpc.lottery.update.useMutation();
  const deleteMutation = trpc.lottery.deleteActivity.useMutation();

  const handleStatusChange = async (activityId: number, newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (newStatus === 'cancelled') {
      setConfirmCancel(activityId);
      return;
    }
    setActionLoading(activityId);
    try {
      await updateMutation.mutateAsync({ activityId, status: newStatus as any });
      await refetch();
    } catch (err: any) {
      alert(err.message || '操作失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmCancel = async (activityId: number) => {
    setActionLoading(activityId);
    setConfirmCancel(null);
    try {
      await updateMutation.mutateAsync({ activityId, status: 'cancelled' });
      await refetch();
    } catch (err: any) {
      alert(err.message || '取消失败');
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmDelete = async (activityId: number) => {
    setActionLoading(activityId);
    setConfirmDelete(null);
    try {
      await deleteMutation.mutateAsync({ activityId });
      await refetch();
    } catch (err: any) {
      alert(err.message || '删除失败');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#FAF3ED" }}>
      {/* 顶部导航栏 */}
      <div
        className="bg-white sticky top-0 z-10"
        style={{ borderBottom: "1px solid #EEEEEE" }}
      >
        <div className="flex items-center justify-between h-14 px-4">
          <button
            onClick={() => navigate(`/ledger/${ledgerId}` as any)}
            className="p-2 -ml-2 rounded-lg active:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" style={{ color: "#424242" }} />
          </button>
          <h1 className="text-base font-semibold" style={{ color: "#212121" }}>
            抽奖活动管理
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
              const isLoading = actionLoading === activity.id;

              return (
                <div
                  key={activity.id}
                  className="bg-white rounded-2xl overflow-hidden"
                  style={{ border: "1px solid #EEEEEE", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}
                >
                  {/* 卡片主体（点击进入详情） */}
                  <div
                    onClick={() => navigate(`/lottery/${activity.id}`)}
                    className="p-4 cursor-pointer active:bg-gray-50 transition-colors"
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

                    {/* 奖项列表 */}
                    {activity.prizes && activity.prizes.length > 0 && (
                      <div className="mt-2.5 pt-2.5" style={{ borderTop: '1px dashed #F0E8E0' }}>
                        <div className="text-xs font-medium mb-1.5" style={{ color: '#9E9E9E' }}>奖项设置</div>
                        <div className="flex flex-wrap gap-1.5">
                          {activity.prizes.map((prize: any) => (
                            <span
                              key={prize.id}
                              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                              style={{
                                backgroundColor: prize.is_consolation ? '#F5F5F5' : '#FFF3E0',
                                color: prize.is_consolation ? '#9E9E9E' : '#E65100',
                                border: `1px solid ${prize.is_consolation ? '#E0E0E0' : '#FFCC80'}`,
                              }}
                            >
                              <Trophy className="w-2.5 h-2.5" />
                              {prize.name}
                              <span style={{ opacity: 0.7 }}>×{prize.quantity}</span>
                            </span>
                          ))}
                        </div>
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

                  {/* 操作按钮栏（分隔线下方） */}
                  {activity.status !== 'completed' && activity.status !== 'cancelled' && (
                    <div
                      className="flex items-center border-t"
                      style={{ borderColor: "#F5F5F5" }}
                    >
                      {/* 查看详情 */}
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/lottery/${activity.id}`); }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium active:bg-gray-50 transition-colors"
                        style={{ color: "#616161" }}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        查看
                      </button>

                      <div className="w-px h-5" style={{ backgroundColor: "#F0F0F0" }} />

                      {/* 编辑（草稿/报名中可编辑） */}
                      {(activity.status === 'draft' || activity.status === 'open') && (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/lottery/edit/${activity.id}`); }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium active:bg-gray-50 transition-colors"
                            style={{ color: "#1565C0" }}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            编辑
                          </button>
                          <div className="w-px h-5" style={{ backgroundColor: "#F0F0F0" }} />
                        </>
                      )}

                      {/* 发布（草稿 → 报名中） */}
                      {activity.status === 'draft' && (
                        <>
                          <button
                            onClick={(e) => handleStatusChange(activity.id, 'open', e)}
                            disabled={isLoading}
                            className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium active:bg-gray-50 transition-colors disabled:opacity-50"
                            style={{ color: "#2E7D32" }}
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                            {isLoading ? '处理中...' : '发布'}
                          </button>
                          <div className="w-px h-5" style={{ backgroundColor: "#F0F0F0" }} />
                        </>
                      )}

                      {/* 暂停（报名中 → 草稿） */}
                      {activity.status === 'open' && (
                        <>
                          <button
                            onClick={(e) => handleStatusChange(activity.id, 'draft', e)}
                            disabled={isLoading}
                            className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium active:bg-gray-50 transition-colors disabled:opacity-50"
                            style={{ color: "#E65100" }}
                          >
                            <PauseCircle className="w-3.5 h-3.5" />
                            {isLoading ? '处理中...' : '暂停'}
                          </button>
                          <div className="w-px h-5" style={{ backgroundColor: "#F0F0F0" }} />
                        </>
                      )}

                      {/* 取消 */}
                      <button
                        onClick={(e) => handleStatusChange(activity.id, 'cancelled', e)}
                        disabled={isLoading}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium active:bg-gray-50 transition-colors disabled:opacity-50"
                        style={{ color: "#C62828" }}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        取消
                      </button>
                      <div className="w-px h-5" style={{ backgroundColor: "#F0F0F0" }} />
                      {/* 删除 */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(activity.id); }}
                        disabled={actionLoading === activity.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium active:bg-gray-50 transition-colors disabled:opacity-50"
                        style={{ color: "#9E9E9E" }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        删除
                      </button>
                    </div>
                  )}

                  {/* 已结束/已取消状态显示查看 + 删除按鈕 */}
                  {(activity.status === 'completed' || activity.status === 'cancelled') && (
                    <div
                      className="flex items-center border-t"
                      style={{ borderColor: "#F5F5F5" }}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/lottery/${activity.id}`); }}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium active:bg-gray-50 transition-colors"
                        style={{ color: "#9E9E9E" }}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        查看结果
                      </button>
                      <div className="w-px h-5" style={{ backgroundColor: "#F0F0F0" }} />
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(activity.id); }}
                        disabled={actionLoading === activity.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium active:bg-gray-50 transition-colors disabled:opacity-50"
                        style={{ color: "#9E9E9E" }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        删除
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      {confirmDelete !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <div className="w-full max-w-lg bg-white rounded-t-3xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-2" style={{ color: "#212121" }}>确认删除活动？</h3>
            <p className="text-sm mb-6" style={{ color: "#757575" }}>
              删除后该活动将完全移除，包括往期回顾中也不再显示。此操作不可恢复。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3 rounded-2xl text-sm font-medium"
                style={{ backgroundColor: "#F5F5F5", color: "#424242" }}
              >
                再想想
              </button>
              <button
                onClick={() => handleConfirmDelete(confirmDelete)}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white"
                style={{ backgroundColor: "#757575" }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 取消确认弹窗 */}
      {confirmCancel !== null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold mb-2" style={{ color: "#212121" }}>确认取消活动？</h3>
            <p className="text-sm mb-6" style={{ color: "#757575" }}>
              取消后活动将无法恢复，已报名的参与者将无法继续参与。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmCancel(null)}
                className="flex-1 py-3 rounded-2xl text-sm font-medium"
                style={{ backgroundColor: "#F5F5F5", color: "#424242" }}
              >
                再想想
              </button>
              <button
                onClick={() => handleConfirmCancel(confirmCancel)}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white"
                style={{ backgroundColor: "#C62828" }}
              >
                确认取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
