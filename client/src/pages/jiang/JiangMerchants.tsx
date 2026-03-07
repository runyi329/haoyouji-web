/**
 * 润仪算力研发中心 - 商户管理
 * 路由：/jiang/merchants
 *
 * §10.3 仅 username === 'jiang' 的管理员可访问
 * 展示所有商户图标网格（类似 iOS 桌面），点击跳转商户首页
 * 图标和名称优先使用商家设置中上传的 shareLogo / shareTitle，
 * 未设置时使用默认图标和名称
 */
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { ChevronLeft, Wine, Cpu, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import JiangTabBar from "./JiangTabBar";
import BottomNav from "@/components/BottomNav";

const SENTIA_ICON = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/sentia-icon-v1_cfb26d59.png";

// 商户基础配置（不含动态数据）
const MERCHANT_CONFIGS = [
  {
    id: "jiang",
    defaultName: "润仪算力",
    defaultSubtitle: "AI 算力研发中心",
    href: "/jiang",
    bgColor: "bg-[#D32F2F]",
    isOwn: true,
    defaultIcon: (
      <div className="flex flex-col items-center justify-center">
        <Cpu className="w-8 h-8 text-white" />
        <span className="text-[9px] font-bold text-white mt-0.5 leading-none">润仪</span>
      </div>
    ),
  },
  {
    id: "wine",
    defaultName: "红酒商会",
    defaultSubtitle: "精品葡萄酒",
    href: "/wine",
    bgColor: "bg-[#3D0C02]",
    isOwn: false,
    defaultIcon: <Wine className="w-9 h-9 text-[#C9A84C]" />,
  },
  {
    id: "beauty",
    defaultName: "奢贝美容",
    defaultSubtitle: "高端美容护肤",
    href: "/beauty",
    bgColor: "bg-gradient-to-br from-[#2d1b2e] to-[#1a0e1b]",
    isOwn: false,
    defaultIcon: <Sparkles className="w-9 h-9 text-pink-300" />,
  },
];

/** 单个商户图标卡片，内部独立请求商家设置 */
function MerchantCard({ config, onPress }: {
  config: typeof MERCHANT_CONFIGS[0];
  onPress: () => void;
}) {
  const { data: shareInfo } = trpc.merchant.getMerchantShareInfo.useQuery(
    { merchantCode: config.id },
    { staleTime: 0, refetchOnWindowFocus: true }
  );

  const logo = (shareInfo as any)?.shareLogo;
  const name = (shareInfo as any)?.shareTitle || config.defaultName;

  return (
    <button
      onClick={onPress}
      className="flex flex-col items-center gap-2 group"
    >
      {/* 图标 */}
      <div
        className={`w-[72px] h-[72px] rounded-[18px] ${config.bgColor} flex items-center justify-center shadow-lg shadow-black/40 relative overflow-hidden transition-transform duration-150 active:scale-95`}
      >
        {/* 高光 */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />

        {logo ? (
          <img
            src={logo}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          config.defaultIcon
        )}

        {/* 自营白点标识 */}
        {config.isOwn && (
          <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-white/80" />
        )}
      </div>

      {/* 商户名称 */}
      <div className="text-center max-w-[80px]">
        <div className="text-white text-[12px] font-medium leading-tight truncate">
          {name}
        </div>
        <div className="text-[#555570] text-[10px] leading-tight mt-0.5 truncate">
          {config.defaultSubtitle}
        </div>
      </div>
    </button>
  );
}

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

      <div className="max-w-lg mx-auto px-4 pt-8 pb-28">
        {/* 说明文字 */}
        <p className="text-[#444466] text-xs mb-8 text-center">
          共 {MERCHANT_CONFIGS.length} 个商户 · 点击图标进入商户首页
        </p>

        {/* iOS 桌面风格图标网格 */}
        <div className="grid grid-cols-3 gap-8 px-4">
          {MERCHANT_CONFIGS.map((config) => (
            <MerchantCard
              key={config.id}
              config={config}
              onPress={() => setLocation(config.href)}
            />
          ))}

          {/* 占位：未来新增商户 */}
          <div className="flex flex-col items-center gap-2 opacity-25">
            <div className="w-[72px] h-[72px] rounded-[18px] bg-[#1a1a2e] border-2 border-dashed border-[#2a2a45] flex items-center justify-center">
              <span className="text-[#444466] text-2xl font-thin">+</span>
            </div>
            <div className="text-[#444466] text-[11px]">新增商户</div>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
