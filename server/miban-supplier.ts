import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Connection, PoolConnection } from "mysql2/promise";
import { getDbTransactionConnection } from "./db";
import { protectedProcedure, router } from "./_core/trpc";
import {
  createFulfillmentService,
  fulfillmentPreviewSchema,
  fulfillmentApplySchema,
  rejectLegacyFulfillment,
} from "./miban-fulfillment";
import {
  supplierCatalog,
  resolveSupplierOrderScope,
  toSupplierOrderDTO,
  filterSupplierOrders,
  supplierStats,
  supplierOrdersCsv,
  isSupplierDate,
  supplierTimestamp,
  type SupplierDTO,
  type SupplierHistoryDTO,
  type SupplierOrderSource,
  type SupplierWorkspaceDTO,
} from "../shared/miban-supplier";

/** No connection, DDL, or initializer runs at import time. */
export interface SupplierSqlExecutor {
  execute(sql: string, values?: unknown[]): Promise<unknown>;
}
export interface SupplierTransactionConnection extends SupplierSqlExecutor {
  beginTransaction(): Promise<unknown>;
  commit(): Promise<unknown>;
  rollback(): Promise<unknown>;
  release?: () => void;
}
export type SupplierActor = { id: number; role: string };
export type SupplierConnectionFactory =
  () => Promise<SupplierTransactionConnection | null>;
const defaultConnection: SupplierConnectionFactory = async () => {
  const connection: Connection | PoolConnection | null =
    await getDbTransactionConnection();
  return connection;
};
async function rows<T>(
  db: SupplierSqlExecutor,
  query: string,
  values: unknown[] = []
): Promise<T[]> {
  const result = (await db.execute(query, values)) as [T[], unknown];
  return result[0];
}
async function insertId(
  db: SupplierSqlExecutor,
  query: string,
  values: unknown[]
): Promise<number> {
  const result = (await db.execute(query, values)) as [
    { insertId: number },
    unknown,
  ];
  return result[0].insertId;
}
export async function withSupplierTransaction<T>(
  factory: SupplierConnectionFactory,
  operation: (db: SupplierSqlExecutor) => Promise<T>
): Promise<T> {
  const db = await factory();
  if (!db)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "数据库不可用",
    });
  try {
    await db.beginTransaction();
    const value = await operation(db);
    await db.commit();
    return value;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release?.();
  }
}
function forbidden(): never {
  throw new TRPCError({ code: "FORBIDDEN", message: "无此供货商或订单权限" });
}
function bad(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}
function requireAdmin(actor: SupplierActor): void {
  if (actor.role !== "super_admin") forbidden();
}
async function audit(
  db: SupplierSqlExecutor,
  actorId: number,
  supplierId: number | null,
  orderId: number | null,
  action: string,
  before: unknown,
  after: unknown
) {
  await db.execute(
    `INSERT INTO miban_supplier_audit (actor_id,supplier_id,order_id,action,before_json,after_json) VALUES (?,?,?,?,?,?)`,
    [
      actorId,
      supplierId,
      orderId,
      action,
      JSON.stringify(before ?? null),
      JSON.stringify(after ?? null),
    ]
  );
}
type SupplierRow = { id: number; name: string; active: number | boolean };
type SeriesRow = { seriesKey: string; supplierId: number | null };
type ScopeRow = {
  orderId: number;
  seriesKey: string;
  supplierId: number | null;
};
type OrderRow = SupplierOrderSource & { autoConfirmAt: string | null };
async function supplierDTO(
  db: SupplierSqlExecutor,
  supplier: SupplierRow
): Promise<SupplierDTO> {
  const series = await rows<{ seriesKey: string }>(
    db,
    `SELECT series_key AS seriesKey FROM miban_supplier_series WHERE supplier_id=? ORDER BY series_key`,
    [supplier.id]
  );
  const members = await rows<SupplierDTO["members"][number]>(
    db,
    `SELECT m.user_id AS userId,u.name,COALESCE(u.username,'') AS username FROM miban_supplier_members m JOIN users u ON u.id=m.user_id WHERE m.supplier_id=? AND m.active=1 ORDER BY m.user_id`,
    [supplier.id]
  );
  return {
    id: supplier.id,
    name: supplier.name,
    active: Boolean(supplier.active),
    seriesKeys: series.map(row => row.seriesKey),
    members,
  };
}
/** Supplier and membership row locks are held until operation completes; adminSave takes the same locks. */
export async function authorizeSupplier(
  db: SupplierSqlExecutor,
  actor: SupplierActor,
  supplierId: number
): Promise<SupplierRow> {
  const [supplier] = await rows<SupplierRow>(
    db,
    `SELECT id,name,active FROM miban_suppliers WHERE id=? FOR UPDATE`,
    [supplierId]
  );
  if (!supplier) forbidden();
  if (actor.role === "super_admin") return supplier;
  if (!supplier.active) forbidden();
  const [membership] = await rows<{ active: number }>(
    db,
    `SELECT active FROM miban_supplier_members WHERE supplier_id=? AND user_id=? FOR UPDATE`,
    [supplierId, actor.id]
  );
  if (!membership?.active) forbidden();
  return supplier;
}

