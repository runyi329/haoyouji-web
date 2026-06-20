import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, ShoppingBag, Gift, MapPin, Phone, User, MessageSquare, Minus, Plus, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function MerchantProductDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const productId = Number(params.id);

  // 兑换弹窗状态
  const [showRedeemSheet, setShowRedeemSheet] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successOrderNo, setSuccessOrderNo] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [form, setForm] = useState({
    recipientName: "",
    recipientPhone: "",
    province: "",
    city: "",
    district: "",
    detailedAddress: "",
    remark: "",
  });

  const { data: product, isLoading, isError } = trpc.merchant.getProductDetail.useQuery(
    { id: productId },
    { enabled: !!productId && !isNaN(productId) }
  );

  // 查询用户积分
  const { data: pointsData } = trpc.rewards.getPointStats.useQuery(undefined, {
    enabled: !!user,
  });

  // 兑换下单 mutation
  const redeemMutation = trpc.merchant.createPointsRedeemOrder.useMutation({
    onSuccess: (data) => {
      setShowRedeemSheet(false);
      setSuccessOrderNo(data.orderNo);
      setShowSuccess(true);
    },
    onError: (err) => {
      toast.error(err.message || "兑换失败，请稍后重试");
    },
  });

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate("/");
    }
  };

  const handleRedeemClick = () => {
    if (!user) {
      toast("请先登录后使用此功能");
      return;
    }
    setShowRedeemSheet(true);
  };

  const handleSubmitRedeem = () => {
    if (!form.recipientName.trim()) { toast.error("请填写收货人姓名"); return; }
    if (!form.recipientPhone.trim() || form.recipientPhone.length < 11) { toast.error("请填写正确的手机号"); return; }
    if (!form.detailedAddress.trim()) { toast.error("请填写详细地址"); return; }
    redeemMutation.mutate({
      productId,
      quantity,
      recipientName: form.recipientName.trim(),
      recipientPhone: form.recipientPhone.trim(),
      province: form.province.trim() || undefined,
      city: form.city.trim() || undefined,
      district: form.district.trim() || undefined,
      detailedAddress: form.detailedAddress.trim(),
      remark: form.remark.trim() || undefined,
    });
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
        <button onClick={handleBack} className="text-[#A80000] text-sm underline">返回</button>
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
  const currentPoints = pointsData?.currentPoints ?? 0;
  const totalCost = pointsCost * quantity;
  const canAfford = currentPoints >= totalCost;

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
        <img src={product.mainImageUrl} alt={product.name} className="w-full aspect-square object-cover" />
      ) : (
        <div className="w-full aspect-square bg-gray-50 flex items-center justify-center">
          <Gift className="w-20 h-20 text-gray-200" />
        </div>
      )}

      {/* 商品信息 */}
      <div className="px-4 pt-4 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 leading-snug">{product.name}</h2>
          {product.subtitle && <p className="text-sm text-gray-500 mt-1">{product.subtitle}</p>}
        </div>

        {/* 价格区域 */}
        <div className="flex items-center gap-3">
          {isInPointsShop ? (
            <>
              <div className="flex items-center gap-1">
                <span className="text-2xl font-bold text-[#A80000]">{pointsCost.toLocaleString()}</span>
                <span className="text-sm text-gray-500">积分</span>
              </div>
              {product.basePrice && <span className="text-sm text-gray-400 line-through">¥{product.basePrice}</span>}
            </>
          ) : (
            <>
              <span className="text-2xl font-bold text-[#A80000]">¥{product.basePrice}</span>
              {product.originalPrice && <span className="text-sm text-gray-400 line-through">¥{product.originalPrice}</span>}
            </>
          )}
        </div>

        {/* 标签 */}
        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          {product.categoryName && <span className="bg-gray-100 px-2 py-0.5 rounded-full">{product.categoryName}</span>}
          {product.ownerShopName && <span className="bg-gray-100 px-2 py-0.5 rounded-full">来自：{product.ownerShopName}</span>}
          {isInPointsShop && <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">积分商城</span>}
          {product.stock !== undefined && product.stock !== null && <span className="bg-gray-100 px-2 py-0.5 rounded-full">库存 {product.stock}</span>}
          {product.salesCount !== undefined && product.salesCount !== null && <span className="bg-gray-100 px-2 py-0.5 rounded-full">销量 {product.salesCount}</span>}
        </div>

        <div className="border-t border-gray-100" />

        {product.description && (
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">商品描述</p>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{product.description}</p>
          </div>
        )}

        {product.specs && product.specs.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">商品规格</p>
            <div className="space-y-2">
              {product.specs.map((spec: any) => (
                <div key={spec.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5">
                  <span className="text-sm text-gray-700">{spec.name}</span>
                  <span className="text-sm font-semibold text-[#A80000]">¥{spec.price}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {extraImages.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1">图文详情</p>
          </div>
        )}
      </div>

      {/* 详情长图区域（无缝拼接，全宽展示） */}
      {extraImages.length > 0 && (
        <div className="w-full">
          {extraImages.map((url: string, i: number) => (
            <img
              key={i}
              src={url}
              alt={`详情图${i + 1}`}
              className="w-full block"
              loading="lazy"
            />
          ))}
        </div>
      )}

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3">
        {isInPointsShop ? (
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-400 flex-1">
              {user ? (
                <span>我的积分：<span className="text-[#A80000] font-bold">{currentPoints.toLocaleString()}</span></span>
              ) : (
                <span>登录后可兑换</span>
              )}
            </div>
            <button
              onClick={handleRedeemClick}
              className="px-8 py-3 bg-[#A80000] text-white rounded-xl font-medium text-sm active:opacity-90 transition-opacity"
            >
              立即兑换
            </button>
          </div>
        ) : (
          <button
            onClick={() => toast("请联系客服购买")}
            className="w-full py-3 bg-[#A80000] text-white rounded-xl font-medium text-sm active:opacity-90 transition-opacity"
          >
            联系购买
          </button>
        )}
      </div>

      {/* 兑换弹窗 */}
      {showRedeemSheet && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowRedeemSheet(false)} />
          <div className="relative bg-white rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-4 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-semibold">填写收货信息</h3>
              <button onClick={() => setShowRedeemSheet(false)} className="text-gray-400 text-xl leading-none">×</button>
            </div>

            <div className="px-4 py-4 space-y-4">
              {/* 商品摘要 */}
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                {product.mainImageUrl ? (
                  <img src={product.mainImageUrl} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-gray-200 flex-shrink-0 flex items-center justify-center">
                    <Gift className="w-6 h-6 text-gray-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{product.name}</p>
                  <p className="text-xs text-[#A80000] mt-0.5">{pointsCost.toLocaleString()} 积分/件</p>
                </div>
              </div>

              {/* 数量选择 */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700 font-medium">兑换数量</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                    className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center active:bg-gray-100"
                  >
                    <Minus className="w-3.5 h-3.5 text-gray-600" />
                  </button>
                  <span className="text-base font-bold w-6 text-center">{quantity}</span>
                  <button
                    onClick={() => setQuantity(q => Math.min(product.stock || 10, q + 1))}
                    className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center active:bg-gray-100"
                  >
                    <Plus className="w-3.5 h-3.5 text-gray-600" />
                  </button>
                </div>
              </div>

              {/* 积分消耗提示 */}
              <div className={`rounded-xl p-3 text-sm ${canAfford ? "bg-green-50" : "bg-red-50"}`}>
                <div className="flex justify-between">
                  <span className="text-gray-600">需消耗积分</span>
                  <span className={`font-bold ${canAfford ? "text-green-700" : "text-red-600"}`}>
                    {totalCost.toLocaleString()} 分
                  </span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-gray-600">当前积分</span>
                  <span className={`font-bold ${canAfford ? "text-green-700" : "text-red-600"}`}>
                    {currentPoints.toLocaleString()} 分
                  </span>
                </div>
                {!canAfford && (
                  <p className="text-red-600 text-xs mt-1">积分不足，差 {(totalCost - currentPoints).toLocaleString()} 分</p>
                )}
              </div>

              {/* 收货信息表单 */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-gray-700">收货信息</p>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="收货人姓名 *"
                    value={form.recipientName}
                    onChange={e => setForm(f => ({ ...f, recipientName: e.target.value }))}
                    className="pl-9"
                  />
                </div>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="手机号 *"
                    type="tel"
                    value={form.recipientPhone}
                    onChange={e => setForm(f => ({ ...f, recipientPhone: e.target.value }))}
                    className="pl-9"
                    maxLength={11}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="省份"
                    value={form.province}
                    onChange={e => setForm(f => ({ ...f, province: e.target.value }))}
                  />
                  <Input
                    placeholder="城市"
                    value={form.city}
                    onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  />
                  <Input
                    placeholder="区/县"
                    value={form.district}
                    onChange={e => setForm(f => ({ ...f, district: e.target.value }))}
                  />
                </div>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <Textarea
                    placeholder="详细地址（街道、门牌号等）*"
                    value={form.detailedAddress}
                    onChange={e => setForm(f => ({ ...f, detailedAddress: e.target.value }))}
                    className="pl-9 resize-none"
                    rows={2}
                  />
                </div>
                <div className="relative">
                  <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <Textarea
                    placeholder="备注（选填）"
                    value={form.remark}
                    onChange={e => setForm(f => ({ ...f, remark: e.target.value }))}
                    className="pl-9 resize-none"
                    rows={2}
                  />
                </div>
              </div>
            </div>

            {/* 底部提交按钮 */}
            <div className="sticky bottom-0 bg-white px-4 py-3 border-t border-gray-100">
              <Button
                className="w-full bg-[#A80000] hover:bg-[#8a0000] text-white rounded-xl h-12 text-base font-medium"
                onClick={handleSubmitRedeem}
                disabled={redeemMutation.isPending || !canAfford}
              >
                {redeemMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    提交中...
                  </span>
                ) : (
                  `确认兑换 ${totalCost.toLocaleString()} 积分`
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 兑换成功弹窗 */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-gray-900 mb-1">兑换成功！</h3>
            <p className="text-sm text-gray-500 mb-1">订单号：{successOrderNo}</p>
            <p className="text-xs text-gray-400 mb-5">商家将尽快为您发货，请耐心等待</p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setShowSuccess(false); handleBack(); }}
              >
                继续浏览
              </Button>
              <Button
                className="flex-1 bg-[#A80000] hover:bg-[#8a0000] text-white"
                onClick={() => { setShowSuccess(false); navigate("/my-redeem-orders"); }}
              >
                查看订单
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
