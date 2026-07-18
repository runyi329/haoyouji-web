// @ts-nocheck
import { useState } from "react";
import { mtrpc, cosImg } from "./mibanTrpc";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Wheat, ArrowRight, Leaf } from "lucide-react";

// 标准仓库的大类分类
const CATEGORIES = [
  { value: "", label: "全部" },
  { value: "粳米", label: "粳米" },
  { value: "籼米", label: "籼米" },
  { value: "糯米", label: "糯米" },
  { value: "特种米", label: "特种米" },
  { value: "杂粮", label: "杂粮" },
];

export default function RiceEncyclopedia() {
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");

  // 改用标准仓库接口（catalogList），与首页和配米工坊保持一致
  const { data: catalogList, isLoading } = mtrpc.rice.catalogList.useQuery(
    { onlyActive: true },
    { staleTime: 60_000 }
  );

  // 按分类和搜索词过滤
  const filtered = (catalogList ?? []).filter((r: any) => {
    const matchCategory = !category || r.category === category;
    const matchSearch = !search
      || r.stdName.includes(search)
      || (r.origin ?? "").includes(search)
      || (r.description ?? "").includes(search);
    return matchCategory && matchSearch;
  });

  return (
    <main className="page-enter">
      <section className="bg-white border-b border-border/40">
        <div className="container py-8">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-3">
            <Link href="/" className="hover:text-foreground transition-colors">首页</Link>
            <span>/</span>
            <span className="text-foreground">米粒百科</span>
          </div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">米粒百科</h1>
          <p className="text-muted-foreground text-sm">精选 {catalogList?.length ?? 0} 种优质米 · 粒粒皆精选</p>
        </div>
      </section>

      <div className="container py-6">
        {/* 搜索和分类筛选 */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="搜索米种名称、产地..."
              className="pl-9 rounded-xl border-border/60"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                  category === c.value ? "bg-black text-white" : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* 米种列表 */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Wheat className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>没有找到相关米种</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filtered.map((rice: any) => {
              const tags: string[] = Array.isArray(rice.tagsJson) ? rice.tagsJson : [];
              const nutrition = rice.nutritionJson;
              return (
                <div key={rice.id} className="washi-card p-4 cursor-pointer group h-full flex flex-col">
                  {/* 米种图片或色块 */}
                  {rice.img ? (
                    <div className="w-10 h-10 rounded-full mb-3 flex-shrink-0 overflow-hidden shadow-sm">
                      <img src={cosImg(rice.img, 40)} alt={rice.stdName} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full mb-3 flex-shrink-0 shadow-sm"
                      style={{ backgroundColor: rice.colorHex ?? "#C8A87A" }}
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="font-serif font-semibold text-sm text-foreground mb-0.5 group-hover:text-black transition-colors">
                      {rice.stdName}
                    </h3>
                    {rice.origin && (
                      <p className="text-muted-foreground text-xs mb-2 flex items-center gap-1">
                        <Leaf className="w-2.5 h-2.5" />
                        {rice.origin}
                      </p>
                    )}
                    {/* 标签 */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      {rice.category && (
                        <span className="tag-capsule bg-muted/80 text-muted-foreground text-[10px]">
                          {rice.category}
                        </span>
                      )}
                      {tags.slice(0, 2).map((tag: string) => (
                        <span key={tag} className="tag-capsule bg-muted/80 text-muted-foreground text-[10px]">
                          {tag}
                        </span>
                      ))}
                    </div>
                    {/* 营养摘要 */}
                    {nutrition && (
                      <p className="text-[10px] text-muted-foreground">
                        热量 {nutrition.calories ?? nutrition.energy ?? "—"} kcal · 蛋白质 {nutrition.protein ?? "—"} g
                      </p>
                    )}
                  </div>
                  {/* 底部描述 */}
                  {rice.description && (
                    <div className="mt-auto pt-2 border-t border-border/40">
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {rice.description}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
