/**
 * 牙伴齿科管理 - 新建预约页
 * 路由：/yaban/schedule/create
 * 表单：患者、时间、诊所、医生、咨询师、助理、项目、诊室、科室、预约来源、备注
 */
import { useState } from "react";
import { PageTag } from "@/components/PageTag";
import { useLocation } from "wouter";
import { ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";

// 静态选项（医生从API动态获取）
const DOCTORS_FALLBACK = ["郑莹", "易家宝", "李华超", "鲁毅", "梅刚"];
const CONSULTANTS = ["洪紫钥", "杨文利", "侯睿"];
const ASSISTANTS = ["张助理", "李助理"];
const ROOMS = ["1号诊室", "2号诊室", "3号诊室", "VIP诊室"];
const DEPARTMENTS = ["口腔综合科", "正畸科", "种植科", "牙周科"];
const SOURCES = ["电话预约", "微信预约", "到店预约", "转介绍", "网络预约"];
const PROJECTS = ["洁牙", "补牙", "拔牙", "种植", "正畸", "根管治疗", "美白", "贴面", "牙冠"];

interface FormData {
  patientName: string;
  patientId: string;
  date: string;
  startTime: string;
  endTime: string;
  clinic: string;
  doctor: string;
  consultant: string;
  assistant: string;
  project: string;
  room: string;
  department: string;
  source: string;
  remark: string;
}

export default function YabanScheduleCreate() {
  const [, setLocation] = useLocation();
  const [showPicker, setShowPicker] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { currentTenantId, current } = useYabanClinic();
  const clinicName = current?.name?.trim() || current?.shortName?.trim() || "";

  // 从API获取员工（医生）列表
  const { data: membersData } = trpc.yabanAppointment.listMembers.useQuery({ tenantId: currentTenantId ?? undefined });
  const DOCTORS = membersData?.map((m: any) => m.name).filter(Boolean) as string[] || DOCTORS_FALLBACK;

  // 创建预约 mutation
  const createAppointment = trpc.yabanAppointment.create.useMutation({
    onSuccess: () => { setSubmitting(false); setLocation("/yaban/schedule"); },
    onError: (err) => { setSubmitting(false); alert(err.message || "创建失败，请重试"); },
  });
  const [form, setForm] = useState<FormData>({
    patientName: "",
    patientId: "",
    date: new Date().toISOString().split("T")[0],
    startTime: "09:00",
    endTime: "09:30",
    clinic: "",
    doctor: "",
    consultant: "",
    assistant: "",
    project: "",
    room: "",
    department: "",
    source: "",
    remark: "",
  });

  const handleSelectPatient = () => {
    setLocation("/yaban/followup/patient-select");
  };

  const handleSave = () => {
    if (!form.patientName) { alert("请选择顾客"); return; }
    if (!form.doctor) { alert("请选择医生"); return; }
    if (!form.project) { alert("请选择项目"); return; }
    if (submitting) return;
    setSubmitting(true);
    createAppointment.mutate({
      tenantId: currentTenantId ?? undefined,
      patientName: form.patientName,
      appointDate: form.date,
      appointTime: form.startTime,
      endTime: form.endTime,
      doctor: form.doctor,
      project: form.project,
      room: form.room || undefined,
      remark: form.remark || undefined,
    });
  };

  const handlePickerSelect = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setShowPicker(null);
  };

  // 表单行组件
  const FormRow = ({
    label,
    value,
    placeholder,
    onClick,
    isInput,
    inputType,
    field,
  }: {
    label: string;
    value: string;
    placeholder: string;
    onClick?: () => void;
    isInput?: boolean;
    inputType?: string;
    field?: string;
  }) => (
    <div
      className="flex items-center justify-between px-4 py-3.5 border-b border-gray-50 active:bg-gray-50"
      onClick={onClick}
    >
      <span className="text-sm text-gray-700 shrink-0">{label}</span>
      {isInput ? (
        <input
          type={inputType || "text"}
          value={value}
          placeholder={placeholder}
          className="text-sm text-right text-gray-800 bg-transparent outline-none flex-1 ml-4 placeholder:text-gray-300"
          onChange={(e) => field && setForm((prev) => ({ ...prev, [field]: e.target.value }))}
        />
      ) : (
        <div className="flex items-center gap-1">
          <span className={`text-sm ${value ? "text-gray-800" : "text-gray-300"}`}>
            {value || placeholder}
          </span>
          <ChevronRight size={14} className="text-gray-300" />
        </div>
      )}
    </div>
  );

  // 获取picker选项
  const getPickerOptions = (): string[] => {
    switch (showPicker) {
      case "doctor": return DOCTORS;
      case "consultant": return CONSULTANTS;
      case "assistant": return ASSISTANTS;
      case "room": return ROOMS;
      case "department": return DEPARTMENTS;
      case "source": return SOURCES;
      case "project": return PROJECTS;
      default: return [];
    }
  };

  const getPickerTitle = (): string => {
    switch (showPicker) {
      case "doctor": return "选择医生";
      case "consultant": return "选择咨询师";
      case "assistant": return "选择助理";
      case "room": return "选择诊室";
      case "department": return "选择科室";
      case "source": return "选择预约来源";
      case "project": return "选择项目";
      default: return "";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航栏 */}
      <div className="bg-gradient-to-r from-sky-500 to-sky-400 text-white px-4 pt-12 pb-3">
        <div className="flex items-center justify-between">
          <button onClick={() => setLocation("/yaban/schedule")} className="text-sm">
            取消
          </button>
          <div className="flex flex-col items-center">
            <span className="text-base font-medium leading-tight">新建预约</span>
            {clinicName && <span className="text-[11px] font-normal text-white/80 leading-tight mt-0.5">所属：{clinicName}</span>}
          </div>
          <div className="w-8" />
        </div>
      </div>

      {/* 患者选择 */}
      <div
        className="bg-white mt-3 px-4 py-4 flex items-center gap-3 active:bg-gray-50"
        onClick={handleSelectPatient}
      >
        <div className="w-11 h-11 rounded-full bg-sky-100 flex items-center justify-center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="1.5">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 4-7 8-7s8 3 8 7" />
          </svg>
        </div>
        {form.patientName ? (
          <div className="flex-1">
            <span className="text-sm font-medium text-gray-800">{form.patientName}</span>
            {form.patientId && (
              <span className="text-xs text-gray-400 ml-2">{form.patientId}</span>
            )}
          </div>
        ) : (
          <span className="flex-1 text-sm text-gray-400">请选择顾客</span>
        )}
        <ChevronRight size={16} className="text-gray-300" />
      </div>

      {/* 时间信息 */}
      <div className="bg-white mt-3">
        <FormRow
          label="日期"
          value={form.date}
          placeholder="请选择日期"
          isInput
          inputType="date"
          field="date"
        />
        <FormRow
          label="开始时间"
          value={form.startTime}
          placeholder="请选择"
          isInput
          inputType="time"
          field="startTime"
        />
        <FormRow
          label="结束时间"
          value={form.endTime}
          placeholder="请选择"
          isInput
          inputType="time"
          field="endTime"
        />
      </div>

      {/* 预约信息 */}
      <div className="bg-white mt-3">
        <FormRow
          label="诊所"
          value={form.clinic || clinicName}
          placeholder="当前所属医院"
          isInput
          field="clinic"
        />
        <FormRow
          label="医生"
          value={form.doctor}
          placeholder="请选择医生"
          onClick={() => setShowPicker("doctor")}
        />
        <FormRow
          label="咨询师"
          value={form.consultant}
          placeholder="请选择咨询师"
          onClick={() => setShowPicker("consultant")}
        />
        <FormRow
          label="助理"
          value={form.assistant}
          placeholder="请选择助理"
          onClick={() => setShowPicker("assistant")}
        />
        <FormRow
          label="项目"
          value={form.project}
          placeholder="请选择项目"
          onClick={() => setShowPicker("project")}
        />
        <FormRow
          label="诊室"
          value={form.room}
          placeholder="请选择诊室"
          onClick={() => setShowPicker("room")}
        />
        <FormRow
          label="科室"
          value={form.department}
          placeholder="请选择科室"
          onClick={() => setShowPicker("department")}
        />
        <FormRow
          label="预约来源"
          value={form.source}
          placeholder="请选择来源"
          onClick={() => setShowPicker("source")}
        />
      </div>

      {/* 备注 */}
      <div className="bg-white mt-3 px-4 py-3">
        <span className="text-sm text-gray-700">备注</span>
        <textarea
          value={form.remark}
          onChange={(e) => setForm((prev) => ({ ...prev, remark: e.target.value }))}
          placeholder="输入备注"
          className="w-full mt-2 text-sm text-gray-800 bg-transparent outline-none resize-none placeholder:text-gray-300"
          rows={3}
        />
      </div>

      {/* 保存按钮 */}
      <div className="px-4 mt-6 pb-8">
        <button
          onClick={handleSave}
          className="w-full py-3 text-center text-sm text-white font-medium bg-gradient-to-r from-sky-500 to-cyan-400 rounded-lg shadow-sm active:opacity-80"
        >
          {submitting ? "保存中..." : "保存"}
        </button>
      </div>

      {/* 选项Picker弹窗 */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="flex-1 bg-black/30" onClick={() => setShowPicker(null)} />
          <div className="bg-white rounded-t-xl max-h-[60vh] overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <button className="text-sm text-gray-400" onClick={() => setShowPicker(null)}>
                取消
              </button>
              <span className="text-sm font-medium text-gray-800">{getPickerTitle()}</span>
              <div className="w-8" />
            </div>
            <div className="overflow-y-auto">
              {getPickerOptions().map((option) => (
                <button
                  key={option}
                  className={`w-full px-4 py-3.5 text-left text-sm border-b border-gray-50 active:bg-sky-50 ${
                    form[showPicker as keyof FormData] === option
                      ? "text-sky-600 bg-sky-50"
                      : "text-gray-700"
                  }`}
                  onClick={() => handlePickerSelect(showPicker, option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <PageTag code="P323" />
    </div>
  );
}
