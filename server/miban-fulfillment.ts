import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  FULFILLMENT_BATCH_LIMIT,
  normalizeFulfillmentRow,
  normalizeTrackingCompany,
  normalizeTrackingNo,
  type FulfillmentMode,
  type FulfillmentRow,
  type FulfillmentPreviewInput,
  type FulfillmentPreviewOutput,
  type FulfillmentApplyInput,
  type FulfillmentApplyOutput,
  type FulfillmentOrderDTO,
} from "../shared/miban-fulfillment";
import {
  resolveSupplierOrderScope,
  supplierTimestamp,
} from "../shared/miban-supplier";
import type {
  SupplierActor,
  SupplierConnectionFactory,
  SupplierSqlExecutor,
} from "./miban-supplier";

const idSchema = z.number().int().positive().max(2147483647);
// Field errors belong to individual rows (so a bad spreadsheet cell doesn't hide valid rows).
const rowSchema = z.object({
  orderNo: z.string().max(200),
  trackingCompany: z.string().max(200),
  trackingNo: z.string().max(200),
});
export const fulfillmentPreviewSchema = z.object({
  supplierId: idSchema.optional(),
  mode: z.enum(["ship", "correct"]),
  rows: z.array(rowSchema).min(1).max(FULFILLMENT_BATCH_LIMIT),
});
export const fulfillmentApplySchema = z.object({
  supplierId: idSchema.optional(),
  mode: z.enum(["ship", "correct"]),
  rows: z
    .array(rowSchema.extend({ revision: z.string().regex(/^[a-f0-9]{64}$/) }))
    .min(1)
    .max(FULFILLMENT_BATCH_LIMIT),
});
export const FULFILLMENT_PREVIEW_REQUIRED =
  "物流操作必须先预览，再通过 supplier.fulfillmentApply 提交带 revision 的确认行";
