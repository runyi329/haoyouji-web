/**
 * 牙伴 - 创建随访记录/创建随访计划
 * 路由：/yaban/followup/create?type=record|plan
 * 淡蓝色系风格
 * 表单字段：选择患者、就诊时间、随访时间、随访类型、随访医生、随访人员、
 *          随访项目、随访内容（选择+输入）、沟通方式、随访状态、满意度、随访结果（选择+输入）、备注
 */
import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { ChevronRight, User } from "lucide-react";
import { PageTag } from "@/components/PageTag";

// 选项配置
const FOLLOW_UP_TYPES = ["术后回访", "定期复查", "治疗提醒", "满意度调查", "其他"];
const COMMUNICATION_METHODS = ["电话", "微信", "短信", "面访", "其他"];
const FOLLOW_UP_STATUS = ["待计划", "随访完成", "未成功", "已取消"];
const SATISFACTION_LEVELS = ["非常满意", "满意", "一般", "不满意", "非常不满意"];
const FOLLOW_UP_RESULTS = ["已预约", "考虑中", "拒绝", "无法联系", "其他"];

// 模拟随访内容选项
const CONTENT_OPTIONS = [
  "提醒半年洗牙的重要性，可以早期发现蛀牙",
  "提醒1年/半年洗牙的重要性，可以早期发现蛀牙",
  "种植牙一年定期复查",
  "洁牙",
  "术后注意事项提醒",
];

interface FormData {
  patientId: number | null;
  patientName: string;
  visitTime: string;
  followUpTime: string;
  followUpType: string;
  doctor: string;
  staff: string;
  project: string;
  contentOption: string;
  contentText: string;
  communicationMethod: string;
  status: string;
  satisfaction: string;
  resultOption: string;
  resultText: string;
  remark: string;
}

