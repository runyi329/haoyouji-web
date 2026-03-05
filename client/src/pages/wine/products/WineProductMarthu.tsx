/**
 * 玛莎干红葡萄酒 MARTHU - 商品详情页
 * 路径: /wine/product/marthu
 * 
 * 马约尔酒庄 Bodegas Fuenmayor · 西班牙里奥哈产区
 */
import { useLocation } from "wouter";
import { ArrowLeft, Share2, ShoppingCart, Wine, Award, ChefHat } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";

const MARTHU_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/marthu-bottle_1ee8d1f1.jpg";

const SPECS = [
  { label: "国  家", value: "西班牙 🇪🇸" },
  { label: "年  份", value: "2018" },
  { label: "产  区", value: "里奥哈 Rioja" },
  { label: "酒精度", value: "14.5%vol" },
  { label: "规  格", value: "750ml" },
  { label: "等  级", value: "DOC" },
  { label: "品  种", value: "添帕尼优 Tempranillo" },
];

export default function WineProductMarthu() {
  const [, setLocation] = useLocation();

  const handleShare = () => {
    const url = `${window.location.origin}/wine/product/marthu`;
    if (navigator.share) {
      navigator.share({ title: "玛莎干红葡萄酒 MARTHU", text: "来自西班牙里奥哈DOC产区，石榴红色泽，果香优雅清爽", url });
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
          <h1 className="text-sm font-bold text-[#e8d5b7]">玛莎干红葡萄酒</h1>
          <p className="text-xs text-[#8a7a6a]">MARTHU · 马约尔酒庄</p>
        </div>
        <button onClick={handleShare} className="text-[#C9A84C] p-1">
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      {/* 酒庄介绍横幅 */}
      <div className="bg-[#1a0a0a] border-b border-[#8B1A1A]/20 px-4 py-3 flex gap-3 items-start">
        <div className="bg-[#8B1A1A]/30 border border-[#8B1A1A]/50 rounded-lg px-3 py-2 text-center min-w-[80px]">
          <p className="text-[#C9A84C] text-xs font-bold leading-tight">马约尔酒庄</p>
          <p className="text-[#8a7a6a] text-[10px] mt-0.5">Bodegas Fuenmayor</p>
        </div>
        <p className="text-[#a09080] text-xs leading-relaxed flex-1">
          该酒庄位于西班牙里奥哈产区，采用传统和先进的酿造工艺相结合。在这里，葡萄酒是自然而然的选择和处理的。这确保了它们逐渐增强的特点，酒厂区分它们，直到所得到的葡萄酒汇集在一起，从而酿造出独特的产品。
        </p>
      </div>

      {/* 主图区域 */}
      <div
        className="relative flex justify-center items-end pt-6 pb-0 overflow-hidden"
        style={{
          minHeight: 280,
          background: "linear-gradient(to bottom, #1a0505 0%, #0d0505 100%)",
        }}
      >
        {/* 背景光晕 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-40 h-40 rounded-full bg-[#8B1A1A]/15 blur-3xl" />
        </div>
        <img
          src={MARTHU_IMG}
          alt="玛莎干红葡萄酒 MARTHU"
          className="relative z-10 object-contain drop-shadow-2xl"
          style={{ height: 260, width: "auto", maxWidth: "100%" }}
        />
      </div>

      {/* 产品名称 & 价格 */}
      <div className="px-4 pt-5 pb-3 border-b border-[#8B1A1A]/20">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-[#e8d5b7] leading-tight">玛莎干红葡萄酒</h2>
            <p className="text-[#C9A84C] text-sm tracking-widest mt-0.5">MARTHU COSECHA SELECCIÓN</p>
          </div>
          <div className="text-right">
            <p className="text-[#C9A84C] text-2xl font-bold">¥198</p>
            <p className="text-[#8a7a6a] text-xs line-through">¥268</p>
          </div>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          <span className="bg-[#8B1A1A]/30 border border-[#8B1A1A]/50 text-[#C9A84C] text-xs px-2 py-0.5 rounded-full">DOC级</span>
          <span className="bg-[#8B1A1A]/30 border border-[#8B1A1A]/50 text-[#C9A84C] text-xs px-2 py-0.5 rounded-full">里奥哈产区</span>
          <span className="bg-[#8B1A1A]/30 border border-[#8B1A1A]/50 text-[#C9A84C] text-xs px-2 py-0.5 rounded-full">石榴红色泽</span>
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
            该款酒呈<span className="text-[#e8d5b7] font-medium">石榴红色</span>，采用西班牙特有的葡萄品种<span className="text-[#e8d5b7] font-medium">添帕尼优</span>，明亮清新的色泽令人愉快，优雅清爽的果香，单宁适中，酸度均衡，回味悠长。里奥哈 DOC 等级认证，品质卓越，是日常佐餐的绝佳选择。
          </p>
        </div>
      </div>

      {/* 建议配餐 */}
      <div className="px-4 pt-2 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <ChefHat className="w-4 h-4 text-[#C9A84C]" />
          <h3 className="text-sm font-semibold text-[#C9A84C]">建议配餐</h3>
        </div>
        <div className="flex gap-2 flex-wrap">
          {["奶酪", "牛排", "各种肉类", "烤猪排", "西班牙火腿"].map((food) => (
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
