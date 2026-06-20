/**
 * 奢贝美容院 - 顶部 Tab 栏
 * 用于奢贝模块内部页面切换：首页 / 预约 / 商城 / 我的
 */
import { Link, useLocation } from "wouter";
import { Home as HomeIcon, Calendar, Gift, User, Images } from "lucide-react";

const TABS = [
  { label: "首页", href: "/beauty", icon: <HomeIcon className="w-4 h-4" /> },
  { label: "预约", href: "/beauty/booking", icon: <Calendar className="w-4 h-4" /> },
  { label: "素材", href: "/beauty/material", icon: <Images className="w-4 h-4" /> },
  { label: "商城", href: "/beauty/shop", icon: <Gift className="w-4 h-4" /> },
  { label: "我的", href: "/beauty/appointments", icon: <User className="w-4 h-4" /> },
];

export default function BeautyTabBar() {
  const [location] = useLocation();

  const isActive = (href: string) => {
    if (href === "/beauty") return location === "/beauty";
    return location.startsWith(href);
  };

  return (
    <div className="bg-white border-b border-gray-100">
      <div className="flex max-w-lg mx-auto">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <Link key={tab.label} href={tab.href} className="flex-1">
              <button
                className={`w-full flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors ${
                  active
                    ? "text-rose-500 border-b-2 border-rose-500"
                    : "text-gray-400 border-b-2 border-transparent hover:text-rose-400"
                }`}
              >
                {tab.icon}
                <span className={`text-xs font-medium ${active ? "text-rose-500" : "text-gray-400"}`}>
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
