import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { T0_SHARED_ALLOCATION_METRICS } from "../shared/t0-allocation-plan-contract";
import { calculateWeightedOrderScores, DEFAULT_WEIGHTED_ORDER_RULE } from "../shared/t0-weighted-order-rule";
import { calculateSharedContributionWeights, DEFAULT_SHARED_CONTRIBUTION_RULE } from "../shared/t0-shared-contribution-rule";
import { calculateMarketContributionScores, DEFAULT_MARKET_CONTRIBUTION_RULE } from "../shared/t0-market-contribution-rule";
import { allocateCappedAnnualizedCents, getAnnualizedGapWeights } from "../shared/t0-annualized-allocation-rule";
import { calculateT0AllocationTargetTopUp, calculateT0AllocationXirr } from "../shared/t0-xirr-allocation";
import type { T0SharedAllocationPlanInput } from "./ledger52-t0-allocation-plan";
import type { T0AllocationFinancialFacts } from "./ledger52-t0-allocation-facts";

// Compile real declarations, not a replacement allocator/FIFO. Server module bodies,
// routers, DB imports, timers and scanner initialization are never loaded.
function ast(file: string) {
  return ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}
function declarations(file: string, names?: string[]) {
  const tree = ast(file);
  const found = new Set<string>();
  const text = tree.statements.filter((node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return false;
    if (!names) return true;
    const matches = ts.isFunctionDeclaration(node) && node.name ? [node.name.text]
      : ts.isVariableStatement(node) ? node.declarationList.declarations.map((item) => item.name.getText(tree)) : [];
    const keep = matches.some((name) => names.includes(name));
    if (keep) matches.forEach((name) => found.add(name));
    return keep;
  }).map((node) => node.getText(tree)).join("\n");
  if (names) for (const name of names) if (!found.has(name)) throw new Error(`Missing production declaration ${file}:${name}`);
  return text;
}
function isolated(text: string, dependencies: Record<string, unknown>, result: string): any {
  const output = ts.transpileModule(text.replace(/^export /gm, ""), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const context = vm.createContext({ Buffer, ...dependencies, exports: {} });
  return new vm.Script(`${output}\n;(${result});`).runInContext(context, { timeout: 2000 });
}
const teamNames = ["toNumber", "archivePrice", "scopeKey", "sortByTime", "buildRealizedDetails", "buildRecentDetails", "buildOpeningClosingAllocations", "linkedNetPnl", "getFrozenSnapshotOpeningLinks", "buildFrozenSnapshotDetails", "regularDistributable", "buildProfitDistribution", "buildLedger52T0IncomeAttributionContext", "calculateLedger52T0IncomeByClosing", "calculateLedger52T0IncomeByUser", "actionInfo"];
const pureTeam = isolated(declarations("./ledger52-t0-team-overview.ts", teamNames), {}, "({buildOpeningClosingAllocations, buildRecentDetails, calculateLedger52T0IncomeByUser})");
const derive = isolated(declarations("./ledger52-t0-allocation-facts.ts"), pureTeam, "deriveT0AllocationFacts");
const pureJournal = isolated(declarations("./ledger52-t0-journal.ts", ["LEDGER_52_T0_JOURNAL_ID", "OKX_VIP2_TAKER_FEE_RATE", "POSITION_ARCHIVE_STEP", "toNumber", "normalizeEthQuantity", "actionSide", "archivePriceForAction", "archivedTargetPrice", "quantityToCents", "priceKey", "relatedUserKey", "relatedFundKey", "buildProfitShareOpeningMatches", "calculateClosingSharedIncomePool"]), {}, "({buildProfitShareOpeningMatches, calculateClosingSharedIncomePool, OKX_VIP2_TAKER_FEE_RATE})");
const planText = declarations("./ledger52-t0-allocation-plan.ts");
const NOW = Date.parse("2026-11-07T04:00:00.000Z");
function entry(id: string, extra: Record<string, unknown> = {}) {
  return { id, accountId: 1, relatedUserId: 3, relatedFundId: 1, action: "openLong", symbol: "ETH", instrumentType: "contract", quantity: 1, price: 110, fee: 0, createdAt: "2026-11-01T00:00:00.000Z", ...extra };
}
function fixture() {
  const state = {
    now: NOW,
    facts: {
      entries: [entry("long", { quantity: 5, price: 100, fee: 10 }), entry("short", { action: "openShort", quantity: 4 }), entry("pending", { isPending: true, quantity: 7, fee: 999 }),
        entry("close", { action: "closeLong", quantity: 2, price: 110, targetPrice: 100, targetOpeningEntryId: "long", createdAt: "2026-11-02T00:00:00Z" }), entry("other", { relatedUserId: 4 })],
      profitShareSnapshots: [], sharedIncomeTransfers: [], sharedIncomeReductions: [],
      payoutCashFlows: [{ relatedUserId: 3, occurredOn: "2025-11-07", direction: "deposit", amount: 1000 }, { relatedUserId: 4, occurredOn: "2025-11-07", direction: "deposit", amount: 3000 },
        { relatedUserId: 28, occurredOn: "2025-11-07", direction: "deposit", amount: 1000 }, { relatedUserId: 2, occurredOn: "2025-11-07", direction: "deposit", amount: 1000 }],
    } as T0AllocationFinancialFacts,
    sourceRows: [{ id: 101, related_user_id: 2, related_fund_id: 1, action: "openLong", price: "100", quantity: "2", fee_usdt: "0.072", instrument_type: "contract", execution_status: "filled" }],
    rules: { version: 1, principalVersion: 1, principal: { curve: "linear", influencePercentage: 100 }, weightedOrder: { ...DEFAULT_WEIGHTED_ORDER_RULE, distanceInfluence: 0, statusInfluence: 0, pnlInfluence: 0 }, contribution: { ...DEFAULT_SHARED_CONTRIBUTION_RULE }, market: { ...DEFAULT_MARKET_CONTRIBUTION_RULE, retentionInfluence: 0 } },
    annualized: { version: 1, influence: 1, targets: { "3": 10, "4": 20 } as Record<string, number> },
    eligibility: [] as Array<{ recipient_user_id: number; is_enabled: number }>,
    deleted: [] as Array<{ dimension_id: number }>,
    profiles: [{ id: 3, name: "A", username: "a" }, { id: 4, name: "B", username: "b" }],
    account: { id: 1, name: "account" },
    market: {
      asOf: new Date(NOW).toISOString(), complete: true, limitations: [] as string[], outputs: [],
      users: [3, 4, 5, 6].map((userId) => ({ userId, name: String(userId), ancestorUserIds: userId === 5 ? [3] : userId === 6 ? [4] : [], hasActivity: userId > 4,
        cumulativeDeposit: userId === 5 ? 100 : userId === 6 ? 300 : 0, cumulativeWithdrawal: 0,
        fundingFlows: userId > 4 ? [{ occurredAt: "2026-10-01T00:00:00Z", kind: "deposit" as const, amount: userId === 5 ? 100 : 300 }] : [], filledQuantityEth: userId === 5 ? 1 : userId === 6 ? 3 : 0 })),
    },
  };
  class ClockDate extends Date {
    constructor(value?: string | number) { super(value === undefined ? state.now : value); }
    static now() { return state.now; }
  }
  const execute = vi.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes("FROM ledger52_t0_journal_accounts")) return [[state.account].filter((account) => params[1] === 28 && (params[2] === account.id || params[2] === account.name))];
    if (sql.includes("FROM ledger52_t0_journal_entries")) return [state.sourceRows];
    if (sql.includes("FROM ledger52_t0_journal_deleted_dimensions")) return [state.deleted];
    if (sql.includes("FROM ledger52_t0_journal_shared_income_eligibilities")) return [state.eligibility];
    if (sql.includes("FROM users")) return [state.profiles.filter((row) => params.includes(row.id))];
    throw new Error(`Unexpected SQL (no DB/writes allowed): ${sql}`);
  });
  const connection = { execute, query: vi.fn(async () => []), commit: vi.fn(async () => undefined), rollback: vi.fn(async () => undefined), release: vi.fn() };
  const getConnection = vi.fn(async () => connection);
  const financial = vi.fn(async (_input: any) => structuredClone(state.facts));
  const rules = vi.fn(async (_input: any) => structuredClone(state.rules));
  const annualized = vi.fn(async (_input: any) => structuredClone(state.annualized));
  const market = vi.fn(async (_input: any) => structuredClone(state.market));
  const source = vi.fn(pureJournal.calculateClosingSharedIncomePool);
  const derived = vi.fn(derive);
  const journal = { ...pureJournal, calculateClosingSharedIncomePool: source, getLedger52T0JournalTeamFinancialFacts: financial };
  const plan = isolated(planText, { ...crypto, TRPCError, Date: ClockDate,
    T0_SHARED_ALLOCATION_METRICS, calculateWeightedOrderScores, calculateSharedContributionWeights, calculateMarketContributionScores,
    allocateCappedAnnualizedCents, getAnnualizedGapWeights, calculateT0AllocationTargetTopUp, calculateT0AllocationXirr,
    deriveT0AllocationFacts: derived, getDbTransactionConnection: getConnection, getLedger52T0AllocationRules: rules,
    getLedger52T0SharedIncomeAnnualizedRule: annualized, getLedger52T0MarketContributionFacts: market,
    require: (name: string) => { if (name === "./ledger52-t0-journal") return journal; throw new Error(`Forbidden runtime import: ${name}`); },
  }, "({normalizeInput, normalizedAllocations, encode, decode, allocateWeightedCents, buildLedger52T0SharedIncomeAllocationPlan, verifyT0SharedIncomePlanToken, verifyT0SharedIncomePlanFresh})");
  const input: T0SharedAllocationPlanInput = { actorUserId: 28, ownerUserId: 28, accountId: 1, accountName: "account", sourceUserId: 2, relatedFundId: 1, action: "closeLong", price: "110", quantity: "1", targetPrice: "100", targetOpeningEntryId: 101, metrics: ["principal"], budgetMode: "amount", budgetValue: "5.01" };
  const preview = (extra: Partial<T0SharedAllocationPlanInput> = {}) => plan.buildLedger52T0SharedIncomeAllocationPlan({ ...input, ...extra });
  const confirm = (result: any, extra: Record<string, unknown> = {}) => ({ ...input, token: result.planToken, allocations: result.allocations, connection, ...extra });
  return { state, plan, input, preview, confirm, connection, getConnection, financial, rules, annualized, market, source, derived };
}

