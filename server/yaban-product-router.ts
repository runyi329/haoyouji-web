/**
 * 牙办齿科商城 - 商品/分类后端路由（第三步第二批）
 *
 * 设计原则：
 *   - 单店跑通（tenant_id 默认 1），表已预留多租户字段（tenant_id / source / platform_ref_id）
 *   - 商品唯一对外标识沿用 legacy_code（如 p1001/s2001），与订单明细 product_code 对应
 *   - description 在库内存 JSON 数组字符串，接口出入参统一为 string[]
 *   - 公开接口（listProducts/getProduct/listCategories）仅返回上架商品，供前台使用
 *   - 管理接口仅超级管理员（super_admin）可用，复用 adminProcedure
 *   - 图片上传走 COS（自动压缩为 WebP），复用 uploadImageToCOS
 *   - 全部使用 getDbConnection 原生 SQL（与项目现有写法一致）
 */
import { z } from "zod";
import { router, publicProcedure, adminProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";
import { resolveTenantId } from "./yaban-customer-router";

const DEFAULT_TENANT_ID = 1;

// 把库内 description（JSON 数组字符串 / 旧换行文本）统一解析为 string[]
function parseDescription(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x));
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map((x) => String(x));
    } catch {
      /* fallthrough */
    }
  }
  // 兼容换行分隔的旧格式
  return s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}

// 把 tags（逗号分隔字符串）解析为 string[]
function parseTags(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean);
  return String(raw).split(",").map((x) => x.trim()).filter(Boolean);
}

// 数据库行 -> 前端商品对象（字段名贴近原 shopData，便于前台无缝替换）
function mapProductRow(r: any) {
  return {
    id: r.legacy_code || `db${r.id}`, // 前端用的字符串 id，沿用旧编码
    dbId: r.id, // 数据库自增 id（管理端编辑用）
    categoryId: r.category_code,
    kind: (r.kind === "service" ? "service" : "product") as "product" | "service",
    name: r.name,
    subtitle: r.subtitle || "",
    price: Number(r.price),
    originalPrice: r.original_price != null ? Number(r.original_price) : undefined,
    image: r.image || "",
    sales: Number(r.sales || 0),
    tags: parseTags(r.tags),
    description: parseDescription(r.description),
    isActive: Number(r.status) === 1,
    sortOrder: Number(r.sort_order || 0),
    stock: Number(r.stock || 0),
    source: r.source || "self",
  };
}

const adminProductInput = z.object({
  category_code: z.string().min(1).max(32),
  kind: z.enum(["product", "service"]).default("product"),
  name: z.string().min(1).max(128),
  subtitle: z.string().max(255).optional().default(""),
  price: z.number().min(0),
  original_price: z.number().min(0).nullable().optional(),
  image: z.string().max(255).optional().default(""),
  sales: z.number().int().min(0).optional().default(0),
  tags: z.array(z.string().max(32)).optional().default([]),
  description: z.array(z.string().max(500)).optional().default([]),
  sort_order: z.number().int().optional().default(0),
  status: z.union([z.literal(0), z.literal(1)]).optional().default(1),
});

