import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getDbTransactionConnection } from "./db";
import { getLedger52T0AllocationRules } from "./ledger52-t0-allocation-rule-store";
import { getLedger52T0SharedIncomeAnnualizedRule } from "./ledger52-t0-annualized-rule";
import { getLedger52T0MarketContributionFacts } from "./ledger52-t0-market-contribution";
import { deriveT0AllocationFacts } from "./ledger52-t0-allocation-facts";
import { calculateWeightedOrderScores } from "../shared/t0-weighted-order-rule";
import { calculateSharedContributionWeights } from "../shared/t0-shared-contribution-rule";
import { calculateMarketContributionScores } from "../shared/t0-market-contribution-rule";
import { allocateCappedAnnualizedCents, getAnnualizedGapWeights } from "../shared/t0-annualized-allocation-rule";
import { calculateT0AllocationTargetTopUp, calculateT0AllocationXirr } from "../shared/t0-xirr-allocation";
import { T0_SHARED_ALLOCATION_METRICS, type T0SharedAllocationAction, type T0SharedAllocationMetric, type T0SharedIncomeAllocation, type T0SharedIncomeAllocationPlan, type T0SharedAllocationCandidate } from "../shared/t0-allocation-plan-contract";

const LEDGER_ID = 52;
const TOKEN_LIFETIME_MS = 60_000;
// 请求局部签名，不依赖或泄露生产凭证；服务重启后旧计划自然失效。
const planSigningKey = randomBytes(32);
export type T0SharedAllocationPlanInput = {
  actorUserId: number; ownerUserId?: number; accountId?: number; accountName?: string;
  sourceUserId?: number; relatedUserId?: number; relatedFundId?: number;
  action: T0SharedAllocationAction; price: string; quantity: string; targetPrice: string;
  targetOpeningEntryId?: number; metrics: T0SharedAllocationMetric[];
  budgetMode: "percentage" | "amount"; budgetValue: string;
};
type NormalizedPlanInput = {
  actorUserId: number; ownerUserId: number; accountId: number; accountName: string;
  sourceUserId: number; relatedFundId: number; action: T0SharedAllocationAction;
  price: string; quantity: string; targetPrice: string; targetOpeningEntryId: number;
  metrics: T0SharedAllocationMetric[]; budgetMode: "percentage" | "amount"; budgetValue: string;
};
type PlanPayload = {
  input: NormalizedPlanInput; createdAt: number; asOf: string; fingerprint: string;
  allocations: T0SharedIncomeAllocation[]; rulesVersion: number; principalVersion: number; annualizedVersion: number;
};
type AllocationScore = { userId: string; weight: number; capCents?: number };

