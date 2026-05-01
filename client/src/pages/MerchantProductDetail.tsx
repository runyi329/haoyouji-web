import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, ShoppingBag, Gift } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

export default function MerchantProductDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const productId = Number(params.id);

  const { data: product, isLoading, isError } = trpc.merchant.getProductDetail.useQuery(
    { id: productId },
    { enabled: !!productId && !isNaN(productId) }
  );

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate("/");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#A80000] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 px-6">
        <ShoppingBag className="w-16 h-16 text-gray-200" />
        <p className="text-gray-400 text-sm">商品不存在或已下架</p>
        <button
          onClick={handleBack}
          className="text-[#A80000] text-sm underline"
        >返回</button>
      </div>
    );
  }

  // 解析多图
  let extraImages: string[] = [];
  try {
    if (product.imageUrls) {
      const imgs = JSON.parse(product.imageUrls as string);
      if (Array.isArray(imgs) && imgs.length > 1) {
        extraImages = imgs.slice(1);
      }
    }
  } catch {}

  const isInPointsShop = product.inPointsShop === 1;
  const pointsCost = (product as any).pointsPrice || 0;

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 flex items-center h-12 px-3">
        <button
          onClick={handleBack}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="flex-1 text-center text-sm font-semibold text-gray-800 pr-9 truncate">商品详情</h1>
      </div>

      {/* 主图 */}
      {product.mainImageUrl ? (
        <img
          src={product.mainImageUrl}
          alt={product.name}
          className="w-full aspect-square object-cover"
        />
      ) : (
        <div className="w-full aspect-square bg-gray-50 flex items-center justify-center">
          <Gift className="w-20 h-20 text-gray-200" />
        </div>
      )}

      {/* 商品信息 */}
      <div className="px-4 pt-4 space-y-4">
        {/* 名称 & 副标题 */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 leading-snug">{product.name}</h2>
          {product.subtitle && (
            <p className="text-sm text-gray-500 mt-1">{product.subtitle}</p>
          )}
        </div>

        {/* 价格区域 */}
        <div className="flex items-center gap-3">
          {isInPointsShop ? (
            <>
              <div className="flex items-center gap-1">
                <span className="text-2xl font-bold text-[#A80000]">{pointsCost.toLocaleString()}</span>
                <span className="text-sm text-gray-500">积分</span>
              </div>
              {product.basePrice && (
                <span className="text-sm text-gray-400 line-through">¥{product.basePrice}</span>
              )}
            </>
          ) : (
            <>
              <span className="text-2xl font-bold text-[#A80000]">¥{product.basePrice}</span>
              {product.originalPrice && (
                <span className="text-sm text-gray-400 line-through">¥{product.originalPrice}</span>
              )}
            </>
          )}
        </div>

        {/* 标签：分类 / 商家 / 库存 / 销量 */}
        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          {product.categoryName && (
            <span className="bg-gray-100 px-2 py-0.5 rounded-full">{product.categoryName}</span>
          )}
          {product.ownerShopName && (
            <span className="bg-gray-100 px-2 py-0.5 rounded-full">来自：{product.ownerShopName}</span>
          )}
          {isInPointsShop && (
            <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">积分商城</span>
          )}
          {product.stock !== undefined && product.stock !== null && (
            <span className="bg-gray-100 px-2 py-0.5 rounded-full">库存 {product.stock}</span>
          )}
          {product.salesCount !== undefined && product.salesCount !== null && (
            <span className="bg-gray-100 px-2 py-0.5 rounded-full">销量 {product.salesCount}</span>
          )}
        </div>

        {/* 分割线 */}
        <div className="border-t border-gray-100" />

        {/* 描述 */}
        {product.description && (
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">商品描述</p>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{product.description}</p>
          </div>
        )}

        {/* 规格 */}
        {product.specs && product.specs.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">商品规格</p>
            <div className="space-y-2">
              {product.specs.map((spec: any) => (
                <div
                  key={spec.id}
                  className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5"
                >
                  <span className="text-sm text-gray-700">{spec.name}</span>
                  <span className="text-sm font-semibold text-[#A80000]">¥{spec.price}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 更多图片 */}
        {extraImages.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">更多图片</p>
            <div className="grid grid-cols-3 gap-2">
              {extraImages.map((url: string, i: number) => (
                <img
                  key={i}
                  src={url}
                  alt=""
                  className="w-full aspect-square object-cover rounded-xl"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 safe-area-bottom">
        <button
          onClick={() => {
            if (!user) {
              toast("请先登录后使用此功能");
              return;
            }
            if (isInPointsShop) {
              toast("兑换功能即将开放，敬请期待");
            } else {
              toast("请联系客服购买");
            }
          }}
          className="w-full py-3 bg-[#A80000] text-white rounded-xl font-medium text-sm active:opacity-90 transition-opacity"
        >
          {isInPointsShop ? "立即兑换" : "联系购买"}
        </button>
      </div>
    </div>
  );
}
