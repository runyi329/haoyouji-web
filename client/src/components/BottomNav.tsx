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

// versionKey → 版本图标。未知版本回退到通用切换图标。
const VERSION_ICONS: Record<string, string> = {
  maidong: "/maidong-switch-icon.webp",
  yaban:
    "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/icons/yaban/yaban_logo_bottomnav.webp",
};

// 奢贝设备网站入口图标（liulifan 专属，非正式版本体系）
const SHEBEI_ICON = "/shebei-icon.webp";

export default function BottomNav({ onJoinLedger, onCreateLedger }: BottomNavProps) {
  const [location, setLocation] = useLocation();
  const [showLedgerMenu, setShowLedgerMenu] = useState(false);
  const [showSwitchMenu, setShowSwitchMenu] = useState(false);
  const { data: user } = trpc.auth.me.useQuery();
  const { data: versions } = trpc.version.listVersions.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const isCx8618 = user?.username === 'cx8618';
  const isLiulifan = user?.username === 'liulifan';
  const isJiang = user?.username === 'jiang';
  const isYJH = user?.username === 'YJH';
  const isStevenHuang = user?.username === 'STEVEN_HUANG';
  const isHanming = user?.id === 4957321;
  const isYunting = user?.id === 540801;
  const isYaban = user?.id === 4957372;

  // 判断当前在哪个页面
  const isLedgerPage = location.startsWith('/ledger');
  const isBeautyPage = location.startsWith('/beauty');
  const isWinePage = location.startsWith('/wine');
  const isJiangPage = location.startsWith('/jiang');
  const isHomePage = location === '/' || location === '';

  // ── 版本/入口切换：构建该用户「可进入的版本/入口」列表 ──────────────────
  // 数据来源：
  //  1) 正式版本体系：auth.me.version.switchEnabled + switchableVersionKeys（脉动/牙伴等）
  //  2) 奢贝设备网站：liulifan 专属入口（非正式版本体系，硬编码）
  const version = (user as any)?.version as
    | {
        versionKey?: string;
        switchEnabled?: boolean;
        switchableVersionKeys?: string[];
      }
    | undefined;

  type SwitchItem = {
    key: string;          // 唯一标识（versionKey 或 'beauty'）
    name: string;         // 显示名称
    icon?: string;        // 图标 URL（无则用通用箭头）
    path: string;         // 跳转地址
    viewingKey?: string;  // 写入 _viewing_version 的值（仅正式版本需要）
    active: boolean;      // 是否当前所在
  };

  const switchItems: SwitchItem[] = [];

  // 「当前所在版本」：以实际位置/手动选择为准，而非归属版本
  // 优先级：sessionStorage 手动选择 _viewing_version > 按当前路径推断（/yaban/* 为牙伴，其余为脉动）
  let activeVersionKey = "";
  try {
    activeVersionKey = sessionStorage.getItem("_viewing_version") || "";
  } catch {}
  if (!activeVersionKey) {
    activeVersionKey = location.startsWith("/yaban") ? "yaban" : "maidong";
  }

  // 1) 正式版本切换项
  if (version?.switchEnabled) {
    // 可去的正式版本：可切换范围 + 归属版本（归属版本始终可回去，即使未列入 scope）+ 当前所在版本
    const allowedKeys = new Set<string>(version.switchableVersionKeys || []);
    if (version.versionKey) allowedKeys.add(version.versionKey);
    if (activeVersionKey) allowedKeys.add(activeVersionKey);
    (versions || [])
      .filter((v: any) => allowedKeys.has(v.versionKey))
      .forEach((v: any) => {
        switchItems.push({
          key: v.versionKey,
          name: v.name,
          icon: VERSION_ICONS[v.versionKey],
          path: v.landingPath || "/",
          viewingKey: v.versionKey,
          active: v.versionKey === activeVersionKey,
        });
      });
  }

  // 2) 奢贝设备网站入口（liulifan 专属）
  if (isLiulifan) {
    switchItems.push({
      key: "beauty",
      name: "奢贝设备",
      icon: SHEBEI_ICON,
      path: "/beauty",
      active: isBeautyPage,
    });
  }

  // 弹框里只展示「除当前所在版本之外」的可去目的地
  const menuItems = switchItems.filter((it) => !it.active);
  // 是否把中间按钮渲染为「切换键」：有 2 个及以上可进入项才有切换意义
  const showSwitcher = switchItems.length >= 2;
  // 中间按钮显示的图标：优先显示「当前所在版本/入口」的图标
  const currentSwitchItem =
    switchItems.find((it) => it.active) ||
    switchItems.find((it) => it.viewingKey === activeVersionKey) ||
    switchItems[0];

  const handleNavigation = (path: string) => {
    setShowLedgerMenu(false);
    setShowSwitchMenu(false);
    // 未登录用户点击人脉/錢脉时提示登录
    if (!user && (path === '/' || path.startsWith('/ledger') || path.startsWith('/parent'))) {
      import('sonner').then(({ toast }) => {
        toast('请先登录后使用此功能', {
          description: '登录后可查看个人人脉和账本数据',
          action: { label: '去登录', onClick: () => setLocation('/login') },
          duration: 3000,
        });
      });
      return;
    }
    setLocation(path);
  };

  // 切换项点击：跳转到目标版本/入口
  const handleSwitchItemClick = (item: SwitchItem) => {
    setShowSwitchMenu(false);
    if (item.active) return;
    // 正式版本：记录用户手动选择的「查看版本」，让 HomeEntry / VersionGuard 尊重此选择
    if (item.viewingKey) {
      try {
        sessionStorage.setItem("_viewing_version", item.viewingKey);
      } catch {}
    }
    setLocation(item.path);
  };

  // 加号/奢贝/红酒/润仪按鈕点击逻辑
  const handlePlusClick = () => {
    // 有切换需求的用户：中间按钮作为「切换键」，弹出选择框
    if (showSwitcher) {
      setShowLedgerMenu(false);
      setShowSwitchMenu((o) => !o);
      return;
    }
    if (isCx8618) {
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
    } else if (isYaban) {
      // 牙伴用户：先进入3D开始页，再由开始页进入牙伴首页
      setShowLedgerMenu(false);
      setLocation('/yaban/intro');
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
    : isYaban
    ? 'bg-[#E3F2FD] border-4 border-[#90CAF9] ring-2 ring-[#90CAF9]/30'
    : showSwitcher
    ? 'bg-white border-4 border-white'
    : showLedgerMenu
    ? 'bg-gray-600 rotate-45 border-4 border-white'
    : 'bg-[#D32F2F] hover:bg-[#B71C1C] border-4 border-white';

  return (
    <>
      {/* 版本/入口切换弹出菜单 - 遮罩层 */}
      {showSwitchMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowSwitchMenu(false)}
        />
      )}

      {/* 版本/入口切换弹出菜单 */}
      {showSwitchMenu && (
        <div className="fixed left-0 right-0 z-50 flex justify-center" style={{ bottom: '80px' }}>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden" style={{ width: 'auto', minWidth: '240px', maxWidth: '320px' }}>
            <div className="px-5 py-2.5 text-xs text-gray-400 border-b border-gray-50">
              切换版本 / 入口
            </div>
            {menuItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`w-full flex items-center gap-3 px-5 py-3.5 hover:bg-[#FFF3F3] transition-colors border-b border-gray-50 last:border-b-0 text-gray-800`}
                onClick={() => handleSwitchItemClick(item)}
              >
                <span className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 bg-gray-50">
                  {item.icon ? (
                    <img src={item.icon} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </svg>
                  )}
                </span>
                <span className="text-left flex-1 text-sm">{item.name}</span>
                {item.active && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

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

            {/* 加号/切换中间按钮 */}
            <button
              onClick={handlePlusClick}
              className="relative -mt-6"
            >
              <div className={`w-14 h-14 rounded-full flex flex-col items-center justify-center shadow-lg transition-all duration-200 overflow-hidden ${centerBtnBg}`}>
                {showSwitcher ? (
                  // 切换键：显示当前所在版本/入口的图标
                  currentSwitchItem?.icon ? (
                    <img src={currentSwitchItem.icon} className="w-full h-full object-cover" alt={currentSwitchItem.name} />
                  ) : (
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#D32F2F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                    </svg>
                  )
                ) : isCx8618 ? (
                  <Wine className="w-7 h-7 text-[#C9A84C]" />
                ) : isJiang ? (
                  <img src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/avatars/bottomnav-r1.jpg" className="w-10 h-10 object-cover rounded-full" alt="R1" />
                ) : isStevenHuang ? (
                  <img src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/icons/idealight-icon-white.png" className="w-full h-full object-cover" alt="IDEALIGHT" />
                ) : isHanming ? (
                  <span className="text-white text-xs font-bold leading-tight text-center">汉明</span>
                ) : isYaban ? (
                  <img src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/icons/yaban/yaban_logo_bottomnav.webp" className="w-full h-full object-cover" alt="牙伴" />
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
