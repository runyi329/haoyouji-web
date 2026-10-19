import { TRPCError } from "@trpc/server";
import { getDbConnection, getDbTransactionConnection } from "./db";
import * as dbLedger from "./db-ledger";

export const LEDGER_52_T0_JOURNAL_ID = 52;
/** OKX VIP 2 合约：挂单 0.0150%，市价吃单 0.0360%（2026-10-04由管理员确认）。 */
export const OKX_VIP2_TAKER_FEE_RATE = "0.00036";
const POSITION_ARCHIVE_STEP = 10;

export type T0JournalAction = "openLong" | "closeLong" | "openShort" | "closeShort";
const T0_JOURNAL_ACTIONS = new Set<T0JournalAction>(["openLong", "closeLong", "openShort", "closeShort"]);
export type T0JournalInstrumentType = "spot" | "contract" | "option" | "grid";
const T0_JOURNAL_INSTRUMENT_TYPES = new Set<T0JournalInstrumentType>(["spot", "contract", "option", "grid"]);
export type T0JournalOptionDirection = "long_call" | "long_put" | "short_call" | "short_put";
export type T0JournalOptionPremiumCurrency = "USDT" | "ETH";
export type T0JournalGridDirection = "long" | "short";
const T0_JOURNAL_OPTION_DIRECTIONS = new Set<T0JournalOptionDirection>(["long_call", "long_put", "short_call", "short_put"]);
const T0_JOURNAL_OPTION_PREMIUM_CURRENCIES = new Set<T0JournalOptionPremiumCurrency>(["USDT", "ETH"]);
const T0_JOURNAL_GRID_DIRECTIONS = new Set<T0JournalGridDirection>(["long", "short"]);
const ETH_QUANTITY_RESTORE_PATTERN = /^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/;
const T0_DECIMAL_INPUT_PATTERN = /^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/;
const T0_OPTION_EXPIRY_FEE_RATE = Number(OKX_VIP2_TAKER_FEE_RATE);
const DERIBIT_OPTION_DELIVERY_URL = "https://www.deribit.com/api/v2/public/get_last_settlements_by_currency";
const DERIBIT_MONTH_CODES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export type T0JournalActor = {
  id: number;
  role?: string | null;
  isViewingAs?: boolean;
};

export type T0JournalReadScope =
  | { mode: "admin"; journalOwnerUserId: number }
  | { mode: "member"; relatedUserId: number };

export type SaveT0JournalEntryInput = {
  actorUserId: number;
  accountId?: number;
  accountName?: string;
  /** 管理员可在开单后补充；未设置时按未关联订单归集。 */
  relatedUserId?: number;
  /** 同一关联用户下的独立专项款；开仓关联用户时必须指定，旧流水保留为空。 */
  relatedFundId?: number;
  relatedFundName?: string;
  symbol: "ETH";
  action: T0JournalAction;
  /** 仅开仓主单可锁定，供管理员逐笔报价黑金标识使用。 */
  instrumentType?: T0JournalInstrumentType;
  isLocked?: boolean;
  /** 仅开仓主单：管理员按反向多空与相反损益展示，成员仍保持原始订单视图。 */
  isCounterparty?: boolean;
  /** 仅管理员开仓可设为挂单；挂单不参与实际仓位、FIFO、手续费及收益核算。 */
  isPending?: boolean;
  /** 仅现货/合约开仓可设止盈；挂单可先预设，必须实际成交后才会触发。 */
  takeProfitEnabled?: boolean;
  /** 兼容旧客户端的单段止盈参数；新客户端统一传多段计划。 */
  takeProfitPrice?: string;
  takeProfitQuantity?: string;
  /** 同一开仓可拆成多段止盈；所有未触发计划之和不得超过剩余仓位。 */
  takeProfitPlans?: Array<{ price: string; quantity: string }>;
  /** 期权开仓参数：标的强制为 ETH，price 存行权价。 */
  optionDirection?: T0JournalOptionDirection;
  optionExpiryDate?: string;
  optionPremium?: string;
  optionPremiumCurrency?: T0JournalOptionPremiumCurrency;
  /** 网格开仓参数仅作策略记录，不触发自动网格成交。 */
  gridDirection?: T0JournalGridDirection;
  gridRangeMin?: string;
  gridRangeMax?: string;
  gridLeverage?: string;
  gridCount?: number;
  quantity: string;
  price: string;
  targetPrice?: string;
  note?: string;
  /**
   * 正向平仓时由管理员优先从本单净收益中分配的共享收益。
   * 本次共享后剩余净收益才会按该订单既有分佣快照结算。
   */
  sharedIncomeAllocations?: Array<{ recipientUserId: number; amount: string }>;
  clientRequestId: string;
};

/**
 * 收益分配规则绑定专项项目，只作用于未来新开仓：修改比例时保留旧规则，并由订单快照持续引用，
 * 因此历史开平仓绝不会被新比例回溯改写。
 */
export type T0JournalProfitShareRule = {
  id: number;
  relatedFundId: number;
  relatedFundName: string;
  sourceUserId: number;
  sourceUserName: string;
  beneficiaryUserId: number;
  beneficiaryUserName: string;
  percentage: number;
  createdAt: string;
};

/** 开仓或平仓的不可变收益分配快照；平仓可按 FIFO 拆到多个开仓来源。 */
export type T0JournalProfitShareSnapshot = {
  entryId: string;
  openingEntryId: string;
  relatedFundId: number;
  relatedFundName?: string;
  sourceUserId: number;
  beneficiaryUserId: number;
  percentage: number;
  matchedQuantity: number;
  sourceUserName?: string;
  beneficiaryUserName?: string;
};


/** 管理员记录、关联用户同步查看的投入/提现资金流水；不参与任何订单收益计算。 */
export type T0JournalPayoutDirection = "withdrawal" | "deposit";
export type T0JournalPayoutLog = {
  id: string;
  relatedUserId: number;
  relatedUserName: string;
  occurredOn: string;
  direction: T0JournalPayoutDirection;
  amount: number;
  note?: string;
  createdAt: string;
};

let tablesReady: Promise<void> | null = null;

function asRows(result: unknown): any[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as any[];
  return Array.isArray(result) ? result as any[] : [];
}

function normalizeInstrumentType(value: unknown, required = false): T0JournalInstrumentType | undefined {
  const normalized = String(value || "").trim() as T0JournalInstrumentType;
  if (!normalized) {
    if (required) throw new TRPCError({ code: "BAD_REQUEST", message: "请选择现货、合约、期权或网格" });
    return undefined;
  }
  if (!T0_JOURNAL_INSTRUMENT_TYPES.has(normalized)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "订单类型无效，请重新选择" });
  }
  return normalized;
}

type T0TakeProfitPlanInput = { price: string; quantity: string };
type ResolvedT0TakeProfitPlan = { price: string; quantity: string };

/**
 * 同一开仓可配置多个止盈档位。旧客户端仍可提交单段字段，服务端将其转换为一条计划。
 * 数量使用厘化的 ETH 精度相加，避免浮点误差突破本笔或剩余仓位上限。
 */
function resolveTakeProfitParameters(input: {
  action: T0JournalAction;
  instrumentType?: T0JournalInstrumentType;
  quantity: string;
  price: string;
  takeProfitEnabled?: boolean;
  takeProfitPrice?: string;
  takeProfitQuantity?: string;
  takeProfitPlans?: T0TakeProfitPlanInput[];
}, fallback?: any, maximumQuantity?: string) {
  const legacyEnabled = input.takeProfitEnabled === undefined
    ? Boolean(toNumber(fallback?.take_profit_enabled ?? fallback?.takeProfitEnabled))
    : input.takeProfitEnabled === true;
  const rawPlans = input.takeProfitPlans !== undefined
    ? input.takeProfitPlans
    : legacyEnabled
      ? [{
        price: String(input.takeProfitPrice ?? fallback?.take_profit_price ?? fallback?.takeProfitPrice ?? "").trim(),
        quantity: String(input.takeProfitQuantity ?? fallback?.take_profit_quantity ?? fallback?.takeProfitQuantity ?? "").trim(),
      }]
      : [];
  if (rawPlans.length === 0) return { enabled: false, price: null as string | null, quantity: null as string | null, plans: [] as ResolvedT0TakeProfitPlan[] };
  if (rawPlans.length > 20) throw new TRPCError({ code: "BAD_REQUEST", message: "单笔订单最多可设置20段止盈" });
  if (!isOpeningAction(input.action) || (input.instrumentType !== "spot" && input.instrumentType !== "contract")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "止盈仅支持现货和合约开仓" });
  }
  const entryPrice = Number(input.price);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请输入有效的开仓价格后再设置止盈" });
  }
  const normalizedMaximumQuantity = requireValidEthQuantity(maximumQuantity ?? input.quantity);
  const maximumCents = quantityToCents(normalizedMaximumQuantity);
  let plannedCents = 0;
  const plans: ResolvedT0TakeProfitPlan[] = rawPlans.map((plan, index) => {
    const takeProfitPrice = String(plan?.price ?? "").trim();
    if (!T0_DECIMAL_INPUT_PATTERN.test(takeProfitPrice) || Number(takeProfitPrice) <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `第${index + 1}段止盈价格无效` });
    }
    const quantity = requireValidEthQuantity(String(plan?.quantity ?? "").trim());
    const targetPrice = Number(takeProfitPrice);
    if (input.action === "openLong" && targetPrice <= entryPrice) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `第${index + 1}段多单止盈价须高于开仓价` });
    }
    if (input.action === "openShort" && targetPrice >= entryPrice) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `第${index + 1}段空单止盈价须低于开仓价` });
    }
    plannedCents += quantityToCents(quantity);
    return { price: takeProfitPrice, quantity };
  });
  if (plannedCents > maximumCents) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `各段止盈数量合计不得超过本笔可用数量 ${normalizedMaximumQuantity} ETH` });
  }
  return { enabled: true, price: plans[0].price, quantity: plans[0].quantity, plans };
}

/**
 * 统一 ETH 永续价达到预设方向时触发：多单向上、空单向下。
 * rangeHigh / rangeLow 用于 REST 兜底期间的永续标记价区间，避免两次轮询之间跨价后回落而漏单。
 */
export function shouldTriggerLedger52T0TakeProfit(input: {
  action: T0JournalAction;
  markPrice: number;
  takeProfitPrice: number;
  rangeHigh?: number;
  rangeLow?: number;
}) {
  if (!Number.isFinite(input.markPrice) || input.markPrice <= 0 || !Number.isFinite(input.takeProfitPrice) || input.takeProfitPrice <= 0) return false;
  const rangeHigh = Number.isFinite(input.rangeHigh) && Number(input.rangeHigh) > 0
    ? Math.max(input.markPrice, Number(input.rangeHigh))
    : input.markPrice;
  const rangeLow = Number.isFinite(input.rangeLow) && Number(input.rangeLow) > 0
    ? Math.min(input.markPrice, Number(input.rangeLow))
    : input.markPrice;
  return input.action === "openLong"
    ? rangeHigh >= input.takeProfitPrice
    : input.action === "openShort"
      ? rangeLow <= input.takeProfitPrice
      : false;
}

function normalizeOptionDate(value: unknown): string {
  const normalized = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请填写有效的期权到期日" });
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请填写有效的期权到期日" });
  }
  return normalized;
}

function mapOptionDate(value: unknown): string | undefined {
  if (!value) return undefined;
  const normalized = String(value).trim();
  // DATE 列在生产 MySQL 驱动中可能先转换为 UTC Date（北京时间零点会成为前一日 16:00Z）。
  // 期权合约到期日是北京时间的日历日：只有原始日期字符串可直接保留，其他 Date/ISO 值必须按北京时间取日。
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  const parsed = value instanceof Date ? value : new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const dateParts = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

function resolveOptionParameters(input: {
  optionDirection?: unknown;
  optionExpiryDate?: unknown;
  optionPremium?: unknown;
  optionPremiumCurrency?: unknown;
  /** 期权开仓的 price 固化为行权价；直接调用服务层时也必须单独校验。 */
  price?: unknown;
}, fallback?: any): {
  direction: T0JournalOptionDirection;
  expiryDate: string;
  premium: string;
  premiumCurrency: T0JournalOptionPremiumCurrency;
} {
  const direction = String(input.optionDirection ?? fallback?.option_direction ?? fallback?.optionDirection ?? "").trim() as T0JournalOptionDirection;
  if (!T0_JOURNAL_OPTION_DIRECTIONS.has(direction)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请选择期权方向" });
  }
  const expiryDate = normalizeOptionDate(input.optionExpiryDate ?? fallback?.option_expiry_date ?? fallback?.optionExpiryDate);
  const strikePrice = String(input.price ?? fallback?.price ?? "").trim();
  if (!T0_DECIMAL_INPUT_PATTERN.test(strikePrice) || Number(strikePrice) <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请选择有效的期权行权价" });
  }
  const premium = String(input.optionPremium ?? fallback?.option_premium ?? fallback?.optionPremium ?? "").trim();
  if (!T0_DECIMAL_INPUT_PATTERN.test(premium) || Number(premium) <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请输入大于 0 的权利金" });
  }
  const premiumCurrency = String(input.optionPremiumCurrency ?? fallback?.option_premium_currency ?? fallback?.optionPremiumCurrency ?? "").trim() as T0JournalOptionPremiumCurrency;
  if (!T0_JOURNAL_OPTION_PREMIUM_CURRENCIES.has(premiumCurrency)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请选择权利金计价币种" });
  }
  return { direction, expiryDate, premium, premiumCurrency };
}

/** 网格策略仅记录人工输入的参数；T形交割表价格由方向对应的区间边界自动决定。 */
function resolveGridParameters(input: {
  gridDirection?: unknown;
  gridRangeMin?: unknown;
  gridRangeMax?: unknown;
  gridLeverage?: unknown;
  gridCount?: unknown;
}, fallback?: any): {
  direction: T0JournalGridDirection;
  rangeMin: string;
  rangeMax: string;
  leverage: string;
  count: number;
} {
  const direction = String(input.gridDirection ?? fallback?.grid_direction ?? fallback?.gridDirection ?? "").trim() as T0JournalGridDirection;
  if (!T0_JOURNAL_GRID_DIRECTIONS.has(direction)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请选择做多或做空网格" });
  }
  const rangeMin = String(input.gridRangeMin ?? fallback?.grid_range_min ?? fallback?.gridRangeMin ?? "").trim();
  const rangeMax = String(input.gridRangeMax ?? fallback?.grid_range_max ?? fallback?.gridRangeMax ?? "").trim();
  if (!T0_DECIMAL_INPUT_PATTERN.test(rangeMin) || Number(rangeMin) <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请输入大于 0 的网格下限" });
  }
  if (!T0_DECIMAL_INPUT_PATTERN.test(rangeMax) || Number(rangeMax) <= Number(rangeMin)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "网格上限必须大于下限" });
  }
  const leverage = String(input.gridLeverage ?? fallback?.grid_leverage ?? fallback?.gridLeverage ?? "").trim();
  if (!T0_DECIMAL_INPUT_PATTERN.test(leverage) || Number(leverage) <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请输入大于 0 的网格杠杆倍数" });
  }
  const count = Number(input.gridCount ?? fallback?.grid_count ?? fallback?.gridCount ?? 0);
  if (!Number.isSafeInteger(count) || count < 1 || count > 10000) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "网格数量须为 1 至 10000 的整数" });
  }
  return { direction, rangeMin, rangeMax, leverage, count };
}

