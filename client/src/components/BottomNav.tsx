import { useLocation } from "wouter";
import { Users, Newspaper, Bot, BookOpen, User } from "lucide-react";

export default function BottomNav() {
  const [location, setLocation] = useLocation();

  // 获取账本跳转路径：优先跳转到最后访问的账本，否则跳转到列表页
  const getLedgerPath = () => {
    const lastLedgerId = localStorage.getItem('lastVisitedLedgerId');
    return lastLedgerId ? `/ledger/${lastLedgerId}` : '/ledger';
  };

  const handleNavigation = (path: string, isLedger: boolean = false) => {
    console.log('[BottomNav] handleNavigation called:', { path, isLedger });
    if (isLedger) {
      const ledgerPath = getLedgerPath();
      console.log('[BottomNav] Navigating to ledger:', ledgerPath);
      setLocation(ledgerPath);
    } else {
      console.log('[BottomNav] Navigating to:', path);
      setLocation(path);
    }
  };

  const navItems = [
    {
      id: "contacts",
      label: "人脉",
      icon: Users,
      path: "/",
      isLedger: false,
    },
    {
      id: "moments",
      label: "动态",
      icon: Newspaper,
      path: "/moments",
      isLedger: false,
    },
    {
      id: "ai",
      label: "AI",
      icon: Bot,
      path: "/ai",
      isLedger: false,
    },
    {
      id: "ledger",
      label: "账本",
      icon: BookOpen,
      path: "/ledger",
      isLedger: true, // 标记为账本按钮
    },
    {
      id: "profile",
      label: "我的",
      icon: User,
      path: "/profile",
      isLedger: false,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-inset-bottom z-50">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const currentPath = item.isLedger ? getLedgerPath() : item.path;
          const isActive = location === currentPath || (item.isLedger && location.startsWith('/ledger'));

          return (
            <button
              key={item.id}
              onClick={() => handleNavigation(item.path, item.isLedger)}
              className="flex flex-col items-center justify-center flex-1 h-full px-2 space-y-1 transition-colors"
            >
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
            </button>
          );
        })}
      </div>
    </nav>
  );
}
