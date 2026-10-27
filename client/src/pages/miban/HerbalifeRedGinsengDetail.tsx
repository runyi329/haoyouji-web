import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  BookMarked,
  Check,
  ChevronLeft,
  Copy,
  Heart,
  Loader2,
  MapPin,
  Minus,
  Phone,
  Plus,
  ShieldCheck,
  User,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getMibanLimitedProduct } from "../../../../shared/miban-limited-products";
import { HERBALIFE_THEME } from "../../../../shared/herbalife-theme";
import { getMibanLimitedBrandByName } from "../../../../shared/miban-limited-brand-config";
import { mtrpc } from "./mibanTrpc";
import AddressBook from "./AddressBook";
import { getCities, getDistricts, provinces } from "./regionData";
import { cnyToU, useMibanUsdtCnyRate } from "./useMibanUsdtCnyRate";
import { OrderCardImageDownload } from "@/components/OrderCardImageDownload";
import { LimitedCartButton, useLimitedProductCart } from "./LimitedProductCart";
import { toast } from "sonner";

type LimitedOrderSuccess = {
  orderNo: string;
  totalCny: number;
  deductCny: number;
  deductUsdt: number;
  quantity: number;
  unitLabel: string;
  createdAt: string;
};

function formatOrderReceiptTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function Price({
  value,
  usdtCnyRate,
  large = false,
  color = HERBALIFE_THEME.price,
}: {
  value: number;
  usdtCnyRate: number;
  large?: boolean;
  color?: string;
}) {
  const priceU = cnyToU(value, usdtCnyRate);
  return (
    <span className="inline-flex flex-col leading-none">
      <span
        className={
          large
            ? "text-[30px] font-black tracking-tight"
            : "text-[18px] font-extrabold"
        }
        style={{ color }}
      >
        {priceU.toFixed(2)}
        <span className={large ? "ml-1 text-[14px]" : "ml-0.5 text-[11px]"}>
          USDT
        </span>
      </span>
      <span
        className={
          large
            ? "mt-1 text-[11px] text-gray-400"
            : "mt-0.5 text-[10px] text-gray-400"
        }
      >
        ≈ ¥{value.toFixed(2)}
      </span>
    </span>
  );
}