function isoTime(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

/** 将 JSON 审计快照中的 ISO 时间还原为 MySQL DATETIME(3) 可接受的 UTC 字符串。 */
function mysqlDateTime(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  const resolved = Number.isNaN(date.getTime()) ? new Date() : date;
  return resolved.toISOString().slice(0, 23).replace("T", " ");
}

/** 系统自动动作在备注中以北京时间保留到秒的可读审计时点。 */
function formatBeijingSystemTime(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  const resolved = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(resolved);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

/** 备注字段上限 500 字符；保留用户原备注的同时，绝不截断末尾系统审计事件。 */
function appendSystemSettlementNote(existingNote: unknown, systemNote: string): string {
  const existing = String(existingNote ?? "").trim();
  if (!existing) return systemNote.slice(0, 500);
  const availableExistingLength = Math.max(0, 500 - systemNote.length - 2);
  if (existing.length <= availableExistingLength) return `${existing}\n${systemNote}`;
  return `${existing.slice(0, Math.max(0, availableExistingLength - 1)).trimEnd()}…\n${systemNote}`;
}

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/** 输入可为整数或一/两位小数，入账统一使用两位小数字符串，避免浮点补零。 */
function normalizeEthQuantity(value: string): string {
  const [integerPart, fractionalPart = ""] = String(value).trim().split(".");
  return `${integerPart}.${fractionalPart.padEnd(2, "0")}`;
}

/** 新建、编辑均须由服务端再次确认数量有效，避免绕过路由校验写入不完整期权订单。 */
function requireValidEthQuantity(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!ETH_QUANTITY_RESTORE_PATTERN.test(raw) || Number(raw) <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请输入大于 0 的 ETH 数量（整数最多4位，小数最多2位）" });
  }
  return normalizeEthQuantity(raw);
}

/**
 * 审计快照来自 MySQL DECIMAL 字段，常带 18 位零补位；恢复时仅接受超过两位部分均为零的数量，
 * 既兼容历史快照，也不会静默截断真实的超精度数量。
 */
function normalizeStoredEthQuantity(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const match = /^(0|[1-9]\d{0,3})(?:\.(\d+))?$/.exec(raw);
  if (!match) return null;
  const [, integerPart, fractionalPart = ""] = match;
  if (fractionalPart.length > 2 && /[1-9]/.test(fractionalPart.slice(2))) return null;
  return `${integerPart}.${fractionalPart.slice(0, 2).padEnd(2, "0")}`;
}

function actionSide(action: T0JournalAction): "long" | "short" {
  return action === "openLong" || action === "closeLong" ? "long" : "short";
}

function isOpeningAction(action: T0JournalAction): boolean {
  return action === "openLong" || action === "openShort";
}

/**
 * 期权的左右报价侧表示到期收益的涨跌方向，而非买入/卖出：
 * 左侧 = 买入看涨、卖出看跌；右侧 = 买入看跌、卖出看涨。
 */
function optionOpeningActionForDirection(direction: T0JournalOptionDirection): Extract<T0JournalAction, "openLong" | "openShort"> {
  return direction === "long_call" || direction === "short_put" ? "openLong" : "openShort";
}

/**
 * 不受前端点击价格格影响，始终按实际成交价归入十美元档：
 * 多仓向上归档（2701 → 2710），空仓向下归档（2701 → 2700）。
 */
function archivePriceForAction(action: T0JournalAction, value: unknown): number {
  const numeric = toNumber(value);
  if (numeric <= 0) return 0;
  const scaled = numeric / POSITION_ARCHIVE_STEP;
  const archive = actionSide(action) === "long"
    ? Math.ceil(scaled - 1e-9)
    : Math.floor(scaled + 1e-9);
  return Number((archive * POSITION_ARCHIVE_STEP).toFixed(8));
}

function archivedTargetPrice(action: T0JournalAction, targetPrice: unknown, fallbackPrice?: unknown): number {
  const target = toNumber(targetPrice);
  return archivePriceForAction(action, target > 0 ? target : fallbackPrice);
}

function quantityToCents(value: unknown): number {
  const normalized = normalizeEthQuantity(String(value));
  const [integerPart = "0", fractionalPart = "00"] = normalized.split(".");
  return Number(integerPart) * 100 + Number(fractionalPart.slice(0, 2).padEnd(2, "0"));
}

function priceKey(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  return numeric.toFixed(8);
}

function relatedUserKey(value: unknown): string {
  const userId = toNumber(value);
  return userId > 0 ? String(userId) : "legacy-unlinked";
}

function relatedFundKey(value: unknown): string {
  const fundId = toNumber(value);
  return fundId > 0 ? String(fundId) : "legacy-unclassified";
}

function calculateAvailableCloseCents(rows: any[], action: T0JournalAction, targetPrice: string, relatedUserId: number, relatedFundId: number): number {
  const balances = new Map<string, number>();
  for (const row of rows) {
    // 未成交挂单尚未形成实际仓位，不可被平仓、编辑依赖校验或收益分配匹配使用。
    if (String(row.execution_status ?? row.executionStatus ?? "filled") !== "filled") continue;
    const rowAction = String(row.action) as T0JournalAction;
    const side = actionSide(rowAction);
    const userKey = relatedUserKey(row.related_user_id);
    const fundKey = relatedFundKey(row.related_fund_id);
    if (isOpeningAction(rowAction)) {
      // 用实际开仓成交价重算，以自动兼容旧版按多空方向写入的归档档位。
      const archivePrice = archivePriceForAction(rowAction, row.price);
      const key = `${side}:${priceKey(archivePrice)}:${userKey}:${fundKey}`;
      balances.set(key, (balances.get(key) || 0) + quantityToCents(row.quantity));
      continue;
    }
    if (row.target_price === null || row.target_price === undefined) continue;
    const archivePrice = archivedTargetPrice(rowAction, row.target_price);
    const key = `${side}:${priceKey(archivePrice)}:${userKey}:${fundKey}`;
    balances.set(key, Math.max(0, (balances.get(key) || 0) - quantityToCents(row.quantity)));
  }
  const archivePrice = archivedTargetPrice(action, targetPrice);
  return balances.get(`${actionSide(action)}:${priceKey(archivePrice)}:${relatedUserKey(relatedUserId)}:${relatedFundKey(relatedFundId)}`) || 0;
}

/**
 * 删除或编辑开仓前，按与平仓可用量一致的 FIFO 口径判断该主单是否真的被后续平仓消耗。
 * 不能仅因同一十美元档存在历史平仓就拒绝：平仓可能早于该开仓，或已由更早的主单承接。
 */
function openingDependentCloseQuantityCents(rows: any[], openingEntryId: number, directlyLinkedClosingEntryIds: ReadonlySet<number> = new Set()): number {
  const opening = rows.find((row) => Number(row.id) === openingEntryId);
  if (!opening) return 0;

  const openingAction = String(opening.action) as T0JournalAction;
  if (!isOpeningAction(openingAction)) return 0;

  const closingAction: T0JournalAction = actionSide(openingAction) === "long" ? "closeLong" : "closeShort";
  const archivePrice = archivePriceForAction(openingAction, opening.price);
  const archiveKey = priceKey(archivePrice);
  const openingQueue: Array<{ entryId: number; remainingCents: number }> = [];
  let dependentCloseCents = 0;

  for (const row of rows) {
    const rowAction = String(row.action) as T0JournalAction;
    if (rowAction === openingAction) {
      if (priceKey(archivePriceForAction(rowAction, row.price)) !== archiveKey) continue;
      openingQueue.push({ entryId: Number(row.id), remainingCents: quantityToCents(row.quantity) });
      continue;
    }
    if (rowAction !== closingAction || row.target_price === null || row.target_price === undefined) continue;
    // 已由止盈计划外键锁定归属的平仓，不可再让通用 FIFO 二次分配。
    if (directlyLinkedClosingEntryIds.has(toNumber(row.id))) continue;
    if (priceKey(archivedTargetPrice(rowAction, row.target_price, row.price)) !== archiveKey) continue;

    let remainingCloseCents = quantityToCents(row.quantity);
    for (const queuedOpening of openingQueue) {
      if (remainingCloseCents <= 0) break;
      if (queuedOpening.remainingCents <= 0) continue;
      const allocatedCents = Math.min(queuedOpening.remainingCents, remainingCloseCents);
      queuedOpening.remainingCents -= allocatedCents;
      remainingCloseCents -= allocatedCents;
      if (queuedOpening.entryId === openingEntryId && allocatedCents > 0) dependentCloseCents += allocatedCents;
    }
  }

  return dependentCloseCents;
}

function mapAccount(row: any) {
  return {
    id: Number(row.id),
    name: String(row.name || ""),
    lastUsedAt: row.last_used_at ? isoTime(row.last_used_at) : null,
    createdAt: isoTime(row.created_at),
  };
}

function mapRelatedUser(row: any) {
  const id = toNumber(row.related_user_id ?? row.id);
  return {
    id,
    name: String(row.name || row.username || `用户#${id}`),
    username: row.username ? String(row.username) : undefined,
    avatar: row.avatar ? String(row.avatar) : undefined,
    lastUsedAt: row.last_used_at ? isoTime(row.last_used_at) : null,
  };
}

function mapRelatedFund(row: any) {
  const id = toNumber(row.related_fund_id ?? row.id);
  const relatedUserId = toNumber(row.related_user_id);
  return {
    id,
    relatedUserId: relatedUserId > 0 ? relatedUserId : undefined,
    name: String(row.name || "未命名专项款"),
    lastUsedAt: row.last_used_at ? isoTime(row.last_used_at) : null,
  };
}

function mapEntry(row: any) {
  const relatedUserId = toNumber(row.related_user_id ?? row.relatedUserId);
  const relatedFundId = toNumber(row.related_fund_id ?? row.relatedFundId);
  return {
    id: String(row.id),
    accountId: Number(row.account_id),
    accountName: String(row.account_name || ""),
    accountHidden: Boolean(toNumber(row.account_hidden ?? row.accountHidden)),
    relatedUserId: relatedUserId > 0 ? relatedUserId : undefined,
    relatedUserName: row.related_user_name ?? row.relatedUserName ?? undefined,
    relatedUsername: row.related_username ?? row.relatedUsername ?? undefined,
    relatedUserAvatar: row.related_user_avatar ?? row.relatedUserAvatar ?? undefined,
    relatedUserHidden: Boolean(toNumber(row.related_user_hidden ?? row.relatedUserHidden)),
    relatedFundId: relatedFundId > 0 ? relatedFundId : undefined,
    relatedFundName: row.related_fund_name ?? row.relatedFundName ?? undefined,
    relatedFundHidden: Boolean(toNumber(row.related_fund_hidden ?? row.relatedFundHidden)),
    symbol: String(row.symbol || "ETH"),
    action: String(row.action) as T0JournalAction,
    instrumentType: T0_JOURNAL_INSTRUMENT_TYPES.has(String(row.instrument_type ?? row.instrumentType ?? "") as T0JournalInstrumentType)
      ? String(row.instrument_type ?? row.instrumentType) as T0JournalInstrumentType
      : undefined,
    optionDirection: T0_JOURNAL_OPTION_DIRECTIONS.has(String(row.option_direction ?? row.optionDirection ?? "") as T0JournalOptionDirection)
      ? String(row.option_direction ?? row.optionDirection) as T0JournalOptionDirection
      : undefined,
    optionExpiryDate: mapOptionDate(row.option_expiry_date ?? row.optionExpiryDate),
    optionPremium: row.option_premium === null || row.option_premium === undefined
      ? undefined
      : toNumber(row.option_premium).toString(),
    optionPremiumCurrency: T0_JOURNAL_OPTION_PREMIUM_CURRENCIES.has(String(row.option_premium_currency ?? row.optionPremiumCurrency ?? "") as T0JournalOptionPremiumCurrency)
      ? String(row.option_premium_currency ?? row.optionPremiumCurrency) as T0JournalOptionPremiumCurrency
      : undefined,
    gridDirection: T0_JOURNAL_GRID_DIRECTIONS.has(String(row.grid_direction ?? row.gridDirection ?? "") as T0JournalGridDirection)
      ? String(row.grid_direction ?? row.gridDirection) as T0JournalGridDirection
      : undefined,
    gridRangeMin: row.grid_range_min === null || row.grid_range_min === undefined
      ? undefined
      : toNumber(row.grid_range_min),
    gridRangeMax: row.grid_range_max === null || row.grid_range_max === undefined
      ? undefined
      : toNumber(row.grid_range_max),
    gridLeverage: row.grid_leverage === null || row.grid_leverage === undefined
      ? undefined
      : toNumber(row.grid_leverage),
    gridCount: row.grid_count === null || row.grid_count === undefined
      ? undefined
      : toNumber(row.grid_count),
    /** 账本首屏直接复用共享缓存的有效期权标记价；前端仍会每三秒刷新为最新报价。 */
    optionMarkPrice: toNumber(row.option_mark_price) > 0 ? toNumber(row.option_mark_price) : undefined,
    /** 自动到期结算后保存的每 ETH 期权最终结算值（USDT）。 */
    optionSettlementPrice: row.option_settlement_price === null || row.option_settlement_price === undefined
      ? undefined
      : toNumber(row.option_settlement_price),
    /** Deribit 官方 delivery 使用的 ETH 指数交割价（USDT）。 */
    optionDeliveryPrice: row.option_delivery_price === null || row.option_delivery_price === undefined
      ? undefined
      : toNumber(row.option_delivery_price),
    optionSettledAt: row.option_settled_at ?? row.optionSettledAt ? isoTime(row.option_settled_at ?? row.optionSettledAt) : undefined,
    optionSettlementSource: row.option_settlement_source ? String(row.option_settlement_source) : undefined,
    isLocked: Boolean(toNumber(row.is_locked ?? row.isLocked)),
    isCounterparty: Boolean(toNumber(row.is_counterparty ?? row.isCounterparty)),
    isPending: String(row.execution_status ?? row.executionStatus ?? "filled") === "pending",
    filledAt: row.filled_at ?? row.filledAt ? isoTime(row.filled_at ?? row.filledAt) : undefined,
    filledPrice: row.filled_price === null || row.filled_price === undefined ? undefined : toNumber(row.filled_price),
    takeProfitEnabled: Array.isArray(row.take_profit_plans ?? row.takeProfitPlans)
      ? (row.take_profit_plans ?? row.takeProfitPlans).some((plan: any) => String(plan.status) === 'pending')
      : Boolean(toNumber(row.take_profit_enabled ?? row.takeProfitEnabled)),
    takeProfitPrice: Array.isArray(row.take_profit_plans ?? row.takeProfitPlans)
      ? (() => {
        const plan = (row.take_profit_plans ?? row.takeProfitPlans).find((item: any) => String(item.status) === 'pending');
        return plan ? toNumber(plan.trigger_price ?? plan.triggerPrice) : undefined;
      })()
      : row.take_profit_price === null || row.take_profit_price === undefined ? undefined : toNumber(row.take_profit_price),
    takeProfitQuantity: Array.isArray(row.take_profit_plans ?? row.takeProfitPlans)
      ? (() => {
        const plan = (row.take_profit_plans ?? row.takeProfitPlans).find((item: any) => String(item.status) === 'pending');
        return plan ? toNumber(plan.quantity) : undefined;
      })()
      : row.take_profit_quantity === null || row.take_profit_quantity === undefined ? undefined : toNumber(row.take_profit_quantity),
    takeProfitPlans: Array.isArray(row.take_profit_plans ?? row.takeProfitPlans)
      ? (row.take_profit_plans ?? row.takeProfitPlans).map((plan: any) => ({
        id: String(plan.id),
        triggerPrice: toNumber(plan.trigger_price ?? plan.triggerPrice),
        quantity: toNumber(plan.quantity),
        status: String(plan.status) === 'triggered' ? 'triggered' : String(plan.status) === 'cancelled' ? 'cancelled' : 'pending',
        triggeredAt: plan.triggered_at ?? plan.triggeredAt ? isoTime(plan.triggered_at ?? plan.triggeredAt) : undefined,
        triggeredPrice: plan.triggered_price === null || plan.triggered_price === undefined ? undefined : toNumber(plan.triggered_price),
        triggeredQuantity: plan.triggered_quantity === null || plan.triggered_quantity === undefined ? undefined : toNumber(plan.triggered_quantity),
        closingEntryId: plan.closing_entry_id === null || plan.closing_entry_id === undefined ? undefined : String(plan.closing_entry_id),
      }))
      : [],
    takeProfitTriggeredAt: row.take_profit_triggered_at ?? row.takeProfitTriggeredAt ? isoTime(row.take_profit_triggered_at ?? row.takeProfitTriggeredAt) : undefined,
    takeProfitTriggeredPrice: row.take_profit_triggered_price === null || row.take_profit_triggered_price === undefined ? undefined : toNumber(row.take_profit_triggered_price),
    takeProfitTriggeredQuantity: row.take_profit_triggered_quantity === null || row.take_profit_triggered_quantity === undefined ? undefined : toNumber(row.take_profit_triggered_quantity),
    quantity: toNumber(row.quantity),
    price: toNumber(row.price),
    fee: toNumber(row.fee_usdt),
    targetPrice: row.target_price === null || row.target_price === undefined ? undefined : toNumber(row.target_price),
    note: row.note ? String(row.note) : undefined,
    createdAt: isoTime(row.trade_time || row.created_at),
    // 自动成交/止盈可能补写 trade_time；前端仅用落库时间对系统动作排序，不改变交易时间展示。
    recordedAt: row.created_at ? isoTime(row.created_at) : undefined,
  };
}


type T0TakeProfitPlanRow = {
  id: number;
  trigger_price: string | number;
  quantity: string | number;
  status: 'pending' | 'triggered' | 'cancelled';
  triggered_at?: string | Date | null;
  triggered_price?: string | number | null;
  triggered_quantity?: string | number | null;
  closing_entry_id?: number | null;
};

async function getTakeProfitPlansByEntryId(tx: any, entryIds: number[], lock = false): Promise<Map<number, T0TakeProfitPlanRow[]>> {
  const ids = Array.from(new Set(entryIds.filter((id) => Number.isInteger(id) && id > 0)));
  const plansByEntryId = new Map<number, T0TakeProfitPlanRow[]>();
  if (ids.length === 0) return plansByEntryId;
  const [result] = await tx.execute(
    `SELECT id, opening_entry_id, trigger_price, quantity, status, triggered_at, triggered_price, triggered_quantity, closing_entry_id
       FROM ledger52_t0_journal_take_profit_plans
      WHERE ledger_id = ? AND opening_entry_id IN (${ids.map(() => '?').join(', ')})
      ORDER BY opening_entry_id ASC, id ASC${lock ? ' FOR UPDATE' : ''}`,
    [LEDGER_52_T0_JOURNAL_ID, ...ids],
  );
  for (const row of asRows(result)) {
    const entryId = toNumber(row.opening_entry_id);
    if (entryId <= 0) continue;
    const list = plansByEntryId.get(entryId) ?? [];
    list.push(row as T0TakeProfitPlanRow);
    plansByEntryId.set(entryId, list);
  }
  return plansByEntryId;
}

/** 已触发止盈有明确 closing_entry_id，先按该外键扣减可用数量，不能依赖易受旧时间影响的 FIFO。 */
async function getTriggeredTakeProfitCloseLinks(tx: any, input: { actorUserId: number; openingEntryId: number }) {
  const [rows] = await tx.execute(
    `SELECT closing_entry_id, quantity, triggered_quantity
       FROM ledger52_t0_journal_take_profit_plans
      WHERE ledger_id = ? AND user_id = ? AND opening_entry_id = ?
        AND status = 'triggered' AND closing_entry_id IS NOT NULL
      FOR UPDATE`,
    [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.openingEntryId],
  );
  const closingEntryIds = new Set<number>();
  let closedCents = 0;
  for (const row of asRows(rows)) {
    const closingEntryId = toNumber(row.closing_entry_id);
    if (closingEntryId <= 0 || closingEntryIds.has(closingEntryId)) continue;
    closingEntryIds.add(closingEntryId);
    closedCents += quantityToCents(row.triggered_quantity ?? row.quantity);
  }
  return { closingEntryIds, closedCents };
}

async function replacePendingTakeProfitPlans(tx: any, input: { actorUserId: number; openingEntryId: number; plans: ResolvedT0TakeProfitPlan[] }) {
  await tx.execute(
    `DELETE FROM ledger52_t0_journal_take_profit_plans
      WHERE ledger_id = ? AND user_id = ? AND opening_entry_id = ? AND status = 'pending'`,
    [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.openingEntryId],
  );
  for (const plan of input.plans) {
    await tx.execute(
      `INSERT INTO ledger52_t0_journal_take_profit_plans
        (ledger_id, user_id, opening_entry_id, trigger_price, quantity, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.openingEntryId, plan.price, plan.quantity],
    );
  }
}

async function syncEntryTakeProfitSummary(tx: any, input: { actorUserId: number; openingEntryId: number }) {
  const plansByEntryId = await getTakeProfitPlansByEntryId(tx, [input.openingEntryId], true);
  const plans = plansByEntryId.get(input.openingEntryId) ?? [];
  const nextPending = plans.find((plan) => String(plan.status) === 'pending');
  const latestTriggered = [...plans].reverse().find((plan) => String(plan.status) === 'triggered');
  await tx.execute(
    `UPDATE ledger52_t0_journal_entries
        SET take_profit_enabled = ?, take_profit_price = ?, take_profit_quantity = ?,
            take_profit_triggered_at = COALESCE(?, take_profit_triggered_at),
            take_profit_triggered_price = COALESCE(?, take_profit_triggered_price),
            take_profit_triggered_quantity = COALESCE(?, take_profit_triggered_quantity),
            updated_at = NOW(3)
      WHERE id = ? AND ledger_id = ? AND user_id = ?`,
    [
      nextPending ? 1 : 0,
      nextPending ? String(nextPending.trigger_price) : null,
      nextPending ? String(nextPending.quantity) : null,
      latestTriggered?.triggered_at ?? null,
      latestTriggered?.triggered_price ?? null,
      latestTriggered?.triggered_quantity ?? null,
      input.openingEntryId,
      LEDGER_52_T0_JOURNAL_ID,
      input.actorUserId,
    ],
  );
}

/**
 * T+0 首屏不等待每个报价格各自完成行情请求：直接读取已经由统一期权行情接口维护的正数缓存。
 * 只读、不触发外部请求；缓存缺失时返回空值，前端原有三秒轮询仍会补齐报价。
 */
function getT0OptionQuoteCacheKey(row: any): string | null {
  if (String(row.instrument_type ?? row.instrumentType ?? "") !== "option") return null;
  if (String(row.execution_status ?? row.executionStatus ?? "filled") !== "filled") return null;
  const expiryDate = mapOptionDate(row.option_expiry_date ?? row.optionExpiryDate);
  const strikePrice = toNumber(row.price);
  const direction = String(row.option_direction ?? row.optionDirection ?? "");
  if (!expiryDate || strikePrice <= 0 || !T0_JOURNAL_OPTION_DIRECTIONS.has(direction as T0JournalOptionDirection)) return null;
  const [year, month, day] = expiryDate.split("-").map(Number);
  const monthCode = DERIBIT_MONTH_CODES[month - 1];
  if (!Number.isInteger(year) || !Number.isInteger(day) || !monthCode) return null;
  const contractType = direction.endsWith("put") ? "P" : "C";
  return `greeks:ETH-${day}${monthCode}${String(year).slice(-2)}-${strikePrice}-${contractType}`;
}

async function getT0CachedOptionMarkPrices(conn: any, entryRows: any[]): Promise<Map<number, number>> {
  const cacheKeyByEntryId = new Map<number, string>();
  for (const row of entryRows) {
    const entryId = toNumber(row.id);
    const cacheKey = getT0OptionQuoteCacheKey(row);
    if (entryId > 0 && cacheKey) cacheKeyByEntryId.set(entryId, cacheKey);
  }
  if (cacheKeyByEntryId.size === 0) return new Map();

  const cacheKeys = Array.from(new Set(cacheKeyByEntryId.values()));
  try {
    const [cacheResult] = await conn.execute(
      `SELECT cache_key, cache_value FROM deribit_cache WHERE cache_key IN (${cacheKeys.map(() => "?").join(", ")})`,
      cacheKeys,
    );
    const markPriceByKey = new Map<string, number>();
    for (const row of asRows(cacheResult)) {
      try {
        const markPrice = Number(JSON.parse(String(row.cache_value || "{}")).markPrice);
        // 缓存中零价代表当次行情暂缺；绝不能覆盖已经存在的有效报价。
        if (Number.isFinite(markPrice) && markPrice > 0) markPriceByKey.set(String(row.cache_key), markPrice);
      } catch {
        // 个别缓存条目异常时仅忽略该条，不影响账本主体数据。
      }
    }
    const result = new Map<number, number>();
    for (const [entryId, cacheKey] of Array.from(cacheKeyByEntryId.entries())) {
      const markPrice = markPriceByKey.get(cacheKey);
      if (markPrice !== undefined) result.set(entryId, markPrice);
    }
    return result;
  } catch (error) {
    console.warn("[T0期权] 读取首屏报价缓存失败，改由前端轮询补齐:", error instanceof Error ? error.message : error);
    return new Map();
  }
}

function mapProfitShareRule(row: any): T0JournalProfitShareRule {
  const sourceUserId = toNumber(row.source_user_id ?? row.sourceUserId);
  const relatedFundId = toNumber(row.related_fund_id ?? row.relatedFundId);
  const beneficiaryUserId = toNumber(row.beneficiary_user_id ?? row.beneficiaryUserId);
  return {
    id: toNumber(row.id),
    relatedFundId,
    relatedFundName: String(row.related_fund_name ?? row.relatedFundName ?? `项目#${relatedFundId}`),
    sourceUserId,
    sourceUserName: String(row.source_user_name ?? row.sourceUserName ?? `用户#${sourceUserId}`),
    beneficiaryUserId,
    beneficiaryUserName: String(row.beneficiary_user_name ?? row.beneficiaryUserName ?? `用户#${beneficiaryUserId}`),
    percentage: toNumber(row.share_percentage ?? row.percentage),
    createdAt: isoTime(row.created_at ?? row.createdAt),
  };
}

function mapProfitShareSnapshot(row: any): T0JournalProfitShareSnapshot {
  const sourceUserId = toNumber(row.source_user_id ?? row.sourceUserId);
  const relatedFundId = toNumber(row.related_fund_id ?? row.relatedFundId);
  const beneficiaryUserId = toNumber(row.beneficiary_user_id ?? row.beneficiaryUserId);
  return {
    entryId: String(row.entry_id ?? row.entryId),
    openingEntryId: String(row.opening_entry_id ?? row.openingEntryId),
    relatedFundId,
    relatedFundName: row.related_fund_name ?? row.relatedFundName ?? undefined,
    sourceUserId,
    beneficiaryUserId,
    percentage: toNumber(row.share_percentage ?? row.percentage),
    matchedQuantity: toNumber(row.matched_quantity ?? row.matchedQuantity),
    sourceUserName: row.source_user_name ?? row.sourceUserName ?? undefined,
    beneficiaryUserName: row.beneficiary_user_name ?? row.beneficiaryUserName ?? undefined,
  };
}

function mapRecoverableAudit(row: any) {
  try {
    const snapshot = JSON.parse(String(row.before_snapshot || ""));
    // 旧版删除审计未保存重建所需的请求标识，保留审计但不在“可恢复”中展示，避免误恢复。
    if (!snapshot?.id || !snapshot?.client_request_id) return null;
    return {
      auditId: String(row.audit_id),
      operation: String(row.operation),
      revertedAt: isoTime(row.created_at),
      entry: mapEntry(snapshot),
    };
  } catch {
    return null;
  }
}

/**
 * 账户与流水均按 ledger 52 + 当前管理员 user_id 分区。
 * 不设外键，避免旧库迁移时受历史数据状态影响；所有读写均由接口侧权限校验保障。
 */
export async function ensureLedger52T0JournalTables(conn?: any): Promise<void> {
  if (tablesReady) return tablesReady;
  tablesReady = (async () => {
    const db = conn ?? await getDbConnection();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0 速记账本数据库连接失败" });

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_accounts (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        name VARCHAR(80) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        last_used_at DATETIME(3) DEFAULT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_t0_journal_account_owner_name (ledger_id, user_id, name),
        KEY idx_t0_journal_account_recent (ledger_id, user_id, is_active, last_used_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：当前管理员可见的下单账户'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_related_funds (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        related_user_id BIGINT UNSIGNED NOT NULL,
        name VARCHAR(80) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        last_used_at DATETIME(3) DEFAULT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_t0_journal_related_fund_name (ledger_id, user_id, name),
        KEY idx_t0_journal_related_fund_recent (ledger_id, user_id, related_user_id, is_active, last_used_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：关联用户下的专项款目录'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_entries (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        account_id BIGINT UNSIGNED NOT NULL,
        related_user_id BIGINT UNSIGNED DEFAULT NULL,
        related_fund_id BIGINT UNSIGNED DEFAULT NULL,
        symbol VARCHAR(16) NOT NULL DEFAULT 'ETH',
        instrument_type ENUM('spot','contract','option','grid') DEFAULT NULL,
        option_direction ENUM('long_call','long_put','short_call','short_put') DEFAULT NULL,
        option_expiry_date DATE DEFAULT NULL,
        option_premium DECIMAL(36,18) DEFAULT NULL,
        option_premium_currency ENUM('USDT','ETH') DEFAULT NULL,
        option_settlement_price DECIMAL(36,18) DEFAULT NULL COMMENT '自动到期时每ETH期权的最终结算值（USDT）',
        option_delivery_price DECIMAL(36,18) DEFAULT NULL COMMENT 'Deribit官方交割使用的ETH指数价（USDT）',
        option_settled_at DATETIME(3) DEFAULT NULL COMMENT '系统确认自动到期结算的时间',
        option_settlement_source VARCHAR(40) DEFAULT NULL COMMENT '最终结算价格来源',
        grid_direction ENUM('long','short') DEFAULT NULL COMMENT '网格方向：做多或做空',
        grid_range_min DECIMAL(36,18) DEFAULT NULL COMMENT '网格区间下限',
        grid_range_max DECIMAL(36,18) DEFAULT NULL COMMENT '网格区间上限',
        grid_leverage DECIMAL(36,18) DEFAULT NULL COMMENT '网格杠杆倍数',
        grid_count INT UNSIGNED DEFAULT NULL COMMENT '网格数量',
        is_locked TINYINT(1) NOT NULL DEFAULT 0 COMMENT '仅T+0开仓主单的管理员锁定展示标记',
        is_counterparty TINYINT(1) NOT NULL DEFAULT 0 COMMENT '仅开仓主单：管理员反向展示，成员保留原始多空与损益',
        execution_status ENUM('filled','pending') NOT NULL DEFAULT 'filled' COMMENT 'filled为实际成交，pending为管理员逐笔报价挂单',
        filled_at DATETIME(3) DEFAULT NULL COMMENT '挂单触发成交的系统确认时间',
        filled_price DECIMAL(36,18) DEFAULT NULL COMMENT '挂单触发成交时的统一行情价格',
        take_profit_enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '仅现货和合约开仓可用；挂单成交后才允许触发',
        take_profit_price DECIMAL(36,18) DEFAULT NULL COMMENT '止盈触发价：多单向上、空单向下',
        take_profit_quantity DECIMAL(36,18) DEFAULT NULL COMMENT '止盈平仓数量，可小于原开仓数量',
        take_profit_triggered_at DATETIME(3) DEFAULT NULL COMMENT '系统自动止盈的确认时间',
        take_profit_triggered_price DECIMAL(36,18) DEFAULT NULL COMMENT '系统自动止盈时的统一行情价格',
        take_profit_triggered_quantity DECIMAL(36,18) DEFAULT NULL COMMENT '系统自动止盈的实际平仓数量',
        action ENUM('openLong','closeLong','openShort','closeShort') NOT NULL,
        quantity DECIMAL(36,18) NOT NULL,
        price DECIMAL(36,18) NOT NULL,
        fee_usdt DECIMAL(36,18) NOT NULL DEFAULT 0,
        target_price DECIMAL(36,18) DEFAULT NULL,
        note VARCHAR(500) DEFAULT NULL,
        client_request_id VARCHAR(64) NOT NULL,
        created_by_user_id INT NOT NULL,
        trade_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_t0_journal_entry_request (ledger_id, user_id, client_request_id),
        KEY idx_t0_journal_entry_account_time (ledger_id, user_id, account_id, trade_time),
        KEY idx_t0_journal_entry_related_user_time (ledger_id, user_id, related_user_id, trade_time),
        KEY idx_t0_journal_entry_related_fund_time (ledger_id, user_id, related_fund_id, trade_time),
        KEY idx_t0_journal_entry_instrument_time (ledger_id, user_id, instrument_type, trade_time),
        KEY idx_t0_journal_entry_auto_take_profit (ledger_id, take_profit_enabled, execution_status, action, take_profit_price),
        KEY idx_t0_journal_entry_owner_time (ledger_id, user_id, trade_time)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：管理员手工下单流水与创建审计'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_take_profit_plans (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        opening_entry_id BIGINT UNSIGNED NOT NULL,
        trigger_price DECIMAL(36,18) NOT NULL,
        quantity DECIMAL(36,18) NOT NULL,
        status ENUM('pending','triggered','cancelled') NOT NULL DEFAULT 'pending',
        triggered_at DATETIME(3) DEFAULT NULL,
        triggered_price DECIMAL(36,18) DEFAULT NULL,
        triggered_quantity DECIMAL(36,18) DEFAULT NULL,
        closing_entry_id BIGINT UNSIGNED DEFAULT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_t0_take_profit_scan (ledger_id, status, trigger_price, opening_entry_id),
        KEY idx_t0_take_profit_entry (ledger_id, user_id, opening_entry_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：开仓多段止盈计划与触发记录'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_entry_audits (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        entry_id BIGINT UNSIGNED NOT NULL,
        operation ENUM('update','delete','revert','restore') NOT NULL,
        before_snapshot LONGTEXT NOT NULL,
        after_snapshot LONGTEXT DEFAULT NULL,
        operator_user_id INT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_t0_journal_audit_entry (ledger_id, user_id, entry_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：编辑与删除审计快照'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_dimension_audits (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        dimension ENUM('account','related_user','related_fund') NOT NULL,
        dimension_id BIGINT UNSIGNED NOT NULL,
        related_user_id BIGINT UNSIGNED DEFAULT NULL,
        operation ENUM('rename','delete') NOT NULL DEFAULT 'rename',
        old_name VARCHAR(80) NOT NULL,
        new_name VARCHAR(80) NOT NULL,
        affected_entry_count INT UNSIGNED NOT NULL DEFAULT 0,
        operator_user_id INT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_t0_journal_dimension_audit (ledger_id, user_id, dimension, dimension_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：账户、关联用户及项目目录变更审计'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_deleted_dimensions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        dimension ENUM('account','related_user','related_fund') NOT NULL,
        dimension_id BIGINT UNSIGNED NOT NULL,
        related_user_id BIGINT UNSIGNED DEFAULT NULL,
        deleted_name VARCHAR(80) NOT NULL,
        operator_user_id INT NOT NULL,
        deleted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_t0_journal_deleted_dimension (ledger_id, user_id, dimension, dimension_id),
        KEY idx_t0_journal_deleted_dimension_owner (ledger_id, user_id, dimension, deleted_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：已隐藏目录，保留稳定键供历史核对'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_profit_share_rules (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        source_user_id BIGINT UNSIGNED NOT NULL,
        related_fund_id BIGINT UNSIGNED DEFAULT NULL,
        beneficiary_user_id BIGINT UNSIGNED NOT NULL,
        share_percentage DECIMAL(7,4) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        superseded_by_rule_id BIGINT UNSIGNED DEFAULT NULL,
        ended_at DATETIME(3) DEFAULT NULL,
        created_by_user_id INT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_t0_journal_profit_share_source_active (ledger_id, user_id, source_user_id, is_active, id),
        KEY idx_t0_journal_profit_share_fund_active (ledger_id, user_id, related_fund_id, is_active, id),
        KEY idx_t0_journal_profit_share_beneficiary_active (ledger_id, user_id, beneficiary_user_id, is_active, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：按专项项目配置的未来新开仓收益分配规则'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_profit_share_source_settings (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        source_user_id BIGINT UNSIGNED NOT NULL,
        configured_by_user_id INT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_t0_journal_profit_share_source_setting (ledger_id, user_id, source_user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：关联用户是否已完成首次收益分配决定'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_entry_profit_shares (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        entry_id BIGINT UNSIGNED NOT NULL,
        opening_entry_id BIGINT UNSIGNED NOT NULL,
        source_user_id BIGINT UNSIGNED NOT NULL,
        related_fund_id BIGINT UNSIGNED DEFAULT NULL,
        beneficiary_user_id BIGINT UNSIGNED NOT NULL,
        profit_share_rule_id BIGINT UNSIGNED DEFAULT NULL,
        share_percentage DECIMAL(7,4) NOT NULL,
        matched_quantity DECIMAL(36,18) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_t0_journal_entry_profit_share (ledger_id, user_id, entry_id, opening_entry_id, beneficiary_user_id),
        KEY idx_t0_journal_entry_profit_share_entry (ledger_id, user_id, entry_id),
        KEY idx_t0_journal_entry_profit_share_beneficiary (ledger_id, user_id, beneficiary_user_id, entry_id),
        KEY idx_t0_journal_entry_profit_share_fund (ledger_id, user_id, related_fund_id, entry_id),
        KEY idx_t0_journal_entry_profit_share_opening (ledger_id, user_id, opening_entry_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：开平仓收益分配不可变快照'
    `);


    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_payout_logs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        related_user_id BIGINT UNSIGNED NOT NULL,
        occurred_on DATE NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        direction ENUM('withdrawal','deposit') NOT NULL DEFAULT 'withdrawal',
        note VARCHAR(300) DEFAULT NULL,
        created_by_user_id INT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_t0_journal_payout_owner_user_date (ledger_id, user_id, related_user_id, occurred_on, id),
        KEY idx_t0_journal_payout_related_user_date (ledger_id, related_user_id, occurred_on, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0速记账本：管理员登记、关联用户共享的收益转出流水；不影响订单收益'
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS ledger52_t0_journal_shared_income_transfers (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        closing_entry_id BIGINT UNSIGNED NOT NULL,
        source_user_id BIGINT UNSIGNED DEFAULT NULL,
        recipient_user_id BIGINT UNSIGNED NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        source_net_pnl DECIMAL(36,18) NOT NULL,
        manager_pool_amount DECIMAL(36,18) NOT NULL,
        reduces_regular_distribution TINYINT(1) NOT NULL DEFAULT 0,
        created_by_user_id INT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_t0_shared_income_closing_recipient (ledger_id, user_id, closing_entry_id, recipient_user_id),
        KEY idx_t0_shared_income_recipient (ledger_id, user_id, recipient_user_id, created_at),
        KEY idx_t0_shared_income_closing (ledger_id, user_id, closing_entry_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='52号账本T+0：平仓正向净收益优先分配的共享收益；保留原订单分佣快照'
    `);
    // 历史共享收益按旧规则已经完成结算，默认值 0 使其不回溯改变既有订单收益；
    // 新规则写入 1，令读取端以“本单净收益 - 共享收益”作为原分佣的基数。
    const [sharedIncomeReductionColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_shared_income_transfers LIKE 'reduces_regular_distribution'`);
    if (asRows(sharedIncomeReductionColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_shared_income_transfers
          ADD COLUMN reduces_regular_distribution TINYINT(1) NOT NULL DEFAULT 0 AFTER manager_pool_amount
      `);
    }
    const [payoutDirectionColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_payout_logs LIKE 'direction'`);
    if (asRows(payoutDirectionColumns).length === 0) {
      // 历史账本流水均是原“提现”语义，迁移后保留为 withdrawal，绝不改变历史金额。
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_payout_logs
          ADD COLUMN direction ENUM('withdrawal','deposit') NOT NULL DEFAULT 'withdrawal' AFTER amount
      `);
    }

    const [dimensionAuditOperationColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_dimension_audits LIKE 'operation'`);
    if (asRows(dimensionAuditOperationColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_dimension_audits
          ADD COLUMN operation ENUM('rename','delete') NOT NULL DEFAULT 'rename' AFTER related_user_id,
          ADD COLUMN affected_entry_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER new_name
      `);
    }

    // 兼容已经创建过旧版审计表的生产库，使其可记录速记回撤、恢复与期权自动到期结算动作。
    await db.execute(`
      ALTER TABLE ledger52_t0_journal_entry_audits
        MODIFY COLUMN operation ENUM('update','delete','revert','restore','fill','expiry_settlement','take_profit') NOT NULL
    `);

    // 兼容已创建的T+0流水表：关联用户为新增维度，旧流水保留为空，以免篡改历史记录。
    const [relatedUserColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_entries LIKE 'related_user_id'`);
    if (asRows(relatedUserColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_entries
          ADD COLUMN related_user_id BIGINT UNSIGNED DEFAULT NULL AFTER account_id,
          ADD KEY idx_t0_journal_entry_related_user_time (ledger_id, user_id, related_user_id, trade_time)
      `);
    }

    // 兼容已创建的流水表：专项款为新增维度，所有历史记录保留为空，前端标记为“未区分专项款（历史）”。
    const [relatedFundColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_entries LIKE 'related_fund_id'`);
    if (asRows(relatedFundColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_entries
          ADD COLUMN related_fund_id BIGINT UNSIGNED DEFAULT NULL AFTER related_user_id,
          ADD KEY idx_t0_journal_entry_related_fund_time (ledger_id, user_id, related_fund_id, trade_time)
      `);
    }

    // 开仓类型是新增研究维度：历史流水保持 NULL，管理员可在编辑开仓时按实际情况补录。
    const [instrumentTypeColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_entries LIKE 'instrument_type'`);
    const instrumentTypeColumn = asRows(instrumentTypeColumns)[0] as { Type?: unknown } | undefined;
    if (!instrumentTypeColumn) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_entries
          ADD COLUMN instrument_type ENUM('spot','contract','option','grid') DEFAULT NULL AFTER symbol,
          ADD KEY idx_t0_journal_entry_instrument_time (ledger_id, user_id, instrument_type, trade_time)
      `);
    } else if (!String(instrumentTypeColumn.Type ?? "").includes("'grid'")) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_entries
          MODIFY COLUMN instrument_type ENUM('spot','contract','option','grid') DEFAULT NULL
      `);
    }

    // 期权参数与行权价分开固化，避免把权利金、到期日或方向塞入备注导致无法审计和回填。
    const [optionDirectionColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_entries LIKE 'option_direction'`);
    if (asRows(optionDirectionColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_entries
          ADD COLUMN option_direction ENUM('long_call','long_put','short_call','short_put') DEFAULT NULL AFTER instrument_type,
          ADD COLUMN option_expiry_date DATE DEFAULT NULL AFTER option_direction,
          ADD COLUMN option_premium DECIMAL(36,18) DEFAULT NULL AFTER option_expiry_date,
          ADD COLUMN option_premium_currency ENUM('USDT','ETH') DEFAULT NULL AFTER option_premium
      `);
    }

    // 到期结算只在确认到 Deribit 官方 delivery 后写入；旧流水保留 NULL，绝不回填或改写历史期权。
    const [optionSettlementColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_entries LIKE 'option_settlement_price'`);
    if (asRows(optionSettlementColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_entries
          ADD COLUMN option_settlement_price DECIMAL(36,18) DEFAULT NULL COMMENT '自动到期时每ETH期权的最终结算值（USDT）' AFTER option_premium_currency,
          ADD COLUMN option_delivery_price DECIMAL(36,18) DEFAULT NULL COMMENT 'Deribit官方交割使用的ETH指数价（USDT）' AFTER option_settlement_price,
          ADD COLUMN option_settled_at DATETIME(3) DEFAULT NULL COMMENT '系统确认自动到期结算的时间' AFTER option_delivery_price,
          ADD COLUMN option_settlement_source VARCHAR(40) DEFAULT NULL COMMENT '最终结算价格来源' AFTER option_settled_at,
          ADD KEY idx_t0_journal_entry_option_expiry (ledger_id, instrument_type, option_expiry_date, action)
      `);
    }

    // 网格参数独立固化，T形交割表按做多下限 / 做空上限归档；历史订单保持 NULL。
    const [gridDirectionColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_entries LIKE 'grid_direction'`);
    if (asRows(gridDirectionColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_entries
          ADD COLUMN grid_direction ENUM('long','short') DEFAULT NULL COMMENT '网格方向：做多或做空' AFTER option_settlement_source,
          ADD COLUMN grid_range_min DECIMAL(36,18) DEFAULT NULL COMMENT '网格区间下限' AFTER grid_direction,
          ADD COLUMN grid_range_max DECIMAL(36,18) DEFAULT NULL COMMENT '网格区间上限' AFTER grid_range_min,
          ADD COLUMN grid_leverage DECIMAL(36,18) DEFAULT NULL COMMENT '网格杠杆倍数' AFTER grid_range_max,
          ADD COLUMN grid_count INT UNSIGNED DEFAULT NULL COMMENT '网格数量' AFTER grid_leverage
      `);
    }

    // 开仓锁定仅供管理员逐笔报价做黑金视觉标识；历史订单默认未锁，绝不影响数量、FIFO 或收益计算。
    const [lockedColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_entries LIKE 'is_locked'`);
    if (asRows(lockedColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_entries
          ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0 COMMENT '仅T+0开仓主单的管理员锁定展示标记' AFTER instrument_type
      `);
    }

    // 管理员反向展示标记仅落在开仓主单；历史订单默认关闭，绝不改写原始方向、数量、FIFO 或收益。
    const [counterpartyColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_entries LIKE 'is_counterparty'`);
    if (asRows(counterpartyColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_entries
          ADD COLUMN is_counterparty TINYINT(1) NOT NULL DEFAULT 0
            COMMENT '仅开仓主单：管理员反向展示，成员保留原始多空与损益' AFTER is_locked
      `);
    }

    // 管理员逐笔报价挂单：历史订单默认已成交，绝不回写或改变既有仓位、FIFO 与收益。
    const [executionStatusColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_entries LIKE 'execution_status'`);
    if (asRows(executionStatusColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_entries
          ADD COLUMN execution_status ENUM('filled','pending') NOT NULL DEFAULT 'filled' AFTER is_locked,
          ADD COLUMN filled_at DATETIME(3) DEFAULT NULL AFTER execution_status,
          ADD COLUMN filled_price DECIMAL(36,18) DEFAULT NULL AFTER filled_at,
          ADD KEY idx_t0_journal_entry_pending_scan (ledger_id, execution_status, action, price)
      `);
    }

    // 兼容已创建的流水表：止盈为现货/合约开仓的可选自动平仓计划；旧订单默认关闭。
    const [takeProfitColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_entries LIKE 'take_profit_enabled'`);
    if (asRows(takeProfitColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_entries
          ADD COLUMN take_profit_enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '仅现货和合约开仓可用；挂单成交后才允许触发' AFTER filled_price,
          ADD COLUMN take_profit_price DECIMAL(36,18) DEFAULT NULL COMMENT '止盈触发价：多单向上、空单向下' AFTER take_profit_enabled,
          ADD COLUMN take_profit_quantity DECIMAL(36,18) DEFAULT NULL COMMENT '止盈平仓数量，可小于原开仓数量' AFTER take_profit_price,
          ADD COLUMN take_profit_triggered_at DATETIME(3) DEFAULT NULL COMMENT '系统自动止盈的确认时间' AFTER take_profit_quantity,
          ADD COLUMN take_profit_triggered_price DECIMAL(36,18) DEFAULT NULL COMMENT '系统自动止盈时的统一行情价格' AFTER take_profit_triggered_at,
          ADD COLUMN take_profit_triggered_quantity DECIMAL(36,18) DEFAULT NULL COMMENT '系统自动止盈的实际平仓数量' AFTER take_profit_triggered_price,
          ADD KEY idx_t0_journal_entry_auto_take_profit (ledger_id, take_profit_enabled, execution_status, action, take_profit_price)
      `);
    }

    // 将旧版单段止盈兼容为一条多段计划；已触发记录保留为历史，未触发记录保持 pending。
    await db.execute(`
      INSERT INTO ledger52_t0_journal_take_profit_plans
        (ledger_id, user_id, opening_entry_id, trigger_price, quantity, status, triggered_at, triggered_price, triggered_quantity)
      SELECT e.ledger_id, e.user_id, e.id, e.take_profit_price, e.take_profit_quantity,
             CASE WHEN e.take_profit_enabled = 1 THEN 'pending' ELSE 'triggered' END,
             e.take_profit_triggered_at, e.take_profit_triggered_price, e.take_profit_triggered_quantity
        FROM ledger52_t0_journal_entries e
       WHERE e.ledger_id = ?
         AND e.action IN ('openLong','openShort')
         AND e.instrument_type IN ('spot','contract')
         AND e.take_profit_price IS NOT NULL
         AND e.take_profit_quantity IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM ledger52_t0_journal_take_profit_plans p
            WHERE p.ledger_id = e.ledger_id AND p.user_id = e.user_id AND p.opening_entry_id = e.id
         )
    `, [LEDGER_52_T0_JOURNAL_ID]);

    // 项目名称在同一账本管理员范围内全局唯一，不能被不同关联用户重复使用。
    // 如历史数据已有重名，保留其可读性并由服务层阻止新的重复创建，避免初始化失败影响账本访问。
    const [duplicateFundNameRows] = await db.execute(`
      SELECT name FROM ledger52_t0_journal_related_funds
       WHERE ledger_id = ?
       GROUP BY user_id, name
      HAVING COUNT(*) > 1
       LIMIT 1
    `, [LEDGER_52_T0_JOURNAL_ID]);
    const [globalFundNameIndexRows] = await db.execute(`SHOW INDEX FROM ledger52_t0_journal_related_funds WHERE Key_name = 'uq_t0_journal_related_fund_name'`);
    if (asRows(duplicateFundNameRows).length === 0 && asRows(globalFundNameIndexRows).length === 0) {
      await db.execute(`ALTER TABLE ledger52_t0_journal_related_funds ADD UNIQUE KEY uq_t0_journal_related_fund_name (ledger_id, user_id, name)`);
    }

    // 项目级收益分配：旧的用户级规则保留审计，但不再被新订单读取；新规则和快照均固定专项项目键。
    const [profitShareRuleFundColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_profit_share_rules LIKE 'related_fund_id'`);
    if (asRows(profitShareRuleFundColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_profit_share_rules
          ADD COLUMN related_fund_id BIGINT UNSIGNED DEFAULT NULL AFTER source_user_id,
          ADD KEY idx_t0_journal_profit_share_fund_active (ledger_id, user_id, related_fund_id, is_active, id)
      `);
    }
    const [profitShareSnapshotFundColumns] = await db.execute(`SHOW COLUMNS FROM ledger52_t0_journal_entry_profit_shares LIKE 'related_fund_id'`);
    if (asRows(profitShareSnapshotFundColumns).length === 0) {
      await db.execute(`
        ALTER TABLE ledger52_t0_journal_entry_profit_shares
          ADD COLUMN related_fund_id BIGINT UNSIGNED DEFAULT NULL AFTER source_user_id,
          ADD KEY idx_t0_journal_entry_profit_share_fund (ledger_id, user_id, related_fund_id, entry_id)
      `);
    }
  })().catch((error) => {
    tablesReady = null;
    throw error;
  });
  return tablesReady;
}

/** 解析52号账本的实际所有者，用于系统超级管理员读取该账本已有的管理流水。 */
async function getLedger52T0JournalOwnerUserId() {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const [rows] = await conn.execute(
    `SELECT userId FROM ledger_members WHERE ledgerId = ? AND role = 'owner' ORDER BY id ASC LIMIT 1`,
    [LEDGER_52_T0_JOURNAL_ID],
  );
  const ownerUserId = toNumber(asRows(rows)[0]?.userId);
  if (ownerUserId <= 0) throw new TRPCError({ code: "NOT_FOUND", message: "未找到52号账本所有者" });
  return ownerUserId;
}

/**
 * T+0阅读权限：管理员读取其管理流水的全量关联用户数据；52号账本成员只读取自身关联用户ID的数据。
 * 系统超级管理员读取账本实际所有者的管理流水；身份代入不是实际成员会话，不能借此浏览个人仓位。
 */
export async function resolveLedger52T0JournalReadScope(actor: T0JournalActor): Promise<T0JournalReadScope> {
  if (actor.isViewingAs) {
    throw new TRPCError({ code: "FORBIDDEN", message: "代入成员视角不可访问T+0速记账本" });
  }
  if (actor.role === "super_admin") {
    return { mode: "admin", journalOwnerUserId: await getLedger52T0JournalOwnerUserId() };
  }
  if (actor.role === "admin") {
    return { mode: "admin", journalOwnerUserId: actor.id };
  }

  const membership = await dbLedger.getUserMembership(LEDGER_52_T0_JOURNAL_ID, actor.id);
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "仅52号账本成员可访问T+0速记账本" });
  }
  if (membership.role === "owner" || membership.role === "admin") {
    return { mode: "admin", journalOwnerUserId: actor.id };
  }
  return { mode: "member", relatedUserId: actor.id };
}

/** 所有写入与关联用户搜索继续只开放给账本管理员。 */
export async function assertLedger52T0JournalAccess(actor: T0JournalActor): Promise<void> {
  const scope = await resolveLedger52T0JournalReadScope(actor);
  if (scope.mode !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "仅52号账本管理员可操作T+0速记账本" });
  }
}

async function resolveLedger52T0JournalRelatedFund(tx: any, input: {
  actorUserId: number;
  relatedUserId: number;
  relatedFundId?: number;
  relatedFundName?: string;
  required?: boolean;
  /** 平仓可沿用已逻辑删除的历史项目，避免删除目录后无法完成既有仓位的平仓。 */
  allowInactive?: boolean;
}): Promise<{ id: number; name: string } | null> {
  const relatedFundId = Number(input.relatedFundId || 0);
  const relatedFundName = String(input.relatedFundName || "").trim();
  if (input.relatedUserId <= 0) {
    if (relatedFundId > 0 || relatedFundName) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "请先选择关联用户，再选择专项款" });
    }
    return null;
  }
  if (relatedFundId > 0) {
    if (!Number.isInteger(relatedFundId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "专项款信息无效" });
    }
    const [fundRows] = await tx.execute(
      `SELECT id, name
         FROM ledger52_t0_journal_related_funds
        WHERE id = ? AND ledger_id = ? AND user_id = ? AND related_user_id = ?
          AND (is_active = 1 OR ? = 1)
        LIMIT 1 FOR UPDATE`,
      [relatedFundId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.relatedUserId, input.allowInactive ? 1 : 0],
    );
    const fund = asRows(fundRows)[0];
    if (!fund) {
      throw new TRPCError({ code: "NOT_FOUND", message: "专项款不存在、已停用或不属于该关联用户" });
    }
    await tx.execute(
      `UPDATE ledger52_t0_journal_related_funds SET last_used_at = NOW(3)
        WHERE id = ? AND ledger_id = ? AND user_id = ?`,
      [relatedFundId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    return { id: relatedFundId, name: String(fund.name || "") };
  }
  if (relatedFundName) {
    const [sameNameRows] = await tx.execute(
      `SELECT id, related_user_id, name
         FROM ledger52_t0_journal_related_funds
        WHERE ledger_id = ? AND user_id = ? AND name = ?
        ORDER BY id ASC FOR UPDATE`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, relatedFundName],
    );
    const sameNameFunds = asRows(sameNameRows);
    const fundForOtherUser = sameNameFunds.find((fund) => toNumber(fund.related_user_id) !== input.relatedUserId);
    if (fundForOtherUser) {
      throw new TRPCError({ code: "CONFLICT", message: `项目名称“${relatedFundName}”已归属于其他关联用户，请使用不同名称` });
    }
    const existingFund = sameNameFunds[0];
    if (existingFund) {
      const existingFundId = toNumber(existingFund.id);
      await tx.execute(
        `UPDATE ledger52_t0_journal_related_funds
            SET is_active = 1, last_used_at = NOW(3), updated_at = NOW(3)
          WHERE id = ? AND ledger_id = ? AND user_id = ?`,
        [existingFundId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      );
      return { id: existingFundId, name: String(existingFund.name || relatedFundName) };
    }
    const [result] = await tx.execute(
      `INSERT INTO ledger52_t0_journal_related_funds (ledger_id, user_id, related_user_id, name, is_active, last_used_at)
       VALUES (?, ?, ?, ?, 1, NOW(3))`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.relatedUserId, relatedFundName],
    );
    const createdFundId = Number((result as any).insertId || 0);
    if (!createdFundId) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "专项款保存失败" });
    }
    return { id: createdFundId, name: relatedFundName };
  }
  if (input.required) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "关联用户开仓时，请选择或新建专项款" });
  }
  return null;
}

export async function getLedger52T0Journal(scope: T0JournalReadScope) {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  await ensureLedger52T0JournalTables(conn);

  const isAdminScope = scope.mode === "admin";
  const journalOwnerUserId = isAdminScope ? scope.journalOwnerUserId : 0;
  const relatedUserId = scope.mode === "member" ? scope.relatedUserId : 0;
  // 普通成员只可读取本人作为订单所属人、本人被明确写入收益分配快照的订单，
  // 或本人实际收到共享收益的来源平仓单。共享收益只在该平仓单内呈现，不生成独立交易流水。
  // 推荐关系仅供管理员筛选与统计，绝不自动扩大普通成员的订单访问范围。
  const memberVisibleRelatedUserIds = !isAdminScope
    ? [relatedUserId].filter((userId) => userId > 0)
    : [];
  const memberRelatedUserPlaceholders = memberVisibleRelatedUserIds.map(() => "?").join(", ");
  const memberVisibilityParams = [...memberVisibleRelatedUserIds, relatedUserId, relatedUserId];
  const memberVisibilitySql = `(
    e.related_user_id IN (${memberRelatedUserPlaceholders})
    OR EXISTS (
      SELECT 1
        FROM ledger52_t0_journal_entry_profit_shares shared_entry
       WHERE shared_entry.ledger_id = e.ledger_id
         AND shared_entry.user_id = e.user_id
         AND shared_entry.entry_id = e.id
         AND shared_entry.beneficiary_user_id = ?
    )
    OR EXISTS (
      SELECT 1
        FROM ledger52_t0_journal_shared_income_transfers shared_income
       WHERE shared_income.ledger_id = e.ledger_id
         AND shared_income.user_id = e.user_id
         AND shared_income.closing_entry_id = e.id
         AND shared_income.recipient_user_id = ?
    )
  )`;
  const [accountResult, entryResult, recoverableAuditResult, recentUserResult, relatedFundResult] = await Promise.all([
    isAdminScope
      ? conn.execute(
        `SELECT id, name, last_used_at, created_at
           FROM ledger52_t0_journal_accounts
          WHERE ledger_id = ? AND user_id = ? AND is_active = 1
          ORDER BY last_used_at IS NULL ASC, last_used_at DESC, updated_at DESC, id DESC`,
        [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId],
      )
      : conn.execute(
        `SELECT a.id, a.name, MAX(e.trade_time) AS last_used_at, MIN(a.created_at) AS created_at
           FROM ledger52_t0_journal_entries e
           INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id AND a.is_active = 1
          WHERE e.ledger_id = ? AND ${memberVisibilitySql}
          GROUP BY a.id, a.name
          ORDER BY last_used_at DESC, a.id DESC`,
        [LEDGER_52_T0_JOURNAL_ID, ...memberVisibilityParams],
      ),
    conn.execute(
      `SELECT e.id, e.account_id,
              CASE WHEN a.is_active = 1 THEN a.name ELSE NULL END AS account_name,
              CASE WHEN a.is_active = 1 THEN 0 ELSE 1 END AS account_hidden,
              e.symbol, e.instrument_type, e.option_direction, e.option_expiry_date, e.option_premium, e.option_premium_currency,
              e.option_settlement_price, e.option_delivery_price, e.option_settled_at, e.option_settlement_source,
              e.grid_direction, e.grid_range_min, e.grid_range_max, e.grid_leverage, e.grid_count,
              e.is_locked, e.is_counterparty, e.execution_status, e.filled_at, e.filled_price,
              e.take_profit_enabled, e.take_profit_price, e.take_profit_quantity, e.take_profit_triggered_at, e.take_profit_triggered_price, e.take_profit_triggered_quantity,
              e.action, e.related_user_id, e.related_fund_id,
              CASE WHEN f.is_active = 1 THEN f.name ELSE NULL END AS related_fund_name,
              CASE WHEN f.is_active = 1 THEN 0 ELSE 1 END AS related_fund_hidden,
              CASE WHEN deleted_user.id IS NULL THEN COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', e.related_user_id)) ELSE NULL END AS related_user_name,
              CASE WHEN deleted_user.id IS NULL THEN u.username ELSE NULL END AS related_username,
              CASE WHEN deleted_user.id IS NULL THEN u.avatar ELSE NULL END AS related_user_avatar,
              CASE WHEN deleted_user.id IS NULL THEN 0 ELSE 1 END AS related_user_hidden,
              e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.trade_time, e.created_at
         FROM ledger52_t0_journal_entries e
         INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
         LEFT JOIN users u ON u.id = e.related_user_id
         LEFT JOIN ledger52_t0_journal_related_funds f ON f.id = e.related_fund_id AND f.ledger_id = e.ledger_id AND f.user_id = e.user_id
         LEFT JOIN ledger52_t0_journal_deleted_dimensions deleted_user
           ON deleted_user.ledger_id = e.ledger_id AND deleted_user.user_id = e.user_id
          AND deleted_user.dimension = 'related_user' AND deleted_user.dimension_id = e.related_user_id
        WHERE e.ledger_id = ? AND ${isAdminScope ? "e.user_id = ?" : memberVisibilitySql}
        ORDER BY e.trade_time ASC, e.id ASC
        LIMIT 2000`,
      isAdminScope
        ? [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId]
        : [LEDGER_52_T0_JOURNAL_ID, ...memberVisibilityParams],
    ),
    isAdminScope ? conn.execute(
      `SELECT a.id AS audit_id, a.entry_id, a.operation, a.before_snapshot, a.created_at
         FROM ledger52_t0_journal_entry_audits a
         INNER JOIN (
           SELECT entry_id, MAX(id) AS latest_audit_id
             FROM ledger52_t0_journal_entry_audits
            WHERE ledger_id = ? AND user_id = ?
            GROUP BY entry_id
         ) latest ON latest.latest_audit_id = a.id
        WHERE a.ledger_id = ? AND a.user_id = ?
          AND a.operation IN ('delete', 'revert')
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 30`,
      [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId, LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId],
    ) : Promise.resolve([[]]),
    isAdminScope ? conn.execute(
      `SELECT e.related_user_id, u.username, u.name, u.avatar, MAX(e.trade_time) AS last_used_at
         FROM ledger52_t0_journal_entries e
         LEFT JOIN users u ON u.id = e.related_user_id
        WHERE e.ledger_id = ? AND e.user_id = ? AND e.related_user_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM ledger52_t0_journal_deleted_dimensions deleted_user
             WHERE deleted_user.ledger_id = e.ledger_id AND deleted_user.user_id = e.user_id
               AND deleted_user.dimension = 'related_user' AND deleted_user.dimension_id = e.related_user_id
          )
        GROUP BY e.related_user_id, u.username, u.name, u.avatar
        ORDER BY last_used_at DESC, e.related_user_id DESC
        LIMIT 30`,
      [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId],
    ) : Promise.resolve([[]]),
    isAdminScope ? conn.execute(
      `SELECT id, related_user_id, name, last_used_at
         FROM ledger52_t0_journal_related_funds
        WHERE ledger_id = ? AND user_id = ? AND is_active = 1
          AND NOT EXISTS (
            SELECT 1 FROM ledger52_t0_journal_deleted_dimensions deleted_user
             WHERE deleted_user.ledger_id = ledger52_t0_journal_related_funds.ledger_id
               AND deleted_user.user_id = ledger52_t0_journal_related_funds.user_id
               AND deleted_user.dimension = 'related_user'
               AND deleted_user.dimension_id = ledger52_t0_journal_related_funds.related_user_id
          )
        ORDER BY last_used_at IS NULL ASC, last_used_at DESC, updated_at DESC, id DESC
        LIMIT 200`,
      [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId],
    ) : conn.execute(
      `SELECT f.id, f.related_user_id, f.name, MAX(e.trade_time) AS last_used_at
         FROM ledger52_t0_journal_entries e
         INNER JOIN ledger52_t0_journal_related_funds f
           ON f.id = e.related_fund_id AND f.ledger_id = e.ledger_id AND f.user_id = e.user_id AND f.is_active = 1
        WHERE e.ledger_id = ? AND ${memberVisibilitySql}
        GROUP BY f.id, f.related_user_id, f.name
        ORDER BY last_used_at DESC, f.id DESC
        LIMIT 200`,
      [LEDGER_52_T0_JOURNAL_ID, ...memberVisibilityParams],
    ),
  ]);

  const entryRows = asRows(entryResult);
  const entryIds = entryRows.map((row) => toNumber(row.id)).filter((id) => id > 0);
  const [profitShareSnapshotResult, profitShareRuleResult, optionMarkPriceByEntryId, takeProfitPlansByEntryId] = await Promise.all([
    entryIds.length > 0
      ? conn.execute(
        `SELECT shared_entry.entry_id, shared_entry.opening_entry_id, shared_entry.source_user_id, shared_entry.related_fund_id,
                shared_entry.beneficiary_user_id, shared_entry.share_percentage, shared_entry.matched_quantity,
                COALESCE(NULLIF(source_user.name, ''), NULLIF(source_user.username, ''), CONCAT('用户#', shared_entry.source_user_id)) AS source_user_name,
                fund.name AS related_fund_name,
                COALESCE(NULLIF(beneficiary_user.name, ''), NULLIF(beneficiary_user.username, ''), CONCAT('用户#', shared_entry.beneficiary_user_id)) AS beneficiary_user_name
           FROM ledger52_t0_journal_entry_profit_shares shared_entry
           LEFT JOIN users source_user ON source_user.id = shared_entry.source_user_id
           LEFT JOIN ledger52_t0_journal_related_funds fund ON fund.id = shared_entry.related_fund_id AND fund.ledger_id = shared_entry.ledger_id AND fund.user_id = shared_entry.user_id
           LEFT JOIN users beneficiary_user ON beneficiary_user.id = shared_entry.beneficiary_user_id
          WHERE shared_entry.ledger_id = ? AND shared_entry.entry_id IN (${entryIds.map(() => "?").join(", ")})
          ORDER BY shared_entry.entry_id ASC, shared_entry.opening_entry_id ASC, shared_entry.id ASC`,
        [LEDGER_52_T0_JOURNAL_ID, ...entryIds],
      )
      : Promise.resolve([[]]),
    isAdminScope
      ? conn.execute(
        `SELECT rule_row.id, rule_row.source_user_id, rule_row.related_fund_id, rule_row.beneficiary_user_id, rule_row.share_percentage, rule_row.created_at,
                COALESCE(NULLIF(source_user.name, ''), NULLIF(source_user.username, ''), CONCAT('用户#', rule_row.source_user_id)) AS source_user_name,
                fund.name AS related_fund_name,
                COALESCE(NULLIF(beneficiary_user.name, ''), NULLIF(beneficiary_user.username, ''), CONCAT('用户#', rule_row.beneficiary_user_id)) AS beneficiary_user_name
           FROM ledger52_t0_journal_profit_share_rules rule_row
           LEFT JOIN users source_user ON source_user.id = rule_row.source_user_id
           LEFT JOIN ledger52_t0_journal_related_funds fund ON fund.id = rule_row.related_fund_id AND fund.ledger_id = rule_row.ledger_id AND fund.user_id = rule_row.user_id
           LEFT JOIN users beneficiary_user ON beneficiary_user.id = rule_row.beneficiary_user_id
          WHERE rule_row.ledger_id = ? AND rule_row.user_id = ? AND rule_row.is_active = 1
          ORDER BY rule_row.created_at DESC, rule_row.id DESC`,
        [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId],
      )
      : Promise.resolve([[]]),
    getT0CachedOptionMarkPrices(conn, entryRows),
    getTakeProfitPlansByEntryId(conn, entryIds),
  ]);

  const [sharedIncomeTransferResult, sharedIncomeReductionResult] = await Promise.all([
    conn.execute(
    `SELECT transfer.id, transfer.closing_entry_id, transfer.source_user_id, transfer.recipient_user_id,
            transfer.amount, transfer.source_net_pnl, transfer.manager_pool_amount, transfer.reduces_regular_distribution, transfer.created_at,
            COALESCE(NULLIF(source_user.name, ''), NULLIF(source_user.username, ''), CONCAT('用户#', transfer.source_user_id)) AS source_user_name,
            COALESCE(NULLIF(recipient_user.name, ''), NULLIF(recipient_user.username, ''), CONCAT('用户#', transfer.recipient_user_id)) AS recipient_user_name,
            recipient_user.username AS recipient_username
       FROM ledger52_t0_journal_shared_income_transfers transfer
       LEFT JOIN users source_user ON source_user.id = transfer.source_user_id
       LEFT JOIN users recipient_user ON recipient_user.id = transfer.recipient_user_id
      WHERE transfer.ledger_id = ?${isAdminScope ? ' AND transfer.user_id = ?' : ' AND transfer.recipient_user_id = ?'}
      ORDER BY transfer.created_at DESC, transfer.id DESC
      LIMIT 200`,
    isAdminScope
      ? [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId]
      : [LEDGER_52_T0_JOURNAL_ID, relatedUserId],
    ),
    entryIds.length > 0
      ? conn.execute(
        `SELECT closing_entry_id, COALESCE(SUM(amount), 0) AS total_amount, MAX(source_net_pnl) AS source_net_pnl
           FROM ledger52_t0_journal_shared_income_transfers
          WHERE ledger_id = ? AND reduces_regular_distribution = 1
            AND closing_entry_id IN (${entryIds.map(() => "?").join(", ")})
          GROUP BY closing_entry_id`,
        [LEDGER_52_T0_JOURNAL_ID, ...entryIds],
      )
      : Promise.resolve([[]]),
  ]);
  // 共享收益候选人仅按资金账本中已登记的“投入”判断是否已出本金；管理员端一次读取全部用户汇总。
  const [payoutDepositTotalResult] = isAdminScope
    ? await conn.execute(
      `SELECT related_user_id, COALESCE(SUM(amount), 0) AS cumulative_deposit_amount
         FROM ledger52_t0_journal_payout_logs
        WHERE ledger_id = ? AND user_id = ? AND direction = 'deposit'
        GROUP BY related_user_id`,
      [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId],
    )
    : [[]];
  const [payoutCashFlowResult] = isAdminScope
    ? await conn.execute(
      `SELECT related_user_id, DATE_FORMAT(occurred_on, '%Y-%m-%d') AS occurred_on, direction, amount
         FROM ledger52_t0_journal_payout_logs
        WHERE ledger_id = ? AND user_id = ?
        ORDER BY occurred_on ASC, id ASC`,
      [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId],
    )
    : [[]];

  return {
    viewerMode: scope.mode,
    viewerRelatedUserId: isAdminScope ? undefined : relatedUserId,
    // 管理员以账本实际所有者作为收益分成受益人；成员始终以本人关联用户身份计算本单可得。
    viewerProfitShareBeneficiaryUserId: isAdminScope ? journalOwnerUserId : relatedUserId,
    // 普通成员不读取推荐下线名单，避免推荐关系成为订单访问权。
    viewerReferralDescendantUserIds: [],
    accounts: asRows(accountResult).map(mapAccount),
    // 成员端只读，但需完整知悉自己订单的锁定与挂单状态；写权限仍由路由层管理员鉴权严格限制。
    entries: entryRows.map((entry) => mapEntry({
      ...entry,
      option_mark_price: optionMarkPriceByEntryId.get(toNumber(entry.id)),
      take_profit_plans: takeProfitPlansByEntryId.get(toNumber(entry.id)) ?? [],
    })),
    recentUsers: asRows(recentUserResult).map(mapRelatedUser),
    relatedFunds: asRows(relatedFundResult).map(mapRelatedFund),
    profitShareSnapshots: asRows(profitShareSnapshotResult).map(mapProfitShareSnapshot),
    profitShareRules: asRows(profitShareRuleResult).map(mapProfitShareRule),
    sharedIncomeTransfers: asRows(sharedIncomeTransferResult).map((transfer) => ({
      id: String(transfer.id),
      closingEntryId: String(transfer.closing_entry_id),
      sourceUserId: toNumber(transfer.source_user_id),
      sourceUserName: String(transfer.source_user_name || `用户#${toNumber(transfer.source_user_id)}`),
      recipientUserId: toNumber(transfer.recipient_user_id),
      recipientUserName: String(transfer.recipient_user_name || `用户#${toNumber(transfer.recipient_user_id)}`),
      recipientUsername: transfer.recipient_username ? String(transfer.recipient_username) : undefined,
      amount: toNumber(transfer.amount),
      sourceNetPnl: toNumber(transfer.source_net_pnl),
      // 字段名沿用旧列以兼容已有数据库；新语义是本单可共享的正向净收益上限。
      shareableAmount: toNumber(transfer.manager_pool_amount),
      reducesRegularDistribution: Boolean(toNumber(transfer.reduces_regular_distribution)),
      createdAt: isoTime(transfer.created_at),
    })),
    sharedIncomeReductions: asRows(sharedIncomeReductionResult).map((row) => ({
      closingEntryId: String(row.closing_entry_id),
      amount: toNumber(row.total_amount),
      sourceNetPnl: toNumber(row.source_net_pnl),
    })),
    payoutDepositTotals: asRows(payoutDepositTotalResult).map((row) => ({
      relatedUserId: toNumber(row.related_user_id),
      cumulativeDepositAmount: toNumber(row.cumulative_deposit_amount),
    })),
    payoutCashFlows: asRows(payoutCashFlowResult).map((row) => ({
      relatedUserId: toNumber(row.related_user_id),
      occurredOn: String(row.occurred_on || "").slice(0, 10),
      direction: String(row.direction) === "deposit" ? "deposit" : "withdrawal",
      amount: toNumber(row.amount),
    })),
    recoverableEntries: asRows(recoverableAuditResult)
      .map(mapRecoverableAudit)
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  };
}

function mapT0JournalPayoutLog(row: any): T0JournalPayoutLog {
  return {
    id: String(row.id),
    relatedUserId: toNumber(row.related_user_id),
    relatedUserName: String(row.related_user_name || `用户#${toNumber(row.related_user_id)}`),
    occurredOn: String(row.occurred_on || "").slice(0, 10),
    direction: String(row.direction) === "deposit" ? "deposit" : "withdrawal",
    amount: toNumber(row.amount),
    note: String(row.note || "").trim() || undefined,
    createdAt: isoTime(row.created_at),
  };
}

/**
 * 收益转出日志与订单收益严格分表：它只服务对账，绝不回写或扣减订单净收益。
 * 成员端无论当前筛选如何变化，始终只能读取自己名下的共享日志。
 */
export async function getLedger52T0JournalPayoutLogs(input: {
  scope: T0JournalReadScope;
  relatedUserId?: number;
  allUsers?: boolean;
}) {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  await ensureLedger52T0JournalTables(conn);
  const requestedRelatedUserId = Number(input.relatedUserId || 0);
  const adminScope = input.scope.mode === "admin" ? input.scope : null;
  const memberScope = input.scope.mode === "member" ? input.scope : null;
  const readAllUsers = Boolean(adminScope && input.allUsers);
  const relatedUserId = readAllUsers ? 0 : (adminScope ? requestedRelatedUserId : memberScope?.relatedUserId || 0);
  if (!readAllUsers && (!Number.isInteger(relatedUserId) || relatedUserId <= 0)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请先选择一位关联用户后查看资金流水" });
  }
  const sql = readAllUsers
    ? `SELECT payout.id, payout.related_user_id, DATE_FORMAT(payout.occurred_on, '%Y-%m-%d') AS occurred_on,
              payout.amount, payout.direction, payout.note, payout.created_at,
              COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', payout.related_user_id)) AS related_user_name
         FROM ledger52_t0_journal_payout_logs payout
         LEFT JOIN users u ON u.id = payout.related_user_id
        WHERE payout.ledger_id = ? AND payout.user_id = ?
        ORDER BY payout.occurred_on DESC, payout.id DESC
        LIMIT 5000`
    : adminScope
    ? `SELECT payout.id, payout.related_user_id, DATE_FORMAT(payout.occurred_on, '%Y-%m-%d') AS occurred_on,
              payout.amount, payout.direction, payout.note, payout.created_at,
              COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', payout.related_user_id)) AS related_user_name
         FROM ledger52_t0_journal_payout_logs payout
         LEFT JOIN users u ON u.id = payout.related_user_id
        WHERE payout.ledger_id = ? AND payout.user_id = ? AND payout.related_user_id = ?
        ORDER BY payout.occurred_on DESC, payout.id DESC
        LIMIT 500`
    : `SELECT payout.id, payout.related_user_id, DATE_FORMAT(payout.occurred_on, '%Y-%m-%d') AS occurred_on,
              payout.amount, payout.direction, payout.note, payout.created_at,
              COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', payout.related_user_id)) AS related_user_name
         FROM ledger52_t0_journal_payout_logs payout
         LEFT JOIN users u ON u.id = payout.related_user_id
        WHERE payout.ledger_id = ? AND payout.related_user_id = ?
        ORDER BY payout.occurred_on DESC, payout.id DESC
        LIMIT 500`;
  const params = readAllUsers
    ? [LEDGER_52_T0_JOURNAL_ID, adminScope!.journalOwnerUserId]
    : adminScope
    ? [LEDGER_52_T0_JOURNAL_ID, adminScope.journalOwnerUserId, relatedUserId]
    : [LEDGER_52_T0_JOURNAL_ID, relatedUserId];
  const [rows] = await conn.execute(sql, params);
  return asRows(rows).map(mapT0JournalPayoutLog);
}

/** 管理员新增投入/提现资金流水；仅提现受当前可见总收益上限约束，服务器锁定已有提现记录防止并发穿透。 */
export async function createLedger52T0JournalPayoutLog(input: {
  journalOwnerUserId: number;
  operatorUserId: number;
  relatedUserId: number;
  occurredOn: string;
  amount: string;
  direction: T0JournalPayoutDirection;
  note?: string;
  maximumTotalAmount?: string;
}) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;
  const relatedUserId = Number(input.relatedUserId);
  const occurredOn = String(input.occurredOn || "").trim();
  const amountText = String(input.amount || "").trim();
  const direction: T0JournalPayoutDirection = input.direction === "deposit" ? "deposit" : "withdrawal";
  const limitText = String(input.maximumTotalAmount || "").trim();
  const amount = Number(amountText);
  const maximumTotalAmount = Number(limitText);
  if (!Number.isInteger(relatedUserId) || relatedUserId <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "请选择有效的关联用户" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn) || Number.isNaN(new Date(`${occurredOn}T00:00:00Z`).getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请选择有效的登记日期" });
  }
  if (!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount) || amount <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "登记金额须为最多两位小数的正数" });
  }
  if (direction === "withdrawal" && (!Number.isFinite(maximumTotalAmount) || maximumTotalAmount < 0)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "当前总收益无效，请刷新后重试" });
  }
  const note = String(input.note || "").trim();
  if (note.length > 300) throw new TRPCError({ code: "BAD_REQUEST", message: "备注最多300个字符" });
  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    await assertExistingGlobalUser(tx, relatedUserId, "关联用户");
    if (direction === "withdrawal") {
      const [sumRows] = await tx.execute(
        `SELECT COALESCE(SUM(amount), 0) AS total_amount
           FROM ledger52_t0_journal_payout_logs
          WHERE ledger_id = ? AND user_id = ? AND related_user_id = ? AND direction = 'withdrawal' FOR UPDATE`,
        [LEDGER_52_T0_JOURNAL_ID, input.journalOwnerUserId, relatedUserId],
      );
      const existingTotal = toNumber(asRows(sumRows)[0]?.total_amount);
      // 提现金额上限采用保存瞬间的当前用户“总收益”口径；投入资金从不占用收益提现额度。
      if (existingTotal + amount > maximumTotalAmount + 0.005) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `累计提现 ${(existingTotal + amount).toFixed(2)} U 将超过当前总收益 ${maximumTotalAmount.toFixed(2)} U`,
        });
      }
    }
    const [result] = await tx.execute(
      `INSERT INTO ledger52_t0_journal_payout_logs
        (ledger_id, user_id, related_user_id, occurred_on, amount, direction, note, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [LEDGER_52_T0_JOURNAL_ID, input.journalOwnerUserId, relatedUserId, occurredOn, amountText, direction, note || null, input.operatorUserId],
    );
    const insertedId = toNumber((result as any)?.insertId);
    const [rows] = await tx.execute(
      `SELECT payout.id, payout.related_user_id, DATE_FORMAT(payout.occurred_on, '%Y-%m-%d') AS occurred_on,
              payout.amount, payout.direction, payout.note, payout.created_at,
              COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', payout.related_user_id)) AS related_user_name
         FROM ledger52_t0_journal_payout_logs payout
         LEFT JOIN users u ON u.id = payout.related_user_id
        WHERE payout.id = ? AND payout.ledger_id = ? AND payout.user_id = ? LIMIT 1`,
      [insertedId, LEDGER_52_T0_JOURNAL_ID, input.journalOwnerUserId],
    );
    const row = asRows(rows)[0];
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "资金流水写入后读取失败" });
    await tx.commit();
    return mapT0JournalPayoutLog(row);
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}

/** 编辑既有资金流水；目标用户不可跨当前筛选范围移动，提现编辑后仍按最新总收益重新校验。 */
export async function updateLedger52T0JournalPayoutLog(input: {
  journalOwnerUserId: number;
  relatedUserId: number;
  payoutLogId: string;
  occurredOn: string;
  amount: string;
  direction: T0JournalPayoutDirection;
  note?: string;
  maximumTotalAmount?: string;
}) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;
  const relatedUserId = Number(input.relatedUserId);
  const payoutLogId = Number(input.payoutLogId);
  const occurredOn = String(input.occurredOn || "").trim();
  const amountText = String(input.amount || "").trim();
  const direction: T0JournalPayoutDirection = input.direction === "deposit" ? "deposit" : "withdrawal";
  const amount = Number(amountText);
  const maximumTotalAmount = Number(String(input.maximumTotalAmount || "").trim());
  if (!Number.isInteger(relatedUserId) || relatedUserId <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "请选择有效的关联用户" });
  if (!Number.isInteger(payoutLogId) || payoutLogId <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "资金流水记录无效" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn) || Number.isNaN(new Date(`${occurredOn}T00:00:00Z`).getTime())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请选择有效的登记日期" });
  }
  if (!/^(?:0|[1-9]\d{0,14})(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount) || amount <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "登记金额须为最多两位小数的正数" });
  }
  if (direction === "withdrawal" && (!Number.isFinite(maximumTotalAmount) || maximumTotalAmount < 0)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "当前总收益无效，请刷新后重试" });
  }
  const note = String(input.note || "").trim();
  if (note.length > 300) throw new TRPCError({ code: "BAD_REQUEST", message: "备注最多300个字符" });
  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const [existingRows] = await tx.execute(
      `SELECT id FROM ledger52_t0_journal_payout_logs
        WHERE id = ? AND ledger_id = ? AND user_id = ? AND related_user_id = ? FOR UPDATE`,
      [payoutLogId, LEDGER_52_T0_JOURNAL_ID, input.journalOwnerUserId, relatedUserId],
    );
    if (!asRows(existingRows)[0]) throw new TRPCError({ code: "NOT_FOUND", message: "未找到可编辑的资金流水记录" });
    if (direction === "withdrawal") {
      const [sumRows] = await tx.execute(
        `SELECT COALESCE(SUM(amount), 0) AS total_amount
           FROM ledger52_t0_journal_payout_logs
          WHERE ledger_id = ? AND user_id = ? AND related_user_id = ? AND direction = 'withdrawal' AND id <> ? FOR UPDATE`,
        [LEDGER_52_T0_JOURNAL_ID, input.journalOwnerUserId, relatedUserId, payoutLogId],
      );
      const otherWithdrawalTotal = toNumber(asRows(sumRows)[0]?.total_amount);
      if (otherWithdrawalTotal + amount > maximumTotalAmount + 0.005) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `累计提现 ${(otherWithdrawalTotal + amount).toFixed(2)} U 将超过当前总收益 ${maximumTotalAmount.toFixed(2)} U`,
        });
      }
    }
    await tx.execute(
      `UPDATE ledger52_t0_journal_payout_logs
          SET occurred_on = ?, amount = ?, direction = ?, note = ?
        WHERE id = ? AND ledger_id = ? AND user_id = ? AND related_user_id = ?`,
      [occurredOn, amountText, direction, note || null, payoutLogId, LEDGER_52_T0_JOURNAL_ID, input.journalOwnerUserId, relatedUserId],
    );
    const [rows] = await tx.execute(
      `SELECT payout.id, payout.related_user_id, DATE_FORMAT(payout.occurred_on, '%Y-%m-%d') AS occurred_on,
              payout.amount, payout.direction, payout.note, payout.created_at,
              COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', payout.related_user_id)) AS related_user_name
         FROM ledger52_t0_journal_payout_logs payout
         LEFT JOIN users u ON u.id = payout.related_user_id
        WHERE payout.id = ? AND payout.ledger_id = ? AND payout.user_id = ? LIMIT 1`,
      [payoutLogId, LEDGER_52_T0_JOURNAL_ID, input.journalOwnerUserId],
    );
    const row = asRows(rows)[0];
    if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "资金流水更新后读取失败" });
    await tx.commit();
    return mapT0JournalPayoutLog(row);
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}

/** 删除当前用户范围内的一笔资金流水。 */
export async function deleteLedger52T0JournalPayoutLog(input: {
  journalOwnerUserId: number;
  relatedUserId: number;
  payoutLogId: string;
}) {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const relatedUserId = Number(input.relatedUserId);
  const payoutLogId = Number(input.payoutLogId);
  if (!Number.isInteger(relatedUserId) || relatedUserId <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "请选择有效的关联用户" });
  if (!Number.isInteger(payoutLogId) || payoutLogId <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "资金流水记录无效" });
  await ensureLedger52T0JournalTables(conn);
  const [result] = await conn.execute(
    `DELETE FROM ledger52_t0_journal_payout_logs
      WHERE id = ? AND ledger_id = ? AND user_id = ? AND related_user_id = ?`,
    [payoutLogId, LEDGER_52_T0_JOURNAL_ID, input.journalOwnerUserId, relatedUserId],
  );
  if (toNumber((result as any)?.affectedRows) !== 1) throw new TRPCError({ code: "NOT_FOUND", message: "未找到可删除的资金流水记录" });
  return { id: String(payoutLogId) };
}

/** 仅保留当前 T+0 范围中真实存在订单的关联用户，避免将无订单的推荐关系带入筛选或可见范围。 */
async function getLedger52T0AdminSelectableRelatedUserIds(conn: any, journalOwnerUserId: number) {
  const [candidateRows] = await conn.execute(
    `SELECT DISTINCT e.related_user_id AS user_id
       FROM ledger52_t0_journal_entries e
      WHERE e.ledger_id = ? AND e.user_id = ? AND e.related_user_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
            FROM ledger52_t0_journal_deleted_dimensions deleted_user
           WHERE deleted_user.ledger_id = e.ledger_id
             AND deleted_user.user_id = e.user_id
             AND deleted_user.dimension = 'related_user'
             AND deleted_user.dimension_id = e.related_user_id
        )
      ORDER BY e.related_user_id ASC
      LIMIT 2000`,
    [LEDGER_52_T0_JOURNAL_ID, journalOwnerUserId],
  );
  return Array.from(new Set(
    asRows(candidateRows)
      .map((row) => toNumber(row.user_id))
      .filter((userId) => userId > 0),
  ));
}

/**
 * 以 users.invited_by_user_id 为唯一权威来源，逐批 BFS 展开全部层级；
 * 返回值不含根用户，并且只保留当前 T+0 查询范围中实际可命中的用户。
 */
async function getLedger52T0ReferralDescendantUserIds(conn: any, rootUserId: number, selectableUserIds: number[]) {
  if (rootUserId <= 0 || selectableUserIds.length === 0) return [];
  const selectableUserIdSet = new Set(selectableUserIds);
  const visitedUserIds = new Set<number>([rootUserId]);
  const descendants: number[] = [];
  let frontier = [rootUserId];
  let depth = 0;
  const MAX_REFERRAL_DEPTH = 100;
  const MAX_TRAVERSED_USERS = 10_000;

  while (frontier.length > 0) {
    if (depth >= MAX_REFERRAL_DEPTH || visitedUserIds.size >= MAX_TRAVERSED_USERS) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "推荐关系层级过深或人数过多，暂不能安全生成全部推荐筛选",
      });
    }
    const currentLevel = frontier;
    frontier = [];
    depth += 1;

    for (let start = 0; start < currentLevel.length; start += 100) {
      const batch = currentLevel.slice(start, start + 100);
      const placeholders = batch.map(() => "?").join(", ");
      const [childRows] = await conn.execute(
        `SELECT id
           FROM users
          WHERE invited_by_user_id IN (${placeholders})`,
        batch,
      );
      for (const row of asRows(childRows)) {
        const childUserId = toNumber(row.id);
        if (childUserId <= 0 || visitedUserIds.has(childUserId)) continue;
        visitedUserIds.add(childUserId);
        frontier.push(childUserId);
        if (selectableUserIdSet.has(childUserId)) descendants.push(childUserId);
      }
    }
  }
  return descendants.sort((left, right) => left - right);
}

/**
 * 推荐筛选仅供管理员在自己的完整管理视图中使用，不向普通成员下发下线名单或订单访问权。
 */
export async function getLedger52T0JournalReferralFilterOptions(scope: T0JournalReadScope): Promise<{
  rootUserId: number | null;
  descendantsByUserId: Record<string, number[]>;
  descendantUsers: Array<{ id: number; name: string; username: string; avatar: string | null }>;
}> {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  await ensureLedger52T0JournalTables(conn);

  const rootUserId = scope.mode === "admin" ? scope.journalOwnerUserId : scope.relatedUserId;
  const descendants = scope.mode === "admin"
    ? await getLedger52T0ReferralDescendantUserIds(
      conn,
      rootUserId,
      await getLedger52T0AdminSelectableRelatedUserIds(conn, scope.journalOwnerUserId),
    )
    : [];
  const descendantUsers = descendants.length > 0
    ? (() => conn.execute(
      `SELECT id, name, username, avatar
         FROM users
        WHERE id IN (${descendants.map(() => "?").join(", ")})
        ORDER BY id ASC`,
      descendants,
    ).then(([rows]: any) => asRows(rows).map((row) => {
      const userId = toNumber(row.id);
      const username = row.username ? String(row.username) : "";
      return {
        id: userId,
        name: String(row.name || username || `用户#${userId}`),
        username,
        avatar: row.avatar ? String(row.avatar) : null,
      };
    })))()
    : [];
  return {
    rootUserId,
    descendantsByUserId: descendants.length > 0
      ? { [String(rootUserId)]: descendants }
      : {},
    descendantUsers: await descendantUsers,
  };
}