function conflict(message: string): never { throw new TRPCError({ code: "CONFLICT", message }); }
function validId(value: unknown, required = false): number {
  const id = Number(value || 0);
  if (!Number.isSafeInteger(id) || id < 0 || (required && id <= 0)) throw new TRPCError({ code: "BAD_REQUEST", message: "共享分配归属或订单编号无效" });
  return id;
}
function numberText(value: unknown, label: string, positive = true): string {
  if (typeof value !== "string" || !value.trim() || !/^\d+(\.\d+)?$/.test(value.trim())) throw new TRPCError({ code: "BAD_REQUEST", message: `${label}无效` });
  const number = Number(value);
  if (!Number.isFinite(number) || (positive ? number <= 0 : number < 0)) throw new TRPCError({ code: "BAD_REQUEST", message: `${label}无效` });
  return String(number);
}
function normalizeInput(input: T0SharedAllocationPlanInput): NormalizedPlanInput {
  if (input.action !== "closeLong" && input.action !== "closeShort") throw new TRPCError({ code: "BAD_REQUEST", message: "只有实际平仓可使用共享分配计划" });
  if (!Array.isArray(input.metrics) || input.metrics.length === 0 || input.metrics.length > 5 || new Set(input.metrics).size !== input.metrics.length || input.metrics.some((metric) => !T0_SHARED_ALLOCATION_METRICS.includes(metric))) throw new TRPCError({ code: "BAD_REQUEST", message: "请选择有效且不重复的共享分配维度" });
  if (input.budgetMode !== "percentage" && input.budgetMode !== "amount") throw new TRPCError({ code: "BAD_REQUEST", message: "共享预算口径无效" });
  const quantity = numberText(input.quantity, "平仓数量");
  const cents = Math.round(Number(quantity) * 100);
  if (!Number.isSafeInteger(cents) || Math.abs(Number(quantity) * 100 - cents) > 0.000001) throw new TRPCError({ code: "BAD_REQUEST", message: "ETH平仓数量最多保留两位小数" });
  return {
    actorUserId: validId(input.actorUserId, true), ownerUserId: validId(input.ownerUserId || input.actorUserId, true),
    accountId: validId(input.accountId), accountName: String(input.accountName || "").trim(),
    sourceUserId: validId(input.sourceUserId || input.relatedUserId, true), relatedFundId: validId(input.relatedFundId),
    action: input.action, price: numberText(input.price, "平仓价"), quantity, targetPrice: numberText(input.targetPrice, "原开仓档位"),
    targetOpeningEntryId: validId(input.targetOpeningEntryId), metrics: T0_SHARED_ALLOCATION_METRICS.filter((metric) => input.metrics.includes(metric)),
    budgetMode: input.budgetMode, budgetValue: numberText(input.budgetValue, "共享预算", false),
  };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function hash(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function normalizedAllocations(input: T0SharedIncomeAllocation[]): T0SharedIncomeAllocation[] {
  if (!Array.isArray(input)) conflict("共享金额无效，请重新生成清单");
  const ids = new Set<number>();
  return input.map((row) => {
    const userId = validId(row.recipientUserId, true);
    if (ids.has(userId)) conflict("同一共享收款人重复出现，请重新生成清单");
    ids.add(userId);
    const amount = numberText(row.amount, "共享金额");
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(cents) || Math.abs(Number(amount) * 100 - cents) > 0.000001) conflict("共享金额精度无效，请重新生成清单");
    return { recipientUserId: userId, amount: (cents / 100).toFixed(2) };
  }).sort((a, b) => a.recipientUserId - b.recipientUserId);
}
function encode(payload: PlanPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", planSigningKey).update(body).digest("base64url")}`;
}
function decode(token: string): PlanPayload {
  if (typeof token !== "string" || token.length > 2_000_000) conflict("共享计划格式无效，请重新预览");
  const parts = token.split(".");
  if (parts.length !== 2) conflict("共享计划格式无效，请重新预览");
  const [body, mac] = parts;
  const expected = createHmac("sha256", planSigningKey).update(body).digest();
  let received: Buffer;
  try { received = Buffer.from(mac, "base64url"); } catch { conflict("共享计划签名无效，请重新预览"); }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) conflict("共享计划签名无效，请重新预览");
  let payload: PlanPayload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { conflict("共享计划格式无效，请重新预览"); }
  if (!Number.isFinite(payload.createdAt) || Date.now() - payload.createdAt > TOKEN_LIFETIME_MS || Date.now() < payload.createdAt - 5_000) conflict("共享分配计划已过期，请重新预览");
  return payload;
}
/** 确认前校验签名、有效期、实际账户用户、预算、维度和逐笔金额。 */
export function verifyT0SharedIncomePlanToken(input: T0SharedAllocationPlanInput & { token: string; allocations: T0SharedIncomeAllocation[] }): PlanPayload {
  const payload = decode(input.token);
  const expected = normalizeInput(input);
  const original = payload.input;
  if (canonical({ ...original, accountName: original.accountId ? "" : original.accountName }) !== canonical({ ...expected, accountName: expected.accountId ? "" : expected.accountName }) || canonical(normalizedAllocations(payload.allocations)) !== canonical(normalizedAllocations(input.allocations))) conflict("共享计划与确认内容不一致，请重新预览");
  return payload;
}
function allocateWeightedCents(budgetCents: number, scores: AllocationScore[], minimumCent = false): Array<{ userId: string; cents: number }> {
  const usable = scores.filter((row) => Number.isFinite(row.weight) && row.weight > 0.000001);
  const total = usable.reduce((sum, row) => sum + row.weight, 0);
  if (!usable.length || !Number.isFinite(total) || total <= 0) return [];
  const minimum = minimumCent && budgetCents >= usable.length ? 1 : 0;
  const remaining = budgetCents - minimum * usable.length;
  const rows = usable.map((row) => { const exact = remaining * row.weight / total; return { userId: row.userId, cents: minimum + Math.floor(exact), fraction: exact - Math.floor(exact) }; });
  let remainder = budgetCents - rows.reduce((sum, row) => sum + row.cents, 0);
  for (const row of [...rows].sort((a, b) => b.fraction - a.fraction || a.userId.localeCompare(b.userId))) { if (remainder <= 0) break; row.cents += 1; remainder -= 1; }
  return rows.map(({ userId, cents }) => ({ userId, cents }));
}
function beijingDate(asOf: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(asOf));
  const get = (name: string) => parts.find((part) => part.type === name)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function computePlan(input: NormalizedPlanInput, conn: PoolConnection, asOf: string, locking: boolean) {
  const journal = await import("./ledger52-t0-journal");
  const [accountRows] = await conn.execute<RowDataPacket[]>(`SELECT id, name FROM ledger52_t0_journal_accounts WHERE ledger_id = ? AND user_id = ? AND ${input.accountId ? "id = ?" : "name = ?"} LIMIT 1${locking ? " FOR UPDATE" : ""}`, [LEDGER_ID, input.ownerUserId, input.accountId || input.accountName]);
  const account = accountRows[0];
  if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "平仓账户不存在或归属已变更" });
  const resolvedInput = { ...input, accountId: Number(account.id), accountName: String(account.name) };
  const [positionRows] = await conn.execute<RowDataPacket[]>(`SELECT * FROM ledger52_t0_journal_entries WHERE ledger_id = ? AND user_id = ? AND account_id = ? AND symbol = 'ETH' ORDER BY created_at ASC, id ASC${locking ? " FOR UPDATE" : ""}`, [LEDGER_ID, input.ownerUserId, Number(account.id)]);
  const matches = journal.buildProfitShareOpeningMatches(positionRows, input.action, input.targetPrice, input.sourceUserId, input.relatedFundId, Math.round(Number(input.quantity) * 100), input.targetOpeningEntryId || undefined);
  if (matches.reduce((sum, row) => sum + row.matchedQuantityCents, 0) !== Math.round(Number(input.quantity) * 100)) conflict("可平仓数量或源订单已变化，请重新打开平仓设置");
  const openingIds = new Set(matches.map((row) => row.openingEntryId));
  if (positionRows.some((row) => openingIds.has(Number(row.id)) && row.instrument_type && !["spot", "contract"].includes(String(row.instrument_type)))) throw new TRPCError({ code: "BAD_REQUEST", message: "此共享规则仅用于ETH现货与合约实际平仓" });
  const source = await journal.calculateClosingSharedIncomePool(conn, { actorUserId: input.ownerUserId, sourceUserId: input.sourceUserId, positionRows, action: input.action, targetPrice: input.targetPrice, relatedFundId: input.relatedFundId, quantity: input.quantity, closePrice: input.price, targetOpeningEntryId: input.targetOpeningEntryId || undefined });
  if (source.sourceNetPnl <= 0 || source.shareableAmount <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "只有实际正向净收益平仓可分配共享收益" });
  const maximumCents = Math.round(source.shareableAmount * 100);
  const value = Number(input.budgetValue);
  if ((input.budgetMode === "percentage" && (value < 1 || value > 100)) || (input.budgetMode === "amount" && value > source.shareableAmount + 0.000001)) throw new TRPCError({ code: "BAD_REQUEST", message: "共享预算不得超过本次可共享收益；比例为1%至100%" });
  const budgetCents = input.budgetMode === "percentage" ? Math.floor(maximumCents * value / 100 + 1e-9) : Math.floor(value * 100 + 1e-9);
  if (!Number.isSafeInteger(budgetCents) || budgetCents < 0 || budgetCents > maximumCents) throw new TRPCError({ code: "BAD_REQUEST", message: "共享预算超出有效范围" });
  const facts = await journal.getLedger52T0JournalTeamFinancialFacts({ journalOwnerUserId: input.ownerUserId, includePayoutCashFlows: true, connection: conn, lockFacts: locking });
  const rules = await getLedger52T0AllocationRules({ actorUserId: input.actorUserId, connection: conn, lockRules: locking });
  const annualized = await getLedger52T0SharedIncomeAnnualizedRule({ actorUserId: input.actorUserId, connection: conn, lockRules: locking });
  const derived = deriveT0AllocationFacts(facts, { actorUserId: input.actorUserId, sourceUserId: input.sourceUserId, closePrice: Number(input.price), asOf });
  const [deletedRows] = await conn.execute<RowDataPacket[]>(`SELECT dimension_id FROM ledger52_t0_journal_deleted_dimensions WHERE ledger_id = ? AND user_id = ? AND dimension = 'related_user'${locking ? " FOR UPDATE" : ""}`, [LEDGER_ID, input.ownerUserId]);
  const [eligibilityRows] = await conn.execute<RowDataPacket[]>(`SELECT recipient_user_id, is_enabled FROM ledger52_t0_journal_shared_income_eligibilities WHERE ledger_id = ? AND user_id = ? AND source_user_id = ?${locking ? " FOR UPDATE" : ""}`, [LEDGER_ID, input.ownerUserId, input.sourceUserId]);
  const deleted = new Set(deletedRows.map((row) => Number(row.dimension_id)));
  const disabled = new Set(eligibilityRows.filter((row) => Number(row.is_enabled) === 0).map((row) => Number(row.recipient_user_id)));
  const profiles = new Map<number, { name: string; username?: string }>();
  const ids = derived.candidates.map((row) => row.userId).filter((id) => !deleted.has(id));
  for (let index = 0; index < ids.length; index += 500) {
    const batch = ids.slice(index, index + 500);
    const [rows] = await conn.execute<RowDataPacket[]>(`SELECT id, name, username FROM users WHERE id IN (${batch.map(() => "?").join(",")}) ORDER BY id ASC${locking ? " FOR UPDATE" : ""}`, batch);
    for (const row of rows) profiles.set(Number(row.id), { name: String(row.name || row.username || `用户#${row.id}`), username: row.username ? String(row.username) : undefined });
  }
  const candidates = derived.candidates.filter((row) => profiles.has(row.userId));
  const eligible = candidates.filter((row) => !disabled.has(row.userId));
  if (budgetCents > 0 && !eligible.length) throw new TRPCError({ code: "BAD_REQUEST", message: "暂无已入金且开启共享资格的分配人" });
  const weightedScores = calculateWeightedOrderScores(derived.weightedFacts, Number(input.price), rules.weightedOrder, Number(journal.OKX_VIP2_TAKER_FEE_RATE));
  const contributions = calculateSharedContributionWeights(eligible.map((row) => row.contribution), rules.contribution);
  const day = beijingDate(asOf);
  const rates = new Map(eligible.map((row) => [row.userId, calculateT0AllocationXirr([...row.cashFlows, { occurredOn: day, amount: row.terminalValue, atEndOfBeijingDay: true }])]));
  const validRates = [...rates.values()].filter((value): value is number => value !== null && Number.isFinite(value));
  const mean = validRates.length ? validRates.reduce((sum, value) => sum + value, 0) / validRates.length : null;
  const gaps = eligible.map((row) => {
    const current = rates.get(row.userId);
    const target = Object.prototype.hasOwnProperty.call(annualized.targets, String(row.userId)) ? annualized.targets[String(row.userId)] / 100 : mean;
    const topUp = current !== null && current !== undefined && target !== null && current < target - 0.000001 ? calculateT0AllocationTargetTopUp(row.cashFlows, row.terminalValue, target, day) : 0;
    return { userId: String(row.userId), topUp };
  });
  const marketFacts = input.metrics.includes("marketContribution") ? await getLedger52T0MarketContributionFacts({ journalOwnerUserId: input.ownerUserId, financialFacts: facts, asOf, connection: conn, lockFacts: locking }) : undefined;
  const market = marketFacts ? calculateMarketContributionScores(marketFacts, rules.market, eligible.map((row) => String(row.userId))) : undefined;
  if (market?.error) throw new TRPCError({ code: "BAD_REQUEST", message: market.error });
  const dimensions = input.metrics.map((metric): { metric: T0SharedAllocationMetric; scores: AllocationScore[] } => {
    let scores: AllocationScore[];
    if (metric === "principal") {
      const exponent = rules.principal.curve === "strong" ? 0.35 : rules.principal.curve === "balanced" ? 0.5 : 1;
      const strength = rules.principal.influencePercentage / 100;
      const total = eligible.reduce((sum, row) => sum + Math.pow(row.depositAmount, exponent), 0);
      scores = eligible.map((row) => ({ userId: String(row.userId), weight: (1 - strength) / eligible.length + strength * Math.pow(row.depositAmount, exponent) / total }));
    } else if (metric === "weightedOpeningQuantity") scores = eligible.map((row) => ({ userId: String(row.userId), weight: weightedScores.get(String(row.userId))?.score || 0 }));
    else if (metric === "sharedContribution") scores = contributions.map((row) => ({ userId: row.fact.userId, weight: row.weight }));
    else if (metric === "marketContribution") scores = (market?.rows || []).map((row) => ({ userId: row.userId, weight: row.weightPercentage / 100 }));
    else scores = getAnnualizedGapWeights(gaps.filter((row) => row.topUp !== null && Math.floor(row.topUp * 100) > 0), annualized.influence).map(({ row, weight }) => ({ userId: row.userId, weight, capCents: Math.floor(Number(row.topUp) * 100) }));
    scores = scores.filter((row) => Number.isFinite(row.weight) && row.weight > 0.000001);
    if (budgetCents > 0 && !scores.length) throw new TRPCError({ code: "BAD_REQUEST", message: `所选${metric === "realizedAnnualized" ? "年化补差" : metric === "marketContribution" ? "市场贡献" : metric === "weightedOpeningQuantity" ? "有效挂单量" : "共享"}维度暂无有效权重，请调整维度选择或权重` });
    return { metric, scores };
  });
  const byUser = new Map<string, number>();
  const detail: Array<{ metric: T0SharedAllocationMetric; budgetCents: number; allocations: Array<{ userId: string; cents: number }> }> = [];
  const base = Math.floor(budgetCents / dimensions.length);
  let remainder = budgetCents - base * dimensions.length;
  for (const dimension of dimensions) {
    const amount = base + (remainder > 0 ? 1 : 0); if (remainder > 0) remainder -= 1;
    const allocations = dimension.metric === "realizedAnnualized" ? allocateCappedAnnualizedCents(amount, dimension.scores.map((row) => ({ userId: row.userId, weight: row.weight, capCents: row.capCents || 0 }))) : allocateWeightedCents(amount, dimension.scores, dimension.metric === "sharedContribution");
    for (const row of allocations) byUser.set(row.userId, (byUser.get(row.userId) || 0) + row.cents);
    detail.push({ metric: dimension.metric, budgetCents: amount, allocations });
  }
  const allocations = [...byUser].filter(([, cents]) => cents > 0).map(([id, cents]) => ({ recipientUserId: Number(id), amount: (cents / 100).toFixed(2) })).sort((a, b) => a.recipientUserId - b.recipientUserId);
  const totalCents = allocations.reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
  if (!Number.isSafeInteger(totalCents) || totalCents > budgetCents) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "共享分配金额守恒校验失败" });
  const projected: T0SharedAllocationCandidate[] = candidates.map((row) => {
    const id = String(row.userId); const profile = profiles.get(row.userId)!;
    const held = derived.weightedFacts.filter((fact) => fact.userId === id);
    const longQuantity = held.filter((fact) => fact.side === "long").reduce((sum, fact) => sum + fact.quantity, 0);
    const shortQuantity = held.filter((fact) => fact.side === "short").reduce((sum, fact) => sum + fact.quantity, 0);
    const income = derived.incomeByUser.get(row.userId);
    const withdrawals = row.cashFlows.filter((flow) => flow.direction === "withdrawal").reduce((sum, flow) => sum + flow.amount, 0);
    const closings = derived.trades.filter((trade) => trade.relatedUserId === row.userId && !trade.isPending && ["closeLong", "closeShort"].includes(trade.action));
    const latest = closings.map((trade) => Date.parse(trade.filledAt || trade.createdAt)).filter(Number.isFinite).sort((a, b) => b - a)[0];
    const first = row.cashFlows.filter((flow) => flow.direction === "deposit").map((flow) => flow.occurredOn).sort()[0];
    const heldDays = first ? Math.max(0, Math.floor((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000)) : 0;
    const closedNetPnl = income ? income.orderIncome + income.commissionIncome : 0;
    return {
      userId: id, ...profile, remainingQuantity: longQuantity + shortQuantity, longQuantity, shortQuantity,
      cumulativeDepositAmount: row.depositAmount, withdrawalProgressPercentage: withdrawals / row.depositAmount * 100, hasPrincipal: row.depositAmount > 0,
      holdingNetPnl: weightedScores.get(id)?.netPnl || 0, closedNetPnl, closedLossPnl: Math.min(0, closedNetPnl), historicalProfit: closedNetPnl + row.contribution.incomingAmount,
      sharedIncomeEnabled: !disabled.has(row.userId), receivedSharedIncome: row.contribution.incomingAmount, receivedSharedIncomeCount: row.contribution.incomingCount,
      contributedSharedIncome: row.contribution.outgoingAmount, contributedSharedIncomeOrderCount: row.contribution.outgoingCount,
      openingOrderCount: derived.trades.filter((trade) => trade.relatedUserId === row.userId && ["openLong", "openShort"].includes(trade.action)).length,
      realizedCashFlows: row.cashFlows.map((flow) => ({ ...flow, amount: flow.direction === "deposit" ? -Math.abs(flow.amount) : Math.abs(flow.amount) })),
      realizedTerminalValue: row.terminalValue, heldDays, settlementAgeDays: latest ? Math.max(0, Math.floor((Date.parse(asOf) - latest) / 86_400_000)) : null,
      annualizedReference: calculateT0AllocationXirr([...row.cashFlows, { occurredOn: day, amount: row.terminalValue, atEndOfBeijingDay: true }]),
      annualizedTargetTopUps: [3.65, 1, 0.52, 1.04].map((targetRate) => ({ targetRate, topUp: calculateT0AllocationTargetTopUp(row.cashFlows, row.terminalValue, targetRate, day) })),
    };
  });
  const fingerprint = hash({ facts, sourceRows: positionRows, rules, annualized, eligibility: eligibilityRows, deleted: deletedRows, profiles: [...profiles], market: marketFacts ? { users: marketFacts.users, outputs: marketFacts.outputs, complete: marketFacts.complete, limitations: marketFacts.limitations } : undefined });
  return { input: resolvedInput, allocations, sourceNetPnl: source.sourceNetPnl, shareableAmount: source.shareableAmount, allocatedTotal: totalCents / 100, retainedAmount: (budgetCents - totalCents) / 100, asOf, fingerprint, rulesVersion: rules.version, principalVersion: rules.principalVersion, annualizedVersion: annualized.version, candidates: projected, weightedFacts: derived.weightedFacts, limitations: marketFacts?.limitations || [], audit: { input: resolvedInput, source, budgetCents, rules, annualized, asOf, fingerprint, detail, candidates: projected, weightedFacts: derived.weightedFacts, market: market?.rows || [], allocations } };
}

