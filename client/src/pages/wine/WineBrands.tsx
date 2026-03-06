/**
 * 红酒文化商会 - 品牌中心（前台商城）
 * 路径: /wine/brands
 * 
 * 架构规则：商品展示使用统一模板（固定结构：图片→名称→价格→购买按钮）
 * 数据来源：从数据库读取已上架商品（status = 'active'）
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { ShoppingCart, Wine, Search, Package } from "lucide-react";
import { trpc } from "@/lib/trpc";
import WineTabBar from "./WineTabBar";
import BottomNav from "@/components/BottomNav";

const MERCHANT_CODE = "cx8618";

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  platform: { label: "平台精选", color: "bg-blue-500/20 text-blue-300 border border-blue-500/30" },
  merchant: { label: "自营", color: "bg-[#8B1A1A]/30 text-[#C9A84C] border border-[#C9A84C]/30" },
  shared: { label: "商会认证", color: "bg-[#C9A84C]/20 text-[#C9A84C] border border-[#C9A84C]/30" },
};

export default function WineBrands() {
  const [, setLocation] = useLocation();
  const [activeCountry, setActiveCountry] = useState("全部");
  const [cartCount, setCartCount] = useState(0);
  const [searchText, setSearchText] = useState("");

  // 从数据库获取已上架商品（走 merchantShopProducts 店铺陈列层）
  const { data: products = [], isLoading } = trpc.merchant.getShopProducts.useQuery({
    merchantCode: MERCHANT_CODE,
  });

  // 从数据库获取产区列表（用于筛选）
  const { data: regions = [] } = trpc.merchant.getWineRegions.useQuery({
    merchantCode: MERCHANT_CODE,
  });

  // 提取国家列表（去重）
  const countries = ["全部", ...Array.from(new Set(regions.map((r: any) => r.country)))];

  // 筛选逻辑
  const filtered = products.filter((p: any) => {
    // 搜索过滤
    if (searchText) {
      const q = searchText.toLowerCase();
      const name = (p.name || "").toLowerCase();
      const subtitle = (p.subtitle || "").toLowerCase();
      const ext = p.extendedFields ? (() => {
        try { return JSON.parse(p.extendedFields); } catch { return {}; }
      })() : {};
      const region = (ext.region || "").toLowerCase();
      const winery = (ext.winery || "").toLowerCase();
      if (!name.includes(q) && !subtitle.includes(q) && !region.includes(q) && !winery.includes(q)) return false;
    }
    // 国家过滤
    if (activeCountry !== "全部") {
      const ext = p.extendedFields ? (() => {
        try { return JSON.parse(p.extendedFields); } catch { return {}; }
      })() : {};
      const region = ext.region || p.subtitle || "";
      const matchedRegion = regions.find((r: any) => r.name === region || r.country === activeCountry);
      if (!matchedRegion || matchedRegion.country !== activeCountry) {
        // 也尝试直接匹配subtitle
        if (!region.includes(activeCountry)) return false;
      }
    }
    return true;
  });

  // 静态产品路由映射（三款已制作详情页的产品）
  const STATIC_PRODUCT_ROUTES: Record<string, string> = {
    fidencio: "/wine/product/fidencio",
    marthu: "/wine/product/marthu",
    romanico: "/wine/product/romanico",
  };

  const getProductRoute = (product: any): string => {
    const name = (product.name || "").toLowerCase();
    const subtitle = (product.subtitle || "").toLowerCase();
    const combined = name + " " + subtitle;
    for (const [key, route] of Object.entries(STATIC_PRODUCT_ROUTES)) {
      if (combined.includes(key)) return route;
    }
    return `/wine/product/${product.id}`;
  };

  const handleAddToCart = (e: React.MouseEvent, productId: number) => {
    e.stopPropagation();
    setCartCount(c => c + 1);
    // TODO: 接入购物车API
  };

  const getExtField = (p: any, key: string) => {
    if (!p.extendedFields) return "";
    try { return JSON.parse(p.extendedFields)[key] || ""; } catch { return ""; }
  };

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* 顶部标题栏 */}
      <div className="bg-black border-b border-[#333]/30 px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg">品牌中心</h1>
          <p className="text-[#8a7a6a] text-xs">商会认可 · 品质保证</p>
        </div>
        {/* 购物车入口 */}
        <button className="relative w-9 h-9 flex items-center justify-center">
          <ShoppingCart className="w-5 h-5 text-[#C9A84C]" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#8B1A1A] text-white text-xs rounded-full flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab 导航 */}
      <WineTabBar />

      {/* 搜索栏 */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-2 bg-[#111] border border-[#333]/30 rounded-xl px-3 py-2.5">
          <Search className="w-4 h-4 text-[#8a7a6a] flex-shrink-0" />
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="搜索酒名、酒庄、产区..."
            className="flex-1 bg-transparent text-sm text-white placeholder-[#5a3a2a] outline-none"
          />
          {searchText && (
            <button onClick={() => setSearchText("")} className="text-[#8a7a6a] text-xs">清除</button>
          )}
        </div>
      </div>

      {/* 国家/产区筛选 */}
      {countries.length > 1 && (
        <div className="px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide">
          {countries.map(country => (
            <button
              key={country}
              onClick={() => setActiveCountry(country)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeCountry === country
                  ? "bg-[#8B1A1A] text-white"
                  : "bg-[#111] border border-[#333]/30 text-[#8a7a6a]"
              }`}
            >
              {country !== "全部" && regions.find((r: any) => r.country === country)?.flagEmoji
                ? `${regions.find((r: any) => r.country === country)?.flagEmoji} `
                : ""}
              {country}
            </button>
          ))}
        </div>
      )}

      {/* 商品列表 */}
      <div className="px-4 pt-2">
        {isLoading ? (
          <div className="py-16 text-center text-[#8a7a6a]">
            <div className="w-8 h-8 border-2 border-[#8B1A1A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">加载中...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[#8a7a6a]">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            {products.length === 0 ? (
              <>
                <p className="text-sm font-medium text-[#e8d5b7]">商品库暂未上架</p>
                <p className="text-xs mt-1">商家正在精心筛选优质红酒，敬请期待</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-[#e8d5b7]">暂无匹配商品</p>
                <p className="text-xs mt-1">试试其他筛选条件</p>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-[#8a7a6a] mb-3">共 {filtered.length} 款精选红酒</p>
            <div className="grid grid-cols-2 gap-3">
              {filtered.map((product: any) => {
                const sourceType = product.sourceType || "merchant";
                const sourceLabel = SOURCE_LABELS[sourceType] || SOURCE_LABELS.merchant;
                const ext = product.extendedFields ? (() => {
                  try { return JSON.parse(product.extendedFields); } catch { return {}; }
                })() : {};
                return (
                  <div
                    key={product.id}
                    className="bg-black border border-[#222] rounded-lg overflow-hidden hover:border-[#C9A84C]/40 transition-colors cursor-pointer"
                    onClick={() => setLocation(getProductRoute(product))}
                  >
                    {/* ① 商品主图 */}
                    <div className="relative aspect-square bg-black overflow-hidden">
                      {product.mainImageUrl ? (
                        <img
                          src={product.mainImageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover object-center"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Wine className="w-12 h-12 text-[#5a1e1e]" />
                        </div>
                      )}
                      {/* 来源标签 */}
                      <span className={`absolute top-2 left-2 text-xs px-1.5 py-0.5 rounded-full ${sourceLabel.color}`}>
                        {sourceLabel.label}
                      </span>
                      {/* 库存紧张 */}
                      {product.stock > 0 && product.stock < 15 && (
                        <span className="absolute top-2 right-2 text-xs bg-[#8B1A1A]/80 text-white px-1.5 py-0.5 rounded-full">
                          仅剩{product.stock}件
                        </span>
                      )}
                    </div>

                    {/* ② 商品信息 */}
                    <div className="p-3">
                      <h3 className="text-white font-medium text-sm leading-snug line-clamp-2">{product.name}</h3>
                      <p className="text-[#8a7a6a] text-xs mt-0.5 truncate">
                        {product.subtitle || (ext.region ? `${ext.region}` : "—")}
                      </p>

                      {/* 红酒专属标签（年份/酒庄） */}
                      {(ext.vintage || ext.winery) && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {ext.vintage && (
                            <span className="text-xs text-[#C9A84C]/70 bg-[#C9A84C]/10 px-1.5 py-0.5 rounded-full">
                              {ext.vintage}年
                            </span>
                          )}
                          {ext.grapeVariety && (
                            <span className="text-xs text-[#C9A84C]/70 bg-[#C9A84C]/10 px-1.5 py-0.5 rounded-full">
                              {ext.grapeVariety}
                            </span>
                          )}
                        </div>
                      )}

                      {/* ③ 价格 */}
                      <div className="flex items-baseline gap-1.5 mt-2">
                        <span className="text-[#C9A84C] font-bold text-base">¥{product.basePrice}</span>
                        {product.originalPrice && (
                          <span className="text-[#8a7a6a] text-xs line-through">¥{product.originalPrice}</span>
                        )}
                      </div>

                      <p className="text-[#8a7a6a] text-xs mt-0.5">已售 {product.salesCount || 0}</p>

                      {/* ④ 购买按钮 */}
                      <button
                        onClick={(e) => handleAddToCart(e, product.id)}
                        className="w-full mt-2.5 bg-[#8B1A1A] hover:bg-[#A52020] text-white text-xs py-2 rounded-lg transition-colors font-medium"
                      >
                        加入购物车
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