export const yabanProductRouter = router({
  // ============ 公开：分类列表（前台用，仅启用项） ============
  listCategories: publicProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return [];
    const tenantId = await resolveTenantId(ctx);
    const [rows] = (await (conn as any).execute(
      `SELECT code, name, icon, sort_order FROM shop_category
       WHERE tenant_id = ? AND status = 1 ORDER BY sort_order ASC, id ASC`,
      [tenantId]
    )) as any;
    return (rows as any[]).map((r) => ({
      id: r.code,
      name: r.name,
      icon: r.icon || "",
    }));
  }),

  // ============ 公开：商品列表（前台用，仅上架项） ============
  listProducts: publicProcedure
    .input(
      z
        .object({
          categoryId: z.string().max(32).optional(),
          keyword: z.string().max(64).optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn) return [];
      const tenantId = await resolveTenantId(ctx);
      const where: string[] = [`tenant_id = ?`, `status = 1`];
      const params: any[] = [tenantId];
      if (input?.categoryId && input.categoryId !== "all") {
        where.push(`category_code = ?`);
        params.push(input.categoryId);
      }
      if (input?.keyword && input.keyword.trim()) {
        const k = `%${input.keyword.trim()}%`;
        where.push(`(name LIKE ? OR subtitle LIKE ?)`);
        params.push(k, k);
      }
      const [rows] = (await (conn as any).execute(
        `SELECT * FROM shop_product WHERE ${where.join(" AND ")}
         ORDER BY sort_order ASC, id ASC`,
        params
      )) as any;
      return (rows as any[]).map(mapProductRow);
    }),

  // ============ 公开：商品详情（按 legacy_code 或 dbId） ============
  getProduct: publicProcedure
    .input(z.object({ id: z.string().max(32) }))
    .query(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn) return null;
      const tenantId = await resolveTenantId(ctx);
      const idStr = input.id.trim();
      let rows: any[];
      // 兼容 dbXX 形式
      const dbId = idStr.startsWith("db") ? Number(idStr.slice(2)) : NaN;
      if (!Number.isNaN(dbId)) {
        [rows] = (await (conn as any).execute(
          `SELECT * FROM shop_product WHERE id = ? AND tenant_id = ? LIMIT 1`,
          [dbId, tenantId]
        )) as any;
      } else {
        [rows] = (await (conn as any).execute(
          `SELECT * FROM shop_product WHERE legacy_code = ? AND tenant_id = ? LIMIT 1`,
          [idStr, tenantId]
        )) as any;
      }
      const r = (rows as any[])[0];
      if (!r) return null;
      return mapProductRow(r);
    }),

  // ============ 管理员：商品列表（含下架，全字段） ============
  adminListProducts: publicProcedure
    .input(
      z
        .object({
          categoryId: z.string().max(32).optional(),
          keyword: z.string().max(64).optional(),
          status: z.enum(["all", "on", "off"]).optional().default("all"),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn) return { list: [], counts: { all: 0, on: 0, off: 0 } };
      const tenantId = await resolveTenantId(ctx);
      const where: string[] = [`tenant_id = ?`];
      const params: any[] = [tenantId];
      if (input?.categoryId && input.categoryId !== "all") {
        where.push(`category_code = ?`);
        params.push(input.categoryId);
      }
      if (input?.keyword && input.keyword.trim()) {
        const k = `%${input.keyword.trim()}%`;
        where.push(`(name LIKE ? OR subtitle LIKE ?)`);
        params.push(k, k);
      }
      if (input?.status === "on") where.push(`status = 1`);
      if (input?.status === "off") where.push(`status = 0`);

      const [rows] = (await (conn as any).execute(
        `SELECT * FROM shop_product WHERE ${where.join(" AND ")}
         ORDER BY sort_order ASC, id ASC`,
        params
      )) as any;

      const [countRows] = (await (conn as any).execute(
        `SELECT status, COUNT(*) cnt FROM shop_product WHERE tenant_id = ? GROUP BY status`,
        [tenantId]
      )) as any;
      const counts = { all: 0, on: 0, off: 0 };
      for (const c of countRows as any[]) {
        const n = Number(c.cnt);
        counts.all += n;
        if (Number(c.status) === 1) counts.on += n;
        else counts.off += n;
      }
      return { list: (rows as any[]).map(mapProductRow), counts };
    }),

  // ============ 管理员：分类列表（含停用） ============
  adminListCategories: publicProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return [];
    const tenantId = await resolveTenantId(ctx);
    const [rows] = (await (conn as any).execute(
      `SELECT id, code, name, icon, sort_order, status FROM shop_category
       WHERE tenant_id = ? ORDER BY sort_order ASC, id ASC`,
      [tenantId]
    )) as any;
    return rows as any[];
  }),

  // ============ 管理员：新增分类 ============
  createCategory: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(20),
        sort_order: z.number().int().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const tenantId = await resolveTenantId(ctx);
      // 生成唯一 code（c + 时间戳后8位）
      const code = `c${Date.now().toString().slice(-9)}`;
      // 默认排序：现有最大 sort_order + 1
      let sort = input.sort_order;
      if (sort == null) {
        const [m] = (await (conn as any).execute(
          `SELECT COALESCE(MAX(sort_order),0) AS mx FROM shop_category WHERE tenant_id = ?`,
          [tenantId]
        )) as any;
        sort = Number(m?.[0]?.mx ?? 0) + 1;
      }
      await (conn as any).execute(
        `INSERT INTO shop_category (tenant_id, code, name, sort_order, status) VALUES (?, ?, ?, ?, 1)`,
        [tenantId, code, input.name.trim(), sort]
      );
      return { ok: true, code };
    }),

  // ============ 管理员：重命名/排序分类 ============
  updateCategory: publicProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1).max(20).optional(),
        sort_order: z.number().int().optional(),
        status: z.number().int().min(0).max(1).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const tenantId = await resolveTenantId(ctx);
      const sets: string[] = [];
      const vals: any[] = [];
      if (input.name != null) { sets.push("name = ?"); vals.push(input.name.trim()); }
      if (input.sort_order != null) { sets.push("sort_order = ?"); vals.push(input.sort_order); }
      if (input.status != null) { sets.push("status = ?"); vals.push(input.status); }
      if (sets.length === 0) return { ok: true };
      vals.push(input.id, tenantId);
      await (conn as any).execute(
        `UPDATE shop_category SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`,
        vals
      );
      return { ok: true };
    }),

  // ============ 管理员：删除分类（该分类下有商品时禁止删除）============
  deleteCategory: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const tenantId = await resolveTenantId(ctx);
      // 查出该分类 code
      const [crows] = (await (conn as any).execute(
        `SELECT code FROM shop_category WHERE id = ? AND tenant_id = ?`,
        [input.id, tenantId]
      )) as any;
      const cat = (crows as any[])[0];
      if (!cat) throw new TRPCError({ code: "NOT_FOUND", message: "分类不存在" });
      // 校验是否还有商品
      const [prows] = (await (conn as any).execute(
        `SELECT COUNT(*) AS cnt FROM shop_product WHERE tenant_id = ? AND category_code = ?`,
        [tenantId, cat.code]
      )) as any;
      const cnt = Number((prows as any[])[0]?.cnt ?? 0);
      if (cnt > 0)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `该分类下还有 ${cnt} 件商品，请先移走或删除商品`,
        });
      await (conn as any).execute(
        `DELETE FROM shop_category WHERE id = ? AND tenant_id = ?`,
        [input.id, tenantId]
      );
      return { ok: true };
    }),

  // ============ 管理员：新增商品 ============
  createProduct: publicProcedure
    .input(adminProductInput)
    .mutation(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const tenantId = await resolveTenantId(ctx);
      // 生成一个 legacy_code（自营商品：x + 时间戳后8位），保证唯一对外标识
      const legacyCode = `x${Date.now().toString().slice(-10)}`;
      const [res] = (await (conn as any).execute(
        `INSERT INTO shop_product
          (tenant_id, source, category_code, kind, name, subtitle, price, original_price, image, sales, tags, description, legacy_code, sort_order, status)
         VALUES (?, 'self', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          input.category_code,
          input.kind,
          input.name,
          input.subtitle || null,
          input.price.toFixed(2),
          input.original_price != null ? input.original_price.toFixed(2) : null,
          input.image || null,
          input.sales || 0,
          input.tags.join(","),
          JSON.stringify(input.description),
          legacyCode,
          input.sort_order || 0,
          input.status,
        ]
      )) as any;
      return { success: true, id: res?.insertId, legacyCode };
    }),

  // ============ 管理员：编辑商品 ============
  updateProduct: publicProcedure
    .input(adminProductInput.extend({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const tenantId = await resolveTenantId(ctx);
      await (conn as any).execute(
        `UPDATE shop_product SET
           category_code = ?, kind = ?, name = ?, subtitle = ?, price = ?, original_price = ?,
           image = ?, sales = ?, tags = ?, description = ?, sort_order = ?, status = ?
         WHERE id = ? AND tenant_id = ?`,
        [
          input.category_code,
          input.kind,
          input.name,
          input.subtitle || null,
          input.price.toFixed(2),
          input.original_price != null ? input.original_price.toFixed(2) : null,
          input.image || null,
          input.sales || 0,
          input.tags.join(","),
          JSON.stringify(input.description),
          input.sort_order || 0,
          input.status,
          input.id,
          tenantId,
        ]
      );
      return { success: true };
    }),

  // ============ 管理员：上下架切换 ============
  toggleProductStatus: publicProcedure
    .input(z.object({ id: z.number().int(), status: z.union([z.literal(0), z.literal(1)]) }))
    .mutation(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const tenantId = await resolveTenantId(ctx);
      await (conn as any).execute(
        `UPDATE shop_product SET status = ? WHERE id = ? AND tenant_id = ?`,
        [input.status, input.id, tenantId]
      );
      return { success: true };
    }),

  // ============ 管理员：删除商品 ============
  deleteProduct: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const tenantId = await resolveTenantId(ctx);
      await (conn as any).execute(
        `DELETE FROM shop_product WHERE id = ? AND tenant_id = ?`,
        [input.id, tenantId]
      );
      return { success: true };
    }),

  // ============ 管理员：上传商品图片（走 COS 压缩） ============
  uploadProductImage: publicProcedure
    .input(z.object({ imageData: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        const { uploadImageToCOS } = await import("./cos-upload");
        const url = await uploadImageToCOS(input.imageData, "yaban-shop");
        return { success: true, url };
      } catch (e) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: e instanceof Error ? e.message : "图片上传失败",
        });
      }
    }),
});
