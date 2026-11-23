import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "wouter";
import {
  BarChart3,
  Check,
  ChevronLeft,
  ClipboardList,
  Download,
  Eye,
  Loader2,
  Package,
  Search,
  ShieldCheck,
  Store,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { MibanImage } from "./MibanImage";
import FulfillmentPanel from "./FulfillmentPanel";
import { fulfillmentCandidateFromOrder } from "./fulfillmentModel";
import type {
  SupplierDTO,
  SupplierOrderDTO as SupplierOrder,
} from "@shared/miban-supplier";

const supplierApi = trpc.supplier;
const BASE = "/p/proj_hzxm2t";
const inputClass =
  "w-full min-w-0 max-w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400 disabled:opacity-50";
const buttonClass =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-[#FF6900] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";
const cardClass = "min-w-0 rounded-2xl border border-gray-100 bg-white p-4";
const statuses = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待确认" },
  { key: "confirmed", label: "已确认" },
  { key: "packing", label: "配货中" },
  { key: "shipped", label: "已发货" },
  { key: "delivered", label: "已收货" },
  { key: "cancelled", label: "已取消" },
] as const;
type SupplierStatus = (typeof statuses)[number]["key"];
type Filters = {
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  status?: SupplierStatus;
};
type Tab = "overview" | "products" | "orders";

function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`min-w-0 break-words rounded-xl p-3 text-xs leading-5 ${error ? "bg-red-50 text-red-700" : "bg-orange-50 text-orange-700"}`}
    >
      {children}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className={`${cardClass} py-10 text-center`}>
      <Package className="mx-auto mb-3 h-9 w-9 text-gray-300" />
      <p className="text-sm leading-6 text-gray-500">{text}</p>
    </div>
  );
}
function money(value: string | number) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "—";
}
function dateText(value: string) {
  // The API returns Beijing wall time. Preserve it verbatim across browser
  // timezones; parsing MySQL's space-separated datetime also fails on Safari.
  return value.replace("T", " ").slice(0, 19) || "—";
}
function statusText(value: string) {
  return statuses.find(status => status.key === value)?.label ?? value;
}