/** Run inside createOrder's SAME physical transaction. No DDL and no history inference.
 * New orders snapshot series even when no supplier exists. Later supplier allocation does NOT claim them. */
export async function snapshotMibanSupplierOrderScope(
  db: SupplierSqlExecutor,
  orderId: number,
  ingredients: unknown,
  actorId: number
): Promise<void> {
  const scope = resolveSupplierOrderScope(ingredients);
  if (scope.kind === "none") return;
  if (scope.kind !== "series")
    bad("精选订单包含无法确定归属的商品，不能创建供货商订单快照");
  await db.execute(
    `INSERT IGNORE INTO miban_supplier_series (series_key,supplier_id) VALUES (?,NULL)`,
    [scope.seriesKey]
  );
  const [series] = await rows<SeriesRow>(
    db,
    `SELECT series_key AS seriesKey,supplier_id AS supplierId FROM miban_supplier_series WHERE series_key=? FOR UPDATE`,
    [scope.seriesKey]
  );
  if (!series) throw new Error("系列快照读取失败");
  let supplierId: number | null = null;
  if (series.supplierId !== null) {
    const [supplier] = await rows<SupplierRow>(
      db,
      `SELECT id,name,active FROM miban_suppliers WHERE id=? FOR UPDATE`,
      [series.supplierId]
    );
    if (supplier?.active) supplierId = supplier.id;
  }
  // Plain INSERT enforces immutable order_id + series_key snapshot. Never UPSERT/update series_key.
  await db.execute(
    `INSERT INTO miban_supplier_order_scope (order_id,series_key,supplier_id,source) VALUES (?,?,?,'new_order')`,
    [orderId, scope.seriesKey, supplierId]
  );
  await audit(db, actorId, supplierId, orderId, "order_scope_snapshot", null, {
    seriesKey: scope.seriesKey,
    supplierId,
  });
}

const idSchema = z.number().int().positive().max(2147483647);
const dateSchema = z
  .string()
  .refine(isSupplierDate, "日期必须为有效YYYY-MM-DD");
export const supplierFiltersSchema = z
  .object({
    dateFrom: dateSchema.optional(),
    dateTo: dateSchema.optional(),
    keyword: z.string().trim().max(100).optional(),
    status: z
      .enum([
        "all",
        "pending",
        "confirmed",
        "packing",
        "shipped",
        "delivered",
        "cancelled",
      ])
      .optional(),
  })
  .refine(
    input => !input.dateFrom || !input.dateTo || input.dateFrom <= input.dateTo,
    "开始日期不能晚于结束日期"
  );
