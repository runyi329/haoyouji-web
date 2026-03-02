/**
 * 奢贝美容院 - 健康资讯页
 * 路径: /beauty/health
 */
import { useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, Heart, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import BeautyTabBar from "./BeautyTabBar";
import BottomNav from "@/components/BottomNav";
import { trpc } from "@/lib/trpc";

export default function BeautyHealth() {
  const [page, setPage] = useState(1);
  const [allArticles, setAllArticles] = useState<Array<{
    id: string; title: string; description: string; picUrl: string; ctime: string; url: string; source?: string;
  }>>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const { data, isLoading, refetch } = trpc.beauty.health.news.useQuery(
    { num: 10, page: 1 },
    {
      onSuccess: (list) => {
        setAllArticles(list);
        setHasMore(list.length >= 10);
      },
    }
  );

  const articles = allArticles.length > 0 ? allArticles : (data ?? []);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    // 直接调用 tRPC 查询获取下一页
    try {
      const res = await fetch(
        `/api/trpc/beauty.health.news?input=${encodeURIComponent(JSON.stringify({ num: 10, page: nextPage }))}`
      );
      const json = await res.json();
      const list = json?.result?.data ?? [];
      if (list.length > 0) {
        setAllArticles(prev => [...prev, ...list]);
        if (list.length < 10) setHasMore(false);
      } else {
        setHasMore(false);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRefresh = () => {
    setPage(1);
    setAllArticles([]);
    setHasMore(true);
    refetch();
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10">
        <div className="bg-white border-b border-gray-100">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <Link href="/beauty">
                <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
              </Link>
              <h1 className="font-semibold text-gray-800">健康美容资讯</h1>
            </div>
            <button
              onClick={handleRefresh}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
            >
              <RefreshCw className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
        <BeautyTabBar />
      </div>

      <div className="px-4 py-4 space-y-3 max-w-lg mx-auto">
        {isLoading && articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 text-rose-400 animate-spin" />
            <p className="text-sm text-gray-400">正在加载资讯...</p>
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">暂无资讯内容</div>
        ) : (
          <>
            {articles.map((item, idx) => (
              <a key={`${item.id}-${idx}`} href={item.url} target="_blank" rel="noopener noreferrer">
                <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      {item.picUrl ? (
                        <img
                          src={item.picUrl}
                          alt={item.title}
                          className="w-24 rounded-xl object-cover flex-shrink-0 bg-rose-50"
                          style={{ height: '72px' }}
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-24 rounded-xl bg-gradient-to-br from-rose-100 to-pink-50 flex items-center justify-center flex-shrink-0" style={{ height: '72px' }}>
                          <Heart className="w-7 h-7 text-rose-300" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-800 line-clamp-2 leading-snug">{item.title}</h3>
                        {item.description && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
                        )}
                        <div className="flex items-center justify-between mt-2">
                          {item.ctime && (
                            <span className="text-xs text-gray-300">{item.ctime.slice(0, 10)}</span>
                          )}
                          <div className="flex items-center gap-1 ml-auto">
                            <ExternalLink className="w-3 h-3 text-rose-400" />
                            <span className="text-xs text-rose-400">查看原文</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </a>
            ))}

            {/* 加载更多 */}
            {hasMore ? (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-3 text-sm text-rose-500 font-medium flex items-center justify-center gap-2 hover:text-rose-600 transition-colors"
              >
                {loadingMore ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 加载中...</>
                ) : (
                  "加载更多"
                )}
              </button>
            ) : (
              <p className="text-center text-xs text-gray-300 py-3">— 已加载全部内容 —</p>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
