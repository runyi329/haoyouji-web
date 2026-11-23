import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// 只读生产 TSX，通过 AST 抽取真实纯函数、memo、快捷回调和完整保存函数。
// 不 runtime import 页面/server/router/DB，不启动应用，不发送请求，不执行任何业务 mutation。
const source = readFileSync(new URL("../client/src/pages/T0Journal.tsx", import.meta.url), "utf8");
const page = ts.createSourceFile("T0Journal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return found;
}
function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Missing production AST: ${name}`);
  return value;
}
const variableCache = new WeakMap<ts.Node, Map<string, ts.VariableDeclaration>>();
function variable(name: string, root: ts.Node = page) {
  const cached = variableCache.get(root)?.get(name);
  if (cached) return cached;
  let matches = nodes(root, ts.isVariableDeclaration).filter(node => node.name.getText(page) === name);
  if (root === page && matches.length > 1) matches = matches.filter(node => node.initializer && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(page) === "useMemo");
  if (matches.length !== 1) throw new Error(`Expected one actual ${name}, got ${matches.length}`);
  const cache = variableCache.get(root) ?? new Map<string, ts.VariableDeclaration>();
  cache.set(name, matches[0]); variableCache.set(root, cache);
  return matches[0];
}
function declaration(name: string) {
  return required(page.statements.find(node =>
    (ts.isFunctionDeclaration(node) && node.name?.text === name)
    || (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(page) === name))), name)
    .getText(page).replace(/^export\s+/, "");
}
function binding(name: string) { return `const ${variable(name).getText(page)};`; }
const compiledScripts = new Map<string, Script>();
function compile(text: string) {
  const cached = compiledScripts.get(text);
  if (cached) return cached;
  const ast = ts.createSourceFile("position-context-isolated.ts", text, ts.ScriptTarget.Latest, true);
  if (nodes(ast, ts.isImportDeclaration).length || nodes(ast, ts.isExportDeclaration).length
    || nodes(ast, ts.isCallExpression).some(call => call.expression.kind === ts.SyntaxKind.ImportKeyword
      || call.expression.getText(ast) === "require")) throw new Error("Runtime imports forbidden");
  const output = ts.transpileModule(text, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None, alwaysStrict: true,
  } }).outputText;
  if (/\brequire\s*\(|\bimport\s*(?:\(|[\"'{*])/.test(output)) throw new Error("Compiled runtime imports forbidden");
  const script = new Script(output, { filename: "actual-t0-beneficiary-position.vm.js" });
  compiledScripts.set(text, script);
  return script;
}
const pureNames = [
  "ACTIONS", "POSITION_ARCHIVE_STEP", "ETH_QUANTITY_PATTERN", "numberFormatter", "OKX_VIP2_TAKER_FEE_RATE",
  "T0_REFERRAL_DESCENDANTS_TOKEN_PREFIX", "getT0ReferralDescendantsRootUserId", "resolveT0RelatedUserFilter",
  "matchesT0ExecutionFilter", "normalizeEthQuantity", "normalizeT0PriceForSubmission", "priceKey",
  "archivePriceForSide", "archivePriceForTrade", "getT0StoredClosingTargetPrice", "getTradeProfitShareRate",
  "getTradeFinancialQuantity", "getTradeActivityTime", "getStoredEntryId", "getDetailEntryId", "getStoredAction",
  "getStoredOptionDirection", "getStoredGridDirection", "compareT0PositionRecordedOrder", "invertTradeAction",
  "invertOptionDirection", "invertGridDirection", "asAdminCounterpartyTrade", "projectAdminCounterpartyTrades",
  "buildOpeningClosingAllocations", "buildVisiblePositionClosingAllocations", "getVisiblePositionRemainingQuantity",
  "buildPositionBuckets", "buildPositionDisplayBuckets", "buildIntegratedDisplayBuckets", "filterTradesByInstrumentTypes",
  "formatQuantity", "formatPrice", "formatOptionQuote", "calculateEstimatedUnrealizedNetPnl", "calculateOptionExpiryCloseDetail",
  "buildLinkedClosingDetail", "applyTriggeredTakeProfitHistoryDetails", "buildRecentJournalTradeDetailsByScope",
  "buildRecentJournalTradeDetails", "getRegularDistributableNetPnl", "buildClosingProfitShareDistribution",
  "getOpeningProfitShareSnapshotAllocations", "projectMemberProfitShareTrades", "attachSharedIncomePerspectiveTrades",
  "calculateSummary", "resolveLadderLivePriceMarker", "applyLadderLivePriceMarker",
];
const pureSource = pureNames.map(declaration).join("\n");
const pure = compile(`${pureSource}\n({${pureNames.join(",")}});`).runInContext(createContext({}), { timeout: 2000 }) as Record<string, any>;
function execute<T = any>(text: string, dependencies: Record<string, unknown>, result: string): T {
  const forbidden = () => { throw new Error("Forbidden runtime import/request"); };
  return compile(`${text}\n(${result});`).runInContext(createContext({
    ...pure, useMemo: (factory: () => unknown) => factory(), useCallback: (callback: unknown) => callback,
    require: forbidden, fetch: forbidden, ...dependencies,
  }, { codeGeneration: { strings: false, wasm: false } }), { timeout: 2000 }) as T;
}

type Trade = Record<string, any> & { id: string; action: string; quantity: number; price: number; createdAt: string };
type Allocation = { trade: Trade; quantity: number };
// 来源：/tmp/20261123-t0-close100-db-review/{raw-order-scope,order-links}.json。
// 仅取真实525/895与五条shares；不纳入其余317行、SQL、账户名、用户名、备注或幂等键。
// 用户ID双射脱敏：Hu=101，新受益人=201/202/203；截图A166对应真实source525。
const HU = "101";
const NEW_BENEFICIARIES = ["201", "202", "203"];
const raw: Trade[] = Object.freeze([
  Object.freeze({ id: "525", accountId: "6", relatedUserId: HU, relatedFundId: "2", symbol: "ETH",
    action: "openShort", instrumentType: "contract", quantity: 100, price: 1900, fee: 68.4,
    targetPrice: 1900, createdAt: "2026-10-29T15:27:46.378Z", recordedAt: "2026-10-29T15:27:46.378Z" }),
  Object.freeze({ id: "895", accountId: "6", relatedUserId: HU, relatedFundId: "2", symbol: "ETH",
    action: "closeShort", quantity: 90, price: 1812.43, fee: 58.722732, targetPrice: 1900,
    targetOpeningEntryId: "525", createdAt: "2026-11-17T19:34:56.262Z", recordedAt: "2026-11-17T19:34:56.262Z" }),
]) as unknown as Trade[];
const snapshots = Object.freeze([
  Object.freeze({ entryId: "895", openingEntryId: "525", sourceUserId: 101, beneficiaryUserId: 101,
    percentage: 100, matchedQuantity: 90, relatedFundId: 2, beneficiaryUserName: "Hu" }),
  ...[101, 201, 202, 203].map((id, index) => Object.freeze({ entryId: "525", openingEntryId: "525",
    sourceUserId: 101, beneficiaryUserId: id, percentage: index === 0 ? 97 : 1,
    matchedQuantity: 10, relatedFundId: 2, beneficiaryUserName: index === 0 ? "Hu" : `新受益人${index}` })),
]);
const frozenEvidence = JSON.stringify({ raw, snapshots });
const selectionNames = ["executionScopedTrades", "lockVisibilityScopedTrades", "instrumentScopedTrades",
  "topRelatedUserFilter", "topProfitShareBeneficiaryEntryIds", "matchesCurrentTopScope", "selectedTrades", "selectedFilledTrades"];
const positionNames = ["positionContextFilledTrades", "positionContextOpeningClosingAllocations",
  "ladderOpeningClosingAllocations", "displayIncomeOpeningClosingAllocations", "selectedPositionTrades",
  "buckets", "totalPositionBuckets", "integratedDisplayBuckets", "selectedFilledRecentJournalDetails", "summary"];
const entryNames = ["entryScopedTrades", "openingClosingAllocations", "entryScopedBuckets", "entryScopedFilledTrades",
  "entryScopedRecentJournalDetails", "entryScopedSummary", "entryIncomeOpeningClosingAllocations"];
function visibleScenario(userIds: string[] = [], types: string[] = [], mode = "ordinary", trades: Trade[] = raw) {
  const globals = { trades, rawJournalTrades: trades, profitShareSnapshots: snapshots, isMemberView: false,
    relatedUserFilterIds: userIds, selectedAccountIds: ["6"], relatedFundFilterIds: ["2"],
    referralDescendantsByRootUserId: new Map(), referralDataLoaded: true, executionFilter: "all",
    shouldHideLockedForDisplay: false, instrumentTypeFilterIds: types, markPrice: 1800,
    integratedArchiveStep: mode === "wide" ? 25 : 10 };
  const selected = execute(selectionNames.map(binding).join("\n"), globals, `({${selectionNames.join(",")}})`);
  const positions = execute(positionNames.map(binding).join("\n"), { ...globals, ...selected }, `({${positionNames.join(",")}})`);
  const sourceOpening = selected.selectedTrades.find((trade: Trade) => pure.getStoredEntryId(trade) === "525");
  const entryForm = { action: "closeShort", targetPrice: 1900 };
  const entry = execute(entryNames.map(binding).join("\n"), { ...globals, ...selected, ...positions, entryForm,
    entrySide: "short", entryArchiveStep: mode === "wide" ? 25 : 10,
    isIndividualQuoteDetail: mode === "individual", closingSourceTrade: sourceOpening }, `({${entryNames.join(",")}})`);
  return { ...globals, ...selected, ...positions, ...entry, entryForm, closingSourceTrade: sourceOpening };
}
function storedIds(trades: Trade[]) { return trades.map(trade => pure.getStoredEntryId(trade)); }
const cardRoot = required(variable("renderOpenedTradeRow").initializer, "actual opening card");
const cardBindings = ["trade", "linkedClosings", "linkedClosedQuantity", "remainingQuantity", "historicalOpeningQuantity"]
  .map(name => `const ${variable(name, cardRoot).getText(page)};`).join("\n");
function actualCard(scenario: ReturnType<typeof visibleScenario>) {
  return execute(cardBindings, { ...scenario, row: { kind: "active", trade: scenario.closingSourceTrade } },
    "({original: historicalOpeningQuantity, closed: linkedClosedQuantity, remaining: remainingQuantity, source: getStoredEntryId(trade)})");
}
const quickInitializer = required(variable("openQuickCloseSheet").initializer, "actual quickclose");
const percentageButton = required(nodes(page, ts.isJsxElement).find(node =>
  node.openingElement.tagName.getText(page) === "button"
  && node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
    && attribute.name.getText(page) === "aria-label" && attribute.getText(page).includes("平仓可用数量的"))), "actual percentage button");
function attribute(node: ts.JsxElement, name: string) {
  const initializer = required(node.openingElement.attributes.properties.find((prop): prop is ts.JsxAttribute =>
    ts.isJsxAttribute(prop) && prop.name.getText(page) === name)?.initializer, name);
  if (!ts.isJsxExpression(initializer)) throw new Error(`Expected JSX expression ${name}`);
  return required(initializer.expression, `${name} expression`).getText(page);
}
let percentageRoot: ts.Node | undefined = percentageButton.parent;
while (percentageRoot && !(ts.isArrowFunction(percentageRoot) && percentageRoot.parameters.some(parameter => parameter.name.getText(page) === "percentage"))) {
  percentageRoot = percentageRoot.parent;
}
const percentageAmount = variable("amount", required(percentageRoot, "actual percentage map"));
function quickClose(scenario: ReturnType<typeof visibleScenario>) {
  let form: Record<string, any> = {};
  let selectedSource: Trade | null = null;
  const setEntryForm = vi.fn((next: any) => { form = typeof next === "function" ? next(form) : next; });
  const setter = vi.fn();
  const globals = { ...scenario, accounts: [], showEntrySheet: false, adminLadderDisplayMode: "individual",
    entrySheetLadderDisplayModeRef: { current: "individual" }, setEntryForm, setClosingSourceTrade: (trade: Trade) => { selectedSource = trade; },
    setRelatedUserQuickPickerOpen: setter, setRelatedUserPickerOpen: setter, setRelatedUserSearch: setter,
    setEntrySide: setter, setCloseConfirmationStep: setter, setEditingOriginalTrade: setter, setShowEntrySheet: setter,
    t0Toast: { error: vi.fn() } };
  execute(`${binding("getTradeAccountName")}\nconst quick = ${quickInitializer.getText(page)};`, globals,
    "quick(closingSourceTrade)");
  const available = execute(binding("closingAvailableQuantity"), { ...scenario, entryForm: form,
    closingSourceTrade: selectedSource, isClosingEntry: true }, "closingAvailableQuantity");
  execute(`const ${percentageAmount.getText(page)}; const click = ${attribute(percentageButton, "onClick")};`,
    { ...scenario, entryForm: form, percentage: 100, closingAvailableQuantity: available, setEntryForm }, "click()");
  return { form, selectedSource, available, setEntryForm };
}

const saveInitializer = required(variable("handleSaveEntry").initializer, "complete actual handleSaveEntry");
const saveSource = ["closingStoredSourceTrade", "closingStoredAction", "closingStoredTargetPrice"].map(binding).join("\n")
  + `\nconst t0Toast = ${required(variable("t0Toast").initializer, "production noop toast").getText(page)};`
  + `\nconst handleSaveEntry = ${saveInitializer.getText(page)};\n({handleSaveEntry, storedAction: closingStoredAction, target: closingStoredTargetPrice});`;
const saveScript = compile(saveSource);
function saveHarness(quantity: string, scenario: ReturnType<typeof visibleScenario>, rawTrades: Trade[] = raw,
  extraForm: Record<string, unknown> = {}, extraGlobals: Record<string, unknown> = {}) {
  const state = { closeConfirmationStep: "input", closeSaveError: null as string | null, openingSaveError: null as string | null };
  const mutate = vi.fn(() => { throw new Error("Business mutation forbidden in position regression"); });
  const setCloseConfirmationStep = vi.fn((next: string) => { state.closeConfirmationStep = next; });
  const setSharedIncomePreviewMarkPrice = vi.fn();
  const globals = { ...pure, ...scenario, rawJournalTrades: rawTrades,
    entryForm: { action: "closeShort", accountId: "6", accountName: "脱敏账户", relatedUserId: HU,
      relatedFundId: "2", relatedFundName: "", quantity, price: "1800", targetPrice: 1900,
      targetOpeningEntryId: "525", editingEntryId: "", isTakeProfit: false, note: "",
      optionPremium: "", gridRangeMin: "", gridRangeMax: "", gridLeverage: "", gridCount: "", ...extraForm },
    useMemo: (factory: () => unknown) => factory(), closeConfirmationStep: "input",
    isCloseDistributionPreviewLink: false, sharedIncomeServerPlanActive: false, sharedIncomeServerPlanUnavailable: false,
    sharedIncomeServerPlan: null, sharedIncomeManuallyAdjusted: false, sharedIncomeAllocationMetrics: [],
    sharedIncomeSaveAllocations: [], sharedIncomeAnnualizedRuleUnavailable: false, sharedIncomeAllocationPlanError: null,
    isReminderCancellationPending: false, smartOpeningPriceIsIncomplete: false, gridReferencePrice: null,
    estimatedFeeUsdt: 0, quantityFormatError: null, optionFormValidationMessage: null, gridFormValidationMessage: null,
    setCloseSaveError: (next: string | null) => { state.closeSaveError = next; },
    setOpeningSaveError: (next: string | null) => { state.openingSaveError = next; },
    closeCommitRequestIdRef: { current: "must-reset-on-review" }, saveEntryCommitLockRef: { current: false },
    setCloseConfirmationStep, setSharedIncomePreviewMarkPrice,
    saveEntryMutation: { mutate }, pauseReopenReminderMutation: { mutate }, updateOpeningEntryMutation: { mutate },
    setTrades: vi.fn(() => { throw new Error("Optimistic business row forbidden"); }),
    require: () => { throw new Error("Runtime import forbidden"); },
    ...extraGlobals };
  const context = createContext(globals, { codeGeneration: { strings: false, wasm: false } });
  const production = saveScript.runInContext(context, { timeout: 2000 });
  context.observed = production;
  const invoke = () => new Script("observed.handleSaveEntry();").runInContext(context, { timeout: 2000 });
  return { state, globals, production, mutate, invoke, setCloseConfirmationStep, setSharedIncomePreviewMarkPrice };
}

const userCases = [
  ["Hu", [HU], true], ["新受益人1", ["201"], false], ["新受益人2", ["202"], false],
  ["新受益人3", ["203"], false], ["三位新受益人多选", NEW_BENEFICIARIES, false],
  ["Hu与新受益人多选", [HU, "201"], true], ["四人全选", [HU, ...NEW_BENEFICIARIES], true],
  ["用户全部", [], true],
] as const;
const matrix = userCases.flatMap(([label, users, seesClosing]) => [[], ["contract"]].flatMap(types =>
  ["ordinary", "individual", "wide"].map(mode => ({ label, users: [...users], seesClosing, types, mode }))));

describe("T0 后加受益人仓位context：脱敏525→895真实证据与实际memo/回调", () => {
  it.each(matrix)("$label / 类型$types / $mode：A166原100已平90剩10，汇总及快捷均10，不增加收益流水", ({ users, seesClosing, types, mode }) => {
    const scenario = visibleScenario(users, types, mode);
    expect(storedIds(scenario.selectedTrades)).toEqual(seesClosing ? ["525", "895"] : ["525"]);
    expect(storedIds(scenario.selectedFilledTrades)).toEqual(storedIds(scenario.selectedTrades));
    expect(scenario.positionContextFilledTrades).toHaveLength(2);
    expect(scenario.ladderOpeningClosingAllocations.get(scenario.closingSourceTrade.id)).toMatchObject([
      { quantity: 90, trade: { id: "895", targetOpeningEntryId: "525" } },
    ]);
    expect(actualCard(scenario)).toEqual({ original: 100, closed: 90, remaining: 10, source: "525" });
    expect(scenario.summary.short.quantity).toBe(10);
    expect(scenario.entryScopedSummary.short.quantity).toBe(10);
    expect(scenario.totalPositionBuckets[0].remainingQuantity).toBe(10);
    expect(scenario.integratedDisplayBuckets[0].remainingQuantity).toBe(10);
    expect(scenario.buckets[0]).toMatchObject({ costBasis: 19000, financialQuantity: 10, financialCostBasis: 19000 });
    expect(scenario.buckets[0].openingFeeBasis).toBeCloseTo(6.84, 10);
    // 新数量桶只覆盖remaining字段；收益可见流水的已实现字段逐项保持旧桶结果。
    const before = pure.buildPositionBuckets(scenario.selectedFilledTrades)[0];
    for (const field of ["realizedGrossPnl", "realizedOpeningFee", "realizedClosingFee", "realizedPnl", "closedQuantity", "closedCostBasis", "closedNotional"]) {
      expect(scenario.buckets[0][field]).toBe(before[field]);
    }
    expect(scenario.summary.realized).toBeCloseTo(seesClosing ? 7761.017268 : 0, 8);
    expect(scenario.entryScopedFilledTrades.filter((trade: Trade) => !pure.ACTIONS[trade.action].opening)).toHaveLength(seesClosing ? 1 : 0);
    if (!seesClosing) {
      expect(scenario.displayIncomeOpeningClosingAllocations.get(scenario.closingSourceTrade.id) ?? []).toEqual([]);
      expect(scenario.entryIncomeOpeningClosingAllocations.get(scenario.closingSourceTrade.id) ?? []).toEqual([]);
      expect(scenario.entryScopedRecentJournalDetails.size).toBe(1);
      expect(scenario.entryScopedSummary.realized).toBe(0);
      expect(before.remainingQuantity).toBe(100); // 旧受益人筛选缺895的负对照。
    }
    const quick = quickClose(scenario);
    expect(quick.available).toBe(10);
    expect(quick.form).toMatchObject({ quantity: "10.00", action: "closeShort", targetPrice: 1900,
      targetOpeningEntryId: "525", accountId: "6", relatedUserId: HU, relatedFundId: "2" });
    expect(quick.selectedSource).toBe(scenario.closingSourceTrade);
    expect(quick.setEntryForm).toHaveBeenCalledTimes(2); // 真实quick预填 + 真实100%回调。
    const invalid = saveHarness("100", scenario);
    invalid.invoke();
    expect(invalid.mutate).not.toHaveBeenCalled();
    expect(invalid.globals.setTrades).not.toHaveBeenCalled();
    expect(invalid.state.closeSaveError).toMatch(/最多可平 10\.00 ETH/);
    expect(invalid.state.closeConfirmationStep).toBe("input");
    const valid = saveHarness("10.00", scenario);
    valid.invoke();
    expect(valid.state.closeConfirmationStep).toBe("review");
    expect(valid.state.closeSaveError).toBeNull();
    expect(valid.setCloseConfirmationStep).toHaveBeenCalledWith("review");
    expect(valid.setSharedIncomePreviewMarkPrice).toHaveBeenCalledWith(1800);
    expect(valid.mutate).not.toHaveBeenCalled();
    expect(valid.globals.setTrades).not.toHaveBeenCalled();
    expect(valid.globals.saveEntryCommitLockRef.current).toBe(false);
    expect(JSON.stringify({ raw, snapshots })).toBe(frozenEvidence);
  });

  it("实际逐笔梯形row的source525保留original100、closed90、remaining10，而非只测纯helper", () => {
    const scenario = visibleScenario(["201"]);
    const rows = execute(binding("individualPriceRows"), { ...scenario, individualMarkLadderPrice: 1900,
      individualLiveReferenceBand: null, lastMarkPriceMovement: null, visibleReopenReminders: [] }, "individualPriceRows");
    const row = rows.find((item: any) => pure.getStoredEntryId(item.shortOpeningTrade ?? { id: "" }) === "525");
    expect(row.short).toMatchObject({ originalQuantity: 100, closedQuantity: 90, remainingQuantity: 10,
      costBasis: 19000, financialQuantity: 10, financialCostBasis: 19000 });
  });

  it("895冻结Hu100%历史正收益保持7761.017268；后来三位受益人历史895得0，不读525当前97/1/1/1重分", () => {
    const detail = pure.buildLinkedClosingDetail(raw[0], { trade: raw[1], quantity: 90 });
    expect(detail.netPnl).toBeCloseTo(7761.017268, 8);
    const distribution = pure.buildClosingProfitShareDistribution({ trades: raw, snapshots,
      closing: raw[1], displayedNetPnl: detail.netPnl });
    expect(distribution).toHaveLength(1);
    expect(distribution[0]).toMatchObject({ beneficiaryUserId: 101, percentageLabel: "100.00%" });
    expect(distribution[0].netPnl).toBeCloseTo(7761.017268, 8);
    for (const user of [HU, ...NEW_BENEFICIARIES]) {
      const scenario = visibleScenario([user]);
      const history = execute(binding("historyPerspectiveTrades"), { ...scenario,
        historyPerspectiveTargetUserId: Number(user), historyUsesIncomeCategories: true,
        isHistoryUserPerspective: false, sharedIncomeSourceClosings: [], sharedIncomeTransfers: [], activeJournalData: {} }, "historyPerspectiveTrades");
      const closings = history.filter((trade: Trade) => pure.getStoredEntryId(trade) === "895");
      expect(closings).toHaveLength(user === HU ? 1 : 0);
      const summary = pure.calculateSummary(pure.buildPositionBuckets(history), 1800, history);
      expect(summary.realized).toBeCloseTo(user === HU ? 7761.017268 : 0, 8);
    }
    expect(pure.getOpeningProfitShareSnapshotAllocations(snapshots, "525").map((item: any) => item.percentage)).toEqual([97, 1, 1, 1]);
    expect(JSON.stringify({ raw, snapshots })).toBe(frozenEvidence);
  });
});

describe("T0 可见仓位纯函数契约和最小旧保护", () => {
  it.each([false, true])("期权financial基础保护：mixed=%s，仅合约剩余计入普通ETH浮盈", mixed => {
    const option = { ...raw[0], id: "option-source", instrumentType: "option", quantity: 10, fee: 2 };
    const contract = { ...raw[0], id: "contract-source", quantity: 5, fee: 1 };
    const trades = mixed ? [option, contract] : [option];
    const map = pure.buildVisiblePositionClosingAllocations(trades, trades, new Map());
    const bucket = pure.buildPositionDisplayBuckets(trades, map)[0];
    expect(bucket.remainingQuantity).toBe(mixed ? 15 : 10);
    expect(bucket.financialQuantity).toBe(mixed ? 5 : 0);
    expect(bucket.financialCostBasis).toBe(mixed ? 9500 : 0);
    expect(bucket.realizedPnl).toBe(0);
  });

  it("成员完整权限raw数量context扣旧90，但新受益人的历史投影依旧只有525且旧收益0", () => {
    const memberTrades = pure.projectMemberProfitShareTrades(raw, snapshots, "201");
    expect(storedIds(memberTrades)).toEqual(["525"]);
    const contextTrades = execute(binding("positionContextFilledTrades"), { trades: memberTrades,
      rawJournalTrades: raw, isMemberView: true }, "positionContextFilledTrades");
    expect(contextTrades).toEqual(raw);
    const map = pure.buildVisiblePositionClosingAllocations(memberTrades, contextTrades, pure.buildOpeningClosingAllocations(contextTrades));
    const bucket = pure.buildPositionDisplayBuckets(memberTrades, map)[0];
    expect(bucket.remainingQuantity).toBe(10);
    expect(bucket.financialQuantity).toBeCloseTo(0.1, 10);
    expect(bucket.realizedPnl).toBe(0);
    expect(pure.calculateSummary([bucket], 1800, memberTrades).realized).toBe(0);
  });

  it("实际参数类型契约：visible数组、完整filled数组、Map；完整alloc keyed by canonical、输出key为visible id且包含空数组", () => {
    const helper = required(nodes(page, ts.isFunctionDeclaration).find(node => node.name?.text === "buildVisiblePositionClosingAllocations"), "helper");
    expect(helper.parameters.map(parameter => parameter.type?.getText(page))).toEqual([
      "PreviewTrade[]", "PreviewTrade[]", "Map<string, LinkedClosingAllocation[]>",
    ]);
    const visible = { ...raw[0], id: "beneficiary-525-525-201", sourceEntryId: "525", profitShareRate: 0.01, fee: 0.684 };
    const complete = pure.buildOpeningClosingAllocations(raw);
    const mapped = pure.buildVisiblePositionClosingAllocations([visible], raw, complete);
    expect([...mapped.keys()]).toEqual([visible.id]);
    expect(mapped.get(visible.id)).toMatchObject([{ quantity: 90, trade: { id: "895" } }]);
    expect(pure.getVisiblePositionRemainingQuantity(visible, mapped)).toBe(10);
    const buckets = pure.buildPositionDisplayBuckets([visible], mapped);
    expect(buckets[0]).toMatchObject({ remainingQuantity: 10, costBasis: 19000, financialQuantity: 0.1,
      financialCostBasis: 190, realizedGrossPnl: 0, realizedPnl: 0 });
    expect(buckets[0].openingFeeBasis).toBeCloseTo(0.0684, 10);
    const unclosed = pure.buildVisiblePositionClosingAllocations([visible], [raw[0]], new Map());
    expect(unclosed.has(visible.id)).toBe(true);
    expect(unclosed.get(visible.id)).toEqual([]);
    expect(pure.getVisiblePositionRemainingQuantity(visible, unclosed)).toBe(100);
  });

  it.each(["accountId", "relatedUserId", "relatedFundId", "action", "symbol", "price", "quantity"])("同stored525但异%s不输出；不得借其他开仓FIFO或伪装空数组", field => {
    const value = field === "price" ? 1910 : field === "quantity" ? 101 : field === "action" ? "openLong" : field === "symbol" ? "BTC" : "999";
    const visible = { ...raw[0], id: `visible-wrong-${field}`, sourceEntryId: "525", [field]: value };
    const allocations = pure.buildVisiblePositionClosingAllocations([visible], raw, pure.buildOpeningClosingAllocations(raw));
    expect(allocations.has(visible.id)).toBe(false);
    expect(pure.getVisiblePositionRemainingQuantity(visible, allocations)).toBe(0);
    expect(pure.buildPositionDisplayBuckets([visible], allocations)).toEqual([]);
  });

  it("source缺失即0；只保留可见源key，不泄露同档邻单分配；sourceEntryId别名仍正确匹配", () => {
    const visible = { ...raw[0], id: "visible-source-525", sourceEntryId: "525" };
    const neighbor = { ...raw[0], id: "526", quantity: 200 };
    const missing = pure.buildVisiblePositionClosingAllocations([visible], [neighbor, raw[1]], new Map());
    expect(missing.has(visible.id)).toBe(false);
    expect(pure.getVisiblePositionRemainingQuantity(visible, missing)).toBe(0);
    const complete = [raw[0], neighbor, raw[1]];
    const mapped = pure.buildVisiblePositionClosingAllocations([visible], complete, pure.buildOpeningClosingAllocations(complete));
    expect([...mapped.keys()]).toEqual([visible.id]);
    expect(mapped.get(visible.id)[0].quantity).toBe(90);
    expect(pure.getVisiblePositionRemainingQuantity(visible, mapped)).toBe(10);
  });

  it.each(["isPending", "isSyncing"])("%s开仓不作filled context；pending原qty、syncing0，临时平仓不扣减", flag => {
    const source = { ...raw[0], [flag]: true };
    const mapped = pure.buildVisiblePositionClosingAllocations([source], [source, raw[1]], pure.buildOpeningClosingAllocations(raw));
    expect(mapped.has(source.id)).toBe(false);
    expect(pure.getVisiblePositionRemainingQuantity(source, mapped)).toBe(flag === "isPending" ? 100 : 0);
    const scenario = visibleScenario(["201"], [], "ordinary", [raw[0], { ...raw[1], [flag]: true }]);
    expect(scenario.positionContextFilledTrades).toEqual([raw[0]]);
    expect(pure.getVisiblePositionRemainingQuantity(raw[0], scenario.ladderOpeningClosingAllocations)).toBe(100);
    expect(scenario.summary.short.quantity).toBe(100);
  });

  it("防御污染alloc：错scope、方向、archive、pending/syncing/非ETH/opening都不作历史平仓扣减", () => {
    const invalidClosings = [
      { ...raw[1], accountId: "999" }, { ...raw[1], relatedUserId: "999" }, { ...raw[1], relatedFundId: "999" },
      { ...raw[1], action: "closeLong" }, { ...raw[1], targetPrice: 1910 }, { ...raw[1], isPending: true },
      { ...raw[1], isSyncing: true }, { ...raw[1], symbol: "BTC" }, raw[0],
    ];
    const contaminated = new Map<string, Allocation[]>([["525", [...invalidClosings, raw[1]].map(trade => ({ trade, quantity: 90 }))]]);
    const map = pure.buildVisiblePositionClosingAllocations([raw[0]], raw, contaminated);
    expect(map.get("525")).toEqual([{ trade: raw[1], quantity: 90 }]);
    expect(pure.getVisiblePositionRemainingQuantity(raw[0], map)).toBe(10);
  });

  it("镜像小数价保护：同投影canonical匹配剩10；原始long2521不误匹配展示short2520，save仍取源long2530", () => {
    const opening = { ...raw[0], price: 2521, quantity: 100, action: "openLong", isCounterparty: true };
    const closing = { ...raw[1], action: "closeLong", targetPrice: 2530 };
    const projected = pure.projectAdminCounterpartyTrades([opening, closing]).map((trade: Trade) =>
      pure.ACTIONS[trade.action].opening ? trade : { ...trade, targetPrice: 2520 });
    const visible = { ...projected[0], id: "mirror-visible-525", sourceEntryId: "525" };
    const mapped = pure.buildVisiblePositionClosingAllocations([visible], projected, pure.buildOpeningClosingAllocations(projected));
    expect(pure.getVisiblePositionRemainingQuantity(visible, mapped)).toBe(10);
    expect(pure.buildVisiblePositionClosingAllocations([visible], [opening, closing], pure.buildOpeningClosingAllocations([opening, closing])).has(visible.id)).toBe(false);
    const stale = { ...visible, price: 2520 };
    expect(pure.buildVisiblePositionClosingAllocations([stale], projected, pure.buildOpeningClosingAllocations(projected)).has(stale.id)).toBe(false);
    const scenario = visibleScenario(["201"]);
    const h = saveHarness("10", scenario, [opening, closing], { targetPrice: 2520 }, { closingSourceTrade: visible });
    h.invoke();
    expect(h.production).toMatchObject({ storedAction: "closeLong", target: 2530 });
    expect(h.state.closeConfirmationStep).toBe("review");
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("原save具名源仍拒绝借同档邻单：100不允许、10进入review；缺源/异scope不允许", () => {
    const scenario = visibleScenario(["201"]);
    const neighbor = { ...raw[0], id: "526", quantity: 100 };
    const excessive = saveHarness("100", scenario, [...raw, neighbor]);
    excessive.invoke();
    expect(excessive.state.closeSaveError).toMatch(/该笔订单最多可平 10\.00 ETH/);
    expect(excessive.mutate).not.toHaveBeenCalled();
    for (const altered of [[neighbor, raw[1]], [{ ...raw[0], accountId: "999" }, neighbor, raw[1]]]) {
      const h = saveHarness("10", scenario, altered);
      h.invoke();
      expect(h.state.closeSaveError).toMatch(/所选开仓订单已变化/);
      expect(h.state.closeConfirmationStep).toBe("input");
      expect(h.mutate).not.toHaveBeenCalled();
    }
  });

  it("AST接线隔离：完整权限trades只供仓位，selected/entry收益memo与原始save guard不改，禁止runtime导入", () => {
    expect(variable("positionContextFilledTrades").initializer?.getText(page)).toContain("(isMemberView ? rawJournalTrades : trades).filter((trade) => !trade.isPending && !trade.isSyncing)");
    expect(variable("ladderOpeningClosingAllocations").initializer?.getText(page)).toContain("buildVisiblePositionClosingAllocations(selectedTrades, positionContextFilledTrades, positionContextOpeningClosingAllocations)");
    expect(variable("displayIncomeOpeningClosingAllocations").initializer?.getText(page)).toContain("buildOpeningClosingAllocations(selectedFilledTrades)");
    expect(variable("entryScopedTrades").initializer?.getText(page)).toContain("displayIncomeOpeningClosingAllocations");
    expect(variable("entryScopedTrades").initializer?.getText(page)).not.toContain("ladderOpeningClosingAllocations");
    expect(variable("settledOpenedTradeSummary").initializer?.getText(page)).toContain("entryIncomeOpeningClosingAllocations");
    expect(variable("selectedTrades").initializer?.getText(page)).toContain("instrumentScopedTrades.filter(matchesCurrentTopScope)");
    expect(variable("closingAvailableQuantity").initializer?.getText(page)).toContain("positionContextFilledTrades.filter");
    expect(quickInitializer.getText(page)).toContain("getVisiblePositionRemainingQuantity(trade, ladderOpeningClosingAllocations)");
    expect(saveInitializer.getText(page)).toContain("const closeScopeTrades = rawJournalTrades.filter((trade) => !trade.isPending && !trade.isSyncing");
    expect(saveInitializer.getText(page)).toContain("buildOpeningClosingAllocations(closeScopeTrades).get(targetOpening.id)");
    expect(saveInitializer.getText(page)).not.toContain("positionContextFilledTrades");
    expect(nodes(page, ts.isFunctionDeclaration).find(node => node.name?.text === "buildPositionDisplayBuckets")?.getText(page)).not.toContain("buildClosingProfitShareDistribution");
    expect(() => execute('require("./db")', {}, "true")).toThrow(/Runtime imports forbidden/);
    expect(() => execute("fetch('https://forbidden.invalid')", {}, "true")).toThrow(/Forbidden runtime import\/request/);
  });
});
