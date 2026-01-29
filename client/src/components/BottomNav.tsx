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
    <nav className="fixed bottom-0 left-0 right-0 safe-area-inset-bottom z-50">
      <div className="max-w-md mx-auto px-4 pb-2">
        {/* 切换开关容器 */}
        <div 
          className="relative bg-white rounded-xl shadow-lg p-1"
        >
          {/* 滑动指示器 */}
          <div 
            className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg transition-all duration-300 ease-in-out shadow-md ${
              activeId === 'ledger' ? 'left-[calc(50%+4px)]' : 'left-1'
            }`}
            style={{
              backgroundColor: 'var(--color-primary)'
            }}
          />
          
          {/* 按钮组 */}
          <div className="relative grid grid-cols-2 gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeId;

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavigation(item.path)}
                  className="relative flex items-center justify-center gap-2 h-11 transition-all duration-300"
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
