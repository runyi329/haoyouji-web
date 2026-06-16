/**
 * 牙伴齿科管理 - 底部 Tab 栏
 * 路由：/yaban/*
 * 主题色：蓝色系 #1E88D6（与商城风格统一）
 */
import { Link, useLocation } from "wouter";
import { Briefcase, User } from "lucide-react";

// 底部仅保留“工作台”与“我的”；商城入口已移至“更多 → 牙科商店”
const TABS = [
  { label: "工作台", href: "/yaban", icon: <Briefcase className="w-5 h-5" /> },
  { label: "我的", href: "/yaban/profile", icon: <User className="w-5 h-5" /> },
];

export default function YabanTabBar() {
  const [location] = useLocation();

  const isActive = (href: string) => {
    if (href === "/yaban") return location === "/yaban";
    return location.startsWith(href);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="flex max-w-lg mx-auto">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link key={tab.label} href={tab.href} className="flex-1">
              <button
                className={`w-full flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                  active ? "text-[#1E88D6]" : "text-gray-400"
                }`}
              >
                {tab.icon}
                <span className={`text-[10px] font-medium ${active ? "text-[#1E88D6]" : "text-gray-400"}`}>
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
