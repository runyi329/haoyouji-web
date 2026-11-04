import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// 只读取页面并通过 TS AST 提取实际生产表达式/纯回调，不导入页面、tRPC 或数据库依赖。
// fixture 仅存在于单元测试；排序、点击处理和权限判断均执行生产源码，而非另一套实现。
const source = readFileSync(new URL("../client/src/pages/T0Journal.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("T0Journal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function findNodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const matches: T[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return matches;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing production node: ${label}`);
  return value;
}

function variable(name: string) {
  return required(findNodes(ast, ts.isVariableDeclaration).find((node) =>
    ts.isIdentifier(node.name) ? node.name.text === name : ts.isArrayBindingPattern(node.name)
      && node.name.elements.some((element) => ts.isBindingElement(element)
        && ts.isIdentifier(element.name) && element.name.text === name),
  ), name);
}

function callInitializer(name: string) {
  const initializer = required(variable(name).initializer, `${name} initializer`);
  if (!ts.isCallExpression(initializer)) throw new Error(`Expected production call: ${name}`);
  return initializer;
}

function memoCallback(name: string) {
  const call = callInitializer(name);
  if (call.expression.getText(ast) !== "useMemo") throw new Error(`Expected production useMemo: ${name}`);
  const callback = required(call.arguments[0], `${name} callback`);
  if (!ts.isArrowFunction(callback)) throw new Error(`Expected production arrow callback: ${name}`);
  return callback;
}

function compileExpression<T>(expression: ts.Expression, parameters: string[]) {
  const compiled = ts.transpileModule(`const isolated = (${expression.getText(ast)});`, {
    fileName: "isolated.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function(...parameters, `${compiled}\nreturn isolated;`) as (...values: unknown[]) => T;
}

function attribute(element: ts.JsxElement, name: string) {
  return element.openingElement.attributes.properties.find((node): node is ts.JsxAttribute =>
    ts.isJsxAttribute(node) && node.name.getText(ast) === name,
  );
}

function attributeExpression(element: ts.JsxElement, name: string) {
  const initializer = required(attribute(element, name)?.initializer, `${name} attribute`);
  if (!ts.isJsxExpression(initializer)) throw new Error(`Expected JSX expression: ${name}`);
  return required(initializer.expression, `${name} expression`);
}

const globalDialog = required(findNodes(ast, ts.isJsxElement).find((element) =>
  attribute(element, "aria-label")?.initializer?.getText(ast) === '"T加零全局账本"',
), "global ledger dialog");
const globalDialogSource = globalDialog.getText(ast);
const payoutSection = required(findNodes(globalDialog, ts.isJsxElement).find((element) =>
  element.openingElement.tagName.getText(ast) === "section"
    && attribute(element, "aria-label")?.getText(ast).includes("globalPayoutLabel"),
), "global payout section");
const payoutButtons = findNodes(payoutSection, ts.isJsxElement).filter((element) =>
  element.openingElement.tagName.getText(ast) === "button",
);
const sortButton = required(payoutButtons.find((button) =>
  attribute(button, "title")?.getText(ast).includes("点击按"),
), "selected-direction sort button");
const nameButton = required(payoutButtons.find((button) =>
  attribute(button, "title")?.getText(ast).includes("的订单"),
), "payout user selection button");
const amountButton = required(payoutButtons.find((button) =>
  attribute(button, "aria-label")?.getText(ast).includes("登记${globalPayoutLabel}"),
), "selected-direction registration button");

type PayoutDirection = "deposit" | "withdrawal";
type FundsSort = Record<PayoutDirection, "asc" | "desc">;
type FundsRow = {
  userId: string;
  name: string;
  deposit: number;
  withdrawal: number;
  orderProfit: number;
  commissionProfit: number;
  sharedProfit: number;
  commissionExpense: number;
  sharedExpense: number;
};

// 乱序、相反的充值/提现排行、同金额姓名平局，以及干扰性的收入字段。
const fixtureRows: readonly FundsRow[] = Object.freeze([
  { userId: "b", name: "Bravo", deposit: 300.25, withdrawal: 200.5, orderProfit: 50000, commissionProfit: 90, sharedProfit: 80, commissionExpense: 7, sharedExpense: 6 },
  { userId: "z", name: "Zulu", deposit: 100.1, withdrawal: 400.4, orderProfit: 9999, commissionProfit: 70, sharedProfit: 60, commissionExpense: 5, sharedExpense: 4 },
  { userId: "c", name: "Charlie", deposit: 200.2, withdrawal: 300.3, orderProfit: 0, commissionProfit: 50, sharedProfit: 40, commissionExpense: 3, sharedExpense: 2 },
  { userId: "a", name: "Alpha", deposit: 300.25, withdrawal: 200.5, orderProfit: -50, commissionProfit: 30, sharedProfit: 20, commissionExpense: 1, sharedExpense: 0 },
].map((row) => Object.freeze(row)));
const evaluateSort = compileExpression<() => FundsRow[]>(memoCallback("sortedGlobalFundsRows"), [
  "globalFundsRows", "globalFundsSort", "globalPayoutDirection",
]);
const sortRows = (rows: readonly FundsRow[], sort: FundsSort, direction: PayoutDirection) =>
  evaluateSort(rows, sort, direction)();
const initialFundsSort = compileExpression<FundsSort>(
  required(callInitializer("globalFundsSort").arguments[0], "global funds sort defaults"), [],
)();
const tabNames = ["positions", "deposit", "withdrawal", "income", "system"] as const;

const queryCall = callInitializer("t0GlobalPayoutLogsQuery");
const queryOptions = required(queryCall.arguments[1], "global payout query options");
if (!ts.isObjectLiteralExpression(queryOptions)) throw new Error("Expected global payout query options object");
const enabledProperty = required(queryOptions.properties.find((node): node is ts.PropertyAssignment =>
  ts.isPropertyAssignment(node) && node.name.getText(ast) === "enabled",
), "global payout query enabled");
const evaluateEnabled = compileExpression<boolean>(enabledProperty.initializer, [
  "canManage", "showGlobalLedger", "globalLedgerTab", "showTotalNetProfitDetail",
  "payoutTargetRelatedUserId", "canUseMemberPreview", "previewMemberPickerOpen",
]);

function parentJsxExpression(node: ts.Node) {
  let parent = node.parent;
  while (parent && !ts.isJsxExpression(parent)) parent = parent.parent;
  if (!parent || !ts.isJsxExpression(parent)) throw new Error("Missing enclosing production JSX condition");
  return required(parent.expression, "enclosing JSX condition");
}

function directFormattedExpression(element: ts.JsxElement) {
  return required(element.children.find((node): node is ts.JsxExpression =>
    ts.isJsxExpression(node) && Boolean(node.expression && ts.isCallExpression(node.expression)
      && node.expression.expression.getText(ast) === "formatPrice"),
  )?.expression, "selected amount formatting expression");
}

describe("T+0 全局充值/提现标签与查询契约", () => {
  it("标签联合类型及导航保留原标签，拆分充值/提现且没有合并 funds 标签", () => {
    const tabState = callInitializer("globalLedgerTab");
    const tabType = required(tabState.typeArguments?.[0], "global ledger tab union");
    if (!ts.isUnionTypeNode(tabType)) throw new Error("Expected global ledger tab union type");
    expect(tabType.types.map((type) => {
      if (!ts.isLiteralTypeNode(type) || !ts.isStringLiteral(type.literal)) throw new Error("Expected literal tab");
      return type.literal.text;
    })).toEqual(tabNames);
    expect(tabState.arguments[0].getText(ast)).toBe('"positions"');

    const navigation = findNodes(globalDialog, ts.isJsxElement).filter((element) =>
      element.openingElement.tagName.getText(ast) === "button"
        && findNodes(element, ts.isCallExpression).some((call) => call.expression.getText(ast) === "setGlobalLedgerTab"),
    );
    expect(navigation.map((button) => {
      const click = attributeExpression(button, "onClick");
      const selected: string[] = [];
      compileExpression<() => void>(click, ["setGlobalLedgerTab"])((tab: string) => selected.push(tab))();
      return selected[0];
    })).toEqual(tabNames);
    expect(navigation.map((button) => button.children.filter(ts.isJsxText).map((text) => text.text.trim()).join("")))
      .toEqual(["持币量", "充值", "提现", "收入", "动态"]);
    expect(globalDialogSource).not.toMatch(/globalLedgerTab\s*===\s*["']funds["']|setGlobalLedgerTab\(["']funds["']\)/);
    for (const [index, tab] of [[1, "deposit"], [2, "withdrawal"]] as const) {
      const isPressed = compileExpression<boolean>(attributeExpression(navigation[index], "aria-pressed"), ["globalLedgerTab"]);
      for (const selected of tabNames) expect(isPressed(selected)).toBe(selected === tab);
    }
  });

  it("全局日志沿用真实 tRPC 端点与 ledgerId 52 / allUsers 范围", () => {
    expect(queryCall.expression.getText(ast)).toBe("trpc.ledger.t0GetPayoutLogs.useQuery");
    const input = compileExpression<Record<string, unknown>>(queryCall.arguments[0], [])();
    expect(input).toEqual({ ledgerId: 52, allUsers: true });
    const options = compileExpression<Record<string, unknown>>(queryOptions, [
      "canManage", "showGlobalLedger", "globalLedgerTab", "showTotalNetProfitDetail",
      "payoutTargetRelatedUserId", "canUseMemberPreview", "previewMemberPickerOpen",
    ])(true, true, "deposit", false, 0, false, false);
    expect(options).toMatchObject({ staleTime: 0, refetchOnWindowFocus: true });
  });

  it.each(tabNames)("只有管理员打开全局账本的充值/提现页才为 %s 标签启用日志查询", (tab) => {
    for (const canManage of [false, true]) {
      for (const showGlobalLedger of [false, true]) {
        expect(evaluateEnabled(canManage, showGlobalLedger, tab, false, 0, false, false))
          .toBe(canManage && showGlobalLedger && (tab === "deposit" || tab === "withdrawal"));
      }
    }
    expect(evaluateEnabled(true, true, "funds", false, 0, false, false)).toBe(false);
  });

  it("原总收益及成员预览加载路径保留，但所有路径均要求 canManage", () => {
    for (const canManage of [false, true]) {
      expect(evaluateEnabled(canManage, false, "positions", true, 0, false, false)).toBe(canManage);
      expect(evaluateEnabled(canManage, false, "positions", true, 28, false, false)).toBe(false);
      expect(evaluateEnabled(canManage, false, "positions", false, 0, true, true)).toBe(canManage);
      expect(evaluateEnabled(canManage, false, "positions", false, 0, true, false)).toBe(false);
      expect(evaluateEnabled(canManage, false, "positions", false, 0, false, true)).toBe(false);
    }
  });
});

describe("T+0 全局资金生产 useMemo 排序", () => {
  it("memo 依赖同时包含数据、独立排序状态及所选方向", () => {
    const dependencies = required(callInitializer("sortedGlobalFundsRows").arguments[1], "fund sort dependencies");
    if (!ts.isArrayLiteralExpression(dependencies)) throw new Error("Expected memo dependency array");
    expect(dependencies.elements.map((node) => node.getText(ast)))
      .toEqual(["globalFundsRows", "globalFundsSort", "globalPayoutDirection"]);
    expect(initialFundsSort).toEqual({ deposit: "desc", withdrawal: "desc" });
  });

  it.each([
    ["deposit", "desc", ["a", "b", "c", "z"]],
    ["deposit", "asc", ["z", "c", "a", "b"]],
    ["withdrawal", "desc", ["z", "c", "a", "b"]],
    ["withdrawal", "asc", ["a", "b", "c", "z"]],
  ] as const)("%s %s 只按所选金额排序，不受另一资金列/收入干扰", (direction, order, expectedIds) => {
    for (const otherOrder of ["asc", "desc"] as const) {
      const state: FundsSort = { deposit: otherOrder, withdrawal: otherOrder, [direction]: order };
      const snapshot = fixtureRows.map((row) => ({ ...row }));
      const sorted = sortRows(fixtureRows, state, direction);
      expect(sorted.map((row) => row.userId)).toEqual(expectedIds);
      expect(sorted).not.toBe(fixtureRows);
      expect(sorted.every((row) => fixtureRows.includes(row))).toBe(true);
      expect(fixtureRows).toEqual(snapshot);
      expect(state).toEqual({ deposit: otherOrder, withdrawal: otherOrder, [direction]: order });
    }
  });

  it("金额相同时固定按 zh-CN 姓名升序，切换金额方向也不反转姓名平局", () => {
    const chineseRows = [
      { ...fixtureRows[0], userId: "zhang", name: "张三", deposit: 20, withdrawal: 30 },
      { ...fixtureRows[1], userId: "li", name: "李四", deposit: 20, withdrawal: 30 },
    ];
    const sortSource = memoCallback("sortedGlobalFundsRows").getText(ast);
    expect(sortSource).toMatch(/left\.name\.localeCompare\(right\.name,\s*"zh-CN"\)/);
    for (const direction of ["deposit", "withdrawal"] as const) {
      for (const order of ["asc", "desc"] as const) {
        for (const rows of [chineseRows, [...chineseRows].reverse()]) {
          expect(sortRows(rows, { deposit: order, withdrawal: order }, direction).map((row) => row.userId))
            .toEqual(["li", "zhang"]);
        }
      }
    }
  });

  it("实际排序按钮只更新当前方向，切换标签保留另一标签的顺序且不改原状态", () => {
    const click = compileExpression<() => void>(attributeExpression(sortButton, "onClick"), [
      "globalPayoutDirection", "setGlobalFundsSort",
    ]);
    let state: FundsSort = { ...initialFundsSort };
    for (const [direction, expected] of [
      ["deposit", { deposit: "asc", withdrawal: "desc" }],
      ["withdrawal", { deposit: "asc", withdrawal: "asc" }],
      ["deposit", { deposit: "desc", withdrawal: "asc" }],
      ["withdrawal", { deposit: "desc", withdrawal: "desc" }],
    ] as const) {
      const previous = Object.freeze(state);
      const snapshot = { ...previous };
      click(direction, (update: (current: FundsSort) => FundsSort) => { state = update(previous); })();
      expect(state).toEqual(expected);
      expect(state).not.toBe(previous);
      expect(previous).toEqual(snapshot);
    }
    expect(sortButton.getText(ast)).toContain('globalFundsSort[globalPayoutDirection] === "desc" ? " ↓" : " ↑"');
  });

  it("空数组及单行安全返回新数组，冻结源行和源数组始终不变", () => {
    for (const rows of [Object.freeze([] as FundsRow[]), Object.freeze([fixtureRows[0]])]) {
      const sorted = sortRows(rows, initialFundsSort, "withdrawal");
      expect(sorted).toEqual(rows);
      expect(sorted).not.toBe(rows);
    }
  });
});

describe("T+0 全局资金金额、汇总及登记/选择契约", () => {
  const evaluateDirection = compileExpression<PayoutDirection>(required(variable("globalPayoutDirection").initializer, "payout direction"), ["globalLedgerTab"]);
  const evaluateLabel = compileExpression<string>(required(variable("globalPayoutLabel").initializer, "payout label"), ["globalPayoutDirection"]);
  const evaluateAmount = compileExpression<string>(directFormattedExpression(amountButton), [
    "row", "globalPayoutDirection", "formatPrice",
  ]);
  const summarySpan = required(findNodes(payoutSection, ts.isJsxElement).find((element) =>
    element.openingElement.tagName.getText(ast) === "span"
      && element.getText(ast).includes("formatPrice(globalFundsSummary[globalPayoutDirection])"),
  ), "selected-direction summary span");
  const evaluateSummaryAmount = compileExpression<string>(directFormattedExpression(summarySpan), [
    "globalFundsSummary", "globalPayoutDirection", "formatPrice",
  ]);
  const evaluateSummary = compileExpression<() => Record<string, number>>(memoCallback("globalFundsSummary"), ["globalFundsRows"]);

  it("共享资金 section 仅匹配充值和提现，不再显示合并资金表", () => {
    const sectionCondition = parentJsxExpression(payoutSection);
    if (!ts.isBinaryExpression(sectionCondition)) throw new Error("Expected payout section conditional");
    expect(sectionCondition.operatorToken.kind).toBe(ts.SyntaxKind.AmpersandAmpersandToken);
    const evaluateSectionGate = compileExpression<boolean>(sectionCondition.left, ["globalLedgerTab"]);
    for (const tab of [...tabNames, "funds"]) {
      expect(evaluateSectionGate(tab)).toBe(tab === "deposit" || tab === "withdrawal");
    }
    expect(payoutSection.getText(ast)).toContain("sortedGlobalFundsRows.map");
    expect(payoutSection.getText(ast)).toContain("{globalPayoutLabel}汇总");
    expect(payoutSection.getText(ast)).toContain("{globalPayoutLabel}金额（U）");
  });

  it.each([["deposit", "充值"], ["withdrawal", "提现"]] as const)("%s 标签显示相应行金额及汇总，并登记正确方向", (tab, label) => {
    const direction = evaluateDirection(tab);
    expect(direction).toBe(tab);
    expect(evaluateLabel(direction)).toBe(label);
    const formatPrice = vi.fn((value: number) => `formatted:${value}`);
    expect(evaluateAmount(fixtureRows[0], direction, formatPrice)).toBe(`formatted:${fixtureRows[0][tab]}`);
    expect(formatPrice).toHaveBeenLastCalledWith(fixtureRows[0][tab]);

    const summary = evaluateSummary(fixtureRows)();
    for (const key of ["deposit", "withdrawal"] as const) {
      expect(summary[key]).toBeCloseTo(fixtureRows.reduce((total, row) => total + row[key], 0));
    }
    expect(evaluateSummaryAmount(summary, direction, formatPrice)).toBe(`formatted:${summary[tab]}`);
    expect(formatPrice).toHaveBeenLastCalledWith(summary[tab]);

    const targetRow = { ...fixtureRows[0], userId: "28" };
    const events: unknown[][] = [];
    const onClick = compileExpression<() => void>(attributeExpression(amountButton, "onClick"), [
      "row", "globalPayoutDirection", "setRelatedUserFilterIds", "setSelectedAccountIds",
      "setRelatedFundFilterIds", "openPayoutEntryPage",
    ]);
    onClick(targetRow, direction,
      (ids: string[]) => events.push(["user", ids]),
      (ids: string[]) => events.push(["account", ids]),
      (ids: string[]) => events.push(["project", ids]),
      (selected: PayoutDirection, userId: number) => events.push(["register", selected, userId]),
    )();
    expect(events).toEqual([
      ["user", [targetRow.userId]], ["account", []], ["project", []], ["register", tab, 28],
    ]);
    expect(attributeExpression(amountButton, "aria-label").getText(ast)).toContain("登记${globalPayoutLabel}");
  });

  it("姓名点击仍单选原用户、清空账户和项目筛选，再关闭全局账本，不触发登记", () => {
    const events: unknown[][] = [];
    const click = compileExpression<() => void>(attributeExpression(nameButton, "onClick"), [
      "row", "setRelatedUserFilterIds", "setSelectedAccountIds", "setRelatedFundFilterIds", "setShowGlobalLedger",
    ]);
    click(fixtureRows[1],
      (ids: string[]) => events.push(["user", ids]),
      (ids: string[]) => events.push(["account", ids]),
      (ids: string[]) => events.push(["project", ids]),
      (visible: boolean) => events.push(["visible", visible]),
    )();
    expect(events).toEqual([
      ["user", [fixtureRows[1].userId]], ["account", []], ["project", []], ["visible", false],
    ]);
    expect(nameButton.getText(ast)).not.toContain("openPayoutEntryPage");
  });

  it("全局弹层仍由原 showGlobalLedger && canManage 条件包围", () => {
    const condition = parentJsxExpression(globalDialog);
    if (!ts.isBinaryExpression(condition)) throw new Error("Expected global dialog conditional");
    expect(condition.operatorToken.kind).toBe(ts.SyntaxKind.AmpersandAmpersandToken);
    expect(condition.left.getText(ast)).toMatch(/^showGlobalLedger\s*&&\s*canManage$/);
    const evaluateGate = compileExpression<boolean>(condition.left, ["showGlobalLedger", "canManage"]);
    for (const showGlobalLedger of [false, true]) {
      for (const canManage of [false, true]) expect(evaluateGate(showGlobalLedger, canManage)).toBe(showGlobalLedger && canManage);
    }
    expect(attribute(globalDialog, "role")?.initializer?.getText(ast)).toBe('"dialog"');
    expect(attribute(globalDialog, "aria-modal")?.initializer?.getText(ast)).toBe('"true"');
  });
});

// 所有计算仍提取自生产 AST；这里仅提供输入和无副作用的 UI/查询桩。
function productionFunction<T>(name: string): T {
  const declaration = required(findNodes(ast, ts.isFunctionDeclaration).find((node) => node.name?.text === name), name);
  const compiled = ts.transpileModule(declaration.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(`${compiled}\nreturn ${name};`)() as T;
}

function optionProperty(call: ts.CallExpression, name: string) {
  const options = required(call.arguments[1], "query options");
  if (!ts.isObjectLiteralExpression(options)) throw new Error("Expected production query options object");
  return required(options.properties.find((node): node is ts.PropertyAssignment =>
    ts.isPropertyAssignment(node) && node.name.getText(ast) === name,
  ), `${name} query option`).initializer;
}

type DepositLog = {
  id: string;
  relatedUserId: number;
  relatedUserName: string;
  direction: PayoutDirection;
  occurredOn: string;
  createdAt: string;
  amount: number;
};
const makeLog = (overrides: Partial<DepositLog> = {}): DepositLog => ({
  id: "1", relatedUserId: 28, relatedUserName: "张三", direction: "deposit",
  occurredOn: "2026-11-02", createdAt: "2026-11-02T08:00:00Z", amount: 0.1,
  ...overrides,
});
const evaluateDeposits = compileExpression<() => DepositLog[]>(memoCallback("globalDepositLogs"), ["globalPayoutLogs"]);
const evaluateDepositFilter = compileExpression<() => DepositLog[]>(memoCallback("filteredGlobalDepositLogs"), [
  "globalDepositLogs", "globalDepositUserFilter",
]);
const evaluateDepositTotal = compileExpression<() => number>(memoCallback("filteredGlobalDepositTotal"), ["filteredGlobalDepositLogs"]);
const evaluateDepositUsers = compileExpression<() => { id: number; name: string }[]>(memoCallback("globalDepositUsers"), ["globalDepositLogs"]);
const beijingDate = productionFunction<(date?: Date) => string>("getBeijingDateInputValue");
const calendarDateUtc = productionFunction<(date: string) => number | null>("getT0CalendarDateUtc");
type DepositOverview = {
  people: number; total: number; average: number; count: number;
  lastSevenDays: number; naturalWeek: number;
  lastSevenDaysStart: string; naturalWeekStart: string; today: string;
};
const evaluateOverview = compileExpression<() => DepositOverview>(memoCallback("globalDepositOverview"), [
  "globalDepositLogs", "getBeijingDateInputValue", "getT0CalendarDateUtc",
]);
function overviewAt(instant: string, logs: DepositLog[]) {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date(instant));
    return evaluateOverview(logs, beijingDate, calendarDateUtc)();
  } finally {
    vi.useRealTimers();
  }
}

describe("T+0 全局充值全量流水与生产统计", () => {
  it("充值流水只保留合法关联用户的 deposit，并按日期/创建时间/数字ID降序，不修改源数组", () => {
    const rows = Object.freeze([
      makeLog({ id: "2", occurredOn: "2026-11-01" }),
      makeLog({ id: "3", createdAt: "2026-11-02T07:00:00Z" }),
      makeLog({ id: "9" }), makeLog({ id: "10" }),
      makeLog({ id: "999", direction: "withdrawal", occurredOn: "2026-12-01" }),
      makeLog({ id: "998", relatedUserId: 0 }), makeLog({ id: "997", relatedUserId: -1 }),
    ].map((row) => Object.freeze(row)));
    const snapshot = rows.map((row) => ({ ...row }));
    const result = evaluateDeposits(rows)();
    expect(result.map((row) => row.id)).toEqual(["10", "9", "3", "2"]);
    expect(result).not.toBe(rows);
    expect(rows).toEqual(snapshot);
    expect(result.every((row) => rows.includes(row))).toBe(true);
    expect(evaluateDeposits([])()).toEqual([]);
  });

  it("单用户筛选为精确数值 ID 而非姓名/前缀；全部及单用户均无20笔截断", () => {
    const rows = Array.from({ length: 73 }, (_, index) => makeLog({
      id: String(index + 1), relatedUserId: index < 55 ? 28 : 280, relatedUserName: "同名用户",
    }));
    const deposits = evaluateDeposits(rows)();
    expect(deposits).toHaveLength(73);
    expect(evaluateDepositFilter(deposits, "")()).toBe(deposits);
    expect(evaluateDepositFilter(deposits, "28")()).toEqual(deposits.filter((log) => log.relatedUserId === 28));
    expect(evaluateDepositFilter(deposits, "28")()).toHaveLength(55);
    expect(evaluateDepositFilter(deposits, "280")()).toHaveLength(18);
    for (const filter of ["2", "张三", "999", "28.5"]) expect(evaluateDepositFilter(deposits, filter)()).toEqual([]);
    const list = required(findNodes(globalDialog, ts.isJsxElement).find((element) =>
      element.openingElement.tagName.getText(ast) === "section"
        && attribute(element, "aria-label")?.initializer?.getText(ast) === '"全量充值记录"',
    ), "full deposit log list");
    expect(list.getText(ast)).toContain("filteredGlobalDepositLogs.map");
    expect(list.getText(ast)).not.toMatch(/\.slice\s*\(\s*0\s*,\s*20\s*\)/);
    expect(list.getText(ast)).toContain("globalDepositUsers.map");
    expect(list.getText(ast)).toContain("formatPrice(filteredGlobalDepositTotal)");
  });

  it("筛选合计按逐笔分为单位累加，0.1/0.2及长列表不发生浮点漂移", () => {
    expect(evaluateDepositTotal([makeLog({ amount: 0.1 }), makeLog({ amount: 0.2 })])()).toBe(0.3);
    const rows = Array.from({ length: 1001 }, (_, index) => makeLog({ id: String(index), amount: 0.01 }));
    expect(evaluateDepositTotal(rows)()).toBe(10.01);
    expect(evaluateDepositTotal([makeLog({ amount: 1.234 }), makeLog({ amount: 2.346 })])()).toBe(3.58);
    expect(evaluateDepositTotal([])()).toBe(0);
    const mixed = [makeLog({ amount: 0.1 }), makeLog({ relatedUserId: 29, amount: 999 }), makeLog({ amount: 0.2 })];
    expect(evaluateDepositTotal(evaluateDepositFilter(mixed, "28")())()).toBe(0.3);
  });

  it("充值用户选项按 ID 去重、保留首条姓名、同名不同 ID 不合并，姓名按 zh-CN 排序", () => {
    const rows = [
      makeLog({ relatedUserId: 28, relatedUserName: "张三" }),
      makeLog({ relatedUserId: 29, relatedUserName: "李四" }),
      makeLog({ relatedUserId: 28, relatedUserName: "历史旧名" }),
      makeLog({ relatedUserId: 30, relatedUserName: "李四" }),
    ];
    expect(evaluateDepositUsers(rows)()).toEqual([
      { id: 29, name: "李四" }, { id: 30, name: "李四" }, { id: 28, name: "张三" },
    ]);
    expect(evaluateDepositUsers([])()).toEqual([]);
  });

  const datedLogs = [
    makeLog({ id: "1", occurredOn: "2026-10-26", amount: 1 }),
    makeLog({ id: "2", occurredOn: "2026-10-27", amount: 2 }),
    makeLog({ id: "3", occurredOn: "2026-11-01", amount: 3 }),
    makeLog({ id: "4", occurredOn: "2026-11-02", amount: 4 }),
    makeLog({ id: "5", occurredOn: "2026-11-03", amount: 5, relatedUserId: 29 }),
    makeLog({ id: "6", occurredOn: "2026-02-30", amount: 6, relatedUserId: 29 }),
    makeLog({ id: "7", occurredOn: "2026-11-02", amount: 0.1 }),
    makeLog({ id: "8", occurredOn: "2026-11-02", amount: 0.2 }),
  ];

  it("北京已到周一而 UTC 仍为周日：人数去重/累计/人均及含今日近7天正确，自然周从周一重置", () => {
    expect(beijingDate(new Date("2026-11-01T16:30:00Z"))).toBe("2026-11-02");
    expect(overviewAt("2026-11-01T16:30:00Z", datedLogs)).toEqual({
      people: 2, total: 21.3, average: 10.65, count: 8,
      lastSevenDays: 9.3, naturalWeek: 4.3,
      lastSevenDaysStart: "10/27", naturalWeekStart: "11/02", today: "11/02",
    });
  });

  it("北京周日仍属于此前周一开始的自然周，午夜跨周前不会提前排除上周周一", () => {
    expect(beijingDate(new Date("2026-11-01T15:59:59Z"))).toBe("2026-11-01");
    expect(overviewAt("2026-11-01T15:59:59Z", datedLogs)).toMatchObject({
      people: 2, total: 21.3, average: 10.65, count: 8,
      lastSevenDays: 6, naturalWeek: 6,
      lastSevenDaysStart: "10/26", naturalWeekStart: "10/26", today: "11/01",
    });
  });

  it.each([
    ["2026-12-31T16:01:00Z", "12/26", "12/28", "01/01"],
    ["2024-03-02T16:01:00Z", "02/26", "02/26", "03/03"],
  ])("%s 跨年/闰月计算日历起点且无数据人数/金额/人均全为0", (instant, sevenStart, weekStart, today) => {
    expect(overviewAt(instant, [])).toEqual({
      people: 0, total: 0, average: 0, count: 0, lastSevenDays: 0, naturalWeek: 0,
      lastSevenDaysStart: sevenStart, naturalWeekStart: weekStart, today,
    });
  });

  it("总览统计与单用户筛选解耦，生产 memo 依赖完整充值流水而非筛选结果", () => {
    for (const name of ["globalDepositOverview", "globalDepositUsers"]) {
      expect(callInitializer(name).arguments[1].getText(ast)).toBe("[globalDepositLogs]");
      expect(memoCallback(name).getText(ast)).not.toContain("filteredGlobalDepositLogs");
    }
    const rows = [makeLog({ amount: 0.1 }), makeLog({ amount: 0.2, relatedUserId: 29 })];
    expect(overviewAt("2026-11-02T00:00:00Z", rows)).toMatchObject({ people: 2, total: 0.3, average: 0.15, count: 2 });
  });
});

const evaluateUrlDirection = compileExpression<PayoutDirection | null>(required(variable("payoutEntryDirection").initializer, "URL payout direction"), ["searchParams"]);
const evaluateUrlUserValue = compileExpression<number>(required(variable("payoutUserIdFromUrlValue").initializer, "URL payout user value"), ["searchParams"]);
const evaluateUrlUser = compileExpression<number>(required(variable("payoutUserIdFromUrl").initializer, "URL payout user"), ["payoutEntryDirection", "payoutUserIdFromUrlValue"]);
const evaluateTarget = compileExpression<number>(required(variable("payoutTargetRelatedUserId").initializer, "payout target"), [
  "isUserPreview", "previewUserId", "isMemberView", "activeJournalData", "canManage", "payoutUserIdFromUrl", "relatedUserFilterIds",
]);

describe("T+0 操作页 URL 与目标用户优先级", () => {
  it.each(["deposit", "withdrawal"] as const)("%s URL 只接受正整数用户ID且保留资金方向", (direction) => {
    for (const [value, expected] of [["28", 28], ["280", 280], ["", 0], ["0", 0], ["-1", 0], ["28.5", 0], ["abc", 0], ["Infinity", 0]] as const) {
      const searchParams = new URLSearchParams({ payout: direction, payoutUserId: value });
      const selected = evaluateUrlDirection(searchParams);
      expect(selected).toBe(direction);
      expect(evaluateUrlUser(selected, evaluateUrlUserValue(searchParams))).toBe(expected);
    }
    const missing = new URLSearchParams({ payout: direction });
    expect(evaluateUrlUser(evaluateUrlDirection(missing), evaluateUrlUserValue(missing))).toBe(0);
  });

  it.each(["", "funds", "Deposit"])("没有有效操作方向 %s 时 payoutUserId 不影响当前用户", (direction) => {
    const params = new URLSearchParams({ payout: direction, payoutUserId: "28" });
    expect(evaluateUrlDirection(params)).toBeNull();
    expect(evaluateUrlUser(evaluateUrlDirection(params), evaluateUrlUserValue(params))).toBe(0);
  });

  it("只有管理员能采用 URL 用户，URL 优先于旧筛选；非管理员不能借 URL 切换他人", () => {
    expect(evaluateTarget(false, null, false, undefined, true, 28, ["29"])).toBe(28);
    expect(evaluateTarget(false, null, false, undefined, false, 28, ["29"])).toBe(0);
    expect(evaluateTarget(false, null, false, undefined, true, 0, ["29"])).toBe(29);
    for (const selected of [[], ["28", "29"], ["abc"], ["28.5"]]) {
      expect(evaluateTarget(false, null, false, undefined, true, 0, selected)).toBe(0);
    }
  });

  it("用户预览优先级最高、成员视角次之，均不受管理员 URL/旧筛选劫持", () => {
    for (const canManage of [false, true]) {
      expect(evaluateTarget(true, 31, true, { viewerRelatedUserId: 32 }, canManage, 28, ["29"])).toBe(31);
      expect(evaluateTarget(false, null, true, { viewerRelatedUserId: "32" }, canManage, 28, ["29"])).toBe(32);
      expect(evaluateTarget(false, null, true, undefined, canManage, 28, ["29"])).toBe(0);
    }
  });

  const setters = [
    "setEditingPayoutLog", "setPayoutAmount", "setPayoutDepositInputMode", "setPayoutEthQuantity",
    "setPayoutEthReferencePrice", "setPayoutEthReferencePriceIsManual", "setPayoutNote",
    "setPayoutSubmitNotice", "setPayoutOccurredOn", "setShowPayoutLog",
  ];
  const open = compileExpression<(direction: PayoutDirection, userId?: unknown) => void>(
    required(variable("openPayoutEntryPage").initializer, "open payout entry callback"),
    ["payoutTargetRelatedUserId", "ledgerId", "getBeijingDateInputValue", "setLocation", ...setters],
  );
  it.each(["deposit", "withdrawal"] as const)("openPayoutEntryPage %s 显式ID和默认ID都直接绑定URL，且重置表单不触发业务写操作", (direction) => {
    const location = vi.fn();
    const reset = setters.map(() => vi.fn());
    const click = open(29, 52, () => "2026-11-02", location, ...reset);
    click(direction, 28);
    expect(location).toHaveBeenLastCalledWith(`/ledger/52/t0-journal?payout=${direction}&payoutUserId=28`);
    click(direction);
    expect(location).toHaveBeenLastCalledWith(`/ledger/52/t0-journal?payout=${direction}&payoutUserId=29`);
    click(direction, "30");
    expect(location).toHaveBeenLastCalledWith(`/ledger/52/t0-journal?payout=${direction}&payoutUserId=30`);
    const expectedReset = [null, "", "u", "", "", false, "", null, "2026-11-02", false];
    reset.forEach((setter, index) => expect(setter).toHaveBeenLastCalledWith(expectedReset[index]));
  });

  it.each([0, -1, 28.5, "abc", Infinity, null])("openPayoutEntryPage 不将非法目标 %s 写入URL", (target) => {
    const location = vi.fn();
    open(0, 52, () => "2026-11-02", location, ...setters.map(() => vi.fn()))("deposit", target);
    expect(location).toHaveBeenCalledWith("/ledger/52/t0-journal?payout=deposit");
  });
  it("openPayoutEntryPage 无合法默认用户时也不产生非法参数", () => {
    const location = vi.fn();
    open(0, 52, () => "2026-11-02", location, ...setters.map(() => vi.fn()))("withdrawal");
    expect(location).toHaveBeenCalledWith("/ledger/52/t0-journal?payout=withdrawal");
  });
});

describe("T+0 操作页缓存、流水读取与展示隔离", () => {
  const personalQuery = callInitializer("t0PayoutLogsQuery");
  const evaluateInitialData = compileExpression<() => unknown>(optionProperty(personalQuery, "initialData"), [
    "canManage", "isUserPreview", "payoutEntryDirection", "payoutTargetRelatedUserId", "t0Utils",
  ]);
  const scopedLogs = compileExpression<() => DepositLog[]>(memoCallback("payoutLogs"), ["t0PayoutLogsQuery", "payoutTargetRelatedUserId"]);

  it("管理员操作页仅从全局只读缓存中初始化当前用户，不混入他人，且没有截断", () => {
    const cached = Object.freeze(Array.from({ length: 63 }, (_, index) => Object.freeze(makeLog({
      id: String(index), relatedUserId: index < 55 ? 28 : 29,
    }))));
    const getData = vi.fn(() => cached);
    const utils = { ledger: { t0GetPayoutLogs: { getData } } };
    const result = evaluateInitialData(true, false, "deposit", 28, utils)();
    expect(result).toEqual(cached.filter((log) => log.relatedUserId === 28));
    expect(result).toHaveLength(55);
    expect(result).not.toBe(cached);
    expect(getData).toHaveBeenCalledTimes(1);
    expect(getData).toHaveBeenCalledWith({ ledgerId: 52, allUsers: true });
    expect(evaluateInitialData(true, false, "withdrawal", 999, utils)()).toEqual([]);
    getData.mockReturnValue(undefined as never);
    expect(evaluateInitialData(true, false, "deposit", 28, utils)()).toBeUndefined();
    expect(optionProperty(personalQuery, "initialDataUpdatedAt").getText(ast)).toBe("0");
    expect(optionProperty(personalQuery, "staleTime").getText(ast)).toBe("0");
  });

  it("非管理员/用户预览/非操作页/无目标用户不读取全局缓存", () => {
    const getData = vi.fn(() => [makeLog()]);
    const utils = { ledger: { t0GetPayoutLogs: { getData } } };
    for (const args of [
      [false, false, "deposit", 28], [true, true, "deposit", 28],
      [true, false, null, 28], [true, false, "deposit", 0], [true, false, "deposit", -1],
    ]) expect(evaluateInitialData(...args, utils)()).toBeUndefined();
    expect(getData).not.toHaveBeenCalled();
  });

  it("单用户查询携带绑定ID及预览ID，只有有访问权且目标为正数时启用", () => {
    const input = compileExpression<Record<string, unknown>>(personalQuery.arguments[0], ["payoutTargetRelatedUserId", "previewUserId"]);
    expect(input(28, null)).toEqual({ ledgerId: 52, relatedUserId: 28, previewUserId: undefined });
    expect(input(31, 31)).toEqual({ ledgerId: 52, relatedUserId: 31, previewUserId: 31 });
    const enabled = compileExpression<boolean>(optionProperty(personalQuery, "enabled"), ["canAccess", "payoutTargetRelatedUserId"]);
    for (const access of [false, true]) for (const target of [0, -1, 28]) expect(enabled(access, target)).toBe(access && target > 0);
  });

  it("生产 payoutLogs 在请求切换或污染缓存时仍按当前目标二次过滤，不能展示他人流水", () => {
    const rows = [makeLog({ relatedUserId: 28 }), makeLog({ id: "2", relatedUserId: 29 }), makeLog({ id: "3", relatedUserId: 28 })];
    expect(scopedLogs({ data: rows }, 28)().map((log) => log.id)).toEqual(["1", "3"]);
    expect(scopedLogs({ data: rows }, 29)().map((log) => log.id)).toEqual(["2"]);
    expect(scopedLogs({ data: rows }, 30)()).toEqual([]);
    for (const target of [0, -1, 28.5, NaN]) expect(scopedLogs({ data: rows }, target)()).toEqual([]);
    expect(scopedLogs({ data: undefined }, 28)()).toEqual([]);
  });

  const entryPage = required(findNodes(ast, ts.isIfStatement).find((node) => node.expression.getText(ast) === "payoutEntryDirection"), "payout entry route");
  const recordSection = required(findNodes(entryPage, ts.isJsxElement).find((element) =>
    element.openingElement.tagName.getText(ast) === "section" && attribute(element, "aria-label")?.initializer?.getText(ast) === "{entryFlowTitle}",
  ), "entry user records section");
  it("操作页用户记录区位于日期/金额录入区之前；非法权限/无选定用户先被拦截", () => {
    const inputs = findNodes(entryPage, ts.isJsxSelfClosingElement).filter((node) => node.tagName.getText(ast) === "input");
    expect(inputs.length).toBeGreaterThan(0);
    expect(recordSection.end).toBeLessThan(Math.min(...inputs.map((node) => node.pos)));
    expect(recordSection.getText(ast)).toContain("payoutTargetUserIdentity.name");
    const guard = required(findNodes(entryPage, ts.isIfStatement).find((node) => node.expression.getText(ast) === "!canManage || payoutTargetRelatedUserId <= 0"), "entry permission guard");
    const enabled = compileExpression<boolean>(guard.expression, ["canManage", "payoutTargetRelatedUserId"]);
    expect(guard.end).toBeLessThan(recordSection.pos);
    for (const manage of [false, true]) for (const target of [0, -1, 28]) expect(enabled(manage, target)).toBe(!manage || target <= 0);
  });

  it("执行生产记录区 JSX 条件：加载/加载失败有独立状态与重试，不伪装暂无记录", () => {
    const stateExpression = required(recordSection.children.find((child): child is ts.JsxExpression =>
      ts.isJsxExpression(child) && Boolean(child.expression && ts.isConditionalExpression(child.expression)),
    )?.expression, "record loading/error/empty conditional");
    type Element = { type: unknown; props: Record<string, unknown> | null; children: unknown[] };
    const React = { createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Element => ({ type, props, children }) };
    const text = (node: unknown): string => {
      if (node == null || typeof node === "boolean") return "";
      if (typeof node !== "object") return String(node);
      if (Array.isArray(node)) return node.map(text).join("");
      return (node as Element).children.map(text).join("");
    };
    const elements = (node: unknown): Element[] => {
      if (Array.isArray(node)) return node.flatMap(elements);
      if (!node || typeof node !== "object") return [];
      const element = node as Element;
      return [element, ...element.children.flatMap(elements)];
    };
    const render = compileExpression<Element>(stateExpression, ["React", "t0PayoutLogsQuery", "entryLogs", "entryFlowTitle", "renderPayoutLogRow"]);
    const refetch = vi.fn();
    const rowRenderer = vi.fn((log: DepositLog) => React.createElement("article", null, `流水:${log.id}`));
    for (const title of ["充值记录", "提取流水"]) {
      const loading = render(React, { isLoading: true, isError: false, refetch }, [], title, rowRenderer);
      expect(text(loading)).toContain(`正在加载该用户的${title}`);
      expect(text(loading)).not.toContain("暂无");
      const failed = render(React, { isLoading: false, isError: true, refetch }, [], title, rowRenderer);
      expect(text(failed)).toContain("记录加载失败");
      expect(text(failed)).not.toContain("暂无");
      const retry = required(elements(failed).find((element) => element.type === "button"), "retry button");
      (retry.props?.onClick as () => void)();
      const empty = render(React, { isLoading: false, isError: false, refetch }, [], title, rowRenderer);
      expect(text(empty)).toBe(`暂无${title}记录`);
      const existing = render(React, { isLoading: false, isError: true, refetch }, [makeLog()], title, rowRenderer);
      expect(text(existing)).toBe("流水:1");
      expect(text(existing)).not.toContain("暂无");
    }
    expect(refetch).toHaveBeenCalledTimes(2);
    expect(rowRenderer).toHaveBeenCalledTimes(2);
  });

  it("全局/管理员单用户 SQL 无5000/500笔上限且保留账本、所有者与用户读隔离；成员仍锁定本人", () => {
    const backendSource = readFileSync(new URL("./ledger52-t0-journal.ts", import.meta.url), "utf8");
    const backendAst = ts.createSourceFile("ledger52-t0-journal.ts", backendSource, ts.ScriptTarget.Latest, true);
    const reader = required(findNodes(backendAst, ts.isFunctionDeclaration).find((node) => node.name?.text === "getLedger52T0JournalPayoutLogs"), "payout SQL reader");
    const declaration = (name: string) => required(findNodes(reader, ts.isVariableDeclaration).find((node) => node.name.getText(backendAst) === name), name);
    expect(declaration("readAllUsers").initializer?.getText(backendAst)).toBe("Boolean(adminScope && input.allUsers)");
    expect(declaration("relatedUserId").initializer?.getText(backendAst)).toBe("readAllUsers ? 0 : (adminScope ? requestedRelatedUserId : memberScope?.relatedUserId || 0)");
    const sql = required(declaration("sql").initializer, "payout SQL expression");
    if (!ts.isConditionalExpression(sql) || !ts.isConditionalExpression(sql.whenFalse)) throw new Error("Expected global/admin/member SQL branches");
    const globalSql = sql.whenTrue.getText(backendAst);
    const adminSql = sql.whenFalse.whenTrue.getText(backendAst);
    const memberSql = sql.whenFalse.whenFalse.getText(backendAst);
    expect(globalSql).toContain("WHERE payout.ledger_id = ? AND payout.user_id = ?");
    expect(adminSql).toContain("WHERE payout.ledger_id = ? AND payout.user_id = ? AND payout.related_user_id = ?");
    expect(memberSql).toContain("WHERE payout.ledger_id = ? AND payout.related_user_id = ?");
    expect(memberSql).toMatch(/\bLIMIT\s+500\b/i);
    for (const query of [globalSql, adminSql]) {
      expect(query).not.toMatch(/\bLIMIT\b/i);
      expect(query).toContain("ORDER BY payout.occurred_on DESC, payout.id DESC");
    }
    expect(declaration("params").initializer?.getText(backendAst)).toMatch(/readAllUsers\s*\?\s*\[LEDGER_52_T0_JOURNAL_ID, adminScope!\.journalOwnerUserId\]\s*:\s*adminScope\s*\?\s*\[LEDGER_52_T0_JOURNAL_ID, adminScope\.journalOwnerUserId, relatedUserId\]\s*:\s*\[LEDGER_52_T0_JOURNAL_ID, relatedUserId\]/);
    const body = reader.getText(backendAst);
    expect(body).toContain("!readAllUsers && (!Number.isInteger(relatedUserId) || relatedUserId <= 0)");
    expect(body).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s/i);
  });
});

describe("T+0 资金读取独立请求契约", () => {
  it("资金日志及可提额度命中生产 splitLink 独立 httpLink，不等待行情/重型查询的 batch", () => {
    const mainSource = readFileSync(new URL("../client/src/main.tsx", import.meta.url), "utf8");
    const mainAst = ts.createSourceFile("main.tsx", mainSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const split = required(findNodes(mainAst, ts.isCallExpression).find((node) => node.expression.getText(mainAst) === "splitLink"), "production splitLink");
    const options = required(split.arguments[0], "splitLink options");
    if (!ts.isObjectLiteralExpression(options)) throw new Error("Expected splitLink options object");
    const condition = required(options.properties.find((node): node is ts.MethodDeclaration =>
      ts.isMethodDeclaration(node) && node.name.getText(mainAst) === "condition",
    ), "independent request condition");
    const returnExpression = required(findNodes(condition, ts.isReturnStatement)[0]?.expression, "splitLink return expression");
    const opName = condition.parameters[0].name.getText(mainAst);
    const compiled = ts.transpileModule(`const isolated = (${opName}) => (${returnExpression.getText(mainAst)});`, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const selectIndependent = new Function(`${compiled}\nreturn isolated;`)() as (op: { path: string }) => boolean;
    expect(selectIndependent({ path: "ledger.t0GetPayoutLogs" })).toBe(true);
    expect(selectIndependent({ path: "ledger.t0GetPayoutAvailability" })).toBe(true);
    expect(selectIndependent({ path: "ledger.unrelatedRead" })).toBe(false);
    for (const [branch, link] of [["true", "httpLink"], ["false", "httpBatchLink"]]) {
      const property = required(options.properties.find((node): node is ts.PropertyAssignment =>
        ts.isPropertyAssignment(node) && node.name.getText(mainAst) === branch,
      ), `${branch} splitLink branch`);
      expect(ts.isCallExpression(property.initializer)).toBe(true);
      if (!ts.isCallExpression(property.initializer)) throw new Error("Expected HTTP link call");
      expect(property.initializer.expression.getText(mainAst)).toBe(link);
      expect(property.initializer.arguments[0].getText(mainAst)).toContain("fetch: trpcFetch");
    }
  });
});