/** 仅由已通过T+0管理员鉴权的路由调用，供关联用户的用户名/昵称模糊搜索使用。 */
export async function searchLedger52T0JournalUsers(query: string) {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "用户搜索服务暂不可用" });
  const keyword = String(query || "").trim();
  if (!keyword) return [];
  const like = `%${keyword}%`;
  const [result] = await conn.execute(
    `SELECT id, username, name, avatar
       FROM users
      WHERE COALESCE(username, '') LIKE ? OR COALESCE(name, '') LIKE ?
      ORDER BY
        CASE WHEN username = ? THEN 0 WHEN name = ? THEN 1 ELSE 2 END,
        username ASC, id ASC
      LIMIT 20`,
    [like, like, keyword, keyword],
  );
  return asRows(result).map(mapRelatedUser);
}

function normalizeProfitSharePercentage(value: number): number {
  const percentage = Number(value);
  if (!Number.isInteger(percentage) || percentage < 1 || percentage > 100) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "每位收益分配人比例必须为1至100的整数" });
  }
  return percentage;
}

async function assertExistingGlobalUser(tx: any, userId: number, label: string) {
  const [rows] = await tx.execute(`SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE`, [userId]);
  if (!asRows(rows)[0]) throw new TRPCError({ code: "NOT_FOUND", message: `${label}不存在或已失效，请重新搜索选择` });
}

