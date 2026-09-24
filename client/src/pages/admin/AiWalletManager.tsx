import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  BookOpenText,
  Check,
  ChevronRight,
  CircleAlert,
  FileText,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";

type Asset = "CNY" | "USDT";
type TemplateKey = "cny_simple" | "stablecoin" | "blockchain" | "hybrid" | "custom";
type RatePolicy = "not_required" | "live_market" | "order_snapshot";
type TargetType = "ledger" | "site_version";

type Archive = {
  title: string;
  subtitle: string;
  generatedAt: string;
  sections: Array<{ title: string; lines: string[] }>;
};

type Profile = {
  id: number;
  targetType: TargetType;
  targetKey: string;
  targetName: string;
  targetMeta: { ledgerId?: number; versionKey?: string; ledgerType?: string; primaryCurrency?: string; projectEnabled?: boolean };
  templateKey: TemplateKey;
  enabled: boolean;
  visibleAssets: Asset[];
  defaultAsset: Asset;
  allowRecharge: boolean;
  allowWithdrawal: boolean;
  allowTransfer: boolean;
  allowAdminAdjustment: boolean;
  allowOrderDebit: boolean;
  showMarket: boolean;
  showNetworks: boolean;
  ratePolicy: RatePolicy;
  createdAt: string;
  updatedAt: string;
  archive: Archive;
};

type Target = { type: TargetType; key: string; id: number; name: string; subtitle: string; available: boolean };

type Template = {
  key: TemplateKey;
  name: string;
  description: string;
  defaults: {
    visibleAssets: Asset[];
    defaultAsset: Asset;
    allowRecharge: boolean;
    allowWithdrawal: boolean;
    allowTransfer: boolean;
    showMarket: boolean;
    showNetworks: boolean;
    ratePolicy: RatePolicy;
  };
};

type FormState = {
  id?: number;
  targetType: TargetType;
  targetKey: string;
  templateKey: TemplateKey;
  enabled: boolean;
  visibleAssets: Asset[];
  defaultAsset: Asset;
  allowRecharge: boolean;
  allowWithdrawal: boolean;
  allowTransfer: boolean;
  allowAdminAdjustment: boolean;
  allowOrderDebit: boolean;
  showMarket: boolean;
  showNetworks: boolean;
  ratePolicy: RatePolicy;
};

const emptyForm = (): FormState => ({
  targetType: "ledger",
  targetKey: "",
  templateKey: "cny_simple",
  enabled: false,
  visibleAssets: ["CNY"],
  defaultAsset: "CNY",
  allowRecharge: false,
  allowWithdrawal: false,
  allowTransfer: false,
  allowAdminAdjustment: false,
  allowOrderDebit: false,
  showMarket: false,
  showNetworks: false,
  ratePolicy: "not_required",
});

