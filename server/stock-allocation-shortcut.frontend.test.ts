import { readFileSync } from "node:fs";
import React from "react";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Execute the real frontend renderer/handlers with inert tRPC spies; no database or HTTP requests.
const baseSource = readFileSync(new URL("../client/src/pages/LedgerAAInitialBalance.tsx", import.meta.url), "utf8");
const portfolioSource = readFileSync(new URL("../client/src/pages/StockTagPortfolio.tsx", import.meta.url), "utf8");
function expression(source: string, name: string, scope: Record<string, any>) {
  const file = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name && node.initializer) result = node.initializer.getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!result) throw new Error(`Missing actual frontend handler ${name}`);
  const js = ts.transpileModule(`const execute = ${result};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React },
  }).outputText;
  return new Function("React", ...Object.keys(scope), `${js}; return execute;`)(React, ...Object.values(scope));
}
function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree: any): string {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree === null || tree === undefined || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  return text(tree.props?.children);
}
function comparable(tree: any): any {
  if (Array.isArray(tree)) return tree.map(comparable);
  if (!tree || typeof tree !== "object") return tree;
  return { type: typeof tree.type === "string" ? tree.type : "component", props: Object.fromEntries(
    Object.entries(tree.props || {}).filter(([key, value]) => key !== "children" && typeof value !== "function").map(([key, value]) => [key, value]),
  ), children: comparable(tree.props?.children) };
}
const fixtureLot = (id: number, symbol: string) => ({
  id, stockName: `股票${id}`, symbol, status: "active", initialQuantity: 100, currentQuantity: 100,
  unitCost: 10, openingReferencePrice: 10, openedAt: "2026-11-12T02:00:00.000Z", marketPrice: 11,
  participations: [] as any[], observations: [] as any[],
});
function renderer(focusLotId: number | null = 22) {
  const matrix = { canEdit: true, members: [{ userId: 901, name: "成员甲" }, { userId: 902, name: "成员乙" }], lots: [fixtureLot(11, "000001.SZ"), fixtureLot(22, "AAPL")] };
  const scope: Record<string, any> = {
    stockParticipationMatrix: matrix, stockParticipationError: null, stockAllocationFocus: focusLotId === null ? undefined : { categoryId: 222, lotId: focusLotId },
    usdCnyRate: 7, expandedStockLots: new Set([22]), editingStockLots: new Set([22]), savingStockLots: new Set(),
    stockParticipationDrafts: {}, stockObservationDrafts: {}, activeStockParticipationCategoryId: 222,
    categories: [{ id: 222, name: "目标标签", accountingMode: "stock_portfolio" }], editState: {}, getSavedTagVisible: () => true,
    setMutation: { isPending: false }, isLocalHotPreview: false, toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
    refetchStockParticipationMatrix: vi.fn().mockResolvedValue({}), onStockAllocationSaved: vi.fn().mockResolvedValue(undefined),
    setStockParticipationMutation: { mutateAsync: vi.fn().mockResolvedValue({}) }, setStockObservationMutation: { mutateAsync: vi.fn().mockResolvedValue({}) },
    setSavingStockLots: vi.fn(), discardStockLotDrafts: vi.fn(), finishStockLotEditing: vi.fn(), startStockLotEditing: vi.fn(), toggleStockLotExpanded: vi.fn(), saveStockTagVisibility: vi.fn(),
    Fragment: React.Fragment,
  };
  for (const name of ["Switch", "Eye", "EyeOff", "Minus", "Plus", "X", "ChevronDown", "Save"]) scope[name] = () => null;
  scope.setStockParticipationDraft = vi.fn((key, patch, fallback) => { scope.stockParticipationDrafts[key] = { ...(scope.stockParticipationDrafts[key] ?? fallback), ...patch }; });
  scope.setStockObservationDraft = vi.fn((key, patch, fallback) => { scope.stockObservationDrafts[key] = { ...(scope.stockObservationDrafts[key] ?? fallback), ...patch }; });
  const render = () => expression(baseSource, "renderStockParticipationEditor", scope)({ selectedUserId: 0, accentColor: "#2F6F85" });
  const save = async () => {
    const button = nodes(render()).find(node => node.type === "button" && text(node).trim() === "保存");
    if (!button) throw new Error("Missing original save button");
    button.props.onClick();
    await vi.waitFor(() => expect(scope.setSavingStockLots).toHaveBeenCalled());
  };
  return { scope, matrix, render, save };
}

describe("股票维护快捷分配：真实前端复用（离线）", () => {
  it("不新建第二套分配UI，原设置路由仍由无参数默认组件打开", () => {
    expect(baseSource).toContain("export function LedgerAAInitialBalanceContent(");
    expect(baseSource).toMatch(/export default function LedgerAAInitialBalance\(\)\s*\{\s*return <LedgerAAInitialBalanceContent \/>;/);
    expect(portfolioSource).toContain("default: module.LedgerAAInitialBalanceContent");
    expect(portfolioSource).toContain("key={`${ledgerId}:${categoryId}:${stockAllocationTarget.lotId}`}");
    expect(portfolioSource).not.toContain("setStockLotParticipation.useMutation");
  });
  it("点第二笔只显示第二笔，保留全标签原编号、不误定位到第一笔", () => {
    const s = renderer();
    const output = text(s.render());
    expect(output).toContain("股票22");
    expect(output).toContain("持仓编号 02");
    expect(output).not.toContain("股票11");
    expect(output).not.toContain("已卖出（");
  });
  it("快捷卡片与原标签页面同一股票卡的UI属性完全一致", () => {
    const focused = renderer();
    const normal = renderer(null);
    const originalCard = nodes(normal.render()).find(node => node.key === "22");
    expect(originalCard).toBeTruthy();
    expect(comparable(focused.render())).toEqual(comparable(originalCard));
  });
  it("成员、可见性、真实比例、人民币金额与观察开关全部复用", () => {
    const s = renderer();
    const output = s.render();
    expect(text(output)).toContain("成员甲");
    expect(text(output)).toContain("成员乙");
    expect(nodes(output).filter(node => node.props?.["aria-label"] === "分配比例")).toHaveLength(2);
    expect(nodes(output).filter(node => node.props?.["aria-label"] === "分配金额（人民币）")).toHaveLength(2);
    expect(nodes(output).some(node => node.props?.["aria-label"] === "隐藏成员甲的股票标签")).toBe(true);
    expect(nodes(output).some(node => node.props?.["aria-label"] === "成员甲的观察配额")).toBe(true);
    expect(s.scope.setStockParticipationMutation.mutateAsync).not.toHaveBeenCalled();
    expect(s.scope.setStockObservationMutation.mutateAsync).not.toHaveBeenCalled();
  });
  it("眼睛关闭的成员沉底，即使有固定置顶身份或更多已分配股数", () => {
    const s = renderer();
    s.matrix.members = [{ userId: 901, name: "胡大叔" }, { userId: 902, name: "洪院长" }, { userId: 903, name: "蒋利坚" }];
    s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 50 }, { userId: 902, remainingQuantity: 40 }];
    s.scope.editState = { 901: { "目标标签": { visible: false } }, 902: { "目标标签": { visible: false } }, 903: { "目标标签": { visible: true } } };
    const order = nodes(s.render()).filter(node => ["901", "902", "903"].includes(node.key)).map(node => node.key);
    expect(order).toEqual(["903", "901", "902"]);
    expect(s.scope.setStockParticipationMutation.mutateAsync).not.toHaveBeenCalled();
  });
  it("重新打开眼睛会回到可见组，组内保留原有份额排序", () => {
    const s = renderer();
    s.matrix.members = [{ userId: 901, name: "洪院长" }, { userId: 902, name: "蒋利坚" }];
    s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 60 }, { userId: 902, remainingQuantity: 10 }];
    s.scope.editState = { 901: { "目标标签": { visible: false } }, 902: { "目标标签": { visible: true } } };
    const order = () => nodes(s.render()).filter(node => ["901", "902"].includes(node.key)).map(node => node.key);
    expect(order()).toEqual(["902", "901"]);
    s.scope.editState[901]["目标标签"].visible = true;
    expect(order()).toEqual(["901", "902"]);
  });
  it("排序和眼睛显示使用同一保存态回退，不被其他标签的开关影响", () => {
    const s = renderer();
    s.scope.getSavedTagVisible = (userId: number, tagName: string) => !(userId === 901 && tagName === "目标标签");
    s.scope.editState = { 901: { "其他标签": { visible: true } }, 902: { "其他标签": { visible: false } } };
    const output = s.render();
    expect(nodes(output).filter(node => ["901", "902"].includes(node.key)).map(node => node.key)).toEqual(["902", "901"]);
    expect(nodes(output).some(node => node.props?.["aria-label"] === "显示成员甲的股票标签")).toBe(true);
    expect(nodes(output).some(node => node.props?.["aria-label"] === "隐藏成员乙的股票标签")).toBe(true);
  });
  it("分配比例优先于原置顶/置底名字，份额越大越靠前", () => {
    const s = renderer();
    s.matrix.members = [{ userId: 901, name: "胡大叔" }, { userId: 902, name: "andy" }, { userId: 903, name: "普通成员" }];
    s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 1 }, { userId: 902, remainingQuantity: 80 }, { userId: 903, remainingQuantity: 19 }];
    expect(nodes(s.render()).filter(node => ["901", "902", "903"].includes(node.key)).map(node => node.key)).toEqual(["902", "903", "901"]);
  });
  it("修改比例后即时重新排序，取消本批草稿后恢复保存比例顺序", () => {
    const s = renderer();
    s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 10, entryPrice: 10 }, { userId: 902, remainingQuantity: 20, entryPrice: 10 }];
    const order = () => nodes(s.render()).filter(node => ["901", "902"].includes(node.key)).map(node => node.key);
    expect(order()).toEqual(["902", "901"]);
    const memberRow = nodes(s.render()).find(node => node.key === "901");
    const input = nodes(memberRow).find(node => node.props?.["aria-label"] === "分配比例");
    input.props.onChange({ target: { value: "30%" } });
    expect(order()).toEqual(["901", "902"]);
    delete s.scope.stockParticipationDrafts["22:901"];
    expect(order()).toEqual(["902", "901"]);
    expect(s.matrix.lots[1].participations[0].remainingQuantity).toBe(10);
    expect(s.scope.setStockParticipationMutation.mutateAsync).not.toHaveBeenCalled();
  });
  it("同组内按比例降序，隐藏的大比例也不会越过可见的小比例", () => {
    const s = renderer();
    s.matrix.members = [{ userId: 901, name: "成员甲" }, { userId: 902, name: "成员乙" }, { userId: 903, name: "成员丙" }, { userId: 904, name: "成员丁" }];
    s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 5 }, { userId: 902, remainingQuantity: 10 }, { userId: 903, remainingQuantity: 30 }, { userId: 904, remainingQuantity: 50 }];
    s.scope.editState = { 903: { "目标标签": { visible: false } }, 904: { "目标标签": { visible: false } } };
    expect(nodes(s.render()).filter(node => ["901", "902", "903", "904"].includes(node.key)).map(node => node.key)).toEqual(["902", "901", "904", "903"]);
  });
  it("相同比例保持原始顺序，不再被旧名字置顶规则打乱", () => {
    const s = renderer();
    s.matrix.members = [{ userId: 901, name: "andy" }, { userId: 902, name: "胡大叔" }];
    s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 10 }, { userId: 902, remainingQuantity: 10 }];
    expect(nodes(s.render()).filter(node => ["901", "902"].includes(node.key)).map(node => node.key)).toEqual(["901", "902"]);
  });
  it("其他批次草稿和观察比例不影响本批真实份额顺序", () => {
    const s = renderer();
    s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 40 }, { userId: 902, remainingQuantity: 20 }];
    s.scope.stockParticipationDrafts["11:902"] = { percentage: "90" };
    s.scope.stockObservationDrafts["22:901"] = { enabled: true, quantity: "1000", entryPrice: "10", startDate: "2026-11-12", pauseDate: "" };
    expect(nodes(s.render()).filter(node => ["901", "902"].includes(node.key)).map(node => node.key)).toEqual(["902", "901"]);
  });
  it("实际输入只生成该批次草稿，点击原保存才调用原分配接口并刷新维护页", async () => {
    const s = renderer();
    const input = nodes(s.render()).find(node => node.props?.["aria-label"] === "分配比例");
    input.props.onChange({ target: { value: "25%" } });
    expect(s.scope.setStockParticipationDraft).toHaveBeenCalledWith("22:901", expect.objectContaining({ percentage: "25" }), expect.anything());
    expect(s.scope.setStockParticipationMutation.mutateAsync).not.toHaveBeenCalled();
    await s.save();
    expect(s.scope.setStockParticipationMutation.mutateAsync).toHaveBeenCalledOnce();
    expect(s.scope.setStockParticipationMutation.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ ledgerId: 37, categoryId: 222, lotId: 22, targetUserId: 901, quantity: 25, entryPrice: 10, startDate: "2026-11-12" }));
    expect(s.scope.refetchStockParticipationMatrix).toHaveBeenCalledOnce();
    expect(s.scope.onStockAllocationSaved).toHaveBeenCalledOnce();
  });
  it("合计超额仍由原保存器拦截，不发出任何写请求", async () => {
    const s = renderer();
    Object.assign(s.scope.stockParticipationDrafts, {
      "22:901": { percentage: "60", entryPrice: "10", startDate: "2026-11-12", pauseDate: "" },
      "22:902": { percentage: "50", entryPrice: "10", startDate: "2026-11-12", pauseDate: "" },
    });
    const saveButton = nodes(s.render()).find(node => node.type === "button" && text(node).trim() === "保存");
    saveButton.props.onClick();
    expect(s.scope.toast.error).toHaveBeenCalledWith(expect.stringContaining("不能超过当前余量"));
    expect(s.scope.setStockParticipationMutation.mutateAsync).not.toHaveBeenCalled();
  });
  it.each(["closed", "partially_sold", "readonly"])("已结束、已结算与非管理员沿用原只读保护：%s", mode => {
    const s = renderer();
    if (mode === "closed") s.matrix.lots[1].status = "closed";
    if (mode === "partially_sold") s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 20, closedQuantity: 5, entryPrice: 10 }];
    if (mode === "readonly") s.matrix.canEdit = false;
    const input = nodes(s.render()).find(node => node.props?.["aria-label"] === "分配比例");
    expect(input.props.disabled).toBe(true);
    if (mode === "closed" || mode === "readonly") expect(nodes(s.render()).some(node => node.type === "button" && text(node).trim() === "保存")).toBe(false);
  });
  it("缺失或跨标签批次不退回第一笔，显示明确空状态", () => {
    const s = renderer(999);
    expect(text(s.render())).toContain("已不存在或不属于当前标签");
    expect(text(s.render())).not.toContain("股票11");
    expect(s.scope.setStockParticipationMutation.mutateAsync).not.toHaveBeenCalled();
  });
  it("载入失败保留原重试，不出现伪空白分配表", () => {
    const s = renderer();
    s.scope.stockParticipationError = { message: "读取失败" };
    expect(text(s.render())).toContain("股票批次分配载入失败");
    nodes(s.render()).find(node => node.type === "button").props.onClick();
    expect(s.scope.refetchStockParticipationMatrix).toHaveBeenCalledOnce();
  });
  it.each([{ canEdit: false }, { participantView: true }, { ledgerId: 52 }])("普通成员、用户视角、其他账本不能打开快捷管理：%j", overrides => {
    const scope = { canEdit: true, participantView: false, ledgerId: 37, categoryId: 222, setStockAllocationTarget: vi.fn(), ...overrides };
    expression(portfolioSource, "openStockAllocation", scope)(22);
    expect(scope.setStockAllocationTarget).not.toHaveBeenCalled();
  });
  it("管理员打开时明确携带账本、标签与批次，非法批次被拦截", () => {
    const scope = { canEdit: true, participantView: false, ledgerId: 37, categoryId: 222, setStockAllocationTarget: vi.fn() };
    const open = expression(portfolioSource, "openStockAllocation", scope);
    for (const id of [0, -1, 2.5, NaN]) open(id);
    expect(scope.setStockAllocationTarget).not.toHaveBeenCalled();
    open(22);
    expect(scope.setStockAllocationTarget).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 222, lotId: 22 });
  });
  it("保存后四个维护/成员查询只刷新当前标签，不混入其他账本", async () => {
    const queryNames = ["getStockTagPortfolio", "getStockLotParticipationMatrix", "getMyStockTagParticipantPortfolio", "getStockTagPublicPortfolio"];
    const ledger = Object.fromEntries(queryNames.map(name => [name, { invalidate: vi.fn().mockResolvedValue(undefined) }]));
    await expression(portfolioSource, "refreshStockAllocation", { ledgerId: 37, categoryId: 222, utils: { ledger } })();
    for (const query of Object.values(ledger)) expect(query.invalidate).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 222 });
  });
  it("未保存时返回需确认，取消保留编辑；保存中和隐藏确认中不能关闭", () => {
    const scope = { savingStockLots: new Set<number>(), visibilitySavingScopes: new Set<string>(), savingUsers: new Set<number>(), hideConfirmation: null as any, stockParticipationDrafts: {}, stockObservationDrafts: {}, window: { confirm: vi.fn().mockReturnValue(false) }, toast: { info: vi.fn() }, onCloseStockAllocation: vi.fn() };
    const close = () => expression(baseSource, "closeStockAllocation", scope)();
    scope.stockParticipationDrafts = { "22:901": {} };
    close();
    expect(scope.onCloseStockAllocation).not.toHaveBeenCalled();
    scope.window.confirm.mockReturnValue(true);
    close();
    expect(scope.onCloseStockAllocation).toHaveBeenCalledOnce();
    scope.onCloseStockAllocation.mockClear();
    scope.savingStockLots.add(22);
    close();
    expect(scope.onCloseStockAllocation).not.toHaveBeenCalled();
    scope.savingStockLots.clear();
    scope.hideConfirmation = {};
    close();
    expect(scope.onCloseStockAllocation).not.toHaveBeenCalled();
  });
});