async function getActiveLedger52T0JournalProfitShareRules(tx: any, input: { actorUserId: number; relatedFundId: number; lock?: boolean }) {
  const [rows] = await tx.execute(
    `SELECT id, source_user_id, related_fund_id, beneficiary_user_id, share_percentage, created_at
       FROM ledger52_t0_journal_profit_share_rules
      WHERE ledger_id = ? AND user_id = ? AND related_fund_id = ? AND is_active = 1
      ORDER BY beneficiary_user_id ASC, id ASC${input.lock ? " FOR UPDATE" : ""}`,
    [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.relatedFundId],
  );
  return asRows(rows);
}

/**
 * 将完整的多人比例清单另存为新版本，并同步仍有剩余仓位的开仓快照。
 * 已全部平仓的开仓与所有已生成平仓流水均保持不可变历史快照。
 */
export async function setLedger52T0JournalProfitShareRules(input: {
  actorUserId: number;
  relatedFundId?: number;
  relatedUserId?: number;
  relatedFundName?: string;
  allocations: Array<{ beneficiaryUserId: number; percentage: number }>;
}) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;
  const requestedFundId = Number(input.relatedFundId || 0);
  const requestedRelatedUserId = Number(input.relatedUserId || 0);
  const requestedFundName = String(input.relatedFundName || "").trim();
  if ((!Number.isInteger(requestedFundId) || requestedFundId <= 0)
    && (!Number.isInteger(requestedRelatedUserId) || requestedRelatedUserId <= 0 || !requestedFundName)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请选择已有项目，或填写新项目名称后设置收益分配" });
  }
  const normalizedAllocations = input.allocations.map((allocation) => ({
    beneficiaryUserId: Number(allocation.beneficiaryUserId),
    percentage: normalizeProfitSharePercentage(allocation.percentage),
  }));
  if (normalizedAllocations.length === 0 || normalizedAllocations.length > 20) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请设置1至20位收益分配人" });
  }
  const beneficiaryIds = new Set<number>();
  for (const allocation of normalizedAllocations) {
    if (!Number.isInteger(allocation.beneficiaryUserId) || allocation.beneficiaryUserId <= 0 || beneficiaryIds.has(allocation.beneficiaryUserId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "收益分配人不能重复，且必须来自全局用户库" });
    }
    beneficiaryIds.add(allocation.beneficiaryUserId);
  }
  const totalPercentage = normalizedAllocations.reduce((total, allocation) => total + allocation.percentage, 0);
  if (Math.abs(totalPercentage - 100) > 0.00001) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `收益分配合计必须为100%，当前为${totalPercentage.toFixed(4).replace(/\.0+$/, "")}%` });
  }
  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    let relatedFundId = requestedFundId;
    let sourceUserId = 0;
    if (relatedFundId > 0) {
      const [fundRows] = await tx.execute(
        `SELECT related_user_id FROM ledger52_t0_journal_related_funds
          WHERE id = ? AND ledger_id = ? AND user_id = ? AND is_active = 1 LIMIT 1 FOR UPDATE`,
        [relatedFundId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      );
      sourceUserId = toNumber(asRows(fundRows)[0]?.related_user_id);
      if (sourceUserId <= 0) throw new TRPCError({ code: "NOT_FOUND", message: "项目不存在、已停用或不属于当前账本" });
    } else {
      await assertExistingGlobalUser(tx, requestedRelatedUserId, "关联用户");
      const fund = await resolveLedger52T0JournalRelatedFund(tx, {
        actorUserId: input.actorUserId,
        relatedUserId: requestedRelatedUserId,
        relatedFundName: requestedFundName,
        required: true,
      });
      if (!fund) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "新项目创建失败" });
      relatedFundId = fund.id;
      sourceUserId = requestedRelatedUserId;
    }
    for (const allocation of normalizedAllocations) {
      await assertExistingGlobalUser(tx, allocation.beneficiaryUserId, "收益分配人");
    }
    const activeRules = await getActiveLedger52T0JournalProfitShareRules(tx, {
      actorUserId: input.actorUserId,
      relatedFundId,
      lock: true,
    });
    const orderedAllocations = [...normalizedAllocations].sort((a, b) => a.beneficiaryUserId - b.beneficiaryUserId);
    const unchanged = activeRules.length === orderedAllocations.length && activeRules.every((rule, index) => (
      toNumber(rule.beneficiary_user_id) === orderedAllocations[index].beneficiaryUserId
      && Math.abs(toNumber(rule.share_percentage) - orderedAllocations[index].percentage) < 0.00001
    ));
    let rulesForSnapshots = activeRules;
    if (activeRules.length > 0) {
      if (!unchanged) {
        await tx.execute(
          `UPDATE ledger52_t0_journal_profit_share_rules
              SET is_active = 0, ended_at = NOW(3), updated_at = NOW(3)
            WHERE ledger_id = ? AND user_id = ? AND related_fund_id = ? AND is_active = 1`,
          [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, relatedFundId],
        );
      }
    }
    if (!unchanged) {
      for (const allocation of orderedAllocations) {
        await tx.execute(
          `INSERT INTO ledger52_t0_journal_profit_share_rules
            (ledger_id, user_id, source_user_id, related_fund_id, beneficiary_user_id, share_percentage, is_active, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
          [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, sourceUserId, relatedFundId, allocation.beneficiaryUserId, allocation.percentage, input.actorUserId],
        );
      }
      rulesForSnapshots = await getActiveLedger52T0JournalProfitShareRules(tx, {
        actorUserId: input.actorUserId,
        relatedFundId,
        lock: true,
      });
    }
    const ruleIdByBeneficiary = new Map<number, number>(
      rulesForSnapshots.map((rule) => [toNumber(rule.beneficiary_user_id), toNumber(rule.id)]),
    );
    const syncedActiveOpeningCount = await syncActiveOpeningProfitShareSnapshotsForFund(tx, {
      actorUserId: input.actorUserId,
      relatedFundId,
      sourceUserId,
      allocations: orderedAllocations,
      ruleIdByBeneficiary,
    });
    const [rows] = await tx.execute(
      `SELECT rule_row.id, rule_row.source_user_id, rule_row.related_fund_id, rule_row.beneficiary_user_id, rule_row.share_percentage, rule_row.created_at,
              COALESCE(NULLIF(source_user.name, ''), NULLIF(source_user.username, ''), CONCAT('用户#', rule_row.source_user_id)) AS source_user_name,
              fund.name AS related_fund_name,
              COALESCE(NULLIF(beneficiary_user.name, ''), NULLIF(beneficiary_user.username, ''), CONCAT('用户#', rule_row.beneficiary_user_id)) AS beneficiary_user_name
         FROM ledger52_t0_journal_profit_share_rules rule_row
         LEFT JOIN users source_user ON source_user.id = rule_row.source_user_id
         LEFT JOIN ledger52_t0_journal_related_funds fund ON fund.id = rule_row.related_fund_id AND fund.ledger_id = rule_row.ledger_id AND fund.user_id = rule_row.user_id
         LEFT JOIN users beneficiary_user ON beneficiary_user.id = rule_row.beneficiary_user_id
        WHERE rule_row.ledger_id = ? AND rule_row.user_id = ? AND rule_row.related_fund_id = ? AND rule_row.is_active = 1
        ORDER BY rule_row.beneficiary_user_id ASC, rule_row.id ASC`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, relatedFundId],
    );
    const rules = asRows(rows);
    if (rules.length !== orderedAllocations.length) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "收益分配规则读取失败" });
    await tx.commit();
    return { rules: rules.map(mapProfitShareRule), syncedActiveOpeningCount };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}

function normalizeOpeningProfitShareAllocations(allocations: Array<{ beneficiaryUserId: number; percentage: number }>) {
  const normalized = allocations.map((allocation) => ({
    beneficiaryUserId: Number(allocation.beneficiaryUserId),
    percentage: normalizeProfitSharePercentage(allocation.percentage),
  }));
  if (normalized.length === 0 || normalized.length > 20) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请设置1至20位收益分配人" });
  }
  const beneficiaryIds = new Set<number>();
  for (const allocation of normalized) {
    if (!Number.isInteger(allocation.beneficiaryUserId) || allocation.beneficiaryUserId <= 0 || beneficiaryIds.has(allocation.beneficiaryUserId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "收益分配人不能重复，且必须来自全局用户库" });
    }
    beneficiaryIds.add(allocation.beneficiaryUserId);
  }
  const totalPercentage = normalized.reduce((total, allocation) => total + allocation.percentage, 0);
  if (Math.abs(totalPercentage - 100) > 0.00001) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `收益分配合计必须为100%，当前为${totalPercentage.toFixed(4).replace(/\.0+$/, "")}%` });
  }
  return [...normalized].sort((left, right) => left.beneficiaryUserId - right.beneficiaryUserId);
}

async function replaceOpeningProfitShareSnapshots(tx: any, input: {
  actorUserId: number;
  entryId: number;
  sourceUserId: number;
  relatedFundId: number;
  remainingQuantity: string;
  allocations: Array<{ beneficiaryUserId: number; percentage: number }>;
  ruleIdByBeneficiary: ReadonlyMap<number, number>;
}) {
  await tx.execute(
    `DELETE FROM ledger52_t0_journal_entry_profit_shares
      WHERE ledger_id = ? AND user_id = ? AND entry_id = ? AND opening_entry_id = ?`,
    [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.entryId, input.entryId],
  );
  for (const allocation of input.allocations) {
    await tx.execute(
      `INSERT INTO ledger52_t0_journal_entry_profit_shares
        (ledger_id, user_id, entry_id, opening_entry_id, source_user_id, related_fund_id, beneficiary_user_id, profit_share_rule_id, share_percentage, matched_quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        LEDGER_52_T0_JOURNAL_ID,
        input.actorUserId,
        input.entryId,
        input.entryId,
        input.sourceUserId,
        input.relatedFundId,
        allocation.beneficiaryUserId,
        input.ruleIdByBeneficiary.get(allocation.beneficiaryUserId) || null,
        allocation.percentage,
        input.remainingQuantity,
      ],
    );
  }
}

/** 项目规则保存时，仅同步仍有可平余额的开仓主单；已平历史绝不回写。 */
async function syncActiveOpeningProfitShareSnapshotsForFund(tx: any, input: {
  actorUserId: number;
  relatedFundId: number;
  sourceUserId: number;
  allocations: Array<{ beneficiaryUserId: number; percentage: number }>;
  ruleIdByBeneficiary: ReadonlyMap<number, number>;
}) {
  const [candidateRows] = await tx.execute(
    `SELECT id
       FROM ledger52_t0_journal_entries
      WHERE ledger_id = ? AND user_id = ? AND related_fund_id = ?
        AND action IN ('openLong', 'openShort') AND execution_status = 'filled'
      ORDER BY created_at ASC, id ASC FOR UPDATE`,
    [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.relatedFundId],
  );
  let syncedCount = 0;
  for (const row of asRows(candidateRows)) {
    const entryId = toNumber(row.id);
    if (entryId <= 0) continue;
    const lockedEntry = await lockEditableOpeningEntry(tx, input.actorUserId, entryId, { allowDependentClose: true });
    if (lockedEntry.remainingCents <= 0) continue;
    const beforeForAudit = await buildEntryAuditSnapshot(tx, input.actorUserId, lockedEntry.entry);
    await replaceOpeningProfitShareSnapshots(tx, {
      actorUserId: input.actorUserId,
      entryId,
      sourceUserId: input.sourceUserId,
      relatedFundId: input.relatedFundId,
      remainingQuantity: (lockedEntry.remainingCents / 100).toFixed(2),
      allocations: input.allocations,
      ruleIdByBeneficiary: input.ruleIdByBeneficiary,
    });
    const afterForAudit = await buildEntryAuditSnapshot(tx, input.actorUserId, lockedEntry.entry);
    if (JSON.stringify(beforeForAudit.profitShareSnapshots) !== JSON.stringify(afterForAudit.profitShareSnapshots)) {
      await writeEntryAudit(tx, {
        actorUserId: input.actorUserId,
        entryId,
        operation: "update",
        before: beforeForAudit,
        after: afterForAudit,
      });
      syncedCount += 1;
    }
  }
  return syncedCount;
}

/**
 * 编辑一张尚有余额的开仓单：只重写该开仓主单自身的快照，并同步项目的未来开仓规则。
 * 已生成的平仓流水拥有独立 entry_id 快照，绝不可删除或更新，因此历史分配永久固定。
 */
