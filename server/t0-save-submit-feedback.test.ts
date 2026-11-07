import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// 仅把生产文件当文本读取：不 runtime import 页面、router、tRPC 或任何 DB 模块。
// 执行完整真实 handleSaveEntry（含 const trade 至 mutate 的连续末段），不另写提交器。
// t0Toast 是真实生产 no-op object，不注入、不 mock、不替换其 message 方法。
// 仅表单/查询响应/ref 是冻结测试场景；setter 与唯一 save mutate 是观察 spy，绝不保存。
function sourceAst(relative: string, kind = ts.ScriptKind.TS) {
  return ts.createSourceFile(relative, readFileSync(new URL(relative, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest, true, kind);
}
const page = sourceAst("../client/src/pages/T0Journal.tsx", ts.ScriptKind.TSX);
const contract = sourceAst("../shared/t0-allocation-plan-contract.ts");
const journal = sourceAst("./ledger52-t0-journal.ts");
const allocationPlan = sourceAst("./ledger52-t0-allocation-plan.ts");
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const matches: T[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return matches;
}
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing real production AST: ${label}`);
  return value;
}
function variable(name: string, root: ts.Node = page): ts.VariableDeclaration {
  const found = nodes(root, ts.isVariableDeclaration).filter(node => node.name.getText() === name);
  if (found.length !== 1) throw new Error(`Expected one real ${name}, got ${found.length}`);
  return found[0];
}
function declaration(name: string, tree = page): string {
  const statement = required(tree.statements.find(node =>
    (ts.isFunctionDeclaration(node) && node.name?.text === name)
    || (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(tree) === name)),
  ), name);
  // Remove only export syntax; never include a production module import.
  return statement.getText(tree).replace(/^export\s+/, "");
}
function functionNode(name: string, tree: ts.SourceFile) {
  return required(nodes(tree, ts.isFunctionDeclaration).find(node => node.name?.text === name), name);
}
const saveInitializer = required(variable("handleSaveEntry").initializer, "save initializer");
if (!ts.isArrowFunction(saveInitializer) || !ts.isBlock(saveInitializer.body)) {
  throw new Error("Expected real handleSaveEntry arrow body");
}
const saveBody = saveInitializer.body;
const tradeStatementIndex = saveBody.statements.findIndex(statement => ts.isVariableStatement(statement)
  && statement.declarationList.declarations.some(item => item.name.getText(page) === "trade"));
if (tradeStatementIndex < 0) throw new Error("Missing real const trade save tail");
const realTail = saveBody.statements.slice(tradeStatementIndex);
const mutationCall = required(nodes(saveBody, ts.isCallExpression).find(call =>
  call.expression.getText(page) === "saveEntryMutation.mutate",
), "actual saveEntryMutation.mutate");
const payloadAst = required(mutationCall.arguments[0], "actual save payload");
if (!ts.isObjectLiteralExpression(payloadAst)) throw new Error("Expected actual save payload object");
const payloadPropertyNames = payloadAst.properties.map(property => property.name!.getText(page));
function jsxAttribute(element: ts.JsxElement, name: string) {
  const attribute = required(element.openingElement.attributes.properties.find((node): node is ts.JsxAttribute =>
    ts.isJsxAttribute(node) && node.name.getText(page) === name,
  ), `actual button ${name}`);
  if (!attribute.initializer || !ts.isJsxExpression(attribute.initializer)) throw new Error(`Expected expression ${name}`);
  return required(attribute.initializer.expression, `button ${name} expression`);
}
const reviewButton = required(nodes(page, ts.isJsxElement).find(element =>
  element.openingElement.tagName.getText(page) === "button"
  && element.children.some(child => child.getText(page).includes("确认${ACTIONS[entryForm.action].label}"))
  && element.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
    && attribute.name.getText(page) === "onClick"
    && nodes(attribute, ts.isCallExpression).some(call => call.expression.getText(page) === "handleSaveEntry" && call.arguments.length === 0)),
), "real closing review confirm button");
const reviewClick = jsxAttribute(reviewButton, "onClick");
const reviewDisabled = jsxAttribute(reviewButton, "disabled");
const openingButton = required(nodes(page, ts.isJsxElement).find(element =>
  element.openingElement.tagName.getText(page) === "button"
  && element.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
    && attribute.name.getText(page) === "onClick"
    && nodes(attribute, ts.isCallExpression).some(call => call.expression.getText(page) === "handleSaveEntry"
      && call.arguments[0]?.getText(page) === "isPendingFillConfirmationQueued")),
), "real opening save button");
const openingClick = jsxAttribute(openingButton, "onClick");
const pureNames = [
  "ACTIONS", "POSITION_ARCHIVE_STEP", "ETH_QUANTITY_PATTERN", "normalizeEthQuantity",
  "normalizeT0PriceForSubmission", "priceKey", "archivePriceForSide", "archivePriceForTrade",
  "getT0StoredClosingTargetPrice", "getTradeProfitShareRate", "getTradeFinancialQuantity",
  "getTradeActivityTime", "getStoredEntryId", "getStoredAction", "getStoredOptionDirection",
  "getStoredGridDirection", "compareT0PositionRecordedOrder", "invertTradeAction",
  "invertOptionDirection", "invertGridDirection", "asAdminCounterpartyTrade",
  "buildOpeningClosingAllocations", "buildPositionBuckets", "formatQuantity",
];
const componentNames = [
  "closingStoredSourceTrade", "closingStoredAction", "closingStoredTargetPrice",
  "sharedIncomeServerPlanActive", "sharedIncomeServerPlanInput", "sharedIncomeServerPlan",
  "sharedIncomeServerPlanUnavailable",
];
function isolatedSource(oldToastName = false) {
  return [
    // Negative control changes only the binding name, reproducing the old declaration typo.
    `const ${oldToastName ? "toast" : "t0Toast"} = ${required(variable("t0Toast").initializer, "real toast object").getText(page)};`,
    declaration("T0_SHARED_ALLOCATION_METRICS", contract),
    ...pureNames.map(name => declaration(name)),
    ...componentNames.map(name => `const ${variable(name).getText(page)};`),
    `const handleSaveEntry = ${saveInitializer.getText(page)};`,
    `({ toastObject: ${oldToastName ? "toast" : "t0Toast"}, handleSaveEntry,`,
    `reviewClick: (${reviewClick.getText(page)}), openingClick: (${openingClick.getText(page)}),`,
    `reviewDisabled: () => (${reviewDisabled.getText(page)}),`,
    "planInput: sharedIncomeServerPlanInput, storedAction: closingStoredAction });",
  ].join("\n");
}
function compile(text: string) {
  const tree = ts.createSourceFile("save-isolated.ts", text, ts.ScriptTarget.Latest, true);
  if (nodes(tree, ts.isImportDeclaration).length || nodes(tree, ts.isExportDeclaration).length
    || nodes(tree, ts.isCallExpression).some(call => call.expression.kind === ts.SyntaxKind.ImportKeyword
      || call.expression.getText(tree) === "require")) throw new Error("Runtime imports forbidden in extracted code");
  const output = ts.transpileModule(text, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None, alwaysStrict: true,
  } }).outputText;
  if (/\brequire\s*\(|\bimport\s*(?:\(|["'{*])/.test(output)) throw new Error("Unexpected runtime import in compiled code");
  return { output, script: new Script(output, { filename: "production-t0-save-submit.vm.js" }) };
}
const current = compile(isolatedSource());
const oldBinding = compile(isolatedSource(true));
type Trade = Record<string, unknown> & { id: string; action: string; quantity: number; price: number };
type Production = {
  toastObject: Record<"success" | "error" | "message", (...args: unknown[]) => undefined>;
  handleSaveEntry: (manualConfirmPendingFill?: boolean, bypassOpeningEditSafetyReview?: boolean) => void;
  reviewClick: () => void; openingClick: () => void; reviewDisabled: () => boolean;
  planInput: Record<string, unknown>; storedAction: string;
};
function trade(id = "101", extra: Record<string, unknown> = {}): Trade {
  return { id, accountId: "1", accountName: "测试账户", relatedUserId: "2", relatedFundId: "3",
    symbol: "ETH", action: "openShort", instrumentType: "contract", quantity: 10, price: 2530,
    fee: 0, createdAt: "2026-11-01T00:00:00.000Z", ...extra };
}
const allocations = Object.freeze([Object.freeze({ recipientUserId: 4, amount: "5.00" })]);
const signedPlanFixture = Object.freeze({ planToken: "opaque-response-token-for-payload-test-only",
  allocations, sourceNetPnl: 90, shareableAmount: 10, asOf: "2026-11-07T04:00:00Z" });
// 此 token 是不透明查询响应 fixture，不伪称已完成真实签名校验；服务端只作 AST 契约。
function harness(options: {
  action?: string; form?: Record<string, unknown>; raw?: Trade[]; source?: Trade | null;
  globals?: Record<string, unknown>; oldToastName?: boolean;
} = {}) {
  const action = options.action ?? "closeShort";
  const opening = action.startsWith("open");
  const raw = options.raw ?? [trade()];
  const entryForm = {
    action, accountId: "1", accountName: " 测试账户 ", relatedUserId: "2", relatedUserName: "测试用户",
    relatedUsername: "test-user", relatedFundId: "3", relatedFundName: "", instrumentType: "contract",
    quantity: "10", price: "2520.", targetPrice: opening ? undefined : 2530,
    targetOpeningEntryId: opening ? undefined : "101", note: " 保存回归 ",
    editingEntryId: "", isLocked: false, isCounterparty: false, isPending: false,
    keepReopenReminder: false, reminderTemplateId: "", isTakeProfit: false, takeProfitPlans: [],
    optionDirection: "long_call", optionExpiryDate: "", optionPremium: "", optionPremiumCurrency: "USDT",
    gridDirection: "long", gridRangeMin: "", gridRangeMax: "", gridLeverage: "", gridCount: "",
    ...options.form,
  };
  const events: string[] = [];
  const mutate = vi.fn((_payload: Record<string, unknown>) => { events.push("mutate"); });
  const forbiddenRequire = vi.fn(() => { throw new Error("Forbidden runtime require in save VM"); });
  const forbiddenWrite = vi.fn(() => { throw new Error("Only observing saveEntryMutation.mutate is allowed"); });
  const refetch = vi.fn(() => undefined);
  const state: Record<string, unknown> = { trades: [], closeSaveError: null, openingSaveError: null,
    selectedAccountIds: ["1"], accounts: [], closeConfirmationStep: opening ? "input" : "review" };
  const globals: Record<string, unknown> = {
    entryForm, rawJournalTrades: raw, closingSourceTrade: options.source === undefined ? (opening ? null : raw[0]) : options.source,
    closeConfirmationStep: state.closeConfirmationStep, canManage: true,
    isCloseDistributionPreviewLink: false, sharedIncomeAllocationMetrics: opening ? [] : ["principal"],
    sharedIncomeAllocationBudgetMode: "amount", sharedIncomeAllocationBudgetValue: " 5.00 ",
    sharedIncomeSaveAllocations: allocations, sharedIncomeAllocationPlanError: null,
    sharedIncomeAnnualizedRuleUnavailable: false,
    sharedIncomeManuallyAdjusted: false,
    t0SharedIncomeServerPlanQuery: { data: signedPlanFixture, isFetching: false, error: null, refetch },
    sharedIncomeBudget: { error: null, allocationLimit: 5 }, sharedIncomeAllocatedTotal: 5,
    saveEntryMutation: { mutate, isPending: false, mutateAsync: forbiddenWrite },
    setSharedIncomeEligibilityMutation: { isPending: false },
    pauseReopenReminderMutation: { mutate: forbiddenWrite }, updateOpeningEntryMutation: { mutate: forbiddenWrite },
    isReminderCancellationPending: false, smartOpeningPriceIsIncomplete: false, gridReferencePrice: null,
    estimatedFeeUsdt: 1.25, quantityFormatError: null, optionFormValidationMessage: null,
    gridFormValidationMessage: null, isTakeProfitAvailable: true,
    profitShareRules: [{ relatedFundId: 3 }], isPendingFillConfirmationQueued: false,
    saveEntryCommitLockRef: { current: false }, closeCommitRequestIdRef: { current: null },
    openingCommitRequestIdRef: { current: null }, openingCommitRequestFingerprintRef: { current: null },
    markPrice: 2520, crypto: { randomUUID: vi.fn(() => "test-only-client-request-id") },
    useMemo: (factory: () => unknown) => factory(), require: forbiddenRequire,
    ...options.globals,
  };
  const setters: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const field of Object.keys(state)) {
    const setter = vi.fn((next: unknown) => {
      events.push(`set:${field}`);
      state[field] = typeof next === "function" ? next(state[field]) : next;
      globals[field] = state[field];
    });
    setters[field] = setter;
    globals[`set${field[0].toUpperCase()}${field.slice(1)}`] = setter;
  }
  globals.setSharedIncomePreviewMarkPrice = vi.fn();
  const context = createContext(globals, { codeGeneration: { strings: false, wasm: false } });
  const production = (options.oldToastName ? oldBinding : current).script.runInContext(context, { timeout: 1000 }) as Production;
  context.observedProduction = production;
  const invoke = (kind: "reviewClick" | "openingClick" | "explicitFalse" = opening ? "openingClick" : "reviewClick") =>
    new Script(kind === "explicitFalse" ? "observedProduction.handleSaveEntry(false);" : `observedProduction.${kind}();`)
      .runInContext(context, { timeout: 1000 });
  return { production, globals, state, context, mutate, setters, events, invoke, refetch, forbiddenRequire, forbiddenWrite };
}
function expectNoWrites(h: ReturnType<typeof harness>) {
  expect(h.mutate).not.toHaveBeenCalled();
  expect(h.forbiddenRequire).not.toHaveBeenCalled();
  expect(h.forbiddenWrite).not.toHaveBeenCalled();
  expect(h.state.trades).toEqual([]);
  expect((h.globals.saveEntryCommitLockRef as { current: boolean }).current).toBe(false);
}
function expectOneSave(h: ReturnType<typeof harness>, visibleFee = 1.25) {
  expect(h.mutate).toHaveBeenCalledTimes(1);
  expect(h.forbiddenRequire).not.toHaveBeenCalled();
  expect(h.forbiddenWrite).not.toHaveBeenCalled();
  const payload = h.mutate.mock.calls[0][0];
  expect(Object.keys(payload)).toEqual(payloadPropertyNames);
  expect(payload).toMatchObject({ ledgerId: 52, symbol: "ETH", quantity: "10.00", price: "2520.00",
    note: "保存回归", clientRequestId: "test-only-client-request-id" });
  expect(h.state.trades).toHaveLength(1);
  expect((h.state.trades as Trade[])[0]).toMatchObject({ quantity: 10, price: 2520, fee: visibleFee,
    isSyncing: true, clientRequestId: payload.clientRequestId });
  expect(h.events.at(-1)).toBe("mutate");
  expect(h.events.indexOf("set:trades")).toBeLessThan(h.events.indexOf("mutate"));
  expect((h.globals.saveEntryCommitLockRef as { current: boolean }).current).toBe(true);
  return payload;
}

describe("T0 保存提交反馈：真实 AST、完整保存路径、禁 runtime import VM", () => {
  it("真实 t0Toast 三方法均 no-op，不注入 toast，不导入或执行任何应用模块", () => {
    const h = harness();
    const object = required(variable("t0Toast").initializer, "toast object");
    expect(ts.isObjectLiteralExpression(object)).toBe(true);
    expect(Object.keys(h.production.toastObject)).toEqual(["success", "error", "message"]);
    for (const method of ["success", "error", "message"] as const) {
      expect(vi.isMockFunction(h.production.toastObject[method])).toBe(false);
      expect(h.production.toastObject[method]("真实 no-op", { testOnly: true })).toBeUndefined();
    }
    for (const name of ["toast", "React", "trpc", "process", "module", "exports", "fetch", "window", "document"]) {
      expect(new Script(`typeof ${name}`).runInContext(h.context)).toBe("undefined");
    }
    expect(current.output).not.toMatch(/\brequire\s*\(|\bimport\s/);
    expect(() => new Script('require("./db")').runInContext(h.context)).toThrow("Forbidden runtime require");
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it("末段 const trade ->真实 message ->真实 mutate 连续保留，并抽取完整前置守卫", () => {
    expect(realTail).toHaveLength(6);
    expect(realTail[0].getText(page)).toMatch(/^const trade:/);
    expect(realTail.at(-1)?.getText(page)).toBe(`${mutationCall.getText(page)};`);
    const feedback = realTail.find(ts.isIfStatement);
    expect(feedback?.expression.getText(page)).toBe("awaitsClosingCommit");
    expect(nodes(required(feedback, "feedback statement"), ts.isCallExpression)
      .filter(call => call.expression.getText(page) === "t0Toast.message")).toHaveLength(2);
    expect(isolatedSource()).toContain(saveInitializer.getText(page));
    expect(nodes(saveBody, ts.isCallExpression).filter(call => call.expression.getText(page) === "saveEntryMutation.mutate")).toHaveLength(1);
  });

  it("确认按钮真实 onClick 无实参，由两参数默认 false 得到 handleSaveEntry(false) 语义", () => {
    expect(reviewClick.getText(page)).toBe("() => handleSaveEntry()");
    expect(saveInitializer.parameters.map(parameter => parameter.initializer?.kind)).toEqual([
      ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.FalseKeyword,
    ]);
    const realClick = harness();
    const explicitFalse = harness();
    expect(realClick.production.reviewDisabled()).toBe(false);
    expect(() => realClick.invoke()).not.toThrow();
    expect(() => explicitFalse.invoke("explicitFalse")).not.toThrow();
    expect(expectOneSave(realClick)).toEqual(expectOneSave(explicitFalse));
    expect(openingClick.getText(page)).toBe("() => handleSaveEntry(isPendingFillConfirmationQueued)");
  });

  it.each(["amount", "percentage"])("review 平空10 ETH：%s 正式计划 token/预算/源单保持真实载荷且只提交一次", budgetMode => {
    const h = harness({ globals: { sharedIncomeAllocationBudgetMode: budgetMode } });
    expect(() => h.invoke()).not.toThrow();
    const payload = expectOneSave(h);
    expect(payload).toMatchObject({ accountId: 1, relatedUserId: 2, relatedFundId: 3, action: "closeShort",
      targetPrice: "2530", targetOpeningEntryId: 101, sharedIncomeAllocations: allocations,
      sharedIncomePlanToken: signedPlanFixture.planToken, sharedIncomeMetrics: ["principal"],
      sharedIncomeBudgetMode: budgetMode, sharedIncomeBudgetValue: "5.00" });
    for (const key of ["instrumentType", "isLocked", "isCounterparty", "isPending", "manualConfirmPendingFill"]) {
      expect(payload[key]).toBeUndefined();
    }
    expect(h.production.planInput).toMatchObject({ action: payload.action, quantity: payload.quantity,
      targetOpeningEntryId: payload.targetOpeningEntryId, budgetValue: payload.sharedIncomeBudgetValue });
    expect(() => h.invoke()).not.toThrow();
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.state.trades).toHaveLength(1);
  });

  it("手动不分配仍能平空一次，不伪造 token/维度/预算", () => {
    const h = harness({ globals: { sharedIncomeAllocationMetrics: [], sharedIncomeSaveAllocations: [] } });
    h.invoke();
    const payload = expectOneSave(h);
    expect(payload.action).toBe("closeShort");
    for (const key of ["sharedIncomePlanToken", "sharedIncomeMetrics", "sharedIncomeBudgetMode", "sharedIncomeBudgetValue", "sharedIncomeAllocations"]) {
      expect(payload[key]).toBeUndefined();
    }
  });

  it("管理员镜像展示平空，真实 mutation 保持 closeLong 源动作/2530归档，而非展示2520", () => {
    const rawSource = trade("102", { action: "openLong", price: 2521, isCounterparty: true });
    const h = harness({ raw: [rawSource], source: { ...rawSource, action: "openShort", isCounterpartyView: true,
      sourceEntryId: "102", sourceAction: "openLong" }, form: { targetOpeningEntryId: "102", targetPrice: 2520 } });
    h.invoke();
    expect(expectOneSave(h, -1.25)).toMatchObject({ action: "closeLong", targetPrice: "2530", targetOpeningEntryId: 102 });
    expect((h.state.trades as Trade[])[0]).toMatchObject({ isCounterpartyView: true, sourceFee: 1.25 });
    expect(h.production.storedAction).toBe("closeLong");
    expect(h.production.planInput.action).toBe("closeLong");
  });

  it.each(["openLong", "openShort"])("%s 实际开仓按钮可一次达到 mutate，挂单/锁定/类型与幂等键不被反馈修复改写", action => {
    const h = harness({ action, form: { isPending: true, keepReopenReminder: true } });
    h.invoke();
    const payload = expectOneSave(h);
    expect(payload).toMatchObject({ accountId: 1, relatedUserId: 2, relatedFundId: 3, action,
      instrumentType: "contract", isPending: true, isLocked: false, isCounterparty: false,
      keepReopenReminder: true, takeProfitEnabled: false,
      targetPrice: "2520" });
    expect(payload.targetOpeningEntryId).toBeUndefined();
    expect(payload.sharedIncomePlanToken).toBeUndefined();
    expect(payload.sharedIncomeAllocations).toBeUndefined();
    expect(h.globals.isPendingFillConfirmationQueued).toBe(false);
    h.invoke();
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.state.trades).toHaveLength(1);
  });

  it("新账户开仓仍传真实 accountName，pending UI 账户不被误作数据库 accountId", () => {
    const h = harness({ action: "openLong", form: { accountId: "", accountName: " 新测试账户 " } });
    h.invoke();
    expect(expectOneSave(h)).toMatchObject({ action: "openLong", accountName: "新测试账户" });
    expect(h.mutate.mock.calls[0][0].accountId).toBeUndefined();
    expect(h.state.accounts).toEqual([{ id: "pending-account-test-only-client-request-id", name: "新测试账户" }]);
  });

  it.each(["closeShort", "openLong"])("旧仅声明 toast：%s 真实 message 处复现 ReferenceError，0 mutate（负对照）", action => {
    const h = harness({ action, oldToastName: true });
    let error: unknown;
    try { h.invoke(); } catch (caught) { error = caught; }
    expect(error).toMatchObject({ name: "ReferenceError", message: "t0Toast is not defined" });
    expect(String((error as Error).stack)).toContain("production-t0-save-submit.vm.js");
    expect(h.mutate).not.toHaveBeenCalled();
    expect(h.state.trades).toHaveLength(1); // 已形成乐观行，但提示抛错，真实 mutate 永不抵达。
    expect(h.events.at(-1)).toBe(action.startsWith("open") ? "set:openingSaveError" : "set:closeSaveError");
    expect(h.production.toastObject.message("旧对象仍是生产 no-op")).toBeUndefined();
    expect(new Script("typeof t0Toast").runInContext(h.context)).toBe("undefined");
    expect(h.forbiddenRequire).not.toHaveBeenCalled();
    expect(h.forbiddenWrite).not.toHaveBeenCalled();
  });
});

describe("T0 提交反馈修复不得绕过真实签名计划、预算或原始源仓守卫", () => {
  it.each([
    ["无正式计划", { data: undefined, isFetching: false, error: null }],
    ["正式计划仍读取", { data: signedPlanFixture, isFetching: true, error: null }],
    ["正式计划读取失败", { data: signedPlanFixture, isFetching: false, error: { message: "计划读取失败" } }],
  ])("%s：真实 query 可用性 + 完整 handleSaveEntry 拒绝，0 mutate", (_name, query) => {
    const refetch = vi.fn();
    const h = harness({ globals: { t0SharedIncomeServerPlanQuery: { ...query, refetch } } });
    expect(h.production.reviewDisabled()).toBe(true);
    expect(() => h.invoke()).not.toThrow(); // 即使程序直接调用也不能跳过 handler 守卫。
    expectNoWrites(h);
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(String(h.state.closeSaveError)).toMatch(/正式分配清单尚未就绪|计划读取失败/);
  });

  it("分配金额与正式计划不一致，即使按钮未禁用，完整 handler 仍拒绝", () => {
    const h = harness({ globals: { sharedIncomeSaveAllocations: [{ recipientUserId: 4, amount: "4.99" }] } });
    h.invoke();
    expectNoWrites(h);
    expect(h.state.closeSaveError).toBe("分配清单未同步，请重新生成建议后再确认");
  });

  it("直达模拟预览不提交，正式签名 fixture 也不能绕过", () => {
    const h = harness({ globals: { isCloseDistributionPreviewLink: true } });
    expect(h.production.reviewDisabled()).toBe(true);
    h.invoke();
    expectNoWrites(h);
    expect(h.state.closeSaveError).toMatch(/不会写入/);
  });

  it.each([
    ["预算错误", { sharedIncomeBudget: { error: "预算超额", allocationLimit: 5 } }],
    ["分配超过预算", { sharedIncomeAllocatedTotal: 5.01 }],
    ["计划错误", { sharedIncomeAllocationPlanError: "计划配置无效" }],
    ["保存进行中", { saveEntryMutation: { isPending: true } }],
    ["资格设置进行中", { setSharedIncomeEligibilityMutation: { isPending: true } }],
  ])("%s：真实确认按钮 disabled AST 仍封闭入口（不伪造 handler 预算校验）", (_name, globals) => {
    const h = harness({ globals });
    expect(h.production.reviewDisabled()).toBe(true);
    // DOM disabled 不派发点击；这里只验证真实表达式，不声称 VM 模拟了浏览器。
    expectNoWrites(h);
  });

  it("合法分配等于预算的真实按钮可点击，年化配置不可用仍被 handler 拒绝", () => {
    const h = harness({ globals: { sharedIncomeAllocationMetrics: ["realizedAnnualized"],
      sharedIncomeAnnualizedRuleUnavailable: true } });
    h.invoke();
    expectNoWrites(h);
    expect(h.state.closeSaveError).toMatch(/年化权重配置尚未就绪/);
  });

  it.each([
    ["源单不在 raw 中", [trade("104", { quantity: 100 })], {}, /所选开仓订单已变化/],
    ["源单异账户不能借邻仓", [trade("101", { accountId: "99" }), trade("104", { quantity: 100 })], {}, /所选开仓订单已变化/],
    ["源单方向错误不能借邻仓", [trade("101", { action: "openLong" }), trade("104", { quantity: 100 })], {}, /所选开仓订单已变化/],
    ["具名来源余量不足", [trade("101", { quantity: 5 }), trade("104", { quantity: 100 })], {}, /该笔订单最多可平 5.00 ETH/],
    ["已具名平仓消耗来源", [trade("101"), trade("104", { quantity: 100 }), trade("105", { action: "closeShort", quantity: 1,
      targetPrice: 2530, targetOpeningEntryId: "101", createdAt: "2026-11-01T01:00:00.000Z" })], {}, /该笔订单最多可平 9.00 ETH/],
    ["pending来源不能借邻仓", [trade("101", { isPending: true }), trade("104", { quantity: 100 })], {}, /所选开仓订单已变化/],
    ["syncing来源不能借邻仓", [trade("101", { isSyncing: true }), trade("104", { quantity: 100 })], {}, /所选开仓订单已变化/],
    ["整档不足", [trade("101", { quantity: 9 })], {}, /该价格档位最多可平 9.00 ETH/],
    ["非法source ID", [trade()], { targetOpeningEntryId: "bad-source" }, /所选开仓订单无效/],
  ] as const)("%s：完整真实函数 + 原始仓位纯函数拒绝，0 mutation", (_name, raw, form, error) => {
    const h = harness({ raw: [...raw], form });
    h.invoke();
    expectNoWrites(h);
    expect(h.state.closeSaveError).toMatch(error);
  });

  it("input阶段仅进入review，不越过复核直接保存", () => {
    const h = harness({ globals: { closeConfirmationStep: "input" } });
    h.invoke();
    expectNoWrites(h);
    expect(h.state.closeConfirmationStep).toBe("review");
  });

  it("服务端缺token拒绝在DB连接前；签名/预算/fresh源仓仍在INSERT前（只读AST，不执行DB）", () => {
    const save = functionNode("saveLedger52T0JournalEntry", journal);
    const guard = required(nodes(save, ts.isIfStatement).find(node =>
      node.expression.getText(journal) === "(hasSharedMetrics || hasSignedSharedAdjustment) && !input.sharedIncomePlanToken",
    ), "missing-token production guard");
    expect(nodes(guard, ts.isThrowStatement)).toHaveLength(1);
    const db = required(nodes(save, ts.isCallExpression).find(call => call.expression.getText(journal) === "getDbTransactionConnection"), "DB call AST");
    expect(guard.end).toBeLessThan(db.pos);
    const fresh = required(nodes(save, ts.isCallExpression).find(call => call.expression.getText(journal) === "plan.verifyT0SharedIncomePlanFresh"), "fresh verify AST");
    const insert = required(nodes(save, ts.isCallExpression).find(call => call.expression.getText(journal) === "tx.execute"
      && call.arguments[0]?.getText(journal).includes("INSERT INTO ledger52_t0_journal_entries")), "INSERT AST");
    expect(fresh.end).toBeLessThan(insert.pos);
    for (const field of ["input.sharedIncomePlanToken", "input.sharedIncomeMetrics", "input.sharedIncomeBudgetMode", "input.sharedIncomeBudgetValue", "targetOpeningEntryId"]) {
      expect(fresh.getText(journal)).toContain(field);
    }
    const verify = functionNode("verifyT0SharedIncomePlanFresh", allocationPlan);
    const verifyCalls = nodes(verify, ts.isCallExpression);
    const signed = required(verifyCalls.find(call => call.expression.getText(allocationPlan) === "verifyT0SharedIncomePlanToken"), "signature check AST");
    const compute = required(verifyCalls.find(call => call.expression.getText(allocationPlan) === "computePlan"), "fresh compute AST");
    expect(signed.end).toBeLessThan(compute.pos);
    expect(compute.arguments.at(-1)?.kind).toBe(ts.SyntaxKind.TrueKeyword);
    const token = functionNode("verifyT0SharedIncomePlanToken", allocationPlan);
    expect(token.getText(allocationPlan)).toContain("decode(input.token)");
    expect(token.getText(allocationPlan)).toContain("normalizeInput(input)");
    expect(functionNode("decode", allocationPlan).getText(allocationPlan)).toContain("timingSafeEqual(received, expected)");
    const budgetGuard = required(nodes(functionNode("computePlan", allocationPlan), ts.isIfStatement).find(node =>
      node.expression.getText(allocationPlan).includes("value > source.shareableAmount")), "fresh budget guard");
    expect(nodes(budgetGuard, ts.isThrowStatement)).toHaveLength(1);
    expect(budgetGuard.expression.getText(allocationPlan)).toContain("value > 100");
    // 上述 server AST 含动态 import/SQL，故绝不拼入或执行它们；执行源只有纯声明和页面回调。
    expect(isolatedSource()).not.toContain(save.getText(journal));
  });
});
