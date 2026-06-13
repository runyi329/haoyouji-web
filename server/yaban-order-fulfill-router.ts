/**
 * 牙伴齿科商城 - 订单履约 / 售后路由（交易闭环组）
 *
 * 覆盖：
 *   - 订单全流程状态流转：pending(待付款) -> paid 后 confirmed(已付款/待发货或待核销) -> shipped(已发货) / to_verify(待到店核销) -> completed -> 售后 refunding/refunded
 *   - 收货信息（实物商品）：客人填写收货地址；管理员发货回填物流
 *   - 到店核销（服务商品）：付款后生成核销码，到店扫码/输码核销
 *   - 退款/售后：客人发起，管理员审核，原路退回（与支付链路打通，模拟模式直接置退款）
 *   - 所有关键动作写 shop_order_log，前端可展示完整时间线
 *
 * 约定：与现有 yaban-shop-router 保持同款写法（getDbConnection + 原生 SQL）
 * 管理接口暂沿用 publicProcedure（与现有后台口径一致，待登录态收紧统一改回）
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";

const DEFAULT_TENANT_ID = 1;

// 生成核销码：8位数字
function genVerifyCode(): string {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}
// 生成退款单号
function genRefundNo(): string {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  const ts =
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds());
  return `RF${ts}${pad(Math.floor(Math.random() * 10000), 4)}`;
}

/**
 * 付款成功后统一处理（供模拟支付 + 真实回调调用）：
 *   - pay_status=paid, 订单从 pending -> confirmed
 *   - 含服务商品(has_service=1)且未生成核销码 -> 生成核销码, verify_status='unused'
 *   - 写 order_log
 * 传入已连接的 conn（复用调用方连接，避免重复开/释放）
 */
export async function onOrderPaid(conn: any, orderId: number, channel?: string) {
  try {
    const [orows]: any = await conn.query(
      "SELECT id, order_no, order_status, has_service, verify_code FROM shop_order WHERE id = ? LIMIT 1",
      [orderId]
    );
    const o = orows && orows[0];
    if (!o) return;
    const from = String(o.order_status);
    // 服务订单生成核销码
    let verifyCode = o.verify_code;
    const needVerify = Number(o.has_service) === 1 && !verifyCode;
    if (needVerify) verifyCode = genVerifyCode();
    await conn.query(
      `UPDATE shop_order SET pay_status='paid',
         pay_method = COALESCE(?, pay_method),
         order_status = IF(order_status='pending','confirmed',order_status),
         verify_code = COALESCE(?, verify_code),
         verify_status = IF(? = 1 AND verify_status='none','unused',verify_status)
       WHERE id = ?`,
      [channel || null, needVerify ? verifyCode : null, Number(o.has_service) === 1 ? 1 : 0, orderId]
    );
    await writeLog(conn, o.order_no, "pay", from, "confirmed", "system", "支付成功");
  } catch {
    /* 付款后处理失败不阻断主流程，状态以支付单为准 */
  }
}