async function updateOpeningProfitShareSnapshotsAndFutureRules(tx: any, input: {
  actorUserId: number;
  entryId: number;
  before: any;
  remainingQuantity: string;
  allocations: Array<{ beneficiaryUserId: number; percentage: number }>;
}) {
  const sourceUserId = toNumber(input.before.related_user_id);
  const relatedFundId = toNumber(input.before.related_fund_id);
  if (sourceUserId <= 0 || relatedFundId <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "仅已关联用户和项目的持仓单可以编辑收益分配" });
  }
  const normalizedAllocations = normalizeOpeningProfitShareAllocations(input.allocations);
  const [fundRows] = await tx.execute(
    `SELECT related_user_id FROM ledger52_t0_journal_related_funds
      WHERE id = ? AND ledger_id = ? AND user_id = ? AND is_active = 1 LIMIT 1 FOR UPDATE`,
    [relatedFundId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
  );
  if (toNumber(asRows(fundRows)[0]?.related_user_id) !== sourceUserId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "本单关联项目不存在、已停用或归属已变化" });
  }
  for (const allocation of normalizedAllocations) {
    await assertExistingGlobalUser(tx, allocation.beneficiaryUserId, "收益分配人");
  }

  const activeRules = await getActiveLedger52T0JournalProfitShareRules(tx, {
    actorUserId: input.actorUserId,
    relatedFundId,
    lock: true,
  });
  const unchanged = activeRules.length === normalizedAllocations.length && activeRules.every((rule, index) => (
    toNumber(rule.beneficiary_user_id) === normalizedAllocations[index].beneficiaryUserId
    && Math.abs(toNumber(rule.share_percentage) - normalizedAllocations[index].percentage) < 0.00001
  ));
  let rulesForSnapshot = activeRules;
  if (!unchanged) {
    if (activeRules.length > 0) {
      await tx.execute(
        `UPDATE ledger52_t0_journal_profit_share_rules
            SET is_active = 0, ended_at = NOW(3), updated_at = NOW(3)
          WHERE ledger_id = ? AND user_id = ? AND related_fund_id = ? AND is_active = 1`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, relatedFundId],
      );
    }
    for (const allocation of normalizedAllocations) {
      await tx.execute(
        `INSERT INTO ledger52_t0_journal_profit_share_rules
          (ledger_id, user_id, source_user_id, related_fund_id, beneficiary_user_id, share_percentage, is_active, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, sourceUserId, relatedFundId, allocation.beneficiaryUserId, allocation.percentage, input.actorUserId],
      );
    }
    rulesForSnapshot = await getActiveLedger52T0JournalProfitShareRules(tx, {
      actorUserId: input.actorUserId,
      relatedFundId,
      lock: true,
    });
  }
  const ruleIdByBeneficiary = new Map<number, number>(
    rulesForSnapshot.map((rule) => [toNumber(rule.beneficiary_user_id), toNumber(rule.id)]),
  );

  // 只替换开仓本身的快照；entry_id 为平仓流水的记录保持不动，确保历史已平不被回改。
  await replaceOpeningProfitShareSnapshots(tx, {
    actorUserId: input.actorUserId,
    entryId: input.entryId,
    sourceUserId,
    relatedFundId,
    remainingQuantity: input.remainingQuantity,
    allocations: normalizedAllocations,
    ruleIdByBeneficiary,
  });
}

/**
 * 持仓编辑页专用的单次分配保存：本单剩余仓位快照与项目未来新开仓规则在同一事务中生效。
 * 已平仓流水的 entry_id 与开仓主单不同，不会触及其分配快照。
 */
export async function updateLedger52T0JournalOpeningProfitShare(input: {
  actorUserId: number;
  entryId: number;
  allocations: Array<{ beneficiaryUserId: number; percentage: number }>;
}) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;
  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const lockedEntry = await lockEditableOpeningEntry(tx, input.actorUserId, input.entryId, { allowDependentClose: true });
    const before = lockedEntry.entry;
    if (String(before.execution_status ?? "filled") === "pending") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "挂单尚未成交，成交后才可编辑本单收益分配" });
    }
    if (lockedEntry.remainingCents <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "该开仓单已全部平仓，历史收益分配不可修改" });
    }
    const beforeForAudit = await buildEntryAuditSnapshot(tx, input.actorUserId, before);
    await updateOpeningProfitShareSnapshotsAndFutureRules(tx, {
      actorUserId: input.actorUserId,
      entryId: input.entryId,
      before,
      remainingQuantity: (lockedEntry.remainingCents / 100).toFixed(2),
      allocations: input.allocations,
    });
    const afterForAudit = await buildEntryAuditSnapshot(tx, input.actorUserId, before);
    await writeEntryAudit(tx, {
      actorUserId: input.actorUserId,
      entryId: input.entryId,
      operation: "update",
      before: beforeForAudit,
      after: afterForAudit,
    });
    await tx.commit();
    return { entryId: String(input.entryId) };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}

type ProfitShareOpeningMatch = { openingEntryId: number; matchedQuantityCents: number };

/**
 * 与平仓可用量完全相同的 FIFO 口径，额外返回本次平仓实际消耗到的开仓主单。
 * 这让平仓永远继承其对应开仓当时的收益分配快照，而不是读取当前规则。
 */
function buildProfitShareOpeningMatches(rows: any[], action: T0JournalAction, targetPrice: string, relatedUserId: number, relatedFundId: number, requestedCents: number): ProfitShareOpeningMatch[] {
  const side = actionSide(action);
  const openingAction: T0JournalAction = side === "long" ? "openLong" : "openShort";
  const closingAction: T0JournalAction = side === "long" ? "closeLong" : "closeShort";
  const archiveKey = priceKey(archivedTargetPrice(action, targetPrice));
  const expectedUserKey = relatedUserKey(relatedUserId);
  const expectedFundKey = relatedFundKey(relatedFundId);
  const openingQueue: Array<{ entryId: number; remainingCents: number }> = [];
  const consume = (cents: number, capture: boolean): ProfitShareOpeningMatch[] => {
    const matches: ProfitShareOpeningMatch[] = [];
    let remaining = cents;
    for (const opening of openingQueue) {
      if (remaining <= 0) break;
      if (opening.remainingCents <= 0) continue;
      const allocated = Math.min(opening.remainingCents, remaining);
      opening.remainingCents -= allocated;
      remaining -= allocated;
      if (capture && allocated > 0) matches.push({ openingEntryId: opening.entryId, matchedQuantityCents: allocated });
    }
    return matches;
  };

  for (const row of rows) {
    const rowAction = String(row.action) as T0JournalAction;
    if (relatedUserKey(row.related_user_id) !== expectedUserKey || relatedFundKey(row.related_fund_id) !== expectedFundKey) continue;
    if (rowAction === openingAction && priceKey(archivePriceForAction(rowAction, row.price)) === archiveKey) {
      openingQueue.push({ entryId: toNumber(row.id), remainingCents: quantityToCents(row.quantity) });
      continue;
    }
    if (rowAction === closingAction
      && priceKey(archivedTargetPrice(rowAction, row.target_price, row.price)) === archiveKey) {
      consume(quantityToCents(row.quantity), false);
    }
  }
  return consume(requestedCents, true);
}

async function getEntryProfitShareSnapshotRows(tx: any, input: { actorUserId: number; entryIds: number[]; lock?: boolean }) {
  if (input.entryIds.length === 0) return [];
  const [rows] = await tx.execute(
    `SELECT id, entry_id, opening_entry_id, source_user_id, related_fund_id, beneficiary_user_id, profit_share_rule_id, share_percentage, matched_quantity
       FROM ledger52_t0_journal_entry_profit_shares
      WHERE ledger_id = ? AND user_id = ? AND entry_id IN (${input.entryIds.map(() => "?").join(", ")})
      ORDER BY entry_id ASC, opening_entry_id ASC, id ASC${input.lock ? " FOR UPDATE" : ""}`,
    [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, ...input.entryIds],
  );
  return asRows(rows);
}

async function writeOpeningProfitShareSnapshot(tx: any, input: {
  actorUserId: number;
  entryId: number;
  sourceUserId: number;
  relatedFundId: number;
  quantity: string;
}) {
  if (input.sourceUserId <= 0 || input.relatedFundId <= 0) return;
  const activeRules = await getActiveLedger52T0JournalProfitShareRules(tx, {
    actorUserId: input.actorUserId,
    relatedFundId: input.relatedFundId,
    lock: true,
  });
  if (activeRules.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "请先完成该项目的收益分配设置" });
  }
  const totalPercentage = activeRules.reduce((total, rule) => total + toNumber(rule.share_percentage), 0);
  if (Math.abs(totalPercentage - 100) > 0.00001) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "该项目的收益分配必须合计为100%" });
  }
  for (const activeRule of activeRules) {
    await tx.execute(
      `INSERT INTO ledger52_t0_journal_entry_profit_shares
        (ledger_id, user_id, entry_id, opening_entry_id, source_user_id, related_fund_id, beneficiary_user_id, profit_share_rule_id, share_percentage, matched_quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        LEDGER_52_T0_JOURNAL_ID,
        input.actorUserId,
        input.entryId,
        input.entryId,
        input.sourceUserId,
        input.relatedFundId,
        toNumber(activeRule.beneficiary_user_id),
        toNumber(activeRule.id) || null,
        toNumber(activeRule.share_percentage),
        input.quantity,
      ],
    );
  }
}

async function writeClosingProfitShareSnapshots(tx: any, input: {
  actorUserId: number;
  entryId: number;
  sourceUserId: number;
  positionRows: any[];
  action: T0JournalAction;
  targetPrice: string;
  relatedFundId: number;
  quantity: string;
}) {
  if (input.sourceUserId <= 0) return;
  const matches = buildProfitShareOpeningMatches(
    input.positionRows,
    input.action,
    input.targetPrice,
    input.sourceUserId,
    input.relatedFundId,
    quantityToCents(input.quantity),
  );
  const openingSnapshotRows = await getEntryProfitShareSnapshotRows(tx, {
    actorUserId: input.actorUserId,
    entryIds: matches.map((match) => match.openingEntryId),
    lock: true,
  });
  const snapshotsByOpening = new Map<number, any[]>();
  for (const snapshot of openingSnapshotRows) {
    const openingEntryId = toNumber(snapshot.opening_entry_id);
    const current = snapshotsByOpening.get(openingEntryId) || [];
    current.push(snapshot);
    snapshotsByOpening.set(openingEntryId, current);
  }
  for (const match of matches) {
    const openingSnapshots = snapshotsByOpening.get(match.openingEntryId) || [];
    for (const openingSnapshot of openingSnapshots) {
      await tx.execute(
        `INSERT INTO ledger52_t0_journal_entry_profit_shares
          (ledger_id, user_id, entry_id, opening_entry_id, source_user_id, related_fund_id, beneficiary_user_id, profit_share_rule_id, share_percentage, matched_quantity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          LEDGER_52_T0_JOURNAL_ID,
          input.actorUserId,
          input.entryId,
          match.openingEntryId,
          toNumber(openingSnapshot.source_user_id) || input.sourceUserId,
          toNumber(openingSnapshot.related_fund_id) || input.relatedFundId,
          toNumber(openingSnapshot.beneficiary_user_id),
          toNumber(openingSnapshot.profit_share_rule_id) || null,
          toNumber(openingSnapshot.share_percentage),
          (match.matchedQuantityCents / 100).toFixed(2),
        ],
      );
    }
  }
}

type SharedIncomeTransferAllocation = { recipientUserId: number; amount: number };

function normalizeSharedIncomeAllocations(raw: SaveT0JournalEntryInput["sharedIncomeAllocations"]): SharedIncomeTransferAllocation[] {
  const totals = new Map<number, number>();
  for (const item of raw ?? []) {
    const recipientUserId = Number(item?.recipientUserId);
    const amount = Number(item?.amount);
    if (!Number.isInteger(recipientUserId) || recipientUserId <= 0 || !Number.isFinite(amount) || amount <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "共享收益对象或金额无效" });
    }
    const next = (totals.get(recipientUserId) || 0) + amount;
    if (next > 10_000_000) throw new TRPCError({ code: "BAD_REQUEST", message: "共享收益金额超出允许范围" });
    totals.set(recipientUserId, next);
  }
  return Array.from(totals.entries()).map(([recipientUserId, amount]) => ({
    recipientUserId,
    // 与账本资金流水一致，按 USDT 分处理，避免浮点尾差被写入审计记录。
    amount: Math.round(amount * 100) / 100,
  })).filter((item) => item.amount > 0);
}

/**
 * 共享收益先从本次平仓的正向净收益中分配；剩余收益才按开仓时固化的分佣快照结算。
 * 计算逐 FIFO 开仓切片进行，先扣相应开仓费和本次平仓费，再汇总为本单净收益。
 */
async function calculateClosingSharedIncomePool(tx: any, input: {
  actorUserId: number;
  sourceUserId: number;
  positionRows: any[];
  action: T0JournalAction;
  targetPrice: string;
  relatedFundId: number;
  quantity: string;
  closePrice: string;
}) {
  const matches = buildProfitShareOpeningMatches(
    input.positionRows,
    input.action,
    input.targetPrice,
    input.sourceUserId,
    input.relatedFundId,
    quantityToCents(input.quantity),
  );
  if (matches.length === 0) return { shareableAmount: 0, sourceNetPnl: 0 };
  const openingById = new Map(input.positionRows.map((row) => [toNumber(row.id), row]));
  const closeQuantity = Number(input.quantity);
  const closePrice = Number(input.closePrice);
  const closingFee = closeQuantity * closePrice * Number(OKX_VIP2_TAKER_FEE_RATE);
  let sourceNetPnl = 0;
  const side = actionSide(input.action);
  for (const match of matches) {
    const opening = openingById.get(match.openingEntryId);
    if (!opening) continue;
    const quantity = match.matchedQuantityCents / 100;
    const openingQuantity = Math.max(0.000001, toNumber(opening.quantity));
    const openingPrice = toNumber(opening.price);
    const grossPnl = side === "long"
      ? (closePrice - openingPrice) * quantity
      : (openingPrice - closePrice) * quantity;
    const allocatedOpeningFee = toNumber(opening.fee_usdt) * (quantity / openingQuantity);
    const allocatedClosingFee = closeQuantity > 0 ? closingFee * (quantity / closeQuantity) : 0;
    const segmentNetPnl = grossPnl - allocatedOpeningFee - allocatedClosingFee;
    sourceNetPnl += segmentNetPnl;
  }
  const roundedSourceNetPnl = Math.round(sourceNetPnl * 100000000) / 100000000;
  return {
    sourceNetPnl: roundedSourceNetPnl,
    // 共享以 U 分账；向下取整确保后续“剩余收益”不会出现超额分配。
    shareableAmount: Math.floor((Math.max(0, roundedSourceNetPnl) + 1e-9) * 100) / 100,
  };
}

async function writeSharedIncomeTransfers(tx: any, input: {
  actorUserId: number;
  closingEntryId: number;
  sourceUserId: number;
  positionRows: any[];
  action: T0JournalAction;
  targetPrice: string;
  relatedFundId: number;
  quantity: string;
  closePrice: string;
  allocations?: SaveT0JournalEntryInput["sharedIncomeAllocations"];
}) {
  const allocations = normalizeSharedIncomeAllocations(input.allocations);
  if (allocations.length === 0) return;
  if (input.sourceUserId <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "未关联用户的订单不可分配共享收益" });
  }
  const { shareableAmount, sourceNetPnl } = await calculateClosingSharedIncomePool(tx, input);
  if (sourceNetPnl <= 0 || shareableAmount <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "仅正向净收益的平仓订单可分配共享收益" });
  }
  const allocatedTotal = allocations.reduce((total, item) => total + item.amount, 0);
  if (allocatedTotal - shareableAmount > 0.00001) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `共享收益合计不可超过本单可共享收益 ${shareableAmount.toFixed(2)} U` });
  }
  for (const allocation of allocations) {
    if (allocation.recipientUserId === input.sourceUserId || allocation.recipientUserId === input.actorUserId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "共享收益仅可分配给其他关联用户" });
    }
    const [recipientRows] = await tx.execute(`SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE`, [allocation.recipientUserId]);
    if (!asRows(recipientRows)[0]) throw new TRPCError({ code: "NOT_FOUND", message: "共享收益对象不存在或已失效" });
    await tx.execute(
      `INSERT INTO ledger52_t0_journal_shared_income_transfers
        (ledger_id, user_id, closing_entry_id, source_user_id, recipient_user_id, amount, source_net_pnl, manager_pool_amount, reduces_regular_distribution, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        LEDGER_52_T0_JOURNAL_ID,
        input.actorUserId,
        input.closingEntryId,
        input.sourceUserId,
        allocation.recipientUserId,
        allocation.amount.toFixed(2),
        sourceNetPnl.toFixed(18),
        shareableAmount.toFixed(18),
        input.actorUserId,
      ],
    );
  }
}

async function restoreEntryProfitShareSnapshots(tx: any, input: { actorUserId: number; entryId: number; snapshots: any[] }) {
  for (const snapshot of input.snapshots) {
    const openingEntryId = toNumber(snapshot.opening_entry_id ?? snapshot.openingEntryId);
    const beneficiaryUserId = toNumber(snapshot.beneficiary_user_id ?? snapshot.beneficiaryUserId);
    const sourceUserId = toNumber(snapshot.source_user_id ?? snapshot.sourceUserId);
    const relatedFundId = toNumber(snapshot.related_fund_id ?? snapshot.relatedFundId);
    const percentage = toNumber(snapshot.share_percentage ?? snapshot.percentage);
    const quantity = String(snapshot.matched_quantity ?? snapshot.matchedQuantity ?? "");
    if (!openingEntryId || !beneficiaryUserId || !sourceUserId || percentage <= 0 || !quantity) continue;
    await tx.execute(
      `INSERT INTO ledger52_t0_journal_entry_profit_shares
        (ledger_id, user_id, entry_id, opening_entry_id, source_user_id, related_fund_id, beneficiary_user_id, profit_share_rule_id, share_percentage, matched_quantity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        LEDGER_52_T0_JOURNAL_ID,
        input.actorUserId,
        input.entryId,
        openingEntryId,
        sourceUserId,
        relatedFundId || null,
        beneficiaryUserId,
        toNumber(snapshot.profit_share_rule_id ?? snapshot.profitShareRuleId) || null,
        percentage,
        quantity,
      ],
    );
  }
}

export async function selectLedger52T0JournalAccount(userId: number, accountId: number) {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  await ensureLedger52T0JournalTables(conn);

  const [result] = await conn.execute(
    `UPDATE ledger52_t0_journal_accounts
        SET last_used_at = NOW(3)
      WHERE id = ? AND ledger_id = ? AND user_id = ? AND is_active = 1`,
    [accountId, LEDGER_52_T0_JOURNAL_ID, userId],
  ) as any[];
  if (Number((result as any)?.affectedRows || 0) !== 1) {
    throw new TRPCError({ code: "NOT_FOUND", message: "下单账户不存在或无权选择" });
  }

  const [rows] = await conn.execute(
    `SELECT id, name, last_used_at, created_at
       FROM ledger52_t0_journal_accounts
      WHERE id = ? AND ledger_id = ? AND user_id = ? LIMIT 1`,
    [accountId, LEDGER_52_T0_JOURNAL_ID, userId],
  );
  const account = asRows(rows)[0];
  if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "下单账户不存在" });
  return { account: mapAccount(account) };
}

function normalizeJournalDirectoryName(value: string, label: string): string {
  const name = String(value || "").trim();
  if (!name) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${label}不能为空` });
  }
  if (name.length > 80) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${label}最多80个字符` });
  }
  return name;
}

async function writeLedger52T0JournalDimensionAudit(tx: any, input: {
  userId: number;
  dimension: "account" | "related_user" | "related_fund";
  dimensionId: number;
  relatedUserId?: number;
  operation?: "rename" | "delete";
  oldName: string;
  newName: string;
  affectedEntryCount?: number;
  operatorUserId: number;
}) {
  await tx.execute(
    `INSERT INTO ledger52_t0_journal_dimension_audits
      (ledger_id, user_id, dimension, dimension_id, related_user_id, operation, old_name, new_name, affected_entry_count, operator_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      LEDGER_52_T0_JOURNAL_ID,
      input.userId,
      input.dimension,
      input.dimensionId,
      input.relatedUserId && input.relatedUserId > 0 ? input.relatedUserId : null,
      input.operation ?? "rename",
      input.oldName,
      input.newName,
      Math.max(0, Number(input.affectedEntryCount || 0)),
      input.operatorUserId,
    ],
  );
}

/** 改名只更新账户目录；全部历史流水仍通过 account_id 自动展示为新名称。 */
export async function renameLedger52T0JournalAccount(input: { actorUserId: number; accountId: number; name: string }) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;
  const name = normalizeJournalDirectoryName(input.name, "账户名称");
  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const [rows] = await tx.execute(
      `SELECT id, name, last_used_at, created_at
         FROM ledger52_t0_journal_accounts
        WHERE id = ? AND ledger_id = ? AND user_id = ? AND is_active = 1
        LIMIT 1 FOR UPDATE`,
      [input.accountId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    const account = asRows(rows)[0];
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "账户不存在或已停用" });
    const oldName = String(account.name || "");
    if (oldName !== name) {
      const [duplicateRows] = await tx.execute(
        `SELECT id FROM ledger52_t0_journal_accounts
          WHERE ledger_id = ? AND user_id = ? AND name = ? AND id <> ?
          LIMIT 1 FOR UPDATE`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, name, input.accountId],
      );
      if (asRows(duplicateRows)[0]) {
        throw new TRPCError({ code: "CONFLICT", message: "已存在同名账户，请换一个名称" });
      }
      await tx.execute(
        `UPDATE ledger52_t0_journal_accounts SET name = ?, updated_at = NOW(3) WHERE id = ?`,
        [name, input.accountId],
      );
      await writeLedger52T0JournalDimensionAudit(tx, {
        userId: input.actorUserId,
        dimension: "account",
        dimensionId: input.accountId,
        oldName,
        newName: name,
        operatorUserId: input.actorUserId,
      });
    }
    await tx.commit();
    return { account: mapAccount({ ...account, name }) };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    await tx.release();
  }
}

/** 改名只更新项目目录；历史流水通过 related_fund_id 联表，因此会同步显示新名称。 */
export async function renameLedger52T0JournalRelatedFund(input: { actorUserId: number; relatedFundId: number; name: string }) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;
  const name = normalizeJournalDirectoryName(input.name, "项目名称");
  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const [rows] = await tx.execute(
      `SELECT id, related_user_id, name, last_used_at, created_at
         FROM ledger52_t0_journal_related_funds
        WHERE id = ? AND ledger_id = ? AND user_id = ? AND is_active = 1
        LIMIT 1 FOR UPDATE`,
      [input.relatedFundId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    const fund = asRows(rows)[0];
    if (!fund) throw new TRPCError({ code: "NOT_FOUND", message: "项目不存在或已停用" });
    const oldName = String(fund.name || "");
    const relatedUserId = toNumber(fund.related_user_id);
    if (oldName !== name) {
      const [duplicateRows] = await tx.execute(
        `SELECT id FROM ledger52_t0_journal_related_funds
          WHERE ledger_id = ? AND user_id = ? AND name = ? AND id <> ?
          LIMIT 1 FOR UPDATE`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, name, input.relatedFundId],
      );
      if (asRows(duplicateRows)[0]) {
        throw new TRPCError({ code: "CONFLICT", message: "该账本已存在同名项目，请换一个名称" });
      }
      await tx.execute(
        `UPDATE ledger52_t0_journal_related_funds SET name = ?, updated_at = NOW(3) WHERE id = ?`,
        [name, input.relatedFundId],
      );
      await writeLedger52T0JournalDimensionAudit(tx, {
        userId: input.actorUserId,
        dimension: "related_fund",
        dimensionId: input.relatedFundId,
        relatedUserId,
        oldName,
        newName: name,
        operatorUserId: input.actorUserId,
      });
    }
    await tx.commit();
    return { relatedFund: mapRelatedFund({ ...fund, name }) };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    await tx.release();
  }
}

type T0JournalDirectoryDimension = "account" | "related_user" | "related_fund";
type T0JournalDirectoryImpact = {
  dimension: T0JournalDirectoryDimension;
  dimensionId: number;
  name: string;
  relatedUserId?: number;
  affectedEntryCount: number;
  outstandingQuantity: number;
  accounts: Array<{ id: number; name: string; count: number }>;
  users: Array<{ id: number; name: string; count: number }>;
  funds: Array<{ id: number; name: string; count: number }>;
};

function calculateOutstandingOpeningQuantity(rows: any[]): number {
  const balances = new Map<string, number>();
  for (const row of rows) {
    const action = String(row.action) as T0JournalAction;
    const accountId = toNumber(row.account_id);
    const relatedUserId = toNumber(row.related_user_id);
    const relatedFundId = toNumber(row.related_fund_id);
    const archivePrice = isOpeningAction(action)
      ? archivePriceForAction(action, row.price)
      : archivedTargetPrice(action, row.target_price, row.price);
    if (!accountId || !archivePrice) continue;
    const key = `${actionSide(action)}:${priceKey(archivePrice)}:${accountId}:${relatedUserKey(relatedUserId)}:${relatedFundKey(relatedFundId)}`;
    const quantity = quantityToCents(row.quantity);
    balances.set(key, Math.max(0, (balances.get(key) || 0) + (isOpeningAction(action) ? quantity : -quantity)));
  }
  return Array.from(balances.values()).reduce((sum, cents) => sum + cents, 0) / 100;
}

function summarizeDirectoryImpactRows(rows: any[], input: {
  dimension: T0JournalDirectoryDimension;
  dimensionId: number;
  name: string;
  relatedUserId?: number;
}): T0JournalDirectoryImpact {
  const summarize = (idField: string, nameField: string) => {
    const values = new Map<number, { id: number; name: string; count: number }>();
    for (const row of rows) {
      const id = toNumber(row[idField]);
      if (!id) continue;
      const current = values.get(id);
      values.set(id, {
        id,
        name: String(row[nameField] || `未命名#${id}`),
        count: (current?.count || 0) + 1,
      });
    }
    return Array.from(values.values()).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-CN"));
  };

  return {
    dimension: input.dimension,
    dimensionId: input.dimensionId,
    name: input.name,
    relatedUserId: input.relatedUserId,
    affectedEntryCount: rows.length,
    outstandingQuantity: calculateOutstandingOpeningQuantity(rows),
    accounts: summarize("account_id", "account_name"),
    users: summarize("related_user_id", "related_user_name"),
    funds: summarize("related_fund_id", "related_fund_name"),
  };
}

async function getLedger52T0JournalDirectoryImpactWithConnection(tx: any, input: {
  actorUserId: number;
  dimension: T0JournalDirectoryDimension;
  dimensionId: number;
  lock?: boolean;
}): Promise<T0JournalDirectoryImpact> {
  const lock = input.lock ? " FOR UPDATE" : "";
  let target: any;
  let relatedUserId: number | undefined;
  if (input.dimension === "account") {
    const [rows] = await tx.execute(
      `SELECT id, name FROM ledger52_t0_journal_accounts
        WHERE id = ? AND ledger_id = ? AND user_id = ? AND is_active = 1 LIMIT 1${lock}`,
      [input.dimensionId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    target = asRows(rows)[0];
  } else if (input.dimension === "related_fund") {
    const [rows] = await tx.execute(
      `SELECT id, related_user_id, name FROM ledger52_t0_journal_related_funds
        WHERE id = ? AND ledger_id = ? AND user_id = ? AND is_active = 1 LIMIT 1${lock}`,
      [input.dimensionId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    target = asRows(rows)[0];
    relatedUserId = target ? toNumber(target.related_user_id) : undefined;
  } else {
    const [entryRows] = await tx.execute(
      `SELECT e.related_user_id AS id, COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', e.related_user_id)) AS name
         FROM ledger52_t0_journal_entries e
         LEFT JOIN users u ON u.id = e.related_user_id
        WHERE e.ledger_id = ? AND e.user_id = ? AND e.related_user_id = ?
          AND NOT EXISTS (
            SELECT 1 FROM ledger52_t0_journal_deleted_dimensions deleted_user
             WHERE deleted_user.ledger_id = e.ledger_id AND deleted_user.user_id = e.user_id
               AND deleted_user.dimension = 'related_user' AND deleted_user.dimension_id = e.related_user_id
          )
        LIMIT 1${lock}`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.dimensionId],
    );
    target = asRows(entryRows)[0];
    relatedUserId = target ? toNumber(target.id) : undefined;
  }
  if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "要操作的目录项不存在、已删除或无权访问" });

  const condition = input.dimension === "account"
    ? "e.account_id = ?"
    : input.dimension === "related_fund"
      ? "e.related_fund_id = ?"
      : "e.related_user_id = ?";
  const [entryRows] = await tx.execute(
    `SELECT e.action, e.quantity, e.price, e.target_price, e.account_id, e.related_user_id, e.related_fund_id,
            a.name AS account_name,
            COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', e.related_user_id)) AS related_user_name,
            f.name AS related_fund_name
       FROM ledger52_t0_journal_entries e
       INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
       LEFT JOIN users u ON u.id = e.related_user_id
       LEFT JOIN ledger52_t0_journal_related_funds f ON f.id = e.related_fund_id AND f.ledger_id = e.ledger_id AND f.user_id = e.user_id
      WHERE e.ledger_id = ? AND e.user_id = ? AND ${condition}
      ORDER BY e.trade_time ASC, e.id ASC${lock}`,
    [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.dimensionId],
  );
  return summarizeDirectoryImpactRows(asRows(entryRows), {
    dimension: input.dimension,
    dimensionId: input.dimensionId,
    name: String(target.name || `项目#${input.dimensionId}`),
    relatedUserId,
  });
}

/** 返回编辑/删除前的精确影响范围，供前端在二次确认前展示。 */
export async function getLedger52T0JournalDirectoryImpact(input: {
  actorUserId: number;
  dimension: T0JournalDirectoryDimension;
  dimensionId: number;
}) {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  await ensureLedger52T0JournalTables(conn);
  return getLedger52T0JournalDirectoryImpactWithConnection(conn, input);
}

/**
 * 目录删除是逻辑删除：从新订单的可选目录与前端展示中移除，历史流水仍保留稳定键以维持FIFO、盈亏与审计核对。
 * 删除后旧开仓仍可按稳定ID完成平仓，目录不会重新出现在新订单选择中。
 */
export async function deleteLedger52T0JournalDirectory(input: {
  actorUserId: number;
  dimension: T0JournalDirectoryDimension;
  dimensionId: number;
  expectedAffectedEntryCount?: number;
}) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;
  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const impact = await getLedger52T0JournalDirectoryImpactWithConnection(tx, { ...input, lock: true });
    if (input.expectedAffectedEntryCount !== undefined && input.expectedAffectedEntryCount !== impact.affectedEntryCount) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "目录关联的历史流水已变化，请刷新影响预览后重新确认" });
    }
    if (input.dimension === "account") {
      await tx.execute(
        `UPDATE ledger52_t0_journal_accounts SET is_active = 0, updated_at = NOW(3)
          WHERE id = ? AND ledger_id = ? AND user_id = ?`,
        [input.dimensionId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      );
    } else if (input.dimension === "related_fund") {
      await tx.execute(
        `UPDATE ledger52_t0_journal_related_funds SET is_active = 0, updated_at = NOW(3)
          WHERE id = ? AND ledger_id = ? AND user_id = ?`,
        [input.dimensionId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      );
      await tx.execute(
        `UPDATE ledger52_t0_journal_profit_share_rules
            SET is_active = 0, ended_at = NOW(3), updated_at = NOW(3)
          WHERE ledger_id = ? AND user_id = ? AND related_fund_id = ? AND is_active = 1`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.dimensionId],
      );
    } else {
      await tx.execute(
        `INSERT INTO ledger52_t0_journal_deleted_dimensions
          (ledger_id, user_id, dimension, dimension_id, related_user_id, deleted_name, operator_user_id)
         VALUES (?, ?, 'related_user', ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE deleted_name = VALUES(deleted_name), operator_user_id = VALUES(operator_user_id), deleted_at = NOW(3)`,
        [
          LEDGER_52_T0_JOURNAL_ID,
          input.actorUserId,
          input.dimensionId,
          impact.relatedUserId || input.dimensionId,
          impact.name,
          input.actorUserId,
        ],
      );
      // 目录移除后不再为该用户创建未来新开仓的分配快照；既有订单快照与审计保持不变。
      await tx.execute(
        `UPDATE ledger52_t0_journal_profit_share_rules
            SET is_active = 0, ended_at = NOW(3), updated_at = NOW(3)
          WHERE ledger_id = ? AND user_id = ? AND is_active = 1
            AND (source_user_id = ? OR beneficiary_user_id = ?)`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.dimensionId, input.dimensionId],
      );
    }

    await writeLedger52T0JournalDimensionAudit(tx, {
      userId: input.actorUserId,
      dimension: input.dimension,
      dimensionId: input.dimensionId,
      relatedUserId: impact.relatedUserId,
      operation: "delete",
      oldName: impact.name,
      newName: "",
      affectedEntryCount: impact.affectedEntryCount,
      operatorUserId: input.actorUserId,
    });
    await tx.commit();
    return { impact };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    await tx.release();
  }
}

