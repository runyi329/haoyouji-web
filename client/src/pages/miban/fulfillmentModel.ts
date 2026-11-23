import {
  FULFILLMENT_CARRIERS,
  normalizeTrackingCompany,
  normalizeTrackingNo,
  type FulfillmentMode,
  type FulfillmentRow,
  type FulfillmentPreviewRow,
  type FulfillmentPreviewOutput,
  type FulfillmentApplyRow,
  type FulfillmentApplyOutput,
} from "@shared/miban-fulfillment";
export { FULFILLMENT_CARRIERS };
export type {
  FulfillmentMode,
  FulfillmentRow,
  FulfillmentPreviewRow,
  FulfillmentPreviewOutput,
  FulfillmentApplyRow,
  FulfillmentApplyOutput,
};
export type FulfillmentCandidate = {
  id: number;
  orderNo: string;
  status: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  trackingCompany: string | null;
  trackingNo: string | null;
  products: string;
  specifications: string;
  quantities: string;
};
export type FulfillmentDraft = FulfillmentRow & {
  line?: number;
  error?: string;
};
export type FulfillmentOutcome = FulfillmentRow & {
  state: "success" | "failed" | "unknown";
  error?: string;
};
export const FULFILLMENT_MAX_ROWS = 500;
export const FULFILLMENT_BATCH_SIZE = 100;
export const normalizeFulfillmentCarrier = normalizeTrackingCompany;
export function fulfillmentModeError(
  order: Pick<FulfillmentCandidate, "status" | "trackingNo">,
  mode: FulfillmentMode
): string | undefined {
  if (mode === "correct")
    return order.status === "shipped" ? undefined : "更正模式仅接受已发货订单";
  if (!["pending", "confirmed", "packing"].includes(order.status))
    return "正常发货仅接受待确认、已确认或配货中订单";
  if (order.trackingNo?.trim())
    return "已有运单，不能用正常发货覆盖；请核验状态并使用更正模式";
  return undefined;
}
export function validateFulfillmentDrafts(
  rows: readonly FulfillmentDraft[],
  candidates?: readonly FulfillmentCandidate[],
  mode?: FulfillmentMode
): FulfillmentDraft[] {
  if (rows.length > FULFILLMENT_MAX_ROWS)
    throw new Error("最多处理 500 行，请拆分文件。");
  const orders = new Map(candidates?.map(order => [order.orderNo, order]));
  const counts = new Map<string, number>();
  const trackingOrders = new Map<string, Set<string>>();
  for (const row of rows) {
    const no = row.orderNo.trim();
    counts.set(no, (counts.get(no) ?? 0) + 1);
    const key = `${normalizeFulfillmentCarrier(row.trackingCompany)}\u0000${row.trackingNo.trim()}`;
    if (row.trackingCompany.trim() && row.trackingNo.trim()) {
      const set = trackingOrders.get(key) ?? new Set<string>();
      set.add(no);
      trackingOrders.set(key, set);
    }
  }
  return rows.map(row => {
    const orderNo = row.orderNo.trim();
    const trackingCompany = normalizeFulfillmentCarrier(row.trackingCompany);
    const trackingNo = normalizeTrackingNo(row.trackingNo);
    const errors: string[] = row.error ? [row.error] : [];
    if (!orderNo) errors.push("缺少订单号");
    if (!trackingCompany) errors.push("缺少快递公司");
    if (!trackingNo) errors.push("缺少快递单号");
    if (
      orderNo.length > 32 ||
      trackingCompany.length > 32 ||
      trackingNo.length > 64
    )
      errors.push("字段过长");
    for (const value of [orderNo, trackingCompany, trackingNo]) {
      if (/[\r\n\u0000-\u001f\u007f]/.test(value))
        errors.push("发货字段不能含换行或控制字符");
      if (/^[\s\u0000-\u001f]*[=+@-]/.test(value))
        errors.push("拒绝公式或公式注入字段，请按文本填写");
    }
    if (
      [orderNo, trackingNo].some(value =>
        /^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(value)
      )
    )
      errors.push("拒绝科学计数法识别码，不能恢复丢失精度；请使用原始文本单号");
    if ((counts.get(orderNo) ?? 0) > 1) errors.push("订单号重复");
    if (
      (trackingOrders.get(`${trackingCompany}\u0000${trackingNo}`)?.size ?? 0) >
      1
    )
      errors.push("不同订单使用同一快递及运单，一期不支持合单");
    if (candidates) {
      const order = orders.get(orderNo);
      if (!order)
        errors.push("订单不在当前授权/筛选列表，请调整筛选后重新载入");
      else if (mode) {
        const error = fulfillmentModeError(order, mode);
        if (error) errors.push(error);
      }
    }
    return {
      ...row,
      orderNo,
      trackingCompany,
      trackingNo,
      error: errors.length ? Array.from(new Set(errors)).join("；") : undefined,
    };
  });
}
export function onlyFailedFulfillmentRows(
  outcomes: readonly FulfillmentOutcome[]
): FulfillmentDraft[] {
  // Ambiguous network/missing responses require manual verification, never automatic replay.
  return outcomes
    .filter(row => row.state === "failed")
    .map(({ orderNo, trackingCompany, trackingNo }) => ({
      orderNo,
      trackingCompany,
      trackingNo,
    }));
}
export async function previewFulfillmentBatches(
  rows: readonly FulfillmentRow[],
  request: (rows: FulfillmentRow[]) => Promise<FulfillmentPreviewOutput>,
  progress?: (done: number) => void
): Promise<FulfillmentPreviewRow[]> {
  const output: FulfillmentPreviewRow[] = [];
  for (let offset = 0; offset < rows.length; offset += FULFILLMENT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + FULFILLMENT_BATCH_SIZE);
    try {
      const response = await request(batch);
      batch.forEach((row, index) => {
        const matches = response.rows.filter(
          result => result.index === index && result.orderNo === row.orderNo
        );
        const result = matches.length === 1 ? matches[0] : undefined;
        // Bind revisions to exactly the values we showed; never silently accept a different plan.
        const planMatches =
          result &&
          normalizeFulfillmentCarrier(result.trackingCompany) ===
            normalizeFulfillmentCarrier(row.trackingCompany) &&
          result.trackingNo === row.trackingNo;
        output.push(
          result && planMatches
            ? {
                ...result,
                index: offset + index,
                ok: result.ok && !!result.revision && !!result.order,
                error:
                  result.ok && (!result.revision || !result.order)
                    ? "预览缺少版本或客户信息，不能提交"
                    : result.error,
              }
            : {
                ...row,
                index: offset + index,
                ok: false,
                error: "服务端未返回唯一匹配的预览，请重新预览",
              }
        );
      });
    } catch (reason) {
      batch.forEach((row, index) =>
        output.push({
          ...row,
          index: offset + index,
          ok: false,
          error: reason instanceof Error ? reason.message : "服务端预览失败",
        })
      );
    }
    progress?.(Math.min(offset + batch.length, rows.length));
  }
  return output;
}
export async function applyFulfillmentBatches(
  rows: readonly FulfillmentApplyRow[],
  request: (rows: FulfillmentApplyRow[]) => Promise<FulfillmentApplyOutput>,
  progress?: (done: number) => void
): Promise<FulfillmentOutcome[]> {
  const output: FulfillmentOutcome[] = [];
  for (let offset = 0; offset < rows.length; offset += FULFILLMENT_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + FULFILLMENT_BATCH_SIZE);
    try {
      const response = await request(batch);
      batch.forEach((row, index) => {
        const matches = response.results.filter(
          result => result.index === index && result.orderNo === row.orderNo
        );
        const result = matches.length === 1 ? matches[0] : undefined;
        output.push({
          orderNo: row.orderNo,
          trackingCompany: row.trackingCompany,
          trackingNo: row.trackingNo,
          state: !result ? "unknown" : result.success ? "success" : "failed",
          error: !result
            ? "服务端未返回唯一结果，需人工核验，禁止自动重试"
            : result.error,
        });
      });
    } catch (reason) {
      batch.forEach(row =>
        output.push({
          orderNo: row.orderNo,
          trackingCompany: row.trackingCompany,
          trackingNo: row.trackingNo,
          state: "unknown",
          error: `请求结果不明，需人工核验，不自动重试：${reason instanceof Error ? reason.message : "网络错误"}`,
        })
      );
    }
    progress?.(Math.min(offset + batch.length, rows.length));
  }
  return output;
}
export function isFulfillmentOrderQuery(queryKey: readonly unknown[]): boolean {
  const route: unknown = queryKey[0];
  if (!Array.isArray(route) || !route.every(part => typeof part === "string"))
    return false;
  const path = route.join(".");
  return (
    /(?:^|\.)supplier\.(workspace|orders|stats|exportOrders)$/.test(path) ||
    /(?:^|\.)order\.(allOrders|myOrders|teamOrders|exportOrders|detail|getOrder|stats)$/.test(
      path
    )
  );
}
/** Administrator API ingredients are read-only display data, not an authority source. */
export function fulfillmentCandidateFromOrder(
  value: unknown
): FulfillmentCandidate | null {
  if (!value || typeof value !== "object") return null;
  const order = value as Record<string, unknown>;
  if (
    typeof order.id !== "number" ||
    typeof order.orderNo !== "string" ||
    typeof order.status !== "string"
  )
    return null;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  let items: unknown = order.items ?? order.ingredients;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items) as unknown;
    } catch {
      items = [];
    }
  }
  const lines = Array.isArray(items)
    ? items.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === "object" && !Array.isArray(item)
      )
    : [];
  return {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    receiverName: text(order.receiverName),
    receiverPhone: text(order.receiverPhone),
    receiverAddress: text(order.receiverAddress),
    trackingCompany:
      typeof order.trackingCompany === "string" ? order.trackingCompany : null,
    trackingNo: typeof order.trackingNo === "string" ? order.trackingNo : null,
    products:
      lines
        .map(
          line =>
            text(line.name) || text(line.productName) || text(line.riceName)
        )
        .filter(Boolean)
        .join("；") || text(order.recipeName),
    specifications:
      lines
        .map(
          line =>
            text(line.skuName) || text(line.specification) || text(line.spec)
        )
        .filter(Boolean)
        .join("；") ||
      (typeof order.weight === "number"
        ? `${order.weight}kg`
        : text(order.weight)),
    quantities:
      lines
        .map(
          line =>
            `${typeof line.quantity === "number" || typeof line.quantity === "string" ? line.quantity : ""}${text(line.unitLabel)}${typeof line.quantityPerOrder === "number" ? `（每份${line.quantityPerOrder}）` : ""}`
        )
        .filter(Boolean)
        .join("；") ||
      (typeof order.quantity === "number"
        ? String(order.quantity)
        : text(order.quantity)),
  };
}
