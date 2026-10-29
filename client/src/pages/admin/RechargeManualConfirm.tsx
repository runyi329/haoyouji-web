import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, CheckCircle2, AlertTriangle, ExternalLink, Link2, WalletCards } from "lucide-react";
import { trpc } from "../../lib/trpc";
import { toast } from "sonner";

function explorerUrl(network: string, transactionId: string) {
  const encoded = encodeURIComponent(transactionId);
  switch (network) {
    case "TRC20": return `https://tronscan.org/#/transaction/${encoded}`;
    case "ERC20": return `https://etherscan.io/tx/${encoded}`;
    case "BEP20": return `https://bscscan.com/tx/${encoded}`;
    case "APTOS": return `https://explorer.aptoslabs.com/txn/${encoded}?network=mainnet`;
    case "SOLANA": return `https://solscan.io/tx/${encoded}`;
    default: return null;
  }
}

function normalizedAddress(network: string, value: unknown) {
  const address = String(value ?? "").trim();
  return network === "SOLANA" ? address : address.toLowerCase();
}

function formatDate(value: unknown) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "--";
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default function RechargeManualConfirm() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const initialEventId = Number(new URLSearchParams(search).get("eventId") || 0);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const utils = trpc.useUtils();
  const eventsQuery = trpc.recharge.adminGetUnmatchedTransactions.useQuery(undefined, { refetchInterval: 15_000 });
  const ordersQuery = trpc.recharge.adminGetPendingOrders.useQuery(undefined, { refetchInterval: 15_000 });
  const allOrdersQuery = trpc.recharge.adminGetAllOrders.useQuery({ limit: 200 }, { refetchInterval: 30_000 });

  const events = (eventsQuery.data ?? []) as any[];
  const orders = (ordersQuery.data ?? []) as any[];
  const recentlyExpiredOrders = ((allOrdersQuery.data ?? []) as any[]).filter((order) => {
    if (String(order.status) !== "expired") return false;
    const expiresAt = new Date(String(order.expiresAt ?? order.expires_at)).getTime();
    return Number.isFinite(expiresAt) && expiresAt > Date.now() - 72 * 60 * 60 * 1000;
  });
  const reconcilableOrders = [...orders, ...recentlyExpiredOrders].filter((order, index, list) => index === list.findIndex((candidate) => Number(candidate.id) === Number(order.id)));

  useEffect(() => {
    if (!initialEventId || selectedEvent || events.length === 0) return;
    const matched = events.find((event) => Number(event.id) === initialEventId);
    if (matched) setSelectedEvent(matched);
  }, [initialEventId, selectedEvent, events]);

  const candidateOrders = useMemo(() => {
    if (!selectedEvent) return [];
    return reconcilableOrders.filter((order) => (
      String(order.network) === String(selectedEvent.network)
      && normalizedAddress(String(order.network), order.walletAddress ?? order.wallet_address) === normalizedAddress(String(selectedEvent.network), selectedEvent.wallet_address)
      && ["pending", "submitted"].includes(String(order.status))
    ));
  }, [reconcilableOrders, selectedEvent]);

  const confirmMutation = trpc.recharge.adminConfirmRecharge.useMutation({
    onSuccess: (data) => {
      toast.success(`链上到账已确认：用户 ${data.userId} 已到账 ${Number(data.amount).toFixed(4)} USDT`);
      setSelectedOrder(null);
      setSelectedEvent(null);
      utils.recharge.adminGetUnmatchedTransactions.invalidate();
      utils.recharge.adminGetPendingOrders.invalidate();
      utils.recharge.adminGetAllOrders.invalidate();
      utils.recharge.adminGetSystemStats.invalidate();
    },
    onError: (error) => toast.error(error.message || "确认失败"),
  });

  const handleConfirm = () => {
    if (!selectedEvent || !selectedOrder) return;
    const message = `将链上到账证据 #${selectedEvent.id}（${Number(selectedEvent.amount).toFixed(4)} USDT）关联至订单 ${selectedOrder.orderNo ?? selectedOrder.order_no}。金额与TxID均来自链上证据，确认后不可重复入账。`;
    if (!window.confirm(message)) return;
    confirmMutation.mutate({ orderId: Number(selectedOrder.id), chainEventId: Number(selectedEvent.id) });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="sticky top-0 z-10 border-b bg-white">
        <div className="flex items-center px-4 py-3">
          <button onClick={() => window.history.back()} className="mr-3" aria-label="返回">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">链上到账核对</h1>
            <p className="text-[11px] text-gray-400">仅可从扫描到的链上证据完成充值</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <div className="mb-1 flex items-center gap-1.5 font-semibold"><WalletCards className="h-4 w-4" />安全核对流程</div>
          <p className="leading-5">先选择链上到账记录，再选择同网络、同收款地址的订单。TxID与实际到账金额由系统锁定，不能手动填写或修改。无链上凭证的业务款项请走独立人工调账，不会完成充值订单。</p>
        </div>

        <section className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-3">
            <h2 className="font-semibold text-gray-900">待核对链上到账</h2>
            <span className="text-xs text-gray-400">{events.length} 条</span>
          </div>
          {events.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-gray-300" />
              暂无待核对链上到账记录
            </div>
          ) : (
            <div className="divide-y">
              {events.map((event) => {
                const selected = Number(selectedEvent?.id) === Number(event.id);
                const url = explorerUrl(String(event.network), String(event.transaction_id));
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => { setSelectedEvent(event); setSelectedOrder(null); }}
                    className={`block w-full px-4 py-3 text-left transition-colors ${selected ? "border-l-4 border-blue-500 bg-blue-50" : "hover:bg-gray-50"}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-semibold tabular-nums text-gray-900">{Number(event.amount).toFixed(4)} USDT</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{event.network}</span>
                    </div>
                    <div className="space-y-0.5 text-xs text-gray-500">
                      <div className="flex items-center justify-between gap-2"><span>事件 #{event.id}</span><span>{formatDate(event.block_timestamp ?? event.first_seen_at)}</span></div>
                      <div className="truncate font-mono">收款：{event.wallet_address}</div>
                      <div className="flex items-center gap-1.5 text-blue-600" onClick={(click) => click.stopPropagation()}>
                        {url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 hover:underline"><span className="truncate font-mono">TxID：{event.transaction_id}</span><ExternalLink className="h-3 w-3 shrink-0" /></a> : <span className="truncate font-mono">TxID：{event.transaction_id}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {selectedEvent && (
          <section className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="border-b bg-gray-50 px-4 py-3">
              <h2 className="font-semibold text-gray-900">选择对应订单</h2>
              <p className="mt-0.5 text-xs text-gray-500">只展示网络和收款地址均一致、仍可核对的订单</p>
            </div>
            {candidateOrders.length === 0 ? (
              <div className="p-5 text-center text-sm text-amber-700">
                <AlertTriangle className="mx-auto mb-2 h-6 w-6" />
                未找到可安全匹配的订单。请勿改用自由TxID确认；若无证据可匹配，请转人工调账。
              </div>
            ) : (
              <div className="divide-y">
                {candidateOrders.map((order) => {
                  const selected = Number(selectedOrder?.id) === Number(order.id);
                  return (
                    <button key={order.id} type="button" onClick={() => setSelectedOrder(order)} className={`block w-full px-4 py-3 text-left ${selected ? "border-l-4 border-emerald-500 bg-emerald-50" : "hover:bg-gray-50"}`}>
                      <div className="mb-1 flex items-center justify-between"><span className="font-semibold text-gray-900">{Number(order.amount).toFixed(4)} USDT</span><span className="text-xs text-gray-500">{order.status === "submitted" ? "确认中" : "待支付"}</span></div>
                      <div className="text-xs text-gray-500">订单：{order.orderNo ?? order.order_no} · 用户：{order.realName ?? order.userName ?? order.username ?? order.userId ?? order.user_id}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {selectedEvent && selectedOrder && (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="mb-2 flex items-center gap-2 font-semibold text-emerald-900"><Link2 className="h-4 w-4" />确认链上证据关联</div>
            <p className="text-sm leading-5 text-emerald-800">将 <strong>{Number(selectedEvent.amount).toFixed(4)} USDT</strong> 的链上到账证据关联到订单 <strong>{selectedOrder.orderNo ?? selectedOrder.order_no}</strong>。系统会在一个事务内完成订单、钱包和流水入账。</p>
            <button type="button" onClick={handleConfirm} disabled={confirmMutation.isPending} className="mt-3 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {confirmMutation.isPending ? "正在确认…" : "确认链上到账并入账"}
            </button>
          </section>
        )}

        <button type="button" onClick={() => setLocation("/admin/wallet-adjust") } className="w-full rounded-xl border border-gray-300 bg-white py-3 text-sm text-gray-600">无链上凭证，转人工调账</button>
      </div>
    </div>
  );
}
