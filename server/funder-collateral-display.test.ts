import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// 仅提取并执行实际源码中的纯 helper、JSX 与 hooks：不导入应用、tRPC、数据库或行情服务。
// JSX 工厂只记录元素，子组件有独立 hooks 实例，时钟不会模拟成父卡重新渲染。
function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    readFileSync(new URL(path, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
}
const card = parse("../client/src/components/FunderOrderCard.tsx");
const silver = parse("../client/src/components/FunderOrderCardV2.tsx");
const unified = parse("../client/src/pages/FinanceUnified.tsx");
const management = parse("../client/src/pages/FunderManagement.tsx");
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing production AST: ${label}`);
  return value;
}
function nodes<T extends ts.Node>(
  root: ts.Node,
  predicate: (node: ts.Node) => node is T
): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}
function declaration(root: ts.Node, name: string): ts.FunctionDeclaration {
  return required(
    nodes(root, ts.isFunctionDeclaration).find(n => n.name?.text === name),
    name
  );
}
function initializer(root: ts.Node, name: string): ts.Expression {
  return required(
    nodes(root, ts.isVariableDeclaration).find(n => n.name.getText() === name)
      ?.initializer,
    name
  );
}
function calls(root: ts.Node, name: string): ts.CallExpression[] {
  return nodes(root, ts.isCallExpression).filter(
    n => n.expression.getText() === name
  );
}
function plainFunction(node: ts.FunctionDeclaration): string {
  return node.getText().replace(/^export\s+(?:default\s+)?/, "");
}
function compiled(code: string): string {
  const ast = ts.createSourceFile(
    "isolated.tsx",
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  if (
    nodes(ast, ts.isImportDeclaration).length ||
    nodes(ast, ts.isCallExpression).some(
      n => n.expression.kind === ts.SyntaxKind.ImportKeyword
    )
  )
    throw new Error("Imports prohibited in offline VM");
  return ts.transpileModule(code, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
      jsx: ts.JsxEmit.React,
      jsxFactory: "__element",
      jsxFragmentFactory: "__fragment",
    },
  }).outputText;
}
type Element = {
  tag: unknown;
  props: Record<string, any>;
  children: unknown[];
};
const element = (
  tag: unknown,
  props: Record<string, any> | null,
  ...children: unknown[]
): Element => ({ tag, props: props ?? {}, children });
function isElement(value: unknown): value is Element {
  return (
    !!value &&
    typeof value === "object" &&
    "tag" in value &&
    "children" in value
  );
}
function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  return isElement(value) ? [value, ...value.children.flatMap(elements)] : [];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (isElement(value)) return value.children.map(text).join("");
  return value == null || typeof value === "boolean" ? "" : String(value);
}
function button(tree: unknown, label: string): Element {
  return required(
    elements(tree).find(e => e.tag === "button" && text(e).trim() === label),
    `button ${label}`
  );
}
const helperNames = [
  "formatWalletStyleAssetAmount",
  "formatFunderCollateralPopupAmount",
  "formatFunderCollateralPopupQuantity",
  "formatFunderCollateralGap",
  "getFunderOrderAssetQuantityLabel",
  "findFunderCollateralPopupSourceOrder",
  "FunderCollateralAssetTypeBadge",
  "FunderCollateralPopupLiveClock",
  "FunderSharedHoldingSectionHeading",
  "FunderSharedCollateralSectionHeading",
  "FunderSharedCollateralCalculationNotes",
];
const helpers = [
  `const funderPopupClockFormatter = ${initializer(card, "funderPopupClockFormatter").getText()};`,
  ...helperNames.map(name => plainFunction(declaration(card, name))),
].join("\n");
function vm(bindings: Record<string, unknown> = {}, code = helpers) {
  const forbiddenAccess = vi.fn((name: string): never => {
    throw new Error(`Forbidden offline dependency: ${name}`);
  });
  const context = createContext({
    __element: element,
    __fragment: "fragment",
    trpc: new Proxy(
      {},
      { get: (_target, name) => forbiddenAccess(String(name)) }
    ),
    fetch: () => forbiddenAccess("fetch"),
    ...bindings,
  });
  new Script(compiled(code)).runInContext(context, { timeout: 1000 });
  const evaluate = <T = any>(
    expression: string,
    values: Record<string, unknown> = {}
  ): T => {
    Object.assign(context, values);
    return new Script(compiled(`(${expression});`)).runInContext(context, {
      timeout: 1000,
    }) as T;
  };
  return { context, evaluate, forbiddenAccess };
}
const pure = vm();
function invoke<T = string>(name: string, ...args: unknown[]): T {
  return pure.evaluate<T>(`${name}(...args)`, { args });
}

// 最小 hooks runner：状态/ref 持续存在，effect 比较依赖、在更新/卸载时清理。
// 手动 rerender 只针对当前组件实例；不会调用记录树中其他组件或父卡的资金函数。
function hooks(bindings: Record<string, unknown> = {}, code = helpers) {
  const slots: any[] = [];
  const effects: Array<{ deps?: unknown[]; cleanup?: () => void }> = [];
  let cursor = 0;
  let effectCursor = 0;
  let pending: Array<() => void> = [];
  let renderCount = 0;
  const stateWrites = vi.fn();
  const changed = (old: unknown[] | undefined, next: unknown[] | undefined) =>
    !old ||
    !next ||
    old.length !== next.length ||
    old.some((v, i) => !Object.is(v, next[i]));
  const useState = (initial: any) => {
    const index = cursor++;
    if (!(index in slots))
      slots[index] = typeof initial === "function" ? initial() : initial;
    return [
      slots[index],
      (next: any) => {
        slots[index] = typeof next === "function" ? next(slots[index]) : next;
        stateWrites(index, slots[index]);
      },
    ];
  };
  const useRef = (initial: unknown) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = { current: initial };
    return slots[index];
  };
  const useCallback = (callback: unknown, deps: unknown[]) => {
    const index = cursor++;
    if (!slots[index] || changed(slots[index].deps, deps))
      slots[index] = { value: callback, deps };
    return slots[index].value;
  };
  const useEffect = (
    callback: () => (() => void) | undefined,
    deps?: unknown[]
  ) => {
    const index = effectCursor++;
    if (!effects[index] || changed(effects[index].deps, deps))
      pending.push(() => {
        effects[index]?.cleanup?.();
        effects[index] = { deps, cleanup: callback() };
      });
  };
  const runtime = vm(
    { useState, useRef, useCallback, useEffect, ...bindings },
    code
  );
  const render = (expression: string, values: Record<string, unknown> = {}) => {
    cursor = effectCursor = 0;
    pending = [];
    renderCount++;
    const tree = runtime.evaluate(expression, values);
    pending.forEach(effect => effect());
    return tree;
  };
  return {
    ...runtime,
    render,
    stateWrites,
    renders: () => renderCount,
    unmount: () => {
      effects.forEach(effect => effect.cleanup?.());
      effects.length = 0;
    },
  };
}

const managementFunction = declaration(management, "FunderManagement");
const openCreate = initializer(managementFunction, "handleOpenCreate");
const managementStatements = required(
  managementFunction.body,
  "management body"
).statements;
const actionRefIndex = managementStatements.findIndex(statement =>
  nodes(statement, ts.isVariableDeclaration).some(
    n => n.name.getText() === "createOrderActionRef"
  )
);
if (actionRefIndex < 0)
  throw new Error("Missing create action ref registration");
const registrationCode = [
  "function RegisterCreateOrder({ ledgerData, financeOnly, onCreateOrderRef }) {",
  `const isAdminUser = ${initializer(managementFunction, "isAdminUser").getText()};`,
  `const handleOpenCreate = ${openCreate.getText()};`,
  ...managementStatements
    .slice(actionRefIndex, actionRefIndex + 3)
    .map(n => n.getText()),
  "}",
].join("\n");
function createHarness() {
  const bindings: Record<string, any> = {
    DEFAULT_DISPLAY_CONFIG: Object.freeze({ collateral: true }),
    getBeijingToday: () => "2026-11-14",
    resetLinkedAmountFields: vi.fn(),
  };
  for (const call of nodes(openCreate, ts.isCallExpression)) {
    if (
      ts.isIdentifier(call.expression) &&
      call.expression.text.startsWith("set")
    )
      bindings[call.expression.text] = vi.fn();
  }
  for (const access of nodes(openCreate, ts.isPropertyAccessExpression)) {
    if (access.name.text === "current" && ts.isIdentifier(access.expression))
      bindings[access.expression.text] = { current: "old draft" };
  }
  return { ...hooks(bindings, registrationCode), bindings };
}
const unifiedCode = plainFunction(declaration(unified, "FinanceUnified"));
function pageHarness(ledgerId = 52, directRoute = false) {
  return hooks(
    {
      useRoute: (route: string) => [
        true,
        route.endsWith(directRoute ? "/funder-management" : "/finance-unified")
          ? { id: String(ledgerId) }
          : null,
      ],
      useLocation: () => ["/offline", vi.fn()],
      FunderManagement: "FunderManagement",
      ChevronLeft: "ChevronLeft",
      URLSearchParams,
      window: { location: { search: "" } },
    },
    unifiedCode
  );
}
function child(tree: unknown): Element {
  return required(
    elements(tree).find(e => e.tag === "FunderManagement"),
    "active management child"
  );
}
const legacyButton = required(
  nodes(managementFunction, ts.isJsxElement).find(
    n =>
      n.openingElement.tagName.getText() === "button" &&
      n.children.some(c => ts.isJsxText(c) && c.text.trim() === "添加订单")
  ),
  "legacy create button"
);
function ancestorGuards(node: ts.Node): ts.Expression[] {
  const guards: ts.Expression[] = [];
  for (let current = node; current.parent; current = current.parent) {
    const parent = current.parent;
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
      parent.right === current
    )
      guards.push(parent.left);
  }
  return guards;
}
const legacyExpression = `(${ancestorGuards(legacyButton)
  .map(n => `(${n.getText()})`)
  .join(" && ")}) ? (${legacyButton.getText()}) : null`;

describe("52蓝色页头创建入口：执行实际父子hooks与旧表单动作", () => {
  it.each([false, true])(
    "管理员左/中侧添加订单四字无加号，复用handleOpenCreate；直达地址=%s",
    directRoute => {
      const page = pageHarness(52, directRoute);
      let tree = page.render("FinanceUnified()");
      expect(
        elements(tree).some(e => e.props["aria-label"] === "添加融资付息订单")
      ).toBe(false);
      const form = createHarness();
      form.render("RegisterCreateOrder(props)", {
        props: { ...child(tree).props, ledgerData: { userRole: "admin" } },
      });
      tree = page.render("FinanceUnified()");
      const add = button(tree, "添加订单");
      expect(text(add).trim()).toHaveLength(4);
      expect(elements(add)).toHaveLength(1); // 无 Plus、svg 或其他加号元素
      const blueHeader = required(
        elements(tree).find(e =>
          e.props.style?.background?.includes("#1A56DB")
        ),
        "blue header"
      );
      expect(elements(blueHeader)).toContain(add);
      add.props.onClick();
      expect(form.bindings.setShowForm).toHaveBeenCalledWith(true);
      expect(form.bindings.setEditingOrder).toHaveBeenCalledWith(null);
      expect(form.bindings.setFormData).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 0,
          coin: "BTC",
          buyQuantity: "",
          amountCurrency: "USDT",
        })
      );
      expect(form.bindings.setOptionFormData).toHaveBeenCalledWith(
        expect.objectContaining({ buyQty: "", optionCurrency: "BTC" })
      );
      expect(form.bindings.primaryEditorDraftRef.current).toBeNull();
      expect(form.bindings.resetLinkedAmountFields).toHaveBeenCalledOnce();
      button(tree, "中侧（管理）").props.onClick();
      tree = page.render("FinanceUnified()");
      expect(child(tree).props.adminOnly).toBe(true);
      expect(button(tree, "添加订单")).toBeDefined();
      button(tree, "右侧（借方）").props.onClick();
      tree = page.render("FinanceUnified()");
      expect(child(tree).props.financeOnly).toBe(true);
      expect(
        elements(tree).some(e => e.props["aria-label"] === "添加融资付息订单")
      ).toBe(false);
      form.unmount();
      button(tree, "左侧（资方）").props.onClick();
      expect(
        elements(page.render("FinanceUnified()")).some(
          e => e.props["aria-label"] === "添加融资付息订单"
        )
      ).toBe(false);
      expect(page.forbiddenAccess).not.toHaveBeenCalled();
      expect(form.forbiddenAccess).not.toHaveBeenCalled();
    }
  );
  it.each(["owner", "admin", "member", "super_admin", "", undefined])(
    "现有账本角色%s与借方状态共同门控，不扩大权限",
    userRole => {
      for (const financeOnly of [false, true]) {
        const form = createHarness();
        const register = vi.fn();
        form.render("RegisterCreateOrder(props)", {
          props: {
            ledgerData: { userRole },
            financeOnly,
            onCreateOrderRef: register,
          },
        });
        const action = register.mock.calls[0][0];
        const allowed =
          ["owner", "admin"].includes(userRole ?? "") && !financeOnly;
        expect(typeof action === "function").toBe(allowed);
        if (!allowed) expect(action).toBeNull();
        expect(form.bindings.setShowForm).not.toHaveBeenCalled();
        form.unmount();
        expect(register).toHaveBeenLastCalledWith(null);
      }
    }
  );
  it("稳定注册ref调用最新原表单动作，依赖未变不反复注册，权限撤销即清除", () => {
    const form = createHarness();
    const register = vi.fn();
    const props = {
      ledgerData: { userRole: "admin" },
      onCreateOrderRef: register,
      financeOnly: false,
    };
    form.render("RegisterCreateOrder(props)", { props });
    const action = register.mock.calls[0][0];
    form.render("RegisterCreateOrder(props)", {
      props,
      getBeijingToday: () => "2026-12-01",
    });
    expect(register).toHaveBeenCalledOnce();
    action();
    expect(form.bindings.setFormData).toHaveBeenLastCalledWith(
      expect.objectContaining({ buyDate: "2026-12-01" })
    );
    form.render("RegisterCreateOrder(props)", {
      props: { ...props, ledgerData: { userRole: "member" } },
    });
    expect(register).toHaveBeenLastCalledWith(null);
    form.unmount();
  });
  it.each([52, 37, 0, 99])(
    "账本%s实际传参使旧筛选行添加按钮仅52撤下，类型筛选保留",
    ledgerId => {
      const page = pageHarness(ledgerId);
      const tree = page.render("FinanceUnified()");
      const onCreateOrderRef = child(tree).props.onCreateOrderRef;
      expect(typeof onCreateOrderRef === "function").toBe(ledgerId === 52);
      const old = vm({ Plus: "Plus" }, "");
      const open = vi.fn();
      for (const isAdminUser of [true, false])
        for (const financeOnly of [false, true]) {
          const rendered = old.evaluate(legacyExpression, {
            isAdminUser,
            financeOnly,
            onCreateOrderRef,
            handleOpenCreate: open,
          });
          const visible = isAdminUser && !financeOnly && ledgerId !== 52;
          expect(isElement(rendered)).toBe(visible);
          if (visible) {
            button(rendered, "添加订单").props.onClick();
            expect(open).toHaveBeenCalled();
          }
        }
      const filter = required(
        nodes(managementFunction, ts.isJsxElement).find(
          n =>
            n.openingElement.tagName.getText() === "select" &&
            nodes(n, ts.isJsxAttribute).some(
              a =>
                a.name.getText() === "value" &&
                a.initializer?.getText() === "{assetTypeFilter}"
            )
        ),
        "asset filter"
      );
      expect(ancestorGuards(filter).map(n => n.getText())).toEqual([
        "isAdminUser",
      ]);
      const select = old.evaluate(filter.getText(), {
        assetTypeFilter: "",
        setAssetTypeFilter: vi.fn(),
      });
      expect(
        elements(select)
          .filter(e => e.tag === "option")
          .map(text)
      ).toEqual(["全部", "股票", "数字币", "期权", "已结清"]);
    }
  );
});

describe("担保弹窗整数展示不改变其他精度或输入", () => {
  it.each([
    [34534.93, "34535"],
    [12.49, "12"],
    [12.5, "13"],
    [-12.5, "-13"],
    [-12.49, "-12"],
    [0.49, "0"],
    [-0.49, "0"],
    [-0, "0"],
    [0, "0"],
    ["-0.50", "-1"],
    ["1234.50", "1235"],
    [NaN, "--"],
    [Infinity, "--"],
    ["bad", "--"],
  ])("实际amount helper将%s格式化为%s", (amount, expected) => {
    expect(invoke("formatFunderCollateralPopupAmount", amount)).toBe(expected);
    expect(
      invoke("formatFunderCollateralPopupQuantity", " usdt ", amount)
    ).toBe(expected);
  });
  it.each([
    ["CNY", 12.345, "12.35"],
    ["ETH", 1.234567, "1.2346"],
    ["BTC", 0.12345678, "0.123457"],
    ["SOL", 0.00000123, "0.00000123"],
    ["ETH", -0.00000001, "-0.00000001"],
    ["AAVE", 1234.567, "1,234.57"],
    ["CNY", 10000.49, "10,000"],
  ])("%s原数量级精度保持%s→%s", (coin, amount, expected) => {
    expect(invoke("formatFunderCollateralPopupQuantity", coin, amount)).toBe(
      expected
    );
    expect(invoke("formatFunderCollateralPopupQuantity", coin, amount)).toBe(
      invoke("formatWalletStyleAssetAmount", coin, amount)
    );
  });
  it("旧主卡缺口仍两位；弹窗比例实际表达式继续使用原金额及两位百分比", () => {
    expect(invoke("formatFunderCollateralGap", 1234.56)).toBe("1,234.56");
    for (const ast of [card, silver]) {
      const ratio = required(
        nodes(ast, ts.isVariableDeclaration).find(
          n =>
            n.name.getText() === "marginRatio" &&
            n.initializer &&
            (n.initializer.getText().includes("totalGapBase") ||
              n.initializer.getText().includes("totalBuyValue"))
        ),
        "shared ratio"
      );
      const percent = required(
        nodes(ast, ts.isTemplateExpression).find(
          n =>
            n.getText().includes("marginRatio.toFixed(2)") &&
            n.getText().endsWith("%`")
        ),
        "shared percent text"
      );
      const diff = 34153.71;
      const base = 34534.93;
      const marginRatio = pure.evaluate(
        required(ratio.initializer, "ratio initializer").getText(),
        { diff, totalGapBase: base, totalBuyValue: base }
      );
      expect(marginRatio).toBeCloseTo((diff / base) * 100, 10);
      expect(pure.evaluate(percent.getText(), { marginRatio })).toBe(
        `+${((diff / base) * 100).toFixed(2)}%`
      );
      expect(marginRatio).not.toBe(
        (Number(invoke("formatFunderCollateralPopupAmount", diff)) /
          Number(invoke("formatFunderCollateralPopupAmount", base))) *
          100
      );
    }
    expect(pure.forbiddenAccess).not.toHaveBeenCalled();
  });
});

