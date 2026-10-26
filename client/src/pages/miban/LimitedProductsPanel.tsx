// @ts-nocheck
import { useMemo, useState } from "react";
import { mtrpc, cosImg } from "./mibanTrpc";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowDownUp,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ClipboardList,
  Edit3,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  ShoppingBag,
  X,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  confirmed: "已确认",
  packing: "打包中",
  shipped: "已发货",
  delivered: "已送达",
  cancelled: "已取消",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-blue-50 text-blue-700",
  packing: "bg-violet-50 text-violet-700",
  shipped: "bg-emerald-50 text-emerald-700",
  delivered: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-50 text-red-600",
};

function parseLimitedLine(order: any) {
  try {
    const list = JSON.parse(order.ingredients ?? "[]");
    return Array.isArray(list)
      ? list.find((item: any) => item?.kind === "limited_product")
      : null;
  } catch {
    return null;
  }
}

function Phone({ value }: { value: string }) {
  if (!value || value.length < 7) return <>{value || "—"}</>;
  return (
    <>
      {value.slice(0, 3)}****{value.slice(-4)}
    </>
  );
}

function moneyCny(value: unknown) {
  return `¥${Number(value ?? 0).toFixed(2)}`;
}

function moneyUsdt(value: unknown) {
  return `${Number(value ?? 0).toFixed(2)} USDT`;
}

function shortSalesDate(dateKey: string) {
  const [, month, day] = String(dateKey).split("-");
  return month && day ? `${month}/${day}` : dateKey;
}

