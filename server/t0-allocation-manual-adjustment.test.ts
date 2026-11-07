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

// Only real production AST declarations/callbacks are evaluated. No application,
// router, DB, browser, tRPC or scanner module is runtime imported. Financial and
// query responses are fixtures; all amount normalization, source FIFO, allocation,
// signature verification, freshness checks and complete save logic are production.
function ast(file: string) {
  return ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(root); return found;
}
function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Missing real production AST: ${name}`);
  return value;
}
function declarations(file: string, names?: string[]) {
  const tree = ast(file); const found = new Set<string>();
  const text = tree.statements.filter(node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return false;
    if (!names) return true;
    const matches = ts.isFunctionDeclaration(node) && node.name ? [node.name.text]
      : ts.isVariableStatement(node) ? node.declarationList.declarations.map(item => item.name.getText(tree)) : [];
    const keep = matches.some(name => names.includes(name));
    if (keep) matches.forEach(name => found.add(name)); return keep;
  }).map(node => node.getText(tree)).join("\n");
  if (names) for (const name of names) if (!found.has(name)) throw new Error(`Missing production declaration ${file}:${name}`);
  return text.replace(/^export /gm, "");
}
function script(text: string) {
  return new vm.Script(ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText);
}
function isolated(text: string, dependencies: Record<string, unknown>, result: string): any {
  const sandbox = vm.createContext({ Buffer, ...dependencies, exports: {} });
  return script(`${text}\n;(${result});`).runInContext(sandbox, { timeout: 2000 });
}
const teamNames = ["toNumber", "archivePrice", "scopeKey", "sortByTime", "buildRealizedDetails", "buildRecentDetails", "buildOpeningClosingAllocations", "linkedNetPnl", "getFrozenSnapshotOpeningLinks", "buildFrozenSnapshotDetails", "regularDistributable", "buildProfitDistribution", "buildLedger52T0IncomeAttributionContext", "calculateLedger52T0IncomeByClosing", "calculateLedger52T0IncomeByUser", "actionInfo"];
const pureTeam = isolated(declarations("./ledger52-t0-team-overview.ts", teamNames), {}, "({buildOpeningClosingAllocations, buildRecentDetails, calculateLedger52T0IncomeByUser})");
const derive = isolated(declarations("./ledger52-t0-allocation-facts.ts"), pureTeam, "deriveT0AllocationFacts");
const pureJournal = isolated(declarations("./ledger52-t0-journal.ts", ["LEDGER_52_T0_JOURNAL_ID", "OKX_VIP2_TAKER_FEE_RATE", "POSITION_ARCHIVE_STEP", "toNumber", "normalizeEthQuantity", "actionSide", "archivePriceForAction", "archivedTargetPrice", "quantityToCents", "priceKey", "relatedUserKey", "relatedFundKey", "buildProfitShareOpeningMatches", "calculateClosingSharedIncomePool"]), {}, "({buildProfitShareOpeningMatches, calculateClosingSharedIncomePool, OKX_VIP2_TAKER_FEE_RATE})");
const NOW = Date.parse("2026-11-07T04:00:00Z");
function backend() {
  const state = {
    now: NOW,
    facts: { entries: [], profitShareSnapshots: [], sharedIncomeTransfers: [], sharedIncomeReductions: [], payoutCashFlows: [
      { relatedUserId: 3, occurredOn: "2025-11-07", direction: "deposit", amount: 1000 },
      { relatedUserId: 4, occurredOn: "2025-11-07", direction: "deposit", amount: 3000 },
      { relatedUserId: 28, occurredOn: "2025-11-07", direction: "deposit", amount: 1000 },
      { relatedUserId: 2, occurredOn: "2025-11-07", direction: "deposit", amount: 1000 },
    ] },
    sourceRows: [{ id: 101, related_user_id: 2, related_fund_id: 1, action: "openLong", price: "100", quantity: "2", fee_usdt: "0.072", instrument_type: "contract", execution_status: "filled" }],
    rules: { version: 1, principalVersion: 1, principal: { curve: "linear", influencePercentage: 100 }, weightedOrder: { ...DEFAULT_WEIGHTED_ORDER_RULE }, contribution: { ...DEFAULT_SHARED_CONTRIBUTION_RULE }, market: { ...DEFAULT_MARKET_CONTRIBUTION_RULE } },
    annualized: { version: 1, influence: 1, targets: { "3": 10, "4": 20 } },
    eligibility: [] as Array<{ recipient_user_id: number; is_enabled: number }>,
    deleted: [] as Array<{ dimension_id: number }>,
    profiles: [{ id: 3, name: "A", username: "a" }, { id: 4, name: "B", username: "b" }],
  };
  class ClockDate extends Date {
    constructor(value?: string | number) { super(value === undefined ? state.now : value); }
    static now() { return state.now; }
  }
  const execute = vi.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes("FROM ledger52_t0_journal_accounts")) return [[{ id: 1, name: "account" }].filter(() => params[1] === 28 && (params[2] === 1 || params[2] === "account"))];
    if (sql.includes("FROM ledger52_t0_journal_entries")) return [state.sourceRows];
    if (sql.includes("FROM ledger52_t0_journal_deleted_dimensions")) return [state.deleted];
    if (sql.includes("FROM ledger52_t0_journal_shared_income_eligibilities")) return [state.eligibility];
    if (sql.includes("FROM users")) return [state.profiles.filter(row => params.includes(row.id))];
    throw new Error(`Forbidden DB/write query: ${sql}`);
  });
  const connection = { execute, query: vi.fn(async () => []), commit: vi.fn(async () => undefined), rollback: vi.fn(async () => undefined), release: vi.fn() };
  const getConnection = vi.fn(async () => connection);
  const financial = vi.fn(async () => structuredClone(state.facts));
  const rules = vi.fn(async () => structuredClone(state.rules));
  const annualized = vi.fn(async () => structuredClone(state.annualized));
  const plan = isolated(declarations("./ledger52-t0-allocation-plan.ts"), {
    ...crypto, TRPCError, Date: ClockDate, T0_SHARED_ALLOCATION_METRICS, calculateWeightedOrderScores,
    calculateSharedContributionWeights, calculateMarketContributionScores, allocateCappedAnnualizedCents,
    getAnnualizedGapWeights, calculateT0AllocationTargetTopUp, calculateT0AllocationXirr,
    deriveT0AllocationFacts: derive, getDbTransactionConnection: getConnection,
    getLedger52T0AllocationRules: rules, getLedger52T0SharedIncomeAnnualizedRule: annualized,
    getLedger52T0MarketContributionFacts: () => { throw new Error("Unexpected market read"); },
    require: (name: string) => {
      if (name === "./ledger52-t0-journal") return { ...pureJournal, getLedger52T0JournalTeamFinancialFacts: financial };
      throw new Error(`Forbidden runtime import: ${name}`);
    },
  }, "({allocationAmountCents, encode, decode, buildLedger52T0SharedIncomeAllocationPlan, verifyT0SharedIncomePlanToken, verifyT0SharedIncomePlanFresh})");
  const input = { actorUserId: 28, ownerUserId: 28, accountId: 1, accountName: "account", sourceUserId: 2, relatedFundId: 1, action: "closeLong", price: "110", quantity: "1", targetPrice: "100", targetOpeningEntryId: 101, metrics: ["principal"], budgetMode: "amount", budgetValue: "5.00" };
  const preview = (extra: Record<string, unknown> = {}) => plan.buildLedger52T0SharedIncomeAllocationPlan({ ...input, ...extra });
  const confirm = (result: any, allocations: unknown = [{ recipientUserId: 3, amount: "1.00" }, { recipientUserId: 4, amount: "4.00" }], extra: Record<string, unknown> = {}) => ({ ...input, token: result.planToken, allocations, manualAdjustment: true, connection, ...extra });
  return { state, plan, input, preview, confirm, connection, getConnection, financial };
}

describe("T0 explicit manual adjustment: real signed/fresh production execution", () => {
  it("permits final amounts only on explicit boolean true, preserving legacy strict amount binding", async () => {
    const f = backend(); const result = await f.preview();
    expect(result.allocations).toEqual([{ recipientUserId: 3, amount: "1.25" }, { recipientUserId: 4, amount: "3.75" }]);
    for (const manualAdjustment of [undefined, false, "true", 1]) {
      expect(() => f.plan.verifyT0SharedIncomePlanToken(f.confirm(result, undefined, { manualAdjustment }))).toThrow(/不一致/);
    }
    expect(() => f.plan.verifyT0SharedIncomePlanToken(f.confirm(result))).not.toThrow();
    const audit = await f.plan.verifyT0SharedIncomePlanFresh(f.confirm(result));
    expect(audit).toMatchObject({ mode: "manual_adjustment", ruleSource: "signed_server_plan", rulesVersion: 1, principalVersion: 1, annualizedVersion: 1, allocatedTotal: 5, retainedAmount: 0 });
    expect(audit.suggestedAllocations).toEqual(result.allocations);
    expect(audit.allocations).toEqual([{ recipientUserId: 3, amount: "1.00" }, { recipientUserId: 4, amount: "4.00" }]);
    expect(audit.detail[0].allocations).toEqual([{ userId: "3", cents: 125 }, { userId: "4", cents: 375 }]);
    expect(f.plan.decode(result.planToken).allocations).toEqual(result.allocations);
    expect(f.financial).toHaveBeenLastCalledWith({ journalOwnerUserId: 28, includePayoutCashFlows: true, connection: f.connection, lockFacts: true });
  });
  it.each([{ allocations: [] }, { allocations: [{ recipientUserId: 3, amount: "0.01" }] }, { allocations: [{ recipientUserId: 4, amount: "2.00" }] }])("allows omitted zero rows/partial allocation and retains unallocated budget: $allocations", async ({ allocations }) => {
    const f = backend(); const result = await f.preview();
    const audit = await f.plan.verifyT0SharedIncomePlanFresh(f.confirm(result, allocations));
    expect(audit.allocations).toEqual(allocations);
    const cents = allocations.reduce((total, row) => total + f.plan.allocationAmountCents(row.amount), 0);
    expect(audit.allocatedTotal).toBe(cents / 100);
    expect(audit.retainedAmount).toBe((500 - cents) / 100);
    expect(audit.suggestedAllocations).toEqual(result.allocations);
  });
  it.each([
    ["actorUserId", 29], ["ownerUserId", 29], ["accountId", 2], ["sourceUserId", 3], ["relatedFundId", 2], ["action", "closeShort"],
    ["price", "111"], ["quantity", "1.01"], ["targetPrice", "101"], ["targetOpeningEntryId", 102], ["metrics", ["sharedContribution"]], ["budgetMode", "percentage"], ["budgetValue", "5.01"],
  ])("explicit true never bypasses signed %s binding", async (field, value) => {
    const f = backend(); const result = await f.preview(); f.connection.execute.mockClear();
    await expect(f.plan.verifyT0SharedIncomePlanFresh(f.confirm(result, undefined, { [field as string]: value }))).rejects.toThrow(/不一致/);
    expect(f.connection.execute).not.toHaveBeenCalled();
  });
  it("does not bypass signature, 60-second expiry or future-plan protection", async () => {
    const f = backend(); const result = await f.preview(); const [body, mac] = result.planToken.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()); payload.input.budgetValue = "100";
    for (const token of [`${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${mac}`, `${body}.${Buffer.alloc(32).toString("base64url")}`, "", "garbage"]) {
      await expect(f.plan.verifyT0SharedIncomePlanFresh(f.confirm(result, undefined, { token }))).rejects.toThrow();
    }
    f.state.now += 60_000;
    expect(() => f.plan.verifyT0SharedIncomePlanToken(f.confirm(result))).not.toThrow();
    f.state.now++;
    await expect(f.plan.verifyT0SharedIncomePlanFresh(f.confirm(result))).rejects.toThrow(/过期/);
    f.state.now = NOW; const original = f.plan.decode(result.planToken); original.createdAt += 5001;
    await expect(f.plan.verifyT0SharedIncomePlanFresh(f.confirm(result, undefined, { token: f.plan.encode(original) }))).rejects.toThrow(/过期/);
  });
  it.each(["facts", "source", "rules", "annualized", "eligibility", "deleted", "profile"])("manual adjustment still rejects fresh %s changes", async kind => {
    const f = backend(); const result = await f.preview();
    if (kind === "facts") f.state.facts.payoutCashFlows.push({ relatedUserId: 3, occurredOn: "2026-11-01", direction: "withdrawal", amount: 1 });
    if (kind === "source") f.state.sourceRows[0].fee_usdt = "0.073";
    if (kind === "rules") f.state.rules.version++;
    if (kind === "annualized") f.state.annualized.version++;
    if (kind === "eligibility") f.state.eligibility.push({ recipient_user_id: 3, is_enabled: 0 });
    if (kind === "deleted") f.state.deleted.push({ dimension_id: 3 });
    if (kind === "profile") f.state.profiles[0].name = "changed";
    await expect(f.plan.verifyT0SharedIncomePlanFresh(f.confirm(result))).rejects.toThrow(/更新/);
  });
  it("rejects final amounts above signed budget even below real source income, and above source income", async () => {
    const f = backend(); const result = await f.preview();
    expect(result.shareableAmount).toBeGreaterThan(5.01);
    for (const amount of ["5.01", "9.93", "10.00"]) await expect(f.plan.verifyT0SharedIncomePlanFresh(f.confirm(result, [{ recipientUserId: 3, amount }]))).rejects.toThrow(/合计不得超过/);
    const percentage = await f.preview({ budgetMode: "percentage", budgetValue: "50" });
    await expect(f.plan.verifyT0SharedIncomePlanFresh(f.confirm(percentage, [{ recipientUserId: 3, amount: "5.00" }], { budgetMode: "percentage", budgetValue: "50" }))).rejects.toThrow(/合计不得超过/);
  });
  it("rejects already disabled, no-principal, removed, unknown, source and manager recipients", async () => {
    const f = backend(); f.state.eligibility.push({ recipient_user_id: 3, is_enabled: 0 });
    f.state.profiles.push({ id: 5, name: "No principal", username: "none" });
    const result = await f.preview();
    expect(result.candidates.find((row: any) => row.userId === "3").sharedIncomeEnabled).toBe(false);
    for (const recipientUserId of [3, 5, 999, 2, 28]) await expect(f.plan.verifyT0SharedIncomePlanFresh(f.confirm(result, [{ recipientUserId, amount: "1.00" }]))).rejects.toThrow(/已入金且开启共享资格/);
    f.state.deleted.push({ dimension_id: 4 });
    await expect(f.plan.verifyT0SharedIncomePlanFresh(f.confirm(result, [{ recipientUserId: 4, amount: "1.00" }]))).rejects.toThrow();
  });
  it("rejects duplicate IDs, nonpositive, nonfinite, unsafe and non-cent amounts under explicit true", async () => {
    const f = backend(); const result = await f.preview();
    for (const amount of ["0", "0.00", "-1", "NaN", "Infinity", "1e0", "0.001", "1.000", "0.000000001", "9007199254740992", 1, null]) {
      expect(() => f.plan.verifyT0SharedIncomePlanToken(f.confirm(result, [{ recipientUserId: 3, amount }]))).toThrow();
    }
    for (const allocations of [[{ recipientUserId: 3, amount: "1" }, { recipientUserId: 3, amount: "2" }], [{ recipientUserId: 0, amount: "1" }], [null], null]) {
      expect(() => f.plan.verifyT0SharedIncomePlanToken(f.confirm(result, allocations))).toThrow();
    }
  });
});

const page = ast("../client/src/pages/T0Journal.tsx");
function variable(name: string, root: ts.Node = page) {
  return required(nodes(root, ts.isVariableDeclaration).find(node => node.name.getText(page) === name), name);
}
function initializer(name: string, root: ts.Node = page) { return required(variable(name, root).initializer, name); }
const effect = required(nodes(page, ts.isCallExpression).find(call => call.expression.getText(page) === "useEffect" && call.arguments[0]?.getText(page).includes("sharedIncomeServerPlanActive") && call.arguments[0]?.getText(page).includes("setSharedIncomeDrafts")), "draft synchronization effect");
const save = initializer("handleSaveEntry");
const renderCandidates = initializer("renderSharedIncomeAllocationCandidates");
const componentNames = ["closingStoredSourceTrade", "closingStoredAction", "closingStoredTargetPrice", "sharedIncomeServerPlanActive", "sharedIncomeServerPlanInput", "sharedIncomeServerPlan", "sharedIncomeServerPlanUnavailable", "sharedIncomeServerPlanInputKey", "sharedIncomeClosePreview", "sharedIncomeEligibleCandidateIds", "sharedIncomeAllocatedTotalCents", "sharedIncomeAllocatedTotal", "sharedIncomeSaveAllocations", "sharedIncomeBudget"];
const pureNames = ["ACTIONS", "POSITION_ARCHIVE_STEP", "ETH_QUANTITY_PATTERN", "normalizeEthQuantity", "normalizeT0PriceForSubmission", "priceKey", "archivePriceForSide", "archivePriceForTrade", "getT0StoredClosingTargetPrice", "getTradeProfitShareRate", "getTradeFinancialQuantity", "getTradeActivityTime", "getStoredEntryId", "getStoredAction", "getStoredOptionDirection", "getStoredGridDirection", "compareT0PositionRecordedOrder", "invertTradeAction", "invertOptionDirection", "invertGridDirection", "asAdminCounterpartyTrade", "buildOpeningClosingAllocations", "buildPositionBuckets", "formatQuantity", "limitT0SharedIncomeAmountInput", "getT0SharedIncomeAmountCents", "formatT0SharedIncomeAmountCents"];
pureNames.push("limitT0ManualDecimalInput");
const deriveScript = script(componentNames.map(name => `globalThis.${name} = (${initializer(name).getText(page)});`).join("\n"));
const effectScript = script(`(${effect.arguments[0].getText(page)})();`);
function attr(element: ts.JsxElement | ts.JsxSelfClosingElement, name: string) {
  const attributes = ts.isJsxElement(element) ? element.openingElement.attributes : element.attributes;
  const attribute = required(attributes.properties.find((node): node is ts.JsxAttribute => ts.isJsxAttribute(node) && node.name.getText(page) === name), name);
  if (!attribute.initializer || !ts.isJsxExpression(attribute.initializer)) throw new Error(`Not expression: ${name}`);
  return required(attribute.initializer.expression, name);
}
const review = required(nodes(page, ts.isJsxElement).find(element => element.openingElement.tagName.getText(page) === "button" && element.children.some(child => child.getText(page).includes("确认${ACTIONS[entryForm.action].label}")) && element.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute) && attribute.name.getText(page) === "onClick" && nodes(attribute, ts.isCallExpression).some(call => call.expression.getText(page) === "handleSaveEntry" && call.arguments.length === 0))), "review button");
const compactInput = required(nodes(renderCandidates, ts.isJsxSelfClosingElement).find(element => element.tagName.getText(page) === "input" && attr(element, "onChange").getText(page).includes("updateCompactDraft")), "compact amount input");
function candidate(userId: string, extra: Record<string, unknown> = {}) { return { userId, name: `Member ${userId}`, hasPrincipal: true, sharedIncomeEnabled: true, ...extra }; }
function response(extra: Record<string, unknown> = {}) {
  return { planToken: "opaque-query-response-token", asOf: "2026-11-07T04:00:00Z", sourceNetPnl: 90, shareableAmount: 10, candidates: [candidate("4"), candidate("5")], weightedFacts: [], allocations: [{ recipientUserId: 4, amount: "2.00" }, { recipientUserId: 5, amount: "3.00" }], ...extra };
}
function frontend() {
  const state = { sharedIncomeDrafts: {} as Record<string, string>, sharedIncomeManuallyAdjusted: false, sharedIncomeTargetSelections: {} as Record<string, number>, sharedIncomeAllocationPlanError: null as string | null, closeSaveError: null as string | null, openingSaveError: null as string | null, trades: [] as any[], selectedAccountIds: ["1"], accounts: [] as any[], closeConfirmationStep: "review" };
  const source = { id: "101", accountId: "1", accountName: "account", relatedUserId: "2", relatedFundId: "3", action: "openShort", symbol: "ETH", instrumentType: "contract", quantity: 10, price: 2530, fee: 0, createdAt: "2026-11-01T00:00:00Z" };
  const query = { data: response() as ReturnType<typeof response> | undefined, isFetching: false, error: null as Error | null, refetch: vi.fn() };
  const mutate = vi.fn(); const forbidden = vi.fn(() => { throw new Error("Forbidden DB/browser/runtime import/write"); });
  const sandbox = vm.createContext({
    ...state, entryForm: { action: "closeShort", accountId: "1", accountName: "account", relatedUserId: "2", relatedUserName: "source", relatedUsername: "source", relatedFundId: "3", relatedFundName: "", instrumentType: "contract", quantity: "10", price: "2520", targetPrice: 2530, targetOpeningEntryId: "101", note: "manual test", editingEntryId: "", isLocked: false, isCounterparty: false, isPending: false, keepReopenReminder: false, reminderTemplateId: "", isTakeProfit: false, takeProfitPlans: [], optionDirection: "long_call", optionExpiryDate: "", optionPremium: "", optionPremiumCurrency: "USDT", gridDirection: "long", gridRangeMin: "", gridRangeMax: "", gridLeverage: "", gridCount: "" },
    canManage: true, isCloseDistributionPreviewLink: false, rawJournalTrades: [source], closingSourceTrade: source,
    sharedIncomeAllocationMetrics: ["principal"], sharedIncomeAllocationBudgetMode: "amount", sharedIncomeAllocationBudgetValue: "5.00", sharedIncomeAnnualizedRuleUnavailable: false,
    sharedIncomeLocalClosePreview: response(), t0SharedIncomeServerPlanQuery: query,
    saveEntryMutation: { mutate, isPending: false }, setSharedIncomeEligibilityMutation: { isPending: false },
    pauseReopenReminderMutation: { mutate: forbidden }, updateOpeningEntryMutation: { mutate: forbidden },
    isReminderCancellationPending: false, smartOpeningPriceIsIncomplete: false, gridReferencePrice: null, estimatedFeeUsdt: 1.25,
    quantityFormatError: null, optionFormValidationMessage: null, gridFormValidationMessage: null, isTakeProfitAvailable: true,
    profitShareRules: [{ relatedFundId: 3 }], isPendingFillConfirmationQueued: false,
    saveEntryCommitLockRef: { current: false }, closeCommitRequestIdRef: { current: null }, openingCommitRequestIdRef: { current: null }, openingCommitRequestFingerprintRef: { current: null },
    crypto: { randomUUID: vi.fn(() => "manual-test-request-id") }, markPrice: 2520, useMemo: (factory: () => unknown) => factory(),
    useRef: (current: unknown) => ({ current }), require: forbidden,
  });
  const setters: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const field of Object.keys(state) as Array<keyof typeof state>) {
    const setter = vi.fn((next: any) => { const value = typeof next === "function" ? next(state[field]) : next; (state as any)[field] = value; sandbox[field] = value; });
    setters[field] = setter; sandbox[`set${field[0].toUpperCase()}${field.slice(1)}`] = setter;
  }
  sandbox.setSharedIncomePreviewMarkPrice = vi.fn();
  script([declarations("../client/src/pages/T0Journal.tsx", pureNames), `const T0_SHARED_ALLOCATION_METRICS = ${JSON.stringify(T0_SHARED_ALLOCATION_METRICS)};`, `const t0Toast = ${initializer("t0Toast").getText(page)};`, `globalThis.sharedIncomePlanDraftSnapshotRef = (${initializer("sharedIncomePlanDraftSnapshotRef").getText(page)});`, `globalThis.handleSaveEntry = (${save.getText(page)});`, `globalThis.updateSharedIncomeDraftsByUser = (${initializer("updateSharedIncomeDraftsByUser").getText(page)});`].join("\n")).runInContext(sandbox, { timeout: 2000 });
  const deriveState = () => deriveScript.runInContext(sandbox, { timeout: 2000 });
  const render = (patch: Record<string, unknown> = {}) => { Object.assign(sandbox, patch); deriveState(); effectScript.runInContext(sandbox, { timeout: 2000 }); deriveState(); };
  const run = (code: string) => script(code).runInContext(sandbox, { timeout: 2000 });
  const compact = (id = "4") => {
    deriveState(); sandbox.candidate = sandbox.sharedIncomeClosePreview.candidates.find((row: any) => row.userId === id);
    sandbox.input = { drafts: state.sharedIncomeDrafts, allocatedTotal: sandbox.sharedIncomeAllocatedTotal, setDrafts: sandbox.updateSharedIncomeDraftsByUser, setTargetSelections: setters.sharedIncomeTargetSelections };
    sandbox.allocationLimit = sandbox.sharedIncomeBudget.allocationLimit;
    sandbox.enabledCandidates = sandbox.sharedIncomeClosePreview.candidates.filter((row: any) => row.sharedIncomeEnabled);
    for (const name of ["updateCompactDraft", "getCompactDraftAdjustment", "adjustCompactDraftByAllocationStep"]) run(`globalThis.${name} = (${initializer(name, renderCandidates).getText(page)});`);
  };
  const edit = (kind: "plus" | "minus" | "input" | "clear", value?: string, id = "4") => {
    compact(id);
    if (kind === "plus" || kind === "minus") run(`adjustCompactDraftByAllocationStep(candidate, ${kind === "plus" ? 1 : -1});`);
    else { sandbox.event = { target: { value: kind === "clear" ? "" : value } }; run(`(${attr(compactInput, "onChange").getText(page)})(event);`); }
    deriveState();
  };
  const disabled = () => run(`(${attr(review, "disabled").getText(page)});`);
  const invoke = () => run(`(${attr(review, "onClick").getText(page)})();`);
  render();
  return { state, sandbox, setters, query, mutate, forbidden, render, run, edit, disabled, invoke };
}

describe("T0 automatic recommendation -> user adjustment -> renewed signed final save (complete production handler)", () => {
  it.each(["plus", "minus", "input", "clear"] as const)("real %s callback marks explicit adjustment, clears error, survives changed background recommendation and saves final amounts once", kind => {
    const h = frontend();
    expect(h.state.sharedIncomeManuallyAdjusted).toBe(false);
    expect(h.state.sharedIncomeDrafts).toEqual({ "4": "2.00", "5": "3.00" });
    h.sandbox.setCloseSaveError("previous mismatch");
    h.edit(kind, "1.99");
    expect(h.state.sharedIncomeManuallyAdjusted).toBe(true);
    expect(h.state.closeSaveError).toBeNull();
    const expectedDrafts = kind === "plus" ? { "4": "2.05", "5": "2.95" } : kind === "minus" ? { "4": "1.95", "5": "3.00" } : kind === "input" ? { "4": "1.99", "5": "3.00" } : { "5": "3.00" };
    expect(h.state.sharedIncomeDrafts).toEqual(expectedDrafts);
    const final = structuredClone(h.sandbox.sharedIncomeSaveAllocations);
    const draftIdentity = h.state.sharedIncomeDrafts;
    h.setters.sharedIncomeDrafts.mockClear();
    h.query.isFetching = true; h.render();
    expect(h.disabled()).toBe(true);
    h.invoke(); expect(h.mutate).not.toHaveBeenCalled();
    h.query.isFetching = false; h.query.data = response({ planToken: "renewed-current-token", allocations: [{ recipientUserId: 4, amount: "1.00" }, { recipientUserId: 5, amount: "4.00" }] }); h.render();
    expect(h.state.sharedIncomeDrafts).toBe(draftIdentity);
    expect(h.setters.sharedIncomeDrafts).not.toHaveBeenCalled();
    expect(h.state.sharedIncomeManuallyAdjusted).toBe(true);
    expect(h.disabled()).toBe(false);
    h.invoke(); h.invoke();
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate.mock.calls[0][0]).toMatchObject({ ledgerId: 52, action: "closeShort", quantity: "10.00", price: "2520", targetOpeningEntryId: 101, sharedIncomePlanToken: "renewed-current-token", sharedIncomeMetrics: ["principal"], sharedIncomeBudgetMode: "amount", sharedIncomeBudgetValue: "5.00", sharedIncomeManualAdjustment: true, sharedIncomeAllocations: final });
    expect(h.forbidden).not.toHaveBeenCalled();
    expect(h.state.trades).toHaveLength(1);
  });
  it("typing empty uses the same real wrapper and can retain the entire budget without dropping token or flag", () => {
    const h = frontend(); h.edit("input", ""); h.edit("input", "", "5");
    expect(h.state.sharedIncomeDrafts).toEqual({});
    expect(h.state.sharedIncomeManuallyAdjusted).toBe(true);
    h.query.data = response({ planToken: "empty-final-renewal" }); h.render(); h.invoke();
    expect(h.mutate).toHaveBeenCalledOnce();
    const payload = h.mutate.mock.calls[0][0];
    expect(payload.sharedIncomeAllocations).toBeUndefined();
    expect(payload.sharedIncomePlanToken).toBe("empty-final-renewal");
    expect(payload.sharedIncomeManualAdjustment).toBe(true);
  });
  it.each([
    ["scheme", { sharedIncomeAllocationMetrics: ["sharedContribution"] }],
    ["budget", { sharedIncomeAllocationBudgetValue: "4.00" }],
    ["budgetMode", { sharedIncomeAllocationBudgetMode: "percentage" }],
    ["source", { source: "102" }],
  ])("changing %s regenerates drafts and resets manual flag false", (_name, patch) => {
    const h = frontend(); h.edit("minus"); expect(h.state.sharedIncomeManuallyAdjusted).toBe(true);
    if ("source" in patch) { h.sandbox.entryForm = { ...h.sandbox.entryForm, targetOpeningEntryId: patch.source }; h.sandbox.rawJournalTrades = [{ ...h.sandbox.rawJournalTrades[0], id: patch.source }]; }
    h.query.data = undefined; h.query.isFetching = true; h.render(patch);
    expect(h.state.sharedIncomeManuallyAdjusted).toBe(false);
    expect(h.state.sharedIncomeDrafts).toEqual({});
    h.query.data = response({ allocations: [{ recipientUserId: 4, amount: "1.00" }, { recipientUserId: 5, amount: "3.00" }] }); h.query.isFetching = false; h.render();
    expect(h.state.sharedIncomeDrafts).toEqual({ "4": "1.00", "5": "3.00" });
    expect(h.state.sharedIncomeManuallyAdjusted).toBe(false);
  });
  it("same-key unmarked mutation is still rejected by the complete handler after token renewal", () => {
    const h = frontend(); h.sandbox.setSharedIncomeDrafts({ "4": "1.99", "5": "3.00" });
    h.query.data = response({ planToken: "strict-renewal" }); h.render();
    expect(h.state.sharedIncomeManuallyAdjusted).toBe(false);
    h.invoke();
    expect(h.mutate).not.toHaveBeenCalled();
    expect(h.state.closeSaveError).toBe("分配清单未同步，请重新生成建议后再确认");
    expect(h.state.trades).toEqual([]);
  });
  it("adjusted overbudget remains disabled by the real review button expression", () => {
    const h = frontend(); h.edit("input", "5.01");
    expect(h.state.sharedIncomeManuallyAdjusted).toBe(true);
    expect(h.disabled()).toBe(true);
    // A disabled DOM button dispatches no click. Evaluate its production guard;
    // backend fresh verification is separately executed above, not invented here.
    expect(h.mutate).not.toHaveBeenCalled();
    expect(h.state.trades).toEqual([]);
  });
  it("unavailable formal plan cannot be edited or marked; manual mode does not manufacture adjustment", () => {
    const h = frontend(); const original = h.state.sharedIncomeDrafts;
    h.query.isFetching = true; h.render(); h.run('updateSharedIncomeDraftsByUser({"4":"1.00"});');
    expect(h.state.sharedIncomeDrafts).toBe(original);
    expect(h.state.sharedIncomeManuallyAdjusted).toBe(false);
    h.render({ sharedIncomeAllocationMetrics: [] }); h.run('updateSharedIncomeDraftsByUser({"4":"1.00"});');
    expect(h.state.sharedIncomeDrafts).toEqual({ "4": "1.00" });
    expect(h.state.sharedIncomeManuallyAdjusted).toBe(false);
    expect(h.sandbox.sharedIncomePlanDraftSnapshotRef.current).toBeNull();
  });
  it("disabled and no-principal candidates are never included in final allocations or total", () => {
    const h = frontend();
    h.query.data = response({ candidates: [candidate("4", { sharedIncomeEnabled: false }), candidate("5", { hasPrincipal: false }), candidate("6")] }); h.render();
    h.run('updateSharedIncomeDraftsByUser({"4":"999.00","5":"999.00","6":"1.00"});'); h.render();
    expect(h.sandbox.sharedIncomeSaveAllocations).toEqual([{ recipientUserId: 6, amount: "1.00" }]);
    expect(h.sandbox.sharedIncomeAllocatedTotal).toBe(1);
  });
  it("the closing UI supplies the real wrapper, state defaults false, and callbacks cannot use a raw setter", () => {
    const state = required(nodes(page, ts.isVariableDeclaration).find(node => ts.isArrayBindingPattern(node.name) && node.name.elements.some(element => element.name?.getText(page) === "sharedIncomeManuallyAdjusted")), "manual adjustment useState");
    expect(state.initializer?.getText(page)).toBe("useState(false)");
    const call = required(nodes(page, ts.isCallExpression).find(call => call.expression.getText(page) === "renderSharedIncomeAllocationCandidates" && call.arguments[0]?.getText(page).includes("drafts: sharedIncomeDrafts")), "closing cards call");
    expect(call.arguments[0].getText(page)).toContain("setDrafts: updateSharedIncomeDraftsByUser");
    expect(effect.arguments[1].getText(page)).toContain("sharedIncomeManuallyAdjusted");
    expect(initializer("updateSharedIncomeDraftsByUser").getText(page)).toContain("if (sharedIncomeServerPlanUnavailable) return");
  });
});