describe("真实持仓标签：期权张数、coin、零值及同源分段", () => {
  it.each([
    JSON.stringify({ coin: "sol", buyQty: 48.5 }),
    { coin: "sol", buyQty: 48.5 },
  ])(
    "option_info字符串/对象优先buyQty和真实标的，不拿旧ETH quantity/premium推算",
    option_info => {
      const summary = Object.freeze({
        assetType: "crypto_option",
        coin: "ETH",
        quantity: 0,
        principal: 100000,
      });
      const source = Object.freeze({
        option_info,
        buy_quantity: 999,
        buy_price: 99999,
      });
      const before = JSON.stringify([summary, source]);
      expect(invoke("getFunderOrderAssetQuantityLabel", summary, source)).toBe(
        "SOL × 48.5"
      );
      expect(JSON.stringify([summary, source])).toBe(before);
    }
  );
  it.each([0, "0"])("buyQty显式%s不被其他非零字段覆盖；现货0也可见", buyQty => {
    expect(
      invoke(
        "getFunderOrderAssetQuantityLabel",
        { assetType: "crypto_option", coin: "ETH", quantity: 99 },
        { option_info: { coin: "BTC", buyQty }, buy_quantity: 88 }
      )
    ).toBe("BTC × 0");
    expect(
      invoke("getFunderOrderAssetQuantityLabel", {
        coin: "USDT",
        quantity: buyQty,
        buy_quantity: 99,
      })
    ).toBe("USDT × 0");
  });
  it.each(["{broken", "[]", "null", "123", { buyQty: "bad" }])(
    "损坏或无效option_info %s安全回退，不抛错/不虚构张数",
    option_info => {
      expect(
        invoke(
          "getFunderOrderAssetQuantityLabel",
          { asset_type: "crypto_option", coin: "ETH", quantity: 7.25 },
          { option_info, buy_quantity: "3.5" }
        )
      ).toBe("ETH × 3.5");
      expect(
        invoke("getFunderOrderAssetQuantityLabel", {
          asset_type: "crypto_option",
          coin: "ETH",
          option_info,
        })
      ).toBe("ETH × --");
    }
  );
  it("合法summary option_info回退、空/非有限quantity跳过，未知coin不默认ETH", () => {
    expect(
      invoke(
        "getFunderOrderAssetQuantityLabel",
        {
          assetType: "crypto_option",
          option_info: { coin: "BNB", buyQty: "2.125" },
        },
        { option_info: "{" }
      )
    ).toBe("BNB × 2.125");
    expect(
      invoke("getFunderOrderAssetQuantityLabel", {
        coin: "ETH",
        quantity: "",
        buy_quantity: Infinity,
        buyQuantity: "0.12345678",
      })
    ).toBe("ETH × 0.123457");
    expect(invoke("getFunderOrderAssetQuantityLabel", { quantity: 3 })).toBe(
      "--"
    );
    expect(
      invoke("getFunderOrderAssetQuantityLabel", {
        asset_type: "crypto_option",
        sourceOrder: { option_info: { coin: "TAO", buyQty: 5 } },
      })
    ).toBe("TAO × 5");
  });
  it("source lookup严格同memberKey/同段，shared和nonShared集合均可用；不同用户的池互不串读", () => {
    const segment = (
      id: number,
      segmentId: string,
      buyQty: number,
      coin = "BTC"
    ) =>
      Object.freeze({
        id,
        _sharedPoolMemberKey: `${id}:${segmentId}`,
        _sharedPoolSegmentId: segmentId,
        option_info: { coin, buyQty },
        buy_quantity: 999,
      });
    const primary = segment(10, "__primary__", 10);
    const shared = segment(10, "segment-3", 3.5, "ETH");
    const independent = segment(10, "segment-5", 5.25, "SOL");
    const anotherOrder = segment(11, "segment-3", 111);
    const poolA = Object.freeze({
      userId: 77,
      sharedOrderCardSources: [primary, anotherOrder, shared],
      nonSharedOrderCardSources: [independent],
    });
    for (const [jointSegmentId, source, expected] of [
      ["segment-3", shared, "ETH × 3.5"],
      ["segment-5", independent, "SOL × 5.25"],
      ["__primary__", primary, "BTC × 10"],
    ] as const) {
      const summary = {
        orderId: 10,
        jointSegmentId,
        assetType: "crypto_option",
        quantity: 0,
      };
      const found = invoke<any>(
        "findFunderCollateralPopupSourceOrder",
        poolA,
        summary
      );
      expect(found).toBe(source);
      expect(invoke("getFunderOrderAssetQuantityLabel", summary, found)).toBe(
        expected
      );
    }
    const summary = {
      orderId: 10,
      jointSegmentId: "segment-3",
      memberKey: "10:segment-3",
      assetType: "crypto_option",
    };
    const ownerB = segment(10, "segment-3", 9, "BNB");
    const poolB = { userId: 88, sharedOrderCardSources: [ownerB] };
    expect(
      invoke(
        "getFunderOrderAssetQuantityLabel",
        summary,
        invoke("findFunderCollateralPopupSourceOrder", poolB, summary)
      )
    ).toBe("BNB × 9");
    expect(
      invoke(
        "findFunderCollateralPopupSourceOrder",
        { userId: 88, sharedOrderCardSources: [] },
        summary
      )
    ).toBeUndefined();
    expect(
      invoke("findFunderCollateralPopupSourceOrder", poolA, {
        orderId: 10,
        jointSegmentId: "segment-2",
      })
    ).toBeUndefined();
    expect(
      invoke("findFunderCollateralPopupSourceOrder", poolA, {
        orderId: 999,
        jointSegmentId: "segment-3",
      })
    ).toBeUndefined();
    expect(
      invoke("findFunderCollateralPopupSourceOrder", null, summary)
    ).toBeUndefined();
    // 显式memberKey优先，不能回退为同物理订单的另一段。
    expect(
      invoke("findFunderCollateralPopupSourceOrder", poolA, {
        orderId: 10,
        memberKey: "11:segment-3",
      })
    ).toBe(anotherOrder);
    const fallback = {
      id: 20,
      _sharedPoolSegmentId: "segment-2",
      buy_quantity: 2,
    };
    expect(
      invoke(
        "findFunderCollateralPopupSourceOrder",
        { nonSharedOrderCardSources: [fallback] },
        { id: 20, jointSegmentId: "segment-2" }
      )
    ).toBe(fallback);
  });
});