export default function LimitedProductsPanel() {
  const catalogQuery = mtrpc.limitedProduct.adminCatalog.useQuery();
  const [salesRange, setSalesRange] = useState<"today" | "7d" | "30d">("7d");
  const salesStatsQuery = mtrpc.limitedProduct.adminSalesStats.useQuery({
    range: salesRange,
  });
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("全部");
  const [selectedSku, setSelectedSku] = useState<any>(null);
  const [stockInput, setStockInput] = useState("");
  const [stockNote, setStockNote] = useState("");
  const [showMovements, setShowMovements] = useState(false);
  const [addressTarget, setAddressTarget] = useState<any>(null);
  const [addressForm, setAddressForm] = useState({
    receiverName: "",
    receiverPhone: "",
    receiverAddress: "",
    reason: "",
  });
  const [cancelTarget, setCancelTarget] = useState<any>(null);

  const catalog = catalogQuery.data ?? [];
  const brands = useMemo(
    () => [...new Set(catalog.map((item: any) => item.brand))],
    [catalog]
  );
  const selectedBrand = brand || brands[0] || "";
  const categories = useMemo(
    () => [
      "全部",
      ...new Set(
        catalog
          .filter((item: any) => item.brand === selectedBrand)
          .map((item: any) => item.category)
      ),
    ],
    [catalog, selectedBrand]
  );
  const skuRows = useMemo(
    () =>
      catalog
        .filter(
          (item: any) =>
            item.brand === selectedBrand &&
            (category === "全部" || item.category === category)
        )
        .flatMap((product: any) =>
          product.skus.map((sku: any) => ({ ...sku, product }))
        ),
    [catalog, selectedBrand, category]
  );

  const ordersQuery = mtrpc.limitedProduct.adminOrders.useQuery(
    selectedSku
      ? { productKey: selectedSku.product.key, skuId: selectedSku.id }
      : undefined,
    { enabled: Boolean(selectedSku) }
  );
  const movementsQuery = mtrpc.limitedProduct.adminStockMovements.useQuery(
    selectedSku
      ? { productKey: selectedSku.product.key, skuId: selectedSku.id }
      : undefined,
    { enabled: Boolean(selectedSku && showMovements) }
  );

  const refreshAll = () => {
    catalogQuery.refetch();
    salesStatsQuery.refetch();
    ordersQuery.refetch();
    movementsQuery.refetch();
  };

  const updateSkuMutation =
    mtrpc.limitedProduct.adminUpdateSkuState.useMutation({
      onSuccess: () => {
        toast.success("商品运营状态已保存");
        refreshAll();
      },
      onError: (error: any) => toast.error(error.message || "保存失败"),
    });
  const cancelMutation = mtrpc.order.adminCancel.useMutation({
    onSuccess: (result: any) => {
      const refund = [
        result.refundCny > 0.001
          ? `¥${Number(result.refundCny).toFixed(2)}`
          : "",
        result.refundUsdt > 0.000001
          ? `${Number(result.refundUsdt).toFixed(4)} USDT`
          : "",
      ]
        .filter(Boolean)
        .join(" + ");
      toast.success(refund ? `已取消并原路退款 ${refund}` : "订单已取消");
      setCancelTarget(null);
      refreshAll();
    },
    onError: (error: any) => toast.error(error.message || "取消失败"),
  });
  const updateAddressMutation = mtrpc.order.adminUpdateAddress.useMutation({
    onSuccess: () => {
      toast.success("收货地址已更新，已记录本次修改");
      setAddressTarget(null);
      refreshAll();
    },
    onError: (error: any) => toast.error(error.message || "保存失败"),
  });

  const openSku = (row: any) => {
    setSelectedSku(row);
    setStockInput(row.stockQty < 0 ? "不限" : String(row.stockQty));
    setStockNote("");
    setShowMovements(false);
  };

  const saveSku = () => {
    if (!selectedSku) return;
    const trimmed = stockInput.trim();
    const stockQty =
      trimmed === "不限" || trimmed === "-1" ? -1 : Number(trimmed);
    if (!Number.isInteger(stockQty) || stockQty < -1 || stockQty > 1_000_000) {
      toast.error("库存请输入非负整数，或填写“不限”");
      return;
    }
    updateSkuMutation.mutate({
      productKey: selectedSku.product.key,
      skuId: selectedSku.id,
      stockQty,
      isActive: selectedSku.isActive,
      note: stockNote || undefined,
    });
  };

  const toggleSku = () => {
    if (!selectedSku) return;
    updateSkuMutation.mutate(
      {
        productKey: selectedSku.product.key,
        skuId: selectedSku.id,
        isActive: !selectedSku.isActive,
        stockQty: selectedSku.stockQty,
        note: !selectedSku.isActive ? "管理员上架商品" : "管理员下架商品",
      },
      {
        onSuccess: () => {
          setSelectedSku((current: any) =>
            current ? { ...current, isActive: !current.isActive } : current
          );
          toast.success(selectedSku.isActive ? "商品已下架" : "商品已上架");
          refreshAll();
        },
      }
    );
  };

  const openAddressEditor = (order: any) => {
    setAddressTarget(order);
    setAddressForm({
      receiverName: order.receiverName || "",
      receiverPhone: order.receiverPhone || "",
      receiverAddress: order.receiverAddress || "",
      reason: "",
    });
  };

  if (catalogQuery.isLoading) {
    return (
      <div className="py-16 text-center text-[13px] text-gray-400">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
        正在加载限时商品…
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      <section className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[14px] font-bold text-gray-900">
              <ShoppingBag className="h-4 w-4 text-orange-500" />
              限时商品管理
            </div>
            <p className="mt-1 text-[11px] leading-5 text-gray-500">
              管理 SKU
              上下架、库存与订单。商品图文、规格和售价仍由上架配置维护。
            </p>
          </div>
          <button
            onClick={refreshAll}
            className="rounded-lg bg-white p-2 text-gray-400 shadow-sm active:scale-95"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-700">
          库存填“<strong>不限</strong>”表示暂不限制；填 0
          则售罄。设置具体库存后，用户下单会自动扣减；未发货订单取消退款会自动回补。
        </div>
      </section>

      <section className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-100">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[14px] font-bold text-gray-900">
            <BarChart3 className="h-4 w-4 text-orange-500" />
            销售概览
          </div>
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            {[
              ["today", "今日"],
              ["7d", "近7日"],
              ["30d", "近30日"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setSalesRange(value as typeof salesRange)}
                className={`rounded-md px-2 py-1 text-[10px] font-semibold transition ${salesRange === value ? "bg-white text-orange-600 shadow-sm" : "text-gray-400"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {salesStatsQuery.isLoading ? (
          <div className="flex h-28 items-center justify-center text-[11px] text-gray-400">
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            正在汇总销售数据…
          </div>
        ) : salesStatsQuery.isError ? (
          <button
            onClick={() => salesStatsQuery.refetch()}
            className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl bg-gray-50 py-4 text-[11px] text-gray-400"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            统计暂不可用，点击重试
          </button>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <div className="rounded-xl bg-orange-50 px-2.5 py-2">
                <p className="text-[10px] text-orange-500">有效订单</p>
                <p className="mt-1 truncate text-[15px] font-bold text-gray-900">
                  {salesStatsQuery.data?.summary?.effectiveOrderCount ?? 0}
                  <span className="ml-0.5 text-[10px] font-medium">单</span>
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 px-2.5 py-2">
                <p className="text-[10px] text-emerald-600">人民币流水</p>
                <p className="mt-1 truncate text-[14px] font-bold text-gray-900">
                  {moneyCny(salesStatsQuery.data?.summary?.effectiveCny)}
                </p>
              </div>
              <div className="rounded-xl bg-blue-50 px-2.5 py-2">
                <p className="text-[10px] text-blue-600">USDT 流水</p>
                <p className="mt-1 truncate text-[14px] font-bold text-gray-900">
                  {moneyUsdt(salesStatsQuery.data?.summary?.effectiveUsdt)}
                </p>
              </div>
            </div>

            {(salesStatsQuery.data?.summary?.cancelledOrderCount ?? 0) > 0 && (
              <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[10px] leading-4 text-red-500">
                已取消 {salesStatsQuery.data.summary.cancelledOrderCount} 单：
                {moneyCny(salesStatsQuery.data.summary.cancelledCny)} /{" "}
                {moneyUsdt(salesStatsQuery.data.summary.cancelledUsdt)}
                ，不计入有效销售。
              </p>
            )}

            <div className="mt-3 overflow-hidden rounded-xl border border-gray-100">
              {salesStatsQuery.data?.daily?.map((day: any) => (
                <div
                  key={day.date}
                  className="border-b border-gray-50 px-2.5 py-2 last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-gray-700">
                        {shortSalesDate(day.date)}
                      </span>
                      <span className="truncate text-[10px] text-gray-400">
                        {day.effectiveOrderCount} 个有效订单
                      </span>
                    </div>
                    <div className="flex shrink-0 items-baseline gap-1.5 text-right">
                      <span className="text-[11px] font-semibold text-gray-700">
                        {moneyCny(day.effectiveCny)}
                      </span>
                      <span className="text-[10px] font-medium text-blue-600">
                        {moneyUsdt(day.effectiveUsdt)}
                      </span>
                    </div>
                  </div>
                  {day.cancelledOrderCount > 0 && (
                    <p className="mt-1 text-[9px] text-red-400">
                      已取消 {day.cancelledOrderCount} 单（
                      {moneyCny(day.cancelledCny)} /{" "}
                      {moneyUsdt(day.cancelledUsdt)}）
                    </p>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-4 text-gray-400">
              按下单日（中国时间）及订单实际 CNY / USDT
              扣款额统计；取消订单单列，不按退款操作日重复计入。
            </p>
          </>
        )}
      </section>

      <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-100">
        <p className="mb-2 text-[11px] font-semibold text-gray-400">
          按品牌管理
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {brands.map((item: string) => (
            <button
              key={item}
              onClick={() => {
                setBrand(item);
                setCategory("全部");
                setSelectedSku(null);
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${selectedBrand === item ? "bg-orange-500 text-white shadow-sm" : "bg-gray-100 text-gray-500"}`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((item: string) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition ${category === item ? "border-orange-300 bg-orange-50 font-semibold text-orange-600" : "border-gray-200 text-gray-400"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        {skuRows.map((row: any) => {
          const displayStock =
            row.stockQty < 0 ? "不限" : `${row.stockQty}${row.unitLabel}`;
          return (
            <button
              key={`${row.product.key}:${row.id}`}
              onClick={() => openSku(row)}
              className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-gray-100 active:scale-[0.99]"
            >
              <img
                src={cosImg(row.image, 72)}
                alt=""
                className="h-[64px] w-[64px] rounded-xl bg-gray-50 object-contain"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-bold text-gray-900">
                    {row.product.title}
                  </span>
                  <span className="shrink-0 text-[10px] text-gray-400">
                    · {row.product.category}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] text-gray-500">
                  {row.name}{" "}
                  {row.netContentText ? `· ${row.netContentText}` : ""}
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${row.isActive ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-400"}`}
                  >
                    {row.isActive ? "在售" : "已下架"}
                  </span>
                  <span
                    className={`text-[11px] font-semibold ${row.stockQty === 0 ? "text-red-500" : "text-gray-700"}`}
                  >
                    库存 {displayStock}
                  </span>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 -rotate-90 text-gray-300" />
            </button>
          );
        })}
        {!skuRows.length && (
          <div className="rounded-2xl bg-white py-12 text-center text-[12px] text-gray-300">
            该分类暂无商品
          </div>
        )}
      </div>

      {selectedSku && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={() => setSelectedSku(null)}
        >
          <div
            className="max-h-[88vh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl bg-[#f8f8f8] pb-8"
            onClick={event => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-bold text-gray-900">
                  {selectedSku.product.title}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-gray-400">
                  {selectedSku.product.brand} · {selectedSku.product.category} ·{" "}
                  {selectedSku.name}
                </p>
              </div>
              <button
                onClick={() => setSelectedSku(null)}
                className="rounded-full bg-gray-100 p-2 text-gray-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              <div className="overflow-hidden rounded-2xl bg-white p-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <img
                    src={cosImg(selectedSku.image, 96)}
                    alt=""
                    className="h-20 w-20 rounded-xl bg-gray-50 object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-gray-800">
                      {selectedSku.name}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {selectedSku.netContentText}
                    </p>
                    <p className="mt-2 text-[11px] text-gray-500">
                      当前库存：
                      <strong
                        className={
                          selectedSku.stockQty === 0
                            ? "text-red-500"
                            : "text-gray-800"
                        }
                      >
                        {selectedSku.stockQty < 0
                          ? "不限"
                          : `${selectedSku.stockQty}${selectedSku.unitLabel}`}
                      </strong>
                    </p>
                  </div>
                </div>
                <button
                  onClick={toggleSku}
                  disabled={updateSkuMutation.isPending}
                  className={`mt-3 w-full rounded-xl py-2.5 text-[13px] font-semibold ${selectedSku.isActive ? "border border-red-200 bg-red-50 text-red-600" : "bg-emerald-500 text-white"}`}
                >
                  {selectedSku.isActive ? "下架此规格" : "重新上架此规格"}
                </button>
              </div>

              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-gray-800">
                  <ArrowDownUp className="h-4 w-4 text-orange-500" />
                  调整库存
                </div>
                <label className="text-[11px] text-gray-400">
                  可售库存（填“不限”表示不限制库存）
                </label>
                <input
                  value={stockInput}
                  onChange={event => setStockInput(event.target.value)}
                  inputMode="numeric"
                  placeholder="不限或库存数量"
                  className="mt-1.5 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[14px] font-semibold text-gray-800 outline-none focus:border-orange-300"
                />
                <input
                  value={stockNote}
                  onChange={event => setStockNote(event.target.value)}
                  placeholder="调整说明（建议填写）"
                  className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[12px] outline-none focus:border-orange-300"
                />
                <button
                  onClick={saveSku}
                  disabled={updateSkuMutation.isPending}
                  className="mt-2 w-full rounded-xl bg-orange-500 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  {updateSkuMutation.isPending ? "保存中…" : "保存库存"}
                </button>
                <button
                  onClick={() => {
                    setShowMovements(value => !value);
                    if (!showMovements) movementsQuery.refetch();
                  }}
                  className="mt-3 flex w-full items-center justify-between text-[11px] text-gray-500"
                >
                  <span className="flex items-center gap-1">
                    <ClipboardList className="h-3.5 w-3.5" />
                    库存流水（最近30条）
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition ${showMovements ? "rotate-180" : ""}`}
                  />
                </button>
                {showMovements && (
                  <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
                    {movementsQuery.isLoading ? (
                      <p className="py-3 text-center text-[11px] text-gray-400">
                        加载中…
                      </p>
                    ) : !(movementsQuery.data ?? []).length ? (
                      <p className="py-3 text-center text-[11px] text-gray-300">
                        暂无库存流水
                      </p>
                    ) : (
                      movementsQuery.data.map((item: any) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-2 text-[10px]"
                        >
                          <div className="min-w-0">
                            <p className="text-gray-600">
                              {item.event_type === "manual_adjust"
                                ? "手动调整"
                                : item.event_type === "cancel_restock"
                                  ? "取消回补"
                                  : "用户下单扣减"}{" "}
                              {item.note ? `· ${item.note}` : ""}
                            </p>
                            <p className="text-gray-300">
                              {new Date(item.created_at).toLocaleString(
                                "zh-CN"
                              )}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 font-semibold ${Number(item.delta_qty) < 0 ? "text-red-500" : "text-emerald-600"}`}
                          >
                            {Number(item.delta_qty) > 0 ? "+" : ""}
                            {item.delta_qty} → {item.stock_after}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[13px] font-bold text-gray-800">
                    <Package className="h-4 w-4 text-orange-500" />
                    该规格订单
                  </div>
                  <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-500">
                    {ordersQuery.data?.length ?? 0}
                  </span>
                </div>
                {ordersQuery.isLoading ? (
                  <div className="py-6 text-center text-[11px] text-gray-400">
                    加载订单中…
                  </div>
                ) : !(ordersQuery.data ?? []).length ? (
                  <div className="py-6 text-center text-[11px] text-gray-300">
                    该规格暂时没有订单
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ordersQuery.data.map((order: any) => {
                      const line = parseLimitedLine(order);
                      const addressEditable = [
                        "pending",
                        "confirmed",
                        "packing",
                      ].includes(order.status);
                      const cancellable = ![
                        "cancelled",
                        "shipped",
                        "delivered",
                      ].includes(order.status);
                      return (
                        <div
                          key={order.id}
                          className="rounded-xl border border-gray-100 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[12px] font-bold text-gray-800">
                                {order.orderNo}
                              </p>
                              <p className="mt-0.5 text-[10px] text-gray-400">
                                {order.userName || "用户"} ·{" "}
                                {new Date(order.createdAt).toLocaleString(
                                  "zh-CN"
                                )}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[order.status] || "bg-gray-100 text-gray-500"}`}
                            >
                              {STATUS_LABELS[order.status] || order.status}
                            </span>
                          </div>
                          <p className="mt-2 text-[11px] text-gray-600">
                            {line?.skuName || selectedSku.name} ×{" "}
                            {line?.quantity || 1}
                            {line?.unitLabel || selectedSku.unitLabel}
                          </p>
                          <p className="mt-1 flex gap-1 text-[11px] text-gray-500">
                            <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                            <span>
                              {order.receiverName} ·{" "}
                              <Phone value={order.receiverPhone} /> ·{" "}
                              {order.receiverAddress}
                            </span>
                          </p>
                          <div className="mt-2 flex gap-2">
                            {addressEditable && (
                              <button
                                onClick={() => openAddressEditor(order)}
                                className="flex-1 rounded-lg border border-gray-200 py-1.5 text-[11px] text-gray-500"
                              >
                                <Edit3 className="mr-1 inline h-3 w-3" />
                                修改地址
                              </button>
                            )}
                            {cancellable && (
                              <button
                                onClick={() => setCancelTarget(order)}
                                className="flex-1 rounded-lg border border-red-100 bg-red-50 py-1.5 text-[11px] text-red-500"
                              >
                                取消并退款
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {addressTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40"
          onClick={() => setAddressTarget(null)}
        >
          <div
            className="w-full max-w-[480px] rounded-t-3xl bg-white p-5 pb-8"
            onClick={event => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[15px] font-bold">修改收货地址</p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  订单 {addressTarget.orderNo} · 本次修改将被记录
                </p>
              </div>
              <button
                onClick={() => setAddressTarget(null)}
                className="rounded-full bg-gray-100 p-2 text-gray-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              <input
                value={addressForm.receiverName}
                onChange={event =>
                  setAddressForm({
                    ...addressForm,
                    receiverName: event.target.value,
                  })
                }
                placeholder="收件人姓名"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-[13px] outline-none focus:border-orange-300"
              />
              <input
                value={addressForm.receiverPhone}
                onChange={event =>
                  setAddressForm({
                    ...addressForm,
                    receiverPhone: event.target.value,
                  })
                }
                placeholder="联系电话"
                inputMode="tel"
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-[13px] outline-none focus:border-orange-300"
              />
              <textarea
                value={addressForm.receiverAddress}
                onChange={event =>
                  setAddressForm({
                    ...addressForm,
                    receiverAddress: event.target.value,
                  })
                }
                placeholder="完整收货地址"
                rows={3}
                className="w-full resize-none rounded-xl border border-gray-200 px-3 py-3 text-[13px] outline-none focus:border-orange-300"
              />
              <input
                value={addressForm.reason}
                onChange={event =>
                  setAddressForm({ ...addressForm, reason: event.target.value })
                }
                placeholder="修改说明（必填，例如：客户补充楼栋号）"
                className="w-full rounded-xl border border-orange-200 bg-orange-50/40 px-3 py-3 text-[12px] outline-none focus:border-orange-300"
              />
            </div>
            <button
              disabled={updateAddressMutation.isPending}
              onClick={() =>
                updateAddressMutation.mutate({
                  orderId: addressTarget.id,
                  ...addressForm,
                })
              }
              className="mt-3 w-full rounded-xl bg-orange-500 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
            >
              {updateAddressMutation.isPending ? "保存中…" : "确认保存修改"}
            </button>
          </div>
        </div>
      )}

      {cancelTarget && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-5"
          onClick={() => setCancelTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5"
            onClick={event => event.stopPropagation()}
          >
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-500">
              <AlertCircle className="h-5 w-5" />
            </div>
            <p className="mt-3 text-center text-[15px] font-bold text-gray-900">
              确认取消并退款？
            </p>
            <p className="mt-2 text-center text-[12px] leading-5 text-gray-500">
              订单 {cancelTarget.orderNo} 将取消，人民币和 USDT
              将按原扣款金额退回；若此 SKU 已设置库存，将同步回补。
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setCancelTarget(null)}
                className="flex-1 rounded-xl bg-gray-100 py-2.5 text-[13px] font-semibold text-gray-500"
              >
                暂不取消
              </button>
              <button
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate({ id: cancelTarget.id })}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {cancelMutation.isPending ? "处理中…" : "确认取消退款"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
