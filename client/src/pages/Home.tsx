import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { 
  Users, 
  MapPin, 
  Handshake, 
  BarChart2, 
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
import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import "@/styles/level-text.css";

const BASE_URL = "https://www.jiangyuchen.cn";

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

// 使用Web Audio API生成提示音（两声清脆的"叮叮"）
function playReminderSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    const playTone = (startTime: number, frequency: number, duration: number) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startTime);
      
      // 音量包络：快速升起，缓慢衰减
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };
    
    const now = audioContext.currentTime;
    // 第一声 "叮"（较高音）
    playTone(now, 880, 0.3);
    // 第二声 "叮"（更高音，间隔0.2秒）
    playTone(now + 0.25, 1100, 0.3);
    // 第三声 "叮"（最高音，间隔0.2秒）
    playTone(now + 0.5, 1320, 0.4);
  } catch (e) {
    console.log('Audio playback not supported:', e);
  }
}

export default function Home() {
  const { user } = useAuth();
  const isLiulifan = user?.username === 'liulifan';
  
  // 获取基础统计数据
  const { data: stats, isLoading, refetch, isFetching } = trpc.contacts.stats.useQuery(undefined, {
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // 获取累计联络次数
  const { data: totalInteractionCount } = trpc.contacts.totalInteractionCount.useQuery();
  
  // 获取累计标签数量
  const { data: totalTagCount } = trpc.contacts.totalTagCount.useQuery();
  
  // 获取累计使用天数
  const { data: totalUsageDays } = trpc.contacts.getTotalUsageDays.useQuery();
  
  // 获取邀请统计
  const { data: inviteInfo } = trpc.invite.getMyInviteInfo.useQuery();
  
  // 获取晋升数据（用于显示等级）
  const { data: promotionStats } = trpc.equity.getPromotionStats.useQuery();

  // 仅liulifan用户：获取需要关注的人数
  const { data: overviewStats } = trpc.contacts.overviewStats.useQuery(undefined, {
    enabled: isLiulifan,
    staleTime: 30000,
  });

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [hasPlayedSound, setHasPlayedSound] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  
  const needsAttentionCount = overviewStats?.needsAttentionCount ?? 0;

  // 声音提醒：页面加载后如果有需要关注的人，播放提示音 + 启动跳动动画
  useEffect(() => {
    if (isLiulifan && needsAttentionCount > 0 && !hasPlayedSound) {
      // 延迟1秒播放，让页面先加载完
      const timer = setTimeout(() => {
        playReminderSound();
        setHasPlayedSound(true);
        setIsAnimating(true);
        // 跳动动画持续5秒后停止（但角标始终显示）
        setTimeout(() => setIsAnimating(false), 5000);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isLiulifan, needsAttentionCount, hasPlayedSound]);

  const banners = [
    {
      id: 1,
      image: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/carousel/shared-ledger.webp",
      title: "共享账本试用版上线"
    },
    {
      id: 2,
      image: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/carousel/friend-share.webp",
      title: "好友共享"
    },
    {
      id: 3,
      image: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/carousel/decentral.webp",
      title: "去中心化人脉管理"
    },
    {
      id: 4,
      image: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/carousel/ai.webp",
      title: "AI社交"
    }
  ];

  const features = [
    { name: "地域", icon: MapPin, color: "bg-[#D32F2F]-light text-[#D32F2F]", href: `${BASE_URL}/parent/contacts/map` },
    { name: "共享", icon: Handshake, color: "bg-[#D32F2F]-light text-[#D32F2F]", href: `${BASE_URL}/parent/contacts/sharing` },
    { name: "数据", icon: BarChart2, color: "bg-[#D32F2F]-light text-[#D32F2F]", href: `${BASE_URL}/parent/contacts/data-comparison` },
    { name: "资产", icon: Coins, color: "bg-[#D32F2F]-light text-[#D32F2F]", href: `${BASE_URL}/parent/asset-report` },
  ];

  const metricsLeft = [
    { name: "累计联络", value: totalInteractionCount ?? 0, unit: "次", href: `${BASE_URL}/parent/contacts/interaction-stats` },
    { name: "累计使用", value: totalUsageDays ?? 0, unit: "天", href: `${BASE_URL}/parent/contacts` },
    { name: "公司总数", value: stats?.companyCount ?? 0, unit: "家", href: `${BASE_URL}/parent/contacts/list?view=company` },
    { name: "今日活跃", value: stats?.todayActive ?? 0, unit: "人", href: `${BASE_URL}/parent/contacts/list?filter=todayActive` },
  ];

  const metricsRight = [
    { name: "本周新增", value: stats?.newThisWeek ?? 0, unit: "人", href: `${BASE_URL}/parent/contacts/list?filter=thisWeek` },
    { name: "账目总数", value: stats?.totalLedgerEntries ?? 0, unit: "条", href: `/ledger` },
    { name: "我的积分", value: user?.points ?? 0, unit: "分", href: `${BASE_URL}/parent/points` },
    { name: "邀请好友", value: inviteInfo?.inviteCount ?? 0, unit: "人", href: `${BASE_URL}/parent/profile/invite` },
  ];

  const handleLogout = () => {
    document.cookie = "session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.href = `${BASE_URL}/login`;
  };

  const handleRefresh = () => {
    refetch();
  };

  return (
    <div className="min-h-screen bg-[#FAF3ED] pb-20 max-w-md mx-auto relative shadow-2xl">
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

      {/* Stats Cards */}
      <div className="px-4 mt-2 grid grid-cols-2 gap-2">
        <a href="https://www.jiangyuchen.cn/parent/contacts/list" className="block">
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
        </a>
        
        <a href="https://www.jiangyuchen.cn/parent/contacts/tag-stats" className="block">
          <Card className="bg-white text-[#222222] p-3 rounded-2xl shadow-lg border-none flex flex-col items-center justify-center space-y-0.5 cursor-pointer hover:shadow-xl transition-shadow">
          <div className="flex items-center space-x-2 text-gray-500">
            <Coins className="w-5 h-5" />
            <span className="text-sm font-medium">累计标签</span>
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
        </a>
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
              <DropdownMenuItem asChild>
                <a href={`${BASE_URL}/parent/profile`} className="flex items-center cursor-pointer">
                  <UserCircle className="w-4 h-4 mr-2" />
                  <span>个人中心</span>
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="flex items-center cursor-pointer text-[#D32F2F]">
                <LogOut className="w-4 h-4 mr-2" />
                <span>退出登录</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <a
                key={feature.name}
                href={feature.href}
                className="flex flex-col items-center space-y-2 cursor-pointer"
              >
                <div className={`w-10 h-10 rounded-full ${feature.color} flex items-center justify-center shadow-sm`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-[#757575]">{feature.name}</span>
              </a>
            );
          })}

          {/* 第5个按钮：liulifan显示提醒按钮，其他用户显示刷新按钮 */}
          {isLiulifan ? (
            <a
              href={`${BASE_URL}/parent/contacts/list?filter=needsAttention`}
              className="flex flex-col items-center space-y-2 cursor-pointer relative"
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm relative ${
                needsAttentionCount > 0 
                  ? 'bg-[#D32F2F] text-white' 
                  : 'bg-[#D32F2F]-light text-[#D32F2F]'
              }`}>
                <Bell className={`w-5 h-5 ${isAnimating ? 'bell-shake' : ''}`} />
                {/* 红色角标 */}
                {needsAttentionCount > 0 && (
                  <span className={`absolute -top-1 -right-1 bg-[#D32F2F]-light0 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 border-2 border-white ${isAnimating ? 'badge-pulse' : ''}`}>
                    {needsAttentionCount > 99 ? '99+' : needsAttentionCount}
                  </span>
                )}
              </div>
              <span className="text-xs font-medium text-[#757575]">提醒</span>
            </a>
          ) : (
            <a
              href={undefined}
              onClick={handleRefresh}
              className="flex flex-col items-center space-y-2 cursor-pointer"
            >
              <div className={`w-10 h-10 rounded-full bg-[#D32F2F]-light text-[#D32F2F] flex items-center justify-center shadow-sm ${isFetching ? 'animate-spin' : ''}`}>
                <RefreshCw className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-[#757575]">刷新</span>
            </a>
          )}
        </div>
      </div>

      {/* Business Metrics Grid */}
      <div className="px-4 mt-3">
        <div className="grid grid-cols-4 gap-3">
          {[...metricsLeft, ...metricsRight].map((stat, index) => (
            <a key={index} href={stat.href}>
              <div className="bg-white p-3 rounded-xl shadow-sm flex flex-col items-center justify-center cursor-pointer hover:bg-[#FAF3ED] transition-colors aspect-square">
                <span className="text-xs text-gray-400 text-center mb-1">{stat.name}</span>
                <div className="flex items-baseline justify-center space-x-0.5">
                  <span className={`font-bold leading-none ${stat.name === '邀请好友' ? 'text-[#D32F2F]' : 'text-[#222222]'} text-xl sm:text-2xl`} style={{ fontSize: 'clamp(1.125rem, 5vw, 1.5rem)' }}>
                    {formatNumber(stat.value)}
                  </span>
                  <span className="text-xs text-gray-400 leading-none">{stat.unit}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* 专属祝福语 - 仅vesen可见 */}
      {user?.username === 'vesen' && (
        <div className="px-4 mt-3">
          <div className="bg-gradient-to-r from-[#A80000] to-[#d44] rounded-2xl p-4 shadow-lg text-center">
            <p className="text-white text-lg font-bold tracking-wider">
              🎉 老周，新年快乐！🎉
            </p>
            <p className="text-white/80 text-xs mt-1">祝您新的一年万事如意、财源广进</p>
          </div>
        </div>
      )}

      {/* 专属祝福语 - 仅liulifan可见 */}
      {user?.username === 'liulifan' && (
        <div className="px-4 mt-3">
          <div className="bg-gradient-to-r from-[#A80000] to-[#d44] rounded-2xl p-4 shadow-lg text-center">
            <p className="text-white text-lg font-bold tracking-wider">
              🧧 丽凡，新年快乐！🧧
            </p>
            <p className="text-white/80 text-xs mt-1">愿新的一年，万事顺遂、阖家幸福、事业蒸蒸日上</p>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-divider px-6 py-3 flex justify-around items-center z-50 max-w-md mx-auto shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex flex-col items-center space-y-1 text-[#D32F2F]">
          <Users className="w-6 h-6" />
          <span className="text-xs font-bold">人脉</span>
        </div>
        
        <a href={`${BASE_URL}/parent/contacts/add`}>
          <div className="w-12 h-12 bg-[#D32F2F] rounded-full -mt-8 flex items-center justify-center shadow-lg border-4 border-white cursor-pointer hover:bg-[#D32F2F]-dark transition-colors">
            <Plus className="w-6 h-6 text-white" />
          </div>
        </a>
        
        <Link href="/ledger">
          <a className="flex flex-col items-center space-y-1 text-gray-400 hover:text-[#D32F2F] transition-colors">
            <Wallet className="w-6 h-6" />
            <span className="text-xs font-medium">钱脉</span>
          </a>
        </Link>
      </div>
    </div>
  );
}