export function rejectLegacyFulfillment(): never {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: FULFILLMENT_PREVIEW_REQUIRED,
  });
}
export function isFulfillmentAdmin(actor: SupplierActor): boolean {
  return actor.role === "super_admin";
}
function forbidden(): never {
  throw new TRPCError({ code: "FORBIDDEN", message: "无此供货商或订单权限" });
}
function bad(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}
function conflict(): never {
  throw new TRPCError({
    code: "CONFLICT",
    message: "订单或物流计划已变化，请重新预览（请勿重复提交）",
  });
}
function safeError(error: unknown): string {
  return error instanceof TRPCError &&
    ["FORBIDDEN", "BAD_REQUEST", "CONFLICT"].includes(error.code)
    ? error.message
    : "本行处理失败，请重新预览后重试";
}
async function query<T>(
  db: SupplierSqlExecutor,
  sql: string,
  values: unknown[] = []
): Promise<T[]> {
  return ((await db.execute(sql, values)) as [T[], unknown])[0];
}
export type FulfillmentOrder = FulfillmentOrderDTO & {
  ingredients: unknown;
  autoConfirmAt: string | null;
  userId?: number;
  updatedAt?: string | null;
  auditVersion?: number;
};
type Scope = { orderId: number; seriesKey: string; supplierId: number | null };
type Authorizer = (
  db: SupplierSqlExecutor,
  actor: SupplierActor,
  supplierId: number
) => Promise<{ active: number | boolean }>;
// Shared secret is stable across workers/restarts when configured. No insecure fixed fallback.
// In an unconfigured sandbox a restart safely invalidates previews instead of allowing forged tokens.
const processSecret = randomBytes(32).toString("hex");
function revision(
  order: FulfillmentOrder,
  scope: Scope | null,
  actor: SupplierActor,
  input: { supplierId?: number; mode: FulfillmentMode },
  row: FulfillmentRow
): string {
  const state = {
    v: 1,
    actorId: actor.id,
    role: actor.role,
    supplierId: input.supplierId ?? null,
    mode: input.mode,
    row,
    order: {
      id: order.id,
      orderNo: order.orderNo,
      userId: order.userId ?? null,
      status: order.status,
      receiverName: order.receiverName,
      receiverPhone: order.receiverPhone,
      receiverAddress: order.receiverAddress,
      trackingCompany: order.trackingCompany,
      trackingNo: order.trackingNo,
      updatedAt: order.updatedAt ?? null,
      auditVersion: order.auditVersion ?? 0,
      shippedAt: order.shippedAt,
      autoConfirmAt: order.autoConfirmAt,
      ingredients:
        typeof order.ingredients === "string"
          ? order.ingredients
          : JSON.stringify(order.ingredients),
    },
    scope,
  };
  return createHmac(
    "sha256",
    process.env.MIBAN_FULFILLMENT_SECRET ||
      process.env.JWT_SECRET ||
      processSecret
  )
    .update(JSON.stringify(state))
    .digest("hex");
}
function equalRevision(a: string, b: string): boolean {
  return (
    /^[a-f0-9]{64}$/.test(b) &&
    timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
  );
}
function fieldError(row: FulfillmentRow): string | undefined {
  if (
    !row.orderNo ||
    row.orderNo.length > 32 ||
    /[\u0000-\u001f\u007f]/.test(row.orderNo)
  )
    return "订单号无效";
  if (
    !row.trackingCompany ||
    row.trackingCompany.length > 32 ||
    /[\u0000-\u001f\u007f]/.test(row.trackingCompany)
  )
    return "快递公司无效（最多32字符）";
  if (
    !row.trackingNo ||
    row.trackingNo.length > 64 ||
    /\s|[\u0000-\u001f\u007f]/.test(row.trackingNo) ||
    /^[=+@-]/.test(row.trackingNo) ||
    /^\d+(?:\.\d+)?[eE][+-]?\d+$/.test(row.trackingNo)
  )
    return "运单号无效，请按文本填写完整单号（最多64字符）";
}
function duplicateErrors(rows: FulfillmentRow[]): Map<number, string> {
  const errors = new Map<number, string>();
  rows.forEach((row, i) => {
    if (
      rows.some(
        (other, j) =>
          j !== i && row.orderNo.toUpperCase() === other.orderNo.toUpperCase()
      )
    )
      errors.set(i, "同一批次订单号重复，请删除重复行后重新预览");
    else if (
      rows.some(
        (other, j) =>
          j !== i &&
          row.orderNo !== other.orderNo &&
          row.trackingCompany === other.trackingCompany &&
          row.trackingNo.toUpperCase() === other.trackingNo.toUpperCase()
      )
    )
      errors.set(i, "同一快递公司与运单号不能用于不同订单（暂不支持合单）");
  });
  return errors;
}
function validateMode(
  order: FulfillmentOrder,
  mode: FulfillmentMode,
  row: FulfillmentRow
): void {
  if (mode === "ship") {
    if (!["pending", "confirmed", "packing"].includes(order.status))
      bad("正常发货只允许待处理、已确认或备货中订单；已发货请明确使用更正物流");
    if (order.trackingNo?.trim() || order.shippedAt)
      bad("订单已有物流或首次发货记录，不能覆盖，请使用更正物流并核对状态");
  } else {
    if (order.status !== "shipped")
      bad("更正物流只允许已发货订单，已取消或已收货订单不能更正");
    if (
      normalizeTrackingCompany(order.trackingCompany ?? "") ===
        row.trackingCompany &&
      normalizeTrackingNo(order.trackingNo ?? "") === row.trackingNo
    )
      bad("新旧物流相同，无需更正；请勿重复提交");
  }
}
const orderProjection = `o.id,o.orderNo,o.userId,o.status,o.ingredients,o.receiverName,o.receiverPhone,o.receiverAddress,o.trackingCompany,o.trackingNo,DATE_FORMAT(o.updatedAt,'%Y-%m-%d %H:%i:%s') AS updatedAt,DATE_FORMAT(o.shippedAt,'%Y-%m-%d %H:%i:%s') AS shippedAt,DATE_FORMAT(o.autoConfirmAt,'%Y-%m-%d %H:%i:%s') AS autoConfirmAt`;
function dto(order: FulfillmentOrder): FulfillmentOrderDTO {
  return {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    receiverName: order.receiverName ?? "",
    receiverPhone: order.receiverPhone ?? "",
    receiverAddress: order.receiverAddress ?? "",
    trackingCompany: order.trackingCompany ?? null,
    trackingNo: order.trackingNo ?? null,
    shippedAt: order.shippedAt ?? null,
  };
}
/** GET_LOCK is session-owned, acquired BEFORE beginTransaction, released AFTER commit/rollback on
 * this exact physical connection. All logistics entry points use this guard or explicitly reject.
 * It serializes even the absent cross-order match (no schema/index migration required).
 * FOR UPDATE still protects against address/status updates from non-logistics entry points. */
