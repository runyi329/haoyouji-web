/**
 * 牙伴齿科商城 - 商家管理后端 router（数据看板 / 库存 / 多规格SKU / 订单导出）
 * 过程：
 *   dashboard       经营数据看板（今日/累计成交、订单数、状态分布、热销Top）
 *   adminSetStock   设置商品库存
 *   adminListSku / adminSaveSku / adminDeleteSku  多规格SKU管理
 *   exportOrders    导出订单（返回行数据，前端转CSV）
 * 说明：全部读写腾讯云生产库，tenant 默认 1
 */
import { z } from "zod";
import { router, publicProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";

const TENANT = 1;

export const yabanShopAdminRouter = router({
  // ============ 经营数据看板 ============
  dashboard: publicProcedure.query(async () => {
    const conn = await getDbConnection();
    if (!conn) {
      return {
        todayAmount: 0, todayOrders: 0, totalAmount: 0, totalOrders: 0,
        paidOrders: 0, statusDist: [], topProducts: [], recentDays: [],
      };
    }
    const c: any = conn;
    // 今日（北京时间）成交：已支付订单
    const [todayRows] = (await c.execute(
      `SELECT COUNT(*) cnt, COALESCE(SUM(total_amount),0) amt
       FROM shop_order
       WHERE tenant_id=? AND pay_status='paid'
         AND DATE(CONVERT_TZ(created_at,'+00:00','+08:00')) = DATE(CONVERT_TZ(NOW(),'+00:00','+08:00'))`,
      [TENANT]
    )) as any;
    // 累计成交（已支付）
    const [totalRows] = (await c.execute(
      `SELECT COUNT(*) cnt, COALESCE(SUM(total_amount),0) amt
       FROM shop_order WHERE tenant_id=? AND pay_status='paid'`,
      [TENANT]
    )) as any;
    // 全部订单数
    const [allRows] = (await c.execute(
      `SELECT COUNT(*) cnt FROM shop_order WHERE tenant_id=?`, [TENANT]
    )) as any;
    // 订单状态分布
    const [statusRows] = (await c.execute(
      `SELECT order_status status, COUNT(*) cnt FROM shop_order WHERE tenant_id=? GROUP BY order_status`,
      [TENANT]
    )) as any;
    // 热销 Top10（按已支付订单的明细汇总）
    const [topRows] = (await c.execute(
      `SELECT oi.product_name name, SUM(oi.qty) qty, SUM(oi.subtotal) amt
       FROM shop_order_item oi
       JOIN shop_order o ON o.id = oi.order_id AND o.pay_status='paid'
       WHERE oi.tenant_id=?
       GROUP BY oi.product_name ORDER BY qty DESC LIMIT 10`,
      [TENANT]
    )) as any;
    // 近7天成交趋势
    const [trendRows] = (await c.execute(
      `SELECT DATE(CONVERT_TZ(created_at,'+00:00','+08:00')) d,
              COUNT(*) cnt, COALESCE(SUM(total_amount),0) amt
       FROM shop_order
       WHERE tenant_id=? AND pay_status='paid'
         AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
       GROUP BY d ORDER BY d ASC`,
      [TENANT]
    )) as any;

    return {
      todayAmount: Number((todayRows as any[])[0].amt),
      todayOrders: Number((todayRows as any[])[0].cnt),
      totalAmount: Number((totalRows as any[])[0].amt),
      totalOrders: Number((allRows as any[])[0].cnt),
      paidOrders: Number((totalRows as any[])[0].cnt),
      statusDist: (statusRows as any[]).map((r) => ({ status: r.status, count: Number(r.cnt) })),
      topProducts: (topRows as any[]).map((r) => ({ name: r.name, qty: Number(r.qty), amount: Number(r.amt) })),
      recentDays: (trendRows as any[]).map((r) => ({ date: String(r.d), count: Number(r.cnt), amount: Number(r.amt) })),
    };
  }),

  // ============ 设置商品库存 ============
  adminSetStock: publicProcedure
    .input(z.object({ productId: z.number().int(), stock: z.number().int().min(0) }))
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await (conn as any).execute(
        `UPDATE shop_product SET stock=? WHERE id=? AND tenant_id=?`,
        [input.stock, input.productId, TENANT]
      );
      // 库存为 0 自动下架，>0 时不强制上架（由商家决定）
      if (input.stock === 0) {
        await (conn as any).execute(
          `UPDATE shop_product SET status=0 WHERE id=? AND tenant_id=?`,
          [input.productId, TENANT]
        );
      }
      return { ok: true };
    }),

  // ============ 多规格 SKU 管理 ============
  adminListSku: publicProcedure
    .input(z.object({ productId: z.number().int() }))
    .query(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      const [rows] = (await (conn as any).execute(
        `SELECT * FROM shop_sku WHERE product_id=? AND tenant_id=? ORDER BY id ASC`,
        [input.productId, TENANT]
      )) as any;
      return rows as any[];
    }),

  adminSaveSku: publicProcedure
    .input(
      z.object({
        id: z.number().int().optional(),
        productId: z.number().int(),
        specName: z.string().min(1).max(128),
        price: z.number().min(0),
        stock: z.number().int().min(0).default(0),
      })
    )
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      if (input.id) {
        await (conn as any).execute(
          `UPDATE shop_sku SET spec_text=?, price=?, stock=? WHERE id=? AND tenant_id=?`,
          [input.specName, input.price.toFixed(2), input.stock, input.id, TENANT]
        );
        return { ok: true, id: input.id };
      }
      const [res] = (await (conn as any).execute(
        `INSERT INTO shop_sku (tenant_id, product_id, spec_text, price, stock) VALUES (?,?,?,?,?)`,
        [TENANT, input.productId, input.specName, input.price.toFixed(2), input.stock]
      )) as any;
      return { ok: true, id: res?.insertId };
    }),

  adminDeleteSku: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await (conn as any).execute(`DELETE FROM shop_sku WHERE id=? AND tenant_id=?`, [input.id, TENANT]);
      return { ok: true };
    }),

  // ============ 订单导出（按时间段，返回行供前端转CSV） ============
  exportOrders: publicProcedure
    .input(
      z.object({
        startDate: z.string().optional(), // yyyy-mm-dd
        endDate: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      const where: string[] = [`tenant_id=?`];
      const params: any[] = [TENANT];
      if (input?.startDate) { where.push(`created_at >= ?`); params.push(`${input.startDate} 00:00:00`); }
      if (input?.endDate) { where.push(`created_at <= ?`); params.push(`${input.endDate} 23:59:59`); }
      const [rows] = (await (conn as any).execute(
        `SELECT order_no, user_name, user_phone, total_amount, discount_amount,
                pay_method, pay_status, order_status, has_service,
                receiver_name, receiver_phone, ship_company, ship_no, created_at
         FROM shop_order WHERE ${where.join(" AND ")}
         ORDER BY created_at DESC LIMIT 2000`,
        params
      )) as any;
      return rows as any[];
    }),
});
