// @ts-nocheck
import { Link } from "wouter";
import { useRef, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ShoppingCart, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useRiceFlyAnimation } from "@/hooks/useRiceFlyAnimation";

type RiceNutrition = {
  energy: string;   // 热量 kcal/100g
  protein: string;  // 蛋白质 g
  fat: string;      // 脂肪 g
  carbs: string;    // 碳水 g
  fiber: string;    // 膳食纤维 g
  gi: string;       // 升糖指数
};

type RiceType = {
  id: string;
  name: string;
  origin: string;
  desc: string;
  tag: string;
  img: string;
  nutrition: RiceNutrition;
  categories: string[];
};

const RICE_TYPES: RiceType[] = [
  {
    id: "white", name: "白米", origin: "黑龙江五常", desc: "软糯香甜，日常主食", tag: "软糯香甜",
    img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/rice_white_single.webp",
    nutrition: { energy: "346", protein: "7.4", fat: "0.8", carbs: "77.2", fiber: "0.6", gi: "83" },
    categories: ["软糯"],
  },
  {
    id: "black", name: "黑米", origin: "云南墨江", desc: "花青素丰富，补肾益气", tag: "高花青素",
    img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/rice_black_single.webp",
    nutrition: { energy: "333", protein: "9.4", fat: "2.5", carbs: "68.3", fiber: "3.9", gi: "55" },
    categories: ["高蛋白", "控糖"],
  },
  {
    id: "red", name: "红米", origin: "广西桂林", desc: "铁元素高，补血养颜", tag: "补血养颜",
    img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/rice_red_single.webp",
    nutrition: { energy: "335", protein: "8.0", fat: "1.0", carbs: "73.0", fiber: "2.0", gi: "55" },
    categories: ["控糖", "养颜"],
  },
  {
    id: "brown", name: "糙米", origin: "东北黑土地", desc: "膳食纤维高，控糖减脂", tag: "低脂健康",
    img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/rice_brown_single.webp",
    nutrition: { energy: "357", protein: "7.9", fat: "2.0", carbs: "75.1", fiber: "3.4", gi: "56" },
    categories: ["低脂", "控糖"],
  },
  {
    id: "purple", name: "紫米", origin: "云南元阳", desc: "花青素+铁，美容养颜", tag: "美容养颜",
    img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/rice_purple_single.webp",
    nutrition: { energy: "343", protein: "8.3", fat: "1.7", carbs: "72.2", fiber: "1.4", gi: "54" },
    categories: ["养颜", "控糖"],
  },
  {
    id: "millet", name: "小米", origin: "山西沁州", desc: "健脾养胃，易消化", tag: "养胃易消化",
    img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/rice_millet_single.webp",
    nutrition: { energy: "361", protein: "9.0", fat: "3.1", carbs: "73.5", fiber: "1.6", gi: "71" },
    categories: ["软糯", "养胃"],
  },
  {
    id: "mung", name: "绿豆", origin: "河南安阳", desc: "清热解毒，消暑降火", tag: "清热消暑",
    img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/rice_mung_single.webp",
    nutrition: { energy: "316", protein: "21.6", fat: "0.8", carbs: "55.6", fiber: "6.4", gi: "31" },
    categories: ["高蛋白", "低脂", "控糖"],
  },
  {
    id: "coix", name: "薏米", origin: "贵州兴仁", desc: "祛湿健脾，美白消肿", tag: "祛湿美白",
    img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/rice_coix_single.webp",
    nutrition: { energy: "357", protein: "12.8", fat: "3.3", carbs: "69.1", fiber: "2.0", gi: "25" },
    categories: ["高蛋白", "低脂", "养胃"],
  },
];

