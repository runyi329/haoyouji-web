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
    if (activeCountry !== "全部") {
      const ext = p.extendedFields ? (() => {
        try { return JSON.parse(p.extendedFields); } catch { return {}; }
      })() : {};
      const region = ext.region || p.subtitle || "";
      const matchedRegion = regions.find((r: any) => r.name === region || r.country === activeCountry);
      if (!matchedRegion || matchedRegion.country !== activeCountry) {
        if (!region.includes(activeCountry)) return false;
      }
    }
    return true;
  });

  // 静态产品路由映射
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
  };

  return (
    <div className="min-h-screen text-white pb-24" style={{ backgroundColor: '#000' }}>
      {/* 顶部标题栏 */}
      <div className="px-4 py-4 flex items-center justify-between" style={{ backgroundColor: '#000', borderBottom: '1px solid #333' }}>
        <div>
          <h1 className="text-white font-bold text-lg">品牌中心</h1>
          <p className="text-xs" style={{ color: '#8a7a6a' }}>商会认可 · 品质保证</p>
        </div>
        <button className="relative w-9 h-9 flex items-center justify-center">
          <ShoppingCart className="w-5 h-5" style={{ color: '#C9A84C' }} />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 text-white text-xs rounded-full flex items-center justify-center" style={{ backgroundColor: '#8B1A1A' }}>
              {cartCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab 导航 */}
      <WineTabBar />

      {/* 搜索栏 */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-2 px-3 py-2.5" style={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '12px' }}>
          <Search className="w-4 h-4 flex-shrink-0" style={{ color: '#8a7a6a' }} />
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="搜索酒名、酒庄、产区..."
            className="flex-1 bg-transparent text-sm text-white outline-none"
            style={{ color: '#fff' }}
          />
          {searchText && (
            <button onClick={() => setSearchText("")} style={{ color: '#8a7a6a', fontSize: '12px' }}>清除</button>
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
              className="flex-shrink-0 px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                borderRadius: '9999px',
                backgroundColor: activeCountry === country ? '#8B1A1A' : '#111',
                color: activeCountry === country ? '#fff' : '#8a7a6a',
                border: activeCountry === country ? 'none' : '1px solid #333',
              }}
            >
              {country}
            </button>
          ))}
        </div>
      )}

      {/* 商品列表 */}
      <div className="px-4 pt-2">
        {isLoading ? (
          <div className="py-16 text-center" style={{ color: '#8a7a6a' }}>
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: '#8B1A1A', borderTopColor: 'transparent' }} />
            <p className="text-sm">加载中...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center" style={{ color: '#8a7a6a' }}>
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            {products.length === 0 ? (
              <>
                <p className="text-sm font-medium" style={{ color: '#e8d5b7' }}>商品库暂未上架</p>
                <p className="text-xs mt-1">商家正在精心筛选优质红酒，敬请期待</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium" style={{ color: '#e8d5b7' }}>暂无匹配商品</p>
                <p className="text-xs mt-1">试试其他筛选条件</p>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs mb-3" style={{ color: '#8a7a6a' }}>共 {filtered.length} 款精选红酒</p>
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
                    onClick={() => setLocation(getProductRoute(product))}
                    className="cursor-pointer"
                    style={{
                      backgroundColor: '#000',
                      border: '1px solid #222',
                      borderRadius: '8px',
                      overflow: 'hidden',
                    }}
                  >
                    {/* ① 商品主图 - 纯黑背景，无圆角 */}
                    <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1', backgroundColor: '#000' }}>
                      {product.mainImageUrl ? (
                        <img
                          src={product.mainImageUrl}
                          alt={product.name}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            objectPosition: 'center',
                            display: 'block',
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Wine className="w-12 h-12" style={{ color: '#5a1e1e' }} />
                        </div>
                      )}
                      {/* 来源标签 */}
                      <span
                        className={`absolute top-2 left-2 text-xs px-1.5 py-0.5 rounded-full ${sourceLabel.color}`}
                      >
                        {sourceLabel.label}
                      </span>
                      {/* 库存紧张 */}
                      {product.stock > 0 && product.stock < 15 && (
                        <span className="absolute top-2 right-2 text-xs text-white px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(139,26,26,0.8)' }}>
                          仅剩{product.stock}件
                        </span>
                      )}
                    </div>

                    {/* ② 商品信息 */}
                    <div className="p-3">
                      <h3 className="text-white font-medium text-sm leading-snug line-clamp-2">{product.name}</h3>
                      <p className="text-xs mt-0.5 truncate" style={{ color: '#8a7a6a' }}>
                        {product.subtitle || (ext.region ? `${ext.region}` : "—")}
                      </p>

                      {/* 红酒专属标签（年份） */}
                      {ext.vintage && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ color: 'rgba(201,168,76,0.7)', backgroundColor: 'rgba(201,168,76,0.1)' }}>
                            {ext.vintage}年
                          </span>
                        </div>
                      )}

                      {/* ③ 价格 */}
                      <div className="flex items-baseline gap-1.5 mt-2">
                        <span className="font-bold text-base" style={{ color: '#C9A84C' }}>¥{product.basePrice}</span>
                        {product.originalPrice && (
                          <span className="text-xs line-through" style={{ color: '#8a7a6a' }}>¥{product.originalPrice}</span>
                        )}
                      </div>

                      <p className="text-xs mt-0.5" style={{ color: '#8a7a6a' }}>已售 {product.salesCount || 0}</p>

                      {/* ④ 购买按钮 */}
                      <button
                        onClick={(e) => handleAddToCart(e, product.id)}
                        className="w-full mt-2.5 text-white text-xs py-2 font-medium transition-colors"
                        style={{ backgroundColor: '#8B1A1A', borderRadius: '8px' }}
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
