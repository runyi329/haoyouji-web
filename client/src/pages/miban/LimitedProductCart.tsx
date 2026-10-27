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
import {
  MibanMixedPaymentAllocation,
  useMibanMixedPayment,
} from "./MibanMixedPayment";

const STORAGE_KEY = "miban-limited-product-cart-v1";

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

function readStoredCart(): LimitedCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: any) =>
        item &&
        typeof item.productKey === "string" &&
        typeof item.skuId === "string" &&
        Number.isInteger(Number(item.quantity)) &&
        Number(item.quantity) > 0 &&
        Number(item.priceCny) >= 0
    );
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
  const totalCny = useMemo(
    () =>
      Number(
        items
          .reduce((sum, item) => sum + item.priceCny * item.quantity, 0)
          .toFixed(2)
      ),
    [items]
  );

  const addItem = useCallback(
    (nextItem: AddCartItem) => {
      const quantity = Math.max(
        1,
        Math.min(nextItem.quantity ?? 1, nextItem.maxPurchaseQty)
      );
      if (
        items.length > 0 &&
        items[0].checkoutGroupKey !== nextItem.checkoutGroupKey
      ) {
        toast.error(
          `购物车已有${items[0].groupLabel}商品，请先结算或清空后再切换系列`
        );
        return false;
      }
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
    },
    [items]
  );

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
  const [userNote, setUserNote] = useState("");
  const [success, setSuccess] = useState<any>(null);
  const payment = useMibanMixedPayment(
    totalCny,
    open && checkoutOpen && isAuthenticated
  );
  const { data: addresses } = mtrpc.address.list.useQuery(undefined, {
    enabled: open && checkoutOpen && isAuthenticated,
  });
  const utils = trpc.useUtils();
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
    if (checkoutOpen && !paymentInitialized.current && payment.cnyBalance > 0) {
      payment.resetToCnyFirst();
      paymentInitialized.current = true;
    }
  }, [checkoutOpen, payment]);

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
      setSuccess(data);
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "提交订单失败，请稍后再试");
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

  const handlePay = () => {
    if (!selectedAddress) {
      toast.error("请先选择收货地址");
      return;
    }
    if (!payment.canPay) {
      toast.error("钱包余额不足，请调整支付金额或充值后重试");
      return;
    }
    createOrder.mutate({
      items: items.map(item => ({
        productKey: item.productKey,
        skuId: item.skuId,
        quantity: item.quantity,
      })),
      receiverName: selectedAddress.name,
      receiverPhone: selectedAddress.phone,
      receiverAddress: formatAddress(selectedAddress),
      userNote: userNote.trim() || undefined,
      cnyAmount: payment.cnyAmount,
    });
  };

  if (!open) return null;

  if (checkoutOpen) {
    return (
      <div className="fixed inset-0 z-[90] bg-white">
        <div className="mx-auto flex h-full w-full max-w-[480px] flex-col bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3.5">
            <button
              type="button"
              onClick={() => {
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
              {success ? "订单已确认" : "确认订单"}
            </div>
            <div className="w-9" />
          </div>

          {success ? (
            <div className="flex flex-1 flex-col items-center px-5 pt-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                <CheckCircle2 size={34} />
              </div>
              <h2 className="mt-5 text-[21px] font-extrabold text-gray-900">
                订单提交成功
              </h2>
              <p className="mt-2 text-[13px] text-gray-500">
                工作人员将核对订单并安排后续发货
              </p>
              <div className="mt-7 w-full rounded-2xl bg-gray-50 p-4 text-left">
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-gray-400">订单编号</span>
                  <span className="font-mono font-bold text-gray-900">
                    {success.orderNo}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-gray-400">商品合计</span>
                  <span className="font-bold text-gray-900">
                    ¥{Number(success.totalCny).toFixed(2)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-gray-400">实际支付</span>
                  <span className="font-bold text-[#0D7A3E]">
                    {Number(success.deductCny) > 0
                      ? `¥${Number(success.deductCny).toFixed(2)}`
                      : ""}
                    {Number(success.deductCny) > 0 &&
                    Number(success.deductUsdt) > 0
                      ? " + "
                      : ""}
                    {Number(success.deductUsdt) > 0
                      ? `${Number(success.deductUsdt).toFixed(2)} USDT`
                      : ""}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  closeCart();
                  navigate("/p/proj_hzxm2t/my-orders");
                }}
                className="mt-7 h-13 w-full rounded-xl bg-[#0D7A3E] text-[15px] font-extrabold text-white"
              >
                查看我的订单
              </button>
              <button
                type="button"
                onClick={() => {
                  closeCart();
                  navigate("/p/proj_hzxm2t/limited/herbalife");
                }}
                className="mt-3 text-[13px] font-semibold text-gray-500"
              >
                继续选购
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto bg-[#F8F9F8] px-4 py-4 pb-32">
              <section className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-[14px] font-extrabold text-gray-900">
                    商品清单
                  </div>
                  <span className="text-[11px] text-gray-400">
                    共 {itemCount} 件
                  </span>
                </div>
                <div className="space-y-3">
                  {items.map(item => (
                    <div
                      key={cartKey(item)}
                      className="flex items-center gap-3"
                    >
                      <img
                        src={item.image}
                        alt=""
                        className="h-12 w-12 rounded-lg border border-gray-100 object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-bold text-gray-800">
                          {item.productName}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {item.skuName} · ×{item.quantity}
                          {item.unitLabel}
                        </p>
                      </div>
                      <span className="text-[13px] font-extrabold text-[#0D7A3E]">
                        ¥{(item.priceCny * item.quantity).toFixed(2)}
                      </span>
                    </div>
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
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-gray-800">
                          {selectedAddress.name}{" "}
                          <span className="ml-1 font-normal text-gray-500">
                            {selectedAddress.phone}
                          </span>
                        </p>
                        <p className="mt-1 text-[12px] leading-5 text-gray-500">
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
              </section>

              <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm">
                <label className="text-[14px] font-extrabold text-gray-900">
                  订单备注{" "}
                  <span className="font-normal text-gray-400">（选填）</span>
                </label>
                <textarea
                  value={userNote}
                  onChange={event =>
                    setUserNote(event.target.value.slice(0, 500))
                  }
                  placeholder="如有配送或商品备注请填写"
                  className="mt-3 min-h-18 w-full resize-none rounded-xl bg-gray-50 p-3 text-[13px] outline-none"
                />
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
              className="border-t border-gray-100 bg-white px-4 py-3"
              style={{
                paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
              }}
            >
              <div className="mb-2 flex items-center justify-between text-[12px] text-gray-500">
                <span>合计 {itemCount} 件</span>
                <span>
                  应付{" "}
                  <b className="ml-1 text-[20px] text-[#0D7A3E]">
                    ¥{totalCny.toFixed(2)}
                  </b>
                </span>
              </div>
              <button
                type="button"
                onClick={handlePay}
                disabled={
                  !selectedAddress || !payment.canPay || createOrder.isPending
                }
                className="flex h-13 w-full items-center justify-center rounded-xl bg-[#0D7A3E] text-[15px] font-extrabold text-white disabled:bg-gray-300"
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
        className="max-h-[82vh] w-full max-w-[480px] rounded-t-3xl bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-[18px] font-extrabold text-gray-900">
              精选购物车
            </h2>
            <p className="mt-0.5 text-[11px] text-gray-400">
              同一精选系列商品可合并为一张订单
            </p>
          </div>
          <button
            type="button"
            onClick={closeCart}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500"
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
            <div className="max-h-[50vh] space-y-3 overflow-y-auto px-4 py-4">
              {items.map(item => (
                <div
                  key={cartKey(item)}
                  className="flex gap-3 rounded-2xl border border-gray-100 p-3"
                >
                  <img
                    src={item.image}
                    alt={item.productName}
                    className="h-18 w-18 shrink-0 rounded-xl bg-gray-50 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold text-gray-800">
                          {item.productName}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-gray-400">
                          {item.skuName} · {item.netContentText}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(cartKey(item))}
                        className="p-1 text-gray-300"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <span
                        className="text-[16px] font-extrabold"
                        style={{ color: item.accent }}
                      >
                        ¥{item.priceCny.toFixed(2)}
                      </span>
                      <div className="flex h-8 items-center rounded-lg border border-gray-200">
                        <button
                          type="button"
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
            </div>
            <div
              className="border-t border-gray-100 px-4 py-3"
              style={{
                paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
              }}
            >
              <div className="mb-2 flex items-center justify-between">
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
                <span className="text-[12px] text-gray-500">
                  共 {itemCount} 件 · 合计{" "}
                  <b className="ml-1 text-[20px] text-[#0D7A3E]">
                    ¥{totalCny.toFixed(2)}
                  </b>
                </span>
              </div>
              <button
                type="button"
                onClick={handleCheckout}
                className="h-13 w-full rounded-xl bg-[#0D7A3E] text-[15px] font-extrabold text-white"
              >
                一键买单
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
