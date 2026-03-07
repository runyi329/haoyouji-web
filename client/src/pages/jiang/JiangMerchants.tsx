/**
 * 润仪算力研发中心 - 商户管理
 * 路由：/jiang/merchants
 *
 * §10.3 仅 username === 'jiang' 的管理员可访问
 * 展示所有商户图标网格（类似 iOS 桌面），点击跳转商户首页
 */
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { ChevronLeft, ExternalLink, Wine, Cpu, Sparkles } from "lucide-react";
import JiangTabBar from "./JiangTabBar";
import BottomNav from "@/components/BottomNav";

const SENTIA_ICON = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/sentia-icon-v1_cfb26d59.png";

// 商户列表配置
const MERCHANTS = [
  {
    id: "jiang",
    name: "润仪算力",
    subtitle: "AI 算力研发中心",
    href: "/jiang",
    bgColor: "bg-[#D32F2F]",
    iconBg: "bg-[#B71C1C]",
    textColor: "text-white",
    subtitleColor: "text-red-200",
    badgeColor: "bg-red-900/60 text-red-200",
    icon: (
      <div className="flex flex-col items-center justify-center">
        <Cpu className="w-8 h-8 text-white" />
        <span className="text-[9px] font-bold text-white mt-0.5 leading-none">润仪</span>
      </div>
    ),
    isOwn: true,
  },
  {
    id: "wine",
    name: "红酒商会",
    subtitle: "精品葡萄酒",
    href: "/wine",
    bgColor: "bg-[#3D0C02]",
    iconBg: "bg-[#8B1A1A]",
    textColor: "text-white",
    subtitleColor: "text-[#C9A84C]",
    badgeColor: "bg-[#8B1A1A]/60 text-[#C9A84C]",
    icon: (
      <Wine className="w-9 h-9 text-[#C9A84C]" />
    ),
    isOwn: false,
  },
  {
    id: "beauty",
    name: "奢贝美容",
    subtitle: "高端美容护肤",
    href: "/beauty",
    bgColor: "bg-gradient-to-br from-[#2d1b2e] to-[#1a0e1b]",
    iconBg: "bg-[#7B1FA2]",
    textColor: "text-white",
    subtitleColor: "text-pink-300",
    badgeColor: "bg-purple-900/60 text-pink-300",
    icon: (
      <Sparkles className="w-9 h-9 text-pink-300" />
    ),
    isOwn: false,
  },
];

export default function JiangMerchants() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // §10.3 仅 jiang 管理员可访问
  const isOwner = user?.username === "jiang";

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col">
        <div className="bg-[#0d0d14] border-b border-[#D32F2F]/20">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
            <img src={SENTIA_ICON} alt="润仪" className="w-8 h-8 rounded-full" />
            <div className="flex-1">
              <div className="text-sm font-bold text-white">润仪算力研发中心</div>
              <div className="text-[10px] text-[#D32F2F]">Runyi AI Compute Lab</div>
            </div>
          </div>
          <JiangTabBar />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
          <div className="w-16 h-16 rounded-full bg-[#D32F2F]/10 border border-[#D32F2F]/20 flex items-center justify-center">
            <Cpu className="w-8 h-8 text-[#D32F2F]/40" />
          </div>
          <p className="text-[#444466] text-sm text-center">无访问权限</p>
          <button
            onClick={() => setLocation("/jiang/profile")}
            className="text-[#D32F2F] text-sm underline"
          >
            返回个人中心
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* 顶部 Header */}
      <div className="bg-[#0d0d14] border-b border-[#D32F2F]/20">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setLocation("/jiang/profile")}
            className="w-8 h-8 rounded-full bg-[#1a1a2e] border border-[#2a2a45] flex items-center justify-center"
          >
            <ChevronLeft className="w-4 h-4 text-[#888]" />
          </button>
          <img src={SENTIA_ICON} alt="润仪" className="w-8 h-8 rounded-full" />
          <div className="flex-1">
            <div className="text-sm font-bold text-white leading-tight">商户管理</div>
            <div className="text-[10px] text-[#D32F2F] leading-tight">Merchant Hub</div>
          </div>
        </div>
        <JiangTabBar />
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 pb-28">
        {/* 说明文字 */}
        <p className="text-[#444466] text-xs mb-5 text-center">
          共 {MERCHANTS.length} 个商户 · 点击图标进入商户首页
        </p>

        {/* iOS 桌面风格图标网格 */}
        <div className="grid grid-cols-3 gap-6 px-2">
          {MERCHANTS.map((merchant) => (
            <button
              key={merchant.id}
              onClick={() => setLocation(merchant.href)}
              className="flex flex-col items-center gap-2 group"
            >
              {/* 图标 */}
              <div
                className={`w-[72px] h-[72px] rounded-[18px] ${merchant.bgColor} flex items-center justify-center shadow-lg shadow-black/40 relative overflow-hidden transition-transform duration-150 active:scale-95`}
              >
                {/* 高光 */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
                {merchant.icon}
                {/* 自营标识 */}
                {merchant.isOwn && (
                  <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-white/80" />
                )}
              </div>

              {/* 商户名称 */}
              <div className="text-center">
                <div className="text-white text-[12px] font-medium leading-tight">
                  {merchant.name}
                </div>
                <div className="text-[#555570] text-[10px] leading-tight mt-0.5">
                  {merchant.subtitle}
                </div>
              </div>
            </button>
          ))}

          {/* 占位：未来新增商户 */}
          <button
            onClick={() => {}}
            className="flex flex-col items-center gap-2 opacity-30"
          >
            <div className="w-[72px] h-[72px] rounded-[18px] bg-[#1a1a2e] border-2 border-dashed border-[#2a2a45] flex items-center justify-center">
              <span className="text-[#444466] text-2xl font-thin">+</span>
            </div>
            <div className="text-[#444466] text-[11px]">新增商户</div>
          </button>
        </div>

        {/* 商户详情列表 */}
        <div className="mt-8 space-y-2">
          <p className="text-[#333355] text-xs font-medium px-1 mb-3">商户详情</p>
          {MERCHANTS.map((merchant) => (
            <button
              key={merchant.id}
              onClick={() => setLocation(merchant.href)}
              className="w-full flex items-center gap-3 bg-[#0d0d1a] border border-[#1e1e35] rounded-xl px-4 py-3 hover:border-[#D32F2F]/30 transition-colors"
            >
              {/* 小图标 */}
              <div className={`w-10 h-10 rounded-[10px] ${merchant.bgColor} flex items-center justify-center flex-shrink-0 shadow-md`}>
                <div className="scale-75">
                  {merchant.icon}
                </div>
              </div>
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-white text-sm font-medium">{merchant.name}</span>
                  {merchant.isOwn && (
                    <span className="text-[9px] bg-[#D32F2F]/20 text-[#D32F2F] px-1.5 py-0.5 rounded-full">自营</span>
                  )}
                </div>
                <div className="text-[#444466] text-[11px]">{merchant.subtitle}</div>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-[#333355] flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