describe("T0 allocation signed execution contract (real isolated production functions)", () => {
  it.each([
    ["actorUserId", 29], ["ownerUserId", 29], ["accountId", 2], ["sourceUserId", 3], ["relatedFundId", 2], ["action", "closeShort"],
    ["price", "111"], ["quantity", "1.01"], ["targetPrice", "101"], ["targetOpeningEntryId", 102], ["metrics", ["sharedContribution"]], ["budgetMode", "percentage"], ["budgetValue", "5.02"],
  ])("binds signed %s and rejects altered confirmation before rereading", async (field, value) => {
    const f = fixture(); const result = await f.preview(); f.source.mockClear();
    expect(() => f.plan.verifyT0SharedIncomePlanToken(f.confirm(result, { [field as string]: value }))).toThrow(/不一致/);
    expect(f.source).not.toHaveBeenCalled();
  });
  it("binds each recipient and cent amount, forbids duplicates, malformed precision, and body/MAC tampering", async () => {
    const f = fixture(); const result = await f.preview();
    for (const allocations of [[{ recipientUserId: 3, amount: "5.01" }], result.allocations.map((row: any) => ({ ...row, amount: "0.001" })), [...result.allocations, result.allocations[0]], [{ recipientUserId: 99, amount: "5.01" }]]) {
      expect(() => f.plan.verifyT0SharedIncomePlanToken(f.confirm(result, { allocations }))).toThrow();
    }
    const [body, mac] = result.planToken.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()); payload.input.actorUserId = 999;
    expect(() => f.plan.decode(`${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${mac}`)).toThrow(/签名/);
    expect(() => f.plan.decode(`${body}.${Buffer.alloc(32).toString("base64url")}`)).toThrow(/签名/);
  });
  it("expires after 60 seconds and rejects a far-future signed plan", async () => {
    const f = fixture(); const result = await f.preview();
    f.state.now += 60_000; expect(() => f.plan.verifyT0SharedIncomePlanToken(f.confirm(result))).not.toThrow();
    f.state.now += 1; expect(() => f.plan.verifyT0SharedIncomePlanToken(f.confirm(result))).toThrow(/过期/);
    f.state.now = NOW; const payload = f.plan.decode(result.planToken); payload.createdAt += 5001;
    expect(() => f.plan.decode(f.plan.encode(payload))).toThrow(/过期/);
  });
  it("normalizes equivalent decimals/order but still binds accountName when no accountId is supplied", () => {
    const f = fixture(); const normalized = f.plan.normalizeInput({ ...f.input, accountId: undefined, metrics: ["sharedContribution", "principal"] });
    const token = f.plan.encode({ input: normalized, createdAt: NOW, allocations: [{ recipientUserId: 3, amount: "1.00" }] });
    expect(() => f.plan.verifyT0SharedIncomePlanToken({ ...f.input, accountId: undefined, price: "110.00", metrics: ["principal", "sharedContribution"], token, allocations: [{ recipientUserId: 3, amount: "1" }] })).not.toThrow();
    expect(() => f.plan.verifyT0SharedIncomePlanToken({ ...normalized, accountName: "other", token, allocations: [{ recipientUserId: 3, amount: "1" }] })).toThrow(/不一致/);
  });
  it("fresh confirmation rereads under locks on the supplied connection and preserves snapshot asOf", async () => {
    const f = fixture(); const result = await f.preview();
    f.connection.execute.mockClear(); f.getConnection.mockClear();
    const audit = await f.plan.verifyT0SharedIncomePlanFresh(f.confirm(result));
    expect(f.getConnection).not.toHaveBeenCalled();
    expect(f.financial).toHaveBeenLastCalledWith({ journalOwnerUserId: 28, includePayoutCashFlows: true, connection: f.connection, lockFacts: true });
    expect(f.financial.mock.calls[0][0]).toEqual(expect.objectContaining({ lockFacts: false }));
    expect(f.rules).toHaveBeenLastCalledWith({ actorUserId: 28, connection: f.connection, lockRules: true });
    expect(f.annualized).toHaveBeenLastCalledWith({ actorUserId: 28, connection: f.connection, lockRules: true });
    expect(f.connection.execute.mock.calls.every(([sql]) => sql.includes("FROM users") || sql.includes("FOR UPDATE"))).toBe(true);
    expect(audit.asOf).toBe(result.asOf); expect(audit.allocations).toEqual(result.allocations);
    expect(f.connection.query).toHaveBeenCalledTimes(1); expect(f.connection.release).toHaveBeenCalledTimes(1);
  });
  it.each(["facts", "source", "rules", "annualized", "eligibility", "deleted", "profile"])("rejects fresh %s changes rather than silently replacing signed allocations", async (kind) => {
    const f = fixture(); const result = await f.preview();
    if (kind === "facts") f.state.facts.payoutCashFlows.push({ relatedUserId: 3, occurredOn: "2026-11-01", direction: "withdrawal", amount: 1 });
    if (kind === "source") f.state.sourceRows[0].fee_usdt = "0.073";
    if (kind === "rules") f.state.rules.version++;
    if (kind === "annualized") f.state.annualized.version++;
    if (kind === "eligibility") f.state.eligibility.push({ recipient_user_id: 999, is_enabled: 0 });
    if (kind === "deleted") f.state.deleted.push({ dimension_id: 999 });
    if (kind === "profile") f.state.profiles[0].name = "renamed";
    await expect(f.plan.verifyT0SharedIncomePlanFresh(f.confirm(result))).rejects.toThrow(/更新/);
  });
});

