import {
  PAYMENT_SCALE,
  normalizeMibanPaymentAssets,
  paymentAssetDecimals,
  paymentUnitsText,
  type MibanPaymentDeduction,
} from "./miban-wallet-payment";

const CENT = PAYMENT_SCALE / 100n;

/** Unlike the quote parser, checkout amounts must not silently truncate sub-wei digits. */
function exactUnits(value: string | number): bigint {
  if ((typeof value !== "string" && typeof value !== "number") ||
      (typeof value === "number" && !Number.isFinite(value))) throw new Error("购物车金额无效");
  const text = String(value).trim();
  if (text.length > 256) throw new Error("购物车金额超出范围");
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match) throw new Error("购物车金额必须为十进制数");
  // Number is used only for the bounded decimal exponent, never monetary arithmetic.
  const exponent = Number(match[4] ?? "0");
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) throw new Error("购物车金额超出范围");
  const digits = BigInt(match[2] + (match[3] ?? ""));
  const shift = 18 + exponent - (match[3]?.length ?? 0);
  const divisor = shift < 0 ? 10n ** BigInt(-shift) : 1n;
  if (digits % divisor !== 0n) throw new Error("购物车金额超出十八位结算精度");
  const units = shift >= 0 ? digits * 10n ** BigInt(shift) : digits / divisor;
  return match[1] ? -units : units;
}

export type MibanCartCheckoutGroup<T> = {
  checkoutGroupKey: string;
  groupLabel: string;
  items: T[];
  totalCny: number;
  /** Total quantity, not the number of distinct cart rows. */
  itemCount: number;
};

/**
 * Stable, UI-local grouping; this is NOT authority for server prices/group ownership.
 * Reject missing/blank/noncanonical keys rather than merging legacy storage under
 * undefined or guessing its brand. Callers must rehydrate legacy rows from catalog.
 * Prices are positive native CNY cents, quantities are positive safe integers, and
 * a key must have one consistent nonblank label. Row references/order are preserved.
 */
export function groupMibanCartItems<T extends {
  checkoutGroupKey: string; groupLabel: string; priceCny: number; quantity: number;
}>(items: T[]): MibanCartCheckoutGroup<T>[] {
  if (!Array.isArray(items)) throw new Error("购物车商品无效");
  const groups = new Map<string, { group: MibanCartCheckoutGroup<T>; cents: bigint; count: bigint }>();
  for (const item of items) {
    if (!item || typeof item.checkoutGroupKey !== "string" ||
        !item.checkoutGroupKey || item.checkoutGroupKey !== item.checkoutGroupKey.trim() ||
        /[\u0000-\u001f\u007f]/.test(item.checkoutGroupKey)) throw new Error("购物车分组无效，请重新加入商品");
    if (typeof item.groupLabel !== "string" || !item.groupLabel.trim()) throw new Error("购物车分组名称无效");
    if (typeof item.priceCny !== "number") throw new Error("购物车商品价格无效");
    const price = exactUnits(item.priceCny);
    if (price <= 0n || price % CENT !== 0n) throw new Error("购物车商品价格必须为正数且精确到分");
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new Error("购物车商品数量无效");
    let entry = groups.get(item.checkoutGroupKey);
    if (!entry) {
      entry = { group: { checkoutGroupKey: item.checkoutGroupKey, groupLabel: item.groupLabel,
        items: [], totalCny: 0, itemCount: 0 }, cents: 0n, count: 0n };
      groups.set(item.checkoutGroupKey, entry);
    }
    if (entry.group.groupLabel !== item.groupLabel) throw new Error("购物车分组名称不一致，请重新加入商品");
    entry.cents += price / CENT * BigInt(item.quantity);
    entry.count += BigInt(item.quantity);
    if (entry.cents > BigInt(Number.MAX_SAFE_INTEGER) || entry.count > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("购物车金额或数量超出安全范围");
    }
    entry.group.items.push(item);
  }
  return [...groups.values()].map(({ group, cents, count }) => {
    // Conversion only at the mandated number-valued UI boundary, after exact math.
    const totalCny = Number(paymentUnitsText(cents * CENT));
    if (exactUnits(totalCny) !== cents * CENT) throw new Error("购物车总价超出数字展示安全范围");
    return { ...group, totalCny, itemCount: Number(count) };
  });
}

type Pool = { deduction: MibanPaymentDeduction; amount: bigint; price: bigint; step: bigint };
type Allocation = bigint[][];
const abs = (value: bigint) => value < 0n ? -value : value;
const valueOf = (pool: Pool, amount: bigint) => amount * pool.price / PAYMENT_SCALE;

function validAllocation(allocation: Allocation, pools: Pool[], totals: bigint[]): boolean {
  if (pools.some((pool, j) => allocation.reduce((sum, row) => sum + row[j], 0n) !== pool.amount)) return false;
  for (let i = 0; i < totals.length; i++) {
    let value = 0n;
    let numerator = 0n;
    for (let j = 0; j < pools.length; j++) {
      const amount = allocation[i][j];
      if (amount < 0n || amount % pools[j].step !== 0n) return false;
      value += valueOf(pools[j], amount);
      numerator += amount * pools[j].price;
    }
    // Check both persisted 18-place values and exact untruncated original-coin value.
    // Unified debit covers the total; a group's native quantization may be either
    // side of its merchandise price, but NEVER a whole cent or more in either direction.
    if (abs(value - totals[i]) >= CENT ||
        abs(numerator - totals[i] * PAYMENT_SCALE) >= CENT * PAYMENT_SCALE) return false;
  }
  return true;
}

