// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Wheat, ArrowRight, Leaf } from "lucide-react";

const CATEGORIES = [
  { value: "", label: "全部" },
  { value: "粳米/籼米", label: "粳米/籼米" },
  { value: "有色米", label: "有色米" },
  { value: "杂粮谷物", label: "杂粮谷物" },
  { value: "豆类", label: "豆类" },
  { value: "功能米", label: "功能米" },
  { value: "特色米", label: "特色米" },
];

const GI_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  低: { bg: "#F5F5F5", text: "#333333", label: "低 GI" },
  中: { bg: "#EBEBEB", text: "#555555", label: "中 GI" },
  高: { bg: "#E0E0E0", text: "#222222", label: "高 GI" },
};

export default function RiceEncyclopedia() {
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");

  const { data: riceList, isLoading } = mtrpc.rice.list.useQuery(
    { category: category || undefined },
    { staleTime: 60_000 }
  );

  const filtered = riceList?.filter((r) =>
    !search || r.name.includes(search) || (r.origin ?? "").includes(search)
  ) ?? [];

  return (
    <main className="page-enter">
      <section className="bg-white border-b border-border/40">
        <div className="container py-10">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-3">
            <Link href="/" className="hover:text-foreground transition-colors">首页</Link>
            <span>/</span>
            <span className="text-foreground">米粒</span>
          </div>
          <h1 className="font-serif text-3xl font-bold text-foreground mb-2">米粒</h1>
          <p className="text-muted-foreground text-sm">我的盘中餐，粒粒皆精选</p>
        </div>
      </section>

      <div className="container py-8">
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="搜索米种名称、产地..." className="pl-9 rounded-xl border-border/60" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            {CATEGORIES.map((c) => (
              <button key={c.value} onClick={() => setCategory(c.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${category === c.value ? "bg-black text-white" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Wheat className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>没有找到相关米种</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filtered.map((rice) => {
              const tags: string[] = (() => { try { return JSON.parse(rice.healthTags as any ?? "[]"); } catch { return []; } })();
              const giInfo = rice.sugarLevel ? GI_COLORS[rice.sugarLevel] : null;
              return (
                <Link key={rice.id} href={`/rice/${rice.id}`}>
                  <div className="washi-card p-4 cursor-pointer group h-full flex flex-col">
                    <div className="w-10 h-10 rounded-full mb-3 flex-shrink-0 shadow-sm" style={{ backgroundColor: rice.colorHex ?? "#C8A87A" }} />
                    <div className="flex-1">
                      <h3 className="font-serif font-semibold text-sm text-foreground mb-0.5 group-hover:text-black transition-colors">{rice.name}</h3>
                      {rice.origin && <p className="text-muted-foreground text-xs mb-2 flex items-center gap-1"><Leaf className="w-2.5 h-2.5" />{rice.origin}</p>}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {giInfo && <span className="tag-capsule text-[10px]" style={{ backgroundColor: giInfo.bg, color: giInfo.text }}>{giInfo.label}</span>}
                        {tags.slice(0, 2).map((tag) => <span key={tag} className="tag-capsule bg-muted/80 text-muted-foreground text-[10px]">{tag}</span>)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/40">
                      <span className="text-primary font-semibold text-sm">¥{Number(rice.pricePerJin).toFixed(1)}<span className="text-xs font-normal text-muted-foreground">/斤</span></span>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-black transition-colors" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
