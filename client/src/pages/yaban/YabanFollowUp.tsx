/**
 * 牙伴 - 随访管理列表页
 * 路由：/yaban/followup
 * 淡蓝色系风格，顶部导航 + Tab筛选（全部/待计划/随访完成/未成功/已取消）
 * 列表显示：日期+星期 | 患者名 | 状态标签 | 内容 | 人员
 * 数据来源：trpc.yabanComm.listFollowups（真实客户档案，biz_type='followup'）
 * 右上角+号弹出ActionSheet（创建随访记录/创建随访计划）
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Plus, FileText } from "lucide-react";
import { useYabanClinic } from "./useYabanClinic";
import { trpc } from "@/lib/trpc";

// 状态Tab配置
const STATUS_TABS = [
  { id: "all", label: "全部" },
  { id: "pending", label: "待计划" },
  { id: "completed", label: "随访完成" },
  { id: "failed", label: "未成功" },
  { id: "cancelled", label: "已取消" },
] as const;

// 中文状态 -> 样式 key
const STATUS_TO_KEY: Record<string, string> = {
  "待计划": "pending",
  "随访完成": "completed",
  "未成功": "failed",
  "已取消": "cancelled",
};

// 状态颜色映射
const STATUS_COLORS: Record<string, { text: string; bg: string; label: string }> = {
  pending: { text: "text-amber-600", bg: "bg-amber-50", label: "待计划" },
  completed: { text: "text-sky-600", bg: "bg-sky-50", label: "随访完成" },
  failed: { text: "text-red-500", bg: "bg-red-50", label: "未成功" },
  cancelled: { text: "text-gray-500", bg: "bg-gray-100", label: "已取消" },
  overdue: { text: "text-white", bg: "bg-red-500", label: "超时" },
};

// 获取星期几的中文名
function getWeekdayName(dateStr: string): string {
  const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const d = new Date(dateStr.replace(/\//g, "-"));
  if (isNaN(d.getTime())) return "";
  return days[d.getDay()];
}

type TabId = (typeof STATUS_TABS)[number]["id"];

export default function YabanFollowUp() {
  const [, setLocation] = useLocation();
  const { current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [showActionSheet, setShowActionSheet] = useState(false);

  // 真实随访数据
  const { data, isLoading } = trpc.yabanComm.listFollowups.useQuery(
    { status: activeTab },
    { keepPreviousData: true }
  );
  const list = data?.list ?? [];

  const handleBack = () => {
    setLocation("/yaban");
  };

  const handleCreateRecord = () => {
    setShowActionSheet(false);
    setLocation("/yaban/followup/create");
  };

  const handleCreatePlan = () => {
    setShowActionSheet(false);
    setLocation("/yaban/followup/create?type=plan");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 - 蓝色渐变 */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-sky-500 to-sky-400 text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={handleBack} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center">
            <h1 className="text-lg font-semibold leading-tight">随访管理</h1>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <button onClick={() => setShowActionSheet(true)} className="p-1">
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Tab 筛选栏 */}
      <div className="bg-white border-b border-gray-100 sticky top-[52px] z-40">
        <div className="flex">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-center text-sm font-medium relative transition-colors ${
                activeTab === tab.id
                  ? "text-sky-600"
                  : "text-gray-500"
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-sky-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 列表内容 */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="py-32 text-center text-sm text-gray-400">加载中…</div>
        ) : list.length === 0 ? (
          /* 空状态 */
          <div className="flex flex-col items-center justify-center py-32">
            <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <FileText className="w-10 h-10 text-gray-300" />
            </div>
            <p className="text-gray-400 text-sm">暂无随访</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {list.map((item) => {
              const statusKey = STATUS_TO_KEY[item.status] || "pending";
              return (
                <div
                  key={item.id}
                  onClick={() => setLocation(`/yaban/followup/detail/${item.id}`)}
                  className="bg-white px-4 py-4 active:bg-gray-50 transition-colors cursor-pointer"
                >
                  {/* 第一行：日期 | 患者名 + 状态标签 */}
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">
                        {item.date} {getWeekdayName(item.date)}
                      </span>
                      <span className="text-gray-300">|</span>
                      <span className="text-sm font-bold text-gray-900">
                        {item.patientName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-medium ${STATUS_COLORS[statusKey]?.text || "text-gray-500"}`}>
                        {STATUS_COLORS[statusKey]?.label || item.status}
                      </span>
                      {item.isOverdue && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-500 text-white font-medium">
                          超时
                        </span>
                      )}
                    </div>
                  </div>
                  {/* 第二行：内容 */}
                  <p className="text-sm text-gray-600 mb-1 leading-relaxed">
                    内容：{item.content || "—"}
                  </p>
                  {/* 第三行：人员 */}
                  <p className="text-sm text-gray-500">
                    人员：{item.staff}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ActionSheet 弹出菜单 */}
      {showActionSheet && (
        <div className="fixed inset-0 z-[100]">
          {/* 遮罩 */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowActionSheet(false)}
          />
          {/* 菜单内容 */}
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl overflow-hidden animate-slide-up">
            <button
              onClick={handleCreateRecord}
              className="w-full py-4 text-center text-base text-gray-800 font-medium border-b border-gray-100 active:bg-gray-50"
            >
              创建随访记录
            </button>
            <button
              onClick={handleCreatePlan}
              className="w-full py-4 text-center text-base text-gray-800 font-medium border-b border-gray-100 active:bg-gray-50"
            >
              创建随访计划
            </button>
            <div className="h-2 bg-gray-100" />
            <button
              onClick={() => setShowActionSheet(false)}
              className="w-full py-4 text-center text-base text-gray-800 font-medium active:bg-gray-50"
            >
              取消
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
