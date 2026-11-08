import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ChipCostModelExplanation from "./ChipCostModelExplanation";

const html = renderToStaticMarkup(createElement(ChipCostModelExplanation));
describe("内置筹码算法独立图解", () => {
  it("包含三角分配和旧新迁移的两幅教学图，说明不依赖外部链接", () => {
    expect(html).toContain('data-stock-chip-model-explanation="true"');
    expect(html).toContain('data-stock-chip-model-figure="triangle"');
    expect(html).toContain('data-stock-chip-model-figure="migration"');
    expect(html).toContain("教学示意");
    expect(html).toContain("不是某只股票的真实分布或实时数据");
    for (const text of ["Tushare", "cyq_chips", "cyq_perf", "weight_avg", "href=", "http", "输入参数", "积分", "限量", "接口"]) expect(html).not.toContain(text);
  });
  it("三角图明确均价为峰值，两边价位及单位面积齐全", () => {
    for (const text of ["最低价 L", "均价 A", "最高价 H", "分配密度", "峰值", "总面积 = 1"]) expect(html).toContain(text);
    expect(html).toContain("A 不必位于区间正中");
  });
  it("假设替换示意保持同一比例尺，80旧加20新均值正确", () => {
    expect(html).toContain('width="240"');
    expect(html).toContain('width="192"');
    expect(html).toContain('width="48"');
    expect(192 + 48).toBe(240);
    expect(192 / 240).toBe(0.8);
    expect(48 / 240).toBe(0.2);
    expect((80 * 10 + 20 * 12) / 100).toBe(10.4);
    expect(html).toContain("10.40 元");
    expect(html).toContain("20% 只是教学假设");
    expect(html).toContain("页面成本读取实际已发布记录");
  });
  it("自然保留模型估计及未知参数边界，不宣称自研或真实账户明细", () => {
    expect(html).toContain("真实模型的完整衰减参数未公开");
    expect(html).toContain("模型层面的估计");
    expect(html).toContain("不是个人真实账户的持仓成本");
    expect(html).not.toContain("自研");
    expect(html).toContain("text-[11px]");
  });
});
