import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDbConnection } from "./db";
import { withGlobalWalletTransaction } from "./wallet-funding-guard";
import { ENV } from "./_core/env";
import { MIBAN_BENEFITS_DDL } from "./miban-benefits-schema";
import { mibanLimitedProducts } from "../shared/miban-limited-products";
import { getMibanLimitedBrandByName } from "../shared/miban-limited-brand-config";
import {
  MIBAN_BENEFITS_STOREFRONT as STORE,
  beijingDate,
  calculateBenefits,
  benefitApplies,
  flattenCatalog,
  isCoupon,
  status,
  skuSelectable,
  type Rule,
  type Audit,
  type BenefitUser,
  type CatalogProduct,
  type BenefitCartItem,
  type BenefitPricingLine,
  type BenefitResult,
  type BenefitQuote,
} from "../shared/miban-benefits";

export type BenefitSqlExecutor = {
  execute(sql: string, values?: any[]): Promise<any>;
};
export type BenefitMode = "once" | "annual";
export type BenefitActor = { id: number; role: string };
const bad: (message: string) => never = message => {
  throw new TRPCError({ code: "BAD_REQUEST", message });
};
const conflict: () => never = () => {
  throw new TRPCError({
    code: "CONFLICT",
    message: "优惠或商品报价已变更，请刷新后重新核对",
  });
};
const json = <T>(value: any): T =>
  typeof value === "string" ? JSON.parse(value) : value;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const missingTable = (e: any) =>
  (e?.code ?? e?.cause?.code) === "ER_NO_SUCH_TABLE";
