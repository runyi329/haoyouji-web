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

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
