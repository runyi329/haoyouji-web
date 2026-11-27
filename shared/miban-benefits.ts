export const MIBAN_BENEFITS_STOREFRONT = "miban-limited" as const;
export type BenefitStorefront = typeof MIBAN_BENEFITS_STOREFRONT;
export type Scope = "all" | "category" | "series" | "product" | "sku";
export type Kind = "rate" | "price" | "cash" | "threshold";
export type State = "active" | "paused" | "revoked" | "used";
export type Rule = {
  id: string;
  userId: string;
  kind: Kind;
  name: string;
  scope: Scope;
  targets: string[];
  value: number;
  threshold: number;
  starts: string;
  ends: string;
  unlimited: boolean;
  maxUses: number;
  uses: number;
  state: State;
  note: string;
  created: string;
  version: number;
};
export type Audit = {
  id: string;
  userId: string;
  action: string;
  detail: string;
  time: string;
  order?: string;
  saved?: number;
  operatorId?: number;
  before?: Rule | null;
  after?: Rule | null;
};
export type BenefitUser = {
  id: string;
  name: string;
  account: string;
  color: string;
  activeCount?: number;
};
export type CatalogSku = {
  id: string;
  name: string;
  price: number;
  activity: number;
  active?: boolean;
  available?: boolean;
  unitLabel?: string;
  skuId?: string;
  stock?: number | null;
  maxPurchaseQty?: number;
};
export type CatalogProduct = {
  id: string;
  name: string;
  category: string;
  series: string;
  brand?: string;
  productKey?: string;
  skus: CatalogSku[];
};
export type CatalogLineSku = CatalogSku & {
  productId: string;
  productName: string;
  category: string;
  series: string;
  productKey?: string;
};
export const flattenCatalog = (products: CatalogProduct[]): CatalogLineSku[] =>
  products.flatMap(p =>
    p.skus.map(s => ({
      ...s,
      productId: p.id,
      productName: p.name,
      category: p.category,
      series: p.series,
      productKey: p.productKey,
    }))
  );
export const skuSelectable = (s: CatalogSku) =>
  s.active !== false && s.available !== false;
export function beijingDate(now: Date | number = Date.now()): string {
  return new Date((now instanceof Date ? now.getTime() : now) + 8 * 3600_000)
    .toISOString()
    .slice(0, 10);
}
/** Compatibility only: status() itself always reads the live date. */
export const TODAY = beijingDate();
export const isCoupon = (r: Pick<Rule, "kind">) =>
  r.kind === "cash" || r.kind === "threshold";
export const money = (cents: number) => (cents / 100).toFixed(2);
export const scopeNames: Record<Scope, string> = {
  all: "限时商城全场",
  category: "指定分类",
  series: "指定精选系列",
  product: "指定商品",
  sku: "指定规格",
};
export const kindNames: Record<Kind, string> = {
  rate: "专属折扣",
  price: "商品专属价",
  cash: "立减券",
  threshold: "满减券",
};
export function targetName(id: string, products: CatalogProduct[] = []) {
  const sku = flattenCatalog(products).find(s => s.id === id);
  if (sku) return `${sku.productName} · ${sku.name}`;
  const product = products.find(p => p.id === id);
  if (product) return `${product.name} · 全部规格`;
  return id.startsWith("limited:") ? "原商品或规格已移除，请重新选择" : id;
}
export const scopeText = (
  r: Pick<Rule, "scope" | "targets">,
  products: CatalogProduct[] = [],
  _limited = true
) =>
  r.scope === "all"
    ? scopeNames.all
    : r.targets.map(id => targetName(id, products)).join("、") ||
      scopeNames[r.scope];
export const valueText = (r: Pick<Rule, "kind" | "value" | "threshold">) =>
  r.kind === "rate"
    ? `${r.value}折`
    : r.kind === "price"
      ? `¥${r.value.toFixed(2)}`
      : r.kind === "threshold"
        ? `满${r.threshold}减${r.value}`
        : `减${r.value}元`;
