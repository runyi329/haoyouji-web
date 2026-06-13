/**
 * 牙办齿科商城 - 我的订单（客人端）
 * 路由：/yaban/shop/my-orders
 * 风格：沿用牙办蓝白风，移动端优先，卡片列表 + 状态筛选 + 详情抽屉
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ChevronLeft, Loader2, X, ShoppingBag } from "lucide-react";
import { PageTag } from "@/components/PageTag";

type StatusKey = "all" | "pending" | "confirmed" | "completed" | "cancelled";

const STATUS_META: Record<string, { text: string; color: string; bg: string }> = {
  pending: { text: "待处理", color: "#D97706", bg: "#FEF3C7" },
  confirmed: { text: "已确认", color: "#2563EB", bg: "#DBEAFE" },
  completed: { text: "已完成", color: "#059669", bg: "#D1FAE5" },
  cancelled: { text: "已取消", color: "#6B7280", bg: "#F3F4F6" },
};

const PAY_STATUS_META: Record<string, { text: string; color: string }> = {
  unpaid: { text: "待付款", color: "#D97706" },
  paid: { text: "已付款", color: "#059669" },
  refunded: { text: "已退款", color: "#6B7280" },
};

const FILTERS: { key: StatusKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待处理" },
  { key: "confirmed", label: "已确认" },
  { key: "completed", label: "已完成" },
  { key: "cancelled", label: "已取消" },
];

function fmtTime(val: any): string {
  if (!val) return "";
  const s = String(val).replace("T", " ").replace(/\.\d+Z?$/, "");
  return s.slice(0, 16);
}

function money(val: any): string {
  const n = Number(val ?? 0);
  return n.toFixed(2);
}

export default function YabanShopMyOrders() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<StatusKey>("all");
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data, isLoading } = trpc.yabanShop.myOrders.useQuery({ limit: 100 });

  const orders = useMemo(() => {
    const list = (data ?? []) as any[];
    if (filter === "all") return list;
    return list.filter((o) => o.order_status === filter);
  }, [data, filter]);

  const detailQuery = trpc.yabanShop.myOrderDetail.useQuery(
    { orderId: detailId ?? 0 },
    { enabled: detailId !== null }
  );

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-10">
      <PageTag code="P305" />

      {/* 顶部栏 */}
      <div className="sticky top-0 z-30 bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white">
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => navigate("/yaban/shop")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">我的订单</span>
        </div>
        {/* 状态筛选 */}
        <div className="flex gap-2 px-3 pb-3 overflow-x-auto no-scrollbar">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs transition-colors ${
                filter === f.key
                  ? "bg-white text-[#2196C8] font-semibold"
                  : "bg-white/20 text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* 列表 */}
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
                  <span className="text-xs text-gray-400">
                    订单号 {o.order_no}
                  </span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ color: sm.color, backgroundColor: sm.bg }}
                  >
                    {sm.text}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-gray-400">
                    {fmtTime(o.created_at)}
                  </span>
                  <span className="text-[#E2452F] font-bold">
                    ¥{money(o.total_amount)}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* 详情抽屉 */}
      {detailId !== null && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/40"
          onClick={() => setDetailId(null)}
        >
          <div
            className="mt-auto bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-base font-bold text-gray-800">订单详情</span>
              <button onClick={() => setDetailId(null)} aria-label="关闭">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {detailQuery.isLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...
              </div>
            ) : detailQuery.data ? (
              <div
                className="px-4 py-4 space-y-4"
                style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}
              >
                {(() => {
                  const order = detailQuery.data.order as any;
                  const items = (detailQuery.data.items ?? []) as any[];
                  const sm = STATUS_META[order.order_status] ?? STATUS_META.pending;
                  const ps = PAY_STATUS_META[order.pay_status] ?? PAY_STATUS_META.unpaid;
                  return (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">订单状态</span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ color: sm.color, backgroundColor: sm.bg }}
                        >
                          {sm.text}
                        </span>
                      </div>

                      {/* 商品明细 */}
                      <div className="bg-[#F7F9FB] rounded-xl p-3 space-y-3">
                        {items.map((it) => (
                          <div key={it.id} className="flex items-center gap-3">
                            {it.product_image ? (
                              <img
                                src={it.product_image}
                                alt={it.product_name}
                                className="w-12 h-12 rounded-lg object-cover bg-white shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-gray-100 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-800 truncate">
                                {it.product_name}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                ¥{money(it.price)} × {it.qty}
                              </p>
                            </div>
                            <span className="text-sm text-gray-700 shrink-0">
                              ¥{money(it.subtotal ?? Number(it.price) * Number(it.qty))}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* 金额与信息 */}
                      <div className="space-y-2 text-sm">
                        <Row label="订单号" value={order.order_no} />
                        <Row label="下单时间" value={fmtTime(order.created_at)} />
                        <Row
                          label="支付状态"
                          value={ps.text}
                          valueColor={ps.color}
                        />
                        {order.user_name && (
                          <Row label="联系人" value={order.user_name} />
                        )}
                        {order.user_phone && (
                          <Row label="联系电话" value={order.user_phone} />
                        )}
                        {order.remark && (
                          <Row label="备注" value={order.remark} />
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                        <span className="text-sm text-gray-500">实付金额</span>
                        <span className="text-lg font-bold text-[#E2452F]">
                          ¥{money(order.total_amount)}
                        </span>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="py-16 text-center text-gray-400 text-sm">
                订单信息加载失败
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: any;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span style={valueColor ? { color: valueColor } : undefined} className="text-gray-700">
        {value}
      </span>
    </div>
  );
}
