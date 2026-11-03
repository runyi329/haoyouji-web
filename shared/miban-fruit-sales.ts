/** 历史水果销量按颗数统计；不依赖当前目录、售价、库存或 SKU 上下架状态。 */
export type FruitSalesOrder = {
  ingredients?: unknown;
  recipeName?: string | null;
  status?: string | null;
  walletDeductCny?: number | string | null;
  walletDeductUsdt?: number | string | null;
  totalWeightJin?: number | string | null;
};

export type FruitPearSpec = {
  name: string;
  sub?: string | null;
  weightJin?: number | string | null;
};

export type FruitSalesSummary = {
  soldPieces: number;
  /** 只要已计入的颗数含估算值即为 true，不能再展示为精确累计。 */
  estimated: boolean;
  /** 已付款/履约但有相关行不能确定颗数的订单数；同一订单每种水果最多记一次。 */
  unresolvedOrders: number;
};

export type FruitSales = Record<
  "guangfeng-majiayou" | "tiangui-pear",
  FruitSalesSummary
>;

type Line = Record<string, unknown>;
type Pieces = { value: number; estimated: boolean };
type FruitKey = keyof FruitSales;

// 历史 SKU 的固定包装颗数，故意不导入当前商品目录或检查 active。
const HISTORICAL_MAJIAYOU_PIECES: Readonly<Record<string, number>> = {
  "majiayou-large-6": 6,
  "majiayou-small-4": 4,
  "majiayou-medium-2": 2,
  "majiayou-small-2": 2,
  "majiayou-large-2": 2,
};
const FULFILLED_STATUSES = new Set([
  "confirmed",
  "packing",
  "shipped",
  "delivered",
]);

function positiveNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function positiveInteger(value: unknown): number | null {
  const number = positiveNumber(value);
  return number !== null && Number.isSafeInteger(number) ? number : null;
}

function isCountableOrder(order: FruitSalesOrder): boolean {
  const status = String(order.status ?? "").trim().toLowerCase();
  if (status === "cancelled" || status === "canceled") return false;
  return (
    FULFILLED_STATUSES.has(status) ||
    positiveNumber(order.walletDeductCny) !== null ||
    positiveNumber(order.walletDeductUsdt) !== null
  );
}

function readLines(ingredients: unknown): Line[] | null {
  try {
    const parsed =
      typeof ingredients === "string" ? JSON.parse(ingredients) : ingredients;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (line): line is Line =>
        line !== null && typeof line === "object" && !Array.isArray(line)
    );
  } catch {
    return null;
  }
}

/** undefined 表示没有颗数文字，null 表示颗数表达有冲突/范围，不能回退猜测。 */
function piecesFromText(text: string): Pieces | null | undefined {
  const matches = [
    ...text.matchAll(
      /(?:大约|约莫|大概|估计|约|近|~|≈)?\s*(\d+)\s*(?:颗|个|枚)(?:\s*(?:左右|上下))?/g
    ),
  ];
  if (matches.length === 0) return undefined;
  let result: Pieces | undefined;
  for (const match of matches) {
    const prefix = text.slice(0, match.index).trimEnd();
    const value = positiveInteger(match[1]);
    // 防止把「10–12个」「1.5个」的尾部误当成明确的 12/5 个。
    if (/[\d.\-–—至到]$/.test(prefix) || value === null) return null;
    const estimated = /大约|约莫|大概|估计|约|近|~|≈|左右|上下/.test(
      match[0]
    );
    if (result && result.value !== value) return null;
    result = { value, estimated: estimated || result?.estimated === true };
  }
  return result;
}

function snapshotPieces(line: Line): Pieces | null | undefined {
  for (const key of ["fruitCountPerUnit", "piecesPerUnit"]) {
    if (line[key] !== undefined && line[key] !== null) {
      const value = positiveInteger(line[key]);
      return value === null
        ? null
        : { value, estimated: line.estimated === true };
    }
  }
  return piecesFromText(
    [line.skuName, line.specName, line.netContentText]
      .filter((text): text is string => typeof text === "string")
      .join(" · ")
  );
}

function majiayouPieces(line: Line): Pieces | null {
  const snapshot = snapshotPieces(line);
  if (snapshot !== undefined) return snapshot;
  const skuId = typeof line.skuId === "string" ? line.skuId : "";
  const value = Object.prototype.hasOwnProperty.call(
    HISTORICAL_MAJIAYOU_PIECES,
    skuId
  )
    ? HISTORICAL_MAJIAYOU_PIECES[skuId]
    : undefined;
  return value === undefined ? null : { value, estimated: false };
}

