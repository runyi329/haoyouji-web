import { mibanLimitedBrands } from "./miban-limited-brand-config";
import { mibanLimitedProducts } from "./miban-limited-products";

export type SupplierSeriesDTO = {
  key: string;
  title: string;
  brand: string;
  productCount: number;
};
export type SeriesDTO = SupplierSeriesDTO;
export type SupplierDTO = {
  id: number;
  name: string;
  active: boolean;
  seriesKeys: string[];
  members: { userId: number; name: string | null; username: string }[];
};
export type SupplierOrderStatus =
  | "pending"
  | "confirmed"
  | "packing"
  | "shipped"
  | "delivered"
  | "cancelled";
export type SupplierFilters = {
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  status?: "all" | SupplierOrderStatus;
};
export type SupplierOrderItemDTO = {
  productKey: string;
  skuId: string;
  name: string;
  skuName: string;
  quantity: number;
  quantityPerOrder: number;
  unitLabel: string;
  lineTotal: string;
};
export type SupplierOrderDTO = {
  id: number;
  orderNo: string;
  createdAt: string;
  status: SupplierOrderStatus;
  totalPrice: string;
  userName: string | null;
  userUsername: string | null;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  trackingNo: string | null;
  trackingCompany: string | null;
  shippedAt: string | null;
  items: SupplierOrderItemDTO[];
};
export type SupplierProductDTO = {
  productKey: string;
  seriesKey: string;
  name: string;
  image: string;
  status: string;
  skus: {
    id: string;
    name: string;
    priceCny: number;
    quantityPerOrder: number;
    unitLabel: string;
  }[];
};
export type SupplierStatsDTO = {
  orderCount: number;
  soldUnits: number;
  salesCny: string;
  pendingCount: number;
  shippedCount: number;
  deliveredCount: number;
  cancelledCount: number;
};
export type SupplierWorkspaceDTO = {
  supplier: SupplierDTO;
  series: SupplierSeriesDTO[];
  products: SupplierProductDTO[];
  orders: SupplierOrderDTO[];
  stats: SupplierStatsDTO;
};
export type SupplierHistoryDTO = {
  candidates: {
    id: number;
    orderNo: string;
    createdAt: string;
    status: SupplierOrderStatus;
    totalPrice: string;
    productNames: string;
  }[];
  unresolvedCount: number;
};

export function supplierCatalog(): {
  series: SupplierSeriesDTO[];
  products: SupplierProductDTO[];
} {
  return {
    series: mibanLimitedBrands.map(series => ({
      key: series.slug,
      title: series.title,
      brand: series.brand,
      productCount: mibanLimitedProducts.filter(
        product => product.brand === series.brand
      ).length,
    })),
    products: mibanLimitedProducts.flatMap(product => {
      const matches = mibanLimitedBrands.filter(
        series => series.brand === product.brand
      );
      if (matches.length !== 1) return [];
      return [
        {
          productKey: product.key,
          seriesKey: matches[0].slug,
          name: product.detail.title,
          image: product.detail.productImage,
          status: product.status,
          skus: product.skus.map(sku => ({
            id: sku.id,
            name: sku.name,
            priceCny: sku.priceCny,
            quantityPerOrder: sku.quantityPerOrder,
            unitLabel: sku.unitLabel,
          })),
        },
      ];
    }),
  };
}

function records(ingredients: unknown): Record<string, unknown>[] | null {
  try {
    const value: unknown =
      typeof ingredients === "string" ? JSON.parse(ingredients) : ingredients;
    if (
      !Array.isArray(value) ||
      value.some(
        line => !line || typeof line !== "object" || Array.isArray(line)
      )
    )
      return null;
    return value as Record<string, unknown>[];
  } catch {
    return null;
  }
}

export type SupplierScopeResolution =
  | { kind: "none" }
  | { kind: "denied"; reason: "malformed" | "unknown" | "mixed" }
  | { kind: "series"; seriesKey: string };

/** Only exact productKey -> static product -> unique brand slug mapping is authoritative.
 * Never use recipeName, client-supplied brand, checkoutGroupKey or name matching. */
