/**
 * 罗马尼克干红葡萄酒 ROMANICO - 商品详情页
 * 路径: /wine/product/romanico
 *
 * Teso La Monja · 西班牙托罗产区 · RP 92分
 * 规范：架构文档 v1.7 第二十三章「商品展示铁规」
 * - 禁止使用 emoji，一律用 lucide-react SVG 图标或纯文字
 * - 主图区：1:1 正方形轮播，支持触摸滑动
 */
import { useState, useRef } from "react";
import ShareSheet from "@/components/ShareSheet";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowLeft, Share2, ShoppingCart, Wine, Award, ChefHat,
  Star, Grape, Thermometer, Package, MapPin, ChevronRight,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";

const CDN = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb";
const COS = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com";

const CAROUSEL_IMAGES = [
  { src: `${CDN}/romanico-main-square-Q4xQjKSfZ72zcj4mvWfiMK.webp`, alt: "ROMANICO 罗马尼克 · 主图" },
  { src: `${CDN}/romanico-label-closeup-QJ4zBX6VPML4htb6NGWWJM.webp`, alt: "酒标细节特写" },
  { src: `${COS}/wine-products/romanico-pairing.webp`, alt: "配餐场景" },
  { src: `${CDN}/romanico-vineyard-4s4HB3PTqKbNRi6kR4EGCw.webp`, alt: "西班牙托罗产区葡萄园" },
];

const DETAIL_IMAGES = [
  { src: `${CDN}/romanico-detail-scores-cxJ3VmtjLL2ffmGjkDaoV8.webp`, alt: "权威评分认证" },
  { src: `${CDN}/romanico-detail-winery-Gwdvx3LZ4ZXWeNREVmbCf2.webp`, alt: "酒庄与酿造工艺" },
  { src: `${CDN}/romanico-detail-pairing-QVENyqABbPfTr4Rm3h6jJi.webp`, alt: "配餐建议" },
];

const SPECS = [
  { label: "国  家", value: "西班牙" },
  { label: "产  区", value: "托罗 Toro DO" },
  { label: "年  份", value: "2020" },
  { label: "酒精度", value: "14.5%vol" },
  { label: "规  格", value: "750ml" },
  { label: "品  种", value: "100% 丹魄 Tinta de Toro" },
  { label: "橡木桶", value: "法国橡木桶陈酿 6 个月" },
  { label: "葡萄园", value: "海拔 750-850m 有机葡萄园" },
  { label: "酿造工艺", value: "传统方式，100% 去梗" },
  { label: "瓶中成年", value: "2 个月" },
];

const SCORES = [
  { org: "罗伯特·帕克 RP", orgEn: "Robert Parker Wine Advocate", score: 92 },
  { org: "葡萄酒观察家 ST", orgEn: "Wine Spectator", score: 91 },
  { org: "西班牙佩宁", orgEn: "Guia Peñin", score: 92 },
];

