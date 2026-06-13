/**
 * 牙伴齿科商城 - 购物车页
 * 路由：/yaban/shop/cart
 */
import { useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Minus, Plus, Trash2 } from "lucide-react";
import { PageTag } from "@/components/PageTag";
import { getProductById } from "./shopData";
import { useCart } from "./useCart";

export default function YabanShopCart() {
  const [, navigate] = useLocation();
  const { items, setQty, remove } = useCart();

  const rows = useMemo(
    () =>
      items
        .map((it) => ({ item: it, product: getProductById(it.id) }))
        .filter((r) => r.product),
    [items]
  );

  const total = rows.reduce((s, r) => s + (r.product!.price * r.item.qty), 0);

  return (
    <div className="min-h-screen bg-[#F5F7FA] pb-24">
      <PageTag code="P304" />

      {/* 顶部返回栏 */}
      <div className="bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-3 py-3 flex items-center justify-between">
          <button onClick={() => navigate("/yaban/shop")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">购物车</span>
          <span className="w-6" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-3 pt-3">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-28">
            <p className="text-sm text-gray-400 mb-4">购物车还是空的</p>
            <button
              onClick={() => navigate("/yaban/shop")}
              className="px-5 py-2 rounded-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white text-sm"
            >
              去逛逛
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map(({ item, product }) => (
              <div key={item.id} className="bg-white rounded-xl p-3 flex gap-3">
                <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-[#EAF6FC] to-[#D6EEFB] shrink-0 overflow-hidden flex items-center justify-center">
                  {product!.image ? (
                    <img src={product!.image} alt={product!.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[#9DCCE6] text-[10px]">配图</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  <p className="text-[13px] font-medium text-gray-800 line-clamp-1">{product!.name}</p>
                  <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">{product!.subtitle}</p>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-[#FF5A5A] text-base font-bold">¥{product!.price}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setQty(item.id, item.qty - 1)}
                        className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center text-gray-500"
                        aria-label="减少"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-sm text-gray-800 w-5 text-center">{item.qty}</span>
                      <button
                        onClick={() => setQty(item.id, item.qty + 1)}
                        className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center text-gray-500"
                        aria-label="增加"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => remove(item.id)}
                        className="ml-1 text-gray-300"
                        aria-label="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部结算栏 */}
      {rows.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-40">
          <div className="max-w-lg mx-auto px-4 py-2.5 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              合计 <span className="text-[#FF5A5A] text-lg font-bold">¥{total}</span>
            </div>
            <button
              onClick={() => navigate("/yaban/shop/checkout")}
              className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white text-sm font-medium"
            >
              去结算
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
