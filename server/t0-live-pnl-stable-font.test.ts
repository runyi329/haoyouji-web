import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const page = ts.createSourceFile("T0Journal.tsx", readFileSync(new URL("../client/src/pages/T0Journal.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const hook = ts.createSourceFile("layout.ts", readFileSync(new URL("../client/src/hooks/useT0ResponsiveLayout.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const result: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(root); return result;
}
function run(code: string, globals: Record<string, unknown>) {
  return vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText, globals, { timeout: 1000 });
}
function attr(element: ts.JsxElement, name: string) {
  return element.openingElement.attributes.properties.find((node): node is ts.JsxAttribute => ts.isJsxAttribute(node) && node.name.getText(page) === name);
}
const pnlNodes = nodes(page, ts.isJsxElement).filter(node => {
  const text = node.getText(page);
  return !!attr(node, "data-t0-fit-ignore") && !nodes(node, ts.isJsxElement).some(child => child !== node && !!attr(child, "data-t0-fit-ignore"))
    && (text.includes("`${formatSigned(floatingPnl)} U`") || text.includes("`${formatSigned(entrySideSummary.unrealized)} U`"));
});

describe("平仓实时盈亏固定字号：真实生产AST，无应用导入/数据库", () => {
  it("逐笔实时盈亏、展开盈亏及汇总三处不再参与数字自动缩放", () => {
    expect(pnlNodes).toHaveLength(3);
    for (const node of pnlNodes) {
      expect(attr(node, "data-t0-fit")).toBeUndefined();
      expect(attr(node, "data-t0-fit-ignore")).toBeDefined();
      expect(node.getText(page)).toContain("tabular-nums");
      expect(node.getText(page)).toContain("overflow-x-auto");
      expect(node.getText(page)).not.toContain("text-ellipsis");
    }
  });
  it("小数、正负、金额位数变化时保持各自13/11/10px字号和行高", () => {
    const fonts = pnlNodes.map(node => {
      const value = attr(node, "className")?.initializer;
      if (!value || !ts.isJsxExpression(value) || !value.expression) throw new Error("Missing production className");
      const sizes = [null, -9.99, -10, -999.99, -1000, 0, 9.99, 10, 999.99, 1000000].map(amount => {
        const classes = run(`(${value.expression!.getText(page)});`, { floatingPnl: amount, entrySideSummary: { unrealized: amount } }) as string;
        return classes.match(/text-\[(\d+)px\]/)?.[1];
      });
      expect(new Set(sizes).size).toBe(1);
      expect(node.getText(page)).toMatch(/leading-(?:4|5)/);
      return sizes[0];
    });
    expect(fonts).toEqual(["13", "11", "10"]);
  });
  it("真实字体适配器在任何行情值下拒绝处理ignore节点", () => {
    const fn = nodes(hook, ts.isFunctionDeclaration).find(node => node.name?.text === "permitted");
    if (!fn) throw new Error("Missing real permitted function");
    const scope = {};
    const element = { closest: (selector: string) => selector === "scope" ? scope : selector === "ignore" ? {} : null };
    const forbidden = () => { throw new Error("Ignored number must not be measured"); };
    const result = run(`${fn.getText(hook)}; [permitted(element, false), permitted(element, true)];`, {
      element, SCOPE: "scope", IGNORE: "ignore", NUMBER: { test: forbidden }, fixedSizeClasses: forbidden,
    });
    expect(Array.from(result)).toEqual([false, false]);
  });
});