describe("类型徽章与共享弹窗接线执行实际JSX，非字符串命中", () => {
  it.each([
    ["crypto_option", "期", "#7C3AED"],
    ["crypto", "币", "#059669"],
    ["stock", "股", "#D97706"],
    [undefined, "币", "#059669"],
  ])("%s徽章显示%s及正确底色", (assetType, label, color) => {
    const rendered = invoke<Element>("FunderCollateralAssetTypeBadge", {
      assetType,
    });
    expect(text(rendered)).toBe(label);
    expect(rendered.props.style.backgroundColor).toBe(color);
    expect(rendered.props.className).toContain("text-white");
  });
  it.each([
    ["订单模式", card, "FunderOrderCard"],
    ["卡片模式", silver, "FunderOrderCardV2Silver"],
  ] as const)(
    "%s各行类型徽章后接除息，数量调用绑定当前池/当前订单",
    (_name, ast, component) => {
      const root = declaration(ast, component);
      const badges = nodes(root, ts.isJsxSelfClosingElement).filter(
        n => n.tagName.getText() === "FunderCollateralAssetTypeBadge"
      );
      expect(badges.length).toBeGreaterThanOrEqual(3);
      for (const badge of badges) {
        const parent = badge.parent;
        if (!ts.isJsxElement(parent))
          throw new Error("Badge must be a direct row child");
        const index = parent.children.indexOf(badge);
        const next = required(
          parent.children
            .slice(index + 1)
            .find(n => !ts.isJsxText(n) || n.text.trim()),
          "badge next sibling"
        );
        expect(ts.isJsxExpression(next)).toBe(true);
        for (const enabled of [true, false]) {
          const row = {
            assetType: "crypto_option",
            collateralRiskFormula: enabled
              ? "coin_native_collateral"
              : "floating_pnl",
          };
          const rendered = pure.evaluate(
            `<>${badge.getText()}${next.getText()}</>`,
            {
              o: row,
              nonSharedOrder: row,
              assetType: row.assetType,
              isCoinNativeCollateral: enabled,
            }
          );
          const children = required(
            elements(rendered)[0],
            "row fragment"
          ).children.filter(isElement);
          expect(children[0].tag).toBe(
            pure.context.FunderCollateralAssetTypeBadge
          );
          expect(
            text(
              invoke<Element>(
                "FunderCollateralAssetTypeBadge",
                children[0].props
              )
            )
          ).toBe("期");
          expect(children.length).toBe(enabled ? 2 : 1);
          if (enabled) {
            expect(text(children[1])).toBe("除息");
            expect(children[1].props.className).toContain("bg-blue-600");
          }
        }
      }
      const labels = calls(root, "getFunderOrderAssetQuantityLabel");
      expect(labels.length).toBeGreaterThanOrEqual(2);
      for (const label of labels) {
        const lookup = required(label.arguments[1], "label source lookup");
        expect(ts.isCallExpression(lookup)).toBe(true);
        if (!ts.isCallExpression(lookup))
          throw new Error("Expected source lookup");
        expect(lookup.expression.getText()).toBe(
          "findFunderCollateralPopupSourceOrder"
        );
        expect(lookup.arguments.map(n => n.getText())).toEqual([
          "sharedPoolInfo",
          label.arguments[0].getText(),
        ]);
        const order = {
          orderId: 10,
          jointSegmentId: "segment-3",
          assetType: "crypto_option",
          coin: "ETH",
          quantity: 0,
        };
        expect(
          pure.evaluate(label.getText(), {
            o: order,
            nonSharedOrder: order,
            sharedPoolInfo: {
              sharedOrderCardSources: [
                {
                  id: 10,
                  _sharedPoolSegmentId: "segment-3",
                  option_info: { coin: "SOL", buyQty: 48.5 },
                },
              ],
            },
          })
        ).toBe("SOL × 48.5");
      }
      for (const name of [
        "FunderSharedHoldingSectionHeading",
        "FunderSharedCollateralSectionHeading",
        "FunderSharedCollateralCalculationNotes",
      ]) {
        expect(
          nodes(root, ts.isJsxSelfClosingElement).filter(
            n => n.tagName.getText() === name
          )
        ).toHaveLength(1);
      }
      expect(
        nodes(root, ts.isJsxSelfClosingElement).filter(
          n => n.tagName.getText() === "FunderCollateralPopupLiveClock"
        )
      ).toHaveLength(0);
      const holdingTag = required(
        nodes(root, ts.isJsxSelfClosingElement).find(
          n => n.tagName.getText() === "FunderSharedHoldingSectionHeading"
        ),
        "shared holding heading"
      );
      let sharedBody: ts.Node = holdingTag;
      if (ast === card) {
        const branch = required(
          nodes(root, ts.isConditionalExpression).find(
            n =>
              n.condition.getText() === "useUnifiedSharedDialog" &&
              nodes(n.whenTrue, ts.isJsxSelfClosingElement).includes(holdingTag)
          ),
          "unified shared branch"
        );
        sharedBody = branch.whenTrue;
      } else {
        while (
          sharedBody.parent &&
          !nodes(sharedBody, ts.isJsxSelfClosingElement).some(
            n =>
              n.tagName.getText() === "FunderSharedCollateralCalculationNotes"
          )
        ) {
          sharedBody = sharedBody.parent;
        }
      }
      expect(
        nodes(sharedBody, ts.isJsxText).filter(
          n => n.text.trim() === "计算说明"
        )
      ).toHaveLength(0);
    }
  );
  it("V2从原组件导入同一套helper/共享组件，无复制定义", () => {
    const imported = required(
      nodes(silver, ts.isImportDeclaration).find(
        n =>
          ts.isStringLiteral(n.moduleSpecifier) &&
          n.moduleSpecifier.text === "./FunderOrderCard"
      ),
      "V2 shared import"
    );
    const names = nodes(imported, ts.isImportSpecifier).map(n => n.name.text);
    for (const name of helperNames.filter(
      n =>
        n !== "formatWalletStyleAssetAmount" &&
        n !== "FunderCollateralPopupLiveClock"
    )) {
      expect(names).toContain(name);
      expect(
        nodes(silver, ts.isFunctionDeclaration).filter(
          n => n.name?.text === name
        )
      ).toHaveLength(0);
    }
  });
  it("第三项问号默认折叠，连续点击展开/折叠；③④标题均复用独立时钟", () => {
    const heading = hooks();
    let tree = heading.render("FunderSharedHoldingSectionHeading()");
    expect(button(tree, "?").props["aria-expanded"]).toBe(false);
    expect(text(tree)).not.toContain("担保差值：");
    expect(
      elements(tree).filter(
        e => e.tag === heading.context.FunderCollateralPopupLiveClock
      )
    ).toHaveLength(1);
    button(tree, "?").props.onClick();
    tree = heading.render("FunderSharedHoldingSectionHeading()");
    expect(button(tree, "?").props["aria-expanded"]).toBe(true);
    expect(text(tree)).toContain("担保差值：−买入价值 − 待结利息 + 已结利息。");
    expect(text(tree)).toContain("本项不含担保物");
    button(tree, "?").props.onClick();
    tree = heading.render("FunderSharedHoldingSectionHeading()");
    expect(button(tree, "?").props["aria-expanded"]).toBe(false);
    expect(text(tree)).not.toContain("担保差值：");
    const fourth = heading.evaluate("FunderSharedCollateralSectionHeading()");
    expect(
      elements(fourth).filter(
        e => e.tag === heading.context.FunderCollateralPopupLiveClock
      )
    ).toHaveLength(1);
    expect(heading.forbiddenAccess).not.toHaveBeenCalled();
  });
  it("共享说明只一块，实际条件分支排斥非共享说明，①至⑤与除息说明完整", () => {
    const notes = invoke<Element>("FunderSharedCollateralCalculationNotes");
    expect(
      elements(notes).filter(e => e.tag === "div" && text(e) === "计算说明")
    ).toHaveLength(1);
    for (const label of [
      "① 总计担保缺口",
      "② 保证金比例",
      "③ 持仓差额",
      "④ 担保物",
      "⑤ 非共享订单",
      "除息",
    ])
      expect(text(notes)).toContain(label);
    const tag = required(
      nodes(
        declaration(card, "FunderOrderCard"),
        ts.isJsxSelfClosingElement
      ).find(
        n => n.tagName.getText() === "FunderSharedCollateralCalculationNotes"
      ),
      "shared notes invocation"
    );
    const branch = tag.parent;
    if (!ts.isConditionalExpression(branch))
      throw new Error(
        "Shared notes must be mutually exclusive with independent notes"
      );
    expect(branch.condition.getText()).toBe("useUnifiedSharedDialog");
    const values = {
      usesCoinNativeCollateralFormula: false,
      usesInitialPrincipalFormula: false,
      isOptionOrder: false,
      usesPrincipalCoverageFormula: false,
    };
    const sharedTree = pure.evaluate(branch.getText(), {
      ...values,
      useUnifiedSharedDialog: true,
    });
    expect(
      elements(sharedTree).filter(
        e => e.tag === pure.context.FunderSharedCollateralCalculationNotes
      )
    ).toHaveLength(1);
    expect(
      elements(sharedTree).filter(e => text(e) === "计算说明")
    ).toHaveLength(0);
    const independentTree = pure.evaluate(branch.getText(), {
      ...values,
      useUnifiedSharedDialog: false,
    });
    expect(
      elements(independentTree).filter(
        e => e.tag === pure.context.FunderSharedCollateralCalculationNotes
      )
    ).toHaveLength(0);
    expect(
      elements(independentTree).filter(
        e => e.tag === "div" && text(e) === "计算说明"
      )
    ).toHaveLength(1);
  });
});

