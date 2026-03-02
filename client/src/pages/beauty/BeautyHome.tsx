/**
 * 奢贝美容院 - 首页
 * 路径: /beauty
 */
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Sparkles, MapPin, Clock, Train, Car, ChevronRight, Heart, Brain, ExternalLink, Loader2
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import BeautyTabBar from "./BeautyTabBar";
import BottomNav from "@/components/BottomNav";

const STORE_INFO = {
  name: "奢贝美容院",
  subtitle: "SHEBEI BEAUTY",
  address: "曹安公路1877号曹安国际商城936室",
  hours: "11:00-20:00",
  subway: "14号线定边路站3号口出站左前方过马路进入曹安国际商城再左拐一百米右手1877门洞里电梯上9楼936室",
  parking: "预约客户2小时免费停车",
};

function openMapNavigation() {
  const addr = encodeURIComponent(STORE_INFO.address);
  window.open(`https://uri.amap.com/search?keyword=${addr}&src=shebei`, "_blank");
}

export default function BeautyHome() {
  const { user } = useAuth();
  const promotionsQuery = trpc.beauty.promotion.list.useQuery();
  const servicesQuery = trpc.beauty.service.list.useQuery();
  const healthQuery = trpc.beauty.health.news.useQuery({ num: 3, page: 1 });

  const promotions = promotionsQuery.data ?? [];
  const services = servicesQuery.data ?? [];
  const healthNews = healthQuery.data ?? [];
  const newsLoading = healthQuery.isLoading;

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* 顶部 Banner */}
      <div className="relative bg-gradient-to-br from-rose-400 via-pink-400 to-rose-300 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-4 right-8 w-24 h-24 rounded-full bg-white" />
          <div className="absolute bottom-2 left-4 w-16 h-16 rounded-full bg-white" />
        </div>
        <div className="relative px-5 pt-12 pb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm mb-1">欢迎光临</p>
              <h1 className="text-2xl font-bold tracking-wide">{STORE_INFO.name}</h1>
              <p className="text-white/70 text-xs mt-1 tracking-widest">{STORE_INFO.subtitle}</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-14 h-14 rounded-full border-2 border-white/40 overflow-hidden bg-white/20 flex items-center justify-center">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.username ?? ''} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-xl font-bold">
                    {user?.username ? user.username.charAt(0).toUpperCase() : '?'}
                  </span>
                )}
              </div>
              {user?.username && (
                <span className="text-white/50 text-[10px] tracking-wide select-none">{user.username}</span>
              )}
            </div>
          </div>

          {/* 特色功能入口 */}
          <div className="grid grid-cols-2 gap-3 mt-6">
            <Link href="/beauty/health">
              <div className="flex items-center gap-3 bg-white/20 rounded-2xl py-4 px-4 hover:bg-white/30 transition-colors cursor-pointer">
                <div className="w-10 h-10 rounded-full bg-white/30 flex items-center justify-center flex-shrink-0">
                  <Heart className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">健康资讯</p>
                  <p className="text-white/70 text-xs mt-0.5">美容养生知识</p>
                </div>
              </div>
            </Link>
            <Link href="/beauty/ai-diet">
              <div className="flex items-center gap-3 bg-white/20 rounded-2xl py-4 px-4 hover:bg-white/30 transition-colors cursor-pointer">
                <div className="w-10 h-10 rounded-full bg-white/30 flex items-center justify-center flex-shrink-0">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">AI 减肥</p>
                  <p className="text-white/70 text-xs mt-0.5">智能瘦身方案</p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* 顶部 Tab 栏 */}
      <div className="sticky top-0 z-10">
        <BeautyTabBar />
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* 活动轮播 */}
        {promotions.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-700 px-1">最新活动</h2>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
              {promotions.map((p) => (
                <div key={p.id} className="flex-shrink-0 w-64 bg-gradient-to-r from-rose-50 to-pink-50 rounded-xl p-4 border border-rose-100">
                  <span className="text-xs bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full">{p.type === 'opening' ? '开业活动' : p.type === 'points' ? '积分活动' : '优惠活动'}</span>
                  <h3 className="font-semibold text-gray-800 mt-2 text-sm">{p.title}</h3>
                  {p.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 热门项目 */}
        {services.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-1 mb-2">
              <h2 className="text-sm font-semibold text-gray-700">热门项目</h2>
              <Link href="/beauty/services">
                <span className="text-xs text-rose-500 flex items-center gap-0.5">查看全部 <ChevronRight className="w-3 h-3" /></span>
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {services.slice(0, 4).map((s) => (
                <Link key={s.id} href={`/beauty/booking?service=${s.id}`}>
                  <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden">
                    <div className="h-24 bg-gradient-to-br from-rose-100 to-pink-50 flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-rose-300" />
                    </div>
                    <CardContent className="p-3">
                      <h3 className="text-sm font-semibold text-gray-800 truncate">{s.name}</h3>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-rose-500 font-bold text-sm">¥{s.price}</span>
                        <span className="text-xs text-gray-400 flex items-center gap-0.5"><Clock className="w-3 h-3" />{s.duration}分钟</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* 健康资讯预览 */}
        <div>
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="text-sm font-semibold text-gray-700">健康美容资讯</h2>
            <Link href="/beauty/health">
              <span className="text-xs text-rose-500 flex items-center gap-0.5">查看更多 <ChevronRight className="w-3 h-3" /></span>
            </Link>
          </div>
          {newsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-rose-300 animate-spin" />
            </div>
          ) : healthNews.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-xs">暂无资讯</div>
          ) : (
            <div className="space-y-2">
              {healthNews.map((item) => (
                <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer">
                  <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-3">
                      <div className="flex gap-3">
                        {item.picUrl ? (
                          <img
                            src={item.picUrl}
                            alt={item.title}
                            className="w-20 h-16 rounded-lg object-cover flex-shrink-0 bg-rose-50"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className="w-20 h-16 rounded-lg bg-gradient-to-br from-rose-100 to-pink-50 flex items-center justify-center flex-shrink-0">
                            <Heart className="w-6 h-6 text-rose-300" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-gray-800 line-clamp-2 leading-snug">{item.title}</h3>
                          {item.description && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>
                          )}
                          <div className="flex items-center gap-1 mt-1.5">
                            <ExternalLink className="w-3 h-3 text-rose-400" />
                            <span className="text-xs text-rose-400">查看原文</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* 门店信息 */}
        <Card className="border-0 shadow-md">
          <CardContent className="p-0">
            <div className="relative h-28 bg-gradient-to-r from-rose-200 to-pink-100 overflow-hidden rounded-t-xl">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-10 h-10 mx-auto mb-1.5 rounded-full bg-white/80 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-rose-400" />
                  </div>
                  <h3 className="text-base font-bold text-gray-800">{STORE_INFO.name}</h3>
                  <p className="text-xs text-gray-500">{STORE_INFO.subtitle}</p>
                </div>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {/* 地址 */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-4 h-4 text-rose-500" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-700">门店地址</p>
                  <p className="text-xs text-gray-500 mt-0.5">{STORE_INFO.address}</p>
                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    <span>{STORE_INFO.hours}</span>
                  </div>
                </div>
              </div>
              {/* 地铁 */}
              <div className="flex items-start gap-3 pt-2 border-t border-gray-100">
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Train className="w-4 h-4 text-blue-500" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-700">地铁导航</p>
                  <p className="text-xs text-gray-500 mt-0.5">{STORE_INFO.subway}</p>
                  <button onClick={openMapNavigation} className="text-xs text-blue-500 mt-1 font-medium">打开地图导航 →</button>
                </div>
              </div>
              {/* 开车 */}
              <div className="flex items-start gap-3 pt-2 border-t border-gray-100">
                <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                  <Car className="w-4 h-4 text-green-500" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-700">开车导航</p>
                  <p className="text-xs text-gray-500 mt-0.5">定位到曹安公路1877号，{STORE_INFO.parking}</p>
                  <button onClick={openMapNavigation} className="text-xs text-green-500 mt-1 font-medium">打开地图导航 →</button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
}
