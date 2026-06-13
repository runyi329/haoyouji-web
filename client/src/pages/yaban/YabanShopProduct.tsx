/**
 * 牙伴齿科商城 - 商品详情页
 * 路由：/yaban/shop/product/:id
 */
import { useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ChevronLeft, ShoppingCart, Minus, Plus, Share2, Copy, X } from "lucide-react";
import { PageTag } from "@/components/PageTag";
import { useCart } from "./useCart";
import { useShopProduct } from "./useShopProducts";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

export default function YabanShopProduct() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/yaban/shop/product/:id");
  const id = params?.id || "";
  const { product, isLoading } = useShopProduct(id);
  const { add, count } = useCart();
  const { user } = useAuth();
  const [qty, setQty] = useState(1);
  const [showShare, setShowShare] = useState(false);

  // 分享带参链接：携带门店(tenant)与分享人标识，便于裂变源追踪
  const shareUrl = (() => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const ref = user?.id ? `&ref=${user.id}` : "";
    return `${base}/yaban/shop/product/${id}?from=share&t=1${ref}`;
  })();

  const handleShare = async () => {
    const title = product ? `${product.name} · 牙伴齿科商城` : "牙伴齿科商城";
    const text = product ? `推荐给你：${product.name}，¥${product.price}起` : "";
    // 优先调用手机原生分享
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title, text, url: shareUrl });
        return;
      } catch {
        // 用户取消或不支持，回退到面板
      }
    }
    setShowShare(true);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("链接已复制，可粘贴发送给好友");
    } catch {
      toast.error("复制失败，请长按链接手动复制");
    }
  };

  if (isLoading && !product) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex items-center justify-center">
        <p className="text-sm text-gray-400">加载中…</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex flex-col items-center justify-center">
        <p className="text-sm text-gray-400 mb-4">商品不存在</p>
        <button
          onClick={() => navigate("/yaban/shop")}
          className="text-sm text-[#2196C8]"
        >
          返回商城
        </button>
      </div>
    );
  }

  const isService = product.kind === "service";

  const handleAddCart = () => {
    add(product.id, qty);
    toast.success("已加入购物车");
  };

  const handleBuyNow = () => {
    add(product.id, qty);
    navigate("/yaban/shop/checkout?from=buynow");
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] pb-20">
      <PageTag code="P303" />

      {/* 顶部返回栏 */}
      <div className="bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-3 py-3 flex items-center justify-between">
          <button onClick={() => navigate("/yaban/shop")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">商品详情</span>
          <div className="flex items-center gap-3">
            <button onClick={handleShare} aria-label="分享">
              <Share2 className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate("/yaban/shop/cart")}
              className="relative"
              aria-label="购物车"
            >
              <ShoppingCart className="w-5 h-5" />
              {count > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-[#FF5A5A] text-white text-[10px] rounded-full flex items-center justify-center">
                  {count}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto">
        {/* 主图 */}
        <div className="w-full aspect-square bg-gradient-to-br from-[#EAF6FC] to-[#D6EEFB] flex items-center justify-center">
          {product.image ? (
            <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[#9DCCE6] text-sm">配图准备中</span>
          )}
        </div>

        {/* 价格区 */}
        <div className="bg-white px-4 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[#FF5A5A] text-2xl font-bold">¥{product.price}</span>
            {product.originalPrice && (
              <span className="text-sm text-gray-300 line-through">¥{product.originalPrice}</span>
            )}
            <span className="ml-auto text-xs text-gray-400">已售 {product.sales}</span>
          </div>
          <h1 className="text-base font-bold text-gray-800 mt-2">{product.name}</h1>
          <p className="text-sm text-gray-400 mt-1">{product.subtitle}</p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {product.tags.map((t) => (
              <span key={t} className="text-[11px] text-[#2196C8] bg-[#EAF6FC] px-2 py-0.5 rounded">
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* 诊疗项目提示 */}
        {isService && (
          <div className="mx-3 mt-2 bg-gradient-to-r from-[#E8F4FD] to-[#D6EEFB] rounded-lg px-3 py-2.5">
            <p className="text-[12px] text-[#1A6E96] leading-relaxed">
              诊疗项目需到院面诊，线上支付为预约定金或诊疗预约，具体方案与余款以到院为准。
            </p>
          </div>
        )}

        {/* 数量选择 */}
        <div className="bg-white px-4 py-3 mt-2 flex items-center justify-between">
          <span className="text-sm text-gray-700">数量</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 active:bg-gray-50"
              aria-label="减少"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-gray-800 w-6 text-center">{qty}</span>
            <button
              onClick={() => setQty((q) => q + 1)}
              className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 active:bg-gray-50"
              aria-label="增加"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 详情描述 */}
        <div className="bg-white px-4 py-4 mt-2">
          <h2 className="text-sm font-bold text-gray-800 mb-2">商品详情</h2>
          {product.description.map((line, i) => (
            <p key={i} className="text-[13px] text-gray-600 leading-relaxed mb-1.5">
              {line}
            </p>
          ))}
        </div>
      </div>

      {/* 分享面板 */}
      {showShare && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={() => setShowShare(false)}>
          <div className="mt-auto bg-white rounded-t-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-base font-bold text-gray-800">分享商品</span>
              <button onClick={() => setShowShare(false)} aria-label="关闭">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="p-4 space-y-3" style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}>
              <p className="text-xs text-gray-500">复制以下链接，发送给好友或发到朋友圈：</p>
              <div className="flex items-center gap-2 bg-[#F5F7FA] rounded-lg px-3 py-2">
                <span className="flex-1 text-xs text-gray-600 truncate">{shareUrl}</span>
                <button onClick={copyLink} className="flex items-center gap-1 text-[#2196C8] text-xs shrink-0">
                  <Copy className="w-3.5 h-3.5" /> 复制
                </button>
              </div>
              <button onClick={copyLink} className="w-full py-3 rounded-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white text-sm font-medium">
                复制分享链接
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-40">
        <div className="max-w-lg mx-auto px-3 py-2.5 flex items-center gap-2">
          <button
            onClick={handleAddCart}
            className="flex-1 py-2.5 rounded-full border border-[#2196C8] text-[#2196C8] text-sm font-medium active:bg-[#EAF6FC]"
          >
            加入购物车
          </button>
          <button
            onClick={handleBuyNow}
            className="flex-1 py-2.5 rounded-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white text-sm font-medium active:opacity-90"
          >
            立即购买
          </button>
        </div>
      </div>
    </div>
  );
}