export default function WineProductRomanico() {
  const [, setLocation] = useLocation();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showShare, setShowShare] = useState(false);
  const touchStartX = useRef(0);
  const { user } = useAuth();

  // 动态邀请码：已登录用户用自己的inviteCode，未登录时用商城默认邀请码
  const refCode = user?.inviteCode || 'cx8618';
  const SHARE_URL = `${window.location.origin}/share/wine/product/romanico?ref=${refCode}`;

  const handleShare = async () => {
    const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
    if (isWeChat) {
      // 微信内置浏览器：弹出 ShareSheet 面板
      setShowShare(true);
    } else if (navigator.share) {
      // Safari/Chrome：直接调用系统分享菜单（必须在用户手势里直接调用）
      try {
        await navigator.share({
          title: 'ROMANICO 罗马尼克干红葡萄酒 750ml',
          text: 'RP 92分 · 西班牙托罗产区 · ¥328',
          url: SHARE_URL,
        });
      } catch {}
    } else {
      // 其他浏览器：弹出面板复制链接
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

      {/* ② 价格 + 标题区（铁规：现价28px红色#E02020，名称16px最多2行） */}
      <div className="px-4 pt-4 pb-3 border-b border-[#8B1A1A]/20">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-[#E02020] font-bold" style={{ fontSize: 28, lineHeight: 1 }}>
            <span style={{ fontSize: 16 }}>¥</span>328
          </span>
          <span className="text-[#8a7a6a] text-sm line-through">¥468</span>
          <span className="ml-auto border text-[#C9A84C] text-[11px] px-2 py-0.5 rounded" style={{ background: "#2d0d0d", borderColor: "rgba(139,26,26,0.4)" }}>
            限时特惠
          </span>
        </div>
        <h2
          className="text-[#e8d5b7] font-semibold mb-1"
          style={{ fontSize: 16, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          ROMANICO 罗马尼克干红葡萄酒 750ml
        </h2>
        <p
          className="text-[#8a7a6a]"
          style={{ fontSize: 13, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          Teso La Monja酒庄 · 西班牙托罗产区 · 2020年份 · 100%丹魄
        </p>
        <div className="flex gap-2 mt-3">
          {SCORES.map((s) => (
            <div key={s.org} className="flex items-center gap-1 border rounded-lg px-2 py-1" style={{ background: "rgba(201,168,76,0.1)", borderColor: "rgba(201,168,76,0.3)" }}>
              <Star className="w-3 h-3 text-[#C9A84C] fill-[#C9A84C]" />
              <span className="text-[#C9A84C] text-xs font-bold">{s.score}</span>
            </div>
          ))}
          <span className="text-[#8a7a6a] text-xs self-center ml-1">国际评分</span>
        </div>
      </div>

      {/* ③ 规格选择区 */}
      <div className="bg-[#0d0505] border-b-8 border-[#060202]">
        {[
          { label: "规格", value: "750ml × 1瓶", selected: true, highlight: false },
          { label: "配送", value: "顺丰快递 · 全国包邮", selected: false, highlight: false },
          { label: "库存", value: "仅剩 12 件", selected: false, highlight: true },
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

      {/* ⑤ 商家自由装修区 */}

      {/* 核心概要（lucide 图标，无 emoji） */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <Grape className="w-4 h-4 text-[#C9A84C]" />
          <h3 className="text-sm font-semibold text-[#C9A84C]">核心概要</h3>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[#1a0a0a] border border-[#8B1A1A]/20 rounded-xl p-3 text-center">
            <div className="flex justify-center mb-1"><Grape className="w-5 h-5 text-[#C9A84C]" /></div>
            <p className="text-[#e8d5b7] text-xs font-bold">100% 丹魄</p>
            <p className="text-[#8a7a6a] text-[10px]">Tinta de Toro</p>
          </div>
          <div className="bg-[#1a0a0a] border border-[#8B1A1A]/20 rounded-xl p-3 text-center">
            <div className="flex justify-center mb-1"><Thermometer className="w-5 h-5 text-[#C9A84C]" /></div>
            <p className="text-[#e8d5b7] text-xs font-bold">14.5% 度</p>
            <p className="text-[#8a7a6a] text-[10px]">酒精浓度</p>
          </div>
          <div className="bg-[#1a0a0a] border border-[#8B1A1A]/20 rounded-xl p-3 text-center">
            <div className="flex justify-center mb-1"><Package className="w-5 h-5 text-[#C9A84C]" /></div>
            <p className="text-[#e8d5b7] text-xs font-bold">6 个月</p>
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

      {/* 产区故事（含葡萄园图） */}
      <div className="pt-2 pb-3">
        <div className="flex items-center gap-2 mb-3 px-4">
          <MapPin className="w-4 h-4 text-[#C9A84C]" />
          <h3 className="text-sm font-semibold text-[#C9A84C]">产区故事</h3>
        </div>
        <img
          src={`${CDN}/romanico-vineyard-4s4HB3PTqKbNRi6kR4EGCw.webp`}
          alt="西班牙托罗产区葡萄园"
          className="w-full object-cover"
          style={{ aspectRatio: "16/9" }}
        />
        <div className="px-4 pt-3">
          <span className="inline-block text-white text-[11px] px-3 py-1 rounded-full mb-2" style={{ background: "#8B1A1A" }}>
            西班牙 · 托罗产区
          </span>
          <p className="text-[#a09080] text-xs leading-relaxed">
            托罗（Toro）产区位于西班牙萨莫拉省，是伊比利亚半岛最古老的葡萄酒产区之一。这里的葡萄园海拔750-850米，年平均气温21°C，昼夜温差大，有机土壤赋予葡萄酒独特的矿物感。
          </p>
          <p className="text-[#a09080] text-xs leading-relaxed mt-2">
            Teso La Monja 酒庄的老藤丹魄在这片干旱的卡斯蒂利亚土地上深根生长，低产量带来高度浓缩的果味，造就了这款令国际评论家惊叹的佳酿。
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
              位于托罗产区萨莫拉的有机葡萄园，平均气温21摄氏度，海拔750-850米。全部有机施肥，葡萄藤采用头部整形和高杯式剪枝。
            </p>
          </div>
          <div>
            <p className="text-[#C9A84C] text-xs font-semibold mb-1">酿造方式</p>
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
              <div className="flex-1">
                <p className="text-[#a09080] text-xs">{s.org}</p>
                <p className="text-[#8a7a6a] text-[10px]">{s.orgEn}</p>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center" style={{ borderColor: "#C9A84C" }}>
                  <span className="text-[#C9A84C] text-sm font-bold">{s.score}</span>
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
        <div className="rounded-xl overflow-hidden border border-[#C9A84C]/20 mb-3">
          <img
            src={`${COS}/wine-products/romanico-pairing.webp`}
            alt="罗马尼克配餐场景"
            className="w-full object-cover"
            style={{ height: 200 }}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["烤牛排", "红烧肉", "硬质奶酪", "烤羊腿", "伊比利亚火腿"].map((food) => (
            <span key={food} className="border text-[#a09080] text-xs px-3 py-1.5 rounded-full" style={{ background: "#2d0d0d", borderColor: "rgba(139,26,26,0.3)" }}>
              {food}
            </span>
          ))}
        </div>
      </div>

      {/* ⑥ 详情图区（铁规：宽度100%，无间距拼接） */}
      <div className="mt-2">
        <div className="flex items-center gap-2 px-4 py-3 border-t border-b border-[#8B1A1A]/20" style={{ background: "#0d0505" }}>
          <div className="w-0.5 h-4 rounded bg-[#C9A84C]" />
          <h3 className="text-sm font-semibold text-[#C9A84C]">图文详情</h3>
        </div>
        {DETAIL_IMAGES.map((img, i) => (
          <img key={i} src={img.src} alt={img.alt} className="w-full block" />
        ))}
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
        title="ROMANICO 罗马尼克干红葡萄酒 750ml"
        description="RP 92分 · 西班牙托罗产区 · ¥328"
        inviteCode={user?.inviteCode}
        isLoggedIn={!!user}
      />
    </div>
  );
}
