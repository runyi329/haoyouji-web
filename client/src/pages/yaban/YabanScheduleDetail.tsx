/**
 * 牙伴齿科管理 - 预约详情页
 * 路由：/yaban/schedule/:id
 * 显示患者信息、预约详情、快捷操作按钮
 */
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  Image,
  MessageSquare,
  Plus,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";

// 预约状态配置
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  // 依牙伴标准色卡：蓝调为主，绿/金/红低饱和点缀（禁亮绿/紫），使用行内色值与主页一致
  booked: { label: "已预约", color: "#3D9FD6", bg: "#EBF5FB" },
  confirmed: { label: "已确认", color: "#1E88D6", bg: "#EBF5FB" },
  consulting: { label: "咨询中", color: "#1B6FA8", bg: "#E9F1F8" },
  registered: { label: "已挂号", color: "#1972B8", bg: "#E0EDF7" },
  treating: { label: "治疗中", color: "#1567AE", bg: "#E0EDF7" },
  treated: { label: "治疗完成", color: "#3D7A53", bg: "#EAF2EC" },
  paid: { label: "已结账", color: "#3D7A53", bg: "#EAF2EC" },
  left: { label: "已离开", color: "#647386", bg: "#EEF1F4" },
  missed: { label: "失约", color: "#9A6E1F", bg: "#F5EEDD" },
  cancelled: { label: "已取消", color: "#A8463C", bg: "#F7E9E7" },
};

export default function YabanScheduleDetail() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const [showActionSheet, setShowActionSheet] = useState(false);
  const { currentTenantId, current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";

  const { data: detail, isLoading } = trpc.yabanAppointment.getById.useQuery(
    { id: Number(params.id), tenantId: currentTenantId ?? undefined },
    { enabled: !!params.id }
  );

  const utils = trpc.useUtils();
  const updateStatus = trpc.yabanAppointment.updateStatus.useMutation({
    onSuccess: () => {
      utils.yabanAppointment.getById.invalidate({ id: Number(params.id) });
      // 刷新首页日/周/月三个视角数据
      utils.yabanComm.todayOverview.invalidate();
      utils.yabanComm.weekOverview.invalidate();
      utils.yabanComm.calendarStats.invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="text-gray-400 text-sm">加载中...</span>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <span className="text-gray-400 text-sm">预约不存在</span>
        <button className="mt-4 text-sky-500 text-sm" onClick={() => setLocation("/yaban/schedule")}>返回</button>
      </div>
    );
  }

  const statusInfo = STATUS_CONFIG[detail.status] || STATUS_CONFIG.booked;

  // 快捷操作
  const quickActions = [
    { icon: CreditCard, label: "收费记录", color: "text-sky-600" },
    { icon: FileText, label: "病历记录", color: "text-emerald-600" },
    { icon: Image, label: "影像记录", color: "text-purple-600" },
    { icon: MessageSquare, label: "发短信", color: "text-amber-600" },
  ];

  // 详情字段
  const timeStr = detail.appointTime ? `${detail.appointTime}${detail.endTime ? `–${detail.endTime}` : ""}` : "";
  const detailFields = [
    { label: "日期", value: `${detail.date} ${timeStr}` },
    { label: "诊所", value: (detail as any).clinic || "" },
    { label: "医生", value: detail.doctor || "未指定" },
    { label: "咨询师", value: detail.consultant || "未指定" },
    { label: "助理", value: detail.assistant || "未指定" },
    { label: "项目", value: detail.project || "" },
    { label: "诊室", value: detail.room || "未指定" },
    { label: "科室", value: detail.department || "未指定" },
    { label: "预约来源", value: detail.source || "未指定" },
    { label: "备注", value: detail.remark || "无" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <div className="bg-gradient-to-r from-sky-500 to-sky-400 text-white px-4 pt-12 pb-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setLocation("/yaban/schedule")} className="p-1">
            <ChevronLeft size={22} />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-base font-medium leading-tight">预约详情</span>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <button onClick={() => setShowActionSheet(true)} className="p-1">
            <Plus size={20} />
          </button>
        </div>
      </div>

      {/* 状态标签 */}
      <div className="bg-white px-4 py-3 border-b border-gray-100">
        <span className="inline-block px-3 py-1 rounded-md text-xs font-medium" style={{ background: statusInfo.bg, color: statusInfo.color }}>
          {statusInfo.label}
        </span>
      </div>

      {/* 患者信息卡片 */}
      <div className="bg-white mx-4 mt-3 rounded p-4 shadow-sm border border-gray-50">
        <div className="flex items-center gap-3">
          {/* 头像 */}
          <div className="w-12 h-12 rounded-md bg-sky-100 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1E88D6" strokeWidth="1.5">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 4-7 8-7s8 3 8 7" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-medium text-gray-800">{detail.patientName}</span>
              {detail.patientAge && <span className="text-xs text-gray-500">{detail.patientAge}岁</span>}
              {detail.patientGender && <span className="text-xs text-gray-500">{detail.patientGender}</span>}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
  {/* tags */}
            {((detail as any).tags || []).map((tag: string, i: number) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 border border-sky-200">
                  {tag}
                </span>
              ))}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {(detail as any).patientId || ""} {(detail as any).clinic ? `- ${(detail as any).clinic}` : ""}
            </div>
          </div>
          <ChevronRight size={16} className="text-gray-300" />
        </div>
      </div>

      {/* 快捷操作 */}
      <div className="bg-white mx-4 mt-3 rounded p-4 shadow-sm border border-gray-50">
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map((action, i) => (
            <button key={i} className="flex flex-col items-center gap-1.5">
              <div className="w-10 h-10 rounded-md bg-gray-50 flex items-center justify-center">
                <action.icon size={18} className={action.color} />
              </div>
              <span className="text-[11px] text-gray-600">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 详细信息 */}
      <div className="bg-white mx-4 mt-3 rounded shadow-sm border border-gray-50 overflow-hidden">
        {detailFields.map((field, i) => (
          <div
            key={i}
            className={`flex items-center justify-between px-4 py-3 ${
              i < detailFields.length - 1 ? "border-b border-gray-50" : ""
            }`}
          >
            <span className="text-sm text-gray-500">{field.label}</span>
            <span className="text-sm text-gray-800 text-right max-w-[60%] truncate">
              {field.value}
            </span>
          </div>
        ))}
      </div>

      {/* 底部操作 */}
      <div className="mt-4 px-4 pb-8 space-y-3">
        <button className="w-full py-2.5 text-center text-sm text-sky-600 bg-white rounded border border-sky-200">
          查看变更记录
        </button>
        <button
          className="w-full py-2.5 text-center text-sm text-white bg-gradient-to-r from-sky-500 to-sky-400 rounded shadow-sm"
          onClick={() => setLocation("/yaban/schedule/create")}
        >
          再次预约
        </button>
      </div>

      {/* 操作菜单 */}
      {showActionSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="flex-1 bg-black/30" onClick={() => setShowActionSheet(false)} />
          <div className="bg-white rounded-t-xl overflow-hidden">
            <button
              className="w-full py-4 text-center text-sm text-gray-800 border-b border-gray-100 active:bg-gray-50"
              onClick={() => {
                setShowActionSheet(false);
                setLocation("/yaban/schedule/create");
              }}
            >
              修改预约
            </button>
            <button className="w-full py-4 text-center text-sm text-red-500 border-b border-gray-100 active:bg-gray-50">
              取消预约
            </button>
            <div className="h-2 bg-gray-100" />
            <button
              className="w-full py-4 text-center text-sm text-gray-500 active:bg-gray-50"
              onClick={() => setShowActionSheet(false)}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
