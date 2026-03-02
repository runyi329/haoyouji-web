/**
 * 奢贝美容院 - 健康资讯页
 * 路径: /beauty/health
 * 风格：去掉图片，改为彩色分类标签（根据标题关键词自动匹配）
 */
import { Link } from "wouter";
import { ChevronLeft, RefreshCw, Loader2, ExternalLink } from "lucide-react";
import BeautyTabBar from "./BeautyTabBar";
import BottomNav from "@/components/BottomNav";
import { trpc } from "@/lib/trpc";

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
  if (/心理|情绪|压力|焦虑|抑郁|心情/.test(t))
    return { label: "心理健康", color: "text-teal-600", bg: "bg-teal-50" };
  if (/老年|老人|养老|长寿|中老年/.test(t))
    return { label: "老年健康", color: "text-amber-600", bg: "bg-amber-50" };
  if (/儿童|宝宝|婴儿|孩子|手足口/.test(t))
    return { label: "儿童健康", color: "text-pink-600", bg: "bg-pink-50" };
  return { label: "健康资讯", color: "text-gray-600", bg: "bg-gray-100" };
}

export default function BeautyHealth() {
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
    <div className="min-h-screen bg-gray-50 pb-28">
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
        <div className="bg-white mt-2 mx-3 rounded-xl overflow-hidden border border-gray-100">
          {articles.map((item, idx) => {
            const cat = getCategory(item.title);
            return (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <div className="px-4 py-3 active:bg-gray-50">
                  {/* 分类标签 */}
                  <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full mb-1.5 ${cat.bg} ${cat.color}`}>
                    {cat.label}
                  </span>
                  {/* 标题 */}
                  <h3 className="text-sm font-medium text-gray-900 leading-snug line-clamp-2">
                    {item.title}
                  </h3>
                  {/* 来源 + 时间 + 查看原文 */}
                  <div className="flex items-center justify-between mt-1.5">
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
                    <ExternalLink className="w-3.5 h-3.5 text-rose-400" />
                  </div>
                </div>
                {idx < articles.length - 1 && (
                  <div className="mx-4 border-b border-gray-100" />
                )}
              </a>
            );
          })}
          <div className="py-4 text-center">
            <p className="text-xs text-gray-300">— 已加载全部内容 —</p>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
