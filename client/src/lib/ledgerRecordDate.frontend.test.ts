import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBeijingLedgerRecordToday, getLedgerRecordDateError } from "@shared/ledger-record-date";
import { formatLedgerRecordDate, getLedgerRecordInitialDate } from "./ledgerRecordDate";

const source = readFileSync(new URL("../pages/AddTransaction.tsx", import.meta.url), "utf8");
const file = ts.createSourceFile("AddTransaction.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
// Execute the actual frontend handlers with inert spies; never load tRPC or connect to a server.
function handler(name: string, scope: Record<string, unknown>) {
  let expression = "";
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name && node.initializer) expression = node.initializer.getText(file);
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (!expression) throw new Error(`Missing frontend handler ${name}`);
  const js = ts.transpileModule(`const execute = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(scope), `${js}; return execute;`)(...Object.values(scope));
}
function setup(ledgerId = 37, date = "2026-11-11", edit = false) {
  const add = { isPending: false, mutate: vi.fn() };
  const update = { isPending: false, mutate: vi.fn() };
  const toast = { error: vi.fn() };
  const scope: Record<string, any> = {
    ledgerId, toast, getLedgerRecordDateError, formatLedgerRecordDate,
    addTransactionMutation: add, updateTransactionMutation: update,
    addCapitalMutation: add, addTransferMutation: add,
    isEditMode: edit, editTransactionId: edit ? 9394 : undefined, editTransaction: edit ? {} : undefined,
    selectedDateStr: date, selectedCategoryPath: [2], selectedAccounts: [], amount: "100",
    transactionType: "expense", note: "", uploadedImages: [], isCustomAA: true, stockInputs: [],
    reimbursementStatus: "none", pendingType: null, pendingIncludeStats: 1,
    viewAsUserId: null, isCustomAJ: false,
    capitalAmount: "100", capitalDate: getLedgerRecordInitialDate(37, date), capitalNote: "", capitalSubType: "capital_add",
    transferAmount: "100", transferDate: getLedgerRecordInitialDate(37, date), transferNote: "", transferSubType: "withdraw",
    currentCategoryId: 2,
  };
  scope.validateRecordDate = handler("validateRecordDate", scope);
  return { scope, add, update, toast, save: () => handler("handleSave", scope)() };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-11T08:00:00Z")); });
afterEach(() => vi.useRealTimers());

describe("37号账目日期前端接线（离线）", () => {
  it("北京时间午夜默认日期、民用日期格式不随浏览器时区偏移", () => {
    vi.setSystemTime(new Date("2026-11-10T16:00:00Z"));
    expect(getBeijingLedgerRecordToday()).toBe("2026-11-11");
    expect(formatLedgerRecordDate(getLedgerRecordInitialDate(37))).toBe("2026-11-11");
    expect(formatLedgerRecordDate(getLedgerRecordInitialDate(37, "2026-01-01"))).toBe("2026-01-01");
    expect(source).toContain("const initDate = getLedgerRecordInitialDate(ledgerId, presetDateStr)");
    expect(source).toContain("const today = getLedgerRecordInitialDate(ledgerId)");
  });

  it.each([false, true])("新增/编辑阻止11月16日未来日期，包括未改日期的已有记录；edit=%s", (edit) => {
    const s = setup(37, "2026-11-16", edit);
    s.save();
    expect(s.add.mutate).not.toHaveBeenCalled();
    expect(s.update.mutate).not.toHaveBeenCalled();
    expect(s.toast.error).toHaveBeenCalledWith(expect.stringContaining("北京时间"));
  });

  it.each(["2026-11-11", "2026-01-01"])("新增与修正编辑均允许今日/历史日期：%s", (date) => {
    for (const edit of [false, true]) {
      const s = setup(37, date, edit);
      s.save();
      const expected = edit ? s.update : s.add;
      expect(expected.mutate).toHaveBeenCalledWith(expect.objectContaining({ ledgerId: 37, transactionDate: date }));
      expect(s.toast.error).not.toHaveBeenCalled();
    }
  });

  it("不允许编辑详情未加载时用默认今日覆盖原日期", () => {
    const s = setup(37, "2026-11-11", true);
    s.scope.editTransaction = undefined;
    s.save();
    expect(s.update.mutate).not.toHaveBeenCalled();
  });

  it("52号及其他账本未来新增/编辑不受37号规则影响", () => {
    for (const ledgerId of [52, 59]) for (const edit of [false, true]) {
      const s = setup(ledgerId, "2026-11-16", edit);
      s.save();
      expect((edit ? s.update : s.add).mutate).toHaveBeenCalled();
    }
  });

  it("重复覆盖弹窗对实际待提交日期重新校验，不绕过新增/编辑限制", () => {
    for (const mode of ["add", "edit"]) for (const date of ["2026-11-16", "2026-11-11"]) {
      const s = setup();
      s.scope.pendingDuplicatePayload = { ledgerId: 37, transactionDate: date };
      s.scope.pendingDuplicateMode = mode;
      handler("handleConfirmOverwrite", s.scope)();
      if (date === "2026-11-16") {
        expect(s.add.mutate).not.toHaveBeenCalled();
        expect(s.update.mutate).not.toHaveBeenCalled();
      } else {
        expect((mode === "edit" ? s.update : s.add).mutate).toHaveBeenCalledWith(expect.objectContaining({ overwriteExisting: true, transactionDate: date }));
      }
    }
  });

  it("独立提现/本金实际写账也拦截未来并允许历史补录", () => {
    for (const name of ["handleSaveTransfer", "handleSaveCapital"]) {
      const future = setup(37, "2026-11-16");
      handler(name, future.scope)();
      expect(future.add.mutate).not.toHaveBeenCalled();
      const past = setup(37, "2026-01-01");
      handler(name, past.scope)();
      expect(past.add.mutate).toHaveBeenCalledWith(expect.objectContaining({ transactionDate: "2026-01-01" }));
    }
  });

  it("真实日期选择处理器阻止键盘输入未来，允许今日和历史确认", () => {
    for (const date of ["2026-11-16", "2026-11-11", "2026-11-10"]) {
      const s = setup();
      Object.assign(s.scope, {
        isNonTradingDay: () => null,
        isToday: (value: Date) => formatLedgerRecordDate(value) === getBeijingLedgerRecordToday(),
        setSelectedDate: vi.fn(), setDisplayDate: vi.fn(), setIsDateSheetOpen: vi.fn(), setPendingDate: vi.fn(), setShowDateConfirm: vi.fn(),
      });
      handler("handleDateSelect", s.scope)(getLedgerRecordInitialDate(37, date));
      if (date === "2026-11-16") {
        expect(s.scope.setSelectedDate).not.toHaveBeenCalled();
        expect(s.scope.setPendingDate).not.toHaveBeenCalled();
      } else if (date === "2026-11-11") {
        expect(s.scope.setSelectedDate).toHaveBeenCalled();
      } else {
        expect(s.scope.setPendingDate).toHaveBeenCalled();
      }
    }
  });

  it("真实日期input具备北京时间max且日历未来禁用；直接页面/日历弹窗共用入口", () => {
    const dateInputs: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === "input" && node.attributes.getText(file).includes('type="date"')) dateInputs.push(node.getText(file));
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(dateInputs).toHaveLength(3);
    for (const input of dateInputs) expect(input).toMatch(/max=\{(?:ledgerId === 37 \? )?getBeijingLedgerRecordToday\(\)/);
    expect(source).toContain("const dateError = getLedgerRecordDateError(ledgerId, formatLedgerRecordDate(day))");
    expect(source).toContain("disabled={isDisabled}");
    const aa = readFileSync(new URL("../pages/LedgerDetailAA.tsx", import.meta.url), "utf8");
    const detail = readFileSync(new URL("../pages/TransactionDetail.tsx", import.meta.url), "utf8");
    const routes = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
    expect(aa).toContain("/add?edit=${recordId}");
    expect(aa).toContain("/add?date=${dateStr}");
    expect(detail).toContain("/add?edit=${transactionId}");
    expect(routes).toContain('<Route path="/ledger/:id/add" component={AddTransaction}');
  });
});
