import { useLocation, Link } from "wouter";
import { Users, Newspaper, Bot, BookOpen, User } from "lucide-react";

export default function BottomNav() {
  const [location] = useLocation();

  const navItems = [
    {
      id: "contacts",
      label: "人脉",
      icon: Users,
      path: "/",
    },
    {
      id: "moments",
      label: "动态",
      icon: Newspaper,
      path: "/moments",
    },
    {
      id: "ai",
      label: "AI",
      icon: Bot,
      path: "/ai",
    },
    {
      id: "ledger",
      label: "账本",
      icon: BookOpen,
      path: "/ledger",
    },
    {
      id: "profile",
      label: "我的",
      icon: User,
      path: "/profile",
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-inset-bottom z-50">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.path;

          return (
            <Link key={item.id} href={item.path}>
              <a className="flex flex-col items-center justify-center flex-1 h-full px-2 space-y-1 transition-colors">
                <Icon
                  className={`w-6 h-6 ${
                    isActive ? "text-blue-500" : "text-gray-500"
                  }`}
                />
                <span
                  className={`text-xs ${
                    isActive ? "text-blue-500 font-medium" : "text-gray-500"
                  }`}
                >
                  {item.label}
                </span>
              </a>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
