import { useState, useCallback, useRef, useEffect } from "react";

// 数字滚动动画组件
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    setAnimKey((k) => k + 1);
    setDisplay(value);
  }, [value]);

  return (
    <span
      key={animKey}
      className="inline-block"
      style={{
        animation: "numFlip 0.28s cubic-bezier(0.23,1,0.32,1) both",
      }}
    >
      {display}
    </span>
  );
}
import { useAuth } from "@/_core/hooks/useAuth";
import { Check, Minus, Plus, ChevronRight, ChevronLeft, Shuffle, Sliders, Share2, X, Download, Sparkles, Loader2, ShoppingCart } from "lucide-react";
import html2canvas from "html2canvas";
import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { useRiceFlyAnimation } from "@/hooks/useRiceFlyAnimation";

const RICE_TYPES = [
  { id: "white",  name: "白米",  desc: "软糯香甜，日常主食",   price: 4.8,  color: "#C8A87A", img: "/manus-storage/white_rice_290ef5af.png" },
  { id: "black",  name: "黑米",  desc: "花青素丰富，补肾益气", price: 8.5,  color: "#2D1B2E", img: "/manus-storage/black_rice_aacf90c2.png" },
  { id: "red",    name: "红米",  desc: "铁元素高，补血养颜",   price: 7.2,  color: "#8B2020", img: "/manus-storage/red_rice_fbe3b732.png" },
  { id: "brown",  name: "糙米",  desc: "膳食纤维高，控糖减脂", price: 6.0,  color: "#A0785A", img: "/manus-storage/brown_rice_4b147313.png" },
  { id: "purple", name: "紫米",  desc: "花青素+铁，美容养颜",  price: 9.0,  color: "#4A2060", img: "/manus-storage/purple_rice_b90b4fbe.png" },
  { id: "millet", name: "小米",  desc: "健脾养胃，易消化",     price: 5.5,  color: "#E8C840", img: "/manus-storage/millet_9aa25ec5.png" },
  { id: "mung",   name: "绿豆",  desc: "清热解毒，消暑降火",   price: 10.0, color: "#4A7C3F", img: "/manus-storage/mung_bean_65d6bcf5.png" },
  { id: "coix",   name: "薏米",  desc: "祛湿消肿，美白润肤",   price: 12.0, color: "#C4956A", img: "/manus-storage/coix_91ca3c03.png" },
];

// 各米种营养数据（每100g干米）
const RICE_NUTRITION: Record<string, { kcal: number; carb: number; protein: number; fat: number; fiber: number }> = {
  white:  { kcal: 346, carb: 77.2, protein: 7.4, fat: 0.8, fiber: 0.7 },
  black:  { kcal: 333, carb: 68.3, protein: 9.4, fat: 2.5, fiber: 3.9 },
  red:    { kcal: 336, carb: 72.2, protein: 8.3, fat: 1.0, fiber: 2.0 },
  brown:  { kcal: 348, carb: 73.1, protein: 7.9, fat: 2.7, fiber: 3.4 },
  purple: { kcal: 343, carb: 71.1, protein: 8.3, fat: 1.7, fiber: 1.4 },
  millet: { kcal: 358, carb: 73.5, protein: 9.0, fat: 3.1, fiber: 1.6 },
  mung:   { kcal: 316, carb: 55.6, protein: 21.6, fat: 0.8, fiber: 6.4 },
  coix:   { kcal: 357, carb: 69.1, protein: 12.8, fat: 3.3, fiber: 2.0 },
};

const STEP_LABELS = ["选重量", "选米种", "调比例", "确认下单"];