const SCENE_PRESETS = [
  { label: "糖友配方", tag: "控糖", desc: "低GI组合，稳定血糖", href: "/diy" },
  { label: "减脂配方", tag: "减脂", desc: "高纤维，增加饱腹感", href: "/diy" },
  { label: "孕期配方", tag: "孕期", desc: "叶酸+铁，全面营养",  href: "/diy" },
  { label: "补血配方", tag: "补血", desc: "铁元素丰富，气色红润", href: "/diy" },
];

// 营养成分详情抽屉（底部弹出）
function NutritionDrawer({ rice, onClose }: { rice: RiceType; onClose: () => void }) {
  const rows = [
    { label: "热量",     value: rice.nutrition.energy,  unit: "kcal" },
    { label: "蛋白质",   value: rice.nutrition.protein,  unit: "g" },
    { label: "脂肪",     value: rice.nutrition.fat,      unit: "g" },
    { label: "碳水化合物", value: rice.nutrition.carbs,  unit: "g" },
    { label: "膳食纤维", value: rice.nutrition.fiber,    unit: "g" },
    { label: "升糖指数 GI", value: rice.nutrition.gi,   unit: "" },
  ];

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        style={{ backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      {/* 面板 */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl"
        style={{
          animation: "slideUp 240ms cubic-bezier(0.23,1,0.32,1) both",
          maxHeight: "80vh",
          overflowY: "auto",
        }}
      >
        {/* 顶部把手 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="px-6 pb-10">
          {/* 米种信息头 */}
          <div className="flex items-center gap-4 py-5 border-b border-gray-100">
            <div className="w-16 h-16 rounded-2xl bg-[#F7F7F7] overflow-hidden flex-shrink-0">
              <img src={rice.img} alt={rice.name} className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[18px] font-bold text-black">{rice.name}</span>
                <span className="text-[9px] border border-gray-200 rounded px-1.5 py-[2px] text-gray-500 font-medium tracking-wide">
                  {rice.tag}
                </span>
              </div>
              <p className="text-[11px] text-gray-400">{rice.desc}</p>
              <p className="text-[10px] text-gray-300 mt-0.5">产地：{rice.origin}</p>
            </div>
          </div>

          {/* 营养成分表标题 */}
          <div className="flex items-center justify-between mt-5 mb-4">
            <span className="text-[13px] font-bold text-black tracking-wide">营养成分表</span>
            <span className="text-[10px] text-gray-400">每 100g 可食部分</span>
          </div>

          {/* 成分行 */}
          <div className="space-y-0">
            {rows.map((row, i) => (
              <div
                key={row.label}
                className={`flex items-center justify-between py-3 ${
                  i < rows.length - 1 ? "border-b border-gray-50" : ""
                }`}
              >
                <span className="text-[13px] text-gray-600">{row.label}</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-[18px] font-bold text-black tabular-nums">{row.value}</span>
                  {row.unit && (
                    <span className="text-[10px] text-gray-400">{row.unit}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 底部说明 */}
          <p className="text-[10px] text-gray-300 mt-5 leading-relaxed">
            数据来源：中国食物成分表（第6版）。实际营养成分因产地、品种、加工方式略有差异，仅供参考。
          </p>

          {/* 进入百科 */}
          <Link href="/p/proj_hzxm2t/encyclopedia">
            <button
              className="w-full mt-5 py-3 rounded-xl border border-black text-[13px] font-semibold text-black active:bg-gray-50 transition-colors"
              onClick={onClose}
            >
              查看完整百科 →
            </button>
          </Link>
        </div>
      </div>
    </>
  );
}

// 数字滚动动画
function CountUp({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const duration = 1200;
          const start = performance.now();
          const tick = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(ease * target));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return <span ref={ref}>{count}{suffix}</span>;
}

const FILTER_TAGS = ["全部", "软糯", "低脂", "高蛋白", "控糖", "养颜", "养胃"];

// 配方抽屉组件
function RecipeDrawer({ onClose }: { onClose: () => void }) {
  const { isAuthenticated } = useAuth();
  const { data: recipes, isLoading, refetch } = mtrpc.recipe.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const deleteMutation = mtrpc.recipe.delete.useMutation({
    onSuccess: () => { toast.success("配方已删除"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        style={{ backdropFilter: "blur(2px)" }}
        onClick={onClose}
      />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl"
        style={{ animation: "slideUp 240ms cubic-bezier(0.23,1,0.32,1) both", maxHeight: "75vh", overflowY: "auto" }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>
        <div className="px-5 pb-10">
          <div className="flex items-center justify-between py-4 border-b border-gray-100">
            <div>
              <h2 className="text-[18px] font-bold text-black">我的配方</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">已保存的个性化米种配方</p>
            </div>
            <Link href="/p/proj_hzxm2t/my-recipes">
              <span className="text-[12px] text-gray-400 active:opacity-60 transition-opacity" onClick={onClose}>
                全部 ›
              </span>
            </Link>
          </div>
          {!isAuthenticated ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-black flex items-center justify-center mb-4">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <p className="text-[13px] text-gray-400">登录后查看您保存的配方</p>
            </div>
          ) : isLoading ? (
            <div className="py-8 text-center text-[13px] text-gray-400">加载中…</div>
          ) : !recipes?.length ? (
            <div className="flex flex-col items-center py-10 text-center">
              <BookOpen className="w-10 h-10 mb-3 text-gray-200" />
              <p className="text-[13px] text-gray-400 mb-5">还没有保存任何配方</p>
              <Link href="/p/proj_hzxm2t/diy">
                <button
                  className="px-6 py-3 rounded-xl text-[13px] font-semibold text-white active:scale-95 transition-transform"
                  style={{ background: "#FF6900" }}
                  onClick={onClose}
                >
                  去捐米工坊创建
                </button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3 pt-4">
              {recipes.slice(0, 5).map((recipe) => {
                const ingredients: any[] = (() => {
                  try { return JSON.parse(recipe.ingredients as any ?? "[]"); }
                  catch { return []; }
                })();
                return (
                  <div key={recipe.id} className="border border-gray-100 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <h3 className="text-[14px] font-bold text-black">{recipe.name}</h3>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {new Date(recipe.createdAt).toLocaleDateString("zh-CN")} 保存
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Link href={`/diy?recipe=${recipe.id}`}>
                          <button
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white active:scale-95 transition-transform"
                            style={{ background: "#FF6900" }}
                            onClick={onClose}
                          >
                            <ShoppingCart className="w-3 h-3" />
                            再次购买
                          </button>
                        </Link>
                        <button
                          onClick={() => deleteMutation.mutate({ id: recipe.id })}
                          className="p-1.5 text-gray-300 active:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {ingredients.length > 0 && (
                      <>
                        <div className="h-2 rounded-full overflow-hidden flex mb-2">
                          {ingredients.map((ing: any, i: number) => (
                            <div key={i} style={{ width: `${ing.percentage}%`, backgroundColor: ing.colorHex ?? "#C8A87A" }} />
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {ingredients.map((ing: any, i: number) => (
                            <span key={i} className="flex items-center gap-1 text-[10px] text-gray-400">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ing.colorHex ?? "#C8A87A" }} />
                              {ing.name} {ing.percentage}%
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                    {recipe.totalPricePerJin && (
                      <p className="text-[13px] font-bold mt-2" style={{ color: "#FF6900" }}>
                        ¥{Number(recipe.totalPricePerJin).toFixed(2)}<span className="text-[10px] font-normal text-gray-400">/斤</span>
                      </p>
                    )}
                  </div>
                );
              })}
              {(recipes.length ?? 0) > 5 && (
                <Link href="/p/proj_hzxm2t/my-recipes">
                  <div className="text-center py-3 text-[12px] text-gray-400 active:opacity-60 transition-opacity" onClick={onClose}>
                    查看全部 {recipes.length} 个配方 ›
                  </div>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [activeRice, setActiveRice] = useState<RiceType | null>(null);
  const [activeFilter, setActiveFilter] = useState("全部");
  const [showRecipes, setShowRecipes] = useState(false);
  const bowlBtnRef = useRef<HTMLButtonElement>(null);
  const { flyToTarget } = useRiceFlyAnimation();

  const { data: recipes } = mtrpc.recipe.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );
  const recipeCount = recipes?.length ?? 0;

  const filteredRice = activeFilter === "全部"
    ? RICE_TYPES
    : RICE_TYPES.filter((r) => r.categories.includes(activeFilter));

  return (
    <div className="min-h-screen bg-white pb-20">

      {/* ── Hero 区 ──────────────────────────────────────── */}
      <section className="px-5 pt-8 pb-8">
        <p className="text-[11px] text-gray-400 tracking-widest uppercase mb-4 font-medium">
          精选产区 · 按需定配
        </p>
        <h1 className="text-[32px] font-bold text-black leading-[1.1] tracking-tight mb-2">
          我的米饭，<br />我做主
        </h1>
        <p className="text-[13px] text-gray-400 mb-8 leading-relaxed">
          从百种好米里，捞出你的那一锅
        </p>
        <Link href="/p/proj_hzxm2t/diy">
          <button
            className="w-full py-[15px] rounded-xl text-[15px] font-bold text-white tracking-wide active:scale-[0.98] transition-transform"
            style={{ background: "#FF6900" }}
          >
            开始捞米
          </button>
        </Link>
      </section>

      {/* ── 分割线 ───────────────────────────────────────── */}
      <div className="h-px bg-gray-100 mx-5" />

      {/* ── 米库展示 ─────────────────────────────────────── */}
      <section className="pt-7 pb-8">
        <div className="px-5 mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-bold text-black">米库</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              精选 {RICE_TYPES.length} 种优质米 · 点击查看营养成分
            </p>
          </div>
          <Link href="/p/proj_hzxm2t/encyclopedia">
            <span className="text-[12px] text-gray-400 flex items-center gap-0.5">
              全部 <span className="text-[10px]">›</span>
            </span>
          </Link>
        </div>

        {/* 分类筛选标签栏 */}
        <div
          className="flex gap-2 overflow-x-auto px-5 pb-4"
          style={{ scrollbarWidth: "none" }}
        >
          {FILTER_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveFilter(tag)}
              className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all duration-200"
              style={{
                background: activeFilter === tag ? "#111" : "#F5F5F5",
                color: activeFilter === tag ? "#fff" : "#666",
              }}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* 横向滚动 */}
        <div
          className="flex gap-3 overflow-x-auto px-5 pb-1"
          style={{ scrollSnapType: "x mandatory", scrollbarWidth: "none" }}
        >
          {filteredRice.map((rice) => (
            <div
              key={rice.id}
              className="flex-shrink-0 w-[110px] cursor-pointer"
              style={{ scrollSnapAlign: "start" }}
              onClick={() => setActiveRice(rice)}
            >
              {/* 图片容器 */}
              <div
                className="w-[110px] h-[110px] rounded-2xl bg-[#F7F7F7] overflow-hidden mb-2.5 transition-all duration-200 active:scale-95"
              >
                <img
                  src={rice.img}
                  alt={rice.name}
                  className="w-full h-full object-cover"
                />
              </div>
              {/* 文字信息 */}
              <p className="text-[14px] font-semibold text-black mb-1">{rice.name}</p>
              {/* 专业标签 */}
              <div className="inline-block border border-gray-200 rounded px-1.5 py-[2px] mb-1.5">
                <span className="text-[9px] text-gray-500 tracking-wide font-medium">{rice.tag}</span>
              </div>
              <p className="text-[9px] text-gray-300 leading-tight">{rice.origin}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 数字背书 ─────────────────────────────────────── */}
      <section className="mx-5 mb-8">
        <div className="rounded-2xl bg-black px-6 py-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-[28px] font-bold text-white leading-none mb-1.5">
                <CountUp target={12} suffix="+" />
              </div>
              <div className="text-[10px] text-gray-500">优质产区</div>
            </div>
            <div className="border-x border-gray-800">
              <div className="text-[28px] font-bold text-white leading-none mb-1.5">
                <CountUp target={8} />
              </div>
              <div className="text-[10px] text-gray-500">米种品类</div>
            </div>
            <div>
              <div className="text-[28px] font-bold leading-none mb-1.5" style={{ color: "#FF6900" }}>
                ∞
              </div>
              <div className="text-[10px] text-gray-500">定制组合</div>
            </div>
          </div>
          <div className="h-px bg-gray-800 my-4" />
          <p className="text-center text-[11px] text-gray-600 tracking-wide">
            按需定配 · 新鲜发货 · 健康有据
          </p>
        </div>
      </section>

      {/* ── 热门捞法 ─────────────────────────────────────── */}
      <section className="px-5 mb-8">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-bold text-black">热门捞法</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">一键直达场景配方</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {SCENE_PRESETS.map((scene) => (
            <Link key={scene.label} href={scene.href}>
              <div className="rounded-2xl border border-gray-100 p-4 active:bg-gray-50 transition-colors cursor-pointer">
                <div className="inline-block text-[9px] font-semibold text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full mb-3 tracking-wide">
                  {scene.tag}
                </div>
                <div className="text-[15px] font-bold text-black mb-1">{scene.label}</div>
                <div className="text-[11px] text-gray-400 leading-tight">{scene.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── 品牌理念 ─────────────────────────────────────── */}
      <section className="px-5 mb-4">
        <div className="rounded-2xl bg-[#F7F7F7] px-5 py-5">
          <p className="text-[13px] font-semibold text-black mb-1.5">
            好米从产地来，健康从选择开始
          </p>
          <p className="text-[12px] text-gray-400 leading-relaxed mb-4">
            每一种米都有它的故事。精选全国优质产区，让你吃到的每一口都有来源、有依据。
          </p>
          <Link href="/p/proj_hzxm2t/encyclopedia">
            <span className="text-[12px] font-semibold text-black flex items-center gap-1 active:opacity-60 transition-opacity">
              了解每种米的故事 <span className="text-[10px]">→</span>
            </span>
          </Link>
        </div>
      </section>

      {/* ── 营养成分抽屉 ─────────────────────────────────── */}
      {activeRice && (
        <NutritionDrawer rice={activeRice} onClose={() => setActiveRice(null)} />
      )}

      {/* ── 悬浮「我的配方」小碗图标 ────────────────────── */}
      <button
        ref={bowlBtnRef}
        onClick={() => setShowRecipes(true)}
        className="fixed right-5 z-30 flex items-center justify-center active:scale-95 transition-transform"
        style={{
          bottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))",
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "#111",
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
        }}
        aria-label="我的配方"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M4 9h16a1 1 0 0 1 .97 1.24l-1.6 6.4A2 2 0 0 1 17.44 18H6.56a2 2 0 0 1-1.93-1.36L3.03 10.24A1 1 0 0 1 4 9z" fill="white" opacity="0.9"/>
          <ellipse cx="12" cy="9" rx="8" ry="2.5" fill="white"/>
          <path d="M9 6.5 Q12 4 15 6.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.6"/>
        </svg>
        {recipeCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center text-[10px] font-bold text-white"
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#FF6900",
              border: "2px solid white",
            }}
          >
            {recipeCount > 9 ? "9+" : recipeCount}
          </span>
        )}
      </button>

      {/* ── 配方列表抽屉 ────────────────────────────────── */}
      {showRecipes && (
        <RecipeDrawer onClose={() => setShowRecipes(false)} />
      )}

    </div>
  );
}
