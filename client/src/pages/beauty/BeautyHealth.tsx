/**
 * 奢贝美容院 - 健康资讯页
 * 路径: /beauty/health
 */
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ChevronLeft, Heart, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import BeautyTabBar from "./BeautyTabBar";
import BottomNav from "@/components/BottomNav";

const TIANAPI_KEY = "3878a89bed4728b65cc7d8dc0a644c07";

interface HealthArticle {
  id: number;
  title: string;
  description: string;
  picUrl: string;
  ctime: string;
  url: string;
}

export default function BeautyHealth() {
  const [articles, setArticles] = useState<HealthArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchNews = async (p: number, append = false) => {
    try {
      const res = await fetch(
        `https://apis.tianapi.com/health/index?key=${TIANAPI_KEY}&num=10&page=${p}`
      );
      const data = await res.json();
      if (data.code === 200 && data.result?.list?.length > 0) {
        if (append) {
          setArticles(prev => [...prev, ...data.result.list]);
        } else {
          setArticles(data.result.list);
        }
        if (data.result.list.length < 10) setHasMore(false);
      } else {
        setHasMore(false);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchNews(1);
  }, []);

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    fetchNews(nextPage, true);
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
              onClick={() => { setLoading(true); setPage(1); setHasMore(true); fetchNews(1); }}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
            >
              <RefreshCw className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
        <BeautyTabBar />
      </div>

      <div className="px-4 py-4 space-y-3 max-w-lg mx-auto">
        {loading ? (
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
                          className="w-24 h-18 rounded-xl object-cover flex-shrink-0 bg-rose-50"
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
