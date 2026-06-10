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

// 预约状态配置
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  booked: { label: "已预约", color: "text-sky-700", bg: "bg-sky-100" },
  confirmed: { label: "已确认", color: "text-blue-700", bg: "bg-blue-100" },
  consulting: { label: "咨询中", color: "text-purple-700", bg: "bg-purple-100" },
  registered: { label: "已挂号", color: "text-indigo-700", bg: "bg-indigo-100" },
  treating: { label: "治疗中", color: "text-amber-700", bg: "bg-amber-100" },
  treated: { label: "治疗完成", color: "text-emerald-700", bg: "bg-emerald-100" },
  paid: { label: "已结账", color: "text-green-700", bg: "bg-green-100" },
  left: { label: "已离开", color: "text-green-800", bg: "bg-green-100" },
  missed: { label: "失约", color: "text-gray-600", bg: "bg-gray-200" },
  cancelled: { label: "已取消", color: "text-gray-500", bg: "bg-gray-100" },
};

// 模拟详情数据
function getMockDetail(id: string) {
  const seed = parseInt(id) || 1;
  const names = ["王瑛", "赵玲", "胡星民", "殷伟民", "王平华", "徐进", "喻永丽", "王雯婷"];
  const projects = ["复诊", "洁牙", "补牙", "拔牙", "种植", "正畸复诊", "根管治疗"];
  const doctors = ["郑莹", "易家宝", "李华超", "鲁毅", "梅刚"];
  const statuses = ["booked", "confirmed", "treating", "treated", "paid", "left"];

  return {
    id,
    patientName: names[seed % names.length],
    patientAge: 20 + (seed % 50),
    gender: seed % 3 === 0 ? "female" : "male",
    patientId: `0179${(60 + seed % 40).toString()}`,
    clinic: "上海恒恩口腔门诊部",
    date: "2026年06月10日 星期二",
    time: `${(8 + seed % 10).toString().padStart(2, "0")}:${seed % 2 === 0 ? "00" : "30"}-${(9 + seed % 10).toString().padStart(2, "0")}:${seed % 2 === 0 ? "30" : "00"}`,
    doctor: doctors[seed % doctors.length],
    consultant: "未指定",
    assistant: "未指定",
    project: projects[seed % projects.length],
    room: seed % 2 === 0 ? "1号诊室" : "VIP诊室",
    department: "",
    source: "未指定",
    remark: seed % 3 === 0 ? "宁缺访邀约 IMP定检" : seed % 3 === 1 ? "半年洁牙定检" : "",
    status: statuses[seed % statuses.length],
    tags: seed % 2 === 0 ? ["电", "门"] : ["临"],
  };
}

export default function YabanScheduleDetail() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const detail = getMockDetail(params.id || "1");
  const statusInfo = STATUS_CONFIG[detail.status] || STATUS_CONFIG.booked;
  const [showActionSheet, setShowActionSheet] = useState(false);

  // 快捷操作
  const quickActions = [
    { icon: CreditCard, label: "收费记录", color: "text-sky-600" },
    { icon: FileText, label: "病历记录", color: "text-emerald-600" },
    { icon: Image, label: "影像记录", color: "text-purple-600" },
    { icon: MessageSquare, label: "发短信", color: "text-amber-600" },
  ];

  // 详情字段
  const detailFields = [
    { label: "日期", value: `${detail.date} ${detail.time}` },
    { label: "诊所", value: detail.clinic },
    { label: "医生", value: detail.doctor },
    { label: "咨询师", value: detail.consultant },
    { label: "助理", value: detail.assistant },
    { label: "项目", value: detail.project },
    { label: "诊室", value: detail.room || "未指定" },
    { label: "科室", value: detail.department || "未指定" },
    { label: "预约来源", value: detail.source },
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
          <span className="text-base font-medium">预约详情</span>
          <button onClick={() => setShowActionSheet(true)} className="p-1">
            <Plus size={20} />
          </button>
        </div>
      </div>

      {/* 状态标签 */}
      <div className="bg-white px-4 py-3 border-b border-gray-100">
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${statusInfo.bg} ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>

      {/* 患者信息卡片 */}
      <div className="bg-white mx-4 mt-3 rounded-lg p-4 shadow-sm border border-gray-50">
        <div className="flex items-center gap-3">
          {/* 头像 */}
          <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="1.5">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20c0-4 4-7 8-7s8 3 8 7" />
            </svg>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-medium text-gray-800">{detail.patientName}</span>
              <span className="text-xs text-gray-500">{detail.patientAge}岁</span>
              <span className="text-xs text-gray-500">{detail.gender === "female" ? "女" : "男"}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              {detail.tags.map((tag, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 border border-sky-200">
                  {tag}
                </span>
              ))}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {detail.patientId} - {detail.clinic}
            </div>
          </div>
          <ChevronRight size={16} className="text-gray-300" />
        </div>
      </div>

      {/* 快捷操作 */}
      <div className="bg-white mx-4 mt-3 rounded-lg p-4 shadow-sm border border-gray-50">
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map((action, i) => (
            <button key={i} className="flex flex-col items-center gap-1.5">
              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
                <action.icon size={18} className={action.color} />
              </div>
              <span className="text-[11px] text-gray-600">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 详细信息 */}
      <div className="bg-white mx-4 mt-3 rounded-lg shadow-sm border border-gray-50 overflow-hidden">
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
        <button className="w-full py-2.5 text-center text-sm text-sky-600 bg-white rounded-lg border border-sky-200">
          查看变更记录
        </button>
        <button
          className="w-full py-2.5 text-center text-sm text-white bg-gradient-to-r from-sky-500 to-sky-400 rounded-lg shadow-sm"
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