/** GET只读一致性快照，不建表、不撮合、不保存订单、配置或资金。 */
export async function buildLedger52T0SharedIncomeAllocationPlan(input: T0SharedAllocationPlanInput): Promise<T0SharedIncomeAllocationPlan> {
  const normalized = normalizeInput(input);
  const conn = await getDbTransactionConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "共享分配数据库连接失败" });
  let started = false;
  try {
    await conn.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY"); started = true;
    const plan = await computePlan(normalized, conn, new Date().toISOString(), false);
    await conn.commit(); started = false;
    const planToken = encode({ input: plan.input, createdAt: Date.now(), asOf: plan.asOf, fingerprint: plan.fingerprint, allocations: plan.allocations, rulesVersion: plan.rulesVersion, principalVersion: plan.principalVersion, annualizedVersion: plan.annualizedVersion });
    return { allocations: plan.allocations, sourceNetPnl: plan.sourceNetPnl, shareableAmount: plan.shareableAmount, allocatedTotal: plan.allocatedTotal, retainedAmount: plan.retainedAmount, asOf: plan.asOf, planToken, rulesVersion: plan.rulesVersion, principalVersion: plan.principalVersion, annualizedVersion: plan.annualizedVersion, limitations: plan.limitations, candidates: plan.candidates, weightedFacts: plan.weightedFacts };
  } catch (error) { if (started) await conn.rollback().catch(() => undefined); throw error; }
  finally { conn.release(); }
}
/** 原保存事务内锁定配置并重读事实；发生变化时拒绝旧计划，不悄悄改确认金额。 */
export async function verifyT0SharedIncomePlanFresh(input: T0SharedAllocationPlanInput & { token: string; allocations: T0SharedIncomeAllocation[]; connection: PoolConnection }) {
  const payload = verifyT0SharedIncomePlanToken(input);
  const plan = await computePlan(payload.input, input.connection, payload.asOf, true);
  if (plan.fingerprint !== payload.fingerprint || canonical(plan.allocations) !== canonical(payload.allocations) || plan.rulesVersion !== payload.rulesVersion || plan.principalVersion !== payload.principalVersion || plan.annualizedVersion !== payload.annualizedVersion) conflict("订单、资金、共享资格或权重已更新，请重新生成分配清单后确认");
  return plan.audit;
}
/** 仅实际保存前、BEGIN之外创建审计表，避免DDL破坏成交事务。 */
export async function ensureT0SharedAllocationAuditTable(conn: PoolConnection) {
  await conn.execute(`CREATE TABLE IF NOT EXISTS ledger52_t0_journal_allocation_execution_audits (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, ledger_id INT NOT NULL, user_id INT NOT NULL,
    closing_entry_id BIGINT UNSIGNED NOT NULL, snapshot_json LONGTEXT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_t0_allocation_execution (ledger_id, user_id, closing_entry_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}
export async function writeT0SharedAllocationExecutionAudit(conn: PoolConnection, input: { actorUserId: number; closingEntryId: number; snapshot: unknown }) {
  await conn.execute(`INSERT INTO ledger52_t0_journal_allocation_execution_audits (ledger_id, user_id, closing_entry_id, snapshot_json) VALUES (?, ?, ?, ?)`, [LEDGER_ID, input.actorUserId, input.closingEntryId, JSON.stringify(input.snapshot)]);
}