async function rows(
  db: BenefitSqlExecutor,
  sql: string,
  values: any[] = []
): Promise<any[]> {
  const [result] = await db.execute(sql, values);
  return Array.isArray(result) ? result : [];
}
async function close(db: any) {
  if (typeof db.release === "function") db.release();
  else if (typeof db.end === "function") await db.end();
}
async function readConnection<T>(
  fn: (db: BenefitSqlExecutor) => Promise<T>
): Promise<T> {
  const db = await getDbConnection();
  if (!db) throw new Error("数据库不可用，未执行用户优惠操作");
  try {
    return await fn(db as any);
  } finally {
    await close(db);
  }
}
function owner(userId: number) {
  if (!Number.isSafeInteger(userId) || userId <= 0) bad("用户ID无效");
}
function admin(actor: BenefitActor) {
  owner(actor.id);
  if (actor.role !== "super_admin")
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "仅系统超级管理员可管理用户优惠",
    });
}
function storefront(value: string) {
  if (value !== STORE) bad("优惠仅适用于米伴限时商城");
}
let infrastructure: Promise<void> | null = null;
/** Caller invokes BEFORE entering any wallet transaction. Failure clears promise for retry. */
export async function ensureMibanBenefitsInfrastructure(): Promise<void> {
  if (!infrastructure)
    infrastructure = readConnection(async db => {
      for (const ddl of MIBAN_BENEFITS_DDL) await db.execute(ddl, []);
    }).catch(e => {
      infrastructure = null;
      throw e;
    });
  await infrastructure;
}
function mappedRule(row: any): Rule {
  const r = json<Rule>(row.rule_json);
  return {
    ...r,
    id: String(row.id),
    userId: String(row.user_id),
    kind: row.kind,
    state: row.state,
    starts: String(row.starts),
    ends: String(row.ends ?? ""),
    unlimited: Number(row.unlimited) === 1,
    maxUses: Number(row.max_uses),
    uses: Number(row.uses),
    version: Number(row.version),
  };
}
async function readRules(
  db: BenefitSqlExecutor,
  userId: number,
  locking = false
): Promise<Rule[]> {
  return (
    await rows(
      db,
      `SELECT * FROM miban_benefit_rules WHERE storefront = ? AND user_id = ? ORDER BY id${locking ? " FOR UPDATE" : ""}`,
      [STORE, userId]
    )
  ).map(mappedRule);
}
/** Shared live catalog source, read-only operations overlay. Missing states are unavailable, never seeded. */
export async function readMibanBenefitsCatalog(
  db: BenefitSqlExecutor,
  locking = false
): Promise<CatalogProduct[]> {
  let states: any[];
  try {
    states = await rows(
      db,
      `SELECT product_key, sku_id, is_active, stock_qty FROM miban_limited_sku_state ORDER BY product_key, sku_id${locking ? " FOR UPDATE" : ""}`
    );
  } catch (e) {
    if (!missingTable(e)) throw e;
    states = [];
  }
  const byId = new Map(states.map(s => [`${s.product_key}:${s.sku_id}`, s]));
  return mibanLimitedProducts
    .filter(p => p.status !== "draft" || p.publicPreview)
    .map(p => ({
      id: `limited:${p.key}`,
      productKey: p.key,
      name: p.detail.title,
      category: p.category,
      series: getMibanLimitedBrandByName(p.brand)?.title ?? p.brand,
      brand: p.brand,
      skus: p.skus.map(s => {
        const state = byId.get(`${p.key}:${s.id}`);
        const stock = state ? Number(state.stock_qty) : null;
        const active =
          p.status === "on_sale" &&
          s.active &&
          !!state &&
          Number(state.is_active) === 1;
        return {
          id: `limited:${p.key}:${s.id}`,
          skuId: s.id,
          name: s.name,
          price: s.priceCny,
          activity: s.priceCny,
          active,
          available: active && stock !== null && (stock < 0 || stock > 0),
          stock,
          unitLabel: s.unitLabel,
          maxPurchaseQty: s.maxPurchaseQty,
        };
      }),
    }));
}
export async function getMibanBenefitsCatalog(
  store = STORE
): Promise<CatalogProduct[]> {
  storefront(store);
  return readConnection(db => readMibanBenefitsCatalog(db));
}
export async function getMibanBenefitsRules(
  userId: number,
  store = STORE
): Promise<Rule[]> {
  storefront(store);
  owner(userId);
  await ensureMibanBenefitsInfrastructure();
  return readConnection(db => readRules(db, userId));
}
export async function getMyMibanBenefits(
  userId: number,
  store = STORE
): Promise<Array<Omit<Rule, "note">>> {
  return (await getMibanBenefitsRules(userId, store)).map(
    ({ note: _note, ...r }) => r
  );
}
export async function getMibanBenefitsAudits(
  userId: number,
  store = STORE,
  offset = 0,
  limit = 200
): Promise<Audit[]> {
  storefront(store);
  owner(userId);
  await ensureMibanBenefitsInfrastructure();
  offset = Math.max(0, Math.floor(offset));
  limit = Math.min(500, Math.max(1, Math.floor(limit)));
  return readConnection(async db =>
    (
      await rows(
        db,
        `SELECT * FROM miban_benefit_audits WHERE storefront = ? AND user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`,
        [STORE, userId, limit, offset]
      )
    ).map(row => ({
      id: String(row.id),
      userId: String(row.user_id),
      action: row.action,
      detail: row.detail,
      time:
        row.created_at instanceof Date
          ? new Date(row.created_at.getTime() + 8 * 3600_000)
              .toISOString()
              .slice(0, 19)
              .replace("T", " ")
          : String(row.created_at),
      operatorId: Number(row.operator_id),
      before: row.before_json ? json<Rule>(row.before_json) : null,
      after: row.after_json ? json<Rule>(row.after_json) : null,
      ...(row.order_id ? { order: String(row.order_id) } : {}),
      ...(row.saved_cents != null
        ? { saved: Number(row.saved_cents) / 100 }
        : {}),
    }))
  );
}
export async function getMibanBenefitsUsers(input: {
  storefront: string;
  keyword: string;
  offset: number;
  limit: number;
  filter: "all" | "with" | "without";
}): Promise<{
  users: BenefitUser[];
  total: number;
  offset: number;
  limit: number;
}> {
  storefront(input.storefront);
  await ensureMibanBenefitsInfrastructure();
  const offset = Math.max(0, Math.floor(input.offset)),
    limit = Math.min(100, Math.max(1, Math.floor(input.limit)));
  const today = beijingDate(),
    keyword = `%${input.keyword.trim().replace(/[!%_]/g, "!$&")}%`;
  const active = `r.storefront = ? AND r.user_id = u.id AND r.state = 'active' AND r.starts <= ? AND (r.ends = '' OR r.ends >= ?) AND (r.max_uses = 0 OR r.uses < r.max_uses)`;
  const search = `(COALESCE(u.name,'') LIKE ? ESCAPE '!' OR COALESCE(u.username,'') LIKE ? ESCAPE '!' OR CAST(u.id AS CHAR) LIKE ? ESCAPE '!')`;
  const filter =
    input.filter === "all"
      ? ""
      : ` AND ${input.filter === "without" ? "NOT " : ""}EXISTS (SELECT 1 FROM miban_benefit_rules r WHERE ${active})`;
  const searchValues = [
    keyword,
    keyword,
    keyword,
    ...(input.filter === "all" ? [] : [STORE, today, today]),
  ];
  return readConnection(async db => {
    const count = await rows(
      db,
      `SELECT COUNT(*) AS total FROM users u WHERE ${search}${filter}`,
      searchValues
    );
    const found = await rows(
      db,
      `SELECT u.id,u.name,u.username,(SELECT COUNT(*) FROM miban_benefit_rules r WHERE ${active}) AS activeCount FROM users u WHERE ${search}${filter} ORDER BY u.id LIMIT ? OFFSET ?`,
      [STORE, today, today, ...searchValues, limit, offset]
    );
    const colors = ["orange", "green", "blue", "purple", "rose"];
    return {
      users: found.map(u => ({
        id: String(u.id),
        name: String(u.name || u.username || `用户${u.id}`),
        account: String(u.username || u.id),
        color: colors[Number(u.id) % colors.length],
        activeCount: Number(u.activeCount),
      })),
      total: Number(count[0]?.total ?? 0),
      offset,
      limit,
    };
  });
}
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    s =>
      Number.isFinite(Date.parse(`${s}T00:00:00+08:00`)) &&
      beijingDate(Date.parse(`${s}T00:00:00+08:00`)) === s,
    "日期无效"
  );
