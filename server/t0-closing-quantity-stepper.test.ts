import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// 只提取并执行页面中的定位纯函数，避免导入整个页面的 tRPC/行情依赖。
// AST 按函数名定位，测试运行的是生产源码，不是另一套模拟定位实现。
const source = readFileSync(new URL("../client/src/pages/T0Journal.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("T0Journal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const node = ast.statements.find(
  (statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === "stepT0ClosingQuantity",
);
if (!node) throw new Error("Missing production function: stepT0ClosingQuantity");

const compiled = ts.transpileModule(node.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const { stepT0ClosingQuantity } = new Function(
  `${compiled}\nreturn { stepT0ClosingQuantity };`,
)() as {
  stepT0ClosingQuantity: (value: string, direction: -1 | 1, availableQuantity: number) => string;
};

describe("T+0 平仓数量每次精确 1 ETH 步进", () => {
  it.each([
    ["8.00", -1, 600, "7.00"],
    ["8.00", 1, 600, "9.00"],
    ["9.00", 1, 9, "9.00"],
    ["8.50", -1, 600, "7.50"],
    ["8.50", 1, 9, "8.50"],
    ["0.50", -1, 600, "0.50"],
    ["1.00", -1, 600, "0.00"],
    ["0.00", -1, 600, "0.00"],
    ["", 1, 600, "1.00"],
    ["", 1, 0.5, "0.00"],
    ["499.00", 1, 600, "500.00"],
    ["500.00", 1, 600, "500.00"],
  ] as const)("%s 方向 %s、可平 %s ETH 返回 %s", (value, direction, available, expected) => {
    expect(stepT0ClosingQuantity(value, direction, available)).toBe(expected);
  });

  it("连续点击始终是完整 1 ETH 步进，并在上限处保持当前有效数量", () => {
    let value = "497.50";
    const expected = ["498.50", "499.50", "499.50", "499.50", "498.50", "497.50"];
    for (const [index, direction] of [1, 1, 1, 1, -1, -1].entries()) {
      const next = stepT0ClosingQuantity(value, direction, 499.5);
      expect(next).toBe(expected[index]);
      if (next !== value) expect(Math.abs(Number(next) - Number(value))).toBe(1);
      value = next;
    }
    expect(value).toBe("497.50");
  });

  it("部分平仓后的可平数量上限优先于 500 ETH 上限", () => {
    expect(stepT0ClosingQuantity("8.00", 1, 8.5)).toBe("8.00");
    expect(stepT0ClosingQuantity("7.50", 1, 8.5)).toBe("8.50");
    expect(stepT0ClosingQuantity("8.50", 1, 8.5)).toBe("8.50");
  });

  it("无效或非有限当前值按 0，非有限或非正可平数量禁止增加", () => {
    for (const value of ["abc", "NaN", "Infinity", "-Infinity"]) {
      expect(stepT0ClosingQuantity(value, 1, 600)).toBe("1.00");
    }
    for (const available of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(stepT0ClosingQuantity("0", 1, available)).toBe("0.00");
    }
  });
});

describe("T+0 平仓数量步进控件契约", () => {
  const quantityStart = source.indexOf('id="t0-entry-quantity"');
  if (quantityStart < 0) throw new Error("Missing production input: t0-entry-quantity");
  // 按 Field 边界限定契约，避免附近其他按钮或字段使断言误通过。
  const quantityFieldStart = source.lastIndexOf("<Field", quantityStart);
  const quantityFieldEnd = source.indexOf("</Field>", quantityStart) + "</Field>".length;
  const priceFieldStart = source.indexOf("<Field", quantityFieldEnd);
  const priceFieldEnd = source.indexOf("</Field>", priceFieldStart) + "</Field>".length;
  const quantityRegion = source.slice(quantityFieldStart, quantityFieldEnd);
  const priceRegion = source.slice(priceFieldStart, priceFieldEnd);
  const buttons = [...quantityRegion.matchAll(/<button\b[\s\S]*?<\/button>/g)].map((match) => match[0]);
  const quantityButton = (closingLabel: string) => {
    const button = buttons.find((candidate) => candidate.includes(`"${closingLabel}"`));
    if (!button) throw new Error(`Missing production quantity button: ${closingLabel}`);
    return button;
  };

  it("开仓和平仓共用左右 1 ETH 按钮，动态标签对应 Minus/Plus 图标", () => {
    const decrease = quantityButton("减少平仓数量1 ETH");
    const increase = quantityButton("增加平仓数量1 ETH");
    expect(decrease).toMatch(/type="button"/);
    expect(decrease).toMatch(/aria-label=\{isClosingEntry\s*\?\s*"减少平仓数量1 ETH"\s*:\s*"减少开仓数量1 ETH"\}/);
    expect(decrease).toMatch(/<Minus\b/);
    expect(increase).toMatch(/type="button"/);
    expect(increase).toMatch(/aria-label=\{isClosingEntry\s*\?\s*"增加平仓数量1 ETH"\s*:\s*"增加开仓数量1 ETH"\}/);
    expect(increase).toMatch(/<Plus\b/);
  });

  it("加减和清空数量在平仓复核及有后续平仓的开仓编辑中均禁用", () => {
    for (const label of ["减少平仓数量1 ETH", "增加平仓数量1 ETH", "清空平仓数量"]) {
      const disabled = quantityButton(label).match(/disabled=\{([^}]+)\}/)?.[1];
      expect(disabled).toMatch(/\bisCloseReview\s*\|\|\s*hasDependentCloseOpeningEdit\b/);
    }
    const clear = quantityButton("清空平仓数量");
    expect(clear).toMatch(/aria-label=\{isClosingEntry\s*\?\s*"清空平仓数量"\s*:\s*"清空开仓数量"\}/);
    expect(clear).toMatch(/quantity:\s*""/);
    expect(clear).toContain('document.getElementById("t0-entry-quantity")?.focus()');
  });

  it("加减按钮的禁用判断和点击处理均使用平仓可平数量、开仓 500 ETH 上限", () => {
    for (const [label, direction] of [["减少平仓数量1 ETH", -1], ["增加平仓数量1 ETH", 1]] as const) {
      const button = quantityButton(label);
      expect(button).toContain(`stepT0ClosingQuantity(entryForm.quantity, ${direction}, isClosingEntry ? closingAvailableQuantity : 500)`);
      expect(button).toContain(`stepT0ClosingQuantity(current.quantity, ${direction}, isClosingEntry ? closingAvailableQuantity : 500)`);
    }
  });

  it("快选默认 1/5/10/20/30/40/50/100 ETH，保留上次保存数量并归一去重、数值升序", () => {
    const defaults = source.match(/const DEFAULT_QUANTITY_QUICK_OPTIONS\s*=\s*(\[[^\]]+\]);/)?.[1];
    expect(defaults).toBeTruthy();
    expect(JSON.parse(defaults!).map(Number)).toEqual([1, 5, 10, 20, 30, 40, 50, 100]);
    expect(source).toMatch(/const quantityQuickOptions\s*=\s*useMemo\(\s*\(\)\s*=>\s*Array\.from\(new Set\(\[lastSavedQuantity,\s*\.\.\.DEFAULT_QUANTITY_QUICK_OPTIONS\]\.filter\(Boolean\)\.map\(normalizeEthQuantity\)\)\)\s*\.sort\(\(left,\s*right\)\s*=>\s*Number\(left\)\s*-\s*Number\(right\)\),\s*\[lastSavedQuantity\]/);
  });

  it("开仓快选独立放在数量 Field 之后、价格 Field 之前", () => {
    expect(quantityRegion).toContain('labelFor="t0-entry-quantity"');
    expect(priceRegion).toContain('labelFor="t0-entry-price"');
    const betweenFields = source.slice(quantityFieldEnd, priceFieldStart);
    expect(betweenFields).toMatch(/!isClosingEntry\s*&&\s*<div[^>]*aria-label="开仓数量快选，从小到大"/);
    expect(betweenFields).toContain("quantityQuickOptions.map");
    expect(betweenFields).toMatch(/quantity:\s*normalizeEthQuantity\(value\)/);
    expect(quantityRegion).not.toContain("quantityQuickOptions.map");
    expect(priceRegion).not.toContain("quantityQuickOptions.map");
  });

  it("订单类型图标按钮保留在原数量 Field 的 labelAction 中", () => {
    const labelAction = quantityRegion.slice(quantityRegion.indexOf("labelAction="), quantityRegion.indexOf('<div className="relative min-w-0">'));
    expect(labelAction).toMatch(/labelAction=\{ACTIONS\[entryForm\.action\]\.opening\s*\?/);
    expect(labelAction).toContain('aria-label="订单类型"');
    expect(labelAction).toContain("T0_INSTRUMENT_TYPES.map");
    expect(labelAction).toMatch(/<button\b[\s\S]*?aria-label=\{instrument\.label\}[\s\S]*?aria-pressed=\{isActive\}/);
    expect(labelAction).toContain("selectOpeningInstrumentType(instrument)");
    expect(labelAction).toContain("h-8 w-8");
    expect(labelAction).toContain("{instrument.shortLabel}");
  });

  it("平仓数量和价格同为居中 24px，并以真实文本宽度定位清空按钮", () => {
    const quantityInput = quantityRegion.match(/<input\b[\s\S]*?\/>/)?.[0];
    const priceInput = priceRegion.match(/<input\b[\s\S]*?value=\{entryPriceDisplayValue\}[\s\S]*?\/>/)?.[0];
    expect(quantityInput).toContain("text-center");
    // Tailwind text-2xl = 1.5rem (24px)，输入与测量文本必须使用相同字号。
    expect(quantityInput).toMatch(/isClosingEntry\s*\?\s*"px-12 text-2xl"/);
    expect(priceInput).toMatch(/isClosingEntry\s*\?\s*"px-10 text-2xl text-center"/);
    expect(quantityRegion).toMatch(/<div className=\{`[^`]*left-1\/2[^`]*-translate-x-1\/2[^`]*\$\{isClosingEntry\s*\?\s*"text-2xl"\s*:\s*"text-xl"\}[^`]*`\}>\s*<span aria-hidden="true" className="invisible whitespace-nowrap">\{entryForm\.quantity\s*\|\|\s*"0\.00"\}<\/span>\s*<button/);
    expect(priceRegion).toMatch(/isClosingEntry\s*&&\s*<div className="[^"]*left-1\/2[^"]*-translate-x-1\/2[^"]*text-2xl[^"]*">\s*<span aria-hidden="true" className="invisible whitespace-nowrap">\{entryPriceDisplayValue\s*\|\|\s*"0\.00"\}<\/span>\s*<button/);
    expect(quantityButton("清空平仓数量")).toContain("right-full");
    const priceClear = [...priceRegion.matchAll(/<button\b[\s\S]*?<\/button>/g)].find((match) => match[0].includes('aria-label="清空平仓价"'))?.[0];
    expect(priceClear).toContain("right-full");
  });
});
