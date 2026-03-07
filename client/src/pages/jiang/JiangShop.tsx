/**
 * 润仪算力研发中心 - 商城页
 * 路由：/jiang/shop
 * 复用 ProductStore 的商品数据，跳转到 /products/:id 详情页
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { toast } from "sonner";
import JiangTabBar from "./JiangTabBar";
import BottomNav from "@/components/BottomNav";
import { ShoppingCart, ChevronRight, Tag, LogIn, Share2 } from "lucide-react";

const SENTIA_ICON = "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/sentia-icon-v1_cfb26d59.png";

const CATEGORIES = [
  { key: "all", label: "全部" },
  { key: "contacts", label: "人脉软件" },
  { key: "ledger", label: "定制账本" },
  { key: "compute", label: "算力包" },
  { key: "homepage", label: "主页定制" },
];

const PRODUCTS = [
  // 人脉管理软件
  {
    id: "contacts-monthly",
    category: "contacts",
    name: "人脉管理 · 月度会员",
    desc: "专业人脉关系管理，让每一段关系都产生价值",
    price: 28,
    unit: "/月",
    tag: "",
    tagColor: "",
    img: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-contacts-4fLDcpWoC7ZCAT35ypvu8N.webp",
    color: "#7C3AED",
  },
  {
    id: "contacts-quarterly",
    category: "contacts",
    name: "人脉管理 · 季度会员",
    desc: "专业人脉关系管理，让每一段关系都产生价值",
    price: 68,
    unit: "/季",
    tag: "省¥46",
    tagColor: "#FF6B35",
    img: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-contacts-4fLDcpWoC7ZCAT35ypvu8N.webp",
    color: "#7C3AED",
  },
  {
    id: "contacts-yearly",
    category: "contacts",
    name: "人脉管理 · 年度会员",
    desc: "专业人脉关系管理，让每一段关系都产生价值",
    price: 198,
    unit: "/年",
    tag: "最受欢迎",
    tagColor: "#D32F2F",
    img: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-contacts-4fLDcpWoC7ZCAT35ypvu8N.webp",
    color: "#7C3AED",
  },
  {
    id: "contacts-lifetime",
    category: "contacts",
    name: "人脉管理 · 终身会员",
    desc: "专业人脉关系管理，让每一段关系都产生价值",
    price: 498,
    unit: "一次",
    tag: "最划算",
    tagColor: "#7B1FA2",
    img: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-contacts-4fLDcpWoC7ZCAT35ypvu8N.webp",
    color: "#7C3AED",
  },
  // 共享账本定制
  {
    id: "ledger-basic",
    category: "ledger",
    name: "共享账本 · 基础定制版",
    desc: "AI 驱动的多场景共享账本，蜂窝式架构",
    price: 299,
    unit: "一次性",
    tag: "入门首选",
    tagColor: "#2E7D32",
    img: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-ledger-NQcVJ5YtbWDun8Aoa4XYAe.webp",
    color: "#D32F2F",
  },
  {
    id: "ledger-standard",
    category: "ledger",
    name: "共享账本 · 标准定制版",
    desc: "AI 驱动的多场景共享账本，蜂窝式架构",
    price: 599,
    unit: "一次性",
    tag: "团队推荐",
    tagColor: "#1565C0",
    img: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-ledger-NQcVJ5YtbWDun8Aoa4XYAe.webp",
    color: "#D32F2F",
  },
  {
    id: "ledger-premium",
    category: "ledger",
    name: "共享账本 · 高级定制版",
    desc: "AI 驱动的多场景共享账本，蜂窝式架构",
    price: 1299,
    unit: "一次性",
    tag: "企业首选",
    tagColor: "#D32F2F",
    img: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-ledger-NQcVJ5YtbWDun8Aoa4XYAe.webp",
    color: "#D32F2F",
  },
  {
    id: "ledger-enterprise",
    category: "ledger",
    name: "共享账本 · 企业定制版",
    desc: "AI 驱动的多场景共享账本，私有化部署",
    price: 3999,
    unit: "一次性",
    tag: "私有化部署",
    tagColor: "#4A148C",
    img: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-ledger-NQcVJ5YtbWDun8Aoa4XYAe.webp",
    color: "#D32F2F",
  },
  // 算力包
  {
    id: "compute-100",
    category: "compute",
    name: "算力包 · 100点",
    desc: "AI算力驱动智能分析，让数据为你工作",
    price: 9.9,
    unit: "一次性",
    tag: "体验装",
    tagColor: "#0277BD",
    img: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-compute-2bXPVJV4rgCSkDNJEdtAFQ.webp",
    color: "#0277BD",
  },
  {
    id: "compute-500",
    category: "compute",
    name: "算力包 · 500点",
    desc: "AI算力驱动智能分析，让数据为你工作",
    price: 39,
    unit: "一次性",
    tag: "省¥10.5",
    tagColor: "#FF6B35",
    img: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-compute-2bXPVJV4rgCSkDNJEdtAFQ.webp",
    color: "#0277BD",
  },
  {
    id: "compute-2000",
    category: "compute",
    name: "算力包 · 2000点",
    desc: "AI算力驱动智能分析，让数据为你工作",
    price: 128,
    unit: "一次性",
    tag: "最划算",
    tagColor: "#D32F2F",
    img: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-compute-2bXPVJV4rgCSkDNJEdtAFQ.webp",
    color: "#0277BD",
  },
  {
    id: "compute-5000",
    category: "compute",
    name: "算力包 · 5000点",
    desc: "AI算力驱动智能分析，企业级算力支持",
    price: 299,
    unit: "一次性",
    tag: "企业级",
    tagColor: "#4A148C",
    img: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-compute-2bXPVJV4rgCSkDNJEdtAFQ.webp",
    color: "#0277BD",
  },
  // 主页定制（咨询类）
  {
    id: "homepage-basic",
    category: "homepage",
    name: "商家主页 · 基础版",
    desc: "AI 全程参与，3天交付，含商城/预约/会员功能",
    price: 1299,
    unit: "一次性",
    tag: "快速交付",
    tagColor: "#2E7D32",
    img: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-compute-2bXPVJV4rgCSkDNJEdtAFQ.webp",
    color: "#2E7D32",
    isConsult: true,
  },
  {
    id: "homepage-premium",
    category: "homepage",
    name: "商家主页 · 高级版",
    desc: "完整品牌数字化方案，含多端适配与支付接入",
    price: 3999,
    unit: "一次性",
    tag: "全功能",
    tagColor: "#D32F2F",
    img: "https://d2xsxph8kpxj0f.cloudfront.net/310519663346422697/cSuKEEZ8CGmJveg8PVZXzb/product-compute-2bXPVJV4rgCSkDNJEdtAFQ.webp",
    color: "#D32F2F",
    isConsult: true,
  },
];

export default function JiangShop() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState("all");

  const handleShare = () => {
    const inviteCode = (user as any)?.inviteCode || "jiang";
    const shareUrl = `${window.location.origin}/jiang?ref=${inviteCode}`;
    if (navigator.share) {
      navigator.share({ title: "润仪算力研发中心", text: "AI 全链路驱动，算力加工，让 AI 为你落地", url: shareUrl });
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => toast.success("链接已复制！已包含您的邀请码"));
    }
  };

  const filtered = activeCategory === "all"
    ? PRODUCTS
    : PRODUCTS.filter((p) => p.category === activeCategory);

  const formatPrice = (price: number) =>
    price % 1 === 0 ? price.toString() : price.toFixed(1);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white">
      {/* 顶部 Header */}
      <div className="bg-[#0d0d14] border-b border-[#D32F2F]/20">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
           <img src={SENTIA_ICON} alt="润仪" className="w-8 h-8 rounded-full" />
          <div className="flex-1">
            <div className="text-sm font-bold text-white leading-tight">润仪算力研发中心</div>
            <div className="text-[10px] text-[#D32F2F] leading-tight">Runyi AI Compute Lab</div>
          </div>
          {!user ? (
            <button
              onClick={() => window.location.href = getLoginUrl()}
              className="flex items-center gap-1 text-[11px] text-[#888899] hover:text-white border border-[#333355] rounded-full px-2.5 py-1 transition-colors"
            >
              <LogIn className="w-3 h-3" />
              登录
            </button>
          ) : (
            <button
              onClick={handleShare}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-[#333355] text-[#888899] hover:text-white hover:border-[#D32F2F]/50 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <JiangTabBar />
      </div>
      <div className="max-w-lg mx-auto pb-24">
        {/* 分类筛选 */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                  activeCategory === cat.key
                    ? "bg-[#D32F2F] text-white"
                    : "bg-[#1a1a2e] text-[#666680] border border-[#1e1e35]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* 商品列表 */}
        <div className="px-4 space-y-3">
          {filtered.map((product) => (
            <div
              key={product.id}
              className="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl overflow-hidden flex items-center gap-3 p-3 cursor-pointer active:opacity-80"
              onClick={() => {
                if (product.isConsult) {
                  setLocation("/jiang/about");
                } else {
                  setLocation(`/products/${product.id}`);
                }
              }}
            >
              <img
                src={product.img}
                alt={product.name}
                className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-sm font-bold text-white truncate">{product.name}</span>
                  {product.tag && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 font-medium"
                      style={{ background: `${product.tagColor}20`, color: product.tagColor }}
                    >
                      {product.tag}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#666680] leading-relaxed line-clamp-1 mb-1.5">{product.desc}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-[10px] text-[#D32F2F]">¥</span>
                    <span className="text-base font-bold text-[#D32F2F]">{formatPrice(product.price)}</span>
                    <span className="text-[10px] text-[#444466]">{product.unit}</span>
                  </div>
                  {product.isConsult ? (
                    <span className="text-[11px] text-[#0277BD] flex items-center gap-0.5">
                      咨询定制 <ChevronRight className="w-3 h-3" />
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#D32F2F] flex items-center gap-0.5">
                      <ShoppingCart className="w-3 h-3" /> 立即购买
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 底部说明 */}
        <div className="px-4 mt-6">
          <div className="bg-[#0d0d1a] border border-[#1e1e35] rounded-2xl p-4">
            <div className="flex items-start gap-2">
              <Tag className="w-4 h-4 text-[#D32F2F] flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-[11px] text-[#888899]">• 算力包永不过期，可随时使用</p>
                <p className="text-[11px] text-[#888899]">• 定制版购买后，工作人员将在 1-3 个工作日内联系您完成配置</p>
                <p className="text-[11px] text-[#888899]">• 主页定制服务请先咋询，确认需求后再下单</p>
                <p className="text-[11px] text-[#888899]">• 支持支付宝付款，安全有保障</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
