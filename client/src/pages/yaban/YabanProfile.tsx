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
  LogOut,
  Camera,
  Loader2,
  LayoutDashboard,
  ShieldCheck,
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

  // 账号资料管理已并入上方经营管理组，原独立账号组移除
  const systemRows: RowItem[] = [];

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
            {/* 头像仅展示；更换头像统一在「账号资料管理」中操作,故移除相机角标与点击上传 */}
            <div className="relative w-16 h-16 shrink-0">
              <span className="absolute inset-0 rounded-full bg-white/20 ring-2 ring-white/40 overflow-hidden flex items-center justify-center">
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
                    className="relative inline-flex items-center justify-center gap-1.5 h-[22px] px-3 rounded-full text-[12px] font-bold leading-none text-white"
                    style={{
                      background: `linear-gradient(165deg, ${b.tone.c1}, ${b.tone.c2})`,
                      boxShadow:
                        "inset 0 1px 1.5px rgba(255,255,255,.55), inset 0 -2px 4px rgba(0,0,0,.16), 0 2px 5px rgba(20,60,100,.18)",
                      textShadow: "0 1px 1px rgba(0,0,0,.18)",
                    }}
                  >
                    <span
                      className="w-[5px] h-[5px] rounded-full shrink-0"
                      style={{ background: b.tone.dot, boxShadow: "0 0 2px rgba(255,255,255,.8)" }}
                    />
                    {b.label}
                  </span>
                ))}
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

        {/* 账号组：账号资料管理已并入医院经营组,此处仅在仍有项时渲染 */}
        {systemRows.length > 0 && (
          <div className="space-y-2">
            <div className="px-1 text-xs font-semibold text-gray-400">账号</div>
            {renderGroup(systemRows)}
          </div>
        )}
      </div>

      <YabanTabBar />
    </div>
  );
}
