/*
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
import {
  ChevronLeft, ShoppingCart, Gift, Shield, ChevronDown,
  ChevronUp, Phone, MessageCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { FALLBACK_PRODUCTS } from "./beauty-fallback-data";

/* ─── 图片资源 ─── */
const IMG = {
  // 压缩版图片（手机端优化，加载更快）
  interiorGlow: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_interior-glow_85c7e788.jpg",
  scienceDiagram: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_science-diagram_74b6138b.jpg",
  lifestyleWoman: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_lifestyle-woman_6ce2894a.jpg",
  benefitsIcons: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_benefits-icons_c59852e6.jpg",
  certification: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_interior-glow_85c7e788.jpg",
  heroOld: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_hero-old_0b3dfbfe.jpg",
  lifestyle: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/compressed_lifestyle_acf1f032.jpg",
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
          alt={`Slide ${i + 1}`}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
            i === idx ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
    </div>
  );
}

/* ─── 主组件 ─── */
export default function BeautyProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [expandedBenefit, setExpandedBenefit] = useState<string | null>(null);
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);

  // 判断是否为兜底数据
  const isFallback = id?.startsWith("fallback-");
  const productId = isFallback ? parseInt(id!.replace("fallback-", "")) : parseInt(id || "0");

  // 从兜底数据或数据库获取商品
  const fallbackProduct = isFallback ? FALLBACK_PRODUCTS.find(p => p.id === productId) : null;
  const { data: dbProduct, isLoading } = trpc.beauty.getProduct.useQuery(
    { id: productId },
    { enabled: !isFallback }
  );

  const product = fallbackProduct || dbProduct;

  // 判断是否为红立方相关产品（用于显示专属详情页）
  const isRedCube = product?.name?.includes("细胞焕能红光养护");
  const isPrivateCustom = product?.name?.includes("元气焕活年度私定养护");

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto bg-[#0a0a0a] text-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-md mx-auto bg-[#0a0a0a] text-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="mb-4">商品未找到</p>
          <button
            onClick={() => setLocation("/beauty/shop")}
            className="px-4 py-2 bg-red-600 rounded hover:bg-red-700"
          >
            返回商城
          </button>
        </div>
      </div>
    );
  }

  // 红立方专属详情页
  if (isRedCube && !isPrivateCustom) {
    return (
      <div className="max-w-md mx-auto bg-[#0a0a0a] text-white min-h-screen">
        {/* 顶部导航 */}
        <div className="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur px-4 py-3 flex items-center justify-between border-b border-white/10">
          <button onClick={() => setLocation("/beauty/shop")} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-sm font-bold flex-1 text-center truncate">{product.name}</h1>
          <div className="w-6" />
        </div>

        {/* Hero 轮播 */}
        <HeroCarousel />

        {/* 商品信息 */}
        <div className="px-4 py-6 space-y-6">
          {/* 标题和价格 */}
          <div>
            <h2 className="text-2xl font-bold mb-2">{product.name}</h2>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-red-500">¥{product.price}</span>
              {product.originalPrice && (
                <span className="text-sm text-gray-400 line-through">¥{product.originalPrice}</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">{product.description}</p>
          </div>

          {/* 功效说明 */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold">核心功效</h3>
            {BENEFITS.map((benefit) => (
              <div key={benefit.num} className="border border-white/10 rounded-lg p-3">
                <button
                  onClick={() => setExpandedBenefit(expandedBenefit === benefit.num ? null : benefit.num)}
                  className="w-full text-left flex items-start justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-red-500 font-bold">{benefit.num}</span>
                      <span className="font-semibold">{benefit.title}</span>
                    </div>
                  </div>
                  {expandedBenefit === benefit.num ? (
                    <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                  )}
                </button>
                {expandedBenefit === benefit.num && (
                  <p className="text-sm text-gray-300 mt-2 ml-6">{benefit.desc}</p>
                )}
              </div>
            ))}
          </div>

          {/* 智能特性 */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold">智能特性</h3>
            {FEATURES.map((feature) => (
              <div key={feature.num} className="border border-white/10 rounded-lg p-3">
                <button
                  onClick={() => setExpandedFeature(expandedFeature === feature.num ? null : feature.num)}
                  className="w-full text-left flex items-start justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-red-500 font-bold">{feature.num}</span>
                      <span className="font-semibold">{feature.title}</span>
                    </div>
                  </div>
                  {expandedFeature === feature.num ? (
                    <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                  )}
                </button>
                {expandedFeature === feature.num && (
                  <p className="text-sm text-gray-300 mt-2 ml-6">{feature.desc}</p>
                )}
              </div>
            ))}
          </div>

          {/* 研究背书 */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold">科学背书</h3>
            {RESEARCH.map((item, idx) => (
              <div key={idx} className="border-l-2 border-red-500 pl-3 py-2">
                <p className="text-xs text-gray-400">{item.year} · {item.journal}</p>
                <p className="text-sm text-gray-200 mt-1">{item.finding}</p>
              </div>
            ))}
          </div>

          {/* 规格参数 */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold">规格参数</h3>
            <div className="space-y-2">
              {SPECS_BASIC.map((spec, idx) => (
                <div key={idx} className="flex justify-between text-sm border-b border-white/5 pb-2">
                  <span className="text-gray-400">{spec.label}</span>
                  <span className="text-white font-medium">{spec.value}</span>
                </div>
              ))}
              {SPECS_EXTRA.map((spec, idx) => (
                <div key={idx} className="flex justify-between text-sm border-b border-white/5 pb-2">
                  <span className="text-gray-400">{spec.label}</span>
                  <span className="text-white font-medium">{spec.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 安全提示 */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-3 flex gap-3">
            <Shield className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-gray-300">
              <p className="font-semibold mb-1">安全提示</p>
              <p>本产品已通过医疗器械认证，安全有效。使用前请阅读说明书，如有不适请停止使用。</p>
            </div>
          </div>
        </div>

        {/* 底部购买栏 */}
        <div className="sticky bottom-0 bg-[#0a0a0a]/95 backdrop-blur border-t border-white/10 px-4 py-4 flex gap-3">
          <button className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white/10 rounded-lg hover:bg-white/20 transition-all">
            <MessageCircle className="w-5 h-5" />
            <span className="text-sm">咨询</span>
          </button>
          <button className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 rounded-lg hover:bg-red-700 transition-all font-semibold">
            <ShoppingCart className="w-5 h-5" />
            <span>立即购买</span>
          </button>
        </div>
      </div>
    );
  }

  // 元气焕活私定养护 - 简洁版详情页
  if (isPrivateCustom) {
    return (
      <div className="max-w-md mx-auto bg-[#0a0a0a] text-white min-h-screen">
        {/* 顶部导航 */}
        <div className="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur px-4 py-3 flex items-center justify-between border-b border-white/10">
          <button onClick={() => setLocation("/beauty/shop")} className="p-1">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h1 className="text-sm font-bold flex-1 text-center truncate">{product.name}</h1>
          <div className="w-6" />
        </div>

        {/* Hero 轮播 */}
        <HeroCarousel />

        {/* 商品信息 */}
        <div className="px-4 py-6 space-y-6">
          {/* 标题和价格 */}
          <div>
            <h2 className="text-2xl font-bold mb-2">{product.name}</h2>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-red-500">¥{product.price}</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">{product.description}</p>
          </div>

          {/* 功效说明 */}
          <div className="space-y-3">
            <h3 className="text-lg font-bold">核心功效</h3>
            {BENEFITS.map((benefit) => (
              <div key={benefit.num} className="border border-white/10 rounded-lg p-3">
                <button
                  onClick={() => setExpandedBenefit(expandedBenefit === benefit.num ? null : benefit.num)}
                  className="w-full text-left flex items-start justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-red-500 font-bold">{benefit.num}</span>
                      <span className="font-semibold">{benefit.title}</span>
                    </div>
                  </div>
                  {expandedBenefit === benefit.num ? (
                    <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                  )}
                </button>
                {expandedBenefit === benefit.num && (
                  <p className="text-sm text-gray-300 mt-2 ml-6">{benefit.desc}</p>
                )}
              </div>
            ))}
          </div>

          {/* 私定服务说明 */}
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
            <h3 className="font-bold flex items-center gap-2">
              <Gift className="w-5 h-5 text-red-500" />
              年度私定养护
            </h3>
            <div className="text-sm text-gray-300 space-y-2">
              <p>✓ 清·通·补三步自然养护</p>
              <p>✓ 给身体一场温柔的焕新之旅</p>
              <p>✓ 一年内任意次私定养护</p>
              <p>✓ 专属顾问一对一服务</p>
              <p>✓ 定制化养护方案</p>
            </div>
          </div>
        </div>

        {/* 底部购买栏 */}
        <div className="sticky bottom-0 bg-[#0a0a0a]/95 backdrop-blur border-t border-white/10 px-4 py-4 flex gap-3">
          <button className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white/10 rounded-lg hover:bg-white/20 transition-all">
            <MessageCircle className="w-5 h-5" />
            <span className="text-sm">咨询</span>
          </button>
          <button className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 rounded-lg hover:bg-red-700 transition-all font-semibold">
            <ShoppingCart className="w-5 h-5" />
            <span>立即购买</span>
          </button>
        </div>
      </div>
    );
  }

  // 通用详情页（其他商品）
  return (
    <div className="max-w-md mx-auto bg-[#0a0a0a] text-white min-h-screen">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-50 bg-[#0a0a0a]/95 backdrop-blur px-4 py-3 flex items-center justify-between border-b border-white/10">
        <button onClick={() => setLocation("/beauty/shop")} className="p-1">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-sm font-bold flex-1 text-center truncate">{product.name}</h1>
        <div className="w-6" />
      </div>

      {/* Hero 轮播 */}
      <HeroCarousel />

      {/* 商品信息 */}
      <div className="px-4 py-6 space-y-6">
        {/* 标题和价格 */}
        <div>
          <h2 className="text-2xl font-bold mb-2">{product.name}</h2>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold text-red-500">¥{product.price}</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">{product.description}</p>
        </div>

        {/* 功效说明 */}
        <div className="space-y-3">
          <h3 className="text-lg font-bold">核心功效</h3>
          {BENEFITS.map((benefit) => (
            <div key={benefit.num} className="border border-white/10 rounded-lg p-3">
              <button
                onClick={() => setExpandedBenefit(expandedBenefit === benefit.num ? null : benefit.num)}
                className="w-full text-left flex items-start justify-between"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-red-500 font-bold">{benefit.num}</span>
                    <span className="font-semibold">{benefit.title}</span>
                  </div>
                </div>
                {expandedBenefit === benefit.num ? (
                  <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                )}
              </button>
              {expandedBenefit === benefit.num && (
                <p className="text-sm text-gray-300 mt-2 ml-6">{benefit.desc}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 底部购买栏 */}
      <div className="sticky bottom-0 bg-[#0a0a0a]/95 backdrop-blur border-t border-white/10 px-4 py-4 flex gap-3">
        <button className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white/10 rounded-lg hover:bg-white/20 transition-all">
          <MessageCircle className="w-5 h-5" />
          <span className="text-sm">咨询</span>
        </button>
        <button className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 rounded-lg hover:bg-red-700 transition-all font-semibold">
          <ShoppingCart className="w-5 h-5" />
          <span>立即购买</span>
        </button>
      </div>
    </div>
  );
}