export function resolveSupplierOrderScope(
  ingredients: unknown
): SupplierScopeResolution {
  const lines = records(ingredients);
  if (!lines) return { kind: "denied", reason: "malformed" };
  const limited = lines.filter(line => line.kind === "limited_product");
  if (!limited.length) return { kind: "none" };
  // A supplier must never receive ordinary/unknown lines bundled into a limited order.
  if (limited.length !== lines.length)
    return { kind: "denied", reason: "mixed" };
  const keys = new Set<string>();
  for (const line of limited) {
    const products = mibanLimitedProducts.filter(
      product => product.key === line.productKey
    );
    if (products.length !== 1) return { kind: "denied", reason: "unknown" };
    if (
      typeof line.skuId !== "string" ||
      !products[0].skus.some(sku => sku.id === line.skuId) ||
      !Number.isSafeInteger(Number(line.quantity)) ||
      Number(line.quantity) <= 0
    )
      return { kind: "denied", reason: "unknown" };
    const matches = mibanLimitedBrands.filter(
      series => series.brand === products[0].brand
    );
    if (matches.length !== 1) return { kind: "denied", reason: "unknown" };
    keys.add(matches[0].slug);
  }
  return keys.size === 1
    ? { kind: "series", seriesKey: Array.from(keys)[0] }
    : { kind: "denied", reason: "mixed" };
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}
function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function moneyCents(value: unknown): bigint {
  const match = /^(\d{1,14})(?:\.(\d{1,2}))?$/.exec(String(value ?? ""));
  return match
    ? BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"))
    : BigInt(0);
}
function centsText(value: bigint): string {
  return `${value / BigInt(100)}.${String(value % BigInt(100)).padStart(2, "0")}`;
}

/** DTO allowlist: no wallet, commission, adminNote or other ingredient properties. */
export function parseSupplierOrderItems(
  ingredients: unknown
): SupplierOrderItemDTO[] {
  return (records(ingredients) ?? []).flatMap(line => {
    if (
      line.kind !== "limited_product" ||
      typeof line.productKey !== "string" ||
      typeof line.skuId !== "string"
    )
      return [];
    const product = mibanLimitedProducts.find(
      product => product.key === line.productKey
    );
    const sku = product?.skus.find(sku => sku.id === line.skuId);
    const quantity = positiveInteger(line.quantity, 0);
    if (!product || !sku || !quantity) return [];
    return [
      {
        productKey: product.key,
        skuId: sku.id,
        name: text(line.name, product.detail.title),
        skuName: text(line.skuName, sku.name),
        quantity,
        quantityPerOrder: positiveInteger(
          line.quantityPerOrder,
          sku.quantityPerOrder
        ),
        unitLabel: text(line.unitLabel, sku.unitLabel),
        lineTotal: centsText(moneyCents(line.lineTotalCny ?? line.lineTotal)),
      },
    ];
  });
}

/** MySQL business timestamps are Beijing wall time; offset-bearing input is converted explicitly. */
export function supplierTimestamp(value: unknown): string {
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}(?: |T)\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
  )
    return value.replace("T", " ");
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const p = (type: string) =>
    parts.find(part => part.type === type)?.value ?? "";
  return `${p("year")}-${p("month")}-${p("day")} ${p("hour")}:${p("minute")}:${p("second")}`;
}

export type SupplierOrderSource = {
  id: number;
  orderNo: string;
  createdAt: unknown;
  status: SupplierOrderStatus;
  totalPrice: string;
  ingredients: unknown;
  userName?: string | null;
  userUsername?: string | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
  receiverAddress?: string | null;
  trackingNo?: string | null;
  trackingCompany?: string | null;
  shippedAt?: unknown;
};
export function toSupplierOrderDTO(
  order: SupplierOrderSource
): SupplierOrderDTO {
  return {
    id: order.id,
    orderNo: order.orderNo,
    createdAt: supplierTimestamp(order.createdAt),
    status: order.status,
    totalPrice: centsText(moneyCents(order.totalPrice)),
    userName: order.userName ?? null,
    userUsername: order.userUsername ?? null,
    receiverName: order.receiverName ?? "",
    receiverPhone: order.receiverPhone ?? "",
    receiverAddress: order.receiverAddress ?? "",
    trackingNo: order.trackingNo ?? null,
    trackingCompany: order.trackingCompany ?? null,
    shippedAt: order.shippedAt ? supplierTimestamp(order.shippedAt) : null,
    items: parseSupplierOrderItems(order.ingredients),
  };
}