export function status(r: Rule, now: Date | number = Date.now()) {
  if (r.state === "used") return "已使用";
  if (r.state === "revoked") return "已撤销";
  if (r.state === "paused") return "已停用";
  const today = beijingDate(now);
  if (r.ends && r.ends < today) return "已过期";
  if (r.starts > today) return "未开始";
  if (r.maxUses > 0 && r.uses >= r.maxUses) return "次数用尽";
  return "生效中";
}
export type BenefitCartItem = {
  productKey: string;
  skuId: string;
  quantity: number;
};
/** Trusted prices ONLY: the server builds these from the current real catalog. */
export type BenefitPricingLine = BenefitCartItem & {
  priceCny: number;
  activityPriceCny?: number;
  category: string;
  series: string;
};
export type BenefitResultLine = BenefitCartItem & {
  originalCents: number;
  totalCents: number;
  ruleId?: string;
  ruleName?: string;
};
export type BenefitResult = {
  originalCents: number;
  totalCents: number;
  savedCents: number;
  lines: BenefitResultLine[];
  consumedRuleIds: string[];
  couponId?: string;
  summary: string;
};
export type BenefitQuote = {
  quoteToken: string;
  result: BenefitResult;
  expiresAt: number;
  storefront: BenefitStorefront;
};
export function applies(r: Pick<Rule, "scope" | "targets">, s: CatalogLineSku) {
  return (
    r.scope === "all" ||
    (r.scope === "category" && r.targets.includes(s.category)) ||
    (r.scope === "series" && r.targets.includes(s.series)) ||
    (r.scope === "product" && r.targets.includes(s.productId)) ||
    (r.scope === "sku" && r.targets.includes(s.id))
  );
}
export function benefitApplies(
  r: Pick<Rule, "scope" | "targets">,
  l: BenefitPricingLine
) {
  return applies(r, {
    id: `limited:${l.productKey}:${l.skuId}`,
    productId: `limited:${l.productKey}`,
    productName: "",
    name: "",
    price: l.priceCny,
    activity: l.activityPriceCny ?? l.priceCny,
    category: l.category,
    series: l.series,
  });
}
function cents(amount: number): number {
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(Math.round(amount * 100))
  )
    throw new Error("商品金额无效");
  const n = Math.round(amount * 100);
  if (n <= 0) throw new Error("不支持零元商品");
  return n;
}
function safe(n: number): number {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("购物车金额超出范围");
  return n;
}
function ruleOrder(a: Rule, b: Rule) {
  return (
    (a.ends || "9999-12-31").localeCompare(b.ends || "9999-12-31") ||
    a.id.localeCompare(b.id)
  );
}
/** Allocate net cents proportionally; largest remainder, lexical line tie-break, minimum 1 cent/line. */
function allocateNet(net: number, originals: number[]): number[] {
  if (net < originals.length) throw new Error("不支持零元结算行");
  const total = originals.reduce((a, b) => a + BigInt(b), BigInt(0));
  const n = BigInt(net);
  const allocations = originals.map(o =>
    Math.max(1, Number((n * BigInt(o)) / total))
  );
  let diff = net - allocations.reduce((a, b) => a + b, 0);
  const order = originals
    .map((o, i) => ({ i, remainder: (n * BigInt(o)) % total }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.i - b.i
        : a.remainder > b.remainder
          ? -1
          : 1
    );
  while (diff > 0)
    for (const { i } of order) {
      if (diff === 0) break;
      if (allocations[i] < originals[i]) {
        allocations[i]++;
        diff--;
      }
    }
  while (diff < 0)
    for (const { i } of [...order].reverse()) {
      if (diff === 0) break;
      if (allocations[i] > 1) {
        allocations[i]--;
        diff++;
      }
    }
  return allocations;
}
/** Non-stacking: coupon replaces covered lines' discounts; outside lines keep their best plan. */
export function calculateBenefits(
  rules: Rule[],
  lines: BenefitPricingLine[],
  now: Date | number = Date.now()
): BenefitResult {
  const merged = new Map<string, BenefitPricingLine>();
  for (const l of lines) {
    if (
      !l.productKey ||
      !l.skuId ||
      !Number.isSafeInteger(l.quantity) ||
      l.quantity <= 0
    )
      throw new Error("购物车商品或数量无效");
    const key = `${l.productKey}:${l.skuId}`;
    const previous = merged.get(key);
    if (
      previous &&
      (previous.priceCny !== l.priceCny ||
        previous.activityPriceCny !== l.activityPriceCny ||
        previous.category !== l.category ||
        previous.series !== l.series)
    )
      throw new Error("重复规格价格不一致");
    merged.set(key, {
      ...l,
      quantity: safe(l.quantity + (previous?.quantity ?? 0)),
    });
  }
  const cart = Array.from(merged.values()).sort(
    (a, b) =>
      a.productKey.localeCompare(b.productKey) || a.skuId.localeCompare(b.skuId)
  );
  const eligible = [...rules]
    .filter(r => status(r, now) === "生效中")
    .sort(ruleOrder);
  const resultLines: BenefitResultLine[] = cart.map(l => {
    const unit = cents(l.priceCny),
      originalCents = safe(unit * l.quantity);
    let totalCents = Math.min(
      originalCents,
      safe(cents(l.activityPriceCny ?? l.priceCny) * l.quantity)
    );
    let ruleId: string | undefined, ruleName: string | undefined;
    for (const r of eligible.filter(
      r => !isCoupon(r) && benefitApplies(r, l)
    )) {
      if (
        !Number.isFinite(r.value) ||
        r.value <= 0 ||
        (r.kind === "rate" &&
          (r.value > 9.9 ||
            Math.abs(r.value * 10 - Math.round(r.value * 10)) > 1e-8))
      )
        throw new Error("优惠规则金额异常");
      const unitTotal =
        r.kind === "rate"
          ? Math.max(
              1,
              Number(
                (BigInt(unit) * BigInt(Math.round(r.value * 10)) + BigInt(50)) / BigInt(100)
              )
            )
          : cents(r.value);
      const amount = safe(unitTotal * l.quantity);
      if (amount < totalCents) {
        totalCents = amount;
        ruleId = r.id;
        ruleName = r.name;
      }
    }
    return {
      productKey: l.productKey,
      skuId: l.skuId,
      quantity: l.quantity,
      originalCents,
      totalCents,
      ...(ruleId ? { ruleId, ruleName } : {}),
    };
  });
  let chosen = resultLines,
    totalCents = safe(chosen.reduce((a, b) => a + b.totalCents, 0)),
    couponId: string | undefined;
  for (const coupon of eligible.filter(isCoupon)) {
    const indices = cart
      .map((l, i) => (benefitApplies(coupon, l) ? i : -1))
      .filter(i => i >= 0);
    if (!indices.length) continue;
    const coveredOriginal = safe(
      indices.reduce((a, i) => a + resultLines[i].originalCents, 0)
    );
    const threshold = Math.round(coupon.threshold * 100),
      value = cents(coupon.value);
    if (!Number.isSafeInteger(threshold) || threshold < 0)
      throw new Error("优惠券门槛异常");
    const net = coveredOriginal - value;
    if (coveredOriginal < threshold || net < indices.length) continue;
    const amount = safe(
      net +
        resultLines.reduce(
          (a, l, i) => a + (indices.includes(i) ? 0 : l.totalCents),
          0
        )
    );
    if (amount >= totalCents) continue; // ties never consume a coupon
    const allocated = allocateNet(
      net,
      indices.map(i => resultLines[i].originalCents)
    );
    chosen = resultLines.map(l => ({ ...l }));
    indices.forEach((index, i) => {
      chosen[index] = {
        ...chosen[index],
        totalCents: allocated[i],
        ruleId: coupon.id,
        ruleName: coupon.name,
      };
    });
    totalCents = amount;
    couponId = coupon.id;
  }
  const originalCents = safe(chosen.reduce((a, b) => a + b.originalCents, 0));
  const consumedRuleIds = Array.from(
    new Set(
      chosen
        .filter(l => l.ruleId && l.totalCents < l.originalCents)
        .map(l => l.ruleId!)
    )
  ).sort();
  // Coupon contributes globally even if a minimum-cent allocation leaves one covered line undiscounted.
  if (couponId && !consumedRuleIds.includes(couponId))
    consumedRuleIds.push(couponId);
  consumedRuleIds.sort();
  const names = consumedRuleIds
    .map(id => rules.find(r => r.id === id)?.name)
    .filter(Boolean);
  return {
    originalCents,
    totalCents,
    savedCents: originalCents - totalCents,
    lines: chosen,
    consumedRuleIds,
    ...(couponId ? { couponId } : {}),
    summary: names.length
      ? `${names.join("、")} · 已省¥${money(originalCents - totalCents)}`
      : "各商品正常价/活动价择优，不消耗用户优惠",
  };
}
/** Prototype-compatible preview adapter; no built-in catalog or demo data. */
export type Line = { skuId: string; qty: number };
export function calculate(
  rules: Rule[],
  lines: Line[],
  skus: CatalogLineSku[]
) {
  const pricing = lines.map(l => {
    const sku = skus.find(s => s.id === l.skuId && skuSelectable(s));
    if (!sku) throw new Error("规格已移除或不可售");
    return {
      productKey: sku.productKey ?? sku.productId.replace(/^limited:/, ""),
      skuId: sku.skuId ?? sku.id.replace(/^limited:[^:]+:/, ""),
      quantity: l.qty,
      priceCny: sku.price,
      activityPriceCny: sku.activity,
      category: sku.category,
      series: sku.series,
    };
  });
  const result = calculateBenefits(rules, pricing);
  return {
    ...result,
    original: result.originalCents,
    base: calculateBenefits(
      rules.filter(r => !isCoupon(r)),
      pricing
    ).totalCents,
    chosen: {
      id: result.couponId ?? "none",
      name: result.summary,
      amount: result.totalCents,
      valid: true,
      reason: "",
      coupon: rules.find(r => r.id === result.couponId) ?? null,
    },
    plans: [],
    bestLines: result.lines.map(line => {
      const sku = skus.find(
        s =>
          (s.productKey ?? s.productId.replace(/^limited:/, "")) ===
            line.productKey &&
          (s.skuId ?? s.id.replace(/^limited:[^:]+:/, "")) === line.skuId
      )!;
      return {
        line: { skuId: sku.id, qty: line.quantity, sku },
        best: {
          id: line.ruleId ?? "regular",
          name: line.ruleName ?? "正常售价/活动价",
          amount: line.totalCents,
        },
        options: [],
      };
    }),
  };
}
