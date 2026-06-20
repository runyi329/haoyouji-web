/**
 * 罗马尼克干红葡萄酒 ROMANICO - 商品分享页（海报式独立页面）
 * 路径: /share/wine/product/romanico
 *
 * 规则（架构文档 §3.2 / §24）：
 * - 完全免登录浏览，不做任何认证检查
 * - 无顶部返回按钮、无底部 TabBar
 * - 顶部仅显示品牌标识
 * - 点击「立即购买」才触发登录（未登录跳登录页）
 * - URL 自带 ?ref=cx8618 邀请码，存入 localStorage（有效期7天）
 */
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Share2, Star, MapPin } from "lucide-react";
import { trpc } from "@/lib/trpc";
import ShareSheet from "@/components/ShareSheet";
import { useMerchantOG } from "@/hooks/useMerchantOG";

const CDN = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets";
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
];

const SCORES = [
  { org: "罗伯特·帕克 RP", score: 92 },
  { org: "葡萄酒观察家 ST", score: 91 },
  { org: "西班牙佩宁", score: 92 },
];

export default function WineProductRomanicoShare() {
  const [, setLocation] = useLocation();
  const [currentSlide, setCurrentSlide] = useState(0);
  const touchStartX = useRef(0);

  // 读取当前用户（不强制登录）
  const { data: currentUser } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [showShare, setShowShare] = useState(false);
  const SHARE_URL = `${window.location.origin}/share/wine/product/romanico?ref=cx8618`;

  // 动态注入商家 OG Meta 标签，微信分享显示商家设置的标题/图片
  useMerchantOG('cx8618', {
    title: 'ROMANICO 罗马尼克干红葡萄酒 750ml',
    desc: 'RP 92分 · 西班牙托罗产区 · ¥328',
    url: `${window.location.origin}/share/wine/product/romanico`,
  });

  // 存储 ref 邀请码到 localStorage（有效期7天）
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get("ref");
    if (ref) {
      const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
      localStorage.setItem("invite_ref", JSON.stringify({ code: ref, expiry }));
    }
  }, []);

  const goSlide = (index: number) => {
    setCurrentSlide(Math.max(0, Math.min(index, CAROUSEL_IMAGES.length - 1)));
  };

  const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) { diff > 0 ? goSlide(currentSlide + 1) : goSlide(currentSlide - 1); }
  };

  // 继续分享
  const handleShare = () => {
    setShowShare(true);
  };

  // 点击购买
  const handleBuy = () => {
    if (currentUser) {
      // 已登录，跳转到详情页
      setLocation("/wine/product/romanico");
    } else {
      // 未登录，跳转登录页，登录后回到详情页
      setLocation(`/login?redirect=${encodeURIComponent("/wine/product/romanico")}`);
    }
  };

  return (
    <div className="min-h-screen pb-24" style={{ background: "#0d0505", color: "#e8d5b7" }}>

      {/* 顶部品牌标识（无返回按钮） */}
      <div
        className="flex items-center justify-center px-4 py-3"
        style={{ borderBottom: "1px solid rgba(139,26,26,0.3)", background: "rgba(13,5,5,0.95)" }}
      >
        <div className="text-center">
          <p className="text-xs tracking-[0.3em]" style={{ color: "#C9A84C" }}>红酒文化商会</p>
          <p className="text-xs mt-0.5" style={{ color: "rgba(232,213,183,0.4)" }}>WINE CULTURE CHAMBER · 官方推荐</p>
        </div>
      </div>

      {/* 媒体评语横幅 */}
      <div
        className="px-4 py-3"
        style={{ background: "linear-gradient(to right, #2d0d0d, #1a0a0a)", borderBottom: "1px solid rgba(201,168,76,0.2)" }}
      >
        <p className="text-xs italic leading-relaxed" style={{ color: "rgba(232,213,183,0.75)" }}>
          "这是一款来自托罗产区物超所值的葡萄酒。它酒体饱满，酒体丰腴，余味悠长，其口感堪比50美元或更高价位的葡萄酒。"
        </p>
        <p className="text-xs mt-1.5" style={{ color: "#C9A84C" }}>——《葡萄酒倡导家》杂志</p>
      </div>

      {/* 主图轮播 */}
      <div
        className="relative overflow-hidden"
        style={{ aspectRatio: "1/1", background: "#0d0505" }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {CAROUSEL_IMAGES.map((img, i) => (
          <img
            key={i}
            src={img.src}
            alt={img.alt}
            className="absolute inset-0 w-full h-full object-contain transition-opacity duration-500"
            style={{ opacity: i === currentSlide ? 1 : 0 }}
          />
        ))}
        {/* 轮播指示器 */}
        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
          {CAROUSEL_IMAGES.map((_, i) => (
            <button
              key={i}
              onClick={() => goSlide(i)}
              style={{
                width: i === currentSlide ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background: i === currentSlide ? "#C9A84C" : "rgba(232,213,183,0.3)",
                transition: "all 0.3s",
              }}
            />
          ))}
        </div>
        <div
          className="absolute top-3 right-3 text-xs px-2 py-0.5 rounded"
          style={{ background: "rgba(13,5,5,0.7)", color: "rgba(232,213,183,0.5)" }}
        >
          {currentSlide + 1}/{CAROUSEL_IMAGES.length}
        </div>
      </div>

      {/* 价格 + 标题 */}
      <div className="px-4 py-4" style={{ borderBottom: "1px solid rgba(139,26,26,0.2)" }}>
        <div className="flex items-baseline gap-3 mb-1">
          <span className="text-3xl font-bold" style={{ color: "#e11d48" }}>¥328</span>
          <span className="text-base line-through" style={{ color: "rgba(232,213,183,0.35)" }}>¥468</span>
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{ background: "rgba(139,26,26,0.3)", color: "#e8d5b7", border: "1px solid rgba(139,26,26,0.5)" }}
          >
            限时特惠
          </span>
        </div>
        <h1 className="text-lg font-bold" style={{ color: "#e8d5b7" }}>ROMANICO 罗马尼克干红葡萄酒 750ml</h1>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <MapPin className="w-3 h-3" style={{ color: "#C9A84C" }} />
          <span className="text-xs" style={{ color: "rgba(232,213,183,0.6)" }}>Teso La Monja酒庄 · 西班牙托罗产区 · 2020年份 · 100% 丹魄</span>
        </div>

        {/* 评分 */}
        <div className="flex gap-2 mt-3">
          {SCORES.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-1 px-2 py-1 rounded"
              style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.3)" }}
            >
              <Star className="w-3 h-3" style={{ color: "#C9A84C" }} />
              <span className="text-xs font-bold" style={{ color: "#C9A84C" }}>{s.score}</span>
            </div>
          ))}
          <span className="text-xs self-center" style={{ color: "rgba(232,213,183,0.4)" }}>国际评分</span>
        </div>

        {/* 未登录提示 */}
        {!currentUser && (
          <div
            className="mt-3 px-3 py-2 rounded-lg text-xs text-center"
            style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.2)", color: "#C9A84C" }}
          >
            点击「立即购买」登录后即可下单，首次注册自动绑定专属顾问
          </div>
        )}
      </div>

      {/* 规格参数 */}
      <div className="px-4 py-4" style={{ borderBottom: "1px solid rgba(139,26,26,0.2)" }}>
        <div className="text-xs tracking-widest mb-3" style={{ color: "#C9A84C" }}>产品规格</div>
        <div className="space-y-0">
          {SPECS.map((s, i) => (
            <div
              key={i}
              className="flex py-2.5"
              style={{ borderBottom: i < SPECS.length - 1 ? "1px solid rgba(139,26,26,0.15)" : "none" }}
            >
              <span className="text-xs w-20 flex-shrink-0" style={{ color: "rgba(232,213,183,0.45)" }}>{s.label}</span>
              <span className="text-xs flex-1" style={{ color: "rgba(232,213,183,0.85)" }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 详情大图 */}
      <div className="py-4" style={{ borderBottom: "1px solid rgba(139,26,26,0.2)" }}>
        <div className="px-4 mb-3">
          <div className="text-xs tracking-widest" style={{ color: "#C9A84C" }}>产品详情</div>
        </div>
        {DETAIL_IMAGES.map((img, i) => (
          <img
            key={i}
            src={img.src}
            alt={img.alt}
            className="w-full block"
            style={{ marginBottom: i < DETAIL_IMAGES.length - 1 ? 2 : 0 }}
          />
        ))}
      </div>

      {/* 购买引导 */}
      <div className="px-4 py-8 text-center">
        <div className="text-xs tracking-widest mb-2" style={{ color: "#C9A84C" }}>开启您的品鉴之旅</div>
        <h2 className="text-xl font-bold mb-1" style={{ color: "#e8d5b7" }}>ROMANICO · RP 92分</h2>
        <p className="text-sm mb-4" style={{ color: "rgba(232,213,183,0.5)" }}>西班牙托罗产区 · 物超所值之选</p>
        <div className="text-4xl font-bold mb-1" style={{ color: "#e11d48" }}>¥328</div>
        <p className="text-xs mb-6" style={{ color: "rgba(232,213,183,0.35)" }}>专属顾问一对一服务</p>
        <button
          onClick={handleBuy}
          className="w-full py-4 rounded-xl font-bold text-base tracking-wider text-white"
          style={{ background: "linear-gradient(135deg, #8B1A1A, #5a0f0f)" }}
        >
          {currentUser ? "立即咨询购买" : "登录后立即购买"}
        </button>
      </div>

      {/* 页脚 */}
      <div className="px-4 pb-4 text-center" style={{ borderTop: "1px solid rgba(139,26,26,0.2)" }}>
        <p className="text-xs pt-4" style={{ color: "rgba(232,213,183,0.2)" }}>红酒文化商会 · 品质保证</p>
      </div>

      {/* 底部固定操作栏 */}
      <div
        className="fixed bottom-0 left-0 right-0 px-4 py-3 flex gap-3"
        style={{ background: "rgba(13,5,5,0.96)", backdropFilter: "blur(16px)", borderTop: "1px solid rgba(139,26,26,0.3)" }}
      >
        {/* 继续分享 */}
        <button
          onClick={handleShare}
          className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.3)" }}
          title="分享给朋友"
        >
          <Share2 className="w-5 h-5" style={{ color: "#C9A84C" }} />
        </button>
        {/* 立即购买 */}
        <button
          onClick={handleBuy}
          className="flex-1 h-12 rounded-xl text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg, #8B1A1A, #5a0f0f)" }}
        >
          {currentUser ? "立即咨询购买" : "登录后立即购买"}
        </button>
      </div>

      {/* 分享底部弹出面板 */}
      <ShareSheet
        open={showShare}
        onClose={() => setShowShare(false)}
        shareUrl={SHARE_URL}
        title="ROMANICO 罗马尼克干红葡萄酒 750ml"
        description="RP 92分 · 西班牙托罗产区 · ¥328"
      />
    </div>
  );
}
