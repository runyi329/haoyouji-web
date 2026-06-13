/**
 * 牙伴齿科商城 - 运营增强路由（运营增强组）
 *
 * 覆盖：
 *   - 商品评价 / 晒单(10)：客人完成订单后可对所购商品评价(评分+文字+图片)，商品详情页展示评价，商家可回复
 *   - 首页运营位 Banner(11)：后台配置首页轮播位(图片+跳转)，前台首页读取启用中的 Banner
 *
 * 约定：与现有 yaban-order-fulfill-router 保持同款写法（getDbConnection + 原生 SQL）
 * 管理接口暂沿用 publicProcedure（与现有后台口径一致，待登录态收紧统一改回）
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";

const DEFAULT_TENANT_ID = 1;

// 安全解析图片 JSON 文本 -> 字符串数组
function parseImages(raw: any): string[] {
  if (!raw) return [];
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (Array.isArray(arr)) return arr.map((x) => String(x)).filter(Boolean);
  } catch {
    // 非 JSON 时按逗号兜底
    return String(raw).split(",").map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function fmtTime(val: any): string {
  if (!val) return "";
  return String(val).replace("T", " ").replace(/\.\d+Z?$/, "").slice(0, 16);
}

export const yabanShopOpsRouter = router({
  // ============ 评价：客人查询「我可评价的已完成订单」 ============
  myReviewableOrders: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return [];
    try {
      // 已完成订单 + 该订单内的商品，且该商品尚未被本人评价过
      const [rows]: any = await (conn as any).query(
        `SELECT o.order_no, o.created_at, i.product_id, i.product_code, i.name AS product_name, i.image AS product_image
           FROM shop_order o
           JOIN shop_order_item i ON i.order_id = o.id
          WHERE o.user_id = ? AND o.tenant_id = ? AND o.order_status = 'completed'
            AND NOT EXISTS (
              SELECT 1 FROM shop_review r
               WHERE r.order_no = o.order_no AND r.user_id = o.user_id
                 AND (r.product_id = i.product_id OR r.product_code = i.product_code)
            )
          ORDER BY o.created_at DESC
          LIMIT 100`,
        [ctx.user.id, DEFAULT_TENANT_ID]
      );
      return (rows as any[]).map((r) => ({
        orderNo: r.order_no,
        productId: r.product_id,
        productCode: r.product_code,
        productName: r.product_name,
        productImage: r.product_image || "",
        createdAt: fmtTime(r.created_at),
      }));
    } finally {
      try { (conn as any).release?.(); } catch {}
    }
  }),

  // ============ 评价：客人提交评价 ============
  submitReview: protectedProcedure
    .input(
      z.object({
        orderNo: z.string().min(1).max(32),
        productId: z.number().int().positive().optional(),
        productCode: z.string().max(32).optional(),
        rating: z.number().int().min(1).max(5),
        content: z.string().max(500).optional().default(""),
        images: z.array(z.string().url()).max(9).optional().default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      try {
        // 校验订单归属且已完成
        const [orows]: any = await (conn as any).query(
          "SELECT id, user_id, order_status FROM shop_order WHERE order_no = ? AND tenant_id = ? LIMIT 1",
          [input.orderNo, DEFAULT_TENANT_ID]
        );
        const o = (orows as any[])[0];
        if (!o || Number(o.user_id) !== Number(ctx.user.id))
          throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
        if (String(o.order_status) !== "completed")
          throw new TRPCError({ code: "BAD_REQUEST", message: "订单完成后才能评价" });
        // 防重复
        const [dup]: any = await (conn as any).query(
          `SELECT id FROM shop_review WHERE order_no = ? AND user_id = ?
             AND (product_id <=> ? OR product_code <=> ?) LIMIT 1`,
          [input.orderNo, ctx.user.id, input.productId ?? null, input.productCode ?? null]
        );
        if ((dup as any[]).length > 0)
          throw new TRPCError({ code: "BAD_REQUEST", message: "该商品已评价过" });

        await (conn as any).query(
          `INSERT INTO shop_review
             (tenant_id, order_no, product_id, product_code, user_id, user_name, rating, content, images, status)
           VALUES (?,?,?,?,?,?,?,?,?,1)`,
          [
            DEFAULT_TENANT_ID,
            input.orderNo,
            input.productId ?? null,
            input.productCode ?? null,
            ctx.user.id,
            (ctx.user as any).name || (ctx.user as any).nickname || "匿名用户",
            input.rating,
            input.content?.trim() || null,
            input.images && input.images.length ? JSON.stringify(input.images) : null,
          ]
        );
        return { success: true };
      } finally {
        try { (conn as any).release?.(); } catch {}
      }
    }),

  // ============ 评价：商品详情页查询评价列表（公开） ============
  listProductReviews: publicProcedure
    .input(
      z.object({
        productId: z.number().int().positive().optional(),
        productCode: z.string().max(32).optional(),
        limit: z.number().int().min(1).max(50).optional().default(20),
      })
    )
    .query(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) return { list: [], avgRating: 0, total: 0 };
      try {
        if (!input.productId && !input.productCode) return { list: [], avgRating: 0, total: 0 };
        const cond: string[] = ["tenant_id = ?", "status = 1"];
        const params: any[] = [DEFAULT_TENANT_ID];
        if (input.productId) { cond.push("product_id = ?"); params.push(input.productId); }
        else { cond.push("product_code = ?"); params.push(input.productCode); }
        const where = cond.join(" AND ");

        const [rows]: any = await (conn as any).query(
          `SELECT id, user_name, rating, content, images, reply, created_at
             FROM shop_review WHERE ${where}
            ORDER BY id DESC LIMIT ?`,
          [...params, input.limit]
        );
        const [agg]: any = await (conn as any).query(
          `SELECT COUNT(*) AS total, COALESCE(AVG(rating),0) AS avg_rating
             FROM shop_review WHERE ${where}`,
          params
        );
        const a = (agg as any[])[0] || { total: 0, avg_rating: 0 };
        return {
          list: (rows as any[]).map((r) => ({
            id: r.id,
            userName: r.user_name || "匿名用户",
            rating: Number(r.rating),
            content: r.content || "",
            images: parseImages(r.images),
            reply: r.reply || "",
            createdAt: fmtTime(r.created_at),
          })),
          avgRating: Math.round(Number(a.avg_rating) * 10) / 10,
          total: Number(a.total),
        };
      } finally {
        try { (conn as any).release?.(); } catch {}
      }
    }),

  // ============ 评价：后台列表 + 回复（暂 public，与现有后台口径一致） ============
  adminListReviews: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).optional().default(100) }).optional())
    .query(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      try {
        const [rows]: any = await (conn as any).query(
          `SELECT id, order_no, product_code, user_name, rating, content, images, reply, status, created_at
             FROM shop_review WHERE tenant_id = ?
            ORDER BY id DESC LIMIT ?`,
          [DEFAULT_TENANT_ID, input?.limit ?? 100]
        );
        return (rows as any[]).map((r) => ({
          id: r.id,
          orderNo: r.order_no,
          productCode: r.product_code,
          userName: r.user_name || "匿名用户",
          rating: Number(r.rating),
          content: r.content || "",
          images: parseImages(r.images),
          reply: r.reply || "",
          status: Number(r.status),
          createdAt: fmtTime(r.created_at),
        }));
      } finally {
        try { (conn as any).release?.(); } catch {}
      }
    }),

  adminReplyReview: publicProcedure
    .input(z.object({ id: z.number().int().positive(), reply: z.string().max(500) }))
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      try {
        await (conn as any).query(
          "UPDATE shop_review SET reply = ? WHERE id = ? AND tenant_id = ?",
          [input.reply.trim() || null, input.id, DEFAULT_TENANT_ID]
        );
        return { success: true };
      } finally {
        try { (conn as any).release?.(); } catch {}
      }
    }),

  adminSetReviewStatus: publicProcedure
    .input(z.object({ id: z.number().int().positive(), status: z.number().int().min(0).max(1) }))
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      try {
        await (conn as any).query(
          "UPDATE shop_review SET status = ? WHERE id = ? AND tenant_id = ?",
          [input.status, input.id, DEFAULT_TENANT_ID]
        );
        return { success: true };
      } finally {
        try { (conn as any).release?.(); } catch {}
      }
    }),

  // ============ Banner：前台查启用中（公开） ============
  listBanners: publicProcedure.query(async () => {
    const conn = await getDbConnection();
    if (!conn) return [];
    try {
      const [rows]: any = await (conn as any).query(
        `SELECT id, title, image, link_type, link_value
           FROM shop_banner WHERE tenant_id = ? AND status = 1
          ORDER BY sort_order ASC, id ASC`,
        [DEFAULT_TENANT_ID]
      );
      return (rows as any[]).map((r) => ({
        id: r.id,
        title: r.title || "",
        image: r.image,
        linkType: r.link_type || "none",
        linkValue: r.link_value || "",
      }));
    } finally {
      try { (conn as any).release?.(); } catch {}
    }
  }),

  // ============ Banner：后台列表（含停用） ============
  adminListBanners: publicProcedure.query(async () => {
    const conn = await getDbConnection();
    if (!conn) return [];
    try {
      const [rows]: any = await (conn as any).query(
        `SELECT id, title, image, link_type, link_value, sort_order, status
           FROM shop_banner WHERE tenant_id = ?
          ORDER BY sort_order ASC, id ASC`,
        [DEFAULT_TENANT_ID]
      );
      return (rows as any[]).map((r) => ({
        id: r.id,
        title: r.title || "",
        image: r.image,
        linkType: r.link_type || "none",
        linkValue: r.link_value || "",
        sortOrder: Number(r.sort_order || 0),
        status: Number(r.status),
      }));
    } finally {
      try { (conn as any).release?.(); } catch {}
    }
  }),

  adminSaveBanner: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        title: z.string().max(64).optional().default(""),
        image: z.string().url(),
        linkType: z.enum(["none", "product", "url", "coupon"]).optional().default("none"),
        linkValue: z.string().max(255).optional().default(""),
        sortOrder: z.number().int().optional().default(0),
        status: z.number().int().min(0).max(1).optional().default(1),
      })
    )
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      try {
        if (input.id) {
          await (conn as any).query(
            `UPDATE shop_banner SET title=?, image=?, link_type=?, link_value=?, sort_order=?, status=?
               WHERE id=? AND tenant_id=?`,
            [input.title.trim(), input.image, input.linkType, input.linkValue.trim() || null,
             input.sortOrder, input.status, input.id, DEFAULT_TENANT_ID]
          );
        } else {
          await (conn as any).query(
            `INSERT INTO shop_banner (tenant_id, title, image, link_type, link_value, sort_order, status)
             VALUES (?,?,?,?,?,?,?)`,
            [DEFAULT_TENANT_ID, input.title.trim(), input.image, input.linkType,
             input.linkValue.trim() || null, input.sortOrder, input.status]
          );
        }
        return { success: true };
      } finally {
        try { (conn as any).release?.(); } catch {}
      }
    }),

  adminDeleteBanner: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      try {
        await (conn as any).query(
          "DELETE FROM shop_banner WHERE id = ? AND tenant_id = ?",
          [input.id, DEFAULT_TENANT_ID]
        );
        return { success: true };
      } finally {
        try { (conn as any).release?.(); } catch {}
      }
    }),
});

export default yabanShopOpsRouter;
