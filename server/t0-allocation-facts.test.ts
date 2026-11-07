import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { T0AllocationFinancialFacts, T0AllocationFacts } from "./ledger52-t0-allocation-facts";
import { calculateWeightedOrderScores, DEFAULT_WEIGHTED_ORDER_RULE } from "../shared/t0-weighted-order-rule";

// Compile actual production pure declarations only: no runtime server/db/journal imports.
function source(relative: string) {
  return ts.createSourceFile(relative, readFileSync(new URL(relative, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}
function compile(text: string, dependencies: Record<string, unknown>, result: string): any {
  const output = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(dependencies), "exports", `${output}\nreturn ${result};`)(...Object.values(dependencies), {});
}
const team = source("./ledger52-t0-team-overview.ts");
const requiredHelpers = new Set([
  "toNumber", "archivePrice", "scopeKey", "sortByTime", "buildRealizedDetails", "buildRecentDetails",
  "buildOpeningClosingAllocations", "linkedNetPnl", "getFrozenSnapshotOpeningLinks", "buildFrozenSnapshotDetails",
  "regularDistributable", "buildProfitDistribution", "buildLedger52T0IncomeAttributionContext",
  "calculateLedger52T0IncomeByClosing", "calculateLedger52T0IncomeByUser",
]);
const declarations = team.statements.filter((node) => ts.isFunctionDeclaration(node) && node.name && requiredHelpers.has(node.name.text)).map((node) => node.getText(team)).join("\n");
const actions = team.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((declaration) => declaration.name.getText(team) === "actionInfo"));
if (!actions) throw new Error("Missing production actionInfo");
const pureTeam = compile(`${actions.getText(team)}\n${declarations}`, {}, "({ buildOpeningClosingAllocations, buildRecentDetails, calculateLedger52T0IncomeByUser })");
const allocation = source("./ledger52-t0-allocation-facts.ts");
const allocationDeclarations = allocation.statements.filter((node) => !ts.isImportDeclaration(node)).map((node) => node.getText(allocation)).join("\n");
const derive: (facts: T0AllocationFinancialFacts, context: { actorUserId: number; sourceUserId: number; closePrice: number; asOf: string }) => T0AllocationFacts = compile(allocationDeclarations, pureTeam, "deriveT0AllocationFacts");
const context = { actorUserId: 28, sourceUserId: 2, closePrice: 110, asOf: "2026-11-07T12:00:00+08:00" };
type Entry = T0AllocationFinancialFacts["entries"][number];
function entry(id: string, overrides: Partial<Entry> = {}): Entry {
  return { id, accountId: 1, relatedUserId: 3, relatedFundId: 1, action: "openLong", symbol: "ETH", instrumentType: "contract", quantity: 1, price: 100, fee: 0, createdAt: "2026-11-01T00:00:00.000Z", ...overrides };
}
function facts(overrides: Partial<T0AllocationFinancialFacts> = {}): T0AllocationFinancialFacts {
  return {
    entries: [], profitShareSnapshots: [], sharedIncomeTransfers: [], sharedIncomeReductions: [],
    payoutCashFlows: [{ relatedUserId: 3, occurredOn: "2026-10-01", direction: "deposit", amount: 1000 }],
    ...overrides,
  };
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

describe("T+0 independent allocation financial facts", () => {
  it("uses Beijing calendar date for ISO asOf timestamps across UTC midnight", () => {
    const input = facts({ payoutCashFlows: [
      { relatedUserId: 3, occurredOn: "2026-11-08", direction: "deposit", amount: 100 },
      { relatedUserId: 3, occurredOn: "2026-11-09", direction: "deposit", amount: 900 },
    ] });
    expect(derive(input, { ...context, asOf: "2026-11-07T17:00:00.000Z" }).candidates[0].depositAmount).toBe(100);
    expect(derive(input, { ...context, asOf: "2026-11-07T15:59:59.000Z" }).candidates).toEqual([]);
  });

  it("includes historical depositors without orders, excludes source/actor and future flows", () => {
    const input = freeze(facts({ payoutCashFlows: [
      { relatedUserId: 3, occurredOn: "2026-10-01", direction: "deposit", amount: 1000 },
      { relatedUserId: 3, occurredOn: "2026-10-05", direction: "withdrawal", amount: 250 },
      { relatedUserId: 3, occurredOn: "2026-12-01", direction: "deposit", amount: 8000 },
      { relatedUserId: 3, occurredOn: "2026-12-02", direction: "withdrawal", amount: 900 },
      { relatedUserId: 4, occurredOn: "2026-12-01", direction: "deposit", amount: 100 },
      { relatedUserId: 2, occurredOn: "2026-10-01", direction: "deposit", amount: 100 },
      { relatedUserId: 28, occurredOn: "2026-10-01", direction: "deposit", amount: 100 },
    ], payoutDepositTotals: [{ relatedUserId: 3, cumulativeDepositAmount: 9000 }] }));
    const result = derive(input, context);
    expect(result.candidates.map((candidate) => candidate.userId)).toEqual([3]);
    expect(result.candidates[0]).toMatchObject({ depositAmount: 1000, terminalValue: 750 });
    expect(result.candidates[0].cashFlows).toHaveLength(2);
    expect(result.weightedFacts).toEqual([]);
    expect(result.incomeByUser.size).toBe(0);
  });

  it("keeps both long and short, pending quantities and proportional remaining opening fees", () => {
    const result = derive(facts({ entries: [
      entry("long", { quantity: 5, fee: 10 }),
      entry("short", { action: "openShort", quantity: 4 }),
      entry("pending", { isPending: true, quantity: 7, fee: 999 }),
      entry("close", { action: "closeLong", quantity: 2, price: 110, targetPrice: 100, targetOpeningEntryId: "long", createdAt: "2026-11-02T00:00:00Z" }),
    ] }), context);
    expect(result.weightedFacts).toEqual([
      { userId: "3", side: "long", quantity: 3, price: 100, openingFee: 6, status: "filled" },
      { userId: "3", side: "short", quantity: 4, price: 100, openingFee: 0, status: "filled" },
      { userId: "3", side: "long", quantity: 7, price: 100, openingFee: 0, status: "pending" },
    ]);
    const score = calculateWeightedOrderScores(result.weightedFacts, context.closePrice, DEFAULT_WEIGHTED_ORDER_RULE).get("3")!;
    expect(score.filledQuantity).toBe(7);
    expect(score.pendingQuantity).toBe(7);
  });

  it("targeted second opening consumes only that opening and pending closings do not consume", () => {
    const result = derive(facts({ entries: [
      entry("first", { quantity: 4 }), entry("second", { quantity: 3 }),
      entry("target-close", { action: "closeLong", quantity: 3, price: 120, targetPrice: 100, targetOpeningEntryId: "second", createdAt: "2026-11-02T00:00:00Z" }),
      entry("pending-close", { action: "closeLong", isPending: true, quantity: 4, targetPrice: 100, targetOpeningEntryId: "first", createdAt: "2026-11-03T00:00:00Z" }),
    ] }), context);
    expect(result.weightedFacts).toHaveLength(1);
    expect(result.weightedFacts[0].quantity).toBe(4);
  });

  it("same account different users/funds are independent and lock/hidden flags do not filter", () => {
    const locked = { ...entry("fund-one", { quantity: 2 }), isLocked: true, accountHidden: true, relatedUserHidden: true };
    const result = derive(facts({ entries: [locked,
      entry("fund-two", { quantity: 3, relatedFundId: 2 }),
      entry("other-user", { quantity: 4, relatedUserId: 4 }),
      entry("fund-two-close", { relatedFundId: 2, action: "closeLong", quantity: 3, price: 110, targetPrice: 100, createdAt: "2026-11-02T00:00:00Z" }),
    ] }), context);
    expect(result.weightedFacts.map((fact) => [fact.userId, fact.quantity])).toEqual([["3", 2], ["4", 4]]);
    expect(result.candidates.map((candidate) => candidate.userId)).toEqual([3]);
  });

  it("retains negative actual income and signed snapshot commission in cash terminal", () => {
    const result = derive(facts({ entries: [entry("open"), entry("loss", { action: "closeLong", price: 80, targetPrice: 100, createdAt: "2026-11-02T00:00:00Z" })],
      profitShareSnapshots: [
        { entryId: "loss", openingEntryId: "open", beneficiaryUserId: 3, percentage: 75, matchedQuantity: 1 },
        { entryId: "loss", openingEntryId: "open", beneficiaryUserId: 4, percentage: 25, matchedQuantity: 1 },
      ],
      payoutCashFlows: [
        { relatedUserId: 3, occurredOn: "2026-10-01", direction: "deposit", amount: 1000 },
        { relatedUserId: 4, occurredOn: "2026-10-01", direction: "deposit", amount: 100 },
      ],
    }), context);
    expect(result.incomeByUser.get(3)?.orderIncome).toBe(-15);
    expect(result.incomeByUser.get(4)?.commissionIncome).toBe(-5);
    expect(result.candidates.map((candidate) => candidate.terminalValue)).toEqual([985, 95]);
    expect(result.candidates[0].contribution.outgoingAmount).toBe(0);
  });

  it("outgoing is positive source settled net PnL, not transfer sum; counts distinct closing", () => {
    const result = derive(facts({ entries: [entry("open"), entry("profit", { action: "closeLong", price: 120, targetPrice: 100, createdAt: "2026-11-02T00:00:00Z" })],
      sharedIncomeTransfers: [
        { closingEntryId: "profit", sourceUserId: 3, recipientUserId: 4, amount: 2 },
        { closingEntryId: "profit", sourceUserId: 3, recipientUserId: 4, amount: 3 },
      ], sharedIncomeReductions: [{ closingEntryId: "profit", amount: 5, sourceNetPnl: 20 }],
      payoutCashFlows: [
        { relatedUserId: 3, occurredOn: "2026-10-01", direction: "deposit", amount: 1000 },
        { relatedUserId: 4, occurredOn: "2026-10-01", direction: "deposit", amount: 100 },
      ],
    }), context);
    expect(result.candidates[0].contribution).toMatchObject({ outgoingAmount: 20, outgoingCount: 1 });
    expect(result.candidates[1].contribution).toMatchObject({ incomingAmount: 5, incomingCount: 1 });
    expect(result.candidates.map((candidate) => candidate.terminalValue)).toEqual([1015, 105]);
  });

  it("filters option/grid/non-ETH/cancelled/fully-closed quantities and future actual trades", () => {
    const result = derive(facts({ entries: [
      entry("option", { instrumentType: "option" }), entry("grid", { instrumentType: "grid" }), entry("btc", { symbol: "BTC" }),
      entry("cancelled", { executionStatus: "cancelled" }),
      entry("future", { filledAt: "2026-12-01T00:00:00Z" }),
      entry("zero", { quantity: 0 }), entry("open"),
      entry("close", { action: "closeLong", price: 110, targetPrice: 100, createdAt: "2026-11-02T00:00:00Z" }),
    ] }), context);
    expect(result.trades.map((trade) => trade.id)).toEqual(["open", "close"]);
    expect(result.weightedFacts).toEqual([]);
  });

  it("uses filled price, carries target/filledAt fields and does not mutate input", () => {
    const input = freeze(facts({ entries: [entry("filled", { filledPrice: 101, filledAt: "2026-11-01T01:00:00Z", targetPrice: 100, targetOpeningEntryId: "original" })] }));
    const result = derive(input, context);
    expect(result.trades[0]).toMatchObject({ price: 100, filledAt: "2026-11-01T01:00:00Z", targetPrice: 100, targetOpeningEntryId: "original" });
    expect(result.weightedFacts[0].price).toBe(101);
    expect(input.entries[0].price).toBe(100);
    expect(() => derive(input, { ...context, asOf: "2026-02-30" })).toThrow(/asOf/);
  });

  it("keeps FIFO archive price separate when a filled quote crosses price bands", () => {
    const result = derive(facts({ entries: [
      entry("open-filled", { price: 100, filledPrice: 111, quantity: 3 }),
      entry("closed", { action: "closeLong", price: 120, targetPrice: 100, quantity: 2, createdAt: "2026-11-02T00:00:00Z" }),
    ] }), context);
    expect(result.trades[0].price).toBe(100);
    expect(result.weightedFacts).toHaveLength(1);
    expect(result.weightedFacts[0]).toMatchObject({ quantity: 1, price: 111, status: "filled", side: "long" });
  });
});