export async function saveLedger52T0JournalEntry(input: SaveT0JournalEntryInput) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;
  const normalizedQuantity = requireValidEthQuantity(input.quantity);
  const instrumentType = isOpeningAction(input.action)
    ? normalizeInstrumentType(input.instrumentType, true)
    : undefined;
  const isLocked = isOpeningAction(input.action) && input.isLocked === true ? 1 : 0;
  // 反向展示只标记开仓：所有平仓记录在管理员视图中按 FIFO 自动跟随对应开仓投影，
  // 因而关闭标记会让整笔订单（含历史平仓）即时回到普通方向，不改写任何原始流水。
  const isCounterparty = isOpeningAction(input.action) && input.isCounterparty === true ? 1 : 0;
  if (!isOpeningAction(input.action) && input.isPending) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "仅开仓订单可以设为挂单" });
  }
  const isPending = isOpeningAction(input.action) && input.isPending === true ? 1 : 0;
  if (isPending && isLocked) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "挂单成交前不可设为锁定；请在成交后再锁定" });
  }
  if (isPending && (instrumentType === "option" || instrumentType === "grid")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: instrumentType === "grid" ? "网格参数仅作策略记录，不支持挂单自动成交" : "期权请直接成交；行权价不能作为挂单触发价" });
  }
  const optionParameters = instrumentType === "option" ? resolveOptionParameters(input) : null;
  const gridParameters = instrumentType === "grid" ? resolveGridParameters(input) : null;
  if (optionParameters && input.action !== optionOpeningActionForDirection(optionParameters.direction)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "期权方向与报价侧不一致；看涨归左侧、看跌归右侧" });
  }
  if (gridParameters && input.action !== (gridParameters.direction === "long" ? "openLong" : "openShort")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "网格方向与报价侧不一致；做多归左侧、做空归右侧" });
  }
  const effectivePrice = gridParameters
    ? gridParameters.direction === "long" ? gridParameters.rangeMin : gridParameters.rangeMax
    : input.price;
  const takeProfit = resolveTakeProfitParameters({
    action: input.action,
    instrumentType,
    quantity: normalizedQuantity,
    price: String(effectivePrice),
    takeProfitEnabled: input.takeProfitEnabled,
    takeProfitPrice: input.takeProfitPrice,
    takeProfitQuantity: input.takeProfitQuantity,
    takeProfitPlans: input.takeProfitPlans,
  });

  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();

    const relatedUserId = Number(input.relatedUserId || 0);
    if (relatedUserId > 0) {
      if (!Number.isInteger(relatedUserId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "关联用户信息无效" });
      }
      const [relatedUserRows] = await tx.execute(
        `SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
        [relatedUserId],
      );
      if (!asRows(relatedUserRows)[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "关联用户不存在或已失效，请重新选择" });
      }
      // 新开仓再次明确选择该用户时才恢复目录可见性；旧仓平仓沿用ID时保持删除状态。
      if (isOpeningAction(input.action)) {
        await tx.execute(
          `DELETE FROM ledger52_t0_journal_deleted_dimensions
            WHERE ledger_id = ? AND user_id = ? AND dimension = 'related_user' AND dimension_id = ?`,
          [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, relatedUserId],
        );
      }
    }
    const relatedFund = await resolveLedger52T0JournalRelatedFund(tx, {
      actorUserId: input.actorUserId,
      relatedUserId,
      relatedFundId: input.relatedFundId,
      relatedFundName: input.relatedFundName,
      // 新开仓关联到具体用户后，必须归属于该用户的一笔专项款；旧流水的平仓仍可保留空专项款。
      required: isOpeningAction(input.action) && relatedUserId > 0,
      allowInactive: !isOpeningAction(input.action),
    });

    let accountId = Number(input.accountId || 0);
    let accountName = String(input.accountName || "").trim();
    if (accountId > 0) {
      const [rows] = await tx.execute(
        `SELECT id, name
           FROM ledger52_t0_journal_accounts
          WHERE id = ? AND ledger_id = ? AND user_id = ?
            AND (is_active = 1 OR ? = 1)
          LIMIT 1 FOR UPDATE`,
        [accountId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId, isOpeningAction(input.action) ? 0 : 1],
      );
      const account = asRows(rows)[0];
      if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "下单账户不存在或无权使用" });
      accountName = String(account.name);
    } else {
      if (!accountName) throw new TRPCError({ code: "BAD_REQUEST", message: "请填写下单账户名称" });
      const [result] = await tx.execute(
        `INSERT INTO ledger52_t0_journal_accounts (ledger_id, user_id, name, is_active, last_used_at)
         VALUES (?, ?, ?, 1, NOW(3))
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), is_active = 1, last_used_at = NOW(3), updated_at = NOW(3)`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, accountName],
      );
      accountId = Number((result as any).insertId || 0);
      if (!accountId) {
        const [rows] = await tx.execute(
          `SELECT id FROM ledger52_t0_journal_accounts
            WHERE ledger_id = ? AND user_id = ? AND name = ? LIMIT 1 FOR UPDATE`,
          [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, accountName],
        );
        accountId = Number(asRows(rows)[0]?.id || 0);
      }
      if (!accountId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "下单账户保存失败" });
    }

    await tx.execute(
      `UPDATE ledger52_t0_journal_accounts
          SET last_used_at = NOW(3)
        WHERE id = ? AND ledger_id = ? AND user_id = ?`,
      [accountId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );

    const [existingRequestRows] = await tx.execute(
      `SELECT id
         FROM ledger52_t0_journal_entries
        WHERE ledger_id = ? AND user_id = ? AND client_request_id = ?
        LIMIT 1 FOR UPDATE`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.clientRequestId],
    );
    const isRetryOfExistingEntry = Boolean(asRows(existingRequestRows)[0]?.id);

    const storedTargetPrice = isOpeningAction(input.action)
      ? archivePriceForAction(input.action, effectivePrice)
      : archivedTargetPrice(input.action, input.targetPrice);
    let positionRowsForProfitShare: any[] = [];

    if (!isOpeningAction(input.action) && !isRetryOfExistingEntry) {
      if (!storedTargetPrice) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "平仓记录必须指定对应的开仓价格档位" });
      }
      const [positionRows] = await tx.execute(
        `SELECT id, action, execution_status, is_locked, quantity, price, fee_usdt, target_price, related_user_id, related_fund_id
           FROM ledger52_t0_journal_entries
          WHERE ledger_id = ? AND user_id = ? AND account_id = ? AND symbol = ?
          ORDER BY created_at ASC, id ASC FOR UPDATE`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, accountId, input.symbol],
      );
      const availableCents = calculateAvailableCloseCents(asRows(positionRows), input.action, String(storedTargetPrice), relatedUserId, relatedFund?.id ?? 0);
      const requestedCents = quantityToCents(normalizedQuantity);
      if (requestedCents <= 0 || requestedCents > availableCents) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: availableCents > 0
            ? `该价格档位最多可平 ${(availableCents / 100).toFixed(2)} ETH`
            : "该价格档位已无可平数量",
          });
      }
      positionRowsForProfitShare = asRows(positionRows);
      // 平仓必须按 FIFO 匹配真实开仓主单。只要本次需要消耗到任一锁定主单的剩余量，
      // 就必须先解除该主单的锁定；这样预先打开的平仓表单或直接调用接口也不能绕过保护。
      const matchedOpenings = buildProfitShareOpeningMatches(
        positionRowsForProfitShare,
        input.action,
        String(storedTargetPrice),
        relatedUserId,
        relatedFund?.id ?? 0,
        requestedCents,
      );
      const lockedOpeningIds = new Set(
        positionRowsForProfitShare
          .filter((row) => Number(row.is_locked) === 1)
          .map((row) => toNumber(row.id)),
      );
      if (matchedOpenings.some((match) => lockedOpeningIds.has(match.openingEntryId))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "该笔剩余仓位已锁定，请先解除锁定后再平仓",
        });
      }
    }

    const [entryResult] = await tx.execute(
      `INSERT INTO ledger52_t0_journal_entries
        (ledger_id, user_id, account_id, related_user_id, related_fund_id, symbol, instrument_type, option_direction, option_expiry_date, option_premium, option_premium_currency, grid_direction, grid_range_min, grid_range_max, grid_leverage, grid_count, is_locked, is_counterparty, execution_status, take_profit_enabled, take_profit_price, take_profit_quantity, action, quantity, price, fee_usdt, target_price, note, client_request_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'option' THEN 0 ELSE ROUND(CAST(? AS DECIMAL(36,18)) * CAST(? AS DECIMAL(36,18)) * ${OKX_VIP2_TAKER_FEE_RATE}, 18) END, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [
        LEDGER_52_T0_JOURNAL_ID,
        input.actorUserId,
        accountId,
        relatedUserId > 0 ? relatedUserId : null,
        relatedFund?.id ?? null,
        input.symbol,
        instrumentType ?? null,
        optionParameters?.direction ?? null,
        optionParameters?.expiryDate ?? null,
        optionParameters?.premium ?? null,
        optionParameters?.premiumCurrency ?? null,
        gridParameters?.direction ?? null,
        gridParameters?.rangeMin ?? null,
        gridParameters?.rangeMax ?? null,
        gridParameters?.leverage ?? null,
        gridParameters?.count ?? null,
        isLocked,
        isCounterparty,
        isPending ? "pending" : "filled",
        takeProfit.enabled ? 1 : 0,
        takeProfit.price,
        takeProfit.quantity,
        input.action,
        normalizedQuantity,
        effectivePrice,
        instrumentType ?? null,
        normalizedQuantity,
        effectivePrice,
        storedTargetPrice || null,
        input.note || null,
        input.clientRequestId,
        input.actorUserId,
      ],
    );
    const entryId = Number((entryResult as any).insertId || 0);
    if (!entryId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "速记流水保存失败" });
    if (!isRetryOfExistingEntry && isOpeningAction(input.action)) {
      await replacePendingTakeProfitPlans(tx, {
        actorUserId: input.actorUserId,
        openingEntryId: entryId,
        plans: takeProfit.plans,
      });
      await syncEntryTakeProfitSummary(tx, { actorUserId: input.actorUserId, openingEntryId: entryId });
    }

    if (!isRetryOfExistingEntry) {
      if (isOpeningAction(input.action)) {
        await writeOpeningProfitShareSnapshot(tx, {
          actorUserId: input.actorUserId,
          entryId,
          sourceUserId: relatedUserId,
          relatedFundId: relatedFund?.id ?? 0,
          quantity: normalizedQuantity,
        });
      } else if (storedTargetPrice) {
        await writeClosingProfitShareSnapshots(tx, {
          actorUserId: input.actorUserId,
          entryId,
          sourceUserId: relatedUserId,
          positionRows: positionRowsForProfitShare,
          action: input.action,
          targetPrice: String(storedTargetPrice),
          relatedFundId: relatedFund?.id ?? 0,
          quantity: normalizedQuantity,
        });
        await writeSharedIncomeTransfers(tx, {
          actorUserId: input.actorUserId,
          closingEntryId: entryId,
          sourceUserId: relatedUserId,
          positionRows: positionRowsForProfitShare,
          action: input.action,
          targetPrice: String(storedTargetPrice),
          relatedFundId: relatedFund?.id ?? 0,
          quantity: normalizedQuantity,
          closePrice: String(effectivePrice),
          allocations: input.sharedIncomeAllocations,
        });
      }
    }

    const [accountRows, entryRows] = await Promise.all([
      tx.execute(
        `SELECT id, name, last_used_at, created_at
           FROM ledger52_t0_journal_accounts
          WHERE id = ? AND ledger_id = ? AND user_id = ? LIMIT 1`,
        [accountId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      ),
      tx.execute(
        `SELECT e.id, e.account_id, a.name AS account_name, e.related_user_id, e.related_fund_id, f.name AS related_fund_name,
                COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', e.related_user_id)) AS related_user_name,
                u.username AS related_username, u.avatar AS related_user_avatar,
                e.symbol, e.instrument_type, e.option_direction, e.option_expiry_date, e.option_premium, e.option_premium_currency,
                e.grid_direction, e.grid_range_min, e.grid_range_max, e.grid_leverage, e.grid_count,
                e.is_locked, e.is_counterparty, e.execution_status, e.filled_at, e.filled_price,
                e.take_profit_enabled, e.take_profit_price, e.take_profit_quantity, e.take_profit_triggered_at, e.take_profit_triggered_price, e.take_profit_triggered_quantity,
                e.action, e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.trade_time, e.created_at
           FROM ledger52_t0_journal_entries e
           INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
           LEFT JOIN users u ON u.id = e.related_user_id
           LEFT JOIN ledger52_t0_journal_related_funds f ON f.id = e.related_fund_id AND f.ledger_id = e.ledger_id AND f.user_id = e.user_id
          WHERE e.id = ? AND e.ledger_id = ? AND e.user_id = ? LIMIT 1`,
        [entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      ),
    ]);
    const account = asRows(accountRows)[0];
    const entry = asRows(entryRows)[0];
    if (!account || !entry) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "速记流水读取失败" });
    const plansByEntryId = await getTakeProfitPlansByEntryId(tx, [entryId]);
    entry.take_profit_plans = plansByEntryId.get(entryId) ?? [];

    await tx.commit();
    if (isPending || takeProfit.enabled) activateLedger52T0PendingOrderScan();
    return { account: mapAccount(account), entry: mapEntry(entry) };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}

async function lockEditableOpeningEntry(tx: any, actorUserId: number, entryId: number, options: { allowDependentClose?: boolean } = {}) {
  const [rows] = await tx.execute(
    `SELECT e.id, e.account_id, a.name AS account_name, e.related_user_id, e.related_fund_id, e.symbol, e.instrument_type, e.option_direction, e.option_expiry_date, e.option_premium, e.option_premium_currency,
            e.grid_direction, e.grid_range_min, e.grid_range_max, e.grid_leverage, e.grid_count, e.action,
            e.is_locked, e.is_counterparty, e.execution_status, e.filled_at, e.filled_price,
            e.take_profit_enabled, e.take_profit_price, e.take_profit_quantity, e.take_profit_triggered_at, e.take_profit_triggered_price, e.take_profit_triggered_quantity,
            e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.client_request_id,
            e.created_by_user_id, e.trade_time, e.created_at, e.updated_at
       FROM ledger52_t0_journal_entries e
       INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
      WHERE e.id = ? AND e.ledger_id = ? AND e.user_id = ?
      LIMIT 1 FOR UPDATE`,
    [entryId, LEDGER_52_T0_JOURNAL_ID, actorUserId],
  );
  const entry = asRows(rows)[0];
  if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "开仓记录不存在或无权操作" });
  if (!isOpeningAction(String(entry.action) as T0JournalAction)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "当前仅支持编辑或删除开仓记录" });
  }

  const entryAction = String(entry.action) as T0JournalAction;
  const [scopeRows] = await tx.execute(
    `SELECT id, action, execution_status, quantity, price, target_price, trade_time, created_at
       FROM ledger52_t0_journal_entries
      WHERE ledger_id = ? AND user_id = ? AND account_id = ? AND symbol = ?
        AND COALESCE(related_user_id, 0) = ?
        AND COALESCE(related_fund_id, 0) = ?
      ORDER BY created_at ASC, id ASC FOR UPDATE`,
    [
      LEDGER_52_T0_JOURNAL_ID,
      actorUserId,
      Number(entry.account_id),
      String(entry.symbol),
      toNumber(entry.related_user_id),
      toNumber(entry.related_fund_id),
    ],
  );
  const triggeredStopLinks = await getTriggeredTakeProfitCloseLinks(tx, { actorUserId, openingEntryId: Number(entry.id) });
  const dependentCloseCents = triggeredStopLinks.closedCents + openingDependentCloseQuantityCents(
    asRows(scopeRows),
    Number(entry.id),
    triggeredStopLinks.closingEntryIds,
  );
  const hasDependentClose = dependentCloseCents > 0;
  const remainingCents = Math.max(0, quantityToCents(entry.quantity) - dependentCloseCents);
  if (hasDependentClose && !options.allowDependentClose) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "该开仓主单已被后续平仓使用，请先处理关联平仓流水" });
  }
  return { entry, hasDependentClose, remainingCents };
}