const guard = "miban.fulfillment.v1";
export function createFulfillmentService(
  factory: SupplierConnectionFactory,
  authorize: Authorizer
) {
  async function transaction<T>(
    operation: (db: SupplierSqlExecutor) => Promise<T>,
    guardLogistics = false
  ): Promise<T> {
    const db = await factory();
    if (!db)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "数据库不可用",
      });
    let acquired = false,
      begun = false,
      releaseConnection = true;
    try {
      if (guardLogistics) {
        const [lock] = await query<{ acquired: number }>(
          db,
          "SELECT GET_LOCK(?,5) AS acquired",
          [guard]
        );
        if (Number(lock?.acquired) !== 1)
          throw new TRPCError({
            code: "CONFLICT",
            message: "其他物流操作正在提交，请稍后重新预览重试",
          });
        acquired = true;
      }
      await db.beginTransaction();
      begun = true;
      const result = await operation(db);
      await db.commit();
      begun = false;
      return result;
    } catch (error) {
      if (begun) await db.rollback();
      throw error;
    } finally {
      if (acquired) {
        try {
          const [lock] = await query<{ released: number }>(
            db,
            "SELECT RELEASE_LOCK(?) AS released",
            [guard]
          );
          if (Number(lock?.released) !== 1)
            throw new Error("fulfillment lock release failed");
        } catch {
          // Never return a session with an uncertain named lock into the connection pool.
          releaseConnection = false;
          const physical = db as typeof db & {
            destroy?: () => void;
            end?: () => Promise<unknown>;
          };
          if (physical.destroy) physical.destroy();
          else if (physical.end) await physical.end();
        }
      }
      if (releaseConnection) db.release?.();
    }
  }
  async function authorizeRequest(
    db: SupplierSqlExecutor,
    actor: SupplierActor,
    supplierId?: number
  ) {
    if (isFulfillmentAdmin(actor)) return;
    if (!supplierId) forbidden();
    const supplier = await authorize(db, actor, supplierId);
    if (!supplier.active) forbidden();
  }
  async function load(
    db: SupplierSqlExecutor,
    actor: SupplierActor,
    input: { supplierId?: number },
    row: FulfillmentRow
  ): Promise<{ order: FulfillmentOrder; scope: Scope | null }> {
    await authorizeRequest(db, actor, input.supplierId);
    const [order] = await query<FulfillmentOrder>(
      db,
      `SELECT ${orderProjection} FROM miban_orders o WHERE o.orderNo=? FOR UPDATE`,
      [row.orderNo]
    );
    if (!order) {
      if (!isFulfillmentAdmin(actor)) forbidden();
      bad("订单不存在");
    }
    const [scope] = await query<Scope>(
      db,
      `SELECT order_id AS orderId,series_key AS seriesKey,supplier_id AS supplierId FROM miban_supplier_order_scope WHERE order_id=? FOR UPDATE`,
      [order.id]
    );
    if (!isFulfillmentAdmin(actor)) {
      const resolved = resolveSupplierOrderScope(order.ingredients);
      if (
        !scope ||
        scope.supplierId !== input.supplierId ||
        resolved.kind !== "series" ||
        resolved.seriesKey !== scope.seriesKey
      )
        forbidden();
    }
    const [lastAudit] = await query<{ id: number }>(
      db,
      "SELECT id FROM miban_supplier_audit WHERE order_id=? ORDER BY id DESC LIMIT 1 FOR UPDATE",
      [order.id]
    );
    order.auditVersion = Number(lastAudit?.id ?? 0);
    return { order, scope: scope ?? null };
  }
  async function checkExistingTracking(
    db: SupplierSqlExecutor,
    orderId: number,
    row: FulfillmentRow,
    lock: boolean
  ) {
    // Normalize legacy carrier aliases as well, not just new canonical values. Full scan is a safe
    // interim strategy without new indexes; do not expose the conflicting customer's order/details.
    const orders = await query<{
      id: number;
      trackingCompany: string | null;
      trackingNo: string | null;
    }>(
      db,
      `SELECT id,trackingCompany,trackingNo FROM miban_orders WHERE trackingNo IS NOT NULL AND id<>?${lock ? " FOR UPDATE" : ""}`,
      [orderId]
    );
    if (
      orders.some(
        other =>
          normalizeTrackingCompany(other.trackingCompany ?? "") ===
            row.trackingCompany &&
          normalizeTrackingNo(other.trackingNo ?? "").toUpperCase() ===
            row.trackingNo.toUpperCase()
      )
    )
      bad("同一快递公司与运单号已用于其他订单（暂不支持合单）");
  }
  return {
    async preview(
      actor: SupplierActor,
      input: FulfillmentPreviewInput
    ): Promise<FulfillmentPreviewOutput> {
      fulfillmentPreviewSchema.parse(input);
      const normalized = input.rows.map(normalizeFulfillmentRow),
        duplicates = duplicateErrors(normalized);
      return transaction(async db => {
        await authorizeRequest(db, actor, input.supplierId);
        const rows: FulfillmentPreviewOutput["rows"] = [];
        for (const [index, row] of Array.from(normalized.entries())) {
          try {
            const message = fieldError(row) ?? duplicates.get(index);
            if (message) bad(message);
            const { order, scope } = await load(db, actor, input, row);
            validateMode(order, input.mode, row);
            await checkExistingTracking(db, order.id, row, false);
            rows.push({
              index,
              ...row,
              ok: true,
              revision: revision(order, scope, actor, input, row),
              order: dto(order),
            });
          } catch (error) {
            // Infrastructure errors must not turn into a successful misleading preview envelope.
            if (!(error instanceof TRPCError)) throw error;
            rows.push({ index, ...row, ok: false, error: safeError(error) });
          }
        }
        return { rows, validCount: rows.filter(row => row.ok).length };
      });
    },
    async apply(
      actor: SupplierActor,
      input: FulfillmentApplyInput,
      now = new Date()
    ): Promise<FulfillmentApplyOutput> {
      fulfillmentApplySchema.parse(input);
      await transaction(db => authorizeRequest(db, actor, input.supplierId));
      const normalized = input.rows.map(normalizeFulfillmentRow),
        duplicates = duplicateErrors(normalized);
      const results: FulfillmentApplyOutput["results"] = [];
      for (const [index, row] of Array.from(normalized.entries())) {
        try {
          const message = fieldError(row) ?? duplicates.get(index);
          if (message) bad(message);
          await transaction(async db => {
            // Locks and authorization belong to EACH row's transaction, not only the initial check.
            const { order, scope } = await load(db, actor, input, row);
            if (
              !equalRevision(
                revision(order, scope, actor, input, row),
                input.rows[index].revision
              )
            )
              conflict();
            validateMode(order, input.mode, row);
            await checkExistingTracking(db, order.id, row, true);
            const before = {
              ...dto(order),
              autoConfirmAt: order.autoConfirmAt,
              scope,
            };
            const shippedAt =
              input.mode === "ship" ? supplierTimestamp(now) : order.shippedAt;
            const autoConfirmAt =
              input.mode === "ship"
                ? supplierTimestamp(
                    new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
                  )
                : order.autoConfirmAt;
            if (input.mode === "ship")
              await db.execute(
                `UPDATE miban_orders SET status='shipped',trackingCompany=?,trackingNo=?,shippedAt=?,autoConfirmAt=? WHERE id=?`,
                [
                  row.trackingCompany,
                  row.trackingNo,
                  shippedAt,
                  autoConfirmAt,
                  order.id,
                ]
              );
            else
              await db.execute(
                `UPDATE miban_orders SET status='shipped',trackingCompany=?,trackingNo=? WHERE id=?`,
                [row.trackingCompany, row.trackingNo, order.id]
              );
            const after = {
              ...before,
              status: "shipped",
              trackingCompany: row.trackingCompany,
              trackingNo: row.trackingNo,
              shippedAt,
              autoConfirmAt,
            };
            await db.execute(
              `INSERT INTO miban_supplier_audit (actor_id,supplier_id,order_id,action,before_json,after_json) VALUES (?,?,?,?,?,?)`,
              [
                actor.id,
                scope?.supplierId ?? null,
                order.id,
                input.mode === "ship" ? "ship" : "correct_tracking",
                JSON.stringify(before),
                JSON.stringify(after),
              ]
            );
          }, true);
          results.push({ index, orderNo: row.orderNo, success: true });
        } catch (error) {
          results.push({
            index,
            orderNo: row.orderNo,
            success: false,
            error: safeError(error),
          });
        }
      }
      return {
        successCount: results.filter(row => row.success).length,
        results,
      };
    },
  };
}
