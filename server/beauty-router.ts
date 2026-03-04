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
  beautyPoints,
  beautyPointsLog,
  beautyMemberCards,
  beautyVisitLogs,
  users,
} from "../drizzle/schema";
import { eq, and, desc, asc, sql, ne } from "drizzle-orm";
import { hasFeaturePermission } from "./db-permissions";
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
      .input(z.object({ name: z.string().min(1), price: z.string(), description: z.string().optional(), imageUrl: z.string().optional(), brandId: z.number(), categoryId: z.number(), specification: z.string().optional(), stock: z.number().default(0), sortOrder: z.number().optional() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
        await db.insert(beautyProducts).values({ ...input, description: input.description ?? null, imageUrl: input.imageUrl ?? null, specification: input.specification ?? null, isActive: 1, sortOrder: input.sortOrder ?? 0 });
        return { success: true };
      }),

    // 管理员：更新商品
    updateProduct: adminProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).optional(), price: z.string().optional(), description: z.string().optional(), imageUrl: z.string().optional(), specification: z.string().optional(), sortOrder: z.number().optional(), isActive: z.number().optional() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
        const { id, ...updates } = input;
        await db.update(beautyProducts).set(updates).where(eq(beautyProducts.id, id));
        return { success: true };
      }),

    // 管理员：删除商品
    deleteProduct: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
        await db.delete(beautyProducts).where(eq(beautyProducts.id, input.id));
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
          const data = await res.json() as { code: number; result?: { newslist: Array<{ id: string; title: string; description: string; picUrl: string; ctime: string; url: string; source?: string }> } };
          if (data.code === 200 && data.result?.newslist) {
            return data.result.newslist;
          }
          return [];
        } catch {
          return [];
        }
      }),
  }),

  // ===== 奢贝积分系统 =====
  points: router({
    // 获取当前用户的积分余额
    getMyBalance: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { balance: 0 };
      const [account] = await db
        .select({ balance: beautyPoints.balance })
        .from(beautyPoints)
        .where(eq(beautyPoints.userId, ctx.user.id));
      return { balance: account?.balance ?? 0 };
    }),

    // 检查当前用户是否有积分管理权限
    canManage: protectedProcedure.query(async ({ ctx }) => {
      const canManage = await hasFeaturePermission(ctx.user.id, 'beauty-points-manage');
      return { canManage };
    }),

    // 检查当前用户是否有奢贝个人中心权限
    canAccessProfile: protectedProcedure.query(async ({ ctx }) => {
      const canAccess = await hasFeaturePermission(ctx.user.id, 'beauty-profile');
      return { canAccess };
    }),

    // 获取我的客户列表（我邀请的用户 + 他们的积分）
    getMyClients: protectedProcedure.query(async ({ ctx }) => {
      const canManage = await hasFeaturePermission(ctx.user.id, 'beauty-points-manage');
      if (!canManage) {
        throw new TRPCError({ code: 'FORBIDDEN', message: '无积分管理权限' });
      }
      const db = await getDb();
      if (!db) return [];
      const invitedUsers = await db
        .select({
          id: users.id,
          username: users.username,
          name: users.name,
          avatar: users.avatar,
          invitedAt: users.invitedAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.invitedByUserId, ctx.user.id))
        .orderBy(sql`${users.invitedAt} DESC`);

      const result = await Promise.all(
        invitedUsers.map(async (u) => {
          const [account] = await db
            .select({ balance: beautyPoints.balance })
            .from(beautyPoints)
            .where(eq(beautyPoints.userId, u.id));
          return { ...u, pointsBalance: account?.balance ?? 0 };
        })
      );
      return result;
    }),

    // 加减积分
    adjustPoints: protectedProcedure
      .input(z.object({
        userId: z.number(),
        amount: z.number().int(),
        remark: z.string().max(200).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const canManage = await hasFeaturePermission(ctx.user.id, 'beauty-points-manage');
        if (!canManage) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '无积分管理权限' });
        }
        if (input.amount === 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '变动数量不能为0' });
        }
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        // 验证目标用户是自己的邀请人
        const [targetUser] = await db
          .select({ id: users.id, invitedByUserId: users.invitedByUserId })
          .from(users)
          .where(eq(users.id, input.userId));
        if (!targetUser || targetUser.invitedByUserId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '只能管理自己邀请的客户的积分' });
        }
        // 获取或创建积分账户
        let [account] = await db
          .select()
          .from(beautyPoints)
          .where(eq(beautyPoints.userId, input.userId));
        if (!account) {
          await db.insert(beautyPoints).values({ userId: input.userId, balance: 0 });
          [account] = await db
            .select()
            .from(beautyPoints)
            .where(eq(beautyPoints.userId, input.userId));
        }
        const newBalance = account.balance + input.amount;
        if (newBalance < 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: '积分不足，无法扣减' });
        }
        await db
          .update(beautyPoints)
          .set({ balance: newBalance })
          .where(eq(beautyPoints.userId, input.userId));
        await db.insert(beautyPointsLog).values({
          userId: input.userId,
          operatorId: ctx.user.id,
          amount: input.amount,
          balanceAfter: newBalance,
          remark: input.remark || null,
        });
        return { success: true, newBalance };
      }),

    // 获取某用户的积分变动日志
    getPointsLog: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ ctx, input }) => {
        const canManage = await hasFeaturePermission(ctx.user.id, 'beauty-points-manage');
        if (!canManage) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '无积分管理权限' });
        }
        const db = await getDb();
        if (!db) return [];
        return await db
          .select()
          .from(beautyPointsLog)
          .where(eq(beautyPointsLog.userId, input.userId))
          .orderBy(desc(beautyPointsLog.createdAt));
      }),
  }),

  // ===== 消费卡 & 消费记录 =====
  card: router({
    // 获取指定客户的当前有效卡
    getClientCard: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ ctx, input }) => {
        const canManage = await hasFeaturePermission(ctx.user.id, 'beauty-points-manage');
        if (!canManage) throw new TRPCError({ code: 'FORBIDDEN', message: '无权限' });
        const db = await getDb();
        if (!db) return null;
        const [card] = await db
          .select()
          .from(beautyMemberCards)
          .where(and(eq(beautyMemberCards.userId, input.userId), eq(beautyMemberCards.isActive, 1)))
          .orderBy(desc(beautyMemberCards.createdAt))
          .limit(1);
        return card ?? null;
      }),

    // 批量获取多个客户的卡信息（用于客户列表页）
    getClientsCards: protectedProcedure
      .input(z.object({ userIds: z.array(z.number()) }))
      .query(async ({ ctx, input }) => {
        const canManage = await hasFeaturePermission(ctx.user.id, 'beauty-points-manage');
        if (!canManage) throw new TRPCError({ code: 'FORBIDDEN', message: '无权限' });
        const db = await getDb();
        if (!db || input.userIds.length === 0) return [];
        return await db
          .select()
          .from(beautyMemberCards)
          .where(and(
            sql`${beautyMemberCards.userId} IN (${sql.join(input.userIds.map(id => sql`${id}`), sql`, `)})`,
            eq(beautyMemberCards.isActive, 1)
          ))
          .orderBy(desc(beautyMemberCards.createdAt));
      }),

    // 添加/更新消费卡（新卡会将旧卡设为失效）
    addCard: protectedProcedure
      .input(z.object({
        userId: z.number(),
        cardType: z.enum(['monthly', 'quarterly', 'semiannual', 'annual']),
        startDate: z.string(), // YYYY-MM-DD
        remark: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const canManage = await hasFeaturePermission(ctx.user.id, 'beauty-points-manage');
        if (!canManage) throw new TRPCError({ code: 'FORBIDDEN', message: '无权限' });
        // 验证是自己的邀请人
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const [targetUser] = await db
          .select({ id: users.id, invitedByUserId: users.invitedByUserId })
          .from(users)
          .where(eq(users.id, input.userId));
        if (!targetUser || targetUser.invitedByUserId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '只能管理自己邀请的客户' });
        }
        // 计算到期日
        const start = new Date(input.startDate);
        const daysMap: Record<string, number> = {
          monthly: 30,
          quarterly: 90,
          semiannual: 180,
          annual: 365,
        };
        const endDate = new Date(start);
        endDate.setDate(endDate.getDate() + daysMap[input.cardType]);
        const endDateStr = endDate.toISOString().split('T')[0];
        // 将旧卡设为失效
        await db
          .update(beautyMemberCards)
          .set({ isActive: 0 })
          .where(and(eq(beautyMemberCards.userId, input.userId), eq(beautyMemberCards.isActive, 1)));
        // 插入新卡
        await db.insert(beautyMemberCards).values({
          userId: input.userId,
          operatorId: ctx.user.id,
          cardType: input.cardType,
          startDate: input.startDate,
          endDate: endDateStr,
          isActive: 1,
          remark: input.remark || null,
        });
        return { success: true, endDate: endDateStr };
      }),

    // 更新消费卡（修改卡类型和开始日期）
    updateCard: protectedProcedure
      .input(z.object({
        cardId: z.number(),
        cardType: z.enum(['monthly', 'quarterly', 'semiannual', 'annual']),
        startDate: z.string(),
        remark: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const canManage = await hasFeaturePermission(ctx.user.id, 'beauty-points-manage');
        if (!canManage) throw new TRPCError({ code: 'FORBIDDEN', message: '无权限' });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const [card] = await db
          .select({ id: beautyMemberCards.id, userId: beautyMemberCards.userId })
          .from(beautyMemberCards)
          .where(eq(beautyMemberCards.id, input.cardId));
        if (!card) throw new TRPCError({ code: 'NOT_FOUND', message: '卡不存在' });
        const [targetUser] = await db
          .select({ invitedByUserId: users.invitedByUserId })
          .from(users)
          .where(eq(users.id, card.userId));
        if (!targetUser || targetUser.invitedByUserId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '只能管理自己邀请的客户' });
        }
        const daysMap: Record<string, number> = {
          monthly: 30, quarterly: 90, semiannual: 180, annual: 365,
        };
        const end = new Date(input.startDate);
        end.setDate(end.getDate() + daysMap[input.cardType]);
        const endDateStr = end.toISOString().split('T')[0];
        await db
          .update(beautyMemberCards)
          .set({
            cardType: input.cardType,
            startDate: input.startDate,
            endDate: endDateStr,
            remark: input.remark || null,
          })
          .where(eq(beautyMemberCards.id, input.cardId));
        return { success: true, endDate: endDateStr };
      }),

    // 删除消费卡（软删除，设为失效）
    deleteCard: protectedProcedure
      .input(z.object({ cardId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const canManage = await hasFeaturePermission(ctx.user.id, 'beauty-points-manage');
        if (!canManage) throw new TRPCError({ code: 'FORBIDDEN', message: '无权限' });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const [card] = await db
          .select({ id: beautyMemberCards.id, userId: beautyMemberCards.userId })
          .from(beautyMemberCards)
          .where(eq(beautyMemberCards.id, input.cardId));
        if (!card) throw new TRPCError({ code: 'NOT_FOUND', message: '卡不存在' });
        const [targetUser] = await db
          .select({ invitedByUserId: users.invitedByUserId })
          .from(users)
          .where(eq(users.id, card.userId));
        if (!targetUser || targetUser.invitedByUserId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '只能管理自己邀请的客户' });
        }
        await db
          .update(beautyMemberCards)
          .set({ isActive: 0 })
          .where(eq(beautyMemberCards.id, input.cardId));
        return { success: true };
      }),
  }),

  // ===== 消费次数 =====
  visit: router({
    // 批量获取多个客户的消费次数
    getClientsVisitCount: protectedProcedure
      .input(z.object({ userIds: z.array(z.number()) }))
      .query(async ({ ctx, input }) => {
        const canManage = await hasFeaturePermission(ctx.user.id, 'beauty-points-manage');
        if (!canManage) throw new TRPCError({ code: 'FORBIDDEN', message: '无权限' });
        const db = await getDb();
        if (!db || input.userIds.length === 0) return [];
        const rows = await db
          .select({
            userId: beautyVisitLogs.userId,
            count: sql<number>`COUNT(*)`,
          })
          .from(beautyVisitLogs)
          .where(sql`${beautyVisitLogs.userId} IN (${sql.join(input.userIds.map(id => sql`${id}`), sql`, `)})`)
          .groupBy(beautyVisitLogs.userId);
        return rows;
      }),

    // 添加一次消费记录
    addVisit: protectedProcedure
      .input(z.object({
        userId: z.number(),
        visitDate: z.string().optional(), // YYYY-MM-DD，默认今天
        remark: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const canManage = await hasFeaturePermission(ctx.user.id, 'beauty-points-manage');
        if (!canManage) throw new TRPCError({ code: 'FORBIDDEN', message: '无权限' });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const [targetUser] = await db
          .select({ id: users.id, invitedByUserId: users.invitedByUserId })
          .from(users)
          .where(eq(users.id, input.userId));
        if (!targetUser || targetUser.invitedByUserId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '只能管理自己邀请的客户' });
        }
        await db.insert(beautyVisitLogs).values({
          userId: input.userId,
          operatorId: ctx.user.id,
          visitDate: input.visitDate || new Date().toISOString().split('T')[0],
          remark: input.remark || null,
        });
        return { success: true };
      }),

    // 获取某客户的消费记录
    getVisitLog: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ ctx, input }) => {
        const canManage = await hasFeaturePermission(ctx.user.id, 'beauty-points-manage');
        if (!canManage) throw new TRPCError({ code: 'FORBIDDEN', message: '无权限' });
        const db = await getDb();
        if (!db) return [];
        return await db
          .select()
          .from(beautyVisitLogs)
          .where(eq(beautyVisitLogs.userId, input.userId))
          .orderBy(desc(beautyVisitLogs.createdAt));
      }),

    // 编辑消费记录（修改日期和备注）
    updateVisit: protectedProcedure
      .input(z.object({
        visitId: z.number(),
        visitDate: z.string(),
        remark: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const canManage = await hasFeaturePermission(ctx.user.id, 'beauty-points-manage');
        if (!canManage) throw new TRPCError({ code: 'FORBIDDEN', message: '无权限' });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        // 验证记录属于自己管理的客户
        const [visit] = await db
          .select({ id: beautyVisitLogs.id, userId: beautyVisitLogs.userId })
          .from(beautyVisitLogs)
          .where(eq(beautyVisitLogs.id, input.visitId));
        if (!visit) throw new TRPCError({ code: 'NOT_FOUND', message: '记录不存在' });
        const [targetUser] = await db
          .select({ invitedByUserId: users.invitedByUserId })
          .from(users)
          .where(eq(users.id, visit.userId));
        if (!targetUser || targetUser.invitedByUserId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '只能管理自己邀请的客户' });
        }
        await db
          .update(beautyVisitLogs)
          .set({
            visitDate: input.visitDate,
            remark: input.remark || null,
          })
          .where(eq(beautyVisitLogs.id, input.visitId));
        return { success: true };
      }),

    // 删除消费记录
    deleteVisit: protectedProcedure
      .input(z.object({ visitId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const canManage = await hasFeaturePermission(ctx.user.id, 'beauty-points-manage');
        if (!canManage) throw new TRPCError({ code: 'FORBIDDEN', message: '无权限' });
        const db = await getDb();
        if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '数据库不可用' });
        const [visit] = await db
          .select({ id: beautyVisitLogs.id, userId: beautyVisitLogs.userId })
          .from(beautyVisitLogs)
          .where(eq(beautyVisitLogs.id, input.visitId));
        if (!visit) throw new TRPCError({ code: 'NOT_FOUND', message: '记录不存在' });
        const [targetUser] = await db
          .select({ invitedByUserId: users.invitedByUserId })
          .from(users)
          .where(eq(users.id, visit.userId));
        if (!targetUser || targetUser.invitedByUserId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: '只能管理自己邀请的客户' });
        }
        await db
          .delete(beautyVisitLogs)
          .where(eq(beautyVisitLogs.id, input.visitId));
        return { success: true };
      }),
  }),
});