async function writeEntryAudit(tx: any, input: {
  actorUserId: number;
  entryId: number;
  operation: "update" | "delete" | "revert" | "restore" | "fill" | "expiry_settlement" | "take_profit";
  before: unknown;
  after?: unknown;
}) {
  const [result] = await tx.execute(
    `INSERT INTO ledger52_t0_journal_entry_audits
      (ledger_id, user_id, entry_id, operation, before_snapshot, after_snapshot, operator_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      LEDGER_52_T0_JOURNAL_ID,
      input.actorUserId,
      input.entryId,
      input.operation,
      JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
      input.actorUserId,
    ],
  );
  return Number((result as any)?.insertId || 0);
}

async function buildEntryAuditSnapshot(tx: any, actorUserId: number, entry: any) {
  const entryId = toNumber(entry.id);
  const [profitShareSnapshots, plansByEntryId] = await Promise.all([
    getEntryProfitShareSnapshotRows(tx, { actorUserId, entryIds: [entryId], lock: true }),
    getTakeProfitPlansByEntryId(tx, [entryId], true),
  ]);
  return { ...entry, take_profit_plans: plansByEntryId.get(entryId) ?? [], profitShareSnapshots };
}

type DeribitOptionDelivery = {
  instrumentName: string;
  deliveryPrice: number;
  deliveredAt: Date;
  source: "deribit_delivery";
};

/** Deribit ETH 期权合约名，例如 ETH-25DEC26-2500-C。 */
export function buildDeribitEthOptionInstrumentName(input: {
  expiryDate: string;
  strikePrice: number;
  direction: T0JournalOptionDirection;
}): string | null {
  const date = new Date(`${input.expiryDate}T08:00:00.000Z`);
  const strikePrice = Number(input.strikePrice);
  if (Number.isNaN(date.getTime()) || !Number.isFinite(strikePrice) || strikePrice <= 0) return null;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = DERIBIT_MONTH_CODES[date.getUTCMonth()];
  const year = String(date.getUTCFullYear()).slice(-2);
  const optionType = input.direction.endsWith("call") ? "C" : "P";
  return `ETH-${day}${month}${year}-${String(strikePrice)}-${optionType}`;
}

/** Deribit/OKX 的到期交割时刻均为 08:00 UTC，即北京时间同日 16:00。 */
export function getT0OptionExpiryAt(expiryDate: string): Date | null {
  const result = new Date(`${expiryDate}T08:00:00.000Z`);
  return Number.isNaN(result.getTime()) ? null : result;
}

/**
 * T+0 期权以 USDT 统一展示收益：权利金若以 ETH 计价，则按官方 delivery 的 ETH 指数价换算。
 * 费用沿用 T+0 已确认的 0.0360% 交易成本口径，并在自动平仓记录上一次性固化双边费用。
 */
export function calculateT0OptionExpirySettlement(input: {
  quantity: number;
  strikePrice: number;
  premium: number;
  premiumCurrency: T0JournalOptionPremiumCurrency;
  direction: T0JournalOptionDirection;
  deliveryPrice: number;
  feeRate?: number;
}) {
  const quantity = Number(input.quantity);
  const strikePrice = Number(input.strikePrice);
  const premium = Number(input.premium);
  const deliveryPrice = Number(input.deliveryPrice);
  const feeRate = Number.isFinite(input.feeRate) ? Number(input.feeRate) : T0_OPTION_EXPIRY_FEE_RATE;
  if (![quantity, strikePrice, premium, deliveryPrice, feeRate].every(Number.isFinite)
    || quantity <= 0 || strikePrice <= 0 || premium <= 0 || deliveryPrice <= 0 || feeRate < 0) {
    return null;
  }
  const premiumUsdtPerEth = input.premiumCurrency === "ETH" ? premium * deliveryPrice : premium;
  const settlementPrice = input.direction.endsWith("call")
    ? Math.max(deliveryPrice - strikePrice, 0)
    : Math.max(strikePrice - deliveryPrice, 0);
  const grossPnl = (input.direction.startsWith("short")
    ? premiumUsdtPerEth - settlementPrice
    : settlementPrice - premiumUsdtPerEth) * quantity;
  const totalFee = (premiumUsdtPerEth + settlementPrice) * quantity * feeRate;
  return {
    premiumUsdtPerEth,
    settlementPrice,
    grossPnl,
    totalFee,
    netPnl: grossPnl - totalFee,
  };
}

async function fetchDeribitOptionDelivery(instrumentName: string, expiryAt: Date): Promise<DeribitOptionDelivery | null> {
  try {
    const endpoint = new URL(DERIBIT_OPTION_DELIVERY_URL);
    endpoint.searchParams.set("currency", "ETH");
    endpoint.searchParams.set("type", "delivery");
    endpoint.searchParams.set("count", "1000");
    endpoint.searchParams.set("start_timestamp", String(expiryAt.getTime() - 12 * 60 * 60 * 1000));
    endpoint.searchParams.set("end_timestamp", String(expiryAt.getTime() + 12 * 60 * 60 * 1000));
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const payload = await response.json() as { result?: { settlements?: any[] } };
    const matched = payload.result?.settlements?.find((item) => String(item?.instrument_name || "") === instrumentName);
    const deliveryPrice = Number(matched?.index_price);
    const deliveredAt = new Date(Number(matched?.timestamp));
    if (!Number.isFinite(deliveryPrice) || deliveryPrice <= 0 || Number.isNaN(deliveredAt.getTime())) return null;
    return { instrumentName, deliveryPrice, deliveredAt, source: "deribit_delivery" };
  } catch {
    // 交割记录暂未就绪或网络瞬断时保持原仓，下一分钟再查，绝不以临时期货/现货价格替代。
    return null;
  }
}

/** 仅在同一账户、关联用户、专项款、方向与行权价档位内 FIFO；期权与现货/合约严格隔离。 */
function remainingOptionOpeningCents(rows: any[], openingEntryId: number): number {
  const opening = rows.find((row) => toNumber(row.id) === openingEntryId);
  if (!opening || String(opening.instrument_type) !== "option") return 0;
  const openingAction = String(opening.action) as T0JournalAction;
  if (!isOpeningAction(openingAction)) return 0;
  const closingAction: T0JournalAction = actionSide(openingAction) === "long" ? "closeLong" : "closeShort";
  const archiveKey = priceKey(archivePriceForAction(openingAction, opening.price));
  const expectedUserKey = relatedUserKey(opening.related_user_id);
  const expectedFundKey = relatedFundKey(opening.related_fund_id);
  const queue: Array<{ entryId: number; remainingCents: number }> = [];
  for (const row of rows) {
    if (String(row.instrument_type) !== "option" || String(row.execution_status ?? "filled") !== "filled") continue;
    if (toNumber(row.account_id) !== toNumber(opening.account_id)
      || relatedUserKey(row.related_user_id) !== expectedUserKey
      || relatedFundKey(row.related_fund_id) !== expectedFundKey) continue;
    const rowAction = String(row.action) as T0JournalAction;
    if (rowAction === openingAction && priceKey(archivePriceForAction(rowAction, row.price)) === archiveKey) {
      queue.push({ entryId: toNumber(row.id), remainingCents: quantityToCents(row.quantity) });
      continue;
    }
    if (rowAction !== closingAction || priceKey(archivedTargetPrice(rowAction, row.target_price, row.price)) !== archiveKey) continue;
    let remainingCloseCents = quantityToCents(row.quantity);
    for (const queuedOpening of queue) {
      if (remainingCloseCents <= 0) break;
      const matchedCents = Math.min(queuedOpening.remainingCents, remainingCloseCents);
      queuedOpening.remainingCents -= matchedCents;
      remainingCloseCents -= matchedCents;
    }
  }
  return queue.find((item) => item.entryId === openingEntryId)?.remainingCents ?? 0;
}

let pendingOrderScannerStarted = false;
let pendingOrderScanActive = false;
let pendingOrderScanInFlight = false;
let pendingOrderScanStateRefreshTimer: ReturnType<typeof setInterval> | null = null;

/** 行情流仅在存在未成交挂单或已成交的止盈计划时才触发数据库写入判定。 */
export function hasLedger52T0PendingOrders() {
  return pendingOrderScanActive;
}

function activateLedger52T0PendingOrderScan() {
  pendingOrderScanActive = true;
}

async function refreshLedger52T0PendingOrderScanState() {
  const connection = await getDbConnection();
  if (!connection) return pendingOrderScanActive;
  await ensureLedger52T0JournalTables(connection as any);
  const [rows] = await connection.execute(
    `SELECT 1
       FROM ledger52_t0_journal_entries
      WHERE ledger_id = ? AND (
        (execution_status = 'pending' AND action IN ('openLong', 'openShort'))
        OR (execution_status = 'filled' AND instrument_type IN ('spot', 'contract') AND action IN ('openLong', 'openShort')
          AND EXISTS (
            SELECT 1 FROM ledger52_t0_journal_take_profit_plans plan
             WHERE plan.ledger_id = ledger52_t0_journal_entries.ledger_id
               AND plan.opening_entry_id = ledger52_t0_journal_entries.id
               AND plan.status = 'pending'
          ))
      )
      LIMIT 1`,
    [LEDGER_52_T0_JOURNAL_ID],
  );
  pendingOrderScanActive = Boolean(asRows(rows)[0]);
  return pendingOrderScanActive;
}

/**
 * 自动订单仅引用T+0统一 ETH 永续标记价：先处理开仓挂单，再处理已成交现货/合约的止盈。
 * 多单挂单向下成交、止盈向上平仓；空单挂单向上成交、止盈向下平仓。止盈从不跳过未成交挂单。
 */
export async function scanLedger52T0PendingOrders(input: { markPrice?: number; filledAt?: Date; rangeHigh?: number; rangeLow?: number } = {}) {
  if (process.env.DEV_BYPASS_AUTH === "true" || pendingOrderScanInFlight || !pendingOrderScanActive) {
    return { filled: 0, takeProfit: 0, markPrice: null as number | null };
  }
  const { getT0EthPerpetualMark } = input.markPrice === undefined
    ? await import("./price-scanner")
    : { getT0EthPerpetualMark: () => ({ price: input.markPrice }) };
  const markPrice = Number(getT0EthPerpetualMark().price);
  if (!Number.isFinite(markPrice) || markPrice <= 0) return { filled: 0, takeProfit: 0, markPrice: null as number | null };
  const requestedRangeHigh = Number(input.rangeHigh);
  const requestedRangeLow = Number(input.rangeLow);
  const rangeHigh = Number.isFinite(requestedRangeHigh) && requestedRangeHigh > 0
    ? Math.max(markPrice, requestedRangeHigh)
    : markPrice;
  const rangeLow = Number.isFinite(requestedRangeLow) && requestedRangeLow > 0
    ? Math.min(markPrice, requestedRangeLow)
    : markPrice;
  const rangeLabel = rangeHigh > rangeLow
    ? `ETH永续扫描区间 ${rangeLow.toFixed(2)}–${rangeHigh.toFixed(2)} U`
    : `ETH永续价 ${markPrice.toFixed(2)} U`;

  pendingOrderScanInFlight = true;
  const connection = await getDbTransactionConnection();
  if (!connection) {
    pendingOrderScanInFlight = false;
    return { filled: 0, takeProfit: 0, markPrice };
  }
  const tx: any = connection;
  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const [rows] = await tx.execute(
      `SELECT id, user_id, account_id, related_user_id, related_fund_id, symbol, instrument_type, option_direction, option_expiry_date, option_premium, option_premium_currency, is_locked, is_counterparty,
              execution_status, filled_at, filled_price, take_profit_enabled, take_profit_price, take_profit_quantity, take_profit_triggered_at, take_profit_triggered_price, take_profit_triggered_quantity, action, quantity, price, fee_usdt, target_price, note,
              client_request_id, created_by_user_id, trade_time, created_at, updated_at
         FROM ledger52_t0_journal_entries
        WHERE ledger_id = ? AND execution_status = 'pending' AND action IN ('openLong', 'openShort')
          AND ((action = 'openLong' AND CAST(price AS DECIMAL(36,18)) >= CAST(? AS DECIMAL(36,18)))
            OR (action = 'openShort' AND CAST(price AS DECIMAL(36,18)) <= CAST(? AS DECIMAL(36,18))))
        ORDER BY trade_time ASC, id ASC
        FOR UPDATE`,
      [LEDGER_52_T0_JOURNAL_ID, String(rangeLow), String(rangeHigh)],
    );
    let filled = 0;
    const filledOpeningEntryIds = new Set<number>();
    for (const row of asRows(rows)) {
      const entryId = toNumber(row.id);
      const actorUserId = toNumber(row.user_id);
      if (entryId <= 0 || actorUserId <= 0) continue;
      const before = await buildEntryAuditSnapshot(tx, actorUserId, row);
      const filledAt = input.filledAt ?? new Date();
      const action = String(row.action) as T0JournalAction;
      const isOpenLong = action === "openLong";
      const pendingPrice = toNumber(row.price);
      // 区间回补命中时按挂单价成交；实时价直接越价时仍按更优的实时标记价成交。
      const executionPrice = isOpenLong ? Math.min(markPrice, pendingPrice) : Math.max(markPrice, pendingPrice);
      const systemNote = `[系统自动成交] ${formatBeijingSystemTime(filledAt)}｜${rangeLabel}，达到挂单价 ${pendingPrice.toFixed(2)} U`;
      const note = appendSystemSettlementNote(row.note, systemNote);
      await tx.execute(
        `UPDATE ledger52_t0_journal_entries
            SET execution_status = 'filled', filled_at = ?, filled_price = ?, note = ?, updated_at = NOW(3)
          WHERE id = ? AND ledger_id = ? AND user_id = ? AND execution_status = 'pending'`,
        [mysqlDateTime(filledAt), String(executionPrice), note, entryId, LEDGER_52_T0_JOURNAL_ID, actorUserId],
      );
      const [afterRows] = await tx.execute(
        `SELECT id, user_id, account_id, related_user_id, related_fund_id, symbol, instrument_type, is_locked, is_counterparty,
                execution_status, filled_at, filled_price, take_profit_enabled, take_profit_price, take_profit_quantity, take_profit_triggered_at, take_profit_triggered_price, take_profit_triggered_quantity, action, quantity, price, fee_usdt, target_price, note,
                client_request_id, created_by_user_id, trade_time, created_at, updated_at
           FROM ledger52_t0_journal_entries
          WHERE id = ? AND ledger_id = ? AND user_id = ? LIMIT 1`,
        [entryId, LEDGER_52_T0_JOURNAL_ID, actorUserId],
      );
      const after = asRows(afterRows)[0];
      if (!after || String(after.execution_status) !== "filled") continue;
      await writeEntryAudit(tx, { actorUserId, entryId, operation: "fill", before, after: await buildEntryAuditSnapshot(tx, actorUserId, after) });
      filledOpeningEntryIds.add(entryId);
      filled += 1;
    }

    const [takeProfitRows] = await tx.execute(
      `SELECT e.id, e.user_id, e.account_id, e.related_user_id, e.related_fund_id, e.symbol, e.instrument_type,
              e.is_locked, e.is_counterparty, e.execution_status, e.action, e.quantity, e.price, e.fee_usdt, e.target_price, e.note,
              e.take_profit_enabled, e.take_profit_price, e.take_profit_quantity, e.take_profit_triggered_at, e.take_profit_triggered_price, e.take_profit_triggered_quantity,
              e.client_request_id, e.created_by_user_id, e.trade_time, e.created_at, e.updated_at,
              plan.id AS take_profit_plan_id, plan.trigger_price AS plan_trigger_price, plan.quantity AS plan_quantity
         FROM ledger52_t0_journal_take_profit_plans plan
         INNER JOIN ledger52_t0_journal_entries e
           ON e.id = plan.opening_entry_id AND e.ledger_id = plan.ledger_id AND e.user_id = plan.user_id
        WHERE e.ledger_id = ? AND e.execution_status = 'filled' AND e.is_locked = 0
          AND e.instrument_type IN ('spot', 'contract') AND e.action IN ('openLong', 'openShort')
          AND plan.status = 'pending'
          AND ((e.action = 'openLong' AND CAST(plan.trigger_price AS DECIMAL(36,18)) <= CAST(? AS DECIMAL(36,18)))
            OR (e.action = 'openShort' AND CAST(plan.trigger_price AS DECIMAL(36,18)) >= CAST(? AS DECIMAL(36,18))))
        ORDER BY e.trade_time ASC, e.id ASC, plan.id ASC
        FOR UPDATE`,
      [LEDGER_52_T0_JOURNAL_ID, String(rangeHigh), String(rangeLow)],
    );
    let takeProfit = 0;
    for (const candidate of asRows(takeProfitRows)) {
      const openingEntryId = toNumber(candidate.id);
      const actorUserId = toNumber(candidate.user_id);
      const openingAction = String(candidate.action) as T0JournalAction;
      // 同一个扫描区间内刚成交的挂单不立即止盈；必须在后续行情区间再次满足条件，确保先成交、后止盈。
      if (openingEntryId <= 0 || actorUserId <= 0 || filledOpeningEntryIds.has(openingEntryId) || !shouldTriggerLedger52T0TakeProfit({
        action: openingAction,
        markPrice,
        takeProfitPrice: toNumber(candidate.plan_trigger_price),
        rangeHigh,
        rangeLow,
      })) continue;
      const beforeOpening = await buildEntryAuditSnapshot(tx, actorUserId, candidate);
      const [scopeResult] = await tx.execute(
        `SELECT id, action, execution_status, quantity, price, target_price, related_user_id, related_fund_id,
                account_id, symbol, instrument_type, created_at
           FROM ledger52_t0_journal_entries
          WHERE ledger_id = ? AND user_id = ? AND account_id = ? AND symbol = ?
            AND COALESCE(related_user_id, 0) = ? AND COALESCE(related_fund_id, 0) = ?
          ORDER BY created_at ASC, id ASC FOR UPDATE`,
        [
          LEDGER_52_T0_JOURNAL_ID,
          actorUserId,
          toNumber(candidate.account_id),
          String(candidate.symbol || 'ETH'),
          toNumber(candidate.related_user_id),
          toNumber(candidate.related_fund_id),
        ],
      );
      const scopeRows = asRows(scopeResult);
      const currentOpening = scopeRows.find((row) => toNumber(row.id) === openingEntryId);
      if (!currentOpening || String(currentOpening.execution_status) !== 'filled') continue;
      const triggeredStopLinks = await getTriggeredTakeProfitCloseLinks(tx, { actorUserId, openingEntryId });
      const remainingCents = Math.max(
        0,
        quantityToCents(currentOpening.quantity)
          - triggeredStopLinks.closedCents
          - openingDependentCloseQuantityCents(scopeRows, openingEntryId, triggeredStopLinks.closingEntryIds),
      );
      if (remainingCents <= 0) {
        await tx.execute(
          `UPDATE ledger52_t0_journal_take_profit_plans
              SET status = 'cancelled', updated_at = NOW(3)
            WHERE ledger_id = ? AND user_id = ? AND opening_entry_id = ? AND status = 'pending'`,
          [LEDGER_52_T0_JOURNAL_ID, actorUserId, openingEntryId],
        );
        await syncEntryTakeProfitSummary(tx, { actorUserId, openingEntryId });
        continue;
      }
      const configuredCents = quantityToCents(candidate.plan_quantity);
      const actualCents = Math.min(remainingCents, configuredCents);
      if (actualCents <= 0) continue;
      const closeAction: T0JournalAction = openingAction === 'openLong' ? 'closeLong' : 'closeShort';
      const targetPrice = archivePriceForAction(closeAction, currentOpening.price);
      const occurredAt = input.filledAt ?? new Date();
      const quantity = (actualCents / 100).toFixed(2);
      const planTriggerPrice = toNumber(candidate.plan_trigger_price);
      // 区间回补命中时按止盈价平仓；实时价直接越价时仍按更优的实时标记价平仓。
      const executionPrice = openingAction === 'openLong'
        ? Math.max(markPrice, planTriggerPrice)
        : Math.min(markPrice, planTriggerPrice);
      const note = `[系统自动止盈] ${formatBeijingSystemTime(occurredAt)}｜${rangeLabel}，达到止盈价 ${planTriggerPrice.toFixed(2)} U｜自动平 ${quantity} ETH`;
      const closeRequestId = `take-profit-${openingEntryId}-${occurredAt.getTime().toString(36)}`;
      const [closeResult] = await tx.execute(
        `INSERT INTO ledger52_t0_journal_entries
          (ledger_id, user_id, account_id, related_user_id, related_fund_id, symbol, instrument_type,
           is_locked, is_counterparty, execution_status, action, quantity, price, fee_usdt, target_price, note, client_request_id, created_by_user_id, trade_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 'filled', ?, ?, ?,
           ROUND(CAST(? AS DECIMAL(36,18)) * CAST(? AS DECIMAL(36,18)) * ${OKX_VIP2_TAKER_FEE_RATE}, 18), ?, ?, ?, ?, ?)`,
        [
          LEDGER_52_T0_JOURNAL_ID,
          actorUserId,
          toNumber(candidate.account_id),
          toNumber(candidate.related_user_id) || null,
          toNumber(candidate.related_fund_id) || null,
          String(candidate.symbol || 'ETH'),
          String(candidate.instrument_type),
          closeAction,
          quantity,
          String(executionPrice),
          quantity,
          String(executionPrice),
          String(targetPrice),
          note,
          closeRequestId,
          actorUserId,
          mysqlDateTime(occurredAt),
        ],
      );
      const closeEntryId = Number((closeResult as any).insertId || 0);
      if (!closeEntryId) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '系统自动止盈流水写入失败' });
      await writeClosingProfitShareSnapshots(tx, {
        actorUserId,
        entryId: closeEntryId,
        sourceUserId: toNumber(candidate.related_user_id),
        positionRows: scopeRows,
        action: closeAction,
        targetPrice: String(targetPrice),
        relatedFundId: toNumber(candidate.related_fund_id),
        quantity,
      });
      const takeProfitPlanId = toNumber(candidate.take_profit_plan_id);
      const [triggerResult] = await tx.execute(
        `UPDATE ledger52_t0_journal_take_profit_plans
            SET status = 'triggered', triggered_at = ?, triggered_price = ?, triggered_quantity = ?, closing_entry_id = ?, updated_at = NOW(3)
          WHERE id = ? AND ledger_id = ? AND user_id = ? AND opening_entry_id = ? AND status = 'pending'`,
        [mysqlDateTime(occurredAt), String(executionPrice), quantity, closeEntryId, takeProfitPlanId, LEDGER_52_T0_JOURNAL_ID, actorUserId, openingEntryId],
      );
      if (Number((triggerResult as any).affectedRows || 0) !== 1) {
        throw new TRPCError({ code: 'CONFLICT', message: '止盈计划已被其他扫描处理，请重试' });
      }
      await syncEntryTakeProfitSummary(tx, { actorUserId, openingEntryId });
      const [afterOpeningRows, closeRows] = await Promise.all([
        tx.execute(`SELECT * FROM ledger52_t0_journal_entries WHERE id = ? AND ledger_id = ? AND user_id = ? LIMIT 1`, [openingEntryId, LEDGER_52_T0_JOURNAL_ID, actorUserId]),
        tx.execute(`SELECT * FROM ledger52_t0_journal_entries WHERE id = ? AND ledger_id = ? AND user_id = ? LIMIT 1`, [closeEntryId, LEDGER_52_T0_JOURNAL_ID, actorUserId]),
      ]);
      const afterOpening = asRows(afterOpeningRows)[0];
      const closeEntry = asRows(closeRows)[0];
      if (!afterOpening || !closeEntry) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '系统自动止盈后读取流水失败' });
      await writeEntryAudit(tx, {
        actorUserId,
        entryId: openingEntryId,
        operation: 'take_profit',
        before: beforeOpening,
        after: await buildEntryAuditSnapshot(tx, actorUserId, afterOpening),
      });
      await writeEntryAudit(tx, {
        actorUserId,
        entryId: closeEntryId,
        operation: 'take_profit',
        before: { automatic: true, trigger: 'take_profit', openingEntryId, markPrice, rangeHigh, rangeLow, executionPrice, takeProfitPrice: planTriggerPrice, configuredQuantity: toNumber(candidate.plan_quantity), actualQuantity: actualCents / 100 },
        after: await buildEntryAuditSnapshot(tx, actorUserId, closeEntry),
      });
      takeProfit += 1;
    }
    const [remainingPendingRows] = await tx.execute(
      `SELECT 1
         FROM ledger52_t0_journal_entries
        WHERE ledger_id = ? AND (
          (execution_status = 'pending' AND action IN ('openLong', 'openShort'))
          OR (execution_status = 'filled' AND instrument_type IN ('spot', 'contract') AND action IN ('openLong', 'openShort')
            AND EXISTS (
              SELECT 1 FROM ledger52_t0_journal_take_profit_plans plan
               WHERE plan.ledger_id = ledger52_t0_journal_entries.ledger_id
                 AND plan.opening_entry_id = ledger52_t0_journal_entries.id
                 AND plan.status = 'pending'
            ))
        )
        LIMIT 1`,
      [LEDGER_52_T0_JOURNAL_ID],
    );
    pendingOrderScanActive = Boolean(asRows(remainingPendingRows)[0]);
    await tx.commit();
    return { filled, takeProfit, markPrice };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    pendingOrderScanInFlight = false;
    tx.release?.();
  }
}

let optionExpirySettlementScanTimer: ReturnType<typeof setInterval> | null = null;
let optionExpirySettlementScanInFlight = false;

/**
 * 只在到期日 08:00 UTC（北京时间 16:00）之后执行：先读取 Deribit 官方 delivery，
 * 再生成不可变的自动平仓流水。交割记录缺失时不做任何写入并在下一轮重试。
 */
export async function scanLedger52T0ExpiredOptions(input: {
  now?: Date;
  fetchDelivery?: (instrumentName: string, expiryAt: Date) => Promise<DeribitOptionDelivery | null>;
} = {}) {
  if (optionExpirySettlementScanInFlight) return { settled: 0, awaitingDelivery: 0 };
  const now = input.now ?? new Date();
  const connection = await getDbConnection();
  if (!connection) return { settled: 0, awaitingDelivery: 0 };
  await ensureLedger52T0JournalTables(connection);

  const [candidateRows] = await connection.execute(
    `SELECT id, user_id, account_id, related_user_id, related_fund_id, symbol, instrument_type, option_direction, option_expiry_date, option_premium, option_premium_currency,
            action, quantity, price, execution_status, client_request_id, trade_time
       FROM ledger52_t0_journal_entries
      WHERE ledger_id = ? AND instrument_type = 'option' AND execution_status = 'filled'
        AND action IN ('openLong', 'openShort') AND option_expiry_date IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
            FROM ledger52_t0_journal_entries settled
           WHERE settled.ledger_id = ledger52_t0_journal_entries.ledger_id
             AND settled.user_id = ledger52_t0_journal_entries.user_id
             AND settled.client_request_id = CONCAT('option-expiry-', ledger52_t0_journal_entries.id)
        )
      ORDER BY trade_time ASC, id ASC`,
    [LEDGER_52_T0_JOURNAL_ID],
  );
  const candidates = asRows(candidateRows).flatMap((row) => {
    const expiryDate = mapOptionDate(row.option_expiry_date);
    const direction = String(row.option_direction || "") as T0JournalOptionDirection;
    const expiryAt = expiryDate ? getT0OptionExpiryAt(expiryDate) : null;
    const instrumentName = expiryDate && T0_JOURNAL_OPTION_DIRECTIONS.has(direction)
      ? buildDeribitEthOptionInstrumentName({ expiryDate, strikePrice: toNumber(row.price), direction })
      : null;
    return expiryAt && expiryAt.getTime() <= now.getTime() && instrumentName
      ? [{ row, expiryDate, direction, expiryAt, instrumentName }]
      : [];
  });
  if (candidates.length === 0) return { settled: 0, awaitingDelivery: 0 };

  const fetchDelivery = input.fetchDelivery ?? fetchDeribitOptionDelivery;
  const deliveries = new Map<string, DeribitOptionDelivery>();
  for (const candidate of candidates) {
    if (deliveries.has(candidate.instrumentName)) continue;
    const delivery = await fetchDelivery(candidate.instrumentName, candidate.expiryAt);
    if (delivery) deliveries.set(candidate.instrumentName, delivery);
  }
  const candidatesWithDelivery = candidates.filter((candidate) => deliveries.has(candidate.instrumentName));
  if (candidatesWithDelivery.length === 0) return { settled: 0, awaitingDelivery: candidates.length };

  optionExpirySettlementScanInFlight = true;
  const txConnection = await getDbTransactionConnection();
  if (!txConnection) {
    optionExpirySettlementScanInFlight = false;
    return { settled: 0, awaitingDelivery: candidates.length - candidatesWithDelivery.length };
  }
  const tx: any = txConnection;
  try {
    await tx.beginTransaction();
    const [lockedRowsResult] = await tx.execute(
      `SELECT id, user_id, account_id, related_user_id, related_fund_id, symbol, instrument_type, option_direction, option_expiry_date, option_premium, option_premium_currency,
              option_settlement_price, option_delivery_price, option_settled_at, option_settlement_source,
              is_locked, is_counterparty, execution_status, filled_at, filled_price, action, quantity, price, fee_usdt, target_price, note,
              client_request_id, created_by_user_id, trade_time, created_at, updated_at
         FROM ledger52_t0_journal_entries
        WHERE ledger_id = ? AND instrument_type = 'option'
        ORDER BY trade_time ASC, id ASC
        FOR UPDATE`,
      [LEDGER_52_T0_JOURNAL_ID],
    );
    const lockedRows = asRows(lockedRowsResult);
    let settled = 0;
    for (const candidate of candidatesWithDelivery) {
      const opening = lockedRows.find((row) => toNumber(row.id) === toNumber(candidate.row.id));
      const delivery = deliveries.get(candidate.instrumentName);
      if (!opening || !delivery || String(opening.execution_status) !== "filled") continue;
      const actorUserId = toNumber(opening.user_id);
      const openingEntryId = toNumber(opening.id);
      const closeRequestId = `option-expiry-${openingEntryId}`;
      if (actorUserId <= 0 || openingEntryId <= 0 || lockedRows.some((row) => String(row.client_request_id || "") === closeRequestId)) continue;
      const remainingCents = remainingOptionOpeningCents(lockedRows, openingEntryId);
      if (remainingCents <= 0) continue;
      const premiumCurrency = String(opening.option_premium_currency || "") as T0JournalOptionPremiumCurrency;
      const settlement = T0_JOURNAL_OPTION_PREMIUM_CURRENCIES.has(premiumCurrency)
        ? calculateT0OptionExpirySettlement({
          quantity: remainingCents / 100,
          strikePrice: toNumber(opening.price),
          premium: toNumber(opening.option_premium),
          premiumCurrency,
          direction: candidate.direction,
          deliveryPrice: delivery.deliveryPrice,
        })
        : null;
      if (!settlement) continue;
      const closingAction: T0JournalAction = actionSide(String(opening.action) as T0JournalAction) === "long" ? "closeLong" : "closeShort";
      const targetPrice = archivePriceForAction(closingAction, opening.price);
      const quantity = (remainingCents / 100).toFixed(2);
      // 备注用于移动端阅读，所有 U 金额统一保留两位；数据库内仍以 18 位精度保存并参与结算计算。
      const note = `[系统自动结算] ${formatBeijingSystemTime(candidate.expiryAt).slice(0, 16)} 到期｜行权价 ${toNumber(opening.price).toFixed(2)} U｜最终价 ${delivery.deliveryPrice.toFixed(2)} U｜结算价 ${settlement.settlementPrice.toFixed(2)} U｜费用 ${settlement.totalFee.toFixed(2)} U`;
      const [entryResult] = await tx.execute(
        `INSERT INTO ledger52_t0_journal_entries
          (ledger_id, user_id, account_id, related_user_id, related_fund_id, symbol, instrument_type, option_direction, option_expiry_date, option_premium, option_premium_currency,
           option_settlement_price, option_delivery_price, option_settled_at, option_settlement_source,
           is_locked, execution_status, action, quantity, price, fee_usdt, target_price, note, client_request_id, created_by_user_id, trade_time)
         VALUES (?, ?, ?, ?, ?, 'ETH', 'option', ?, ?, ?, ?, ?, ?, ?, ?, 0, 'filled', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          LEDGER_52_T0_JOURNAL_ID,
          actorUserId,
          toNumber(opening.account_id),
          toNumber(opening.related_user_id) || null,
          toNumber(opening.related_fund_id) || null,
          candidate.direction,
          candidate.expiryDate,
          String(opening.option_premium),
          premiumCurrency,
          settlement.settlementPrice.toFixed(18),
          delivery.deliveryPrice.toFixed(18),
          mysqlDateTime(now),
          delivery.source,
          closingAction,
          quantity,
          String(opening.price),
          settlement.totalFee.toFixed(18),
          String(targetPrice),
          note,
          closeRequestId,
          actorUserId,
          mysqlDateTime(candidate.expiryAt),
        ],
      );
      const entryId = Number((entryResult as any).insertId || 0);
      if (!entryId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "期权到期结算流水写入失败" });
      await writeClosingProfitShareSnapshots(tx, {
        actorUserId,
        entryId,
        sourceUserId: toNumber(opening.related_user_id),
        positionRows: lockedRows,
        action: closingAction,
        targetPrice: String(targetPrice),
        relatedFundId: toNumber(opening.related_fund_id),
        quantity,
      });
      const [afterRows] = await tx.execute(
        `SELECT * FROM ledger52_t0_journal_entries WHERE id = ? AND ledger_id = ? AND user_id = ? LIMIT 1`,
        [entryId, LEDGER_52_T0_JOURNAL_ID, actorUserId],
      );
      const after = asRows(afterRows)[0];
      if (!after) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "期权到期结算流水读取失败" });
      await writeEntryAudit(tx, {
        actorUserId,
        entryId,
        operation: "expiry_settlement",
        before: {
          automatic: true,
          trigger: "option_expiry",
          openingEntryId,
          instrumentName: delivery.instrumentName,
          deliveryPrice: delivery.deliveryPrice,
          optionSettlementPrice: settlement.settlementPrice,
          grossPnl: settlement.grossPnl,
          totalFee: settlement.totalFee,
          netPnl: settlement.netPnl,
        },
        after: await buildEntryAuditSnapshot(tx, actorUserId, after),
      });
      lockedRows.push(after);
      settled += 1;
    }
    await tx.commit();
    return { settled, awaitingDelivery: candidates.length - candidatesWithDelivery.length };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    optionExpirySettlementScanInFlight = false;
    tx.release?.();
  }
}

/** 生产服务每分钟确认一次到期交割；本地 DEV_BYPASS 绝不启动，避免热预览写入真实订单。 */
export function startLedger52T0ExpiredOptionScanner() {
  if (optionExpirySettlementScanTimer || process.env.DEV_BYPASS_AUTH === "true") return;
  const run = () => {
    void scanLedger52T0ExpiredOptions()
      .then((result) => {
        if (result.settled > 0) console.log(`[T0期权] Deribit 官方交割，自动结算 ${result.settled} 笔`);
      })
      .catch((error) => console.error("[T0期权] 自动到期结算扫描失败:", error instanceof Error ? error.message : error));
  };
  run();
  optionExpirySettlementScanTimer = setInterval(run, 60_000);
  console.log("[T0期权] 自动到期结算扫描已启动（每60秒，仅官方Deribit delivery后写入）");
}

/**
 * 启动生产自动订单扫描开关：启动时检查挂单与止盈计划；随后由实时 ETH 永续标记价逐笔触发。
 * DEV_BYPASS 热预览绝不启动，避免将预览行情写入真实订单。
 */
export function startLedger52T0PendingOrderScanner() {
  if (pendingOrderScannerStarted || process.env.DEV_BYPASS_AUTH === "true") return;
  pendingOrderScannerStarted = true;
  const refreshScanState = (reason: "初始化" | "定时复核") => {
    const wasActive = pendingOrderScanActive;
    void refreshLedger52T0PendingOrderScanState()
      .then((hasPending) => {
        if (reason === "初始化") {
          console.log(`[T0自动订单] 实时标记价触发已启动（${hasPending ? "当前有挂单或止盈" : "当前无自动订单"}）`);
        } else if (hasPending !== wasActive) {
          console.log(`[T0自动订单] ${hasPending ? "发现待处理挂单或止盈，已恢复行情触发" : "当前无待处理自动订单，暂停行情触发"}`);
        }
      })
      .catch((error) => console.error(`[T0自动订单] ${reason}状态失败:`, error instanceof Error ? error.message : error));
  };
  refreshScanState("初始化");
  // 状态只留在当前 Node 进程内；定时复核可覆盖服务重启、首次初始化失败，
  // 以及集群请求落在不同进程时未同步到本地内存的情形。
  pendingOrderScanStateRefreshTimer = setInterval(() => refreshScanState("定时复核"), 60_000);
}

