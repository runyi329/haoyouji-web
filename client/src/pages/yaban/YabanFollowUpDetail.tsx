/**
 * 牙伴 - 随访详情页
 * 路由：/yaban/followup/detail/:id
 * 淡蓝色系风格，顶部状态横幅 + 患者信息卡片 + 详细信息列表 + 底部操作栏
 * 数据来源：trpc.yabanComm.followupDetail（真实随访记录）
 * 支持执行随访（更新状态）、查看该客户的售前售后时间线
 */
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useYabanClinic } from "./useYabanClinic";
import { trpc } from "@/lib/trpc";
import {
  ChevronLeft,
  MoreVertical,
  Phone,
  User,
  Calendar,
  Clock,
  UserCheck,
  FileText,
  User as UserIcon,
  MessageSquare,
} from "lucide-react";

// 中文状态 -> 样式 key
const STATUS_TO_KEY: Record<string, string> = {
  "待计划": "pending",
  "随访完成": "completed",
  "未成功": "failed",
  "已取消": "cancelled",
};

// 状态颜色映射
const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string; banner: string }> = {
  pending: { bg: "bg-amber-50", text: "text-amber-700", label: "待计划", banner: "bg-gradient-to-r from-amber-400 to-amber-300" },
  completed: { bg: "bg-sky-50", text: "text-sky-700", label: "随访完成", banner: "bg-gradient-to-r from-sky-500 to-sky-400" },
  failed: { bg: "bg-red-50", text: "text-red-600", label: "未成功", banner: "bg-gradient-to-r from-red-400 to-red-300" },
  cancelled: { bg: "bg-gray-100", text: "text-gray-600", label: "已取消", banner: "bg-gradient-to-r from-gray-400 to-gray-300" },
  overdue: { bg: "bg-red-50", text: "text-red-600", label: "已超时", banner: "bg-gradient-to-r from-red-500 to-red-400" },
};

