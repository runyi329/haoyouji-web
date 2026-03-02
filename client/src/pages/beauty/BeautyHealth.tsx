/**
 * 奢贝美容院 - 健康资讯页
 * 路径: /beauty/health
 * 风格参考：今日头条 / 网易新闻 资讯列表
 */
import { Link } from "wouter";
import { ChevronLeft, RefreshCw, Loader2 } from "lucide-react";
import BeautyTabBar from "./BeautyTabBar";
import BottomNav from "@/components/BottomNav";
import { trpc } from "@/lib/trpc";

export default function BeautyHealth() {
  // 与首页保持完全一致的调用方式，直接用 data ?? []
  const { data, isLoading, refetch } = trpc.beauty.health.news.useQuery({ num: 10, page: 1 });
  const articles = (data ?? []) as Array<{
    id: string;
    title: string;
    description: string;
    picUrl: string;
    ctime: string;
    url: string;
    source?: string;
  }>;

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
            onClick={() => refetch()}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200"
          >
            <RefreshCw className="w-4 h-4 text-gray-400" />
          </button>
        </div>
        <BeautyTabBar />
      </div>

      {/* 内容区 */}
      {isLoading ? (
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
              key={item.id}
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
                    className="rounded-lg object-cover flex-shrink-0 bg-gray-100"
                    style={{ width: '72px', height: '48px' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="rounded-lg bg-rose-50 flex items-center justify-center flex-shrink-0" style={{ width: '72px', height: '48px' }}>
                    <span className="text-rose-200 text-xl">♡</span>
                  </div>
                )}
              </div>
              {idx < articles.length - 1 && (
                <div className="mx-4 border-b border-gray-100" />
              )}
            </a>
          ))}

          <div className="py-5 text-center">
            <p className="text-xs text-gray-300">— 已加载全部内容 —</p>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
