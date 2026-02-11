import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { 
  Users, 
  MapPin, 
  Share2, 
  BarChart2, 
  RefreshCw, 
  Plus,
  Wallet,
  Coins,
  Loader2,
  User,
  LogOut,
  UserCircle
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
import { useState } from "react";

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

export default function Home() {
  const { user } = useAuth();
  
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

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const banners = [
    {
      id: 1,
      image: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/carousel/share.webp",
      title: "人脉共享"
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

  const features = [
    { name: "地域", icon: MapPin, color: "bg-orange-50 text-orange-600", href: `${BASE_URL}/parent/contacts/map` },
    { name: "分享", icon: Share2, color: "bg-green-50 text-green-600", href: `${BASE_URL}/parent/contacts/sharing` },
    { name: "数据", icon: BarChart2, color: "bg-purple-50 text-purple-600", href: `${BASE_URL}/parent/contacts/data-comparison` },
    { name: "刷新", icon: RefreshCw, color: "bg-indigo-50 text-indigo-600", href: "" },
  ];

  const metricsLeft = [
    { name: "累计联络", value: totalInteractionCount ? formatNumber(totalInteractionCount) + "次" : "...", href: `${BASE_URL}/parent/contacts` },
    { name: "累计使用", value: totalUsageDays ? formatNumber(totalUsageDays) + "天" : "...", href: `${BASE_URL}/parent/contacts` },
    { name: "公司总数", value: stats ? formatNumber(stats.companyCount) + "家" : "...", href: `${BASE_URL}/parent/contacts/list` },
    { name: "今日活跃", value: stats ? formatNumber(stats.todayActive) + "人" : "...", href: `${BASE_URL}/parent/contacts/list?filter=todayActive` },
  ];

  const metricsRight = [
    { name: "本周新增", value: stats ? formatNumber(stats.newThisWeek) + "人" : "...", href: `${BASE_URL}/parent/contacts/list?filter=thisWeek` },
    { name: "账目总数", value: stats ? formatNumber(stats.totalLedgerEntries) + "条" : "...", href: `/ledger` },
    { name: "我的积分", value: user ? formatNumber(user.points) + "分" : "...", href: `${BASE_URL}/parent/points` },
    { name: "邀请好友", value: inviteInfo ? formatNumber(inviteInfo.inviteCount) + "人" : "...", href: `${BASE_URL}/parent/profile/invite` },
  ];

  const handleLogout = () => {
    // 清除登录状态
    document.cookie = "session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    // 跳转到登录页
    window.location.href = `${BASE_URL}/login`;
  };

  const handleRefresh = () => {
    refetch();
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 max-w-md mx-auto relative shadow-2xl">
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
        <a href="https://www.jiangyuchen.cn/parent/contacts" className="block">
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
        
        <a href="https://www.jiangyuchen.cn/parent/contacts/tag-analytics" className="block">
          <Card className="bg-white text-gray-800 p-3 rounded-2xl shadow-lg border-none flex flex-col items-center justify-center space-y-0.5 cursor-pointer hover:shadow-xl transition-shadow">
          <div className="flex items-center space-x-2 text-gray-500">
            <Coins className="w-5 h-5" />
            <span className="text-sm font-medium">累计标签</span>
          </div>
          <div className="flex items-baseline space-x-1">
            {isLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            ) : (
              <>
                <span className="text-2xl font-bold text-[#A80000]">{totalTagCount ? formatNumber(totalTagCount) : "—"}</span>
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
                  <User className="w-5 h-5 text-white" />
                </div>
                <span className="text-xs font-medium text-gray-600">我的</span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem asChild>
                <a href={`${BASE_URL}/parent/profile`} className="flex items-center cursor-pointer">
                  <UserCircle className="w-4 h-4 mr-2" />
                  <span>个人中心</span>
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="flex items-center cursor-pointer text-red-600">
                <LogOut className="w-4 h-4 mr-2" />
                <span>退出登录</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {features.map((feature) => {
            const Icon = feature.icon;
            const isRefresh = feature.name === "刷新";
            
            return (
              <a
                key={feature.name}
                href={isRefresh ? undefined : feature.href}
                onClick={isRefresh ? handleRefresh : undefined}
                className="flex flex-col items-center space-y-2 cursor-pointer"
              >
                <div className={`w-10 h-10 rounded-full ${feature.color} flex items-center justify-center shadow-sm ${isRefresh && isFetching ? 'animate-spin' : ''}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-medium text-gray-600">{feature.name}</span>
              </a>
            );
          })}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="px-4 mt-2 grid grid-cols-2 gap-2">
        {/* Left Column */}
        <div className="space-y-2">
          {metricsLeft.map((metric) => (
            <a key={metric.name} href={metric.href} className="block">
              <Card className="bg-white p-3 rounded-xl shadow-sm border-none hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{metric.name}</span>
                  <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <div className="mt-1 text-base font-bold text-gray-800">{metric.value}</div>
              </Card>
            </a>
          ))}
        </div>

        {/* Right Column */}
        <div className="space-y-2">
          {metricsRight.map((metric) => (
            <a key={metric.name} href={metric.href} className="block">
              <Card className="bg-white p-3 rounded-xl shadow-sm border-none hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{metric.name}</span>
                  <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
                <div className="mt-1 text-base font-bold text-gray-800">{metric.value}</div>
              </Card>
            </a>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 mt-2 grid grid-cols-2 gap-2">
        <a href={`${BASE_URL}/parent/contacts`} className="block">
          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-4 rounded-xl shadow-lg border-none flex items-center justify-center space-x-2 cursor-pointer hover:shadow-xl transition-shadow">
            <Users className="w-5 h-5" />
            <span className="font-medium">人脉</span>
          </Card>
        </a>
        
        <a href="/ledger" className="block">
          <Card className="bg-gradient-to-br from-teal-500 to-teal-600 text-white p-4 rounded-xl shadow-lg border-none flex items-center justify-center space-x-2 cursor-pointer hover:shadow-xl transition-shadow">
            <Wallet className="w-5 h-5" />
            <span className="font-medium">钱脉</span>
          </Card>
        </a>
      </div>
    </div>
  );
}