export function isSupplierDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function supplierDateBounds(filters: SupplierFilters = {}): {
  from?: string;
  to?: string;
} {
  if (
    (filters.dateFrom && !isSupplierDate(filters.dateFrom)) ||
    (filters.dateTo && !isSupplierDate(filters.dateTo))
  )
    throw new Error("日期无效");
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)
    throw new Error("开始日期不能晚于结束日期");
  return {
    from: filters.dateFrom ? `${filters.dateFrom} 00:00:00` : undefined,
    to: filters.dateTo ? `${filters.dateTo} 23:59:59.999` : undefined,
  };
}
export function filterSupplierOrders(
  orders: readonly SupplierOrderDTO[],
  filters: SupplierFilters = {}
): SupplierOrderDTO[] {
  const bounds = supplierDateBounds(filters);
  const keyword = (filters.keyword ?? "").trim().toLocaleLowerCase();
  return orders.filter(order => {
    const date = supplierTimestamp(order.createdAt);
    return (
      (!bounds.from || date >= bounds.from) &&
      (!bounds.to || date <= bounds.to) &&
      (!filters.status ||
        filters.status === "all" ||
        order.status === filters.status) &&
      (!keyword ||
        [
          order.orderNo,
          order.userName,
          order.userUsername,
          order.receiverName,
          order.receiverPhone,
          order.trackingNo,
          ...order.items.map(item => item.name),
        ].some(value => value?.toLocaleLowerCase().includes(keyword)))
    );
  });
}
export function supplierStats(
  orders: readonly SupplierOrderDTO[]
): SupplierStatsDTO {
  const sold = orders.filter(order => order.status !== "cancelled");
  return {
    orderCount: orders.length,
    soldUnits: sold.reduce(
      (sum, order) =>
        sum +
        order.items.reduce(
          (n, item) => n + item.quantity * item.quantityPerOrder,
          0
        ),
      0
    ),
    salesCny: centsText(
      sold.reduce((sum, order) => sum + moneyCents(order.totalPrice), BigInt(0))
    ),
    pendingCount: orders.filter(order =>
      ["pending", "confirmed", "packing"].includes(order.status)
    ).length,
    shippedCount: orders.filter(order => order.status === "shipped").length,
    deliveredCount: orders.filter(order => order.status === "delivered").length,
    cancelledCount: orders.filter(order => order.status === "cancelled").length,
  };
}
export function supplierCsvCell(value: unknown): string {
  let cell = String(value ?? "");
  // Defend spreadsheet formula execution even behind whitespace/control characters.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(cell) || /^[\t\r\n]/.test(cell))
    cell = `'${cell}`;
  return `"${cell.replace(/"/g, '""')}"`;
}
export function supplierOrdersCsv(orders: readonly SupplierOrderDTO[]): string {
  const rows: unknown[][] = [
    [
      "订单号",
      "下单时间",
      "状态",
      "订单金额(CNY)",
      "购买人",
      "用户名",
      "收货人",
      "联系电话",
      "收货地址",
      "快递公司",
      "快递单号",
      "发货时间",
      "商品",
      "规格",
      "购买数量",
      "每份件数",
      "单位",
      "行金额(CNY)",
    ],
  ];
  for (const order of orders)
    for (const item of order.items)
      rows.push([
        order.orderNo,
        order.createdAt,
        order.status,
        order.totalPrice,
        order.userName,
        order.userUsername,
        order.receiverName,
        order.receiverPhone,
        order.receiverAddress,
        order.trackingCompany,
        order.trackingNo,
        order.shippedAt,
        item.name,
        item.skuName,
        item.quantity,
        item.quantityPerOrder,
        item.unitLabel,
        item.lineTotal,
      ]);
  return `\uFEFF${rows.map(row => row.map(supplierCsvCell).join(",")).join("\r\n")}\r\n`;
}
