/**
 * 奢贝美容院 - 商品详情
 * 路径: /beauty/product/:id
 */
import { trpc } from "@/lib/trpc";
import { Link, useParams, useLocation } from "wouter";
import { ChevronLeft, ShoppingCart, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function BeautyProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: currentUser } = trpc.auth.me.useQuery();

  const { data: product, isLoading } = trpc.beauty.shop.getProduct.useQuery({ id: parseInt(id) });

  const addToCart = trpc.beauty.shop.addToCart.useMutation({
    onSuccess: () => {
      utils.beauty.shop.getCart.invalidate();
      toast.success("已加入购物车");
    },
    onError: (err) => toast.error("操作失败", { description: err.message }),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">加载中...</p>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex justify-end px-4 pt-1.5">
          <span className="text-[10px] text-gray-300 tracking-wide select-none">{currentUser?.username}</span>
        </div>
        <div className="flex items-center gap-3 px-4 pb-3">
          <button onClick={() => navigate("/beauty/shop")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="font-semibold text-gray-800">商品详情</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto">
        {/* 商品图片 */}
        <div className="h-64 bg-gradient-to-br from-rose-50 to-pink-50 flex items-center justify-center">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <Gift className="w-16 h-16 text-rose-200" />
          )}
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* 基本信息 */}
          <div>
            <h1 className="text-lg font-bold text-gray-800">{product.name}</h1>

            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-rose-500 font-bold text-xl">¥{product.price}</span>

            </div>
          </div>

          {/* 商品描述 */}
          {product.description && (
            <div className="bg-white rounded-xl p-4">
              <h3 className="font-semibold text-gray-700 text-sm mb-2">商品介绍</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{product.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 flex gap-3">
        <Link href="/beauty/cart" className="flex-1">
          <Button variant="outline" className="w-full border-rose-300 text-rose-500">
            <ShoppingCart className="w-4 h-4 mr-1" />
            查看购物车
          </Button>
        </Link>
        <Button
          className="flex-1 bg-rose-500 hover:bg-rose-600 text-white"
          onClick={() => addToCart.mutate({ productId: product.id, quantity: 1 })}
          disabled={addToCart.isPending}
        >
          加入购物车
        </Button>
      </div>
    </div>
  );
}
