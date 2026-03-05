/**
 * 红酒文化商会 - 我的（个人中心）
 * 路径: /wine/profile
 * 
 * 架构规则：
 * - 必须包含三大入口：分享、注册/登录、个人中心
 * - 商品管理入口（商家本人可见）
 * - 订单管理
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import {
  User, Share2, Package, ShoppingBag, Heart, Settings, ChevronRight,
  LogIn, LogOut, Wine, Star, Bell
} from "lucide-react";
import WineTabBar from "./WineTabBar";
import BottomNav from "@/components/BottomNav";

export default function WineProfile() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/wine`;
    if (navigator.share) {
      navigator.share({ title: "红酒文化商会", text: "品味世界，汇聚同好", url: shareUrl });
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => alert("链接已复制！"));
    }
  };

  // 菜单项定义
  const menuGroups = [
    {
      title: "我的订单",
      items: [
        { icon: <ShoppingBag className="w-4 h-4" />, label: "全部订单", badge: null },
        { icon: <Package className="w-4 h-4" />, label: "待收货", badge: null },
        { icon: <Heart className="w-4 h-4" />, label: "我的收藏", badge: null },
      ],
    },
    {
      title: "商家管理",
      adminOnly: true,
      items: [
        { icon: <Wine className="w-4 h-4" />, label: "商品管理", badge: null, href: "/wine/admin" },
        { icon: <Package className="w-4 h-4" />, label: "订单管理", badge: "3", href: null },
        { icon: <Star className="w-4 h-4" />, label: "评价管理", badge: null, href: null },
      ],
    },
    {
      title: "设置",
      items: [
        { icon: <Bell className="w-4 h-4" />, label: "消息通知", badge: null },
        { icon: <Settings className="w-4 h-4" />, label: "账号设置", badge: null },
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
                  <span className="text-[#C9A84C] text-xs">商会会员</span>
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
              登录 / 注册（必备入口）
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
        {menuGroups.map((group) => {
          // 商家管理仅对管理员显示（示例：实际需要判断是否是cx8618）
          if (group.adminOnly && !user) return null;

          return (
            <div key={group.title} className="bg-[#1a0a0a] border border-[#8B1A1A]/30 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#8B1A1A]/20">
                <p className="text-[#8a7a6a] text-xs font-medium">{group.title}</p>
              </div>
              {group.items.map((item: any, i: number) => (
                <button
                  key={i}
                  onClick={() => {
                    if (item.href) setLocation(item.href);
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
          );
        })}

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
