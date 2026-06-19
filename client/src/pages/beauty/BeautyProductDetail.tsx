/**
 * 奢贝美容院 - 商品详情（官方级长图文产品页）
 * 路径: /beauty/product/:id
 * 支持两种模式：
 *   - /beauty/product/123       → 从数据库读取
 *   - /beauty/product/fallback-1 → 使用前端兜底数据
 *
 * 设计风格：暗色调 + 红金配色，奢侈品官方页风格
 * 图片资源：实物图 + AI生成配套场景图
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Link, useParams, useLocation } from "wouter";
import { useMerchantOG } from "@/hooks/useMerchantOG";
import {
  ChevronLeft, ShoppingCart, Gift, Shield, ChevronDown,
  ChevronUp, Phone, Share2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FALLBACK_PRODUCTS } from "./beauty-fallback-data";

/* ─── 图片资源 ─── */
const IMG = {
  // 压缩版图片（手机端优化，加载更快）
  interiorGlow: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/compressed_interior-glow_85c7e788.webp",
  scienceDiagram: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/compressed_science-diagram_74b6138b.webp",
  lifestyleWoman: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/compressed_lifestyle-woman_6ce2894a.webp",
  benefitsIcons: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/compressed_benefits-icons_c59852e6.webp",
  certification: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/compressed_interior-glow_85c7e788.webp",
  heroOld: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/compressed_hero-old_0b3dfbfe.webp",
  lifestyle: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/compressed_lifestyle_acf1f032.webp",
};

/* ─── 功效数据 ─── */
const BENEFITS = [
  { num: "01", title: "给身体充电，让生命活力拉满", desc: "唤醒生命的能量，保持旺盛精力、活力满满。" },
  { num: "02", title: "构筑身体防护网，抵御外邪侵入", desc: "升级身体的防御能力，对付流感、感冒的外敌更省力。" },
  { num: "03", title: "打通气血通路，温和驱除寒湿", desc: "温经通络，气血运行通畅，告别寒湿体质。" },
  { num: "04", title: "给肌肤焕新颜，让年轻看得见", desc: "让胶原蛋白充分释放，让肤色更透亮、肤质更细腻。" },
  { num: "05", title: "舒缓身心，优化睡眠质量", desc: "放松身心，减轻焦虑，助推深度睡眠，晨起更有活力。" },
  { num: "06", title: "燃烧多余的脂肪，重塑曼妙身材", desc: "减少脂肪囤积，懒人、美食家也能管理身材。" },
];

/* ─── 智能特性数据 ─── */
const FEATURES = [
  { num: "01", title: "10.1寸智能触控屏", desc: "高清触控操作，一键启动，老人也能轻松使用" },
  { num: "02", title: "8大预设模式", desc: "针对不同需求预设专业模式，智能匹配最佳方案" },
  { num: "03", title: "精准温控系统", desc: "实时监测舱内温度，自动调节至舒适区间" },
  { num: "04", title: "定时功能", desc: "自由设定光浴时长，到时自动关闭，安全无忧" },
  { num: "05", title: "全身360°环绕照射", desc: "多面板均匀覆盖，无死角光浴体验" },
  { num: "06", title: "静音设计", desc: "运行噪音低于40分贝，享受安静的光浴时光" },
  { num: "07", title: "医疗级LED光源", desc: "630-680nm精准波段，高功率密度，穿透力强" },
  { num: "08", title: "安全防护", desc: "过温保护、漏电保护、紧急开门，三重安全保障" },
];

/* ─── 研究背书数据 ─── */
const RESEARCH = [
  { year: "2020", journal: "《光化学和光生物学杂志》", finding: "连续8周红光治疗改善了高脂饮食引起的体重增加、高脂血症和高血糖。" },
  { year: "2023", journal: "《生物光子学杂志》", finding: "红光照射人的背部15分钟可以显著降低血糖水平，将最大葡萄糖峰值降低7.5%。" },
  { year: "2021", journal: "《心脏与血管》杂志", finding: "红光改善了糖尿病线粒体功能并减少了心脏损伤，降低糖尿病与心脏病风险。" },
  { year: "2016", journal: "河北省人民医院研究", finding: "红光治疗前列腺增生的总有效率93.3%，具有消炎消肿、镇痛解痉等良好效果。" },
  { year: "2024", journal: "《光诊疗学：科学与应用》", finding: "红光可显著缓解原发性痛经，改善生活质量。" },
];

