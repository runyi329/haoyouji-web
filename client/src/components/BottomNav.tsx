import { useState } from "react";
import { useLocation } from "wouter";
import { Users, Wallet, Plus, Wine, Cpu } from "lucide-react";
import { trpc } from "@/lib/trpc";

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
  const { data: user } = trpc.auth.me.useQuery();
  const isLiulifan = user?.username === 'liulifan';
  const isCx8618 = user?.username === 'cx8618';
  const isJiang = user?.username === 'jiang';
  const isYJH = user?.username === 'YJH';
  const isStevenHuang = user?.username === 'STEVEN_HUANG';
  const isHanming = user?.id === 4957321;
  const isYunting = user?.id === 540801;

  // 判断当前在哪个页面
  const isLedgerPage = location.startsWith('/ledger');
  const isBeautyPage = location.startsWith('/beauty');
  const isWinePage = location.startsWith('/wine');
  const isJiangPage = location.startsWith('/jiang');
  const isHomePage = location === '/' || location === '';

  const handleNavigation = (path: string) => {
    setShowLedgerMenu(false);
    setLocation(path);
  };

  // 加号/奢贝/红酒/润仪按鈕点击逻辑
  const handlePlusClick = () => {
    if (isLiulifan) {
      // liulifan：跳转到奢贝首页
      setShowLedgerMenu(false);
      setLocation('/beauty');
    } else if (isCx8618) {
      // cx8618：跳转到红酒商会首页
      setShowLedgerMenu(false);
      setLocation('/wine');
    } else if (isJiang) {
      // jiang：跳转到润仪算力研发中心
      setShowLedgerMenu(false);
      setLocation('/jiang');
    } else if (isStevenHuang) {
      // STEVEN_HUANG：跳转到IDEALIGHT红颜派商家主页
      setShowLedgerMenu(false);
      setLocation('/idealight');
    } else if (isHanming) {
      // 汉明：跳转到汉明专属产品页面
      setShowLedgerMenu(false);
      setLocation('/hanming');
    } else if (isYunting) {
      // yunting：跳转到算力中心商城
      setShowLedgerMenu(false);
      setLocation('/jiang/shop');
    } else if (isYJH) {
      // YJH：跳转到数金研投网站
      setShowLedgerMenu(false);
      window.open('https://runyi.manus.space', '_blank');
    } else if (isLedgerPage) {
      // 钱脉页面：弹出选项菜单
      setShowLedgerMenu(!showLedgerMenu);
    } else {
      // 人脉页面（首页）：直接跳转到添加人脉
      setShowLedgerMenu(false);
      setLocation('/parent/contacts/add');
    }
  };

  // 判断激活状态
  const isContactsActive = !isLedgerPage && !isBeautyPage && !isWinePage && !isJiangPage;
  const isLedgerActive = isLedgerPage;

  // 中间按鈕样式
  const centerBtnBg = isWinePage
    ? 'bg-[#8B1A1A] border-4 border-[#C9A84C]/40 ring-2 ring-[#C9A84C]/30'
    : isBeautyPage
    ? 'bg-[#D32F2F] border-4 border-rose-200 ring-2 ring-rose-300'
    : isJiangPage
    ? 'bg-[#D32F2F] border-4 border-[#D32F2F]/30 ring-2 ring-[#D32F2F]/20'
    : showLedgerMenu
    ? 'bg-gray-600 rotate-45 border-4 border-white'
    : 'bg-[#D32F2F] hover:bg-[#B71C1C] border-4 border-white';

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
      <nav className={`fixed bottom-0 left-0 right-0 z-50`}>
        <div className="max-w-md mx-auto">
          <div className={`px-6 py-3 flex justify-around items-center relative ${
            isWinePage
              ? 'bg-[#0d0505] border-t border-[#8B1A1A]/40 shadow-[0_-4px_20px_rgba(139,26,26,0.3)]'
              : 'bg-white border-t border-gray-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]'
          }`}>
            {/* 人脉按钮 */}
            <button
              onClick={() => handleNavigation('/')}
              className="flex flex-col items-center space-y-1 min-w-[60px]"
            >
              <Users className={`w-6 h-6 transition-colors duration-200 ${
                isContactsActive
                  ? 'text-[#D32F2F]'
                  : isWinePage
                  ? 'text-[#8a7a6a]'
                  : 'text-gray-400'
              }`} />
              <span className={`text-xs transition-colors duration-200 ${
                isContactsActive
                  ? 'text-[#D32F2F] font-bold'
                  : isWinePage
                  ? 'text-[#8a7a6a] font-medium'
                  : 'text-gray-400 font-medium'
              }`}>
                人脉
              </span>
            </button>

            {/* 加号/奢贝/红酒中间按钮 */}
            <button
              onClick={handlePlusClick}
              className="relative -mt-6"
            >
              <div className={`w-14 h-14 rounded-full flex flex-col items-center justify-center shadow-lg transition-all duration-200 overflow-hidden ${centerBtnBg}`}>
                {isLiulifan ? (
                  <span className="text-white text-xs font-bold leading-tight text-center">奢贝</span>
                ) : isCx8618 ? (
                  <Wine className="w-7 h-7 text-[#C9A84C]" />
                ) : isJiang ? (
                  <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/ba9a86df64fd3309eeb754e6b875940a_c32624a6.jpg" className="w-10 h-10 object-cover rounded-full" alt="R1" />
                ) : isStevenHuang ? (
                  <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/idealight_icon_white_ca457943.png" className="w-full h-full object-cover" alt="IDEALIGHT" />
                ) : isHanming ? (
                  <span className="text-white text-xs font-bold leading-tight text-center">汉明</span>
                ) : isYunting ? (
                  <Cpu className="w-7 h-7 text-white" />
                ) : (
                  <Plus className="w-7 h-7 text-white" />
                )}
              </div>
            </button>

            {/* 钱脉按钮 */}
            <button
              onClick={() => handleNavigation('/ledger')}
              className="flex flex-col items-center space-y-1 min-w-[60px]"
            >
              <Wallet className={`w-6 h-6 transition-colors duration-200 ${
                isLedgerActive
                  ? 'text-[#D32F2F]'
                  : isWinePage
                  ? 'text-[#8a7a6a]'
                  : 'text-gray-400'
              }`} />
              <span className={`text-xs transition-colors duration-200 ${
                isLedgerActive
                  ? 'text-[#D32F2F] font-bold'
                  : isWinePage
                  ? 'text-[#8a7a6a] font-medium'
                  : 'text-gray-400 font-medium'
              }`}>
                钱脉
              </span>
            </button>
          </div>
          {/* iPhone Home条安全区 */}
          <div style={{ height: 'env(safe-area-inset-bottom, 0px)', background: 'inherit' }} className={isWinePage ? 'bg-[#0d0505]' : 'bg-white'} />
        </div>
      </nav>
    </>
  );
}
