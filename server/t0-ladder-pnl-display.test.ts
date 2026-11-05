import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// 只读页面源码，以 TS AST 定位并执行真实函数、表达式及事件回调。
// 不导入 React 页面、服务器、tRPC 或数据库；fixture 仅作为隔离测试输入。
const source = readFileSync(new URL("../client/src/pages/T0Journal.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("T0Journal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) result.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return result;
}
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing production node: ${label}`);
  return value;
}
function declaration(name: string) {
  return required(nodes(ast, ts.isFunctionDeclaration).find((node) => node.name?.text === name), name);
}
function variable(name: string, root: ts.Node = ast) {
  return required(nodes(root, ts.isVariableDeclaration).find((node) => ts.isIdentifier(node.name)
    ? node.name.text === name
    : ts.isArrayBindingPattern(node.name) && node.name.elements.some((element) => ts.isBindingElement(element)
      && ts.isIdentifier(element.name) && element.name.text === name)), name);
}
function expression<T>(node: ts.Expression, parameters: string[] = []) {
  const compiled = ts.transpileModule(`const isolated = (${node.getText(ast)});`, {
    fileName: "isolated.tsx",
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function(...parameters, `${compiled}\nreturn isolated;`) as (...values: unknown[]) => T;
}
function initializer<T>(name: string, parameters: string[] = [], root: ts.Node = ast) {
  return expression<T>(required(variable(name, root).initializer, `${name} initializer`), parameters);
}
function productionFunction<T>(name: string, parameters: string[] = []) {
  const compiled = ts.transpileModule(declaration(name).getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new Function(...parameters, `${compiled}\nreturn ${name};`) as (...values: unknown[]) => T;
}
type Element = ts.JsxElement | ts.JsxSelfClosingElement;
function opening(element: Element) {
  return ts.isJsxElement(element) ? element.openingElement : element;
}
function attribute(element: Element, name: string) {
  return opening(element).attributes.properties.find((node): node is ts.JsxAttribute =>
    ts.isJsxAttribute(node) && node.name.getText(ast) === name);
}
function attributeExpression(element: Element, name: string) {
  const value = required(attribute(element, name)?.initializer, `${name} attribute`);
  if (!ts.isJsxExpression(value)) throw new Error(`Expected JSX expression: ${name}`);
  return required(value.expression, `${name} expression`);
}
function enclosingGate(element: Element) {
  let parent: ts.Node | undefined = element.parent;
  while (parent && !ts.isJsxExpression(parent)) parent = parent.parent;
  if (!parent || !ts.isJsxExpression(parent)) throw new Error("Missing JSX gate");
  const gate = required(parent.expression, "JSX gate expression");
  if (!ts.isBinaryExpression(gate) || gate.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) {
    throw new Error("Expected production && gate");
  }
  return gate;
}
function textAttribute(element: Element, name: string) {
  const value = attribute(element, name)?.initializer;
  return value && ts.isStringLiteral(value) ? value.text : undefined;
}

type Settings = { mode: "all" | "hidden" | "profit" | "loss"; minPercent: string };
const modes = ["all", "hidden", "profit", "loss"] as const;
const defaults = initializer<Settings>("DEFAULT_LADDER_PNL_DISPLAY")();
const shouldShow = productionFunction<(pnl: number | null, rate: number | null, settings: Settings) => boolean>("shouldShowLadderPnl")();
const position = declaration("PositionCell");
const ladder = declaration("LadderCell");
const panel = required(nodes(ast, ts.isJsxElement).find((node) => textAttribute(node, "id") === "t0-ladder-pnl-settings"), "settings panel");
const buttons = nodes(panel, ts.isJsxElement).filter((node) => opening(node).tagName.getText(ast) === "button");
const decrease = required(buttons.find((node) => textAttribute(node, "aria-label") === "幅度减少1个百分点"), "decrease button");
const increase = required(buttons.find((node) => textAttribute(node, "aria-label") === "幅度增加1个百分点"), "increase button");
const input = required(nodes(panel, ts.isJsxSelfClosingElement).find((node) => textAttribute(node, "id") === "t0-ladder-pnl-min-percent"), "threshold input");
const modeButton = required(buttons.find((node) => attribute(node, "key")?.getText(ast) === "key={mode}"), "mode button");
const resetButton = required(buttons.find((node) => node.children.some((child) => ts.isJsxText(child) && child.text.trim() === "恢复默认")), "reset button");
const disabled = (element: Element, settings: Settings) =>
  expression<boolean>(attributeExpression(element, "disabled"), ["ladderPnlSettings"])(settings);
type Update = Settings | ((current: Settings) => Settings);
function runClick(button: ts.JsxElement, current: Settings, selectedMode?: Settings["mode"]) {
  let next = current;
  const setter = vi.fn((update: Update) => { next = typeof update === "function" ? update(current) : update; });
  expression<() => void>(attributeExpression(button, "onClick"), ["setLadderPnlSettings", "mode", "DEFAULT_LADDER_PNL_DISPLAY"])(setter, selectedMode, defaults)();
  return { next, setter };
}
function changeInput(current: Settings, value: string) {
  let next = current;
  const setter = vi.fn((update: Update) => { next = typeof update === "function" ? update(current) : update; });
  expression<(event: { target: { value: string } }) => void>(attributeExpression(input, "onChange"), ["setLadderPnlSettings"])(setter)({ target: { value } });
  return { next, setter };
}

describe("T+0 梯形盈亏生产方向与幅度判断", () => {
  it.each([
    ["profit", 50, 0.06, "5", true], ["profit", 50, 0.05, "5", true],
    ["profit", 50, 0.0499, "5", false], ["profit", -50, -0.06, "5", false],
    ["loss", -50, -0.06, "5", true], ["loss", -50, -0.05, "5", true],
    ["loss", -50, -0.0499, "5", false], ["loss", 50, 0.06, "5", false],
    ["all", 50, 0.06, "5", true], ["all", -50, -0.06, "5", true],
    ["all", 50, 0.05, "5", true], ["all", -50, -0.05, "5", true],
    ["all", 50, 0.0499, "5", false], ["all", -50, -0.0499, "5", false],
    ["all", 0, 0, "", true], ["profit", 0, 0, "", false], ["loss", 0, 0, "", false],
    ["hidden", 50, 0.1, "", false], ["hidden", -50, -0.1, "5", false],
  ] as const)("%s：盈亏%s、收益率%s、门槛%s → %s", (mode, pnl, rate, minPercent, expected) => {
    expect(shouldShow(pnl, rate, { mode, minPercent })).toBe(expected);
  });

  it("留空或0不设门槛；正门槛要求有效收益率，null/NaN/Infinity盈亏始终不显示", () => {
    for (const mode of modes) {
      for (const pnl of [null, NaN, Infinity, -Infinity]) {
        expect(shouldShow(pnl, 0.1, { mode, minPercent: "" })).toBe(false);
        expect(shouldShow(pnl, 0.1, { mode, minPercent: "5" })).toBe(false);
      }
    }
    for (const minPercent of ["", "0", "0.00"]) {
      expect(shouldShow(1, 0, { mode: "all", minPercent })).toBe(true);
      expect(shouldShow(-1, -0.00001, { mode: "loss", minPercent })).toBe(true);
    }
    for (const rate of [null, NaN, Infinity, -Infinity]) {
      expect(shouldShow(50, rate, { mode: "all", minPercent: "5" })).toBe(false);
    }
  });

  it("默认及类型仅含mode/minPercent，没有单独金额或百分比开关", () => {
    expect(defaults).toEqual({ mode: "all", minPercent: "" });
    const type = required(nodes(ast, ts.isTypeAliasDeclaration).find((node) => node.name.text === "LadderPnlDisplaySettings"), "settings type");
    if (!ts.isTypeLiteralNode(type.type)) throw new Error("Expected settings type literal");
    expect(type.type.members.map((member) => required(member.name, "settings member name").getText(ast))).toEqual(["mode", "minPercent"]);
    const mode = type.type.members[0];
    if (!ts.isPropertySignature(mode) || !mode.type || !ts.isUnionTypeNode(mode.type)) throw new Error("Expected mode union");
    expect(mode.type.types.map((node) => node.getText(ast))).toEqual(modes.map((value) => JSON.stringify(value)));
  });

  it("筛选仅返回boolean，不改变冻结的显示设置、数量或财务数据", () => {
    const bucket = Object.freeze({ remainingQuantity: 8, financialQuantity: 2, financialCostBasis: 200, realizedPnl: 37 });
    const snapshot = { ...bucket };
    for (const mode of modes) {
      const settings = Object.freeze({ mode, minPercent: "5" });
      expect(typeof shouldShow(20, 0.1, settings)).toBe("boolean");
      expect(settings).toEqual({ mode, minPercent: "5" });
      expect(bucket).toEqual(snapshot);
    }
    for (const name of ["floatingPnl", "floatingReturnBase", "floatingReturnRate"]) {
      expect(required(variable(name, position).initializer, name).getText(ast)).not.toMatch(/pnlDisplaySettings|showPnlNumbers/);
    }
  });
});

describe("T+0 幅度按钮及手输真实事件回调", () => {
  it.each([
    ["", "1", "0"], ["0", "1", "0"], ["0.01", "1.01", "0"],
    ["0.50", "1.5", "0"], ["1", "2", "0"], ["2.35", "3.35", "1.35"],
    ["10.29", "11.29", "9.29"],
  ])("幅度%s：+1→%s，-1→%s且最低0", (minPercent, up, down) => {
    const current = Object.freeze({ mode: "profit" as const, minPercent });
    expect(runClick(increase, current).next).toEqual({ mode: "profit", minPercent: up });
    expect(runClick(decrease, current).next).toEqual({ mode: "profit", minPercent: down });
    expect(current).toEqual({ mode: "profit", minPercent });
  });

  it("整数分步进连续往返不会小数漂移，模式保持不变", () => {
    let state: Settings = { mode: "loss", minPercent: "2.35" };
    for (let index = 0; index < 101; index++) state = runClick(increase, Object.freeze(state)).next;
    expect(state).toEqual({ mode: "loss", minPercent: "103.35" });
    for (let index = 0; index < 101; index++) state = runClick(decrease, Object.freeze(state)).next;
    expect(state).toEqual({ mode: "loss", minPercent: "2.35" });
    expect(attributeExpression(increase, "onClick").getText(ast)).toContain("Math.round");
    expect(attributeExpression(decrease, "onClick").getText(ast)).toContain("Math.round");
  });

  it("hidden通过真实disabled表达式禁用左右按钮和输入，0/空值禁止继续减少", () => {
    for (const minPercent of ["", "0", "0.01", "5.25"]) {
      for (const element of [decrease, increase, input]) {
        expect(disabled(element, { mode: "hidden", minPercent })).toBe(true);
      }
    }
    for (const mode of ["all", "profit", "loss"] as const) {
      for (const minPercent of ["", "0", "0.00"]) expect(disabled(decrease, { mode, minPercent })).toBe(true);
      expect(disabled(decrease, { mode, minPercent: "0.01" })).toBe(false);
      expect(disabled(increase, { mode, minPercent: "" })).toBe(false);
      expect(disabled(input, { mode, minPercent: "0" })).toBe(false);
    }
  });

  it("实际手输回调接受整数/两位小数/中间小数点/清空，不改变模式及原设置", () => {
    for (const value of ["", "0", "12", "2.35", "0.01", "2.", ".", ".25", "001.20"]) {
      const current = Object.freeze({ mode: "loss" as const, minPercent: "5" });
      const result = changeInput(current, value);
      expect(result.setter).toHaveBeenCalledTimes(1);
      expect(result.next).toEqual({ mode: "loss", minPercent: value });
      expect(current).toEqual({ mode: "loss", minPercent: "5" });
    }
  });

  it("实际手输回调拒绝第三位小数、负数、符号、字母、指数、非有限值及多个点", () => {
    const current = Object.freeze({ mode: "all" as const, minPercent: "2.35" });
    for (const value of ["2.351", "-1", "+1", "abc", "1e2", "NaN", "Infinity", "2..3", "1,25", " 2", "2%"] ) {
      const result = changeInput(current, value);
      expect(result.setter).not.toHaveBeenCalled();
      expect(result.next).toBe(current);
    }
    expect(textAttribute(input, "inputMode")).toBe("decimal");
    expect(attributeExpression(input, "value").getText(ast)).toBe("ladderPnlSettings.minPercent");
  });

  it("模式按钮保留幅度、pressed匹配选择；恢复默认同时重置模式与幅度", () => {
    const pressed = expression<boolean>(attributeExpression(modeButton, "aria-pressed"), ["ladderPnlSettings", "mode"]);
    for (const mode of modes) {
      const current = Object.freeze({ mode: "all" as const, minPercent: "2.35" });
      expect(runClick(modeButton, current, mode).next).toEqual({ mode, minPercent: "2.35" });
      for (const selected of modes) expect(pressed({ mode: selected, minPercent: "5" }, mode)).toBe(selected === mode);
    }
    const reset = runClick(resetButton, Object.freeze({ mode: "hidden", minPercent: "9.99" })).next;
    expect(reset).toEqual(defaults);
    expect(reset).not.toBe(defaults);
  });

  it("面板无checkbox/独立金额百分比开关，标题及入口无SlidersHorizontal，按钮左右夹住输入", () => {
    const panelSource = panel.getText(ast);
    expect(panelSource).not.toMatch(/checkbox|Checkbox|showAmount|showRate|SlidersHorizontal/);
    const toggle = required(nodes(ast, ts.isJsxElement).find((node) => textAttribute(node, "aria-controls") === "t0-ladder-pnl-settings"), "panel toggle");
    expect(toggle.getText(ast)).not.toContain("SlidersHorizontal");
    expect(decrease.pos).toBeLessThan(input.pos);
    expect(input.pos).toBeLessThan(increase.pos);
    expect(nodes(decrease, ts.isJsxSelfClosingElement).some((node) => node.tagName.getText(ast) === "Minus")).toBe(true);
    expect(nodes(increase, ts.isJsxSelfClosingElement).some((node) => node.tagName.getText(ast) === "Plus")).toBe(true);
    const gate = expression<boolean>(enclosingGate(panel).left, ["canManage", "isMemberView", "showLadderPnlSettings"]);
    for (const admin of [false, true]) for (const member of [false, true]) for (const shown of [false, true]) {
      expect(gate(admin, member, shown)).toBe((admin || member) && shown);
    }
  });
});

const numberContainer = required(nodes(position, ts.isJsxElement).find((node) =>
  opening(node).tagName.getText(ast) === "span" && node.children.filter(ts.isJsxElement).length === 2
  && node.getText(ast).includes("formatSigned(floatingPnl)") && node.getText(ast).includes("formatSignedPercent(floatingReturnRate)")), "shared PnL container");
const numberGate = enclosingGate(numberContainer);
const evaluateNumberGate = expression<boolean>(numberGate.left, ["showPnlNumbers", "floatingPnl", "floatingReturnRate"]);
const evaluateShow = initializer<boolean>("showPnlNumbers", ["shouldShowLadderPnl", "floatingPnl", "floatingReturnRate", "pnlDisplaySettings"], position);

describe("T+0 数量卡共同JSX门控、双侧透传及固定高度", () => {
  it("金额和百分比在同一JSX gate中同时渲染，条件共同包含设置判断及两个非null判断", () => {
    expect(numberGate.left.getText(ast)).toMatch(/^showPnlNumbers\s*&&\s*floatingPnl\s*!==\s*null\s*&&\s*floatingReturnRate\s*!==\s*null$/);
    const spans = numberContainer.children.filter(ts.isJsxElement);
    expect(spans).toHaveLength(2);
    const calls = nodes(numberContainer, ts.isCallExpression).filter((node) => ["formatSigned", "formatSignedPercent"].includes(node.expression.getText(ast)));
    expect(calls.map((node) => node.expression.getText(ast))).toEqual(["formatSigned", "formatSignedPercent"]);
    for (const span of spans) {
      const children = span.children.filter(ts.isJsxExpression);
      expect(children).toHaveLength(1);
      expect(ts.isCallExpression(required(children[0].expression, "direct formatter"))).toBe(true);
    }
    for (const shown of [false, true]) for (const pnl of [null, 0, 20]) for (const rate of [null, 0, 0.1]) {
      expect(evaluateNumberGate(shown, pnl, rate)).toBe(shown && pnl !== null && rate !== null);
    }
    for (const mode of modes) {
      const settings: Settings = { mode, minPercent: "5" };
      const shown = evaluateShow(shouldShow, 20, 0.1, settings);
      expect(evaluateNumberGate(shown, 20, 0.1)).toBe(mode === "all" || mode === "profit");
    }
  });

  it("无收益率时即使无门槛也不只显示金额；正门槛NaN率和所有NaN盈亏均隐藏", () => {
    const cases: [number | null, number | null, string][] = [[20, null, ""], [null, 0.1, ""], [NaN, 0.1, ""], [20, NaN, "5"]];
    for (const [pnl, rate, minPercent] of cases) {
      const shown = evaluateShow(shouldShow, pnl, rate, { mode: "all", minPercent });
      expect(evaluateNumberGate(shown, pnl, rate)).toBe(false);
    }
  });

  it("左右两侧LadderCell均透传同一设置，再原样传给PositionCell，不改数量/mark/详情回调", () => {
    const cells = nodes(ast, ts.isJsxSelfClosingElement).filter((node) => node.tagName.getText(ast) === "LadderCell");
    expect(cells).toHaveLength(2);
    expect(cells.map((node) => textAttribute(node, "side"))).toEqual(["long", "short"]);
    const settings = Object.freeze({ mode: "loss", minPercent: "2.35" });
    for (const cell of cells) {
      expect(expression<Settings>(attributeExpression(cell, "pnlDisplaySettings"), ["ladderPnlSettings"])(settings)).toBe(settings);
    }
    const forwarded = required(nodes(ladder, ts.isJsxSelfClosingElement).find((node) => node.tagName.getText(ast) === "PositionCell"), "forwarded PositionCell");
    expect(expression<Settings>(attributeExpression(forwarded, "pnlDisplaySettings"), ["pnlDisplaySettings"])(settings)).toBe(settings);
    for (const name of ["bucket", "side", "markPrice"]) expect(attributeExpression(forwarded, name).getText(ast)).toBe(name);
    expect(attributeExpression(forwarded, "onClick").getText(ast)).toBe("onClose");
    const binding = position.parameters[0].name;
    if (!ts.isObjectBindingPattern(binding)) throw new Error("Expected PositionCell props binding");
    expect(required(binding.elements.find((node) => node.name.getText(ast) === "pnlDisplaySettings")?.initializer, "default settings prop").getText(ast)).toBe("DEFAULT_LADDER_PNL_DISPLAY");
  });

  it("固定卡高仍为逐笔58px/整合52px，上半区及数量容器保留30px，不受盈亏设置影响", () => {
    const height = initializer<string>("minHeightClass", ["metadata"], position);
    expect(height({})).toBe("min-h-[58px]");
    expect(height(undefined)).toBe("min-h-[52px]");
    const heightSource = required(variable("minHeightClass", position).initializer, "height").getText(ast);
    expect(heightSource).not.toMatch(/pnl|Pnl|show|mode/);
    const topRow = required(nodes(position, ts.isJsxElement).find((node) =>
      attribute(node, "className")?.getText(ast).includes("justify-between gap-2 tabular-nums")), "top row");
    expect(attributeExpression(topRow, "className").getText(ast)).toContain('metadata ? "min-h-[30px] items-center" : "items-start"');
    const quantityContainer = required(nodes(topRow, ts.isJsxElement).find((node) =>
      opening(node).tagName.getText(ast) === "div" && attribute(node, "className")?.getText(ast).includes("self-stretch")), "quantity container");
    expect(attributeExpression(quantityContainer, "className").getText(ast).match(/min-h-\[30px\]/g)).toHaveLength(2);
    expect(attributeExpression(numberContainer, "className").getText(ast)).toContain("h-[30px]");
    expect(attributeExpression(quantityContainer, "className").getText(ast)).not.toMatch(/showPnlNumbers|pnlDisplaySettings/);
    const wrappers = nodes(position, ts.isJsxElement).filter((node) => attribute(node, "className")?.getText(ast).includes("${minHeightClass}"));
    expect(wrappers).toHaveLength(2); // 只读div和可交互button共用原固定卡高。
  });
});

type Bucket = { remainingQuantity: number; financialQuantity: number; financialCostBasis: number };
type OptionResult = { pnl: number; premiumTotal: number } | null;
const feeRate = initializer<number>("OKX_VIP2_TAKER_FEE_RATE")();
const netPnl = productionFunction<(side: string, mark: number | null, quantity: number, basis: number) => number | null>("calculateEstimatedUnrealizedNetPnl", ["OKX_VIP2_TAKER_FEE_RATE"])(feeRate);
const optionPnl = productionFunction<(input: Record<string, unknown>) => OptionResult>("calculateOptionUnrealizedPnl")();
const optionMark = productionFunction<(live: unknown, cached?: number) => number | null>("resolveUsableOptionMarkPrice")();
const floating = initializer<number | null>("floatingPnl", ["isPendingOnly", "isOption", "optionPnlResult", "calculateEstimatedUnrealizedNetPnl", "side", "markPrice", "bucket"], position);
const returnBase = initializer<number | null>("floatingReturnBase", ["isOption", "optionPnlResult", "bucket"], position);
const returnRate = initializer<number | null>("floatingReturnRate", ["floatingPnl", "floatingReturnBase"], position);

describe("T+0 显示设置不改变原期权/普通仓位计算", () => {
  it("普通多空继续以实时mark、financialQuantity及原成本计算含原双边手续费的净收益率", () => {
    const bucket = Object.freeze({ remainingQuantity: 8, financialQuantity: 2, financialCostBasis: 200 });
    for (const side of ["long", "short"]) {
      const mark = side === "long" ? 120 : 80;
      const pnl = floating(false, false, null, netPnl, side, mark, bucket);
      const base = returnBase(false, null, bucket);
      expect(pnl).toBeCloseTo(39.856, 10);
      expect(base).toBe(200);
      expect(returnRate(pnl, base)).toBeCloseTo(0.19928, 10);
      expect(floating(false, false, null, netPnl, side, null, bucket)).toBeNull();
      expect(floating(true, false, null, netPnl, side, mark, bucket)).toBeNull();
    }
    expect(bucket).toEqual({ remainingQuantity: 8, financialQuantity: 2, financialCostBasis: 200 });
  });

  it("期权多空以premiumTotal而非标的成本为收益率分母，USDT/ETH权利金及原mark回退保持", () => {
    const bucket: Bucket = Object.freeze({ remainingQuantity: 8, financialQuantity: 2, financialCostBasis: 5000 });
    for (const [direction, expectedPnl] of [["long_call", 20], ["long_put", 20], ["short_call", -20], ["short_put", -20]] as const) {
      const result = optionPnl({ quantity: bucket.financialQuantity, optionMarkPrice: 110, premium: 100, premiumCurrency: "USDT", ethMarkPrice: 2000, direction });
      expect(result).toEqual({ pnl: expectedPnl, premiumTotal: 200 });
      const pnl = floating(false, true, result, netPnl, "long", 2000, bucket);
      const base = returnBase(true, result, bucket);
      expect(pnl).toBe(expectedPnl);
      expect(base).toBe(200);
      expect(returnRate(pnl, base)).toBe(expectedPnl / 200);
    }
    expect(optionPnl({ quantity: 2, optionMarkPrice: 22, premium: 0.01, premiumCurrency: "ETH", ethMarkPrice: 2000, direction: "long_call" })).toEqual({ pnl: 4, premiumTotal: 40 });
    expect(optionMark(110, 105)).toBe(110);
    for (const live of [null, undefined, 0, NaN]) expect(optionMark(live, 105)).toBe(105);
    expect(optionMark(null, 0)).toBeNull();
    const productionOptionExpression = required(variable("optionPnlResult", position).initializer, "option result").getText(ast);
    expect(productionOptionExpression).toContain("quantity: bucket.financialQuantity");
    expect(productionOptionExpression).toContain("resolveUsableOptionMarkPrice(optionGreeks.data?.markPrice, optionMetadata?.cachedMarkPrice)");
    expect(productionOptionExpression).not.toContain("pnlDisplaySettings");
  });

  it("无行情、挂单、无有效收益率基数时沿用null，不被显示选项补成0", () => {
    const bucket: Bucket = { remainingQuantity: 2, financialQuantity: 2, financialCostBasis: 200 };
    expect(optionPnl({ quantity: 2, optionMarkPrice: null, premium: 100, premiumCurrency: "USDT", ethMarkPrice: 2000 })).toBeNull();
    expect(floating(false, true, null, netPnl, "long", 2000, bucket)).toBeNull();
    expect(floating(true, true, { pnl: 20, premiumTotal: 200 }, netPnl, "long", 2000, bucket)).toBeNull();
    for (const base of [null, 0, -1]) expect(returnRate(20, base)).toBeNull();
    expect(returnRate(null, 200)).toBeNull();
  });
});

const effects = nodes(ast, ts.isCallExpression).filter((node) => node.expression.getText(ast) === "useEffect");
const hydrationEffect = required(effects.find((node) => node.arguments[0]?.getText(ast).includes("setHydratedLadderPnlStorageKey(ladderPnlStorageKey)")), "settings hydration effect");
const saveEffect = required(effects.find((node) => node.arguments[0]?.getText(ast).includes("JSON.stringify(ladderPnlSettings)")), "settings save effect");
function hydrate(key: string | null, saved: string | null, fail = false) {
  const getItem = vi.fn(() => { if (fail) throw new Error("storage unavailable"); return saved; });
  const settings = vi.fn();
  const hydratedKey = vi.fn();
  expression<() => void>(hydrationEffect.arguments[0], ["DEFAULT_LADDER_PNL_DISPLAY", "ladderPnlStorageKey", "window", "setLadderPnlSettings", "setHydratedLadderPnlStorageKey"])(defaults, key, { localStorage: { getItem } }, settings, hydratedKey)();
  return { next: settings.mock.calls[0]?.[0] as Settings, getItem, hydratedKey };
}
const storageSuffix = initializer<string | null>("ladderPnlStorageKey", ["topFilterStorageKey"]);
const storagePrefix = initializer<string>("T0_TOP_FILTER_STORAGE_PREFIX")();
const topKey = productionFunction<(ledger: number, mode: string, viewer: string) => string>("getT0TopFilterStorageKey", ["T0_TOP_FILTER_STORAGE_PREFIX"])(storagePrefix);
const topKeyCall = required(variable("topFilterStorageKey").initializer, "top key memo");
if (!ts.isCallExpression(topKeyCall)) throw new Error("Expected top storage key useMemo");
const evaluateTopKey = expression<() => string | null>(topKeyCall.arguments[0], ["isUserPreview", "activeJournalData", "me", "ledgerId", "getT0TopFilterStorageKey"]);

describe("T+0 盈亏缓存校验和身份键隔离", () => {
  it("沿用topFilterStorageKey:ladder-pnl-v1，账本/身份模式/用户分离且预览不读写", () => {
    const keys = [topKey(52, "admin", "28"), topKey(52, "member", "28"), topKey(52, "member", "29"), topKey(53, "member", "28")];
    expect(new Set(keys.map((key) => storageSuffix(key))).size).toBe(4);
    for (const key of keys) expect(storageSuffix(key)).toBe(`${key}:ladder-pnl-v1`);
    expect(storageSuffix(null)).toBeNull();
    expect(evaluateTopKey(false, { viewerMode: "admin" }, { id: 28 }, 52, topKey)()).toBe(keys[0]);
    expect(evaluateTopKey(false, { viewerMode: "member", viewerRelatedUserId: 29 }, { id: 28 }, 52, topKey)()).toBe(keys[2]);
    expect(evaluateTopKey(true, { viewerMode: "member", viewerRelatedUserId: 29 }, { id: 28 }, 52, topKey)()).toBeNull();
    expect(evaluateTopKey(false, { viewerMode: "admin" }, null, 52, topKey)()).toBeNull();
    expect(evaluateTopKey(false, { viewerMode: "unknown" }, { id: 28 }, 52, topKey)()).toBeNull();
    expect(hydrate(null, '{"mode":"loss","minPercent":"5"}').getItem).not.toHaveBeenCalled();
    expect(hydrationEffect.arguments[1].getText(ast)).toBe("[ladderPnlStorageKey]");
  });

  it("缓存只接收四种合法mode及非负有限字符串/数字阈值，丢弃旧showAmount/showRate", () => {
    for (const mode of modes) for (const value of ["", "0", "2.35", 0, 2.35]) {
      const result = hydrate("viewer-key", JSON.stringify({ mode, minPercent: value, showAmount: false, showRate: true }));
      expect(result.next).toEqual({ mode, minPercent: String(value) });
      expect(Object.keys(result.next)).toEqual(["mode", "minPercent"]);
      expect(result.getItem).toHaveBeenCalledWith("viewer-key");
      expect(result.hydratedKey).toHaveBeenCalledWith("viewer-key");
    }
    for (const mode of ["ALL", "invalid", null, 1, {}, ["loss"]]) {
      expect(hydrate("viewer-key", JSON.stringify({ mode, minPercent: "2.35" })).next).toEqual({ mode: "all", minPercent: "2.35" });
    }
    for (const minPercent of ["-1", -1, "NaN", "Infinity", "-Infinity", "abc", null, true, {}, []]) {
      expect(hydrate("viewer-key", JSON.stringify({ mode: "loss", minPercent })).next).toEqual({ mode: "loss", minPercent: "" });
    }
  });

  it("损坏/空/非对象缓存或存储异常安全恢复默认；切换身份不残留前一身份的设置", () => {
    for (const saved of [null, "null", "broken{", "123", '"loss"', "{}", "[]"]) expect(hydrate("new-viewer", saved).next).toEqual(defaults);
    expect(hydrate("viewer", null, true).next).toEqual(defaults);
    expect(hydrate("admin", '{"mode":"hidden","minPercent":"9.99"}').next).toEqual({ mode: "hidden", minPercent: "9.99" });
    expect(hydrate("member", null).next).toEqual(defaults);
    expect(defaults).toEqual({ mode: "all", minPercent: "" });
  });

  it("只在同一身份已完成hydration后保存，键不匹配/无键不写且存储失败不阻碍操作", () => {
    const save = expression<() => void>(saveEffect.arguments[0], ["ladderPnlStorageKey", "hydratedLadderPnlStorageKey", "ladderPnlSettings", "window"]);
    const setItem = vi.fn();
    const settings = Object.freeze({ mode: "profit", minPercent: "2.35" });
    for (const [key, hydrated] of [[null, null], ["member", null], ["member", "admin"]]) save(key, hydrated, settings, { localStorage: { setItem } })();
    expect(setItem).not.toHaveBeenCalled();
    save("member", "member", settings, { localStorage: { setItem } })();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith("member", JSON.stringify(settings));
    expect(() => save("member", "member", settings, { localStorage: { setItem: () => { throw new Error("storage unavailable"); } } })()).not.toThrow();
    expect(saveEffect.arguments[1].getText(ast)).toBe("[hydratedLadderPnlStorageKey, ladderPnlSettings, ladderPnlStorageKey]");
  });
});
