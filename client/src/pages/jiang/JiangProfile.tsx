/**
 * 润仪算力研发中心 - 个人中心（我的）
 * 路由：/jiang/profile
 *
 * §9.1 双层架构：
 *   - 轻量版（本页）：商家场景专属，内容由商家决定
 *   - 完整版：脉动主 App 个人中心（本页提供跳转入口）
 *
 * §9.2 未登录规则：
 *   - 未登录用户不显示「我的」Tab（由 JiangTabBar 控制）
 *   - 若直接访问本路由，只显示简洁登录按钮，禁止大面积注册引导 UI
 *
 * §9.3 已登录普通用户：
 *   - 内容由商家自行决定（此处提供订单/分享/客服/关于）
 *   - 必须提供「进入完整版个人中心」跳转入口
 *
 * §9.4 商家管理员（username === 'jiang'）：
 *   - 显示商家设置、商品管理、建站规则等管理功能
 */
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  User, Share2, Settings, ShoppingBag, MessageCircle, Info, MessageSquare,
  ChevronRight, LogIn, LogOut, Cpu, BookOpen, ExternalLink,
  ShoppingCart, Store, TrendingUp
} from "lucide-react";
import JiangTabBar from "./JiangTabBar";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";

const SENTIA_ICON = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/sentia-icon-v1_cfb26d59.webp";

export default function JiangProfile() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  // §9.4 商家管理员判断
  const isOwner = user?.username === "jiang";

  // 加载商家联系信息
  const { data: shareInfo } = trpc.merchant.getMerchantShareInfo.useQuery(
    { merchantCode: "jiang" },
    { enabled: true }
  );

  // §3.4 分享按钮：链接自带邀请码
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
      toast.info(`商家微信：${wechat}`);
    } else if (phone) {
      window.location.href = `tel:${phone}`;
    } else {
      toast.info("请通过微信搜索「润仪算力研发中心」联系我们");
    }
  };

  // §9.3 跳转完整版个人中心（脉动主 App）
  const goToFullProfile = () => {
    setLocation("/profile");
  };

  // 菜单组（§9.3 内容由商家自行决定）
  const menuGroups = [
    // §9.4 商家管理员专属
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
        {
          icon: <Store className="w-4 h-4" />,
          label: "商户管理",
          desc: "全部商户一览，点击进入商户首页",
          onPress: () => setLocation("/jiang/merchants"),
        },
        {
          icon: <BookOpen className="w-4 h-4" />,
          label: "建站规则",
          desc: "脉动共享商盟完整架构文档",
          onPress: () => setLocation("/jiang/build-rules"),
        },
        {
          icon: <TrendingUp className="w-4 h-4" />,
          label: "OKX AI 交易助手",
          desc: "实时行情、持仓分析、AI 对话",
          onPress: () => setLocation("/jiang/okx-trader"),
        },
        {
          icon: <MessageSquare className="w-4 h-4" />,
          label: "短信管理",
          desc: "腾讯云短信服务 · 模板 · 发送测试",
          onPress: () => setLocation("/jiang/sms-manage"),
        },
      ],
    }] : []),
    // §9.3 普通用户可见
    {
      title: "我的订单",
      items: [
        {
          icon: <ShoppingCart className="w-4 h-4" />,
          label: "全部订单",
          desc: "查看算力包、服务购买记录",
          onPress: () => toast.info("订单功能即将上线"),
        },
      ],
    },
    {
      title: "服务支持",
      items: [
        {
          icon: <Share2 className="w-4 h-4" />,
          label: "分享算力中心",
          desc: "邀请好友，链接自带您的邀请码",
          onPress: handleShare,
        },
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
          onPress: () => setLocation("/jiang/about"),
        },
      ],
    },
    // 非管理员也能看建站规则
    ...(!isOwner ? [{
      title: "平台规范",
      items: [
        {
          icon: <BookOpen className="w-4 h-4" />,
          label: "建站规则",
          desc: "脉动共享商盟完整架构文档",
          onPress: () => setLocation("/jiang/build-rules"),
        },
      ],
    }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* 顶部 Header */}
      <div className="bg-[#0d0d14] border-b border-[#D32F2F]/20">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <img src={SENTIA_ICON} alt="润仪" className="w-8 h-8 rounded-full" />
          <div className="flex-1">
            <div className="text-sm font-bold text-white leading-tight">润仪算力研发中心</div>
            <div className="text-[10px] text-[#D32F2F] leading-tight">Runyi AI Compute Lab</div>
          </div>
        </div>
        <JiangTabBar />
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-4 pb-24">

        {/* §9.2 未登录：只显示简洁登录按钮 */}
        {!user ? (
          <div className="pt-8 pb-4 text-center">
            <button
              onClick={() => window.location.href = getLoginUrl()}
              className="inline-flex items-center gap-2 bg-[#D32F2F] hover:bg-[#B71C1C] text-white rounded-xl px-8 py-3 font-medium transition-colors text-sm"
            >
              <LogIn className="w-4 h-4" />
              登录
            </button>
          </div>
        ) : (
          <>
            {/* §9.3 已登录用户信息卡片 */}
            <div className="bg-gradient-to-r from-[#D32F2F]/20 to-[#0A0A0F] border border-[#D32F2F]/30 rounded-2xl p-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-[#D32F2F]/20 border-2 border-[#D32F2F]/40 flex items-center justify-center overflow-hidden">
                  {(user as any).avatar ? (
                    <img src={(user as any).avatar} alt="头像" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-7 h-7 text-[#D32F2F]" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-white font-bold">{(user as any).name || user.username || "用户"}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Cpu className="w-3 h-3 text-[#D32F2F]" />
                    <span className="text-[#D32F2F] text-xs">{isOwner ? "商家管理员" : "算力用户"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* §9.3 跳转完整版个人中心（脉动主 App） */}
            <button
              onClick={goToFullProfile}
              className="w-full flex items-center justify-between bg-[#0d0d1a] border border-[#1e1e35] rounded-xl px-4 py-3 hover:border-[#D32F2F]/40 transition-colors"
            >
              <div className="flex items-center gap-3">
                <ExternalLink className="w-4 h-4 text-[#666680]" />
                <div className="text-left">
                  <div className="text-white text-sm">进入完整版个人中心</div>
                  <div className="text-[#444466] text-[11px]">脉动主 App · 人脉、账本、全部订单</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#444466]" />
            </button>

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
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 bg-[#0d0d1a] border border-[#1e1e35] rounded-xl py-3 text-[#444466] text-sm hover:text-white hover:border-[#D32F2F]/40 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              退出登录
            </button>
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
