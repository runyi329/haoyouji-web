import { MibanImage } from "./MibanImage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "wouter";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { mtrpc } from "./mibanTrpc";
import AddressBook from "./AddressBook";
import { cnyToU } from "./useMibanUsdtCnyRate";
import {
  normalizeMibanReceiverPhone,
  getMibanReceiverPhoneError,
  formatMibanCheckoutError,
} from "../../../../shared/miban-shipping";
import {
  MibanMixedPaymentAllocation,
  useMibanMixedPayment,
} from "./MibanMixedPayment";
import {
  PAYMENT_SCALE,
  formatMibanPaymentSummary,
  paymentDecimalUnits,
  paymentUnitsText,
} from "../../../../shared/miban-wallet-payment";
import {
  getMibanLimitedProduct,
  getMibanLimitedProductSku,
} from "../../../../shared/miban-limited-products";

const STORAGE_KEY = "miban-limited-product-cart-v1";

type CartOrderReceipt = {
  orderId?: number;
  orderNo?: string;
  checkoutGroupKey?: string;
  groupLabel?: string;
  totalCny?: number | string;
  deductCny?: number | string;
  deductUsdt?: number | string;
  walletPayments?: { assetCode: string; amount: string }[];
};

type CartCheckoutReceipt = CartOrderReceipt & {
  checkoutNo?: string;
  orders?: CartOrderReceipt[];
};

function receiptCny(value: number | string | undefined) {
  return value != null &&
    String(value).trim() !== "" &&
    Number.isFinite(Number(value))
    ? `¥${Number(value).toFixed(2)}`
    : "金额待核对";
}

function receiptPaymentSummary(payments: CartOrderReceipt["walletPayments"]) {
  if (!payments?.length) return "实际付款明细待核对，请查看订单";
  try {
    return formatMibanPaymentSummary(payments);
  } catch {
    return "实际付款明细待核对，请查看订单";
  }
}

export type LimitedCartItem = {
  checkoutGroupKey: string;
  groupLabel: string;
  productKey: string;
  productName: string;
  skuId: string;
  skuName: string;
  image: string;
  unitLabel: string;
  netContentText: string;
  priceCny: number;
  maxPurchaseQty: number;
  quantity: number;
  accent: string;
};

type AddCartItem = Omit<LimitedCartItem, "quantity"> & { quantity?: number };

type LimitedCartContextValue = {
  items: LimitedCartItem[];
  itemCount: number;
  totalCny: number;
  open: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (item: AddCartItem) => boolean;
  setQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
};

const LimitedCartContext = createContext<LimitedCartContextValue | null>(null);

function cartKey(item: Pick<LimitedCartItem, "productKey" | "skuId">) {
  return `${item.productKey}:${item.skuId}`;
}

function cartTotalCny(items: LimitedCartItem[]) {
  const cent = PAYMENT_SCALE / 100n;
  const cents = items.reduce(
    (sum, item) =>
      sum + (paymentDecimalUnits(item.priceCny) / cent) * BigInt(item.quantity),
    0n
  );
  return Number(paymentUnitsText(cents * cent));
}

function readStoredCart(): LimitedCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item: any) =>
          item &&
          typeof item.productKey === "string" &&
          typeof item.skuId === "string" &&
          Number.isSafeInteger(Number(item.quantity)) &&
          Number(item.quantity) > 0 &&
          Number.isFinite(Number(item.priceCny)) &&
          Number(item.priceCny) >= 0
      )
      .map((item: LimitedCartItem) => {
        const product = getMibanLimitedProduct(item.productKey);
        const sku = product
          ? getMibanLimitedProductSku(product, item.skuId)
          : undefined;
        return {
          ...item,
          quantity: Number(item.quantity),
          priceCny: Number(item.priceCny),
          checkoutGroupKey:
            item.checkoutGroupKey ||
            product?.checkoutGroupKey ||
            item.productKey,
          groupLabel:
            item.groupLabel || (product ? `${product.brand}精选` : "精选商品"),
          accent: item.accent || product?.card.theme.accent || "#0D7A3E",
          productName:
            item.productName || product?.detail.title || item.productKey,
          skuName: item.skuName || sku?.name || item.skuId,
          image: item.image || sku?.image || product?.detail.productImage || "",
          unitLabel: item.unitLabel || sku?.unitLabel || "",
          netContentText: item.netContentText || sku?.netContentText || "",
          maxPurchaseQty:
            item.maxPurchaseQty || sku?.maxPurchaseQty || Number(item.quantity),
        };
      });
  } catch {
    return [];
  }
}

