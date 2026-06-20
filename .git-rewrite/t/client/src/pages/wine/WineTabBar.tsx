/**
 * 红酒文化商会 - 顶部 Tab 栏
 * 用于红酒模块内部页面切换：首页 / 资讯 / 品牌中心 / 我的
 */
import { Link, useLocation } from "wouter";
import { Home as HomeIcon, Newspaper, Wine, User } from "lucide-react";

const TABS = [
  { label: "首页", href: "/wine", icon: <HomeIcon className="w-4 h-4" /> },
  { label: "资讯", href: "/wine/news", icon: <Newspaper className="w-4 h-4" /> },
  { label: "品牌中心", href: "/wine/brands", icon: <Wine className="w-4 h-4" /> },
  { label: "我的", href: "/wine/profile", icon: <User className="w-4 h-4" /> },
];

export default function WineTabBar() {
  const [location] = useLocation();

  const isActive = (href: string) => {
    if (href === "/wine") return location === "/wine";
    return location.startsWith(href);
  };

  return (
    <div className="bg-[#1a0a0a]/95 border-b border-[#8B1A1A]/30 backdrop-blur-sm">
      <div className="flex max-w-lg mx-auto">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link key={tab.label} href={tab.href} className="flex-1">
              <button
                className={`w-full flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${
                  active
                    ? "text-[#C9A84C] border-b-2 border-[#C9A84C]"
                    : "text-[#8a7a6a] border-b-2 border-transparent hover:text-[#C9A84C]"
                }`}
              >
                {tab.icon}
                <span className={`text-xs font-medium ${active ? "text-[#C9A84C]" : "text-[#8a7a6a]"}`}>
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
