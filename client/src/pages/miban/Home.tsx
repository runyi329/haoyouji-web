// @ts-nocheck
import { Link } from "wouter";
import { useRef, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { mtrpc, cosImg } from "./mibanTrpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { ShoppingCart, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useRiceFlyAnimation } from "@/hooks/useRiceFlyAnimation";

type RiceNutrition = {
  energy?: string | number;   // 热量 kcal/100g（旧字段，兼容硬编码）
  calories?: string | number; // 热量 kcal/100g（catalogList 返回字段）
  protein: string | number;   // 蛋白质 g
  fat: string | number;       // 脂肪 g
  carbs: string | number;     // 碳水 g
  fiber: string | number;     // 膳食纤维 g
  gi?: string | number;       // 升糖指数（可选）
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

// 实验室信息图 URL 映射（按米种名称匹配）- 存储于腾讯云 COS
const BASE = 'https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/lab';
const LAB_INFO_IMGS: Record<string, string> = {
  "粳米（东北大米）":   `${BASE}/01_jingmi.jpg`,
  "盘锦大米":           `${BASE}/02_panjin.jpg`,
  "籼米（南方长粒米）": `${BASE}/03_xianmi.jpg`,
  "泰国香米（茉莉香米）": `${BASE}/04_thaijasmine.jpg`,
  "泰国香米":            `${BASE}/04_thaijasmine.jpg`,
  "糯米（圆粒糯米）":   `${BASE}/05_nuomi.jpg`,
  "黑米":               `${BASE}/06_heimi.jpg`,
  "红米":               `${BASE}/07_hongmi.jpg`,
  "糙米":               `${BASE}/08_caomi.jpg`,
  "小米（粟米）":        `${BASE}/09_xiaomi.jpg`,
  "薏米（薏苡仁）":      `${BASE}/10_yimi.jpg`,
  "燕麦米":             `${BASE}/11_yanmai.jpg`,
  "荞麦米":             `${BASE}/12_qiaomai.jpg`,
  "高粱米":             `${BASE}/13_gaoliang.jpg`,
  "紫米（紫糯米）":      `${BASE}/14_zimi.jpg`,
  "绿豆":               `${BASE}/15_lvdou.jpg`,
  "红豆（赤小豆）":      `${BASE}/16_hongdou.jpg`,
  "莲子":               `${BASE}/17_lianzi.jpg`,
  "藜麦":               `${BASE}/18_limai.jpg`,
};

// 产品拆解图风格弹窗：有实验室信息图时展示图片，否则展示 SVG 标注图
function NutritionDrawer({ rice, onClose }: { rice: RiceType; onClose: () => void }) {
  const labImg = LAB_INFO_IMGS[rice.name];
  const energyVal = rice.nutrition.calories ?? rice.nutrition.energy;

  // SVG 画布尺寸
  const W = 400;
  const H = 420;
  const cx = W / 2;   // 中心 x
  const cy = H / 2;   // 中心 y
  const imgW = 130;   // 图片宽度
  const imgH = 130;   // 图片高度

  // 8 个标注项：上2、下2、左2、右2
  // 定义每个 callout 的起点（图片边缘）和终点（标注文字区）
  const items = [
    // 上左
    { label: "热量",      value: String(energyVal ?? "—"), unit: "kcal/100g",
      ox: cx - imgW * 0.3, oy: cy - imgH / 2,
      tx: 28, ty: 28, anchor: "start" as const },
    // 上右
    { label: "蛋白质",    value: String(rice.nutrition.protein ?? "—"), unit: "g/100g",
      ox: cx + imgW * 0.3, oy: cy - imgH / 2,
      tx: W - 28, ty: 28, anchor: "end" as const },
    // 左上
    { label: "碳水化合物", value: String(rice.nutrition.carbs ?? "—"), unit: "g/100g",
      ox: cx - imgW / 2, oy: cy - imgH * 0.2,
      tx: 28, ty: cy - 20, anchor: "start" as const },
    // 左下
    { label: "膳食纤维", value: String(rice.nutrition.fiber ?? "—"), unit: "g/100g",
      ox: cx - imgW / 2, oy: cy + imgH * 0.2,
      tx: 28, ty: cy + 50, anchor: "start" as const },
    // 右上
    { label: "脂肪",      value: String(rice.nutrition.fat ?? "—"), unit: "g/100g",
      ox: cx + imgW / 2, oy: cy - imgH * 0.2,
      tx: W - 28, ty: cy - 20, anchor: "end" as const },
    // 右下
    { label: rice.nutrition.gi ? "升糖指数 GI" : "产地",
      value: String(rice.nutrition.gi ?? rice.origin ?? "—"), unit: rice.nutrition.gi ? "" : "",
      ox: cx + imgW / 2, oy: cy + imgH * 0.2,
      tx: W - 28, ty: cy + 50, anchor: "end" as const },
    // 下左
    { label: "米种类型",   value: rice.tag || "—", unit: "",
      ox: cx - imgW * 0.3, oy: cy + imgH / 2,
      tx: 28, ty: H - 38, anchor: "start" as const },
    // 下右
    { label: "产地",      value: rice.origin || "—", unit: "",
      ox: cx + imgW * 0.3, oy: cy + imgH / 2,
      tx: W - 28, ty: H - 38, anchor: "end" as const },
  ];

  // 线条颜色列表（每条线不同颜色，丰富信息图感）
  const lineColors = [
    "#E8734A", "#4A90D9", "#6BBF59", "#C45AB3",
    "#F0B429", "#3DBFA8", "#E85D75", "#7B68EE",
  ];

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        style={{ backdropFilter: "blur(4px)" }}
        onClick={onClose}
      />
      {/* 弹窗居中 */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center px-3"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-[420px] rounded-2xl"
          style={{
            background: "#ffffff",
            animation: "scaleIn 200ms cubic-bezier(0.23,1,0.32,1) both",
            boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 transition-colors"
          >
            <span className="text-gray-400 text-[13px] leading-none">✕</span>
          </button>

          {/* 有实验室信息图时：展示全屏图片 */}
          {labImg ? (
            <img
              src={labImg}
              alt={rice.name}
              className="w-full rounded-2xl"
              style={{ display: "block", maxHeight: "80vh", objectFit: "contain" }}
            />
          ) : (
          <>
          {/* 米种名称和简介 */}
          <div className="pt-5 pb-1 px-5 text-center">
            <div className="text-[18px] font-bold text-gray-900 tracking-wide">{rice.name}</div>
            <div className="text-[11px] text-gray-400 mt-0.5">{rice.desc}</div>
          </div>

          {/* 产品拆解信息图 SVG */}
          <svg
            width="100%"
            viewBox={`0 0 ${W} ${H}`}
            style={{ display: "block" }}
          >
            {/* 淡灰色网格背景（信息图感） */}
            <defs>
              <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width={W} height={H} fill="url(#grid)" />

            {/* 每个 callout：将起点连到终点，再画标注文字 */}
            {items.map((item, i) => {
              const color = lineColors[i % lineColors.length];
              // 折线：起点 → 中间转折点 → 终点
              // 中间点：先垂直走到终点的 y，再水平走到终点的 x
              const mx = item.ox;
              const my = item.ty;
              const d = `M ${item.ox} ${item.oy} L ${mx} ${my} L ${item.tx} ${item.ty}`;
              // 标注文字 x：居左的在线段终点右边，居右的在左边
              const labelX = item.anchor === "start" ? item.tx + 4 : item.tx - 4;
              return (
                <g key={item.label}>
                  {/* 延伸线 */}
                  <path d={d} fill="none" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                  {/* 起点小圆点 */}
                  <circle cx={item.ox} cy={item.oy} r="2.5" fill={color} />
                  {/* 终点小圆点 */}
                  <circle cx={item.tx} cy={item.ty} r="1.8" fill={color} opacity="0.6" />
                  {/* 参数名 */}
                  <text
                    x={labelX}
                    y={item.ty - 7}
                    textAnchor={item.anchor}
                    fontSize="8"
                    fill="#999"
                    fontFamily="-apple-system, sans-serif"
                    letterSpacing="0.2"
                  >{item.label}</text>
                  {/* 数值 */}
                  <text
                    x={labelX}
                    y={item.ty + 5}
                    textAnchor={item.anchor}
                    fontSize="13"
                    fontWeight="700"
                    fill="#111"
                    fontFamily="-apple-system, sans-serif"
                  >{item.value}</text>
                  {/* 单位 */}
                  {item.unit && (
                    <text
                      x={labelX}
                      y={item.ty + 15}
                      textAnchor={item.anchor}
                      fontSize="7.5"
                      fill={color}
                      fontFamily="-apple-system, sans-serif"
                      opacity="0.8"
                    >{item.unit}</text>
                  )}
                </g>
              );
            })}

            {/* 中心图片（原图无裁剪） */}
            {rice.img ? (
              <image
                href={cosImg(rice.img, 160)}
                x={cx - imgW / 2}
                y={cy - imgH / 2}
                width={imgW}
                height={imgH}
                preserveAspectRatio="xMidYMid meet"
                style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.12))" }}
              />
            ) : (
              <rect
                x={cx - imgW / 2} y={cy - imgH / 2}
                width={imgW} height={imgH}
                rx="12" fill="#C8A87A" opacity="0.5"
              />
            )}

            {/* 每100g标注 */}
            <text x={cx} y={cy + imgH / 2 + 16} textAnchor="middle" fontSize="8" fill="#bbb" fontFamily="-apple-system, sans-serif">
              每 100g 可食部分
            </text>
          </svg>

          {/* 底部按钮 */}
          <div className="px-5 pb-5">
            <p className="text-[9px] text-gray-300 text-center mb-3">
              数据来源：中国食物成分表（第6版）· 仅供参考
            </p>
            <Link href="/p/proj_hzxm2t/encyclopedia">
              <button
                className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-gray-700 border border-gray-200 active:bg-gray-50 transition-colors"
                onClick={onClose}
              >
                查看完整百科 →
              </button>
            </Link>
          </div>
          </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.93); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
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

  // 从标准仓库动态加载米种数据
  const { data: catalogData, isLoading: catalogLoading } = mtrpc.rice.catalogList.useQuery(
    { onlyActive: true },
    { staleTime: 5 * 60 * 1000 } // 5分钟缓存
  );

  // 将 catalogList 返回的数据映射为 RiceType 格式，加载失败时回退到硬编码
  const riceList: RiceType[] = catalogData && catalogData.length > 0
    ? catalogData.map((r: any) => ({
        id: String(r.id),
        name: r.stdName,
        origin: r.origin ?? "",
        desc: r.description ?? "",
        tag: (r.tagsJson && r.tagsJson.length > 0) ? r.tagsJson[0] : (r.category ?? ""),
        img: r.img ?? "",
        nutrition: r.nutritionJson ?? { protein: 0, fat: 0, carbs: 0, fiber: 0 },
        categories: r.tagsJson ?? [],
        color: r.colorHex,
      }))
    : RICE_TYPES;

  const filteredRice = activeFilter === "全部"
    ? riceList
    : riceList.filter((r) => r.categories.includes(activeFilter));

  return (
    <div className="min-h-screen bg-white pb-20">

      {/* ── Hero 区 ──────────────────────────────────────── */}
      <section className="px-5 pt-8 pb-8">
        <p className="text-[11px] text-gray-400 tracking-widest uppercase mb-4 font-medium">
          精选产区 · 按需定配
        </p>
        <h1 className="text-[32px] font-bold text-black leading-[1.1] tracking-tight mb-8">
          我的饭碗我做主
        </h1>
        <Link href="/p/proj_hzxm2t/diy">
          <button
            className="w-full py-[15px] rounded-xl text-[15px] font-bold text-white tracking-wide active:scale-[0.98] transition-transform"
            style={{ background: "#FF6900" }}
          >
            点单
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
              精选 {riceList.length} 种优质米 · 点击查看营养成分
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
          {/* 加载骨架屏 */}
          {catalogLoading && (!catalogData || catalogData.length === 0) && (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-[110px]">
                <div className="w-[110px] h-[110px] rounded-2xl bg-gray-100 mb-2.5 animate-pulse" />
                <div className="h-3.5 w-16 bg-gray-100 rounded mb-1.5 animate-pulse" />
                <div className="h-2.5 w-12 bg-gray-100 rounded animate-pulse" />
              </div>
            ))
          )}
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
                  src={cosImg(rice.img, 110)}
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



      {/* ── 热门捞法 ─────────────────────────────────────── */}
      <section className="px-5 mb-8">
        <div className="mb-5 flex items-center justify-between">
          <div>

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