// 写订单日志
async function writeLog(
  conn: any,
  orderNo: string,
  action: string,
  fromStatus: string | null,
  toStatus: string | null,
  operator: string,
  note?: string
) {
  try {
    await conn.execute(
      `INSERT INTO shop_order_log (tenant_id, order_no, action, from_status, to_status, operator, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [DEFAULT_TENANT_ID, orderNo, action, fromStatus, toStatus, operator, note || null]
    );
  } catch {
    /* 日志失败不影响主流程 */
  }
}

export const yabanOrderFulfillRouter = router({
  // ============ 客人侧：订单时间线（状态日志） ============
  myOrderTimeline: protectedProcedure
    .input(z.object({ orderNo: z.string().max(32) }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      // 校验归属
      const [orows] = (await (conn as any).execute(
        `SELECT user_id FROM shop_order WHERE order_no = ? AND tenant_id = ? LIMIT 1`,
        [input.orderNo, DEFAULT_TENANT_ID]
      )) as any;
      const o = (orows as any[])[0];
      if (!o || Number(o.user_id) !== Number(ctx.user.id)) return [];
      const [rows] = (await (conn as any).execute(
        `SELECT action, from_status, to_status, operator, note, created_at
         FROM shop_order_log WHERE order_no = ? AND tenant_id = ? ORDER BY id ASC`,
        [input.orderNo, DEFAULT_TENANT_ID]
      )) as any;
      return rows as any[];
    }),

  // ============ 客人侧：填写/更新收货信息（实物商品，发货前可改） ============
  setReceiver: protectedProcedure
    .input(
      z.object({
        orderNo: z.string().max(32),
        name: z.string().min(1).max(64),
        phone: z.string().min(1).max(20),
        addr: z.string().min(1).max(255),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const [orows] = (await (conn as any).execute(
        `SELECT id, user_id, order_status FROM shop_order WHERE order_no = ? AND tenant_id = ? LIMIT 1`,
        [input.orderNo, DEFAULT_TENANT_ID]
      )) as any;
      const o = (orows as any[])[0];
      if (!o || Number(o.user_id) !== Number(ctx.user.id))
        throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
      if (["shipped", "completed", "cancelled"].includes(String(o.order_status)))
        throw new TRPCError({ code: "BAD_REQUEST", message: "当前订单状态不可修改收货信息" });
      await (conn as any).execute(
        `UPDATE shop_order SET receiver_name = ?, receiver_phone = ?, receiver_addr = ?
         WHERE order_no = ? AND tenant_id = ?`,
        [input.name.trim(), input.phone.trim(), input.addr.trim(), input.orderNo, DEFAULT_TENANT_ID]
      );
      return { ok: true };
    }),

  // ============ 客人侧：到店核销（输入/扫描核销码自助核销，或由门店核销） ============
  // 这里提供"客人确认到店"入口，真正核销以门店端为准；保留服务商品自助核销能力
  // ============ 客人侧：确认收货/完成 ============
  confirmReceipt: protectedProcedure
    .input(z.object({ orderNo: z.string().max(32) }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const [orows] = (await (conn as any).execute(
        `SELECT id, user_id, order_status FROM shop_order WHERE order_no = ? AND tenant_id = ? LIMIT 1`,
        [input.orderNo, DEFAULT_TENANT_ID]
      )) as any;
      const o = (orows as any[])[0];
      if (!o || Number(o.user_id) !== Number(ctx.user.id))
        throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
      const from = String(o.order_status);
      if (!["shipped"].includes(from))
        throw new TRPCError({ code: "BAD_REQUEST", message: "当前状态不可确认收货" });
      await (conn as any).execute(
        `UPDATE shop_order SET order_status = 'completed' WHERE id = ? AND tenant_id = ?`,
        [o.id, DEFAULT_TENANT_ID]
      );
      await writeLog(conn, input.orderNo, "complete", from, "completed", "user", "客人确认收货");
      return { ok: true };
    }),

  // ============ 客人侧：申请退款/售后 ============
  applyRefund: protectedProcedure
    .input(
      z.object({
        orderNo: z.string().max(32),
        reason: z.string().min(1).max(255),
        images: z.array(z.string().max(255)).optional().default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const [orows] = (await (conn as any).execute(
        `SELECT id, user_id, order_no, total_amount, pay_status, order_status
         FROM shop_order WHERE order_no = ? AND tenant_id = ? LIMIT 1`,
        [input.orderNo, DEFAULT_TENANT_ID]
      )) as any;
      const o = (orows as any[])[0];
      if (!o || Number(o.user_id) !== Number(ctx.user.id))
        throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
      if (String(o.pay_status) !== "paid")
        throw new TRPCError({ code: "BAD_REQUEST", message: "未支付订单无需退款" });
      if (["refunding", "refunded", "cancelled"].includes(String(o.order_status)))
        throw new TRPCError({ code: "BAD_REQUEST", message: "该订单已在退款流程中" });
      // 是否已有待处理退款
      const [exist] = (await (conn as any).execute(
        `SELECT id FROM shop_refund WHERE order_no = ? AND status = 'pending' LIMIT 1`,
        [input.orderNo]
      )) as any;
      if ((exist as any[]).length > 0)
        throw new TRPCError({ code: "BAD_REQUEST", message: "已提交退款申请，请等待处理" });

      const refundNo = genRefundNo();
      await (conn as any).execute(
        `INSERT INTO shop_refund (refund_no, tenant_id, order_no, order_id, user_id, amount, reason, images, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          refundNo, DEFAULT_TENANT_ID, input.orderNo, o.id, ctx.user.id,
          Number(o.total_amount).toFixed(2), input.reason.trim(),
          JSON.stringify(input.images || []),
        ]
      );
      // 订单标记退款中
      await (conn as any).execute(
        `UPDATE shop_order SET order_status = 'refunding' WHERE id = ? AND tenant_id = ?`,
        [o.id, DEFAULT_TENANT_ID]
      );
      await writeLog(conn, input.orderNo, "refund_apply", String(o.order_status), "refunding", "user", input.reason.trim());
      return { ok: true, refundNo };
    }),

  // ============ 客人侧：我的退款列表 ============
  myRefunds: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return [];
    const [rows] = (await (conn as any).execute(
      `SELECT refund_no, order_no, amount, reason, status, admin_note, created_at
       FROM shop_refund WHERE user_id = ? AND tenant_id = ? ORDER BY id DESC`,
      [ctx.user.id, DEFAULT_TENANT_ID]
    )) as any;
    return rows as any[];
  }),

  // ============ 管理员侧：发货（实物商品） ============
  adminShip: publicProcedure
    .input(
      z.object({
        orderId: z.number().int(),
        shipCompany: z.string().max(32).optional(),
        shipNo: z.string().max(64).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const [orows] = (await (conn as any).execute(
        `SELECT order_no, order_status, pay_status FROM shop_order WHERE id = ? AND tenant_id = ? LIMIT 1`,
        [input.orderId, DEFAULT_TENANT_ID]
      )) as any;
      const o = (orows as any[])[0];
      if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
      if (String(o.pay_status) !== "paid")
        throw new TRPCError({ code: "BAD_REQUEST", message: "订单未支付，不可发货" });
      await (conn as any).execute(
        `UPDATE shop_order SET order_status = 'shipped', ship_company = ?, ship_no = ?
         WHERE id = ? AND tenant_id = ?`,
        [input.shipCompany || null, input.shipNo || null, input.orderId, DEFAULT_TENANT_ID]
      );
      await writeLog(conn, o.order_no, "ship", String(o.order_status), "shipped", "admin",
        input.shipCompany ? `${input.shipCompany} ${input.shipNo || ""}`.trim() : "已发货");
      return { ok: true };
    }),

  // ============ 管理员侧：到店核销（服务商品） ============
  adminVerify: publicProcedure
    .input(z.object({ verifyCode: z.string().min(4).max(32) }))
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const [orows] = (await (conn as any).execute(
        `SELECT id, order_no, order_status, pay_status, verify_status
         FROM shop_order WHERE verify_code = ? AND tenant_id = ? LIMIT 1`,
        [input.verifyCode.trim(), DEFAULT_TENANT_ID]
      )) as any;
      const o = (orows as any[])[0];
      if (!o) throw new TRPCError({ code: "NOT_FOUND", message: "核销码无效" });
      if (String(o.pay_status) !== "paid")
        throw new TRPCError({ code: "BAD_REQUEST", message: "订单未支付，无法核销" });
      if (String(o.verify_status) === "used")
        throw new TRPCError({ code: "BAD_REQUEST", message: "该核销码已使用" });
      await (conn as any).execute(
        `UPDATE shop_order SET verify_status = 'used', verified_at = NOW(), order_status = 'completed'
         WHERE id = ? AND tenant_id = ?`,
        [o.id, DEFAULT_TENANT_ID]
      );
      await writeLog(conn, o.order_no, "verify", String(o.order_status), "completed", "admin", "到店核销完成");
      return { ok: true, orderNo: o.order_no };
    }),

  // ============ 管理员侧：退款审核列表 ============
  adminListRefunds: publicProcedure
    .input(
      z.object({
        status: z.enum(["all", "pending", "approved", "rejected", "refunded"]).optional().default("all"),
      }).optional()
    )
    .query(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) return { list: [], counts: {} };
      const status = input?.status ?? "all";
      const where: string[] = [`r.tenant_id = ?`];
      const params: any[] = [DEFAULT_TENANT_ID];
      if (status !== "all") { where.push(`r.status = ?`); params.push(status); }
      const [rows] = (await (conn as any).execute(
        `SELECT r.*, o.user_name, o.user_phone FROM shop_refund r
         LEFT JOIN shop_order o ON o.id = r.order_id
         WHERE ${where.join(" AND ")}
         ORDER BY r.id DESC LIMIT 200`,
        params
      )) as any;
      const [countRows] = (await (conn as any).execute(
        `SELECT status, COUNT(*) cnt FROM shop_refund WHERE tenant_id = ? GROUP BY status`,
        [DEFAULT_TENANT_ID]
      )) as any;
      const counts: Record<string, number> = { all: 0 };
      for (const c of countRows as any[]) { counts[c.status] = Number(c.cnt); counts.all += Number(c.cnt); }
      return { list: rows as any[], counts };
    }),

  // ============ 管理员侧：审核退款（同意=退款 / 驳回） ============
  adminAuditRefund: publicProcedure
    .input(
      z.object({
        refundNo: z.string().max(32),
        approve: z.boolean(),
        adminNote: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const [rrows] = (await (conn as any).execute(
        `SELECT * FROM shop_refund WHERE refund_no = ? AND tenant_id = ? LIMIT 1`,
        [input.refundNo, DEFAULT_TENANT_ID]
      )) as any;
      const r = (rrows as any[])[0];
      if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "退款单不存在" });
      if (String(r.status) !== "pending")
        throw new TRPCError({ code: "BAD_REQUEST", message: "该退款单已处理" });

      if (input.approve) {
        // 模拟模式：直接置退款成功；真实渠道退款（微信/支付宝退款API）后续接入
        await (conn as any).execute(
          `UPDATE shop_refund SET status = 'refunded', admin_note = ? WHERE id = ?`,
          [input.adminNote || null, r.id]
        );
        await (conn as any).execute(
          `UPDATE shop_order SET order_status = 'refunded', pay_status = 'refunded' WHERE id = ? AND tenant_id = ?`,
          [r.order_id, DEFAULT_TENANT_ID]
        );
        await writeLog(conn, r.order_no, "refund_done", "refunding", "refunded", "admin", input.adminNote || "退款已处理");
      } else {
        await (conn as any).execute(
          `UPDATE shop_refund SET status = 'rejected', admin_note = ? WHERE id = ?`,
          [input.adminNote || null, r.id]
        );
        // 驳回则订单回到原已完成/已付款状态（这里回到 confirmed 由门店再处理）
        await (conn as any).execute(
          `UPDATE shop_order SET order_status = 'confirmed' WHERE id = ? AND tenant_id = ?`,
          [r.order_id, DEFAULT_TENANT_ID]
        );
        await writeLog(conn, r.order_no, "refund_reject", "refunding", "confirmed", "admin", input.adminNote || "退款驳回");
      }
      return { ok: true };
    }),
});
