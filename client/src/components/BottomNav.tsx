import { useLocation } from "wouter";
import { Users, Wallet } from "lucide-react";

export default function BottomNav() {
  const [location, setLocation] = useLocation();

  const handleNavigation = (path: string) => {
    console.log('[BottomNav] Navigating to:', path);
    setLocation(path);
  };

  const navItems = [
    {
      id: "contacts",
      label: "人脉",
      icon: Users,
      path: "/contacts",
    },
    {
      id: "ledger",
      label: "钱脉",
      icon: Wallet,
      path: "/ledger",
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-inset-bottom z-50">
      <div className="grid grid-cols-2 gap-4 h-16 px-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.path || (item.id === 'ledger' && location.startsWith('/ledger'));

          return (
            <button
              key={item.id}
              onClick={() => handleNavigation(item.path)}
              className="flex flex-col items-center justify-center h-full space-y-1 transition-colors"
            >
              <Icon
                className={`w-7 h-7 ${
                  isActive ? "text-blue-500" : "text-gray-500"
                }`}
              />
              <span
                className={`text-sm font-medium ${
                  isActive ? "text-blue-500" : "text-gray-500"
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
