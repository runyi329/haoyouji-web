import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StockConsecutiveDaySquares from "./StockConsecutiveDaySquares";

function renderSSR(days: number, isLowerBound = false, title?: string) {
  return renderToStaticMarkup(createElement(StockConsecutiveDaySquares, { days, isLowerBound, title }));
}

function squareNumbers(html: string) {
  return [...html.matchAll(/data-stock-monitor-day-square="(\d+)"/g)].map(match => Number(match[1]));
}

describe("StockConsecutiveDaySquares：一个已确认交易日一个方格", () => {
  it.each([1, 2, 4, 10, 12, 13, 100, 1000])("%i天精确绘制同等数量且序号连续的格子", days => {
    const html = renderSSR(days);
    expect(squareNumbers(html)).toEqual(Array.from({ length: days }, (_, index) => index + 1));
    expect(html).toContain(`data-stock-monitor-consecutive="${days}天"`);
    expect(html).toContain(`连续${days}个交易日收盘符合条件，不是连续上涨`);
    expect(html).toContain("不代表买卖信号");
    expect(html).not.toContain("data-stock-monitor-lower-bound");
    expect(html).not.toContain("data-stock-monitor-remaining-days");
    expect(html).not.toMatch(/>连续\d+天</);
  });

  it("下限≥4仍画4格，保留外层身份并解释可能更多，不画未知格", () => {
    const html = renderSSR(4, true);
    expect(squareNumbers(html)).toEqual([1, 2, 3, 4]);
    expect(html).toContain('data-stock-monitor-consecutive="≥4天"');
    expect(html).toContain('data-stock-monitor-lower-bound="true"');
    expect(html).toContain("≥</span>");
    expect(html).toContain("已知至少4个交易日，实际持续天数可能更多");
    expect(html).toContain("未知天数不画格");
  });

  it.each([0, Number.NaN, -1, Infinity, -Infinity, 1.5])("无效或零输入%s不制造格子", days => {
    for (const lowerBound of [false, true]) {
      const html = renderSSR(days, lowerBound);
      expect(squareNumbers(html)).toEqual([]);
      expect(html).toContain(`data-stock-monitor-consecutive="${lowerBound ? "≥" : ""}0天"`);
      expect(html).toContain("暂无已确认的连续符合条件交易日");
      expect(html).not.toContain("NaN");
      expect(html).not.toContain("Infinity");
    }
  });

  it.each([false, true])("超1000天仅画1000格，精确公开余数（下限%s）", isLowerBound => {
    const html = renderSSR(1234, isLowerBound);
    expect(squareNumbers(html)).toEqual(Array.from({ length: 1000 }, (_, index) => index + 1));
    expect(html).toContain(`data-stock-monitor-consecutive="${isLowerBound ? "≥" : ""}1234天"`);
    expect(html).toContain('data-stock-monitor-remaining-days="234"');
    expect(html).toContain("+剩余234天");
    expect(html).toContain("显示前1000格，其余234天未绘制方格");
    expect(html).toContain("连续1234个交易日收盘符合条件");
  });

  it("超过12格有实际天数title与单次完整aria读数，每个内部span隐藏于读屏", () => {
    const html = renderSSR(13, true, "样本说明");
    const label = html.match(/aria-label="([^"]+)"/)?.[1];
    expect(label).toContain("连续13个交易日收盘符合条件");
    expect(label).toContain("实际持续天数可能更多");
    expect(label).toContain("样本说明");
    expect(html).toContain(`title="${label}"`);
    expect(html.match(/role="img"/g)).toHaveLength(1);
    expect(html.match(/aria-label=/g)).toHaveLength(1);
    expect([...html.matchAll(/<span\b[^>]*>/g)].every(match => match[0].includes('aria-hidden="true"'))).toBe(true);
    expect(html).toContain('tabindex="0"');
  });

  it("源码和SSR锁定16px单行、8px方格、2px间隙，横滚且格子不压缩", () => {
    const source = readFileSync(new URL("./StockConsecutiveDaySquares.tsx", import.meta.url), "utf8");
    const html = renderSSR(10);
    for (const css of ["height:16px", "min-height:16px", "max-height:16px", "min-width:0", "flex-wrap:nowrap", "gap:2px", "overflow-x:auto", "overflow-y:hidden", "scrollbar-width:none"]) {
      expect(html).toContain(css);
    }
    const squareSpans = [...html.matchAll(/<span\b[^>]*data-stock-monitor-day-square[^>]*>/g)];
    expect(squareSpans).toHaveLength(10);
    for (const [span] of squareSpans) {
      for (const css of ["width:8px", "height:8px", "flex-shrink:0", "box-sizing:border-box", "border:1px solid #408B77", "border-radius:1px", "background-color:#50A78F"]) {
        expect(span).toContain(css);
      }
    }
    expect(source).toContain("[&::-webkit-scrollbar]:hidden");
    expect(source).toContain("MAX_VISIBLE_DAYS = 1000");
    expect(source).not.toMatch(/fetch\(|trpc|useEffect/);
  });
});
