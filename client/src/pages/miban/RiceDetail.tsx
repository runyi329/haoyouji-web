import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { Link, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Leaf, ShoppingCart, FlaskConical, Heart } from "lucide-react";

const GI_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  低: { bg: "#F0FAF4", text: "#2D7D46", label: "低 GI · 血糖友好" },
  中: { bg: "#FFF7F0", text: "#E07B39", label: "中 GI · 适量食用" },
  高: { bg: "#FFF0F0", text: "#C0392B", label: "高 GI · 注意控量" },
};
const LEVEL_MAP: Record<string, number> = { 低: 25, 中: 55, 高: 85 };

export default function RiceDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0");
  const { data: rice, isLoading } = mtrpc.rice.detail.useQuery({ id }, { enabled: !!id });

  if (isLoading) return (
    <div className="container py-8 max-w-2xl">
      <Skeleton className="h-6 w-32 mb-6" />
      <Skeleton className="h-48 rounded-2xl mb-4" />
    </div>
  );

  if (!rice) return (
    <div className="container py-16 text-center">
      <p className="text-muted-foreground">未找到该米种</p>
      <Link href="/p/proj_hzxm2t/rice"><Button variant="outline" className="mt-4 rounded-xl">返回百科</Button></Link>
    </div>
  );

  const tags: string[] = (() => { try { return JSON.parse(rice.healthTags as any ?? "[]"); } catch { return []; } })();
  const suitable: string[] = (() => { try { return JSON.parse(rice.suitableFor as any ?? "[]"); } catch { return []; } })();
  const giInfo = rice.sugarLevel ? GI_COLORS[rice.sugarLevel] : null;

  return (
    <main className="page-enter">
      <div className="container py-6 max-w-2xl">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-6">
          <Link href="/" className="hover:text-foreground transition-colors">首页</Link>
          <span>/</span>
          <Link href="/p/proj_hzxm2t/rice" className="hover:text-foreground transition-colors">米种百科</Link>
          <span>/</span>
          <span className="text-foreground">{rice.name}</span>
        </div>

        <div className="washi-card p-6 mb-4">
          <div className="flex items-start gap-5">
            <div className="w-20 h-20 rounded-2xl flex-shrink-0 shadow-md" style={{ backgroundColor: rice.colorHex ?? "#C8A87A" }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="font-serif text-2xl font-bold text-foreground">{rice.name}</h1>
                {rice.colorName && <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">{rice.colorName}</span>}
              </div>
              {rice.origin && <p className="text-muted-foreground text-sm flex items-center gap-1 mb-3"><Leaf className="w-3.5 h-3.5" />产地：{rice.origin}</p>}
              <div className="flex flex-wrap gap-1.5">
                {giInfo && <span className="tag-capsule text-xs" style={{ backgroundColor: giInfo.bg, color: giInfo.text }}>{giInfo.label}</span>}
                {tags.map((tag) => <span key={tag} className="tag-capsule bg-muted/80 text-muted-foreground text-xs">{tag}</span>)}
              </div>
            </div>
          </div>
          {rice.description && <p className="text-muted-foreground text-sm leading-relaxed mt-4 pt-4 border-t border-border/40">{rice.description}</p>}
        </div>

        <div className="washi-card p-5 mb-4">
          <h2 className="font-serif font-semibold text-foreground mb-4 flex items-center gap-2"><FlaskConical className="w-4 h-4 text-primary" />营养指标</h2>
          <div className="space-y-3">
            {[{ key: "fiberLevel", label: "膳食纤维", color: "#4A7C3F" }, { key: "proteinLevel", label: "蛋白质", color: "#7B5EA7" }].map(({ key, label, color }) => {
              const level = rice[key as keyof typeof rice] as string | null;
              const pct = level ? (LEVEL_MAP[level] ?? 50) : 0;
              return (
                <div key={key}>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>{label}</span><span style={{ color }}>{level ?? "—"}</span></div>
                  <div className="h-2 bg-muted/60 rounded-full overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} /></div>
                </div>
              );
            })}
            {rice.giValue && <div className="flex items-center justify-between text-sm pt-1"><span className="text-muted-foreground text-xs">GI 值</span><span className="font-semibold text-foreground">{rice.giValue}</span></div>}
          </div>
        </div>

        {suitable.length > 0 && (
          <div className="washi-card p-5 mb-4">
            <h2 className="font-serif font-semibold text-foreground mb-3 flex items-center gap-2"><Heart className="w-4 h-4 text-rose-500" />适合人群</h2>
            <div className="flex flex-wrap gap-2">{suitable.map((s) => <span key={s} className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 text-xs font-medium">{s}</span>)}</div>
          </div>
        )}

        <div className="washi-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-2xl font-bold text-primary">¥{Number(rice.pricePerJin).toFixed(1)}</span>
              <span className="text-muted-foreground text-sm ml-1">/斤</span>
              <p className="text-muted-foreground text-xs mt-0.5">10 斤起订，可与其他米种混搭</p>
            </div>
            <Link href={`/diy?add=${rice.id}`}>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl gap-2"><ShoppingCart className="w-4 h-4" />加入配方</Button>
            </Link>
          </div>
        </div>

        <div className="mt-4">
          <Link href="/p/proj_hzxm2t/rice"><Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5"><ArrowLeft className="w-3.5 h-3.5" />返回米种百科</Button></Link>
        </div>
      </div>
    </main>
  );
}
