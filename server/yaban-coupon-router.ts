/**
 * 牙伴齿科商城 - 优惠券/满减 router
 * 过程：
 *   adminListCoupons / adminSaveCoupon / adminToggleCoupon  管理员管理券模板
 *   listClaimable    客人可领取的券
 *   claim            客人领券
 *   myCoupons        客人已领取的券（含可用/已用/过期）
 *   usableForAmount  按订单金额返回可用券 + 折扣试算
 * 导出：
 *   computeCouponDiscount(conn, userCouponId, userId, amount) 下单时核验并计算折扣
 *   redeemUserCoupon(conn, userCouponId, orderNo)            下单成功后标记券已用
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";

const TENANT = 1;

// 折扣计算：返回 { discount, finalAmount }，discount 保留两位
export function calcDiscount(coupon: any, amount: number): number {
  const threshold = Number(coupon.threshold || 0);
  if (amount < threshold) return 0;
  if (coupon.type === "discount" && coupon.discount != null) {
    // discount 为折扣率，如 0.90 表示 9 折
    const d = amount * (1 - Number(coupon.discount));
    return Math.round(d * 100) / 100;
  }
  // 满减
  const amt = Number(coupon.amount || 0);
  return Math.min(amt, amount); // 不超过订单金额
}

/**
 * 下单时核验用户券并计算折扣（在调用方事务/连接内执行）
 * 返回 { couponId, userCouponId, discount }；无券或不可用则 discount=0
 */
export async function computeCouponDiscount(
  conn: any,
  userCouponId: number | null | undefined,
  userId: number,
  amount: number
): Promise<{ couponId: number | null; userCouponId: number | null; discount: number }> {
  if (!userCouponId) return { couponId: null, userCouponId: null, discount: 0 };
  const [rows] = (await conn.execute(
    `SELECT uc.id AS uc_id, uc.status, uc.user_id, uc.expire_at, c.*
     FROM shop_user_coupon uc JOIN shop_coupon c ON c.id = uc.coupon_id
     WHERE uc.id = ? AND uc.tenant_id = ? LIMIT 1`,
    [userCouponId, TENANT]
  )) as any;
  const r = (rows as any[])[0];
  if (!r || Number(r.user_id) !== Number(userId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "优惠券不存在" });
  }
  if (r.status !== "unused") throw new TRPCError({ code: "BAD_REQUEST", message: "优惠券不可用" });
  if (r.expire_at && new Date(r.expire_at).getTime() < Date.now()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "优惠券已过期" });
  }
  if (amount < Number(r.threshold || 0)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `未满足使用门槛 ¥${Number(r.threshold).toFixed(2)}` });
  }
  const discount = calcDiscount(r, amount);
  return { couponId: Number(r.id), userCouponId: Number(r.uc_id), discount };
}

// 下单成功后标记券已用
export async function redeemUserCoupon(conn: any, userCouponId: number | null, orderNo: string) {
  if (!userCouponId) return;
  await conn.execute(
    `UPDATE shop_user_coupon SET status = 'used', order_no = ?, used_at = NOW()
     WHERE id = ? AND tenant_id = ? AND status = 'unused'`,
    [orderNo, userCouponId, TENANT]
  );
}