describe("秒级时钟局部更新：北京时间、visibilitychange及资源清理", () => {
  it("日期时间Asia/Shanghai跨日/跨年正确，无“当前”文字；1秒更新及恢复可见同步，卸载完全清理", () => {
    let now = Date.parse("2026-12-31T15:59:59Z");
    class FixtureDate extends Date {
      static now() {
        return now;
      }
    }
    const timers = new Map<number, () => void>();
    const listeners = new Map<string, () => void>();
    const window = {
      setInterval: vi.fn((callback: () => void, _delay: number) => {
        timers.set(71, callback);
        return 71;
      }),
      clearInterval: vi.fn((id: number) => timers.delete(id)),
    };
    const document = {
      visibilityState: "visible",
      addEventListener: vi.fn((name: string, callback: () => void) =>
        listeners.set(name, callback)
      ),
      removeEventListener: vi.fn((name: string, callback: () => void) => {
        if (listeners.get(name) === callback) listeners.delete(name);
      }),
    };
    const clock = hooks({ Date: FixtureDate, window, document });
    const parentHolding = hooks();
    const parentCollateral = hooks();
    // 金额父卡不运行：这里只执行其真实共享标题；两个标题中的时钟均是独立子组件。
    const headingA = parentHolding.render(
      "FunderSharedHoldingSectionHeading()"
    );
    const headingB = parentCollateral.render(
      "FunderSharedCollateralSectionHeading()"
    );
    const holdingMarkup = text(headingA);
    const collateralMarkup = text(headingB);
    let tree = clock.render("FunderCollateralPopupLiveClock()");
    expect(tree.tag).toBe("time");
    expect(text(tree)).toBe("12/31 23:59:59");
    expect(tree.props.dateTime).toBe("2026-12-31T15:59:59.000Z");
    expect(text(tree)).not.toContain("当前");
    expect(
      clock.evaluate("funderPopupClockFormatter.resolvedOptions().timeZone")
    ).toBe("Asia/Shanghai");
    expect(window.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
    expect(document.addEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function)
    );
    now = Date.parse("2026-12-31T16:00:00Z");
    required(timers.get(71), "clock interval")();
    tree = clock.render("FunderCollateralPopupLiveClock()");
    expect(text(tree)).toBe("01/01 00:00:00");
    document.visibilityState = "visible";
    now = Date.parse("2027-01-01T01:23:45Z");
    required(listeners.get("visibilitychange"), "visibility listener")();
    tree = clock.render("FunderCollateralPopupLiveClock()");
    expect(text(tree)).toBe("01/01 09:23:45");
    expect(clock.stateWrites.mock.calls.map(([index]) => index)).toEqual([
      0, 0,
    ]);
    expect(window.setInterval).toHaveBeenCalledOnce();
    expect(document.addEventListener).toHaveBeenCalledOnce();
    expect(parentHolding.renders()).toBe(1);
    expect(parentCollateral.renders()).toBe(1);
    expect(text(headingA)).toBe(holdingMarkup);
    expect(text(headingB)).toBe(collateralMarkup);
    expect(parentHolding.stateWrites).not.toHaveBeenCalled();
    expect(parentCollateral.stateWrites).not.toHaveBeenCalled();
    expect(clock.forbiddenAccess).not.toHaveBeenCalled();
    clock.unmount();
    expect(window.clearInterval).toHaveBeenCalledWith(71);
    expect(document.removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      document.addEventListener.mock.calls[0][1]
    );
    expect(timers.size).toBe(0);
    expect(listeners.size).toBe(0);
    // 真实时钟调用图仅有局部setNow，无查询/父回调/资金计算调用。
    expect(
      calls(declaration(card, "FunderCollateralPopupLiveClock"), "useEffect")
    ).toHaveLength(1);
    expect(
      nodes(
        declaration(card, "FunderCollateralPopupLiveClock"),
        ts.isCallExpression
      )
        .map(n => n.expression.getText())
        .sort()
    ).toEqual(
      [
        "Date.now",
        "Date.now",
        "document.addEventListener",
        "document.removeEventListener",
        "funderPopupClockFormatter.format",
        "new Date(now).toISOString",
        "setNow",
        "useEffect",
        "useState",
        "window.clearInterval",
        "window.setInterval",
      ].sort()
    );
  });
});
