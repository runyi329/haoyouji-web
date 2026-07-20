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
import { Check, Minus, Plus, ChevronRight, ChevronLeft, ChevronDown, Shuffle, Sliders, Share2, X, Download, Sparkles, Loader2, ShoppingCart, Wallet, MapPin, Phone, User, BookMarked, Heart, Eye, EyeOff } from "lucide-react";
import AddressBook from "./AddressBook";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import { trpc } from "@/lib/trpc";
import { mtrpc, cosImg } from "./mibanTrpc";
import { useRiceFlyAnimation } from "@/hooks/useRiceFlyAnimation";

const RICE_TYPES = [
  { id: "white",  name: "白米",  desc: "软糯香甜，日常主食",   price: 4.8,  color: "#A07840", img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/rice_white_single.webp" },
  { id: "black",  name: "黑米",  desc: "花青素丰富，补肾益气", price: 8.5,  color: "#5B3A6B", img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/rice_black_single.webp" },
  { id: "red",    name: "红米",  desc: "铁元素高，补血养颜",   price: 7.2,  color: "#8B2020", img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/rice_red_single.webp" },
  { id: "brown",  name: "糙米",  desc: "膳食纤维高，控糖减脂", price: 6.0,  color: "#7A5230", img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/rice_brown_single.webp" },
  { id: "purple", name: "紫米",  desc: "花青素+铁，美容养颜",  price: 9.0,  color: "#4A2060", img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/rice_purple_single.webp" },
  { id: "millet", name: "小米",  desc: "健脾养胃，易消化",     price: 5.5,  color: "#C8960A", img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/rice_millet_single.webp" },
  { id: "mung",   name: "绿豆",  desc: "清热解毒，消暑降火",   price: 10.0, color: "#4A7C3F", img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/rice_mung_single.webp" },
  { id: "coix",   name: "薏米",  desc: "祛湿消肿，美白润肤",   price: 12.0, color: "#9A6030", img: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/miban/rice_coix_single.webp" },
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

// 模块级米种列表引用（由主组件在渲染时同步，供 RiceBowl/RecipePoster/AiRatioPoster 等子组件访问）
let allRiceList: typeof RICE_TYPES = RICE_TYPES;

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
    const rice = allRiceList.find((r) => r.id === item.id);
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
  const selRices = allRiceList.filter((r) => selected.includes(r.id));
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
  const selRices = allRiceList.filter(r => r.id in ratios);
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
                const rice = allRiceList.find(r => r.id === id);
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
          const rice = allRiceList.find(r => r.id === id);
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
  // 收藏相关 hooks（组件顶层）
  const { data: myFavList, refetch: refetchFavs } = mtrpc.favorite.myList.useQuery(undefined, { enabled: isAuthenticated });
  const favToggle = mtrpc.favorite.toggle.useMutation({ onSuccess: () => refetchFavs() });
  const favoritedIds = new Set((myFavList ?? []).map((f: any) => f.productKey));

  // 从标准仓库动态加载米种（fallback 到硬编码 RICE_TYPES）
  const { data: catalogRows } = mtrpc.rice.catalogList.useQuery(
    { onlyActive: true },
    { staleTime: 5 * 60 * 1000 }
  );
  const riceTypes = catalogRows && catalogRows.length > 0
    ? (catalogRows as any[]).map((r) => ({
        id: String(r.id),
        name: r.stdName,
        desc: r.description ?? "",
        price: r.pricePerJin ?? 0,
        color: r.colorHex ?? "#A07840",
        img: r.img ?? "",
        nutrition: r.nutritionJson ?? null,
      }))
    : RICE_TYPES;
  // 同步模块级引用（供子组件使用）
  allRiceList = riceTypes as typeof RICE_TYPES;

  const [step, setStep] = useState(0);
  const [weight, setWeight] = useState(10);
  const [selected, setSelected] = useState<string[]>([]);
  const [ratios, setRatios] = useState<Record<string, number>>({});
  const [ratioMode, setRatioMode] = useState<"equal" | "custom">("custom");
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
  // 下单相关状态
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{ orderId: number; orderNo: string; deductCny: number; deductUsdt: number } | null>(null);
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [receiverAddress, setReceiverAddress] = useState("");
  const [userNote, setUserNote] = useState("");
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [showWalletDetail, setShowWalletDetail] = useState(false);
  const [saveToBook, setSaveToBook] = useState(false);
  const [selectedFromBook, setSelectedFromBook] = useState(false);
  const { data: savedAddresses } = mtrpc.address.list.useQuery(undefined, { enabled: isAuthenticated });
  const addAddressMut = mtrpc.address.add.useMutation();
  const [aiNeed, setAiNeed] = useState("");
  const [aiResult, setAiResult] = useState<{ recommended: string[]; reason: string } | null>(null);
  // 余额查询
  const { data: cnyBalance } = trpc.recharge.getCnyBalance.useQuery(undefined, { enabled: isAuthenticated });
  const { data: usdtBalance } = trpc.recharge.getBalance.useQuery(undefined, { enabled: isAuthenticated });
  // 实时 USDT/CNY 汇率（服务端缓存，每3秒刷新）
  const { data: cryptoPrices } = trpc.getCryptoPrices.useQuery(undefined, { refetchInterval: 5000, staleTime: 3000 });
  const cnyBalanceNum = Number(cnyBalance ?? 0);
  const usdtBalanceNum = Number(usdtBalance ?? 0);
  const usdtCnyRate = cryptoPrices?.usdtCnyRate ?? 6.7; // 备用汇率
  const totalAvailableCny = cnyBalanceNum + usdtBalanceNum * usdtCnyRate;
  // 下单 mutation
  const [pendingOrderPrice, setPendingOrderPrice] = useState(0);
  const createOrder = mtrpc.order.create.useMutation({
    onSuccess: (result: any) => {
      console.log('[DiyWorkshop] order.create result:', JSON.stringify(result));
      const orderId = typeof result === 'object' ? (result.orderId ?? result.id ?? result) : result;
      const orderNo = typeof result === 'object' ? (result.orderNo ?? result.order_no ?? '') : '';
      setOrderSuccess({ orderId, orderNo, deductCny: pendingOrderPrice, deductUsdt: 0 });
      setShowOrderDialog(false);
      cartList.refetch();
    },
    onError: (err: any) => {
      const msg = err?.message ?? "下单失败";
      if (msg.includes("余额不足") || msg.includes("PAYMENT_REQUIRED")) {
        toast.error("余额不足，请先充值", {
          description: msg.slice(0, 80),
          action: { label: "去充值", onClick: () => { window.location.href = "/recharge"; } },
        });
      } else {
        toast.error(msg.slice(0, 60));
      }
    },
  });
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
      const rice = allRiceList.find((r) => r.id === id)!;
      const pct = ratios[id] ?? Math.round(100 / selected.length);
      const w = Math.round((totalW * pct) / 100 * 10) / 10;
      return { riceId: id, riceName: rice.name, weightJin: w, pricePerJin: rice.price, ratio: pct };
    });
    addBatch.mutate({ sessionId, recipeName: recipeName || "我的专属米", items });
  };

  // 用量参考计算（按成年人每顿100g干米，早中晚3顿）
  const getUsageHints = (w: number) => {
    const totalGrams = w * 500;
    const gramsPerPersonPerDay = 100;
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
    return allRiceList.reduce((sum, rice) => {
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
      const rice = allRiceList.find(r => r.id === id);
      flyToTarget(e, bowlTargetRef, rice?.color ?? "#A07840");
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
    <div className="flex flex-col items-center justify-center flex-1 px-6 gap-8">
      <div className="flex items-center gap-6">
        <button onClick={() => setWeight((w) => Math.max(10, w - 5))} disabled={weight <= 10} className="w-14 h-14 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-600 disabled:opacity-30 active:scale-95 transition-transform">
          <Minus size={22} />
        </button>
        <div className="text-center min-w-[120px]">
          <span className="text-[72px] font-bold text-black leading-none">{weight}</span>
          <span className="text-[20px] font-medium text-gray-500 ml-1.5">斤</span>
        </div>
        <button onClick={() => setWeight((w) => w + 5)} className="w-14 h-14 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-600 active:scale-95 transition-transform">
          <Plus size={22} />
        </button>
      </div>

      {/* 用量参考 */}
      <div className="flex flex-col items-center gap-4 w-full">
        <div className="flex items-end justify-center gap-1">
          <span className="text-[13px] text-gray-400">约够</span>
          <span className="text-[13px] font-semibold text-gray-700">1 人</span>
          <span className="text-[13px] text-gray-400">吃</span>
          <span className="text-[28px] font-bold leading-none" style={{ color: "#FF6900" }}><AnimatedNumber value={Math.round(weight * 500 / 100)} /></span>
          <span className="text-[13px] text-gray-400 mb-0.5">天</span>
        </div>
        <span className="text-[12px] text-gray-400">按每天一顿·每顿二两（100克）估算</span>
      </div>
    </div>
  );

  // 口味引导标签配置
  // 每种米的功效标签、口感标签和产地/别名标签（按名称匹配）
  type RiceMetaItem = { tags: { label: string; color: string }[]; taste: { label: string; color: string }[]; origin: string[] };
  const RICE_META_BY_NAME: Record<string, RiceMetaItem> = {
    "白米":   { tags: [{ label: "软糯", color: "#FF6900" }, { label: "易消化", color: "#10B981" }], taste: [{ label: "老小皆宜", color: "#374151" }, { label: "日常主食", color: "#374151" }], origin: ["东北粳米", "五常产区", "稻花香"] },
    "黑米":   { tags: [{ label: "补肾益气", color: "#4338CA" }, { label: "抗氧化", color: "#6D28D9" }], taste: [{ label: "略硬香浓", color: "#374151" }, { label: "需提前浸泡", color: "#F59E0B" }], origin: ["云南墨江", "紫糯米", "黑珍珠"] },
    "红米":   { tags: [{ label: "补血", color: "#EF4444" }, { label: "养颜", color: "#DB2777" }], taste: [{ label: "略硬带韧", color: "#374151" }, { label: "女性首选", color: "#F472B6" }], origin: ["赣南红米", "高铁含量", "胭脂米"] },
    "糙米":   { tags: [{ label: "控糖", color: "#065F46" }, { label: "高纤维", color: "#065F46" }], taste: [{ label: "口感粗糙", color: "#374151" }, { label: "需多嚼", color: "#374151" }], origin: ["全谷物", "低GI", "糙粳米"] },
    "紫米":   { tags: [{ label: "美容", color: "#7C3AED" }, { label: "补血", color: "#EF4444" }], taste: [{ label: "糯香带甜", color: "#374151" }, { label: "颜色香艳", color: "#7C3AED" }], origin: ["云南紫糯", "花青素", "接骨糯"] },
    "小米":   { tags: [{ label: "健脾", color: "#D97706" }, { label: "养胃", color: "#D97706" }], taste: [{ label: "糯软清香", color: "#374151" }, { label: "孕妇宝宝首选", color: "#10B981" }], origin: ["山西沁州", "粟米", "谷子"] },
    "绿豆":   { tags: [{ label: "清热", color: "#059669" }, { label: "消暑", color: "#10B981" }], taste: [{ label: "清爽解腻", color: "#374151" }, { label: "夏天必备", color: "#059669" }], origin: ["东北绿豆", "明绿豆", "植物蛋白"] },
    "薏米":   { tags: [{ label: "祛湿", color: "#0E7490" }, { label: "美白", color: "#DB2777" }], taste: [{ label: "略硬耐嚼", color: "#374151" }, { label: "需提前浸泡", color: "#F59E0B" }], origin: ["贵州薏仁", "川谷", "苡仁"] },
  };
  // 辅助函数：按名称模糊匹配（支持"五常大米"匹配"白米"等）
  const getRiceMeta = (name: string): RiceMetaItem | undefined => {
    if (RICE_META_BY_NAME[name]) return RICE_META_BY_NAME[name];
    const key = Object.keys(RICE_META_BY_NAME).find(k => name.includes(k) || k.includes(name));
    return key ? RICE_META_BY_NAME[key] : undefined;
  };

  const FLAVOR_TAGS = [
    { key: "all",    label: "全部",   ids: [] },
    { key: "soft",   label: "软糯香甜", ids: ["white", "millet", "purple"] },
    { key: "blood",  label: "补血养颜", ids: ["red", "black", "purple"] },
    { key: "diet",   label: "控糖减脂", ids: ["brown", "coix", "mung"] },
    { key: "damp",   label: "祛湿清热", ids: ["coix", "mung", "brown"] },
    { key: "spleen", label: "健脾养胃", ids: ["millet", "white", "coix"] },
    { key: "kids",   label: "儿童成长", ids: ["white", "millet", "mung"] },
  ];
  const [flavorTag, setFlavorTag] = useState("all");

  const handleFlavorTag = (tag: typeof FLAVOR_TAGS[0]) => {
    setFlavorTag(tag.key);
    if (tag.key !== "all" && tag.ids.length > 0) {
      // 一键选中推荐组合（不清空已有选择，而是替换为推荐组合）
      tag.ids.forEach((id) => {
        if (!selected.includes(id)) toggleRice(id, { stopPropagation: () => {} } as any);
      });
      // 取消不在推荐中的已选
      selected.filter((id) => !tag.ids.includes(id)).forEach((id) => {
        toggleRice(id, { stopPropagation: () => {} } as any);
      });
    }
  };

  const renderStep1 = () => { return (
    <div className="overflow-y-auto pb-28" style={{ flex: "1 1 0", minHeight: 0 }}>
      {/* 标签栏：AI推荐 + 功效筛选标签并排 */}
      <div className="px-4 pt-5 mb-4">
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {/* AI 智能推荐胶囊 */}
          <button
            onClick={() => { setShowAiDialog(true); setAiResult(null); setAiNeed(""); }}
            className="flex-shrink-0 flex items-center gap-1 px-3.5 py-1.5 rounded-full text-[12px] font-semibold active:scale-95 transition-all"
            style={{ background: "#FF6900", color: "#fff", border: "none" }}
          >
            <Sparkles size={12} />
            <span>AI 推荐</span>
          </button>
          {/* 功效筛选标签 */}
          {FLAVOR_TAGS.map((tag) => (
            <button
              key={tag.key}
              onClick={() => handleFlavorTag(tag)}
              className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all"
              style={{
                background: flavorTag === tag.key ? "#1A1A1A" : "#F3F3F3",
                color: flavorTag === tag.key ? "#fff" : "#555",
                border: flavorTag === tag.key ? "none" : "1px solid #E8E8E8",
              }}
            >
              {tag.label}
            </button>
          ))}
        </div>
      </div>

      {/* 米种卡片 - 双列布局（左右各从顶部往下） */}
      <div className="px-4 flex gap-3">
        {([allRiceList.filter((_, i) => i % 2 === 0), allRiceList.filter((_, i) => i % 2 === 1)] as typeof allRiceList[]).map((col, colIdx) => (
          <div key={colIdx} className="flex-1 flex flex-col gap-3">
            {col.map((rice, idx) => {
              const isSel = selected.includes(rice.id);
              const imgSize = (colIdx * col.length + idx) % 3 === 0 ? 110 : (colIdx * col.length + idx) % 3 === 1 ? 90 : 100;
              return (
                <button
                  key={rice.id}
                  onClick={(e) => { setFlavorTag("all"); toggleRice(rice.id, e); }}
                  className="relative text-left rounded-2xl overflow-hidden transition-all active:scale-[0.97] w-full"
                  style={{
                    border: isSel ? "2px solid #FF6900" : "2px solid transparent",
                    background: "#F8F6F3",
                    boxShadow: isSel ? "0 4px 16px rgba(255,105,0,0.18)" : "0 2px 8px rgba(0,0,0,0.07)",
                  }}
                >
                  {/* 收藏按钮（左上角） */}
                  {isAuthenticated && (
                    <button
                      className="absolute top-2 left-2 z-20 p-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        favToggle.mutate({ productKey: `rice_${rice.id}`, productName: rice.name, productImg: rice.img });
                      }}
                    >
                      <Heart
                        size={16}
                        strokeWidth={2}
                        className={favoritedIds.has(`rice_${rice.id}`) ? "fill-red-500 text-red-500" : "text-gray-300"}
                      />
                    </button>
                  )}
                  {/* 选中勾 */}
                  {isSel && (
                    <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full flex items-center justify-center z-10" style={{ background: "#FF6900" }}>
                      <Check size={12} className="text-white" strokeWidth={3} />
                    </div>
                  )}
                  {/* 图片区：和卡片同色，mix-blend-mode让白色背景透明融合 */}
                  <div className="w-full flex items-center justify-center" style={{ paddingTop: 16, paddingBottom: 8, background: "#F8F6F3" }}>
                    <img
                      src={cosImg(rice.img, 140)}
                      alt={rice.name}
                      className="object-contain"
                      style={{ width: imgSize, height: imgSize, mixBlendMode: "multiply" }}
                    />
                  </div>
                  {/* 信息区 */}
                  <div className="px-3 pb-3">
                    <div className="font-bold text-[15px] text-gray-900">{rice.name}</div>
                    {/* 标签：最多2个功效标签，统一样式 */}
                    <div className="flex gap-1 mt-1.5 overflow-hidden">
                      {(getRiceMeta(rice.name)?.tags ?? []).slice(0, 2).map(t => (
                        <span key={t.label} className="text-[10px] font-medium px-2 py-0.5 rounded-sm flex-shrink-0" style={{ background: "#F3F3F3", color: "#666", border: "1px solid #E8E8E8" }}>{t.label}</span>
                      ))}
                    </div>
                    <div className="mt-2">
                      <span className="text-[13px] font-bold" style={{ color: "#FF6900" }}>¥{rice.price}<span className="text-[10px] font-normal text-gray-400">/斤</span></span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
  }

  const renderStep2 = () => {
    const selRices = allRiceList.filter((r) => selected.includes(r.id));
    return (
      <div className="overflow-y-auto px-4 pt-4 pb-28" style={{ flex: "1 1 0", minHeight: 0 }}>
        <div className="text-center mb-4">
          <div className="text-[13px] text-gray-400 mb-1">第三步</div>
          <h2 className="text-[22px] font-bold text-black">调整比例</h2>
        </div>

        {/* 米种图片 + 进度条列表（主体） */}
        <div className="flex flex-col gap-4 mb-5">
          {selRices.map((rice) => {
            const pct = ratios[rice.id] ?? 0;
            return (
              <div key={rice.id} className="bg-white rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm relative overflow-hidden">
                {/* 删除斜三角角标 */}
                <button
                  onClick={() => { toggleRice(rice.id, { stopPropagation: () => {} } as any); applyEqual(selected.filter(id => id !== rice.id)); }}
                  className="absolute top-0 left-0 active:opacity-70 transition-opacity z-10"
                  style={{
                    width: 40,
                    height: 40,
                    background: "linear-gradient(135deg, #d1d5db 50%, transparent 50%)",
                    borderTopLeftRadius: 16,
                  }}
                >
                  <X size={9} className="text-gray-600" style={{ position: 'absolute', top: 9, left: 9 }} />
                </button>
                <img src={cosImg(rice.img, 56)} alt={rice.name}
                  className="w-14 h-14 object-contain flex-shrink-0 rounded-xl"
                  style={{ mixBlendMode: "multiply", background: "#F8F6F3" }}
                />
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[14px] font-semibold text-gray-900 truncate">{rice.name}</span>
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <span className="text-[15px] font-bold" style={{ color: rice.color }}>{((pct / 100) * weight).toFixed(1)}斤</span>
                      <span className="text-[15px] font-bold text-gray-400">({pct}%)</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => adjustRatio(rice.id, -Math.round(0.5 / weight * 100))}
                      disabled={(pct / 100 * weight) <= 0.5}
                      className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 active:scale-95 flex-shrink-0 disabled:opacity-30"
                    >
                      <Minus size={12} />
                    </button>
                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: rice.color }} />
                    </div>
                    <button
                      onClick={() => adjustRatio(rice.id, Math.round(0.5 / weight * 100))}
                      className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 active:scale-95 flex-shrink-0"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 添加米种快捷按鈕 */}
        <button
          onClick={() => setStep(1)}
          className="w-full flex items-center justify-center gap-2 py-3 mb-5 rounded-2xl border-2 border-dashed border-gray-200 text-gray-400 text-[13px] font-medium active:scale-[0.98] transition-all"
        >
          <Plus size={16} />添加米种
        </button>

        {/* 小票风格订单明细 */}
        <div className="mb-5 relative" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
          {/* 顶部齿形 */}
          <div className="w-full overflow-hidden" style={{ height: 12 }}>
            <svg width="100%" height="12" preserveAspectRatio="none">
              <path d={`M0,12 ${Array.from({ length: 40 }, (_, i) => `Q${i * 5 + 2.5},0 ${i * 5 + 5},12`).join(' ')}`} fill="white" />
            </svg>
          </div>
          <div className="bg-white px-4 py-3">
            {/* 小票标题 */}
            <div className="text-center mb-3">
              <p className="text-[11px] text-gray-700 tracking-widest font-bold">米伴订单</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</p>
            </div>
            {/* 虚线分隔 */}
            <div className="border-t border-dashed border-gray-300 mb-3" />
            {/* 表头 */}
            <div className="flex text-[10px] text-gray-600 mb-2">
              <span className="flex-1">品名</span>
              <span className="w-10 text-right">重量</span>
              <span className="w-16 text-right">单价</span>
              <span className="w-14 text-right">小计</span>
            </div>
            {/* 明细行 */}
            {(() => {
              const selRices = allRiceList.filter(r => selected.includes(r.id));
              return selRices.map(rice => {
                const jin = parseFloat(((ratios[rice.id] ?? 0) / 100 * weight).toFixed(1));
                const unitPrice = rice.price ?? 0;
                const subtotal = parseFloat((jin * unitPrice).toFixed(2));
                return (
                  <div key={rice.id} className="flex items-baseline text-[12px] mb-1.5">
                    <span className="flex-1 text-gray-800 truncate flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: rice.color }} />
                      {rice.name}
                    </span>
                    <span className="w-10 text-right text-gray-700">{jin}斤</span>
                    <span className="w-16 text-right text-gray-700">{unitPrice.toFixed(2)}</span>
                    <span className="w-14 text-right font-semibold text-gray-800">{subtotal.toFixed(2)}</span>
                  </div>
                );
              });
            })()}
            {/* 虚线分隔 */}
            <div className="border-t border-dashed border-gray-300 my-3" />
            {/* 合计行 */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[12px] text-gray-700">共 {selected.length} 种米 · {weight} 斤</span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-gray-600">合计 </span>
                <span className="text-[22px] font-bold" style={{ color: "#FF6900" }}>¥{totalPrice().toFixed(2)}</span>
              </div>
            </div>
            {/* 底部感谢语 */}
            <div className="border-t border-dashed border-gray-300 mt-3 pt-2 text-center">
              <p className="text-[10px] text-gray-500">感谢您的订购</p>
            </div>
          </div>
          {/* 底部齿形 */}
          <div className="w-full overflow-hidden" style={{ height: 12 }}>
            <svg width="100%" height="12" preserveAspectRatio="none">
              <path d={`M0,0 ${Array.from({ length: 40 }, (_, i) => `Q${i * 5 + 2.5},12 ${i * 5 + 5},0`).join(' ')}`} fill="white" />
            </svg>
          </div>
        </div>



      </div>
    );
  };

  const renderStep3 = () => {
    const selRices = allRiceList.filter((r) => selected.includes(r.id));
    return (
      <div className="overflow-y-auto px-4 pt-6 pb-28" style={{ flex: "1 1 0", minHeight: 0 }}>
        <div className="text-center mb-6">
          <div className="text-[13px] text-gray-400 mb-1">第四步</div>
          <h2 className="text-[22px] font-bold text-black">你的专属配方</h2>
        </div>
        <div className="bg-white border border-gray-100 rounded-3xl p-5 mb-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <RiceBowl ratios={ratioList} size={120} />
            <div className="text-right">
              <p className="text-[12px] text-gray-400">{weight}斤</p>
              <p className="text-[28px] font-bold" style={{ color: "#FF6900" }}>¥{totalPrice().toFixed(1)}</p>
            </div>
          </div>
          <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: `repeat(${Math.min(selRices.length, 3)}, 1fr)` }}>
            {selRices.map((rice) => (
              <div key={rice.id} className="flex flex-col items-center rounded-2xl py-2.5 px-1.5 gap-1" style={{ background: rice.color + "12", border: `1px solid ${rice.color}30` }}>
                <img
                  src={cosImg(rice.img, 80)}
                  alt={rice.name}
                  className="object-contain"
                  style={{ width: 48, height: 48, mixBlendMode: "multiply" }}
                />
                <span className="text-[11px] font-semibold text-gray-800 text-center leading-tight">{rice.name}</span>
                <span className="text-[11px] font-bold" style={{ color: rice.color }}>{ratios[rice.id] ?? 0}%</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 pt-3">
            <p className="text-[11px] text-gray-400 mb-1.5">给这个配方起个名字</p>
            <input type="text" value={recipeName} onChange={(e) => setRecipeName(e.target.value)} placeholder="例如：我的减脂米、妈妈的养生米…" className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-[13px] text-gray-800 placeholder-gray-400 outline-none border border-gray-200 focus:border-gray-300" />
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
            // 优先从 riceTypes 的 nutrition 字段读取（catalogList 来源），否则回退到硬编码 RICE_NUTRITION
            const riceData = allRiceList.find(x => x.id === r.id) as any;
            const nFromCatalog = riceData?.nutrition;
            const nFromHardcode = RICE_NUTRITION[r.id];
            const kcal    = nFromCatalog ? Number(nFromCatalog.calories ?? nFromCatalog.energy ?? 0) : (nFromHardcode?.kcal ?? 0);
            const carb    = nFromCatalog ? Number(nFromCatalog.carbs   ?? 0) : (nFromHardcode?.carb    ?? 0);
            const protein = nFromCatalog ? Number(nFromCatalog.protein ?? 0) : (nFromHardcode?.protein ?? 0);
            const fat     = nFromCatalog ? Number(nFromCatalog.fat     ?? 0) : (nFromHardcode?.fat     ?? 0);
            const fiber   = nFromCatalog ? Number(nFromCatalog.fiber   ?? 0) : (nFromHardcode?.fiber   ?? 0);
            if (kcal || carb || protein || fat || fiber) {
              totalKcal    += kcal    * grams / 100;
              totalCarb    += carb    * grams / 100;
              totalProtein += protein * grams / 100;
              totalFat     += fat     * grams / 100;
              totalFiber   += fiber   * grams / 100;
            }
          });
          const nutrients = [
            { label: "热量",     value: Math.round(totalKcal),    unit: "kcal", color: "#FF6900", icon: "" },
            { label: "碳水化合物", value: Math.round(totalCarb),    unit: "g",    color: "#F59E0B", icon: "" },
            { label: "蛋白质",   value: Math.round(totalProtein), unit: "g",    color: "#10B981", icon: "" },
            { label: "脂肪",     value: Math.round(totalFat),     unit: "g",    color: "#6366F1", icon: "" },
            { label: "膳食纤维", value: Math.round(totalFiber),   unit: "g",    color: "#8B5CF6", icon: "" },
          ];
          return (
            <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[13px] font-semibold text-black">营养成分估算</span>
                <span className="text-[11px] text-gray-400 ml-auto">基于 {cartWeight} 斤干米</span>
              </div>
              {/* 热量突出显示 */}
              <div className="flex items-center justify-between bg-orange-50 rounded-xl px-3 py-2.5 mb-3">
                <div className="flex items-center gap-1.5">
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

                {isAuthenticated ? (
          <button
            onClick={() => setShowOrderDialog(true)}
            className="w-full py-4 rounded-2xl text-[15px] font-bold text-white active:scale-[0.98] transition-transform"
            style={{ background: "#FF6900" }}
          >
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
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "#F8F6F3" }}>
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

      {/* 已选摘要栏：在滚动容器之外，始终固定在视口内，不随内容滚动 */}
      {step === 1 && selected.length > 0 && (
        <div
          className="mx-4 mb-2 flex items-center justify-between px-4 py-2.5 rounded-xl"
          style={{
            background: "#fff",
            border: "1px solid #F0F0F0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            flexShrink: 0,
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-gray-900">已选 {selected.length} 种</span>
            <span className="text-[11px] text-gray-400">
              {allRiceList.filter(r => selected.includes(r.id)).map(r => r.name).join("·") || selected.length + "种已选"}
            </span>
          </div>
          <button
            onClick={() => { [...selected].forEach(id => toggleRice(id, { stopPropagation: () => {} } as any)); }}
            className="text-[11px] text-gray-400 px-2 py-1 rounded-lg"
            style={{ background: "#F5F5F5" }}
          >
            清空
          </button>
        </div>
      )}

      <div className={step === 0 ? "flex-1 flex flex-col overflow-hidden" : "flex-1 flex flex-col overflow-hidden"}>
        {steps[step]()}
      </div>

      <div className="fixed bottom-14 left-0 right-0 px-4 pb-4 pt-3 bg-white border-t border-gray-100 z-30">
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
                    const rice = allRiceList.find((r) => r.id === id);
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

      {/* ─── 下单弹窗 ─────────────────────────────────────────── */}
      {showOrderDialog && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end" onClick={() => setShowOrderDialog(false)}>
          <div className="w-full bg-white rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <span className="text-[17px] font-bold text-black">确认下单</span>
              <button onClick={() => setShowOrderDialog(false)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            {/* 订单摘要 */}
            <div className="bg-orange-50 rounded-2xl p-4 mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] text-gray-600">{recipeName || "我的专属米"}</span>
                <span className="text-[13px] font-bold text-[#FF6900]">{weight}斤</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {selected.map((id) => {
                  const rice = allRiceList.find(r => r.id === id)!;
                  const pct = ratios[id] ?? Math.round(100 / selected.length);
                  return (
                    <span key={id} className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-orange-100 text-gray-600">
                      {rice.name} <span className="font-semibold text-[#FF6900]">{pct}%</span>
                    </span>
                  );
                })}
              </div>
              <div className="flex items-center justify-between border-t border-orange-100 pt-2">
                <span className="text-[12px] text-gray-500">应付金额</span>
                <span className="text-[20px] font-bold text-black">¥{totalPrice().toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between pt-1.5 relative">
                <button
                  onClick={() => setShowWalletDetail(v => !v)}
                  className="flex items-center gap-1.5 active:opacity-70 transition-opacity"
                >
                  <Wallet size={13} className="text-gray-400" />
                  <span className="text-[12px] text-gray-400">可用余额</span>
                  <ChevronDown size={11} className={`text-gray-400 transition-transform ${showWalletDetail ? 'rotate-180' : ''}`} />
                </button>
                <div className="flex items-center gap-2">
                  {totalAvailableCny < totalPrice() && (
                    <button onClick={() => { setShowOrderDialog(false); window.location.href = "/recharge"; }} className="text-[11px] text-[#FF6900] font-semibold">去充値</button>
                  )}
                  <span className={`text-[13px] font-semibold ${totalAvailableCny >= totalPrice() ? 'text-green-600' : 'text-red-500'}`}>¥{totalAvailableCny.toFixed(2)}</span>
                </div>
                {/* 钉子弹出明细 */}
                {showWalletDetail && (
                  <div className="absolute top-7 left-0 bg-white border border-gray-100 rounded-2xl shadow-lg p-4 z-40 w-64">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[13px] font-semibold text-black">脉动网錢包</span>
                      <button onClick={() => setShowWalletDetail(false)}><X size={14} className="text-gray-400" /></button>
                    </div>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-gray-500">CNY 余额</span>
                        <span className="text-[14px] font-bold text-black">¥{cnyBalanceNum.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-gray-500">USDT 余额</span>
                        <div className="text-right">
                          <span className="text-[14px] font-bold text-black">{usdtBalanceNum.toFixed(2)} U</span>
                          <div className="text-[11px] text-gray-400 mt-0.5">= ¥{(usdtBalanceNum * usdtCnyRate).toFixed(2)}</div>
                        </div>
                      </div>
                      <div className="border-t border-gray-100 pt-2 flex items-center justify-between">
                        <span className="text-[12px] text-gray-500">可用总额</span>
                        <span className={`text-[15px] font-bold ${totalAvailableCny >= totalPrice() ? 'text-green-600' : 'text-red-500'}`}>¥{totalAvailableCny.toFixed(2)}</span>
                      </div>
                      <p className="text-[10px] text-gray-400">1 USDT = ¥{usdtCnyRate.toFixed(2)}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* 收货信息 */}
            <div className="space-y-3 mb-5">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-black">收货信息</p>
                {savedAddresses && savedAddresses.length > 0 && (
                  <button
                    onClick={() => setShowAddressPicker(v => !v)}
                    className="flex items-center gap-1 text-[12px] font-medium active:opacity-70 transition-opacity"
                    style={{ color: "#FF6900" }}
                  >
                    <BookMarked className="w-3.5 h-3.5" />
                    从地址簿选择
                  </button>
                )}
              </div>
              {/* 地址簿选择面板 */}
              {showAddressPicker && (
                <div className="border border-orange-200 rounded-2xl p-3 bg-orange-50/30">
                  <AddressBook
                    mode="select"
                    onSelect={(addr) => {
                      setReceiverName(addr.name);
                      setReceiverPhone(addr.phone);
                      setReceiverAddress(`${addr.province}${addr.city}${addr.district ?? ""}${addr.detail}`);
                      setShowAddressPicker(false);
                      setSelectedFromBook(true);
                      setSaveToBook(false);
                    }}
                  />
                </div>
              )}
              <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3">
                <User size={15} className="text-gray-400 flex-shrink-0" />
                <input
                  type="text" value={receiverName} onChange={(e) => { setReceiverName(e.target.value); setSelectedFromBook(false); }}
                  placeholder="收货人姓名"
                  className="flex-1 text-[14px] text-black outline-none bg-transparent"
                />
              </div>
              <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3">
                <Phone size={15} className="text-gray-400 flex-shrink-0" />
                <input
                  type="tel" value={receiverPhone} onChange={(e) => { setReceiverPhone(e.target.value); setSelectedFromBook(false); }}
                  placeholder="手机号码"
                  className="flex-1 text-[14px] text-black outline-none bg-transparent"
                />
              </div>
              <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3">
                <MapPin size={15} className="text-gray-400 flex-shrink-0" />
                <input
                  type="text" value={receiverAddress} onChange={(e) => { setReceiverAddress(e.target.value); setSelectedFromBook(false); }}
                  placeholder="收货地址（省市区+详细地址）"
                  className="flex-1 text-[14px] text-black outline-none bg-transparent"
                />
              </div>
              <textarea
                value={userNote} onChange={(e) => setUserNote(e.target.value)}
                placeholder="备注（可选）"
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-black outline-none bg-transparent resize-none"
              />
              {/* 保存到地址簿开关：仅新输入时显示 */}
              {!selectedFromBook && (
                <button
                  onClick={() => setSaveToBook(v => !v)}
                  className="flex items-center gap-2.5 w-full px-4 py-3 rounded-xl transition-all active:scale-[0.99]"
                  style={{
                    background: saveToBook ? "rgba(255,105,0,0.08)" : "#F8F8F8",
                    border: saveToBook ? "1.5px solid rgba(255,105,0,0.3)" : "1.5px solid transparent",
                  }}
                >
                  <div
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                    style={{ borderColor: saveToBook ? "#FF6900" : "#DDD", background: saveToBook ? "#FF6900" : "transparent" }}
                  >
                    {saveToBook && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-[13px] font-semibold" style={{ color: saveToBook ? "#FF6900" : "#333" }}>保存到地址簿</p>
                    <p className="text-[11px] text-gray-400">下次下单可直接选用，无需重新填写</p>
                  </div>
                  <BookMarked className="w-4 h-4 flex-shrink-0" style={{ color: saveToBook ? "#FF6900" : "#CCC" }} />
                </button>
              )}
            </div>
            {/* 下单按钮 */}
            <button
              disabled={createOrder.isPending || !receiverName.trim() || !receiverPhone.trim() || !receiverAddress.trim() || totalAvailableCny < totalPrice()}
              onClick={() => {
                const price = totalPrice();
                setPendingOrderPrice(price);
                const ingredients = selected.map((id) => {
                  const rice = allRiceList.find(r => r.id === id)!;
                  const pct = ratios[id] ?? Math.round(100 / selected.length);
                  const w = Math.round(weight * pct / 100 * 10) / 10;
                  // riceId: db_ 前缀去掉取数字，否则用 0
                  const numId = id.startsWith("db_") ? parseInt(id.slice(3), 10) : 0;
                  return { riceId: numId, name: rice.name, percentage: pct, colorHex: rice.color, weightJin: w };
                });
                // 如果勾选了保存到地址簿，在下单同时保存地址
                if (saveToBook && receiverName.trim() && receiverPhone.trim() && receiverAddress.trim()) {
                  addAddressMut.mutate({
                    name: receiverName.trim(),
                    phone: receiverPhone.trim(),
                    province: "",
                    city: "",
                    district: "",
                    detail: receiverAddress.trim(),
                    label: "其他",
                    isDefault: false,
                  });
                }
                createOrder.mutate({
                  recipeName: recipeName || "我的专属米",
                  ingredients,
                  totalWeightJin: weight,
                  totalPrice: price,
                  receiverName: receiverName.trim(),
                  receiverPhone: receiverPhone.trim(),
                  receiverAddress: receiverAddress.trim(),
                  userNote: userNote.trim() || undefined,
                });
              }}
              className="w-full py-4 rounded-2xl text-[15px] font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
              style={{ background: "#FF6900" }}
            >
              {createOrder.isPending ? <><Loader2 size={18} className="animate-spin" />提交中…</> : totalAvailableCny < totalPrice() ? "余额不足，请先充值" : `确认下单 · 扣款 ¥${totalPrice().toFixed(2)}`}
            </button>
          </div>
        </div>
      )}

      {/* ─── 下单成功弹窗 ─────────────────────────────────────────── */}
      {orderSuccess && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={() => setOrderSuccess(null)}>
          <div className="w-full max-w-[340px] bg-white rounded-3xl p-7 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-green-500" />
            </div>
            <p className="text-[18px] font-bold text-black mb-1">下单成功！</p>
            <p className="text-[13px] text-gray-400 mb-4">订单号 {orderSuccess.orderNo}</p>
            <div className="bg-orange-50 rounded-2xl px-5 py-4 mb-5">
              <p className="text-[12px] text-gray-500 mb-1">已从钱包扣除</p>
              <p className="text-[22px] font-bold text-[#FF6900]">¥{totalPrice().toFixed(2)}</p>
              <p className="text-[11px] text-gray-400 mt-1">优先扣 CNY，不足部分按实时汇率扣 USDT</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setOrderSuccess(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-[14px] text-gray-600">继续配米</button>
              <button onClick={() => { setOrderSuccess(null); window.location.href = "/p/proj_hzxm2t/my-orders"; }} className="flex-1 py-3 rounded-xl text-[14px] font-semibold text-white" style={{ background: "#FF6900" }}>查看订单</button>
            </div>
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
