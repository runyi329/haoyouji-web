/**
 * 牙伴齿科管理 - 新建顾客
 * 路由：/yaban/patient/create
 * 蓝白风格，5 个 Tab：个人信息 / 联系方式 / 顾客信息 / 首诊信息 / 自由项
 * 顶栏：取消 / 新建顾客 / 保存；含「仅显示必填字段」开关
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight, Plus, MinusCircle, XCircle } from "lucide-react";
import { PageTag } from "@/components/PageTag";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// 主题色
const ACCENT = "#1E88D6";

// Tab 定义
const TABS = ["个人信息", "联系方式", "顾客信息", "首诊信息", "自由项"] as const;
type Tab = (typeof TABS)[number];

// 选项配置
const GENDERS = ["未知", "男", "女"];
const PATIENT_TYPES = ["电子", "纸质"];
const SOURCES = ["到店", "转介绍", "网络预约", "电话预约", "微信预约", "老顾客推荐", "其他"];
const NET_CONSULTANTS = ["杨文利", "侯睿", "洪紫钥"];
const CONSULTANTS = ["洪紫钥", "杨文利", "侯睿"];
const MEDICAL_HISTORY = ["无", "高血压", "糖尿病", "心脏病", "过敏史", "其他"];
const REGIONS = ["上海市-黄浦区", "上海市-普陀区", "上海市-虹口区", "上海市-浦东新区", "其他"];
const CHIEF_COMPLAINTS = ["牙疼", "牙齿松动", "洗牙清洁", "缺牙修复", "牙齿矫正", "美白贴面", "智齿冠周炎", "其他"];
const HEALTH_STATUS = ["健康", "亚健康", "慢性病", "其他"];
const YES_NO = ["否", "是", "不详"];
const PREGNANT = ["否", "是", "备孕中", "不适用"];

// 字段类型
type FieldKind = "input" | "select" | "textarea";

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  kind: FieldKind;
  required?: boolean;
  options?: string[];
  inputType?: string;
}

// 各 Tab 字段配置
const TAB_FIELDS: Record<Tab, FieldDef[]> = {
  个人信息: [
    { key: "name", label: "姓名", placeholder: "请输入姓名", kind: "input", required: true },
    { key: "gender", label: "性别", placeholder: "未知", kind: "select", required: true, options: GENDERS },
    { key: "birthday", label: "生日", placeholder: "请选择生日", kind: "input", required: true, inputType: "date" },
    { key: "age", label: "年龄", placeholder: "请输入年龄", kind: "input", required: true, inputType: "number" },
    { key: "patientType", label: "顾客类型", placeholder: "电子", kind: "select", required: true, options: PATIENT_TYPES },
    { key: "medicalNo", label: "病历号", placeholder: "系统自动生成", kind: "input", required: true },
    { key: "nickname", label: "昵称", placeholder: "请输入昵称", kind: "input" },
  ],
  联系方式: [
    { key: "email", label: "邮箱", placeholder: "请输入邮箱地址", kind: "input", inputType: "email" },
    { key: "mobile", label: "手机号", placeholder: "请输入手机号", kind: "input", required: true, inputType: "tel" },
    { key: "phone", label: "电话", placeholder: "请输入电话号码", kind: "input", inputType: "tel" },
    { key: "region", label: "地区", placeholder: "请选择地区", kind: "select", options: REGIONS },
    { key: "address", label: "地址详情", placeholder: "请输入地址详情", kind: "textarea" },
  ],
  顾客信息: [
    { key: "source", label: "顾客来源", placeholder: "请选择顾客来源", kind: "select", required: true, options: SOURCES },
    { key: "netConsultant", label: "网电咨询师", placeholder: "请选择网电咨询师", kind: "select", options: NET_CONSULTANTS },
    { key: "consultant", label: "咨询师", placeholder: "请选择咨询师", kind: "select", options: CONSULTANTS },
    { key: "history", label: "既往史", placeholder: "请选择既往史", kind: "select", options: MEDICAL_HISTORY },
    { key: "patientRemark", label: "顾客备注", placeholder: "请输入顾客备注", kind: "textarea" },
  ],
  首诊信息: [
    { key: "chiefComplaint", label: "就诊主诉", placeholder: "请选择就诊主诉", kind: "select", options: CHIEF_COMPLAINTS },
  ],
  自由项: [
    { key: "healthStatus", label: "健康状况", placeholder: "请选择健康状况", kind: "select", options: HEALTH_STATUS },
    { key: "drugAllergy", label: "药物过敏史", placeholder: "请输入药物过敏史", kind: "input" },
    { key: "foodAllergy", label: "食物过敏史", placeholder: "请输入食物过敏史", kind: "input" },
    { key: "heart", label: "是否患有心脏病", placeholder: "请选择是否患有", kind: "select", options: YES_NO },
    { key: "hypertension", label: "是否患有高血压", placeholder: "请选择是否患有", kind: "select", options: YES_NO },
    { key: "diabetes", label: "是否患有糖尿病", placeholder: "请选择是否患有", kind: "select", options: YES_NO },
    { key: "kidney", label: "是否患有肾脏病", placeholder: "请选择是否患有", kind: "select", options: YES_NO },
    { key: "infectious", label: "是否患有传染病", placeholder: "请选择是否患有", kind: "select", options: YES_NO },
    { key: "bleeding", label: "是否存在容易出血不止", placeholder: "请选择是否存在", kind: "select", options: YES_NO },
    { key: "pregnant", label: "女性：是否怀孕", placeholder: "请选择是否怀孕", kind: "select", options: PREGNANT },
    { key: "medication", label: "服药史", placeholder: "请输入服药史", kind: "input" },
  ],
};

// 默认病历号（占位生成）
function genMedicalNo(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export default function YabanPatientCreate() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("个人信息");
  const [requiredOnly, setRequiredOnly] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    gender: "未知",
    patientType: "电子",
    medicalNo: genMedicalNo(),
  });

  const setField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleBack = () => {
    setLocation("/yaban");
  };

  const utils = trpc.useUtils();
  const createMutation = trpc.yabanCustomer.create.useMutation({
    onSuccess: () => {
      toast.success("保存成功");
      utils.yabanCustomer.list.invalidate();
      setLocation("/yaban/patients");
    },
    onError: (e) => {
      toast.error(e.message || "保存失败，请重试");
    },
  });

  const handleSave = () => {
    if (createMutation.isPending) return;
    // 校验所有 Tab 的必填字段
    const missing: string[] = [];
    (Object.keys(TAB_FIELDS) as Tab[]).forEach((tab) => {
      TAB_FIELDS[tab].forEach((f) => {
        if (f.required && !form[f.key]?.trim()) {
          missing.push(f.label);
        }
      });
    });
    if (missing.length > 0) {
      toast.error(`请完善必填项：${missing.slice(0, 3).join("、")}${missing.length > 3 ? " 等" : ""}`);
      return;
    }
    createMutation.mutate({
      name: form.name,
      gender: form.gender,
      birthday: form.birthday,
      age: form.age,
      patientType: form.patientType,
      medicalNo: form.medicalNo,
      nickname: form.nickname,
      email: form.email,
      mobile: form.mobile,
      phone: form.phone,
      region: form.region,
      address: form.address,
      source: form.source,
      netConsultant: form.netConsultant,
      consultant: form.consultant,
      history: form.history,
      remark: form.patientRemark,
      chiefComplaint: form.chiefComplaint,
      healthStatus: form.healthStatus,
      drugAllergy: form.drugAllergy,
      foodAllergy: form.foodAllergy,
      heart: form.heart,
      hypertension: form.hypertension,
      diabetes: form.diabetes,
      kidney: form.kidney,
      infectious: form.infectious,
      bleeding: form.bleeding,
      pregnant: form.pregnant,
      medication: form.medication,
    });
  };

  // 当前 Tab 字段（受「仅显示必填字段」过滤）
  const fields = TAB_FIELDS[activeTab].filter((f) => (requiredOnly ? f.required : true));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <PageTag code="P304" />

      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={handleBack} className="text-base font-medium" style={{ color: ACCENT }}>
            取消
          </button>
          <h1 className="text-base font-semibold text-gray-900">新建顾客</h1>
          <button onClick={handleSave} className="text-base font-medium" style={{ color: ACCENT }}>
            {createMutation.isPending ? "保存中" : "保存"}
          </button>
        </div>
        {/* 仅显示必填字段开关 */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-50">
          <span className="text-sm text-gray-700">仅显示必填字段</span>
          <button
            onClick={() => setRequiredOnly((v) => !v)}
            className="relative w-11 h-6 rounded-full transition-colors"
            style={{ backgroundColor: requiredOnly ? ACCENT : "#E2E5EA" }}
          >
            <span
              className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
              style={{ left: 2, transform: requiredOnly ? "translateX(20px)" : "translateX(0)" }}
            />
          </button>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="bg-white border-b border-gray-100 sticky top-[97px] z-30">
        <div className="flex items-center overflow-x-auto no-scrollbar px-2">
          {TABS.map((tab) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="relative px-3 py-3 whitespace-nowrap"
              >
                <span
                  className={`text-sm ${active ? "font-semibold" : "text-gray-400"}`}
                  style={active ? { color: "#1A1A1A" } : undefined}
                >
                  {tab}
                </span>
                {active && (
                  <span
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
                    style={{ backgroundColor: ACCENT }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 表单内容区 */}
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="bg-white mt-2">
          {fields.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-300">该分组暂无必填字段</div>
          ) : (
            fields.map((f) => (
              <FormRow
                key={f.key}
                field={f}
                value={form[f.key] || ""}
                open={openKey === f.key}
                onInput={(v) => setField(f.key, v)}
                onToggle={() => setOpenKey(openKey === f.key ? null : f.key)}
                onSelect={(v) => {
                  setField(f.key, v);
                  setOpenKey(null);
                }}
              />
            ))
          )}
        </div>

        {/* 联系方式 Tab 的「添加号码」占位说明 */}
        {activeTab === "联系方式" && !requiredOnly && (
          <div className="bg-white mt-2 px-4 py-3">
            <button
              onClick={() => toast.info("「添加号码」功能开发中，敬请期待")}
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ color: ACCENT }}
            >
              <Plus className="w-4 h-4" />
              添加号码
            </button>
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
              <MinusCircle className="w-4 h-4 text-gray-300" />
              本人 / 家庭等号码分组（开发中）
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// 表单行
function FormRow({
  field,
  value,
  open,
  onInput,
  onToggle,
  onSelect,
}: {
  field: FieldDef;
  value: string;
  open: boolean;
  onInput: (v: string) => void;
  onToggle: () => void;
  onSelect: (v: string) => void;
}) {
  const labelNode = (
    <span className="text-sm font-medium text-gray-900 shrink-0">
      {field.label}
      {field.required && <span className="text-red-500 ml-0.5">*</span>}
    </span>
  );

  if (field.kind === "select") {
    return (
      <div className="relative border-b border-gray-50">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between px-4 py-3.5 active:bg-gray-50"
        >
          {labelNode}
          <div className="flex items-center gap-1">
            <span className={`text-sm ${value ? "text-gray-800" : "text-gray-300"}`}>
              {value || field.placeholder}
            </span>
            <ChevronRight
              className={`w-4 h-4 text-gray-300 transition-transform ${open ? "rotate-90" : ""}`}
            />
          </div>
        </button>
        {open && (
          <>
            {/* 透明遮罩，点击外部关闭 */}
            <div className="fixed inset-0 z-20" onClick={onToggle} />
            {/* 贴近按钮右侧的气泡浮层 */}
            <div className="absolute right-3 top-full z-30 -mt-1 min-w-[120px] max-w-[200px] bg-white rounded-lg shadow-lg ring-1 ring-black/5 overflow-hidden">
              {(field.options || []).map((opt, i) => {
                const selected = value === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => onSelect(opt)}
                    className={`w-full px-4 py-2.5 text-left text-sm active:bg-gray-100 flex items-center justify-between gap-3 ${i > 0 ? "border-t border-gray-50" : ""}`}
                    style={selected ? { color: ACCENT, fontWeight: 600 } : { color: "#374151" }}
                  >
                    {opt}
                    {selected && <span style={{ color: ACCENT }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  if (field.kind === "textarea") {
    return (
      <div className="px-4 py-3.5 border-b border-gray-50">
        {labelNode}
        <textarea
          value={value}
          onChange={(e) => onInput(e.target.value)}
          placeholder={field.placeholder}
          rows={2}
          className="mt-2 w-full text-sm text-gray-700 placeholder-gray-300 outline-none resize-none"
        />
      </div>
    );
  }

  // input
  return (
    <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-50">
      {labelNode}
      <div className="flex items-center flex-1 ml-4">
        <input
          type={field.inputType || "text"}
          value={value}
          onChange={(e) => onInput(e.target.value)}
          placeholder={field.placeholder}
          className="text-sm text-right text-gray-800 bg-transparent outline-none flex-1 placeholder:text-gray-300"
        />
        {value && (field.inputType === "date" || field.inputType === "number") && (
          <button
            type="button"
            onClick={() => onInput("")}
            className="ml-2 shrink-0 text-gray-300 active:text-gray-500"
            aria-label={`清空${field.label}`}
          >
            <XCircle className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
