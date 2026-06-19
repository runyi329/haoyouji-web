/**
 * 红酒文化商会 - 资讯页
 * 路径: /wine/news
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight, ArrowLeft } from "lucide-react";
import WineTabBar from "./WineTabBar";
import BottomNav from "@/components/BottomNav";

const NEWS_CATEGORIES = ["全部", "品鉴报告", "产区资讯", "活动预告", "行业动态"];

const NEWS_LIST = [
  { id: 1, title: "2024年份波尔多期酒品鉴报告", summary: "本年度波尔多期酒整体表现优异，梅多克产区尤为突出，多款列级庄酒款获得专家高度评价。", date: "2025-03-01", tag: "品鉴报告", readTime: "5分钟" },
  { id: 2, title: "勃艮第产区：气候变化对黑皮诺的影响", summary: "近年来气候变暖对勃艮第黑皮诺葡萄的生长周期产生了深远影响，提前采收已成为新常态。", date: "2025-02-20", tag: "产区资讯", readTime: "8分钟" },
  { id: 3, title: "商会春季品鉴会活动预告", summary: "2025年春季品鉴会将于4月在上海举办，届时将有来自12个产区的80余款精选酒款供会员品鉴。", date: "2025-02-15", tag: "活动预告", readTime: "3分钟" },
  { id: 4, title: "意大利超级托斯卡纳：传统与创新的碰撞", summary: "超级托斯卡纳葡萄酒打破了意大利传统DOC规定，以国际品种酿造出令世界惊艳的顶级佳酿。", date: "2025-02-10", tag: "产区资讯", readTime: "6分钟" },
  { id: 5, title: "自然酒浪潮：是趋势还是噱头？", summary: "近年来自然酒在全球范围内掀起热潮，但关于其品质稳定性和定义的争议从未停止。", date: "2025-01-28", tag: "行业动态", readTime: "7分钟" },
  { id: 6, title: "智利卡门酒庄2022年份品鉴笔记", summary: "卡门酒庄2022年份赤霞珠展现出迷人的黑色水果香气，单宁成熟细腻，余味悠长。", date: "2025-01-20", tag: "品鉴报告", readTime: "4分钟" },
];

export default function WineNews() {
  const [, setLocation] = useLocation();
  const [activeCategory, setActiveCategory] = useState("全部");

  const filtered = activeCategory === "全部"
    ? NEWS_LIST
    : NEWS_LIST.filter(n => n.tag === activeCategory);

  return (
    <div className="min-h-screen bg-[#0d0505] text-white pb-24">
      {/* 顶部标题栏 */}
      <div className="bg-[#1a0a0a] border-b border-[#8B1A1A]/30 px-4 py-4 flex items-center gap-3">
        <button onClick={() => setLocation("/wine")} className="text-[#8a7a6a] hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-white font-bold text-lg">资讯</h1>
          <p className="text-[#8a7a6a] text-xs">红酒文化 · 产区动态 · 品鉴报告</p>
        </div>
      </div>

      {/* Tab 导航 */}
      <WineTabBar />

      {/* 分类筛选 */}
      <div className="px-4 py-3 flex gap-2 overflow-x-auto scrollbar-hide">
        {NEWS_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeCategory === cat
                ? "bg-[#8B1A1A] text-white"
                : "bg-[#1a0a0a] border border-[#8B1A1A]/30 text-[#8a7a6a]"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 资讯列表 */}
      <div className="px-4 space-y-3">
        {filtered.map((news) => (
          <div
            key={news.id}
            className="bg-[#1a0a0a] border border-[#8B1A1A]/30 rounded-xl p-4 hover:border-[#C9A84C]/40 transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-medium text-sm leading-snug mb-2">{news.title}</h3>
                <p className="text-[#8a7a6a] text-xs leading-relaxed line-clamp-2">{news.summary}</p>
                <div className="flex items-center gap-2 mt-2.5">
                  <span className="text-[#C9A84C]/70 text-xs bg-[#C9A84C]/10 px-2 py-0.5 rounded-full">{news.tag}</span>
                  <span className="text-[#8a7a6a] text-xs">{news.date}</span>
                  <span className="text-[#8a7a6a] text-xs">· {news.readTime}阅读</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#8a7a6a] flex-shrink-0 mt-1" />
            </div>
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  );
}