export async function updateLedger52T0JournalOpeningEntry(input: {
  actorUserId: number;
  entryId: number;
  /** 可改为当前管理员名下的既有有效账户；未传时可配合 accountName 新建账户，否则保留原账户。 */
  accountId?: number;
  accountName?: string;
  /** 允许管理员保留未关联状态，之后再补充关联用户。 */
  relatedUserId?: number;
  relatedFundId?: number;
  relatedFundName?: string;
  /** 开仓记录必须明确标注为现货、合约、期权或网格。 */
  instrumentType: T0JournalInstrumentType;
  /** 未传时保持历史锁定状态，传入时可锁定或解除。 */
  isLocked?: boolean;
  /** 未传时保持原反向展示状态；传入 true/false 仅修改开仓主单的管理员投影。 */
  isCounterparty?: boolean;
  /** 仅反向展示标记切换：可安全绕过后续平仓保护，服务端只更新该标记本身。 */
  counterpartyOnly?: boolean;
  /** 仅锁定标记切换：可安全标识已部分平仓主单的剩余仓位，服务端只更新该标记本身。 */
  lockOnly?: boolean;
  /** 未传时保持原成交状态；新建时 true 为挂单，编辑时不可直接切换。 */
  isPending?: boolean;
  /** 仅允许管理员把仍未成交的开仓挂单单向确认成交；必须同时传 isPending=false。 */
  manualConfirmPendingFill?: boolean;
  /** 止盈仅用于现货/合约；可在挂单创建时预设，必须成交后触发。 */
  takeProfitEnabled?: boolean;
  takeProfitPrice?: string;
  takeProfitQuantity?: string;
  takeProfitPlans?: T0TakeProfitPlanInput[];
  /** 已部分平仓的开仓单只允许单独更新剩余仓位的止盈计划。 */
  takeProfitOnly?: boolean;
  /** 持仓单的收益分配清单：更新本单尚未平掉的快照，并同步后续新开订单默认规则。 */
  profitShareAllocations?: Array<{ beneficiaryUserId: number; percentage: number }>;
  /** 已部分平仓时，仅允许单独更新尚余仓位的收益分配。 */
  profitShareOnly?: boolean;
  optionDirection?: T0JournalOptionDirection;
  optionExpiryDate?: string;
  optionPremium?: string;
  optionPremiumCurrency?: T0JournalOptionPremiumCurrency;
  gridDirection?: T0JournalGridDirection;
  gridRangeMin?: string;
  gridRangeMax?: string;
  gridLeverage?: string;
  gridCount?: number;
  quantity: string;
  price: string;
  note?: string;
}) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;
  const normalizedQuantity = requireValidEthQuantity(input.quantity);
  const instrumentType = normalizeInstrumentType(input.instrumentType, true);
  const isLocked = input.isLocked === undefined ? null : input.isLocked ? 1 : 0;
  const isCounterparty = input.isCounterparty === undefined ? null : input.isCounterparty ? 1 : 0;
  const isPending = input.isPending === undefined ? null : input.isPending ? 1 : 0;
  const manualConfirmPendingFill = input.manualConfirmPendingFill === true;
  const hasProfitShareUpdate = input.profitShareAllocations !== undefined;
  const profitShareOnlyUpdate = input.profitShareOnly === true;

  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const lockedEntry = await lockEditableOpeningEntry(tx, input.actorUserId, input.entryId, {
      allowDependentClose: input.lockOnly === true || input.takeProfitOnly === true || profitShareOnlyUpdate,
    });
    const before = lockedEntry.entry;
    const beforeForAudit = await buildEntryAuditSnapshot(tx, input.actorUserId, before);
    const nextIsPending = isPending === null
      ? String(before.execution_status ?? "filled") === "pending"
      : isPending === 1;
    const wasPending = String(before.execution_status ?? "filled") === "pending";
    // 已成交单不能回退为挂单。唯一例外是管理员明确确认一笔仍处于 pending 的开仓挂单，
    // 以当前表单成交价和当前确认时间落为 filled；普通编辑绝不可绕过该确认动作。
    if (manualConfirmPendingFill && (!wasPending || nextIsPending)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "仅未成交挂单可以手动确认成交" });
    }
    if (isPending !== null && nextIsPending !== wasPending && !(manualConfirmPendingFill && wasPending && !nextIsPending)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "已有开仓订单不可在编辑中切换挂单状态；挂单仅能在新开仓或平仓时设置" });
    }
    if (nextIsPending && isLocked === 1) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "挂单成交前不可设为锁定；请在成交后再锁定" });
    }
    if (profitShareOnlyUpdate && !hasProfitShareUpdate) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "请提交完整的本单收益分配清单" });
    }
    // 将已成交订单改回挂单时强制解除锁定；历史异常组合也会在下一次编辑中自动修正。
    const isLockedForUpdate = nextIsPending ? 0 : isLocked;
    if (lockedEntry.hasDependentClose) {
      const takeProfit = resolveTakeProfitParameters({
        action: String(before.action) as T0JournalAction,
        instrumentType,
        quantity: normalizedQuantity,
        price: input.price,
        takeProfitEnabled: input.takeProfitEnabled,
        takeProfitPrice: input.takeProfitPrice,
        takeProfitQuantity: input.takeProfitQuantity,
        takeProfitPlans: input.takeProfitPlans,
      }, before, (lockedEntry.remainingCents / 100).toFixed(2));
      if (lockedEntry.remainingCents <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "该开仓主单已全部平仓，没有剩余仓位可锁定或编辑" });
      }
      const dependentSafeUpdate = input.lockOnly === true && input.counterpartyOnly !== true
        ? { column: "is_locked", value: isLocked, label: "锁定" }
        : null;
      const takeProfitOnlyUpdate = input.takeProfitOnly === true && input.counterpartyOnly !== true;
      if ((!dependentSafeUpdate || dependentSafeUpdate.value === null) && !takeProfitOnlyUpdate && !profitShareOnlyUpdate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "该开仓主单已被后续平仓使用；仅可对剩余仓位单独切换锁定、止盈或收益分配，其他字段不可编辑" });
      }
      // 锁定、止盈和本单分配都只作用于尚未平掉的余额，不触碰原始数量、价格、账户、归属或 FIFO 历史。
      if (takeProfitOnlyUpdate) {
        await tx.execute(
          `UPDATE ledger52_t0_journal_entries
              SET is_locked = COALESCE(?, is_locked),
                  take_profit_enabled = ?, take_profit_price = ?, take_profit_quantity = ?,
                  take_profit_triggered_at = CASE WHEN ? = 1 THEN NULL ELSE take_profit_triggered_at END,
                  take_profit_triggered_price = CASE WHEN ? = 1 THEN NULL ELSE take_profit_triggered_price END,
                  take_profit_triggered_quantity = CASE WHEN ? = 1 THEN NULL ELSE take_profit_triggered_quantity END,
                  updated_at = NOW(3)
            WHERE id = ? AND ledger_id = ? AND user_id = ?`,
          [input.lockOnly === true ? isLocked : null, takeProfit.enabled ? 1 : 0, takeProfit.price, takeProfit.quantity, takeProfit.enabled ? 1 : 0, takeProfit.enabled ? 1 : 0, takeProfit.enabled ? 1 : 0, input.entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
        );
      } else if (dependentSafeUpdate) {
        await tx.execute(
          `UPDATE ledger52_t0_journal_entries SET ${dependentSafeUpdate!.column} = ?, updated_at = NOW(3)
            WHERE id = ? AND ledger_id = ? AND user_id = ?`,
          [dependentSafeUpdate!.value, input.entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
        );
      }
      if (takeProfitOnlyUpdate) {
        await replacePendingTakeProfitPlans(tx, { actorUserId: input.actorUserId, openingEntryId: input.entryId, plans: takeProfit.plans });
        await syncEntryTakeProfitSummary(tx, { actorUserId: input.actorUserId, openingEntryId: input.entryId });
      }
      if (profitShareOnlyUpdate) {
        await updateOpeningProfitShareSnapshotsAndFutureRules(tx, {
          actorUserId: input.actorUserId,
          entryId: input.entryId,
          before,
          remainingQuantity: (lockedEntry.remainingCents / 100).toFixed(2),
          allocations: input.profitShareAllocations!,
        });
      }
      const [accountRows] = await tx.execute(
        `SELECT id, name, last_used_at, created_at FROM ledger52_t0_journal_accounts
          WHERE id = ? AND ledger_id = ? AND user_id = ? LIMIT 1`,
        [before.account_id, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      );
      const [updatedRows] = await tx.execute(
        `SELECT e.id, e.account_id, a.name AS account_name, e.related_user_id, e.related_fund_id, f.name AS related_fund_name,
                COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', e.related_user_id)) AS related_user_name,
                u.username AS related_username, u.avatar AS related_user_avatar,
                e.symbol, e.instrument_type, e.option_direction, e.option_expiry_date, e.option_premium, e.option_premium_currency,
                e.grid_direction, e.grid_range_min, e.grid_range_max, e.grid_leverage, e.grid_count,
                e.is_locked, e.is_counterparty, e.execution_status, e.filled_at, e.filled_price,
                e.take_profit_enabled, e.take_profit_price, e.take_profit_quantity, e.take_profit_triggered_at, e.take_profit_triggered_price, e.take_profit_triggered_quantity,
                e.action, e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.trade_time, e.created_at
           FROM ledger52_t0_journal_entries e
           INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
           LEFT JOIN users u ON u.id = e.related_user_id
           LEFT JOIN ledger52_t0_journal_related_funds f ON f.id = e.related_fund_id AND f.ledger_id = e.ledger_id AND f.user_id = e.user_id
          WHERE e.id = ? AND e.ledger_id = ? AND e.user_id = ? LIMIT 1`,
        [input.entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      );
      const account = asRows(accountRows)[0];
      const after = asRows(updatedRows)[0];
      const partialUpdateLabel = profitShareOnlyUpdate ? "收益分配" : takeProfitOnlyUpdate ? "止盈" : dependentSafeUpdate?.label ?? "持仓";
      if (!account || !after) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `${partialUpdateLabel}设置后读取失败` });
      const partialPlansByEntryId = await getTakeProfitPlansByEntryId(tx, [input.entryId]);
      after.take_profit_plans = partialPlansByEntryId.get(input.entryId) ?? [];
      await writeEntryAudit(tx, { actorUserId: input.actorUserId, entryId: input.entryId, operation: "update", before: beforeForAudit, after: await buildEntryAuditSnapshot(tx, input.actorUserId, after) });
      await tx.commit();
      if (takeProfit.enabled) activateLedger52T0PendingOrderScan();
      else void refreshLedger52T0PendingOrderScanState();
      return { account: mapAccount(account), entry: mapEntry(after) };
    }
    const effectiveInstrumentType = instrumentType;
    if (nextIsPending && (effectiveInstrumentType === "option" || effectiveInstrumentType === "grid")) {
      throw new TRPCError({ code: "BAD_REQUEST", message: effectiveInstrumentType === "grid" ? "网格参数仅作策略记录，不支持挂单自动成交" : "期权请直接成交；行权价不能作为挂单触发价" });
    }
    const optionParameters = effectiveInstrumentType === "option" ? resolveOptionParameters(input, before) : null;
    const gridParameters = effectiveInstrumentType === "grid" ? resolveGridParameters(input, before) : null;
    if (optionParameters && String(before.action) !== optionOpeningActionForDirection(optionParameters.direction)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "修改后的期权方向会改变报价侧；请新建该期权订单" });
    }
    if (gridParameters && String(before.action) !== (gridParameters.direction === "long" ? "openLong" : "openShort")) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "修改后的网格方向会改变报价侧；请新建该网格订单" });
    }
    const effectivePrice = gridParameters
      ? gridParameters.direction === "long" ? gridParameters.rangeMin : gridParameters.rangeMax
      : input.price;
    const takeProfit = resolveTakeProfitParameters({
      action: String(before.action) as T0JournalAction,
      instrumentType: effectiveInstrumentType,
      quantity: normalizedQuantity,
      price: String(effectivePrice),
      takeProfitEnabled: input.takeProfitEnabled,
      takeProfitPrice: input.takeProfitPrice,
      takeProfitQuantity: input.takeProfitQuantity,
      takeProfitPlans: input.takeProfitPlans,
    }, before, lockedEntry.hasDependentClose ? (lockedEntry.remainingCents / 100).toFixed(2) : undefined);
    let accountId = input.accountId === undefined ? toNumber(before.account_id) : Number(input.accountId);
    const requestedAccountName = input.accountName === undefined
      ? ""
      : normalizeJournalDirectoryName(input.accountName, "账户名称");
    if (requestedAccountName) {
      const [accountResult] = await tx.execute(
        `INSERT INTO ledger52_t0_journal_accounts (ledger_id, user_id, name, is_active, last_used_at)
         VALUES (?, ?, ?, 1, NOW(3))
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), is_active = 1, last_used_at = NOW(3), updated_at = NOW(3)`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, requestedAccountName],
      );
      accountId = Number((accountResult as any).insertId || 0);
      if (!accountId) {
        const [accountRows] = await tx.execute(
          `SELECT id FROM ledger52_t0_journal_accounts
            WHERE ledger_id = ? AND user_id = ? AND name = ? LIMIT 1 FOR UPDATE`,
          [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, requestedAccountName],
        );
        accountId = toNumber(asRows(accountRows)[0]?.id);
      }
    }
    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "下单账户信息无效，请重新选择或新建" });
    }
    if (accountId !== toNumber(before.account_id) && !requestedAccountName) {
      const [targetAccountRows] = await tx.execute(
        `SELECT id
           FROM ledger52_t0_journal_accounts
          WHERE id = ? AND ledger_id = ? AND user_id = ? AND is_active = 1
          LIMIT 1 FOR UPDATE`,
        [accountId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      );
      if (!asRows(targetAccountRows)[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "目标下单账户不存在、已停用或无权选择" });
      }
    }
    await tx.execute(
      `UPDATE ledger52_t0_journal_accounts
          SET last_used_at = NOW(3)
        WHERE id = ? AND ledger_id = ? AND user_id = ?`,
      [accountId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    const relatedUserId = Number(input.relatedUserId || 0);
    if (relatedUserId > 0) {
      if (!Number.isInteger(relatedUserId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "关联用户信息无效" });
      }
      const [relatedUserRows] = await tx.execute(
        `SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
        [relatedUserId],
      );
      if (!asRows(relatedUserRows)[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "关联用户不存在或已失效，请重新选择" });
      }
    }
    if (beforeForAudit.profitShareSnapshots.length > 0 && relatedUserId !== toNumber(before.related_user_id)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "该开仓已固化收益分配快照；如需修改关联用户，请先回撤后重新录入" });
    }
    const relatedFund = await resolveLedger52T0JournalRelatedFund(tx, {
      actorUserId: input.actorUserId,
      relatedUserId,
      relatedFundId: input.relatedFundId,
      relatedFundName: input.relatedFundName,
      // 旧开仓可能在专项款功能上线前已关联用户，编辑时允许暂时保留“未区分专项款（历史）”。
      required: false,
    });
    if (hasProfitShareUpdate && (
      relatedUserId !== toNumber(before.related_user_id)
      || (relatedFund?.id ?? 0) !== toNumber(before.related_fund_id)
    )) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "编辑本单收益分配时不可同时修改关联用户或项目" });
    }
    if (accountId !== toNumber(before.account_id)) {
      // 目标账户若已有本单之后的平仓，移入该开仓会改写目标账户既有 FIFO 配对，必须先处理平仓流水。
      const [targetCloseRows] = await tx.execute(
        `SELECT id
           FROM ledger52_t0_journal_entries
          WHERE ledger_id = ? AND user_id = ? AND account_id = ? AND symbol = ?
            AND action IN ('closeLong', 'closeShort')
            AND COALESCE(related_user_id, 0) = ?
            AND COALESCE(related_fund_id, 0) = ?
            AND trade_time >= ?
          ORDER BY trade_time ASC, id ASC
          LIMIT 1 FOR UPDATE`,
        [
          LEDGER_52_T0_JOURNAL_ID,
          input.actorUserId,
          accountId,
          String(before.symbol),
          relatedUserId,
          relatedFund?.id ?? 0,
          before.trade_time,
        ],
      );
      if (asRows(targetCloseRows)[0]) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "目标账户已有后续平仓流水；请先处理关联平仓后再调整下单账户" });
      }
    }
    const archivePrice = archivePriceForAction(String(before.action) as T0JournalAction, effectivePrice);
    await tx.execute(
      `UPDATE ledger52_t0_journal_entries
          SET account_id = ?, quantity = ?, price = ?, target_price = ?, related_user_id = ?, related_fund_id = ?,
              instrument_type = COALESCE(?, instrument_type), option_direction = ?, option_expiry_date = ?, option_premium = ?, option_premium_currency = ?,
              grid_direction = ?, grid_range_min = ?, grid_range_max = ?, grid_leverage = ?, grid_count = ?,
              is_locked = COALESCE(?, is_locked),
              is_counterparty = COALESCE(?, is_counterparty),
              take_profit_enabled = ?, take_profit_price = ?, take_profit_quantity = ?,
              take_profit_triggered_at = CASE WHEN ? = 1 THEN NULL ELSE take_profit_triggered_at END,
              take_profit_triggered_price = CASE WHEN ? = 1 THEN NULL ELSE take_profit_triggered_price END,
              take_profit_triggered_quantity = CASE WHEN ? = 1 THEN NULL ELSE take_profit_triggered_quantity END,
              execution_status = COALESCE(CASE WHEN ? = 1 THEN 'pending' WHEN ? = 0 THEN 'filled' END, execution_status),
              filled_at = CASE WHEN ? IS NULL THEN filled_at WHEN ? = 1 THEN NULL WHEN ? = 0 THEN NOW(3) ELSE filled_at END,
              filled_price = CASE WHEN ? IS NULL THEN filled_price WHEN ? = 1 THEN NULL WHEN ? = 0 THEN CAST(? AS DECIMAL(36,18)) ELSE filled_price END,
              fee_usdt = CASE WHEN ? = 'option' THEN 0 ELSE ROUND(CAST(? AS DECIMAL(36,18)) * CAST(? AS DECIMAL(36,18)) * ${OKX_VIP2_TAKER_FEE_RATE}, 18) END,
              note = ?, updated_at = NOW(3)
        WHERE id = ? AND ledger_id = ? AND user_id = ?`,
      [
        accountId,
        normalizedQuantity,
        effectivePrice,
        archivePrice,
        relatedUserId > 0 ? relatedUserId : null,
        relatedFund?.id ?? null,
        instrumentType ?? null,
        optionParameters?.direction ?? null,
        optionParameters?.expiryDate ?? null,
        optionParameters?.premium ?? null,
        optionParameters?.premiumCurrency ?? null,
        gridParameters?.direction ?? null,
        gridParameters?.rangeMin ?? null,
        gridParameters?.rangeMax ?? null,
        gridParameters?.leverage ?? null,
        gridParameters?.count ?? null,
        isLockedForUpdate,
        isCounterparty,
        takeProfit.enabled ? 1 : 0,
        takeProfit.price,
        takeProfit.quantity,
        takeProfit.enabled ? 1 : 0,
        takeProfit.enabled ? 1 : 0,
        takeProfit.enabled ? 1 : 0,
        isPending,
        isPending,
        isPending,
        isPending,
        isPending,
        isPending,
        isPending,
        isPending,
        effectivePrice,
        effectiveInstrumentType ?? null,
        normalizedQuantity,
        effectivePrice,
        input.note || null,
        input.entryId,
        LEDGER_52_T0_JOURNAL_ID,
        input.actorUserId,
      ],
    );
    await replacePendingTakeProfitPlans(tx, { actorUserId: input.actorUserId, openingEntryId: input.entryId, plans: takeProfit.plans });
    await syncEntryTakeProfitSummary(tx, { actorUserId: input.actorUserId, openingEntryId: input.entryId });
    if (hasProfitShareUpdate) {
      await updateOpeningProfitShareSnapshotsAndFutureRules(tx, {
        actorUserId: input.actorUserId,
        entryId: input.entryId,
        before,
        remainingQuantity: normalizedQuantity,
        allocations: input.profitShareAllocations!,
      });
    } else if (beforeForAudit.profitShareSnapshots.length > 0) {
      await tx.execute(
        `UPDATE ledger52_t0_journal_entry_profit_shares
            SET matched_quantity = ?
          WHERE ledger_id = ? AND user_id = ? AND entry_id = ? AND opening_entry_id = ?`,
        [normalizedQuantity, LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.entryId, input.entryId],
      );
    }
    const [[accountRows], [updatedRows]] = await Promise.all([
      tx.execute(
        `SELECT id, name, last_used_at, created_at
           FROM ledger52_t0_journal_accounts
          WHERE id = ? AND ledger_id = ? AND user_id = ? LIMIT 1`,
        [accountId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      ),
      tx.execute(
      `SELECT e.id, e.account_id, a.name AS account_name, e.related_user_id, e.related_fund_id, f.name AS related_fund_name,
              COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', e.related_user_id)) AS related_user_name,
              u.username AS related_username, u.avatar AS related_user_avatar,
              e.symbol, e.instrument_type, e.option_direction, e.option_expiry_date, e.option_premium, e.option_premium_currency,
              e.grid_direction, e.grid_range_min, e.grid_range_max, e.grid_leverage, e.grid_count,
              e.is_locked, e.is_counterparty, e.execution_status, e.filled_at, e.filled_price,
              e.take_profit_enabled, e.take_profit_price, e.take_profit_quantity, e.take_profit_triggered_at, e.take_profit_triggered_price, e.take_profit_triggered_quantity,
              e.action, e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.trade_time, e.created_at
         FROM ledger52_t0_journal_entries e
         INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
         LEFT JOIN users u ON u.id = e.related_user_id
         LEFT JOIN ledger52_t0_journal_related_funds f ON f.id = e.related_fund_id AND f.ledger_id = e.ledger_id AND f.user_id = e.user_id
        WHERE e.id = ? AND e.ledger_id = ? AND e.user_id = ? LIMIT 1`,
      [input.entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
      ),
    ]);
    const account = asRows(accountRows)[0];
    const after = asRows(updatedRows)[0];
    if (!account || !after) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "编辑后的开仓记录读取失败" });
    const updatedPlansByEntryId = await getTakeProfitPlansByEntryId(tx, [input.entryId]);
    after.take_profit_plans = updatedPlansByEntryId.get(input.entryId) ?? [];
    const afterForAudit = await buildEntryAuditSnapshot(tx, input.actorUserId, after);
    await writeEntryAudit(tx, {
      actorUserId: input.actorUserId,
      entryId: input.entryId,
      operation: manualConfirmPendingFill ? "fill" : "update",
      before: beforeForAudit,
      after: afterForAudit,
    });
    await tx.commit();
    if (nextIsPending || takeProfit.enabled) activateLedger52T0PendingOrderScan();
    else void refreshLedger52T0PendingOrderScanState();
    return { account: mapAccount(account), entry: mapEntry(after) };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}

export async function deleteLedger52T0JournalOpeningEntry(input: { actorUserId: number; entryId: number }) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;

  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const { entry: before } = await lockEditableOpeningEntry(tx, input.actorUserId, input.entryId);
    const beforeForAudit = await buildEntryAuditSnapshot(tx, input.actorUserId, before);
    const auditId = await writeEntryAudit(tx, { actorUserId: input.actorUserId, entryId: input.entryId, operation: "delete", before: beforeForAudit });
    await tx.execute(
      `DELETE FROM ledger52_t0_journal_entry_profit_shares
        WHERE ledger_id = ? AND user_id = ? AND entry_id = ?`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.entryId],
    );
    const [result] = await tx.execute(
      `DELETE FROM ledger52_t0_journal_entries
        WHERE id = ? AND ledger_id = ? AND user_id = ?`,
      [input.entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    if (Number((result as any)?.affectedRows || 0) !== 1) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "开仓记录删除失败" });
    }
    await tx.commit();
    void refreshLedger52T0PendingOrderScanState();
    return { entryId: String(input.entryId), auditId: String(auditId), entry: mapEntry(before) };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}

/**
 * 从“最近速记”回撤一笔流水。开仓若已有关联平仓，必须先回撤对应平仓，防止仓位账不平。
 * 所有回撤只删活动流水，不抹掉审计快照，后续可由恢复接口原样恢复。
 */
export async function revertLedger52T0JournalEntry(input: { actorUserId: number; entryId: number }) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;

  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const [rows] = await tx.execute(
      `SELECT e.id, e.account_id, a.name AS account_name, e.related_user_id, e.related_fund_id, e.symbol, e.instrument_type,
              e.grid_direction, e.grid_range_min, e.grid_range_max, e.grid_leverage, e.grid_count, e.action,
              e.is_locked, e.is_counterparty, e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.client_request_id,
              e.created_by_user_id, e.trade_time, e.created_at, e.updated_at
         FROM ledger52_t0_journal_entries e
         INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
        WHERE e.id = ? AND e.ledger_id = ? AND e.user_id = ?
        LIMIT 1 FOR UPDATE`,
      [input.entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    let before = asRows(rows)[0];
    if (!before) throw new TRPCError({ code: "NOT_FOUND", message: "该速记流水不存在或无权回撤" });

    const action = String(before.action) as T0JournalAction;
    if (isOpeningAction(action)) {
      // 复用开仓依赖校验，防止回撤开仓后遗留无法匹配的平仓流水。
      before = (await lockEditableOpeningEntry(tx, input.actorUserId, input.entryId)).entry;
    }

    const beforeForAudit = await buildEntryAuditSnapshot(tx, input.actorUserId, before);
    const auditId = await writeEntryAudit(tx, { actorUserId: input.actorUserId, entryId: input.entryId, operation: "revert", before: beforeForAudit });
    await tx.execute(
      `DELETE FROM ledger52_t0_journal_entry_profit_shares
        WHERE ledger_id = ? AND user_id = ? AND entry_id = ?`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, input.entryId],
    );
    const [result] = await tx.execute(
      `DELETE FROM ledger52_t0_journal_entries
        WHERE id = ? AND ledger_id = ? AND user_id = ?`,
      [input.entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    if (Number((result as any)?.affectedRows || 0) !== 1) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "速记流水回撤失败" });
    }

    await tx.commit();
    void refreshLedger52T0PendingOrderScanState();
    return { entryId: String(input.entryId), auditId: String(auditId), entry: mapEntry(before) };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}

/** 将最近被删除或回撤的流水从审计快照恢复；恢复平仓前会再次校验可平数量。 */
export async function restoreLedger52T0JournalEntry(input: { actorUserId: number; auditId: number }) {
  const connection = await getDbTransactionConnection();
  if (!connection) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "T+0速记账本数据库连接失败" });
  const tx: any = connection;

  try {
    await ensureLedger52T0JournalTables(tx);
    await tx.beginTransaction();
    const [auditRows] = await tx.execute(
      `SELECT id, entry_id, operation, before_snapshot
         FROM ledger52_t0_journal_entry_audits
        WHERE id = ? AND ledger_id = ? AND user_id = ? AND operation IN ('delete', 'revert')
        LIMIT 1 FOR UPDATE`,
      [input.auditId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    const audit = asRows(auditRows)[0];
    if (!audit) throw new TRPCError({ code: "NOT_FOUND", message: "可恢复的速记记录不存在或已恢复" });

    const [latestAuditRows] = await tx.execute(
      `SELECT id, operation
         FROM ledger52_t0_journal_entry_audits
        WHERE ledger_id = ? AND user_id = ? AND entry_id = ?
        ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, Number(audit.entry_id)],
    );
    const latestAudit = asRows(latestAuditRows)[0];
    if (!latestAudit || Number(latestAudit.id) !== Number(audit.id)) {
      throw new TRPCError({ code: "CONFLICT", message: "该流水状态已有更新，请刷新后再操作" });
    }

    let snapshot: any;
    try { snapshot = JSON.parse(String(audit.before_snapshot || "")); } catch {
      throw new TRPCError({ code: "BAD_REQUEST", message: "该历史审计快照无法恢复" });
    }
    const entryId = Number(snapshot?.id || 0);
    const accountId = Number(snapshot?.account_id || 0);
    const action = String(snapshot?.action || "") as T0JournalAction;
    const executionStatus = String(snapshot?.execution_status ?? snapshot?.executionStatus ?? "filled") === "pending" && isOpeningAction(action)
      ? "pending"
      : "filled";
    // 旧审计快照即使意外同时带有锁定和挂单，恢复时也遵循“挂单不可锁定”的当前规则。
    const isLocked = isOpeningAction(action) && executionStatus === "filled" && Boolean(toNumber(snapshot?.is_locked ?? snapshot?.isLocked));
    const quantity = normalizeStoredEthQuantity(snapshot?.quantity);
    const price = String(snapshot?.price ?? "");
    const relatedUserId = toNumber(snapshot?.related_user_id ?? snapshot?.relatedUserId);
    const relatedFundId = toNumber(snapshot?.related_fund_id ?? snapshot?.relatedFundId);
    const clientRequestId = String(snapshot?.client_request_id || "");
    if (!entryId || !accountId || !T0_JOURNAL_ACTIONS.has(action) || !clientRequestId || !quantity || !ETH_QUANTITY_RESTORE_PATTERN.test(quantity) || toNumber(price) <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "该历史审计快照不完整，无法安全恢复" });
    }

    const [existingRows] = await tx.execute(
      `SELECT id FROM ledger52_t0_journal_entries
        WHERE id = ? AND ledger_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
      [entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    if (asRows(existingRows)[0]) throw new TRPCError({ code: "CONFLICT", message: "该速记流水已存在，无需重复恢复" });

    const [accountRows] = await tx.execute(
      `SELECT id FROM ledger52_t0_journal_accounts
        WHERE id = ? AND ledger_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
      [accountId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    if (!asRows(accountRows)[0]) throw new TRPCError({ code: "NOT_FOUND", message: "原下单账户已不存在，无法恢复" });

    if (!isOpeningAction(action)) {
      const targetPrice = archivedTargetPrice(action, snapshot.target_price);
      if (!targetPrice) throw new TRPCError({ code: "BAD_REQUEST", message: "历史平仓记录缺少对应开仓档位，无法恢复" });
      const [positionRows] = await tx.execute(
        `SELECT action, quantity, price, target_price, related_user_id, related_fund_id
           FROM ledger52_t0_journal_entries
          WHERE ledger_id = ? AND user_id = ? AND account_id = ? AND symbol = ?
          ORDER BY trade_time ASC, id ASC FOR UPDATE`,
        [LEDGER_52_T0_JOURNAL_ID, input.actorUserId, accountId, String(snapshot.symbol || "ETH")],
      );
      const availableCents = calculateAvailableCloseCents(asRows(positionRows), action, String(targetPrice), relatedUserId, relatedFundId);
      if (quantityToCents(quantity) > availableCents) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "恢复后会超过该档位可平数量，请先恢复对应开仓流水" });
      }
    }

    const restoredTradeTime = mysqlDateTime(snapshot.trade_time || snapshot.created_at);
    const restoredCreatedAt = mysqlDateTime(snapshot.created_at || snapshot.trade_time);

    await tx.execute(
      `INSERT INTO ledger52_t0_journal_entries
        (id, ledger_id, user_id, account_id, related_user_id, related_fund_id, symbol, instrument_type, option_direction, option_expiry_date, option_premium, option_premium_currency, option_settlement_price, option_delivery_price, option_settled_at, option_settlement_source, grid_direction, grid_range_min, grid_range_max, grid_leverage, grid_count, is_locked, is_counterparty, execution_status, filled_at, filled_price, take_profit_enabled, take_profit_price, take_profit_quantity, take_profit_triggered_at, take_profit_triggered_price, take_profit_triggered_quantity, action, quantity, price, fee_usdt, target_price, note, client_request_id, created_by_user_id, trade_time, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        entryId,
        LEDGER_52_T0_JOURNAL_ID,
        input.actorUserId,
        accountId,
        relatedUserId > 0 ? relatedUserId : null,
        relatedFundId > 0 ? relatedFundId : null,
        String(snapshot.symbol || "ETH"),
        normalizeInstrumentType(snapshot.instrument_type ?? snapshot.instrumentType),
        snapshot.option_direction ?? snapshot.optionDirection ?? null,
        mapOptionDate(snapshot.option_expiry_date ?? snapshot.optionExpiryDate) ?? null,
        snapshot.option_premium ?? snapshot.optionPremium ?? null,
        snapshot.option_premium_currency ?? snapshot.optionPremiumCurrency ?? null,
        snapshot.option_settlement_price ?? snapshot.optionSettlementPrice ?? null,
        snapshot.option_delivery_price ?? snapshot.optionDeliveryPrice ?? null,
        (snapshot.option_settled_at ?? snapshot.optionSettledAt) ? mysqlDateTime(snapshot.option_settled_at ?? snapshot.optionSettledAt) : null,
        snapshot.option_settlement_source ?? snapshot.optionSettlementSource ?? null,
        snapshot.grid_direction ?? snapshot.gridDirection ?? null,
        snapshot.grid_range_min ?? snapshot.gridRangeMin ?? null,
        snapshot.grid_range_max ?? snapshot.gridRangeMax ?? null,
        snapshot.grid_leverage ?? snapshot.gridLeverage ?? null,
        snapshot.grid_count ?? snapshot.gridCount ?? null,
        isLocked ? 1 : 0,
        isOpeningAction(action) && Boolean(toNumber(snapshot?.is_counterparty ?? snapshot?.isCounterparty)) ? 1 : 0,
        executionStatus,
        snapshot.filled_at ?? snapshot.filledAt ?? null,
        snapshot.filled_price ?? snapshot.filledPrice ?? null,
        snapshot.take_profit_enabled ?? snapshot.takeProfitEnabled ?? 0,
        snapshot.take_profit_price ?? snapshot.takeProfitPrice ?? null,
        snapshot.take_profit_quantity ?? snapshot.takeProfitQuantity ?? null,
        snapshot.take_profit_triggered_at ?? snapshot.takeProfitTriggeredAt ?? null,
        snapshot.take_profit_triggered_price ?? snapshot.takeProfitTriggeredPrice ?? null,
        snapshot.take_profit_triggered_quantity ?? snapshot.takeProfitTriggeredQuantity ?? null,
        action,
        quantity,
        price,
        String(snapshot.fee_usdt ?? "0"),
        snapshot.target_price ?? null,
        snapshot.note ?? null,
        clientRequestId,
        Number(snapshot.created_by_user_id || input.actorUserId),
        restoredTradeTime,
        restoredCreatedAt,
      ],
    );
    await restoreEntryProfitShareSnapshots(tx, {
      actorUserId: input.actorUserId,
      entryId,
      snapshots: Array.isArray(snapshot.profitShareSnapshots) ? snapshot.profitShareSnapshots : [],
    });
    const [restoredRows] = await tx.execute(
      `SELECT e.id, e.account_id, a.name AS account_name, e.related_user_id, e.related_fund_id, f.name AS related_fund_name,
              COALESCE(NULLIF(u.name, ''), NULLIF(u.username, ''), CONCAT('用户#', e.related_user_id)) AS related_user_name,
              u.username AS related_username, u.avatar AS related_user_avatar,
              e.symbol, e.instrument_type, e.option_direction, e.option_expiry_date, e.option_premium, e.option_premium_currency,
              e.option_settlement_price, e.option_delivery_price, e.option_settled_at, e.option_settlement_source,
              e.grid_direction, e.grid_range_min, e.grid_range_max, e.grid_leverage, e.grid_count,
              e.is_locked, e.is_counterparty, e.execution_status, e.filled_at, e.filled_price,
              e.take_profit_enabled, e.take_profit_price, e.take_profit_quantity, e.take_profit_triggered_at, e.take_profit_triggered_price, e.take_profit_triggered_quantity,
              e.action, e.quantity, e.price, e.fee_usdt, e.target_price, e.note, e.trade_time, e.created_at
         FROM ledger52_t0_journal_entries e
         INNER JOIN ledger52_t0_journal_accounts a ON a.id = e.account_id
         LEFT JOIN users u ON u.id = e.related_user_id
         LEFT JOIN ledger52_t0_journal_related_funds f ON f.id = e.related_fund_id AND f.ledger_id = e.ledger_id AND f.user_id = e.user_id
        WHERE e.id = ? AND e.ledger_id = ? AND e.user_id = ? LIMIT 1`,
      [entryId, LEDGER_52_T0_JOURNAL_ID, input.actorUserId],
    );
    const restored = asRows(restoredRows)[0];
    if (!restored) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "恢复后的速记流水读取失败" });
    const restoredForAudit = await buildEntryAuditSnapshot(tx, input.actorUserId, restored);
    await writeEntryAudit(tx, {
      actorUserId: input.actorUserId,
      entryId,
      operation: "restore",
      before: { auditId: input.auditId, snapshot },
      after: restoredForAudit,
    });
    await tx.commit();
    if (executionStatus === "pending") activateLedger52T0PendingOrderScan();
    return { entry: mapEntry(restored) };
  } catch (error) {
    try { await tx.rollback(); } catch {}
    throw error;
  } finally {
    tx.release?.();
  }
}
