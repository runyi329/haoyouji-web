/**
 * 脉动共享商盟 - 商品库后端路由
 * 
 * 提供商品库的CRUD API，供后台管理页面使用
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import {
  merchants,
  merchantProducts,
  merchantProductCategories,
  merchantProductSpecs,
  merchantShopProducts,
  wineRegions,
  productImportRequests,
} from "../drizzle/schema";
import { eq, desc, and, asc, isNull } from "drizzle-orm";
import { storagePut } from "./storage";
import sharp from "sharp";

// ===== 商品路由 =====
export const merchantRouter = router({

  // 获取所有商品（管理员用）
  getProducts: protectedProcedure
    .input(z.object({
      merchantId: z.number().optional(),
      categoryId: z.number().optional(),
      status: z.enum(["active", "inactive", "draft"]).optional(),
    }).optional())
    .query(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });

      const rows = await db
        .select({
          id: merchantProducts.id,
          name: merchantProducts.name,
          subtitle: merchantProducts.subtitle,
          basePrice: merchantProducts.basePrice,
          originalPrice: merchantProducts.originalPrice,
          mainImageUrl: merchantProducts.mainImageUrl,
          categoryId: merchantProducts.categoryId,
          status: merchantProducts.status,
          sourceType: merchantProducts.sourceType,
          isShareable: merchantProducts.isShareable,
          salesCount: merchantProducts.salesCount,
          stock: merchantProducts.stock,
          ownerMerchantId: merchantProducts.ownerMerchantId,
          extendedFields: merchantProducts.extendedFields,
          createdAt: merchantProducts.createdAt,
          categoryName: merchantProductCategories.name,
          ownerShopName: merchants.shopName,
        })
        .from(merchantProducts)
        .leftJoin(merchantProductCategories, eq(merchantProducts.categoryId, merchantProductCategories.id))
        .leftJoin(merchants, eq(merchantProducts.ownerMerchantId, merchants.id))
        .orderBy(desc(merchantProducts.createdAt))
        .limit(200);

      return rows;
    }),

  // 获取商品分类
  getCategories: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const rows = await db
      .select()
      .from(merchantProductCategories)
      .where(eq(merchantProductCategories.isActive, 1))
      .orderBy(merchantProductCategories.sortOrder);

    return rows;
  }),

  // 获取商家列表
  getMerchants: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const rows = await db
      .select()
      .from(merchants)
      .orderBy(desc(merchants.createdAt));

    return rows;
  }),

  // 获取某个商家的店铺商品（前台用，公开接口）
  getShopProducts: publicProcedure
    .input(z.object({
      merchantCode: z.string(),
      categoryId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      // 先找到商家
      const merchantRows = await db
        .select()
        .from(merchants)
        .where(and(eq(merchants.merchantCode, input.merchantCode), eq(merchants.status, "active")))
        .limit(1);

      if (!merchantRows || merchantRows.length === 0) return [];
      const merchant = merchantRows[0];

      // 获取该商家店铺的商品
      const rows = await db
        .select({
          id: merchantProducts.id,
          name: merchantProducts.name,
          subtitle: merchantProducts.subtitle,
          basePrice: merchantProducts.basePrice,
          originalPrice: merchantProducts.originalPrice,
          mainImageUrl: merchantProducts.mainImageUrl,
          categoryId: merchantProducts.categoryId,
          status: merchantProducts.status,
          sourceType: merchantProducts.sourceType,
          extendedFields: merchantProducts.extendedFields,
          displayPrice: merchantShopProducts.displayPrice,
          isVisible: merchantShopProducts.isVisible,
          isOwned: merchantShopProducts.isOwned,
          customSortOrder: merchantShopProducts.customSortOrder,
          categoryName: merchantProductCategories.name,
        })
        .from(merchantShopProducts)
        .innerJoin(merchantProducts, eq(merchantShopProducts.productId, merchantProducts.id))
        .leftJoin(merchantProductCategories, eq(merchantProducts.categoryId, merchantProductCategories.id))
        .where(
          and(
            eq(merchantShopProducts.merchantId, merchant.id),
            eq(merchantShopProducts.isVisible, 1),
            eq(merchantProducts.status, "active")
          )
        )
        .orderBy(merchantShopProducts.customSortOrder, merchantProducts.sortOrder);

      return rows;
    }),

  // 获取商品详情（前台用）
  getProductDetail: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "NOT_FOUND" });

      const rows = await db
        .select({
          id: merchantProducts.id,
          name: merchantProducts.name,
          subtitle: merchantProducts.subtitle,
          description: merchantProducts.description,
          basePrice: merchantProducts.basePrice,
          originalPrice: merchantProducts.originalPrice,
          mainImageUrl: merchantProducts.mainImageUrl,
          imageUrls: merchantProducts.imageUrls,
          videoUrl: merchantProducts.videoUrl,
          categoryId: merchantProducts.categoryId,
          status: merchantProducts.status,
          sourceType: merchantProducts.sourceType,
          extendedFields: merchantProducts.extendedFields,
          stock: merchantProducts.stock,
          salesCount: merchantProducts.salesCount,
          categoryName: merchantProductCategories.name,
          ownerShopName: merchants.shopName,
          ownerMerchantCode: merchants.merchantCode,
        })
        .from(merchantProducts)
        .leftJoin(merchantProductCategories, eq(merchantProducts.categoryId, merchantProductCategories.id))
        .leftJoin(merchants, eq(merchantProducts.ownerMerchantId, merchants.id))
        .where(eq(merchantProducts.id, input.id))
        .limit(1);

      if (!rows || rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "商品不存在" });
      }

      // 获取规格
      const specs = await db
        .select()
        .from(merchantProductSpecs)
        .where(and(eq(merchantProductSpecs.productId, input.id), eq(merchantProductSpecs.isActive, 1)))
        .orderBy(merchantProductSpecs.sortOrder);

      return {
        ...rows[0],
        specs,
      };
    }),

  // 创建商品（管理员）
  createProduct: protectedProcedure
    .input(z.object({
      name: z.string().min(1, "商品名称不能为空"),
      subtitle: z.string().optional(),
      basePrice: z.string(),
      originalPrice: z.string().optional(),
      mainImageUrl: z.string().optional(),
      imageUrls: z.string().optional(),
      categoryId: z.number().optional(),
      status: z.enum(["active", "inactive", "draft"]).default("active"),
      sourceType: z.enum(["platform", "merchant", "shared"]).default("platform"),
      isShareable: z.number().default(1),
      stock: z.number().default(999),
      ownerMerchantId: z.number().optional(),
      extendedFields: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.insert(merchantProducts).values({
        name: input.name,
        subtitle: input.subtitle || null,
        basePrice: input.basePrice,
        originalPrice: input.originalPrice || null,
        mainImageUrl: input.mainImageUrl || null,
        imageUrls: input.imageUrls || null,
        categoryId: input.categoryId || null,
        status: input.status,
        sourceType: input.sourceType,
        isShareable: input.isShareable,
        stock: input.stock,
        ownerMerchantId: input.ownerMerchantId || null,
        extendedFields: input.extendedFields || null,
        description: input.description || null,
      });

      return { success: true };
    }),

  // 更新商品（管理员）
  updateProduct: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      subtitle: z.string().optional(),
      basePrice: z.string().optional(),
      originalPrice: z.string().optional(),
      mainImageUrl: z.string().optional(),
      categoryId: z.number().optional(),
      status: z.enum(["active", "inactive", "draft"]).optional(),
      isShareable: z.number().optional(),
      stock: z.number().optional(),
      extendedFields: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { id, ...fields } = input;
      const updateData: Record<string, unknown> = {};
      Object.entries(fields).forEach(([key, value]) => {
        if (value !== undefined) updateData[key] = value;
      });

      if (Object.keys(updateData).length === 0) return { success: true };

      await db.update(merchantProducts).set(updateData as any).where(eq(merchantProducts.id, id));

      return { success: true };
    }),

  // 删除商品（软删除，改为inactive状态）
  deleteProduct: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(merchantProducts)
        .set({ status: "inactive" })
        .where(eq(merchantProducts.id, input.id));

      return { success: true };
    }),

  // 创建商家
  createMerchant: protectedProcedure
    .input(z.object({
      userId: z.number(),
      merchantCode: z.string(),
      shopName: z.string(),
      shopDescription: z.string().optional(),
      themeColor: z.string().default("#722F37"),
      shopType: z.string().optional(),
      contactPhone: z.string().optional(),
      contactWechat: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.insert(merchants).values({
        userId: input.userId,
        merchantCode: input.merchantCode,
        shopName: input.shopName,
        shopDescription: input.shopDescription || null,
        themeColor: input.themeColor,
        shopType: input.shopType || null,
        contactPhone: input.contactPhone || null,
        contactWechat: input.contactWechat || null,
      });

      return { success: true };
    }),

    // 获取商家信息（前台用，公开接口）
  getMerchantByCode: publicProcedure
    .input(z.object({ merchantCode: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(merchants)
        .where(and(eq(merchants.merchantCode, input.merchantCode), eq(merchants.status, "active")))
        .limit(1);
      return rows && rows.length > 0 ? rows[0] : null;
    }),

  // ===== 前台商城接口（公开）=====
  // 获取已上架商品（前台商城展示）
  getPublicProducts: publicProcedure
    .input(z.object({
      merchantCode: z.string(),
      regionId: z.number().optional(),
      country: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      // 先找到商家
      const merchantRows = await db
        .select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.merchantCode, input.merchantCode))
        .limit(1);
      if (!merchantRows || merchantRows.length === 0) return [];
      const merchantId = merchantRows[0].id;
      // 查询已上架商品
      let query = db
        .select()
        .from(merchantProducts)
        .where(and(
          eq(merchantProducts.ownerMerchantId, merchantId),
          eq(merchantProducts.status, "active")
        ))
        .orderBy(desc(merchantProducts.sortOrder), desc(merchantProducts.createdAt));
      const rows = await query.limit(100);
      return rows;
    }),

  // ===== 产区管理接口 =====
  // 获取产区列表
  getWineRegions: publicProcedure
    .input(z.object({ merchantCode: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const merchantRows = await db
        .select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.merchantCode, input.merchantCode))
        .limit(1);
      if (!merchantRows || merchantRows.length === 0) return [];
      const merchantId = merchantRows[0].id;
      return await db
        .select()
        .from(wineRegions)
        .where(and(eq(wineRegions.merchantId, merchantId), eq(wineRegions.isActive, 1)))
        .orderBy(asc(wineRegions.sortOrder), asc(wineRegions.createdAt));
    }),

  // 创建产区
  createWineRegion: protectedProcedure
    .input(z.object({
      merchantId: z.number(),
      name: z.string(),
      country: z.string(),
      subRegion: z.string().optional(),
      description: z.string().optional(),
      flagEmoji: z.string().optional(),
      sortOrder: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(wineRegions).values({
        merchantId: input.merchantId,
        name: input.name,
        country: input.country,
        subRegion: input.subRegion || null,
        description: input.description || null,
        flagEmoji: input.flagEmoji || null,
        sortOrder: input.sortOrder,
      });
      return { success: true };
    }),

  // 更新产区
  updateWineRegion: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      country: z.string().optional(),
      subRegion: z.string().optional(),
      description: z.string().optional(),
      flagEmoji: z.string().optional(),
      sortOrder: z.number().optional(),
      isActive: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...fields } = input;
      const updateData: Record<string, unknown> = {};
      Object.entries(fields).forEach(([key, value]) => {
        if (value !== undefined) updateData[key] = value;
      });
      if (Object.keys(updateData).length > 0) {
        await db.update(wineRegions).set(updateData as any).where(eq(wineRegions.id, id));
      }
      return { success: true };
    }),

  // 删除产区
  deleteWineRegion: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(wineRegions).set({ isActive: 0 }).where(eq(wineRegions.id, input.id));
      return { success: true };
    }),

  // ===== 图片上传接口（含压缩）=====
  uploadProductImage: protectedProcedure
    .input(z.object({
      base64: z.string(),       // base64编码的图片数据
      mimeType: z.string(),     // 原始MIME类型
      filename: z.string(),     // 文件名
    }))
    .mutation(async ({ input }) => {
      // 解码base64
      const base64Data = input.base64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      // 使用sharp压缩图片（最大宽度800px，质量80，转为webp）
      const compressed = await sharp(buffer)
        .resize({ width: 800, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      // 上传到S3
      const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const key = `wine-products/${suffix}.webp`;
      const { url } = await storagePut(key, compressed, 'image/webp');
      return { url, key };
    }),

  // 获取商家自己的商品列表（商家后台用，含未上架）
  getMerchantProducts: protectedProcedure
    .input(z.object({
      merchantId: z.number(),
      status: z.enum(["active", "inactive", "draft", "all"]).default("all"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(merchantProducts.ownerMerchantId, input.merchantId)];
      if (input.status !== "all") {
        conditions.push(eq(merchantProducts.status, input.status));
      }
      return await db
        .select()
        .from(merchantProducts)
        .where(and(...conditions))
        .orderBy(desc(merchantProducts.createdAt))
        .limit(200);
    }),

  // 获取商家信息（通过userId）
  getMerchantByUserId: protectedProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(merchants)
        .where(eq(merchants.userId, input.userId))
        .limit(1);
      return rows && rows.length > 0 ? rows[0] : null;
    }),

  // ===== 平台总商品库接口（统一使用 merchantProducts，ownerMerchantId=NULL 表示平台总库商品）=====

  // 获取平台总库商品列表（ownerMerchantId IS NULL，管理员+商家均可浏览）
  getPlatformProducts: protectedProcedure
    .input(z.object({
      keyword: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(merchantProducts)
        .where(and(
          isNull(merchantProducts.ownerMerchantId),
          eq(merchantProducts.status, "active")
        ))
        .orderBy(desc(merchantProducts.createdAt))
        .limit(200);
      if (input?.keyword) {
        const kw = input.keyword.toLowerCase();
        return rows.filter((r: any) =>
          (r.name || "").toLowerCase().includes(kw) ||
          (r.subtitle || "").toLowerCase().includes(kw)
        );
      }
      return rows;
    }),

  // 创建平台总库商品（ownerMerchantId=NULL）
  createPlatformProduct: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      subtitle: z.string().optional(),
      basePrice: z.string(),
      mainImageUrl: z.string().optional(),
      description: z.string().optional(),
      extendedFields: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const [result] = await db.insert(merchantProducts).values({
        ownerMerchantId: null, // NULL = 平台总库商品
        name: input.name,
        subtitle: input.subtitle || null,
        basePrice: input.basePrice,
        mainImageUrl: input.mainImageUrl || null,
        description: input.description || null,
        extendedFields: input.extendedFields || null,
        sourceType: "platform",
        status: "active",
        isShareable: 1,
      });
      return { id: (result as any).insertId };
    }),

  // 更新平台总库商品
  updatePlatformProduct: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).optional(),
      subtitle: z.string().optional(),
      basePrice: z.string().optional(),
      mainImageUrl: z.string().optional(),
      description: z.string().optional(),
      extendedFields: z.string().optional(),
      status: z.enum(["active", "inactive", "draft"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const { id, ...updates } = input;
      const clean: Record<string, unknown> = {};
      Object.entries(updates).forEach(([k, v]) => { if (v !== undefined) clean[k] = v; });
      if (Object.keys(clean).length > 0) {
        await db.update(merchantProducts).set(clean as any).where(eq(merchantProducts.id, id));
      }
      return { success: true };
    }),

  // 下架平台总库商品（软删除）
  deletePlatformProduct: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      await db.update(merchantProducts)
        .set({ status: "inactive" })
        .where(eq(merchantProducts.id, input.id));
      return { success: true };
    }),

  // 平台主动推送商品给商家（admin_push，直接进入商家私库，未上架状态）
  pushProductToMerchant: protectedProcedure
    .input(z.object({
      productId: z.number(),       // merchant_products.id（平台总库商品）
      merchantCode: z.string(),
      message: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const merchantRows = await db
        .select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.merchantCode, input.merchantCode))
        .limit(1);
      if (!merchantRows || merchantRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "商家不存在" });
      }
      const merchantId = merchantRows[0].id;
      // 检查是否已推送过（避免重复）
      const existing = await db
        .select({ id: productImportRequests.id })
        .from(productImportRequests)
        .where(and(
          eq(productImportRequests.productId, input.productId),
          eq(productImportRequests.merchantId, merchantId),
          eq(productImportRequests.status, "approved")
        ))
        .limit(1);
      if (existing && existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "该商品已推送给此商家" });
      }
      // 获取平台总库商品
      const ppRows = await db
        .select()
        .from(merchantProducts)
        .where(and(eq(merchantProducts.id, input.productId), isNull(merchantProducts.ownerMerchantId)))
        .limit(1);
      if (!ppRows || ppRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "平台总库商品不存在" });
      }
      const pp = ppRows[0];
      // 在商家私库中创建商品副本
      const [insertResult] = await db.insert(merchantProducts).values({
        ownerMerchantId: merchantId,
        name: pp.name,
        subtitle: pp.subtitle,
        description: pp.description,
        mainImageUrl: pp.mainImageUrl,
        basePrice: pp.basePrice,
        extendedFields: pp.extendedFields,
        sourceType: "platform",
        status: "inactive",
        isShareable: 0,
      });
      const newProductId = (insertResult as any).insertId;
      // 记录推送历史
      await db.insert(productImportRequests).values({
        productId: input.productId,
        merchantId,
        merchantCode: input.merchantCode,
        requestType: "admin_push",
        status: "approved",
        message: input.message,
        reviewedBy: ctx.user.id,
        reviewedAt: new Date(),
        merchantProductId: newProductId,
      });
      return { success: true, merchantProductId: newProductId };
    }),

  // 商家申请从平台总库导入商品
  applyImportProduct: protectedProcedure
    .input(z.object({
      productId: z.number(),       // merchant_products.id（平台总库商品）
      merchantCode: z.string(),
      message: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const merchantRows = await db
        .select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.merchantCode, input.merchantCode))
        .limit(1);
      if (!merchantRows || merchantRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "商家不存在" });
      }
      const merchantId = merchantRows[0].id;
      const existing = await db
        .select({ id: productImportRequests.id, status: productImportRequests.status })
        .from(productImportRequests)
        .where(and(
          eq(productImportRequests.productId, input.productId),
          eq(productImportRequests.merchantId, merchantId)
        ))
        .limit(1);
      if (existing && existing.length > 0) {
        const s = existing[0].status;
        if (s === "pending") throw new TRPCError({ code: "CONFLICT", message: "已有待审核的申请" });
        if (s === "approved") throw new TRPCError({ code: "CONFLICT", message: "该商品已导入" });
      }
      await db.insert(productImportRequests).values({
        productId: input.productId,
        merchantId,
        merchantCode: input.merchantCode,
        requestType: "merchant_apply",
        status: "pending",
        message: input.message,
      });
      return { success: true };
    }),

  // 获取导入申请列表（管理员审核用）
  getImportRequests: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      merchantCode: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          id: productImportRequests.id,
          productId: productImportRequests.productId,
          merchantId: productImportRequests.merchantId,
          merchantCode: productImportRequests.merchantCode,
          requestType: productImportRequests.requestType,
          status: productImportRequests.status,
          message: productImportRequests.message,
          replyMessage: productImportRequests.replyMessage,
          reviewedAt: productImportRequests.reviewedAt,
          merchantProductId: productImportRequests.merchantProductId,
          createdAt: productImportRequests.createdAt,
          productName: merchantProducts.name,
          productSubtitle: merchantProducts.subtitle,
          productImageUrl: merchantProducts.mainImageUrl,
          merchantName: merchants.shopName,
        })
        .from(productImportRequests)
        .leftJoin(merchantProducts, eq(productImportRequests.productId, merchantProducts.id))
        .leftJoin(merchants, eq(productImportRequests.merchantId, merchants.id))
        .orderBy(desc(productImportRequests.createdAt))
        .limit(200);
      if (input?.status) return rows.filter((r: any) => r.status === input.status);
      if (input?.merchantCode) return rows.filter((r: any) => r.merchantCode === input.merchantCode);
      return rows;
    }),

  // 获取商家自己的申请列表
  getMerchantImportRequests: protectedProcedure
    .input(z.object({ merchantCode: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return await db
        .select({
          id: productImportRequests.id,
          productId: productImportRequests.productId,
          status: productImportRequests.status,
          requestType: productImportRequests.requestType,
          message: productImportRequests.message,
          replyMessage: productImportRequests.replyMessage,
          reviewedAt: productImportRequests.reviewedAt,
          createdAt: productImportRequests.createdAt,
          productName: merchantProducts.name,
          productSubtitle: merchantProducts.subtitle,
          productImageUrl: merchantProducts.mainImageUrl,
        })
        .from(productImportRequests)
        .leftJoin(merchantProducts, eq(productImportRequests.productId, merchantProducts.id))
        .where(eq(productImportRequests.merchantCode, input.merchantCode))
        .orderBy(desc(productImportRequests.createdAt))
        .limit(100);
    }),

  // 审核导入申请（管理员）
  reviewImportRequest: protectedProcedure
    .input(z.object({
      requestId: z.number(),
      action: z.enum(["approve", "reject"]),
      replyMessage: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const reqRows = await db
        .select()
        .from(productImportRequests)
        .where(eq(productImportRequests.id, input.requestId))
        .limit(1);
      if (!reqRows || reqRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "申请不存在" });
      }
      const req = reqRows[0];
      if (req.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "申请已处理" });
      }
      if (input.action === "approve") {
        // 获取平台总库商品
        const ppRows = await db
          .select()
          .from(merchantProducts)
          .where(and(eq(merchantProducts.id, req.productId), isNull(merchantProducts.ownerMerchantId)))
          .limit(1);
        if (!ppRows || ppRows.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "平台商品不存在" });
        }
        const pp = ppRows[0];
        const [insertResult] = await db.insert(merchantProducts).values({
          ownerMerchantId: req.merchantId,
          name: pp.name,
          subtitle: pp.subtitle,
          description: pp.description,
          mainImageUrl: pp.mainImageUrl,
          basePrice: pp.basePrice,
          extendedFields: pp.extendedFields,
          sourceType: "platform",
          status: "inactive",
          isShareable: 0,
        });
        const newProductId = (insertResult as any).insertId;
        await db.update(productImportRequests)
          .set({ status: "approved", replyMessage: input.replyMessage, reviewedBy: ctx.user.id, reviewedAt: new Date(), merchantProductId: newProductId })
          .where(eq(productImportRequests.id, input.requestId));
        return { success: true, merchantProductId: newProductId };
      } else {
        await db.update(productImportRequests)
          .set({ status: "rejected", replyMessage: input.replyMessage, reviewedBy: ctx.user.id, reviewedAt: new Date() })
          .where(eq(productImportRequests.id, input.requestId));
        return { success: true };
      }
    }),

  // ===== 商家设置接口 =====

  // 获取当前用户的商家设置
  getMerchantSettings: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select()
      .from(merchants)
      .where(eq(merchants.userId, ctx.user.id))
      .limit(1);
    if (!rows || rows.length === 0) return null;
    const m = rows[0] as any;
    return {
      id: m.id,
      shopName: m.shopName,
      shopDescription: m.shopDescription,
      shopLogoUrl: m.shopLogoUrl,
      shareTitle: m.share_title,
      shareLogo: m.share_logo,
      shareCoverImage: m.share_cover_image,
      shareDescription: m.share_description,
      contactWechat: m.contact_wechat || m.contactWechat,
      contactPhone: m.contact_phone || m.contactPhone,
      aboutUs: m.about_us,
      officialWebsite: m.official_website,
    };
  }),

  // 获取指定商家代码的分享信息（公开接口，用于前台Meta标签注入）
  getMerchantShareInfo: publicProcedure
    .input(z.object({ merchantCode: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(merchants)
        .where(eq(merchants.merchantCode, input.merchantCode))
        .limit(1);
      if (!rows || rows.length === 0) return null;
      const m = rows[0] as any;
      return {
        shareTitle: m.share_title || m.shopName,
        shareLogo: m.share_logo || m.shopLogoUrl,
        shareCoverImage: m.share_cover_image,
        shareDescription: m.share_description || m.shopDescription,
      };
    }),

  // 更新商家设置（文字信息）
  updateMerchantSettings: protectedProcedure
    .input(z.object({
      shareTitle: z.string().max(50).optional(),
      shareDescription: z.string().max(100).optional(),
      contactWechat: z.string().max(50).optional(),
      contactPhone: z.string().max(20).optional(),
      aboutUs: z.string().optional(),
      officialWebsite: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.userId, ctx.user.id))
        .limit(1);
      if (!rows || rows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "未找到商家信息" });
      }
      const merchantId = rows[0].id;
      await (db as any).execute(
        `UPDATE merchants SET share_title=?, share_description=?, contact_wechat=?, contact_phone=?, about_us=?, official_website=?, updatedAt=NOW() WHERE id=?`,
        [input.shareTitle ?? null, input.shareDescription ?? null, input.contactWechat ?? null, input.contactPhone ?? null, input.aboutUs ?? null, input.officialWebsite ?? null, merchantId]
      );
      return { success: true };
    }),

  // 上传商家分享Logo（400x400，WebP压缩）
  uploadMerchantLogo: protectedProcedure
    .input(z.object({
      base64: z.string(),
      mimeType: z.string().default('image/jpeg'),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.userId, ctx.user.id))
        .limit(1);
      if (!rows || rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "未找到商家信息" });
      const merchantId = rows[0].id;

      const buffer = Buffer.from(input.base64, 'base64');
      const compressed = await sharp(buffer)
        .resize({ width: 400, height: 400, fit: 'cover' })
        .webp({ quality: 85 })
        .toBuffer();
      const key = `merchant-logos/${merchantId}-logo-${Date.now()}.webp`;
      const { url } = await storagePut(key, compressed, 'image/webp');
      await (db as any).execute(`UPDATE merchants SET share_logo=?, updatedAt=NOW() WHERE id=?`, [url, merchantId]);
      return { url };
    }),

  // 上传商家分享封面图（1200x630，WebP压缩）
  uploadMerchantCover: protectedProcedure
    .input(z.object({
      base64: z.string(),
      mimeType: z.string().default('image/jpeg'),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.userId, ctx.user.id))
        .limit(1);
      if (!rows || rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "未找到商家信息" });
      const merchantId = rows[0].id;

      const buffer = Buffer.from(input.base64, 'base64');
      const compressed = await sharp(buffer)
        .resize({ width: 1200, height: 630, fit: 'cover' })
        .webp({ quality: 85 })
        .toBuffer();
      const key = `merchant-covers/${merchantId}-cover-${Date.now()}.webp`;
      const { url } = await storagePut(key, compressed, 'image/webp');
      await (db as any).execute(`UPDATE merchants SET share_cover_image=?, updatedAt=NOW() WHERE id=?`, [url, merchantId]);
      return { url };
    }),
});
