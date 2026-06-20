/**
 * 红酒文化商会 - 我的（个人中心）
 * 路径: /wine/profile
 * 
 * 架构规则（§9.2 固定配置项，必须实现）：
 * - 商家设置（仅 cx8618 可见）
 * - 商品管理（仅 cx8618 可见）
 * - 联系客服（所有用户可见）
 * - 关于我们（所有用户可见）
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  User, Share2, Package, ShoppingBag, Heart, Settings, ChevronRight,
  LogIn, LogOut, Wine, Star, Bell, Phone, Info, MessageCircle
} from "lucide-react";
import WineTabBar from "./WineTabBar";
import BottomNav from "@/components/BottomNav";

export default function WineProfile() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  // 仅 cx8618 是商家管理员
  const isOwner = user?.username === "cx8618";

  // 加载商家设置（用于联系客服信息）
  const { data: shareInfo } = trpc.merchant.getMerchantShareInfo.useQuery(
    { merchantCode: "cx8618" },
    { enabled: true }
  );

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/wine`;
    if (navigator.share) {
      navigator.share({ title: "红酒文化商会", text: "品味世界，汇聚同好", url: shareUrl });
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => alert("链接已复制！"));
    }
  };

  // 联系客服：优先使用商家设置中的微信/电话
  const handleContactService = () => {
    const wechat = (shareInfo as any)?.contactWechat;
    const phone = (shareInfo as any)?.contactPhone;
    if (wechat) {
      alert(`商家微信：${wechat}\n请添加微信联系客服`);
    } else if (phone) {
      window.location.href = `tel:${phone}`;
    } else {
      alert('请通过微信搜索「红酒文化商会」联系我们');
    }
  };

  // 关于我们：跳转到关于页面（暂时用弹窗展示）
  const handleAboutUs = () => {
    const about = (shareInfo as any)?.aboutUs;
    if (about) {
      alert(about);
    } else {
      alert("红酒文化商会\n\n我们是一群热爱葡萄酒文化的同好，汇聚了来自法国、意大利、智利等世界顶级产区的优质酒庄资源。商会认可的每一款酒，都经过严格品鉴与溯源认证。");
    }
  };

  // 菜单项定义
  const menuGroups = [
    {
      title: "我的订单",
      items: [
        { icon: <ShoppingBag className="w-4 h-4" />, label: "全部订单", badge: null, href: null },
        { icon: <Package className="w-4 h-4" />, label: "待收货", badge: null, href: null },
        { icon: <Heart className="w-4 h-4" />, label: "我的收藏", badge: null, href: null },
      ],
    },
    // 商家管理：仅 cx8618 可见（§9.2 固定配置项）
    ...(isOwner ? [{
      title: "商家管理",
      items: [
        { icon: <Wine className="w-4 h-4" />, label: "商品管理", badge: null, href: "/wine/admin" },
        { icon: <Package className="w-4 h-4" />, label: "订单管理", badge: "3", href: null },
        { icon: <Star className="w-4 h-4" />, label: "评价管理", badge: null, href: null },
        { icon: <Settings className="w-4 h-4" />, label: "商家设置", badge: null, href: "/wine/settings" },
      ],
    }] : []),
    {
      title: "设置",
      items: [
        { icon: <Bell className="w-4 h-4" />, label: "消息通知", badge: null, href: null },
        { icon: <Settings className="w-4 h-4" />, label: "账号设置", badge: null, href: null },
      ],
    },
    // 固定配置项（§9.2 所有商家必须实现）
    {
      title: "关于",
      items: [
        {
          icon: <MessageCircle className="w-4 h-4" />,
          label: "联系客服",
          badge: null,
          href: null,
          onPress: handleContactService,
        },
        {
          icon: <Info className="w-4 h-4" />,
          label: "关于我们",
          badge: null,
          href: null,
          onPress: handleAboutUs,
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[#0d0505] text-white pb-24">
      {/* 顶部标题栏 */}
      <div className="bg-[#1a0a0a] border-b border-[#8B1A1A]/30 px-4 py-4">
        <h1 className="text-white font-bold text-lg">我的</h1>
      </div>

      {/* Tab 导航 */}
      <WineTabBar />

      <div className="px-4 pt-5 space-y-4">
        {/* 用户信息卡片 */}
        {user ? (
          <div className="bg-gradient-to-r from-[#8B1A1A]/40 to-[#1a0a0a] border border-[#8B1A1A]/40 rounded-2xl p-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#8B1A1A]/30 border-2 border-[#C9A84C]/40 flex items-center justify-center overflow-hidden">
                {user.avatar ? (
                  <img src={user.avatar} alt="头像" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-[#C9A84C]" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-white font-bold text-lg">{user.name || user.username || "会员"}</p>
                <p className="text-[#8a7a6a] text-sm">红酒文化商会会员</p>
                <div className="flex items-center gap-1 mt-1">
                  <Star className="w-3 h-3 text-[#C9A84C] fill-[#C9A84C]" />
                  <span className="text-[#C9A84C] text-xs">{isOwner ? "商家管理员" : "商会会员"}</span>
                </div>
              </div>
            </div>

            {/* 分享按钮（必备入口） */}
            <button
              onClick={handleShare}
              className="w-full mt-4 flex items-center justify-center gap-2 bg-[#8B1A1A]/40 border border-[#8B1A1A]/50 rounded-xl py-2.5 text-[#C9A84C] text-sm hover:bg-[#8B1A1A]/60 transition-colors"
            >
              <Share2 className="w-4 h-4" />
              分享我的商会
            </button>
          </div>
        ) : (
          /* 未登录状态 */
          <div className="bg-[#1a0a0a] border border-[#8B1A1A]/30 rounded-2xl p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-[#8B1A1A]/20 flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-[#8a7a6a]" />
            </div>
            <p className="text-white font-medium mb-1">登录后享受更多权益</p>
            <p className="text-[#8a7a6a] text-sm mb-4">加入商会，品味世界顶级葡萄酒</p>
            <button
              onClick={() => window.location.href = getLoginUrl()}
              className="w-full bg-[#8B1A1A] hover:bg-[#A52020] text-white rounded-xl py-3 font-medium transition-colors flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              登录 / 注册
            </button>
            {/* 分享按钮（未登录也可分享） */}
            <button
              onClick={handleShare}
              className="w-full mt-2 border border-[#8B1A1A]/40 text-[#C9A84C] rounded-xl py-2.5 text-sm hover:bg-[#8B1A1A]/20 transition-colors flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4" />
              分享商会
            </button>
          </div>
        )}

        {/* 功能菜单 */}
        {menuGroups.map((group) => (
          <div key={group.title} className="bg-[#1a0a0a] border border-[#8B1A1A]/30 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[#8B1A1A]/20">
              <p className="text-[#8a7a6a] text-xs font-medium">{group.title}</p>
            </div>
            {group.items.map((item: any, i: number) => (
              <button
                key={i}
                onClick={() => {
                  if (item.href) {
                    setLocation(item.href);
                  } else if (item.onPress) {
                    item.onPress();
                  }
                }}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-[#8B1A1A]/10 transition-colors border-b border-[#8B1A1A]/10 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[#C9A84C]">{item.icon}</span>
                  <span className="text-white text-sm">{item.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {item.badge && (
                    <span className="bg-[#8B1A1A] text-white text-xs px-1.5 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-[#8a7a6a]" />
                </div>
              </button>
            ))}
          </div>
        ))}

        {/* 退出登录 */}
        {user && (
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 bg-[#1a0a0a] border border-[#8B1A1A]/30 rounded-xl py-3 text-[#8a7a6a] text-sm hover:text-white hover:border-[#8B1A1A]/60 transition-colors"
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