export default function YabanFollowUpDetail() {
  const [, navigate] = useLocation();
  const { current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [showMenu, setShowMenu] = useState(false);

  const { data: detail, isLoading, refetch } = trpc.yabanComm.followupDetail.useQuery(
    { id },
    { enabled: !isNaN(id) && id > 0 }
  );
  const updateStatus = trpc.yabanComm.updateFollowupStatus.useMutation();

  const handleBack = () => {
    navigate("/yaban/followup");
  };

  const handleExecute = async () => {
    if (!detail) return;
    try {
      await updateStatus.mutateAsync({ id: detail.id, status: "随访完成" });
      await refetch();
      alert("随访已标记为完成");
    } catch (e: any) {
      alert(`操作失败：${e?.message || "请重试"}`);
    }
  };

  const handleReFollowUp = () => {
    navigate("/yaban/followup/create");
  };

  // 跳转到该客户的售前售后时间线（真实 customerId）
  const handleViewComm = () => {
    if (detail?.customerId) {
      navigate(`/yaban/patient/${detail.customerId}/comm`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-sm text-gray-400">
        加载中…
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-gray-400">随访记录不存在</p>
        <button onClick={handleBack} className="text-sky-500 text-sm">返回列表</button>
      </div>
    );
  }

  const statusKey = detail.isOverdue ? "overdue" : (STATUS_TO_KEY[detail.status] || "pending");
  const statusConfig = STATUS_CONFIG[statusKey] || STATUS_CONFIG.pending;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <div className={`${statusConfig.banner} text-white`}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={handleBack} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold leading-tight">随访详情</span>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)} className="p-1">
              <MoreVertical className="w-6 h-6" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded shadow-lg py-1 w-32 z-50">
                <button
                  onClick={async () => {
                    setShowMenu(false);
                    if (confirm("确定取消该随访？")) {
                      await updateStatus.mutateAsync({ id: detail.id, status: "已取消" });
                      await refetch();
                    }
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-gray-50"
                >
                  取消随访
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 状态横幅 */}
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{statusConfig.label}</span>
            {detail.isOverdue && (
              <span className="px-2 py-0.5 bg-white/20 rounded text-xs">
                已超时
              </span>
            )}
          </div>
          <p className="text-white/80 text-sm mt-1">
            计划时间: {detail.planTime || "-"}
          </p>
        </div>
      </div>

      {/* 患者信息卡片 */}
      <div className="bg-white mx-3 -mt-2 rounded-md shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-md bg-sky-100 flex items-center justify-center">
              <User className="w-6 h-6 text-sky-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900">{detail.patientName}</span>
                <span className="text-xs text-gray-500">
                  {detail.gender === "male" ? "男" : "女"}
                  {detail.age != null && ` · ${detail.age}岁`}
                </span>
              </div>
              {detail.medicalNo && (
                <div className="text-xs text-gray-500 mt-0.5">
                  病历号: {detail.medicalNo}
                </div>
              )}
            </div>
          </div>
          {detail.phone && (
            <a href={`tel:${detail.phone}`} className="w-10 h-10 rounded-md bg-sky-50 flex items-center justify-center">
              <Phone className="w-5 h-5 text-sky-600" />
            </a>
          )}
        </div>
      </div>

      {/* 详细信息列表 */}
      <div className="bg-white mx-3 mt-3 rounded-md shadow-sm">
        <div className="px-4 py-3 border-b border-gray-50">
          <span className="text-sm font-bold text-gray-900">随访信息</span>
        </div>

        <div className="divide-y divide-gray-50">
          <InfoRow icon={<Calendar className="w-4 h-4 text-sky-500" />} label="就诊时间" value={detail.visitTime} />
          <InfoRow icon={<Clock className="w-4 h-4 text-sky-500" />} label="创建时间" value={detail.createTime} />
          <InfoRow icon={<UserCheck className="w-4 h-4 text-sky-500" />} label="创建人" value={detail.creator} />
          <InfoRow icon={<Calendar className="w-4 h-4 text-sky-500" />} label="计划时间" value={detail.planTime} />
          <InfoRow icon={<UserIcon className="w-4 h-4 text-sky-500" />} label="随访人员" value={detail.followUpStaff} />
          {detail.demand && (
            <InfoRow icon={<FileText className="w-4 h-4 text-sky-500" />} label="附加信息" value={detail.demand} />
          )}
        </div>
      </div>

      {/* 随访内容 */}
      <div className="bg-white mx-3 mt-3 rounded-md shadow-sm p-4">
        <div className="text-sm font-bold text-gray-900 mb-2">随访内容</div>
        <p className="text-sm text-gray-600 leading-relaxed">
          {detail.followUpContent || "暂无内容"}
        </p>
      </div>

      {/* 备注 */}
      {detail.remark && (
        <div className="bg-white mx-3 mt-3 rounded-md shadow-sm p-4">
          <div className="text-sm font-bold text-gray-900 mb-2">备注</div>
          <p className="text-sm text-gray-600 leading-relaxed">
            {detail.remark}
          </p>
        </div>
      )}

      {/* 占位，防止底部操作栏遮挡 */}
      <div className="h-32" />

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 space-y-2">
        {/* 查看沟通记录 - 快捷入口 */}
        <button
          onClick={handleViewComm}
          className="w-full py-2.5 rounded bg-sky-50 border border-sky-200 text-sky-600 font-medium text-sm flex items-center justify-center gap-2"
        >
          <MessageSquare size={15} />
          查看沟通记录（售前售后）
        </button>
        {/* 主操作 */}
        <div className="flex gap-3">
          <button
            onClick={handleReFollowUp}
            className="flex-1 py-3 rounded border border-sky-500 text-sky-600 font-bold text-sm"
          >
            再随访
          </button>
          <button
            onClick={handleExecute}
            disabled={detail.status === "随访完成" || updateStatus.isLoading}
            className="flex-1 py-3 rounded bg-gradient-to-r from-sky-500 to-sky-400 text-white font-bold text-sm shadow-sm disabled:opacity-50"
          >
            {detail.status === "随访完成" ? "已完成" : "执行随访"}
          </button>
        </div>
      </div>
    </div>
  );
}

// 信息行组件
function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center px-4 py-3">
      <div className="flex items-center gap-2 w-24 flex-shrink-0">
        {icon}
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <span className="text-sm text-gray-900 flex-1">{value || "-"}</span>
    </div>
  );
}
