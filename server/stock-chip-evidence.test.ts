import { describe, expect, it } from "vitest";
import { resolveCheckedChipPoint, type ChipEvidenceInput } from "./stock-chip-evidence";

// Deterministic contract tests, not mock market data in the application.
const now = Date.parse("2026-11-08T04:00:00Z");
const input: ChipEvidenceInput = { tsCode: "000001.SZ", date: "2026-11-06",
  rawClose: 12, rawAdjFactor: 2, weightAvg: 10, winnerRate: 50,
  anchorDate: "2026-11-06", anchorFactor: 2 };
function report() {
  return { schemaVersion: 1, method: "tushare-cdf-price-basis-v1",
    scope: "checked-stock-dates-only", vendorRuleConfirmed: false,
    generatedAt: "2026-11-08T03:00:00Z", expiresAt: "2026-11-09T03:00:00Z",
    checks: [{ tsCode: input.tsCode, tradeDate: input.date, status: "sample_passed",
      basisCandidates: ["unadjusted", "qfq"], method: "candidate-equivalent",
      rawClose: 12, rawAdjFactor: 2, weightAvg: 10, winnerRate: 50,
      targetAnchorDate: input.anchorDate, targetAnchorFactor: 2, chipAverageCost: 10,
      referencePrices: { unadjusted: 12, qfq: 12, hfq: 24 } }] };
}
describe("仅已检查股票日期的筹码证据", () => {
  it("只在当前值与目标锚点全部匹配时允许样本点", () => {
    expect(resolveCheckedChipPoint(report(), input, now)).toEqual({ status: "ready", value: 10, verification: "sample" });
  });
  it.each([null, {}, { ...report(), vendorRuleConfirmed: true },
    { ...report(), scope: "all-stocks" }, { ...report(), schemaVersion: 2 }])("无有效范围不得批准%j", value => {
    expect(resolveCheckedChipPoint(value, input, now).value).toBeNull();
  });
  it.each([{ tsCode: "002594.SZ" }, { date: "2026-11-05" }])("不会推广到未查股票或日期%j", change => {
    expect(resolveCheckedChipPoint(report(), { ...input, ...change }, now).value).toBeNull();
  });
  it.each([{ rawClose: 13 }, { rawAdjFactor: 3 }, { weightAvg: 11 },
    { winnerRate: 51 }, { anchorDate: "2026-11-05" }, { anchorFactor: 3 }])("当前数据改变撤销证据%j", change => {
    expect(resolveCheckedChipPoint(report(), { ...input, ...change }, now)).toEqual({ status: "version_mismatch", value: null });
  });
  it("过期或来自未来的结果不能使用", () => {
    expect(resolveCheckedChipPoint(report(), input, Date.parse("2026-11-10T00:00:00Z")).value).toBeNull();
    expect(resolveCheckedChipPoint(report(), input, Date.parse("2026-11-07T00:00:00Z")).value).toBeNull();
  });
  it("重复股票日期拒绝", () => {
    const r = report(); r.checks.push({ ...r.checks[0] });
    expect(resolveCheckedChipPoint(r, input, now).value).toBeNull();
  });
  it("检查结果为失败或不可比时绝不改ready", () => {
    const r = report(); r.checks[0].status = "incomparable";
    expect(resolveCheckedChipPoint(r, input, now).value).toBeNull();
  });
  it("候选转换结果冲突拒绝，即使文件标sample_passed", () => {
    const r = report(); r.checks[0].referencePrices.qfq = 10;
    expect(resolveCheckedChipPoint(r, input, now).value).toBeNull();
  });
  it("成本结果算错不能绘制", () => {
    const r = report(); r.checks[0].chipAverageCost = 99;
    expect(resolveCheckedChipPoint(r, input, now).value).toBeNull();
  });
  it("单一前复权候选按该日价格尺度正确映射，不重复复权", () => {
    const r = report(); const c = r.checks[0];
    c.basisCandidates = ["qfq"]; c.method = "single-candidate";
    c.referencePrices.qfq = 6; c.chipAverageCost = 20;
    expect(resolveCheckedChipPoint(r, input, now).value).toBe(20);
  });
  it("非有限数和缺字段不能使用", () => {
    const r = report(); r.checks[0].chipAverageCost = Infinity;
    expect(resolveCheckedChipPoint(r, input, now).value).toBeNull();
    expect(resolveCheckedChipPoint(report(), { ...input, winnerRate: NaN }, now).value).toBeNull();
  });
});
