/**
 * 牙伴齿科管理 - 数据管理子页
 * 路由：/yaban/settings/data
 * 风格：牙伴蓝白风（强调色 #1E88D6）
 * 功能：
 *   Tab1 数据导出备份：选择导出内容（可勾选，默认全部）+ 选择格式(JSON/Excel) + 直接下载 / 发送到邮箱 / 定时邮箱备份
 *   Tab2 数据导入存档：上传 JSON 备份文件，导入还原（重复跳过）
 * 严禁 Emoji。
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
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
} from "lucide-react";
import { PageTag } from "@/components/PageTag";
import { trpc } from "@/lib/trpc";

type Fmt = "json" | "excel";

// 可导出内容模块（可扩展：后续预约/随访/收费等接入后往这里加）
const CONTENT_MODULES = [
  { key: "customer", title: "顾客资料", desc: "全部顾客档案与联系方式", icon: Users, available: true },
];

function base64ToBlob(base64: string, mime: string): Blob {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export default function YabanDataManage() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<"export" | "import">("export");

  // ===== 导出相关状态 =====
  const [contents, setContents] = useState<string[]>(["customer"]);
  const [formats, setFormats] = useState<Fmt[]>(["excel"]);
  const [email, setEmail] = useState("");

  // 定时备份设置
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoFreq, setAutoFreq] = useState<"daily" | "weekly" | "monthly" | "quarterly">("monthly");

  const { data: backupSettings } = trpc.yabanCustomer.getBackupSettings.useQuery();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (backupSettings) {
      setAutoEnabled(!!backupSettings.enabled);
      if (backupSettings.email) setEmail(backupSettings.email);
      if (backupSettings.frequency) setAutoFreq(backupSettings.frequency as any);
      if (backupSettings.formats?.length) setFormats(backupSettings.formats as Fmt[]);
    }
  }, [backupSettings]);

  const toggleContent = (key: string) => {
    const mod = CONTENT_MODULES.find((m) => m.key === key);
    if (!mod?.available) {
      toast.info("该模块即将开放");
      return;
    }
    setContents((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
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
      toast.success("定时备份设置已保存");
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
    if (contents.length === 0) {
      toast.error("请至少选择一项导出内容");
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
    exportData.mutate({ formats });
  };

  const onSendEmail = () => {
    if (!guardBeforeExport()) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("请输入正确的邮箱地址");
      return;
    }
    sendBackupNow.mutate({ email, formats });
  };

  const onSaveAuto = () => {
    if (autoEnabled && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("开启定时备份需填写正确的邮箱");
      return;
    }
    if (formats.length === 0) {
      toast.error("请至少选择一种文件格式");
      return;
    }
    saveSettings.mutate({ enabled: autoEnabled, email, formats, frequency: autoFreq });
  };

  // ===== 导入相关 =====
  const [importPreview, setImportPreview] = useState<{ count: number; customers: any[] } | null>(null);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
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
        toast.error("无法解析该文件，请选择正确的 JSON 存档");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const onImport = () => {
    if (!importPreview || importPreview.customers.length === 0) {
      toast.error("请先选择要导入的 JSON 存档文件");
      return;
    }
    importData.mutate({ customers: importPreview.customers, mode: "skip" });
  };

  const FREQS: { key: typeof autoFreq; label: string }[] = [
    { key: "daily", label: "每天" },
    { key: "weekly", label: "每周" },
    { key: "monthly", label: "每月" },
    { key: "quarterly", label: "每季度" },
  ];

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-12">
      <PageTag code="P317" />

      {/* 头部 */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => navigate("/yaban/settings")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">数据管理</span>
        </div>
        {/* Tab 切换 */}
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
        {tab === "export" ? (
          <>
            {/* 选择导出内容 */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-gray-800">选择导出内容</span>
                <button
                  className="text-xs text-[#1E88D6] active:opacity-70"
                  onClick={() =>
                    setContents(
                      contents.length === CONTENT_MODULES.filter((m) => m.available).length
                        ? []
                        : CONTENT_MODULES.filter((m) => m.available).map((m) => m.key)
                    )
                  }
                >
                  {contents.length === CONTENT_MODULES.filter((m) => m.available).length ? "取消全选" : "全选"}
                </button>
              </div>
              <div className="space-y-2">
                {CONTENT_MODULES.map((m) => {
                  const Icon = m.icon;
                  const checked = contents.includes(m.key);
                  return (
                    <button
                      key={m.key}
                      onClick={() => toggleContent(m.key)}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors ${
                        checked ? "border-[#1E88D6] bg-[#F0F7FD]" : "border-gray-100 bg-gray-50"
                      } ${!m.available ? "opacity-50" : "active:bg-[#EAF4FE]"}`}
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
                        <span className="block text-sm font-medium text-gray-800">{m.title}</span>
                        <span className="block text-xs text-gray-400 mt-0.5">{m.desc}</span>
                      </span>
                      {!m.available && <span className="text-xs text-gray-400">即将开放</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 选择文件格式 */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <span className="text-sm font-bold text-gray-800 block mb-3">选择文件格式</span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => toggleFormat("excel")}
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl border transition-colors ${
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
                <button
                  onClick={() => toggleFormat("json")}
                  className={`flex items-center gap-2 px-3 py-3 rounded-xl border transition-colors ${
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
              </div>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                Excel 便于查看打印；JSON 存档可用于「数据导入存档」还原。
              </p>

              {/* 直接下载 */}
              <button
                onClick={onDownload}
                disabled={exportData.isPending}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-[#1E88D6] text-white rounded-xl py-3 text-sm font-medium active:opacity-80 disabled:opacity-60"
              >
                {exportData.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                导出并下载到本机
              </button>
            </div>

            {/* 发送到邮箱 */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <span className="text-sm font-bold text-gray-800 block mb-3 flex items-center gap-1.5">
                <Mail className="w-4 h-4 text-[#1E88D6]" /> 发送备份到邮箱
              </span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
                placeholder="请输入接收备份的邮箱"
                className="w-full text-sm bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 outline-none focus:border-[#1E88D6]"
              />
              <button
                onClick={onSendEmail}
                disabled={sendBackupNow.isPending}
                className="mt-3 w-full flex items-center justify-center gap-2 bg-[#EAF4FE] text-[#1E88D6] rounded-xl py-3 text-sm font-medium active:opacity-80 disabled:opacity-60"
              >
                {sendBackupNow.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                立即发送到邮箱
              </button>

              {/* 定时备份 */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[#1E88D6]" /> 定时自动备份
                  </span>
                  <button
                    onClick={() => setAutoEnabled((v) => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${autoEnabled ? "bg-[#1E88D6]" : "bg-gray-300"}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                        autoEnabled ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </div>
                {autoEnabled && (
                  <>
                    <div className="grid grid-cols-4 gap-2 mt-3">
                      {FREQS.map((f) => (
                        <button
                          key={f.key}
                          onClick={() => setAutoFreq(f.key)}
                          className={`py-2 text-xs rounded-lg border transition-colors ${
                            autoFreq === f.key
                              ? "border-[#1E88D6] bg-[#F0F7FD] text-[#1E88D6] font-medium"
                              : "border-gray-100 bg-gray-50 text-gray-600"
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      将按所选周期，于北京时间凌晨自动把备份发送到上方邮箱。
                    </p>
                  </>
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
                  保存定时备份设置
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* 导入存档 */}
            <div className="bg-white rounded-2xl shadow-sm p-4">
              <span className="text-sm font-bold text-gray-800 block mb-2">导入 JSON 存档</span>
              <p className="text-xs text-gray-400 leading-relaxed mb-3">
                选择此前在「数据导出备份」中导出的 JSON 存档文件，系统会将其中的顾客数据导入。已存在的顾客（同手机号或同原编号）会自动跳过，导入的顾客将按本店规则重新分配顾客编号。
              </p>
              <label className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[#9CC8EC] rounded-2xl py-8 cursor-pointer active:bg-[#F0F7FD]">
                <Upload className="w-7 h-7 text-[#1E88D6]" />
                <span className="text-sm text-[#1E88D6] font-medium">点击选择 JSON 存档文件</span>
                <input type="file" accept=".json,application/json" className="hidden" onChange={onPickFile} />
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
                提示：如需从其他系统导入历史顾客，请先整理为本系统的 JSON 存档格式，或联系管理员协助批量导入。
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