describe("T0 real source pool, allocation facts and five dimension budgets", () => {
  it("calls journal's existing source pool with actual opening/close fees, no alternate FIFO", async () => {
    const f = fixture(); const result = await f.preview();
    expect(f.source).toHaveBeenCalledTimes(1);
    expect(f.source.mock.calls[0][0]).toBe(f.connection);
    expect(f.source.mock.calls[0][1]).toMatchObject({ actorUserId: 28, sourceUserId: 2, targetOpeningEntryId: 101, quantity: "1", closePrice: "110" });
    expect(result.sourceNetPnl).toBeCloseTo(10 - 0.036 - 110 * Number(pureJournal.OKX_VIP2_TAKER_FEE_RATE), 8);
    expect(result.shareableAmount).toBe(9.92);
    const shortRows = [{ ...f.state.sourceRows[0], action: "openShort", price: "120" }];
    const short = await pureJournal.calculateClosingSharedIncomePool(f.connection, { ...f.source.mock.calls[0][1], positionRows: shortRows, action: "closeShort", targetPrice: "120" });
    expect(short.sourceNetPnl).toBeCloseTo(result.sourceNetPnl, 8);
    expect(pureJournal.buildProfitShareOpeningMatches([...f.state.sourceRows, { ...f.state.sourceRows[0], id: 102 }], "closeLong", "100", 2, 1, 300, 101).reduce((sum: number, row: any) => sum + row.matchedQuantityCents, 0)).toBe(200);
  });
  it("uses deriveT0AllocationFacts for independent unclosed long/short/pending quantities and proportional fees", async () => {
    const f = fixture(); const result = await f.preview({ metrics: ["weightedOpeningQuantity"] });
    expect(f.derived).toHaveBeenCalledTimes(1);
    expect(result.weightedFacts.filter((row: any) => row.userId === "3")).toEqual([
      { userId: "3", side: "long", quantity: 3, price: 100, openingFee: 6, status: "filled" },
      { userId: "3", side: "short", quantity: 4, price: 110, openingFee: 0, status: "filled" },
      { userId: "3", side: "long", quantity: 7, price: 110, openingFee: 0, status: "pending" },
    ]);
    expect(result.candidates.map((row: any) => row.userId)).toEqual(["3", "4"]);
  });
  it("splits all five dimensions into equal cent subpools first, normalizes each separately and never overspends", async () => {
    const f = fixture(); const metrics = [...T0_SHARED_ALLOCATION_METRICS]; const result = await f.preview({ metrics });
    const audit = await f.plan.verifyT0SharedIncomePlanFresh(f.confirm(result, { metrics }));
    expect(audit.detail.map((row: any) => row.budgetCents)).toEqual([101, 100, 100, 100, 100]);
    for (const dimension of audit.detail) {
      expect(dimension.allocations.reduce((sum: number, row: any) => sum + row.cents, 0)).toBeLessThanOrEqual(dimension.budgetCents);
      expect(dimension.allocations.every((row: any) => Number.isSafeInteger(row.cents) && row.cents >= 0)).toBe(true);
    }
    expect(audit.detail[0].allocations).toEqual([{ userId: "3", cents: 25 }, { userId: "4", cents: 76 }]);
    expect(result.allocatedTotal).toBe(5.01); expect(result.allocatedTotal).toBeLessThanOrEqual(result.shareableAmount);
    const aggregate = new Map<number, number>();
    for (const dimension of audit.detail) for (const row of dimension.allocations) aggregate.set(Number(row.userId), (aggregate.get(Number(row.userId)) || 0) + row.cents);
    expect(result.allocations).toEqual([...aggregate].map(([recipientUserId, cents]) => ({ recipientUserId, amount: (cents / 100).toFixed(2) })).sort((a, b) => a.recipientUserId - b.recipientUserId));
  });
  it("principal participation 0 equally divides unequal real deposits", async () => {
    const f = fixture(); f.state.rules.principal.influencePercentage = 0;
    const result = await f.preview({ budgetValue: "5.00" });
    expect(result.allocations).toEqual([{ recipientUserId: 3, amount: "2.50" }, { recipientUserId: 4, amount: "2.50" }]);
  });
  it("annualized uses dated XIRR target caps and retains excess budget rather than going above target", async () => {
    const f = fixture(); f.state.facts.entries = []; f.state.annualized.targets = { "3": 0.1, "4": 0 }; f.state.annualized.influence = 0;
    const result = await f.preview({ metrics: ["realizedAnnualized"], budgetValue: "9.00" });
    const flows = [{ occurredOn: "2025-11-07", direction: "deposit" as const, amount: 1000 }];
    const topUp = calculateT0AllocationTargetTopUp(flows, 1000, 0.001, "2026-11-07")!;
    expect(result.allocations).toEqual([{ recipientUserId: 3, amount: (Math.floor(topUp * 100) / 100).toFixed(2) }]);
    expect(result.allocatedTotal).toBeLessThan(9); expect(result.retainedAmount + result.allocatedTotal).toBeCloseTo(9, 8);
    expect(calculateT0AllocationXirr([...flows, { occurredOn: "2026-11-07", amount: 1000 + result.allocatedTotal, atEndOfBeijingDay: true }])!).toBeLessThanOrEqual(0.001 + 1e-8);
  });
  it("sharedContribution applies the 20% equal guarantee once after merging all three influences", async () => {
    const f = fixture(); f.state.facts.sharedIncomeTransfers = [{ closingEntryId: "close", recipientUserId: 4, sourceUserId: 3, amount: 10 }];
    const result = await f.preview({ metrics: ["sharedContribution"], budgetValue: "5.00" });
    const actualFacts = derive(f.state.facts, { actorUserId: 28, sourceUserId: 2, closePrice: 110, asOf: result.asOf });
    const weights = calculateSharedContributionWeights(actualFacts.candidates.map((row: any) => row.contribution), f.state.rules.contribution);
    expect(weights.map((row) => row.weight)).toEqual([0.9, 0.1]);
    // The production cent allocator first reserves one cent per eligible recipient,
    // then distributes 498 cents at 90%/10%; this is rounding, not another 20% floor.
    expect(result.allocations).toEqual([{ recipientUserId: 3, amount: "4.49" }, { recipientUserId: 4, amount: "0.51" }]);
    expect(result.allocatedTotal).toBe(5);
  });
  it("market data failure and empty market weights fail closed and roll back the read-only preview", async () => {
    const f = fixture(); f.state.market.complete = false;
    await expect(f.preview({ metrics: ["marketContribution"] })).rejects.toThrow(/市场贡献/);
    expect(f.connection.rollback).toHaveBeenCalledOnce(); expect(f.connection.commit).not.toHaveBeenCalled(); expect(f.connection.release).toHaveBeenCalledOnce();
    f.state.market.complete = true; f.state.market.users = f.state.market.users.filter((row) => row.userId <= 4);
    await expect(f.preview({ metrics: ["marketContribution"] })).rejects.toThrow(/有效权重/);
  });
  it("fresh market facts are reread on the same connection and changed fingerprints are rejected", async () => {
    const f = fixture(); const metrics = ["marketContribution"]; const result = await f.preview({ metrics: metrics as any });
    await f.plan.verifyT0SharedIncomePlanFresh(f.confirm(result, { metrics }));
    expect(f.market).toHaveBeenLastCalledWith(expect.objectContaining({ connection: f.connection, journalOwnerUserId: 28, asOf: result.asOf, lockFacts: true }));
    expect(f.market.mock.calls[0][0]).toEqual(expect.objectContaining({ lockFacts: false }));
    f.state.market.users[0].name = "changed";
    await expect(f.plan.verifyT0SharedIncomePlanFresh(f.confirm(result, { metrics }))).rejects.toThrow(/更新/);
    f.market.mockRejectedValueOnce(new Error("market reader unavailable"));
    await expect(f.preview({ metrics: metrics as any })).rejects.toThrow(/unavailable/);
  });
  it("enforces account owner, actual source order, deleted users, disabled eligibility and budget limits", async () => {
    const f = fixture();
    await expect(f.preview({ ownerUserId: 29 })).rejects.toThrow(/归属/);
    await expect(f.preview({ targetOpeningEntryId: 999 })).rejects.toThrow(/源订单/);
    for (const extra of [{ budgetValue: "9.93" }, { budgetMode: "percentage" as const, budgetValue: "101" }, { budgetMode: "percentage" as const, budgetValue: "0" }]) await expect(f.preview(extra)).rejects.toThrow(/预算/);
    f.state.eligibility = [{ recipient_user_id: 3, is_enabled: 0 }];
    expect((await f.preview()).allocations).toEqual([{ recipientUserId: 4, amount: "5.01" }]);
    f.state.deleted = [{ dimension_id: 4 }]; await expect(f.preview()).rejects.toThrow(/暂无/);
  });
  it("rejects non-actual actions, duplicate/unknown metrics and ETH quantity precision at normalization", () => {
    const f = fixture();
    for (const extra of [{ action: "openLong" }, { metrics: ["principal", "principal"] }, { metrics: ["unknown"] }, { quantity: "1.001" }, { actorUserId: 0 }]) expect(() => f.plan.normalizeInput({ ...f.input, ...extra })).toThrow();
  });
  it("real weighted cent allocator preserves totals for uneven, tiny and minimum-cent budgets", () => {
    const f = fixture();
    for (const budget of [0, 1, 2, 3, 7, 101, 999]) for (const minimum of [false, true]) {
      const rows = f.plan.allocateWeightedCents(budget, [{ userId: "3", weight: 1 }, { userId: "4", weight: 999 }, { userId: "5", weight: 0 }, { userId: "6", weight: NaN }], minimum);
      expect(rows.reduce((sum: number, row: any) => sum + row.cents, 0)).toBe(budget);
      expect(rows.every((row: any) => Number.isSafeInteger(row.cents) && row.cents >= 0)).toBe(true);
      if (minimum && budget >= 2) expect(rows.every((row: any) => row.cents >= 1)).toBe(true);
    }
  });
});