function OrderCard({
  order,
  supplierId,
  readonly,
  onChanged,
}: {
  order: SupplierOrder;
  supplierId?: number;
  readonly: boolean;
  onChanged: () => void;
}) {
  const [shippingOpen, setShippingOpen] = useState(false);
  const canShip =
    !readonly &&
    ["pending", "confirmed", "packing", "shipped"].includes(order.status);
  return (
    <article className={`${cardClass} space-y-3`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-all text-sm font-semibold">{order.orderNo}</p>
          <p className="mt-1 break-words text-[11px] text-gray-400">
            {dateText(order.createdAt)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${order.status === "cancelled" ? "bg-gray-100 text-gray-500" : "bg-orange-50 text-orange-600"}`}
        >
          {statusText(order.status)}
        </span>
      </div>
      <div className="space-y-2 rounded-xl bg-gray-50 p-3">
        {order.items.map((item, index) => (
          <div
            key={`${item.productKey}-${item.skuId}-${index}`}
            className="min-w-0 text-xs"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 break-words font-medium">{item.name}</p>
              <span className="shrink-0 text-gray-500">
                ¥{money(item.lineTotal)}
              </span>
            </div>
            <p className="mt-1 break-words leading-5 text-gray-500">
              {item.skuName} · {item.quantity} 份 × 每份 {item.quantityPerOrder}{" "}
              {item.unitLabel || "单位"} ={" "}
              {item.quantity * item.quantityPerOrder} {item.unitLabel || "单位"}
            </p>
          </div>
        ))}
      </div>
      <div className="space-y-2 text-xs leading-5">
        <p className="break-words">
          <span className="text-gray-400">下单人：</span>
          {order.userName || order.userUsername || "未提供姓名"}
          {order.userUsername && (
            <span className="text-gray-400">（@{order.userUsername}）</span>
          )}
        </p>
        <div className="rounded-xl border border-gray-100 p-3">
          <p className="break-words">
            <span className="text-gray-400">收货人：</span>
            {order.receiverName}{" "}
            <span className="break-all">{order.receiverPhone}</span>
          </p>
          <p className="mt-1 break-words text-gray-500">
            {order.receiverAddress}
          </p>
        </div>
      </div>
      {(order.trackingNo || order.trackingCompany) && (
        <div className="rounded-xl bg-orange-50/50 p-3 text-xs leading-5">
          <p className="break-words text-gray-600">
            物流：{order.trackingCompany || "未提供公司"} ·{" "}
            <span className="break-all">
              {order.trackingNo || "未提供单号"}
            </span>
          </p>
          {order.shippedAt && (
            <p className="mt-1 text-gray-400">
              发货时间：{dateText(order.shippedAt)}
            </p>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          订单销售额{" "}
          <strong className="text-sm text-orange-600">
            ¥{money(order.totalPrice)}
          </strong>
        </p>
        {canShip ? (
          <button
            type="button"
            onClick={() => setShippingOpen(value => !value)}
            className="flex shrink-0 items-center gap-1 rounded-xl border border-orange-200 px-3 py-2 text-xs font-semibold text-orange-600"
          >
            <Truck className="h-3.5 w-3.5" />
            {order.status === "shipped" ? "更正物流" : "发货"}
          </button>
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-[11px] text-gray-400">
            <Eye className="h-3.5 w-3.5" />
            只读
          </span>
        )}
      </div>
      {shippingOpen && canShip && (
        <FulfillmentPanel
          orders={[fulfillmentCandidateFromOrder(order)!]}
          supplierId={supplierId}
          scopeKey={`single:${supplierId ?? "admin"}:${order.id}`}
          initialMode={order.status === "shipped" ? "correct" : "ship"}
          single
          onClose={() => setShippingOpen(false)}
          onChanged={onChanged}
        />
      )}
    </article>
  );
}

function SupplierWorkspace({
  supplier,
  isAdmin,
}: {
  supplier: SupplierDTO;
  isAdmin: boolean;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [readonlyReview, setReadonlyReview] = useState(true);
  const readonly = isAdmin ? readonlyReview : !supplier.active;
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [keyword, setKeyword] = useState("");
  const [filters, setFilters] = useState<Filters>({ status: "all" });
  const [filterError, setFilterError] = useState("");
  const [notice, setNotice] = useState("");
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const queryInput = { supplierId: supplier.id, filters };
  const workspace = supplierApi.workspace.useQuery(queryInput, {
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 15_000,
  });
  const exportQuery = supplierApi.exportOrders.useQuery(queryInput, {
    enabled: false,
    retry: false,
  });
  function applyFilters(event: FormEvent) {
    event.preventDefault();
    if (dateFrom && dateTo && dateFrom > dateTo)
      return setFilterError("开始日期不能晚于结束日期。");
    setFilterError("");
    setFilters(previous => ({
      ...previous,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      keyword: keyword.trim() || undefined,
    }));
  }
  function changed() {
    setNotice("服务端已处理操作，正在更新订单与销售概览。");
    void workspace.refetch();
  }
  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    setExportError("");
    try {
      const result = await exportQuery.refetch();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("未收到服务端导出内容。");
      const url = URL.createObjectURL(
        new Blob(["\uFEFF", result.data.csv.replace(/^\uFEFF/, "")], {
          type: "text/csv;charset=utf-8;",
        })
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `supplier-${supplier.id}-orders-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setExportError(
        reason instanceof Error ? reason.message : "导出失败，请重试。"
      );
    } finally {
      setExporting(false);
    }
  }
  const data = workspace.data;
  return (
    <div className="min-w-0 space-y-4">
      {isAdmin && (
        <div className={`${cardClass} space-y-3`}>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-orange-600">
            <ShieldCheck className="h-4 w-4" />
            管理员审核
          </p>
          <p className="text-xs leading-5 text-gray-500">
            默认只读查看当前供货商。需要实际处理物流时请主动切换；发货与更正权限仍由后台按真实身份、订单归属及状态校验。
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!readonlyReview}
              onChange={event => setReadonlyReview(!event.target.checked)}
              className="accent-orange-500"
            />
            启用真实发货 / 物流更正操作
          </label>
        </div>
      )}
      {!supplier.active && (
        <Notice>当前供货商已停用。展示与操作权限以服务端校验为准。</Notice>
      )}
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-white p-1.5">
        {(
          [
            { key: "overview", label: "销售概览", icon: BarChart3 },
            { key: "products", label: "商品目录", icon: Package },
            { key: "orders", label: "供货订单", icon: ClipboardList },
          ] as const
        ).map(item => (
          <button
            type="button"
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`flex min-w-0 items-center justify-center gap-1 rounded-xl px-1 py-3 text-xs font-semibold ${tab === item.key ? "bg-orange-50 text-orange-600" : "text-gray-500"}`}
          >
            <item.icon className="h-3.5 w-3.5 shrink-0" />
            {item.label}
          </button>
        ))}
      </div>
      {tab !== "products" && (
        <form onSubmit={applyFilters} className={`${cardClass} space-y-3`}>
          <p className="text-xs font-semibold text-gray-600">
            日期与订单关键词筛选
          </p>
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <label className="min-w-0 overflow-hidden text-[11px] text-gray-400">
              开始日期
              <input
                type="date"
                aria-label="开始日期"
                value={dateFrom}
                onChange={event => setDateFrom(event.target.value)}
                className={`${inputClass} mt-1 appearance-none px-2 text-xs`}
                style={{ minWidth: 0 }}
              />
            </label>
            <label className="min-w-0 overflow-hidden text-[11px] text-gray-400">
              结束日期
              <input
                type="date"
                aria-label="结束日期"
                value={dateTo}
                onChange={event => setDateTo(event.target.value)}
                className={`${inputClass} mt-1 appearance-none px-2 text-xs`}
                style={{ minWidth: 0 }}
              />
            </label>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              value={keyword}
              maxLength={100}
              onChange={event => setKeyword(event.target.value)}
              placeholder="订单号 / 收货人 / 下单人"
              aria-label="订单关键词"
              className={`${inputClass} pl-9`}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className={`${buttonClass} flex-1`}>
              应用筛选
            </button>
            <button
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setKeyword("");
                setFilters({ status: "all" });
                setFilterError("");
              }}
              className="rounded-xl border border-gray-200 px-3 text-xs text-gray-500"
            >
              重置
            </button>
          </div>
          {filterError && <Notice error>{filterError}</Notice>}
          <div className="flex flex-wrap gap-2" aria-label="订单状态筛选">
            {statuses.map(status => (
              <button
                type="button"
                key={status.key}
                aria-pressed={filters.status === status.key}
                onClick={() =>
                  setFilters(previous => ({ ...previous, status: status.key }))
                }
                className={`rounded-full px-3 py-1.5 text-[11px] ${filters.status === status.key ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"}`}
              >
                {status.label}
              </button>
            ))}
          </div>
        </form>
      )}
      {workspace.error ? (
        <div className="space-y-3">
          <Notice error>
            供货商工作台读取失败：{workspace.error.message}
            。请确认授权与供货商状态；不会继续自动重试。
          </Notice>
          <button
            type="button"
            onClick={() => void workspace.refetch()}
            className="rounded-xl border border-orange-200 px-4 py-2 text-sm text-orange-600"
          >
            重新读取
          </button>
        </div>
      ) : workspace.isLoading ? (
        <p
          role="status"
          className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          加载真实供货数据…
        </p>
      ) : (
        data && (
          <>
            {workspace.isFetching && (
              <p role="status" className="text-xs text-gray-400">
                正在刷新当前筛选数据…
              </p>
            )}
            {notice && <Notice>{notice}</Notice>}
            {tab === "overview" && (
              <>
                <div className="rounded-2xl bg-[#FF6900] p-5 text-white">
                  <p className="text-xs text-orange-100">
                    销售额 · 服务端统计 · 当前筛选范围
                  </p>
                  <p className="mt-3 break-all text-3xl font-bold tabular-nums">
                    ¥{money(data.stats.salesCny)}
                  </p>
                  <p className="mt-3 text-xs leading-5 text-orange-100">
                    销售额 ≠
                    应结算金额。这里只展示商品销售统计，不提供结算、佣金或钱包信息；取消订单无销售额。
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "订单数", value: data.stats.orderCount },
                    {
                      label: "售出件数（含量折算）",
                      value: data.stats.soldUnits,
                    },
                    { label: "待处理", value: data.stats.pendingCount },
                    { label: "已发货", value: data.stats.shippedCount },
                    { label: "已收货", value: data.stats.deliveredCount },
                    { label: "已取消", value: data.stats.cancelledCount },
                  ].map(stat => (
                    <div key={stat.label} className={cardClass}>
                      <p className="break-words text-[11px] text-gray-400">
                        {stat.label}
                      </p>
                      <p className="mt-2 break-all text-xl font-bold tabular-nums">
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>
                <Notice>
                  件数 = SKU 份额 × 包装含量，由服务端统计。各 SKU
                  可能使用袋、盒、颗等不同单位，累计数不代表同一种计量单位；明细请查看订单商品。
                </Notice>
              </>
            )}
            {tab === "products" && (
              <>
                <Notice>
                  仅可读取当前供货商的商品与规格目录。价格、库存和在售状态不可在此修改。
                </Notice>
                {data.products.length === 0 ? (
                  <Empty text="当前供货商暂无已归属商品，请联系管理员配置精选系列。" />
                ) : (
                  data.products.map(product => (
                    <article
                      key={product.productKey}
                      className={`${cardClass} space-y-3`}
                    >
                      <div className="flex items-start gap-3">
                        {product.image ? (
                          <MibanImage
                            src={product.image}
                            variant="thumbnail"
                            alt={product.name}
                            width={64}
                            height={64}
                            className="h-16 w-16 shrink-0 rounded-xl bg-gray-50 object-cover"
                          />
                        ) : (
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gray-50">
                            <Package className="h-6 w-6 text-gray-300" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="break-words text-sm font-semibold">
                            {product.name}
                          </h3>
                          <p className="mt-1 break-words text-[11px] text-gray-400">
                            {data.series.find(
                              series => series.key === product.seriesKey
                            )?.title ?? product.seriesKey}
                          </p>
                          <span className="mt-2 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                            {product.status === "active" ||
                            product.status === "on_sale"
                              ? "在售"
                              : product.status === "inactive" ||
                                  product.status === "off_sale"
                                ? "已下架"
                                : product.status === "draft"
                                  ? "草稿（未在售）"
                                  : product.status}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {product.skus.map(sku => (
                          <div
                            key={sku.id}
                            className="flex items-start justify-between gap-2 rounded-xl bg-gray-50 p-3 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="break-words font-medium">
                                {sku.name}
                              </p>
                              <p className="mt-1 break-words text-gray-400">
                                每份 {sku.quantityPerOrder}{" "}
                                {sku.unitLabel || "单位"}
                              </p>
                            </div>
                            <p className="shrink-0 font-semibold text-orange-600">
                              ¥{money(sku.priceCny)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))
                )}
              </>
            )}
            {tab === "orders" && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-500">
                    当前订单 {data.orders.length} 笔 · 统计{" "}
                    {data.stats.orderCount} 笔
                  </p>
                  <button
                    type="button"
                    disabled={exporting || workspace.isFetching}
                    onClick={() => void exportCsv()}
                    className="flex shrink-0 items-center gap-1 rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-semibold text-orange-600"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {exporting ? "导出中…" : "导出 CSV"}
                  </button>
                </div>
                <p className="text-[11px] leading-5 text-gray-400">
                  导出由供货商专用接口按当前供货商与筛选条件生成，不调用全站订单接口。
                </p>
                {exportError && <Notice error>{exportError}</Notice>}
                {readonly ? (
                  <Notice>
                    当前为只读模式。管理员可在上方主动启用物流操作；停用只禁止商家操作，管理员仍可接手处理订单。
                  </Notice>
                ) : (
                  <FulfillmentPanel
                    key={`fulfillment:${supplier.id}:${JSON.stringify(filters)}`}
                    orders={data.orders.map(
                      order => fulfillmentCandidateFromOrder(order)!
                    )}
                    supplierId={isAdmin ? undefined : supplier.id}
                    scopeKey={`supplier:${supplier.id}:${JSON.stringify(filters)}`}
                    onChanged={changed}
                  />
                )}
                {data.orders.length === 0 ? (
                  <Empty text="当前筛选范围内没有供货订单，可调整日期、状态或关键词。" />
                ) : (
                  data.orders.map(order => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      supplierId={isAdmin ? undefined : supplier.id}
                      readonly={readonly}
                      onChanged={changed}
                    />
                  ))
                )}
                <Notice>
                  已取消、已收货订单只读。本中心不提供取消、退款、删除或任何钱包、佣金操作。
                </Notice>
              </>
            )}
          </>
        )
      )}
    </div>
  );
}

export default function SupplierCenter() {
  const me = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const access = supplierApi.access.useQuery(undefined, {
    enabled: me.isSuccess && !!me.data?.id && !me.error,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const validAccess =
    me.isSuccess &&
    !!me.data?.id &&
    !me.error &&
    access.isSuccess &&
    !access.error;
  const selected = validAccess
    ? access.data.suppliers.find(supplier => supplier.id === selectedId)
    : undefined;
  return (
    <main className="mx-auto w-full max-w-[480px] min-w-0 space-y-4 overflow-x-clip px-4 pb-8 pt-5 text-gray-800">
      <div className="flex items-center gap-3">
        <Link
          href={BASE}
          aria-label="返回米伴首页"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white"
        >
          <ChevronLeft className="h-4 w-4 text-gray-500" />
        </Link>
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <Store className="h-5 w-5 text-orange-500" />
            供货商中心
          </h1>
          <p className="mt-0.5 text-[11px] text-gray-400">
            独立供货授权 · 销售与物流工作台
          </p>
        </div>
      </div>
      {me.error ? (
        <Notice error>本人账户读取失败：{me.error.message}</Notice>
      ) : me.isLoading ? (
        <p role="status" className="py-10 text-center text-sm text-gray-400">
          正在确认本人身份…
        </p>
      ) : !me.data?.id ? (
        <div className={`${cardClass} space-y-3`}>
          <p className="text-sm text-gray-500">
            请登录本人账户后查看供货商授权。
          </p>
          <Link
            href={`/login?from=${encodeURIComponent(`${BASE}/supplier`)}`}
            className={buttonClass}
          >
            登录后继续
          </Link>
        </div>
      ) : access.error ? (
        <div className="space-y-3">
          <Notice error>供货商权限读取失败：{access.error.message}</Notice>
          <button
            type="button"
            onClick={() => void access.refetch()}
            className={buttonClass}
          >
            重新读取授权
          </button>
        </div>
      ) : access.isLoading ? (
        <p role="status" className="py-10 text-center text-sm text-gray-400">
          读取供货商授权…
        </p>
      ) : (
        validAccess && (
          <>
            {access.data.isAdmin && (
              <Link
                href={`${BASE}/admin?tab=suppliers`}
                className="flex items-center justify-between rounded-xl bg-orange-50 p-3 text-xs font-semibold text-orange-600"
              >
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" />
                  返回管理员 · 供货商管理
                </span>
                <ChevronLeft className="h-4 w-4 rotate-180" />
              </Link>
            )}
            {access.data.suppliers.length === 0 ? (
              <div className={`${cardClass} space-y-3 py-8 text-center`}>
                <Store className="mx-auto h-10 w-10 text-gray-300" />
                <h2 className="text-sm font-semibold">尚未明确设置供货商</h2>
                <p className="text-xs leading-6 text-gray-400">
                  {access.data.isAdmin
                    ? "请先在供货商管理中配置名称、精选系列与员工，再返回此处选择供货商。"
                    : "当前账户暂无供货商授权，请联系管理员确认员工绑定。此能力独立于米伴职级，无需更改原有角色。"}
                </p>
                <Link
                  href={
                    access.data.isAdmin ? `${BASE}/admin?tab=suppliers` : BASE
                  }
                  className={buttonClass}
                >
                  {access.data.isAdmin ? "前往供货商管理" : "返回米伴首页"}
                </Link>
              </div>
            ) : (
              <>
                <div className={`${cardClass} space-y-2`}>
                  <label
                    htmlFor="supplier-choice"
                    className="block text-xs font-semibold text-gray-600"
                  >
                    选择已授权供货商
                  </label>
                  <select
                    id="supplier-choice"
                    value={selected?.id ?? ""}
                    onChange={event =>
                      setSelectedId(
                        event.target.value ? Number(event.target.value) : null
                      )
                    }
                    className={inputClass}
                  >
                    <option value="">请选择供货商，不会默认代选</option>
                    {access.data.suppliers.map(supplier => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                        {supplier.active ? "" : "（已停用）"}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] leading-5 text-gray-400">
                    仅显示真实权限接口返回的供货商，不以用户名推断权限。
                  </p>
                </div>
                {selected ? (
                  <SupplierWorkspace
                    key={`${me.data.id}-${selected.id}`}
                    supplier={selected}
                    isAdmin={access.data.isAdmin}
                  />
                ) : (
                  <Empty text="请先选择一个已授权供货商，再查看真实销售、商品及订单数据。" />
                )}
              </>
            )}
          </>
        )
      )}
    </main>
  );
}
