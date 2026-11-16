import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { getT0PayoutWithdrawalLimit, getT0WithdrawalLabel, getT0WithdrawalSource, type T0PayoutAvailability } from "../client/src/lib/t0PayoutWithdrawal";

const pageText = readFileSync(new URL("../client/src/pages/T0Journal.tsx", import.meta.url), "utf8");
const page = ts.createSourceFile("T0Journal.tsx", pageText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const routerText = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const router = ts.createSourceFile("routers.ts", routerText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T) {
  const found: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(root); return found;
}
function required<T>(value: T | undefined, label: string): T { if (!value) throw new Error(`Missing production AST: ${label}`); return value; }
function initializer(name: string) {
  return required(nodes(page, ts.isVariableDeclaration).find((node) => ts.isIdentifier(node.name) && node.name.text === name)?.initializer, name);
}
function isolated(expression: string, dependencies: Record<string, unknown>) {
  const output = ts.transpileModule(`const __result = (${expression});`, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, jsxFactory: "element",
  } }).outputText;
  return new vm.Script(`${output}\n;__result;`).runInContext(vm.createContext({
    ...dependencies, exports: {}, require: () => { throw new Error("Forbidden runtime import"); },
  }), { timeout: 2500 });
}
const availability: T0PayoutAvailability = {
  relatedUserId: 2, depositTotal: 1000, principalWithdrawalTotal: 300, incomeWithdrawalTotal: 20,
  availablePrincipalAmount: 700, availableIncomeAmount: 80, availableAmount: 80, income: { total: 100 },
};
const editingPrincipal = { relatedUserId: 2, direction: "withdrawal" as const, withdrawalSource: "principal" as const, amount: 300 };

describe("本金与收益前端权威额度", () => {
  it("分别显示两种可提额度，收益提现不抵本金", () => {
    expect(getT0PayoutWithdrawalLimit(availability, 2, "income")).toBe(80);
    expect(getT0PayoutWithdrawalLimit(availability, 2, "principal")).toBe(700);
  });
  it.each([0, -100])("收益为%s不影响本金返还", (total) => {
    const data = { ...availability, income: { total }, availableIncomeAmount: 0, availableAmount: 0 };
    expect(getT0PayoutWithdrawalLimit(data, 2, "income")).toBe(0);
    expect(getT0PayoutWithdrawalLimit(data, 2, "principal")).toBe(700);
  });
  it("收益核算失败为null，本金可继续登记，未知不是0", () => {
    const data = { ...availability, income: null, availableIncomeAmount: null, availableAmount: null };
    expect(getT0PayoutWithdrawalLimit(data, 2, "income")).toBeNull();
    expect(getT0PayoutWithdrawalLimit(data, 2, "principal")).toBe(700);
  });
  it.each([undefined, { ...availability, relatedUserId: 3 }])("未加载/旧成员回包不能允许保存", (data) => {
    expect(getT0PayoutWithdrawalLimit(data, 2, "principal")).toBeNull();
    expect(getT0PayoutWithdrawalLimit(data, 2, "income")).toBeNull();
  });
  it("旧API只支持收益，不能猜出本金额度", () => {
    const data = { relatedUserId: 2, availableAmount: 80 };
    expect(getT0PayoutWithdrawalLimit(data, 2, "income")).toBe(80);
    expect(getT0PayoutWithdrawalLimit(data, 2, "principal")).toBeNull();
  });
  it.each([NaN, Infinity, -1])("异常本金额度%s不可用", (value) => {
    expect(getT0PayoutWithdrawalLimit({ ...availability, availablePrincipalAmount: value }, 2, "principal")).toBeNull();
  });
  it("编辑本笔只加回同成员同来源金额", () => {
    expect(getT0PayoutWithdrawalLimit(availability, 2, "principal", editingPrincipal)).toBe(1000);
    expect(getT0PayoutWithdrawalLimit(availability, 2, "income", editingPrincipal)).toBe(80);
    expect(getT0PayoutWithdrawalLimit(availability, 2, "principal", { ...editingPrincipal, relatedUserId: 3 })).toBe(700);
    expect(getT0PayoutWithdrawalLimit(availability, 2, "principal", { ...editingPrincipal, direction: "deposit" })).toBe(700);
  });
  it("已截0的余额编辑仍按上限减其它提现，不能全额回加", () => {
    const data = { ...availability, depositTotal: 100, principalWithdrawalTotal: 200, availablePrincipalAmount: 0 };
    expect(getT0PayoutWithdrawalLimit(data, 2, "principal", { ...editingPrincipal, amount: 50 })).toBe(0);
    const income = { ...availability, income: { total: 10 }, incomeWithdrawalTotal: 20, availableIncomeAmount: 0 };
    expect(getT0PayoutWithdrawalLimit(income, 2, "income", { ...editingPrincipal, withdrawalSource: "income", amount: 5 })).toBe(0);
  });
  it("历史日志默认收益，明确本金保持本金", () => {
    expect(getT0WithdrawalSource({})).toBe("income");
    expect(getT0WithdrawalSource({ withdrawalSource: "principal" })).toBe("principal");
    expect(getT0WithdrawalLabel("income")).toBe("收益提现");
    expect(getT0WithdrawalLabel("principal")).toBe("本金提现");
  });
});

