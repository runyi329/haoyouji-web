import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// 只提取并执行页面中的定位纯函数，避免导入整个页面的 tRPC/行情依赖。
// AST 按函数名定位，测试运行的是生产源码，不是另一套模拟定位实现。
const source = readFileSync(new URL("../client/src/pages/T0Journal.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("T0Journal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["priceKey", "resolveLadderLivePriceMarker", "applyLadderLivePriceMarker"];
const functions = names.map((name) => {
  const node = ast.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  if (!node) throw new Error(`Missing production function: ${name}`);
  return node.getText(ast);
});
type Marker = { anchorPrice: number; placement: "above" | "below" | "center" };
type Row = { key: string; price: number; livePriceMarkerPlacement?: Marker["placement"] };
const compiled = ts.transpileModule(functions.join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const { resolveLadderLivePriceMarker: resolve, applyLadderLivePriceMarker: apply } = new Function(
  `${compiled}\nreturn { resolveLadderLivePriceMarker, applyLadderLivePriceMarker };`,
)() as {
  resolveLadderLivePriceMarker: (price: number | null, prices: number[], movement?: "up" | "down" | null) => Marker | null;
  applyLadderLivePriceMarker: (rows: Row[], marker: Marker | null) => Row[];
};
const rows = (prices: number[]): Row[] => prices.map((price, index) => ({ key: String(index), price }));
const markedIndices = (values: Row[]) => values.flatMap((row, index) => row.livePriceMarkerPlacement ? [index] : []);

describe("T+0实时价格标识的同价多行边界", () => {
  it("2297.76在最后一行2300与2290.91之间，不落入两行2300中间", () => {
    const input = rows([2320, 2310, 2310, 2305, 2300, 2300, 2290.91, 2290, 2280]);
    const marker = resolve(2297.76, input.map((row) => row.price));
    expect(marker).toEqual({ anchorPrice: 2300, placement: "below" });
    const output = apply(input, marker);
    expect(markedIndices(output)).toEqual([5]);
    expect(output[5].livePriceMarkerPlacement).toBe("below");
    expect(output[6].price).toBeLessThan(2297.76);
    expect(output.map(({ key, price }) => ({ key, price }))).toEqual(input);
    expect(markedIndices(input)).toEqual([]);
  });

  it("实时价归低档上侧时挂第一行，不落入同价多行中间", () => {
    const input = rows([2300, 2300, 2290.91, 2290.91, 2290]);
    const marker = resolve(2291, input.map((row) => row.price));
    expect(marker).toEqual({ anchorPrice: 2290.91, placement: "above" });
    expect(markedIndices(apply(input, marker))).toEqual([2]);
  });

  it.each([
    ["up", "below", 2],
    ["down", "above", 1],
    [null, "center", 1],
  ] as const)("实时价恰好2300，方向%s只挂一处%s", (movement, placement, expectedIndex) => {
    const input = rows([2310, 2300, 2300, 2290]);
    const marker = resolve(2300, input.map((row) => row.price), movement);
    expect(marker).toEqual({ anchorPrice: 2300, placement });
    expect(markedIndices(apply(input, marker))).toEqual([expectedIndex]);
  });

  it("整合报价没有重复价位时仍在原来的相邻边界", () => {
    const input = rows([2310, 2300, 2290, 2280]);
    expect(markedIndices(apply(input, resolve(2297.76, input.map((row) => row.price))))).toEqual([1]);
    expect(resolve(2295, input.map((row) => row.price))).toEqual({ anchorPrice: 2290, placement: "above" });
  });

  it("无行情、无匹配行或空报价不创建新行或标识", () => {
    const input = rows([2300, 2290]);
    expect(apply(input, null)).toBe(input);
    expect(markedIndices(apply(input, { anchorPrice: 2310, placement: "below" }))).toEqual([]);
    expect(apply([], { anchorPrice: 2300, placement: "below" })).toEqual([]);
    for (const value of [null, NaN, Infinity, 0, -1]) expect(resolve(value, [2300, 2290])).toBeNull();
  });
});