export const supplierWorkspaceSchema = z.object({
  supplierId: idSchema,
  filters: supplierFiltersSchema.optional(),
});
const trackingSchema = {
  trackingCompany: z.string().trim().min(1).max(32),
  trackingNo: z.string().trim().min(1).max(64),
};
export const supplierShipSchema = z.object({
  supplierId: idSchema,
  orderId: idSchema,
  ...trackingSchema,
});
const saveSchema = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1).max(100),
  active: z.boolean(),
  seriesKeys: z
    .array(z.string().max(64))
    .max(100)
    .refine(keys => new Set(keys).size === keys.length, "系列不能重复")
    .refine(
      keys =>
        keys.every(key =>
          supplierCatalog().series.some(series => series.key === key)
        ),
      "未知系列"
    ),
  userIds: z
    .array(idSchema)
    .max(200)
    .refine(ids => new Set(ids).size === ids.length, "成员不能重复"),
});
// DB uses Beijing business wall time. Return strings at SQL boundary instead of mysql2
// Date decoding in the Node host timezone (which may be UTC in containers).
const orderProjection = `o.id,o.orderNo,DATE_FORMAT(o.createdAt,'%Y-%m-%d %H:%i:%s') AS createdAt,o.status,o.totalPrice,o.ingredients,o.receiverName,o.receiverPhone,o.receiverAddress,o.trackingNo,o.trackingCompany,DATE_FORMAT(o.shippedAt,'%Y-%m-%d %H:%i:%s') AS shippedAt,DATE_FORMAT(o.autoConfirmAt,'%Y-%m-%d %H:%i:%s') AS autoConfirmAt`;

/** Visibility depends ONLY on explicit order scope, not current series membership or inferred names. */
async function workspace(
  db: SupplierSqlExecutor,
  actor: SupplierActor,
  input: z.infer<typeof supplierWorkspaceSchema>
): Promise<SupplierWorkspaceDTO> {
  const supplier = await authorizeSupplier(db, actor, input.supplierId);
  const dto = await supplierDTO(db, supplier);
  const catalog = supplierCatalog();
  const orders = await rows<OrderRow & { seriesKey: string }>(
    db,
    `SELECT ${orderProjection},u.name AS userName,u.username AS userUsername,s.series_key AS seriesKey FROM miban_supplier_order_scope s JOIN miban_orders o ON o.id=s.order_id LEFT JOIN users u ON u.id=o.userId WHERE s.supplier_id=? ORDER BY o.createdAt DESC,o.id DESC`,
    [input.supplierId]
  );
  const allowed = orders
    .filter(order => {
      const scope = resolveSupplierOrderScope(order.ingredients);
      return scope.kind === "series" && scope.seriesKey === order.seriesKey;
    })
    .map(toSupplierOrderDTO);
  const filtered = filterSupplierOrders(allowed, input.filters);
  return {
    supplier: dto,
    series: catalog.series.filter(series =>
      dto.seriesKeys.includes(series.key)
    ),
    products: catalog.products.filter(product =>
      dto.seriesKeys.includes(product.seriesKey)
    ),
    orders: filtered,
    stats: supplierStats(filtered),
  };
}

export async function shipSupplierOrder(
  db: SupplierSqlExecutor,
  actor: SupplierActor,
  input: z.infer<typeof supplierShipSchema>
): Promise<{ success: true }> {
  const supplier = await authorizeSupplier(db, actor, input.supplierId);
  if (actor.role !== "super_admin" && !supplier.active) forbidden();
  const [order] = await rows<OrderRow>(
    db,
    `SELECT ${orderProjection} FROM miban_orders o WHERE o.id=? FOR UPDATE`,
    [input.orderId]
  );
  const [scope] = await rows<ScopeRow>(
    db,
    `SELECT order_id AS orderId,series_key AS seriesKey,supplier_id AS supplierId FROM miban_supplier_order_scope WHERE order_id=? FOR UPDATE`,
    [input.orderId]
  );
  if (!order || !scope || scope.supplierId !== input.supplierId) forbidden();
  const resolved = resolveSupplierOrderScope(order.ingredients);
  if (resolved.kind !== "series" || resolved.seriesKey !== scope.seriesKey)
    forbidden();
  // Legacy callers lack an order version; do not auto-preview (which would defeat consent/concurrency).
  rejectLegacyFulfillment();
}

