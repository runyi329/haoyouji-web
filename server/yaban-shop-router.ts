/**
 * 牙办齿科商城 - 订单后端路由（第三步第一批）
 *
 * 设计原则：
 *   - 先按单店跑通（tenant_id 默认 1），表已预留多租户字段
 *   - 客人下单时把购物车快照写入 shop_order + shop_order_item
 *   - 订单管理接口仅超级管理员（super_admin）可用，复用 adminProcedure
 *   - 全部使用 getDbConnection 原生 SQL（与项目现有写法一致）
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";
import { computeCouponDiscount, redeemUserCoupon } from "./yaban-coupon-router";

// 默认租户ID（单店阶段固定为 1，多租户阶段再按医院切换）
const DEFAULT_TENANT_ID = 1;

// 生成订单号：SO + yyyymmddHHMMSS + 4位随机
function genOrderNo(): string {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000); // 北京时间
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  const ts =
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds());
  const rand = pad(Math.floor(Math.random() * 10000), 4);
  return `SO${ts}${rand}`;
}

// 下单时传入的单条商品快照
const orderItemInput = z.object({
  code: z.string().max(32),
  productId: z.number().optional(),
  name: z.string().max(128),
  image: z.string().max(255).optional(),
  kind: z.enum(["product", "service"]).default("product"),
  price: z.number().min(0),
  qty: z.number().int().min(1).max(999),
});

export const yabanShopRouter = router({
  // ============ 客人侧：创建订单（下单落库） ============
  createOrder: protectedProcedure
    .input(
      z.object({
        items: z.array(orderItemInput).min(1),
        payMethod: z.enum(["wechat", "alipay"]).default("wechat"),
        remark: z.string().max(500).optional(),
        userPhone: z.string().max(20).optional(),
        userCouponId: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "数据库连接失败",
        });

      // 服务端按数据库真实价格重算（彻底不信任前端价格）
      // 先按 product_code(=legacy_code) 批量查库内价格
      const codes = input.items.map((it) => it.code).filter(Boolean);
      const priceMap = new Map<string, { price: number; name: string; image: string | null; kind: string }>();
      if (codes.length > 0) {
        const placeholders = codes.map(() => "?").join(",");
        const [prows] = (await (conn as any).execute(
          `SELECT legacy_code, name, image, kind, price FROM shop_product
           WHERE tenant_id = ? AND legacy_code IN (${placeholders})`,
          [DEFAULT_TENANT_ID, ...codes]
        )) as any;
        for (const r of prows as any[]) {
          priceMap.set(String(r.legacy_code), {
            price: Number(r.price),
            name: r.name,
            image: r.image,
            kind: r.kind === "service" ? "service" : "product",
          });
        }
      }
      // 命中库内则用库内价/名/图，未命中则回退前端快照（兼容本地兜底商品）
      const items = input.items.map((it) => {
        const db = it.code ? priceMap.get(it.code) : undefined;
        const price = db ? db.price : it.price;
        const name = db ? db.name : it.name;
        const image = db ? db.image || it.image : it.image;
        const kind = (db ? db.kind : it.kind) as "product" | "service";
        return {
          ...it,
          name,
          image,
          kind,
          price,
          subtotal: Math.round(price * it.qty * 100) / 100,
        };
      });
      const subtotalSum = items.reduce((s, it) => s + it.subtotal, 0);
      // 优惠券抵扣（服务端核验，金额以服务端为准）
      const { couponId, userCouponId, discount } = await computeCouponDiscount(
        conn, input.userCouponId, ctx.user.id, subtotalSum
      );
      const total = Math.max(0, Math.round((subtotalSum - discount) * 100) / 100);
      const hasService = items.some((it) => it.kind === "service") ? 1 : 0;
      const orderNo = genOrderNo();
      const userName = ctx.user.name || ctx.user.username || null;

      // 1) 写订单主表
      const [res] = (await (conn as any).execute(
        `INSERT INTO shop_order
          (order_no, tenant_id, user_id, user_name, user_phone, total_amount, discount_amount, coupon_id, pay_method, pay_status, order_status, has_service, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 'pending', ?, ?)`,
        [
          orderNo,
          DEFAULT_TENANT_ID,
          ctx.user.id,
          userName,
          input.userPhone || null,
          total.toFixed(2),
          discount.toFixed(2),
          couponId,
          input.payMethod,
          hasService,
          input.remark || null,
        ]
      )) as any;
      const orderId = res?.insertId;

      // 标记优惠券已用
      if (userCouponId) await redeemUserCoupon(conn, userCouponId, orderNo);

      // 2) 写订单明细
      for (const it of items) {
        await (conn as any).execute(
          `INSERT INTO shop_order_item
            (order_id, order_no, tenant_id, product_code, product_id, product_name, product_image, kind, price, qty, subtotal)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            orderNo,
            DEFAULT_TENANT_ID,
            it.code || null,
            it.productId || null,
            it.name,
            it.image || null,
            it.kind,
            it.price.toFixed(2),
            it.qty,
            it.subtotal.toFixed(2),
          ]
        );
      }

      return { success: true, orderNo, orderId, total, discount };
    }),

  // ============ 客人侧：我的订单列表 ============
  myOrders: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      const limit = input?.limit ?? 50;
      const [rows] = (await (conn as any).execute(
        `SELECT id, order_no, total_amount, pay_method, pay_status, order_status, has_service, created_at
         FROM shop_order
         WHERE user_id = ? AND tenant_id = ?
         ORDER BY created_at DESC
         LIMIT ${limit}`,
        [ctx.user.id, DEFAULT_TENANT_ID]
      )) as any;
      return rows as any[];
    }),

  // ============ 客人侧：我的订单详情（仅能查自己的订单，含明细） ============
  myOrderDetail: protectedProcedure
    .input(z.object({ orderId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "数据库连接失败",
        });
      const [orderRows] = (await (conn as any).execute(
        `SELECT * FROM shop_order WHERE id = ? AND user_id = ? AND tenant_id = ? LIMIT 1`,
        [input.orderId, ctx.user.id, DEFAULT_TENANT_ID]
      )) as any;
      const order = (orderRows as any[])[0];
      if (!order)
        throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
      const [itemRows] = (await (conn as any).execute(
        `SELECT * FROM shop_order_item WHERE order_id = ? ORDER BY id ASC`,
        [input.orderId]
      )) as any;
      return { order, items: itemRows as any[] };
    }),

  // ============ 管理员侧：订单列表（支持状态筛选 + 关键词） ============
  adminListOrders: publicProcedure
    .input(
      z
        .object({
          status: z
            .enum(["all", "pending", "confirmed", "completed", "cancelled"])
            .optional()
            .default("all"),
          keyword: z.string().max(64).optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) return { list: [], counts: {} };
      const status = input?.status ?? "all";
      const keyword = (input?.keyword || "").trim();
      const limit = input?.limit ?? 100;

      const where: string[] = [`tenant_id = ?`];
      const params: any[] = [DEFAULT_TENANT_ID];
      if (status !== "all") {
        where.push(`order_status = ?`);
        params.push(status);
      }
      if (keyword) {
        where.push(`(order_no LIKE ? OR user_name LIKE ? OR user_phone LIKE ?)`);
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }
      const whereSql = where.join(" AND ");

      const [rows] = (await (conn as any).execute(
        `SELECT id, order_no, user_id, user_name, user_phone, total_amount, pay_method, pay_status, order_status, has_service, remark, admin_remark, created_at, updated_at
         FROM shop_order
         WHERE ${whereSql}
         ORDER BY created_at DESC
         LIMIT ${limit}`,
        params
      )) as any;

      // 各状态数量统计（用于筛选胶囊角标）
      const [countRows] = (await (conn as any).execute(
        `SELECT order_status, COUNT(*) AS cnt FROM shop_order WHERE tenant_id = ? GROUP BY order_status`,
        [DEFAULT_TENANT_ID]
      )) as any;
      const counts: Record<string, number> = { all: 0 };
      for (const r of countRows as any[]) {
        counts[r.order_status] = Number(r.cnt);
        counts.all += Number(r.cnt);
      }

      return { list: rows as any[], counts };
    }),

  // ============ 管理员侧：订单详情（含明细） ============
  adminOrderDetail: publicProcedure
    .input(z.object({ orderId: z.number().int() }))
    .query(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "数据库连接失败",
        });
      const [orderRows] = (await (conn as any).execute(
        `SELECT * FROM shop_order WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [input.orderId, DEFAULT_TENANT_ID]
      )) as any;
      const order = (orderRows as any[])[0];
      if (!order)
        throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
      const [itemRows] = (await (conn as any).execute(
        `SELECT * FROM shop_order_item WHERE order_id = ? ORDER BY id ASC`,
        [input.orderId]
      )) as any;
      return { order, items: itemRows as any[] };
    }),

  // ============ 管理员侧：更新订单状态 / 备注 ============
  adminUpdateOrder: publicProcedure
    .input(
      z.object({
        orderId: z.number().int(),
        orderStatus: z
          .enum(["pending", "confirmed", "completed", "cancelled"])
          .optional(),
        payStatus: z.enum(["unpaid", "paid"]).optional(),
        adminRemark: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "数据库连接失败",
        });
      const sets: string[] = [];
      const params: any[] = [];
      if (input.orderStatus) {
        sets.push("order_status = ?");
        params.push(input.orderStatus);
      }
      if (input.payStatus) {
        sets.push("pay_status = ?");
        params.push(input.payStatus);
      }
      if (input.adminRemark !== undefined) {
        sets.push("admin_remark = ?");
        params.push(input.adminRemark || null);
      }
      if (sets.length === 0) return { success: true };
      params.push(input.orderId, DEFAULT_TENANT_ID);
      await (conn as any).execute(
        `UPDATE shop_order SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`,
        params
      );
      return { success: true };
    }),
});