export function useLimitedProductCart() {
  const context = useContext(LimitedCartContext);
  if (!context) {
    throw new Error(
      "useLimitedProductCart must be used within LimitedProductCartProvider"
    );
  }
  return context;
}

export function LimitedProductCartProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [items, setItems] = useState<LimitedCartItem[]>(readStoredCart);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // 本地存储不可用时仍保持当前会话中的购物车状态。
    }
  }, [items]);

  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );
  const totalCny = useMemo(() => cartTotalCny(items), [items]);

  const addItem = useCallback((nextItem: AddCartItem) => {
    const quantity = Math.max(
      1,
      Math.min(nextItem.quantity ?? 1, nextItem.maxPurchaseQty)
    );
    const key = cartKey(nextItem);
    let capped = false;
    setItems(current =>
      current.map(cartKey).includes(key)
        ? current.map(item => {
            if (cartKey(item) !== key) return item;
            const nextQuantity = Math.min(
              item.quantity + quantity,
              item.maxPurchaseQty
            );
            capped = nextQuantity < item.quantity + quantity;
            return { ...item, quantity: nextQuantity };
          })
        : [
            ...current,
            {
              ...nextItem,
              quantity,
            },
          ]
    );
    toast.success(
      capped
        ? `已达到“${nextItem.skuName}”单笔购买上限`
        : `${nextItem.skuName} 已加入购物车`
    );
    return true;
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setItems(current =>
      current
        .map(item =>
          cartKey(item) === key
            ? {
                ...item,
                quantity: Math.min(
                  Math.max(0, Math.floor(quantity)),
                  item.maxPurchaseQty
                ),
              }
            : item
        )
        .filter(item => item.quantity > 0)
    );
  }, []);

  const removeItem = useCallback((key: string) => {
    setItems(current => current.filter(item => cartKey(item) !== key));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const value = useMemo<LimitedCartContextValue>(
    () => ({
      items,
      itemCount,
      totalCny,
      open,
      openCart: () => setOpen(true),
      closeCart: () => setOpen(false),
      addItem,
      setQuantity,
      removeItem,
      clearCart,
    }),
    [
      addItem,
      clearCart,
      itemCount,
      items,
      open,
      removeItem,
      setQuantity,
      totalCny,
    ]
  );

  return (
    <LimitedCartContext.Provider value={value}>
      {children}
      <LimitedProductCartOverlay />
    </LimitedCartContext.Provider>
  );
}

export function LimitedCartButton({
  accent = "#0D7A3E",
  label = "购物车",
  compact = false,
}: {
  accent?: string;
  label?: string;
  compact?: boolean;
}) {
  const { itemCount, openCart } = useLimitedProductCart();
  return (
    <button
      type="button"
      onClick={openCart}
      className={`relative flex items-center justify-center gap-1.5 rounded-xl active:scale-95 ${
        compact ? "h-10 w-10" : "h-14 min-w-14 flex-col"
      }`}
      style={{ background: `${accent}12`, color: accent }}
      aria-label={`${label}${itemCount ? `，${itemCount}件商品` : ""}`}
    >
      <ShoppingCart size={compact ? 19 : 20} strokeWidth={2.2} />
      {!compact && <span className="text-[10px] font-semibold">{label}</span>}
      {itemCount > 0 && (
        <span
          className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-extrabold text-white"
          style={{ background: accent }}
        >
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      )}
    </button>
  );
}

function formatAddress(address: any) {
  if (!address) return "";
  return `${address.province ?? ""}${
    address.city && address.city !== address.province ? address.city : ""
  }${address.district ?? ""}${address.detail ?? ""}`;
}

function UsdtPrimaryPrice({
  cnyAmount,
  usdtCnyRate,
  color = "#0D7A3E",
  mainClassName = "text-[16px] font-extrabold",
}: {
  cnyAmount: number;
  usdtCnyRate: number;
  color?: string;
  mainClassName?: string;
}) {
  return (
    <span className="flex min-w-0 max-w-full flex-col items-end break-all leading-none tabular-nums">
      <span className={mainClassName} style={{ color }}>
        {Number.isFinite(usdtCnyRate) && usdtCnyRate > 0
          ? cnyToU(cnyAmount, usdtCnyRate).toFixed(2)
          : "--"}
        <span className="ml-0.5 text-[9px] font-bold">USDT</span>
      </span>
      <span className="mt-1 text-[10px] font-medium text-gray-400">
        ≈ ¥{cnyAmount.toFixed(2)}
      </span>
    </span>
  );
}

function LimitedProductCartOverlay() {
  const {
    items,
    itemCount,
    totalCny,
    open,
    closeCart,
    setQuantity,
    removeItem,
    clearCart,
  } = useLimitedProductCart();
  const [location, navigate] = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [showAddressBook, setShowAddressBook] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const receiverPhoneError = selectedAddress
    ? getMibanReceiverPhoneError(selectedAddress.phone ?? "")
    : null;
  const [userNote, setUserNote] = useState("");
  const [success, setSuccess] = useState<CartCheckoutReceipt | null>(null);
  // 分组仅用于展示；提交仍发送整车原始商品，由服务端按精选生成独立订单。
  const groups = useMemo(() => {
    const grouped = new Map<
      string,
      {
        checkoutGroupKey: string;
        groupLabel: string;
        accent: string;
        items: LimitedCartItem[];
        totalCny: number;
        itemCount: number;
      }
    >();
    for (const item of items) {
      const key = item.checkoutGroupKey || item.productKey;
      let group = grouped.get(key);
      if (!group) {
        group = {
          checkoutGroupKey: key,
          groupLabel: item.groupLabel || "精选商品",
          accent: item.accent || "#0D7A3E",
          items: [],
          totalCny: 0,
          itemCount: 0,
        };
        grouped.set(key, group);
      }
      group.items.push(item);
      group.itemCount += item.quantity;
    }
    return [...grouped.values()].map(group => ({
      ...group,
      totalCny: cartTotalCny(group.items),
    }));
  }, [items]);
  // 只保存精选名/配色供旧回执展示；绝不由本地商品生成成功订单或支付金额。
  const submittedGroups = useRef(groups);
  const receiptOrders = useMemo(() => {
    if (!success) return [];
    if (Array.isArray(success.orders)) {
      return success.orders.filter(order => Boolean(order?.orderNo));
    }
    return success.orderNo ? [success] : [];
  }, [success]);
  const payment = useMibanMixedPayment(totalCny, open && isAuthenticated);
  const usdtCnyRate = payment.usdtCnyRate;
  const { data: addresses } = mtrpc.address.list.useQuery(undefined, {
    enabled: open && checkoutOpen && isAuthenticated,
  });
  const utils = trpc.useUtils();
  const mibanUtils = mtrpc.useUtils();
  const paymentInitialized = useRef(false);

  useEffect(() => {
    if (!open) {
      setCheckoutOpen(false);
      setShowAddressBook(false);
      setSuccess(null);
      paymentInitialized.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!checkoutOpen || selectedAddress || !addresses?.length) return;
    setSelectedAddress(
      addresses.find((address: any) => address.is_default === 1) ?? addresses[0]
    );
  }, [addresses, checkoutOpen, selectedAddress]);

  useEffect(() => {
    if (!addresses || !selectedAddress) return;
    const latest = addresses.find(
      (address: any) => address.id === selectedAddress.id
    );
    if (latest !== selectedAddress) setSelectedAddress(latest ?? null);
  }, [addresses, selectedAddress]);

  useEffect(() => {
    if (checkoutOpen && !paymentInitialized.current && payment.ready) {
      payment.resetToCnyFirst();
      paymentInitialized.current = true;
    }
  }, [checkoutOpen, payment.ready, payment.resetToCnyFirst]);

  useEffect(() => {
    if (items.length === 0 && checkoutOpen && !success) {
      setCheckoutOpen(false);
    }
  }, [checkoutOpen, items.length, success]);

  const createOrder = mtrpc.limitedProduct.createCartOrder.useMutation({
    onSuccess: (data: any) => {
      clearCart();
      utils.recharge.getBalance.invalidate();
      utils.recharge.getCnyBalance.invalidate();
      utils.recharge.getUsdtBalanceSummary.invalidate();
      utils.recharge.getCnyBalanceSummary.invalidate();
      utils.recharge.getMultiAssetBalances.invalidate();
      mibanUtils.order.walletPaymentQuote.invalidate();
      setSuccess(data);
    },
    onError: (error: { message?: string }) => {
      toast.error(formatMibanCheckoutError(error));
    },
  });

  const handleCheckout = () => {
    if (authLoading) return;
    if (!isAuthenticated) {
      closeCart();
      toast.message("请先登录后再结算购物车");
      navigate(`/login?from=${encodeURIComponent(location)}`);
      return;
    }
    paymentInitialized.current = false;
    setCheckoutOpen(true);
  };

  const handlePay = async () => {
    if (createOrder.isPending) return;
    if (!selectedAddress) {
      toast.error("请先选择收货地址");
      return;
    }
    if (receiverPhoneError) {
      toast.error(receiverPhoneError);
      return;
    }
    if (!payment.canPay) {
      toast.error(payment.statusMessage);
      return;
    }
    const preparedPayment = await payment.preparePayment();
    if (!preparedPayment) return;
    submittedGroups.current = groups;
    createOrder.mutate({
      items: items.map(item => ({
        productKey: item.productKey,
        skuId: item.skuId,
        quantity: item.quantity,
      })),
      receiverName: selectedAddress.name,
      receiverPhone: normalizeMibanReceiverPhone(selectedAddress.phone),
      receiverAddress: formatAddress(selectedAddress),
      userNote: userNote.trim() || undefined,
      cnyAmount: preparedPayment.cnyAmount,
      paymentAssets: preparedPayment.paymentAssets,
      paymentQuoteToken: preparedPayment.paymentQuoteToken,
    });
  };

  if (!open) return null;

  if (checkoutOpen) {
    return (
      <div className="fixed inset-0 z-[90] bg-white">
        <div className="mx-auto flex h-full w-full min-w-0 max-w-[480px] flex-col bg-white">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3.5">
            <button
              type="button"
              onClick={() => {
                if (createOrder.isPending) return;
                payment.cancelPendingPayment();
                if (success) {
                  setSuccess(null);
                  setCheckoutOpen(false);
                } else {
                  setCheckoutOpen(false);
                }
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600"
              aria-label="返回购物车"
            >
              <ChevronLeft size={21} />
            </button>
            <div className="text-[17px] font-extrabold text-gray-900">
              {success
                ? receiptOrders.length
                  ? "付款成功"
                  : "付款结果待核对"
                : "确认订单"}
            </div>
            <div className="w-9" />
          </div>

          {success ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center overflow-y-auto px-4 pb-8 pt-8 text-center">
              {receiptOrders.length > 0 && (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                  <CheckCircle2 size={34} />
                </div>
              )}
              <h2 className="mt-5 text-[21px] font-extrabold text-gray-900">
                {receiptOrders.length ? "统一付款成功" : "订单结果待核对"}
              </h2>
              <p className="mt-2 break-words text-[13px] leading-5 text-gray-500">
                {receiptOrders.length
                  ? `已生成 ${receiptOrders.length} 张订单，各精选订单分开发货，退款按各订单实际原币支付记录独立处理。`
                  : "服务端尚未返回有效订单编号，请在我的订单中核对，勿重复付款。"}
              </p>
              <div className="mt-5 w-full min-w-0 rounded-2xl bg-gray-50 p-4 text-left">
                {success.checkoutNo && (
                  <div className="flex min-w-0 items-start justify-between gap-3 text-[13px]">
                    <span className="shrink-0 text-gray-400">统一付款编号</span>
                    <span className="min-w-0 break-all text-right font-mono font-bold text-gray-900">
                      {success.checkoutNo}
                    </span>
                  </div>
                )}
                <div className="mt-3 flex min-w-0 items-start justify-between gap-3 text-[13px]">
                  <span className="shrink-0 text-gray-400">统一商品合计</span>
                  <span className="min-w-0 break-all text-right font-bold text-gray-900">
                    {receiptCny(success.totalCny)}
                  </span>
                </div>
                <div className="mt-3 flex min-w-0 items-start justify-between gap-3 text-[13px]">
                  <span className="shrink-0 text-gray-400">统一实际支付</span>
                  <span className="min-w-0 break-all text-right font-bold text-[#0D7A3E]">
                    {receiptPaymentSummary(success.walletPayments)}
                  </span>
                </div>
              </div>
              <div className="mt-3 w-full min-w-0 space-y-3 text-left">
                {receiptOrders.map(order => {
                  const group =
                    submittedGroups.current.find(
                      item => item.checkoutGroupKey === order.checkoutGroupKey
                    ) ??
                    (receiptOrders.length === 1 &&
                    submittedGroups.current.length === 1
                      ? submittedGroups.current[0]
                      : undefined);
                  return (
                    <section
                      key={order.orderNo}
                      aria-label={`子订单 ${order.orderNo}`}
                      className="min-w-0 rounded-2xl border border-gray-100 p-4"
                    >
                      <h3
                        className="break-words text-[14px] font-extrabold"
                        style={{ color: group?.accent || "#0D7A3E" }}
                      >
                        {order.groupLabel || group?.groupLabel || "精选订单"}
                      </h3>
                      <div className="mt-3 flex min-w-0 items-start justify-between gap-3 text-[12px]">
                        <span className="shrink-0 text-gray-400">订单编号</span>
                        <span className="min-w-0 break-all text-right font-mono font-bold text-gray-900">
                          {order.orderNo}
                        </span>
                      </div>
                      <div className="mt-2 flex min-w-0 items-start justify-between gap-3 text-[12px]">
                        <span className="shrink-0 text-gray-400">本组金额</span>
                        <span className="min-w-0 break-all text-right font-bold text-gray-900">
                          {receiptCny(order.totalCny)}
                        </span>
                      </div>
                      <div className="mt-2 flex min-w-0 items-start justify-between gap-3 text-[12px]">
                        <span className="shrink-0 text-gray-400">
                          实际原币支付
                        </span>
                        <span
                          className="min-w-0 break-all text-right font-bold"
                          style={{ color: group?.accent || "#0D7A3E" }}
                        >
                          {receiptPaymentSummary(order.walletPayments)}
                        </span>
                      </div>
                    </section>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  closeCart();
                  navigate("/p/proj_hzxm2t/my-orders");
                }}
                className="mt-6 min-h-13 w-full shrink-0 rounded-xl bg-[#0D7A3E] text-[15px] font-extrabold text-white"
              >
                查看我的订单
              </button>
              <button
                type="button"
                onClick={() => {
                  closeCart();
                  navigate("/p/proj_hzxm2t/limited");
                }}
                className="mt-3 text-[13px] font-semibold text-gray-500"
              >
                继续选购
              </button>
            </div>
          ) : (
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-[#F8F9F8] px-3 py-4 min-[375px]:px-4">
              <section className="min-w-0 rounded-2xl bg-white p-3 shadow-sm min-[375px]:p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[14px] font-extrabold text-gray-900">
                    商品清单
                  </div>
                  <span className="shrink-0 text-[11px] text-gray-400">
                    共 {itemCount} 件
                  </span>
                </div>
                <p
                  data-testid="confirmation-split-order-notice"
                  className="mb-3 break-words text-[11px] leading-5 text-gray-500"
                >
                  统一付款，按精选生成{groups.length}
                  张订单；共用一个收货地址，分开发货。
                </p>
                <div className="space-y-4">
                  {groups.map(group => (
                    <section
                      key={group.checkoutGroupKey}
                      data-testid={`confirmation-group-${group.checkoutGroupKey}`}
                      aria-label={`确认精选 ${group.groupLabel}`}
                      className="min-w-0 border-t border-gray-100 pt-3"
                    >
                      <div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-2">
                        <h3
                          className="min-w-0 flex-1 break-words text-[13px] font-extrabold"
                          style={{ color: group.accent }}
                        >
                          {group.groupLabel}
                        </h3>
                        <div className="flex min-w-0 max-w-full items-start gap-1.5 text-[10px] text-gray-400">
                          <span className="shrink-0">
                            小计 · {group.itemCount}件
                          </span>
                          <UsdtPrimaryPrice
                            cnyAmount={group.totalCny}
                            usdtCnyRate={usdtCnyRate}
                            color={group.accent}
                            mainClassName="text-[13px] font-extrabold"
                          />
                        </div>
                      </div>
                      <div className="space-y-3">
                        {group.items.map(item => (
                          <div
                            key={cartKey(item)}
                            className="flex min-w-0 items-start gap-2"
                          >
                            <MibanImage variant="thumbnail"
                              src={item.image}
                              alt=""
                              className="h-11 w-11 shrink-0 rounded-lg border border-gray-100 object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-[12px] font-bold text-gray-800">
                                {item.productName}
                              </p>
                              <p className="mt-0.5 break-words text-[11px] text-gray-400">
                                {item.skuName} · ×{item.quantity}
                                {item.unitLabel}
                              </p>
                              <div className="mt-2 flex justify-end">
                                <UsdtPrimaryPrice
                                  cnyAmount={item.priceCny * item.quantity}
                                  usdtCnyRate={usdtCnyRate}
                                  color={item.accent}
                                  mainClassName="text-[13px] font-extrabold"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </section>

              <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[14px] font-extrabold text-gray-900">
                    收货地址
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddressBook(true)}
                    className="text-[12px] font-bold text-[#0D7A3E]"
                  >
                    {selectedAddress ? "更换" : "选择"}
                  </button>
                </div>
                {selectedAddress ? (
                  <button
                    type="button"
                    onClick={() => setShowAddressBook(true)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#0D7A3E]" />
                      <div className="min-w-0 flex-1">
                        <p className="break-all text-[13px] font-bold text-gray-800">
                          {selectedAddress.name}{" "}
                          <span className="ml-1 font-normal text-gray-500">
                            {selectedAddress.phone}
                          </span>
                        </p>
                        <p className="mt-1 break-words text-[12px] leading-5 text-gray-500">
                          {formatAddress(selectedAddress)}
                        </p>
                      </div>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddressBook(true)}
                    className="flex w-full items-center justify-between rounded-xl bg-gray-50 px-3 py-3 text-[12px] text-gray-400"
                  >
                    <span>请选择或新增收货地址</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
                {receiverPhoneError && (
                  <div role="alert" className="mt-2 text-[12px] text-red-500">
                    <p>{receiverPhoneError}</p>
                    <button
                      type="button"
                      onClick={() => setShowAddressBook(true)}
                      className="mt-1 font-semibold underline"
                    >
                      编辑收货地址
                    </button>
                  </div>
                )}
                <div className="mt-4 border-t border-gray-100 pt-3">
                  <label className="text-[12px] font-bold text-gray-600">
                    顾客备注{" "}
                    <span className="font-normal text-gray-400">（选填）</span>
                  </label>
                  <textarea
                    value={userNote}
                    onChange={event =>
                      setUserNote(event.target.value.slice(0, 500))
                    }
                    placeholder="如有配送或商品备注请填写"
                    maxLength={500}
                    className="mt-2 min-h-18 w-full resize-none rounded-xl bg-gray-50 p-3 text-[13px] outline-none"
                  />
                </div>
              </section>

              <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
                <MibanMixedPaymentAllocation
                  payment={payment}
                  disabled={createOrder.isPending}
                  accent="#0D7A3E"
                />
              </div>
            </div>
          )}

          {!success && (
            <div
              className="min-w-0 shrink-0 border-t border-gray-100 bg-white px-4 py-3"
              style={{
                paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
              }}
            >
              <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2 text-[12px] text-gray-500">
                <span className="shrink-0">合计 {itemCount} 件</span>
                <span className="flex min-w-0 max-w-full items-center gap-1">
                  <span className="shrink-0">统一应付</span>
                  <UsdtPrimaryPrice
                    cnyAmount={totalCny}
                    usdtCnyRate={usdtCnyRate}
                    mainClassName="text-[20px] font-extrabold"
                  />
                </span>
              </div>
              <button
                type="button"
                onClick={handlePay}
                disabled={!payment.canPay || createOrder.isPending}
                className="flex min-h-13 w-full items-center justify-center break-all rounded-xl bg-[#0D7A3E] px-3 py-3 text-[13px] font-extrabold text-white disabled:bg-gray-300"
              >
                {createOrder.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在提交订单…
                  </>
                ) : (
                  `确认支付（${payment.paymentSummary.replace(" U", " USDT")}）`
                )}
              </button>
            </div>
          )}

          {showAddressBook && !success && (
            <div className="fixed inset-0 z-[100] bg-white">
              <div className="mx-auto h-full w-full max-w-[480px] overflow-y-auto px-4 pb-10 pt-4">
                <div className="mb-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowAddressBook(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600"
                  >
                    <ChevronLeft size={21} />
                  </button>
                  <div className="text-[16px] font-extrabold text-gray-900">
                    选择收货地址
                  </div>
                  <div className="w-9" />
                </div>
                <AddressBook
                  mode="select"
                  onSelect={address => {
                    setSelectedAddress(address);
                    setShowAddressBook(false);
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40"
      onClick={closeCart}
    >
      <section
        className="max-h-[82vh] w-full min-w-0 max-w-[480px] rounded-t-3xl bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex min-w-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-extrabold text-gray-900">
              精选购物车
            </h2>
            <p
              data-testid="cart-split-order-notice"
              className="mt-0.5 break-words text-[11px] leading-5 text-gray-400"
            >
              不同精选可一起买单，统一付款后按精选生成独立订单、分开发货。
            </p>
          </div>
          <button
            type="button"
            onClick={closeCart}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500"
            aria-label="关闭购物车"
          >
            <X size={18} />
          </button>
        </div>
        {items.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center px-5 text-center">
            <ShoppingCart className="h-10 w-10 text-gray-200" />
            <p className="mt-3 text-[14px] font-semibold text-gray-500">
              购物车还是空的
            </p>
            <p className="mt-1 text-[12px] text-gray-400">
              在商品详情选择规格后即可加入购物车
            </p>
          </div>
        ) : (
          <>
            <div className="max-h-[50vh] min-w-0 space-y-4 overflow-y-auto px-3 py-4 min-[375px]:px-4">
              {groups.map(group => (
                <section
                  key={group.checkoutGroupKey}
                  data-testid={`cart-group-${group.checkoutGroupKey}`}
                  aria-label={`购物车精选 ${group.groupLabel}`}
                  className="min-w-0 space-y-2"
                >
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2 px-1">
                    <h3
                      className="min-w-0 flex-1 break-words text-[13px] font-extrabold"
                      style={{ color: group.accent }}
                    >
                      {group.groupLabel}
                    </h3>
                    <div className="flex min-w-0 max-w-full items-start gap-1.5 text-[10px] text-gray-400">
                      <span className="shrink-0">
                        小计 · {group.itemCount}件
                      </span>
                      <UsdtPrimaryPrice
                        cnyAmount={group.totalCny}
                        usdtCnyRate={usdtCnyRate}
                        color={group.accent}
                        mainClassName="text-[13px] font-extrabold"
                      />
                    </div>
                  </div>
                  {group.items.map(item => (
                    <div
                      key={cartKey(item)}
                      className="flex min-w-0 gap-2 rounded-2xl border border-gray-100 p-2.5 min-[375px]:gap-3 min-[375px]:p-3"
                    >
                      <MibanImage variant="thumbnail"
                        src={item.image}
                        alt={item.productName}
                        className="h-14 w-14 shrink-0 rounded-xl bg-gray-50 object-cover min-[390px]:h-18 min-[390px]:w-18"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-[13px] font-bold text-gray-800">
                              {item.productName}
                            </p>
                            <p className="mt-0.5 break-words text-[11px] text-gray-400">
                              {item.skuName} · {item.netContentText}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label={`移除 ${item.productName} ${item.skuName}`}
                            onClick={() => removeItem(cartKey(item))}
                            className="shrink-0 p-1 text-gray-300"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <div className="mt-3 flex min-w-0 flex-wrap items-end justify-between gap-2">
                          <UsdtPrimaryPrice
                            cnyAmount={item.priceCny}
                            usdtCnyRate={usdtCnyRate}
                            color={item.accent}
                            mainClassName="text-[14px] font-extrabold"
                          />
                          <div className="ml-auto flex h-8 shrink-0 items-center rounded-lg border border-gray-200">
                            <button
                              type="button"
                              aria-label={`减少 ${item.skuName} 数量`}
                              onClick={() =>
                                setQuantity(cartKey(item), item.quantity - 1)
                              }
                              className="flex h-full w-8 items-center justify-center text-gray-500"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="w-8 text-center text-[13px] font-bold text-gray-800">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label={`增加 ${item.skuName} 数量`}
                              disabled={item.quantity >= item.maxPurchaseQty}
                              onClick={() =>
                                setQuantity(cartKey(item), item.quantity + 1)
                              }
                              className="flex h-full w-8 items-center justify-center text-gray-700 disabled:text-gray-200"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </section>
              ))}
            </div>
            <div
              className="border-t border-gray-100 px-4 py-3"
              style={{
                paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
              }}
            >
              <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    clearCart();
                    toast.success("购物车已清空");
                  }}
                  className="text-[12px] text-gray-400"
                >
                  清空购物车
                </button>
                <span className="flex min-w-0 max-w-full items-center gap-1 text-[12px] text-gray-500">
                  <span className="shrink-0">共 {itemCount} 件 · 合计</span>
                  <UsdtPrimaryPrice
                    cnyAmount={totalCny}
                    usdtCnyRate={usdtCnyRate}
                    mainClassName="text-[20px] font-extrabold"
                  />
                </span>
              </div>
              <button
                type="button"
                onClick={handleCheckout}
                className="h-13 w-full rounded-xl bg-[#0D7A3E] text-[15px] font-extrabold text-white"
              >
                统一买单
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