/** Injectable factory is solely for isolated tests; production router uses existing lazy DB connector. */
export function createMibanSupplierRouter(
  factory: SupplierConnectionFactory = defaultConnection
) {
  const admin = protectedProcedure.use(async ({ ctx, next }) => {
    requireAdmin(ctx.user);
    return next({ ctx });
  });
  const transaction = <T>(operation: (db: SupplierSqlExecutor) => Promise<T>) =>
    withSupplierTransaction(factory, operation);
  const fulfillment = createFulfillmentService(factory, authorizeSupplier);
  return router({
    access: protectedProcedure.query(({ ctx }) =>
      transaction(async db => {
        const actor: SupplierActor = ctx.user;
        const isAdmin = actor.role === "super_admin";
        const suppliers = await rows<SupplierRow>(
          db,
          isAdmin
            ? `SELECT id,name,active FROM miban_suppliers ORDER BY id`
            : `SELECT s.id,s.name,s.active FROM miban_suppliers s JOIN miban_supplier_members m ON m.supplier_id=s.id WHERE m.user_id=? AND m.active=1 AND s.active=1 ORDER BY s.id`,
          isAdmin ? [] : [ctx.user.id]
        );
        return {
          isAdmin,
          suppliers: await Promise.all(
            suppliers.map(supplier => supplierDTO(db, supplier))
          ),
        };
      })
    ),
    adminCatalog: admin.query(() =>
      transaction(async db => ({
        series: supplierCatalog().series,
        suppliers: await Promise.all(
          (
            await rows<SupplierRow>(
              db,
              `SELECT id,name,active FROM miban_suppliers ORDER BY id`
            )
          ).map(supplier => supplierDTO(db, supplier))
        ),
      }))
    ),
    adminSearchUsers: admin
      .input(z.object({ keyword: z.string().trim().min(1).max(100) }))
      .query(({ input }) =>
        transaction(db => {
          // Literal substring search; %/_ cannot turn into broad wildcards. No wallet/rank projection.
          const keyword = `%${input.keyword.replace(/[!%_]/g, char => `!${char}`)}%`;
          return rows<{ id: number; name: string | null; username: string }>(
            db,
            `SELECT id,name,COALESCE(username,'') AS username FROM users WHERE CAST(id AS CHAR)=? OR name LIKE ? ESCAPE '!' OR username LIKE ? ESCAPE '!' ORDER BY id LIMIT 20`,
            [input.keyword, keyword, keyword]
          );
        })
      ),
    adminSave: admin.input(saveSchema).mutation(({ input, ctx }) =>
      transaction(async db => {
        // Global stable series-lock order serializes conflicts, snapshots and history allocations.
        const allKeys = supplierCatalog()
          .series.map(series => series.key)
          .sort();
        for (const key of allKeys)
          await db.execute(
            `INSERT IGNORE INTO miban_supplier_series (series_key,supplier_id) VALUES (?,NULL)`,
            [key]
          );
        const allSeries = await rows<SeriesRow>(
          db,
          `SELECT series_key AS seriesKey,supplier_id AS supplierId FROM miban_supplier_series ORDER BY series_key FOR UPDATE`
        );
        for (const key of input.seriesKeys) {
          const owner = allSeries.find(
            series => series.seriesKey === key
          )?.supplierId;
          if (owner != null && owner !== input.id)
            throw new TRPCError({
              code: "CONFLICT",
              message: "系列已绑定其他供货商（暂停主体仍保留绑定）",
            });
        }
        let supplierId = input.id;
        let before: SupplierDTO | null = null;
        if (supplierId) {
          const [existing] = await rows<SupplierRow>(
            db,
            `SELECT id,name,active FROM miban_suppliers WHERE id=? FOR UPDATE`,
            [supplierId]
          );
          if (!existing) bad("供货商不存在");
          before = await supplierDTO(db, existing);
          const removedKeys = before.seriesKeys.filter(
            key => !input.seriesKeys.includes(key)
          );
          if (!input.active && removedKeys.length)
            bad("暂停供货商必须保留既有系列绑定");
          if (removedKeys.length) {
            const ownedSeries = await rows<{ seriesKey: string }>(
              db,
              `SELECT DISTINCT series_key AS seriesKey FROM miban_supplier_order_scope WHERE supplier_id=?`,
              [supplierId]
            );
            if (
              ownedSeries.some(series => removedKeys.includes(series.seriesKey))
            )
              bad(
                "系列已有明确归属订单，不能移除；主体调整需单独管理员显式重分配流程"
              );
          }
        }
        if (input.userIds.length) {
          const users = await rows<{ id: number }>(
            db,
            `SELECT id FROM users WHERE id IN (${input.userIds.map(() => "?").join(",")})`,
            input.userIds
          );
          if (users.length !== input.userIds.length) bad("成员账户不存在");
        }
        if (!supplierId)
          supplierId = await insertId(
            db,
            `INSERT INTO miban_suppliers (name,active) VALUES (?,?)`,
            [input.name, input.active ? 1 : 0]
          );
        else
          await db.execute(
            `UPDATE miban_suppliers SET name=?,active=? WHERE id=?`,
            [input.name, input.active ? 1 : 0, supplierId]
          );
        await rows(
          db,
          `SELECT user_id FROM miban_supplier_members WHERE supplier_id=? ORDER BY user_id FOR UPDATE`,
          [supplierId]
        );
        await db.execute(
          `UPDATE miban_supplier_members SET active=0 WHERE supplier_id=?`,
          [supplierId]
        );
        for (const userId of [...input.userIds].sort((a, b) => a - b))
          await db.execute(
            `INSERT INTO miban_supplier_members (supplier_id,user_id,active) VALUES (?,?,1) ON DUPLICATE KEY UPDATE active=1`,
            [supplierId, userId]
          );
        await db.execute(
          `UPDATE miban_supplier_series SET supplier_id=NULL WHERE supplier_id=?`,
          [supplierId]
        );
        for (const key of [...input.seriesKeys].sort())
          await db.execute(
            `UPDATE miban_supplier_series SET supplier_id=? WHERE series_key=?`,
            [supplierId, key]
          );
        // NEVER UPDATE order_scope here. Administrator must explicitly confirm each unassigned order.
        const after = await supplierDTO(db, {
          id: supplierId,
          name: input.name,
          active: input.active,
        });
        await audit(
          db,
          ctx.user.id,
          supplierId,
          null,
          "save_supplier",
          before,
          after
        );
        return after;
      })
    ),
    adminHistory: admin
      .input(z.object({ supplierId: idSchema }))
      .query(({ input, ctx }) =>
        transaction(async db => {
          const supplier = await authorizeSupplier(
            db,
            ctx.user,
            input.supplierId
          );
          const dto = await supplierDTO(db, supplier);
          const unassigned = await rows<
            OrderRow & { snapshotSeriesKey: string | null }
          >(
            db,
            `SELECT ${orderProjection},s.series_key AS snapshotSeriesKey FROM miban_orders o LEFT JOIN miban_supplier_order_scope s ON s.order_id=o.id WHERE s.supplier_id IS NULL ORDER BY o.createdAt DESC,o.id DESC`
          );
          const candidates: SupplierHistoryDTO["candidates"] = [];
          let unresolvedCount = 0;
          for (const order of unassigned) {
            const scope = resolveSupplierOrderScope(order.ingredients);
            if (scope.kind === "denied") {
              unresolvedCount++;
              continue;
            }
            if (scope.kind !== "series") continue;
            if (
              order.snapshotSeriesKey &&
              order.snapshotSeriesKey !== scope.seriesKey
            ) {
              unresolvedCount++;
              continue;
            }
            if (!dto.seriesKeys.includes(scope.seriesKey)) continue;
            const dtoOrder = toSupplierOrderDTO(order);
            candidates.push({
              id: order.id,
              orderNo: order.orderNo,
              createdAt: dtoOrder.createdAt,
              status: order.status,
              totalPrice: dtoOrder.totalPrice,
              productNames: dtoOrder.items.map(item => item.name).join("、"),
            });
          }
          return { candidates, unresolvedCount };
        })
      ),
    adminAssignHistory: admin
      .input(
        z.object({
          supplierId: idSchema,
          orderIds: z
            .array(idSchema)
            .min(1)
            .max(500)
            .refine(ids => new Set(ids).size === ids.length, "订单不能重复"),
        })
      )
      .mutation(({ input, ctx }) =>
        transaction(async db => {
          const series = await rows<SeriesRow>(
            db,
            `SELECT series_key AS seriesKey,supplier_id AS supplierId FROM miban_supplier_series ORDER BY series_key FOR UPDATE`
          );
          const supplier = await authorizeSupplier(
            db,
            ctx.user,
            input.supplierId
          );
          if (!supplier.active) bad("请先启用供货商");
          let assignedCount = 0;
          for (const orderId of [...input.orderIds].sort((a, b) => a - b)) {
            const [order] = await rows<OrderRow>(
              db,
              `SELECT ${orderProjection} FROM miban_orders o WHERE o.id=? FOR UPDATE`,
              [orderId]
            );
            if (!order) bad("订单不存在");
            const resolved = resolveSupplierOrderScope(order.ingredients);
            if (
              resolved.kind !== "series" ||
              !series.some(
                series =>
                  series.seriesKey === resolved.seriesKey &&
                  series.supplierId === input.supplierId
              )
            )
              bad("订单不能确定归属于本供货商系列");
            const [current] = await rows<ScopeRow>(
              db,
              `SELECT order_id AS orderId,series_key AS seriesKey,supplier_id AS supplierId FROM miban_supplier_order_scope WHERE order_id=? FOR UPDATE`,
              [orderId]
            );
            if (
              current?.supplierId != null &&
              current.supplierId !== input.supplierId
            )
              forbidden();
            if (current && current.seriesKey !== resolved.seriesKey)
              bad("订单系列快照不可变");
            if (current?.supplierId === input.supplierId) continue;
            if (current)
              await db.execute(
                `UPDATE miban_supplier_order_scope SET supplier_id=?,source='admin_history' WHERE order_id=? AND supplier_id IS NULL`,
                [input.supplierId, orderId]
              );
            else
              await db.execute(
                `INSERT INTO miban_supplier_order_scope (order_id,series_key,supplier_id,source) VALUES (?,?,?,'admin_history')`,
                [orderId, resolved.seriesKey, input.supplierId]
              );
            await audit(
              db,
              ctx.user.id,
              input.supplierId,
              orderId,
              "assign_history",
              current ?? null,
              { seriesKey: resolved.seriesKey, supplierId: input.supplierId }
            );
            assignedCount++;
          }
          return { assignedCount };
        })
      ),
    workspace: protectedProcedure
      .input(supplierWorkspaceSchema)
      .query(({ input, ctx }) =>
        transaction(db => workspace(db, ctx.user, input))
      ),
    exportOrders: protectedProcedure
      .input(supplierWorkspaceSchema)
      .query(({ input, ctx }) =>
        transaction(async db => ({
          csv: supplierOrdersCsv((await workspace(db, ctx.user, input)).orders),
        }))
      ),
    fulfillmentPreview: protectedProcedure
      .input(fulfillmentPreviewSchema)
      .mutation(({ input, ctx }) => fulfillment.preview(ctx.user, input)),
    fulfillmentApply: protectedProcedure
      .input(fulfillmentApplySchema)
      .mutation(({ input, ctx }) => fulfillment.apply(ctx.user, input)),
    ship: protectedProcedure
      .input(supplierShipSchema)
      .mutation(({ input, ctx }) =>
        transaction(db => shipSupplierOrder(db, ctx.user, input))
      ),
    batchShip: protectedProcedure
      .input(
        z.object({
          supplierId: idSchema,
          rows: z
            .array(
              z.object({
                orderNo: z.string().trim().min(1).max(32),
                ...trackingSchema,
              })
            )
            .min(1)
            .max(100),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Fail unauthorized callers as FORBIDDEN, not as a misleading per-row success envelope.
        await transaction(async db => {
          const supplier = await authorizeSupplier(
            db,
            ctx.user,
            input.supplierId
          );
          if ((ctx.user as SupplierActor).role !== "super_admin" && !supplier.active) forbidden();
        });
        rejectLegacyFulfillment();
      }),
  });
}
export const mibanSupplierRouter = createMibanSupplierRouter();
