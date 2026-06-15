/**
 * 牙伴齿科管理 - 我的 Tab（个人中心）
 * 路由：/yaban/profile
 * 风格：蓝色系，沿用牙伴整体清爽蓝白风
 */
import { useRef } from "react";
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
  Phone,
  LogOut,
  Camera,
  Loader2,
  LayoutDashboard,
  Crown,
  ShieldCheck,
  Stethoscope,
  HeartPulse,
  ConciergeBell,
  Wallet as WalletBadge,
  UserRound,
} from "lucide-react";
import YabanTabBar from "./YabanTabBar";
import { PageTag } from "@/components/PageTag";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { compressAvatar } from "@/utils/imageUtils";

type RowItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
};

export default function YabanProfile() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: user } = trpc.auth.me.useQuery();
  const { logout } = useAuth();
  // 角色信息：判断是否院长/股东(owner) 或 创始人(founder)
  const { data: membership } = trpc.yabanRole.myMembership.useQuery();
  const isOwner = (membership as any)?.member?.role_key === "owner";
  const isFounder = !!(membership as any)?.isFounder || !!(membership as any)?.isSuperAdmin;
  const founderTitle = (membership as any)?.founderTitle as string | undefined;
  const roleBadgeKeys = ((membership as any)?.roleBadges as string[] | undefined) || [];

  // 徽标元数据：角色 key -> 显示样式（角色仅作身份标识，与权限解耦）
  const BADGE_META: Record<string, { label: string; Icon: any; text: string; bg: string; border: string }> = {
    founder: { label: "创始人", Icon: Crown, text: "#7A4E00", bg: "#FFF1CC", border: "#E6B800" },
    co_founder: { label: "创始股东", Icon: Crown, text: "#9A6A00", bg: "#FFF6DD", border: "#EBC85A" },
    owner: { label: "院长/股东", Icon: ShieldCheck, text: "#0E5A9E", bg: "#DCEBFB", border: "#9CC8EC" },
    doctor: { label: "医生", Icon: Stethoscope, text: "#1E88D6", bg: "#E3F1FC", border: "#A9D3F2" },
    assistant: { label: "护士/助理", Icon: HeartPulse, text: "#0E8C8C", bg: "#DDF3F2", border: "#A2DEDB" },
    receptionist: { label: "前台", Icon: ConciergeBell, text: "#5B53C7", bg: "#E6E4FA", border: "#BBB6EE" },
    finance: { label: "财务", Icon: WalletBadge, text: "#2E8B57", bg: "#DEF3E6", border: "#A7DCBC" },
    user: { label: "用户", Icon: UserRound, text: "#64748B", bg: "#EEF2F6", border: "#D5DEE8" },
  };
  // 一人可多角色：取后端返回的 roleBadges；为空时退回“用户”
  const badges = (roleBadgeKeys.length > 0 ? roleBadgeKeys : ["user"]).map((k) => BADGE_META[k] || BADGE_META.user);
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

  const handleLogout = async () => {
    if (!window.confirm("确认退出当前账号？")) return;
    try {
      // 退出前清掉会话级「查看版本」选择，避免下一个登录用户沿用
      try { sessionStorage.removeItem("_viewing_version"); } catch {}
      await logout();
    } catch {}
    navigate("/login");
  };

  const points = Number((user as any)?.points ?? 0);
  const balanceQuery = trpc.recharge.getBalance.useQuery();
  const walletBalance =
    typeof balanceQuery.data === "number" ? balanceQuery.data : 0;
  const displayName = (user as any)?.name || (user as any)?.username || "牙伴用户";
  const phone = (user as any)?.phone as string | undefined;
  const avatar = (user as any)?.avatar as string | undefined;

  const wip = (name: string) => toast.info(`${name}功能开发中，敬请期待`);

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
      key: "team",
      icon: <Users className="w-5 h-5 text-[#1E88D6]" />,
      label: "团队账号开通",
      hint: "为门诊员工开通账号",
      onClick: () => navigate("/yaban/settings/roles"),
    },
    {
      key: "roles",
      icon: <ShieldCheck className="w-5 h-5 text-[#1E88D6]" />,
      label: "权限管理",
      hint: "为员工与顾客逐项设置权限",
      onClick: () => navigate("/yaban/settings/roles"),
    },
    {
      key: "charge",
      icon: <ReceiptText className="w-5 h-5 text-[#1E88D6]" />,
      label: "收费项目库",
      hint: "维护收费项目分类、单价与常用",
      onClick: () => navigate("/yaban/settings/charge-products"),
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
      label: "商城管理",
      onClick: () => navigate("/yaban/shop/admin"),
    },
    {
      key: "verify",
      icon: <Ticket className="w-5 h-5 text-[#1E88D6]" />,
      label: "核销记录",
      onClick: () => navigate("/yaban/profile/verify-records"),
    },
    ...(isOwner
      ? [
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

  // 账号组（仅个人资料，原“设置”聚合页已拆除）
  const systemRows: RowItem[] = [
    {
      key: "account",
      icon: <Settings className="w-5 h-5 text-[#1E88D6]" />,
      label: "账号资料",
      hint: "编辑昵称、手机号与头像",
      onClick: () => navigate("/yaban/account"),
    },
  ];

  const renderGroup = (rows: RowItem[]) => (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
      {rows.map((row, idx) => (
        <button
          key={row.key}
          onClick={row.onClick}
          className={`w-full flex items-center gap-3 px-4 py-3.5 active:bg-[#F0F7FD] transition-colors ${
            idx !== rows.length - 1 ? "border-b border-gray-100" : ""
          }`}
        >
          <span className="w-9 h-9 rounded-xl bg-[#EAF4FE] flex items-center justify-center shrink-0">
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
      <PageTag code="P303" />

      {/* 顶部蓝色头部 + 用户信息 */}
      <div className="bg-gradient-to-b from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="max-w-lg mx-auto px-4 pt-5 pb-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadAvatar.isPending}
              className="relative w-16 h-16 shrink-0 active:scale-95 transition"
              aria-label="更换头像"
            >
              {/* 内层圆形裁剪层：只负责裁切头像图片 */}
              <span className="absolute inset-0 rounded-full bg-white/20 ring-2 ring-white/40 overflow-hidden flex items-center justify-center">
                {avatar ? (
                  <img src={avatar} alt="头像" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-white" />
                )}
                {/* 上传中遮罩 */}
                {uploadAvatar.isPending && (
                  <span className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  </span>
                )}
              </span>
              {/* 右下角相机角标：实心蓝底白相机，白色描边，置顶不被裁切 */}
              <span className="absolute -bottom-0.5 -right-0.5 z-10 w-6 h-6 rounded-full bg-[#2196C8] flex items-center justify-center ring-2 ring-white shadow-md">
                <Camera className="w-3.5 h-3.5 text-white" strokeWidth={2.2} />
              </span>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickAvatar}
            />
            <div className="min-w-0 flex-1">
              <div className="text-lg font-bold truncate">{displayName}</div>
              {/* 角色徽标：一人可多角色，并排显示（仅身份标识） */}
              <div className="flex items-center gap-1 flex-wrap mt-1">
                {badges.map((b, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold leading-none"
                    style={{ color: b.text, backgroundColor: b.bg, border: `1px solid ${b.border}` }}
                  >
                    <b.Icon className="w-3 h-3" strokeWidth={2.4} />
                    {b.label}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1 text-xs text-white/85 mt-1">
                <Phone className="w-3.5 h-3.5" />
                <span>{phone || "未绑定手机号"}</span>
              </div>
            </div>
            {/* 退出账号按钮 */}
            <button
              onClick={handleLogout}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/20 active:bg-white/30 ring-1 ring-white/40 text-white text-sm transition-colors"
              aria-label="退出登录"
            >
              <LogOut className="w-4 h-4" />
              <span>退出</span>
            </button>
          </div>
        </div>
      </div>

      {/* 资产卡片（上移与头部重叠） */}
      <div className="max-w-lg mx-auto px-4 -mt-4">
        <div className="bg-white rounded-2xl shadow-sm flex divide-x divide-gray-100">
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

      {/* 功能分组列表：按「医院经营」与「平台管理」两个角度分区 */}
      <div className="max-w-lg mx-auto px-4 mt-4 space-y-5">
        {/* 医院经营 */}
        <div className="space-y-2">
          <div className="px-1 text-xs font-semibold text-gray-400">医院经营</div>
          {renderGroup(clinicRows)}
        </div>

        {/* 平台管理（仅创始人可见） */}
        {isFounder && (
          <div className="space-y-2">
            <div className="px-1 text-xs font-semibold text-gray-400">平台管理</div>
            {renderGroup(platformRows)}
          </div>
        )}

        {/* 账号 */}
        <div className="space-y-2">
          <div className="px-1 text-xs font-semibold text-gray-400">账号</div>
          {renderGroup(systemRows)}
        </div>
      </div>

      <YabanTabBar />
    </div>
  );
}
