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
} from "../drizzle/schema";
import { eq, desc, and, asc } from "drizzle-orm";
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
});
