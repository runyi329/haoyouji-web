/**
 * 飞腾干红葡萄酒 FIDENCIO RESERVA - 商品详情页
 * 路径: /wine/product/fidencio
 *
 * 圣女酒庄 Virgen de las Viñas · 西班牙拉曼恰产区 · DO/RESERVA
 * 规范：架构文档 v1.7 第二十三章「商品展示铁规」
 * - 禁止使用 emoji，一律用 lucide-react SVG 图标或纯文字
 * - 主图区：1:1 正方形轮播，支持触摸滑动
 */
import { useState, useRef } from "react";
import { useMerchantOG } from "@/hooks/useMerchantOG";
import ShareSheet from "@/components/ShareSheet";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowLeft, Share2, ShoppingCart, Wine, Award, ChefHat,
  Grape, Thermometer, Package, MapPin, ChevronRight,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";

const CDN = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb";
const COS = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com";

const CAROUSEL_IMAGES = [
  { src: `${CDN}/fidencio-product_8ee0ec50.jpg`, alt: "飞腾干红葡萄酒 FIDENCIO RESERVA · 主图" },
  { src: `${COS}/wine-products/fidencio-hero.webp`, alt: "FIDENCIO 酒瓶特写" },
  { src: `${COS}/wine-products/fidencio-pairing.webp`, alt: "配餐场景" },
];

const SPECS = [
  { label: "国  家", value: "西班牙" },
  { label: "产  区", value: "拉曼恰 La Mancha" },
  { label: "年  份", value: "2016" },
  { label: "酒精度", value: "13.5%vol" },
  { label: "规  格", value: "750ml" },
  { label: "等  级", value: "DO / RESERVA" },
  { label: "品  种", value: "丹魄 Tempranillo" },
  { label: "橡木桶", value: "橡木桶陈酿 12 个月" },
];

