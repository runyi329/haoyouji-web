import fs from "node:fs";
import type { StockMonitorChipStatus } from "../shared/stock-ma-monitor";

export interface ChipEvidenceInput {
  tsCode: string;
  date: string;
  rawClose: number;
  rawAdjFactor: number;
  weightAvg: number;
  winnerRate: number;
  anchorDate: string;
  anchorFactor: number;
}
export interface CheckedChipPoint {
  status: StockMonitorChipStatus;
  value: number | null;
  verification?: "sample";
}
const unavailable: CheckedChipPoint = { status: "unknown_basis", value: null };
const bases = new Set(["unadjusted", "raw", "qfq", "hfq"]);
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(0.000001, Math.abs(a) * 1e-8);
}

/** 校验特定股票日期的当次样本结果，不把样本升级为供应商规则认证。 */
export function resolveCheckedChipPoint(
  report: unknown,
  input: ChipEvidenceInput,
  now = Date.now(),
): CheckedChipPoint {
  if (!object(report) || report.schemaVersion !== 1 ||
      report.method !== "tushare-cdf-price-basis-v1" ||
      report.scope !== "checked-stock-dates-only" || report.vendorRuleConfirmed !== false ||
      typeof report.generatedAt !== "string" || typeof report.expiresAt !== "string" ||
      !Array.isArray(report.checks) || report.checks.length > 30) return unavailable;
  const generated = Date.parse(report.generatedAt), expires = Date.parse(report.expiresAt);
  if (!Number.isFinite(generated) || !Number.isFinite(expires) || generated > now ||
      expires <= now || expires <= generated || expires - generated > 24 * 60 * 60_000) {
    return { status: "version_mismatch", value: null };
  }
  if (![input.rawClose, input.rawAdjFactor, input.weightAvg, input.anchorFactor].every(positive) ||
      !finite(input.winnerRate) || input.winnerRate < 0 || input.winnerRate > 100) return unavailable;
  const found = report.checks.filter(check => object(check) &&
    check.tsCode === input.tsCode && check.tradeDate === input.date);
  if (found.length === 0) return unavailable;
  if (found.length !== 1 || !object(found[0])) return { status: "incompatible_basis", value: null };
  const check = found[0];
  if (check.status !== "sample_passed") return { status: "incompatible_basis", value: null };
  if (check.targetAnchorDate !== input.anchorDate ||
      !positive(check.targetAnchorFactor) || !close(check.targetAnchorFactor, input.anchorFactor) ||
      !positive(check.rawClose) || !close(check.rawClose, input.rawClose) ||
      !positive(check.rawAdjFactor) || !close(check.rawAdjFactor, input.rawAdjFactor) ||
      !positive(check.weightAvg) || !close(check.weightAvg, input.weightAvg) ||
      !finite(check.winnerRate) || !close(check.winnerRate, input.winnerRate)) {
    return { status: "version_mismatch", value: null };
  }
  if (!positive(check.chipAverageCost) || !object(check.referencePrices) ||
      !Array.isArray(check.basisCandidates) || check.basisCandidates.length < 1 ||
      check.basisCandidates.length > 3 || new Set(check.basisCandidates.map(basis => basis === "raw" ? "unadjusted" : basis)).size !== check.basisCandidates.length ||
      check.basisCandidates.some(basis => typeof basis !== "string" || !bases.has(basis))) {
    return { status: "incompatible_basis", value: null };
  }
  const prices = check.referencePrices;
  if (!positive(prices.unadjusted) || !close(prices.unadjusted, input.rawClose)) {
    return { status: "incompatible_basis", value: null };
  }
  const expectedMethod = check.basisCandidates.length === 1 ? "single-candidate" : "candidate-equivalent";
  if (check.method !== expectedMethod) return { status: "incompatible_basis", value: null };
  for (const basis of check.basisCandidates as string[]) {
    const price = prices[basis === "raw" ? "unadjusted" : basis];
    if (!positive(price)) return { status: "incompatible_basis", value: null };
    // 将该日已核对的价格尺度映射到图表锚点，不声称已确定官方全局锚点。
    const candidateCost = input.weightAvg * input.rawClose / price * input.rawAdjFactor / input.anchorFactor;
    if (!positive(candidateCost) || !close(candidateCost, check.chipAverageCost)) {
      return { status: "incompatible_basis", value: null };
    }
  }
  return { status: "ready", value: check.chipAverageCost, verification: "sample" };
}

/** 仅读服务器配置的私有摘要文件；文件缺失、格式错误或过期均不能批准价格。 */
export function readChipEvidence(): unknown {
  const path = process.env.TUSHARE_CHIP_EVIDENCE_FILE;
  if (!path) return null;
  try {
    const stat = fs.lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256_000) return null;
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
