import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { 
  Users, 
  MapPin, 
  Handshake, 
  RefreshCw, 
  Plus,
  Wallet,
  Coins,
  Loader2,
  User,
  LogOut,
  UserCircle,
  Bell
} from "lucide-react";
import Autoplay from "embla-carousel-autoplay";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import "@/styles/level-text.css";
import BottomNav from "@/components/BottomNav";

function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + "万";
  }
  return num.toLocaleString("zh-CN");
}

function formatCurrency(num: number): string {
  if (num >= 10000) {
    return "¥" + (num / 10000).toFixed(1) + "万";
  }
  return "¥" + num.toLocaleString("zh-CN");
}

// 根据等级返回显示文字
function getLevelText(level?: string): string {
  if (!level) return "我的";
  
  switch (level) {
    case 'standard_user':
      return "标准用户";
    case 'advanced_user':
      return "高级用户";
    case 'super_user':
      return "超级用户";
    case 'standard':
      return "标准节点";
    case 'advanced':
      return "高级节点";
    case 'super':
      return "超级节点";
    default:
      return "我的";
  }
}

// 根据等级返回样式类名
function getLevelClassName(level?: string): string {
  if (!level) return "text-[#757575]";
  
  switch (level) {
    case 'standard_user':
    case 'standard':
      return "level-text-standard";
    case 'advanced_user':
    case 'advanced':
      return "level-text-advanced";
    case 'super_user':
    case 'super':
      return "level-text-super";
    default:
      return "text-[#757575]";
  }
}


