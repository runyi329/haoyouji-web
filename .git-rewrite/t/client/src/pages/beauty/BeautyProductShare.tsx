/**
 * 奢贝美容院 - 商品分享页（海报式独立页面）
 * 路径: /share/beauty/product/:id
 *
 * 规则：
 * - 完全免登录浏览，不做任何认证检查
 * - 无顶部导航栏、无返回按钮、无底部 TabBar
 * - 顶部仅显示品牌 Logo 标识
 * - 底部固定「立即购买」按钮：
 *   - 已登录 → 跳转到商品详情页 /beauty/product/:id
 *   - 未登录 → 跳转到登录页，登录后回到商品详情页
 * - 分享链接自带 ?ref=liulifan 邀请码（由分享方生成，此页面负责存储）
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useParams, useLocation } from "wouter";
import { useMerchantOG } from "@/hooks/useMerchantOG";
import { Share2, Shield, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { FALLBACK_PRODUCTS } from "./beauty-fallback-data";

/* ─── 图片资源 ─── */
const IMG = {
  interiorGlow: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/compressed_interior-glow_85c7e788.webp",
  scienceDiagram: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/compressed_science-diagram_74b6138b.webp",
  lifestyleWoman: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/compressed_lifestyle-woman_6ce2894a.webp",
  benefitsIcons: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/compressed_benefits-icons_c59852e6.webp",
  heroOld: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/compressed_hero-old_0b3dfbfe.webp",
  lifestyle: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/compressed_lifestyle_acf1f032.webp",
};

const BENEFITS = [
  { num: "01", title: "给身体充电，让生命活力拉满", desc: "唤醒生命的能量，保持旺盛精力、活力满满。" },
  { num: "02", title: "构筑身体防护网，抵御外邪侵入", desc: "升级身体的防御能力，对付流感、感冒的外敌更省力。" },
  { num: "03", title: "打通气血通路，温和驱除寒湿", desc: "温经通络，气血运行通畅，告别寒湿体质。" },
  { num: "04", title: "给肌肤焕新颜，让年轻看得见", desc: "让胶原蛋白充分释放，让肤色更透亮、肤质更细腻。" },
  { num: "05", title: "舒缓身心，优化睡眠质量", desc: "放松身心，减轻焦虑，助推深度睡眠，晨起更有活力。" },
  { num: "06", title: "燃烧多余的脂肪，重塑曼妙身材", desc: "减少脂肪囤积，懒人、美食家也能管理身材。" },
];

const SPECS_BASIC = [
  { label: "型号规格", value: "RQ-22" },
  { label: "品牌商标", value: "IDEALIGHT 爱达光" },
  { label: "生产单位", value: "上海佰时特健康科技有限公司" },
  { label: "光谱范围", value: "630–680nm 生物活性光" },
  { label: "穿透深度", value: "皮下 8–10mm" },
];