export default function WineProductFidencio() {
  const [, setLocation] = useLocation();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showShare, setShowShare] = useState(false);
  const touchStartX = useRef(0);
  const { user } = useAuth();

  const refCode = user?.inviteCode || 'cx8618';
  const SHARE_URL = `${window.location.origin}/share/wine/product/fidencio?ref=${refCode}`;

  useMerchantOG('cx8618', {
    title: '飞腾干红葡萄酒 FIDENCIO RESERVA 750ml',
    desc: 'DO/RESERVA级 · 西班牙拉曼恰产区 · ¥168',
    url: `${window.location.origin}/wine/product/fidencio`,
  });

  const handleShare = async () => {
    const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
    if (isWeChat) {
      setShowShare(true);
    } else if (navigator.share) {
      try {
        await navigator.share({
          title: '飞腾干红葡萄酒 FIDENCIO RESERVA 750ml',
          text: 'DO/RESERVA级 · 西班牙拉曼恰产区 · ¥168',
          url: SHARE_URL,
        });
      } catch {}
    } else {
      setShowShare(true);
    }
  };

  const handleBuy = () => {
    toast.info("请联系商家下单", { description: "微信搜索「红酒文化商会」或致电咨询" });
  };

  const goSlide = (index: number) => {
    setCurrentSlide(Math.max(0, Math.min(index, CAROUSEL_IMAGES.length - 1)));
  };

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) { diff > 0 ? goSlide(currentSlide + 1) : goSlide(currentSlide - 1); }
  };

  return (
    <div className="min-h-screen bg-[#0d0505] text-[#e8d5b7] pb-28">

      {/* 顶部导航（铁规：44px 高） */}
      <div className="sticky top-0 z-20 bg-[#0d0505]/95 backdrop-blur-sm border-b border-[#8B1A1A]/30 px-4 flex items-center gap-3" style={{ height: 44 }}>
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
      <div className="bg-gradient-to-r from-[#2d0d0d] to-[#1a0a0a] border-b border-[#C9A84C]/20 px-4 py-3 flex gap-3 items-start">
        <div className="bg-[#8B1A1A]/30 border border-[#8B1A1A]/50 rounded-lg px-3 py-2 text-center min-w-[80px] flex-shrink-0">
          <p className="text-[#C9A84C] text-xs font-bold leading-tight">圣女酒庄</p>
          <p className="text-[#8a7a6a] text-[10px] mt-0.5">VIRGEN DE LAS VIÑAS</p>
        </div>
        <p className="text-[#a09080] text-xs leading-relaxed flex-1">
          圣女酒庄坐落于西班牙拉曼恰产区，历史可追溯到1961年。1995年始得益于政府帮助开始酿造葡萄酒，50多年历史中巧妙地将传统工艺与尖端技术相结合，跻身葡萄酒行业前列。
        </p>
      </div>

      {/* ① 主图轮播区（铁规：100% 宽，1:1 正方形，object-fit:cover） */}
      <div
        className="relative w-full overflow-hidden bg-[#0d0505]"
        style={{ aspectRatio: "1 / 1" }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex h-full"
          style={{
            width: `${CAROUSEL_IMAGES.length * 100}%`,
            transform: `translateX(-${(currentSlide * 100) / CAROUSEL_IMAGES.length}%)`,
            transition: "transform 0.35s ease",
          }}
        >
          {CAROUSEL_IMAGES.map((img, i) => (
            <img
              key={i}
              src={img.src}
              alt={img.alt}
              className="object-cover"
              style={{ width: `${100 / CAROUSEL_IMAGES.length}%`, height: "100%", flexShrink: 0 }}
            />
          ))}
        </div>
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {CAROUSEL_IMAGES.map((_, i) => (
            <button
              key={i}
              onClick={() => goSlide(i)}
              style={{
                width: i === currentSlide ? 18 : 6,
                height: 6,
                borderRadius: 3,
                background: i === currentSlide ? "#C9A84C" : "rgba(255,255,255,0.4)",
                border: "none",
                padding: 0,
                transition: "all 0.2s",
              }}
            />
          ))}
        </div>
        <div className="absolute bottom-3 right-3 bg-black/50 text-white text-[11px] px-2 py-0.5 rounded-full">
          {currentSlide + 1}/{CAROUSEL_IMAGES.length}
        </div>
      </div>

      {/* ② 价格 + 标题区 */}
      <div className="px-4 pt-4 pb-3 border-b border-[#8B1A1A]/20">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-[#E02020] font-bold" style={{ fontSize: 28, lineHeight: 1 }}>
            <span style={{ fontSize: 16 }}>¥</span>168
          </span>
          <span className="text-[#8a7a6a] text-sm line-through">¥238</span>
          <span className="ml-auto border text-[#C9A84C] text-[11px] px-2 py-0.5 rounded" style={{ background: "#2d0d0d", borderColor: "rgba(139,26,26,0.4)" }}>
            限时特惠
          </span>
        </div>
        <h2
          className="text-[#e8d5b7] font-semibold mb-1"
          style={{ fontSize: 16, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          飞腾干红葡萄酒 FIDENCIO RESERVA 750ml
        </h2>
        <p
          className="text-[#8a7a6a]"
          style={{ fontSize: 13, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          圣女酒庄 · 西班牙拉曼恰产区 · 2016年份 · 100%丹魄
        </p>
        <div className="flex gap-2 mt-3 flex-wrap">
          {["RESERVA级", "100%丹魄", "橡木桶陈酿12月"].map((tag) => (
            <span key={tag} className="border text-[#C9A84C] text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(201,168,76,0.1)", borderColor: "rgba(201,168,76,0.3)" }}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* ③ 规格选择区 */}
      <div className="bg-[#0d0505] border-b-8 border-[#060202]">
        {[
          { label: "规格", value: "750ml × 1瓶", selected: true, highlight: false },
          { label: "配送", value: "顺丰快递 · 全国包邮", selected: false, highlight: false },
          { label: "库存", value: "现货供应", selected: false, highlight: false },
        ].map((row, i) => (
          <div key={i} className="flex items-center px-4 border-b border-[#8B1A1A]/15 last:border-b-0" style={{ height: 44 }}>
            <span className="text-[#8a7a6a] text-sm w-12 flex-shrink-0">{row.label}</span>
            <span className="flex-1 text-right text-[13px] mr-2" style={{ color: row.highlight ? "#E02020" : "#a09080" }}>
              {row.selected ? (
                <span className="inline-block px-3 py-1 rounded border text-[13px]" style={{ borderColor: "#8B1A1A", color: "#C9A84C", background: "rgba(139,26,26,0.1)" }}>
                  {row.value}
                </span>
              ) : row.value}
            </span>
            <ChevronRight className="w-4 h-4 text-[#4a3a3a]" />
          </div>
        ))}
      </div>

      {/* 核心概要三格卡片 */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Grape className="w-4 h-4 text-[#C9A84C]" />
          <h3 className="text-sm font-semibold text-[#C9A84C]">核心概要</h3>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[#1a0a0a] border border-[#8B1A1A]/20 rounded-xl p-3 text-center">
            <div className="flex justify-center mb-1"><Grape className="w-5 h-5 text-[#C9A84C]" /></div>
            <p className="text-[#e8d5b7] text-xs font-bold">100% 丹魄</p>
            <p className="text-[#8a7a6a] text-[10px]">Tempranillo</p>
          </div>
          <div className="bg-[#1a0a0a] border border-[#8B1A1A]/20 rounded-xl p-3 text-center">
            <div className="flex justify-center mb-1"><Thermometer className="w-5 h-5 text-[#C9A84C]" /></div>
            <p className="text-[#e8d5b7] text-xs font-bold">13.5% 度</p>
            <p className="text-[#8a7a6a] text-[10px]">酒精浓度</p>
          </div>
          <div className="bg-[#1a0a0a] border border-[#8B1A1A]/20 rounded-xl p-3 text-center">
            <div className="flex justify-center mb-1"><Package className="w-5 h-5 text-[#C9A84C]" /></div>
            <p className="text-[#e8d5b7] text-xs font-bold">12 个月</p>
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

      {/* 产区故事 */}
      <div className="pt-2 pb-3">
        <div className="flex items-center gap-2 mb-3 px-4">
          <MapPin className="w-4 h-4 text-[#C9A84C]" />
          <h3 className="text-sm font-semibold text-[#C9A84C]">产区故事</h3>
        </div>
        <div className="px-4">
          <span className="inline-block text-white text-[11px] px-3 py-1 rounded-full mb-2" style={{ background: "#8B1A1A" }}>
            西班牙 · 拉曼恰产区
          </span>
          <p className="text-[#a09080] text-xs leading-relaxed">
            拉曼恰（La Mancha）是西班牙最大的葡萄酒产区，位于伊比利亚半岛中部高原，海拔600-700米，大陆性气候造就了昼夜温差大的自然条件，有利于葡萄积累糖分与香气。
          </p>
          <p className="text-[#a09080] text-xs leading-relaxed mt-2">
            圣女酒庄（Virgen de las Viñas）自1961年建立以来，始终坚持传统酿造工艺与现代技术并重，是拉曼恰产区的标杆酒庄之一，其RESERVA级产品在西班牙国内享有盛誉。
          </p>
        </div>
      </div>

      {/* 葡萄园与酿造 */}
      <div className="px-4 pt-2 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Award className="w-4 h-4 text-[#C9A84C]" />
          <h3 className="text-sm font-semibold text-[#C9A84C]">葡萄园与酿造</h3>
        </div>
        <div className="bg-[#1a0a0a] rounded-xl border border-[#8B1A1A]/20 px-4 py-3 space-y-3">
          <div>
            <p className="text-[#C9A84C] text-xs font-semibold mb-1">葡萄园</p>
            <p className="text-[#a09080] text-xs leading-relaxed">
              位于拉曼恰产区中部，海拔约650米，大陆性气候，夏季干热冬季寒冷，昼夜温差大，有助于葡萄保持天然酸度与浓郁果香。
            </p>
          </div>
          <div>
            <p className="text-[#C9A84C] text-xs font-semibold mb-1">酿造方式</p>
            <p className="text-[#a09080] text-xs leading-relaxed">
              采用100%丹魄葡萄，经过严格筛选后进行传统发酵，在橡木桶中陈酿12个月，再经瓶中熟成，达到RESERVA级别的品质标准。
            </p>
          </div>
        </div>
      </div>

      {/* 建议配餐 */}
      <div className="px-4 pt-2 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <ChefHat className="w-4 h-4 text-[#C9A84C]" />
          <h3 className="text-sm font-semibold text-[#C9A84C]">建议配餐</h3>
        </div>
        <div className="rounded-xl overflow-hidden border border-[#C9A84C]/20 mb-3">
          <img
            src={`${COS}/wine-products/fidencio-pairing.webp`}
            alt="飞腾干红配餐场景"
            className="w-full object-cover"
            style={{ height: 200 }}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["奶酪", "牛排", "各种肉类", "烤羊排", "硬质奶酪"].map((food) => (
            <span key={food} className="border text-[#a09080] text-xs px-3 py-1.5 rounded-full" style={{ background: "#2d0d0d", borderColor: "rgba(139,26,26,0.3)" }}>
              {food}
            </span>
          ))}
        </div>
      </div>

      {/* 图文详情区 */}
      <div className="mt-2">
        <div className="flex items-center gap-2 px-4 py-3 border-t border-b border-[#8B1A1A]/20" style={{ background: "#0d0505" }}>
          <div className="w-0.5 h-4 rounded bg-[#C9A84C]" />
          <h3 className="text-sm font-semibold text-[#C9A84C]">图文详情</h3>
        </div>
        <img
          src={`${CDN}/fidencio-product_8ee0ec50.jpg`}
          alt="飞腾干红葡萄酒 FIDENCIO RESERVA 详情"
          className="w-full block"
        />
      </div>

      {/* ④ 购买操作区（铁规：吸底56px，圆角20px） */}
      <div className="fixed bottom-16 left-0 right-0 z-10 px-4 pb-3 pt-4" style={{ background: "linear-gradient(to top, #0d0505 70%, transparent)" }}>
        <button
          onClick={handleBuy}
          className="w-full font-bold flex items-center justify-center gap-2 text-base"
          style={{ height: 56, borderRadius: 20, background: "linear-gradient(135deg, #8B1A1A, #6b1414)", color: "#e8d5b7", boxShadow: "0 4px 20px rgba(139,26,26,0.5)", border: "none" }}
        >
          <ShoppingCart className="w-5 h-5" />
          立即咨询购买
        </button>
      </div>

      <BottomNav merchantCode="cx8618" activeTab="brands" />

      {/* 分享底部弹出面板 */}
      <ShareSheet
        open={showShare}
        onClose={() => setShowShare(false)}
        shareUrl={SHARE_URL}
        title="飞腾干红葡萄酒 FIDENCIO RESERVA 750ml"
        description="DO/RESERVA级 · 西班牙拉曼恰产区 · ¥168"
        inviteCode={user?.inviteCode}
        isLoggedIn={!!user}
      />
    </div>
  );
}
