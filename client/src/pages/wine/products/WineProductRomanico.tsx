/**
 * 罗马尼克干红葡萄酒 ROMANICO - 商品详情页
 * 路径: /wine/product/romanico
 * 
 * Teso La Monja · 西班牙托罗产区 · RP 92分
 * 高端旗舰产品，含国际评分展示
 */
import { useLocation } from "wouter";
import { ArrowLeft, Share2, ShoppingCart, Wine, Award, ChefHat, Star, Grape } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";

const ROMANICO_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/romanico-bottle_916866b6.png";

const SPECS = [
  { label: "国  家", value: "西班牙 🇪🇸" },
  { label: "产  区", value: "托罗 Toro" },
  { label: "酒精度", value: "14.5%vol" },
  { label: "规  格", value: "750ml" },
  { label: "品  种", value: "100% 丹魄 Tinta de Toro" },
  { label: "橡木桶", value: "法国橡木桶陈酿 6 个月" },
  { label: "葡萄园", value: "海拔 750-850m 有机葡萄园" },
];

const SCORES = [
  { org: "罗伯特·帕克 RP", score: 92 },
  { org: "斯蒂芬·坦泽", score: 91 },
  { org: "佩宁评分", score: 92 },
];

export default function WineProductRomanico() {
  const [, setLocation] = useLocation();

  const handleShare = () => {
    const url = `${window.location.origin}/wine/product/romanico`;
    if (navigator.share) {
      navigator.share({
        title: "罗马尼克 ROMANICO · Teso La Monja",
        text: "RP 92分！来自西班牙托罗产区，酒体饱满丰腴，余味悠长",
        url,
      });
    } else {
      navigator.clipboard.writeText(url).then(() => toast.success("链接已复制"));
    }
  };

  const handleBuy = () => {
    toast.info("请联系商家下单", { description: "微信搜索「红酒文化商会」或致电咨询" });
  };

  return (
    <div className="min-h-screen bg-[#0d0505] text-[#e8d5b7] pb-28">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-20 bg-[#0d0505]/95 backdrop-blur-sm border-b border-[#8B1A1A]/30 px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation("/wine/brands")} className="text-[#C9A84C] p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-bold text-[#e8d5b7]">罗马尼克干红葡萄酒</h1>
          <p className="text-xs text-[#8a7a6a]">ROMANICO · Teso La Monja</p>
        </div>
        <button onClick={handleShare} className="text-[#C9A84C] p-1">
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      {/* 媒体评语横幅 */}
      <div className="bg-gradient-to-r from-[#2d0d0d] to-[#1a0a0a] border-b border-[#C9A84C]/20 px-4 py-3">
        <p className="text-[#C9A84C]/80 text-xs italic leading-relaxed">
          "这是一款来自托罗产区物超所值的葡萄酒。它酒体饱满，酒体丰腴，余味悠长，其口感堪比50美元或更高价位的葡萄酒。"
        </p>
        <p className="text-[#8a7a6a] text-[10px] mt-1 text-right">——《葡萄酒倡导家》杂志</p>
      </div>

      {/* 主图区域 */}
      <div
        className="relative flex justify-center items-end pt-6 pb-0 overflow-hidden"
        style={{
          minHeight: 300,
          background: "linear-gradient(160deg, #1a0505 0%, #0d0505 60%, #0a0505 100%)",
        }}
      >
        {/* 背景光晕 */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-56 h-32 bg-[#8B1A1A]/20 blur-3xl rounded-full pointer-events-none" />
        <img
          src={ROMANICO_IMG}
          alt="罗马尼克 ROMANICO"
          className="relative z-10 object-contain drop-shadow-2xl"
          style={{ height: 280, width: "auto", maxWidth: "50%" }}
        />
      </div>

      {/* 产品名称 & 价格 */}
      <div className="px-4 pt-5 pb-3 border-b border-[#8B1A1A]/20">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-[#e8d5b7] leading-tight">罗马尼克</h2>
            <p className="text-[#C9A84C] text-sm tracking-[0.2em] mt-0.5">ROMANICO</p>
            <p className="text-[#8a7a6a] text-xs mt-1">Teso La Monja · 托罗产区</p>
          </div>
          <div className="text-right">
            <p className="text-[#C9A84C] text-2xl font-bold">¥328</p>
            <p className="text-[#8a7a6a] text-xs line-through">¥468</p>
          </div>
        </div>
        {/* 国际评分徽章 */}
        <div className="flex gap-2 mt-3">
          {SCORES.map((s) => (
            <div key={s.org} className="flex items-center gap-1 bg-[#C9A84C]/10 border border-[#C9A84C]/30 rounded-lg px-2 py-1">
              <Star className="w-3 h-3 text-[#C9A84C] fill-[#C9A84C]" />
              <span className="text-[#C9A84C] text-xs font-bold">{s.score}</span>
            </div>
          ))}
          <span className="text-[#8a7a6a] text-xs self-center ml-1">国际评分</span>
        </div>
      </div>

      {/* 核心概要 */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Grape className="w-4 h-4 text-[#C9A84C]" />
          <h3 className="text-sm font-semibold text-[#C9A84C]">核心概要</h3>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[#1a0a0a] border border-[#8B1A1A]/20 rounded-xl p-3 text-center">
            <p className="text-[#C9A84C] text-lg">🍇</p>
            <p className="text-[#e8d5b7] text-xs font-bold mt-1">100%丹魄</p>
            <p className="text-[#8a7a6a] text-[10px]">Tinta de Toro</p>
          </div>
          <div className="bg-[#1a0a0a] border border-[#8B1A1A]/20 rounded-xl p-3 text-center">
            <p className="text-[#C9A84C] text-lg">🍷</p>
            <p className="text-[#e8d5b7] text-xs font-bold mt-1">14.5% 度</p>
            <p className="text-[#8a7a6a] text-[10px]">酒精浓度</p>
          </div>
          <div className="bg-[#1a0a0a] border border-[#8B1A1A]/20 rounded-xl p-3 text-center">
            <p className="text-[#C9A84C] text-lg">🪣</p>
            <p className="text-[#e8d5b7] text-xs font-bold mt-1">6 个月</p>
            <p className="text-[#8a7a6a] text-[10px]">橡木桶陈酿</p>
          </div>
        </div>
      </div>

      {/* 产品规格表 */}
      <div className="px-4 pt-2 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Wine className="w-4 h-4 text-[#C9A84C]" />
          <h3 className="text-sm font-semibold text-[#C9A84C]">产品规格</h3>
        </div>
        <div className="bg-[#1a0a0a] rounded-xl border border-[#8B1A1A]/20 overflow-hidden">
          {SPECS.map((spec, i) => (
            <div key={i} className={`flex items-start px-4 py-2.5 ${i < SPECS.length - 1 ? "border-b border-[#8B1A1A]/15" : ""}`}>
              <span className="text-[#8a7a6a] text-xs w-16 flex-shrink-0 pt-0.5">{spec.label}</span>
              <span className="text-[#e8d5b7] text-xs font-medium flex-1">{spec.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 葡萄园 */}
      <div className="px-4 pt-2 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Award className="w-4 h-4 text-[#C9A84C]" />
          <h3 className="text-sm font-semibold text-[#C9A84C]">葡萄园与酿造</h3>
        </div>
        <div className="bg-[#1a0a0a] rounded-xl border border-[#8B1A1A]/20 px-4 py-3 space-y-3">
          <div>
            <p className="text-[#C9A84C] text-xs font-semibold mb-1">葡萄园：</p>
            <p className="text-[#a09080] text-xs leading-relaxed">
              位于托罗产区萨莫拉的有机葡萄园，平均气温21摄氏度，海拔750-850米。全部有机施肥。葡萄藤采用头部整形和高杯式剪枝。
            </p>
          </div>
          <div>
            <p className="text-[#C9A84C] text-xs font-semibold mb-1">酿造方式：</p>
            <p className="text-[#a09080] text-xs leading-relaxed">
              传统方式酿造，100%去梗。在法国橡木桶中进行苹果酸乳酸发酵后陈酿6个月，瓶中成年2个月。
            </p>
          </div>
        </div>
      </div>

      {/* 国际评分详情 */}
      <div className="px-4 pt-2 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Star className="w-4 h-4 text-[#C9A84C]" />
          <h3 className="text-sm font-semibold text-[#C9A84C]">国际评分</h3>
        </div>
        <div className="bg-[#1a0a0a] rounded-xl border border-[#8B1A1A]/20 overflow-hidden">
          {SCORES.map((s, i) => (
            <div key={s.org} className={`flex items-center px-4 py-3 ${i < SCORES.length - 1 ? "border-b border-[#8B1A1A]/15" : ""}`}>
              <span className="text-[#a09080] text-xs flex-1">{s.org}</span>
              <div className="flex items-center gap-1">
                <div className="w-8 h-8 rounded-full border-2 border-[#C9A84C] flex items-center justify-center">
                  <span className="text-[#C9A84C] text-xs font-bold">{s.score}</span>
                </div>
                <span className="text-[#8a7a6a] text-xs">分</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 建议配餐 */}
      <div className="px-4 pt-2 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <ChefHat className="w-4 h-4 text-[#C9A84C]" />
          <h3 className="text-sm font-semibold text-[#C9A84C]">建议配餐</h3>
        </div>
        <div className="flex gap-2 flex-wrap">
          {["烤牛排", "红烧肉", "硬质奶酪", "烤羊腿", "伊比利亚火腿"].map((food) => (
            <span key={food} className="bg-[#2d0d0d] border border-[#8B1A1A]/30 text-[#a09080] text-xs px-3 py-1.5 rounded-full">
              {food}
            </span>
          ))}
        </div>
      </div>

      {/* 购买按钮（固定底部） */}
      <div className="fixed bottom-16 left-0 right-0 z-10 px-4 pb-3 bg-gradient-to-t from-[#0d0505] to-transparent pt-4">
        <button
          onClick={handleBuy}
          className="w-full bg-gradient-to-r from-[#8B1A1A] to-[#6b1414] text-[#e8d5b7] font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 text-base shadow-lg shadow-[#8B1A1A]/40"
        >
          <ShoppingCart className="w-5 h-5" />
          立即咨询购买
        </button>
      </div>

      <BottomNav merchantCode="cx8618" activeTab="brands" />
    </div>
  );
}
