/**
 * 牙伴 - 随访管理列表页
 * 路由：/yaban/followup
 * 淡蓝色系风格，顶部导航 + Tab筛选（全部/待计划/随访完成/未成功/已取消）
 * 列表显示：日期+星期 | 患者名 | 状态标签 | 内容 | 人员
 * 右上角+号弹出ActionSheet（创建随访记录/创建随访计划）
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Plus, FileText, Pencil } from "lucide-react";
import { PageTag } from "@/components/PageTag";
import { useYabanClinic } from "./useYabanClinic";

// 状态Tab配置
const STATUS_TABS = [
  { id: "all", label: "全部" },
  { id: "pending", label: "待计划" },
  { id: "completed", label: "随访完成" },
  { id: "failed", label: "未成功" },
  { id: "cancelled", label: "已取消" },
];

// 状态颜色映射
const STATUS_COLORS: Record<string, { text: string; bg: string; label: string }> = {
  pending: { text: "text-amber-600", bg: "bg-amber-50", label: "待计划" },
  completed: { text: "text-sky-600", bg: "bg-sky-50", label: "随访完成" },
  failed: { text: "text-red-500", bg: "bg-red-50", label: "未成功" },
  cancelled: { text: "text-gray-500", bg: "bg-gray-100", label: "已取消" },
  overdue: { text: "text-white", bg: "bg-red-500", label: "超时" },
};

// 模拟随访数据
interface FollowUpRecord {
  id: number;
  patientName: string;
  date: string;
  weekday: string;
  content: string;
  staff: string;
  status: "pending" | "completed" | "failed" | "cancelled";
  isOverdue?: boolean;
}

const MOCK_DATA: FollowUpRecord[] = [
  { id: 1, patientName: "钱洁", date: "2027/06/08", weekday: "周二", content: "提醒半年洗牙的重要性，可以早期发现蛀牙", staff: "前台", status: "pending", isOverdue: false },
  { id: 2, patientName: "冯逸凡", date: "2027/06/06", weekday: "周日", content: "提醒半年洗牙的重要性，可以早期发现蛀牙", staff: "前台", status: "pending", isOverdue: false },
  { id: 3, patientName: "陈龙", date: "2027/06/06", weekday: "周日", content: "提醒半年洗牙的重要性，可以早期发现蛀牙", staff: "前台", status: "pending", isOverdue: false },
  { id: 4, patientName: "蒋天麟", date: "2027/06/06", weekday: "周日", content: "洁牙", staff: "前台", status: "pending", isOverdue: false },
  { id: 5, patientName: "汪礼杨", date: "2027/06/06", weekday: "周日", content: "提醒半年洗牙的重要性，可以早期发现蛀牙", staff: "前台", status: "pending", isOverdue: false },
  { id: 6, patientName: "刘羚翔", date: "2027/06/06", weekday: "周日", content: "提醒半年洗牙的重要性，可以早期发现蛀牙", staff: "前台", status: "pending", isOverdue: false },
  { id: 7, patientName: "资彦义", date: "2026/11/26", weekday: "周四", content: "无需随访了", staff: "杨文利", status: "completed", isOverdue: false },
  { id: 8, patientName: "李博晗", date: "2027/05/09", weekday: "周日", content: "提醒1年/半年洗牙的重要性，可以早期发现蛀牙", staff: "前台", status: "completed", isOverdue: false },
  { id: 9, patientName: "徐梅花", date: "2027/05/05", weekday: "周三", content: "种植牙一年定期复查", staff: "侯睿", status: "completed", isOverdue: false },
  { id: 10, patientName: "张雅涵", date: "2026/10/20", weekday: "周二", content: "27看一下是否预约时间", staff: "梅刚", status: "completed", isOverdue: false },
  { id: 11, patientName: "白扬", date: "2026/05/29", weekday: "周五", content: "问下洁牙美白术后，邀约补牙拔除残根，是否矫正？", staff: "杨文利", status: "pending", isOverdue: true },
  { id: 12, patientName: "尧惠平", date: "2026/05/30", weekday: "周六", content: "之前可能牙齿发炎了，这几天疼的厉害 后来下雨不来了 可以问下阿姨好点了不", staff: "郑奎", status: "pending", isOverdue: true },
  { id: 13, patientName: "顾勇", date: "2026/05/30", weekday: "周六", content: "重新邀约客人左下修复方案", staff: "郑奎", status: "pending", isOverdue: true },
  { id: 14, patientName: "吴缔", date: "2026/05/30", weekday: "周六", content: "问下牙龈红肿出血情况，是否要做龈下刮治，", staff: "杨文利", status: "pending", isOverdue: true },
  { id: 15, patientName: "刘久妹", date: "2026/05/29", weekday: "周五", content: "问问右下57要来拔牙吗", staff: "杨文利", status: "pending", isOverdue: true },
];

// 获取星期几的中文名
function getWeekdayName(dateStr: string): string {
  const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const d = new Date(dateStr.replace(/\//g, "-"));
  return days[d.getDay()];
}

export default function YabanFollowUp() {
  const [, setLocation] = useLocation();
  const { current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const [activeTab, setActiveTab] = useState("all");
  const [showActionSheet, setShowActionSheet] = useState(false);

  // 根据Tab筛选数据
  const filteredData = MOCK_DATA.filter((item) => {
    if (activeTab === "all") return true;
    return item.status === activeTab;
  });

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
        {filteredData.length === 0 ? (
          /* 空状态 */
          <div className="flex flex-col items-center justify-center py-32">
            <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <FileText className="w-10 h-10 text-gray-300" />
            </div>
            <p className="text-gray-400 text-sm">暂无随访</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredData.map((item) => (
              <div
                key={item.id}
                onClick={() => setLocation(`/yaban/followup/detail/${item.id}`)}
                className="bg-white px-4 py-4 active:bg-gray-50 transition-colors cursor-pointer"
              >
                {/* 第一行：日期 | 患者名 + 状态标签 */}
                <div className="flex items-start justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900">
                      {item.date} {item.weekday}
                    </span>
                    <span className="text-gray-300">|</span>
                    <span className="text-sm font-bold text-gray-900">
                      {item.patientName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-medium ${STATUS_COLORS[item.status]?.text || "text-gray-500"}`}>
                      {STATUS_COLORS[item.status]?.label || item.status}
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
                  内容：{item.content}
                </p>
                {/* 第三行：人员 */}
                <p className="text-sm text-gray-500">
                  人员：{item.staff}
                </p>
              </div>
            ))}
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

      <PageTag code="P301" />
    </div>
  );
}