/** Hamilton apportionment in native atom counts; stable group index breaks ties. */
function weightedAllocation(pools: Pool[], totals: bigint[]): Allocation {
  const sum = totals.reduce((value, total) => value + total, 0n);
  const allocation = totals.map(() => pools.map(() => 0n));
  for (let j = 0; j < pools.length; j++) {
    const atoms = pools[j].amount / pools[j].step;
    const fractions = totals.map((total, index) => {
      const numerator = atoms * total;
      allocation[index][j] = numerator / sum * pools[j].step;
      return { index, remainder: numerator % sum };
    });
    let left = atoms - allocation.reduce((value, row) => value + row[j] / pools[j].step, 0n);
    fractions.sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
    // At most groups.length - 1 atoms remain, independent of the size of the debit.
    for (const { index } of fractions) {
      if (left === 0n) break;
      allocation[index][j] += pools[j].step;
      left -= 1n;
    }
  }
  return allocation;
}

/** Alternate exact-safe candidate for rare accumulated multi-coin rounding errors. */
function sequentialAllocation(pools: Pool[], totals: bigint[], order: number[]): Allocation {
  const allocation = totals.map(() => pools.map(() => 0n));
  const available = pools.map(pool => pool.amount);
  for (let i = 0; i < totals.length - 1; i++) {
    let remaining = totals[i];
    for (const j of order) {
      if (remaining <= 0n) break;
      const pool = pools[j];
      const denominator = pool.price * pool.step;
      const needed = (remaining * PAYMENT_SCALE + denominator - 1n) / denominator * pool.step;
      const amount = needed < available[j] ? needed : available[j];
      allocation[i][j] = amount;
      available[j] -= amount;
      remaining -= valueOf(pool, amount);
    }
  }
  // Never a negative "last share"; all candidates including the last group verify.
  allocation[totals.length - 1] = available;
  return allocation;
}

/**
 * Split an ALREADY server-validated single debit by server-priced group totals.
 * No balance/freeze/signature access, repricing, currency substitution or extra debit.
 * Largest remainder apportions each real asset by merchandise-price weights, with
 * CNY2/USDT8/crypto18 strict native conservation. Original price snapshots are kept;
 * each cnyValue is honestly floor(its amount * its signed price) at 18 places.
 *
 * Approved unified-payment rounding rule: the overall debit must cover merchandise
 * and overpay by at most 0.01 CNY; each group's actual-value difference must be
 * strictly less than 0.01 CNY (may be negative by native quantization). Never ceil
 * each group then increase the user's debit. Refund each group's original quantities.
 * Reject extreme indivisible amounts if verified deterministic candidates fail.
 * A single group retains the original validated deductions unchanged, including the
 * existing service's inclusive overall 1-cent tolerance. This is not a revalidator
 * of quote authority, nor a general integer-program feasibility solver.
 */
export function splitMibanPaymentDeductionsByTotals(
  deductions: MibanPaymentDeduction[], totalsCny: Array<string | number>,
): MibanPaymentDeduction[][] {
  if (!Array.isArray(totalsCny) || totalsCny.length === 0) throw new Error("购物车订单总价无效");
  const totals = totalsCny.map(total => {
    const value = exactUnits(total);
    if (value <= 0n) throw new Error("购物车订单总价必须大于零");
    return value;
  });
  if (!Array.isArray(deductions)) throw new Error("购物车支付扣款无效");
  // Defensive invariant checks, not a replacement for server quote validation.
  const normalized = normalizeMibanPaymentAssets(deductions);
  const pools: Pool[] = deductions.map((deduction, index) => {
    if (deduction.assetCode !== normalized[index].assetCode ||
        typeof deduction.priceCny !== "string" || typeof deduction.priceUsdt !== "string" ||
        typeof deduction.cnyValue !== "string") throw new Error("购物车支付快照无效");
    const amount = exactUnits(deduction.amount);
    const price = exactUnits(deduction.priceCny);
    const value = amount * price / PAYMENT_SCALE;
    if (price <= 0n || exactUnits(deduction.priceUsdt) <= 0n || value <= 0n ||
        exactUnits(deduction.cnyValue) !== value) throw new Error("购物车支付快照无效");
    return { deduction, amount, price, step: 10n ** BigInt(18 - paymentAssetDecimals(deduction.assetCode)) };
  });
  const total = totals.reduce((sum, value) => sum + value, 0n);
  const originalValue = pools.reduce((sum, pool) => sum + valueOf(pool, pool.amount), 0n);
  const originalNumerator = pools.reduce((sum, pool) => sum + pool.amount * pool.price, 0n);
  if (originalValue < total) throw new Error("购物车支付金额不足");
  if (originalNumerator > (total + CENT) * PAYMENT_SCALE) throw new Error("购物车支付金额超过应付一分钱");
  if (totals.length === 1) return [deductions];
  let allocation = weightedAllocation(pools, totals);
  if (!validAllocation(allocation, pools, totals)) {
    const originalOrder = pools.map((_, index) => index);
    const precisionOrder = [...originalOrder].sort((a, b) => {
      const difference = pools[a].price * pools[a].step - pools[b].price * pools[b].step;
      return difference < 0n ? -1 : difference > 0n ? 1 : a - b;
    });
    let found = false;
    for (const order of [originalOrder, precisionOrder, [...precisionOrder].reverse(), [...originalOrder].reverse()]) {
      const candidate = sequentialAllocation(pools, totals, order);
      if (validAllocation(candidate, pools, totals)) { allocation = candidate; found = true; break; }
    }
    if (!found) throw new Error("原币最小记账单位无法安全分摊，各订单原价折算差必须小于一分钱；请分组支付");
  }
  return allocation.map(row => row.flatMap((amount, index) => amount === 0n ? [] : [{
    ...pools[index].deduction,
    amount: paymentUnitsText(amount),
    cnyValue: paymentUnitsText(valueOf(pools[index], amount)),
  }]));
}