function parsePearRecipe(recipeName: string): {
  specName: string;
  quantity: number;
} | null {
  const match = recipeName.match(/^天桂梨\s*[·•]\s*(.+)$/);
  if (!match) return null;
  let specName = match[1].trim();
  const multiplier = specName.match(/\s*[xX×]\s*(\d+)\s*$/);
  const quantity = multiplier ? positiveInteger(multiplier[1]) : 1;
  if (quantity === null) return null;
  if (multiplier) specName = specName.slice(0, multiplier.index).trim();
  // 明显存在但不合法的箱数不能默认为一箱。
  if (!specName || /[xX×]\s*[-+\d.]*\s*$/.test(specName)) return null;
  return { specName, quantity };
}

function normalizeSpecName(name: string): string {
  return name.trim().replace(/\s+/g, "");
}

function legacyPearPieces(
  line: Line,
  recipe: { specName: string; quantity: number },
  order: FruitSalesOrder,
  lines: Line[],
  pearSpecs: readonly FruitPearSpec[]
): Pieces | null {
  // 历史标题直接记录 12枚等明确颗数时，无需依赖可能已修改的规格目录。
  const explicit = piecesFromText(recipe.specName);
  if (explicit !== undefined) return explicit;
  const specs = pearSpecs.filter(
    spec => normalizeSpecName(spec.name) === normalizeSpecName(recipe.specName)
  );
  if (specs.length !== 1) return null;
  const spec = specs[0];
  const historicalWeight =
    positiveNumber(line.weightJin) ??
    (lines.length === 1 ? positiveNumber(order.totalWeightJin) : null);
  const specWeight = positiveNumber(spec.weightJin);
  // 仅按完整规格名匹配；有历史重量时再核对一致性，不按重量寻找规格/反推果数。
  if (
    historicalWeight !== null &&
    (specWeight === null ||
      Math.abs(historicalWeight - specWeight * recipe.quantity) > 0.000001)
  ) {
    return null;
  }
  return piecesFromText(spec.sub ?? "") ?? null;
}

/**
 * 汇总水果订单颗数。quantity 是对应商品行的箱/盒数，不是订单总数量。
 * 旧天桂梨仅用完整历史规格名和标题尾部 xN 匹配；不按金额或单果重量猜数。
 * unresolvedOrders 不包含取消/未付款订单，且不影响同单其他可解析行的销量。
 */
export function aggregateFruitSales(
  orders: readonly FruitSalesOrder[],
  pearSpecs: readonly FruitPearSpec[] = []
): FruitSales {
  const result: FruitSales = {
    "guangfeng-majiayou": {
      soldPieces: 0,
      estimated: false,
      unresolvedOrders: 0,
    },
    "tiangui-pear": { soldPieces: 0, estimated: false, unresolvedOrders: 0 },
  };

  for (const order of orders) {
    if (!isCountableOrder(order)) continue;
    const unresolved = new Set<FruitKey>();
    const lines = readLines(order.ingredients);
    const recipeName = order.recipeName?.trim() ?? "";
    const pearRecipe = parsePearRecipe(recipeName);
    const pearTitle = /^天桂梨(?:\s*[·•]|$)/.test(recipeName);
    const pearLines = (lines ?? []).filter(
      line =>
        line.productKey === "tiangui-pear" ||
        ((line.productKey === undefined || line.productKey === null) &&
          String(line.riceId) === "47" &&
          line.name === "天桂梨")
    );
    const add = (key: FruitKey, count: Pieces | null, quantity: unknown) => {
      const units = positiveInteger(quantity);
      const pieces = count && units !== null ? count.value * units : null;
      if (pieces === null || !Number.isSafeInteger(pieces)) {
        unresolved.add(key);
        return;
      }
      result[key].soldPieces += pieces;
      result[key].estimated ||= count?.estimated === true;
    };

    if (!lines || lines.length === 0) {
      if (recipeName.includes("马家柚")) unresolved.add("guangfeng-majiayou");
    }
    if (pearTitle && pearLines.length === 0) unresolved.add("tiangui-pear");
    for (const line of lines ?? []) {
      if (line.productKey === "guangfeng-majiayou") {
        add("guangfeng-majiayou", majiayouPieces(line), line.quantity);
      }
    }
    for (const line of pearLines) {
      if (line.productKey === "tiangui-pear" && line.quantity != null) {
        add("tiangui-pear", snapshotPieces(line) ?? null, line.quantity);
      } else if (pearRecipe && pearLines.length === 1) {
        add(
          "tiangui-pear",
          legacyPearPieces(line, pearRecipe, order, lines!, pearSpecs),
          pearRecipe.quantity
        );
      } else {
        unresolved.add("tiangui-pear");
      }
    }
    for (const key of unresolved) result[key].unresolvedOrders += 1;
  }
  return result;
}
