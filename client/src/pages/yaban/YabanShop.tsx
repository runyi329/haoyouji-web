/**
 * 牙伴齿科管理 - 商城 Tab（齿科商城首页）
 * 路由：/yaban/shop
 * 风格：蓝色系，沿用牙办整体清爽蓝白风
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Search, ShoppingCart } from "lucide-react";
import YabanTabBar from "./YabanTabBar";
import { PageTag } from "@/components/PageTag";
import { SHOP_CATEGORIES, SHOP_PRODUCTS, type ShopProduct } from "./shopData";
import { useCart } from "./useCart";

export default function YabanShop() {
  const [, navigate] = useLocation();
  const [activeCat, setActiveCat] = useState("all");
  const [keyword, setKeyword] = useState("");
  const { count } = useCart();

  const list = useMemo(() => {
    let arr = SHOP_PRODUCTS;
    if (activeCat !== "all") arr = arr.filter((p) => p.categoryId === activeCat);
    if (keyword.trim()) {
      const k = keyword.trim();
      arr = arr.filter((p) => p.name.includes(k) || p.subtitle.includes(k));
    }
    return arr;
  }, [activeCat, keyword]);

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <PageTag code="P302" />

      {/* 顶部蓝色头部 */}
      <div className="bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-base font-bold">齿科商城</span>
            <button
              onClick={() => navigate("/yaban/shop/cart")}
              className="relative p-1"
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
          {/* 搜索框 */}
          <div className="flex items-center bg-white/95 rounded-full px-3 py-1.5">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索牙刷、种植牙、洁牙等"
              className="flex-1 bg-transparent outline-none text-sm text-gray-700 px-2 placeholder:text-gray-400"
            />
          </div>
        </div>
      </div>

      {/* 分类横向导航 */}
      <div className="bg-white sticky top-[104px] z-30 border-b border-gray-100">
        <div className="max-w-lg mx-auto px-2 overflow-x-auto no-scrollbar">
          <div className="flex gap-1 py-2">
            {SHOP_CATEGORIES.map((c) => {
              const active = activeCat === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveCat(c.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 商品双列列表 */}
      <div className="max-w-lg mx-auto px-2 pt-2 pb-24">
        {list.length === 0 ? (
          <div className="text-center text-sm text-gray-400 pt-20">未找到相关商品</div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {list.map((p) => (
              <ProductCard key={p.id} product={p} onClick={() => navigate(`/yaban/shop/product/${p.id}`)} />
            ))}
          </div>
        )}
      </div>

      <YabanTabBar />
    </div>
  );
}

function ProductCard({ product, onClick }: { product: ShopProduct; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl overflow-hidden shadow-sm active:scale-[0.98] transition-transform"
    >
      {/* 图片区 */}
      <div className="relative w-full aspect-square bg-gradient-to-br from-[#EAF6FC] to-[#D6EEFB] flex items-center justify-center">
        {product.image ? (
          <img src={product.image} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="text-[#9DCCE6] text-xs">配图准备中</span>
        )}
        {product.kind === "service" && (
          <span className="absolute top-1.5 left-1.5 bg-[#2196C8] text-white text-[10px] px-1.5 py-0.5 rounded">
            诊疗项目
          </span>
        )}
      </div>
      {/* 文字区 */}
      <div className="p-2">
        <p className="text-[13px] font-medium text-gray-800 line-clamp-1">{product.name}</p>
        <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">{product.subtitle}</p>
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          {product.tags.map((t) => (
            <span
              key={t}
              className="text-[10px] text-[#2196C8] bg-[#EAF6FC] px-1 py-0.5 rounded"
            >
              {t}
            </span>
          ))}
        </div>
        <div className="flex items-baseline justify-between mt-1.5">
          <div className="flex items-baseline gap-1">
            <span className="text-[#FF5A5A] text-base font-bold">¥{product.price}</span>
            {product.originalPrice && (
              <span className="text-[10px] text-gray-300 line-through">¥{product.originalPrice}</span>
            )}
          </div>
          <span className="text-[10px] text-gray-400">已售{product.sales}</span>
        </div>
      </div>
    </div>
  );
}