function formatDate(value: string) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString("zh-CN", { hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "尚未生成";
}

function ToggleRow({ label, description, checked, onChange, disabled = false }: { label: string; description: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-3 text-left py-3 border-b border-slate-100 last:border-0 disabled:opacity-50"
    >
      <span className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${checked ? "bg-[#2358D9]" : "bg-slate-200"}`}>
        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-slate-800">{label}</span>
        <span className="block mt-0.5 text-[11px] leading-relaxed text-slate-400">{description}</span>
      </span>
    </button>
  );
}

function ArchiveSheet({ archive, onClose }: { archive: Archive; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/45">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] bg-[#F8FAFC] shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#2358D9]">
            <BookOpenText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-bold text-slate-900">{archive.title}</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{archive.subtitle}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-500 active:scale-95" aria-label="关闭档案">
            <X className="h-5 w-5" />
          </button>
        </header>
        <main className="space-y-3 p-4 pb-8">
          <div className="flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-[11px] leading-relaxed text-blue-700">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>本档案由当前结构化配置与既有系统能力自动生成，仅供核对，不可直接编辑。</span>
          </div>
          {archive.sections.map((section) => (
            <section key={section.title} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2.5 text-[13px] font-bold text-slate-800">{section.title}</h3>
              <ul className="space-y-2">
                {section.lines.map((line, index) => (
                  <li key={`${section.title}-${index}`} className="flex gap-2 text-[12px] leading-[1.7] text-slate-600">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#5E7FE9]" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="px-1 text-center text-[10px] text-slate-400">配置更新时间：{formatDate(archive.generatedAt)}</p>
        </main>
      </div>
    </div>
  );
}

export default function AiWalletManager() {
  const [, navigate] = useLocation();
  const { data: currentUser, isLoading: userLoading } = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const isSuperAdmin = (currentUser as any)?.role === "super_admin";
  const overviewQuery = trpc.aiWallet.overview.useQuery(undefined, { enabled: isSuperAdmin, refetchOnWindowFocus: false });
  const utils = trpc.useUtils();
  const [activeView, setActiveView] = useState<"profiles" | "archives" | "system">("profiles");
  const [sheetArchive, setSheetArchive] = useState<Archive | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const profiles: Profile[] = (overviewQuery.data?.profiles ?? []) as Profile[];
  const targets: Target[] = (overviewQuery.data?.targets ?? []) as Target[];
  const templates: Template[] = (overviewQuery.data?.catalog?.templates ?? []) as Template[];
  const assets: Array<{ code: Asset; name: string; currentSupport: boolean; detail: string }> = (overviewQuery.data?.catalog?.assets ?? []) as any;
  const ratePolicies: Array<{ key: RatePolicy; name: string; description: string }> = (overviewQuery.data?.catalog?.ratePolicies ?? []) as any;

  const selectedTarget = useMemo(() => targets.find((target) => target.key === form.targetKey), [form.targetKey, targets]);
  const editableTargets = useMemo(() => {
    const editingKey = form.id ? profiles.find((profile) => profile.id === form.id)?.targetKey : null;
    const used = new Set(profiles.filter((profile) => profile.targetKey !== editingKey).map((profile) => profile.targetKey));
    return targets.filter((target) => !used.has(target.key));
  }, [form.id, profiles, targets]);

  useEffect(() => {
    if (!isEditing || form.targetKey || !editableTargets.length) return;
    const first = editableTargets[0];
    setForm((previous) => ({ ...previous, targetType: first.type, targetKey: first.key }));
  }, [editableTargets, form.targetKey, isEditing]);

  const saveMutation = trpc.aiWallet.saveProfile.useMutation({
    onSuccess: async () => {
      toast.success("项目钱包配置已保存，档案文字已同步更新");
      await utils.aiWallet.overview.invalidate();
      setIsEditing(false);
    },
    onError: (error) => toast.error(error.message || "保存失败"),
  });

  const openCreate = () => {
    const first = targets.find((target) => !profiles.some((profile) => profile.targetKey === target.key));
    if (!first) {
      toast.message("所有现有项目均已有钱包档案，可直接编辑已有档案");
      return;
    }
    setForm({ ...emptyForm(), targetType: first.type, targetKey: first.key });
    setIsEditing(true);
  };

  const openEdit = (profile: Profile) => {
    setForm({
      id: profile.id,
      targetType: profile.targetType,
      targetKey: profile.targetKey,
      templateKey: profile.templateKey,
      enabled: profile.enabled,
      visibleAssets: profile.visibleAssets,
      defaultAsset: profile.defaultAsset,
      allowRecharge: profile.allowRecharge,
      allowWithdrawal: profile.allowWithdrawal,
      allowTransfer: profile.allowTransfer,
      allowAdminAdjustment: profile.allowAdminAdjustment,
      allowOrderDebit: profile.allowOrderDebit,
      showMarket: profile.showMarket,
      showNetworks: profile.showNetworks,
      ratePolicy: profile.ratePolicy,
    });
    setIsEditing(true);
  };

  const applyTemplate = (templateKey: TemplateKey) => {
    const template = templates.find((item) => item.key === templateKey);
    if (!template) return;
    setForm((previous) => ({ ...previous, templateKey, ...template.defaults }));
  };

  const toggleAsset = (asset: Asset) => {
    setForm((previous) => {
      const hasAsset = previous.visibleAssets.includes(asset);
      const visibleAssets = hasAsset
        ? previous.visibleAssets.filter((item) => item !== asset)
        : [...previous.visibleAssets, asset];
      if (!visibleAssets.length) {
        toast.error("至少保留一种可见资产");
        return previous;
      }
      return { ...previous, visibleAssets, defaultAsset: visibleAssets.includes(previous.defaultAsset) ? previous.defaultAsset : visibleAssets[0] };
    });
  };

  const submit = () => {
    if (!form.targetKey || !selectedTarget) {
      toast.error("请选择一个项目或账本");
      return;
    }
    if (!form.visibleAssets.includes(form.defaultAsset)) {
      toast.error("默认资产必须在可见资产中");
      return;
    }
    saveMutation.mutate(form);
  };

  if (userLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="h-6 w-6 animate-spin text-[#2358D9]" /></div>;
  }
  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <div className="mb-3 text-6xl font-bold text-slate-200">404</div>
        <p className="text-sm text-slate-500">页面不存在</p>
        <button onClick={() => navigate("/")} className="mt-5 rounded-full bg-[#2358D9] px-5 py-2 text-sm font-semibold text-white">返回首页</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FB] pb-10">
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-4">
          <button onClick={() => navigate("/admin/projects")} className="-ml-1 rounded-full p-1.5 text-slate-700 active:scale-95" aria-label="返回项目总控台"><ArrowLeft className="h-5 w-5" /></button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[16px] font-bold text-slate-900">AI 智能钱包</h1>
            <p className="text-[10px] text-slate-400">项目配置 · 资产范围 · 只读档案</p>
          </div>
          <button onClick={() => overviewQuery.refetch()} className="rounded-full p-2 text-slate-500 active:scale-95" aria-label="刷新">
            <RefreshCw className={`h-4 w-4 ${overviewQuery.isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 pt-4">
        <section className="overflow-hidden rounded-[22px] bg-gradient-to-br from-[#173B91] via-[#2358D9] to-[#5B83EB] p-5 text-white shadow-lg shadow-blue-200/60">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[12px] text-blue-100"><WalletCards className="h-4 w-4" />全局项目账户配置中心</div>
              <h2 className="mt-2 text-[20px] font-bold">按需启用，统一审计</h2>
              <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-blue-100">项目只看到获准资产与入口；每个项目档案由真实配置自动生成，不允许手写改动。</p>
            </div>
            <div className="rounded-2xl bg-white/15 px-3 py-2 text-center backdrop-blur"><div className="text-xl font-bold">{profiles.filter((profile) => profile.enabled).length}</div><div className="text-[10px] text-blue-100">已启用档案</div></div>
          </div>
        </section>

        <div className="grid grid-cols-3 rounded-2xl bg-white p-1.5 shadow-sm">
          {[
            { key: "profiles", label: "项目配置", icon: Settings2 },
            { key: "archives", label: "项目档案", icon: FileText },
            { key: "system", label: "全局档案", icon: Landmark },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeView === tab.key;
            return <button key={tab.key} onClick={() => setActiveView(tab.key as typeof activeView)} className={`flex items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold transition-colors ${active ? "bg-[#EAF0FF] text-[#2358D9]" : "text-slate-400"}`}><Icon className="h-3.5 w-3.5" />{tab.label}</button>;
          })}
        </div>

        {overviewQuery.isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : activeView === "profiles" ? (
          <>
            <section className="rounded-2xl border border-amber-100 bg-amber-50 p-3.5 text-[11px] leading-relaxed text-amber-800">
              <div className="flex gap-2"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /><p>配置“启用”表示项目已获准使用相应钱包能力；实际用户端入口与资金动作仍会被服务端的余额、角色、限额和审核规则再次校验。</p></div>
            </section>
            <div className="flex items-center justify-between px-1">
              <div><h2 className="text-[14px] font-bold text-slate-800">项目账户档案</h2><p className="mt-0.5 text-[11px] text-slate-400">已有项目可编辑；新项目可新增一个按需档案。</p></div>
              <button onClick={openCreate} className="inline-flex items-center gap-1 rounded-full bg-[#2358D9] px-3 py-2 text-[12px] font-semibold text-white shadow-sm active:scale-95"><Plus className="h-4 w-4" />新建档案</button>
            </div>
            {profiles.length === 0 ? (
              <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400">尚未创建项目钱包档案</div>
            ) : profiles.map((profile) => (
              <section key={profile.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${profile.enabled ? "bg-blue-50 text-[#2358D9]" : "bg-slate-100 text-slate-400"}`}><WalletCards className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5"><h3 className="text-[14px] font-bold text-slate-900">{profile.targetName}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${profile.enabled ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>{profile.enabled ? "已启用" : "未启用"}</span></div>
                    <p className="mt-1 text-[11px] text-slate-400">{profile.targetType === "ledger" ? `账本 · ${profile.targetKey}` : `站点项目 · ${profile.targetKey}`}</p>
                  </div>
                  <button onClick={() => openEdit(profile)} className="rounded-xl bg-slate-50 p-2 text-slate-500 active:scale-95" aria-label={`编辑${profile.targetName}`}><Pencil className="h-4 w-4" /></button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {profile.visibleAssets.map((asset) => <span key={asset} className="rounded-lg bg-[#EEF3FF] px-2 py-1 text-[10px] font-bold text-[#2358D9]">{asset}</span>)}
                  <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] text-slate-500">{templates.find((item) => item.key === profile.templateKey)?.name || "自定义"}</span>
                  {profile.showMarket && <span className="rounded-lg bg-violet-50 px-2 py-1 text-[10px] text-violet-600">实时估值</span>}
                  {profile.allowTransfer && <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] text-emerald-600">站内转账</span>}
                  {profile.allowAdminAdjustment && <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] text-amber-700">手动调账</span>}
                  {profile.allowOrderDebit && <span className="rounded-lg bg-rose-50 px-2 py-1 text-[10px] text-rose-600">订单扣款</span>}
                </div>
                <button onClick={() => setSheetArchive(profile.archive)} className="mt-3 flex w-full items-center gap-2 rounded-xl border border-slate-100 bg-[#FBFCFF] px-3 py-2.5 text-left text-[12px] font-semibold text-slate-600 active:scale-[0.99]">
                  <BookOpenText className="h-4 w-4 text-[#2358D9]" /><span className="flex-1">查看项目钱包档案（只读说明）</span><ChevronRight className="h-4 w-4 text-slate-300" />
                </button>
                {profile.targetKey === "ledger:52" && (
                  <button onClick={() => navigate("/ledger/52/af-recharge-manage")} className="mt-2 flex w-full items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-left text-[12px] font-semibold text-amber-800 active:scale-[0.99]">
                    <Settings2 className="h-4 w-4" /><span className="flex-1">进入管理员手动调账与全局流水</span><ChevronRight className="h-4 w-4 text-amber-400" />
                  </button>
                )}
              </section>
            ))}
          </>
        ) : activeView === "archives" ? (
          <>
            <section className="rounded-2xl border border-blue-100 bg-blue-50 p-3.5 text-[11px] leading-relaxed text-blue-700"><div className="flex gap-2"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />项目档案不保存自由文字。资产、资金入口、估值规则和当前实际能力全部从结构化配置和服务端规则生成。</div></section>
            {profiles.map((profile) => <button key={profile.id} onClick={() => setSheetArchive(profile.archive)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm active:scale-[0.99]"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-[#2358D9]"><FileText className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="text-[13px] font-bold text-slate-800">{profile.archive.title}</div><div className="mt-1 truncate text-[11px] text-slate-400">更新于 {formatDate(profile.archive.generatedAt)}</div></div><ChevronRight className="h-4 w-4 text-slate-300" /></button>)}
          </>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-[#2358D9]"><Landmark className="h-5 w-5" /></div><div><h2 className="text-[14px] font-bold text-slate-800">当前可用资产</h2><p className="mt-0.5 text-[11px] text-slate-400">新增资产前先确认资金通道、精度、余额与审计规则。</p></div></div><div className="mt-4 space-y-2">{assets.map((asset) => <div key={asset.code} className="rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between"><span className="text-[13px] font-bold text-slate-800">{asset.name} · {asset.code}</span><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">当前支持</span></div><p className="mt-1 text-[11px] leading-relaxed text-slate-500">{asset.detail}</p></div>)}</div></section>
            {overviewQuery.data?.systemArchive && <button onClick={() => setSheetArchive(overviewQuery.data.systemArchive as Archive)} className="flex w-full items-center gap-3 rounded-2xl bg-[#173B91] p-4 text-left text-white shadow-lg shadow-blue-200 active:scale-[0.99]"><BookOpenText className="h-5 w-5" /><div className="min-w-0 flex-1"><div className="text-[13px] font-bold">查看全局 AI 智能钱包基础档案</div><div className="mt-1 text-[11px] text-blue-100">资金底座、行情服务、风控边界和现阶段缺口</div></div><ChevronRight className="h-4 w-4 text-blue-200" /></button>}
          </>
        )}
      </main>

      {sheetArchive && <ArchiveSheet archive={sheetArchive} onClose={() => setSheetArchive(null)} />}

      {isEditing && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/45">
          <div className="max-h-[93vh] w-full max-w-xl overflow-y-auto rounded-t-[28px] bg-white shadow-2xl">
            <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-100 bg-white px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-[#2358D9]"><Settings2 className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1"><h2 className="text-[16px] font-bold text-slate-900">{form.id ? "编辑项目钱包配置" : "新建项目钱包档案"}</h2><p className="text-[11px] text-slate-400">保存后会自动重写对应的只读文字档案。</p></div>
              <button onClick={() => setIsEditing(false)} className="rounded-full p-2 text-slate-500"><X className="h-5 w-5" /></button>
            </header>
            <div className="space-y-4 p-4 pb-8">
              <section className="rounded-2xl border border-slate-100 p-4">
                <h3 className="mb-3 text-[13px] font-bold text-slate-800">绑定项目</h3>
                <label className="block text-[11px] font-medium text-slate-500">项目或账本</label>
                <select disabled={Boolean(form.id)} value={form.targetKey} onChange={(event) => { const target = targets.find((item) => item.key === event.target.value); if (target) setForm((previous) => ({ ...previous, targetKey: target.key, targetType: target.type })); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[13px] font-medium text-slate-700 outline-none focus:border-[#2358D9] disabled:bg-slate-50 disabled:text-slate-400">
                  {!form.id && editableTargets.map((target) => <option key={target.key} value={target.key}>{target.name} · {target.subtitle}</option>)}
                  {form.id && <option value={form.targetKey}>{selectedTarget?.name || form.targetKey}</option>}
                </select>
                {selectedTarget && <p className="mt-2 text-[11px] text-slate-400">{selectedTarget.subtitle} · {selectedTarget.available ? "当前对象可用" : "项目当前处于停用状态"}</p>}
              </section>

              <section className="rounded-2xl border border-slate-100 p-4">
                <h3 className="mb-3 text-[13px] font-bold text-slate-800">钱包模板</h3>
                <div className="space-y-2">{templates.map((template) => <button type="button" key={template.key} onClick={() => applyTemplate(template.key)} className={`w-full rounded-xl border p-3 text-left transition-colors ${form.templateKey === template.key ? "border-[#2358D9] bg-[#F4F7FF]" : "border-slate-100 bg-white"}`}><div className="flex items-center gap-2"><span className="flex-1 text-[12px] font-bold text-slate-800">{template.name}</span>{form.templateKey === template.key && <Check className="h-4 w-4 text-[#2358D9]" />}</div><p className="mt-1 text-[10px] leading-relaxed text-slate-400">{template.description}</p></button>)}</div>
              </section>

              <section className="rounded-2xl border border-slate-100 p-4">
                <h3 className="mb-3 text-[13px] font-bold text-slate-800">资产与展示</h3>
                <div className="flex gap-2">{(["CNY", "USDT"] as Asset[]).map((asset) => <button type="button" key={asset} onClick={() => toggleAsset(asset)} className={`flex-1 rounded-xl border px-3 py-2.5 text-[13px] font-bold ${form.visibleAssets.includes(asset) ? "border-[#2358D9] bg-[#EEF3FF] text-[#2358D9]" : "border-slate-200 text-slate-400"}`}>{asset === "CNY" ? "人民币 CNY" : "泰达币 USDT"}</button>)}</div>
                <label className="mt-4 block text-[11px] font-medium text-slate-500">默认展示资产</label>
                <select value={form.defaultAsset} onChange={(event) => setForm((previous) => ({ ...previous, defaultAsset: event.target.value as Asset }))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[13px] outline-none focus:border-[#2358D9]">{form.visibleAssets.map((asset) => <option key={asset} value={asset}>{asset}</option>)}</select>
                <ToggleRow label="显示行情与估值" description="仅用于项目页面展示；业务结算仍遵循下方的结算口径。" checked={form.showMarket} onChange={(next) => setForm((previous) => ({ ...previous, showMarket: next }))} />
                <ToggleRow label="显示链网络信息" description="只呈现系统当前已配置、已启用的网络与地址状态。" checked={form.showNetworks} onChange={(next) => setForm((previous) => ({ ...previous, showNetworks: next }))} />
              </section>

              <section className="rounded-2xl border border-slate-100 p-4">
                <h3 className="mb-1 text-[13px] font-bold text-slate-800">项目计划开放的操作</h3>
                <p className="mb-2 text-[10px] leading-relaxed text-slate-400">这里是项目授权开关，不会绕过实际余额、审核、限额与服务端权限校验。</p>
                <ToggleRow label="允许充值入口" description="USDT 现有正式充值链路可复用；CNY 用户端申请链路尚未正式接入。" checked={form.allowRecharge} onChange={(next) => setForm((previous) => ({ ...previous, allowRecharge: next }))} />
                <ToggleRow label="允许提现入口" description="USDT 现有审核链路可复用；CNY 用户端提现申请仍需建设。" checked={form.allowWithdrawal} onChange={(next) => setForm((previous) => ({ ...previous, allowWithdrawal: next }))} />
                <ToggleRow label="允许站内转账" description="现有能力只支持 CNY/USDT；每笔操作不可撤回，只能反向转账纠正。" checked={form.allowTransfer} onChange={(next) => setForm((previous) => ({ ...previous, allowTransfer: next }))} />
                <ToggleRow label="允许管理员手动调账" description="仅影响新增或编辑的人工加减余额；既有记录的撤销/纠正与客户应收退款保持可用，避免资金冻结。" checked={form.allowAdminAdjustment} onChange={(next) => setForm((previous) => ({ ...previous, allowAdminAdjustment: next }))} />
                <ToggleRow label="允许业务订单扣款" description="控制新建业务订单从钱包扣款。关闭后不影响已创建订单的撤单退款、卖出结算回款或其他已产生应收款。" checked={form.allowOrderDebit} onChange={(next) => setForm((previous) => ({ ...previous, allowOrderDebit: next }))} />
              </section>

              <section className="rounded-2xl border border-slate-100 p-4">
                <h3 className="mb-3 text-[13px] font-bold text-slate-800">估值与结算口径</h3>
                <select value={form.ratePolicy} onChange={(event) => setForm((previous) => ({ ...previous, ratePolicy: event.target.value as RatePolicy }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[13px] outline-none focus:border-[#2358D9]">{ratePolicies.map((policy) => <option key={policy.key} value={policy.key}>{policy.name}</option>)}</select>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{ratePolicies.find((policy) => policy.key === form.ratePolicy)?.description}</p>
              </section>

              <section className="rounded-2xl border border-slate-100 p-4"><ToggleRow label="启用该项目钱包档案" description="关闭后保留配置与档案，但未来项目入口应视为未获准使用钱包能力。" checked={form.enabled} onChange={(next) => setForm((previous) => ({ ...previous, enabled: next }))} /></section>

              <button onClick={submit} disabled={saveMutation.isPending} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2358D9] py-3.5 text-[14px] font-bold text-white shadow-lg shadow-blue-200 disabled:opacity-60 active:scale-[0.99]">{saveMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}{saveMutation.isPending ? "保存中…" : "保存配置并更新档案"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