export const mibanBenefitRuleInputSchema = z.object({
  id: z.string().max(64).optional().default(""),
  version: z.number().int().min(0).optional().default(0),
  kind: z.enum(["rate", "price", "cash", "threshold"]),
  name: z.string().trim().min(1).max(100),
  scope: z.enum(["all", "category", "series", "product", "sku"]),
  targets: z.array(z.string().min(1).max(240)).max(200),
  value: z.number().finite().positive().max(10000000),
  threshold: z.number().finite().min(0).max(10000000).default(0),
  starts: dateSchema,
  ends: z.union([dateSchema, z.literal("")]),
  unlimited: z.boolean(),
  maxUses: z.number().int().min(0).max(100000),
  note: z.string().max(2000).default(""),
});
export type BenefitRuleInput = z.input<typeof mibanBenefitRuleInputSchema> &
  Partial<Pick<Rule, "userId" | "uses" | "state" | "created">>;
function precise(v: number, scale: number) {
  return Math.abs(v * scale - Math.round(v * scale)) <= 1e-7;
}
export function validateMibanBenefitRule(
  raw: BenefitRuleInput,
  catalog: CatalogProduct[]
) {
  const r = mibanBenefitRuleInputSchema.parse(raw);
  if (r.ends && r.ends < r.starts) bad("结束日期不可早于开始日期");
  if (isCoupon(r)) {
    r.unlimited = false;
    r.maxUses = 1;
  }
  if (!r.unlimited && !r.ends) bad("非长期优惠和优惠券必须设置有效结束日期");
  if (r.unlimited) r.ends = "";
  if (
    r.kind === "price" &&
    (!["product", "sku"].includes(r.scope) || r.targets.length !== 1)
  )
    bad("专属价仅支持单个商品或单个规格，请重新选择");
  if (
    r.kind === "rate"
      ? r.value < 0.1 || r.value > 9.9 || !precise(r.value, 10)
      : !precise(r.value, 100)
  )
    bad(
      r.kind === "rate"
        ? "折扣须为0.1至9.9之间且最多一位小数"
        : "金额最多两位小数"
    );
  if (!precise(r.threshold, 100)) bad("门槛金额最多两位小数");
  if (r.kind === "threshold" && (r.threshold <= 0 || r.value >= r.threshold))
    bad("满减门槛须大于优惠额且不能零元结算");
  if (r.kind !== "threshold") r.threshold = 0;
  if (r.scope === "all") r.targets = [];
  else {
    if (!r.targets.length || new Set(r.targets).size !== r.targets.length)
      bad("请选择有效且不重复的优惠范围");
    const valid =
      r.scope === "sku"
        ? flattenCatalog(catalog).map(s => s.id)
        : r.scope === "product"
          ? catalog.map(p => p.id)
          : catalog.map(p => (r.scope === "category" ? p.category : p.series));
    if (r.targets.some(id => !valid.includes(id)))
      bad("原商品或规格已移除，请重新选择；不会自动替换规格");
  }
  const covered = flattenCatalog(catalog).filter(s =>
    benefitApplies(r, {
      productKey: s.productKey!,
      skuId: s.skuId!,
      quantity: 1,
      priceCny: s.price,
      category: s.category,
      series: s.series,
    })
  );
  const saleable = covered.filter(skuSelectable);
  if (!saleable.length) bad("所选范围当前没有可售规格");
  if (
    r.kind === "price" &&
    saleable.some(s => Math.round(r.value * 100) >= Math.round(s.price * 100))
  )
    bad("专属价须低于所选范围全部可售规格的真实售价");
  return r;
}
async function audit(
  db: BenefitSqlExecutor,
  userId: number,
  ruleId: string,
  operatorId: number,
  action: string,
  detail: string,
  before: Rule | null,
  after: Rule | null,
  orderId?: number,
  savedCents?: number
) {
  await db.execute(
    `INSERT INTO miban_benefit_audits (storefront,user_id,rule_id,operator_id,action,detail,before_json,after_json,order_id,saved_cents) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      STORE,
      userId,
      ruleId,
      operatorId,
      action,
      detail,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      orderId ?? null,
      savedCents ?? null,
    ]
  );
}
async function updateRule(
  db: BenefitSqlExecutor,
  before: Rule,
  after: Rule,
  actorId: number
) {
  const [result] = await db.execute(
    `UPDATE miban_benefit_rules SET kind=?,state=?,starts=?,ends=?,unlimited=?,max_uses=?,uses=?,version=?,rule_json=?,operator_id=?,updated_at=NOW() WHERE storefront=? AND user_id=? AND id=? AND version=?`,
    [
      after.kind,
      after.state,
      after.starts,
      after.ends,
      Number(after.unlimited),
      after.maxUses,
      after.uses,
      after.version,
      JSON.stringify(after),
      actorId,
      STORE,
      Number(before.userId),
      before.id,
      before.version,
    ]
  );
  if (Number(result.affectedRows) !== 1) conflict();
}
/** New rule MUST submit id='' (or omit id); a nonempty id is strictly an optimistic-locked edit. */
export async function saveMibanBenefitRule(
  actor: BenefitActor,
  input: {
    storefront: string;
    userId: number;
    rule: BenefitRuleInput;
    count: number;
    requestId: string;
  }
): Promise<Rule[]> {
  admin(actor);
  storefront(input.storefront);
  owner(input.userId);
  const count = z.number().int().min(1).max(20).parse(input.count),
    requestId = z.string().uuid().parse(input.requestId);
  const parsed = mibanBenefitRuleInputSchema.parse(input.rule); // strip untrusted identity/counters/state/created
  if (parsed.id && count !== 1) bad("编辑时不能批量发放");
  if (!isCoupon(parsed) && count !== 1) bad("只有单次优惠券可批量发放");
  await ensureMibanBenefitsInfrastructure();
  return withGlobalWalletTransaction(input.userId, async db => {
    const requestHash = hash({ rule: parsed, count });
    const request = (
      await rows(
        db,
        "SELECT * FROM miban_benefit_requests WHERE storefront=? AND user_id=? AND request_id=? FOR UPDATE",
        [STORE, input.userId, requestId]
      )
    )[0];
    if (request) {
      if (
        Number(request.operator_id) !== actor.id ||
        request.input_hash !== requestHash
      )
        bad("该请求编号已用于不同操作");
      return json<Rule[]>(request.response_json);
    }
    const current = await readRules(db, input.userId, true);
    const before = parsed.id
      ? current.find(r => r.id === parsed.id)
      : undefined;
    if (parsed.id && (!before || before.version !== parsed.version)) conflict();
    if (
      before &&
      isCoupon(before) &&
      (before.uses > 0 || before.state === "used")
    )
      bad("已用优惠券不可修改或复活");
    if (before?.state === "revoked") bad("已撤销优惠不可编辑，请新建优惠");
    const validated = validateMibanBenefitRule(
      parsed,
      await readMibanBenefitsCatalog(db, true)
    );
    if (before && isCoupon(before) !== isCoupon(validated))
      bad("不可把既有权益与优惠券互换，请新建优惠");
    if (before && validated.maxUses > 0 && validated.maxUses < before.uses)
      bad("次数上限不可低于已使用次数");
    const result: Rule[] = [];
    for (let i = 0; i < count; i++) {
      const after: Rule = {
        ...validated,
        id: before?.id ?? randomUUID(),
        userId: String(input.userId),
        uses: before?.uses ?? 0,
        state: before?.state ?? "active",
        created: before?.created ?? new Date().toISOString(),
        version: before ? before.version + 1 : 1,
      };
      if (before) await updateRule(db, before, after, actor.id);
      else
        await db.execute(
          `INSERT INTO miban_benefit_rules (storefront,id,user_id,kind,state,starts,ends,unlimited,max_uses,uses,version,rule_json,operator_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            STORE,
            after.id,
            input.userId,
            after.kind,
            after.state,
            after.starts,
            after.ends,
            Number(after.unlimited),
            after.maxUses,
            0,
            1,
            JSON.stringify(after),
            actor.id,
          ]
        );
      await audit(
        db,
        input.userId,
        after.id,
        actor.id,
        before ? "修改优惠" : isCoupon(after) ? "发放优惠券" : "新增专属优惠",
        `${after.name} · ${before ? "已更新" : "已创建"}`,
        before ?? null,
        after
      );
      result.push(after);
    }
    await db.execute(
      "INSERT INTO miban_benefit_requests (storefront,user_id,request_id,operator_id,input_hash,response_json) VALUES (?,?,?,?,?,?)",
      [
        STORE,
        input.userId,
        requestId,
        actor.id,
        requestHash,
        JSON.stringify(result),
      ]
    );
    return result;
  });
}
export async function setMibanBenefitState(
  actor: BenefitActor,
  input: {
    storefront: string;
    userId: number;
    ruleId: string;
    version: number;
    next: "active" | "paused" | "revoked";
    reason: string;
  }
): Promise<Rule> {
  admin(actor);
  storefront(input.storefront);
  owner(input.userId);
  if (
    !input.reason.trim() ||
    input.reason.length > 1000 ||
    !["active", "paused", "revoked"].includes(input.next)
  )
    bad("请填写有效的操作原因");
  await ensureMibanBenefitsInfrastructure();
  return withGlobalWalletTransaction(input.userId, async db => {
    const before = (await readRules(db, input.userId, true)).find(
      r => r.id === input.ruleId
    );
    if (!before || before.version !== input.version) conflict();
    if (
      before.state === "revoked" ||
      (isCoupon(before) && (before.uses > 0 || before.state === "used"))
    )
      bad("已撤销优惠或已用券不可修改、復活");
    if (input.next === "active")
      validateMibanBenefitRule(
        before,
        await readMibanBenefitsCatalog(db, true)
      );
    const after = { ...before, state: input.next, version: before.version + 1 };
    await updateRule(db, before, after, actor.id);
    await audit(
      db,
      input.userId,
      after.id,
      actor.id,
      input.next === "active"
        ? "启用优惠"
        : input.next === "paused"
          ? "停用优惠"
          : "撤销优惠",
      input.reason.trim(),
      before,
      after
    );
    return after;
  });
}
function canonicalCart(items: BenefitCartItem[]): BenefitCartItem[] {
  if (!Array.isArray(items) || !items.length || items.length > 100)
    bad("购物车须有1至100个规格");
  const seen = new Set<string>();
  const result = items.map(i => {
    if (
      typeof i.productKey !== "string" ||
      !i.productKey ||
      i.productKey.length > 80 ||
      typeof i.skuId !== "string" ||
      !i.skuId ||
      i.skuId.length > 80 ||
      !Number.isSafeInteger(i.quantity) ||
      i.quantity < 1 ||
      i.quantity > 20
    )
      bad("商品或数量无效");
    const key = `${i.productKey}:${i.skuId}`;
    if (seen.has(key)) bad("购物车不可重复提交同一规格");
    seen.add(key);
    return { productKey: i.productKey, skuId: i.skuId, quantity: i.quantity };
  });
  return result.sort(
    (a, b) =>
      a.productKey.localeCompare(b.productKey) || a.skuId.localeCompare(b.skuId)
  );
}
function buildPricing(
  catalog: CatalogProduct[],
  cart: BenefitCartItem[],
  mode: BenefitMode,
  checkStock: boolean
): BenefitPricingLine[] {
  if (!["once", "annual"].includes(mode)) bad("优惠报价模式无效");
  if (
    mode === "annual" &&
    (cart.length !== 1 ||
      catalog.find(p => p.productKey === cart[0].productKey)?.brand !==
        "米大娘")
  )
    bad("年付优惠仅接受一个米大娘商品规格");
  return cart.map(i => {
    const product = catalog.find(p => p.productKey === i.productKey),
      sku = product?.skus.find(s => s.skuId === i.skuId);
    if (!product || !sku || !sku.active)
      bad("商品或规格已移除、停用，请刷新购物车");
    if (i.quantity > (sku.maxPurchaseQty ?? 20))
      bad("数量超出当前规格单笔购买上限");
    const quantity = i.quantity * (mode === "annual" ? 12 : 1);
    if (
      checkStock &&
      (!sku.available ||
        sku.stock === null ||
        sku.stock === undefined ||
        (sku.stock >= 0 && sku.stock < quantity))
    )
      bad("当前规格库存不足或不可售");
    return {
      ...i,
      quantity,
      priceCny: sku.price,
      activityPriceCny: sku.activity,
      category: product.category,
      series: product.series,
    };
  });
}
function catalogFingerprint(catalog: CatalogProduct[]) {
  // Availability/stock deliberately excluded: checkout may already have reserved its stock.
  return hash(
    catalog.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      series: p.series,
      brand: p.brand,
      skus: p.skus.map(s => ({
        id: s.id,
        name: s.name,
        price: s.price,
        activity: s.activity,
        active: s.active,
        maxPurchaseQty: s.maxPurchaseQty,
      })),
    }))
  );
}
function ruleFingerprint(rules: Rule[]) {
  return hash(rules.map(r => [r.id, r.version, r.uses, r.state]));
}
function secret() {
  const key = process.env.JWT_SECRET || ENV.cookieSecret;
  if (typeof key !== "string" || key.length < 16)
    throw new Error("优惠报价签名未配置，已停止结算");
  return key;
}
const DOMAIN = "miban-benefits-quote:v1:";
function sign(payload: string) {
  return createHmac("sha256", secret())
    .update(DOMAIN + payload)
    .digest("base64url");
}
type QuotePayload = {
  version: 1;
  userId: number;
  storefront: typeof STORE;
  mode: BenefitMode;
  cart: BenefitCartItem[];
  resultHash: string;
  rulesHash: string;
  catalogHash: string;
  expiresAt: number;
  nonce: string;
};
function parseToken(token: string): QuotePayload {
  if (typeof token !== "string" || token.length > 40000) conflict();
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) conflict();
  const expected = Buffer.from(sign(encoded), "base64url"),
    supplied = Buffer.from(signature, "base64url");
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  )
    conflict();
  let payload: QuotePayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return conflict();
  }
  if (
    payload.version !== 1 ||
    payload.storefront !== STORE ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.expiresAt <= Date.now()
  )
    conflict();
  return payload;
}
function calculateCurrent(
  rules: Rule[],
  lines: BenefitPricingLine[],
  mode: BenefitMode
) {
  const eligible =
    mode === "annual"
      ? rules.filter(r => {
          if (!isCoupon(r)) return true;
          const covered = lines.filter(l => benefitApplies(r, l));
          return (
            covered.reduce(
              (sum, l) => sum + Math.round(l.priceCny * 100) * l.quantity,
              0
            ) -
              Math.round(r.value * 100) >=
            12
          );
        })
      : rules;
  const result = calculateBenefits(eligible, lines);
  if (result.totalCents < (mode === "annual" ? 12 : 1))
    bad("不支持零元结算，年付每月须至少一分");
  return result;
}
export async function getMibanBenefitQuote(
  userId: number,
  items: BenefitCartItem[],
  mode: BenefitMode = "once"
): Promise<BenefitQuote> {
  owner(userId);
  const cart = canonicalCart(items);
  await ensureMibanBenefitsInfrastructure();
  return readConnection(async db => {
    const rules = await readRules(db, userId),
      catalog = await readMibanBenefitsCatalog(db);
    const result = calculateCurrent(
        rules,
        buildPricing(catalog, cart, mode, true),
        mode
      ),
      expiresAt = Date.now() + 5 * 60_000;
    const payload: QuotePayload = {
      version: 1,
      userId,
      storefront: STORE,
      mode,
      cart,
      resultHash: hash(result),
      rulesHash: ruleFingerprint(rules),
      catalogHash: catalogFingerprint(catalog),
      expiresAt,
      nonce: randomUUID(),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return {
      quoteToken: `${encoded}.${sign(encoded)}`,
      result,
      expiresAt,
      storefront: STORE,
    };
  });
}
/** No DDL/nested transaction. Caller MUST already hold the global wallet users row lock. */
export async function assertMibanBenefitQuote(
  transaction: BenefitSqlExecutor,
  userId: number,
  items: BenefitCartItem[],
  mode: BenefitMode = "once",
  quoteToken?: string,
  expectedResult?: BenefitResult
): Promise<BenefitResult> {
  owner(userId);
  const cart = canonicalCart(items);
  const payload = quoteToken ? parseToken(quoteToken) : null;
  if (
    payload &&
    (payload.userId !== userId ||
      payload.mode !== mode ||
      hash(payload.cart) !== hash(cart))
  )
    conflict();
  const rules = await readRules(transaction, userId, true),
    catalog = await readMibanBenefitsCatalog(transaction, true);
  let result: BenefitResult;
  try {
    result = calculateCurrent(
      rules,
      buildPricing(catalog, cart, mode, false),
      mode
    );
  } catch (e) {
    if (e instanceof TRPCError && e.code === "BAD_REQUEST") return conflict();
    throw e;
  }
  if (payload) {
    if (
      payload.expiresAt <= Date.now() ||
      payload.resultHash !== hash(result) ||
      payload.rulesHash !== ruleFingerprint(rules) ||
      payload.catalogHash !== catalogFingerprint(catalog)
    )
      conflict();
  } else if (!expectedResult || hash(expectedResult) !== hash(result))
    conflict();
  if (expectedResult && hash(expectedResult) !== hash(result)) conflict();
  return result;
}
/** The actual result and immutable real order links are recorded within the SAME debit transaction. */
export async function recordMibanBenefitUse(
  transaction: BenefitSqlExecutor,
  userId: number,
  checkoutKey: string,
  result: BenefitResult,
  orders: Array<{ orderId: number; totalCents: number }>
): Promise<void> {
  owner(userId);
  if (
    !checkoutKey ||
    checkoutKey.length > 128 ||
    !orders.length ||
    orders.length > 100
  )
    bad("优惠核销结算编号或订单无效");
  const sortedOrders = [...orders].sort((a, b) => a.orderId - b.orderId);
  const ids = new Set<number>();
  for (const o of sortedOrders) {
    if (
      !Number.isSafeInteger(o.orderId) ||
      o.orderId <= 0 ||
      ids.has(o.orderId) ||
      !Number.isSafeInteger(o.totalCents) ||
      o.totalCents <= 0
    )
      bad("优惠核销订单或金额无效");
    ids.add(o.orderId);
  }
  if (
    sortedOrders.reduce((sum, o) => sum + o.totalCents, 0) !==
      result.totalCents ||
    result.lines.reduce((s, l) => s + l.totalCents, 0) !== result.totalCents ||
    new Set(result.consumedRuleIds).size !== result.consumedRuleIds.length
  )
    bad("优惠订单快照合计不一致");
  if (!result.consumedRuleIds.length) return;
  const actualOrders = await rows(
    transaction,
    `SELECT id,userId,totalPrice,status FROM miban_orders WHERE id IN (${sortedOrders.map(() => "?").join(",")}) ORDER BY id FOR UPDATE`,
    sortedOrders.map(o => o.orderId)
  );
  if (
    actualOrders.length !== sortedOrders.length ||
    actualOrders.some(
      (o, i) =>
        Number(o.id) !== sortedOrders[i].orderId ||
        Number(o.userId) !== userId ||
        o.status === "cancelled" ||
        Math.round(Number(o.totalPrice) * 100) !== sortedOrders[i].totalCents
    )
  )
    bad("优惠核销实际订单归属或成交金额不一致");
  const rules = await readRules(transaction, userId, true);
  for (const ruleId of [...result.consumedRuleIds].sort()) {
    const before = rules.find(r => r.id === ruleId);
    if (!before) conflict();
    const existing = (
      await rows(
        transaction,
        "SELECT * FROM miban_benefit_usages WHERE storefront=? AND checkout_key=? AND rule_id=? FOR UPDATE",
        [STORE, checkoutKey, ruleId]
      )
    )[0];
    if (existing) {
      const snapshot = json<any>(existing.snapshot_json);
      if (
        Number(existing.user_id) !== userId ||
        hash(snapshot.result) !== hash(result) ||
        hash(snapshot.orders) !== hash(sortedOrders)
      )
        conflict();
      continue; // idempotent, even after restoration; never consume twice
    }
    if (status(before) !== "生效中") conflict();
    if (
      !result.lines.some(
        l => l.ruleId === ruleId && l.totalCents < l.originalCents
      )
    )
      bad("优惠规则未实际贡献，不得核销");
    const after: Rule = {
      ...before,
      uses: before.uses + 1,
      version: before.version + 1,
      state: isCoupon(before) ? "used" : before.state,
    };
    const snapshot = { rule: before, result, orders: sortedOrders };
    const [insert] = await transaction.execute(
      "INSERT INTO miban_benefit_usages (storefront,user_id,checkout_key,rule_id,snapshot_json) VALUES (?,?,?,?,?)",
      [STORE, userId, checkoutKey, ruleId, JSON.stringify(snapshot)]
    );
    for (const o of sortedOrders)
      await transaction.execute(
        "INSERT INTO miban_benefit_usage_orders (storefront,usage_id,user_id,order_id,total_cents) VALUES (?,?,?,?,?)",
        [STORE, Number(insert.insertId), userId, o.orderId, o.totalCents]
      );
    await updateRule(transaction, before, after, userId);
    const saved = result.lines
      .filter(l => l.ruleId === ruleId)
      .reduce((s, l) => s + l.originalCents - l.totalCents, 0);
    await audit(
      transaction,
      userId,
      ruleId,
      userId,
      "订单使用",
      `${before.name} · 结算${checkoutKey} · 整车计一次`,
      before,
      after,
      sortedOrders[0].orderId,
      saved
    );
  }
}
/** Current order already cancelled; only fully-cancelled linked checkouts restore once. No DDL. */
export async function restoreMibanBenefitsForCancelledOrder(
  transaction: BenefitSqlExecutor,
  userId: number,
  orderId: number,
  actorUserId: number
): Promise<void> {
  owner(userId);
  owner(orderId);
  owner(actorUserId);
  let usages: any[];
  try {
    usages = await rows(
      transaction,
      `SELECT u.* FROM miban_benefit_usages u JOIN miban_benefit_usage_orders o ON o.storefront=u.storefront AND o.usage_id=u.id AND o.user_id=u.user_id WHERE u.storefront=? AND u.user_id=? AND o.order_id=? ORDER BY u.rule_id FOR UPDATE`,
      [STORE, userId, orderId]
    );
  } catch (e) {
    if (missingTable(e)) return;
    throw e;
  } // compatible with genuinely old orders/tables only
  for (const usage of usages) {
    if (Number(usage.restored) === 1) continue;
    const linked = await rows(
      transaction,
      `SELECT x.order_id,x.total_cents,o.status,o.userId FROM miban_benefit_usage_orders x LEFT JOIN miban_orders o ON o.id=x.order_id WHERE x.storefront=? AND x.user_id=? AND x.usage_id=? ORDER BY x.order_id FOR UPDATE`,
      [STORE, userId, usage.id]
    );
    const snapshot = json<{
      rule: Rule;
      result: BenefitResult;
      orders: Array<{ orderId: number; totalCents: number }>;
    }>(usage.snapshot_json);
    if (
      !linked.length ||
      hash(
        linked.map(o => ({
          orderId: Number(o.order_id),
          totalCents: Number(o.total_cents),
        }))
      ) !== hash(snapshot.orders)
    )
      throw new Error("优惠核销订单关联异常，已停止恢复");
    if (linked.some(o => Number(o.userId) !== userId || !o.status))
      throw new Error("优惠核销订单归属异常，已停止恢复");
    if (linked.some(o => o.status !== "cancelled")) continue;
    const before = (await readRules(transaction, userId, true)).find(
      r => r.id === usage.rule_id
    );
    if (!before || before.uses <= 0)
      throw new Error("优惠已用次数异常，已停止恢复");
    const after: Rule = {
      ...before,
      uses: before.uses - 1,
      version: before.version + 1,
      state: before.state === "used" ? "active" : before.state,
    };
    // Active here means restored state, NOT date extension: expired rules stay expired through status().
    await updateRule(transaction, before, after, actorUserId);
    const [updated] = await transaction.execute(
      "UPDATE miban_benefit_usages SET restored=1,restored_at=NOW(),restored_by=? WHERE storefront=? AND user_id=? AND id=? AND restored=0",
      [actorUserId, STORE, userId, usage.id]
    );
    if (Number(updated.affectedRows) !== 1) conflict();
    await audit(
      transaction,
      userId,
      before.id,
      actorUserId,
      "取消恢复",
      `${before.name} · 同结算全部订单已取消，恢复一次`,
      before,
      after,
      orderId
    );
  }
}

/** Caller holds user lock; restored/cancelled benefit history remains protected from deletion. */
export async function assertMibanBenefitOrderCanDelete(
  transaction: BenefitSqlExecutor,
  userId: number,
  orderId: number
): Promise<void> {
  owner(userId);
  owner(orderId);
  let linked: any[];
  try {
    linked = await rows(
      transaction,
      "SELECT usage_id FROM miban_benefit_usage_orders WHERE storefront=? AND user_id=? AND order_id=? LIMIT 1 FOR UPDATE",
      [STORE, userId, orderId]
    );
  } catch (e) {
    if (missingTable(e)) return;
    throw e;
  }
  if (linked.length)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "订单已有优惠使用记录，请保留历史订单并使用取消退款，不支持直接删除",
    });
}
