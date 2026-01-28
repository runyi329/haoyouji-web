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

  // 判断当前激活的tab
  const activeId = location.startsWith('/ledger') ? 'ledger' : 'contacts';

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-blue-50 to-purple-50 border-t border-gray-200 safe-area-inset-bottom z-50">
      <div className="max-w-md mx-auto px-4 py-3">
        {/* Tab切换容器 */}
        <div className="relative bg-white rounded-full p-1 shadow-lg">
          {/* 滑动背景 */}
          <div 
            className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300 ease-in-out shadow-md ${
              activeId === 'ledger' ? 'left-[calc(50%+4px)]' : 'left-1'
            }`}
          />
          
          {/* Tab按钮 */}
          <div className="relative grid grid-cols-2 gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeId;

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigation(item.path)}
                  className="relative flex items-center justify-center gap-2 h-12 transition-all duration-300"
                >
                  <Icon
                    className={`w-5 h-5 transition-colors duration-300 ${
                      isActive ? "text-white" : "text-gray-600"
                    }`}
                  />
                  <span
                    className={`text-sm font-semibold transition-colors duration-300 ${
                      isActive ? "text-white" : "text-gray-600"
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
