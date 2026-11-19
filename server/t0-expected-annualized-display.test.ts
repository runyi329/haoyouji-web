import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// 仅从真实页面读取 AST，绝不导入页面、routers、journal、db 或启动代码。
// React 元素、非目标 XIRR 计算和事件 setter 均为内存桩；没有网络或数据库访问。
const source = readFileSync(new URL("../client/src/pages/T0Journal.tsx", import.meta.url), "utf8");
const pageAst = ts.createSourceFile("T0Journal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) result.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return result;
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Missing production AST node: ${name}`);
  return value;
}

function variable(root: ts.Node, name: string) {
  return required(nodes(root, ts.isVariableDeclaration).find(node => ts.isIdentifier(node.name) && node.name.text === name), name);
}

function initializer(root: ts.Node, name: string) {
  return required(variable(root, name).initializer, `${name} initializer`);
}

function expression<T = any>(node: ts.Node, dependencies: Record<string, unknown> = {}): T {
  const output = ts.transpileModule(`const isolated = (${node.getText(pageAst)});`, {
    fileName: "isolated.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  return runInNewContext(`${output}\nisolated;`, { ...dependencies }, { timeout: 1000 }) as T;
}

function productionFunction(name: string, dependencies: Record<string, unknown> = {}) {
  return expression(required(nodes(pageAst, ts.isFunctionDeclaration).find(node => node.name?.text === name), name), dependencies);
}

const rendererAst = initializer(pageAst, "renderSharedIncomeAllocationCandidates");
const labelAst = initializer(rendererAst, "renderExpectedAnnualizedTarget");
const gateAst = initializer(pageAst, "sharedIncomeAnnualizedRuleNeeded");
const annualizedQueryAst = initializer(pageAst, "t0SharedIncomeAnnualizedRuleQuery");
const ACTIONS = expression<Record<string, { opening: boolean }>>(initializer(pageAst, "ACTIONS"));
const numberFormatter = expression(initializer(pageAst, "numberFormatter"));
const formatPrice = productionFunction("formatPrice", { numberFormatter });
const formatQuantity = productionFunction("formatQuantity");
const formatSigned = productionFunction("formatSigned", { numberFormatter });
const formatT0AnnualizedReturn = productionFunction("formatT0AnnualizedReturn");
const limitT0SharedIncomeAmountInput = productionFunction("limitT0SharedIncomeAmountInput", {
  limitT0ManualDecimalInput: productionFunction("limitT0ManualDecimalInput"),
});

type MemoryElement = { type: unknown; key: string | null; props: Record<string, any> };
const React = {
  Fragment: "memory-fragment",
  createElement(type: unknown, props: Record<string, any> | null, ...children: unknown[]): MemoryElement {
    const { key = null, ...rest } = props ?? {};
    return { type, key: key === null ? null : String(key), props: { ...rest, children } };
  },
};

function isElement(value: unknown): value is MemoryElement {
  return Boolean(value && typeof value === "object" && "type" in value && "props" in value);
}

function elements(value: unknown, result: MemoryElement[] = []): MemoryElement[] {
  if (Array.isArray(value)) value.forEach(child => elements(child, result));
  else if (isElement(value)) {
    result.push(value);
    elements(value.props.children, result);
  }
  return result;
}

function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (isElement(value)) return text(value.props.children);
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function labels(tree: unknown) {
  return elements(tree).filter(element => Object.prototype.hasOwnProperty.call(element.props, "data-t0-expected-annualized"));
}

function classNames(element: MemoryElement): string[] {
  return String(element.props.className ?? "").split(/\s+/);
}

function frozen<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}

function candidate(userId = "101", overrides: Record<string, unknown> = {}) {
  return frozen({
    userId, name: "同名长姓名共享成员", username: "same-name", remainingQuantity: 1,
    longQuantity: 1, shortQuantity: 0, cumulativeDepositAmount: 100,
    withdrawalProgressPercentage: 0, hasPrincipal: true, holdingNetPnl: -2,
    closedNetPnl: 0, closedLossPnl: 0, historicalProfit: 8,
    sharedIncomeEnabled: true, receivedSharedIncome: 5, receivedSharedIncomeCount: 2,
    contributedSharedIncome: 3, contributedSharedIncomeOrderCount: 1, openingOrderCount: 4,
    realizedCashFlows: [], realizedTerminalValue: 105, heldDays: 365,
    settlementAgeDays: 1, annualizedReference: 0.125, annualizedTargetTopUps: [], ...overrides,
  });
}

function rule(targets: Record<string, unknown>) {
  return frozen({ version: 7, influence: 0.5, targets });
}

function renderLabel(targets: Record<string, unknown>, member = candidate(), canManage = true) {
  const draft = { get targets(): never { throw new Error("Must not read unsaved annualized draft targets"); } };
  const render = expression<(candidate: ReturnType<typeof candidate>) => MemoryElement | null>(labelAst, {
    React, canManage, sharedIncomeAnnualizedRule: rule(targets),
    sharedIncomeAnnualizedDraftRule: draft, sharedIncomeAnnualizedAverage: 999,
  });
  return render(member);
}

type HarnessOptions = {
  targets?: Record<string, unknown>;
  candidates?: ReturnType<typeof candidate>[];
  compactAllocationMetric?: string;
  canManage?: boolean;
  showEligibilityControls?: boolean;
  eligibilityPendingUserId?: string | null;
  drafts?: Record<string, string>;
  targetSelections?: Record<string, number>;
};

function rendererHarness(options: HarnessOptions = {}) {
  let drafts = { ...options.drafts };
  let targetSelections = { ...options.targetSelections };
  const savedRule = rule(options.targets ?? { "101": 52.5 });
  const members = frozen(options.candidates ?? [candidate()]);
  const setDrafts = vi.fn((update: (current: Record<string, string>) => Record<string, string>) => { drafts = update(drafts); });
  const setTargetSelections = vi.fn((update: (current: Record<string, number>) => Record<string, number>) => { targetSelections = update(targetSelections); });
  const onEligibilityChange = vi.fn();
  const calculateT0Xirr = vi.fn(() => 0.125);
  const renderer = expression<(input: Record<string, unknown>) => MemoryElement>(rendererAst, {
    React, canManage: options.canManage ?? true, sharedIncomeAnnualizedRule: savedRule,
    sharedIncomeAnnualizedDraftRule: { get targets(): never { throw new Error("Must not read unsaved draft"); } },
    sharedIncomeClosePreview: frozen({ candidates: members, shareableAmount: 100 }),
    sharedIncomeContributionRule: {}, sharedIncomeMarketWeightsByUserId: new Map(),
    sharedIncomeWeightedOrderScores: new Map(),
    formatPrice, formatQuantity, formatSigned, formatT0AnnualizedReturn, limitT0SharedIncomeAmountInput,
    // 非标签计算依赖仅限内存；这些用例不测试 XIRR 求解器本身。
    calculateT0Xirr, getBeijingDateInputValue: () => "2026-11-19", Minus: "memory-minus", Plus: "memory-plus",
  });
  const render = () => renderer({
    drafts, setDrafts, targetSelections, setTargetSelections,
    allocatedTotal: Object.values(drafts).reduce((sum, amount) => sum + (Number(amount) || 0), 0),
    emptyMessage: "暂无候选人", allocationLimit: 100,
    compactAllocationMetric: options.compactAllocationMetric,
    showEligibilityControls: options.showEligibilityControls ?? true,
    eligibilityPendingUserId: options.eligibilityPendingUserId,
    onEligibilityChange,
  });
  return { render, savedRule, members, setDrafts, setTargetSelections, onEligibilityChange, calculateT0Xirr,
    get drafts() { return drafts; }, get targetSelections() { return targetSelections; } };
}

function control(tree: unknown, predicate: (element: MemoryElement) => boolean) {
  return required(elements(tree).find(predicate), "production control");
}

function permission(overrides: Record<string, unknown> = {}) {
  const dependencies: Record<string, unknown> = {
    canAccess: true, rawJournalData: { viewerMode: "admin", viewerRelatedUserId: 28 },
    previewUserId: null, hasViewAsSessionScope: false, viewerScopeUserId: 28,
    canUseMemberPreview: true, ...overrides,
  };
  for (const name of ["queriedViewerMode", "isUserPreview", "isViewAsSessionSwitching", "isPreviewSwitching", "canManage"]) {
    dependencies[name] = expression(initializer(pageAst, name), dependencies);
  }
  return Boolean(dependencies.canManage);
}

function gate(overrides: Record<string, unknown> = {}) {
  return expression<boolean>(gateAst, {
    canManage: true, showSharedIncomeAnnualizedRuleDetails: false,
    showEntrySheet: false, sharedIncomeAllocationMetrics: [], entryForm: { action: "openLong" },
    takeProfitAllocationPlanIndex: null, ACTIONS, ...overrides,
  });
}

describe("T+0 个人目标年化只读标签（真实嵌套助手 AST/VM）", () => {
  it("取已应用 sharedIncomeAnnualizedRule.targets 而非未保存草稿、平均值、参考年化或分配草案", () => {
    const savedRule = rule({ "101": 52 });
    const render = expression(labelAst, {
      React, canManage: true, sharedIncomeAnnualizedRule: savedRule,
      sharedIncomeAnnualizedDraftRule: rule({ "101": 91.5 }),
      sharedIncomeAnnualizedAverage: 77, input: { targetSelections: { "101": 0.88 }, drafts: { "101": "123.00" } },
    });
    const member = candidate("101", { annualizedReference: 0.99 });
    const before = JSON.stringify({ savedRule, member });
    expect(text(render(member))).toBe("52%");
    expect(JSON.stringify({ savedRule, member })).toBe(before);
    const identifierNames = nodes(labelAst, ts.isIdentifier).map(node => node.text);
    expect(identifierNames).toContain("sharedIncomeAnnualizedRule");
    expect(identifierNames).not.toContain("sharedIncomeAnnualizedDraftRule");
    expect(identifierNames).not.toContain("annualizedReference");
    expect(identifierNames).not.toContain("targetSelections");
  });

  it.each([
    [0, "0%"], [52, "52%"], [52.5, "52.5%"], [0.52, "0.52%"],
    [52.567, "52.57%"], [10_000, "10000%"],
  ])("已设置 %s 显示纯百分数 %s，零有效且单位不再除/乘100", (value, expected) => {
    const label = required(renderLabel({ "101": value }) ?? undefined, "annualized label");
    expect(label.type).toBe("span");
    expect(text(label)).toBe(expected);
    expect(text(label)).not.toMatch(/预期|目标|年化|\+|,/);
    expect(label.props.title).toBe(`预期年化目标 ${expected}`);
    expect(label.props["data-t0-expected-annualized"]).toBe("101");
    expect(label.props.onClick).toBeUndefined();
    expect(label.props.onChange).toBeUndefined();
  });

  it("未设置没有标签，不把默认/平均年化伪造为0%", () => {
    expect(renderLabel({})).toBeNull();
    expect(renderLabel({ "102": 52 })).toBeNull();
    expect(renderLabel({ "101": undefined })).toBeNull();
  });

  it.each([
    ["NaN", NaN], ["positive infinity", Infinity], ["negative infinity", -Infinity],
    ["negative", -1], ["negative fraction", -0.01], ["over maximum", 10_000.01],
    ["numeric string", "52"], ["empty string", ""], ["null", null],
    ["undefined", undefined], ["object", {}], ["boolean", true],
  ])("invalid %s 隐藏，不强制转为有限数字", (_name, value) => {
    expect(renderLabel({ "101": value })).toBeNull();
  });

  it("只按 candidate.userId exact own key 匹配：同名不串人，也不数值归一ID", () => {
    for (const userId of ["0101", "101 ", "101.0", "102", "same-name"]) {
      expect(renderLabel({ "101": 52 }, candidate(userId))).toBeNull();
    }
    expect(text(renderLabel({ "101": 52, "102": 52.5 }, candidate("102")))).toBe("52.5%");
    expect(text(renderLabel({ "0101": 0 }, candidate("0101")))).toBe("0%");
    expect(renderLabel(Object.create({ "101": 52 }))).toBeNull();
    expect(renderLabel({}, candidate("toString"))).toBeNull();
    const ownTargets = Object.assign(Object.create(null), { "101": 52, hasOwnProperty: 88 });
    expect(text(renderLabel(ownTargets))).toBe("52%");
  });

  it("仅 canManage 显示；普通/代入模式不读取私有 targets，即使旧规则仍在缓存", () => {
    const render = expression(labelAst, {
      React, canManage: false,
      sharedIncomeAnnualizedRule: { get targets(): never { throw new Error("Private targets read without canManage"); } },
    });
    expect(render(candidate())).toBeNull();
    expect(renderLabel({ "101": 0 }, candidate(), false)).toBeNull();
  });

  it("标签不依赖本金或当前共享资格：已设置目标仍可显示", () => {
    expect(text(renderLabel({ "101": 52.5 }, candidate("101", { hasPrincipal: false, sharedIncomeEnabled: false })))).toBe("52.5%");
  });
});

describe("同一真实助手覆盖紧凑、普通与资格关闭行，且不改变交互", () => {
  it("生产AST仅一处标签定义，四类行都调用该助手且传当前 candidate", () => {
    expect(nodes(rendererAst, ts.isVariableDeclaration).filter(node => ts.isIdentifier(node.name) && node.name.text === "renderExpectedAnnualizedTarget")).toHaveLength(1);
    const calls = nodes(rendererAst, ts.isCallExpression).filter(node => node.expression.getText(pageAst) === "renderExpectedAnnualizedTarget");
    expect(calls).toHaveLength(4);
    expect(calls.every(call => call.arguments.length === 1 && call.arguments[0].getText(pageAst) === "candidate")).toBe(true);
    const markerAttributes = nodes(rendererAst, ts.isJsxAttribute).filter(node => node.name.getText(pageAst) === "data-t0-expected-annualized");
    expect(markerAttributes).toHaveLength(1);
    expect(markerAttributes[0].getStart(pageAst)).toBeGreaterThan(labelAst.getStart(pageAst));
    expect(markerAttributes[0].getEnd()).toBeLessThan(labelAst.getEnd());
  });

  it.each(["combined", "realizedAnnualized", undefined])("%s 模式所有行使用已保存标签且资格关闭仍显示，未设置无标签", compactAllocationMetric => {
    const h = rendererHarness({ compactAllocationMetric, targets: { "101": 52, "102": 0, "103": 52.5 }, candidates: [
      candidate("101"), candidate("102", { hasPrincipal: false }),
      candidate("103", { sharedIncomeEnabled: false }), candidate("104"),
    ] });
    const tree = h.render();
    expect(labels(tree).map(label => [label.props["data-t0-expected-annualized"], text(label)])).toEqual([
      ["101", "52%"], ["102", "0%"], ["103", "52.5%"],
    ]);
    expect(h.setDrafts).not.toHaveBeenCalled();
    expect(h.setTargetSelections).not.toHaveBeenCalled();
    expect(h.onEligibilityChange).not.toHaveBeenCalled();
    const open = control(tree, element => element.type === "button" && element.props["aria-pressed"] === false);
    open.props.onClick();
    expect(h.onEligibilityChange).toHaveBeenCalledWith(h.members[2], true);
    expect(h.members[2].sharedIncomeEnabled).toBe(false);
    expect(h.drafts).toEqual({});
    expect(h.savedRule.targets).toEqual({ "101": 52, "102": 0, "103": 52.5 });
  });

  it.each(["combined", undefined])("%s：没有资格控制的止盈行不被标签过滤，普通成员不显示目标", compactAllocationMetric => {
    const members = [candidate("101", { sharedIncomeEnabled: false })];
    const admin = rendererHarness({ candidates: members, compactAllocationMetric, showEligibilityControls: false });
    const member = rendererHarness({ candidates: members, compactAllocationMetric, showEligibilityControls: false, canManage: false });
    expect(labels(admin.render())).toHaveLength(1);
    expect(labels(member.render())).toHaveLength(0);
    for (const tree of [admin.render(), member.render()]) {
      expect(control(tree, element => element.type === "input").props.disabled).toBe(false);
      expect(elements(tree).some(element => element.props["aria-pressed"] !== undefined)).toBe(false);
    }
  });

  it.each(["combined", undefined])("%s：有无目标保持同样金额/资格控制与清草案行为", compactAllocationMetric => {
    const withLabel = rendererHarness({ compactAllocationMetric, targets: { "101": 0 }, targetSelections: { "101": 0.52, "999": 0.9 } });
    const withoutLabel = rendererHarness({ compactAllocationMetric, targets: {}, targetSelections: { "101": 0.52, "999": 0.9 } });
    const snapshotControls = (tree: unknown) => elements(tree)
      .filter(element => element.type === "button" || element.type === "input")
      .map(element => ({ type: element.type, disabled: element.props.disabled, value: element.props.value,
        pressed: element.props["aria-pressed"], label: element.props["aria-label"], title: element.props.title, text: text(element) }));
    expect(snapshotControls(withLabel.render())).toEqual(snapshotControls(withoutLabel.render()));
    for (const h of [withLabel, withoutLabel]) {
      const input = control(h.render(), element => element.type === "input");
      expect(input.props.disabled).toBe(false);
      input.props.onChange({ target: { value: "12.345" } });
      expect(h.drafts).toEqual({ "101": "12.34" });
      expect(h.targetSelections).toEqual({ "999": 0.9 });
      control(h.render(), element => element.type === "input").props.onChange({ target: { value: "" } });
      expect(h.drafts).toEqual({});
      control(h.render(), element => element.type === "button" && element.props["aria-pressed"] === true).props.onClick();
      expect(h.onEligibilityChange).toHaveBeenCalledWith(h.members[0], false);
    }
    expect(withLabel.savedRule.targets).toEqual({ "101": 0 });
    expect(text(labels(withLabel.render())[0])).toBe("0%");
    expect(snapshotControls(withLabel.render())).toEqual(snapshotControls(withoutLabel.render()));
  });

  it("紧凑行真实加减依旧按总额1%操作，个人目标只是标签", () => {
    const h = rendererHarness({ compactAllocationMetric: "combined", targets: { "101": 52.5 } });
    control(h.render(), element => String(element.props["aria-label"] ?? "").includes("分配金额增加")).props.onClick();
    expect(h.drafts).toEqual({ "101": "1.00" });
    control(h.render(), element => String(element.props["aria-label"] ?? "").includes("分配金额减少")).props.onClick();
    expect(h.drafts).toEqual({ "101": "0.00" });
    expect(text(labels(h.render())[0])).toBe("52.5%");
  });

  it("普通行本金/本单快捷分配和清零不消费或修改个人目标", () => {
    const h = rendererHarness({ targets: { "101": 52.5 } });
    control(h.render(), element => element.type === "button" && text(element) === "本金 1%").props.onClick();
    expect(h.drafts).toEqual({ "101": "1.00" });
    control(h.render(), element => element.props["aria-label"] === "按本单可共享收益的2%分配").props.onClick();
    expect(h.drafts).toEqual({ "101": "2.00" });
    control(h.render(), element => String(element.props["aria-label"] ?? "").startsWith("清零")).props.onClick();
    expect(h.drafts).toEqual({});
    expect(h.savedRule.targets).toEqual({ "101": 52.5 });
    expect(text(labels(h.render())[0])).toBe("52.5%");
  });

  it.each(["combined", undefined])("%s：无本金和资格pending仍按原条件禁用，不因有目标而放开", compactAllocationMetric => {
    const h = rendererHarness({ compactAllocationMetric, eligibilityPendingUserId: "101", candidates: [candidate("101", { hasPrincipal: false })] });
    const tree = h.render();
    expect(labels(tree)).toHaveLength(1);
    expect(control(tree, element => element.type === "input").props.disabled).toBe(true);
    expect(control(tree, element => element.type === "button" && element.props["aria-pressed"] === true).props.disabled).toBe(true);
  });
});

describe("个人年化规则读取gate与管理员/代入隔离（真实表达式 AST/VM）", () => {
  it.each([
    ["设置页", { showSharedIncomeAnnualizedRuleDetails: true }],
    ["平多人工/无维度", { showEntrySheet: true, entryForm: { action: "closeLong" }, sharedIncomeAllocationMetrics: [] }],
    ["平空组合方案", { showEntrySheet: true, entryForm: { action: "closeShort" }, sharedIncomeAllocationMetrics: ["principal", "historicalProfit"] }],
    ["止盈第0方案", { showEntrySheet: true, takeProfitAllocationPlanIndex: 0 }],
    ["止盈后续方案", { showEntrySheet: true, takeProfitAllocationPlanIndex: 2 }],
    ["原已实现年化模式", { showEntrySheet: true, sharedIncomeAllocationMetrics: ["realizedAnnualized"] }],
  ])("%s触发读取，普通成员/管理员代入均不读取", (_name, patch) => {
    expect(gate(patch)).toBe(true);
    expect(gate({ ...patch, canManage: false })).toBe(false);
    const member = permission({ rawJournalData: { viewerMode: "member", viewerRelatedUserId: 101 }, canUseMemberPreview: false });
    const preview = permission({ previewUserId: 101 });
    const viewAs = permission({ hasViewAsSessionScope: true, viewerScopeUserId: 101 });
    expect([member, preview, viewAs]).toEqual([false, false, false]);
    for (const canManage of [member, preview, viewAs]) expect(gate({ ...patch, canManage })).toBe(false);
  });

  it.each([
    ["首屏", {}],
    ["普通开多", { showEntrySheet: true, entryForm: { action: "openLong" }, sharedIncomeAllocationMetrics: ["principal"] }],
    ["普通开空", { showEntrySheet: true, entryForm: { action: "openShort" } }],
    ["已关闭的平仓面板", { entryForm: { action: "closeLong" } }],
    ["已关闭的止盈面板", { takeProfitAllocationPlanIndex: 0 }],
    ["已关闭的原年化面板", { sharedIncomeAllocationMetrics: ["realizedAnnualized"] }],
  ])("%s不增加无关读取", (_name, patch) => { expect(gate(patch)).toBe(false); });

  it("生产useQuery直接接该gate、仅52、保留缓存策略；不执行任何请求", () => {
    if (!ts.isCallExpression(annualizedQueryAst)) throw new Error("Expected production annualized useQuery");
    expect(annualizedQueryAst.expression.getText(pageAst)).toBe("trpc.ledger.t0GetSharedIncomeAnnualizedRule.useQuery");
    expect(expression(annualizedQueryAst.arguments[0])).toEqual({ ledgerId: 52 });
    for (const enabled of [true, false]) {
      expect(expression(annualizedQueryAst.arguments[1], { sharedIncomeAnnualizedRuleNeeded: enabled })).toEqual({
        enabled, staleTime: 60_000, refetchOnWindowFocus: false,
      });
    }
    const options = annualizedQueryAst.arguments[1];
    if (!ts.isObjectLiteralExpression(options)) throw new Error("Expected production query options");
    const enabled = required(options.properties.find((node): node is ts.PropertyAssignment => ts.isPropertyAssignment(node) && node.name.getText(pageAst) === "enabled"), "enabled gate binding");
    expect(enabled.initializer.getText(pageAst)).toBe("sharedIncomeAnnualizedRuleNeeded");
  });

  it("真实canManage等待完整admin scope；普通成员、代入及切换时的旧admin缓存都拒绝", () => {
    expect(permission()).toBe(true);
    for (const patch of [
      { canAccess: false },
      { rawJournalData: { viewerMode: "member", viewerRelatedUserId: 101 }, canUseMemberPreview: false },
      { previewUserId: 101 },
      { previewUserId: 101, rawJournalData: { viewerMode: "member", viewerRelatedUserId: 101 } },
      { hasViewAsSessionScope: true, viewerScopeUserId: 101 },
      { hasViewAsSessionScope: true, viewerScopeUserId: 101, rawJournalData: { viewerMode: "member", viewerRelatedUserId: 101 } },
      { rawJournalData: undefined },
    ]) {
      const canManage = permission(patch);
      expect(canManage).toBe(false);
      expect(gate({ canManage, showSharedIncomeAnnualizedRuleDetails: true })).toBe(false);
    }
  });
});

describe("紧凑姓名与目标年化布局契约（真实元素类名，不做浏览器验收）", () => {
  it("姓名列6.5rem，内容max4.75rem、min-w-0且允许换行，不引入min-w-max", () => {
    const tree = rendererHarness({ compactAllocationMetric: "realizedAnnualized", targets: { "101": 52.5 } }).render();
    const all = elements(tree);
    const colgroup = control(tree, element => element.type === "colgroup");
    expect(classNames(elements(colgroup).filter(element => element.type === "col")[0])).toContain("w-[6.5rem]");
    const label = labels(tree)[0];
    const content = control(tree, element => element.type === "div" && classNames(element).includes("max-w-[4.75rem]") && elements(element).includes(label));
    expect(classNames(content)).toEqual(expect.arrayContaining(["min-w-0", "flex-wrap", "max-w-[4.75rem]"]));
    expect(classNames(content)).not.toContain("whitespace-nowrap");
    const name = control(content, element => element.type === "span" && element.props.title === "同名长姓名共享成员");
    expect(classNames(name)).toEqual(expect.arrayContaining(["min-w-0", "max-w-full", "whitespace-normal", "break-all"]));
    expect(classNames(name)).not.toEqual(expect.arrayContaining(["truncate"]));
    expect(classNames(name)).not.toContain("whitespace-nowrap");
    expect(all.every(element => !classNames(element).includes("min-w-max"))).toBe(true);
  });

  it("年化标签和已实现年化值均nowrap，不截断数值或强行省略号", () => {
    const tree = rendererHarness({ compactAllocationMetric: "realizedAnnualized", targets: { "101": 52.5 }, candidates: [candidate("101", { annualizedReference: 0.525 })] }).render();
    const label = labels(tree)[0];
    expect(text(label)).toBe("52.5%");
    expect(classNames(label)).toEqual(expect.arrayContaining(["shrink-0", "whitespace-nowrap", "tabular-nums"]));
    for (const token of ["truncate", "overflow-hidden", "text-ellipsis", "line-clamp-1"]) expect(classNames(label)).not.toContain(token);
    const metricCell = control(tree, element => element.type === "td" && text(element) === "+52.5%");
    expect(classNames(metricCell)).toContain("whitespace-nowrap");
    for (const element of elements(metricCell)) {
      for (const token of ["truncate", "overflow-hidden", "text-ellipsis", "line-clamp-1"]) expect(classNames(element)).not.toContain(token);
    }
  });
});