const jsx = nodes(page, ts.isJsxElement);
function attribute(node: ts.JsxElement, name: string) {
  return node.openingElement.attributes.properties.find((attr): attr is ts.JsxAttribute => ts.isJsxAttribute(attr) && attr.name.getText(page) === name);
}
const sourceButton = required(jsx.find((node) => attribute(node, "data-t0-withdrawal-source")), "source choice button");
const click = required((attribute(sourceButton, "onClick")?.initializer as ts.JsxExpression | undefined)?.expression, "source click");
const disabled = required((attribute(sourceButton, "disabled")?.initializer as ts.JsxExpression | undefined)?.expression, "source disabled");
function form(extra: Record<string, unknown> = {}) {
  const create = vi.fn(), update = vi.fn(), notice = vi.fn();
  const context = {
    isDepositEntry: false, isEthDepositInput: false, payoutAmount: "25", payoutOccurredOn: "2026-11-15",
    payoutEthReferencePrice: "", payoutEthQuantity: "", requiresEthReferencePrice: false,
    payoutFormWithdrawalLimit: 700, payoutWithdrawalSource: "principal", withdrawalLabel: "本金提现",
    payoutTargetRelatedUserId: 2, payoutEntryDirection: "withdrawal", payoutNote: "真实处理器离线测试",
    payoutAvailability: availability, t0PayoutAvailabilityQuery: {}, editingPayoutLog: null,
    createPayoutLogMutation: { mutate: create }, updatePayoutLogMutation: { mutate: update },
    setPayoutSubmitNotice: notice, t0Toast: { error: vi.fn() }, formatPrice: (amount: number) => amount.toFixed(2),
    ...extra,
  };
  return { create, update, notice, submit: isolated(initializer("submitPayoutEntry").getText(page), context) };
}

describe("本金返还真实前端接线", () => {
  it.each(["income", "principal"] as const)("选择%s只切换表单并清除旧金额，不触发资金写入", (source) => {
    const setSource = vi.fn(), setAmount = vi.fn(), setNotice = vi.fn();
    isolated(click.getText(page), { source, setPayoutWithdrawalSource: setSource, setPayoutAmount: setAmount, setPayoutSubmitNotice: setNotice })();
    expect(setSource).toHaveBeenCalledWith(source);
    expect(setAmount).toHaveBeenCalledWith(""); expect(setNotice).toHaveBeenCalledWith(null);
    expect(click.getText(page)).not.toContain("mutate");
  });
  it("编辑或正在保存时不能切换来源", () => {
    for (const saving of [false, true]) for (const editing of [null, editingPrincipal]) {
      expect(isolated(disabled.getText(page), { isPayoutSaving: saving, editingPayoutLog: editing })).toBe(saving || Boolean(editing));
    }
  });
  it.each(["income", "principal"] as const)("保存%s明确传来源，不依赖备注识别", (source) => {
    const env = form({ payoutWithdrawalSource: source, withdrawalLabel: getT0WithdrawalLabel(source) }); env.submit();
    expect(env.create).toHaveBeenCalledTimes(1);
    expect(env.create.mock.calls[0][0]).toMatchObject({ relatedUserId: 2, amount: "25.00", direction: "withdrawal", withdrawalSource: source });
    expect(env.update).not.toHaveBeenCalled();
  });
  it("本金收益失败仍可保存本金，未知和超提不能提交", () => {
    const good = form({ payoutAvailability: { ...availability, incomeUnavailableReason: "暂不可用" } }); good.submit();
    expect(good.create).toHaveBeenCalledTimes(1);
    for (const limit of [null, 0, 24]) {
      const invalid = form({ payoutFormWithdrawalLimit: limit }); invalid.submit();
      expect(invalid.create).not.toHaveBeenCalled(); expect(invalid.notice).toHaveBeenCalled();
    }
  });
  it("编辑本金携带原source和ID，不重新新增", () => {
    const env = form({ editingPayoutLog: { ...editingPrincipal, id: "9" } }); env.submit();
    expect(env.create).not.toHaveBeenCalled();
    expect(env.update.mock.calls[0][0]).toMatchObject({ id: "9", withdrawalSource: "principal" });
  });
  it("存入不传提现来源，ETH和U入口维持原行为", () => {
    const env = form({ isDepositEntry: true, payoutEntryDirection: "deposit", payoutEthReferencePrice: "2000", requiresEthReferencePrice: true }); env.submit();
    expect(env.create.mock.calls[0][0]).toMatchObject({ direction: "deposit", withdrawalSource: undefined, ethReferencePrice: "2000" });
  });
  it("页面和流水使用本金/收益标签，仍只累计一次现金流且保存后刷新全部额度", () => {
    expect(pageText).toContain("当前可提本金（账面）");
    expect(pageText).toContain("当前可提收益");
    expect(pageText).toContain("不自动扣除持仓、挂单占用或亏损");
    expect(initializer("renderPayoutLogRow").getText(page)).toContain("getT0WithdrawalLabel(getT0WithdrawalSource(log))");
    expect(initializer("renderPayoutLogRow").getText(page)).toContain("setPayoutWithdrawalSource(getT0WithdrawalSource(log))");
    expect(initializer("refreshPayoutRelatedCaches").getText(page)).toContain("t0GetPayoutAvailability.invalidate()");
    expect(initializer("payoutXirrSummary").getText(page)).toContain("cumulativeDepositAmount + payoutBookTotalIncome - cumulativePayoutAmount");
  });
  it.each(["t0CreatePayoutLog", "t0UpdatePayoutLog"])("%s只接收来源枚举并维持管理员/只读门禁", (name) => {
    const route = required(nodes(router, ts.isPropertyAssignment).find((node) => node.name.getText(router) === name), name).getText(router);
    expect(route).toContain("z.enum(['income', 'principal']).optional()");
    expect(route).toContain("withdrawalSource: input.withdrawalSource");
    expect(route).toContain("scope.mode !== 'admin'"); expect(route).toContain("PREVIEW_READONLY");
    expect(route).toContain("journalOwnerUserId: scope.journalOwnerUserId");
  });
});
