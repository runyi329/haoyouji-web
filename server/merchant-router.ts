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
  merchantProductShareRequests,
  wineRegions,
  productImportRequests,
} from "../drizzle/schema";
import { eq, desc, and, asc, isNull, ne, sql } from "drizzle-orm";
import { pointsRedeemOrders } from "../drizzle/merchant-schema";
import { storagePut } from "./storage";
import { uploadImageToCOS } from "./cos-upload";
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

      // 先尝试带 inPointsShop 字段查询，若字段不存在则降级查询（防止数据库迁移未完成时崩溃）
      try {
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
            inPointsShop: merchantProducts.inPointsShop,
            pointsPrice: merchantProducts.pointsPrice,
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
      } catch (e: any) {
        // 如果 inPointsShop 字段不存在，降级查询（不含该字段）
        if (e?.message?.includes('inPointsShop') || e?.message?.includes('Unknown column')) {
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
          return rows.map(r => ({ ...r, inPointsShop: 0 }));
        }
        throw e;
      }
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

  // 更新分类图标URL（管理员用）
  updateCategoryIcon: protectedProcedure
    .input(z.object({
      id: z.number(),
      iconUrl: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(merchantProductCategories)
        .set({ iconUrl: input.iconUrl })
        .where(eq(merchantProductCategories.id, input.id));
      return { success: true };
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
          inPointsShop: merchantProducts.inPointsShop,
          pointsPrice: merchantProducts.pointsPrice,
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

      // Step 1: 写入商品总库
      const [result] = await db.insert(merchantProducts).values({
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

      // Step 2: 如果是商家自有商品（有 ownerMerchantId），自动写入 merchantShopProducts
      // 这样商家在后台录入商品后，前台商城立即可见，无需额外操作
      if (input.ownerMerchantId && result.insertId) {
        await db.insert(merchantShopProducts).values({
          merchantId: input.ownerMerchantId,
          productId: result.insertId,
          isOwned: 1,
          isVisible: input.status === 'active' ? 1 : 0,
          customSortOrder: 0,
        });
      }

      return { success: true, productId: result.insertId };
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
      imageUrls: z.string().optional(),
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
      // 上传到腾讯云COS
      const suffix = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      const key = `wine-products/${suffix}.webp`;
      const url = await uploadImageToCOS(compressed, 'avatars', key);
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

  // 获取当前用户的商家设置（若无记录则自动初始化）
  getMerchantSettings: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    let rows = await db
      .select()
      .from(merchants)
      .where(eq(merchants.userId, ctx.user.id))
      .limit(1);

    // 方案A：查不到记录时，先尝试通过 openId/username 匹配已有商家记录并绑定 userId
    if (!rows || rows.length === 0) {
      // 生产库 users 表可能没有 username 字段，用 openId 作为备选 merchantCode
      const userIdentifier = (ctx.user as any).username || ctx.user.openId || `user_${ctx.user.id}`;
      // 先尝试查找已存在的同名商家记录（如 liulifan 已手动建好但 userId 为空）
      try {
        const existingByCode = await db
          .select()
          .from(merchants)
          .where(eq(merchants.merchantCode, userIdentifier))
          .limit(1);
        if (existingByCode && existingByCode.length > 0) {
          // 找到了，绑定 userId
          await db
            .update(merchants)
            .set({ userId: ctx.user.id })
            .where(eq(merchants.merchantCode, userIdentifier));
          rows = existingByCode;
        }
      } catch (_e) { /* ignore */ }
    }

    // 仍然没有记录，自动创建
    if (!rows || rows.length === 0) {
      const userIdentifier = (ctx.user as any).username || ctx.user.openId || `user_${ctx.user.id}`;
      const shopName = userIdentifier;
      try {
        await db.insert(merchants).values({
          userId: ctx.user.id,
          merchantCode: userIdentifier,
          shopName,
          status: 'active',
          isVerified: 0,
        });
        rows = await db
          .select()
          .from(merchants)
          .where(eq(merchants.userId, ctx.user.id))
          .limit(1);
      } catch (e) {
        // merchantCode 已存在（并发或重复），再查一次
        rows = await db
          .select()
          .from(merchants)
          .where(eq(merchants.userId, ctx.user.id))
          .limit(1);
      }
    }

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
      // splash_image 字段可能尚未迁移，安全读取
      splashImage: m.splash_image ?? null,
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

  // 获取商家公开设置（包括开机图，公开接口）
  getMerchantPublicSettings: publicProcedure
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
        splashImage: m.splash_image || null,
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
      const updateData: Record<string, unknown> = {};
      if (input.shareTitle !== undefined) updateData.share_title = input.shareTitle;
      if (input.shareDescription !== undefined) updateData.share_description = input.shareDescription;
      if (input.contactWechat !== undefined) updateData.contact_wechat = input.contactWechat;
      if (input.contactPhone !== undefined) updateData.contact_phone = input.contactPhone;
      if (input.aboutUs !== undefined) updateData.about_us = input.aboutUs;
      if (input.officialWebsite !== undefined) updateData.official_website = input.officialWebsite;
      if (Object.keys(updateData).length > 0) {
        await db.update(merchants).set(updateData as any).where(eq(merchants.id, merchantId));
      }
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
      const url = await uploadImageToCOS(compressed, 'avatars', key);
      await db.update(merchants).set({ share_logo: url }).where(eq(merchants.id, merchantId));
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
      const url = await uploadImageToCOS(compressed, 'avatars', key);
      await db.update(merchants).set({ share_cover_image: url }).where(eq(merchants.id, merchantId));
      return { url };
    }),

  // 上传商家开机画面（自动压缩为WebP，最大宽1200px）
  uploadSplashImage: protectedProcedure
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
      // 开机画面压缩：最大宽1200px，保持原始比例
      const compressed = await sharp(buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      const origKB = Math.round(buffer.length / 1024);
      const newKB = Math.round(compressed.length / 1024);
      console.log(`[Splash] 开机图压缩: ${origKB}KB → ${newKB}KB`);
      const key = `merchant-splash/${merchantId}-splash-${Date.now()}.webp`;
      const url = await uploadImageToCOS(compressed, 'avatars', key);
      try {
        // splash_image 字段可能尚未迁移，先尝试直接更新
        await db.update(merchants).set({ splash_image: url } as any).where(eq(merchants.id, merchantId));
      } catch (e: any) {
        if (e?.message?.includes('splash_image') || e?.code === 'ER_BAD_FIELD_ERROR') {
          // 字段不存在，用原生 SQL 添加字段后再更新
          const rawConn = (db as any).session?.client || (db as any)._client;
          if (rawConn) {
            await rawConn.execute('ALTER TABLE merchants ADD COLUMN IF NOT EXISTS splash_image TEXT');
            await db.update(merchants).set({ splash_image: url } as any).where(eq(merchants.id, merchantId));
          }
        } else {
          throw e;
        }
      }
      return { url };
    }),

  // ===== 共享商品接口 =====

  // 搜索其他商家（用于发起共享申请）
  searchMerchantsForSharing: protectedProcedure
    .input(z.object({
      keyword: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const myMerchant = await db.select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.userId, ctx.user.id))
        .limit(1);
      if (!myMerchant.length) throw new TRPCError({ code: "NOT_FOUND", message: "未找到商家信息" });
      const myMerchantId = myMerchant[0].id;
      const allMerchants = await db.select({
        id: merchants.id,
        merchantCode: merchants.merchantCode,
        shopName: merchants.shopName,
        shopLogoUrl: merchants.shopLogoUrl,
        shopType: merchants.shopType,
        shopDescription: merchants.shopDescription,
      })
        .from(merchants)
        .where(and(
          ne(merchants.id, myMerchantId),
          eq(merchants.status, "active")
        ))
        .orderBy(asc(merchants.shopName));
      const keyword = input.keyword?.trim().toLowerCase();
      const result = keyword
        ? allMerchants.filter(m =>
            m.shopName.toLowerCase().includes(keyword) ||
            m.merchantCode.toLowerCase().includes(keyword)
          )
        : allMerchants;
      return result;
    }),

  // 获取某商家的可共享商品列表
  getMerchantShareableProducts: protectedProcedure
    .input(z.object({
      ownerMerchantId: z.number(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const myMerchant = await db.select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.userId, ctx.user.id))
        .limit(1);
      if (!myMerchant.length) throw new TRPCError({ code: "NOT_FOUND", message: "未找到商家信息" });
      const myMerchantId = myMerchant[0].id;
      const products = await db.select()
        .from(merchantProducts)
        .where(and(
          eq(merchantProducts.ownerMerchantId, input.ownerMerchantId),
          eq(merchantProducts.status, "active"),
          eq(merchantProducts.isShareable, 1)
        ))
        .orderBy(desc(merchantProducts.createdAt));
      const myRequests = await db.select()
        .from(merchantProductShareRequests)
        .where(and(
          eq(merchantProductShareRequests.requesterMerchantId, myMerchantId),
          eq(merchantProductShareRequests.ownerMerchantId, input.ownerMerchantId)
        ));
      return { products, myRequests };
    }),

  // 发起共享商品申请
  applyProductShare: protectedProcedure
    .input(z.object({
      ownerMerchantId: z.number(),
      productId: z.number().optional(),
      proposedCommissionRate: z.number().min(0).max(100).optional(),
      message: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const myMerchant = await db.select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.userId, ctx.user.id))
        .limit(1);
      if (!myMerchant.length) throw new TRPCError({ code: "NOT_FOUND", message: "未找到商家信息" });
      const myMerchantId = myMerchant[0].id;
      if (myMerchantId === input.ownerMerchantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能申请共享自己的商品" });
      }
      const existing = await db.select({ id: merchantProductShareRequests.id })
        .from(merchantProductShareRequests)
        .where(and(
          eq(merchantProductShareRequests.requesterMerchantId, myMerchantId),
          eq(merchantProductShareRequests.ownerMerchantId, input.ownerMerchantId),
          input.productId
            ? eq(merchantProductShareRequests.productId, input.productId)
            : isNull(merchantProductShareRequests.productId),
          eq(merchantProductShareRequests.status, "pending")
        ))
        .limit(1);
      if (existing.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "已有待审核的申请，请等待对方处理" });
      }
      await db.insert(merchantProductShareRequests).values({
        requesterMerchantId: myMerchantId,
        ownerMerchantId: input.ownerMerchantId,
        productId: input.productId ?? null,
        proposedCommissionRate: input.proposedCommissionRate != null ? String(input.proposedCommissionRate) : null,
        message: input.message ?? null,
        status: "pending",
      });
      return { success: true };
    }),

  // 获取我发出的共享申请列表
  getMyShareRequests: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const myMerchant = await db.select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.userId, ctx.user.id))
        .limit(1);
      if (!myMerchant.length) return [];
      const myMerchantId = myMerchant[0].id;
      const requests = await db.select({
        id: merchantProductShareRequests.id,
        ownerMerchantId: merchantProductShareRequests.ownerMerchantId,
        productId: merchantProductShareRequests.productId,
        proposedCommissionRate: merchantProductShareRequests.proposedCommissionRate,
        agreedCommissionRate: merchantProductShareRequests.agreedCommissionRate,
        status: merchantProductShareRequests.status,
        message: merchantProductShareRequests.message,
        replyMessage: merchantProductShareRequests.replyMessage,
        createdAt: merchantProductShareRequests.createdAt,
        ownerShopName: merchants.shopName,
        ownerMerchantCode: merchants.merchantCode,
        ownerShopLogoUrl: merchants.shopLogoUrl,
      })
        .from(merchantProductShareRequests)
        .leftJoin(merchants, eq(merchantProductShareRequests.ownerMerchantId, merchants.id))
        .where(eq(merchantProductShareRequests.requesterMerchantId, myMerchantId))
        .orderBy(desc(merchantProductShareRequests.createdAt));
      const withProducts = await Promise.all(requests.map(async (req) => {
        if (!req.productId) return { ...req, product: null };
        const prods = await db.select({
          id: merchantProducts.id,
          name: merchantProducts.name,
          mainImageUrl: merchantProducts.mainImageUrl,
          basePrice: merchantProducts.basePrice,
        })
          .from(merchantProducts)
          .where(eq(merchantProducts.id, req.productId))
          .limit(1);
        return { ...req, product: prods[0] ?? null };
      }));
      return withProducts;
    }),

  // 获取收到的共享申请（对方审批用）
  getReceivedShareRequests: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const myMerchant = await db.select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.userId, ctx.user.id))
        .limit(1);
      if (!myMerchant.length) return [];
      const myMerchantId = myMerchant[0].id;
      const requests = await db.select({
        id: merchantProductShareRequests.id,
        requesterMerchantId: merchantProductShareRequests.requesterMerchantId,
        productId: merchantProductShareRequests.productId,
        proposedCommissionRate: merchantProductShareRequests.proposedCommissionRate,
        status: merchantProductShareRequests.status,
        message: merchantProductShareRequests.message,
        createdAt: merchantProductShareRequests.createdAt,
        requesterShopName: merchants.shopName,
        requesterMerchantCode: merchants.merchantCode,
        requesterShopLogoUrl: merchants.shopLogoUrl,
      })
        .from(merchantProductShareRequests)
        .leftJoin(merchants, eq(merchantProductShareRequests.requesterMerchantId, merchants.id))
        .where(eq(merchantProductShareRequests.ownerMerchantId, myMerchantId))
        .orderBy(desc(merchantProductShareRequests.createdAt));
      const withProducts = await Promise.all(requests.map(async (req) => {
        if (!req.productId) return { ...req, product: null };
        const prods = await db.select({
          id: merchantProducts.id,
          name: merchantProducts.name,
          mainImageUrl: merchantProducts.mainImageUrl,
          basePrice: merchantProducts.basePrice,
        })
          .from(merchantProducts)
          .where(eq(merchantProducts.id, req.productId))
          .limit(1);
        return { ...req, product: prods[0] ?? null };
      }));
      return withProducts;
    }),

  // 审批共享申请（同意/拒绝）
  respondShareRequest: protectedProcedure
    .input(z.object({
      requestId: z.number(),
      action: z.enum(["approved", "rejected"]),
      agreedCommissionRate: z.number().min(0).max(100).optional(),
      replyMessage: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const myMerchant = await db.select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.userId, ctx.user.id))
        .limit(1);
      if (!myMerchant.length) throw new TRPCError({ code: "NOT_FOUND", message: "未找到商家信息" });
      const myMerchantId = myMerchant[0].id;
      const req = await db.select()
        .from(merchantProductShareRequests)
        .where(and(
          eq(merchantProductShareRequests.id, input.requestId),
          eq(merchantProductShareRequests.ownerMerchantId, myMerchantId),
          eq(merchantProductShareRequests.status, "pending")
        ))
        .limit(1);
      if (!req.length) throw new TRPCError({ code: "NOT_FOUND", message: "申请不存在或已处理" });
      await db.update(merchantProductShareRequests)
        .set({
          status: input.action,
          agreedCommissionRate: input.agreedCommissionRate != null ? String(input.agreedCommissionRate) : null,
          replyMessage: input.replyMessage ?? null,
        })
        .where(eq(merchantProductShareRequests.id, input.requestId));
      if (input.action === "approved") {
        const shareReq = req[0];
        let productIds: number[] = [];
        if (shareReq.productId) {
          productIds = [shareReq.productId];
        } else {
          const allProds = await db.select({ id: merchantProducts.id })
            .from(merchantProducts)
            .where(and(
              eq(merchantProducts.ownerMerchantId, myMerchantId),
              eq(merchantProducts.status, "active"),
              eq(merchantProducts.isShareable, 1)
            ));
          productIds = allProds.map(p => p.id);
        }
        for (const productId of productIds) {
          const existing = await db.select({ id: merchantShopProducts.id })
            .from(merchantShopProducts)
            .where(and(
              eq(merchantShopProducts.merchantId, shareReq.requesterMerchantId),
              eq(merchantShopProducts.productId, productId)
            ))
            .limit(1);
          if (!existing.length) {
            await db.insert(merchantShopProducts).values({
              merchantId: shareReq.requesterMerchantId,
              productId,
              isOwned: 0,
              sharedFromMerchantId: myMerchantId,
              commissionRate: input.agreedCommissionRate != null
                ? String(input.agreedCommissionRate)
                : shareReq.proposedCommissionRate,
              isVisible: 0,
            });
          }
        }
      }
      return { success: true };
    }),

  // 取消共享申请
  cancelShareRequest: protectedProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const myMerchant = await db.select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.userId, ctx.user.id))
        .limit(1);
      if (!myMerchant.length) throw new TRPCError({ code: "NOT_FOUND" });
      const myMerchantId = myMerchant[0].id;
      await db.update(merchantProductShareRequests)
        .set({ status: "cancelled" })
        .where(and(
          eq(merchantProductShareRequests.id, input.requestId),
          eq(merchantProductShareRequests.requesterMerchantId, myMerchantId),
          eq(merchantProductShareRequests.status, "pending")
        ));
      return { success: true };
    }),

  // ===== 积分商城接口（首页公开展示用）=====
  // 获取积分商城商品列表（公开接口，无需登录）
  // 数据来源：merchantProducts 表中 inPointsShop=1 的商品（不限商家归属）
  getPointsShopProducts: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(20),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          id: merchantProducts.id,
          name: merchantProducts.name,
          subtitle: merchantProducts.subtitle,
          basePrice: merchantProducts.basePrice,
          mainImageUrl: merchantProducts.mainImageUrl,
          extendedFields: merchantProducts.extendedFields,
          salesCount: merchantProducts.salesCount,
          stock: merchantProducts.stock,
          createdAt: merchantProducts.createdAt,
          categoryName: merchantProductCategories.name,
          ownerShopName: merchants.shopName,
        })
        .from(merchantProducts)
        .leftJoin(merchantProductCategories, eq(merchantProducts.categoryId, merchantProductCategories.id))
        .leftJoin(merchants, eq(merchantProducts.ownerMerchantId, merchants.id))
        .where(and(
          eq(merchantProducts.inPointsShop, 1),
          eq(merchantProducts.status, "active")
        ))
        .orderBy(desc(merchantProducts.salesCount), desc(merchantProducts.createdAt))
        .limit(input?.limit ?? 20);
      return rows;
    }),

  // 切换商品的积分商城开关（管理员用）
  toggleProductInPointsShop: protectedProcedure
    .input(z.object({
      id: z.number(),
      inPointsShop: z.number().min(0).max(1),
      pointsPrice: z.number().min(0).optional(), // 积分兑换价格
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      // 自动确保 pointsPrice 字段存在（防止迁移未执行时崩溃）
      try {
        const { getDbConnection } = await import('./db');
        const conn = await getDbConnection();
        if (conn) {
          const [cols] = await conn.execute(
            `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merchant_products' AND COLUMN_NAME = 'pointsPrice'`
          );
          if ((cols as any[])[0].cnt === 0) {
            await conn.execute(`ALTER TABLE \`merchant_products\` ADD COLUMN \`pointsPrice\` INT NOT NULL DEFAULT 0 COMMENT '积分兑换价格' AFTER \`inPointsShop\``);
            console.log('[merchant] ✅ Auto-added pointsPrice column to merchant_products');
          }
        }
      } catch (migrateErr) {
        console.warn('[merchant] Failed to ensure pointsPrice column:', migrateErr);
      }
      const updateData: any = { inPointsShop: input.inPointsShop };
      if (input.inPointsShop === 1 && input.pointsPrice !== undefined) {
        updateData.pointsPrice = input.pointsPrice;
      } else if (input.inPointsShop === 0) {
        updateData.pointsPrice = 0; // 下架时清除积分价格
      }
      await db.update(merchantProducts)
        .set(updateData)
        .where(eq(merchantProducts.id, input.id));
      return { success: true };
    }),

   // ===== 积分兑换订单接口 =====

  // 用户：提交积分兑换订单
  createPointsRedeemOrder: protectedProcedure
    .input(z.object({
      productId: z.number(),
      quantity: z.number().min(1).max(10).default(1),
      recipientName: z.string().min(1).max(50),
      recipientPhone: z.string().min(11).max(20),
      province: z.string().optional(),
      city: z.string().optional(),
      district: z.string().optional(),
      detailedAddress: z.string().min(1).max(200),
      remark: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // 1. 查询商品信息
      const products = await db
        .select()
        .from(merchantProducts)
        .where(and(eq(merchantProducts.id, input.productId), eq(merchantProducts.status, 'active')))
        .limit(1);
      const product = products[0];
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "商品不存在或已下架" });
      if (!product.inPointsShop) throw new TRPCError({ code: "BAD_REQUEST", message: "该商品未上架积分商城" });
      if (!product.pointsPrice || product.pointsPrice <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "该商品积分价格未设置" });
      if (product.stock < input.quantity) throw new TRPCError({ code: "BAD_REQUEST", message: `库存不足，当前库存：${product.stock}` });

      const totalPoints = product.pointsPrice * input.quantity;

      // 2. 检查用户积分
      const { getUserPoints, subtractUserPoints, createPointLog } = await import('./db-point-system');
      const currentPoints = await getUserPoints(ctx.user.id);
      if (currentPoints < totalPoints) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `积分不足，当前积分：${currentPoints}，需要：${totalPoints}` });
      }

      // 3. 生成订单号
      const timestamp = Date.now().toString();
      const random = Math.floor(Math.random() * 900 + 100).toString();
      const orderNo = `PO${timestamp}${random}`;

      // 4. 扣积分
      await subtractUserPoints(ctx.user.id, totalPoints);

      // 5. 减库存
      await db.execute(sql`UPDATE merchant_products SET stock = stock - ${input.quantity}, salesCount = salesCount + ${input.quantity} WHERE id = ${input.productId}`);

      // 6. 建订单
      await db.insert(pointsRedeemOrders).values({
        orderNo,
        userId: ctx.user.id,
        productId: input.productId,
        productName: product.name,
        productImage: product.mainImageUrl || null,
        pointsSpent: totalPoints,
        quantity: input.quantity,
        status: 'pending',
        recipientName: input.recipientName,
        recipientPhone: input.recipientPhone,
        province: input.province || null,
        city: input.city || null,
        district: input.district || null,
        detailedAddress: input.detailedAddress,
        remark: input.remark || null,
      });

      // 7. 写积分日志
      await createPointLog({
        userId: ctx.user.id,
        actionType: 'redeem_product',
        points: -totalPoints,
        description: `积分兑换商品：${product.name} x${input.quantity}`,
        relatedId: input.productId,
      });

      return { success: true, orderNo };
    }),

  // 用户：查询我的兑换订单
  getMyRedeemOrders: protectedProcedure
    .input(z.object({
      status: z.enum(['all', 'pending', 'shipped', 'completed', 'cancelled']).default('all'),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { orders: [] };

      const conditions: any[] = [eq(pointsRedeemOrders.userId, ctx.user.id)];
      if (input.status !== 'all') {
        conditions.push(eq(pointsRedeemOrders.status, input.status));
      }

      const orders = await db
        .select()
        .from(pointsRedeemOrders)
        .where(and(...conditions))
        .orderBy(desc(pointsRedeemOrders.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return { orders };
    }),

  // 管理员：查询所有兑换订单
  adminGetRedeemOrders: protectedProcedure
    .input(z.object({
      status: z.enum(['all', 'pending', 'shipped', 'completed', 'cancelled']).default('all'),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
      keyword: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      if (!['admin', 'super_admin'].includes(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      const db = await getDb();
      if (!db) return { orders: [] };

      const conditions: any[] = [];
      if (input.status !== 'all') {
        conditions.push(eq(pointsRedeemOrders.status, input.status));
      }

      const allOrders = await db
        .select()
        .from(pointsRedeemOrders)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(pointsRedeemOrders.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      // 关键字过滤（在内存中过滤，数量不大）
      const kw = input.keyword?.trim().toLowerCase();
      const orders = kw
        ? allOrders.filter(o =>
            o.orderNo.toLowerCase().includes(kw) ||
            o.recipientName.toLowerCase().includes(kw) ||
            o.recipientPhone.includes(kw)
          )
        : allOrders;

      return { orders };
    }),

  // 管理员：发货（填写快递信息）
  adminShipOrder: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      trackingCompany: z.string().max(50).optional(),
      trackingNo: z.string().min(1).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!['admin', 'super_admin'].includes(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orders = await db
        .select()
        .from(pointsRedeemOrders)
        .where(eq(pointsRedeemOrders.id, input.orderId))
        .limit(1);
      const order = orders[0];
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
      if (order.status !== 'pending') throw new TRPCError({ code: "BAD_REQUEST", message: "只有待发货订单才能发货" });

      await db
        .update(pointsRedeemOrders)
        .set({
          status: 'shipped',
          trackingCompany: input.trackingCompany,
          trackingNo: input.trackingNo,
          shippedAt: new Date(),
        })
        .where(eq(pointsRedeemOrders.id, input.orderId));

      return { success: true };
    }),

  // 管理员：取消订单（退积分）
  adminCancelOrder: protectedProcedure
    .input(z.object({
      orderId: z.number(),
      cancelReason: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!['admin', 'super_admin'].includes(ctx.user.role)) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const orders = await db
        .select()
        .from(pointsRedeemOrders)
        .where(eq(pointsRedeemOrders.id, input.orderId))
        .limit(1);
      const order = orders[0];
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "订单不存在" });
      if (!['pending', 'shipped'].includes(order.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "该订单状态不可取消" });
      }

      // 退积分
      const { addUserPoints, createPointLog } = await import('./db-point-system');
      await addUserPoints(order.userId, order.pointsSpent);
      await createPointLog({
        userId: order.userId,
        actionType: 'redeem_refund',
        points: order.pointsSpent,
        description: `积分兑换退款：${order.productName}（订单号：${order.orderNo}）`,
        relatedId: order.id,
      });

      // 恢复库存
      await db.execute(sql`UPDATE merchant_products SET stock = stock + ${order.quantity}, salesCount = GREATEST(0, salesCount - ${order.quantity}) WHERE id = ${order.productId}`);

      await db
        .update(pointsRedeemOrders)
        .set({ status: 'cancelled', cancelReason: input.cancelReason || null })
        .where(eq(pointsRedeemOrders.id, input.orderId));

      return { success: true };
    }),

  // 公开接口：获取积分规则（用户端展示用）
  getPublicPointRules: publicProcedure
    .query(async () => {
      const { getAllPointRules } = await import('./db-point-system');
      const rules = await getAllPointRules();
      return (rules as any[]).filter((r: any) => r.isActive);
    }),

  // 按分类获取商品列表（前台公开接口）
  getProductsByCategory: publicProcedure
    .input(z.object({
      categoryId: z.number().optional(), // 不传则获取全部已上架商品
      limit: z.number().min(1).max(100).default(50),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [eq(merchantProducts.status, 'active')];
      if (input?.categoryId) {
        conditions.push(eq(merchantProducts.categoryId, input.categoryId));
      }

      const rows = await db
        .select({
          id: merchantProducts.id,
          name: merchantProducts.name,
          subtitle: merchantProducts.subtitle,
          basePrice: merchantProducts.basePrice,
          originalPrice: merchantProducts.originalPrice,
          mainImageUrl: merchantProducts.mainImageUrl,
          categoryId: merchantProducts.categoryId,
          salesCount: merchantProducts.salesCount,
          stock: merchantProducts.stock,
          extendedFields: merchantProducts.extendedFields,
          categoryName: merchantProductCategories.name,
          ownerShopName: merchants.shopName,
        })
        .from(merchantProducts)
        .leftJoin(merchantProductCategories, eq(merchantProducts.categoryId, merchantProductCategories.id))
        .leftJoin(merchants, eq(merchantProducts.ownerMerchantId, merchants.id))
        .where(and(...conditions))
        .orderBy(desc(merchantProducts.salesCount), desc(merchantProducts.createdAt))
        .limit(input?.limit ?? 50);

      return rows;
    }),

  // 上传商品图片到 COS（管理员专用）
  uploadProductImage: protectedProcedure
    .input(z.object({
      imageData: z.string(), // base64 字符串或 data URL
      folder: z.string().default('merchant-products'),
    }))
    .mutation(async ({ ctx, input }) => {
      const userRole = (ctx.user as any).role;
      if (userRole !== 'super_admin' && userRole !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: '无权限上传商品图片' });
      }
      const url = await (uploadImageToCOS as any)(input.imageData, input.folder);
      return { url };
    }),
});