/* ─── Hero 图片轮播 ─── */
function HeroCarousel() {
  const images = [IMG.interiorGlow, IMG.heroOld, IMG.lifestyle];
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setIdx(p => (p + 1) % images.length), 4000);
  }, [images.length]);

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [resetTimer]);

  return (
    <div className="relative w-full overflow-hidden" style={{ height: "72vw", maxHeight: 420 }}>
      {images.map((src, i) => (
        <img
          key={i}
          src={src}
          alt={`红立方产品图${i + 1}`}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
          style={{ opacity: i === idx ? 1 : 0 }}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
        {images.map((_, i) => (
          <button
            key={i}
            onClick={() => { setIdx(i); resetTimer(); }}
            className="transition-all duration-300"
            style={{
              width: i === idx ? 20 : 6,
              height: 6,
              borderRadius: 3,
              background: i === idx ? "#e11d48" : "rgba(255,255,255,0.4)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── 主组件 ─── */
export default function BeautyProductShare() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [showAllSpecs, setShowAllSpecs] = useState(false);

  // 读取当前用户（不强制登录）
  const { data: currentUser } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
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

  // 判断是否使用兜底数据
  const isFallbackRoute = id.startsWith("fallback-");
  const fallbackId = isFallbackRoute ? parseInt(id.replace("fallback-", "")) : null;
  const fallbackProduct = FALLBACK_PRODUCTS.find(p =>
    isFallbackRoute ? p.id === fallbackId : p.name === "placeholder"
  ) ?? null;

  const numericId = !isFallbackRoute && /^\d+$/.test(id) ? parseInt(id) : -1;
  const { data: dbProduct } = trpc.beauty.shop.getProduct.useQuery(
    { id: numericId },
    { enabled: !isFallbackRoute && numericId > 0 }
  );

  const product = dbProduct ?? (isFallbackRoute ? fallbackProduct : (
    FALLBACK_PRODUCTS.find(p => p.id === numericId) ?? null
  ));

  // 动态注入商家 OG Meta 标签，微信分享显示商家设置的标题/图片
  useMerchantOG('liulifan', {
    title: product?.name ? `${product.name} · 奢贝美容院` : '奢贝美容院',
    desc: product ? `${product.name} ¥${Number(product.price).toLocaleString()}` : '',
    image: product?.imageUrl || undefined,
    url: `${window.location.origin}/share/beauty/product/${id}`,
  });

  // 点击购买按钮
  const handleBuy = () => {
    const detailPath = isFallbackRoute ? `/beauty/product/fallback-${fallbackId}` : `/beauty/product/${id}`;
    if (currentUser) {
      // 已登录，直接跳转到详情页
      navigate(detailPath);
    } else {
      // 未登录，跳转登录页，登录后回到详情页
      navigate(`/login?redirect=${encodeURIComponent(detailPath)}`);
    }
  };

  // 继续分享
  const handleShare = () => {
    const shareUrl = `${window.location.origin}/share/beauty/product/${id}?ref=liulifan`;
    if (navigator.share) {
      navigator.share({
        title: product?.name ?? "奢贝美容院 · 商品分享",
        text: `${product?.name ?? "精选商品"} ¥${Number(product?.price ?? 0).toLocaleString()}`,
        url: shareUrl,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => {
        toast.success("分享链接已复制", { description: "可粘贴到微信、朋友圈分享" });
      }).catch(() => {
        toast.info("分享链接", { description: shareUrl });
      });
    }
  };

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <p className="text-white/40 text-sm">商品不存在</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24" style={{ background: "#0a0a0a", color: "#f5f0eb" }}>

      {/* 顶部品牌标识（无返回按钮，无导航） */}
      <div
        className="flex items-center justify-center px-4 py-4"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="text-center">
          <p className="text-xs tracking-[0.3em] text-white/40 font-light">IDEALIGHT · 爱达光</p>
          <p className="text-xs text-white/20 mt-0.5 tracking-wider">奢贝美容院 · 官方推荐</p>
        </div>
      </div>

      {/* Hero 轮播 */}
      <HeroCarousel />

      {/* 产品标题 + 价格 */}
      <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs tracking-widest" style={{ color: "#c9a84c" }}>IDEALIGHT 爱达光</span>
          <span className="text-xs text-white/20">·</span>
          <span className="text-xs text-white/40">{product.specification || "红光养护"}</span>
        </div>
        <h1 className="text-2xl font-bold text-white leading-tight">{product.name}</h1>
        <p className="text-sm text-white/50 mt-1">RQ-22 · 给身体充能 · 促循环 · 排浊 · 提活力 · 助好眠</p>
        <div className="flex items-baseline gap-3 mt-3">
          <span className="text-3xl font-bold" style={{ color: "#e11d48" }}>
            ¥{Number(product.price).toLocaleString()}
          </span>
          <span className="text-xs text-white/30">{product.specification || "养护套餐"}</span>
        </div>
        {/* 未登录提示 */}
        {!currentUser && (
          <div
            className="mt-3 px-3 py-2 rounded-lg text-xs text-center"
            style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.2)", color: "#c9a84c" }}
          >
            点击「立即购买」登录后即可下单，首次注册自动绑定专属顾问
          </div>
        )}
      </div>

      {/* 品牌理念 */}
      <div className="px-5 py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="text-xs tracking-widest mb-2" style={{ color: "#c9a84c" }}>品牌理念</div>
        <h2 className="text-lg font-bold text-white mb-3">红光舱 = 给身体充能</h2>
        <p className="text-sm leading-relaxed text-white/60">
          红光是波长为 <span className="text-white/90 font-medium">630–680nm</span> 的红色可见光，属于生物活性光。
          它可安全穿透皮下 8–10mm，在细胞层面产生生物效应和光化学效应。
          诺贝尔奖级别的光疗科技，经过半个世纪的临床验证，如今以「红立方」的形态，
          将专业级红光疗法带入您的私人空间。
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          {["诺奖科技", "百年传承", "医疗级光源", "安全认证", "智能操控"].map(tag => (
            <span
              key={tag}
              className="text-xs px-3 py-1 rounded-full"
              style={{ border: "1px solid rgba(201,168,76,0.4)", color: "#c9a84c" }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* 产品实拍 */}
      <div className="py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-5 mb-4">
          <div className="text-xs tracking-widest mb-1" style={{ color: "#c9a84c" }}>产品实拍</div>
          <h2 className="text-lg font-bold text-white">IDEALIGHT 爱达光 · 实机展示</h2>
        </div>
        <div className="w-full overflow-hidden" style={{ height: "56vw", maxHeight: 320 }}>
          <img src={IMG.interiorGlow} alt="舱内红光效果" className="w-full h-full object-cover" />
        </div>
        <div className="flex gap-1 mt-1">
          <div className="flex-1 overflow-hidden" style={{ height: "40vw", maxHeight: 220 }}>
            <img src={IMG.heroOld} alt="产品展示" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 overflow-hidden" style={{ height: "40vw", maxHeight: 220 }}>
            <img src={IMG.lifestyle} alt="使用场景" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>

      {/* 六大核心功效 */}
      <div className="py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-5 mb-4">
          <div className="text-xs tracking-widest mb-1" style={{ color: "#c9a84c" }}>六大核心功效</div>
          <h2 className="text-lg font-bold text-white">悉心守护您的健康</h2>
        </div>
        <div className="w-full overflow-hidden mb-4" style={{ height: "42vw", maxHeight: 240 }}>
          <img src={IMG.benefitsIcons} alt="六大功效" className="w-full h-full object-cover" />
        </div>
        <div className="px-5 grid grid-cols-1 gap-3">
          {BENEFITS.map((b, i) => (
            <div
              key={i}
              className="flex gap-4 items-start p-4 rounded-xl"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <span className="text-xs font-bold flex-shrink-0 mt-0.5" style={{ color: "#c9a84c", minWidth: 20 }}>{b.num}</span>
              <div>
                <p className="text-sm font-semibold text-white">{b.title}</p>
                <p className="text-xs text-white/50 mt-1 leading-relaxed">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 生活方式大图 */}
      <div className="relative" style={{ height: "90vw", maxHeight: 500 }}>
        <img src={IMG.lifestyleWoman} alt="生活方式" className="w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(10,10,10,0.9) 0%, rgba(10,10,10,0.2) 50%, transparent 100%)" }} />
        <div className="absolute bottom-8 left-5 right-5">
          <p className="text-white/60 text-xs tracking-widest mb-1">每一次光浴</p>
          <p className="text-white text-xl font-bold">都是给身体的充能仪式</p>
          <p className="text-white/50 text-xs mt-2 leading-relaxed">
            在温暖的红光中放松身心，让细胞重获活力。<br />
            这不仅是一次理疗，更是一种高品质的生活方式。
          </p>
        </div>
      </div>

      {/* 规格参数 */}
      <div className="px-5 py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="text-xs tracking-widest mb-1" style={{ color: "#c9a84c" }}>产品规格</div>
        <h2 className="text-lg font-bold text-white mb-4">技术参数</h2>
        <div className="space-y-0">
          {SPECS_BASIC.map((s, i) => (
            <div
              key={i}
              className="flex items-center py-3"
              style={{ borderBottom: i < SPECS_BASIC.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}
            >
              <span className="text-xs text-white/40 w-24 flex-shrink-0">{s.label}</span>
              <span className="text-xs text-white/80 flex-1">{s.value}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowAllSpecs(v => !v)}
          className="w-full flex items-center justify-center gap-1 mt-3 py-2 text-xs"
          style={{ color: "#c9a84c" }}
        >
          {showAllSpecs ? <><ChevronUp className="w-3 h-3" />收起</> : <><ChevronDown className="w-3 h-3" />查看完整规格</>}
        </button>
      </div>

      {/* 检测认证 */}
      <div className="px-5 py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="text-xs tracking-widest mb-1" style={{ color: "#c9a84c" }}>权威认证</div>
        <div
          className="p-4 rounded-xl mt-3"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#c9a84c" }} />
            <div>
              <p className="text-sm font-semibold text-white">质量检测报告</p>
              <p className="text-xs text-white/50 mt-1 leading-relaxed">
                经<span className="text-white/80">上海市质量监督检验技术研究院</span>委托检测，
                依据 GB 4706.1-2005 标准，检测结论：<span style={{ color: "#c9a84c" }}>合格品</span>。
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {["CMA计量认证", "CNAS实验室认证", "国际互认资质"].map(tag => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ background: "rgba(201,168,76,0.1)", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.25)" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 购买引导 */}
      <div className="px-5 py-10 text-center">
        <div className="text-xs tracking-widest mb-2" style={{ color: "#c9a84c" }}>开启您的光浴之旅</div>
        <h2 className="text-xl font-bold text-white mb-1">元气焕活</h2>
        <h2 className="text-xl font-bold text-white mb-4">年度私定养护</h2>
        <div className="text-4xl font-bold mb-2" style={{ color: "#e11d48" }}>
          ¥{Number(product.price).toLocaleString()}
        </div>
        <p className="text-xs text-white/30 mb-6">专业顾问一对一服务 · 到店免费体验</p>
        <button
          onClick={handleBuy}
          className="w-full py-4 rounded-xl text-white font-bold text-base tracking-wider"
          style={{ background: "linear-gradient(135deg, #e11d48, #9f1239)" }}
        >
          立即预约体验
        </button>
      </div>

      {/* 页脚 */}
      <div className="px-5 pb-4 text-center" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-xs text-white/20 pt-4">IDEALIGHT 爱达光</p>
        <p className="text-xs text-white/15 mt-1">上海佰时特健康科技有限公司</p>
      </div>

      {/* 底部固定操作栏 */}
      <div
        className="fixed bottom-0 left-0 right-0 px-4 py-3 flex gap-3"
        style={{ background: "rgba(10,10,10,0.95)", backdropFilter: "blur(16px)", borderTop: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* 继续分享按钮 */}
        <button
          onClick={handleShare}
          className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <Share2 className="w-5 h-5 text-white/60" />
        </button>
        {/* 立即购买 */}
        <button
          onClick={handleBuy}
          className="flex-1 h-12 rounded-xl text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg, #e11d48, #9f1239)" }}
        >
          {currentUser ? "立即预约体验" : "登录后立即购买"}
        </button>
      </div>
    </div>
  );
}
