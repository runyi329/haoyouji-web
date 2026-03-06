/**
 * 润仪算力研发中心 - 顶部 Tab 栏
 * 路由：/jiang/*
 * 主题色：深黑 #0A0A0F + 红色 #D32F2F
 */
import { Link, useLocation } from "wouter";
import { Home, Cpu, ShoppingBag, Info, User } from "lucide-react";

const TABS = [
  { label: "首页", href: "/jiang", icon: <Home className="w-4 h-4" /> },
  { label: "服务", href: "/jiang/services", icon: <Cpu className="w-4 h-4" /> },
  { label: "商城", href: "/jiang/shop", icon: <ShoppingBag className="w-4 h-4" /> },
  { label: "关于", href: "/jiang/about", icon: <Info className="w-4 h-4" /> },
  { label: "我的", href: "/jiang/profile", icon: <User className="w-4 h-4" /> },
];

export default function JiangTabBar() {
  const [location] = useLocation();
  const isActive = (href: string) => {
    if (href === "/jiang") return location === "/jiang";
    return location.startsWith(href);
  };

  return (
    <div className="bg-[#0d0d14]/95 border-b border-[#D32F2F]/20 backdrop-blur-sm">
      <div className="flex max-w-lg mx-auto">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link key={tab.label} href={tab.href} className="flex-1">
              <button
                className={`w-full flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${
                  active
                    ? "text-[#D32F2F] border-b-2 border-[#D32F2F]"
                    : "text-[#666680] border-b-2 border-transparent hover:text-[#D32F2F]"
                }`}
              >
                {tab.icon}
                <span className={`text-xs font-medium ${active ? "text-[#D32F2F]" : "text-[#666680]"}`}>
                  {tab.label}
                </span>
              </button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
