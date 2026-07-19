/**
 * TianguiPearDetail - 天桂梨产品介绍页
 * 路由：/p/proj_hzxm2t/pear/tiangui
 * 无缝海报长图风格，与米伴网整体设计一致
 */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, MapPin, Phone, User, Check, Loader2, BookMarked, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { useAuth } from "@/_core/hooks/useAuth";
import AddressBook from "./AddressBook";

const IMGS = {
  hero:    "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-pear/hero_fresh.webp",
  juicy:   "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-pear/hero_juicy.webp",
  giftbox: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-pear/hero_giftbox_scene.webp",
  orchard: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-pear/hero_orchard.webp",
  scene:   "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/miban-pear/hero_scene.webp",
};

const SLIDES = [IMGS.hero, IMGS.juicy, IMGS.giftbox];

const SPECS = [
  { name: "5斤 精品装", sub: "约8–10个 · 顺丰包邮", price: 58, weightJin: 5 },
  { name: "8斤 家庭装", sub: "约14–16个 · 顺丰包邮", price: 88, weightJin: 8 },
  { name: "12枚 礼盒装", sub: "精品礼盒 · 防撞网套 · 送礼首选", price: 128, weightJin: 12, featured: true },
];

export default function TianguiPearDetail() {
  const [cur, setCur] = useState(0);
  const [spec, setSpec] = useState(0);
  const [qty, setQty] = useState(1);
  const trackRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const [, navigate] = useLocation();

  // 下单相关状态
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [receiverAddress, setReceiverAddress] = useState("");
  const [userNote, setUserNote] = useState("");
  const [saveToBook, setSaveToBook] = useState(false);
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{ orderNo: string } | null>(null);

  const { isAuthenticated } = useAuth();
  const { data: savedAddresses } = mtrpc.address.list.useQuery(undefined, { enabled: isAuthenticated });
  const addAddressMut = mtrpc.address.add.useMutation();
  const { data: cnyBalance } = trpc.recharge.getCnyBalance.useQuery(undefined, { enabled: isAuthenticated });
  const { data: usdtBalance } = trpc.recharge.getBalance.useQuery(undefined, { enabled: isAuthenticated });
  const { data: cryptoPrices } = trpc.getCryptoPrices.useQuery(undefined, { staleTime: 30000 });
  const cnyBalanceNum = Number(cnyBalance ?? 0);
  const usdtBalanceNum = Number(usdtBalance ?? 0);
  const usdtCnyRate = cryptoPrices?.usdtCnyRate ?? 7.3;
  const totalAvailableCny = cnyBalanceNum + usdtBalanceNum * usdtCnyRate;

  const createOrder = mtrpc.order.create.useMutation({
    onSuccess: (data) => {
      setShowOrderDialog(false);
      setOrderSuccess({ orderNo: data.orderNo });
    },
    onError: (err) => {
      alert(err.message || "下单失败，请重试");
    },
  });

  useEffect(() => {
    if (trackRef.current) {
      trackRef.current.style.transform = `translateX(-${cur * 100}%)`;
    }
  }, [cur]);

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - startXRef.current;
    if (dx < -40 && cur < SLIDES.length - 1) setCur(c => c + 1);
    else if (dx > 40 && cur > 0) setCur(c => c - 1);
  };

  const currentSpec = SPECS[spec];

  const handleBuy = () => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    setShowOrderDialog(true);
  };

  const handleSubmitOrder = () => {
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
      recipeName: `天桂梨 · ${currentSpec.name}${qty > 1 ? ` x${qty}` : ""}`,
      ingredients: [],
      totalWeightJin: totalWeightJin,
      totalPrice: totalPrice,
      receiverName: receiverName.trim(),
      receiverPhone: receiverPhone.trim(),
      receiverAddress: receiverAddress.trim(),
      userNote: userNote.trim() || undefined,
    });
  };

  const features = [
    { num: "13%+", unit: "", title: "糖度超高", desc: "可溶性固形物高达13%以上，比普通梨甜约30%" },
    { num: "0", unit: "渣", title: "细嫩无渣", desc: "石细胞极少，入口即化，汁水丰盈充盈口腔" },
    { num: "20", unit: "天", title: "极早熟稀缺", desc: "7月中旬抢鲜上市，全年仅20天黄金采摘期" },
    { num: "双", unit: "认证", title: "国家认证", desc: "地理标志保护产品 + 国家绿色食品双重认证" },
  ];

  const nutrition = [
    { name: "热量", val: "44 kcal", pct: 28, color: "#FF6900" },
    { name: "碳水化合物", val: "13.1 g", pct: 75, color: "#FF6900" },
    { name: "可溶性糖（糖度）", val: ">13%", pct: 90, color: "#FF6900" },
    { name: "膳食纤维", val: "3.1 g", pct: 30, color: "#2D7D46" },
    { name: "蛋白质", val: "0.4 g", pct: 15, color: "#7B5EA7" },
    { name: "维生素 C", val: "6 mg", pct: 20, color: "#2D7D46" },
  ];

  const compare = [
    { dim: "糖度", ours: "13%+", theirs: "10–12%" },
    { dim: "口感", ours: "极细嫩无渣", theirs: "偏硬带渣感" },
    { dim: "上市时间", ours: "7月中旬", theirs: "8–10月" },
    { dim: "单果重量", ours: "250–500g", theirs: "150–300g" },
    { dim: "资质认证", ours: "双重国家认证", theirs: "—", badge: true },
  ];

  const logistics = [
    { title: "顺丰冷链", desc: "全程冷链配送，锁住每一分新鲜" },
    { title: "现摘现发", desc: "清晨采摘，严格分拣，当日发货" },
    { title: "坏果包赔", desc: "签收24小时内坏果，拍照联系客服赔付" },
    { title: "专业包装", desc: "防撞网套+珍珠棉，安全到达有保证" },
  ];

  const tips = [
    { label: "关于口感", text: "天桂梨为极早熟品种，收到后即可食用。如喜欢更软糯口感，可常温放置1–2天后再食用。" },
    { label: "关于外观", text: "果皮上的自然麻点为品种特性，是充足日照和自然成熟的证明，不影响食用，请放心享用。" },
    { label: "关于储存", text: "建议冷藏保存（4–8°C），风味更佳，最佳赏味期为收到后7天内。" },
    { label: "关于季节", text: "天桂梨全年仅有约20天黄金采摘期（7月中旬），错过需等明年，请尽早下单。" },
  ];

  const totalPrice = currentSpec.price * qty;
  const totalWeightJin = currentSpec.weightJin * qty;
  const canSubmit = receiverName.trim() && receiverPhone.trim() && receiverAddress.trim() && !createOrder.isPending;
  const balanceOk = totalAvailableCny >= totalPrice;

  return (
    <div className="min-h-screen bg-white pb-20" style={{ maxWidth: 480, margin: "0 auto" }}>

      {/* ── 主图轮播 ── */}
      <div
        className="relative overflow-hidden"
        style={{ background: "#f5f0e8" }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={trackRef}
          className="flex"
          style={{ transition: "transform 0.35s cubic-bezier(0.23,1,0.32,1)" }}
        >
          {SLIDES.map((src, i) => (
            <div key={i} className="flex-shrink-0 w-full" style={{ aspectRatio: "1/1", overflow: "hidden" }}>
              <img src={src} alt={`天桂梨图${i + 1}`} className="w-full h-full object-cover" loading={i === 0 ? "eager" : "lazy"} />
            </div>
          ))}
        </div>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setCur(i)}
              className="h-1.5 rounded-full border-none cursor-pointer transition-all"
              style={{ width: i === cur ? 14 : 5, background: i === cur ? "#fff" : "rgba(255,255,255,0.45)" }}
            />
          ))}
        </div>
        <Link href="/p/proj_hzxm2t">
          <button className="absolute top-3 left-3 w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer" style={{ background: "rgba(255,255,255,0.85)" }}>
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
        </Link>
      </div>

      {/* ── 商品基本信息 ── */}
      <div className="px-4 pt-4 pb-3 bg-white">
        <div className="flex flex-wrap gap-1.5 mb-2">
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "#FFF3E8", color: "#FF6900" }}>极早熟</span>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "#F0FAF4", color: "#2D7D46" }}>地理标志产品</span>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "#F0FAF4", color: "#2D7D46" }}>绿色食品认证</span>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "#f5f5f5", color: "#888" }}>广丰直发</span>
        </div>
        <h1 className="text-2xl font-extrabold text-gray-900 leading-tight mb-1">天桂梨</h1>
        <p className="text-sm text-gray-400 mb-3">江西广丰 · 夏日第一口清甜 · 糖度 &gt;13%</p>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-3xl font-extrabold" style={{ color: "#FF6900" }}>¥{currentSpec.price}</span>
          <span className="text-sm text-gray-300 line-through">¥{Math.round(currentSpec.price * 1.35)}</span>
        </div>
        <p className="text-xs text-gray-300 mb-4">{currentSpec.name} · 顺丰冷链包邮 · 坏果包赔</p>
        <p className="text-xs font-bold text-gray-900 mb-2">选择规格</p>
        <div className="flex flex-wrap gap-2">
          {SPECS.map((s, i) => (
            <button
              key={i}
              onClick={() => setSpec(i)}
              className="px-4 py-2 rounded-xl text-sm font-semibold border transition-all"
              style={spec === i
                ? { borderColor: "#FF6900", color: "#FF6900", background: "#FFF3E8" }
                : { borderColor: "#e8e8e8", color: "#333", background: "#fff" }
              }
            >
              {s.name}
            </button>
          ))}
        </div>
        {/* 数量选择 */}
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs font-bold text-gray-900">数量</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQty(q => Math.max(1, q - 1))}
              className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold border transition-all"
              style={{ borderColor: qty <= 1 ? "#e8e8e8" : "#FF6900", color: qty <= 1 ? "#ccc" : "#FF6900", background: "#fff" }}
            >−</button>
            <span className="text-base font-extrabold text-gray-900 w-6 text-center">{qty}</span>
            <button
              onClick={() => setQty(q => q + 1)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold border transition-all"
              style={{ borderColor: "#FF6900", color: "#FF6900", background: "#fff" }}
            >+</button>
          </div>
        </div>
      </div>

      {/* ── 核心卖点 ── */}
      <div style={{ background: "linear-gradient(135deg,#FFF8F0 0%,#FFF3E8 50%,#FFF8F0 100%)", padding: "28px 20px" }}>
        <div className="text-center text-xl font-extrabold text-gray-900 mb-1">为什么选天桂梨</div>
        <div className="text-center text-xs text-gray-400 mb-5">四大核心优势，一颗好梨的全部理由</div>
        <div className="flex flex-col">
          {features.map((f, i) => (
            <div key={i} className="flex items-center py-3.5" style={{ borderBottom: i < features.length - 1 ? "1px solid rgba(255,105,0,0.08)" : "none" }}>
              <div className="min-w-[72px] leading-none">
                <span className="text-3xl font-extrabold" style={{ color: "#FF6900" }}>{f.num}</span>
                <span className="text-sm font-semibold" style={{ color: "#FF6900" }}>{f.unit}</span>
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900 mb-0.5">{f.title}</div>
                <div className="text-xs text-gray-400 leading-relaxed">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 果肉展示 ── */}
      <img src={IMGS.juicy} alt="天桂梨果肉微距" className="w-full block" loading="lazy" />
      <div className="bg-white px-5 pt-4 pb-5">
        <div className="text-lg font-extrabold text-gray-900 mb-1.5">极细嫩 · 爆汁甜</div>
        <div className="text-sm text-gray-500 leading-relaxed">洁白如玉的果肉，几乎感受不到石细胞，每一口都是清甜汁水的爆发。冰镇后食用，清凉感翻倍。</div>
      </div>

      {/* ── 数字背书带 ── */}
      <div style={{ background: "#f8f7f5", padding: "24px 20px" }}>
        <div className="flex justify-around items-center">
          {[
            { num: "20", unit: "年", label: "匠心培育" },
            { num: "13%+", unit: "", label: "糖度保证", orange: true },
            { num: "20", unit: "天", label: "黄金赏味期" },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-0">
              {i > 0 && <div style={{ width: 1, height: 36, background: "#e0e0e0", margin: "0 16px" }} />}
              <div className="text-center">
                <div className="leading-none mb-1">
                  <span className="text-3xl font-extrabold" style={{ color: s.orange ? "#FF6900" : "#111" }}>{s.num}</span>
                  {s.unit && <sup className="text-sm font-semibold" style={{ color: s.orange ? "#FF6900" : "#111" }}>{s.unit}</sup>}
                </div>
                <div className="text-xs text-gray-400">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center text-xs text-gray-300 mt-4 tracking-widest">产地直发 · 现摘现发 · 健康有据</div>
      </div>

      {/* ── 品种对比 ── */}
      <div className="bg-white px-5 py-7">
        <div className="text-xl font-extrabold text-gray-900 mb-1">天桂梨 vs 普通梨</div>
        <div className="text-xs text-gray-300 mb-4">数据说话，差距一目了然</div>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {["对比维度", "天桂梨", "普通梨"].map(h => (
                <th key={h} className="text-left py-2.5 px-3 text-xs font-bold text-gray-500" style={{ background: "#f8f7f5" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {compare.map((r, i) => (
              <tr key={i}>
                <td className="py-2.5 px-3 text-gray-500" style={{ borderBottom: i < compare.length - 1 ? "1px solid #f3f3f3" : "none" }}>{r.dim}</td>
                <td className="py-2.5 px-3 font-bold" style={{ color: "#FF6900", borderBottom: i < compare.length - 1 ? "1px solid #f3f3f3" : "none" }}>
                  {r.badge ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#F0FAF4", color: "#2D7D46" }}>{r.ours}</span> : r.ours}
                </td>
                <td className="py-2.5 px-3 text-gray-400" style={{ borderBottom: i < compare.length - 1 ? "1px solid #f3f3f3" : "none" }}>{r.theirs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 营养成分 ── */}
      <div style={{ background: "linear-gradient(180deg,#FFFAF5 0%,#fff 100%)", padding: "28px 20px" }}>
        <div className="text-xl font-extrabold text-gray-900 mb-1">营养成分</div>
        <div className="text-xs text-gray-300 mb-4">每 100g 可食部分 · 数据来源：中国食物成分表</div>
        {nutrition.map((n, i) => (
          <div key={i} className="flex items-center justify-between py-2.5" style={{ borderBottom: i < nutrition.length - 1 ? "1px solid #f0ede8" : "none" }}>
            <span className="text-sm text-gray-500">{n.name}</span>
            <div className="flex items-center gap-2.5">
              <div style={{ width: 72, height: 4, background: "#ede9e3", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${n.pct}%`, height: "100%", background: n.color, borderRadius: 2 }} />
              </div>
              <span className="text-sm font-bold text-gray-900 text-right" style={{ minWidth: 52 }}>{n.val}</span>
            </div>
          </div>
        ))}
        <p className="text-xs text-gray-300 mt-2.5 leading-relaxed">实际营养成分因产地、品种、采摘时间略有差异，仅供参考。</p>
      </div>

      {/* ── 产地溯源 ── */}
      <div className="bg-white">
        <img src={IMGS.orchard} alt="广丰天桂梨果园" className="w-full block" loading="lazy" />
        <div className="px-5 pt-5 pb-6">
          <div className="text-lg font-extrabold text-gray-900 mb-2">江西广丰 · 天桂梨之乡</div>
          <div className="text-sm text-gray-500 leading-relaxed">
            核心产区位于江西省上饶市广丰区吴村镇塘边村，地处闽浙赣交界低山丘陵区，气候湿润，昼夜温差大，土壤含磷丰富、土层深厚肥沃。自1999年引进培育，历经20余年匠心打磨，天桂梨已成为广丰区农业的支柱产业与乡村振兴的"致富果"。
          </div>
          <div className="flex flex-wrap gap-2 mt-3.5">
            <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#F0FAF4", color: "#2D7D46" }}>国家地理标志保护产品</span>
            <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: "#F0FAF4", color: "#2D7D46" }}>国家绿色食品认证</span>
          </div>
        </div>
      </div>

      {/* ── 食用场景 ── */}
      <div style={{ background: "#f8f7f5", padding: "28px 20px" }}>
        <div className="text-xl font-extrabold text-gray-900 mb-1">百变吃法</div>
        <div className="text-xs text-gray-300 mb-4">清凉一夏，怎么吃都好吃</div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "1/1" }}>
            <img src={IMGS.scene} alt="鲜切果盘" className="w-full h-full object-cover" loading="lazy" />
            <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2.5 pt-6 text-sm font-bold text-white" style={{ background: "linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 100%)" }}>鲜切果盘</div>
          </div>
          <div className="relative rounded-xl overflow-hidden" style={{ aspectRatio: "1/1" }}>
            <img src={IMGS.juicy} alt="冰镇鲜食" className="w-full h-full object-cover" loading="lazy" />
            <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2.5 pt-6 text-sm font-bold text-white" style={{ background: "linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 100%)" }}>冰镇鲜食</div>
          </div>
          <div className="relative rounded-xl overflow-hidden col-span-2" style={{ aspectRatio: "2/1" }}>
            <img src={IMGS.hero} alt="鲜榨梨汁" className="w-full h-full object-cover" loading="lazy" />
            <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2.5 pt-6 text-sm font-bold text-white" style={{ background: "linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 100%)" }}>鲜榨梨汁 · 冰糖雪梨</div>
          </div>
        </div>
      </div>

      {/* ── 精选规格 ── */}
      <div className="bg-white px-5 py-7">
        <div className="text-xl font-extrabold text-gray-900 mb-1">精选规格</div>
        <div className="text-xs text-gray-300 mb-4">自用送礼，均有合适之选</div>
        <img src={IMGS.giftbox} alt="天桂梨礼盒" className="w-full block rounded-xl mb-4" loading="lazy" />
        <div className="flex flex-col gap-2.5">
          {SPECS.map((s, i) => (
            <button
              key={i}
              onClick={() => setSpec(i)}
              className="flex items-center justify-between px-4 py-3.5 rounded-xl w-full text-left transition-all"
              style={{
                background: spec === i ? "#FFF3E8" : (s.featured ? "#FFF8F2" : "#f8f7f5"),
                border: spec === i ? "1.5px solid rgba(255,105,0,0.4)" : "1.5px solid transparent",
              }}
            >
              <div>
                <div className="text-sm font-bold text-gray-900">{s.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{s.sub}</div>
              </div>
              <div className="text-lg font-extrabold" style={{ color: "#FF6900" }}>¥{s.price}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ── 物流保障 ── */}
      <div style={{ background: "linear-gradient(180deg,#FFF8F0 0%,#FFF3E8 100%)", padding: "28px 20px" }}>
        <div className="text-xl font-extrabold text-gray-900 mb-1">物流与保障</div>
        <div className="text-xs text-gray-300 mb-4">从枝头到舌尖，每一步都有保障</div>
        <div className="grid grid-cols-2">
          {logistics.map((l, i) => (
            <div key={i} className="p-4" style={{
              borderRight: i % 2 === 0 ? "1px solid rgba(255,105,0,0.12)" : "none",
              borderBottom: i < 2 ? "1px solid rgba(255,105,0,0.12)" : "none",
            }}>
              <div className="mb-2.5" style={{ width: 20, height: 2, background: "#FF6900", borderRadius: 1 }} />
              <div className="text-sm font-bold text-gray-900 mb-1">{l.title}</div>
              <div className="text-xs text-gray-400 leading-relaxed">{l.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 温馨提示 ── */}
      <div className="bg-white px-5 pt-7 pb-8">
        <div className="text-xl font-extrabold text-gray-900 mb-1">温馨提示</div>
        <div className="text-xs text-gray-300 mb-4">收到后请注意以下事项</div>
        {tips.map((t, i) => (
          <div key={i} className="flex gap-2.5 mb-3 last:mb-0">
            <div className="flex-shrink-0 mt-1.5" style={{ width: 4, height: 4, borderRadius: "50%", background: "#FF6900" }} />
            <div className="text-sm text-gray-500 leading-relaxed">
              <span className="font-semibold text-gray-700">{t.label}：</span>{t.text}
            </div>
          </div>
        ))}
      </div>

      {/* ── 底部购买栏 ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex gap-2.5 px-4 py-2.5 border-t border-gray-100" style={{ background: "rgba(255,255,255,0.97)", backdropFilter: "blur(10px)", maxWidth: 480, margin: "0 auto", paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))" }}>
        <button className="w-14 h-14 rounded-xl flex items-center justify-center text-xs font-semibold text-gray-500 border-none" style={{ background: "#f5f5f5", flexShrink: 0 }}>
          收藏
        </button>
        <button
          className="flex-1 h-14 rounded-xl border-none text-white text-base font-extrabold tracking-wide active:scale-[0.98] transition-transform"
          style={{ background: "linear-gradient(90deg,#FF8C00 0%,#FF6900 100%)" }}
          onClick={handleBuy}
        >
          立即购买 · ¥{totalPrice}
        </button>
      </div>

      {/* ── 下单对话框 ── */}
      {showOrderDialog && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center" onClick={() => setShowOrderDialog(false)}>
          <div
            className="w-full bg-white rounded-t-3xl p-6 pb-8"
            style={{ maxWidth: 480, maxHeight: "85vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-lg font-extrabold text-gray-900">确认订单</div>
                <div className="text-xs text-gray-400 mt-0.5">天桂梨 · {currentSpec.name}{qty > 1 ? ` x${qty}` : ""} · ¥{totalPrice}</div>
              </div>
              <button onClick={() => setShowOrderDialog(false)} className="w-8 h-8 rounded-full flex items-center justify-center border-none" style={{ background: "#f5f5f5" }}>
                <X size={16} className="text-gray-500" />
              </button>
            </div>

            {/* 余额提示 */}
            {isAuthenticated && (
              <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: balanceOk ? "#F0FAF4" : "#FFF3E8" }}>
                <span style={{ color: balanceOk ? "#2D7D46" : "#FF6900" }}>
                  钱包余额 ¥{totalAvailableCny.toFixed(2)}
                  {balanceOk ? " · 余额充足" : " · 余额不足，请先充值"}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {/* 地址簿快选 */}
              {savedAddresses && savedAddresses.length > 0 && (
                <button
                  onClick={() => setShowAddressPicker(v => !v)}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm text-gray-500 border-none"
                  style={{ background: "#f8f7f5" }}
                >
                  <BookMarked size={15} className="text-gray-400" />
                  从地址簿选择
                </button>
              )}
              {showAddressPicker && (
                <div className="rounded-xl overflow-hidden border border-gray-100">
                  <AddressBook
                    mode="select"
                    onSelect={(addr) => {
                      setReceiverName(addr.name);
                      setReceiverPhone(addr.phone);
                      setReceiverAddress(`${addr.province}${addr.city}${addr.district ?? ""}${addr.detail}`);
                      setShowAddressPicker(false);
                    }}
                  />
                </div>
              )}

              {/* 收货人姓名 */}
              <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3">
                <User size={15} className="text-gray-400 flex-shrink-0" />
                <input
                  type="text" value={receiverName} onChange={e => setReceiverName(e.target.value)}
                  placeholder="收货人姓名"
                  className="flex-1 text-[14px] text-black outline-none bg-transparent"
                />
              </div>
              {/* 手机号 */}
              <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3">
                <Phone size={15} className="text-gray-400 flex-shrink-0" />
                <input
                  type="tel" value={receiverPhone} onChange={e => setReceiverPhone(e.target.value)}
                  placeholder="手机号"
                  className="flex-1 text-[14px] text-black outline-none bg-transparent"
                />
              </div>
              {/* 收货地址 */}
              <div className="flex items-start gap-3 border border-gray-200 rounded-xl px-4 py-3">
                <MapPin size={15} className="text-gray-400 flex-shrink-0 mt-0.5" />
                <input
                  type="text" value={receiverAddress} onChange={e => setReceiverAddress(e.target.value)}
                  placeholder="收货地址（省市区+详细地址）"
                  className="flex-1 text-[14px] text-black outline-none bg-transparent"
                />
              </div>
              {/* 备注 */}
              <textarea
                value={userNote} onChange={e => setUserNote(e.target.value)}
                placeholder="备注（可选）"
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-black outline-none bg-transparent resize-none"
              />
              {/* 保存到地址簿 */}
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
                  <p className="text-[11px] text-gray-400">下次下单可直接选用</p>
                </div>
                <BookMarked className="w-4 h-4 flex-shrink-0" style={{ color: saveToBook ? "#FF6900" : "#CCC" }} />
              </button>
            </div>

            {/* 确认下单按钮 */}
            <button
              disabled={!canSubmit || !balanceOk}
              onClick={handleSubmitOrder}
              className="w-full py-4 rounded-2xl text-[15px] font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform mt-5"
              style={{ background: "#FF6900" }}
            >
              {createOrder.isPending
                ? <><Loader2 size={18} className="animate-spin" />提交中…</>
                : !balanceOk
                  ? "余额不足，请先充值"
                  : `确认下单 · 扣款 ¥${totalPrice}`
              }
            </button>
          </div>
        </div>
      )}

      {/* ── 下单成功弹窗 ── */}
      {orderSuccess && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={() => setOrderSuccess(null)}>
          <div className="w-full max-w-[340px] bg-white rounded-3xl p-7 text-center" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-500" strokeWidth={2.5} />
            </div>
            <div className="text-xl font-extrabold text-gray-900 mb-2">下单成功</div>
            <div className="text-sm text-gray-400 mb-1">订单号：{orderSuccess.orderNo}</div>
            <div className="text-sm text-gray-400 mb-6">我们将尽快安排发货，请保持手机畅通</div>
            <div className="flex gap-3">
              <button
                onClick={() => { setOrderSuccess(null); navigate("/p/proj_hzxm2t/my-orders"); }}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white border-none"
                style={{ background: "#FF6900" }}
              >
                查看订单
              </button>
              <button
                onClick={() => setOrderSuccess(null)}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-gray-600 border-none"
                style={{ background: "#f5f5f5" }}
              >
                继续浏览
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