/* ─── 规格数据 ─── */
const SPECS_BASIC = [
  { label: "型号规格", value: "RQ-22" },
  { label: "品牌商标", value: "IDEALIGHT 爱达光" },
  { label: "生产单位", value: "上海佰时特健康科技有限公司" },
  { label: "光谱范围", value: "630–680nm 生物活性光" },
  { label: "穿透深度", value: "皮下 8–10mm" },
];
const SPECS_EXTRA = [
  { label: "舱体尺寸", value: "约 0.8m × 0.8m × 2.1m" },
  { label: "控制方式", value: "10.1寸触控屏 + 手机APP" },
  { label: "预设模式", value: "8种专业模式" },
  { label: "安全认证", value: "GB 4706.1-2005 合格品" },
  { label: "报告编号", value: "W02414500335" },
  { label: "检测机构", value: "上海市质量监督检验技术研究院" },
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
      {/* 渐变遮罩 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      {/* 品牌标识 */}
      <div className="absolute top-3 left-0 right-0 flex justify-center">
        <span className="text-white/80 text-xs tracking-[0.2em] font-light">IDEALIGHT · 红立方</span>
      </div>
      {/* 底部指示点 */}
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
export default function BeautyProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: currentUser } = trpc.auth.me.useQuery();
  const [showAllSpecs, setShowAllSpecs] = useState(false);

  // 判断是否使用底逃数据
  const isFallbackRoute = id.startsWith("fallback-");
  const fallbackId = isFallbackRoute ? parseInt(id.replace("fallback-", "")) : null;
  // 底逃商品：直接从底逃数据中查找
  const fallbackProduct = FALLBACK_PRODUCTS.find(p =>
    isFallbackRoute ? p.id === fallbackId : p.name === "placeholder"
  ) ?? null;

  const numericId = !isFallbackRoute && /^\d+$/.test(id) ? parseInt(id) : -1;
  const { data: dbProduct } = trpc.beauty.shop.getProduct.useQuery(
    { id: numericId },
    { enabled: !isFallbackRoute && numericId > 0 }
  );

  // 立即显示：数据库数据优先，如果还在加载则用底逃匹配
  const product = dbProduct ?? (isFallbackRoute ? fallbackProduct : (
    FALLBACK_PRODUCTS.find(p => p.id === numericId) ?? null
  ));
  const isFallback = !dbProduct;

  // 动态注入商家 OG Meta 标签，微信分享显示商家设置的标题/图片
  useMerchantOG('liulifan', {
    title: product?.name ? `${product.name} · 奢贝美容院` : '奢贝美容院',
    desc: product ? `${product.name} ¥${Number(product.price).toLocaleString()}` : '',
    image: product?.imageUrl || undefined,
    url: `${window.location.origin}/beauty/product/${id}`,
  });
  // 分享功能：生成带 ?ref=liulifan 的分享页链接
  const handleShare = () => {
    const shareId = isFallbackRoute ? `fallback-${fallbackId}` : id;
    const shareUrl = `${window.location.origin}/share/beauty/product/${shareId}?ref=liulifan`;
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

  const addToCart = trpc.beauty.shop.addToCart.useMutation({
    onSuccess: () => {
      utils.beauty.shop.getCart.invalidate();
      toast.success("已加入购物车");
    },
    onError: (err) => toast.error("操作失败", { description: err.message }),
  });

  // 不再显示加载中状态，底逃数据立即可用

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
        <p className="text-gray-400 text-sm">商品不存在</p>
        <Link href="/beauty/shop">
          <Button variant="outline" size="sm">返回商城</Button>
        </Link>
      </div>
    );
  }

  // 红立方光焕能舱和细胞焕能红光养护系列都使用专属详情页
  const isRedCube = product.name.includes("红立方") || product.name.includes("光焕能舱") || product.name.includes("细胞焕能红光养护");

  /* ── 非红立方商品：简洁版 ── */
  if (!isRedCube) {
    return (
      <div className="min-h-screen bg-gray-50 pb-24">
        <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => navigate("/beauty/shop")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="font-semibold text-gray-800">商品详情</h1>
            <div className="w-8" />
          </div>
        </div>
        <div className="h-64 bg-gradient-to-br from-rose-50 to-pink-50 flex items-center justify-center overflow-hidden">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <Gift className="w-16 h-16 text-rose-200" />
          )}
        </div>
        <div className="px-4 py-4 space-y-4">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h1 className="text-xl font-bold text-gray-800">{product.name}</h1>
            <div className="mt-2">
              <span className="text-rose-500 font-bold text-2xl">¥{Number(product.price).toLocaleString()}</span>
            </div>
          </div>
          {product.description && (
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="font-semibold text-gray-700 text-sm mb-2">商品介绍</h3>
              <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-line">{product.description}</p>
            </div>
          )}
        </div>
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 flex gap-3">
          <Link href="/beauty/cart" className="flex-1">
            <Button variant="outline" className="w-full border-rose-300 text-rose-500">
              <ShoppingCart className="w-4 h-4 mr-1" />查看购物车
            </Button>
          </Link>
          <Button
            className="flex-1 bg-rose-500 hover:bg-rose-600 text-white"
            onClick={() => !isFallback ? addToCart.mutate({ productId: product.id, quantity: 1 }) : toast.info("请联系客服咨询购买")}
            disabled={!isFallback && addToCart.isPending}
          >
            {isFallback ? "咨询购买" : "加入购物车"}
          </Button>
        </div>
      </div>
    );
  }

  /* ── 红立方专属：官方级长图文产品页 ── */
  return (
    <div className="min-h-screen pb-24" style={{ background: "#0a0a0a", color: "#f5f0eb" }}>
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between px-4 py-3"
        style={{ background: "rgba(10,10,10,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <button
          onClick={() => navigate("/beauty/shop")}
          className="w-8 h-8 flex items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.08)" }}
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <span className="text-white/70 text-xs tracking-[0.15em]">{product.name.includes("红立方") ? "IDEALIGHT · 红立方" : "奢贝美容院 · 红光养护"}</span>
        {currentUser?.username ? (
          <span className="text-xs text-white/20 select-none">{currentUser.username}</span>
        ) : <div className="w-8" />}
      </div>

      {/* ① Hero 轮播 */}
      <HeroCarousel />

      {/* ② 产品标题 + 价格 */}
      <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs tracking-widest" style={{ color: "#c9a84c" }}>IDEALIGHT 爱达光</span>
          <span className="text-xs text-white/20">·</span>
          <span className="text-xs text-white/40">{product.specification || "红光养护"}</span>
        </div>
        <h1 className="text-2xl font-bold text-white leading-tight">{product.name}</h1>
        <p className="text-sm text-white/50 mt-1">{product.name.includes("红立方") ? "RQ-22 · 给身体充能 · 促循环 · 排浊 · 提活力 · 助好眠" : "细胞焕能红光养护 · 全身360°环绕照射"}</p>
        <div className="flex items-baseline gap-3 mt-3">
          <span className="text-3xl font-bold" style={{ color: "#e11d48" }}>
            ¥{Number(product.price).toLocaleString()}
          </span>
          <span className="text-xs text-white/30">{product.specification || "养护套餐"}</span>
        </div>
      </div>

      {/* ③ 品牌理念 */}
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

      {/* ④ 产品实拍 - 三图展示 */}
      <div className="py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-5 mb-4">
          <div className="text-xs tracking-widest mb-1" style={{ color: "#c9a84c" }}>产品实拍</div>
          <h2 className="text-lg font-bold text-white">IDEALIGHT 爱达光 · 实机展示</h2>
        </div>
        {/* 大图 */}
        <div className="w-full overflow-hidden" style={{ height: "56vw", maxHeight: 320 }}>
          <img src={IMG.interiorGlow} alt="舱内红光效果" className="w-full h-full object-cover" />
        </div>
        {/* 双图 */}
        <div className="flex gap-1 mt-1 px-0">
          <div className="flex-1 overflow-hidden" style={{ height: "40vw", maxHeight: 220 }}>
            <img src={IMG.heroOld} alt="产品展示" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 overflow-hidden" style={{ height: "40vw", maxHeight: 220 }}>
            <img src={IMG.lifestyle} alt="使用场景" className="w-full h-full object-cover" />
          </div>
        </div>
        <div className="flex px-5 mt-2">
          <span className="flex-1 text-center text-xs text-white/30">产品外观展示</span>
          <span className="flex-1 text-center text-xs text-white/30">使用场景</span>
        </div>
      </div>

      {/* ⑤ 六大核心功效 */}
      <div className="py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-5 mb-4">
          <div className="text-xs tracking-widest mb-1" style={{ color: "#c9a84c" }}>六大核心功效</div>
          <h2 className="text-lg font-bold text-white">悉心守护您的健康</h2>
          <p className="text-sm text-white/40 mt-1">红光疗法从细胞层面激活身体自愈力，六大维度多维调理身体。</p>
        </div>
        {/* 功效图标横幅 */}
        <div className="w-full overflow-hidden mb-4" style={{ height: "42vw", maxHeight: 240 }}>
          <img src={IMG.benefitsIcons} alt="六大功效" className="w-full h-full object-cover" />
        </div>
        {/* 功效卡片 */}
        <div className="px-5 grid grid-cols-1 gap-3">
          {BENEFITS.map((b, i) => (
            <div
              key={i}
              className="flex gap-4 items-start p-4 rounded-xl"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <span
                className="text-xs font-bold flex-shrink-0 mt-0.5"
                style={{ color: "#c9a84c", minWidth: 20 }}
              >
                {b.num}
              </span>
              <div>
                <p className="text-sm font-semibold text-white">{b.title}</p>
                <p className="text-xs text-white/50 mt-1 leading-relaxed">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ⑥ 生活方式大图 */}
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

      {/* ⑦ 八大智能特性 */}
      <div className="px-5 py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="text-xs tracking-widest mb-1" style={{ color: "#c9a84c" }}>智能科技</div>
        <h2 className="text-lg font-bold text-white mb-1">八大智能特性</h2>
        <p className="text-sm text-white/40 mb-4">科技赋能健康，每一个细节都经过精心打磨。</p>
        <div className="space-y-0">
          {FEATURES.map((f, i) => (
            <div
              key={i}
              className="flex items-start gap-4 py-4"
              style={{ borderBottom: i < FEATURES.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}
            >
              <span className="text-xs font-bold flex-shrink-0 mt-0.5" style={{ color: "#c9a84c", minWidth: 20 }}>{f.num}</span>
              <div>
                <p className="text-sm font-semibold text-white">{f.title}</p>
                <p className="text-xs text-white/40 mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ⑧ 科学原理 */}
      <div className="py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-5 mb-4">
          <div className="text-xs tracking-widest mb-1" style={{ color: "#c9a84c" }}>科学原理</div>
          <h2 className="text-lg font-bold text-white">红光如何在细胞层面发挥作用</h2>
          <p className="text-sm text-white/50 mt-1 leading-relaxed">
            红光是波长为 <span className="text-white/80 font-medium">630–680nm</span> 的红色可见光，属于生物活性光，
            可安全地穿透皮下 8–10mm，产生生物效应和光化学效应。
          </p>
        </div>
        {/* 科学图解 */}
        <div className="w-full overflow-hidden" style={{ height: "56vw", maxHeight: 320 }}>
          <img src={IMG.scienceDiagram} alt="科学原理图解" className="w-full h-full object-cover" />
        </div>
        {/* 三大机制 */}
        <div className="px-5 mt-4 space-y-3">
          {[
            { tag: "ATP", color: "#e11d48", title: "三磷酸腺苷", desc: "促进ATP产生，为细胞线粒体增加能量，提高细胞抗感染能力并加速修复过程。" },
            { tag: "ROS", color: "#c9a84c", title: "活性氧调节", desc: "对活性氧的调节，可激活转录因子，对细胞修复和愈合产生积极影响。" },
            { tag: "NO", color: "#7c3aed", title: "一氧化氮", desc: "产生一氧化氮，一种强效血管舒张剂，增加循环、减少炎症，增强氧气和免疫细胞运输。" },
          ].map((m) => (
            <div
              key={m.tag}
              className="flex gap-3 items-start p-3 rounded-lg"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <span
                className="text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 mt-0.5"
                style={{ background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}44` }}
              >
                {m.tag}
              </span>
              <div>
                <p className="text-sm font-semibold text-white">{m.title}</p>
                <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{m.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ⑨ 权威研究背书 */}
      <div className="px-5 py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="text-xs tracking-widest mb-1" style={{ color: "#c9a84c" }}>权威研究背书</div>
        <h2 className="text-lg font-bold text-white mb-1">全球顶级期刊实证</h2>
        <p className="text-sm text-white/40 mb-4">红光疗法的健康益处已获得全球多项权威研究的科学验证。</p>
        <div className="space-y-3">
          {RESEARCH.map((r, i) => (
            <div
              key={i}
              className="p-4 rounded-xl"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded"
                  style={{ background: "rgba(201,168,76,0.15)", color: "#c9a84c" }}
                >
                  {r.year}
                </span>
                <span className="text-xs text-white/50">{r.journal}</span>
              </div>
              <p className="text-xs text-white/70 leading-relaxed">{r.finding}</p>
            </div>
          ))}
        </div>
        {/* 引用语 */}
        <div
          className="mt-5 p-4 rounded-xl text-center"
          style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)" }}
        >
          <p className="text-sm italic leading-relaxed" style={{ color: "#c9a84c" }}>
            "红光疗法是过去半个世纪健康领域最大的突破性发现之一"
          </p>
          <p className="text-xs text-white/30 mt-2">—— 摘自美国出版的《红光理疗终极指南》</p>
        </div>
      </div>

      {/* ⑩ 产品规格参数 */}
      <div className="px-5 py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="text-xs tracking-widest mb-1" style={{ color: "#c9a84c" }}>产品规格参数</div>
        <h2 className="text-lg font-bold text-white mb-4">详细参数</h2>
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {SPECS_BASIC.map((s, i) => (
            <div
              key={i}
              className="flex items-center px-4 py-3"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}
            >
              <span className="text-xs text-white/40 w-24 flex-shrink-0">{s.label}</span>
              <span className="text-xs text-white/80 flex-1">{s.value}</span>
            </div>
          ))}
          {showAllSpecs && SPECS_EXTRA.map((s, i) => (
            <div
              key={i}
              className="flex items-center px-4 py-3"
              style={{ borderBottom: i < SPECS_EXTRA.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", background: (i + SPECS_BASIC.length) % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}
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
          {showAllSpecs ? <><ChevronUp className="w-3 h-3" />收起规格</> : <><ChevronDown className="w-3 h-3" />查看完整规格</>}
        </button>
      </div>

      {/* ⑪ 检测认证 */}
      <div className="py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-5 mb-4">
          <div className="text-xs tracking-widest mb-1" style={{ color: "#c9a84c" }}>权威检测认证</div>
          <h2 className="text-lg font-bold text-white">符合国家安全标准</h2>
        </div>
        {/* 认证图 */}
        <div className="w-full overflow-hidden" style={{ height: "52vw", maxHeight: 300 }}>
          <img src={IMG.certification} alt="检测认证" className="w-full h-full object-cover" />
        </div>
        {/* 认证详情 */}
        <div className="px-5 mt-4">
          <div
            className="p-4 rounded-xl"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "#c9a84c" }} />
              <div>
                <p className="text-sm font-semibold text-white">质量检测报告</p>
                <p className="text-xs text-white/50 mt-1 leading-relaxed">
                  经<span className="text-white/80">上海市质量监督检验技术研究院</span>委托检测，
                  依据 GB 4706.1-2005 家用和类似用途电器安全标准，
                  检测结论：<span style={{ color: "#c9a84c" }}>合格品</span>。
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs text-white/30">报告编号</span>
                  <span className="text-xs text-white/60">W02414500335</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-white/30">检测标准</span>
                  <span className="text-xs text-white/60">GB 4706.1-2005</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              {["CMA计量认证", "CNAS实验室认证", "国际互认资质", "上海质检院"].map(tag => (
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

      {/* ⑫ 购买引导 */}
      <div className="px-5 py-10 text-center">
        <div className="text-xs tracking-widest mb-2" style={{ color: "#c9a84c" }}>开启您的光浴之旅</div>
        <h2 className="text-xl font-bold text-white mb-1">元气焕活</h2>
        <h2 className="text-xl font-bold text-white mb-4">年度私定养护</h2>
        <p className="text-sm text-white/40 mb-6 leading-relaxed">
          每一次光浴都是对健康的投资。<br />
          让红光科技守护您和家人的每一天。
        </p>
        <div className="text-4xl font-bold mb-2" style={{ color: "#e11d48" }}>
          ¥{Number(product.price).toLocaleString()}
        </div>
        <p className="text-xs text-white/30 mb-6">专业顾问一对一服务 · 到店免费体验</p>
        <button
          onClick={() => !isFallback ? addToCart.mutate({ productId: product.id, quantity: 1 }) : toast.info("请联系客服咨询购买")}
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
        <button
          onClick={handleShare}
          className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          title="分享商品"
        >
          <Share2 className="w-5 h-5 text-white/60" />
        </button>
        <Link href="/beauty/cart" className="flex-1">
          <button
            className="w-full h-12 rounded-xl text-sm font-medium"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
          >
            <ShoppingCart className="w-4 h-4 inline mr-1.5" />
            购物车
          </button>
        </Link>
        <button
          onClick={() => !isFallback ? addToCart.mutate({ productId: product.id, quantity: 1 }) : toast.info("请联系客服咨询购买")}
          disabled={!isFallback && addToCart.isPending}
          className="flex-1 h-12 rounded-xl text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg, #e11d48, #9f1239)" }}
        >
          立即预约体验
        </button>
      </div>
    </div>
  );
}
