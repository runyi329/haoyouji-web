// The root tRPC namespace is supplier.fulfillmentPreview / supplier.fulfillmentApply.
export type FulfillmentMode = "ship" | "correct";
export type FulfillmentRow = {
  orderNo: string;
  trackingCompany: string;
  trackingNo: string;
};
export type FulfillmentPreviewInput = {
  supplierId?: number;
  mode: FulfillmentMode;
  rows: FulfillmentRow[];
};
export type FulfillmentOrderDTO = {
  id: number;
  orderNo: string;
  status: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  trackingCompany: string | null;
  trackingNo: string | null;
  shippedAt: string | null;
};
export type FulfillmentPreviewRow = FulfillmentRow & {
  index: number;
  ok: boolean;
  error?: string;
  revision?: string;
  order?: FulfillmentOrderDTO;
};
export type FulfillmentPreviewOutput = {
  rows: FulfillmentPreviewRow[];
  validCount: number;
};
export type FulfillmentApplyRow = FulfillmentRow & { revision: string };
export type FulfillmentApplyInput = {
  supplierId?: number;
  mode: FulfillmentMode;
  rows: FulfillmentApplyRow[];
};
export type FulfillmentApplyResult = {
  index: number;
  orderNo: string;
  success: boolean;
  error?: string;
};
export type FulfillmentApplyOutput = {
  successCount: number;
  results: FulfillmentApplyResult[];
};

export const FULFILLMENT_BATCH_LIMIT = 100;
export const FULFILLMENT_CARRIERS = [
  "顺丰速运",
  "中通快递",
  "圆通速递",
  "申通快递",
  "韵达快递",
  "京东物流",
  "邮政快递",
  "EMS",
  "极兔速递",
  "德邦快递",
  "百世快递",
] as const;
const carrierAliases: Record<string, string> = {
  SF: "顺丰速运",
  SFEXPRESS: "顺丰速运",
  顺丰: "顺丰速运",
  顺丰快递: "顺丰速运",
  顺丰速运: "顺丰速运",
  ZTO: "中通快递",
  中通: "中通快递",
  中通快递: "中通快递",
  YTO: "圆通速递",
  圆通: "圆通速递",
  圆通快递: "圆通速递",
  圆通速递: "圆通速递",
  STO: "申通快递",
  申通: "申通快递",
  申通快递: "申通快递",
  YUNDA: "韵达快递",
  韵达: "韵达快递",
  韵达快递: "韵达快递",
  JD: "京东物流",
  京东: "京东物流",
  京东快递: "京东物流",
  京东物流: "京东物流",
  邮政: "邮政快递",
  中国邮政: "邮政快递",
  邮政快递: "邮政快递",
  邮政快递包裹: "邮政快递",
  EMS: "EMS",
  邮政EMS: "EMS",
  邮政特快专递: "EMS",
  JT: "极兔速递",
  "J&T": "极兔速递",
  极兔: "极兔速递",
  极兔快递: "极兔速递",
  极兔速递: "极兔速递",
  DEPPON: "德邦快递",
  德邦: "德邦快递",
  德邦物流: "德邦快递",
  德邦快递: "德邦快递",
  BEST: "百世快递",
  百世: "百世快递",
  百世快递: "百世快递",
  百世汇通: "百世快递",
};

/** Pure and browser-safe; known aliases share a canonical display name. Unknown carriers remain usable. */
export function normalizeTrackingCompany(value: string): string {
  const text = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  const key = text.replace(/[\s_-]/g, "").toUpperCase();
  return carrierAliases[key] ?? text.toUpperCase();
}
export const normalizeCarrier = normalizeTrackingCompany;

/** Tracking numbers stay text: never parse them as a number or recover lossy scientific notation. */
export function normalizeTrackingNo(value: string): string {
  return value.normalize("NFKC").trim();
}
export function normalizeFulfillmentRow(row: FulfillmentRow): FulfillmentRow {
  return {
    orderNo: row.orderNo.trim(),
    trackingCompany: normalizeTrackingCompany(row.trackingCompany),
    trackingNo: normalizeTrackingNo(row.trackingNo),
  };
}
