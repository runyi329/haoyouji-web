import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  BookMarked,
  Check,
  ChevronLeft,
  Heart,
  Loader2,
  MapPin,
  Minus,
  Phone,
  Plus,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  getMibanLimitedProduct,
  getMibanLimitedProductSku,
} from "../../../../shared/miban-limited-products";
import { HERBALIFE_THEME } from "../../../../shared/herbalife-theme";
import { mtrpc } from "./mibanTrpc";
import AddressBook from "./AddressBook";
import { getCities, getDistricts, provinces } from "./regionData";

function Price({
  value,
  large = false,
  color = HERBALIFE_THEME.price,
}: {
  value: number;
  large?: boolean;
  color?: string;
}) {
  return (
    <span
      className={
        large
          ? "text-[30px] font-black tracking-tight"
          : "text-[18px] font-extrabold"
      }
      style={{ color }}
    >
      <span className={large ? "text-[15px] mr-0.5" : "text-[12px] mr-0.5"}>
        ¥
      </span>
      {value.toFixed(2)}
    </span>
  );
}

export default function HerbalifeRedGinsengDetail() {
  const [, navigate] = useLocation();
  const [, routeParams] = useRoute("/p/proj_hzxm2t/limited/:productKey");
  const productKey = routeParams?.productKey ?? "herbalife-red-ginseng";
  const currentProduct = getMibanLimitedProduct(productKey);
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [selectedSkuId, setSelectedSkuId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [saveToBook, setSaveToBook] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{ orderNo: string } | null>(
    null
  );
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [receiverProvince, setReceiverProvince] = useState("");
  const [receiverCity, setReceiverCity] = useState("");
  const [receiverDistrict, setReceiverDistrict] = useState("");
  const [receiverDetail, setReceiverDetail] = useState("");
  const [userNote, setUserNote] = useState("");
  const [favoritePending, setFavoritePending] = useState(false);
  const startXRef = useRef(0);

  const activeSkus = currentProduct?.skus.filter(sku => sku.active) ?? [];
  const activeSkuId = selectedSkuId || activeSkus[0]?.id || "";
  const selectedSku = currentProduct
    ? (getMibanLimitedProductSku(currentProduct, activeSkuId) ?? activeSkus[0])
    : undefined;
  const accent = HERBALIFE_THEME.primary;
  const productHeroImages =
    selectedSku?.heroImages && selectedSku.heroImages.length > 0
      ? selectedSku.heroImages
      : selectedSku?.image
        ? [selectedSku.image]
        : (currentProduct?.detail.heroImages ?? []);
  const hasSkuHeroCarousel = Boolean(
    selectedSku?.heroImages && selectedSku.heroImages.length > 0
  );
  const detailImages =
    selectedSku?.detailImages ??
    currentProduct?.detail.detailImages ??
    (selectedSku?.detailImage
      ? [selectedSku.detailImage]
      : currentProduct?.detail.detailImage
        ? [currentProduct.detail.detailImage]
        : []);
  const checkoutProductImage =
    selectedSku?.image ?? currentProduct?.detail.productImage;
  const isOnSale = currentProduct?.status === "on_sale" && !!selectedSku;
  const totalPrice = selectedSku ? selectedSku.priceCny * quantity : 0;
  const isMunicipality = ["北京市", "天津市", "上海市", "重庆市"].includes(
    receiverProvince
  );
  const effectiveReceiverCity = isMunicipality
    ? receiverProvince
    : receiverCity;
  const receiverAddress = isMunicipality
    ? [receiverProvince, receiverDistrict, receiverDetail]
        .filter(Boolean)
        .join("")
    : [
        receiverProvince,
        effectiveReceiverCity,
        receiverDistrict,
        receiverDetail,
      ]
        .filter(Boolean)
        .join("");

  const { data: savedAddresses } = mtrpc.address.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const addAddressMutation = mtrpc.address.add.useMutation();
  const { data: favoriteData, refetch: refetchFavorite } =
    mtrpc.favorite.isFavorited.useQuery(
      { productKey },
      {
        enabled:
          isAuthenticated && Boolean(currentProduct?.orderPolicy.allowFavorite),
      }
    );
  const favoriteMutation = mtrpc.favorite.toggle.useMutation({
    onSuccess: () => refetchFavorite(),
    onSettled: () => setFavoritePending(false),
  });
  const { data: cnyBalance } = trpc.recharge.getCnyBalance.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const { data: usdtBalance } = trpc.recharge.getBalance.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const { data: cryptoPrices } = trpc.getCryptoPrices.useQuery(undefined, {
    refetchInterval: 5_000,
    staleTime: 3_000,
  });
  const trpcUtils = trpc.useUtils();
  const cnyBalanceNum = Number(cnyBalance ?? 0);
  const usdtBalanceNum = Number(usdtBalance ?? 0);
  const usdtCnyRate = Number(cryptoPrices?.usdtCnyRate ?? 7.3);
  const totalAvailableCny = cnyBalanceNum + usdtBalanceNum * usdtCnyRate;
  const balanceOk = totalAvailableCny >= totalPrice;

  const createOrder = mtrpc.limitedProduct.createOrder.useMutation({
    onSuccess: (data: { orderNo: string }) => {
      setShowCheckout(false);
      setOrderSuccess({ orderNo: data.orderNo });
      trpcUtils.recharge.getBalance.invalidate();
      trpcUtils.recharge.getCnyBalance.invalidate();
    },
    onError: (error: { message?: string }) => {
      window.alert(error.message || "提交订单失败，请稍后再试");
    },
  });

  useEffect(() => {
    if (selectedSku && quantity > selectedSku.maxPurchaseQty) {
      setQuantity(selectedSku.maxPurchaseQty);
    }
  }, [quantity, selectedSku]);

  useEffect(() => {
    setCurrentSlide(0);
  }, [activeSkuId]);

  if (!currentProduct || !selectedSku) {
    return (
      <div className="min-h-screen bg-white px-5 pt-10 text-center text-sm text-gray-400">
        商品暂不可用
      </div>
    );
  }

  const canSubmit = Boolean(
    receiverName.trim() &&
      receiverPhone.trim() &&
      receiverProvince &&
      (isMunicipality || receiverCity) &&
      receiverDetail.trim() &&
      !createOrder.isPending
  );

  const handleTouchStart = (event: React.TouchEvent) => {
    startXRef.current = event.touches[0]?.clientX ?? 0;
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    const dx = (event.changedTouches[0]?.clientX ?? 0) - startXRef.current;
    if (dx < -40 && currentSlide < productHeroImages.length - 1)
      setCurrentSlide(value => value + 1);
    if (dx > 40 && currentSlide > 0) setCurrentSlide(value => value - 1);
  };

  const handleBuy = () => {
    if (!isOnSale || authLoading) return;
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    setShowCheckout(true);
  };

  const handleFavorite = () => {
    if (favoritePending || !currentProduct.orderPolicy.allowFavorite) return;
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    setFavoritePending(true);
    favoriteMutation.mutate({
      productKey: currentProduct.key,
      productName: currentProduct.detail.title,
      productImg: checkoutProductImage,
      productUrl: `/p/proj_hzxm2t/limited/${productKey}`,
    });
  };

  const handleSubmitOrder = () => {
    if (!canSubmit || !balanceOk) return;
    if (saveToBook && currentProduct.orderPolicy.allowAddressBook) {
      addAddressMutation.mutate({
        name: receiverName.trim(),
        phone: receiverPhone.trim(),
        province: receiverProvince,
        city: effectiveReceiverCity,
        district: receiverDistrict,
        detail: receiverDetail.trim(),
        label: "家",
        isDefault: false,
      });
    }
    createOrder.mutate({
      productKey: currentProduct.key,
      skuId: selectedSku.id,
      quantity,
      receiverName: receiverName.trim(),
      receiverPhone: receiverPhone.trim(),
      receiverAddress: receiverAddress.trim(),
      userNote: userNote.trim() || undefined,
    });
  };

  return (
    <div
      className="min-h-screen bg-white pb-24"
      style={{ maxWidth: 480, margin: "0 auto" }}
    >
      <div
        className="sticky top-0 z-30 flex h-12 items-center justify-between px-4"
        style={{
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "blur(10px)",
        }}
      >
        <button
          onClick={() => navigate("/p/proj_hzxm2t/limited/herbalife")}
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-gray-800 active:bg-gray-100"
          aria-label="返回"
        >
          <ChevronLeft size={22} strokeWidth={2.2} />
        </button>
        <div className="text-[14px] font-bold text-gray-900">精选</div>
        <div className="w-9" />
      </div>

      <div
        className="relative overflow-hidden"
        style={{ background: HERBALIFE_THEME.canvas }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex transition-transform duration-300"
          style={{ transform: `translateX(-${currentSlide * 100}%)` }}
        >
          {productHeroImages.map((image, index) => (
            <div
              key={image}
              className="w-full flex-none"
              style={{ aspectRatio: "1 / 1" }}
            >
              <img
                src={image}
                alt={`${currentProduct.detail.title}展示图 ${index + 1}`}
                className={
                  hasSkuHeroCarousel || index > 0
                    ? "h-full w-full object-cover"
                    : "h-full w-full object-contain p-5"
                }
                loading={index === 0 ? "eager" : "lazy"}
              />
            </div>
          ))}
        </div>
        {productHeroImages.length > 1 && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
            {productHeroImages.map((image, index) => (
              <button
                key={image}
                type="button"
                onClick={() => setCurrentSlide(index)}
                aria-label={`查看第 ${index + 1} 张商品首图`}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: index === currentSlide ? 18 : 6,
                  background:
                    index === currentSlide
                      ? "#FFFFFF"
                      : "rgba(255,255,255,0.55)",
                  boxShadow:
                    index === currentSlide
                      ? "0 1px 3px rgba(0,0,0,0.28)"
                      : undefined,
                }}
              />
            ))}
          </div>
        )}
      </div>

      <section className="border-b border-gray-100 px-5 pb-5 pt-4">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {currentProduct.detail.tags.map(tag => (
            <span
              key={tag}
              className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold"
              style={{
                color: accent,
                background: HERBALIFE_THEME.surfaceMuted,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
        <h1 className="text-[22px] font-black tracking-tight text-gray-950">
          {currentProduct.detail.title}
        </h1>
        <p className="mt-1 text-[13px] text-gray-500">
          {currentProduct.detail.subtitle}
        </p>
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2.5">
          <div className="min-w-0">
            <div className="flex items-end gap-1.5">
              <Price
                value={selectedSku.priceCny}
                large
                color={HERBALIFE_THEME.price}
              />
              <span className="mb-1 text-[11px] text-gray-400">
                /{selectedSku.unitLabel}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              {currentProduct.detail.isOverseas
                ? "海外购商品，税费以订单实际申报为准"
                : "商品资料整理自品牌公开信息，包装以到货实物为准"}
            </p>
          </div>
          <div
            className="min-w-[108px] shrink-0 rounded-xl px-3 py-2 text-right"
            style={{ background: HERBALIFE_THEME.surfaceMuted }}
          >
            <div className="text-[10px] text-gray-400">净含量</div>
            <div
              className="mt-0.5 whitespace-nowrap text-[12px] font-bold"
              style={{ color: accent }}
            >
              {selectedSku.netContentText}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-gray-100 px-5 py-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-[17px] font-extrabold text-gray-900">
              {activeSkus.length > 1 ? "选择口味" : "选择规格"}
            </h2>
            <p className="mt-0.5 text-[11px] text-gray-400">
              {activeSkus.length > 1
                ? "请选择喜欢的口味"
                : "当前商品提供的现货规格"}
            </p>
          </div>
          <span className="text-[11px] font-semibold" style={{ color: accent }}>
            康宝莱
          </span>
        </div>
        <div className="space-y-2.5">
          {activeSkus.map(sku => {
            const selected = sku.id === selectedSku.id;
            return (
              <button
                key={sku.id}
                onClick={() => {
                  setSelectedSkuId(sku.id);
                  setQuantity(1);
                }}
                className="flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors"
                style={{
                  borderColor: selected ? accent : "#E7E5E4",
                  background: selected ? HERBALIFE_THEME.surfaceMuted : "#fff",
                }}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold text-gray-900">
                      {sku.name}
                    </span>
                    {sku.featured && (
                      <span
                        className="rounded-sm px-1.5 py-0.5 text-[9px] font-bold text-white"
                        style={{ background: accent }}
                      >
                        推荐
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400">
                    {sku.subtitle}
                  </div>
                </div>
                <Price value={sku.priceCny} color={HERBALIFE_THEME.price} />
              </button>
            );
          })}
        </div>
      </section>

      <section className="border-b border-gray-100 bg-white">
        <div className="px-5 pb-3 pt-5">
          <h2 className="text-[17px] font-extrabold text-gray-900">商品详情</h2>
          <p className="mt-1 text-[11px] text-gray-400">
            {detailImages.length > 0
              ? "以下图文按官方公开商品资料顺序展示"
              : "以下商品信息整理自品牌公开资料"}
          </p>
        </div>
        {detailImages.length > 0 && (
          <div className="space-y-px bg-gray-100">
            {detailImages.map((image, index) => (
              <img
                key={image}
                src={image}
                alt={`${currentProduct.detail.title}官方商品图 ${index + 1}`}
                className="block w-full bg-white"
                loading="lazy"
              />
            ))}
          </div>
        )}
        {(currentProduct.detail.description ||
          currentProduct.detail.usage ||
          currentProduct.detail.warning) && (
          <div className="space-y-4 px-5 pb-5 text-[13px] leading-6 text-gray-600">
            {currentProduct.detail.description && (
              <div>
                <h3 className="font-bold text-gray-900">产品简介</h3>
                <p className="mt-1">{currentProduct.detail.description}</p>
              </div>
            )}
            {currentProduct.detail.usage && (
              <div>
                <h3 className="font-bold text-gray-900">使用建议</h3>
                <p className="mt-1">{currentProduct.detail.usage}</p>
              </div>
            )}
            {currentProduct.detail.warning && (
              <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] leading-5 text-amber-800">
                <span className="font-bold">注意事项：</span>
                {currentProduct.detail.warning}
              </div>
            )}
          </div>
        )}
      </section>

      {currentProduct.detail.consumerNoticeImage && (
        <section className="border-b border-gray-100 bg-white px-5 py-5">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck size={18} style={{ color: accent }} />
            <h2 className="text-[17px] font-extrabold text-gray-900">
              消费者告知
            </h2>
          </div>
          <img
            src={currentProduct.detail.consumerNoticeImage}
            alt="消费者告知书"
            className="block w-full rounded-xl border border-gray-100"
            loading="lazy"
          />
        </section>
      )}

      <section className="border-b border-gray-100 bg-white px-5 py-5">
        <h2 className="text-[17px] font-extrabold text-gray-900">
          订单与售后说明
        </h2>
        <div className="mt-3 grid grid-cols-2">
          {currentProduct.detail.logistics.map((item, index) => (
            <div
              key={item.title}
              className="p-3"
              style={{
                borderRight:
                  index % 2 === 0
                    ? `1px solid ${HERBALIFE_THEME.border}`
                    : undefined,
                borderBottom:
                  index < 2 ? `1px solid ${HERBALIFE_THEME.border}` : undefined,
              }}
            >
              <div
                className="mb-2 h-0.5 w-5 rounded-full"
                style={{ background: accent }}
              />
              <div className="text-[13px] font-bold text-gray-800">
                {item.title}
              </div>
              <div className="mt-1 text-[11px] leading-relaxed text-gray-400">
                {item.description}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2.5">
          {currentProduct.detail.notices.map(notice => (
            <p
              key={notice.label}
              className="text-[12px] leading-relaxed text-gray-500"
            >
              <span className="font-semibold text-gray-700">
                {notice.label}：
              </span>
              {notice.text}
            </p>
          ))}
        </div>
      </section>

      <div
        className="fixed bottom-0 left-0 right-0 z-40 mx-auto flex gap-2.5 border-t border-gray-100 px-4 py-2.5"
        style={{
          maxWidth: 480,
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(10px)",
          paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {currentProduct.orderPolicy.allowFavorite && (
          <button
            onClick={handleFavorite}
            disabled={favoritePending}
            className="flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-xl active:scale-95 disabled:opacity-60"
            style={{
              background: favoriteData?.favorited
                ? HERBALIFE_THEME.surfaceMuted
                : HERBALIFE_THEME.canvas,
            }}
          >
            <Heart
              size={20}
              style={{
                color: favoriteData?.favorited ? accent : "#777",
                fill: favoriteData?.favorited ? accent : "none",
              }}
            />
            <span
              className="text-[10px] font-medium"
              style={{ color: favoriteData?.favorited ? accent : "#777" }}
            >
              {favoriteData?.favorited ? "已收藏" : "收藏"}
            </span>
          </button>
        )}
        <button
          onClick={handleBuy}
          disabled={!isOnSale || authLoading}
          className="h-14 flex-1 rounded-xl text-[16px] font-extrabold tracking-wide text-white disabled:cursor-not-allowed disabled:bg-gray-300"
          style={{
            background: isOnSale ? HERBALIFE_THEME.primary : undefined,
          }}
        >
          {isOnSale ? "立即购买" : "暂未开售"}
        </button>
      </div>

      {showCheckout && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60"
          onClick={() => setShowCheckout(false)}
        >
          <div
            className="flex w-full flex-col overflow-hidden rounded-t-3xl bg-white"
            style={{ maxWidth: 480, maxHeight: "86vh", margin: "0 auto" }}
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <div className="text-[18px] font-extrabold text-gray-900">
                  确认订单
                </div>
                <div className="mt-0.5 text-[11px] text-gray-400">
                  请核对规格、数量与收货信息
                </div>
              </div>
              <button
                onClick={() => setShowCheckout(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div
                className="flex gap-3 rounded-2xl p-3"
                style={{ background: HERBALIFE_THEME.surfaceMuted }}
              >
                <img
                  src={checkoutProductImage}
                  alt=""
                  className="h-16 w-16 rounded-xl bg-white object-contain p-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold text-gray-900">
                    {currentProduct.detail.title}
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500">
                    {selectedSku.name} · {selectedSku.netContentText}
                  </div>
                  <div className="mt-1">
                    <Price
                      value={selectedSku.priceCny}
                      color={HERBALIFE_THEME.price}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-bold text-gray-800">
                    购买数量
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-400">
                    单笔最多 {selectedSku.maxPurchaseQty}
                    {selectedSku.unitLabel}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity(value => Math.max(1, value - 1))}
                    disabled={quantity <= 1}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 text-gray-600 disabled:text-gray-300"
                  >
                    <Minus size={15} />
                  </button>
                  <span className="w-6 text-center text-[16px] font-extrabold text-gray-900">
                    {quantity}
                  </span>
                  <button
                    onClick={() =>
                      setQuantity(value =>
                        Math.min(selectedSku.maxPurchaseQty, value + 1)
                      )
                    }
                    disabled={quantity >= selectedSku.maxPurchaseQty}
                    className="flex h-8 w-8 items-center justify-center rounded-full border"
                    style={{ borderColor: accent, color: accent }}
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>

              <div
                className="mt-4 rounded-xl px-4 py-3"
                style={{ background: HERBALIFE_THEME.canvas }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-gray-500">应付金额</span>
                  <Price value={totalPrice} color={HERBALIFE_THEME.price} />
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400">
                    钱包可用余额
                  </span>
                  <span className="text-[11px] text-gray-500">
                    ¥{totalAvailableCny.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
                <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                  <span className="text-[12px] font-bold text-gray-600">
                    收货信息
                  </span>
                  {savedAddresses && savedAddresses.length > 0 && (
                    <button
                      onClick={() => setShowAddressPicker(value => !value)}
                      className="flex items-center gap-1 text-[12px] font-semibold"
                      style={{ color: accent }}
                    >
                      <BookMarked size={13} />
                      从地址簿选择
                    </button>
                  )}
                </div>
                {showAddressPicker && (
                  <div className="border-b border-gray-100">
                    <AddressBook
                      mode="select"
                      onSelect={address => {
                        setReceiverName(address.name);
                        setReceiverPhone(address.phone);
                        setReceiverProvince(address.province);
                        setReceiverCity(address.city);
                        setReceiverDistrict(address.district ?? "");
                        setReceiverDetail(address.detail);
                        setShowAddressPicker(false);
                      }}
                    />
                  </div>
                )}
                <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
                  <User size={14} className="text-gray-300" />
                  <input
                    value={receiverName}
                    onChange={event => setReceiverName(event.target.value)}
                    placeholder="收货人姓名"
                    className="min-w-0 flex-1 bg-transparent text-[14px] outline-none"
                  />
                </div>
                <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
                  <Phone size={14} className="text-gray-300" />
                  <input
                    type="tel"
                    value={receiverPhone}
                    onChange={event => setReceiverPhone(event.target.value)}
                    placeholder="手机号"
                    className="min-w-0 flex-1 bg-transparent text-[14px] outline-none"
                  />
                </div>
                <div className="space-y-2 border-b border-gray-100 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <MapPin size={14} className="text-gray-300" />
                    <span className="text-[12px] text-gray-400">收货地址</span>
                  </div>
                  <select
                    value={receiverProvince}
                    onChange={event => {
                      setReceiverProvince(event.target.value);
                      setReceiverCity("");
                      setReceiverDistrict("");
                    }}
                    className="w-full rounded-lg border border-gray-100 bg-white px-3 py-2 text-[13px] outline-none"
                  >
                    <option value="">选择省/直辖市/自治区</option>
                    {provinces.map(province => (
                      <option key={province} value={province}>
                        {province}
                      </option>
                    ))}
                  </select>
                  {!isMunicipality && (
                    <select
                      value={receiverCity}
                      disabled={!receiverProvince}
                      onChange={event => {
                        setReceiverCity(event.target.value);
                        setReceiverDistrict("");
                      }}
                      className="w-full rounded-lg border border-gray-100 bg-white px-3 py-2 text-[13px] outline-none disabled:opacity-40"
                    >
                      <option value="">选择市/地区</option>
                      {getCities(receiverProvince).map(city => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>
                  )}
                  <select
                    value={receiverDistrict}
                    disabled={!isMunicipality && !receiverCity}
                    onChange={event => setReceiverDistrict(event.target.value)}
                    className="w-full rounded-lg border border-gray-100 bg-white px-3 py-2 text-[13px] outline-none disabled:opacity-40"
                  >
                    <option value="">选择区/县（可选）</option>
                    {getDistricts(
                      receiverProvince,
                      isMunicipality ? receiverProvince : receiverCity
                    ).map(district => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                  </select>
                  <input
                    value={receiverDetail}
                    onChange={event => setReceiverDetail(event.target.value)}
                    placeholder="详细地址（街道、楼号、门牌号等）"
                    className="w-full rounded-lg border border-gray-100 bg-white px-3 py-2 text-[13px] outline-none"
                  />
                </div>
                {currentProduct.orderPolicy.allowAddressBook && (
                  <button
                    onClick={() => setSaveToBook(value => !value)}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
                  >
                    <span
                      className="flex h-4 w-4 items-center justify-center rounded border-2"
                      style={{
                        borderColor: saveToBook ? accent : "#DDD",
                        background: saveToBook ? accent : "transparent",
                      }}
                    >
                      {saveToBook && (
                        <Check
                          size={11}
                          className="text-white"
                          strokeWidth={3}
                        />
                      )}
                    </span>
                    <span
                      className="text-[12px]"
                      style={{ color: saveToBook ? accent : "#777" }}
                    >
                      保存到地址簿
                    </span>
                  </button>
                )}
              </div>

              <textarea
                value={userNote}
                onChange={event => setUserNote(event.target.value)}
                placeholder="订单备注（可选）"
                rows={2}
                className="mt-3 w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-[13px] outline-none"
              />
            </div>
            <div
              className="border-t border-gray-100 px-5 py-3"
              style={{
                paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
              }}
            >
              <button
                onClick={handleSubmitOrder}
                disabled={!canSubmit || !balanceOk}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-extrabold text-white disabled:bg-gray-300"
                style={{
                  background:
                    canSubmit && balanceOk
                      ? HERBALIFE_THEME.primary
                      : undefined,
                }}
              >
                {createOrder.isPending ? (
                  <>
                    <Loader2 size={17} className="animate-spin" />
                    提交中
                  </>
                ) : !balanceOk ? (
                  "余额不足，请先充值"
                ) : (
                  `确认下单 · ¥${totalPrice.toFixed(2)}`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {orderSuccess && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-6">
          <div
            className="w-full rounded-3xl bg-white p-6 text-center"
            style={{ maxWidth: 360 }}
          >
            <div
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
              style={{
                background: HERBALIFE_THEME.surfaceMuted,
                color: HERBALIFE_THEME.primary,
              }}
            >
              <Check size={25} strokeWidth={3} />
            </div>
            <h2 className="mt-4 text-[19px] font-extrabold text-gray-900">
              订单已提交
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-gray-500">
              工作人员将核对订单并安排后续处理。订单号：
              <span className="font-mono font-semibold text-gray-700">
                {orderSuccess.orderNo}
              </span>
            </p>
            <Link
              href="/p/proj_hzxm2t/my-orders"
              className="mt-5 flex h-11 items-center justify-center rounded-xl text-[14px] font-bold text-white"
              style={{ background: HERBALIFE_THEME.primary }}
            >
              查看我的订单
            </Link>
            <button
              onClick={() => setOrderSuccess(null)}
              className="mt-3 text-[13px] text-gray-400"
            >
              继续浏览
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
