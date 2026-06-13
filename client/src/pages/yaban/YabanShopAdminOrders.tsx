/**
 * 牙办齿科商城 - 订单管理后台（仅超级管理员）
 * 路由：/yaban/shop/admin/orders
 * 风格：沿用牙办蓝白风，移动端优先，卡片列表 + 状态筛选 + 详情抽屉 + 状态操作
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ChevronLeft, Loader2, X, Phone, ClipboardList } from "lucide-react";
import { PageTag } from "@/components/PageTag";

type StatusKey = "all" | "pending" | "confirmed" | "completed" | "cancelled";

const STATUS_META: Record<
  string,
  { text: string; color: string; bg: string }
> = {
  pending: { text: "待处理", color: "#D97706", bg: "#FEF3C7" },
  confirmed: { text: "已确认", color: "#2563EB", bg: "#DBEAFE" },
  completed: { text: "已完成", color: "#059669", bg: "#D1FAE5" },
  cancelled: { text: "已取消", color: "#6B7280", bg: "#F3F4F6" },
};

const FILTERS: { key: StatusKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待处理" },
  { key: "confirmed", label: "已确认" },
  { key: "completed", label: "已完成" },
  { key: "cancelled", label: "已取消" },
];

const PAY_LABEL: Record<string, string> = {
  wechat: "微信支付",
  alipay: "支付宝",
};

function fmtTime(val: any): string {
  if (!val) return "";
  const s = String(val).replace("T", " ").replace(/\.\d+Z?$/, "");
  return s.slice(0, 16);
}

export default function YabanShopAdminOrders() {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<StatusKey>("all");
  const [keyword, setKeyword] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.yabanShop.adminListOrders.useQuery({
    status: filter,
    keyword: keyword.trim() || undefined,
    limit: 200,
  });

  const list = data?.list ?? [];
  const counts = data?.counts ?? {};

  const updateOrder = trpc.yabanShop.adminUpdateOrder.useMutation({
    onSuccess: () => {
      utils.yabanShop.adminListOrders.invalidate();
      if (detailId) utils.yabanShop.adminOrderDetail.invalidate({ orderId: detailId });
    },
  });

  const handleUpdate = async (
    orderId: number,
    patch: { orderStatus?: string; adminRemark?: string }
  ) => {
    try {
      await updateOrder.mutateAsync({ orderId, ...(patch as any) });
      toast.success("已更新");
    } catch (e: any) {
      toast.error(e?.message || "更新失败");
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] pb-6">
      <PageTag code="P306" />

      {/* 顶部返回栏 */}
      <div className="bg-gradient-to-r from-[#2196C8] to-[#3BA9E0] text-white sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-3 py-3 flex items-center justify-between">
          <button onClick={() => navigate("/yaban")} aria-label="返回">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-base font-bold">订单管理</span>
          <span className="w-6" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-3">
        {/* 搜索 */}
        <div className="mt-3">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索订单号 / 姓名 / 电话"
            className="w-full bg-white rounded-full px-4 py-2 text-sm text-gray-700 outline-none placeholder:text-gray-400 border border-gray-100"
          />
        </div>

        {/* 状态筛选 */}
        <div className="flex gap-2 mt-3 overflow-x-auto no-scrollbar pb-1">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const cnt = counts[f.key];
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? "bg-[#2196C8] text-white"
                    : "bg-white text-gray-500 border border-gray-100"
                }`}
              >
                {f.label}
                {typeof cnt === "number" && cnt > 0 ? `(${cnt})` : ""}
              </button>
            );
          })}
        </div>

        {/* 列表 */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#2196C8] animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-gray-400">
            <ClipboardList className="w-10 h-10 mb-2" />
            <p className="text-sm">暂无订单</p>
          </div>
        ) : (
          <div className="space-y-2 mt-3">
            {list.map((o: any) => {
              const meta = STATUS_META[o.order_status] || STATUS_META.pending;
              return (
                <button
                  key={o.id}
                  onClick={() => setDetailId(o.id)}
                  className="w-full bg-white rounded-xl p-3 text-left active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400">{o.order_no}</span>
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                      style={{ color: meta.color, backgroundColor: meta.bg }}
                    >
                      {meta.text}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">
                        {o.user_name || `用户${o.user_id}`}
                        {o.has_service ? (
                          <span className="ml-1 text-[10px] text-[#1A6E96] bg-[#E8F4FD] px-1 rounded">
                            含诊疗
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {fmtTime(o.created_at)} · {PAY_LABEL[o.pay_method] || o.pay_method}
                      </p>
                    </div>
                    <span className="text-[#FF5A5A] text-base font-bold shrink-0">
                      ¥{Number(o.total_amount)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 详情抽屉 */}
      {detailId !== null && (
        <OrderDetail
          orderId={detailId}
          onClose={() => setDetailId(null)}
          onUpdate={handleUpdate}
          updating={updateOrder.isPending}
        />
      )}
    </div>
  );
}

function OrderDetail({
  orderId,
  onClose,
  onUpdate,
  updating,
}: {
  orderId: number;
  onClose: () => void;
  onUpdate: (id: number, patch: { orderStatus?: string; adminRemark?: string }) => void;
  updating: boolean;
}) {
  const { data, isLoading } = trpc.yabanShop.adminOrderDetail.useQuery({ orderId });
  const order = data?.order;
  const items = data?.items ?? [];
  const [adminRemark, setAdminRemark] = useState<string>("");

  const remarkInit = useMemo(() => order?.admin_remark || "", [order?.admin_remark]);
  // 同步初始备注
  useMemo(() => {
    setAdminRemark(remarkInit);
  }, [remarkInit]);

  const meta = order ? STATUS_META[order.order_status] || STATUS_META.pending : null;

  // 状态流转可选项
  const statusActions: { key: string; label: string }[] = [
    { key: "pending", label: "待处理" },
    { key: "confirmed", label: "已确认" },
    { key: "completed", label: "已完成" },
    { key: "cancelled", label: "已取消" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[#F5F7FA] rounded-t-2xl max-h-[88vh] overflow-y-auto">
        {/* 抽屉头 */}
        <div className="sticky top-0 bg-white px-4 py-3 flex items-center justify-between border-b border-gray-100">
          <span className="text-base font-bold text-gray-800">订单详情</span>
          <button onClick={onClose} aria-label="关闭">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {isLoading || !order ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#2196C8] animate-spin" />
          </div>
        ) : (
          <div className="px-4 py-3 space-y-3">
            {/* 状态与基础信息 */}
            <div className="bg-white rounded-xl p-3">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-gray-400">{order.order_no}</span>
                {meta && (
                  <span
                    className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                    style={{ color: meta.color, backgroundColor: meta.bg }}
                  >
                    {meta.text}
                  </span>
                )}
              </div>
              <div className="mt-2 space-y-1 text-[13px] text-gray-700">
                <div className="flex justify-between">
                  <span className="text-gray-400">下单人</span>
                  <span>{order.user_name || `用户${order.user_id}`}</span>
                </div>
                {order.user_phone && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">联系电话</span>
                    <a href={`tel:${order.user_phone}`} className="text-[#2196C8] flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" />
                      {order.user_phone}
                    </a>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">下单时间</span>
                  <span>{fmtTime(order.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">支付方式</span>
                  <span>{PAY_LABEL[order.pay_method] || order.pay_method}</span>
                </div>
                {order.remark && (
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-400 shrink-0">客户备注</span>
                    <span className="text-right">{order.remark}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 商品明细 */}
            <div className="bg-white rounded-xl p-3 space-y-3">
              {items.map((it: any) => (
                <div key={it.id} className="flex gap-3">
                  <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-[#EAF6FC] to-[#D6EEFB] shrink-0 overflow-hidden flex items-center justify-center">
                    {it.product_image ? (
                      <img src={it.product_image} alt={it.product_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[#9DCCE6] text-[10px]">配图</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-gray-800 line-clamp-1">{it.product_name}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[#FF5A5A] text-sm font-bold">¥{Number(it.price)}</span>
                      <span className="text-xs text-gray-400">x{it.qty}</span>
                    </div>
                  </div>
                </div>
              ))}
              <div className="border-t border-gray-100 pt-2 flex justify-between items-center">
                <span className="text-sm text-gray-500">合计</span>
                <span className="text-[#FF5A5A] text-lg font-bold">¥{Number(order.total_amount)}</span>
              </div>
            </div>

            {/* 管理员备注 */}
            <div className="bg-white rounded-xl p-3">
              <p className="text-sm text-gray-700 mb-2">管理员备注</p>
              <textarea
                value={adminRemark}
                onChange={(e) => setAdminRemark(e.target.value)}
                placeholder="选填，仅管理员可见"
                rows={2}
                className="w-full bg-[#F5F7FA] rounded-lg px-3 py-2 text-sm text-gray-700 outline-none placeholder:text-gray-400 resize-none"
              />
              <button
                onClick={() => onUpdate(order.id, { adminRemark })}
                disabled={updating}
                className="mt-2 w-full py-2 rounded-lg border border-[#2196C8] text-[#2196C8] text-sm disabled:opacity-60"
              >
                保存备注
              </button>
            </div>

            {/* 状态流转 */}
            <div className="bg-white rounded-xl p-3">
              <p className="text-sm text-gray-700 mb-2">更新状态</p>
              <div className="grid grid-cols-2 gap-2">
                {statusActions.map((s) => {
                  const active = order.order_status === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => !active && onUpdate(order.id, { orderStatus: s.key })}
                      disabled={updating || active}
                      className={`py-2 rounded-lg text-sm transition-colors ${
                        active
                          ? "bg-[#2196C8] text-white"
                          : "bg-[#F5F7FA] text-gray-600 active:bg-gray-100"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
