// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import { ShoppingCart, X, Trash2, ChevronRight, Package, Heart, Check, MapPin, Phone, User, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { mtrpc } from "./mibanTrpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { MibanPaymentConfirmation, MibanWalletAvailableSummary, useMibanMixedPayment } from "./MibanMixedPayment";
import MibanInvoiceRequestForm, { createMibanInvoiceDraft, validateMibanInvoiceRequest, MIBAN_INVOICE_UNAVAILABLE_NOTICE, type MibanInvoiceDraft, type MibanInvoiceErrors } from "./MibanInvoiceRequestForm";
import { MibanCheckoutConfirmationDetails } from "./MibanCheckoutConfirmationDetails";
import { normalizeMibanReceiverPhone, getMibanReceiverPhoneError, formatMibanCheckoutError } from "../../../../shared/miban-shipping";
import { formatMibanPaymentSummary, type MibanPaymentDeduction } from "../../../../shared/miban-wallet-payment";

function getSessionId() {
  const key = "miban_session_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(key, id);
  }
  return id;
}

// 按 recipeId/recipeName 分组
function groupItems(items: CartItem[]) {
  const groups: Record<string, CartItem[]> = {};
  for (const item of items) {
    const key = item.recipeId ?? item.recipeName ?? "自定义配方";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return Object.entries(groups);
}

type CartItem = {
  id: number;
  riceId: string;
  riceName: string;
  weightJin: string;
  pricePerJin: string;
  ratio: number;
  recipeId: string | null;
  recipeName: string | null;
};

export default function CartDrawer() {
  const [open, setOpen] = useState(false);
  const [sessionId] = useState(() => getSessionId());
  const [savedGroups, setSavedGroups] = useState<Set<string>>(new Set());
  const { isAuthenticated } = useAuth();
  // 下单弹窗相关状态
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{ orderId: number; price: number; deductCny: number; deductUsdt: number; walletPayments: MibanPaymentDeduction[] } | null>(null);
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [checkoutAttempted, setCheckoutAttempted] = useState(false);
  const receiverPhoneError = getMibanReceiverPhoneError(receiverPhone);
  const [receiverAddress, setReceiverAddress] = useState("");
  const [userNote, setUserNote] = useState("");
  const [pendingPrice, setPendingPrice] = useState(0);
  const [showWalletPayment, setShowWalletPayment] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState<MibanInvoiceDraft>(createMibanInvoiceDraft);
  const [invoiceErrors, setInvoiceErrors] = useState<MibanInvoiceErrors>({});
  const [preparingPayment, setPreparingPayment] = useState(false);
  const submitGuard = useRef(false);
  const paymentAttemptRef = useRef(0);
  const mountedRef = useRef(true);
  const walletOpenRef = useRef(false);

  const trpcUtils = trpc.useUtils();
  const mibanUtils = mtrpc.useUtils();
  // 下单 mutation
  const createOrder = mtrpc.order.create.useMutation({
    onSuccess: (result: any) => {
      setOrderSuccess({ orderId: Number(result?.orderId ?? result), price: pendingPrice, deductCny: Number(result?.deductCny ?? 0), deductUsdt: Number(result?.deductUsdt ?? 0), walletPayments: result?.walletPayments ?? [] });
      setShowOrderDialog(false);
      walletOpenRef.current = false;
      setShowWalletPayment(false);
      cartList.refetch();
      // 下单扣款后立即刷新余额显示
      trpcUtils.recharge.getBalance.invalidate();
      trpcUtils.recharge.getCnyBalance.invalidate();
      trpcUtils.recharge.getUsdtBalanceSummary.invalidate();
      trpcUtils.recharge.getCnyBalanceSummary.invalidate();
      trpcUtils.recharge.getMultiAssetBalances.invalidate();
      mibanUtils.order.walletPaymentQuote.invalidate();
    },
    onError: (err: any) => {
      const msg = formatMibanCheckoutError(err, "下单失败，请稍后再试");
      if (msg.includes("余额不足") || msg.includes("PAYMENT_REQUIRED")) {
        toast.error("余额不足，请先充值", {
          description: msg.slice(0, 80),
          action: { label: "去充值", onClick: () => { window.location.href = "/recharge"; } },
        });
      } else {
        toast.error(msg.slice(0, 60));
      }
    },
    onSettled: () => { submitGuard.current = false; },
  });
  const cartList = mtrpc.cart.list.useQuery(
    { sessionId },
    { refetchOnWindowFocus: true, refetchInterval: open ? 5000 : false }
  );
  const removeItem = mtrpc.cart.remove.useMutation({
    onSuccess: () => cartList.refetch(),
  });
  const clearCart = mtrpc.cart.clear.useMutation({
    onSuccess: () => cartList.refetch(),
  });
  const saveRecipe = mtrpc.savedRecipes.save.useMutation({
    onSuccess: (_, variables) => {
      setSavedGroups(prev => new Set(Array.from(prev).concat(variables.recipeName)));
    },
  });

  const items = cartList.data ?? [];
  const cartCount = items.length;

  // 计算总价
  const totalPrice = items.reduce((sum, item) => {
    return sum + Number(item.weightJin) * Number(item.pricePerJin);
  }, 0);
  const walletPayment = useMibanMixedPayment(totalPrice, isAuthenticated);

  // 计算总重量
  const totalWeight = items.reduce((sum, item) => sum + Number(item.weightJin), 0);

  const groups = groupItems(items);
  const checkoutBusy = createOrder.isPending || preparingPayment;
  // 钱包版本只包含用户所选币种/上限/实际币量；preparePayment内部更新签名不改变结算范围。
  const walletVersion = JSON.stringify([walletPayment.selectedCodes, walletPayment.priorityCode, walletPayment.cnyInput, walletPayment.paymentAssets]);
  const checkoutInputScope = JSON.stringify([showOrderDialog, isAuthenticated, sessionId, items, totalPrice, totalWeight, receiverName, receiverPhone, receiverAddress, userNote, invoiceDraft]);
  const checkoutScope = JSON.stringify([checkoutInputScope, walletVersion]);
  const latestCheckoutScope = useRef(checkoutScope);
  latestCheckoutScope.current = checkoutScope;

  const cancelWalletPayment = () => {
    if (createOrder.isPending) return;
    paymentAttemptRef.current++;
    walletOpenRef.current = false;
    submitGuard.current = false;
    walletPayment.cancelPendingPayment();
    setPreparingPayment(false);
    setShowWalletPayment(false);
  };
  const closeOrderDialog = () => {
    if (createOrder.isPending) return;
    cancelWalletPayment();
    setShowOrderDialog(false);
  };

  useEffect(() => {
    // 只作废已打开的付款/异步核验；普通确认页编辑不能锁住当前钱包快照。
    if (!createOrder.isPending && (walletOpenRef.current || submitGuard.current)) cancelWalletPayment();
  }, [checkoutInputScope]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      walletOpenRef.current = false;
      paymentAttemptRef.current++;
      walletPayment.cancelPendingPayment();
    };
  }, [walletPayment.cancelPendingPayment]);

  const validateCheckout = () => {
    setCheckoutAttempted(true);
    const message = receiverPhoneError || (!receiverName.trim() ? "请填写收货人姓名" : !receiverAddress.trim() ? "请补全收货地址后再付款" : !items.length ? "购物车已为空" : null);
    if (message) { toast.error(message); return null; }
    const invoice = validateMibanInvoiceRequest(invoiceDraft);
    setInvoiceErrors(invoice.success ? {} : invoice.errors);
    if (!invoice.success) { toast.error(invoice.message); return null; }
    return invoice;
  };
  const handleOpenWalletPayment = () => {
    if (checkoutBusy || submitGuard.current || !showOrderDialog || !isAuthenticated) return;
    if (!validateCheckout()) return;
    if (!walletPayment.canPay) { toast.error(walletPayment.statusMessage); return; }
    walletOpenRef.current = true;
    setShowWalletPayment(true);
  };
  const handleConfirmWalletPayment = async () => {
    if (checkoutBusy || submitGuard.current || !walletOpenRef.current || !showOrderDialog || !isAuthenticated || !walletPayment.canPay) return;
    const invoice = validateCheckout();
    if (!invoice) { cancelWalletPayment(); return; }
    const attempt = ++paymentAttemptRef.current;
    const scope = checkoutScope;
    const stillCurrent = () => mountedRef.current && walletOpenRef.current && submitGuard.current && attempt === paymentAttemptRef.current && scope === latestCheckoutScope.current;
    submitGuard.current = true;
    setPreparingPayment(true);
    let submitted = false;
    try {
      if (invoiceDraft.enabled) {
        let support: unknown;
        try {
          support = await mibanUtils.limitedProduct.invoiceSupport.fetch(undefined, { staleTime: 0, retry: false });
        } catch {
          if (stillCurrent()) toast.info(MIBAN_INVOICE_UNAVAILABLE_NOTICE);
          return;
        }
        if (!stillCurrent()) return;
        const capability = support as { supported?: unknown; version?: unknown } | null;
        if (capability?.supported !== true || typeof capability.version !== "number" || !Number.isFinite(capability.version) || capability.version < 1) {
          toast.info(MIBAN_INVOICE_UNAVAILABLE_NOTICE);
          return;
        }
      }
      const preparedPayment = await walletPayment.preparePayment();
      if (!preparedPayment || !stillCurrent()) return;
      setPendingPrice(totalPrice);
      // 将购物车全部商品合并为一个订单，保持原有配米及库存契约。
      const allIngredients = items.map((item) => {
        const numId = item.riceId.startsWith("db_") ? parseInt(item.riceId.slice(3), 10) : 0;
        return { riceId: numId, name: item.riceName, percentage: item.ratio, colorHex: "#C8A87A", weightJin: Number(item.weightJin) };
      });
      createOrder.mutate({
        recipeName: items[0]?.recipeName ?? "购物车订单",
        ingredients: allIngredients,
        totalWeightJin: totalWeight,
        totalPrice,
        receiverName: receiverName.trim(),
        receiverPhone: normalizeMibanReceiverPhone(receiverPhone),
        receiverAddress: receiverAddress.trim(),
        userNote: userNote.trim() || undefined,
        ...(invoice.invoiceRequest ? { invoiceRequest: invoice.invoiceRequest } : {}),
        cnyAmount: preparedPayment.cnyAmount,
        paymentAssets: preparedPayment.paymentAssets,
        paymentQuoteToken: preparedPayment.paymentQuoteToken,
      });
      submitted = true;
    } catch (error) {
      if (stillCurrent()) toast.error(formatMibanCheckoutError(error));
    } finally {
      if (attempt === paymentAttemptRef.current) {
        if (!submitted) submitGuard.current = false;
        if (mountedRef.current) setPreparingPayment(false);
      }
    }
  };

  return (
    <>
      {/* ─── 购物车图标按钮 ─────────────────────────────────────── */}
      <button
        onClick={() => setOpen(true)}
        className="relative w-8 h-8 flex items-center justify-center active:opacity-70"
        aria-label="购物车"
      >
        <ShoppingCart className="w-5 h-5 text-black" strokeWidth={1.8} />
        {cartCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full text-[10px] font-bold text-white flex items-center justify-center px-0.5"
            style={{ background: "#FF6900" }}
          >
            {cartCount > 99 ? "99+" : cartCount}
          </span>
        )}
      </button>

      {/* ─── 遮罩 ───────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/40"
          style={{ backdropFilter: "blur(2px)" }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* ─── 侧边抽屉 ───────────────────────────────────────────── */}
      <div
        className="fixed top-0 right-0 bottom-0 z-[70] flex flex-col bg-white shadow-2xl"
        style={{
          width: "min(360px, 92vw)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s cubic-bezier(0.23,1,0.32,1)",
        }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/8">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-[#FF6900]" />
            <span className="text-[16px] font-bold text-black">购物车</span>
            {cartCount > 0 && (
              <span className="text-[12px] text-gray-400">{cartCount} 件</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {cartCount > 0 && (
              <button
                onClick={() => clearCart.mutate({ sessionId })}
                disabled={clearCart.isPending}
                className="text-[12px] text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                清空
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-full bg-black/5 flex items-center justify-center active:scale-95 transition-transform"
            >
              <X className="w-4 h-4 text-black/60" />
            </button>
          </div>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto">
          {cartList.isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-[#FF6900] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : cartCount === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center">
                <Package className="w-8 h-8 text-orange-200" />
              </div>
              <p className="text-[14px] text-gray-400">购物车还是空的</p>
              <button
                onClick={() => { setOpen(false); window.location.href = "/p/proj_hzxm2t/diy"; }}
                className="text-[13px] text-[#FF6900] font-medium flex items-center gap-1"
              >
                去配米 <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="px-4 py-3 space-y-4">
              {groups.map(([groupKey, groupItems]) => {
                const groupName = groupItems[0]?.recipeName ?? "自定义配方";
                const groupWeight = groupItems.reduce((s, i) => s + Number(i.weightJin), 0);
                const groupPrice = groupItems.reduce((s, i) => s + Number(i.weightJin) * Number(i.pricePerJin), 0);
                return (
                  <div key={groupKey} className="bg-gray-50 rounded-2xl overflow-hidden">
                    {/* 配方标题 */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-black/5">
                      <div>
                        <span className="text-[13px] font-semibold text-black">{groupName}</span>
                        <span className="text-[11px] text-gray-400 ml-2">{groupWeight.toFixed(1)}斤 · ¥{groupPrice.toFixed(1)}</span>
                      </div>
                      {/* 收藏按钮 */}
                      <button
                        onClick={() => {
                          if (!isAuthenticated) { window.location.href = "/login"; return; }
                          if (savedGroups.has(groupName)) return;
                          saveRecipe.mutate({
                            recipeName: groupName,
                            purpose: "rice",
                            preferences: [],
                            items: groupItems.map(i => ({
                              riceId: i.riceId,
                              riceName: i.riceName,
                              ratio: i.ratio,
                              pricePerJin: i.pricePerJin,
                            })),
                          });
                        }}
                        disabled={saveRecipe.isPending}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all active:scale-95"
                        style={{
                          background: savedGroups.has(groupName) ? "#FFF3E8" : "#F5F5F5",
                          color: savedGroups.has(groupName) ? "#FF6900" : "#888",
                        }}
                      >
                        {savedGroups.has(groupName)
                          ? <><Check className="w-3 h-3" />已收藏</>
                          : <><Heart className="w-3 h-3" />收藏</>
                        }
                      </button>
                    </div>
                    {/* 米种列表 */}
                    <div className="divide-y divide-black/5">
                      {groupItems.map((item) => (
                        <div key={item.id} className="flex items-center px-4 py-2.5 gap-3">
                          {/* 米种色块 */}
                          <div
                            className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
                            style={{ background: getRiceColor(item.riceId) }}
                          >
                            {item.riceName.slice(0, 1)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-black">{item.riceName}</p>
                            <p className="text-[11px] text-gray-400">
                              {Number(item.weightJin).toFixed(1)}斤 · ¥{Number(item.pricePerJin).toFixed(1)}/斤
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[13px] font-semibold text-black">
                              ¥{(Number(item.weightJin) * Number(item.pricePerJin)).toFixed(1)}
                            </p>
                            <p className="text-[10px] text-[#FF6900]">{item.ratio}%</p>
                          </div>
                          <button
                            onClick={() => removeItem.mutate({ id: item.id })}
                            disabled={removeItem.isPending}
                            className="w-6 h-6 rounded-full bg-black/5 flex items-center justify-center active:scale-95 transition-transform ml-1 flex-shrink-0"
                          >
                            <X className="w-3 h-3 text-black/40" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部结算栏 */}
        {cartCount > 0 && (
          <div className="border-t border-black/8 px-5 py-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-[12px] text-gray-400">共 {cartCount} 件 · {totalWeight.toFixed(1)}斤</span>
              </div>
              <div className="text-right">
                <span className="text-[12px] text-gray-400">合计 </span>
                <span className="text-[18px] font-bold text-black">¥{totalPrice.toFixed(1)}</span>
              </div>
            </div>
            <button
              onClick={() => {
                if (!isAuthenticated) {
                  window.location.href = "/login";
                  return;
                }
                walletPayment.resetToCnyFirst();
                setInvoiceDraft(createMibanInvoiceDraft());
                setInvoiceErrors({});
                setCheckoutAttempted(false);
                setShowOrderDialog(true);
              }}
              className="w-full py-3.5 rounded-2xl text-[15px] font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              style={{ background: "#FF6900" }}
            >
              立即下单 <ChevronRight className="w-4 h-4" />
            </button>
            {!isAuthenticated && (
              <p className="text-center text-[11px] text-gray-400 mt-2">登录后可保存配方并下单</p>
            )}
          </div>
        )}
      </div>

      {/* ─── 下单弹窗 ─────────────────────────────────────────── */}
      {showOrderDialog && !showWalletPayment && (
        <div data-miban-checkout="true" role="dialog" aria-modal="true" aria-label="确认订单" className="fixed inset-0 bg-black/60 z-[80] flex items-end" onClick={closeOrderDialog}>
          <div className="w-full bg-white rounded-t-3xl p-6 pb-10 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <span className="text-[17px] font-bold text-black">确认订单</span>
              <button aria-label="关闭确认订单" onClick={closeOrderDialog} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            {/* 订单摘要 */}
            <div className="bg-orange-50 rounded-2xl p-4 mb-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] text-gray-600">购物车内 {items.length} 件商品</span>
                <span className="text-[13px] font-bold text-[#FF6900]">{totalWeight.toFixed(1)}斤</span>
              </div>
              <div className="flex items-center justify-between border-t border-orange-100 pt-2">
                <span className="text-[12px] text-gray-500">应付金额</span>
                <span className="text-[20px] font-bold text-black">¥{totalPrice.toFixed(2)}</span>
              </div>
            </div>
            <MibanWalletAvailableSummary payment={walletPayment} disabled={checkoutBusy} />
            {/* 收货信息 */}
            <div className="space-y-3 mb-5">
              <p className="text-[13px] font-semibold text-black">收货信息</p>
              <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3">
                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input type="text" value={receiverName} onChange={(e) => setReceiverName(e.target.value)} placeholder="收货人姓名" className="flex-1 text-[14px] text-black outline-none bg-transparent" />
              </div>
              <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3">
                <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input type="tel" value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} placeholder="手机号码" className="flex-1 text-[14px] text-black outline-none bg-transparent" />
              </div>
              {(receiverPhone || checkoutAttempted) && receiverPhoneError && <p role="alert" className="text-[12px] text-red-500">{receiverPhoneError}</p>}
              <div className="flex items-center gap-3 border border-gray-200 rounded-xl px-4 py-3">
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input type="text" value={receiverAddress} onChange={(e) => setReceiverAddress(e.target.value)} placeholder="收货地址（省市区+详细地址）" className="flex-1 text-[14px] text-black outline-none bg-transparent" />
              </div>
              <textarea value={userNote} onChange={(e) => setUserNote(e.target.value)} placeholder="备注（可选）" rows={2} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-[14px] text-black outline-none bg-transparent resize-none" />
            </div>
            <MibanInvoiceRequestForm draft={invoiceDraft} onChange={draft => { setInvoiceDraft(draft); setInvoiceErrors({}); }} errors={invoiceErrors} disabled={checkoutBusy} accent="#FF6900" className="mb-5" />
            {/* 去支付只校验并打开确认弹窗，不报价、不下单。 */}
            <button
              disabled={checkoutBusy || !walletPayment.canPay}
              onClick={handleOpenWalletPayment}
              className="w-full px-3 py-4 break-all rounded-2xl text-[13px] font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
              style={{ background: "#FF6900" }}
            >
              去支付
            </button>
          </div>
        </div>
      )}

      {showWalletPayment && (
        <div data-miban-checkout="true" role="dialog" aria-modal="true" aria-label="钱包支付确认" className="fixed inset-0 bg-black/60 z-[90] flex items-end justify-center" onClick={cancelWalletPayment}>
          <div className="w-full max-w-[480px] bg-white rounded-[4px] p-6 pb-10 max-h-[90vh] overflow-y-auto" onClick={event => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-[17px] font-bold text-black">钱包支付确认</h2>
              <button aria-label="返回修改订单" disabled={createOrder.isPending} onClick={cancelWalletPayment} className="p-2 text-gray-500"><X size={18} /></button>
            </div>
            <p className="mb-4 text-[13px] text-gray-600">{items.length} 件商品 · 应付 ¥{totalPrice.toFixed(2)}</p>
            <MibanPaymentConfirmation payment={walletPayment} disabled={checkoutBusy} />
            <MibanCheckoutConfirmationDetails receiverName={receiverName} receiverPhone={normalizeMibanReceiverPhone(receiverPhone)} receiverAddress={receiverAddress} invoiceDraft={invoiceDraft} userNote={userNote} />
            <button disabled={createOrder.isPending} onClick={cancelWalletPayment} className="mt-4 w-full rounded-[4px] border border-gray-200 py-3 text-[13px] text-gray-600">返回修改订单</button>
            <button disabled={checkoutBusy || !walletPayment.canPay} onClick={handleConfirmWalletPayment} className="mt-3 flex w-full items-center justify-center gap-2 rounded-[4px] bg-[#FF6900] px-3 py-4 text-[13px] font-bold text-white disabled:opacity-50">
              {checkoutBusy ? <><Loader2 size={16} className="animate-spin" />{preparingPayment ? "正在核验支付" : "提交中…"}</> : "确认支付"}
            </button>
          </div>
        </div>
      )}

      {/* ─── 下单成功弹窗 ─────────────────────────────────────────── */}
      {orderSuccess && (
        <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-6" onClick={() => setOrderSuccess(null)}>
          <div className="w-full max-w-[340px] bg-white rounded-3xl p-7 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-500" />
            </div>
            <p className="text-[18px] font-bold text-black mb-1">下单成功！</p>
            <p className="text-[13px] text-gray-400 mb-4">订单号 #{orderSuccess.orderId}</p>
            <div className="bg-orange-50 rounded-2xl px-5 py-4 mb-5">
              <p className="text-[12px] text-gray-500 mb-1">已从钱包扣除</p>
              <p className="break-all text-[14px] font-bold text-[#FF6900]">{orderSuccess.walletPayments.length ? formatMibanPaymentSummary(orderSuccess.walletPayments) : "实际付款明细待核对，请查看订单"}</p>
              <p className="text-[11px] text-gray-400 mt-1">已按下单时的实时汇率完成组合扣款</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setOrderSuccess(null)} className="flex-1 py-3 rounded-xl border border-gray-200 text-[14px] text-gray-600">继续购物</button>
              <button onClick={() => { setOrderSuccess(null); window.location.href = "/p/proj_hzxm2t/my-orders"; }} className="flex-1 py-3 rounded-xl text-[14px] font-semibold text-white" style={{ background: "#FF6900" }}>查看订单</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// 根据 riceId 返回颜色
function getRiceColor(riceId: string): string {
  const colorMap: Record<string, string> = {
    white: "#E8DCC8",
    black: "#2D1B2E",
    red: "#8B3A3A",
    brown: "#8B6914",
    purple: "#4A2D6B",
    millet: "#D4A017",
    mung: "#4A7C59",
    coix: "#C8A87A",
  };
  return colorMap[riceId] ?? "#AAAAAA";
}
