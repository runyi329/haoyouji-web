/**
 * 奢贝美容院 - 购物车
 * 路径: /beauty/cart
 */
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link, useLocation } from "wouter";
import { ChevronLeft, ShoppingCart, Plus, Minus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function BeautyCart() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const cartQuery = trpc.beauty.shop.getCart.useQuery();
  const cartItems = cartQuery.data ?? [];

  const updateCart = trpc.beauty.shop.updateCartItem.useMutation({
    onSuccess: () => utils.beauty.shop.getCart.invalidate(),
    onError: (err) => toast.error("操作失败", { description: err.message }),
  });

  const removeCart = trpc.beauty.shop.removeCartItem.useMutation({
    onSuccess: () => utils.beauty.shop.getCart.invalidate(),
    onError: (err) => toast.error("删除失败", { description: err.message }),
  });

  const createOrder = trpc.beauty.shop.checkout.useMutation({
    onSuccess: () => {
      toast.success("订单已提交！");
      utils.beauty.shop.getCart.invalidate();
      navigate("/beauty/appointments");
    },
    onError: (err) => toast.error("下单失败", { description: err.message }),
  });

  const total = cartItems.reduce((sum, i) => sum + parseFloat(i.productPrice ?? "0") * i.quantity, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/beauty/shop">
            <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
          </Link>
          <h1 className="font-semibold text-gray-800">购物车</h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3 max-w-lg mx-auto">
        {cartQuery.isLoading ? (
          <div className="text-center py-12 text-gray-400 text-sm">加载中...</div>
        ) : cartItems.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingCart className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">购物车是空的</p>
            <Link href="/beauty/shop">
              <Button className="mt-4 bg-rose-500 hover:bg-rose-600 text-white text-sm">去逛逛</Button>
            </Link>
          </div>
        ) : (
          <>
            {cartItems.map((item) => (
              <Card key={item.id} className="border-0 shadow-sm">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-16 h-16 bg-rose-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    {item.productImageUrl ? (
                      <img src={item.productImageUrl} alt={item.productName ?? ""} className="w-full h-full object-cover rounded-lg" />
                    ) : (
                      <ShoppingCart className="w-6 h-6 text-rose-200" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 line-clamp-1">{item.productName}</p>
                    <p className="text-rose-500 font-bold text-sm mt-0.5">¥{item.productPrice}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => item.quantity > 1
                        ? updateCart.mutate({ id: item.id, quantity: item.quantity - 1 })
                        : removeCart.mutate({ id: item.id })
                      }
                      className="w-6 h-6 rounded-full border border-gray-200 flex items-center justify-center"
                    >
                      <Minus className="w-3 h-3 text-gray-500" />
                    </button>
                    <span className="text-sm font-medium w-5 text-center">{item.quantity}</span>
                    <button
                      onClick={() => updateCart.mutate({ id: item.id, quantity: item.quantity + 1 })}
                      className="w-6 h-6 rounded-full bg-rose-500 flex items-center justify-center"
                    >
                      <Plus className="w-3 h-3 text-white" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>

      {cartItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500">合计：</span>
            <span className="text-rose-500 font-bold text-lg">¥{total.toFixed(2)}</span>
          </div>
          <Button
            className="bg-rose-500 hover:bg-rose-600 text-white px-8"
            onClick={() => createOrder.mutate({})}
            disabled={createOrder.isPending}
          >
            {createOrder.isPending ? "提交中..." : "提交订单"}
          </Button>
        </div>
      )}
    </div>
  );
}
