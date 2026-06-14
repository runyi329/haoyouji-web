/**
 * 牙伴齿科管理 - 新建顾客
 * 路由：/yaban/patient/create
 * 蓝白风格，4 个 Tab：个人信息（含联系方式）/ 顾客信息 / 首诊信息 / 自由项
 * 顶栏：取消 / 新建顾客 / 保存；含「仅显示必填字段」开关
 * 布局：字段按实际输入宽度自适应流式排布，窄字段同行并排，充分利用横向空间
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronDown, XCircle, Check } from "lucide-react";
import { PageTag } from "@/components/PageTag";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import MedicalHistoryPicker, { serializeHistory, parseHistory } from "./MedicalHistoryPicker";
import AddressPicker from "./AddressPicker";

// 主题色
const ACCENT = "#1E88D6";

// Tab 定义
const TABS = ["个人信息", "顾客信息", "首诊信息", "自由项"] as const;
type Tab = (typeof TABS)[number];

// 选项配置
const GENDERS = ["未知", "男", "女"];
const PATIENT_TYPES = ["电子", "临时", "普通"];
const SOURCES = ["到店", "转介绍", "网络预约", "电话预约", "微信预约", "老顾客推荐", "其他"];
const NET_CONSULTANTS = ["杨文利", "侯睿", "洪紫钥"];
const CONSULTANTS = ["洪紫钥", "杨文利", "侯睿"];
const CHIEF_COMPLAINTS = ["牙疼", "牙齿松动", "洗牙清洁", "缺牙修复", "牙齿矫正", "美白贴面", "智齿冠周炎", "其他"];
const HEALTH_STATUS = ["健康", "亚健康", "慢性病", "其他"];
const YES_NO = ["否", "是", "不详"];
const PREGNANT = ["否", "是", "备孕中", "不适用"];

// 字段类型
type FieldKind = "input" | "select" | "textarea" | "history" | "address";

// 字段宽度档位：窄字段同行并排，宽字段独占
// narrow ≈ 半屏内可挤 2-3 个；half ≈ 半屏；full ≈ 整行
type FieldWidth = "narrow" | "half" | "full" | "name" | "gender" | "auto";

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  kind: FieldKind;
  required?: boolean;
  options?: string[];
  inputType?: string;
  readOnly?: boolean;
  width?: FieldWidth; // 默认 full
}

// 各 Tab 字段配置
const TAB_FIELDS: Record<Tab, FieldDef[]> = {
  个人信息: [
    { key: "name", label: "姓名", placeholder: "请输入姓名", kind: "input", required: true, width: "name" },
    { key: "nickname", label: "昵称", placeholder: "请输入昵称", kind: "input", width: "auto" },
    { key: "gender", label: "性别", placeholder: "未知", kind: "select", required: true, options: GENDERS, width: "gender" },
    { key: "birthday", label: "生日", placeholder: "请选择", kind: "input", required: true, inputType: "date", width: "half" },
    { key: "age", label: "年龄", placeholder: "岁", kind: "input", required: true, inputType: "number", width: "narrow" },
    { key: "zodiac", label: "星座", placeholder: "自动带出", kind: "input", readOnly: true, width: "narrow" },
    { key: "patientType", label: "顾客类型", placeholder: "电子", kind: "select", required: true, options: PATIENT_TYPES, width: "half" },
    { key: "medicalNo", label: "顾客编号", placeholder: "系统自动生成", kind: "input", readOnly: true, width: "half" },
    { key: "mobile", label: "手机号", placeholder: "请输入手机号", kind: "input", required: true, inputType: "tel", width: "half" },
    { key: "phone", label: "电话", placeholder: "请输入电话号码", kind: "input", inputType: "tel", width: "half" },
    { key: "email", label: "邮箱", placeholder: "请输入邮箱地址", kind: "input", inputType: "email", width: "full" },
    { key: "address", label: "所在地区", placeholder: "点击选择省市区并填写门牌号", kind: "address", width: "full" },
  ],
  顾客信息: [
    { key: "source", label: "顾客来源", placeholder: "请选择", kind: "select", required: true, options: SOURCES, width: "half" },
    { key: "netConsultant", label: "网电咨询师", placeholder: "请选择", kind: "select", options: NET_CONSULTANTS, width: "half" },
    { key: "consultant", label: "咨询师", placeholder: "请选择", kind: "select", options: CONSULTANTS, width: "half" },
    { key: "history", label: "AI健康标签", placeholder: "点击选择或搜索", kind: "history", width: "full" },
    { key: "patientRemark", label: "顾客备注", placeholder: "请输入顾客备注", kind: "textarea", width: "full" },
  ],
  首诊信息: [
    { key: "chiefComplaint", label: "就诊主诉", placeholder: "请选择就诊主诉", kind: "select", options: CHIEF_COMPLAINTS, width: "full" },
  ],
  自由项: [
    { key: "healthStatus", label: "健康状况", placeholder: "请选择", kind: "select", options: HEALTH_STATUS, width: "half" },
    { key: "drugAllergy", label: "药物过敏史", placeholder: "请输入", kind: "input", width: "half" },
    { key: "foodAllergy", label: "食物过敏史", placeholder: "请输入", kind: "input", width: "half" },
    { key: "medication", label: "服药史", placeholder: "请输入", kind: "input", width: "half" },
    { key: "heart", label: "心脏病", placeholder: "请选择", kind: "select", options: YES_NO, width: "narrow" },
    { key: "hypertension", label: "高血压", placeholder: "请选择", kind: "select", options: YES_NO, width: "narrow" },
    { key: "diabetes", label: "糖尿病", placeholder: "请选择", kind: "select", options: YES_NO, width: "narrow" },
    { key: "kidney", label: "肾脏病", placeholder: "请选择", kind: "select", options: YES_NO, width: "narrow" },
    { key: "infectious", label: "传染病", placeholder: "请选择", kind: "select", options: YES_NO, width: "narrow" },
    { key: "bleeding", label: "出血不止", placeholder: "请选择", kind: "select", options: YES_NO, width: "narrow" },
    { key: "pregnant", label: "是否怀孕", placeholder: "请选择", kind: "select", options: PREGNANT, width: "half" },
  ],
};

// 宽度档位 → flex-basis（基于容器百分比，配合 flex-wrap 自动换行）
const WIDTH_BASIS: Record<FieldWidth, string> = {
  narrow: "calc(33.333% - 8px)",
  half: "calc(50% - 6px)",
  full: "100%",
  // 首行：姓名约4字宽、性别约1字宽、昵称占满剩余（姓名+性别+昵称同一行）
  name: "108px",
  gender: "92px",
  auto: "100px",
};

// 根据生日(YYYY-MM-DD)计算周岁年龄
function calcAge(birthday: string): string {
  if (!birthday) return "";
  const b = new Date(birthday);
  if (isNaN(b.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  if (age < 0) age = 0; // 选了当天或未来日期时按 0 岁计，不返回空
  if (age > 150) return "";
  return String(age);
}

// 根据生日计算星座
function calcZodiac(birthday: string): string {
  if (!birthday) return "";
  const d = new Date(birthday);
  if (isNaN(d.getTime())) return "";
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const edges = [20, 19, 21, 20, 21, 22, 23, 23, 23, 24, 23, 22];
  const names = [
    "摩羯座", "水瓶座", "双鱼座", "白羊座", "金牛座", "双子座",
    "巨蟹座", "狮子座", "处女座", "天秤座", "天蝎座", "射手座", "摩羯座",
  ];
  return day < edges[month - 1] ? names[month - 1] : names[month];
}

export default function YabanPatientCreate() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("个人信息");
  const [requiredOnly, setRequiredOnly] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    gender: "未知",
    patientType: "电子",
  });

  const setField = (key: string, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // 选择生日时自动计算年龄与星座
      if (key === "birthday") {
        next.age = calcAge(value);
        next.zodiac = calcZodiac(value);
      }
      return next;
    });
  };

  // 预取系统将分配的顾客编号，实时展示在「顾客编号」框（实际以保存时生成为准）
  const previewCode = trpc.yabanCustomer.previewCode.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    const code = previewCode.data?.code;
    if (code) {
      setForm((prev) => (prev.medicalNo ? prev : { ...prev, medicalNo: code }));
    }
  }, [previewCode.data?.code]);

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
      zodiac: form.zodiac,
      patientType: form.patientType,
      // 顾客编号为只读预览值，保存时不传入，由后端按实际流水生成（避免并发同号）
      medicalNo: undefined,
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

      {/* 表单内容区：流式栅格 */}
      <div className="flex-1 overflow-y-auto pb-8">
        <div className="bg-white mt-2 px-3 py-3">
          {fields.length === 0 ? (
            <div className="px-1 py-10 text-center text-sm text-gray-300">该分组暂无必填字段</div>
          ) : (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {fields.map((f) => (
                <FieldCell
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
                  onOpenHistory={() => setHistoryOpen(true)}
                  onOpenAddress={() => setAddressOpen(true)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI健康标签选择器 */}
      {(() => {
        const parsed = parseHistory(form.history || "");
        return (
          <MedicalHistoryPicker
            open={historyOpen}
            value={parsed.names}
            remark={parsed.remark}
            onClose={() => setHistoryOpen(false)}
            onConfirm={(names, remark) => {
              setField("history", serializeHistory(names, remark));
              setHistoryOpen(false);
            }}
          />
        );
      })()}

      {/* 所在地区选择器（省市区级联 + 门牌号） */}
      <AddressPicker
        open={addressOpen}
        value={form.address || ""}
        onClose={() => setAddressOpen(false)}
        onConfirm={(full) => {
          setField("address", full);
          setAddressOpen(false);
        }}
      />
    </div>
  );
}

// 字段单元格：label 在上、控件在下，按 width 档位自适应宽度并随屏幕换行
function FieldCell({
  field,
  value,
  open,
  onInput,
  onToggle,
  onSelect,
  onOpenHistory,
  onOpenAddress,
}: {
  field: FieldDef;
  value: string;
  open: boolean;
  onInput: (v: string) => void;
  onToggle: () => void;
  onSelect: (v: string) => void;
  onOpenHistory?: () => void;
  onOpenAddress?: () => void;
}) {
  const basis = WIDTH_BASIS[field.width || "full"];
  // 长内容字段（多行文本、AI健康标签、地址）标题在上、控件占满整行；其余短字段标题与控件同行
  const stacked = field.kind === "textarea" || field.kind === "history" || field.kind === "address";

  const label = (
    <label className={`text-gray-700 truncate shrink-0 ${stacked ? "block text-base mb-1.5" : "text-base"}`}>
      {field.label}
    </label>
  );

  // 统一的控件外框样式（浅灰底，聚焦时蓝边）
  const boxCls =
    "w-full h-10 px-3 rounded-lg bg-gray-50 border border-transparent flex items-center text-sm transition-colors focus-within:bg-white focus-within:border-[#1E88D6]";

  let control: JSX.Element;

  if (field.kind === "address") {
    control = (
      <button
        type="button"
        onClick={onOpenAddress}
        className={`${boxCls} justify-between text-left active:bg-gray-100`}
      >
        <span className={`truncate ${value ? "text-gray-800" : "text-gray-300"}`}>
          {value || field.placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-300 shrink-0 ml-1" />
      </button>
    );
  } else if (field.kind === "history") {
    control = (
      <button
        type="button"
        onClick={onOpenHistory}
        className={`${boxCls} justify-between text-left active:bg-gray-100`}
      >
        <span className={`truncate ${value ? "text-gray-800" : "text-gray-300"}`}>
          {value || field.placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-300 shrink-0 ml-1" />
      </button>
    );
  } else if (field.kind === "select") {
    // 性别选中时的淡色底色（女=淡粉 男=淡蓝），不影响字色
    let genderStyle: React.CSSProperties = {};
    if (field.key === "gender") {
      if (value === "女") genderStyle = { backgroundColor: "#FCE7F0", borderColor: "#F7C5DA" };
      else if (value === "男") genderStyle = { backgroundColor: "#E3F0FB", borderColor: "#BBD9F2" };
    }
    // 有值时隐藏箭头，避免挡住文字
    const showArrow = !value;
    control = (
      <div className="relative">
        <button
          type="button"
          onClick={onToggle}
          style={genderStyle}
          className={`${boxCls} justify-between active:bg-gray-100`}
        >
          <span className={`truncate ${value ? "text-gray-800" : "text-gray-300"}`}>
            {value || field.placeholder}
          </span>
          {showArrow && (
            <ChevronDown
              className={`w-4 h-4 text-gray-300 shrink-0 ml-1 transition-transform ${open ? "rotate-180" : ""}`}
            />
          )}
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-20" onClick={onToggle} />
            <div className="absolute left-0 top-full z-30 mt-1 min-w-full max-w-[220px] bg-white rounded-lg shadow-lg ring-1 ring-black/5 overflow-hidden">
              {(field.options || []).map((opt, i) => {
                const selected = value === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onSelect(opt)}
                    className={`w-full px-4 py-2.5 text-left text-sm active:bg-gray-100 flex items-center justify-between gap-3 ${i > 0 ? "border-t border-gray-50" : ""}`}
                    style={selected ? { color: ACCENT, fontWeight: 600 } : { color: "#374151" }}
                  >
                    {opt}
                    {selected && <Check className="w-4 h-4" style={{ color: ACCENT }} />}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  } else if (field.kind === "textarea") {
    control = (
      <textarea
        value={value}
        onChange={(e) => onInput(e.target.value)}
        placeholder={field.placeholder}
        rows={2}
        className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-transparent text-sm text-gray-800 placeholder-gray-300 outline-none resize-none transition-colors focus:bg-white focus:border-[#1E88D6]"
      />
    );
  } else {
    // input
    control = (
      <div className={`${boxCls} ${field.readOnly ? "bg-gray-100" : ""}`}>
        <input
          type={field.inputType || "text"}
          value={value}
          readOnly={field.readOnly}
          onChange={(e) => onInput(e.target.value)}
          placeholder={field.placeholder}
          className={`flex-1 min-w-0 bg-transparent outline-none placeholder:text-gray-300 ${field.readOnly ? "text-gray-500" : "text-gray-800"}`}
        />
        {value && !field.readOnly && (field.inputType === "date" || field.inputType === "number") && (
          <button
            type="button"
            onClick={() => onInput("")}
            className="ml-1 shrink-0 text-gray-300 active:text-gray-500"
            aria-label={`清空${field.label}`}
          >
            <XCircle className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  if (stacked) {
    return (
      <div style={{ flex: `1 1 ${basis}`, minWidth: 140, maxWidth: "100%" }} className="py-1.5">
        {label}
        {control}
      </div>
    );
  }

  // 不同宽度档的 flex 行为：
  //  - auto（昵称）：尽量占满本行剩余空间
  //  - name/gender：固定较窄、不放大
  //  - 其余：可放大、半屏基准
  const w = field.width || "full";
  let flexStyle: string;
  let minW: number;
  if (w === "auto") {
    flexStyle = `999 1 ${basis}`;
    minW = 88;
  } else if (w === "name") {
    flexStyle = `0 1 ${basis}`;
    minW = 96;
  } else if (w === "gender") {
    flexStyle = `0 1 ${basis}`;
    minW = 84;
  } else if (w === "narrow") {
    flexStyle = `1 1 ${basis}`;
    minW = 96;
  } else {
    flexStyle = `1 1 ${basis}`;
    minW = 150;
  }

  return (
    <div
      style={{ flex: flexStyle, minWidth: minW, maxWidth: "100%" }}
      className="py-1.5 flex items-center gap-2"
    >
      {label}
      <div className="flex-1 min-w-0">{control}</div>
    </div>
  );
}
