import { useState } from "react";
import { useLocation } from "wouter";
import { Users, Wallet, Plus } from "lucide-react";

interface BottomNavProps {
  /** 
   * 钱脉页面的加号弹窗回调
   * onJoinLedger: 加入他人账本
   * onCreateLedger: 创建新的账本
   */
  onJoinLedger?: () => void;
  onCreateLedger?: () => void;
}

export default function BottomNav({ onJoinLedger, onCreateLedger }: BottomNavProps) {
  const [location, setLocation] = useLocation();
  const [showLedgerMenu, setShowLedgerMenu] = useState(false);

  // 判断当前在哪个页面
  const isLedgerPage = location.startsWith('/ledger');
  const isHomePage = location === '/' || location === '';

  const handleNavigation = (path: string) => {
    setShowLedgerMenu(false);
    setLocation(path);
  };

  // 加号按钮点击逻辑
  const handlePlusClick = () => {
    if (isLedgerPage) {
      // 钱脉页面：弹出选项菜单
      setShowLedgerMenu(!showLedgerMenu);
    } else {
      // 人脉页面（首页）：直接跳转到添加人脉
      setShowLedgerMenu(false);
      window.location.href = 'https://www.jiangyuchen.cn/parent/contacts/add';
    }
  };

  // 判断激活状态
  const isContactsActive = !isLedgerPage;
  const isLedgerActive = isLedgerPage;

  return (
    <>
      {/* 钱脉加号弹出菜单 - 遮罩层 */}
      {showLedgerMenu && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowLedgerMenu(false)} 
        />
      )}

      {/* 钱脉加号弹出菜单 */}
      {showLedgerMenu && (
        <div className="fixed left-0 right-0 z-50 flex justify-center" style={{ bottom: '80px' }}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden" style={{ width: 'auto', minWidth: '260px', maxWidth: '320px' }}>
            {/* 创建新账本 - 放在上面 */}
            <button
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-[#FFF3F3] transition-colors border-b border-gray-100"
              onClick={() => {
                setShowLedgerMenu(false);
                if (onCreateLedger) {
                  onCreateLedger();
                } else {
                  setLocation('/ledger/create-type');
                }
              }}
            >
              <div className="w-9 h-9 rounded-full bg-[#FFEBEE] flex items-center justify-center flex-shrink-0">
                <Plus className="w-5 h-5 text-[#D32F2F]" />
              </div>
              <div className="text-left flex-1">
                <div className="text-sm font-semibold text-gray-900">创建新的账本</div>
                <div className="text-xs text-gray-500">创建属于你的共享账本</div>
              </div>
            </button>
            
            {/* 加入他人账本 - 放在下面 */}
            <button
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-[#FFF3F3] transition-colors"
              onClick={() => {
                setShowLedgerMenu(false);
                if (onJoinLedger) {
                  onJoinLedger();
                }
              }}
            >
              <div className="w-9 h-9 rounded-full bg-[#FFEBEE] flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-[#D32F2F]" />
              </div>
              <div className="text-left flex-1">
                <div className="text-sm font-semibold text-gray-900">加入他人账本</div>
                <div className="text-xs text-gray-500">通过密钥加入共享账本</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* 底部导航栏 */}
      <nav className="fixed bottom-0 left-0 right-0 safe-area-inset-bottom z-50">
        <div className="max-w-md mx-auto">
          <div className="bg-white border-t border-gray-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] px-6 py-3 flex justify-around items-center relative">
            {/* 人脉按钮 */}
            <button
              onClick={() => handleNavigation('/')}
              className="flex flex-col items-center space-y-1 min-w-[60px]"
            >
              <Users className={`w-6 h-6 transition-colors duration-200 ${
                isContactsActive ? 'text-[#D32F2F]' : 'text-gray-400'
              }`} />
              <span className={`text-xs transition-colors duration-200 ${
                isContactsActive ? 'text-[#D32F2F] font-bold' : 'text-gray-400 font-medium'
              }`}>
                人脉
              </span>
            </button>

            {/* 加号按钮 */}
            <button
              onClick={handlePlusClick}
              className="relative -mt-6"
            >
              <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg border-4 border-white transition-all duration-200 ${
                showLedgerMenu 
                  ? 'bg-gray-600 rotate-45' 
                  : 'bg-[#D32F2F] hover:bg-[#B71C1C]'
              }`}>
                <Plus className="w-7 h-7 text-white" />
              </div>
            </button>

            {/* 钱脉按钮 */}
            <button
              onClick={() => handleNavigation('/ledger')}
              className="flex flex-col items-center space-y-1 min-w-[60px]"
            >
              <Wallet className={`w-6 h-6 transition-colors duration-200 ${
                isLedgerActive ? 'text-[#D32F2F]' : 'text-gray-400'
              }`} />
              <span className={`text-xs transition-colors duration-200 ${
                isLedgerActive ? 'text-[#D32F2F] font-bold' : 'text-gray-400 font-medium'
              }`}>
                钱脉
              </span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
