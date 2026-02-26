import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Notebook, Receipt, Loader2 } from "lucide-react";
import Autoplay from "embla-carousel-autoplay";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { trpc } from "@/lib/trpc";
import BottomNav from "@/components/BottomNav";

function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + "万";
  }
  return num.toLocaleString("zh-CN");
}

export default function LedgerOverview() {
  // 获取账本统计数据
  const { data: ledgerStats, isLoading } = trpc.ledger.stats.useQuery();
  
  // 获取全站最近活动动态（滚动排行榜）
  const { data: recentActivities } = trpc.ledger.recentActivity.useQuery(undefined, {
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const banners = [
    {
      id: 1,
      image: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/carousel/shared-ledger.webp",
      title: "共享账本试用版上线"
    },
  ];

  return (
    <div className="min-h-screen bg-[#FAF3ED] pb-20 max-w-md mx-auto relative shadow-2xl">
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
        <Link href="/ledger/list">
          <a className="block">
            <Card className="bg-gradient-to-br from-[#A80000] to-[#d44] text-white p-3 rounded-2xl shadow-lg border-none flex flex-col items-center justify-center space-y-0.5 cursor-pointer hover:shadow-xl transition-shadow">
              <div className="flex items-center space-x-2 opacity-90">
                <Notebook className="w-5 h-5" />
                <span className="text-sm font-medium">账本总数</span>
              </div>
              <div className="flex items-baseline space-x-1">
                {isLoading ? (
                  <Loader2 className="w-8 h-8 animate-spin opacity-60" />
                ) : (
                  <>
                    <span className="text-2xl font-bold">{ledgerStats ? formatNumber(ledgerStats.totalLedgers) : "—"}</span>
                    <span className="text-sm opacity-80">本</span>
                  </>
                )}
              </div>
            </Card>
          </a>
        </Link>
        
        <Card className="bg-white text-[#222222] p-3 rounded-2xl shadow-lg border-none flex flex-col items-center justify-center space-y-0.5 cursor-pointer hover:shadow-xl transition-shadow">
          <div className="flex items-center space-x-2 text-gray-500">
            <Receipt className="w-5 h-5" />
            <span className="text-sm font-medium">账目总数</span>
          </div>
          <div className="flex items-baseline space-x-1">
            {isLoading ? (
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            ) : (
              <>
                <span className="text-2xl font-bold text-[#D32F2F]">{ledgerStats ? formatNumber(ledgerStats.totalEntries) : "—"}</span>
                <span className="text-sm text-gray-400">条</span>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* 滚动排行榜 - 最近活动动态 */}
      {recentActivities && recentActivities.length > 0 && (
        <div className="px-4 mt-3">
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <span className="w-1.5 h-4 bg-[#D32F2F] rounded-full"></span>
                <span className="text-sm font-semibold text-[#333]">实时动态</span>
              </div>
              <span className="text-xs text-gray-400">全站用户活动</span>
            </div>
            {/* 滚动区域 */}
            <div className="relative overflow-hidden" style={{ height: '240px' }}>
              <style>{`
                @keyframes scrollUp {
                  0% { transform: translateY(0); }
                  100% { transform: translateY(-50%); }
                }
                .scroll-container {
                  animation: scrollUp ${Math.max(20, (recentActivities?.length || 10) * 1.5)}s linear infinite;
                }
                .scroll-container:hover {
                  animation-play-state: paused;
                }
              `}</style>
              <div className="scroll-container">
                {/* 复制两份实现无缝滚动 */}
                {[...recentActivities, ...recentActivities].map((activity, index) => {
                  const time = new Date(activity.createdAt);
                  const now = new Date();
                  const diffMs = now.getTime() - time.getTime();
                  const diffMin = Math.floor(diffMs / 60000);
                  const diffHour = Math.floor(diffMs / 3600000);
                  const diffDay = Math.floor(diffMs / 86400000);
                  let timeStr = '';
                  if (diffMin < 1) timeStr = '刚刚';
                  else if (diffMin < 60) timeStr = `${diffMin}分钟前`;
                  else if (diffHour < 24) timeStr = `${diffHour}小时前`;
                  else if (diffDay < 7) timeStr = `${diffDay}天前`;
                  else timeStr = `${time.getMonth() + 1}/${time.getDate()}`;
                  
                  const isLedger = activity.type === 'new_ledger';
                  
                  return (
                    <div
                      key={`${activity.type}-${index}`}
                      className="flex items-center px-4 py-2.5 border-b border-gray-50 last:border-b-0"
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isLedger ? 'bg-[#FFF5F5] text-[#D32F2F]' : 'bg-[#FFF8E1] text-[#F59E0B]'
                      }`}>
                        {isLedger ? (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                        )}
                      </div>
                      <div className="ml-3 flex-1 min-w-0">
                        <p className="text-sm text-[#333] truncate">
                          <span className="font-medium text-[#D32F2F]">{activity.username}</span>
                          <span className="text-gray-500 ml-1">{activity.detail}</span>
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{timeStr}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
