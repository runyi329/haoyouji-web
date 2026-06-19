/**
 * 奢贝美容院 - 首页
 * 路径: /beauty
 */
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useRef, useEffect } from "react";
import SplashScreen from "@/components/SplashScreen";
import { useMerchantOG } from "@/hooks/useMerchantOG";
import {
  Sparkles, MapPin, Clock, Train, Car, ChevronRight, Brain, ExternalLink, Loader2, Heart, Gift, User, LogOut, Share2, BarChart3, WashingMachine
} from "lucide-react";
import { FALLBACK_PRODUCTS } from "./beauty-fallback-data";

// 根据标题关键词自动匹配分类标签
function getCategory(title: string): { label: string; color: string; bg: string } {
  const t = title;
  if (/美容|护肤|皮肤|面膜|抗衰|保湿|美白|祛斑|祛痘|胶原/.test(t))
    return { label: "美容护肤", color: "text-rose-600", bg: "bg-rose-50" };
  if (/减肥|瘦身|体重|卡路里|热量|塑形|燃脂/.test(t))
    return { label: "减肥塑形", color: "text-orange-600", bg: "bg-orange-50" };
  if (/饮食|食物|营养|蛋白质|维生素|膳食|吃|食谱|控糖|血糖/.test(t))
    return { label: "饮食营养", color: "text-green-600", bg: "bg-green-50" };
  if (/运动|锻炼|健身|瑜伽|跑步|步数|肌肉/.test(t))
    return { label: "运动健身", color: "text-blue-600", bg: "bg-blue-50" };
  if (/疫苗|接种|HPV|流感|病毒|感染|传染|中疾控|疾控/.test(t))
    return { label: "疾病预防", color: "text-purple-600", bg: "bg-purple-50" };
  if (/药|用药|治疗|医生|医院|手术|诊断|病/.test(t))
    return { label: "医疗健康", color: "text-indigo-600", bg: "bg-indigo-50" };
  if (/睡眠|失眠|熬夜|休息/.test(t))
    return { label: "睡眠健康", color: "text-cyan-600", bg: "bg-cyan-50" };
  if (/儿童|宝宝|婴儿|孩子|手足口/.test(t))
    return { label: "儿童健康", color: "text-pink-600", bg: "bg-pink-50" };
  return { label: "健康资讯", color: "text-gray-600", bg: "bg-gray-100" };
}
import { Card, CardContent } from "@/components/ui/card";
import BeautyTabBar from "./BeautyTabBar";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";

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
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // 开机画面状态
  const SPLASH_KEY = '_beauty_splash_shown';
  const [showSplash, setShowSplash] = useState(() => {
    // 每次会话只显示一次
    return !sessionStorage.getItem(SPLASH_KEY);
  });
  // 获取商家设置（包括开机图）
  const settingsQuery = trpc.merchant.getMerchantPublicSettings.useQuery(
    { merchantCode: 'liulifan' },
    { enabled: showSplash }
  );
  const splashImageUrl = settingsQuery.data?.splashImage;

  // 动态注入商家 OG Meta 标签，微信分享显示商家设置的标题/图片
  useMerchantOG('liulifan', { url: `${window.location.origin}/beauty` });
  // 查询奢贝积分和权限
  const pointsQuery = trpc.beauty.points.getMyBalance.useQuery(undefined, {
    refetchOnMount: 'always',
  });
  const canManageQuery = trpc.beauty.points.canManage.useQuery(undefined, {
    refetchOnMount: 'always',
  });
  const canProfileQuery = trpc.beauty.points.canAccessProfile.useQuery(undefined, {
    refetchOnMount: 'always',
  });
  const myPoints = pointsQuery.data?.balance ?? 0;
  const canManage = canManageQuery.data?.canManage ?? false;
  const canAccessProfile = canProfileQuery.data?.canAccess ?? false;

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    setLocation('/login');
  }
  const promotionsQuery = trpc.beauty.promotion.list.useQuery();
  const productsQuery = trpc.beauty.shop.products.useQuery({});
  const healthQuery = trpc.beauty.health.news.useQuery({ num: 3, page: 1 });

  const promotions = promotionsQuery.data ?? [];
  // 商品数据：优先用数据库数据，查询失败或为空时用兜底数据
  // 立即显示底逃数据，API数据到达后再替换
  const dbProducts = productsQuery.data ?? [];
  const products = dbProducts.length > 0 ? dbProducts : FALLBACK_PRODUCTS;
  const healthNews = healthQuery.data ?? [];
  const newsLoading = healthQuery.isLoading;

  const handleShare = () => {
    const shareUrl = `${window.location.origin}/beauty?ref=liulifan`;
    const shareTitle = '奢贝美容院';
    const shareText = '高端美容、健康管理一站式服务，为您定制专属美丽方案';
    if (navigator.share) {
      navigator.share({ title: shareTitle, text: shareText, url: shareUrl }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => {
        toast.success('分享链接已复制');
      }).catch(() => {
        toast.info('分享链接', { description: shareUrl });
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* 开机画面 */}
      {showSplash && splashImageUrl && (
        <SplashScreen
          imageUrl={splashImageUrl}
          duration={2500}
          storageKey={SPLASH_KEY}
          onFinish={() => setShowSplash(false)}
        />
      )}
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
            <div className="flex items-center gap-2">
              {/* 素材按钮 */}
              <Link href="/beauty/showcase">
                <button
                  className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <BarChart3 className="w-4 h-4 text-white/80" />
                </button>
              </Link>
              {/* 分享按钮 */}
              <button
                onClick={handleShare}
                className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center active:scale-90 transition-transform"
              >
                <Share2 className="w-4 h-4 text-white/80" />
              </button>
              {/* 洗衣服务按钮 */}
              <Link href="/beauty/laundry">
                <button
                  className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <WashingMachine className="w-4 h-4 text-white/80" />
                </button>
              </Link>
            </div>
            <div className="flex flex-col items-center gap-1 relative" ref={menuRef}>
              {/* 头像区域 */}
              {canAccessProfile ? (
                /* 有个人中心权限：可点击弹出菜单 */
                <button
                  onClick={() => setMenuOpen(v => !v)}
                  className="w-14 h-14 rounded-full border-2 border-white/40 overflow-hidden bg-white/20 flex items-center justify-center active:scale-95 transition-transform"
                >
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user.username ?? ''} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-xl font-bold">
                      {user?.username ? user.username.charAt(0).toUpperCase() : '?'}
                    </span>
                  )}
                </button>
              ) : (
                /* 普通用户：头像不可点击 */
                <div className="w-14 h-14 rounded-full border-2 border-white/40 overflow-hidden bg-white/20 flex items-center justify-center">
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user.username ?? ''} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-xl font-bold">
                      {user?.username ? user.username.charAt(0).toUpperCase() : '?'}
                    </span>
                  )}
                </div>
              )}
              {/* 用户名 */}
              {user?.username && (
                <span className="text-white/50 text-[10px] tracking-wide select-none">{user.username}</span>
              )}
              {/* 积分显示 */}
              <div className="flex items-center gap-1 bg-white/15 rounded-full px-2 py-0.5">
                <span className="text-amber-200 text-[10px] font-medium">{myPoints} 积分</span>
              </div>
              {/* 下拉菜单（有个人中心权限时显示） */}
              {menuOpen && canAccessProfile && (
                <div className="absolute top-20 right-0 z-50 bg-white rounded-2xl shadow-xl overflow-hidden min-w-[140px] border border-gray-100">
                  <button
                    onClick={() => { setMenuOpen(false); setLocation('/beauty/profile'); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-gray-700 hover:bg-rose-50 active:bg-rose-100 transition-colors text-sm font-medium"
                  >
                    <User className="w-4 h-4 text-rose-400" />
                    个人中心
                  </button>
                  <div className="h-px bg-gray-100" />
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-gray-700 hover:bg-rose-50 active:bg-rose-100 transition-colors text-sm font-medium"
                  >
                    <LogOut className="w-4 h-4 text-rose-400" />
                    退出登录
                  </button>
                </div>
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

        {/* 热门商品 */}
        {products.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-1 mb-2">
              <h2 className="text-sm font-semibold text-gray-700">热门商品</h2>
              <Link href="/beauty/shop">
                <span className="text-xs text-rose-500 flex items-center gap-0.5">查看全部 <ChevronRight className="w-3 h-3" /></span>
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {products.slice(0, 4).map((p) => (
                <Link key={p.id} href={dbProducts.length > 0 ? `/beauty/product/${p.id}` : `/beauty/product/fallback-${p.id}`}>
                  <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden">
                    <div className="h-28 bg-gradient-to-br from-rose-50 to-pink-50 flex items-center justify-center">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <Gift className="w-8 h-8 text-rose-300" />
                      )}
                    </div>
                    <CardContent className="p-3">
                      <h3 className="text-sm font-semibold text-gray-800 truncate">{p.name}</h3>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-rose-500 font-bold text-sm">¥{Number(p.price).toLocaleString()}</span>
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
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-rose-300 animate-spin" />
            </div>
          ) : healthNews.length === 0 ? (
            <div className="text-center py-4 text-gray-400 text-xs">暂无资讯</div>
          ) : (
            <div className="bg-white rounded-xl overflow-hidden border border-gray-100">
              {healthNews.map((item, idx) => {
                const cat = getCategory(item.title);
                return (
                  <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="block">
                    <div className="px-3 py-2.5 active:bg-gray-50">
                      <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mb-1 ${cat.bg} ${cat.color}`}>
                        {cat.label}
                      </span>
                      <h3 className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">{item.title}</h3>
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-1.5">
                          {(item as any).source && <span className="text-xs text-gray-400">{(item as any).source}</span>}
                          {(item as any).source && item.ctime && <span className="text-gray-300 text-xs">·</span>}
                          {item.ctime && <span className="text-xs text-gray-400">{item.ctime.slice(0, 10)}</span>}
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-rose-400" />
                      </div>
                    </div>
                    {idx < healthNews.length - 1 && <div className="mx-3 border-b border-gray-100" />}
                  </a>
                );
              })}
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