export default function Home() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isLiulifan = user?.username === 'liulifan';
  


  // 获取基础统计数据
  const { data: stats, isLoading, refetch, isFetching } = trpc.contacts.stats.useQuery(undefined, {
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // 获取累计联络次数
  const { data: totalInteractionCount } = trpc.contacts.totalInteractionCount.useQuery();
  
  // 获取标签总数
  const { data: totalTagCount } = trpc.contacts.totalTagCount.useQuery();
  
  // 获取累计使用天数
  const { data: totalUsageDays } = trpc.contacts.getTotalUsageDays.useQuery();
  
  // 获取邀请统计
  const { data: inviteInfo } = trpc.invite.getMyInviteInfo.useQuery();
  
  // 获取未读共享通知数量
  const { data: unreadSharingData } = trpc.sharing.getUnreadCount.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30000,
  });
  const hasUnreadSharing = (unreadSharingData?.addedCount || 0) > 0 || (unreadSharingData?.removedCount || 0) > 0;
  
  // 获取晋升数据（用于显礼等级）
  const { data: promotionStats } = trpc.equity.getPromotionStats.useQuery();

  // 仅liulifan用户：获取需要关注的人数
  const { data: overviewStats } = trpc.contacts.overviewStats.useQuery(undefined, {
    enabled: isLiulifan,
    staleTime: 30000,
  });

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  
  const needsAttentionCount = overviewStats?.needsAttentionCount ?? 0;

  // 解决Safari PWA模式中点×/右滑返回时显示旧缓存数据的问题
  // 策略：记录当前用户ID，页面变为可见时检查用户是否变化，如果变化则强制导航到带时间戳的新URL
  const utils = trpc.useUtils();
  useEffect(() => {
    let hiddenTime = 0;
    
    // 记录当前页面加载时的用户token
    const currentToken = localStorage.getItem('auth-token') || '';
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenTime = Date.now();
      } else if (document.visibilityState === 'visible') {
        // 检查token是否变化（用户切换了）
        const newToken = localStorage.getItem('auth-token') || '';
        const tokenChanged = newToken !== currentToken;
        const wasHiddenLong = hiddenTime > 0 && (Date.now() - hiddenTime) > 2000;
        
        if (tokenChanged || wasHiddenLong) {
          // 强制同步Cookie
          if (newToken) {
            document.cookie = `app_session_id=${newToken}; path=/; max-age=${365 * 24 * 60 * 60}`;
          }
          // 用带时间戳的URL强制导航，彻底绕过Safari的所有缓存
          const baseUrl = window.location.pathname;
          window.location.replace(baseUrl + '?_t=' + Date.now());
          return;
        }
        hiddenTime = 0;
      }
    };
    
    // pageshow: 处理bfcache恢复场景
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        const newToken = localStorage.getItem('auth-token') || '';
        if (newToken) {
          document.cookie = `app_session_id=${newToken}; path=/; max-age=${365 * 24 * 60 * 60}`;
        }
        window.location.replace(window.location.pathname + '?_t=' + Date.now());
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  // 禁用右滑返回手势，避免用户滑动返回时看到旧缓存页面
  useEffect(() => {
    let startX = 0;
    const handleTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
    };
    const handleTouchMove = (e: TouchEvent) => {
      const deltaX = e.touches[0].clientX - startX;
      // 如果从屏幕左侧边缘开始向右滑动，阻止默认行为
      if (startX < 30 && deltaX > 10) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  // 跳动动画：页面加载后如果有需要关注的人，启动跳动动画
  useEffect(() => {
    if (isLiulifan && needsAttentionCount > 0) {
      const timer = setTimeout(() => {
        setIsAnimating(true);
        // 跳动动画持续5秒后停止（但角标始终显示）
        setTimeout(() => setIsAnimating(false), 5000);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isLiulifan, needsAttentionCount]);
  const banners = [
    {
      id: 1,
      image: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/carousel/friend-share.webp",
      title: "好友共享"
    },
    {
      id: 2,
      image: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/carousel/decentral.webp",
      title: "去中心化人脉管理"
    },
    {
      id: 3,
      image: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/carousel/ai.webp",
      title: "AI社交"
    }
  ];

  // 所有导航都使用SPA路由路径（不使用绝对URL），避免Safari PWA创建新视图层
  const features = [
    { name: "地域", icon: MapPin, color: "bg-[#D32F2F]-light text-[#D32F2F]", path: "/parent/contacts/map" },
    { name: "共享", icon: Handshake, color: "bg-[#D32F2F]-light text-[#D32F2F]", path: "/parent/contacts/sharing" },
    { name: "资产", icon: Coins, color: "bg-[#D32F2F]-light text-[#D32F2F]", path: "/parent/asset-report" },
  ];

  const metricsLeft = [
    { name: "累计联络", value: totalInteractionCount ?? 0, unit: "次", path: "/parent/contacts/interaction-stats" },
    { name: "累计使用", value: totalUsageDays ?? 0, unit: "天", path: "/parent/contacts" },
    { name: "公司总数", value: stats?.companyCount ?? 0, unit: "家", path: "/parent/contacts/list?view=company" },
    { name: "今日活跃", value: stats?.todayActive ?? 0, unit: "人", path: "/parent/contacts/list?filter=todayActive" },
  ];

  const metricsRight = [
    { name: "本周新增", value: stats?.newThisWeek ?? 0, unit: "人", path: "/parent/contacts/list?filter=thisWeek" },
    { name: "共享总数", value: stats?.sharingToMeCount ?? 0, unit: "人", path: "/parent/contacts/list?filter=shared" },
    { name: "我的积分", value: user?.points ?? 0, unit: "分", path: "/parent/points" },
    { name: "邀请好友", value: inviteInfo?.inviteCount ?? 0, unit: "人", path: "/parent/profile/invite" },
  ];

  const handleLogout = async () => {
    // 清除三层存储（localStorage + Cookie + IndexedDB）
    const { clearToken } = await import('@/lib/tokenStorage');
    await clearToken();
    navigate("/login");
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[#FAF3ED] pb-16 max-w-md mx-auto relative shadow-2xl">
      {/* 跳动动画的CSS */}
      <style>{`
        @keyframes bellShake {
          0% { transform: rotate(0deg); }
          10% { transform: rotate(14deg); }
          20% { transform: rotate(-12deg); }
          30% { transform: rotate(10deg); }
          40% { transform: rotate(-8deg); }
          50% { transform: rotate(6deg); }
          60% { transform: rotate(-4deg); }
          70% { transform: rotate(2deg); }
          80% { transform: rotate(-1deg); }
          90% { transform: rotate(1deg); }
          100% { transform: rotate(0deg); }
        }
        @keyframes badgePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
        .bell-shake {
          animation: bellShake 0.8s ease-in-out infinite;
        }
        .badge-pulse {
          animation: badgePulse 1s ease-in-out infinite;
        }
      `}</style>

      {/* Header Banner Carousel */}
      <div className="relative">
        <Carousel 
          className="w-full"
          opts={{
            loop: true,
            align: "start",
          }}
          plugins={[
            Autoplay({
              delay: 5000,
              stopOnInteraction: false,
            }),
          ]}
        >
          <CarouselContent>
            {banners.map((banner) => (
              <CarouselItem key={banner.id}>
                <div className="relative w-full aspect-[16/9] overflow-hidden">
                  <img
                    src={banner.image}
                    alt={banner.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>

      {/* Stats Cards - 使用SPA导航 */}
      <div className="px-4 mt-2 grid grid-cols-2 gap-2">
        <div className="block cursor-pointer" onClick={() => navigate("/parent/contacts/list")}>
        <Card className="bg-gradient-to-br from-[#A80000] to-[#d44] text-white p-3 rounded-2xl shadow-lg border-none flex flex-col items-center justify-center space-y-0.5 cursor-pointer hover:shadow-xl transition-shadow">
          <div className="flex items-center space-x-2 opacity-90">
            <Users className="w-5 h-5" />
            <span className="text-sm font-medium">人脉总数</span>
          </div>
          <div className="flex items-baseline space-x-1">
            {isLoading ? (
              <Loader2 className="w-8 h-8 animate-spin opacity-60" />
            ) : (
              <>
                <span className="text-2xl font-bold">{stats ? formatNumber(stats.totalContacts) : "—"}</span>
                <span className="text-sm opacity-80">人</span>
              </>
            )}
          </div>
        </Card>
        </div>
        
        <div className="block cursor-pointer" onClick={() => navigate("/parent/contacts/tag-stats")}>
          <Card className="bg-white text-[#222222] p-3 rounded-2xl shadow-lg border-none flex flex-col items-center justify-center space-y-0.5 cursor-pointer hover:shadow-xl transition-shadow">
          <div className="flex items-center space-x-2 text-gray-500">
            <Coins className="w-5 h-5" />
            <span className="text-sm font-medium">标签总数</span>
          </div>
          <div className="flex items-baseline space-x-1">
            {isLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            ) : (
              <>
                <span className="text-2xl font-bold text-[#D32F2F]">{totalTagCount ? formatNumber(totalTagCount) : "—"}</span>
                <span className="text-sm text-gray-400">个</span>
              </>
            )}
          </div>
        </Card>
        </div>
      </div>

      {/* Feature Icons */}
      <div className="px-4 mt-2">
        <div className="bg-white rounded-2xl p-2 shadow-sm grid grid-cols-5 gap-1">
          {/* Avatar Button with Dropdown Menu */}
          <DropdownMenu open={profileMenuOpen} onOpenChange={setProfileMenuOpen}>
            <DropdownMenuTrigger asChild>
              <div className="flex flex-col items-center space-y-2 cursor-pointer">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#A80000] to-[#d44] flex items-center justify-center shadow-sm overflow-hidden border-2 border-red-100">
                  {user?.avatar ? (
                    <img src={user.avatar} alt="用户头像" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-5 h-5 text-white" />
                  )}
                </div>
                <span className={`text-xs font-medium ${getLevelClassName(promotionStats?.currentLevel)}`}>
                  {getLevelText(promotionStats?.currentLevel)}
                </span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem 
                onClick={() => { setProfileMenuOpen(false); navigate("/parent/profile"); }}
                className="flex items-center cursor-pointer"
              >
                <UserCircle className="w-4 h-4 mr-2" />
                <span>个人中心</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="flex items-center cursor-pointer text-[#D32F2F]">
                <LogOut className="w-4 h-4 mr-2" />
                <span>退出登录</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {features.map((feature) => {
            const Icon = feature.icon;
            const isSharing = feature.name === '共享';
            const showBadge = isSharing && hasUnreadSharing;
            return (
              <div
                key={feature.name}
                onClick={() => navigate(feature.path)}
                className="flex flex-col items-center space-y-2 cursor-pointer relative"
              >
                <div className={`w-10 h-10 rounded-full ${feature.color} flex items-center justify-center shadow-sm`}>
                  <Icon className="w-5 h-5" />
                </div>
                {showBadge && (
                  <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-[#D32F2F] rounded-full flex items-center justify-center border-2 border-white shadow-sm animate-pulse">
                    <Bell className="w-2.5 h-2.5 text-white" />
                  </span>
                )}
                <span className="text-xs font-medium text-[#757575]">{feature.name}</span>
              </div>
            );
          })}

          {/* 第5个按钮：所有用户统一显示刷新按钮 */}
          <div
            onClick={handleRefresh}
            className="flex flex-col items-center space-y-2 cursor-pointer"
          >
            <div className={`w-10 h-10 rounded-full bg-[#D32F2F]-light text-[#D32F2F] flex items-center justify-center shadow-sm ${isFetching ? 'animate-spin' : ''}`}>
              <RefreshCw className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-[#757575]">刷新</span>
          </div>
        </div>
      </div>

      {/* Business Metrics Grid - 使用SPA导航 */}
      <div className="px-4 mt-3">
        <div className="grid grid-cols-4 gap-3">
          {[...metricsLeft, ...metricsRight].map((stat, index) => (
            <div key={index} onClick={() => navigate(stat.path)} className="cursor-pointer">
              <div className="bg-white p-3 rounded-xl shadow-sm flex flex-col items-center justify-center cursor-pointer hover:bg-[#FAF3ED] transition-colors aspect-square">
                <span className="text-xs text-gray-400 text-center mb-1">{stat.name}</span>
                <div className="flex items-baseline justify-center space-x-0.5">
                  <span className={`font-bold leading-none ${stat.name === '邀请好友' ? 'text-[#D32F2F]' : 'text-[#222222]'} text-xl sm:text-2xl`} style={{ fontSize: 'clamp(1.125rem, 5vw, 1.5rem)' }}>
                    {formatNumber(stat.value)}
                  </span>
                  <span className="text-xs text-gray-400 leading-none">{stat.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>




      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
