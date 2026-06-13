/**
 * 牙办齿科商城 - 我的订单（客人端）
 * 路由：/yaban/shop/my-orders
 * 风格：沿用牙办蓝白风，移动端优先，卡片列表 + 状态筛选 + 详情抽屉
 * 含交易闭环：状态时间线、收货信息、到店核销码、确认收货、申请退款
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ChevronLeft, Loader2, X, ShoppingBag, Truck, QrCode,
  Clock, CheckCircle2, RotateCcw,
} from "lucide-react";
import { PageTag } from "@/components/PageTag";

type StatusKey = "all" | "pending" | "confirmed" | "shipped" | "completed" | "refunding" | "cancelled";

const STATUS_META: Record<string, { text: string; color: string; bg: string }> = {
  pending: { text: "待付款", color: "#D97706", bg: "#FEF3C7" },
  confirmed: { text: "已付款", color: "#2563EB", bg: "#DBEAFE" },
  shipped: { text: "已发货", color: "#0891B2", bg: "#CFFAFE" },
  to_verify: { text: "待核销", color: "#7C3AED", bg: "#EDE9FE" },
  completed: { text: "已完成", color: "#059669", bg: "#D1FAE5" },
  refunding: { text: "退款中", color: "#DB2777", bg: "#FCE7F3" },
  refunded: { text: "已退款", color: "#6B7280", bg: "#F3F4F6" },
  cancelled: { text: "已取消", color: "#6B7280", bg: "#F3F4F6" },
};

const PAY_STATUS_META: Record<string, { text: string; color: string }> = {
  unpaid: { text: "待付款", color: "#D97706" },
  paid: { text: "已付款", color: "#059669" },
  refunded: { text: "已退款", color: "#6B7280" },
};

const ACTION_TEXT: Record<string, string> = {
  create: "提交订单",
  pay: "支付成功",
  ship: "商家发货",
  verify: "到店核销",
  complete: "确认完成",
  refund_apply: "申请退款",
  refund_done: "退款完成",
  refund_reject: "退款驳回",
};

const FILTERS: { key: StatusKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待付款" },
  { key: "confirmed", label: "待发货/核销" },
  { key: "shipped", label: "待收货" },
  { key: "completed", label: "已完成" },
  { key: "refunding", label: "售后" },
];

function fmtTime(val: any): string {
  if (!val) return "";
  const s = String(val).replace("T", " ").replace(/\.\d+Z?$/, "");
  return s.slice(0, 16);
}
function money(val: any): string {
  return Number(val ?? 0).toFixed(2);
}

export default function YabanShopMyOrders() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<StatusKey>("all");
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data, isLoading } = trpc.yabanShop.myOrders.useQuery({ limit: 100 });

  const orders = useMemo(() => {
    const list = (data ?? []) as any[];
    if (filter === "all") return list;
    if (filter === "refunding")
      return list.filter((o) => ["refunding", "refunded"].includes(o.order_status));
    return list.filter((o) => o.order_status === filter);
  }, [data, filter]);

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">
      <PageTag code="P305" />
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => navigate("/yaban/shop")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">我的订单</span>
        </div>
        <div className="flex gap-2 px-3 pb-3 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs transition-colors ${
                filter === f.key ? "bg-white text-[#2196C8] font-semibold" : "bg-white/20 text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 pt-3 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <ShoppingBag className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-sm">暂无订单</p>
            <button
              onClick={() => navigate("/yaban/shop")}
              className="mt-4 px-5 py-2 rounded-full bg-[#2196C8] text-white text-sm"
            >
              去逛逛
            </button>
          </div>
        ) : (
          orders.map((o: any) => {
            const sm = STATUS_META[o.order_status] ?? STATUS_META.pending;
            return (
              <button
                key={o.id}
                onClick={() => setDetailId(o.id)}
                className="w-full text-left bg-white rounded-2xl p-4 active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">订单号 {o.order_no}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ color: sm.color, backgroundColor: sm.bg }}
                  >
                    {sm.text}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-gray-400">{fmtTime(o.created_at)}</span>
                  <span className="text-[#E2452F] font-bold">¥{money(o.total_amount)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {detailId !== null && (
        <OrderDetailDrawer
          orderId={detailId}
          onClose={() => setDetailId(null)}
          navigate={navigate}
        />
      )}
    </div>
  );
}

function OrderDetailDrawer({
  orderId,
  onClose,
  navigate,
}: {
  orderId: number;
  onClose: () => void;
  navigate: (to: string) => void;
}) {
  const utils = trpc.useUtils();
  const detailQuery = trpc.yabanShop.myOrderDetail.useQuery({ orderId });
  const order = detailQuery.data?.order as any;
  const items = (detailQuery.data?.items ?? []) as any[];
  const orderNo = order?.order_no || "";

  const timeline = trpc.yabanOrderFulfill.myOrderTimeline.useQuery(
    { orderNo },
    { enabled: !!orderNo }
  );

  const [showReceiver, setShowReceiver] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [rName, setRName] = useState("");
  const [rPhone, setRPhone] = useState("");
  const [rAddr, setRAddr] = useState("");
  const [refundReason, setRefundReason] = useState("");

  const refresh = () => {
    utils.yabanShop.myOrderDetail.invalidate({ orderId });
    utils.yabanShop.myOrders.invalidate();
    timeline.refetch();
  };

  const setReceiver = trpc.yabanOrderFulfill.setReceiver.useMutation({
    onSuccess: () => { setShowReceiver(false); refresh(); },
    onError: (e) => alert(e.message),
  });
  const confirmReceipt = trpc.yabanOrderFulfill.confirmReceipt.useMutation({
    onSuccess: () => refresh(),
    onError: (e) => alert(e.message),
  });
  const applyRefund = trpc.yabanOrderFulfill.applyRefund.useMutation({
    onSuccess: () => { setShowRefund(false); setRefundReason(""); refresh(); },
    onError: (e) => alert(e.message),
  });

  const sm = order ? (STATUS_META[order.order_status] ?? STATUS_META.pending) : STATUS_META.pending;
  const ps = order ? (PAY_STATUS_META[order.pay_status] ?? PAY_STATUS_META.unpaid) : PAY_STATUS_META.unpaid;
  const isService = order && Number(order.has_service) === 1;
  const paid = order && order.pay_status === "paid";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={onClose}>
      <div
        className="mt-auto bg-white rounded-t-2xl max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-gray-100 z-10">
          <span className="text-base font-bold text-gray-800">订单详情</span>
          <button onClick={onClose} aria-label="关闭">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {detailQuery.isLoading || !order ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...
          </div>
        ) : (
          <div className="px-4 py-4 space-y-4" style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">订单状态</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ color: sm.color, backgroundColor: sm.bg }}>
                {sm.text}
              </span>
            </div>

            {/* 到店核销码（服务订单 + 已付款 + 未核销） */}
            {isService && paid && order.verify_status === "unused" && order.verify_code && (
              <div className="bg-[#F5F0FF] rounded-xl p-4 text-center">
                <div className="flex items-center justify-center gap-1 text-[#7C3AED] text-sm font-medium mb-2">
                  <QrCode className="w-4 h-4" /> 到店核销码
                </div>
                <div className="text-2xl font-bold tracking-widest text-[#7C3AED]">
                  {order.verify_code}
                </div>
                <p className="text-xs text-gray-400 mt-2">到店出示此码给工作人员核销</p>
              </div>
            )}
            {isService && order.verify_status === "used" && (
              <div className="bg-[#D1FAE5] rounded-xl p-3 text-center text-sm text-[#059669] font-medium">
                已到店核销 {order.verified_at ? `· ${fmtTime(order.verified_at)}` : ""}
              </div>
            )}

            {/* 物流信息（已发货） */}
            {order.ship_no && (
              <div className="bg-[#F0FBFF] rounded-xl p-3 text-sm">
                <div className="flex items-center gap-1 text-[#0891B2] font-medium mb-1">
                  <Truck className="w-4 h-4" /> 物流信息
                </div>
                <p className="text-gray-600">{order.ship_company || "物流"}：{order.ship_no}</p>
              </div>
            )}

            {/* 收货信息（实物订单） */}
            {!isService && (
              <div className="bg-[#F7F9FB] rounded-xl p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">收货信息</span>
                  {order.order_status === "confirmed" && (
                    <button className="text-xs text-[#2196C8]" onClick={() => {
                      setRName(order.receiver_name || "");
                      setRPhone(order.receiver_phone || "");
                      setRAddr(order.receiver_addr || "");
                      setShowReceiver(true);
                    }}>
                      {order.receiver_name ? "修改" : "填写"}
                    </button>
                  )}
                </div>
                {order.receiver_name ? (
                  <div className="mt-1 text-gray-700">
                    <p>{order.receiver_name} {order.receiver_phone}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{order.receiver_addr}</p>
                  </div>
                ) : (
                  <p className="text-gray-400 text-xs mt-1">尚未填写收货地址</p>
                )}
              </div>
            )}

            {/* 商品明细 */}
            <div className="bg-[#F7F9FB] rounded-xl p-3 space-y-3">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-3">
                  {it.product_image ? (
                    <img src={it.product_image} alt={it.product_name} className="w-12 h-12 rounded-lg object-cover bg-white shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gray-100 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{it.product_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      ¥{money(it.price)} × {it.qty}{it.spec_text ? ` · ${it.spec_text}` : ""}
                    </p>
                  </div>
                  <span className="text-sm text-gray-700 shrink-0">
                    ¥{money(it.subtotal ?? Number(it.price) * Number(it.qty))}
                  </span>
                </div>
              ))}
            </div>

            {/* 金额信息 */}
            <div className="space-y-2 text-sm">
              <Row label="订单号" value={order.order_no} />
              <Row label="下单时间" value={fmtTime(order.created_at)} />
              <Row label="支付状态" value={ps.text} valueColor={ps.color} />
              {Number(order.discount_amount) > 0 && (
                <Row label="优惠" value={`-¥${money(order.discount_amount)}`} valueColor="#E2452F" />
              )}
              {order.remark && <Row label="备注" value={order.remark} />}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <span className="text-sm text-gray-500">实付金额</span>
              <span className="text-lg font-bold text-[#E2452F]">¥{money(order.total_amount)}</span>
            </div>

            {/* 状态时间线 */}
            {(timeline.data?.length ?? 0) > 0 && (
              <div className="bg-[#F7F9FB] rounded-xl p-3">
                <div className="flex items-center gap-1 text-gray-500 text-sm mb-2">
                  <Clock className="w-4 h-4" /> 订单进度
                </div>
                <div className="space-y-2">
                  {(timeline.data as any[]).map((l, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#2196C8] mt-1.5 shrink-0" />
                      <div className="flex-1 flex items-center justify-between">
                        <span className="text-sm text-gray-700">
                          {ACTION_TEXT[l.action] || l.action}
                          {l.note ? <span className="text-gray-400 text-xs ml-1">{l.note}</span> : null}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0">{fmtTime(l.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 操作区 */}
            <div className="flex flex-wrap gap-2 pt-1">
              {order.pay_status === "unpaid" && order.order_status === "pending" && (
                <button
                  onClick={() => navigate(`/yaban/shop/cashier?orderNo=${order.order_no}&amount=${order.total_amount}`)}
                  className="flex-1 min-w-[120px] py-2.5 rounded-full bg-[#E2452F] text-white text-sm font-semibold"
                >
                  去支付
                </button>
              )}
              {order.order_status === "shipped" && (
                <button
                  onClick={() => confirmReceipt.mutate({ orderNo })}
                  disabled={confirmReceipt.isPending}
                  className="flex-1 min-w-[120px] py-2.5 rounded-full bg-[#059669] text-white text-sm font-semibold flex items-center justify-center gap-1"
                >
                  <CheckCircle2 className="w-4 h-4" /> 确认收货
                </button>
              )}
              {paid && ["confirmed", "shipped", "completed"].includes(order.order_status) && (
                <button
                  onClick={() => setShowRefund(true)}
                  className="flex-1 min-w-[120px] py-2.5 rounded-full border border-gray-300 text-gray-600 text-sm flex items-center justify-center gap-1"
                >
                  <RotateCcw className="w-4 h-4" /> 申请退款
                </button>
              )}
            </div>

            {/* 收货信息表单 */}
            {showReceiver && (
              <div className="border border-gray-200 rounded-xl p-3 space-y-2">
                <p className="text-sm font-medium text-gray-700">填写收货信息</p>
                <input value={rName} onChange={(e) => setRName(e.target.value)} placeholder="收货人姓名"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                <input value={rPhone} onChange={(e) => setRPhone(e.target.value)} placeholder="联系电话"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                <textarea value={rAddr} onChange={(e) => setRAddr(e.target.value)} placeholder="详细地址" rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                <div className="flex gap-2">
                  <button onClick={() => setShowReceiver(false)} className="flex-1 py-2 rounded-full bg-gray-100 text-gray-600 text-sm">取消</button>
                  <button
                    onClick={() => setReceiver.mutate({ orderNo, name: rName, phone: rPhone, addr: rAddr })}
                    disabled={setReceiver.isPending || !rName || !rPhone || !rAddr}
                    className="flex-1 py-2 rounded-full bg-[#2196C8] text-white text-sm disabled:opacity-50"
                  >保存</button>
                </div>
              </div>
            )}

            {/* 退款表单 */}
            {showRefund && (
              <div className="border border-gray-200 rounded-xl p-3 space-y-2">
                <p className="text-sm font-medium text-gray-700">申请退款</p>
                <textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="请填写退款原因" rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm" />
                <div className="flex gap-2">
                  <button onClick={() => setShowRefund(false)} className="flex-1 py-2 rounded-full bg-gray-100 text-gray-600 text-sm">取消</button>
                  <button
                    onClick={() => applyRefund.mutate({ orderNo, reason: refundReason })}
                    disabled={applyRefund.isPending || !refundReason.trim()}
                    className="flex-1 py-2 rounded-full bg-[#DB2777] text-white text-sm disabled:opacity-50"
                  >提交申请</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: any; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span style={valueColor ? { color: valueColor } : undefined} className="text-gray-700">{value}</span>
    </div>
  );
}
