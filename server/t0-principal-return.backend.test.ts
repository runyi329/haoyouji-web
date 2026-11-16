import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const text = readFileSync(new URL("./ledger52-t0-journal.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("ledger52-t0-journal.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

function functionText(name: string) {
  const node = ast.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name);
  if (!node) throw new Error(`missing production function: ${name}`);
  return node.getText(ast).replace(/\s+/g, " ");
}

describe("52号T0本金返还：真实生产代码离线契约", () => {
  it("定义来源类型、日志映射和建表/迁移默认 income", () => {
    expect(text).toContain('export type T0JournalWithdrawalSource = "income" | "principal";');
    expect(text).toContain("withdrawal_source ENUM('income','principal') NOT NULL DEFAULT 'income'");
    expect(text).toContain("ADD COLUMN withdrawal_source ENUM('income','principal') NOT NULL DEFAULT 'income'");
    expect(text).toContain("normalizeWithdrawalSource(row.withdrawal_source)");
    expect(text).toContain("withdrawalSource");
  });

  it("本金和收益分别计算，保留旧 availableAmount income 兼容字段", () => {
    const availability = functionText("getLedger52T0JournalPayoutAvailability");
    for (const field of [
      "depositTotal", "incomeWithdrawalTotal", "principalWithdrawalTotal",
      "principalBookBalance", "availablePrincipalAmount", "availableIncomeAmount",
      "withdrawalTotal", "availableAmount", "incomeUnavailableReason",
    ]) expect(availability).toContain(field);
    expect(availability).toContain("payoutAmountToCents(depositTotal) - payoutAmountToCents(principalWithdrawalTotal)");
    expect(availability).toContain("catch (error)");
    expect(availability).toContain("availableIncomeAmount");
    expect(availability).toContain(": null");
    expect(availability).not.toContain("ensureLedger52T0JournalTables");
  });

  it("本金提现不调用收益上限；收益提现仍调用完整收益事实", () => {
    const create = functionText("createLedger52T0JournalPayoutLog");
    const update = functionText("updateLedger52T0JournalPayoutLog");
    for (const body of [create, update]) {
      expect(body).toContain("withdrawalSource");
      expect(body).toContain("users WHERE id = ? FOR UPDATE");
      expect(body).toContain("withdrawal_source = 'principal'");
      expect(body).toContain("getLedger52T0JournalWithdrawalIncomeCap");
      expect(body).toContain("本金提现将超过累计有效投入本金");
    }
    expect(create).toContain("direction === \"withdrawal\" && input.withdrawalSource === \"principal\"");
    expect(update).toContain("input.withdrawalSource === undefined");
    expect(update).toContain("提现来源不可切换");
  });

  it("deposit+principal 被拒绝，并发编辑/删除 deposit 会校验已返本金", () => {
    const create = functionText("createLedger52T0JournalPayoutLog");
    const update = functionText("updateLedger52T0JournalPayoutLog");
    const remove = functionText("deleteLedger52T0JournalPayoutLog");
    expect(create).toContain("存入流水不能设置提现来源");
    expect(update).toContain("减少投入后将低于已返还本金，未改账");
    expect(remove).toContain("删除投入后将低于已返还本金，未改账");
    expect(remove).toContain("users WHERE id = ? FOR UPDATE");
  });

  it("只读旧表先 SHOW COLUMNS，缺列映射 income；团队现金流仍仅 direction/amount", () => {
    expect(text).toContain("SHOW COLUMNS FROM ledger52_t0_journal_payout_logs LIKE 'withdrawal_source'");
    expect(text).toContain('"\'income\' AS withdrawal_source"');
    const facts = functionText("getLedger52T0JournalTeamFinancialFacts");
    expect(facts).toContain("payout.direction, payout.amount, payout.created_at");
    expect(facts).not.toContain("payout.withdrawal_source");
  });

  it("保留固定精度金额处理，不依赖行情或持仓挂单", () => {
    expect(text).toContain("floorPayoutAmountToCents");
    expect(text).toContain("payoutAmountToCents");
    const create = functionText("createLedger52T0JournalPayoutLog");
    expect(create).not.toMatch(/getCrypto|getTicker|marketPrice|pending.*principal/i);
  });
});