export const yabanCouponRouter = router({
  // ============ 管理员：券模板列表 ============
  adminListCoupons: publicProcedure.query(async () => {
    const conn = await getDbConnection();
    if (!conn) return [];
    const [rows] = (await (conn as any).execute(
      `SELECT * FROM shop_coupon WHERE tenant_id = ? ORDER BY id DESC`,
      [TENANT]
    )) as any;
    return rows as any[];
  }),

  // ============ 管理员：新建/编辑券模板 ============
  adminSaveCoupon: publicProcedure
    .input(
      z.object({
        id: z.number().int().optional(),
        name: z.string().min(1).max(64),
        type: z.enum(["full_reduce", "discount"]).default("full_reduce"),
        threshold: z.number().min(0).default(0),
        amount: z.number().min(0).default(0),
        discount: z.number().min(0.1).max(0.99).optional(),
        totalQty: z.number().int().min(0).default(0),
        perUserLimit: z.number().int().min(1).default(1),
        validDays: z.number().int().min(1).default(30),
      })
    )
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      if (input.id) {
        await (conn as any).execute(
          `UPDATE shop_coupon SET name=?, type=?, threshold=?, amount=?, discount=?, total_qty=?, per_user_limit=?, valid_days=?
           WHERE id=? AND tenant_id=?`,
          [input.name, input.type, input.threshold, input.amount, input.discount ?? null,
           input.totalQty, input.perUserLimit, input.validDays, input.id, TENANT]
        );
        return { ok: true, id: input.id };
      }
      const [res] = (await (conn as any).execute(
        `INSERT INTO shop_coupon (tenant_id, name, type, threshold, amount, discount, total_qty, per_user_limit, valid_days, status)
         VALUES (?,?,?,?,?,?,?,?,?,1)`,
        [TENANT, input.name, input.type, input.threshold, input.amount, input.discount ?? null,
         input.totalQty, input.perUserLimit, input.validDays]
      )) as any;
      return { ok: true, id: res?.insertId };
    }),

  // ============ 管理员：上/下架券 ============
  adminToggleCoupon: publicProcedure
    .input(z.object({ id: z.number().int(), status: z.number().int().min(0).max(1) }))
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await (conn as any).execute(`UPDATE shop_coupon SET status=? WHERE id=? AND tenant_id=?`,
        [input.status, input.id, TENANT]);
      return { ok: true };
    }),

  // ============ 客人：可领取的券（上架、有余量、未达个人上限） ============
  listClaimable: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return [];
    const [rows] = (await (conn as any).execute(
      `SELECT c.*,
        (SELECT COUNT(*) FROM shop_user_coupon uc WHERE uc.coupon_id = c.id AND uc.user_id = ?) AS my_claimed
       FROM shop_coupon c
       WHERE c.tenant_id = ? AND c.status = 1
         AND (c.total_qty = 0 OR c.claimed_qty < c.total_qty)
       ORDER BY c.id DESC`,
      [ctx.user.id, TENANT]
    )) as any;
    return (rows as any[]).filter((r) => Number(r.my_claimed) < Number(r.per_user_limit));
  }),

  // ============ 客人：领券 ============
  claim: protectedProcedure
    .input(z.object({ couponId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const [crows] = (await (conn as any).execute(
        `SELECT * FROM shop_coupon WHERE id=? AND tenant_id=? AND status=1 LIMIT 1`,
        [input.couponId, TENANT]
      )) as any;
      const c = (crows as any[])[0];
      if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "优惠券不存在或已下架" });
      if (Number(c.total_qty) > 0 && Number(c.claimed_qty) >= Number(c.total_qty)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "优惠券已领完" });
      }
      const [mine] = (await (conn as any).execute(
        `SELECT COUNT(*) cnt FROM shop_user_coupon WHERE coupon_id=? AND user_id=?`,
        [input.couponId, ctx.user.id]
      )) as any;
      if (Number((mine as any[])[0].cnt) >= Number(c.per_user_limit)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "已达领取上限" });
      }
      const expire = new Date(Date.now() + Number(c.valid_days) * 86400000);
      const expireStr = expire.toISOString().slice(0, 19).replace("T", " ");
      await (conn as any).execute(
        `INSERT INTO shop_user_coupon (tenant_id, coupon_id, user_id, status, expire_at)
         VALUES (?,?,?,'unused',?)`,
        [TENANT, input.couponId, ctx.user.id, expireStr]
      );
      await (conn as any).execute(
        `UPDATE shop_coupon SET claimed_qty = claimed_qty + 1 WHERE id=?`,
        [input.couponId]
      );
      return { ok: true };
    }),

  // ============ 客人：我的券 ============
  myCoupons: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return [];
    // 顺手过期失效
    await (conn as any).execute(
      `UPDATE shop_user_coupon SET status='expired'
       WHERE user_id=? AND tenant_id=? AND status='unused' AND expire_at IS NOT NULL AND expire_at < NOW()`,
      [ctx.user.id, TENANT]
    );
    const [rows] = (await (conn as any).execute(
      `SELECT uc.id AS uc_id, uc.status, uc.expire_at, uc.used_at, c.*
       FROM shop_user_coupon uc JOIN shop_coupon c ON c.id = uc.coupon_id
       WHERE uc.user_id=? AND uc.tenant_id=?
       ORDER BY FIELD(uc.status,'unused','used','expired'), uc.id DESC`,
      [ctx.user.id, TENANT]
    )) as any;
    return rows as any[];
  }),

  // ============ 客人：按订单金额返回可用券 + 折扣试算 ============
  usableForAmount: protectedProcedure
    .input(z.object({ amount: z.number().min(0) }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      const [rows] = (await (conn as any).execute(
        `SELECT uc.id AS uc_id, uc.expire_at, c.*
         FROM shop_user_coupon uc JOIN shop_coupon c ON c.id = uc.coupon_id
         WHERE uc.user_id=? AND uc.tenant_id=? AND uc.status='unused'
           AND (uc.expire_at IS NULL OR uc.expire_at > NOW())
         ORDER BY uc.id DESC`,
        [ctx.user.id, TENANT]
      )) as any;
      return (rows as any[]).map((r) => {
        const eligible = input.amount >= Number(r.threshold || 0);
        const discount = eligible ? calcDiscount(r, input.amount) : 0;
        return { ...r, eligible, discount };
      });
    }),
});
