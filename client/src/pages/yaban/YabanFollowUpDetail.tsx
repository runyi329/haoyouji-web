/**
 * 牙伴 - 随访详情页
 * 路由：/yaban/followup/detail/:id
 * 淡蓝色系风格，顶部状态横幅 + 患者信息卡片 + 详细信息列表 + 底部操作栏
 */
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  ChevronLeft,
  MoreVertical,
  Phone,
  User,
  Calendar,
  Clock,
  UserCheck,
  FileText,
  Stethoscope,
  ClipboardList,
} from "lucide-react";

// 状态颜色映射
const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string; banner: string }> = {
  pending: { bg: "bg-amber-50", text: "text-amber-700", label: "待计划", banner: "bg-gradient-to-r from-amber-400 to-amber-300" },
  completed: { bg: "bg-sky-50", text: "text-sky-700", label: "随访完成", banner: "bg-gradient-to-r from-sky-500 to-sky-400" },
  failed: { bg: "bg-red-50", text: "text-red-600", label: "未成功", banner: "bg-gradient-to-r from-red-400 to-red-300" },
  cancelled: { bg: "bg-gray-100", text: "text-gray-600", label: "已取消", banner: "bg-gradient-to-r from-gray-400 to-gray-300" },
  overdue: { bg: "bg-red-50", text: "text-red-600", label: "已超时", banner: "bg-gradient-to-r from-red-500 to-red-400" },
};

// 模拟随访详情数据
const MOCK_DETAIL = {
  id: 1,
  status: "pending",
  isOverdue: true,
  patient: {
    name: "白扬",
    gender: "male",
    age: 32,
    phone: "138****5678",
    medicalNo: "006821",
  },
  visitTime: "2026-05-29 10:30",
  createTime: "2026-05-20 14:22",
  creator: "杨文利",
  followUpType: "术后随访",
  planTime: "2026-05-29",
  followUpDoctor: "郑奎",
  followUpStaff: "杨文利",
  followUpProject: "洁牙美白",
  followUpContent: "问下洁牙美白术后，邀约补牙拔除残根，是否矫正？",
  result: "",
  remark: "",
};

export default function YabanFollowUpDetail() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const [showMenu, setShowMenu] = useState(false);

  const detail = MOCK_DETAIL;
  const statusKey = detail.isOverdue ? "overdue" : detail.status;
  const statusConfig = STATUS_CONFIG[statusKey] || STATUS_CONFIG.pending;

  const handleBack = () => {
    navigate("/yaban/followup");
  };

  const handleExecute = () => {
    // 执行随访操作
  };

  const handleReFollowUp = () => {
    // 再随访操作
    navigate("/yaban/followup/create");
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <div className={`${statusConfig.banner} text-white`}>
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={handleBack} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-lg font-bold">随访详情</span>
          <div className="relative">
            <button onClick={() => setShowMenu(!showMenu)} className="p-1">
              <MoreVertical className="w-6 h-6" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg py-1 w-32 z-50">
                <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  编辑
                </button>
                <button className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-gray-50">
                  删除
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
            计划时间: {detail.planTime}
          </p>
        </div>
      </div>

      {/* 患者信息卡片 */}
      <div className="bg-white mx-3 -mt-2 rounded-xl shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-sky-100 flex items-center justify-center">
              <User className="w-6 h-6 text-sky-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900">{detail.patient.name}</span>
                <span className="text-xs text-gray-500">
                  {detail.patient.gender === "male" ? "男" : "女"} . {detail.patient.age}岁
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                病历号: {detail.patient.medicalNo}
              </div>
            </div>
          </div>
          <button className="w-10 h-10 rounded-full bg-sky-50 flex items-center justify-center">
            <Phone className="w-5 h-5 text-sky-600" />
          </button>
        </div>
      </div>

      {/* 详细信息列表 */}
      <div className="bg-white mx-3 mt-3 rounded-xl shadow-sm">
        <div className="px-4 py-3 border-b border-gray-50">
          <span className="text-sm font-bold text-gray-900">随访信息</span>
        </div>

        <div className="divide-y divide-gray-50">
          <InfoRow
            icon={<Calendar className="w-4 h-4 text-sky-500" />}
            label="就诊时间"
            value={detail.visitTime}
          />
          <InfoRow
            icon={<Clock className="w-4 h-4 text-sky-500" />}
            label="创建时间"
            value={detail.createTime}
          />
          <InfoRow
            icon={<UserCheck className="w-4 h-4 text-sky-500" />}
            label="创建人"
            value={detail.creator}
          />
          <InfoRow
            icon={<FileText className="w-4 h-4 text-sky-500" />}
            label="随访类型"
            value={detail.followUpType}
          />
          <InfoRow
            icon={<Calendar className="w-4 h-4 text-sky-500" />}
            label="计划时间"
            value={detail.planTime}
          />
          <InfoRow
            icon={<Stethoscope className="w-4 h-4 text-sky-500" />}
            label="随访医生"
            value={detail.followUpDoctor}
          />
          <InfoRow
            icon={<User className="w-4 h-4 text-sky-500" />}
            label="随访人员"
            value={detail.followUpStaff}
          />
          <InfoRow
            icon={<ClipboardList className="w-4 h-4 text-sky-500" />}
            label="随访项目"
            value={detail.followUpProject}
          />
        </div>
      </div>

      {/* 随访内容 */}
      <div className="bg-white mx-3 mt-3 rounded-xl shadow-sm p-4">
        <div className="text-sm font-bold text-gray-900 mb-2">随访内容</div>
        <p className="text-sm text-gray-600 leading-relaxed">
          {detail.followUpContent || "暂无内容"}
        </p>
      </div>

      {/* 随访结果 */}
      {detail.result && (
        <div className="bg-white mx-3 mt-3 rounded-xl shadow-sm p-4">
          <div className="text-sm font-bold text-gray-900 mb-2">随访结果</div>
          <p className="text-sm text-gray-600 leading-relaxed">
            {detail.result}
          </p>
        </div>
      )}

      {/* 备注 */}
      {detail.remark && (
        <div className="bg-white mx-3 mt-3 rounded-xl shadow-sm p-4 mb-20">
          <div className="text-sm font-bold text-gray-900 mb-2">备注</div>
          <p className="text-sm text-gray-600 leading-relaxed">
            {detail.remark}
          </p>
        </div>
      )}

      {/* 占位，防止底部操作栏遮挡 */}
      <div className="h-20" />

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 flex gap-3">
        <button
          onClick={handleReFollowUp}
          className="flex-1 py-3 rounded-lg border border-sky-500 text-sky-600 font-bold text-sm"
        >
          再随访
        </button>
        <button
          onClick={handleExecute}
          className="flex-1 py-3 rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 text-white font-bold text-sm shadow-sm"
        >
          执行随访
        </button>
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
