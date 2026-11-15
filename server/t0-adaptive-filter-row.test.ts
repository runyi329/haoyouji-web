import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { distributeT0FilterWidths } from "../client/src/components/T0AdaptiveFilterRow";

const source = readFileSync(new URL("../client/src/pages/T0Journal.tsx", import.meta.url), "utf8");
const component = readFileSync(new URL("../client/src/components/T0AdaptiveFilterRow.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../client/src/styles/t0-responsive.css", import.meta.url), "utf8");
const tree = ts.createSourceFile("T0Journal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function preservesWidth(natural: number[], available: number) {
  const result = distributeT0FilterWidths(natural, available);
  expect(result).toHaveLength(natural.length);
  expect(result.reduce((sum, width) => sum + width, 0)).toBeCloseTo(available, 8);
  expect(result.every((width) => Number.isFinite(width) && width >= 0)).toBe(true);
  return result;
}

describe("真实筛选内容优先于均分空白", () => {
  it("中间用户姓名更长时回收左右空白，而不是压缩姓名", () => {
    const result = preservesWidth([96, 140, 96], 356);
    expect(result[1]).toBeGreaterThan(result[0]);
    expect(result[1]).toBeGreaterThanOrEqual(140);
    expect(result[0] - 96).toBeCloseTo(result[1] - 140, 8);
    expect(result[0]).toBeCloseTo(result[2], 8);
  });
  it("即使只选中一个短名字，也包含用户标签、箭头和内边距所需宽度", () => {
    const result = preservesWidth([96, 115, 96], 340);
    expect(result.every((width, index) => width >= [96, 115, 96][index])).toBe(true);
  });
  it("三项全部时等宽，全部选定或其中有固定项目时仍按真实内容分配", () => {
    expect(distributeT0FilterWidths([98, 98, 98], 360)).toEqual([120, 120, 120]);
    const result = preservesWidth([120, 132, 88], 360);
    expect(result[1]).toBeGreaterThan(result[0]);
    expect(result[2]).toBeGreaterThanOrEqual(88);
  });
  it("窄屏和超长名字保留整行边界，交由原字号换行兜底", () => {
    for (const available of [280, 320, 356, 408]) {
      const result = preservesWidth([96, 800, 96], available);
      expect(result[1]).toBeGreaterThan(result[0]);
      expect(result.every((width) => width >= 44)).toBe(true);
    }
  });
  it("超长名字不能侵占左右标签、箭头与一个字符的固定空间", () => {
    const result = distributeT0FilterWidths([100, 1000, 100], 310, [88, 86, 88]);
    expect(result[0]).toBeGreaterThanOrEqual(88);
    expect(result[2]).toBeGreaterThanOrEqual(88);
    expect(result[1]).toBeGreaterThanOrEqual(86);
    expect(result.reduce((sum, width) => sum + width, 0)).toBeCloseTo(310, 8);
  });
  it("成员双栏、返回全部、极小宽度和异常测量均无越界或NaN", () => {
    preservesWidth([132, 98], 340);
    preservesWidth([500, 900], 30);
    preservesWidth([Infinity, NaN, -1], 100);
    expect(distributeT0FilterWidths([], 320)).toEqual([]);
    expect(distributeT0FilterWidths([80, 80, 80], NaN)).toEqual([0, 0, 0]);
  });
});

describe("使用原筛选UI且不改变账务处理", () => {
  it("顶部和历史均复用同一个自适应行，保留原子控件", () => {
    const rows: ts.JsxElement[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "T0AdaptiveFilterRow") rows.push(node);
      ts.forEachChild(node, visit);
    };
    visit(tree);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.getText(tree).includes("T0MultiSelect"))).toBe(true);
    expect(rows[0].getText(tree)).toContain('openAdminMemberPicker("filter")');
    expect(rows[0].getText(tree)).toContain("LockedFilterValue");
  });
  it("按实际管理员摘要计算首次回退，不使用可能不同的目录姓名", () => {
    expect(source).toContain('canManage ? `用户${adminFilterSummary}`');
    expect(component).toContain("const initialStyleRef = useRef(style)");
    expect(component).toContain("style={initialStyleRef.current}");
  });
  it("测宽不缩放字体，忽略自身测量节点，解绑观察器及未执行的帧", () => {
    expect(component).toContain('"font-family", "font-size", "font-weight"');
    expect(component).toContain('computed.getPropertyValue(property), "important"');
    expect(component).toContain('record.target.closest("[data-t0-filter-measure]")');
    expect(component).toContain('node.hasAttribute("data-t0-filter-measure")');
    expect(component).toContain("cancelAnimationFrame(frame)");
    expect(component).toContain("observer.disconnect()");
    expect(component).toContain("resize?.disconnect()");
    expect(component).not.toContain("mutate");
    expect(component).not.toContain("scale(");
    expect(component).not.toContain('attributes: true');
  });
  it("极端长姓名原字号换行，不用截断省略兜底", () => {
    const scoped = css.slice(css.indexOf("/* 筛选三栏先按完整内容回收空白"));
    expect(scoped).toContain("white-space: normal");
    expect(scoped).toContain("overflow: visible");
    expect(scoped).toContain("text-overflow: clip");
    expect(scoped).toContain("overflow-wrap: anywhere");
    expect(scoped).not.toContain("font-size");
  });
});
