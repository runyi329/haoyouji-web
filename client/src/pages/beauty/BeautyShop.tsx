/**
 * 奢贝美容院 - 品牌商城
 * 路径: /beauty/shop
 */
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link, useLocation } from "wouter";
import { ChevronLeft, ChevronRight, ShoppingCart, Star, Home as HomeIcon, Gift, Calendar, User, Plus, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

export default function BeautyShop() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const brandsQuery = trpc.beauty.shop.brands.useQuery();
  const productsQuery = trpc.beauty.shop.products.useQuery({});
  const cartQuery = trpc.beauty.shop.getCart.useQuery();

  const brands = brandsQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const cartItems = cartQuery.data ?? [];
  const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);

  const [selectedBrand, setSelectedBrand] = useState<number | null>(null);
  const filteredProducts = selectedBrand
    ? products.filter((p) => p.brandId === selectedBrand)
    : products;

  const addToCart = trpc.beauty.shop.addToCart.useMutation({
    onSuccess: () => {
      utils.beauty.shop.getCart.invalidate();
      toast.success("已加入购物车");
    },
    onError: (err) => toast.error("操作失败", { description: err.message }),
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/beauty">
              <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
            </Link>
            <h1 className="font-semibold text-gray-800">品牌商城</h1>
          </div>
          <Link href="/beauty/cart">
            <button className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
              <ShoppingCart className="w-5 h-5 text-gray-600" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-xs rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </Link>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* 品牌筛选 */}
        {brands.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setSelectedBrand(null)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-medium border transition-all ${
                !selectedBrand ? "bg-rose-500 text-white border-rose-500" : "bg-white text-gray-600 border-gray-200"
              }`}
            >
              全部
            </button>
            {brands.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBrand(b.id)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-medium border transition-all ${
                  selectedBrand === b.id ? "bg-rose-500 text-white border-rose-500" : "bg-white text-gray-600 border-gray-200"
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        )}

        {/* 商品列表 */}
        {productsQuery.isLoading ? (
          <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">暂无商品</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts.map((p) => (
              <Card key={p.id} className="border-0 shadow-sm overflow-hidden">
                <Link href={`/beauty/product/${p.id}`}>
                  <div className="h-36 bg-gradient-to-br from-rose-50 to-pink-50 flex items-center justify-center cursor-pointer">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <Gift className="w-10 h-10 text-rose-200" />
                    )}
                  </div>
                </Link>
                <CardContent className="p-3">
                  <p className="text-sm font-medium text-gray-800 line-clamp-2">{p.name}</p>

                  <div className="flex items-center justify-between mt-2">
                    <div>
                      <span className="text-rose-500 font-bold text-sm">¥{p.price}</span>

                    </div>
                    <button
                      onClick={() => addToCart.mutate({ productId: p.id, quantity: 1 })}
                      className="w-7 h-7 bg-rose-500 rounded-full flex items-center justify-center"
                    >
                      <Plus className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 底部导航 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50">
        <div className="grid grid-cols-4 h-14">
          {[
            { icon: <HomeIcon className="w-5 h-5" />, label: "首页", href: "/beauty" },
            { icon: <Gift className="w-5 h-5" />, label: "品牌", href: "/beauty/shop" },
            { icon: <Calendar className="w-5 h-5" />, label: "预约", href: "/beauty/booking" },
            { icon: <User className="w-5 h-5" />, label: "我的", href: "/beauty/appointments" },
          ].map((item) => (
            <Link key={item.label} href={item.href}>
              <button className="flex flex-col items-center justify-center h-full w-full text-gray-400 hover:text-rose-500 transition-colors">
                {item.icon}
                <span className="text-xs mt-0.5">{item.label}</span>
              </button>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
