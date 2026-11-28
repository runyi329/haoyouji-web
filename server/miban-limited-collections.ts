import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  mibanLimitedCollections,
  getMibanLimitedCollection,
  getMibanLimitedProductCollectionSlug,
} from "../shared/miban-limited-collections";

/** 仅用于前端按身份隔离查询缓存；请求参数从不参与授权。 */
export const mibanLimitedPreviewInputSchema = z.object({
  viewerUserId: z.number().int().positive().nullable().optional(),
}).optional();

type MibanLimitedPreviewUser = { id?: number; role?: unknown } | null | undefined;

/** 必须与 mibanAdminProcedure 一致：仅真实 ctx.user.role === super_admin。 */
export function isMibanLimitedPreviewAdministrator(user: MibanLimitedPreviewUser): boolean {
  return user?.role === "super_admin";
}

export type LimitedCollectionSqlExecutor = {
  execute(sql: string, values?: any[]): Promise<any>;
};

export async function ensureMibanLimitedCollectionTables(db: LimitedCollectionSqlExecutor) {
  await db.execute(`CREATE TABLE IF NOT EXISTS miban_limited_collection_state (
    slug VARCHAR(80) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 0,
    updated_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (slug)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  // INSERT IGNORE 不覆盖管理员已保存的下架状态；既有公开分类保持原样。
  await db.execute(
    `INSERT IGNORE INTO miban_limited_collection_state (slug, is_active) VALUES ${mibanLimitedCollections.map(() => "(?, ?)").join(", ")}`,
    mibanLimitedCollections.flatMap(collection => [collection.slug, collection.defaultActive ? 1 : 0]),
  );
}

/** 无内存状态缓存，每次请求读数据库；locking仅供已开始的库存事务使用。 */
export async function readMibanLimitedCollectionStates(db: LimitedCollectionSqlExecutor, locking = false) {
  let rows: any[] = [];
  try {
    const [result] = await db.execute(
      `SELECT slug, is_active FROM miban_limited_collection_state ORDER BY slug${locking ? " FOR SHARE" : ""}`,
    );
    rows = Array.isArray(result) ? result : [];
  } catch (error: any) {
    // 新版本第一次访问以前没有此表，仅沿用目录显式默认值；其他数据库错误不能放行。
    if (error?.code !== "ER_NO_SUCH_TABLE") throw error;
  }
  const saved = new Map<string, boolean>(rows.map(row => [String(row.slug), Number(row.is_active) === 1]));
  return new Map(mibanLimitedCollections.map(collection => [
    collection.slug,
    saved.get(collection.slug) ?? collection.defaultActive,
  ]));
}

export async function readMibanLimitedCollections(db: LimitedCollectionSqlExecutor, publicOnly: boolean) {
  const states = await readMibanLimitedCollectionStates(db);
  const collections = mibanLimitedCollections.map(collection => ({
    slug: collection.slug,
    title: collection.title,
    isActive: states.get(collection.slug) === true,
  }));
  return publicOnly ? collections.filter(collection => collection.isActive) : collections;
}

/** 返回可信身份，既不接收也不读取浏览器声明的 viewerUserId/admin/isAdmin。 */
export async function readMibanLimitedCollectionsForViewer(
  db: LimitedCollectionSqlExecutor,
  user: MibanLimitedPreviewUser,
) {
  const canPreviewInactive = isMibanLimitedPreviewAdministrator(user);
  return {
    viewerUserId: user?.id ?? null,
    canPreviewInactive,
    collections: await readMibanLimitedCollections(db, !canPreviewInactive),
  };
}

type LimitedAvailabilityProduct = {
  key: string;
  brand: string;
  status: string;
  skus: ReadonlyArray<{ id: string; active: boolean }>;
};

/** 只供公开读取使用；管理员预览不改变 isOnSale，也绝不进入结算授权。 */
export function buildMibanLimitedPublicAvailability(
  products: ReadonlyArray<LimitedAvailabilityProduct>,
  states: ReadonlyMap<string, { isActive: boolean; stockQty: number }>,
  collectionStates: Map<string, boolean>,
  user: MibanLimitedPreviewUser,
) {
  const canPreviewInactive = isMibanLimitedPreviewAdministrator(user);
  return products.flatMap(product => {
    const collectionIsActive = isMibanLimitedProductCollectionActive(product, collectionStates);
    return product.skus.flatMap(sku => {
      const state = states.get(`${product.key}:${sku.id}`) ?? { isActive: false, stockQty: 0 };
      const isSkuActive = sku.active && state.isActive;
      const isOffShelf = !collectionIsActive || product.status !== "on_sale" || !isSkuActive;
      // 缺货仍是上架内容；普通用户可以读取库存为 0 的行，但不能购买。
      if (isOffShelf && !canPreviewInactive) return [];
      return [{
        productKey: product.key,
        skuId: sku.id,
        isOnSale: !isOffShelf && (state.stockQty < 0 || state.stockQty > 0),
        isOffShelf,
        stockQty: state.stockQty,
        isSkuActive,
        collectionIsActive,
      }];
    });
  });
}

export async function updateMibanLimitedCollectionState(
  db: LimitedCollectionSqlExecutor,
  input: { slug: string; isActive: boolean },
  operatorUserId: number,
) {
  if (!getMibanLimitedCollection(input.slug)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "精选分类不存在" });
  }
  await db.execute(
    `INSERT INTO miban_limited_collection_state (slug, is_active, updated_by) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE is_active = VALUES(is_active), updated_by = VALUES(updated_by)`,
    [input.slug, input.isActive ? 1 : 0, operatorUserId],
  );
  return { success: true, ...input };
}

export function isMibanLimitedProductCollectionActive(
  product: { brand: string } | undefined,
  states: Map<string, boolean>,
) {
  const slug = getMibanLimitedProductCollectionSlug(product);
  return Boolean(slug && states.get(slug) === true);
}

export async function assertMibanLimitedCollectionActive(
  db: LimitedCollectionSqlExecutor,
  slug: string | undefined,
  locking = false,
) {
  const states = await readMibanLimitedCollectionStates(db, locking);
  if (!slug || states.get(slug) !== true) {
    throw new TRPCError({ code: "NOT_FOUND", message: "该精选分类已下架，暂不可购买" });
  }
}
