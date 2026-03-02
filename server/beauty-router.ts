/**
 * 奢贝美容院模块 - 后端路由
 * 使用脉动网的数据库和认证体系
 */
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import {
  beautyServices,
  beautyAppointments,
  beautyPromotions,
  beautyBrands,
  beautyProductCategories,
  beautyProductEffects,
  beautyProducts,
  beautyProductEffectMappings,
  beautyCartItems,
  beautyOrders,
  beautyOrderItems,
} from "../drizzle/schema";
import { eq, and, desc, asc, sql, ne } from "drizzle-orm";
import { nanoid } from "nanoid";

// 超管权限检查（复用脉动网的 super_admin 角色）
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "super_admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "仅超级管理员可访问" });
  }
  return next({ ctx });
});

export const beautyRouter = router({
  // ===== 美容服务 =====
  service: router({
    list: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(beautyServices)
        .where(eq(beautyServices.isActive, 1))
        .orderBy(asc(beautyServices.id));
    }),

    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const rows = await db
          .select()
          .from(beautyServices)
          .where(eq(beautyServices.id, input.id))
          .limit(1);
        return rows[0] ?? null;
      }),

    // 管理员：创建服务
    create: adminProcedure
      .input(
        z.object({
          name: z.string().min(1),
          description: z.string().optional(),
          price: z.string(),
          duration: z.number(),
          imageUrl: z.string().optional(),
          category: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
        await db.insert(beautyServices).values({
          name: input.name,
          description: input.description ?? null,
          price: input.price,
          duration: input.duration,
          imageUrl: input.imageUrl ?? null,
          category: input.category ?? null,
          isActive: 1,
        });
        return { success: true };
      }),
  }),

  // ===== 预约 =====
  appointment: router({
    // 获取可用时段
    getAvailableSlots: publicProcedure
      .input(z.object({ date: z.string(), serviceId: z.number().optional() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const allSlots: string[] = [];
        for (let hour = 11; hour < 20; hour++) {
          const start = `${hour.toString().padStart(2, "0")}:00`;
          const end = `${(hour + 1).toString().padStart(2, "0")}:00`;
          allSlots.push(`${start}-${end}`);
        }
        if (!db) return allSlots.map((slot) => ({ slot, available: true }));

        const dateStart = new Date(input.date);
        dateStart.setHours(0, 0, 0, 0);
        const dateEnd = new Date(input.date);
        dateEnd.setHours(23, 59, 59, 999);

        const existing = await db
          .select({ timeSlot: beautyAppointments.timeSlot, status: beautyAppointments.status })
          .from(beautyAppointments)
          .where(
            and(
              sql`${beautyAppointments.appointmentDate} >= ${dateStart}`,
              sql`${beautyAppointments.appointmentDate} <= ${dateEnd}`,
              ne(beautyAppointments.status, "cancelled")
            )
          );

        const bookedSlots = existing.map((a) => a.timeSlot);
        return allSlots.map((slot) => ({ slot, available: !bookedSlots.includes(slot) }));
      }),

    // 创建预约
    create: protectedProcedure
      .input(
        z.object({
          serviceId: z.number(),
          appointmentDate: z.string(),
          timeSlot: z.string(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
        await db.insert(beautyAppointments).values({
          userId: ctx.user.id,
          serviceId: input.serviceId,
          appointmentDate: new Date(input.appointmentDate),
          timeSlot: input.timeSlot,
          notes: input.notes ?? null,
          status: "pending",
        });
        return { success: true };
      }),

    // 我的预约
    myList: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          id: beautyAppointments.id,
          serviceId: beautyAppointments.serviceId,
          appointmentDate: beautyAppointments.appointmentDate,
          timeSlot: beautyAppointments.timeSlot,
          status: beautyAppointments.status,
          notes: beautyAppointments.notes,
          createdAt: beautyAppointments.createdAt,
          serviceName: beautyServices.name,
          servicePrice: beautyServices.price,
          serviceDuration: beautyServices.duration,
        })
        .from(beautyAppointments)
        .leftJoin(beautyServices, eq(beautyAppointments.serviceId, beautyServices.id))
        .where(eq(beautyAppointments.userId, ctx.user.id))
        .orderBy(desc(beautyAppointments.createdAt));
      return rows;
    }),

    // 取消预约
    cancel: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
        const rows = await db
          .select()
          .from(beautyAppointments)
          .where(eq(beautyAppointments.id, input.id))
          .limit(1);
        const apt = rows[0];
        if (!apt) throw new TRPCError({ code: "NOT_FOUND", message: "预约不存在" });
        if (apt.userId !== ctx.user.id && ctx.user.role !== "super_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "无权操作此预约" });
        }
        await db
          .update(beautyAppointments)
          .set({ status: "cancelled" })
          .where(eq(beautyAppointments.id, input.id));
        return { success: true };
      }),

    // 管理员：获取所有预约
    adminList: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(beautyAppointments)
        .orderBy(desc(beautyAppointments.createdAt));
    }),

    // 管理员：更新预约状态
    updateStatus: adminProcedure
      .input(z.object({ id: z.number(), status: z.enum(["pending", "confirmed", "completed", "cancelled"]) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
        await db
          .update(beautyAppointments)
          .set({ status: input.status })
          .where(eq(beautyAppointments.id, input.id));
        return { success: true };
      }),
  }),

  // ===== 活动轮播 =====
  promotion: router({
    list: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(beautyPromotions)
        .where(eq(beautyPromotions.isActive, 1))
        .orderBy(asc(beautyPromotions.sortOrder));
    }),
  }),

  // ===== 商城 =====
  shop: router({
    // 品牌列表
    brands: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(beautyBrands)
        .where(eq(beautyBrands.isActive, 1))
        .orderBy(asc(beautyBrands.sortOrder));
    }),

    // 品牌详情
    getBrand: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const rows = await db
          .select()
          .from(beautyBrands)
          .where(eq(beautyBrands.id, input.id))
          .limit(1);
        return rows[0] ?? null;
      }),

    // 商品列表
    products: publicProcedure
      .input(z.object({ brandId: z.number().optional(), categoryId: z.number().optional() }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        let query = db
          .select()
          .from(beautyProducts)
          .where(eq(beautyProducts.isActive, 1))
          .orderBy(asc(beautyProducts.sortOrder));
        return query;
      }),

    // 商品详情
    getProduct: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const rows = await db
          .select()
          .from(beautyProducts)
          .where(eq(beautyProducts.id, input.id))
          .limit(1);
        return rows[0] ?? null;
      }),

    // 商品分类
    categories: publicProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(beautyProductCategories)
        .where(eq(beautyProductCategories.isActive, 1))
        .orderBy(asc(beautyProductCategories.sortOrder));
    }),

    // 购物车：获取
    getCart: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          id: beautyCartItems.id,
          productId: beautyCartItems.productId,
          quantity: beautyCartItems.quantity,
          productName: beautyProducts.name,
          productPrice: beautyProducts.price,
          productImageUrl: beautyProducts.imageUrl,
          productSpec: beautyProducts.specification,
        })
        .from(beautyCartItems)
        .leftJoin(beautyProducts, eq(beautyCartItems.productId, beautyProducts.id))
        .where(eq(beautyCartItems.userId, ctx.user.id));
      return rows;
    }),

    // 购物车：添加
    addToCart: protectedProcedure
      .input(z.object({ productId: z.number(), quantity: z.number().min(1).default(1) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
        // 检查是否已在购物车
        const existing = await db
          .select()
          .from(beautyCartItems)
          .where(and(eq(beautyCartItems.userId, ctx.user.id), eq(beautyCartItems.productId, input.productId)))
          .limit(1);
        if (existing.length > 0) {
          await db
            .update(beautyCartItems)
            .set({ quantity: existing[0].quantity + input.quantity })
            .where(eq(beautyCartItems.id, existing[0].id));
        } else {
          await db.insert(beautyCartItems).values({
            userId: ctx.user.id,
            productId: input.productId,
            quantity: input.quantity,
          });
        }
        return { success: true };
      }),

    // 购物车：更新数量
    updateCartItem: protectedProcedure
      .input(z.object({ id: z.number(), quantity: z.number().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
        await db
          .update(beautyCartItems)
          .set({ quantity: input.quantity })
          .where(and(eq(beautyCartItems.id, input.id), eq(beautyCartItems.userId, ctx.user.id)));
        return { success: true };
      }),

    // 购物车：删除
    removeCartItem: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
        await db
          .delete(beautyCartItems)
          .where(and(eq(beautyCartItems.id, input.id), eq(beautyCartItems.userId, ctx.user.id)));
        return { success: true };
      }),

    // 下单
    checkout: protectedProcedure
      .input(z.object({ shippingAddress: z.string().optional(), notes: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
        const cartItems = await db
          .select({
            id: beautyCartItems.id,
            productId: beautyCartItems.productId,
            quantity: beautyCartItems.quantity,
            productName: beautyProducts.name,
            productPrice: beautyProducts.price,
          })
          .from(beautyCartItems)
          .leftJoin(beautyProducts, eq(beautyCartItems.productId, beautyProducts.id))
          .where(eq(beautyCartItems.userId, ctx.user.id));

        if (cartItems.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "购物车为空" });
        }

        const totalAmount = cartItems
          .reduce((sum, item) => sum + parseFloat(item.productPrice ?? "0") * item.quantity, 0)
          .toFixed(2);

        const orderNumber = `SB${Date.now()}${nanoid(4).toUpperCase()}`;

        const result = await db.insert(beautyOrders).values({
          userId: ctx.user.id,
          orderNumber,
          totalAmount,
          status: "pending",
          shippingAddress: input.shippingAddress ?? null,
          notes: input.notes ?? null,
        });

        const orderId = Number((result as any).insertId ?? (result as any)[0]?.insertId ?? 0);

        for (const item of cartItems) {
          const subtotal = (parseFloat(item.productPrice ?? "0") * item.quantity).toFixed(2);
          await db.insert(beautyOrderItems).values({
            orderId,
            productId: item.productId,
            productName: item.productName ?? "",
            price: item.productPrice ?? "0",
            quantity: item.quantity,
            subtotal,
          });
        }

        // 清空购物车
        await db.delete(beautyCartItems).where(eq(beautyCartItems.userId, ctx.user.id));

        return { orderId, orderNumber, totalAmount, success: true };
      }),

    // 我的订单
    getOrders: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(beautyOrders)
        .where(eq(beautyOrders.userId, ctx.user.id))
        .orderBy(desc(beautyOrders.createdAt));
    }),

    // 管理员：创建品牌
    createBrand: adminProcedure
      .input(z.object({ name: z.string().min(1), description: z.string().optional(), logoUrl: z.string().optional(), bannerUrl: z.string().optional() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
        await db.insert(beautyBrands).values({ name: input.name, description: input.description ?? null, logoUrl: input.logoUrl ?? null, bannerUrl: input.bannerUrl ?? null, isActive: 1, sortOrder: 0 });
        return { success: true };
      }),

    // 管理员：创建商品
    createProduct: adminProcedure
      .input(z.object({ name: z.string().min(1), price: z.string(), description: z.string().optional(), imageUrl: z.string().optional(), brandId: z.number(), categoryId: z.number(), specification: z.string().optional(), stock: z.number().default(0) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
        await db.insert(beautyProducts).values({ ...input, description: input.description ?? null, imageUrl: input.imageUrl ?? null, specification: input.specification ?? null, isActive: 1, sortOrder: 0 });
        return { success: true };
      }),
  }),

  // ===== 健康资讯（天行数据代理）=====
  health: router({
    news: publicProcedure
      .input(z.object({ num: z.number().min(1).max(50).default(10), page: z.number().min(1).default(1), word: z.string().optional() }))
      .query(async ({ input }) => {
        const TIANAPI_KEY = "3878a89bed4728b65cc7d8dc0a644c07";
        const params = new URLSearchParams({
          key: TIANAPI_KEY,
          num: String(input.num),
          page: String(input.page),
          ...(input.word ? { word: input.word } : {}),
        });
        try {
          const res = await fetch(`https://apis.tianapi.com/health/index?${params}`);
          const data = await res.json() as { code: number; result?: { list: Array<{ id: number; title: string; description: string; picUrl: string; ctime: string; url: string }> } };
          if (data.code === 200 && data.result?.list) {
            return data.result.list;
          }
          return [];
        } catch {
          return [];
        }
      }),
  }),
});