function RiceBowl({ ratios, size = 140 }: { ratios: { id: string; pct: number }[]; size?: number }) {
  const r = size * 0.43;
  const cx = size / 2;
  const cy = size / 2;
  const active = ratios.filter((x) => x.pct > 0);
  if (active.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <div className="rounded-full border-4 border-dashed border-gray-200 flex items-center justify-center" style={{ width: size, height: size }}>
          <span className="text-[11px] text-gray-300">待配米</span>
        </div>
      </div>
    );
  }
  const segments: React.ReactNode[] = [];
  let startAngle = -90;
  active.forEach((item) => {
    const rice = RICE_TYPES.find((r) => r.id === item.id);
    if (!rice) return;
    const angle = (item.pct / 100) * 360;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos((startAngle * Math.PI) / 180);
    const y1 = cy + r * Math.sin((startAngle * Math.PI) / 180);
    const x2 = cx + r * Math.cos((endAngle * Math.PI) / 180);
    const y2 = cy + r * Math.sin((endAngle * Math.PI) / 180);
    const largeArc = angle > 180 ? 1 : 0;
    segments.push(
      <path key={item.id} d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`} fill={rice.color} opacity={0.9} />
    );
    startAngle = endAngle;
  });
  return (
    <svg width={size} height={size} style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.15))" }}>
      <circle cx={cx} cy={cy} r={r + 4} fill="white" />
      {segments}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="white" strokeWidth={3} />
      <circle cx={cx} cy={cy} r={size * 0.13} fill="white" />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={size * 0.07} fill="#666">配方</text>
    </svg>
  );
}

function RecipePoster({ recipeName, weight, selected, ratios, totalPrice }: {
  recipeName: string; weight: number; selected: string[]; ratios: Record<string, number>; totalPrice: number;
}) {
  const selRices = RICE_TYPES.filter((r) => selected.includes(r.id));
  const ratioList = selected.map((id) => ({ id, pct: ratios[id] ?? 0 }));
  return (
    <div style={{ background: "#0A0A0A", borderRadius: 24, padding: 28, width: "100%", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "#FF6900", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "white", fontSize: 14, fontWeight: 700 }}>米</span>
        </div>
        <span style={{ color: "white", fontSize: 16, fontWeight: 700 }}>米伴 · 专属配方</span>
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
        <RiceBowl ratios={ratioList} size={160} />
      </div>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ color: "white", fontSize: 22, fontWeight: 700 }}>{recipeName || "我的专属米"}</div>
        <div style={{ color: "#FF6900", fontSize: 28, fontWeight: 700, marginTop: 4 }}>¥{totalPrice.toFixed(1)}</div>
        <div style={{ color: "#666", fontSize: 12, marginTop: 2 }}>{weight}斤 · {selected.length}种米</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 20 }}>
        {selRices.map((rice) => (
          <div key={rice.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: "4px 12px" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: rice.color }} />
            <span style={{ color: "white", fontSize: 12 }}>{rice.name} {ratios[rice.id] ?? 0}%</span>
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16, textAlign: "center" }}>
        <div style={{ color: "#444", fontSize: 11 }}>mibanrice.com · 为你的健康，定制一碗好米</div>
      </div>
    </div>
  );
}

// AI 配比分享海报组件
function AiRatioPoster({ ratios, reason, preferences, purpose }: {
  ratios: Record<string, number>;
  reason: string;
  preferences: string[];
  purpose: "rice" | "porridge";
}) {
  const purposeLabel = purpose === "porridge" ? "煮粥" : "蒸饭";
  const selRices = RICE_TYPES.filter(r => r.id in ratios);
  const sortedRatios = Object.entries(ratios).sort((a, b) => b[1] - a[1]);
  return (
    <div style={{ background: "linear-gradient(145deg,#0A0A0A 0%,#1a1208 100%)", borderRadius: 24, padding: 28, width: "100%", fontFamily: "sans-serif", boxSizing: "border-box" }}>
      {/* 顶部品牌 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "#FF6900", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ color: "white", fontSize: 14, fontWeight: 700 }}>米</span>
        </div>
        <span style={{ color: "white", fontSize: 16, fontWeight: 700 }}>米伴 · AI 智能配比</span>
        <span style={{ marginLeft: "auto", background: "rgba(255,105,0,0.15)", border: "1px solid rgba(255,105,0,0.4)", borderRadius: 20, padding: "2px 10px", color: "#FF6900", fontSize: 11 }}>
          {purposeLabel}
        </span>
      </div>
      {/* 饼图可视化 */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <div style={{ position: "relative", width: 100, height: 100 }}>
          <svg viewBox="0 0 36 36" style={{ width: 100, height: 100, transform: "rotate(-90deg)" }}>
            {(() => {
              let offset = 0;
              return sortedRatios.map(([id, pct], i) => {
                const rice = RICE_TYPES.find(r => r.id === id);
                const color = rice?.color ?? "#ccc";
                const dash = (pct / 100) * 100;
                const el = (
                  <circle key={id} cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3.6"
                    strokeDasharray={`${dash} ${100 - dash}`} strokeDashoffset={-offset} />
                );
                offset += dash;
                return el;
              });
            })()}
          </svg>
        </div>
      </div>
      {/* 配比标签 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 16 }}>
        {sortedRatios.map(([id, pct]) => {
          const rice = RICE_TYPES.find(r => r.id === id);
          if (!rice) return null;
          return (
            <div key={id} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.07)", borderRadius: 20, padding: "4px 10px", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: rice.color }} />
              <span style={{ color: "white", fontSize: 12 }}>{rice.name}</span>
              <span style={{ color: "#FF6900", fontSize: 12, fontWeight: 700 }}>{pct}%</span>
            </div>
          );
        })}
      </div>
      {/* 口感偏好 */}
      {preferences.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center", marginBottom: 14 }}>
          {preferences.map(p => (
            <span key={p} style={{ background: "rgba(255,105,0,0.15)", border: "1px solid rgba(255,105,0,0.35)", borderRadius: 20, padding: "2px 9px", color: "#FF9500", fontSize: 11 }}>{p}</span>
          ))}
        </div>
      )}
      {/* 推荐理由 */}
      <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "10px 14px", marginBottom: 16 }}>
        <div style={{ color: "#FF6900", fontSize: 11, marginBottom: 4 }}>✦ AI 推荐理由</div>
        <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, lineHeight: 1.6 }}>{reason}</div>
      </div>
      {/* 底部 */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12, textAlign: "center" }}>
        <div style={{ color: "#444", fontSize: 11 }}>mibanrice.com · 按需定配 · 新鲜发货 · 健康有据</div>
      </div>
    </div>
  );
}

// 新鲜度状态
function freshnessLevel(days: number) {
  if (days <= 30) return { level: "fresh", color: "text-emerald-500", badge: "新鲜", bgClass: "bg-emerald-50", textClass: "text-emerald-700", tip: "30天内吃完，新鲜正好" };
  if (days <= 45) return { level: "ok", color: "text-amber-500", badge: "△ 适量", bgClass: "bg-amber-50", textClass: "text-amber-700", tip: "稍多，建议适量购买" };
  return { level: "warn", color: "text-red-400", badge: "! 偏多", bgClass: "bg-red-50", textClass: "text-red-600", tip: "超过45天，建议减少购买量" };
}

export default function DiyWorkshop() {
  const { isAuthenticated } = useAuth();
  const [step, setStep] = useState(0);
  const [weight, setWeight] = useState(10);
  const [selected, setSelected] = useState<string[]>([]);
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [ratioMode, setRatioMode] = useState<"equal" | "custom">("equal");
  const [recipeName, setRecipeName] = useState("");
  const [showPoster, setShowPoster] = useState(false);
  const [posterImg, setPosterImg] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);
  const [showAiPoster, setShowAiPoster] = useState(false);
  const [aiPosterImg, setAiPosterImg] = useState<string | null>(null);
  const [generatingAiPoster, setGeneratingAiPoster] = useState(false);
  const aiPosterRef = useRef<HTMLDivElement>(null);
  const bowlTargetRef = useRef<HTMLElement | null>(null);
  const { flyToTarget } = useRiceFlyAnimation();
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [aiNeed, setAiNeed] = useState("");
  const [aiResult, setAiResult] = useState<{ recommended: string[]; reason: string } | null>(null);
  const aiRecommend = mtrpc.diy.aiRecommend.useMutation({
    onSuccess: (data: { recommended: string[]; reason: string }) => { setAiResult(data); },
  });
  // AI 推荐配比相关状态
  const [aiRatioPurpose, setAiRatioPurpose] = useState<"rice" | "porridge">("rice");
  const [aiRatioPrefs, setAiRatioPrefs] = useState<string[]>([]);
  const [aiRatioResult, setAiRatioResult] = useState<{ ratios: Record<string, number>; reason: string } | null>(null);
  const aiRatio = mtrpc.diy.aiRatio.useMutation({
    onSuccess: (data: { ratios: Record<string, number>; reason: string }) => {
      setAiRatioResult(data);
      setRatioMode("custom");
      setRatios(data.ratios);
    },
  });
  const toggleAiRatioPref = (pref: string) => {
    setAiRatioPrefs(prev =>
      prev.includes(pref) ? prev.filter(p => p !== pref) : [...prev, pref]
    );
  };
  // 购物车相关状态
  const [cartWeight, setCartWeight] = useState(weight);
  const [showCartSuccess, setShowCartSuccess] = useState(false);
  const [sessionId] = useState(() => {
    const key = "miban_session_id";
    let id = localStorage.getItem(key);
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(key, id); }
    return id;
  });
  const addBatch = mtrpc.cart.addBatch.useMutation({
    onSuccess: () => {
      setShowCartSuccess(true);
      setTimeout(() => setShowCartSuccess(false), 2500);
    },
  });
  const cartList = mtrpc.cart.list.useQuery({ sessionId }, { refetchOnWindowFocus: false });
  const cartCount = cartList.data?.length ?? 0;

  const handleAddToCart = () => {
    if (selected.length === 0) return;
    const totalW = cartWeight > 0 ? cartWeight : weight;
    const items = selected.map((id) => {
      const rice = RICE_TYPES.find((r) => r.id === id)!;
      const pct = ratios[id] ?? Math.round(100 / selected.length);
      const w = Math.round((totalW * pct) / 100 * 10) / 10;
      return { riceId: id, riceName: rice.name, weightJin: w, pricePerJin: rice.price, ratio: pct };
    });
    addBatch.mutate({ sessionId, recipeName: recipeName || "我的专属米", items });
  };

  // 用量参考计算（按成年人每顿100g干米，早中晚3顿）
  const getUsageHints = (w: number) => {
    const totalGrams = w * 500;
    const gramsPerPersonPerDay = 100 * 3;
    return [
      { people: 1, label: "1人" },
      { people: 2, label: "2人" },
      { people: 3, label: "3人" },
      { people: 4, label: "4人" },
    ].map(({ people, label }) => ({
      label,
      days: Math.round(totalGrams / (gramsPerPersonPerDay * people)),
    }));
  };

  const totalPrice = useCallback(() => {
    return RICE_TYPES.reduce((sum, rice) => {
      const pct = ratios[rice.id] ?? 0;
      return sum + (pct / 100) * weight * rice.price;
    }, 0);
  }, [ratios, weight]);

  const applyEqual = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const pct = Math.floor(100 / ids.length);
    const rem = 100 - pct * ids.length;
    const newRatios: Record<string, number> = {};
    ids.forEach((id, i) => { newRatios[id] = i === 0 ? pct + rem : pct; });
    setRatios(newRatios);
  }, []);

  const toggleRice = (id: string, e?: React.MouseEvent) => {
    const wasSelected = selected.includes(id);
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    // 选中新米种时触发米粒飞入动画
    if (!wasSelected && e) {
      const rice = RICE_TYPES.find(r => r.id === id);
      flyToTarget(e, bowlTargetRef, rice?.color ?? "#C8A87A");
    }
  };

  const adjustRatio = (id: string, delta: number) => {
    setRatios((prev) => {
      const current = prev[id] ?? 0;
      const newVal = Math.max(0, Math.min(100, current + delta));
      const diff = newVal - current;
      if (diff === 0) return prev;
      const others = selected.filter((x) => x !== id);
      const otherTotal = others.reduce((s, x) => s + (prev[x] ?? 0), 0);
      const newRatios = { ...prev, [id]: newVal };
      if (others.length > 0 && otherTotal > 0) {
        others.forEach((x) => {
          const share = (prev[x] ?? 0) / otherTotal;
          newRatios[x] = Math.max(0, Math.round((prev[x] ?? 0) - diff * share));
        });
      }
      const total = Object.values(newRatios).reduce((s, v) => s + v, 0);
      if (total !== 100 && others.length > 0) {
        const lastOther = others[others.length - 1];
        newRatios[lastOther] = Math.max(0, (newRatios[lastOther] ?? 0) + (100 - total));
      }
      return newRatios;
    });
  };

  const generatePoster = async () => {
    setGenerating(true);
    setShowPoster(true);
    await new Promise((r) => setTimeout(r, 400));
    if (posterRef.current) {
      try {
        const canvas = await html2canvas(posterRef.current, {
          scale: 2, backgroundColor: "#0A0A0A", useCORS: true, allowTaint: true, logging: false,
        });
        setPosterImg(canvas.toDataURL("image/png"));
      } catch (e) { console.error("海报生成失败", e); }
    }
    setGenerating(false);
  };

  const downloadPoster = () => {
    if (!posterImg) return;
    const a = document.createElement("a");
    a.href = posterImg;
    a.download = `${recipeName || "我的专属米"}_配方海报.png`;
    a.click();
  };

  const generateAiPoster = async () => {
    setGeneratingAiPoster(true);
    setShowAiPoster(true);
    setAiPosterImg(null);
    await new Promise((r) => setTimeout(r, 400));
    if (aiPosterRef.current) {
      try {
        const canvas = await html2canvas(aiPosterRef.current, {
          scale: 2, backgroundColor: "#0A0A0A", useCORS: true, allowTaint: true, logging: false,
        });
        setAiPosterImg(canvas.toDataURL("image/png"));
      } catch (e) { console.error("AI海报生成失败", e); }
    }
    setGeneratingAiPoster(false);
  };

  const downloadAiPoster = () => {
    if (!aiPosterImg) return;
    const a = document.createElement("a");
    a.href = aiPosterImg;
    a.download = `米伴AI配比海报.png`;
    a.click();
  };

  const applyAiRecommend = () => {
    if (!aiResult) return;
    setSelected(aiResult.recommended);
    applyEqual(aiResult.recommended);
    setShowAiDialog(false);
    setAiResult(null);
    setAiNeed("");
  };

  const ratioList = selected.map((id) => ({ id, pct: ratios[id] ?? 0 }));

  const usageHints = getUsageHints(weight);
  // 2人参考新鲜度（底部提示用）
  const ref2pDays = usageHints.find(h => h.label === "2人")?.days ?? 0;
  const ref2pF = freshnessLevel(ref2pDays);

  const renderStep0 = () => (
    <div className="flex flex-col items-center px-6 pt-8 pb-6 gap-6">
      <div className="text-center">
        <div className="text-[13px] text-gray-400 mb-2">第一步</div>
        <h2 className="text-[22px] font-bold text-black">你想配多少米？</h2>
        <p className="text-[13px] text-gray-400 mt-1">10斤起配，5斤一档</p>
      </div>
      <div className="flex items-center gap-6">
        <button onClick={() => setWeight((w) => Math.max(10, w - 5))} disabled={weight <= 10} className="w-12 h-12 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-600 disabled:opacity-30 active:scale-95 transition-transform">
          <Minus size={20} />
        </button>
        <div className="text-center min-w-[100px]">
          <span className="text-[56px] font-bold text-black leading-none">{weight}</span>
          <span className="text-[18px] font-medium text-gray-500 ml-1">斤</span>
        </div>
        <button onClick={() => setWeight((w) => w + 5)} className="w-12 h-12 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-600 active:scale-95 transition-transform">
          <Plus size={20} />
        </button>
      </div>
      <div className="flex gap-2 flex-wrap justify-center">
        {[10, 15, 20, 25, 30].map((w) => (
          <button key={w} onClick={() => setWeight(w)} className={`px-4 py-2 rounded-full text-[13px] font-medium border transition-all active:scale-95 ${weight === w ? "bg-black text-white border-black" : "bg-white text-gray-600 border-gray-200"}`}>
            {w}斤
          </button>
        ))}
      </div>

      {/* 用量参考提示（只读） */}
      <div className="w-full rounded-2xl border border-gray-100 overflow-hidden">
        {/* 标题 */}
        <div className="px-4 pt-3 pb-2 flex items-baseline justify-between">
          <span className="text-[11px] font-medium text-gray-500">用量参考</span>
          <span className="text-[10px] text-gray-300">每人每顿 100g · 早中晚三餐</span>
        </div>
        {/* 分隔线 */}
        <div className="h-px bg-gray-100 mx-4" />
        {/* 数据行 */}
        <div className="grid grid-cols-4 divide-x divide-gray-100">
          {usageHints.map(({ label, days }) => {
            const f = freshnessLevel(days);
            return (
              <div key={label} className="py-3 flex flex-col items-center gap-0.5">
                <span className="text-[10px] text-gray-400">{label}</span>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-[22px] font-bold text-black leading-none tracking-tight">
                    <AnimatedNumber value={days} />
                  </span>
                  <span className="text-[11px] text-gray-400 font-normal">天</span>
                </div>
                <span className={`text-[9px] font-medium ${f.color}`}>{f.badge}</span>
              </div>
            );
          })}
        </div>
        {/* 底部提示 */}
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
          <p className="text-[10px] text-gray-400">建议 30 天内吃完，新鲜风味最佳</p>
        </div>
      </div>
    </div>
  );

  const renderStep1 = () => { return (
    <div className="px-4 pt-6 pb-4">
      <div className="text-center mb-5">
        <div className="text-[13px] text-gray-400 mb-1">第二步</div>
        <h2 className="text-[22px] font-bold text-black">选择你的米种</h2>
        <p className="text-[13px] text-gray-400 mt-1">可多选，至少选1种</p>
      </div>
      <button
        onClick={() => { setShowAiDialog(true); setAiResult(null); setAiNeed(""); }}
        className="w-full mb-4 flex items-center justify-center gap-2 rounded-2xl py-3 border-2 border-dashed border-gray-200 text-gray-500 text-[14px] active:scale-95 transition-all hover:border-black hover:text-black"
      >
        <Sparkles size={16} />
        <span>AI 智能推荐组合</span>
      </button>
      <div className="grid grid-cols-2 gap-3">
        {RICE_TYPES.map((rice) => {
          const isSel = selected.includes(rice.id);
          return (
            <button key={rice.id} onClick={(e) => toggleRice(rice.id, e)} className={`relative rounded-2xl p-4 text-left border-2 transition-all active:scale-95 ${isSel ? "border-black bg-black text-white" : "border-gray-100 bg-gray-50 text-black"}`}>
              {isSel && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-white flex items-center justify-center">
                  <Check size={12} className="text-black" strokeWidth={3} />
                </div>
              )}
              <img src={rice.img} alt={rice.name} className="w-10 h-10 rounded-full object-cover mb-2" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }} />
              <div className="font-semibold text-[15px]">{rice.name}</div>
              <div className={`text-[11px] mt-0.5 ${isSel ? "text-gray-300" : "text-gray-400"}`}>{rice.desc}</div>
              <div className={`text-[12px] font-medium mt-1.5 ${isSel ? "text-orange-300" : "text-[#FF6900]"}`}>¥{rice.price}/斤</div>
            </button>
          );
        })}
      </div>
    </div>
  );
  }

  const renderStep2 = () => {
    const selRices = RICE_TYPES.filter((r) => selected.includes(r.id));
    return (
      <div className="px-4 pt-6 pb-4">
        <div className="text-center mb-5">
          <div className="text-[13px] text-gray-400 mb-1">第三步</div>
          <h2 className="text-[22px] font-bold text-black">调整比例</h2>
        </div>
        {/* AI 智能推荐配比 */}
        <div className="mb-4">
          {aiRatioResult ? (
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={13} className="text-[#FF6900] flex-shrink-0" />
                  <span className="text-[13px] font-semibold text-[#FF6900]">AI 推荐配比</span>
                  <span className="text-[11px] text-gray-400 ml-0.5">（已应用）</span>
                </div>
                <button onClick={() => setAiRatioResult(null)} className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <X size={10} className="text-gray-500" />
                </button>
              </div>
              <p className="text-[12px] text-gray-600 leading-relaxed mb-3">{aiRatioResult.reason}</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {Object.entries(aiRatioResult.ratios).map(([id, pct]) => {
                  const rice = RICE_TYPES.find(r => r.id === id);
                  return rice ? (
                    <span key={id} className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-orange-100 text-gray-700">
                      {rice.name} <span className="font-semibold text-[#FF6900]">{pct}%</span>
                    </span>
                  ) : null;
                })}
              </div>
              <div className="flex gap-2 mt-0">
                <button
                  onClick={() => aiRatio.mutate({ selectedIds: selected, purpose: aiRatioPurpose, preferences: aiRatioPrefs })}
                  disabled={aiRatio.isPending}
                  className="flex-1 h-8 rounded-xl bg-white border border-orange-200 text-[12px] text-[#FF6900] font-medium flex items-center justify-center gap-1 active:scale-95 transition-transform disabled:opacity-50"
                >
                  {aiRatio.isPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  重新推荐
                </button>
                <button
                  onClick={generateAiPoster}
                  className="flex-1 h-8 rounded-xl bg-black text-[12px] text-white font-medium flex items-center justify-center gap-1 active:scale-95 transition-transform"
                >
                  <Share2 size={12} />
                  生成海报
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-2xl p-3.5">
              <div className="flex items-center gap-1.5 mb-3">
                <Sparkles size={13} className="text-[#FF6900]" />
                <span className="text-[13px] font-semibold text-black">AI 智能推荐配比</span>
              </div>
              {/* 用途选择 */}
              <div className="flex gap-1.5 mb-3">
                {[{ key: "rice", label: "🍚 蒸饭" }, { key: "porridge", label: "🥣 煮粥" }].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setAiRatioPurpose(key as "rice" | "porridge")}
                    className={`flex-1 py-1.5 rounded-xl text-[12px] font-medium transition-all ${aiRatioPurpose === key ? "bg-black text-white" : "bg-white text-gray-500 border border-gray-200"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* 口感偏好多选标签 */}
              <p className="text-[11px] text-gray-400 mb-2">口感偏好（可多选）</p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {["软糯", "劲道", "低糖减脂", "高蛋白", "养胃", "美颜", "清热祛湿"].map(pref => (
                  <button
                    key={pref}
                    onClick={() => toggleAiRatioPref(pref)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all active:scale-95 ${aiRatioPrefs.includes(pref) ? "bg-[#FF6900] text-white" : "bg-white text-gray-500 border border-gray-200"}`}
                  >
                    {pref}
                  </button>
                ))}
              </div>
              {/* 推荐按钮 */}
              <button
                onClick={() => aiRatio.mutate({ selectedIds: selected, purpose: aiRatioPurpose, preferences: aiRatioPrefs })}
                disabled={aiRatio.isPending}
                className="w-full h-10 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-70"
                style={{ background: aiRatio.isPending ? "#ccc" : "linear-gradient(135deg, #FF6900, #FF9500)" }}
              >
                {aiRatio.isPending ? (
                  <><Loader2 size={14} className="animate-spin" />AI 分析中...</>
                ) : (
                  <><Sparkles size={14} />生成推荐配比</>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-center mb-5">
          <RiceBowl ratios={ratioList} />
        </div>
        <div className="flex gap-2 mb-5 bg-gray-100 rounded-xl p-1">
          <button onClick={() => { setRatioMode("equal"); applyEqual(selected); }} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium transition-all ${ratioMode === "equal" ? "bg-white text-black shadow-sm" : "text-gray-500"}`}>
            <Shuffle size={14} />平均分配
          </button>
          <button onClick={() => setRatioMode("custom")} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[13px] font-medium transition-all ${ratioMode === "custom" ? "bg-white text-black shadow-sm" : "text-gray-500"}`}>
            <Sliders size={14} />自定义
          </button>
        </div>
        <div className="flex flex-col gap-3">
          {selRices.map((rice) => {
            const pct = ratios[rice.id] ?? 0;
            return (
              <div key={rice.id} className="flex items-center gap-3">
                <img src={rice.img} alt={rice.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-medium text-black">{rice.name}</span>
                    <span className="text-[13px] font-bold text-black">{pct}%</span>
                  </div>
                  {ratioMode === "custom" ? (
                    <div className="flex items-center gap-2">
                      <button onClick={() => adjustRatio(rice.id, -5)} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 active:scale-95">
                        <Minus size={12} />
                      </button>
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: rice.color }} />
                      </div>
                      <button onClick={() => adjustRatio(rice.id, 5)} className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 active:scale-95">
                        <Plus size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: rice.color }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-5 bg-gray-50 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[12px] text-gray-400">{weight}斤 · {selected.length}种米</p>
            <p className="text-[11px] text-gray-400 mt-0.5">预估总价</p>
          </div>
          <span className="text-[24px] font-bold" style={{ color: "#FF6900" }}>¥{totalPrice().toFixed(1)}</span>
        </div>
      </div>
    );
  };

  const renderStep3 = () => {
    const selRices = RICE_TYPES.filter((r) => selected.includes(r.id));
    return (
      <div className="px-4 pt-6 pb-4">
        <div className="text-center mb-6">
          <div className="text-[13px] text-gray-400 mb-1">第四步</div>
          <h2 className="text-[22px] font-bold text-black">你的专属配方</h2>
        </div>
        <div className="bg-black rounded-3xl p-5 mb-4 text-white">
          <div className="flex items-center justify-between mb-4">
            <RiceBowl ratios={ratioList} size={120} />
            <div className="text-right">
              <p className="text-[12px] text-gray-400">{weight}斤</p>
              <p className="text-[28px] font-bold" style={{ color: "#FF6900" }}>¥{totalPrice().toFixed(1)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {selRices.map((rice) => (
              <div key={rice.id} className="flex items-center gap-1.5 bg-white/10 rounded-full px-2.5 py-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: rice.color }} />
                <span className="text-[12px]">{rice.name} {ratios[rice.id] ?? 0}%</span>
              </div>
            ))}
          </div>
          <div className="border-t border-white/10 pt-3">
            <p className="text-[11px] text-gray-400 mb-1.5">给这个配方起个名字</p>
            <input type="text" value={recipeName} onChange={(e) => setRecipeName(e.target.value)} placeholder="例如：我的减脂米、妈妈的养生米…" className="w-full bg-white/10 rounded-xl px-3 py-2.5 text-[13px] text-white placeholder-gray-500 outline-none border border-white/10 focus:border-white/30" />
          </div>
        </div>
        {/* 营养成分估算 */}
        {(() => {
          // 计算总营养（基于 cartWeight 斤 = cartWeight*500g）
          const totalGrams = cartWeight * 500;
          let totalKcal = 0, totalCarb = 0, totalProtein = 0, totalFat = 0, totalFiber = 0;
          selRices.forEach(r => {
            const pct = ratios[r.id] ?? 0;
            const grams = totalGrams * pct / 100;
            const n = RICE_NUTRITION[r.id];
            if (n) {
              totalKcal    += n.kcal    * grams / 100;
              totalCarb    += n.carb    * grams / 100;
              totalProtein += n.protein * grams / 100;
              totalFat     += n.fat     * grams / 100;
              totalFiber   += n.fiber   * grams / 100;
            }
          });
          const nutrients = [
            { label: "热量",     value: Math.round(totalKcal),    unit: "kcal", color: "#FF6900", icon: "🔥" },
            { label: "碳水化合物", value: Math.round(totalCarb),    unit: "g",    color: "#F59E0B", icon: "🌾" },
            { label: "蛋白质",   value: Math.round(totalProtein), unit: "g",    color: "#10B981", icon: "💪" },
            { label: "脂肪",     value: Math.round(totalFat),     unit: "g",    color: "#6366F1", icon: "💧" },
            { label: "膳食纤维", value: Math.round(totalFiber),   unit: "g",    color: "#8B5CF6", icon: "🌿" },
          ];
          return (
            <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🧪</span>
                <span className="text-[13px] font-semibold text-black">营养成分估算</span>
                <span className="text-[11px] text-gray-400 ml-auto">基于 {cartWeight} 斤干米</span>
              </div>
              {/* 热量突出显示 */}
              <div className="flex items-center justify-between bg-orange-50 rounded-xl px-3 py-2.5 mb-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-lg">🔥</span>
                  <span className="text-[13px] text-gray-600">总热量</span>
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-[22px] font-bold text-[#FF6900]">{Math.round(totalKcal).toLocaleString()}</span>
                  <span className="text-[11px] text-gray-400">kcal</span>
                </div>
              </div>
              {/* 其他营养素网格 */}
              <div className="grid grid-cols-2 gap-2">
                {nutrients.slice(1).map(n => (
                  <div key={n.label} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                    <div className="flex items-center gap-1">
                      <span className="text-sm">{n.icon}</span>
                      <span className="text-[12px] text-gray-500">{n.label}</span>
                    </div>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-[15px] font-semibold" style={{ color: n.color }}>{n.value}</span>
                      <span className="text-[10px] text-gray-400">{n.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-2.5 text-center">数据基于各米种标准营养成分表估算，仅供参考</p>
            </div>
          );
        })()}

                {/* 一键加入购物车 */}
        <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart size={15} className="text-[#FF6900]" />
            <span className="text-[13px] font-semibold text-black">加入购物车</span>
            <span className="text-[11px] text-gray-400 ml-auto">按比例自动拆分</span>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[12px] text-gray-500 flex-shrink-0">购买总量</span>
            <div className="flex items-center gap-1 flex-1">
              <button onClick={() => setCartWeight(w => Math.max(1, w - 1))} className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center active:scale-95 transition-transform">
                <Minus size={12} />
              </button>
              <input
                type="number" min={1} max={999}
                value={cartWeight}
                onChange={(e) => setCartWeight(Math.max(1, Number(e.target.value)))}
                className="flex-1 h-7 rounded-lg border border-gray-200 bg-white text-center text-[13px] font-semibold"
              />
              <button onClick={() => setCartWeight(w => w + 1)} className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center active:scale-95 transition-transform">
                <Plus size={12} />
              </button>
              <span className="text-[12px] text-gray-500 flex-shrink-0">斤</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {selected.map((id) => {
              const rice = RICE_TYPES.find(r => r.id === id)!;
              const pct = ratios[id] ?? Math.round(100 / selected.length);
              const w = Math.round(cartWeight * pct / 100 * 10) / 10;
              return (
                <span key={id} className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-orange-100 text-gray-600">
                  {rice.name} <span className="font-semibold text-[#FF6900]">{w}斤</span>
                </span>
              );
            })}
          </div>
          <button
            onClick={handleAddToCart}
            disabled={addBatch.isPending}
            className="w-full py-2.5 rounded-xl text-[13px] font-bold text-white flex items-center justify-center gap-1.5 active:scale-95 transition-transform disabled:opacity-50"
            style={{ background: showCartSuccess ? "#22c55e" : "#FF6900" }}
          >
            {addBatch.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShoppingCart size={14} />}
            {showCartSuccess ? "已加入购物车 ✓" : `加入购物车 · ¥${selected.reduce((s, id) => { const rice = RICE_TYPES.find(r => r.id === id)!; const pct = ratios[id] ?? Math.round(100 / selected.length); return s + cartWeight * pct / 100 * rice.price; }, 0).toFixed(1)}`}
          </button>
        </div>
        <button onClick={generatePoster} className="w-full py-3.5 rounded-2xl text-[14px] font-semibold text-black bg-white border-2 border-black flex items-center justify-center gap-2 mb-3 active:scale-95 transition-transform">
          <Share2 size={16} />生成配方海报
        </button>
        {isAuthenticated ? (
          <button className="w-full py-4 rounded-2xl text-[15px] font-bold text-white" style={{ background: "#FF6900" }}>
            立即下单 · ¥{totalPrice().toFixed(1)}
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <button onClick={() => window.location.href = "/login"} className="w-full py-4 rounded-2xl text-[15px] font-bold text-white" style={{ background: "#FF6900" }}>
              登录后下单
            </button>
            <p className="text-center text-[12px] text-gray-400">登录后可保存配方并下单</p>
          </div>
        )}
      </div>
    );
  };

  const steps = [renderStep0, renderStep1, renderStep2, renderStep3];

  const canNext = () => {
    if (step === 0) return weight >= 10;
    if (step === 1) return selected.length > 0;
    if (step === 2) return Object.values(ratios).reduce((s, v) => s + v, 0) === 100;
    return true;
  };

  const goNext = () => {
    if (step === 1) applyEqual(selected);
    setStep((s) => Math.min(3, s + 1));
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-1 mb-2">
          {STEP_LABELS.map((_, i) => (
            <div key={i} className={`flex-1 h-1 rounded-full transition-all ${i <= step ? "bg-black" : "bg-gray-100"}`} />
          ))}
        </div>
        <div className="flex justify-between">
          {STEP_LABELS.map((label, i) => (
            <span key={i} className={`text-[10px] transition-all ${i === step ? "text-black font-semibold" : "text-gray-300"}`}>{label}</span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-32">
        {steps[step]()}
      </div>

      <div className="fixed bottom-16 left-0 right-0 px-4 pb-4 pt-3 bg-white border-t border-gray-100">
        <div className="flex gap-3">
          {step > 0 && (
            <button onClick={() => setStep((s) => s - 1)} className="w-12 h-12 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 active:scale-95 transition-transform">
              <ChevronLeft size={20} />
            </button>
          )}
          {step < 3 && (
            <button ref={(el) => { if (step === 1) bowlTargetRef.current = el; }} onClick={goNext} disabled={!canNext()} className="flex-1 h-12 rounded-xl text-[15px] font-bold text-white flex items-center justify-center gap-1.5 disabled:opacity-40 active:scale-95 transition-all" style={{ background: "#FF6900" }}>
              下一步<ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>

      {/* AI 智能推荐弹窗 */}
      {showAiDialog && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end" onClick={() => setShowAiDialog(false)}>
          <div className="w-full bg-white rounded-t-3xl p-6 pb-10" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-black" />
                <span className="text-[17px] font-bold text-black">AI 智能推荐</span>
              </div>
              <button onClick={() => setShowAiDialog(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            <p className="text-[13px] text-gray-400 mb-4">告诉 AI 你的需求，自动帮你选好米种组合</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {["减脂控糖", "养胃健脾", "补血养颜", "清热祛湿", "日常主食", "孕期营养"].map((tag) => (
                <button key={tag} onClick={() => setAiNeed(tag)} className={`px-3 py-1.5 rounded-full text-[13px] border transition-all ${aiNeed === tag ? "bg-black text-white border-black" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                  {tag}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={aiNeed}
              onChange={(e) => setAiNeed(e.target.value)}
              placeholder="或者输入你的需求，如：最近血糖偏高，想控糖…"
              className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-[14px] text-black outline-none focus:border-black mb-4"
            />
            {aiResult && (
              <div className="bg-gray-50 rounded-2xl p-4 mb-4">
                <p className="text-[12px] text-gray-400 mb-2">AI 推荐组合</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {aiResult.recommended.map((id) => {
                    const rice = RICE_TYPES.find((r) => r.id === id);
                    if (!rice) return null;
                    return (
                      <div key={id} className="flex items-center gap-1.5 bg-black rounded-full px-3 py-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: rice.color }} />
                        <span className="text-[12px] text-white">{rice.name}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[12px] text-gray-600">{aiResult.reason}</p>
              </div>
            )}
            <div className="flex gap-3">
              {aiResult ? (
                <button onClick={applyAiRecommend} className="flex-1 py-3.5 rounded-2xl text-[15px] font-bold text-white" style={{ background: "#FF6900" }}>
                  应用推荐组合
                </button>
              ) : (
                <button
                  onClick={() => { if (aiNeed.trim()) aiRecommend.mutate({ need: aiNeed.trim() }); }}
                  disabled={!aiNeed.trim() || aiRecommend.isPending}
                  className="flex-1 py-3.5 rounded-2xl text-[15px] font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ background: "#FF6900" }}
                >
                  {aiRecommend.isPending ? <><Loader2 size={18} className="animate-spin" />AI 分析中…</> : "开始推荐"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 海报弹窗 */}
      {/* AI 配比分享海报弹窗 */}
      {showAiPoster && aiRatioResult && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4" onClick={() => { setShowAiPoster(false); setAiPosterImg(null); }}>
          <div className="relative w-full max-w-[380px]" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setShowAiPoster(false); setAiPosterImg(null); }} className="absolute -top-10 right-0 text-white/70 flex items-center gap-1 text-[13px]">
              <X size={16} />关闭
            </button>
            {!aiPosterImg && (
              <div ref={aiPosterRef}>
                <AiRatioPoster ratios={aiRatioResult.ratios} reason={aiRatioResult.reason} preferences={aiRatioPrefs} purpose={aiRatioPurpose} />
              </div>
            )}
            {aiPosterImg && (
              <img src={aiPosterImg} alt="AI配比海报" className="w-full rounded-2xl" />
            )}
            {generatingAiPoster && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl">
                <div className="text-white text-[14px]">生成中…</div>
              </div>
            )}
            <div className="mt-4 flex gap-3">
              {aiPosterImg && (
                <button onClick={downloadAiPoster} className="flex-1 py-3 rounded-xl bg-white text-black text-[13px] font-semibold flex items-center justify-center gap-1.5">
                  <Download size={16} />保存图片
                </button>
              )}
              <button onClick={() => { setShowAiPoster(false); setAiPosterImg(null); }} className="flex-1 py-3 rounded-xl bg-white/10 text-white text-[13px]">
                关闭
              </button>
            </div>
            <p className="text-center text-[12px] text-white/50 mt-3">长按图片可保存到相册</p>
          </div>
        </div>
      )}

      {showPoster && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4" onClick={() => { setShowPoster(false); setPosterImg(null); }}>
          <div className="relative w-full max-w-[380px]" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { setShowPoster(false); setPosterImg(null); }} className="absolute -top-10 right-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
              <X size={16} />
            </button>
            {!posterImg && (
              <div ref={posterRef}>
                <RecipePoster recipeName={recipeName} weight={weight} selected={selected} ratios={ratios} totalPrice={totalPrice()} />
              </div>
            )}
            {posterImg && (
              <img src={posterImg} alt="配方海报" className="w-full rounded-2xl" />
            )}
            {generating && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl">
                <div className="text-white text-[14px]">生成中…</div>
              </div>
            )}
            <div className="mt-4 flex gap-3">
              {posterImg && (
                <button onClick={downloadPoster} className="flex-1 py-3 rounded-xl bg-white text-black text-[14px] font-semibold flex items-center justify-center gap-2">
                  <Download size={16} />保存图片
                </button>
              )}
              <button onClick={() => { setShowPoster(false); setPosterImg(null); }} className="flex-1 py-3 rounded-xl bg-white/20 text-white text-[14px] font-semibold">
                关闭
              </button>
            </div>
            <p className="text-center text-[12px] text-white/50 mt-3">长按图片可保存到相册</p>
          </div>
        </div>
      )}
    </div>
  );
}