// Post-review execution invariants: no legacy unlimited annualized branch or
// wider superadmin write privileges, and locking current reads only at save time.
describe("T0 reviewed execution invariants", () => {
  it("default mean annualized target is capped too; unused subpool remains retained", async () => {
    const f = fixture(); f.state.facts.entries = [];
    f.state.facts.sharedIncomeTransfers = [];
    f.state.facts.payoutCashFlows.push({ relatedUserId: 4, occurredOn: "2026-11-01", direction: "withdrawal", amount: 0.2 });
    // Make B's realized wealth slightly higher, without inventing a cash flow or solver.
    f.state.facts.entries = [entry("gain-open", { relatedUserId: 4, quantity: 0.01, price: 100 }), entry("gain-close", { relatedUserId: 4, action: "closeLong", quantity: 0.01, price: 110, targetPrice: 100, createdAt: "2026-11-02T00:00:00Z" })] as any;
    f.state.annualized = { version: 0, influence: 1, targets: {} };
    const result = await f.preview({ metrics: ["realizedAnnualized"], budgetValue: "9.00" });
    const candidates = derive(f.state.facts, { actorUserId: 28, sourceUserId: 2, closePrice: 110, asOf: result.asOf }).candidates;
    const rates = candidates.map((row: any) => calculateT0AllocationXirr([...row.cashFlows, { occurredOn: "2026-11-07", amount: row.terminalValue, atEndOfBeijingDay: true }])!);
    const mean = rates.reduce((sum: number, rate: number) => sum + rate, 0) / rates.length;
    const low = candidates[0]; const cap = Math.floor(calculateT0AllocationTargetTopUp(low.cashFlows, low.terminalValue, mean, "2026-11-07")! * 100);
    expect(cap).toBeGreaterThan(0); expect(cap).toBeLessThan(900);
    expect(result.allocations).toEqual([{ recipientUserId: low.userId, amount: (cap / 100).toFixed(2) }]);
    expect(result.allocatedTotal).toBe(cap / 100); expect(result.retainedAmount).toBeCloseTo(9 - cap / 100, 8);
  });
  it("filled price affects weighted facts only, original archived price still matches historical FIFO", async () => {
    const f = fixture(); f.state.facts.entries = [
      entry("archived", { price: 100, filledPrice: 111, quantity: 5, fee: 10 }),
      entry("partial-close", { action: "closeLong", price: 120, quantity: 2, targetPrice: 100, createdAt: "2026-11-02T00:00:00Z" }),
    ] as any;
    const result = await f.preview({ metrics: ["weightedOpeningQuantity"] });
    const derived = f.derived.mock.results[0].value;
    expect(derived.trades.find((trade: any) => trade.id === "archived").price).toBe(100);
    expect(result.weightedFacts).toEqual([{ userId: "3", side: "long", quantity: 3, price: 111, openingFee: 6, status: "filled" }]);
    expect(derived.incomeByUser.get(3).orderIncome).toBe(36);
  });
  it("runs only the real preview handler AST and refuses impersonation/member/foreign-owner admin scope", async () => {
    const tree = ast("./routers.ts"); let handler: ts.ArrowFunction | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isPropertyAssignment(node) && node.name.getText(tree) === "t0PreviewSharedIncomeAllocation") {
        const calls = node.initializer;
        if (ts.isCallExpression(calls) && calls.arguments[0] && ts.isArrowFunction(calls.arguments[0])) handler = calls.arguments[0];
      }
      ts.forEachChild(node, visit);
    }; visit(tree);
    if (!handler) throw new Error("Missing real preview handler");
    const builder = vi.fn(async () => ({ ok: true }));
    const scope = { mode: "admin", journalOwnerUserId: 28 };
    const resolver = vi.fn(async () => scope);
    const query = isolated(`const handler = ${handler.getText(tree)};`, { TRPCError,
      require: (name: string) => {
        if (name === "./ledger52-t0-journal") return { resolveLedger52T0JournalReadScope: resolver };
        if (name === "./ledger52-t0-allocation-plan") return { buildLedger52T0SharedIncomeAllocationPlan: builder };
        throw new Error(`Forbidden runtime dependency ${name}`);
      },
    }, "handler");
    const ctx = { user: { id: 28, role: "super_admin" }, isViewingAs: false };
    await expect(query({ ctx: { ...ctx, isViewingAs: true }, input: {} })).rejects.toMatchObject({ code: "FORBIDDEN" });
    scope.mode = "member"; await expect(query({ ctx, input: {} })).rejects.toMatchObject({ code: "FORBIDDEN" });
    scope.mode = "admin"; scope.journalOwnerUserId = 29;
    await expect(query({ ctx, input: {} })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(builder).not.toHaveBeenCalled();
    scope.journalOwnerUserId = 28; await expect(query({ ctx, input: { budgetMode: "amount" } })).resolves.toEqual({ ok: true });
    expect(builder).toHaveBeenCalledOnce();
  });
});

