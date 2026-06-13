/**
 * 牙伴齿科管理 - 我的 Tab（个人中心）
 * 路由：/yaban/profile
 * 风格：蓝色系，沿用牙伴整体清爽蓝白风
 */
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
  Headset,
  Settings,
  ChevronRight,
  Phone,
} from "lucide-react";
import YabanTabBar from "./YabanTabBar";
import { PageTag } from "@/components/PageTag";
import { trpc } from "@/lib/trpc";

type RowItem = {
  key: string;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
};

export default function YabanProfile() {
  const [, navigate] = useLocation();
  const { data: user } = trpc.auth.me.useQuery();

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

  // 团队/企业组
  const orgRows: RowItem[] = [
    {
      key: "team",
      icon: <Users className="w-5 h-5 text-[#1E88D6]" />,
      label: "团队账号开通",
      hint: "为门诊员工开通账号",
      onClick: () => wip("团队账号开通"),
    },
    {
      key: "company",
      icon: <Building2 className="w-5 h-5 text-[#1E88D6]" />,
      label: "企业信息",
      hint: "暂未关联门诊",
      onClick: () => wip("企业信息"),
    },
  ];

  // 商城/服务组
  const serviceRows: RowItem[] = [
    {
      key: "orders",
      icon: <ShoppingBag className="w-5 h-5 text-[#1E88D6]" />,
      label: "商城订单",
      onClick: () => navigate("/yaban/shop/my-orders"),
    },
    {
      key: "verify",
      icon: <Ticket className="w-5 h-5 text-[#1E88D6]" />,
      label: "核销记录",
      onClick: () => navigate("/yaban/profile/verify-records"),
    },
    {
      key: "advisor",
      icon: <Headset className="w-5 h-5 text-[#1E88D6]" />,
      label: "我的专属服务顾问",
      onClick: () => wip("专属服务顾问"),
    },
  ];

  // 系统组
  const systemRows: RowItem[] = [
    {
      key: "settings",
      icon: <Settings className="w-5 h-5 text-[#1E88D6]" />,
      label: "设置",
      onClick: () => navigate("/yaban/settings"),
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
        <div className="max-w-lg mx-auto px-4 pt-4 pb-6">
          <div className="text-sm font-bold mb-4">我的</div>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-white/20 ring-2 ring-white/40 overflow-hidden flex items-center justify-center shrink-0">
              {avatar ? (
                <img src={avatar} alt="头像" className="w-full h-full object-cover" />
              ) : (
                <User className="w-8 h-8 text-white" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold truncate">{displayName}</div>
              <div className="flex items-center gap-1 text-xs text-white/85 mt-1">
                <Phone className="w-3.5 h-3.5" />
                <span>{phone || "未绑定手机号"}</span>
              </div>
            </div>
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

      {/* 功能分组列表 */}
      <div className="max-w-lg mx-auto px-4 mt-4 space-y-3">
        {renderGroup(orgRows)}
        {renderGroup(serviceRows)}
        {renderGroup(systemRows)}
      </div>

      <YabanTabBar />
    </div>
  );
}
