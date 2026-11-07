import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// 只读、AST 抽取并执行真实生产声明；绝不 runtime import 页面、appRouter、
// journal/server 模块，不连接数据库、不启动行情/定时器/服务。
function sourceAst(relativePath: string, kind = ts.ScriptKind.TS) {
  const text = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return ts.createSourceFile(relativePath, text, ts.ScriptTarget.Latest, true, kind);
}
const page = sourceAst("../client/src/pages/T0Journal.tsx", ts.ScriptKind.TSX);
const journal = sourceAst("./ledger52-t0-journal.ts");
function declaration(tree: ts.SourceFile, name: string) {
  const node = tree.statements.find((statement) => (
    ts.isFunctionDeclaration(statement) && statement.name?.text === name
  ) || (
    ts.isVariableStatement(statement)
    && statement.declarationList.declarations.some((item) => item.name.getText(tree) === name)
  ));
  if (!node) throw new Error(`Missing production declaration ${tree.fileName}:${name}`);
  return node.getText(tree);
}
function variable(tree: ts.SourceFile, name: string, within: ts.Node = tree): ts.VariableDeclaration {
  const nodes: ts.VariableDeclaration[] = [];
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) nodes.push(node);
    ts.forEachChild(node, visit);
  }
  visit(within);
  if (nodes.length !== 1) throw new Error(`Expected one production variable ${name}, got ${nodes.length}`);
  return nodes[0];
}
function isolated<T = any>(text: string, dependencies: Record<string, unknown>, result: string): T {
  const output = ts.transpileModule(`${text.replace(/^export /gm, "")}\nconst __result = (${result});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const forbidden = (name: string) => { throw new Error(`Forbidden runtime import: ${name}`); };
  return new vm.Script(`${output}\n;__result;`).runInContext(
    vm.createContext({ ...dependencies, exports: {}, require: forbidden }),
    { timeout: 2000 },
  );
}
const pageNames = [
  "ACTIONS", "POSITION_ARCHIVE_STEP", "priceKey", "archivePriceForSide", "archivePriceForTrade",
  "getT0StoredClosingTargetPrice", "getTradeProfitShareRate", "getTradeFinancialQuantity",
  "getTradeActivityTime", "getStoredEntryId", "getStoredAction", "getStoredOptionDirection",
  "getStoredGridDirection", "compareT0PositionRecordedOrder", "invertTradeAction", "invertOptionDirection", "invertGridDirection",
  "asAdminCounterpartyTrade", "buildOpeningClosingAllocations", "projectAdminCounterpartyTrades",
  "buildPositionBuckets", "formatQuantity",
];
const pure = isolated(pageNames.map((name) => declaration(page, name)).join("\n"), {}, `({${pageNames.join(",")}})`);
const serverNames = [
  "POSITION_ARCHIVE_STEP", "toNumber", "normalizeEthQuantity", "actionSide", "isOpeningAction",
  "archivePriceForAction", "archivedTargetPrice", "quantityToCents", "priceKey", "relatedUserKey",
  "relatedFundKey", "calculateAvailableCloseCents", "buildProfitShareOpeningMatches",
];
const serverPure = isolated(serverNames.map((name) => declaration(journal, name)).join("\n"), {},
  "({calculateAvailableCloseCents, buildProfitShareOpeningMatches})");

// 用 AST 定位实际组件绑定与实际 handleSaveEntry 校验块，避免另写验证器让回归误通过。
const saveVariable = variable(page, "handleSaveEntry");
if (!saveVariable.initializer || !ts.isArrowFunction(saveVariable.initializer)
  || !ts.isBlock(saveVariable.initializer.body)) throw new Error("Missing real handleSaveEntry body");
const saveBody = saveVariable.initializer.body;
const closingGuard = saveBody.statements.find((node) => ts.isIfStatement(node)
  && node.expression.getText(page) === "!selectedAction.opening"
  && node.thenStatement.getText(page).includes("closeScopeTrades"));
if (!closingGuard) throw new Error("Missing real save-time close scope/source guard");
const closingGuardText = closingGuard.getText(page);
const scopeVariable = variable(page, "closeScopeTrades", closingGuard);
const sideVariable = variable(page, "side", closingGuard);
const saveStoredAction = variable(page, "storedAction", saveBody);
const saveArchiveTarget = variable(page, "archiveTargetPrice", saveBody);
const componentNames = ["closingStoredSourceTrade", "closingStoredAction", "closingStoredTargetPrice"];
const componentText = componentNames.map((name) => `const ${variable(page, name).getText(page)};`).join("\n");
const planVariable = variable(page, "sharedIncomeServerPlanInput");
if (!planVariable.initializer || !ts.isCallExpression(planVariable.initializer)) throw new Error("Missing plan useMemo");
const planFactory = planVariable.initializer.arguments[0];
if (!planFactory || !ts.isArrowFunction(planFactory)) throw new Error("Missing real plan factory");
let planObject: ts.ObjectLiteralExpression | undefined;
function findPlanObject(node: ts.Node) {
  if (ts.isObjectLiteralExpression(node) && node.properties.some((prop) =>
    ts.isPropertyAssignment(prop) && prop.name.getText(page) === "targetOpeningEntryId")) planObject = node;
  ts.forEachChild(node, findPlanObject);
}
findPlanObject(planFactory);
if (!planObject) throw new Error("Missing real allocation plan object");
function planProperty(name: string) {
  const node = planObject!.properties.find((prop) => ts.isPropertyAssignment(prop) && prop.name.getText(page) === name);
  if (!node || !ts.isPropertyAssignment(node)) throw new Error(`Missing plan property ${name}`);
  return node.initializer.getText(page);
}

type Trade = Record<string, any> & { id: string; action: string; quantity: number; price: number; createdAt: string };
function trade(id: string, extra: Record<string, unknown> = {}): Trade {
  return { id, accountId: "1", relatedUserId: "2", relatedFundId: "3", symbol: "ETH",
    action: "openShort", instrumentType: "contract", quantity: 10, price: 2530, fee: 0,
    createdAt: "2026-11-01T00:00:00.000Z", ...extra };
}
function collisionFixture() {
  return [
    trade("101"),
    trade("102", { action: "openLong", instrumentType: "spot", price: 2521, isCounterparty: true,
      createdAt: "2026-11-01T00:01:00.000Z" }),
    trade("103", { action: "closeLong", price: 2540, targetPrice: 2530, targetOpeningEntryId: "102",
      createdAt: "2026-11-01T00:02:00.000Z" }),
  ];
}
function form(extra: Record<string, unknown> = {}) {
  return { action: "closeShort", accountId: "1", relatedUserId: "2", relatedFundId: "3",
    targetPrice: 2530, targetOpeningEntryId: "101", quantity: "10.00", ...extra };
}
function componentTargets(rawJournalTrades: Trade[], closingSourceTrade: Trade | null, entryForm = form()) {
  return isolated(`${componentText}\nconst ${saveStoredAction.getText(page)};\nconst ${saveArchiveTarget.getText(page)};`,
    { ...pure, rawJournalTrades, closingSourceTrade, entryForm, selectedAction: pure.ACTIONS[entryForm.action],
      price: 2540, useMemo: (factory: () => unknown) => factory() },
    `({source: closingStoredSourceTrade, action: closingStoredAction, target: closingStoredTargetPrice,
      planAction: ${planProperty("action")}, planTarget: ${planProperty("targetPrice")}, archiveTargetPrice})`);
}
function validateClose(rawJournalTrades: Trade[], extra: Record<string, unknown> = {}, trades: Trade[] = [], frozenArchiveTargetPrice?: number) {
  const entryForm = form(extra);
  const closingSourceTrade = trades.find((item) => pure.getStoredEntryId(item) === entryForm.targetOpeningEntryId) ?? null;
  const targets = componentTargets(rawJournalTrades, closingSourceTrade, entryForm);
  const errors: string[] = [];
  const accepted = isolated("", { ...pure, rawJournalTrades, trades, entryForm,
    selectedAction: pure.ACTIONS[entryForm.action], storedAction: targets.action,
    archiveTargetPrice: frozenArchiveTargetPrice ?? targets.target, normalizedRelatedFundId: Number(entryForm.relatedFundId) || undefined,
    quantity: Number(entryForm.quantity), targetOpeningEntryId: Number(entryForm.targetOpeningEntryId) || undefined,
    closeConfirmationStep: "review", showSaveValidationError: (message: string) => errors.push(message),
    t0Toast: { error: (message: string) => errors.push(message) },
  }, `(function () { ${closingGuardText}; return true; })()`);
  return { accepted: accepted === true, errors, targets };
}
function serverRows(raw: Trade[]) {
  return raw.map((item) => ({ id: Number(pure.getStoredEntryId(item)), action: item.action,
    execution_status: item.isPending ? "pending" : "filled", account_id: Number(item.accountId), symbol: item.symbol,
    related_user_id: Number(item.relatedUserId) || null, related_fund_id: Number(item.relatedFundId) || null,
    quantity: String(item.quantity), price: String(item.price), fee_usdt: String(item.fee),
    target_price: item.targetPrice === undefined ? null : String(item.targetPrice),
    target_opening_entry_id: Number(item.targetOpeningEntryId) || null }));
}

describe("T0 平仓真实源单归档：生产 helper / 组件绑定", () => {
  it.each([
    ["closeLong", "openLong", 2521, 2520, 2530],
    ["closeShort", "openShort", 2539, 2540, 2530],
    ["closeShort", "openShort", 2530, 2530, 2530],
    ["closeLong", "openLong", 2530, 2530, 2530],
  ])("%s 用原始 %s 的 %s 归档，而非展示 %s", (action, sourceAction, price, display, expected) => {
    expect(pure.getT0StoredClosingTargetPrice(action, display, trade("101", { action: sourceAction, price }))).toBe(expected);
  });
  it("按 storedAction.side 归档，源单 price 优先于旧 targetPrice / filledPrice / 展示档", () => {
    const original = trade("101", { action: "openLong", price: 2521, targetPrice: 2600, filledPrice: 2700 });
    expect(pure.getT0StoredClosingTargetPrice("closeLong", 2520, original)).toBe(2530);
    expect(pure.getT0StoredClosingTargetPrice("closeShort", 2540, original)).toBe(2520);
    expect(pure.getT0StoredClosingTargetPrice("closeLong", undefined, original)).toBe(2530);
  });
  it("无原始开仓时保留 display fallback / undefined，不把平仓记录当源单", () => {
    expect(pure.getT0StoredClosingTargetPrice("closeLong", 2521, undefined)).toBe(2530);
    expect(pure.getT0StoredClosingTargetPrice("closeShort", 2539, undefined)).toBe(2530);
    expect(pure.getT0StoredClosingTargetPrice("closeLong", undefined, undefined)).toBeUndefined();
    expect(pure.getT0StoredClosingTargetPrice("closeLong", 2521, trade("103", { action: "closeLong", price: 2999 }))).toBe(2530);
  });
  it("非整档镜像 openLong2521 展示 short2520，正式计划与保存均 closeLong2530", () => {
    const raw = [trade("102", { action: "openLong", instrumentType: "spot", price: 2521, isCounterparty: true })];
    const displayed = pure.projectAdminCounterpartyTrades(raw)[0];
    expect(displayed.action).toBe("openShort");
    expect(pure.archivePriceForTrade(displayed)).toBe(2520);
    const result = componentTargets(raw, displayed, form({ targetOpeningEntryId: "102", targetPrice: 2520 }));
    expect(result.source).toBe(raw[0]);
    expect(result).toMatchObject({ action: "closeLong", planAction: "closeLong", target: 2530,
      planTarget: "2530", archiveTargetPrice: 2530 });
    expect(validateClose(raw, { targetOpeningEntryId: "102", targetPrice: 2520 }, [displayed]).accepted).toBe(true);
  });
  it("raw source 按存储 ID 查找；具名 source 优先，缺省时从展示 sourceEntryId 回溯", () => {
    const raw = [trade("raw-fragment", { sourceEntryId: "102", action: "openLong", price: 2521 }), trade("101")];
    const displayed = trade("admin-fragment", { sourceEntryId: "102", action: "openShort", isCounterpartyView: true, price: 2521 });
    expect(componentTargets(raw, displayed, form({ targetOpeningEntryId: "102", targetPrice: 2520 })).source).toBe(raw[0]);
    expect(componentTargets(raw, displayed, form({ targetOpeningEntryId: undefined, targetPrice: 2520 })).source).toBe(raw[0]);
    expect(componentTargets(raw, displayed, form({ targetOpeningEntryId: "101" })).source).toBe(raw[1]);
  });
  it("normal short2530 不反转，计划与 save 共用 closingStoredTargetPrice，缺价同样缺省", () => {
    const raw = [trade("101")];
    expect(componentTargets(raw, raw[0])).toMatchObject({ action: "closeShort", planAction: "closeShort",
      target: 2530, planTarget: "2530", archiveTargetPrice: 2530 });
    expect(componentTargets([], null, form({ targetPrice: undefined }))).toMatchObject({ planTarget: "", target: undefined, archiveTargetPrice: undefined });
    expect(saveStoredAction.initializer?.getText(page)).toBe("closingStoredAction");
    expect(saveArchiveTarget.initializer?.getText(page)).toMatch(/:\s*closingStoredTargetPrice$/);
    expect(planProperty("targetPrice")).toMatch(/closingStoredTargetPrice/);
  });
});

describe("T0 最终可平校验使用完整原始成交集合，而非展示 bucket", () => {
  it("复现同 scope：镜像 long 已具名平仓导致展示 short2530=0，但真实 short2530 仍可平10", () => {
    const raw = collisionFixture();
    const projected = pure.projectAdminCounterpartyTrades(raw);
    expect(projected.find((item: Trade) => item.id === "103")).toMatchObject({ action: "closeShort", sourceAction: "closeLong", targetOpeningEntryId: "102" });
    expect(pure.buildPositionBuckets(projected).find((item: any) => item.side === "short" && item.price === 2530).remainingQuantity).toBe(0);
    expect(pure.buildPositionBuckets(raw).find((item: any) => item.side === "short" && item.price === 2530).remainingQuantity).toBe(10);
    const allocations = pure.buildOpeningClosingAllocations(raw);
    expect(allocations.get("101") ?? []).toEqual([]);
    expect(allocations.get("102")).toMatchObject([{ quantity: 10, trade: { id: "103" } }]);
    expect(validateClose(raw, {}, projected)).toMatchObject({ accepted: true, errors: [] });
    // 表示已被 instrument/history/user 展示筛选清空，也不能因此丢失原始权限上下文。
    expect(validateClose(raw, {}, [])).toMatchObject({ accepted: true, errors: [] });
    expect(serverPure.buildProfitShareOpeningMatches(serverRows(raw), "closeShort", "2530", 2, 3, 1000, 101))
      .toEqual([{ openingEntryId: 101, matchedQuantityCents: 1000, remainingBeforeCents: 1000 }]);
  });
  it("AST 契约：rawJournalTrades 先排 pending/syncing，并保留原 scope 与 storedAction.side", () => {
    expect(scopeVariable.initializer?.getText(page)).toMatch(/^rawJournalTrades\.filter\(/);
    expect(scopeVariable.initializer?.getText(page)).toMatch(/!trade\.isPending\s*&&\s*!trade\.isSyncing/);
    for (const field of ["accountId", "symbol", "relatedUserId", "relatedFundId"]) {
      expect(scopeVariable.initializer?.getText(page)).toContain(`trade.${field}`);
    }
    expect(sideVariable.initializer?.getText(page)).toBe("ACTIONS[storedAction].side");
    expect(closingGuard.getText(page)).toContain("buildOpeningClosingAllocations(closeScopeTrades)");
    expect(closingGuard.getText(page)).toContain("getStoredEntryId(trade) === String(targetOpeningEntryId)");
    expect(closingGuard.getText(page)).toContain("priceKey(archivePriceForTrade(trade)) === priceKey(archiveTargetPrice)");
  });
  it.each(["accountId", "relatedUserId", "relatedFundId", "symbol"])("不同 %s 的 source 不能借同档其他仓位", (field) => {
    const raw = [trade("101", { [field]: field === "symbol" ? "BTC" : "99" }), trade("104", { quantity: 100 })];
    expect(validateClose(raw)).toMatchObject({ accepted: false, errors: ["所选开仓订单已变化，请刷新后重新平仓"] });
  });
  it("来源方向不匹配也不能借其他 source", () => {
    expect(validateClose([trade("101", { action: "openLong" }), trade("104", { quantity: 100 })])).toMatchObject({
      accepted: false, errors: ["所选开仓订单已变化，请刷新后重新平仓"],
    });
  });
  it("原始源价更新后 helper 跟随新档；若提交冻结旧档，源单价格守卫拒绝借邻单", () => {
    const raw = [trade("101", { price: 2540 }), trade("104", { quantity: 100 })];
    expect(validateClose(raw)).toMatchObject({ accepted: true, targets: { target: 2540 } });
    expect(validateClose(raw, {}, [], 2530)).toMatchObject({
      accepted: false, errors: ["所选开仓订单已变化，请刷新后重新平仓"],
    });
  });
  it("源 qty 不足，即使同档余额充足也拒绝；已具名历史 close 不穿透别的 source", () => {
    const raw = [trade("101", { quantity: 5 }), trade("104", { quantity: 100 }),
      trade("105", { action: "closeShort", quantity: 4, targetPrice: 2530, targetOpeningEntryId: "101",
        createdAt: "2026-11-01T01:00:00.000Z" })];
    expect(validateClose(raw, { quantity: "2.00" })).toMatchObject({ accepted: false, errors: ["该笔订单最多可平 1.00 ETH"] });
    expect(validateClose(raw, { quantity: "1.00" }).accepted).toBe(true);
    expect(validateClose(raw, { targetOpeningEntryId: "999" }).accepted).toBe(false);
    const malformed = [...raw, trade("106", { action: "closeShort", quantity: 50, targetPrice: 2530,
      targetOpeningEntryId: "999", createdAt: "2026-11-01T02:00:00.000Z" })];
    expect(pure.buildOpeningClosingAllocations(malformed).get("104") ?? []).toEqual([]);
    expect(pure.buildOpeningClosingAllocations(malformed).get("101")).toMatchObject([{ quantity: 4 }]);
    expect(serverPure.buildProfitShareOpeningMatches(serverRows(raw), "closeShort", "2530", 2, 3, 200, 101))
      .toEqual([{ openingEntryId: 101, matchedQuantityCents: 100, remainingBeforeCents: 100 }]);
    expect(serverPure.buildProfitShareOpeningMatches(serverRows(raw), "closeShort", "2530", 2, 3, 1000, 999)).toEqual([]);
  });
  it.each(["isPending", "isSyncing"])("%s 开仓不能增加可平数量，具名 pending/syncing 源也不能借别人", (flag) => {
    expect(validateClose([trade("101", { quantity: 1 }), trade("104", { quantity: 100, [flag]: true })], { quantity: "2.00" }))
      .toMatchObject({ accepted: false, errors: ["该价格档位最多可平 1.00 ETH"] });
    expect(validateClose([trade("101", { [flag]: true }), trade("104", { quantity: 100 })])).toMatchObject({
      accepted: false, errors: ["所选开仓订单已变化，请刷新后重新平仓"],
    });
  });
  it.each(["isPending", "isSyncing"])("%s 临时平仓不能扣除真实已成交 source 余量", (flag) => {
    const raw = [trade("101"), trade("105", { action: "closeShort", quantity: 10, targetPrice: 2530,
      targetOpeningEntryId: "101", [flag]: true, createdAt: "2026-11-01T01:00:00.000Z" })];
    expect(validateClose(raw)).toMatchObject({ accepted: true, errors: [] });
  });
  it("旧历史 NULL source 仍按原 FIFO 消耗；具名平仓不足不借邻单", () => {
    const raw = [trade("101", { quantity: 5 }), trade("104", { quantity: 10,
      createdAt: "2026-11-01T00:01:00.000Z" }), trade("105", { action: "closeShort", quantity: 7,
      targetPrice: 2530, createdAt: "2026-11-01T01:00:00.000Z" })];
    const legacy = pure.buildOpeningClosingAllocations(raw);
    expect(legacy.get("101")).toMatchObject([{ quantity: 5 }]);
    expect(legacy.get("104")).toMatchObject([{ quantity: 2 }]);
    const explicit = pure.buildOpeningClosingAllocations(raw.map((item) => item.id === "105" ? { ...item, targetOpeningEntryId: "101" } : item));
    expect(explicit.get("101")).toMatchObject([{ quantity: 5 }]);
    expect(explicit.get("104") ?? []).toEqual([]);
  });
});

describe("T0 服务端原始来源 / 锁仓 / 事务复核守卫保持完整（只读 AST）", () => {
  const save = declaration(journal, "saveLedger52T0JournalEntry");
  it("同事务锁读完整实际原始流水，并再次验证源单 scope、filled、side/price 与 qty", () => {
    expect(save).toContain("await tx.beginTransaction()");
    expect(save).toMatch(/WHERE ledger_id = \? AND user_id = \? AND account_id = \? AND symbol = \?[\s\S]*?ORDER BY created_at ASC, id ASC FOR UPDATE/);
    const sourceGuard = save.slice(save.indexOf("const targetMatchesScope"), save.indexOf("if (requestedCents <= 0"));
    for (const check of ["expectedOpeningAction", '"filled"', "account_id", "symbol", "relatedUserKey", "relatedFundKey", "archivePriceForAction", "targetOpeningEntryId", "matchedQuantityCents"]) {
      expect(sourceGuard).toContain(check);
    }
    expect(save).toContain("requestedCents > availableCents");
    expect(serverPure.calculateAvailableCloseCents(serverRows([trade("101", { isPending: true })]), "closeShort", "2530", 2, 3)).toBe(0);
    expect(serverPure.buildProfitShareOpeningMatches(serverRows([trade("101", { isPending: true }), trade("104")]), "closeShort", "2530", 2, 3, 1000, 101)).toEqual([]);
  });
  it("锁仓拒绝与正式计划 fresh 复核均在 INSERT 前，written 核心校验在 commit 前", () => {
    const insert = save.indexOf("INSERT INTO ledger52_t0_journal_entries");
    const locked = save.indexOf("matchedOpenings.some((match) => lockedOpeningIds.has(match.openingEntryId))");
    const fresh = save.indexOf("verifyT0SharedIncomePlanFresh");
    const written = save.indexOf("const writtenEntry =");
    const commit = save.indexOf("await tx.commit()");
    expect(locked).toBeGreaterThan(0); expect(locked).toBeLessThan(insert);
    expect(save).toContain("该笔剩余仓位已锁定，请先解除锁定后再平仓");
    expect(fresh).toBeGreaterThan(0); expect(fresh).toBeLessThan(insert);
    expect(save.slice(fresh, insert)).toMatch(/token: input\.sharedIncomePlanToken, connection/);
    expect(written).toBeGreaterThan(insert); expect(written).toBeLessThan(commit);
    const verify = save.slice(written, save.indexOf("if (!isRetryOfExistingEntry && isOpeningAction", written));
    for (const check of ["writtenEntry.action", "writtenEntry.quantity", "writtenEntry.price", "writtenEntry.target_opening_entry_id", "订单核心字段写入校验失败"]) expect(verify).toContain(check);
    expect(save).toContain("await tx.rollback()");
    expect(save).toMatch(/finally\s*\{\s*tx\.release(?:\?\.)?\(\)/);
  });
});