describe("T0 transaction current-read protection (real reader declarations)", () => {
  it("locks all fact query families and pagination, selects filled_price, and never owns the caller's transaction", async () => {
    const helpers = ["LEDGER_52_T0_JOURNAL_ID", "T0_JOURNAL_INSTRUMENT_TYPES", "T0_JOURNAL_OPTION_DIRECTIONS", "T0_JOURNAL_OPTION_PREMIUM_CURRENCIES", "T0_JOURNAL_GRID_DIRECTIONS", "toNumber", "asRows", "isoTime", "mapOptionDate", "mapEntry", "mapProfitShareSnapshot", "getLedger52T0JournalTeamFinancialFacts"];
    const noConnection = vi.fn(() => { throw new Error("No actual DB access permitted"); });
    const read = isolated(declarations("./ledger52-t0-journal.ts", helpers), { TRPCError, getDbTransactionConnection: noConnection, console }, "getLedger52T0JournalTeamFinancialFacts");
    for (const lockFacts of [false, true]) {
      let entryPages = 0; let transferPages = 0; let payoutPages = 0;
      const execute = vi.fn(async (sql: string) => {
        if (sql.includes("FROM ledger52_t0_journal_entries e")) {
          entryPages++;
          return [entryPages === 1 ? Array.from({ length: 500 }, (_, index) => ({ id: index + 1, account_id: 1, action: "openLong", related_user_id: 3, related_fund_id: 1, instrument_type: "contract", quantity: 1, price: 100, filled_price: 111, fee_usdt: 0, trade_time: "2026-11-01T00:00:00Z", cursor_trade_time: "2026-11-01 00:00:00.000000" })) : []];
        }
        if (sql.includes("entry_profit_shares shared_entry") || sql.includes("GROUP BY closing_entry_id")) return [[]];
        if (sql.includes("shared_income_transfers transfer")) {
          transferPages++; return [transferPages === 1 ? Array.from({ length: 500 }, (_, index) => ({ id: 500 - index, closing_entry_id: 1000, source_user_id: 2, recipient_user_id: 3, amount: 1, source_net_pnl: 10, manager_pool_amount: 10, reduces_regular_distribution: 1, created_at: "2026-11-01T00:00:00Z", cursor_created_at: "2026-11-01 00:00:00.000000" })) : []];
        }
        if (sql.includes("payout_logs payout")) {
          payoutPages++; return [payoutPages === 1 ? Array.from({ length: 500 }, (_, index) => ({ id: index + 1, related_user_id: 3, occurred_on: "2026-11-01", cursor_occurred_on: "2026-11-01", direction: "deposit", amount: 1, created_at: "2026-11-01T00:00:00Z" })) : []];
        }
        throw new Error(`Unexpected query: ${sql}`);
      });
      const connection = { execute, query: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
      const result = await read({ journalOwnerUserId: 28, includePayoutCashFlows: true, connection, lockFacts });
      expect(result.entries).toHaveLength(500); expect(result.entries[0]).toMatchObject({ price: 100, filledPrice: 111 });
      expect(result.sharedIncomeTransfers).toHaveLength(500); expect(result.payoutCashFlows).toHaveLength(500);
      expect([entryPages, transferPages, payoutPages]).toEqual([2, 2, 2]);
      for (const [sql] of execute.mock.calls) expect(sql.includes("FOR UPDATE")).toBe(lockFacts);
      expect(execute.mock.calls.find(([sql]) => sql.includes("FROM ledger52_t0_journal_entries e"))![0]).toContain("e.filled_price");
      expect(execute.mock.calls.find(([sql]) => sql.includes("shared_income_transfers transfer"))![0]).toContain("source_closing.execution_status = 'filled'");
      for (const method of [connection.query, connection.commit, connection.rollback, connection.release]) expect(method).not.toHaveBeenCalled();
    }
    await expect(read({ journalOwnerUserId: 28, lockFacts: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(noConnection).not.toHaveBeenCalled();
  });
  it("locks full users ancestry in fresh mode and still rejects missing or cyclic chains", async () => {
    const read = isolated(declarations("./ledger52-t0-market-contribution.ts", ["MAX_ANCESTORS", "MAX_USER_ID", "fail", "userId", "readAncestry"]), { TRPCError, getDbConnection: () => { throw new Error("No DB allowed"); } }, "readAncestry");
    const rows = [{ id: 3, invited_by_user_id: 2, name: "child" }, { id: 2, invited_by_user_id: 1, name: "parent" }, { id: 1, invited_by_user_id: null, name: "root" }];
    const connection = { execute: vi.fn(async (_sql: string) => [rows]) };
    const result = await read(new Set([3]), connection, true);
    expect(result.ancestors.get(3)).toEqual([2, 1]);
    expect(connection.execute).toHaveBeenLastCalledWith(expect.stringContaining("FOR UPDATE"));
    await read(new Set([3]), connection, false);
    expect(connection.execute.mock.calls.at(-1)![0]).not.toContain("FOR UPDATE");
    rows[2].invited_by_user_id = 3 as any;
    await expect(read(new Set([3]), connection, true)).rejects.toThrow(/循环/);
    rows.pop(); await expect(read(new Set([3]), connection, true)).rejects.toThrow(/缺失/);
  });
});