export default function HerbalifeRedGinsengDetail() {
  const [location, navigate] = useLocation();
  const [, checkoutRouteParams] = useRoute(
    "/p/proj_hzxm2t/limited/:productKey/buy"
  );
  const [, routeParams] = useRoute("/p/proj_hzxm2t/limited/:productKey");
  const productKey =
    checkoutRouteParams?.productKey ??
    routeParams?.productKey ??
    "herbalife-red-ginseng";
  const detailPath = `/p/proj_hzxm2t/limited/${productKey}`;
  const queryString =
    typeof window === "undefined" ? "" : window.location.search;
  const checkoutSkuId = new URLSearchParams(queryString).get("sku");
  const checkoutPathBase = `${detailPath}/buy`;
  const isCheckoutPage = location.split("?")[0] === checkoutPathBase;
  const currentProduct = getMibanLimitedProduct(productKey);
  const localPreviewMode = import.meta.env.DEV;
  const currentBrand = getMibanLimitedBrandByName(currentProduct?.brand ?? "");
  const theme = currentBrand?.theme ?? HERBALIFE_THEME;
  const brandPagePath = `/p/proj_hzxm2t/limited/${currentBrand?.slug ?? "herbalife"}${localPreviewMode ? "?preview=1" : ""}`;
  const isPreviewProduct = Boolean(
    localPreviewMode && currentProduct?.status === "draft"
  );
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const { addItem: addCartItem } = useLimitedProductCart();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [selectedSkuId, setSelectedSkuId] = useState(() => checkoutSkuId ?? "");
  const [quantity, setQuantity] = useState(1);
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [saveToBook, setSaveToBook] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<LimitedOrderSuccess | null>(
    null
  );
  const [showWalletPayment, setShowWalletPayment] = useState(false);
  const [cnyPaymentInput, setCnyPaymentInput] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [receiverProvince, setReceiverProvince] = useState("");
  const [receiverCity, setReceiverCity] = useState("");
  const [receiverDistrict, setReceiverDistrict] = useState("");
  const [receiverDetail, setReceiverDetail] = useState("");
  const [userNote, setUserNote] = useState("");
  const [favoritePending, setFavoritePending] = useState(false);
  const startXRef = useRef(0);
  const orderReceiptRef = useRef<HTMLDivElement>(null);

  const { data: availability, isLoading: availabilityLoading } =
    mtrpc.limitedProduct.publicAvailability.useQuery(undefined, {
      // 本地上架预览不访问真实库存状态，也不会触发SKU运行时初始化。
      enabled: !localPreviewMode,
    });
  const availabilityBySku = new Map<string, any>(
    (availability ?? []).map((item: any) => [
      `${item.productKey}:${item.skuId}`,
      item,
    ])
  );
  const activeSkus =
    currentProduct?.skus.filter(
      sku =>
        sku.active &&
        (localPreviewMode ||
          availabilityLoading ||
          availabilityBySku.get(`${currentProduct.key}:${sku.id}`)?.isOnSale ===
            true)
    ) ?? [];
  const activeSkuId = selectedSkuId || activeSkus[0]?.id || "";
  const checkoutPath = `${checkoutPathBase}?sku=${encodeURIComponent(activeSkuId)}`;
  const selectedSku = currentProduct
    ? (activeSkus.find(sku => sku.id === activeSkuId) ?? activeSkus[0])
    : undefined;
  const accent = theme.primary;
  const productHeroImages =
    selectedSku?.heroImages && selectedSku.heroImages.length > 0
      ? selectedSku.heroImages
      : selectedSku?.image
        ? [selectedSku.image]
        : (currentProduct?.detail.heroImages ?? []);
  const hasSkuHeroCarousel = Boolean(
    selectedSku?.heroImages && selectedSku.heroImages.length > 0
  );
  const heroBackgroundImage = currentProduct?.detail.heroBackgroundImage;
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
  const usdtCnyRate = useMibanUsdtCnyRate();
  const trpcUtils = trpc.useUtils();
  const cnyBalanceNum = Number(cnyBalance ?? 0);
  const usdtBalanceNum = Number(usdtBalance ?? 0);
  const totalPriceU = cnyToU(totalPrice, usdtCnyRate);
  const maxCnyPayment = Math.min(cnyBalanceNum, totalPrice);
  const requestedCnyPayment = Number(cnyPaymentInput);
  const cnyDeductAmount = Number(
    Math.min(
      Math.max(
        Number.isFinite(requestedCnyPayment) ? requestedCnyPayment : 0,
        0
      ),
      maxCnyPayment
    ).toFixed(2)
  );
  const remainingCnyForUsdt = Number(
    Math.max(0, totalPrice - cnyDeductAmount).toFixed(2)
  );
  const requiredUsdt = Number((remainingCnyForUsdt / usdtCnyRate).toFixed(8));
  const cnyPartAvailable = cnyDeductAmount <= cnyBalanceNum + 0.001;
  const usdtPartAvailable = requiredUsdt <= usdtBalanceNum + 0.00000001;
  const combinedPaymentAvailable = cnyPartAvailable && usdtPartAvailable;
  const hasAvailablePaymentWallet = combinedPaymentAvailable;
  const paymentSummary =
    cnyDeductAmount > 0 && requiredUsdt > 0
      ? `¥${cnyDeductAmount.toFixed(2)} + ${requiredUsdt.toFixed(2)} USDT`
      : cnyDeductAmount > 0
        ? `¥${cnyDeductAmount.toFixed(2)}`
        : `${requiredUsdt.toFixed(2)} USDT`;

  const createOrder = mtrpc.limitedProduct.createOrder.useMutation({
    onSuccess: (data: any) => {
      setShowWalletPayment(false);
      setOrderSuccess({
        orderNo: data.orderNo,
        totalCny: Number(data.totalCny),
        deductCny: Number(data.deductCny),
        deductUsdt: Number(data.deductUsdt),
        quantity: Number(data.quantity),
        unitLabel: data.unitLabel,
        createdAt: new Date().toISOString(),
      });
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
      navigate(`/login?from=${encodeURIComponent(checkoutPath)}`);
      return;
    }
    navigate(checkoutPath);
  };

  const handleAddToCart = () => {
    if (!isOnSale || isPreviewProduct) return;
    addCartItem({
      checkoutGroupKey: currentProduct.checkoutGroupKey ?? currentProduct.key,
      groupLabel: `${currentProduct.brand}精选`,
      productKey: currentProduct.key,
      productName: currentProduct.detail.title,
      skuId: selectedSku.id,
      skuName: selectedSku.name,
      image: checkoutProductImage || selectedSku.image || "",
      unitLabel: selectedSku.unitLabel,
      netContentText: selectedSku.netContentText,
      priceCny: selectedSku.priceCny,
      maxPurchaseQty: selectedSku.maxPurchaseQty,
      quantity,
      accent,
    });
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

  const copyToClipboard = async (text: string, successMessage: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) throw new Error("复制失败");
      }
      toast.success(successMessage);
    } catch {
      toast.error("复制失败，请长按后手动复制");
    }
  };

  const getOrderDetailText = () => {
    if (!orderSuccess) return "";
    const paymentLines = [
      orderSuccess.deductCny > 0.001
        ? `人民币支付：¥${orderSuccess.deductCny.toFixed(2)}`
        : null,
      orderSuccess.deductUsdt > 0.000001
        ? `USDT支付：${orderSuccess.deductUsdt.toFixed(2)} U`
        : null,
    ].filter(Boolean);
    return [
      "米伴精选订单详情",
      `订单编号：${orderSuccess.orderNo}`,
      `下单时间：${formatOrderReceiptTime(orderSuccess.createdAt)}`,
      `商品：${currentProduct?.detail.title || "商品"}`,
      `规格：${selectedSku?.name || "--"}`,
      `数量：${orderSuccess.quantity}${orderSuccess.unitLabel}`,
      `应付金额：¥${orderSuccess.totalCny.toFixed(2)}`,
      ...paymentLines,
      `收货人：${receiverName.trim()}`,
      `手机号：${receiverPhone.trim()}`,
      `收货地址：${receiverAddress}`,
      userNote.trim() ? `订单备注：${userNote.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  };

  const setCnyPayment = (amount: number) => {
    const normalized = Math.min(Math.max(amount, 0), maxCnyPayment);
    setCnyPaymentInput(normalized.toFixed(2));
  };

  const handleCnyPaymentInput = (value: string) => {
    if (value !== "" && !/^\d*(?:\.\d{0,2})?$/.test(value)) return;
    if (value === "") {
      setCnyPaymentInput("");
      return;
    }
    const amount = Number(value);
    if (!Number.isFinite(amount)) return;
    if (amount > maxCnyPayment) {
      setCnyPayment(maxCnyPayment);
      return;
    }
    setCnyPaymentInput(value);
  };

  const useAvailableUsdtFirst = () => {
    const cnyCoveredByUsdt = Math.min(totalPrice, usdtBalanceNum * usdtCnyRate);
    setCnyPayment(totalPrice - cnyCoveredByUsdt);
  };

  const handleOpenWalletPayment = () => {
    if (!canSubmit) return;
    setCnyPayment(Math.min(cnyBalanceNum, totalPrice));
    setShowWalletPayment(true);
  };

  const handleConfirmWalletPayment = () => {
    if (!canSubmit || !combinedPaymentAvailable) return;
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
      cnyAmount: cnyDeductAmount,
    });
  };

  return (
    <div
      className="min-h-screen bg-white pb-44"
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
          onClick={() => navigate(brandPagePath)}
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
        style={{ background: theme.canvas }}
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
              className="relative w-full flex-none"
              style={{ aspectRatio: "1 / 1" }}
            >
              {heroBackgroundImage && index === 0 && (
                <img
                  src={heroBackgroundImage}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                />
              )}
              <img
                src={image}
                alt={`${currentProduct.detail.title}展示图 ${index + 1}`}
                className={
                  heroBackgroundImage && index === 0
                    ? "relative z-10 h-full w-full object-contain p-3 drop-shadow-[0_18px_16px_rgba(0,0,0,0.24)]"
                    : hasSkuHeroCarousel || index > 0
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

      {isPreviewProduct && (
        <div
          className="mx-4 mt-4 rounded-2xl border px-3 py-2.5 text-[11px] leading-5"
          style={{
            borderColor: theme.border,
            background: theme.surfaceMuted,
            color: theme.muted,
          }}
        >
          <strong style={{ color: accent }}>资料核验中：</strong>
          当前为本地设计预览，商品尚未上架；不会创建库存状态、订单或钱包扣款。页面内的包装与图文资料仅供核验，不作为对外功效承诺。
        </div>
      )}

      <section className="border-b border-gray-100 px-5 pb-5 pt-4">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {currentProduct.detail.tags.map(tag => (
            <span
              key={tag}
              className="rounded-sm px-1.5 py-0.5 text-[10px] font-semibold"
              style={{
                color: accent,
                background: theme.surfaceMuted,
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
        <div className="mt-4">
          <div className="flex items-end gap-1.5">
            <Price
              value={selectedSku.priceCny}
              usdtCnyRate={usdtCnyRate}
              large
              color={theme.price}
            />
            <span className="mb-1 text-[11px] text-gray-400">
              /{selectedSku.unitLabel}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
            <span className="font-medium text-gray-500">规格 / 净含量</span>
            <span className="text-gray-700">{selectedSku.netContentText}</span>
          </div>
          <p className="mt-2 text-[11px] text-gray-400">
            {isPreviewProduct
              ? "商品资料来自用户提供的原始素材，包装与规格待实物核验"
              : currentProduct.detail.sourceNote ||
                (currentProduct.detail.isOverseas
                  ? "海外购商品，税费以订单实际申报为准"
                  : "商品资料整理自品牌公开信息，包装以到货实物为准")}
          </p>
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
            {currentProduct.brand}
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
                  background: selected ? theme.surfaceMuted : "#fff",
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
                <Price
                  value={sku.priceCny}
                  usdtCnyRate={usdtCnyRate}
                  color={theme.price}
                />
              </button>
            );
          })}
        </div>
      </section>

      <section className="border-b border-gray-100 bg-white">
        <div className="px-5 pb-3 pt-5">
          <h2 className="text-[17px] font-extrabold text-gray-900">商品详情</h2>
          <p className="mt-1 text-[11px] text-gray-400">
            {isPreviewProduct
              ? "以下为供货链路提供的原始资料图，仅供内部核验"
              : currentProduct.detail.detailImagesCaption ||
                (detailImages.length > 0
                  ? "以下图文按官方公开商品资料顺序展示"
                  : "以下商品信息整理自品牌公开资料")}
          </p>
        </div>
        {detailImages.length > 0 && (
          <div className="space-y-px bg-gray-100">
            {detailImages.map((image, index) => (
              <img
                key={image}
                src={image}
                alt={`${currentProduct.detail.title}商品图 ${index + 1}`}
                className="block w-full bg-white"
                loading="lazy"
              />
            ))}
          </div>
        )}
        {(currentProduct.detail.description ||
          currentProduct.detail.introImage ||
          currentProduct.detail.usage ||
          currentProduct.detail.warning) && (
          <div className="space-y-4 px-5 pb-5 text-[13px] leading-6 text-gray-600">
            {(currentProduct.detail.description ||
              currentProduct.detail.introImage) && (
              <div>
                <h3 className="font-bold text-gray-900">产品简介</h3>
                {currentProduct.detail.introImage && (
                  <img
                    src={currentProduct.detail.introImage}
                    alt={
                      currentProduct.detail.introImageAlt ||
                      `${currentProduct.detail.title}产品介绍图`
                    }
                    className="mt-2 w-full rounded-xl bg-white"
                    loading="lazy"
                  />
                )}
                {currentProduct.detail.description && (
                  <p
                    className={
                      currentProduct.detail.introImage ? "mt-3" : "mt-1"
                    }
                  >
                    {currentProduct.detail.description}
                  </p>
                )}
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
                  index % 2 === 0 ? `1px solid ${theme.border}` : undefined,
                borderBottom:
                  index < 2 ? `1px solid ${theme.border}` : undefined,
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
        className="fixed left-0 right-0 z-[60] mx-auto flex gap-2.5 border-t border-gray-100 px-4 py-2.5 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]"
        style={{
          maxWidth: 480,
          bottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
          background: "rgba(255,255,255,0.97)",
          backdropFilter: "blur(10px)",
          paddingBottom: "10px",
        }}
      >
        {currentProduct.orderPolicy.allowFavorite && (
          <button
            onClick={handleFavorite}
            disabled={favoritePending}
            className="flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-xl active:scale-95 disabled:opacity-60"
            style={{
              background: favoriteData?.favorited
                ? theme.surfaceMuted
                : theme.canvas,
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
        <LimitedCartButton accent={accent} />
        <button
          onClick={handleAddToCart}
          disabled={!isOnSale || isPreviewProduct}
          className="h-14 flex-1 rounded-xl border text-[14px] font-extrabold disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
          style={{
            borderColor: isOnSale ? accent : undefined,
            color: isOnSale ? accent : undefined,
          }}
        >
          加入购物车
        </button>
        <button
          onClick={handleBuy}
          disabled={!isOnSale || authLoading}
          className="h-14 flex-1 rounded-xl text-[14px] font-extrabold tracking-wide text-white disabled:cursor-not-allowed disabled:bg-gray-300"
          style={{
            background: isOnSale ? accent : undefined,
          }}
        >
          {isPreviewProduct ? "资料核验中" : isOnSale ? "立即购买" : "暂未开售"}
        </button>
      </div>

      {isCheckoutPage && !orderSuccess && !isPreviewProduct && (
        <div className="fixed inset-0 z-[70] bg-white">
          <div className="mx-auto flex h-full w-full max-w-[480px] flex-col overflow-hidden bg-white">
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
                onClick={() => navigate(detailPath)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500"
                aria-label="返回商品详情"
              >
                <ChevronLeft size={19} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div
                className="flex gap-3 rounded-2xl p-3"
                style={{ background: theme.surfaceMuted }}
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
                      usdtCnyRate={usdtCnyRate}
                      color={theme.price}
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
                style={{ background: theme.canvas }}
              >
                <div className="border-b border-gray-200 pb-3">
                  <div className="mb-2 text-[12px] font-semibold text-gray-600">
                    应付金额
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="min-w-0 rounded-lg bg-white px-2.5 py-2">
                      <div className="text-[10px] text-gray-400">USDT</div>
                      <div
                        className="mt-0.5 whitespace-nowrap text-[14px] font-extrabold"
                        style={{ color: theme.price }}
                      >
                        {totalPriceU.toFixed(2)} U
                      </div>
                    </div>
                    <div className="min-w-0 rounded-lg bg-white px-2.5 py-2 text-right">
                      <div className="text-[10px] text-gray-400">人民币</div>
                      <div className="mt-0.5 whitespace-nowrap text-[14px] font-extrabold text-gray-800">
                        ≈ ¥{totalPrice.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="pt-3">
                  <div className="mb-2 text-[12px] font-semibold text-gray-600">
                    钱包可用余额
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="min-w-0 rounded-lg bg-white px-2.5 py-2">
                      <div className="text-[10px] text-gray-400">USDT</div>
                      <div className="mt-0.5 whitespace-nowrap text-[14px] font-extrabold text-gray-800">
                        {usdtBalanceNum.toFixed(2)} U
                      </div>
                    </div>
                    <div className="min-w-0 rounded-lg bg-white px-2.5 py-2 text-right">
                      <div className="text-[10px] text-gray-400">人民币</div>
                      <div className="mt-0.5 whitespace-nowrap text-[14px] font-extrabold text-gray-800">
                        ¥{cnyBalanceNum.toFixed(2)}
                      </div>
                    </div>
                  </div>
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
                onClick={handleOpenWalletPayment}
                disabled={!canSubmit}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-extrabold text-white disabled:bg-gray-300"
                style={{
                  background: canSubmit ? accent : undefined,
                }}
              >
                {!hasAvailablePaymentWallet
                  ? "查看钱包余额"
                  : `去支付 · ${totalPriceU.toFixed(2)} USDT`}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWalletPayment &&
        isCheckoutPage &&
        !orderSuccess &&
        !isPreviewProduct && (
          <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45">
            <div
              className="w-full rounded-t-3xl bg-white px-5 pb-5 pt-3 shadow-2xl"
              style={{
                maxWidth: 480,
                paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
              }}
            >
              <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-200" />
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[19px] font-extrabold text-gray-900">
                    钱包支付
                  </h2>
                  <p className="mt-1 text-[12px] text-gray-400">
                    人民币与 U 均可组合使用
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWalletPayment(false)}
                  disabled={createOrder.isPending}
                  className="rounded-lg px-2 py-1 text-[13px] text-gray-500 disabled:opacity-40"
                >
                  取消
                </button>
              </div>

              <div
                className="mt-4 rounded-2xl px-4 py-3"
                style={{ background: theme.surfaceMuted }}
              >
                <div className="text-[11px] text-gray-500">本次应付</div>
                <div className="mt-1">
                  <Price
                    value={totalPrice}
                    usdtCnyRate={usdtCnyRate}
                    large
                    color={theme.price}
                  />
                </div>
              </div>

              <div className="mt-5 text-[13px] font-bold text-gray-800">
                支付分配
              </div>
              <div className="mt-2.5 space-y-2.5">
                <div
                  className="rounded-2xl border px-4 py-3.5"
                  style={{
                    borderColor: theme.border,
                    background: theme.surfaceMuted,
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[14px] font-bold text-gray-900">
                        人民币钱包
                      </div>
                      <div className="mt-0.5 text-[11px] text-gray-500">
                        可用 ¥{cnyBalanceNum.toFixed(2)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCnyPayment(maxCnyPayment)}
                      disabled={createOrder.isPending}
                      className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-40"
                      style={{ color: accent, background: "#FFFFFF" }}
                    >
                      全部使用
                    </button>
                  </div>
                  <div className="mt-3 flex items-center rounded-xl border border-gray-200 bg-white px-3">
                    <span className="text-[16px] font-bold text-gray-600">
                      ¥
                    </span>
                    <input
                      value={cnyPaymentInput}
                      onChange={event =>
                        handleCnyPaymentInput(event.target.value)
                      }
                      onBlur={() => setCnyPayment(cnyDeductAmount)}
                      inputMode="decimal"
                      disabled={createOrder.isPending}
                      aria-label="本次使用的人民币金额"
                      className="h-10 min-w-0 flex-1 bg-transparent px-2 text-right text-[16px] font-extrabold text-gray-900 outline-none disabled:opacity-40"
                    />
                    <span className="text-[12px] text-gray-400">本次使用</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[14px] font-bold text-gray-900">
                        USDT 钱包
                      </div>
                      <div className="mt-0.5 text-[11px] text-gray-500">
                        可用 {usdtBalanceNum.toFixed(2)} U
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={useAvailableUsdtFirst}
                      disabled={createOrder.isPending || usdtBalanceNum <= 0}
                      className="rounded-lg px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-40"
                      style={{
                        color: accent,
                        background: theme.surfaceMuted,
                      }}
                    >
                      优先使用 U
                    </button>
                  </div>
                  <div className="mt-3 flex h-10 items-center justify-between rounded-xl bg-gray-50 px-3">
                    <span className="text-[12px] text-gray-500">本次使用</span>
                    <span
                      className="text-[16px] font-extrabold"
                      style={{ color: theme.price }}
                    >
                      {requiredUsdt.toFixed(2)} USDT
                    </span>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-[11px] leading-5 text-gray-400">
                可直接输入本次要使用的人民币金额，剩余部分自动按实时汇率由 U
                支付；点击“优先使用 U”可尽量使用 U 余额。
              </p>
              <button
                type="button"
                onClick={handleConfirmWalletPayment}
                disabled={!combinedPaymentAvailable || createOrder.isPending}
                className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-extrabold text-white disabled:bg-gray-300"
                style={{
                  background: combinedPaymentAvailable ? accent : undefined,
                }}
              >
                {createOrder.isPending ? (
                  <>
                    <Loader2 size={17} className="animate-spin" />
                    支付中
                  </>
                ) : (
                  `确认支付 · ${paymentSummary}`
                )}
              </button>
            </div>
          </div>
        )}

      {orderSuccess && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-6">
          <div
            className="max-h-[88vh] w-full overflow-y-auto rounded-3xl bg-white p-5"
            style={{ maxWidth: 360 }}
          >
            <div
              ref={orderReceiptRef}
              className="rounded-2xl bg-white text-left"
            >
              <div className="border-b border-gray-100 pb-4 text-center">
                <div
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
                  style={{
                    background: theme.surfaceMuted,
                    color: accent,
                  }}
                >
                  <Check size={25} strokeWidth={3} />
                </div>
                <h2 className="mt-3 text-[19px] font-extrabold text-gray-900">
                  订单已提交
                </h2>
                <p className="mt-1.5 text-[12px] leading-relaxed text-gray-500">
                  工作人员将核对订单并安排后续处理
                </p>
              </div>

              <div className="space-y-3 py-4 text-[12px] leading-relaxed">
                <div
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: theme.surfaceMuted }}
                >
                  <span className="shrink-0 text-gray-500">订单编号</span>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-mono text-[15px] font-extrabold tracking-[0.08em] text-gray-800">
                      {orderSuccess.orderNo}
                    </span>
                    <button
                      type="button"
                      data-card-export-hide="true"
                      onClick={() =>
                        copyToClipboard(orderSuccess.orderNo, "订单编号已复制")
                      }
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white"
                      style={{ color: accent }}
                      aria-label="复制订单编号"
                      title="复制订单编号"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-2">
                  <span className="text-gray-400">下单时间</span>
                  <span className="text-right font-medium text-gray-700">
                    {formatOrderReceiptTime(orderSuccess.createdAt)}
                  </span>
                  <span className="text-gray-400">商品</span>
                  <span className="text-right font-semibold text-gray-800">
                    {currentProduct.detail.title}
                  </span>
                  <span className="text-gray-400">规格</span>
                  <span className="text-right font-medium text-gray-700">
                    {selectedSku.name}
                  </span>
                  <span className="text-gray-400">购买数量</span>
                  <span className="text-right font-medium text-gray-700">
                    {orderSuccess.quantity}
                    {orderSuccess.unitLabel}
                  </span>
                  <span className="text-gray-400">应付金额</span>
                  <span
                    className="text-right font-extrabold"
                    style={{ color: theme.price }}
                  >
                    ¥{orderSuccess.totalCny.toFixed(2)}
                  </span>
                  <span className="text-gray-400">付款方式</span>
                  <span className="text-right font-medium text-gray-700">
                    {orderSuccess.deductCny > 0.001
                      ? `人民币 ¥${orderSuccess.deductCny.toFixed(2)}`
                      : ""}
                    {orderSuccess.deductCny > 0.001 &&
                    orderSuccess.deductUsdt > 0.000001
                      ? " + "
                      : ""}
                    {orderSuccess.deductUsdt > 0.000001
                      ? `USDT ${orderSuccess.deductUsdt.toFixed(2)}`
                      : ""}
                  </span>
                </div>
                <div className="border-t border-dashed border-gray-200 pt-3">
                  <div className="mb-1 text-gray-400">收货信息</div>
                  <div className="font-medium text-gray-700">
                    {receiverName.trim()}　{receiverPhone.trim()}
                  </div>
                  <div className="mt-1 break-all text-gray-600">
                    {receiverAddress}
                  </div>
                  {userNote.trim() && (
                    <div className="mt-2 break-all text-gray-500">
                      备注：{userNote.trim()}
                    </div>
                  )}
                </div>
              </div>
              <div className="border-t border-gray-100 pt-3 text-center text-[10px] text-gray-400">
                米伴精选 · 订单凭证
              </div>
            </div>
            <div
              data-card-export-hide="true"
              className="mt-4 grid grid-cols-2 gap-2"
            >
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(getOrderDetailText(), "订单详情已复制")
                }
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-gray-200 text-[12px] font-bold text-gray-600"
              >
                <Copy size={14} />
                复制订单详情
              </button>
              <OrderCardImageDownload
                targetRef={orderReceiptRef}
                currentUser={user}
                orderNo={orderSuccess.orderNo}
                color={accent}
                outerPadding={12}
                captureFullContent
                fullContentHorizontalBleed={0}
                fullContentBottomPadding={12}
                exportBackground="#F6F8F5"
                watermarkMode="time-only"
                watermarkOpacity={0.04}
                filenamePrefix="米伴订单详情"
                previewTitle="订单详情图片预览"
                previewHint="高清 PNG，保存或分享前可确认全部订单内容"
                buttonLabel="保存订单图片"
              />
            </div>
            <Link
              href="/p/proj_hzxm2t/my-orders"
              className="mt-3 flex h-11 items-center justify-center rounded-xl text-[14px] font-bold text-white"
              style={{ background: accent }}
            >
              查看我的订单
            </Link>
            <button
              onClick={() => {
                setOrderSuccess(null);
                navigate(detailPath);
              }}
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