export default function YabanFollowUpCreate() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const isRecord = params.get("type") !== "plan";
  const title = isRecord ? "创建随访记录" : "创建随访计划";

  const [formData, setFormData] = useState<FormData>({
    patientId: null,
    patientName: "",
    visitTime: "",
    followUpTime: "",
    followUpType: "",
    doctor: "",
    staff: "",
    project: "",
    contentOption: "",
    contentText: "",
    communicationMethod: "",
    status: isRecord ? "随访完成" : "待计划",
    satisfaction: "",
    resultOption: "",
    resultText: "",
    remark: "",
  });

  // 弹出选择器状态
  const [showPicker, setShowPicker] = useState<string | null>(null);

  const handleBack = () => {
    setLocation("/yaban/followup");
  };

  const handleSelectPatient = () => {
    setLocation("/yaban/followup/patient-select");
  };

  const handleFieldSelect = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setShowPicker(null);
  };

  const handleSave = () => {
    // TODO: 提交到后端
    alert("保存成功");
    setLocation("/yaban/followup");
  };

  // 获取选项列表
  const getPickerOptions = (field: string): string[] => {
    switch (field) {
      case "followUpType": return FOLLOW_UP_TYPES;
      case "communicationMethod": return COMMUNICATION_METHODS;
      case "status": return FOLLOW_UP_STATUS;
      case "satisfaction": return SATISFACTION_LEVELS;
      case "resultOption": return FOLLOW_UP_RESULTS;
      case "contentOption": return CONTENT_OPTIONS;
      default: return [];
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={handleBack} className="text-sky-500 text-base font-medium">
            取消
          </button>
          <h1 className="text-base font-semibold text-gray-900">{title}</h1>
          <div className="w-10" />
        </div>
      </div>

      {/* 患者选择区域 */}
      <div className="bg-white mb-2">
        <button
          onClick={handleSelectPatient}
          className="w-full flex items-center justify-between px-4 py-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-sky-50 flex items-center justify-center">
              <User className="w-6 h-6 text-sky-400" />
            </div>
            {formData.patientName ? (
              <div className="text-left">
                <p className="text-base font-medium text-gray-900">{formData.patientName}</p>
              </div>
            ) : (
              <span className="text-gray-400 text-base">请选择患者</span>
            )}
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </button>
      </div>

      {/* 表单区域 - 上半部分 */}
      <div className="bg-white mb-2">
        {/* 就诊时间 */}
        <FormRow
          label="就诊时间"
          value={formData.visitTime}
          placeholder="请选择就诊时间"
          onClick={() => {
            const now = new Date();
            const formatted = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
            setFormData((prev) => ({ ...prev, visitTime: formatted }));
          }}
        />
        {/* 随访时间 */}
        <FormRow
          label="随访时间"
          value={formData.followUpTime}
          placeholder="请选择随访时间"
          onClick={() => {
            const now = new Date();
            const formatted = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}`;
            setFormData((prev) => ({ ...prev, followUpTime: formatted }));
          }}
        />
        {/* 随访类型 */}
        <FormRow
          label="随访类型"
          value={formData.followUpType}
          placeholder="请选择随访类型"
          onClick={() => setShowPicker("followUpType")}
        />
        {/* 随访医生 */}
        <FormRow
          label="随访医生"
          value={formData.doctor}
          placeholder="请选择随访医生"
          onClick={() => setFormData((prev) => ({ ...prev, doctor: "鲁毅" }))}
        />
        {/* 随访人员 */}
        <FormRow
          label="随访人员"
          value={formData.staff}
          placeholder="请选择随访人员"
          onClick={() => setFormData((prev) => ({ ...prev, staff: "洪紫钥" }))}
        />
        {/* 随访项目 */}
        <FormRow
          label="随访项目"
          value={formData.project}
          placeholder="请选择随访项目"
          onClick={() => setFormData((prev) => ({ ...prev, project: "洁牙" }))}
        />
        {/* 随访内容 - 选择 */}
        <FormRow
          label="随访内容"
          value={formData.contentOption}
          placeholder="请选择随访内容"
          onClick={() => setShowPicker("contentOption")}
        />
        {/* 随访内容 - 输入 */}
        <div className="px-4 py-3 border-b border-gray-50">
          <input
            type="text"
            value={formData.contentText}
            onChange={(e) => setFormData((prev) => ({ ...prev, contentText: e.target.value }))}
            placeholder="输入随访内容"
            className="w-full text-sm text-gray-400 placeholder-gray-300 outline-none"
          />
        </div>
      </div>

      {/* 表单区域 - 下半部分 */}
      <div className="bg-white mb-2">
        {/* 沟通方式 */}
        <FormRow
          label="沟通方式"
          value={formData.communicationMethod}
          placeholder="请选择沟通方式"
          onClick={() => setShowPicker("communicationMethod")}
        />
        {/* 随访状态 */}
        <FormRow
          label="随访状态"
          value={formData.status}
          placeholder="请选择随访状态"
          onClick={() => setShowPicker("status")}
        />
        {/* 满意度 */}
        <FormRow
          label="满意度"
          value={formData.satisfaction}
          placeholder="请选择满意度"
          onClick={() => setShowPicker("satisfaction")}
        />
        {/* 随访结果 - 选择 */}
        <FormRow
          label="随访结果"
          value={formData.resultOption}
          placeholder="请选择随访结果"
          onClick={() => setShowPicker("resultOption")}
        />
        {/* 随访结果 - 输入 */}
        <div className="px-4 py-3 border-b border-gray-50">
          <input
            type="text"
            value={formData.resultText}
            onChange={(e) => setFormData((prev) => ({ ...prev, resultText: e.target.value }))}
            placeholder="输入随访结果"
            className="w-full text-sm text-gray-400 placeholder-gray-300 outline-none"
          />
        </div>
      </div>

      {/* 备注区域 */}
      <div className="bg-white mb-4">
        <div className="px-4 py-3">
          <p className="text-sm font-medium text-gray-900 mb-2">备注</p>
          <textarea
            value={formData.remark}
            onChange={(e) => setFormData((prev) => ({ ...prev, remark: e.target.value }))}
            placeholder="输入备注"
            rows={3}
            className="w-full text-sm text-gray-600 placeholder-gray-300 outline-none resize-none"
          />
        </div>
      </div>

      {/* 保存按钮 */}
      <div className="px-4 pb-8 mt-auto">
        <button
          onClick={handleSave}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-400 text-white text-base font-semibold shadow-lg shadow-sky-200/50 active:opacity-80 transition-opacity"
        >
          保存
        </button>
      </div>

      {/* 选择器弹出层 */}
      {showPicker && (
        <div className="fixed inset-0 z-[100]">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowPicker(null)}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl overflow-hidden max-h-[60vh]">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
              <span className="text-base font-medium text-gray-900">
                请选择
              </span>
              <button
                onClick={() => setShowPicker(null)}
                className="text-sky-500 text-sm font-medium"
              >
                取消
              </button>
            </div>
            <div className="overflow-y-auto max-h-[50vh]">
              {getPickerOptions(showPicker).map((option) => (
                <button
                  key={option}
                  onClick={() => handleFieldSelect(
                    showPicker === "contentOption" ? "contentOption" :
                    showPicker === "resultOption" ? "resultOption" :
                    showPicker,
                    option
                  )}
                  className="w-full px-4 py-3.5 text-left text-sm text-gray-700 border-b border-gray-50 active:bg-gray-50 transition-colors"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <PageTag code="P302" />
    </div>
  );
}

// 表单行组件
function FormRow({
  label,
  value,
  placeholder,
  onClick,
}: {
  label: string;
  value: string;
  placeholder: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3.5 border-b border-gray-50 active:bg-gray-50 transition-colors"
    >
      <span className="text-sm font-medium text-gray-900">{label}</span>
      <div className="flex items-center gap-1">
        <span className={`text-sm ${value ? "text-gray-700" : "text-gray-400"}`}>
          {value || placeholder}
        </span>
        <ChevronRight className="w-4 h-4 text-gray-300" />
      </div>
    </button>
  );
}
