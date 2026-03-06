/**
 * 润仪算力研发中心 - 个人中心（我的）
 * 路由：/jiang/profile
 *
 * 架构规则（§9.2 固定配置项，必须实现）：
 * - 商家设置（仅 jiang 可见）
 * - 商品管理（仅 jiang 可见）
 * - 联系客服（所有用户可见）
 * - 关于我们（所有用户可见）
 * - 建站规则（所有用户可见，展示脉动共享商盟完整架构文档）
 */
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  User, Share2, Settings, ShoppingBag, MessageCircle, Info,
  ChevronRight, LogIn, LogOut, Cpu, BookOpen, Phone
} from "lucide-react";
import JiangTabBar from "./JiangTabBar";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";

const SENTIA_ICON = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/sentia-icon-v1_cfb26d59.png";

export default function JiangProfile() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  // 仅 jiang 是商家管理员
  const isOwner = user?.username === "jiang";

  // 加载商家设置（用于联系客服信息）
  const { data: shareInfo } = trpc.merchant.getMerchantShareInfo.useQuery(
    { merchantCode: "jiang" },
    { enabled: true }
  );

  // 分享按钮（§3.4 分享链接自带邀请码）
  const handleShare = () => {
    const inviteCode = (user as any)?.inviteCode || "jiang";
    const shareUrl = `${window.location.origin}/jiang?ref=${inviteCode}`;
    if (navigator.share) {
      navigator.share({
        title: "润仪算力研发中心",
        text: "AI 全链路驱动，算力加工，让 AI 为你落地",
        url: shareUrl,
      });
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => {
        toast.success("链接已复制！已包含您的邀请码");
      });
    }
  };

  // 联系客服
  const handleContactService = () => {
    const wechat = (shareInfo as any)?.contactWechat;
    const phone = (shareInfo as any)?.contactPhone;
    if (wechat) {
      toast.info(`商家微信：${wechat}\n请添加微信联系客服`);
    } else if (phone) {
      window.location.href = `tel:${phone}`;
    } else {
      toast.info("请通过微信搜索「润仪算力研发中心」联系我们");
    }
  };

  // 关于我们
  const handleAboutUs = () => {
    setLocation("/jiang/about");
  };

  // 菜单组
  const menuGroups = [
    // 商家管理：仅 jiang 可见（§9.2 固定配置项）
    ...(isOwner ? [{
      title: "商家管理",
      items: [
        {
          icon: <Settings className="w-4 h-4" />,
          label: "商家设置",
          desc: "配置分享信息、Logo、联系方式",
          onPress: () => setLocation("/jiang/settings"),
        },
        {
          icon: <ShoppingBag className="w-4 h-4" />,
          label: "商品管理",
          desc: "管理算力包、服务商品",
          onPress: () => toast.info("商品管理功能即将上线"),
        },
      ],
    }] : []),
    {
      title: "服务支持",
      items: [
        {
          icon: <MessageCircle className="w-4 h-4" />,
          label: "联系客服",
          desc: "微信/电话咨询",
          onPress: handleContactService,
        },
        {
          icon: <Info className="w-4 h-4" />,
          label: "关于我们",
          desc: "品牌介绍与服务承诺",
          onPress: handleAboutUs,
        },
      ],
    },
    {
      title: "平台规范",
      items: [
        {
          icon: <BookOpen className="w-4 h-4" />,
          label: "建站规则",
          desc: "脉动共享商盟完整架构文档",
          onPress: () => setLocation("/jiang/build-rules"),
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* 顶部 Header */}
      <div className="bg-[#0d0d14] border-b border-[#D32F2F]/20">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <img src={SENTIA_ICON} alt="润仪" className="w-8 h-8 rounded-full" />
          <div>
            <div className="text-sm font-bold text-white leading-tight">润仪算力研发中心</div>
            <div className="text-[10px] text-[#D32F2F] leading-tight">Runyi AI Compute Lab</div>
          </div>
        </div>
        <JiangTabBar />
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-4 pb-24">
        {/* 用户信息卡片 */}
        {user ? (
          <div className="bg-gradient-to-r from-[#D32F2F]/20 to-[#0A0A0F] border border-[#D32F2F]/30 rounded-2xl p-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#D32F2F]/20 border-2 border-[#D32F2F]/40 flex items-center justify-center overflow-hidden">
                {(user as any).avatar ? (
                  <img src={(user as any).avatar} alt="头像" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-[#D32F2F]" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-white font-bold text-lg">{(user as any).name || user.username || "用户"}</p>
                <p className="text-[#666680] text-sm">润仪算力研发中心</p>
                <div className="flex items-center gap-1 mt-1">
                  <Cpu className="w-3 h-3 text-[#D32F2F]" />
                  <span className="text-[#D32F2F] text-xs">{isOwner ? "商家管理员" : "算力用户"}</span>
                </div>
              </div>
            </div>
            {/* 分享按钮（§1.3 首页三大必备入口 - 分享） */}
            <button
              onClick={handleShare}
              className="w-full mt-4 flex items-center justify-center gap-2 bg-[#D32F2F]/20 border border-[#D32F2F]/40 rounded-xl py-2.5 text-[#D32F2F] text-sm hover:bg-[#D32F2F]/30 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              分享润仪算力研发中心
            </button>
          </div>
        ) : (
          /* 未登录状态 */
          <div className="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-[#D32F2F]/10 flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-[#666680]" />
            </div>
            <p className="text-white font-medium mb-1">登录后享受更多权益</p>
            <p className="text-[#666680] text-sm mb-4">购买算力包、查看订单记录</p>
            <button
              onClick={() => window.location.href = getLoginUrl()}
              className="w-full bg-[#D32F2F] hover:bg-[#B71C1C] text-white rounded-xl py-3 font-medium transition-colors flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              登录 / 注册
            </button>
            {/* 未登录也可分享（§3.4） */}
            <button
              onClick={handleShare}
              className="w-full mt-2 border border-[#D32F2F]/30 text-[#D32F2F] rounded-xl py-2.5 text-sm hover:bg-[#D32F2F]/10 transition-colors flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4" />
              分享算力中心
            </button>
          </div>
        )}

        {/* 功能菜单 */}
        {menuGroups.map((group) => (
          <div key={group.title} className="bg-[#0d0d1a] border border-[#1e1e35] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#1e1e35]">
              <p className="text-[#444466] text-xs font-medium">{group.title}</p>
            </div>
            {group.items.map((item, i) => (
              <button
                key={i}
                onClick={item.onPress}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-[#D32F2F]/5 transition-colors border-b border-[#1e1e35] last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[#D32F2F]">{item.icon}</span>
                  <div className="text-left">
                    <div className="text-white text-sm">{item.label}</div>
                    {item.desc && <div className="text-[#444466] text-[11px]">{item.desc}</div>}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#444466]" />
              </button>
            ))}
          </div>
        ))}

        {/* 退出登录 */}
        {user && (
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 bg-[#0d0d1a] border border-[#1e1e35] rounded-xl py-3 text-[#444466] text-sm hover:text-white hover:border-[#D32F2F]/40 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
