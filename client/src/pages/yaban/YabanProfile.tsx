/**
 * 牙伴齿科管理 - 我的 Tab（个人中心）
 * 路由：/yaban/profile
 * 风格：蓝色系，沿用牙伴整体清爽蓝白风
 */
import { useRef, useState, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  User,
  Coins,
  Users,
  Building2,
  Wallet,
  ShoppingBag,
  Ticket,
  Settings,
  ReceiptText,
  Database,
  ChevronRight,
  Camera,
  Loader2,
  LayoutDashboard,
  ShieldCheck,
  Globe,
  QrCode,
  Copy,
  Check,
  X,
  CalendarDays,
  Crown,
} from "lucide-react";
import QRCodeLib from "qrcode";
import YabanTabBar from "./YabanTabBar";
import { trpc } from "@/lib/trpc";
import { useYabanClinic } from "./useYabanClinic";
import { compressAvatar } from "@/utils/imageUtils";

// 将 "2026-07-31" 格式转为 "2026年7月31日 星期x"
const fmtDate = (s: string | null | undefined): string => {
  if (!s) return "";
  const m = String(s).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(s).slice(0, 10);
  const weekMap = ["日", "一", "二", "三", "四", "五", "六"];
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${m[1]}年${Number(m[2])}月${Number(m[3])}日 星期${weekMap[d.getDay()]}`;
};

type RowItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
};

// ─── 邀请二维码弹窗 ─────────────────────────────────────────────────────────
function InviteQrModal({ inviteCode, onClose }: { inviteCode: string; onClose: () => void }) {
  const inviteLink = inviteCode ? `https://jiangyuchen.cn/login?invite=${inviteCode}` : "";
  const [qrUrl, setQrUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!inviteLink) return;
    QRCodeLib.toDataURL(inviteLink, { width: 260, margin: 2, color: { dark: "#1a1a1a", light: "#ffffff" } })
      .then(setQrUrl).catch(() => {});
  }, [inviteLink]);

  const handleCopy = async () => {
    if (!inviteLink) return;
    try { await navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="w-full rounded-t-2xl pb-8" style={{ maxWidth: 480, backgroundColor: "#fff" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: "1px solid #ECEFF3" }}>
          <span className="text-[16px] font-extrabold" style={{ color: "#26303C" }}>邀请好友注册</span>
          <button onClick={onClose} className="p-1 rounded-full" style={{ color: "#9AA7B5" }}><X size={20} /></button>
        </div>
        <div className="flex flex-col items-center px-6 pt-5 pb-2">
          <div className="rounded-2xl p-4 mb-3" style={{ backgroundColor: "#F6F8FA" }}>
            {qrUrl ? (
              <img src={qrUrl} alt="邀请二维码" className="rounded-xl" style={{ width: 220, height: 220 }} />
            ) : (
              <div className="rounded-xl flex items-center justify-center" style={{ width: 220, height: 220, backgroundColor: "#ECEFF3" }}>
                <span className="text-[13px]" style={{ color: "#9AA7B5" }}>{inviteCode ? "生成中..." : "加载中..."}</span>
              </div>
            )}
          </div>
          {inviteCode && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[12px]" style={{ color: "#647386" }}>专属邀请码</span>
              <span className="text-[16px] font-extrabold tracking-widest" style={{ color: "#1E88D6" }}>{inviteCode}</span>
            </div>
          )}
          <p className="text-[12px] text-center mb-4" style={{ color: "#9AA7B5" }}>扫描二维码，对方将自动填入邀请码完成注册</p>
          <button
            onClick={handleCopy}
            disabled={!inviteLink}
            className="w-full h-11 rounded-xl text-[14px] font-bold text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
            style={{ background: "linear-gradient(135deg,#2196C8 0%,#4DB8E8 100%)" }}
          >
            {copied ? <><Check size={16} />已复制链接</> : <><Copy size={16} />复制邀请链接</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function YabanProfile() {
  const [, navigate] = useLocation();
  const [showQr, setShowQr] = useState(false);
  const [showServiceDetail, setShowServiceDetail] = useState(false);
  const utils = trpc.useUtils();
  const { data: user } = trpc.auth.me.useQuery();
  const { currentTenantId } = useYabanClinic();
  // 顾客判断：myClinics 返回空数组 = 顾客（未加入任何门店）
  const { data: myClinicsResp } = trpc.yabanClinic.myClinics.useQuery();
  const isCustomer = myClinicsResp !== undefined && (myClinicsResp.clinics || []).length === 0;
  // 角色信息：判断是否院长/股东(owner) 或 创始人(founder)
  const { data: membership } = trpc.yabanRole.myMembership.useQuery({ tenantId: currentTenantId ?? undefined });
  const isOwner = (membership as any)?.member?.role_key === "owner";
  const isFounder = !!(membership as any)?.isFounder || !!(membership as any)?.isSuperAdmin;
  const founderTitle = (membership as any)?.founderTitle as string | undefined;
  // 后端返回带中文名的徽标项：{ key, label, builtin }
  const roleBadgeItems =
    ((membership as any)?.roleBadgeItems as { key: string; label: string; builtin: boolean }[] | undefined) || [];

  // 角色配色映射：key -> 胶囊渐变两色 + 光点色（角色仅作身份标识，与权限解耦）
  const ROLE_TONE: Record<string, { c1: string; c2: string; dot: string }> = {
    founder: { c1: "#F6C56B", c2: "#D98E1F", dot: "#FFF0CC" },
    co_founder: { c1: "#F3CE8A", c2: "#D89A2E", dot: "#FFF4D6" },
    owner: { c1: "#3D9AE0", c2: "#1366A8", dot: "#E8D6A8" },
    shareholder: { c1: "#62ACE6", c2: "#2C7BBE", dot: "#EAD9AE" },
    doctor: { c1: "#48ABEA", c2: "#1E88D6", dot: "#DCEEFB" },
    nurse: { c1: "#3FC2BF", c2: "#118C8C", dot: "#D9F2F0" },
    assistant: { c1: "#54CFCB", c2: "#159E9E", dot: "#D9F2F0" },
    receptionist: { c1: "#8A82E0", c2: "#5B53C7", dot: "#E8E5FB" },
    finance: { c1: "#4FB678", c2: "#2E8B57", dot: "#DCF2E5" },
    user: { c1: "#9AA8B8", c2: "#64748B", dot: "#E4ECF4" },
  };
  // 自定义角色统一灰蓝款
  const CUSTOM_TONE = { c1: "#8AA2BC", c2: "#56708C", dot: "#E4ECF4" };
  // 一人可多角色；为空时退回“用户”
  const badges =
    roleBadgeItems.length > 0
      ? roleBadgeItems.map((it) => ({ label: it.label, tone: it.builtin ? ROLE_TONE[it.key] || CUSTOM_TONE : CUSTOM_TONE }))
      : [{ label: "用户", tone: ROLE_TONE.user }];
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // 头像上传：复用 auth.uploadAvatar（与脉动版同一接口），先压缩再上传
  const uploadAvatar = trpc.auth.uploadAvatar.useMutation({
    onSuccess: () => {
      toast.success("头像已更新");
      utils.auth.me.invalidate();
    },
    onError: (e) => toast.error(e.message || "头像上传失败"),
  });

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("图片大小不能超过 5MB");
      e.target.value = "";
      return;
    }
    try {
      const compressed = await compressAvatar(file, 256, 0.8);
      uploadAvatar.mutate({ imageData: compressed });
    } catch {
      toast.error("图片处理失败，请重试");
    }
    e.target.value = "";
  };

  const points = Number((user as any)?.points ?? 0);
  const balanceQuery = trpc.recharge.getBalance.useQuery();
  const walletBalance =
    typeof balanceQuery.data === "number" ? balanceQuery.data : 0;
  const displayName = (user as any)?.name || (user as any)?.username || "牙伴用户";
  const phone = (user as any)?.phone as string | undefined;
  const avatar = (user as any)?.avatar as string | undefined;
  const inviteCode: string = (user as any)?.inviteCode || "";

  const wip = (name: string) => toast.info(`${name}功能开发中，敬请期待`);

  // 服务到期状态 - 支持多门店切换
  const clinics = myClinicsResp?.clinics || [];
  const [selectedServiceTenantId, setSelectedServiceTenantId] = useState<number | null>(null);
  // 默认取当前门店，或第一家
  const effectiveTenantId = selectedServiceTenantId ?? (currentTenantId || clinics[0]?.tenantId || null);
  const { data: serviceStatus } = trpc.yabanClinic.getMyServiceStatus.useQuery(
    effectiveTenantId ? { tenantId: effectiveTenantId } : undefined,
    { enabled: !isCustomer }
  );
  const PLAN_LABEL: Record<string, string> = { monthly: "月付", annual: "年付", lifetime: "永久版" };

  // 资产快捷入口（积分/牙银）
  const assets: { label: string; value: string; icon: React.ReactNode; onClick: () => void }[] = [
    {
      label: "我的积分",
      value: String(points),
      icon: <Coins className="w-5 h-5 text-[#1E88D6]" />,
      onClick: () => wip("积分"),
    },
    {
      label: "我的钱包",
      value: walletBalance.toFixed(2),
      icon: <Wallet className="w-5 h-5 text-[#1E88D6]" />,
      onClick: () => navigate("/yaban/wallet"),
    },
  ];

  // ── 医院经营角度：单家医院日常经营管理用到的功能 ──
  const clinicRows: RowItem[] = [
    {
      key: "roles",
      icon: <ShieldCheck className="w-5 h-5 text-[#1E88D6]" />,
      label: "账号权限管理",
      hint: "开通员工账号并逐项设置权限",
      onClick: () => navigate("/yaban/settings/roles"),
    },
    {
      key: "data",
      icon: <Database className="w-5 h-5 text-[#1E88D6]" />,
      label: "数据安全管理",
      hint: "数据导出备份与导入存档",
      onClick: () => navigate("/yaban/settings/data"),
    },
    {
      key: "orders",
      icon: <ShoppingBag className="w-5 h-5 text-[#1E88D6]" />,
      label: "商城订单管理",
      hint: "管理商城订单与核销记录",
      onClick: () => navigate("/yaban/shop/admin"),
    },
    {
      key: "charge",
      icon: <ReceiptText className="w-5 h-5 text-[#1E88D6]" />,
      label: "收费项目管理",
      hint: "维护收费项目分类、单价与常用",
      onClick: () => navigate("/yaban/settings/charge-products"),
    },
    {
      key: "account",
      icon: <Settings className="w-5 h-5 text-[#1E88D6]" />,
      label: "账号资料管理",
      hint: "编辑昵称、手机号与头像",
      onClick: () => navigate("/yaban/account"),
    },
    // 乐观显示：membership 未返回时先展示（!membership 视为加载中），返回后若无权限再隐藏
    ...(!membership || isOwner || isFounder
      ? [
          {
            key: "website_features",
            icon: <Globe className="w-5 h-5 text-[#1E88D6]" />,
            label: "网站功能管理",
            hint: "顾客来源设置等自定义配置",
            onClick: () => navigate("/yaban/settings/website-features"),
          } as RowItem,
          {
            key: "company",
            icon: <Building2 className="w-5 h-5 text-[#1E88D6]" />,
            label: "企业信息",
            hint: "填写企业名称与税号，申请开通门诊",
            onClick: () => navigate("/yaban/enterprise"),
          } as RowItem,
        ]
      : []),
  ];

  // ── 平台管理角度：平台/创始人层面的管理动作 ──
  const platformRows: RowItem[] = [
    {
      key: "admin",
      icon: <LayoutDashboard className="w-5 h-5 text-[#1E88D6]" />,
      label: "后台管理",
      hint: "医院数据看板 · 企业审批 · 院长任命",
      onClick: () => navigate("/yaban/admin"),
    },
  ];

  // 账号资料管理已并入上方经营管理组，原独立账号组移除
  const systemRows: RowItem[] = [];

  const renderGroup = (rows: RowItem[]) => (
    <div className="bg-white rounded overflow-hidden shadow-sm">
      {rows.map((row, idx) => (
        <button
          key={row.key}
          onClick={row.onClick}
          className={`w-full flex items-center gap-3 px-4 py-3.5 active:bg-[#F0F7FD] transition-colors ${
            idx !== rows.length - 1 ? "border-b border-gray-100" : ""
          }`}
        >
          <span className="w-9 h-9 rounded-md bg-[#EAF4FE] flex items-center justify-center shrink-0">
            {row.icon}
          </span>
          <span className="flex-1 text-left">
            <span className="block text-sm font-medium text-gray-800">{row.label}</span>
            {row.hint && <span className="block text-xs text-gray-400 mt-0.5">{row.hint}</span>}
          </span>
          <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-20">

      {/* 顶部蓝色头部 + 用户信息 */}
      <div className="bg-gradient-to-b from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="max-w-lg mx-auto px-4 pt-5 pb-6">
          <div className="flex items-center gap-3">
            {/* 头像仅展示；更换头像统一在「账号资料管理」中操作,故移除相机角标与点击上传 */}
            <div className="relative w-16 h-16 shrink-0">
              <span className="absolute inset-0 rounded-md bg-white/20 ring-2 ring-white/40 overflow-hidden flex items-center justify-center">
                {avatar ? (
                  <img src={avatar} alt="头像" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-white" />
                )}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-bold truncate">{displayName}</div>
              {/* 角色徽标：胶囊柔光立体铭牌，一人可多角色并排（仅身份标识） */}
              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                {badges.map((b, i) => (
                  <span
                    key={i}
                    className="relative inline-flex items-center justify-center gap-1.5 h-[22px] px-3 rounded-md text-[12px] font-bold leading-none text-white"
                    style={{
                      background: `linear-gradient(165deg, ${b.tone.c1}, ${b.tone.c2})`,
                      boxShadow:
                        "inset 0 1px 1.5px rgba(255,255,255,.55), inset 0 -2px 4px rgba(0,0,0,.16), 0 2px 5px rgba(20,60,100,.18)",
                      textShadow: "0 1px 1px rgba(0,0,0,.18)",
                    }}
                  >
                    <span
                      className="w-[5px] h-[5px] rounded-md shrink-0"
                      style={{ background: b.tone.dot, boxShadow: "0 0 2px rgba(255,255,255,.8)" }}
                    />
                    {b.label}
                  </span>
                ))}
                {/* 会员状态小徽章：嵌入角色徽标行，不透明实色，可点击查看详情 */}
                {!isCustomer && serviceStatus?.found && (() => {
                  const plan = serviceStatus.plan;
                  const daysLeft = serviceStatus.daysLeft;
                  const expireAt = serviceStatus.expireAt;
                  if (plan === "lifetime") {
                    return (
                      <button onClick={() => setShowServiceDetail(true)}
                        className="inline-flex items-center gap-1 h-[22px] px-2.5 rounded-md text-[11px] font-semibold active:opacity-80"
                        style={{ background: "#B8860B", color: "#FFF8DC" }}>
                        <Crown size={10} strokeWidth={2} />永久版
                      </button>
                    );
                  }
                  if (!expireAt) return null;
                  const expired = daysLeft !== null && daysLeft <= 0;
                  const warning = !expired && daysLeft !== null && daysLeft <= 30;
                  if (expired) {
                    return (
                      <button onClick={() => setShowServiceDetail(true)}
                        className="inline-flex items-center gap-1 h-[22px] px-2.5 rounded-md text-[11px] font-semibold active:opacity-80"
                        style={{ background: "#DC2626", color: "#FFF" }}>
                        <CalendarDays size={10} strokeWidth={2} />已到期
                      </button>
                    );
                  }
                  if (warning) {
                    return (
                      <button onClick={() => setShowServiceDetail(true)}
                        className="inline-flex items-center gap-1 h-[22px] px-2.5 rounded-md text-[11px] font-semibold active:opacity-80"
                        style={{ background: "#D97706", color: "#FFF" }}>
                        <CalendarDays size={10} strokeWidth={2} />{daysLeft}天到期
                      </button>
                    );
                  }
                  return (
                    <button onClick={() => setShowServiceDetail(true)}
                      className="inline-flex items-center gap-1 h-[22px] px-2.5 rounded-md text-[11px] font-semibold active:opacity-80"
                      style={{ background: "#1565A8", color: "#FFF" }}>
                      <CalendarDays size={10} strokeWidth={2} />{PLAN_LABEL[plan ?? ""] ?? "订阅"} · {daysLeft}天
                    </button>
                  );
                })()}
              </div>
            </div>
            {/* 二维码图标按鈕，与头像同行垂直居中，方形圆角风格 */}
            <button
              onClick={() => setShowQr(true)}
              className="flex flex-col items-center justify-center gap-1 shrink-0 active:bg-white/30 transition-colors"
              style={{ backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 8, width: 44, height: 44 }}
              title="邀请好友"
            >
              <QrCode size={18} strokeWidth={1.8} className="text-white" />
              <span className="text-[9px] text-white/80 leading-none">邀请</span>
            </button>
          </div>
        </div>
      </div>

      {/* 资产卡片（上移与头部重叠） */}
      <div className="max-w-lg mx-auto px-4 -mt-4">
        <div className="bg-white rounded shadow-sm flex divide-x divide-gray-100">
          {assets.map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className="flex-1 flex flex-col items-center justify-center py-4 active:bg-[#F0F7FD] transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold text-[#0E5A9E]">{a.value}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                {a.icon}
                <span>{a.label}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 多门店时在资产卡片下方显示门店切换 + 到期日期（仅非顾客且多门店时显示） */}
      {!isCustomer && clinics.length > 1 && (
        <div className="max-w-lg mx-auto px-4 mt-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded shadow-sm">
            <CalendarDays size={13} className="text-gray-400 shrink-0" strokeWidth={1.8} />
            <select
              value={effectiveTenantId ?? ""}
              onChange={(e) => setSelectedServiceTenantId(Number(e.target.value))}
              className="flex-1 text-[12px] text-gray-600 border-0 outline-none bg-transparent cursor-pointer"
            >
              {clinics.map((c) => (
                <option key={c.tenantId} value={c.tenantId}>{c.name}</option>
              ))}
            </select>
            {serviceStatus?.expireAt && (
              <span className="text-[11px] text-gray-400 shrink-0">{fmtDate(serviceStatus.expireAt)}</span>
            )}
          </div>
        </div>
      )}

      {/* 功能分组列表：按「医院经营」与「平台管理」两个角度分区 */}
      <div className="max-w-lg mx-auto px-4 mt-4 space-y-5">
        {/* 顾客专属：微信咨询 + 账号资料管理 */}
        {isCustomer && (
          <div className="space-y-2">
            <div className="px-1 text-xs font-semibold text-gray-400">我的服务</div>
            <div className="bg-white rounded overflow-hidden shadow-sm">
              <button
                onClick={() => navigate("/yaban/wechat-chat")}
                className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-[#F0F7FD] transition-colors border-b border-gray-100"
              >
                <span className="w-9 h-9 rounded-md flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #1AAD19, #2DC12C)" }}>
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                </span>
                <span className="flex-1 text-left">
                  <span className="block text-sm font-medium text-gray-800">微信咨询</span>
                  <span className="block text-xs text-gray-400 mt-0.5">AI 智能助手在线解答您的问题</span>
                </span>
                <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
              </button>
              <button
                onClick={() => navigate("/yaban/account")}
                className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-[#F0F7FD] transition-colors"
              >
                <span className="w-9 h-9 rounded-md bg-[#EAF4FE] flex items-center justify-center shrink-0">
                  <Settings className="w-5 h-5 text-[#1E88D6]" />
                </span>
                <span className="flex-1 text-left">
                  <span className="block text-sm font-medium text-gray-800">账号资料管理</span>
                  <span className="block text-xs text-gray-400 mt-0.5">编辑昵称、手机号与头像</span>
                </span>
                <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
              </button>
            </div>
          </div>
        )}
        {/* 医院经营（员工可见，顾客隐藏） */}
        {!isCustomer && (
          <div className="space-y-2">
            <div className="px-1 text-xs font-semibold text-gray-400">医院经营</div>
            {renderGroup(clinicRows)}
          </div>
        )}

        {/* 平台管理（仅创始人可见） */}
        {isFounder && (
          <div className="space-y-2">
            <div className="px-1 text-xs font-semibold text-gray-400">平台管理</div>
            {renderGroup(platformRows)}
          </div>
        )}

        {/* 账号组：账号资料管理已并入医院经营组,此处仅在仍有项时渲染 */}
        {systemRows.length > 0 && (
          <div className="space-y-2">
            <div className="px-1 text-xs font-semibold text-gray-400">账号</div>
            {renderGroup(systemRows)}
          </div>
        )}
      </div>

      <YabanTabBar />

      {/* 邀请二维码弹窗 */}
      {showQr && <InviteQrModal inviteCode={inviteCode} onClose={() => setShowQr(false)} />}

      {/* 服务订阅详情弹窗 */}
      {showServiceDetail && serviceStatus && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setShowServiceDetail(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-2xl pb-8 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 弹窗标题栏 */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Crown size={16} className="text-[#1E88D6]" strokeWidth={1.8} />
                <span className="text-[15px] font-bold text-gray-800">服务订阅详情</span>
              </div>
              <button onClick={() => setShowServiceDetail(false)} className="text-gray-400 active:text-gray-600">
                <X size={20} strokeWidth={1.8} />
              </button>
            </div>

            {/* 详情内容 */}
            <div className="px-5 pt-4">
              {clinics.length <= 1 ? (
                /* 单门店：显示详细信息 */
                <div className="space-y-0">
                  {clinics.length > 0 && (
                    <div className="flex items-center justify-between py-3 border-b border-gray-100">
                      <span className="text-[13px] text-gray-500">服务门店</span>
                      <span className="text-[13px] font-medium text-gray-800">{clinics[0]?.name || "未知"}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <span className="text-[13px] text-gray-500">套餐类型</span>
                    <span className="text-[13px] font-medium text-gray-800">
                      {serviceStatus.plan ? (PLAN_LABEL[serviceStatus.plan] + "套餐") : "未设置"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <span className="text-[13px] text-gray-500">到期日期</span>
                    <span className={`text-[13px] font-medium ${
                      serviceStatus.plan === "lifetime" ? "text-[#B8860B]" :
                      serviceStatus.daysLeft !== null && serviceStatus.daysLeft <= 0 ? "text-red-600" :
                      serviceStatus.daysLeft !== null && serviceStatus.daysLeft <= 30 ? "text-orange-500" :
                      "text-gray-800"
                    }`}>
                      {serviceStatus.plan === "lifetime" ? "永久有效" :
                       serviceStatus.expireAt ? fmtDate(serviceStatus.expireAt) : "未设置"}
                    </span>
                  </div>
                  {serviceStatus.plan !== "lifetime" && serviceStatus.daysLeft !== null && (
                    <div className="flex items-center justify-between py-3">
                      <span className="text-[13px] text-gray-500">服务状态</span>
                      <span className={`text-[13px] font-semibold ${
                        serviceStatus.daysLeft <= 0 ? "text-red-600" :
                        serviceStatus.daysLeft <= 30 ? "text-orange-500" :
                        "text-[#16A34A]"
                      }`}>
                        {serviceStatus.daysLeft <= 0 ? "已到期，请联系管理员续费"
                          : serviceStatus.daysLeft <= 30 ? `将于 ${serviceStatus.daysLeft} 天内到期，请及时续费`
                          : `正常使用中，还有 ${serviceStatus.daysLeft} 天`}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                /* 多门店：列出所有门店的到期状态 */
                <div className="space-y-0">
                  {clinics.map((c: any, idx: number) => {
                    const plan = c.servicePlan as string | null;
                    const rawExpire = c.serviceExpireAt as string | null;
                    // 处理 mysql2 可能返回 Date 对象的情况
                    const expireAt = (() => {
                      if (!rawExpire) return null;
                      if (rawExpire instanceof Date) {
                        const d = rawExpire as unknown as Date;
                        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
                      }
                      return String(rawExpire).slice(0, 10);
                    })();
                    const daysLeft = expireAt
                      ? Math.ceil((new Date(expireAt).getTime() - Date.now()) / 86400000)
                      : null;
                    const expired = daysLeft !== null && daysLeft <= 0;
                    const warning = !expired && daysLeft !== null && daysLeft <= 30;
                    const isCurrent = c.tenantId === effectiveTenantId;
                    return (
                      <div
                        key={c.tenantId}
                        className={`flex items-center justify-between py-3 ${idx < clinics.length - 1 ? "border-b border-gray-100" : ""}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-[#1E88D6] shrink-0" />}
                          {!isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-transparent shrink-0" />}
                          <span className={`text-[13px] truncate max-w-[130px] ${isCurrent ? "font-semibold text-gray-800" : "text-gray-600"}`}>
                            {c.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {plan === "lifetime" ? (
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ background: "#B8860B", color: "#FFF8DC" }}>永久版</span>
                          ) : expireAt ? (
                            <>
                              <span className="text-[12px] text-gray-400">{fmtDate(expireAt)}</span>
                              <span
                                className="text-[11px] font-semibold px-2 py-0.5 rounded-md"
                                style={{
                                  background: expired ? "#DC2626" : warning ? "#D97706" : "#16A34A",
                                  color: "#FFF"
                                }}
                              >
                                {expired ? "已到期" : warning ? `${daysLeft}天到期` : `还有${daysLeft}天`}
                              </span>
                            </>
                          ) : (
                            <span className="text-[12px] text-gray-300">未设置</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 关闭按鈕 */}
            <div className="px-5 mt-5">
              <button
                onClick={() => setShowServiceDetail(false)}
                className="w-full py-3 rounded-xl text-[14px] font-semibold text-white active:opacity-80"
                style={{ background: "linear-gradient(135deg,#1E88D6,#3BA9E0)" }}
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
