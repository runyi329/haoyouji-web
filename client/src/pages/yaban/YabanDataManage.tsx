/**
 * 牙伴齿科管理 - 数据安全管理子页
 * 路由：/yaban/settings/data
 * 风格：牙伴蓝白风（强调色 #1E88D6）
 * 功能：
 *   Tab1 数据导出备份：多步骤——①选医院 ②选分类 ③选格式 ④选方式 ⑤AI 智能备份（并入邮箱）
 *   Tab2 数据导入存档：上传 JSON 备份文件，导入还原（重复跳过）
 * 严禁 Emoji。
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  ChevronLeft,
  Download,
  Upload,
  Mail,
  Clock,
  Loader2,
  CheckSquare,
  Square,
  FileJson,
  FileSpreadsheet,
  Users,
  HeartPulse,
  Wallet,
  Tags,
  Ticket,
  ShoppingBag,
  Building2,
  ChevronDown,
  AlertCircle,
  Layers,
} from "lucide-react";
import { PageTag } from "@/components/PageTag";
import { trpc } from "@/lib/trpc";

type Fmt = "json" | "excel";

// Excel 导入：中文表头 -> 数据库字段映射
const EXCEL_HEADER_MAP: Record<string, string> = {
  姓名: "name",
  性别: "gender",
  生日: "birthday",
  年龄: "age",
  星座: "zodiac",
  顾客类型: "patient_type",
  原编号: "external_no",
  顾客编号: "medical_no",
  昵称: "nickname",
  邮箱: "email",
  手机号: "mobile",
  电话: "phone",
  地区: "region",
  地址: "address",
  来源: "source",
  网电咨询师: "net_consultant",
  咨询师: "consultant",
  健康标签: "history",
  既往史: "history", // 兼容旧模板表头
  备注: "remark",
  就诊主诉: "chief_complaint",
};

// 模板表头顺序（与映射一致，供下载模板使用）
const TEMPLATE_HEADERS = [
  "姓名",
  "性别",
  "生日",
  "年龄",
  "顾客类型",
  "原编号",
  "昵称",
  "邮箱",
  "手机号",
  "电话",
  "地区",
  "地址",
  "来源",
  "备注",
];

// 可导出的资料分类。available=true 为真实可选；false 为占位（淡色禁用，一眼可辨）。
const CATEGORIES = [
  { key: "customer_basic", title: "顾客基本信息", desc: "姓名、联系方式、来源、咨询师等", icon: Users, available: true },
  { key: "customer_health", title: "顾客健康档案", desc: "主诉、过敏史、既往史等", icon: HeartPulse, available: true },
  { key: "charge_records", title: "收费 / 消费记录", desc: "即将开放", icon: Wallet, available: false },
  { key: "charge_products", title: "收费项目库", desc: "即将开放", icon: Tags, available: false },
  { key: "verify_records", title: "核销记录", desc: "即将开放", icon: Ticket, available: false },
  { key: "mall_orders", title: "商城订单", desc: "即将开放", icon: ShoppingBag, available: false },
] as const;

const AVAILABLE_CATEGORY_KEYS = CATEGORIES.filter((c) => c.available).map((c) => c.key);

function base64ToBlob(base64: string, mime: string): Blob {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export default function YabanDataManage() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"export" | "import">("export");

  // ===== 步骤一：医院选择 =====
  const { data: clinicsResp, isLoading: clinicsLoading } = trpc.yabanCustomer.listExportableClinics.useQuery();
  const clinics = clinicsResp?.clinics;
  const [tenantId, setTenantId] = useState<number>(0);
  const [clinicPickerOpen, setClinicPickerOpen] = useState(false);

  // 默认选中第一家
  useEffect(() => {
    if (clinics && clinics.length > 0 && !tenantId) {
      setTenantId(clinics[0].tenantId);
    }
  }, [clinics, tenantId]);

  const currentClinic = clinics?.find((c) => c.tenantId === tenantId);
  const hasNoClinic = !clinicsLoading && (!clinics || clinics.length === 0);

  // ===== 步骤二：分类选择 =====
  const [categories, setCategories] = useState<string[]>([...AVAILABLE_CATEGORY_KEYS]);
  const [catOpen, setCatOpen] = useState(false); // 分类下拉是否展开

  // ===== 步骤三：格式 =====
  const [formats, setFormats] = useState<Fmt[]>(["excel"]);

  // ===== 步骤五：AI 智能备份 =====
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoFreq, setAutoFreq] = useState<"daily" | "weekly" | "monthly" | "quarterly">("monthly");

  const { data: backupSettings } = trpc.yabanCustomer.getBackupSettings.useQuery(
    { tenantId },
    { enabled: !!tenantId }
  );
  const { data: me } = trpc.auth.me.useQuery();
  const utils = trpc.useUtils();

  // 个人中心（脉动网）绑定的邮箱：作为唯一接收地址来源
  const boundEmail = ((me as any)?.email as string | undefined) || "";
  const hasBoundEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(boundEmail);

  useEffect(() => {
    if (backupSettings) {
      setAutoEnabled(!!backupSettings.enabled);
      if (backupSettings.frequency) setAutoFreq(backupSettings.frequency as any);
      if (backupSettings.formats?.length) setFormats(backupSettings.formats as Fmt[]);
    }
  }, [backupSettings]);

  const toggleCategory = (key: string) => {
    const cat = CATEGORIES.find((c) => c.key === key);
    if (!cat?.available) return; // 占位项不可点
    setCategories((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };
  const toggleFormat = (f: Fmt) => {
    setFormats((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const exportData = trpc.yabanCustomer.exportData.useMutation({
    onSuccess: (res) => {
      for (const f of res.files) {
        const blob = base64ToBlob(f.base64, f.mime);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = f.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      toast.success(`已导出 ${res.count} 位顾客`);
    },
    onError: (e) => toast.error(e.message || "导出失败"),
  });

  const sendBackupNow = trpc.yabanCustomer.sendBackupNow.useMutation({
    onSuccess: (res) => toast.success(`已发送备份邮件，共 ${res.count} 位顾客`),
    onError: (e) => toast.error(e.message || "发送失败"),
  });

  const saveSettings = trpc.yabanCustomer.saveBackupSettings.useMutation({
    onSuccess: () => {
      toast.success("智能备份设置已保存");
      utils.yabanCustomer.getBackupSettings.invalidate();
    },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  const importData = trpc.yabanCustomer.importData.useMutation({
    onSuccess: (res) => {
      toast.success(`导入完成：新增 ${res.inserted} 条，跳过 ${res.skipped} 条`);
    },
    onError: (e) => toast.error(e.message || "导入失败"),
  });

  const guardBeforeExport = (): boolean => {
    if (!tenantId) {
      toast.error("请先选择医院");
      return false;
    }
    if (categories.length === 0) {
      toast.error("请至少选择一项资料分类");
      return false;
    }
    if (formats.length === 0) {
      toast.error("请至少选择一种文件格式");
      return false;
    }
    return true;
  };

  const onDownload = () => {
    if (!guardBeforeExport()) return;
    exportData.mutate({ tenantId, categories, formats });
  };

  const onSendEmail = () => {
    if (!guardBeforeExport()) return;
    if (!hasBoundEmail) {
      toast.error("请先在个人中心绑定邮箱");
      return;
    }
    sendBackupNow.mutate({ tenantId, email: boundEmail, categories, formats });
  };

  const onSaveAuto = () => {
    if (!tenantId) {
      toast.error("请先选择医院");
      return;
    }
    if (autoEnabled && !hasBoundEmail) {
      toast.error("开启智能备份需先在个人中心绑定邮箱");
      return;
    }
    if (formats.length === 0) {
      toast.error("请至少选择一种文件格式");
      return;
    }
    saveSettings.mutate({ tenantId, enabled: autoEnabled, email: boundEmail, categories, formats, frequency: autoFreq });
  };

  // ===== 导入相关 =====
  const [importPreview, setImportPreview] = useState<{ count: number; customers: any[] } | null>(null);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    const isExcel = lower.endsWith(".xlsx") || lower.endsWith(".xls");
    const reader = new FileReader();

    if (isExcel) {
      reader.onload = () => {
        try {
          const wb = XLSX.read(reader.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
          const list = rows
            .map((row) => {
              const obj: Record<string, any> = {};
              for (const [zh, val] of Object.entries(row)) {
                const key = EXCEL_HEADER_MAP[String(zh).trim()];
                if (key) obj[key] = typeof val === "string" ? val.trim() : val;
              }
              return obj;
            })
            .filter((o) => o.name && o.mobile);
          if (list.length === 0) {
            toast.error("未解析到有效数据，请确认表头与模板一致，且姓名、手机号不为空");
            return;
          }
          setImportPreview({ count: list.length, customers: list });
          toast.success(`已读取 ${list.length} 条顾客记录，点击下方按钮导入`);
        } catch {
          toast.error("无法解析该 Excel 文件，请使用下方模板整理后再上传");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result || "{}"));
          const list = Array.isArray(data) ? data : data.customers;
          if (!Array.isArray(list)) {
            toast.error("文件格式不正确，请选择牙伴导出的 JSON 存档");
            return;
          }
          setImportPreview({ count: list.length, customers: list });
          toast.success(`已读取 ${list.length} 条顾客记录，点击下方按钮导入`);
        } catch {
          toast.error("无法解析该文件，请选择正确的 JSON 存档或 Excel 文件");
        }
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  const onDownloadTemplate = () => {
    const example = [
      "张三", "男", "1990-01-01", "", "电子", "", "", "", "13800000000", "", "", "", "老顾客推荐", "示例数据，可删除",
    ];
    const aoa = [TEMPLATE_HEADERS, example];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = TEMPLATE_HEADERS.map(() => ({ wch: 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "顾客导入模板");
    XLSX.writeFile(wb, "牙伴顾客导入模板.xlsx");
    toast.success("模板已下载，请按表头填写后上传");
  };

  const onImport = () => {
    if (!tenantId) {
      toast.error("请先选择医院");
      return;
    }
    if (!importPreview || importPreview.customers.length === 0) {
      toast.error("请先选择要导入的文件");
      return;
    }
    importData.mutate({ tenantId, customers: importPreview.customers, mode: "skip" });
  };

  const FREQS: { key: typeof autoFreq; label: string }[] = [
    { key: "daily", label: "每天" },
    { key: "weekly", label: "每周" },
    { key: "monthly", label: "每月" },
    { key: "quarterly", label: "每季度" },
  ];

  const goBindEmail = () => {
    sessionStorage.setItem("yaban_back", "/yaban/settings/data");
    navigate("/yaban/bind-email");
  };

  // 步骤标题小组件
  const StepHead = ({ n, title, extra }: { n: number; title: string; extra?: React.ReactNode }) => (
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm font-bold text-gray-800 flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-[#1E88D6] text-white text-[11px] flex items-center justify-center shrink-0">{n}</span>
        {title}
      </span>
      {extra}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-12">
      <PageTag code="P317" />

      {/* 头部 */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => navigate("/yaban/profile")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">数据安全管理</span>
        </div>
        <div className="flex px-4">
          <button
            onClick={() => setTab("export")}
            className={`flex-1 py-2.5 text-sm font-medium relative ${tab === "export" ? "text-white" : "text-white/60"}`}
          >
            数据导出备份
            {tab === "export" && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-0.5 bg-white rounded-full" />}
          </button>
          <button
            onClick={() => setTab("import")}
            className={`flex-1 py-2.5 text-sm font-medium relative ${tab === "import" ? "text-white" : "text-white/60"}`}
          >
            数据导入存档
            {tab === "import" && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-0.5 bg-white rounded-full" />}
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {/* 无医院身份：得体提示，隐藏所有导出操作 */}
        {hasNoClinic ? (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-[#EAF4FE] flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-7 h-7 text-[#1E88D6]" />
            </div>
            <p className="text-base font-bold text-gray-800 mb-2">暂无可导出资料的医院</p>
            <p className="text-sm text-gray-500 leading-relaxed">
              数据导出属于医院经营资料管理，需要您具备某家医院的院长或股东身份。
              <br />
              您当前尚未归属任何医院，因此暂时没有可导出的资料。如需演示或管理某家医院的数据，可请平台将您加入对应医院后再来此导出。
            </p>
          </div>
        ) : clinicsLoading ? (
          <div className="bg-white rounded-2xl shadow-sm p-6 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[#1E88D6]" />
          </div>
        ) : tab === "export" ? (
          <>
            {/* 步骤一：选择医院 */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <StepHead n={1} title="选择医院" />
              <button
                onClick={() => clinics && clinics.length > 1 && setClinicPickerOpen((v) => !v)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-[#1E88D6] bg-[#F0F7FD] ${
                  clinics && clinics.length > 1 ? "active:opacity-80" : ""
                }`}
              >
                <span className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-[#1E88D6]" />
                </span>
                <span className="flex-1 text-left">
                  <span className="block text-sm font-medium text-gray-800">{currentClinic?.name || "请选择医院"}</span>
                  <span className="block text-xs text-gray-400 mt-0.5">
                    {clinics && clinics.length > 1 ? `共 ${clinics.length} 家可导出医院，点击切换` : "您名下的医院"}
                  </span>
                </span>
                {clinics && clinics.length > 1 && (
                  <ChevronDown className={`w-4 h-4 text-[#1E88D6] transition-transform ${clinicPickerOpen ? "rotate-180" : ""}`} />
                )}
              </button>
              {clinicPickerOpen && clinics && clinics.length > 1 && (
                <div className="mt-2 space-y-1.5">
                  {clinics.map((c) => (
                    <button
                      key={c.tenantId}
                      onClick={() => { setTenantId(c.tenantId); setClinicPickerOpen(false); }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm border transition-colors ${
                        c.tenantId === tenantId
                          ? "border-[#1E88D6] bg-[#F0F7FD] text-[#1E88D6] font-medium"
                          : "border-gray-100 bg-gray-50 text-gray-700"
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 步骤二：选择资料分类（折叠下拉） */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <StepHead n={2} title="选择资料分类" />

              {/* 收起时的摘要行：点击展开/收起 */}
              {(() => {
                const allSelected = categories.length === AVAILABLE_CATEGORY_KEYS.length;
                const summary = allSelected
                  ? "全部信息"
                  : categories.length === 0
                  ? "未选择"
                  : `已选 ${categories.length} 项`;
                return (
                  <button
                    onClick={() => setCatOpen((v) => !v)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                      catOpen ? "border-[#1E88D6] bg-[#F0F7FD]" : "border-gray-100 bg-gray-50"
                    } active:bg-[#EAF4FE]`}
                  >
                    <span className="w-8 h-8 rounded-lg bg-[#EAF4FE] flex items-center justify-center shrink-0">
                      <Layers className="w-4 h-4 text-[#1E88D6]" />
                    </span>
                    <span className="flex-1 text-left">
                      <span className="block text-sm font-medium text-gray-800">{summary}</span>
                      <span className="block text-xs text-gray-400 mt-0.5">
                        {catOpen ? "点击收起" : "点击展开可逐项选择"}
                      </span>
                    </span>
                    <ChevronDown className={`w-4 h-4 text-[#1E88D6] transition-transform ${catOpen ? "rotate-180" : ""}`} />
                  </button>
                );
              })()}

              {/* 展开后：全选按钮 + 各分类项 */}
              {catOpen && (
              <div className="space-y-2 mt-2">
                <div className="flex justify-end">
                  <button
                    className="text-xs text-[#1E88D6] active:opacity-70 font-normal"
                    onClick={() =>
                      setCategories(categories.length === AVAILABLE_CATEGORY_KEYS.length ? [] : [...AVAILABLE_CATEGORY_KEYS])
                    }
                  >
                    {categories.length === AVAILABLE_CATEGORY_KEYS.length ? "取消全选" : "全选"}
                  </button>
                </div>
                {CATEGORIES.map((c) => {
                  const Icon = c.icon;
                  const checked = categories.includes(c.key);
                  if (!c.available) {
                    // 占位项：整体淡色、虚线、不可点，一眼可辨
                    return (
                      <div
                        key={c.key}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 cursor-not-allowed select-none"
                      >
                        <Square className="w-5 h-5 text-gray-200 shrink-0" />
                        <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4 text-gray-300" />
                        </span>
                        <span className="flex-1 text-left">
                          <span className="block text-sm font-medium text-gray-400">{c.title}</span>
                        </span>
                        <span className="text-[11px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">即将开放</span>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={c.key}
                      onClick={() => toggleCategory(c.key)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                        checked ? "border-[#1E88D6] bg-[#F0F7FD]" : "border-gray-100 bg-gray-50"
                      } active:bg-[#EAF4FE]`}
                    >
                      {checked ? (
                        <CheckSquare className="w-5 h-5 text-[#1E88D6] shrink-0" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-300 shrink-0" />
                      )}
                      <span className="w-8 h-8 rounded-lg bg-[#EAF4FE] flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-[#1E88D6]" />
                      </span>
                      <span className="flex-1 text-left">
                        <span className="block text-sm font-medium text-gray-800">{c.title}</span>
                        <span className="block text-xs text-gray-400 mt-0.5">{c.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              )}
            </div>

            {/* 步骤三：选择文件格式 */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <StepHead n={3} title="选择文件格式" />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <button
                    onClick={() => toggleFormat("excel")}
                    className={`w-full flex items-center gap-2 px-3 py-3 rounded-xl border transition-colors ${
                      formats.includes("excel") ? "border-[#1E88D6] bg-[#F0F7FD]" : "border-gray-100 bg-gray-50"
                    }`}
                  >
                    {formats.includes("excel") ? (
                      <CheckSquare className="w-5 h-5 text-[#1E88D6] shrink-0" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-300 shrink-0" />
                    )}
                    <FileSpreadsheet className="w-4 h-4 text-[#1E88D6]" />
                    <span className="text-sm font-medium text-gray-800">Excel 表格</span>
                  </button>
                  <p className="text-xs text-gray-400 px-1 leading-relaxed">便于查看打印</p>
                </div>
                <div className="space-y-1">
                  <button
                    onClick={() => toggleFormat("json")}
                    className={`w-full flex items-center gap-2 px-3 py-3 rounded-xl border transition-colors ${
                      formats.includes("json") ? "border-[#1E88D6] bg-[#F0F7FD]" : "border-gray-100 bg-gray-50"
                    }`}
                  >
                    {formats.includes("json") ? (
                      <CheckSquare className="w-5 h-5 text-[#1E88D6] shrink-0" />
                    ) : (
                      <Square className="w-5 h-5 text-gray-300 shrink-0" />
                    )}
                    <FileJson className="w-4 h-4 text-[#1E88D6]" />
                    <span className="text-sm font-medium text-gray-800">JSON 存档</span>
                  </button>
                  <p className="text-xs text-gray-400 px-1 leading-relaxed">可用于「数据导入存档」还原</p>
                </div>
              </div>
            </div>

            {/* 步骤四：选择导出方式 */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <StepHead n={4} title="选择导出方式" />

              {/* 方式一：下载到本机 */}
              <button
                onClick={onDownload}
                disabled={exportData.isPending}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl border border-gray-100 bg-gray-50 active:bg-[#EAF4FE] transition-colors disabled:opacity-60"
              >
                <span className="w-8 h-8 rounded-lg bg-[#EAF4FE] flex items-center justify-center shrink-0">
                  {exportData.isPending ? <Loader2 className="w-4 h-4 animate-spin text-[#1E88D6]" /> : <Download className="w-4 h-4 text-[#1E88D6]" />}
                </span>
                <span className="flex-1 text-left">
                  <span className="block text-sm font-medium text-gray-800">下载到本机</span>
                  <span className="block text-xs text-gray-400 mt-0.5">立即生成文件并保存到本设备</span>
                </span>
              </button>

              {/* 方式二：发送到邮箱 */}
              <div className="mt-3 px-3 py-3 rounded-xl border border-gray-100 bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-[#EAF4FE] flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-[#1E88D6]" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-gray-800">发送到邮箱</span>
                    {hasBoundEmail ? (
                      <span className="block text-xs text-gray-400 mt-0.5 truncate">将发送至：{boundEmail}</span>
                    ) : (
                      <span className="block text-xs text-amber-500 mt-0.5">尚未绑定邮箱</span>
                    )}
                  </span>
                  {hasBoundEmail ? (
                    <button onClick={goBindEmail} className="text-xs text-[#1E88D6] active:opacity-70 shrink-0">修改</button>
                  ) : (
                    <button onClick={goBindEmail} className="text-xs px-2.5 py-1.5 rounded-lg bg-[#1E88D6] text-white active:opacity-80 shrink-0">绑定邮箱</button>
                  )}
                </div>
                <button
                  onClick={onSendEmail}
                  disabled={sendBackupNow.isPending || !hasBoundEmail}
                  className="mt-3 w-full flex items-center justify-center gap-2 bg-[#EAF4FE] text-[#1E88D6] rounded-xl py-2.5 text-sm font-medium active:opacity-80 disabled:opacity-50"
                >
                  {sendBackupNow.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  立即发送到邮箱
                </button>
              </div>
            </div>

            {/* 步骤五：AI 智能备份 */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <StepHead
                n={5}
                title="AI 智能备份"
                extra={
                  <button
                    onClick={() => setAutoEnabled((v) => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${autoEnabled ? "bg-[#1E88D6]" : "bg-gray-300"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${autoEnabled ? "translate-x-5" : ""}`} />
                  </button>
                }
              />
              {autoEnabled && (
                <>
                  <div className="grid grid-cols-4 gap-2 mt-3">
                    {FREQS.map((f) => (
                      <button
                        key={f.key}
                        onClick={() => setAutoFreq(f.key)}
                        className={`py-2 text-xs rounded-lg border transition-colors ${
                          autoFreq === f.key ? "border-[#1E88D6] bg-[#F0F7FD] text-[#1E88D6] font-medium" : "border-gray-100 bg-gray-50 text-gray-600"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 shrink-0" /> 到期当天将于北京时间凌晨 2:00 自动发送。
                  </p>
                  {!hasBoundEmail && (
                    <p className="text-xs text-amber-500 mt-2 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> 尚未绑定邮箱，请先绑定后再保存。
                    </p>
                  )}
                  {backupSettings?.lastBackupAt && (
                    <p className="text-xs text-gray-400 mt-2">
                      上次备份：{String(backupSettings.lastBackupAt).replace("T", " ").slice(0, 16)}（累计 {backupSettings.backupCount} 次）
                    </p>
                  )}
                  <button
                    onClick={onSaveAuto}
                    disabled={saveSettings.isPending}
                    className="mt-3 w-full flex items-center justify-center gap-2 border border-[#1E88D6] text-[#1E88D6] rounded-xl py-2.5 text-sm font-medium active:bg-[#F0F7FD] disabled:opacity-60"
                  >
                    {saveSettings.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    保存智能备份设置
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            {/* 导入存档 */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <span className="text-sm font-bold text-gray-800 block mb-2">导入存档（JSON / Excel）</span>
              <p className="text-xs text-gray-400 leading-relaxed mb-3">
                支持两种文件：本系统导出的 JSON 存档（精确还原），或按模板整理的 Excel 表格（从其他系统迁移顾客）。已存在的顾客（同手机号或同原编号）会自动跳过，导入的顾客将按本店规则重新分配顾客编号，原编号保留备查。
              </p>
              <button
                onClick={onDownloadTemplate}
                className="w-full flex items-center justify-center gap-2 border border-[#1E88D6] text-[#1E88D6] rounded-xl py-2.5 text-sm font-medium active:bg-[#F0F7FD] mb-3"
              >
                <FileSpreadsheet className="w-4 h-4" /> 下载 Excel 导入模板
              </button>
              <label className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#9CC8EC] rounded-2xl py-8 cursor-pointer active:bg-[#F0F7FD]">
                <Upload className="w-7 h-7 text-[#1E88D6]" />
                <span className="text-sm text-[#1E88D6] font-medium">点击选择 JSON 或 Excel 文件</span>
                <span className="text-xs text-gray-400">支持 .json / .xlsx / .xls</span>
                <input type="file" accept=".json,application/json,.xlsx,.xls" className="hidden" onChange={onPickFile} />
              </label>
              {importPreview && (
                <div className="mt-3 px-3 py-3 rounded-xl bg-[#F0F7FD] text-sm text-gray-700">
                  已读取文件，包含 <span className="font-bold text-[#1E88D6]">{importPreview.count}</span> 条顾客记录，确认后点击下方导入。
                </div>
              )}
              <button
                onClick={onImport}
                disabled={importData.isPending || !importPreview}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-[#1E88D6] text-white rounded-xl py-3 text-sm font-medium active:opacity-80 disabled:opacity-50"
              >
                {importData.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 rotate-180" />}
                开始导入
              </button>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <p className="text-xs text-gray-400 leading-relaxed">
                提示：Excel 导入请务必使用上方模板的表头（姓名、手机号为必填）。如数据量大或字段复杂，也可把原始表发我协助批量导入。
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
