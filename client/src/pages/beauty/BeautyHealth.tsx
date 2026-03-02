/**
 * 奢贝美容院 - 健康资讯页
 * 路径: /beauty/health
 * 风格参考：今日头条 / 网易新闻 资讯列表
 */
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ChevronLeft, RefreshCw, Loader2 } from "lucide-react";
import BeautyTabBar from "./BeautyTabBar";
import BottomNav from "@/components/BottomNav";
import { trpc } from "@/lib/trpc";

type Article = {
  id: string;
  title: string;
  description: string;
  picUrl: string;
  ctime: string;
  url: string;
  source?: string;
};

export default function BeautyHealth() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [allArticles, setAllArticles] = useState<Article[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const { data, isLoading } = trpc.beauty.health.news.useQuery(
    { num: 10, page: 1 },
    { queryKey: ["beauty.health.news", refreshKey] as any }
  );

  // 首次加载数据同步到 allArticles
  useEffect(() => {
    if (data && data.length > 0) {
      setAllArticles(data as Article[]);
      setHasMore(data.length >= 10);
      setCurrentPage(1);
    }
  }, [data]);

  const handleRefresh = () => {
    setAllArticles([]);
    setHasMore(true);
    setCurrentPage(1);
    setRefreshKey(k => k + 1);
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = currentPage + 1;
    try {
      const input = encodeURIComponent(JSON.stringify({ "0": { json: { num: 10, page: nextPage } } }));
      const res = await fetch(`/api/trpc/beauty.health.news?batch=1&input=${input}`);
      const json = await res.json();
      const list: Article[] = json?.[0]?.result?.data ?? [];
      if (list.length > 0) {
        setAllArticles(prev => [...prev, ...list]);
        setCurrentPage(nextPage);
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

  const articles = allArticles;

  return (
    <div className="min-h-screen bg-white pb-28">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Link href="/beauty">
              <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200">
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
            </Link>
            <h1 className="text-base font-semibold text-gray-900">健康美容资讯</h1>
          </div>
          <button
            onClick={handleRefresh}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200"
          >
            <RefreshCw className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <BeautyTabBar />
      </div>

      {/* 内容区 */}
      {isLoading && articles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-7 h-7 text-rose-400 animate-spin" />
          <p className="text-xs text-gray-400">正在加载资讯...</p>
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-20 text-sm text-gray-400">暂无资讯内容</div>
      ) : (
        <div className="bg-white">
          {articles.map((item, idx) => (
            <a
              key={`${item.id}-${idx}`}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <div className="flex items-center gap-3 px-4 py-3 active:bg-gray-50">
                {/* 左侧：标题 + 来源+时间 */}
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <h3 className="text-sm font-medium text-gray-900 leading-snug line-clamp-2">
                    {item.title}
                  </h3>
                  <div className="flex items-center gap-1.5">
                    {item.source && (
                      <span className="text-xs text-gray-400">{item.source}</span>
                    )}
                    {item.source && item.ctime && (
                      <span className="text-gray-300 text-xs">·</span>
                    )}
                    {item.ctime && (
                      <span className="text-xs text-gray-400">{item.ctime.slice(0, 10)}</span>
                    )}
                  </div>
                </div>

                {/* 右侧：缩略图 */}
                {item.picUrl ? (
                  <img
                    src={item.picUrl}
                    alt={item.title}
                    className="w-20 h-14 rounded-lg object-cover flex-shrink-0 bg-gray-100"
                    onError={(e) => {
                      (e.target as HTMLImageElement).parentElement!.querySelector('.fallback-img')!.classList.remove('hidden');
                      (e.target as HTMLImageElement).classList.add('hidden');
                    }}
                  />
                ) : (
                  <div className="w-20 h-14 rounded-lg bg-rose-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-rose-200 text-xl">♡</span>
                  </div>
                )}
              </div>
              {idx < articles.length - 1 && (
                <div className="mx-4 border-b border-gray-100" />
              )}
            </a>
          ))}

          {/* 加载更多 */}
          <div className="py-5 text-center">
            {loadingMore ? (
              <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                加载中...
              </div>
            ) : hasMore ? (
              <button
                onClick={loadMore}
                className="text-xs text-rose-500 font-medium px-6 py-2 rounded-full border border-rose-200 active:bg-rose-50"
              >
                加载更多
              </button>
            ) : (
              <p className="text-xs text-gray-300">— 已加载全部内容 —</p>
            )}
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
