/**
 * 牙伴齿科管理 - 库存（耗材）模块 后端路由
 *
 * 设计原则：
 *   - 与顾客模块一致：原生 SQL（getDbConnection）、按门店 tenant_id 隔离
 *   - 三张核心表：物品基础表 / 库存批次表 / 出入库流水表 + 分类表
 *   - 批次驱动：库存数量 = 该物品所有批次剩余之和；效期跟到批次
 *   - 出库默认按「先到效期先出」(FEFO) 自动扣减批次
 *   - 入库可扫码（条码/UDI）带出物品；新批次或并入同批号
 *   - 严禁 Emoji
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";
import { resolveTenantId } from "./yaban-customer-router";
import { checkYabanPerm } from "./yaban-role-router";

// ===================== 建表 =====================
// 用一个 Set 记录已初始化结构的 tenant，避免每次请求都跑建表/预置
let structureReady = false;
const seededTenants = new Set<number>();

async function ensureInventoryTables(conn: any, tenantId: number) {
  if (!structureReady) {
    // 物品分类表
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS yaban_material_category (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        tenant_id INT NOT NULL DEFAULT 1,
        name VARCHAR(64) NOT NULL,
        sort INT NOT NULL DEFAULT 0,
        enabled TINYINT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    // 物品基础信息表
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS yaban_material (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        tenant_id INT NOT NULL DEFAULT 1,
        category_id BIGINT UNSIGNED,
        name VARCHAR(128) NOT NULL,
        spec VARCHAR(128) DEFAULT NULL,
        unit VARCHAR(16) NOT NULL DEFAULT '个',
        brand VARCHAR(128) DEFAULT NULL,
        barcode VARCHAR(128) DEFAULT NULL,
        safety_stock DECIMAL(12,2) NOT NULL DEFAULT 0,
        track_expiry TINYINT NOT NULL DEFAULT 1,
        image VARCHAR(255) DEFAULT NULL,
        remark VARCHAR(255) DEFAULT NULL,
        enabled TINYINT NOT NULL DEFAULT 1,
        sort INT NOT NULL DEFAULT 0,
        created_by BIGINT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_tenant (tenant_id),
        KEY idx_category (category_id),
        KEY idx_barcode (tenant_id, barcode),
        KEY idx_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    // 库存批次表（核心）
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS yaban_stock_batch (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        tenant_id INT NOT NULL DEFAULT 1,
        material_id BIGINT UNSIGNED NOT NULL,
        batch_no VARCHAR(64) DEFAULT NULL,
        production_date DATE DEFAULT NULL,
        expiry_date DATE DEFAULT NULL,
        qty DECIMAL(12,2) NOT NULL DEFAULT 0,
        cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_material (material_id),
        KEY idx_tenant_material (tenant_id, material_id),
        KEY idx_expiry (tenant_id, expiry_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    // 出入库流水表
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS yaban_inventory_log (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        tenant_id INT NOT NULL DEFAULT 1,
        log_no VARCHAR(40) DEFAULT NULL,
        direction VARCHAR(8) NOT NULL,
        biz_type VARCHAR(16) NOT NULL DEFAULT 'purchase',
        material_id BIGINT UNSIGNED NOT NULL,
        material_name VARCHAR(128) NOT NULL,
        batch_id BIGINT UNSIGNED DEFAULT NULL,
        batch_no VARCHAR(64) DEFAULT NULL,
        expiry_date DATE DEFAULT NULL,
        qty DECIMAL(12,2) NOT NULL DEFAULT 0,
        unit VARCHAR(16) DEFAULT NULL,
        cost_price DECIMAL(12,2) NOT NULL DEFAULT 0,
        receiver_id BIGINT DEFAULT NULL,
        receiver_name VARCHAR(64) DEFAULT NULL,
        chair VARCHAR(32) DEFAULT NULL,
        supplier VARCHAR(128) DEFAULT NULL,
        remark VARCHAR(255) DEFAULT NULL,
        operator_id BIGINT DEFAULT NULL,
        operator_name VARCHAR(64) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_tenant (tenant_id),
        KEY idx_material (material_id),
        KEY idx_direction (tenant_id, direction),
        KEY idx_created (tenant_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    structureReady = true;
  }

  // 首次为空时为该门店写入默认分类，便于直接录入物品
  if (!seededTenants.has(tenantId)) {
    try {
      const [cntRows] = (await conn.execute(
        `SELECT COUNT(*) AS c FROM yaban_material_category WHERE tenant_id = ?`,
        [tenantId]
      )) as any;
      if (Number((cntRows as any[])[0]?.c || 0) === 0) {
        const cats = [
          "充填修复", "根管治疗", "正畸耗材", "种植耗材", "口腔外科",
          "印模技工", "消毒防护", "麻醉药品", "一次性用品", "其他",
        ];
        let sort = 0;
        for (const name of cats) {
          await conn.execute(
            `INSERT INTO yaban_material_category (tenant_id, name, sort, enabled) VALUES (?, ?, ?, 1)`,
            [tenantId, name, sort++]
          );
        }
      }
    } catch {
      // 预置失败不阻断
    }
    seededTenants.add(tenantId);
  }
}

// ===================== 工具函数 =====================
function s(v: any): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

// 生成单号：方向前缀 + yyyyMMdd + 4位序号
async function nextLogNo(conn: any, tenantId: number, direction: "in" | "out"): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const prefix = (direction === "in" ? "RK" : "CK") + `${y}${m}${d}`;
  const [rows] = (await conn.execute(
    `SELECT log_no FROM yaban_inventory_log
     WHERE tenant_id = ? AND log_no LIKE ?
     ORDER BY id DESC LIMIT 1`,
    [tenantId, `${prefix}%`]
  )) as any;
  const last = (rows as any[])[0]?.log_no as string | undefined;
  const lastSeq = last ? parseInt(last.slice(prefix.length), 10) || 0 : 0;
  return prefix + String(lastSeq + 1).padStart(4, "0");
}

// 效期状态：normal / near(近效期，默认90天内) / expired
function expiryStatus(expiry: string | null, nearDays = 90): "none" | "normal" | "near" | "expired" {
  if (!expiry) return "none";
  const exp = new Date(expiry + "T00:00:00");
  if (isNaN(exp.getTime())) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((exp.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "expired";
  if (diffDays <= nearDays) return "near";
  return "normal";
}

// ===================== 路由 =====================
export const yabanInventoryRouter = router({
  // ============ 工作台：概览 + 预警 ============
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) {
      return { materialCount: 0, totalQty: 0, lowStock: [], nearExpiry: [], expired: [] };
    }
    const TENANT_ID = await resolveTenantId(ctx);
    await ensureInventoryTables(conn, TENANT_ID);

    // 物品总数
    const [mc] = (await conn.execute(
      `SELECT COUNT(*) AS c FROM yaban_material WHERE tenant_id = ? AND enabled = 1`,
      [TENANT_ID]
    )) as any;
    const materialCount = Number((mc as any[])[0]?.c || 0);

    // 总库存数量（所有批次剩余之和）
    const [tq] = (await conn.execute(
      `SELECT COALESCE(SUM(qty),0) AS q FROM yaban_stock_batch WHERE tenant_id = ?`,
      [TENANT_ID]
    )) as any;
    const totalQty = Number((tq as any[])[0]?.q || 0);

    // 低库存预警：物品当前库存 <= 安全库存(且安全库存>0)
    const [lowRows] = (await conn.execute(
      `SELECT m.id, m.name, m.unit, m.spec, m.safety_stock AS safetyStock,
              COALESCE((SELECT SUM(b.qty) FROM yaban_stock_batch b WHERE b.material_id = m.id), 0) AS stock
         FROM yaban_material m
        WHERE m.tenant_id = ? AND m.enabled = 1 AND m.safety_stock > 0
       HAVING stock <= m.safety_stock
        ORDER BY (stock - m.safety_stock) ASC
        LIMIT 50`,
      [TENANT_ID]
    )) as any;
    const lowStock = (lowRows as any[]).map((r) => ({
      id: Number(r.id), name: r.name, unit: r.unit, spec: r.spec,
      safetyStock: Number(r.safetyStock), stock: Number(r.stock),
    }));

    // 近效期 / 已过期批次（仅取仍有库存的批次）
    const [batchRows] = (await conn.execute(
      `SELECT b.id, b.material_id AS materialId, b.batch_no AS batchNo, b.expiry_date AS expiryDate,
              b.qty, m.name, m.unit
         FROM yaban_stock_batch b
         JOIN yaban_material m ON m.id = b.material_id
        WHERE b.tenant_id = ? AND b.qty > 0 AND b.expiry_date IS NOT NULL
        ORDER BY b.expiry_date ASC
        LIMIT 200`,
      [TENANT_ID]
    )) as any;
    const nearExpiry: any[] = [];
    const expired: any[] = [];
    for (const r of batchRows as any[]) {
      const exp = r.expiryDate ? String(r.expiryDate).slice(0, 10) : null;
      const st = expiryStatus(exp);
      const item = {
        batchId: Number(r.id), materialId: Number(r.materialId), name: r.name,
        unit: r.unit, batchNo: r.batchNo, expiryDate: exp, qty: Number(r.qty),
      };
      if (st === "expired") expired.push(item);
      else if (st === "near") nearExpiry.push(item);
    }
    return { materialCount, totalQty, lowStock, nearExpiry: nearExpiry.slice(0, 30), expired: expired.slice(0, 30) };
  }),

  // ============ 分类列表 ============
  categories: protectedProcedure.query(async ({ ctx }) => {
    const conn = await getDbConnection();
    if (!conn) return [];
    const TENANT_ID = await resolveTenantId(ctx);
    await ensureInventoryTables(conn, TENANT_ID);
    const [rows] = (await conn.execute(
      `SELECT id, name, sort FROM yaban_material_category
        WHERE tenant_id = ? AND enabled = 1 ORDER BY sort ASC, id ASC`,
      [TENANT_ID]
    )) as any;
    return (rows as any[]).map((r) => ({ id: Number(r.id), name: r.name, sort: Number(r.sort) }));
  }),

  // 新增/编辑分类
  saveCategory: protectedProcedure
    .input(z.object({ id: z.number().int().optional(), name: z.string().min(1).max(64), sort: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const TENANT_ID = await resolveTenantId(ctx);
      if (!(await checkYabanPerm(ctx, "inventory", TENANT_ID))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无库存管理权限" });
      }
      await ensureInventoryTables(conn, TENANT_ID);
      if (input.id) {
        await conn.execute(
          `UPDATE yaban_material_category SET name = ?, sort = ? WHERE id = ? AND tenant_id = ?`,
          [input.name, input.sort ?? 0, input.id, TENANT_ID]
        );
        return { id: input.id };
      }
      const [r] = (await conn.execute(
        `INSERT INTO yaban_material_category (tenant_id, name, sort, enabled) VALUES (?, ?, ?, 1)`,
        [TENANT_ID, input.name, input.sort ?? 0]
      )) as any;
      return { id: Number((r as any).insertId) };
    }),

  deleteCategory: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const TENANT_ID = await resolveTenantId(ctx);
      if (!(await checkYabanPerm(ctx, "inventory", TENANT_ID))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无库存管理权限" });
      }
      // 该分类下若仍有物品则不允许删除
      const [cnt] = (await conn.execute(
        `SELECT COUNT(*) AS c FROM yaban_material WHERE tenant_id = ? AND category_id = ? AND enabled = 1`,
        [TENANT_ID, input.id]
      )) as any;
      if (Number((cnt as any[])[0]?.c || 0) > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "该分类下仍有物品，无法删除" });
      }
      await conn.execute(`UPDATE yaban_material_category SET enabled = 0 WHERE id = ? AND tenant_id = ?`, [input.id, TENANT_ID]);
      return { ok: true };
    }),

  // ============ 库存一览：物品列表（含实时库存与效期状态） ============
  list: protectedProcedure
    .input(
      z.object({
        keyword: z.string().optional(),
        categoryId: z.number().int().optional(),
        // 筛选：all | low(低库存) | near(近效期) | expired(已过期)
        filter: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) return { items: [] as any[] };
      const TENANT_ID = await resolveTenantId(ctx);
      await ensureInventoryTables(conn, TENANT_ID);

      const where: string[] = [`m.tenant_id = ?`, `m.enabled = 1`];
      const params: any[] = [TENANT_ID];
      if (input?.keyword?.trim()) {
        where.push(`(m.name LIKE ? OR m.spec LIKE ? OR m.brand LIKE ? OR m.barcode LIKE ?)`);
        const like = `%${input.keyword.trim()}%`;
        params.push(like, like, like, like);
      }
      if (input?.categoryId) {
        where.push(`m.category_id = ?`);
        params.push(input.categoryId);
      }
      const [rows] = (await conn.execute(
        `SELECT m.id, m.name, m.spec, m.unit, m.brand, m.barcode, m.category_id AS categoryId,
                m.safety_stock AS safetyStock, m.track_expiry AS trackExpiry, m.image,
                c.name AS categoryName,
                COALESCE((SELECT SUM(b.qty) FROM yaban_stock_batch b WHERE b.material_id = m.id), 0) AS stock,
                (SELECT MIN(b2.expiry_date) FROM yaban_stock_batch b2 WHERE b2.material_id = m.id AND b2.qty > 0 AND b2.expiry_date IS NOT NULL) AS nearestExpiry
           FROM yaban_material m
           LEFT JOIN yaban_material_category c ON c.id = m.category_id
          WHERE ${where.join(" AND ")}
          ORDER BY m.sort ASC, m.id DESC`,
        params
      )) as any;

      let items = (rows as any[]).map((r) => {
        const nearestExpiry = r.nearestExpiry ? String(r.nearestExpiry).slice(0, 10) : null;
        const stock = Number(r.stock);
        const safetyStock = Number(r.safetyStock);
        return {
          id: Number(r.id), name: r.name, spec: r.spec, unit: r.unit, brand: r.brand,
          barcode: r.barcode, categoryId: r.categoryId ? Number(r.categoryId) : null,
          categoryName: r.categoryName || "未分类", safetyStock, trackExpiry: Number(r.trackExpiry) === 1,
          image: r.image, stock, nearestExpiry,
          expiryState: expiryStatus(nearestExpiry),
          isLow: safetyStock > 0 && stock <= safetyStock,
        };
      });

      // 列表筛选
      const f = input?.filter || "all";
      if (f === "low") items = items.filter((i) => i.isLow);
      else if (f === "near") items = items.filter((i) => i.expiryState === "near");
      else if (f === "expired") items = items.filter((i) => i.expiryState === "expired");

      return { items };
    }),

  // ============ 物品详情（含批次列表） ============
  detail: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) return null;
      const TENANT_ID = await resolveTenantId(ctx);
      await ensureInventoryTables(conn, TENANT_ID);
      const [rows] = (await conn.execute(
        `SELECT m.*, c.name AS category_name FROM yaban_material m
          LEFT JOIN yaban_material_category c ON c.id = m.category_id
         WHERE m.id = ? AND m.tenant_id = ? LIMIT 1`,
        [input.id, TENANT_ID]
      )) as any;
      const m = (rows as any[])[0];
      if (!m) return null;
      const [batches] = (await conn.execute(
        `SELECT id, batch_no AS batchNo, production_date AS productionDate, expiry_date AS expiryDate,
                qty, cost_price AS costPrice
           FROM yaban_stock_batch WHERE material_id = ? AND tenant_id = ?
          ORDER BY (expiry_date IS NULL), expiry_date ASC, id ASC`,
        [input.id, TENANT_ID]
      )) as any;
      const batchList = (batches as any[]).map((b) => {
        const exp = b.expiryDate ? String(b.expiryDate).slice(0, 10) : null;
        return {
          id: Number(b.id), batchNo: b.batchNo,
          productionDate: b.productionDate ? String(b.productionDate).slice(0, 10) : null,
          expiryDate: exp, qty: Number(b.qty), costPrice: Number(b.costPrice),
          expiryState: expiryStatus(exp),
        };
      });
      const stock = batchList.reduce((sum, b) => sum + b.qty, 0);
      return {
        id: Number(m.id), name: m.name, spec: m.spec, unit: m.unit, brand: m.brand,
        barcode: m.barcode, categoryId: m.category_id ? Number(m.category_id) : null,
        categoryName: m.category_name || "未分类", safetyStock: Number(m.safety_stock),
        trackExpiry: Number(m.track_expiry) === 1, image: m.image, remark: m.remark,
        stock, batches: batchList,
      };
    }),

  // 按条码查物品（扫码入库用）
  findByBarcode: protectedProcedure
    .input(z.object({ barcode: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) return null;
      const TENANT_ID = await resolveTenantId(ctx);
      await ensureInventoryTables(conn, TENANT_ID);
      const [rows] = (await conn.execute(
        `SELECT id, name, spec, unit, brand, barcode, category_id AS categoryId
           FROM yaban_material WHERE tenant_id = ? AND barcode = ? AND enabled = 1 LIMIT 1`,
        [TENANT_ID, input.barcode.trim()]
      )) as any;
      const r = (rows as any[])[0];
      if (!r) return null;
      return {
        id: Number(r.id), name: r.name, spec: r.spec, unit: r.unit,
        brand: r.brand, barcode: r.barcode, categoryId: r.categoryId ? Number(r.categoryId) : null,
      };
    }),

  // ============ 新增/编辑物品 ============
  saveMaterial: protectedProcedure
    .input(
      z.object({
        id: z.number().int().optional(),
        name: z.string().min(1).max(128),
        categoryId: z.number().int().optional().nullable(),
        spec: z.string().max(128).optional(),
        unit: z.string().max(16).optional(),
        brand: z.string().max(128).optional(),
        barcode: z.string().max(128).optional(),
        safetyStock: z.union([z.number(), z.string()]).optional(),
        trackExpiry: z.boolean().optional(),
        remark: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const TENANT_ID = await resolveTenantId(ctx);
      if (!(await checkYabanPerm(ctx, "inventory", TENANT_ID))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无库存管理权限" });
      }
      await ensureInventoryTables(conn, TENANT_ID);
      const safety = input.safetyStock != null && input.safetyStock !== "" ? Number(input.safetyStock) : 0;
      const track = input.trackExpiry === false ? 0 : 1;
      if (input.id) {
        await conn.execute(
          `UPDATE yaban_material SET name = ?, category_id = ?, spec = ?, unit = ?, brand = ?,
                  barcode = ?, safety_stock = ?, track_expiry = ?, remark = ?
             WHERE id = ? AND tenant_id = ?`,
          [input.name, input.categoryId ?? null, s(input.spec), s(input.unit) || "个", s(input.brand),
           s(input.barcode), safety, track, s(input.remark), input.id, TENANT_ID]
        );
        return { id: input.id };
      }
      const [r] = (await conn.execute(
        `INSERT INTO yaban_material (tenant_id, category_id, name, spec, unit, brand, barcode, safety_stock, track_expiry, remark, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [TENANT_ID, input.categoryId ?? null, input.name, s(input.spec), s(input.unit) || "个",
         s(input.brand), s(input.barcode), safety, track, s(input.remark), ctx.user.id ?? null]
      )) as any;
      return { id: Number((r as any).insertId) };
    }),

  deleteMaterial: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const TENANT_ID = await resolveTenantId(ctx);
      if (!(await checkYabanPerm(ctx, "inventory", TENANT_ID))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无库存管理权限" });
      }
      // 软删除：保留历史流水
      await conn.execute(`UPDATE yaban_material SET enabled = 0 WHERE id = ? AND tenant_id = ?`, [input.id, TENANT_ID]);
      return { ok: true };
    }),

  // ============ 入库（采购/退货/盘盈） ============
  // 支持多物品多批次一次入库；扫码入库也走此接口（前端逐条提交）
  inbound: protectedProcedure
    .input(
      z.object({
        bizType: z.enum(["purchase", "return", "adjust"]).optional(),
        supplier: z.string().max(128).optional(),
        remark: z.string().max(255).optional(),
        items: z.array(
          z.object({
            materialId: z.number().int(),
            qty: z.union([z.number(), z.string()]),
            batchNo: z.string().max(64).optional(),
            productionDate: z.string().max(20).optional(),
            expiryDate: z.string().max(20).optional(),
            costPrice: z.union([z.number(), z.string()]).optional(),
          })
        ).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const TENANT_ID = await resolveTenantId(ctx);
      if (!(await checkYabanPerm(ctx, "inventory", TENANT_ID))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无库存管理权限" });
      }
      await ensureInventoryTables(conn, TENANT_ID);
      const bizType = input.bizType || "purchase";
      const logNo = await nextLogNo(conn, TENANT_ID, "in");
      const operatorName = (ctx.user as any)?.name || null;

      for (const it of input.items) {
        const qty = Number(it.qty);
        if (!(qty > 0)) continue;
        // 取物品名/单位
        const [mr] = (await conn.execute(
          `SELECT name, unit FROM yaban_material WHERE id = ? AND tenant_id = ? LIMIT 1`,
          [it.materialId, TENANT_ID]
        )) as any;
        const mat = (mr as any[])[0];
        if (!mat) continue;
        const cost = it.costPrice != null && it.costPrice !== "" ? Number(it.costPrice) : 0;
        const batchNo = s(it.batchNo);
        const prodDate = s(it.productionDate);
        const expDate = s(it.expiryDate);

        // 同物品同批号同效期则并入已有批次，否则新建批次
        let batchId: number;
        const [exist] = (await conn.execute(
          `SELECT id FROM yaban_stock_batch
            WHERE tenant_id = ? AND material_id = ?
              AND (batch_no <=> ?) AND (expiry_date <=> ?)
            LIMIT 1`,
          [TENANT_ID, it.materialId, batchNo, expDate]
        )) as any;
        const existRow = (exist as any[])[0];
        if (existRow) {
          batchId = Number(existRow.id);
          await conn.execute(
            `UPDATE yaban_stock_batch SET qty = qty + ?, cost_price = ? WHERE id = ?`,
            [qty, cost, batchId]
          );
        } else {
          const [br] = (await conn.execute(
            `INSERT INTO yaban_stock_batch (tenant_id, material_id, batch_no, production_date, expiry_date, qty, cost_price)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [TENANT_ID, it.materialId, batchNo, prodDate, expDate, qty, cost]
          )) as any;
          batchId = Number((br as any).insertId);
        }
        // 记流水
        await conn.execute(
          `INSERT INTO yaban_inventory_log
            (tenant_id, log_no, direction, biz_type, material_id, material_name, batch_id, batch_no, expiry_date, qty, unit, cost_price, supplier, remark, operator_id, operator_name)
           VALUES (?, ?, 'in', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [TENANT_ID, logNo, bizType, it.materialId, mat.name, batchId, batchNo, expDate, qty, mat.unit, cost,
           s(input.supplier), s(input.remark), ctx.user.id ?? null, operatorName]
        );
      }
      return { ok: true, logNo };
    }),

  // ============ 出库（领用/报损/退货） ============
  // 购物车模式：一次提交多物品；默认 FEFO（先到效期先出）自动扣批次
  outbound: protectedProcedure
    .input(
      z.object({
        bizType: z.enum(["use", "scrap", "return"]).optional(),
        receiverId: z.number().int().optional().nullable(),
        receiverName: z.string().max(64).optional(),
        chair: z.string().max(32).optional(),
        remark: z.string().max(255).optional(),
        items: z.array(
          z.object({
            materialId: z.number().int(),
            qty: z.union([z.number(), z.string()]),
            // 可选：指定批次出库；不指定则 FEFO 自动扣
            batchId: z.number().int().optional(),
          })
        ).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const TENANT_ID = await resolveTenantId(ctx);
      if (!(await checkYabanPerm(ctx, "inventory", TENANT_ID))) {
        throw new TRPCError({ code: "FORBIDDEN", message: "无库存管理权限" });
      }
      await ensureInventoryTables(conn, TENANT_ID);
      const bizType = input.bizType || "use";
      const operatorName = (ctx.user as any)?.name || null;

      // 先校验所有物品库存是否充足，避免部分扣减
      for (const it of input.items) {
        const qty = Number(it.qty);
        if (!(qty > 0)) continue;
        const [sr] = (await conn.execute(
          `SELECT COALESCE(SUM(qty),0) AS stock, MIN(name) AS name FROM yaban_stock_batch b
             JOIN yaban_material m ON m.id = b.material_id
            WHERE b.tenant_id = ? AND b.material_id = ?`,
          [TENANT_ID, it.materialId]
        )) as any;
        const stock = Number((sr as any[])[0]?.stock || 0);
        if (stock < qty) {
          const [mr] = (await conn.execute(`SELECT name FROM yaban_material WHERE id = ? LIMIT 1`, [it.materialId])) as any;
          const nm = (mr as any[])[0]?.name || `物品#${it.materialId}`;
          throw new TRPCError({ code: "BAD_REQUEST", message: `「${nm}」库存不足（剩余 ${stock}）` });
        }
      }

      const logNo = await nextLogNo(conn, TENANT_ID, "out");

      for (const it of input.items) {
        let remain = Number(it.qty);
        if (!(remain > 0)) continue;
        const [mr] = (await conn.execute(
          `SELECT name, unit FROM yaban_material WHERE id = ? AND tenant_id = ? LIMIT 1`,
          [it.materialId, TENANT_ID]
        )) as any;
        const mat = (mr as any[])[0];
        if (!mat) continue;

        // 取批次：指定批次优先，否则按 FEFO（效期升序，NULL 效期靠后）
        let batchQuery = `SELECT id, qty, batch_no AS batchNo, expiry_date AS expiryDate, cost_price AS costPrice
                            FROM yaban_stock_batch
                           WHERE tenant_id = ? AND material_id = ? AND qty > 0`;
        const bParams: any[] = [TENANT_ID, it.materialId];
        if (it.batchId) {
          batchQuery += ` AND id = ?`;
          bParams.push(it.batchId);
        }
        batchQuery += ` ORDER BY (expiry_date IS NULL), expiry_date ASC, id ASC`;
        const [batches] = (await conn.execute(batchQuery, bParams)) as any;

        for (const b of batches as any[]) {
          if (remain <= 0) break;
          const avail = Number(b.qty);
          const take = Math.min(avail, remain);
          await conn.execute(`UPDATE yaban_stock_batch SET qty = qty - ? WHERE id = ?`, [take, b.id]);
          const exp = b.expiryDate ? String(b.expiryDate).slice(0, 10) : null;
          await conn.execute(
            `INSERT INTO yaban_inventory_log
              (tenant_id, log_no, direction, biz_type, material_id, material_name, batch_id, batch_no, expiry_date, qty, unit, cost_price, receiver_id, receiver_name, chair, remark, operator_id, operator_name)
             VALUES (?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [TENANT_ID, logNo, bizType, it.materialId, mat.name, b.id, b.batchNo, exp, take, mat.unit, Number(b.costPrice),
             input.receiverId ?? null, s(input.receiverName), s(input.chair), s(input.remark), ctx.user.id ?? null, operatorName]
          );
          remain -= take;
        }
      }
      // 清理 qty 为 0 的批次（保留近期可读性可选；这里删除空批次）
      await conn.execute(`DELETE FROM yaban_stock_batch WHERE tenant_id = ? AND qty <= 0`, [TENANT_ID]);
      return { ok: true, logNo };
    }),

  // ============ 出入库流水记录 ============
  logs: protectedProcedure
    .input(
      z.object({
        direction: z.enum(["in", "out"]).optional(),
        materialId: z.number().int().optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const conn = await getDbConnection();
      if (!conn) return { items: [], total: 0, page: 1, pageSize: 30, hasMore: false };
      const TENANT_ID = await resolveTenantId(ctx);
      await ensureInventoryTables(conn, TENANT_ID);
      const page = input?.page && input.page > 0 ? input.page : 1;
      const pageSize = input?.pageSize && input.pageSize > 0 ? input.pageSize : 30;
      const offset = (page - 1) * pageSize;
      const where: string[] = [`tenant_id = ?`];
      const params: any[] = [TENANT_ID];
      if (input?.direction) { where.push(`direction = ?`); params.push(input.direction); }
      if (input?.materialId) { where.push(`material_id = ?`); params.push(input.materialId); }
      const [cntRows] = (await conn.execute(
        `SELECT COUNT(*) AS c FROM yaban_inventory_log WHERE ${where.join(" AND ")}`, params
      )) as any;
      const total = Number((cntRows as any[])[0]?.c || 0);
      const [rows] = (await conn.execute(
        `SELECT id, log_no AS logNo, direction, biz_type AS bizType, material_id AS materialId,
                material_name AS materialName, batch_no AS batchNo, expiry_date AS expiryDate, qty, unit,
                receiver_name AS receiverName, chair, supplier, remark, operator_name AS operatorName, created_at AS createdAt
           FROM yaban_inventory_log WHERE ${where.join(" AND ")}
          ORDER BY id DESC LIMIT ${pageSize} OFFSET ${offset}`,
        params
      )) as any;
      const items = (rows as any[]).map((r) => ({
        id: Number(r.id), logNo: r.logNo, direction: r.direction, bizType: r.bizType,
        materialId: Number(r.materialId), materialName: r.materialName, batchNo: r.batchNo,
        expiryDate: r.expiryDate ? String(r.expiryDate).slice(0, 10) : null, qty: Number(r.qty), unit: r.unit,
        receiverName: r.receiverName, chair: r.chair, supplier: r.supplier, remark: r.remark,
        operatorName: r.operatorName,
        createdAt: r.createdAt ? new Date(r.createdAt).toLocaleString("zh-CN", { hour12: false }) : "",
      }));
      return { items, total, page, pageSize, hasMore: offset + items.length < total };
    }),
});
