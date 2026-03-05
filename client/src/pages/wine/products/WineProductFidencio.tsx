/**
 * 飞腾干红葡萄酒 FIDENCIO RESERVA - 商品详情页
 * 路径: /wine/product/fidencio
 *
 * 架构规则：
 * - 独立商品详情页，沿用红酒商会主题色（#8B1A1A / #C9A84C）
 * - 包含：酒庄介绍、产品规格、酒评、建议配餐、购买按钮
 * - 图片均存储于腾讯云COS（ap-shanghai），压缩为WebP格式
 */
import { useLocation } from "wouter";
import { ArrowLeft, Share2, ShoppingCart, Wine, Award, ChefHat } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";

const COS_BASE = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com";
const FIDENCIO_HERO = `${COS_BASE}/wine-products/fidencio-hero.webp`;
const FIDENCIO_PAIRING = `${COS_BASE}/wine-products/fidencio-pairing.webp`;

const SPECS = [
  { label: "国  家", value: "西班牙 🇪🇸" },
  { label: "年  份", value: "2016" },
  { label: "产  区", value: "拉曼恰 La Mancha" },
  { label: "酒精度", value: "13.5%vol" },
  { label: "规  格", value: "750ml" },
  { label: "等  级", value: "DO / RESERVA" },
  { label: "品  种", value: "丹魄 Tempranillo" },
];

export default function WineProductFidencio() {
  const [, setLocation] = useLocation();

  const handleShare = () => {
    const url = `${window.location.origin}/wine/product/fidencio`;
    if (navigator.share) {
      navigator.share({ title: "飞腾干红葡萄酒 FIDENCIO RESERVA", text: "来自西班牙拉曼恰产区，100%丹魄酿制，12个月橡木桶陈酿", url });
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
          <h1 className="text-sm font-bold text-[#e8d5b7]">飞腾干红葡萄酒</h1>
          <p className="text-xs text-[#8a7a6a]">FIDENCIO RESERVA · 圣女酒庄</p>
        </div>
        <button onClick={handleShare} className="text-[#C9A84C] p-1">
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      {/* 酒庄介绍横幅 */}
      <div className="bg-[#1a0a0a] border-b border-[#8B1A1A]/20 px-4 py-3 flex gap-3 items-start">
        <div className="bg-[#8B1A1A]/30 border border-[#8B1A1A]/50 rounded-lg px-3 py-2 text-center min-w-[80px]">
          <p className="text-[#C9A84C] text-xs font-bold leading-tight">圣女酒庄</p>
          <p className="text-[#8a7a6a] text-[10px] mt-0.5">VIRGEN DE LAS VIÑAS</p>
        </div>
        <p className="text-[#a09080] text-xs leading-relaxed flex-1">
          圣女酒庄坐落于西班牙拉曼恰产区，其历史可追溯到1961年，1995年始得益于政府帮助开始酿造葡萄酒。50多年历史中，巧妙地将传统工艺与尖端技术相结合，跻身于葡萄酒行业前列。
        </p>
      </div>

      {/* 主图区域 */}
      <div className="relative bg-gradient-to-b from-[#1a0a0a] to-[#0d0505] flex justify-center items-end pt-6 pb-0 overflow-hidden" style={{ minHeight: 300 }}>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-56 h-56 rounded-full bg-[#8B1A1A]/15 blur-3xl" />
        </div>
        <img
          src={FIDENCIO_HERO}
          alt="飞腾干红葡萄酒 FIDENCIO RESERVA"
          className="relative z-10 object-contain drop-shadow-2xl"
          style={{ height: 280, width: "auto", maxWidth: "90%" }}
        />
      </div>

      {/* 产品名称 & 价格 */}
      <div className="px-4 pt-5 pb-3 border-b border-[#8B1A1A]/20">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-[#e8d5b7] leading-tight">飞腾干红葡萄酒</h2>
            <p className="text-[#C9A84C] text-sm tracking-widest mt-0.5">FIDENCIO RESERVA</p>
          </div>
          <div className="text-right">
            <p className="text-[#C9A84C] text-2xl font-bold">¥168</p>
            <p className="text-[#8a7a6a] text-xs line-through">¥238</p>
          </div>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          <span className="bg-[#8B1A1A]/30 border border-[#8B1A1A]/50 text-[#C9A84C] text-xs px-2 py-0.5 rounded-full">RESERVA级</span>
          <span className="bg-[#8B1A1A]/30 border border-[#8B1A1A]/50 text-[#C9A84C] text-xs px-2 py-0.5 rounded-full">100%丹魄</span>
          <span className="bg-[#8B1A1A]/30 border border-[#8B1A1A]/50 text-[#C9A84C] text-xs px-2 py-0.5 rounded-full">橡木桶陈酿</span>
        </div>
      </div>

      {/* 产品规格表 */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Wine className="w-4 h-4 text-[#C9A84C]" />
          <h3 className="text-sm font-semibold text-[#C9A84C]">产品规格</h3>
        </div>
        <div className="bg-[#1a0a0a] rounded-xl border border-[#8B1A1A]/20 overflow-hidden">
          {SPECS.map((spec, i) => (
            <div key={i} className={`flex items-center px-4 py-2.5 ${i < SPECS.length - 1 ? "border-b border-[#8B1A1A]/15" : ""}`}>
              <span className="text-[#8a7a6a] text-xs w-16 flex-shrink-0">{spec.label}</span>
              <span className="text-[#e8d5b7] text-xs font-medium flex-1">{spec.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 酒评 */}
      <div className="px-4 pt-2 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Award className="w-4 h-4 text-[#C9A84C]" />
          <h3 className="text-sm font-semibold text-[#C9A84C]">酒  评</h3>
        </div>
        <div className="bg-[#1a0a0a] rounded-xl border border-[#8B1A1A]/20 px-4 py-3">
          <p className="text-[#a09080] text-sm leading-relaxed">
            该款葡萄酒采用<span className="text-[#e8d5b7] font-medium">100%丹魄</span>酿制而成。经过<span className="text-[#e8d5b7] font-medium">12个月的橡木桶陈酿</span>，酒体柔顺饱满，散发出成熟红果与香草的复合香气，单宁细腻，余味悠长。RESERVA等级代表了更长的熟成时间，品质更为出众。
          </p>
        </div>
      </div>

      {/* 配餐场景图 */}
      <div className="px-4 pt-2 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <ChefHat className="w-4 h-4 text-[#C9A84C]" />
          <h3 className="text-sm font-semibold text-[#C9A84C]">建议配餐</h3>
        </div>
        <div className="rounded-xl overflow-hidden border border-[#8B1A1A]/20 mb-3">
          <img
            src={FIDENCIO_PAIRING}
            alt="飞腾干红配餐场景"
            className="w-full object-cover"
            style={{ height: 200 }}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["奶酪", "牛排", "各种肉类", "烤羊排", "硬质奶酪"].map((food) => (
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
          className="w-full bg-[#8B1A1A] text-[#e8d5b7] font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 text-base shadow-lg shadow-[#8B1A1A]/30"
        >
          <ShoppingCart className="w-5 h-5" />
          立即咨询购买
        </button>
      </div>

      <BottomNav merchantCode="cx8618" activeTab="brands" />
    </div>
  );
}
