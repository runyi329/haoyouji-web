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
function runInitialStockLotEditOrderEffect(scope: Record<string, any>) {
  const file = ts.createSourceFile("page.tsx", baseSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const callbacks: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === "useEffect" && node.arguments[0]?.getText(file).includes("captureStockLotEditOrder")) {
      callbacks.push(node.arguments[0].getText(file));
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  expect(callbacks).toHaveLength(1);
  expression(`const actualInitialEditOrderEffect = ${callbacks[0]};`, "actualInitialEditOrderEffect", scope)();
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
    stockLotMemberEditOrders: {}, getStockLotSavedMemberOrder: expression(baseSource, "getStockLotSavedMemberOrder", {}),
    categories: [{ id: 222, name: "目标标签", accountingMode: "stock_portfolio" }], editState: {}, getSavedTagVisible: () => true,
    setMutation: { isPending: false }, isLocalHotPreview: false, toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
    refetchStockParticipationMatrix: vi.fn().mockResolvedValue({}), onStockAllocationSaved: vi.fn().mockResolvedValue(undefined),
    setStockParticipationMutation: { mutateAsync: vi.fn().mockResolvedValue({}) }, setStockObservationMutation: { mutateAsync: vi.fn().mockResolvedValue({}) },
    setSavingStockLots: vi.fn(), discardStockLotDrafts: vi.fn(), finishStockLotEditing: vi.fn(), startStockLotEditing: vi.fn(), toggleStockLotExpanded: vi.fn(), saveStockTagVisibility: vi.fn(),
    Fragment: React.Fragment,
    renderLedger37AiBadge: () => null, // 原股票回归场景全局AI关闭；开启图标由独立真实渲染回归覆盖。
    useCallback: (fn: any) => fn,
  };
  for (const name of ["Switch", "Eye", "EyeOff", "Minus", "Plus", "X", "ChevronDown", "Save"]) scope[name] = () => null;
  scope.setStockParticipationDraft = vi.fn((key, patch, fallback) => { scope.stockParticipationDrafts[key] = { ...(scope.stockParticipationDrafts[key] ?? fallback), ...patch }; });
  scope.setStockObservationDraft = vi.fn((key, patch, fallback) => { scope.stockObservationDrafts[key] = { ...(scope.stockObservationDrafts[key] ?? fallback), ...patch }; });
  for (const state of ["StockLotMemberEditOrders", "ExpandedStockLots", "EditingStockLots", "SavingStockLots", "StockParticipationDrafts", "StockObservationDrafts"]) {
    const key = state[0].toLowerCase() + state.slice(1);
    scope[`set${state}`] = vi.fn(updater => { scope[key] = typeof updater === "function" ? updater(scope[key]) : updater; });
  }
  for (const name of ["captureStockLotEditOrder", "startStockLotEditing", "finishStockLotEditing", "discardStockLotDrafts"]) {
    scope[name] = vi.fn((...args) => expression(baseSource, name, scope)(...args));
  }
  scope.saveStockTagVisibility = vi.fn((userId, tagName, visible) => {
    scope.editState = { ...scope.editState, [userId]: { ...scope.editState[userId], [tagName]: { ...scope.editState[userId]?.[tagName], visible } } };
  });
  scope.window = { confirm: vi.fn().mockReturnValue(true) };
  const render = () => expression(baseSource, "renderStockParticipationEditor", scope)({ selectedUserId: 0, accentColor: "#2F6F85" });
  const lotCard = (lotId = focusLotId ?? 22) => nodes(render()).find(node => node.key === String(lotId));
  const memberRow = (userId = 901, lotId = focusLotId ?? 22) => nodes(lotCard(lotId)).find(node => node.key === String(userId));
  const memberOrder = (lotId = focusLotId ?? 22) => nodes(lotCard(lotId)).filter(node => node.type === "div" && node.props?.className === "rounded-md px-2 py-2").map(node => Number(node.key));
  const field = (label: string, userId = 901, lotId = focusLotId ?? 22) => nodes(memberRow(userId, lotId)).find(node => node.props?.["aria-label"] === label);
  const click = (label: string, lotId = focusLotId ?? 22) => {
    const button = nodes(lotCard(lotId)).find(node => node.type === "button" && text(node).trim() === label);
    if (!button) throw new Error(`Missing original ${label} button`);
    button.props.onClick();
  };
  const save = async (lotId = focusLotId ?? 22) => {
    const button = nodes(lotCard(lotId)).find(node => node.type === "button" && text(node).trim() === "保存");
    if (!button) throw new Error("Missing original save button");
    const previousCalls = scope.setSavingStockLots.mock.calls.length;
    button.props.onClick();
    await vi.waitFor(() => {
      expect(scope.setSavingStockLots.mock.calls.length).toBeGreaterThanOrEqual(previousCalls + 2);
      expect(scope.savingStockLots.has(lotId)).toBe(false);
    });
  };
  return { scope, matrix, render, save, lotCard, memberRow, memberOrder, field, click, runInitialEditOrderEffect: () => runInitialStockLotEditOrderEffect(scope) };
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
  it("修改比例编辑中不跳位，取消不跳位；保存态更新且退出编辑后大比例靠前", async () => {
    const s = renderer();
    s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 10, entryPrice: 10 }, { userId: 902, remainingQuantity: 20, entryPrice: 10 }];
    const order = () => nodes(s.render()).filter(node => ["901", "902"].includes(node.key)).map(node => node.key);
    expect(order()).toEqual(["902", "901"]);
    s.runInitialEditOrderEffect();
    const memberRow = nodes(s.render()).find(node => node.key === "901");
    const input = nodes(memberRow).find(node => node.props?.["aria-label"] === "分配比例");
    input.props.onChange({ target: { value: "30%" } });
    expect(order()).toEqual(["902", "901"]);
    s.click("取消");
    expect(order()).toEqual(["902", "901"]);
    expect(s.scope.stockParticipationDrafts).toEqual({});
    expect(s.scope.stockLotMemberEditOrders).toEqual({});
    expect(s.matrix.lots[1].participations[0].remainingQuantity).toBe(10);
    expect(s.scope.setStockParticipationMutation.mutateAsync).not.toHaveBeenCalled();
    s.click("编辑");
    s.field("分配比例").props.onChange({ target: { value: "30%" } });
    s.scope.refetchStockParticipationMatrix.mockImplementation(async () => {
      s.matrix.lots[1].participations[0].remainingQuantity = 30;
      return { data: s.matrix };
    });
    await s.save();
    expect(s.scope.editingStockLots.has(22)).toBe(false);
    expect(s.scope.stockLotMemberEditOrders).toEqual({});
    expect(order()).toEqual(["901", "902"]);
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
    expect(nodes(s.render()).filter(node => ["901", "902"].includes(node.key)).map(node => node.key)).toEqual(["901", "902"]);
  });
  describe("编辑期间按批次冻结成员顺序，原保存成功后释放", () => {
    const savedOrder = (members: any[], lot: any, visible: (id: number) => boolean = () => true) => expression(baseSource, "getStockLotSavedMemberOrder", {})(members, lot, visible);
    it("真实helper先可见再保存remainingQuantity，同份额稳定且不修改原数组", () => {
      const members = [{ userId: 901 }, { userId: 902 }, { userId: 903 }, { userId: 904 }, { userId: 905 }];
      const lot = { ...fixtureLot(22, "AAPL"), participations: [
        { userId: "901", remainingQuantity: "10", initialQuantity: 1000, quantity: 1000 },
        { userId: 902, remainingQuantity: 20 }, { userId: 903, remainingQuantity: 20 }, { userId: 904, remainingQuantity: 90 },
      ] };
      const before = structuredClone({ members, lot });
      expect(savedOrder(members, lot, id => id !== 904).map((member: any) => member.userId)).toEqual([902, 903, 901, 905, 904]);
      expect({ members, lot }).toEqual(before);
    });
    it.each([true, 1])("已保存enabled观察即使残留真实股数也按0排序，不用观察quantity：enabled=%s", enabled => {
      const lot = { ...fixtureLot(22, "AAPL"), participations: [{ userId: 901, remainingQuantity: 80 }, { userId: 902, remainingQuantity: 1 }], observations: [{ userId: "901", enabled, quantity: 1000 }] };
      const members = [{ userId: 901 }, { userId: 902 }, { userId: 903 }];
      expect(savedOrder(members, lot).map((member: any) => member.userId)).toEqual([902, 901, 903]);
      lot.observations[0].enabled = false as any;
      expect(savedOrder(members, lot).map((member: any) => member.userId)).toEqual([901, 902, 903]);
    });
    it("缺省快照为空时按保存态排序，真实capture updater只首次捕获不覆盖", () => {
      const s = renderer();
      expect(s.scope.stockLotMemberEditOrders).toEqual({});
      s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 10 }, { userId: 902, remainingQuantity: 20 }];
      expect(s.memberOrder()).toEqual([902, 901]);
      s.scope.captureStockLotEditOrder(22);
      const snapshot = s.scope.stockLotMemberEditOrders[22];
      expect(snapshot).toEqual([902, 901]);
      expect(s.scope.setStockLotMemberEditOrders).toHaveBeenCalledWith(expect.any(Function));
      s.matrix.lots[1].participations[0].remainingQuantity = 50;
      s.scope.editState = { 902: { "目标标签": { visible: false } } };
      s.scope.captureStockLotEditOrder(22);
      expect(s.scope.stockLotMemberEditOrders[22]).toBe(snapshot);
      expect(s.memberOrder()).toEqual([902, 901]);
    });
    it("初始focus编辑的真实useEffect从保存排序捕获，草稿/其他标签不污染初始顺序", () => {
      const s = renderer();
      s.matrix.members.push({ userId: 903, name: "成员丙" });
      s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 10 }, { userId: 902, remainingQuantity: 20 }, { userId: 903, remainingQuantity: 90 }];
      s.scope.getSavedTagVisible = (userId: number, tag: string) => !(userId === 903 && tag === "目标标签");
      s.scope.editState = { 901: { "其他标签": { visible: false } } };
      s.scope.stockParticipationDrafts["22:901"] = { percentage: "99" };
      s.scope.stockObservationDrafts["22:902"] = { enabled: true, quantity: "1000", entryPrice: "10", startDate: "2026-11-12", pauseDate: "" };
      expect(s.scope.editingStockLots.has(22)).toBe(true);
      s.runInitialEditOrderEffect();
      expect(s.scope.captureStockLotEditOrder).toHaveBeenCalledWith(22);
      expect(s.scope.stockLotMemberEditOrders[22]).toEqual([902, 901, 903]);
      expect(s.memberOrder()).toEqual([902, 901, 903]);
    });
    it("初始matrix未到不会存空快照，refetch到达后真实effect再捕获且后续不覆盖", () => {
      const s = renderer();
      s.scope.stockParticipationMatrix = undefined;
      s.runInitialEditOrderEffect();
      expect(s.scope.stockLotMemberEditOrders).toEqual({});
      s.scope.stockParticipationMatrix = s.matrix;
      s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 10 }, { userId: 902, remainingQuantity: 20 }];
      s.runInitialEditOrderEffect();
      expect(s.scope.stockLotMemberEditOrders[22]).toEqual([902, 901]);
      s.matrix.lots[1].participations[0].remainingQuantity = 50;
      s.runInitialEditOrderEffect();
      expect(s.scope.stockLotMemberEditOrders[22]).toEqual([902, 901]);
    });
    it("真实start在进入编辑时捕获保存顺序并展开，不增加任何确认按钮", () => {
      const s = renderer(null);
      s.scope.editingStockLots = new Set();
      s.scope.expandedStockLots = new Set();
      s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 10 }, { userId: 902, remainingQuantity: 20 }];
      s.click("编辑", 22);
      expect(s.scope.captureStockLotEditOrder).toHaveBeenCalledWith(22);
      expect(s.scope.stockLotMemberEditOrders[22]).toEqual([902, 901]);
      expect(s.scope.editingStockLots.has(22)).toBe(true);
      expect(s.scope.expandedStockLots.has(22)).toBe(true);
      expect(s.memberOrder(22)).toEqual([902, 901]);
      const labels = nodes(s.lotCard(22)).filter(node => node.type === "button").map(node => text(node).trim());
      expect(labels.filter(label => ["保存", "取消", "确认", "应用", "确认排序"].includes(label))).toEqual(["取消", "保存", "取消", "保存"]);
      expect(s.scope.window.confirm).not.toHaveBeenCalled();
    });
    it("连续输入比例和人民币金额仅更新数值与统计，跨过另一成员份额也不跳位", () => {
      const s = renderer();
      s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 10, entryPrice: 10 }, { userId: 902, remainingQuantity: 20, entryPrice: 10 }];
      s.runInitialEditOrderEffect();
      const snapshot = s.scope.stockLotMemberEditOrders[22];
      for (const [percentage, amount, quantity] of [["3", "210", "3"], ["30", "2100", "30"], ["", "", "0"], ["40%", "2800", "40"]]) {
        s.field("分配比例").props.onChange({ target: { value: percentage } });
        expect(s.field("分配比例").props.value).toBe(percentage.replace("%", ""));
        expect(s.field("分配金额（人民币）").props.value).toBe(amount);
        expect(nodes(s.memberRow()).some(node => node.type === "div" && text(node) === `${quantity} 股`)).toBe(true);
        expect(s.memberOrder()).toEqual([902, 901]);
      }
      for (const [amount, percentage] of [["700", "10"], ["3500", "50"], ["", ""], ["2100", "30"]]) {
        s.field("分配金额（人民币）").props.onChange({ target: { value: amount } });
        expect(s.field("分配金额（人民币）").props.value).toBe(amount);
        expect(s.field("分配比例").props.value).toBe(percentage);
        expect(s.memberOrder()).toEqual([902, 901]);
      }
      expect(s.scope.stockLotMemberEditOrders[22]).toBe(snapshot);
      expect(s.matrix.lots[1].participations[0].remainingQuantity).toBe(10);
      expect(s.scope.setStockParticipationMutation.mutateAsync).not.toHaveBeenCalled();
      expect(s.scope.refetchStockParticipationMatrix).not.toHaveBeenCalled();
    });
    it("加减和观察开关/输入实时联动显示与真实统计，不调整冻结位置", () => {
      const s = renderer();
      s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 30, entryPrice: 10 }, { userId: 902, remainingQuantity: 20, entryPrice: 10 }];
      s.runInitialEditOrderEffect();
      const summary = () => text(nodes(s.lotCard()).find(node => node.type === "div" && node.props.className?.includes("whitespace-nowrap") && text(node).startsWith("已分配")));
      expect(summary()).toBe("已分配 50 股 50%");
      for (const [button, percentage] of [["增加比例", "31"], ["减少比例", "30"]]) {
        s.field(button).props.onClick();
        expect(s.field("分配比例").props.value).toBe(percentage);
        expect(s.memberOrder()).toEqual([901, 902]);
      }
      s.field("成员甲的观察配额").props.onCheckedChange(true);
      expect(s.field("成员甲的观察配额").props.checked).toBe(true);
      expect(s.field("成员甲的独立观察股数").props.value).toBe("30");
      expect(summary()).toBe("已分配 20 股 20%");
      expect(s.memberOrder()).toEqual([901, 902]);
      s.field("成员甲的观察比例（股数参考）").props.onChange({ target: { value: "12.25" } });
      s.field("增加比例").props.onClick();
      expect(s.field("成员甲的观察比例（股数参考）").props.value).toBe("13.25");
      s.field("减少比例").props.onClick();
      expect(s.field("成员甲的观察比例（股数参考）").props.value).toBe("12.25");
      expect(s.memberOrder()).toEqual([901, 902]);
      expect(summary()).toBe("已分配 20 股 20%");
      s.field("成员甲的观察配额").props.onCheckedChange(false);
      expect(s.field("分配比例").props.value).toBe("30");
      expect(summary()).toBe("已分配 50 股 50%");
      expect(s.memberOrder()).toEqual([901, 902]);
      expect(s.scope.setStockParticipationMutation.mutateAsync).not.toHaveBeenCalled();
      expect(s.scope.setStockObservationMutation.mutateAsync).not.toHaveBeenCalled();
    });
    it("重渲染/refetch改变股数、matrix顺序与成员可见性仍保持快照，眼睛显示实时更新", () => {
      const s = renderer();
      s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 10 }, { userId: 902, remainingQuantity: 20 }];
      s.runInitialEditOrderEffect();
      const snapshot = s.scope.stockLotMemberEditOrders[22];
      const nextMatrix = structuredClone(s.matrix);
      nextMatrix.members.reverse();
      nextMatrix.lots[1].currentQuantity = 200;
      nextMatrix.lots[1].participations[0].remainingQuantity = 80;
      s.scope.stockParticipationMatrix = nextMatrix;
      s.field("隐藏成员乙的股票标签", 902).props.onClick();
      expect(s.field("显示成员乙的股票标签", 902)).toBeTruthy();
      expect(s.memberRow(902).props.style.opacity).toBe(0.7);
      expect(s.field("分配比例").props.value).toBe("40");
      s.runInitialEditOrderEffect();
      expect(s.memberOrder()).toEqual([902, 901]);
      expect(s.scope.stockLotMemberEditOrders[22]).toBe(snapshot);
      s.field("显示成员乙的股票标签", 902).props.onClick();
      expect(s.field("隐藏成员乙的股票标签", 902)).toBeTruthy();
      expect(s.memberOrder()).toEqual([902, 901]);
    });
    it("新成员即使份额更大也追加末尾，成员消失不改原剩余IDs的rank", () => {
      const s = renderer();
      s.matrix.members.push({ userId: 903, name: "成员丙" });
      s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 10 }, { userId: 902, remainingQuantity: 20 }, { userId: 903, remainingQuantity: 5 }];
      s.runInitialEditOrderEffect();
      const snapshot = s.scope.stockLotMemberEditOrders[22];
      s.matrix.members.unshift({ userId: 904, name: "新成员" });
      s.matrix.lots[1].participations.push({ userId: 904, remainingQuantity: 60 });
      s.runInitialEditOrderEffect();
      expect(s.memberOrder()).toEqual([902, 901, 903, 904]);
      s.matrix.members = s.matrix.members.filter(member => member.userId !== 901).reverse();
      s.runInitialEditOrderEffect();
      expect(s.memberOrder()).toEqual([902, 903, 904]);
      expect(s.scope.stockLotMemberEditOrders[22]).toBe(snapshot);
      expect(snapshot).toEqual([902, 901, 903]);
    });
    it("两批次独立捕获并维持各自顺序，取消只清本批快照和真实/观察草稿", () => {
      const s = renderer(null);
      s.scope.editingStockLots = new Set();
      s.matrix.lots[0].participations = [{ userId: 901, remainingQuantity: 30 }, { userId: 902, remainingQuantity: 10 }];
      s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 10 }, { userId: 902, remainingQuantity: 20 }];
      s.click("编辑", 11);
      s.click("编辑", 22);
      expect(s.scope.stockLotMemberEditOrders).toEqual({ 11: [901, 902], 22: [902, 901] });
      s.field("分配比例", 902, 11).props.onChange({ target: { value: "40" } });
      s.field("分配比例", 901, 22).props.onChange({ target: { value: "50" } });
      s.field("成员甲的观察配额", 901, 11).props.onCheckedChange(true);
      s.field("成员乙的观察配额", 902, 22).props.onCheckedChange(true);
      expect(s.memberOrder(11)).toEqual([901, 902]);
      expect(s.memberOrder(22)).toEqual([902, 901]);
      const otherSnapshot = s.scope.stockLotMemberEditOrders[11];
      const otherRealDraft = s.scope.stockParticipationDrafts["11:902"];
      const otherObservationDraft = s.scope.stockObservationDrafts["11:901"];
      s.click("取消", 22);
      expect(s.scope.finishStockLotEditing).toHaveBeenLastCalledWith(22, true);
      expect(s.scope.stockLotMemberEditOrders).toEqual({ 11: [901, 902] });
      expect(s.scope.stockLotMemberEditOrders[11]).toBe(otherSnapshot);
      expect(s.scope.editingStockLots).toEqual(new Set([11]));
      expect(s.scope.stockParticipationDrafts).toEqual({ "11:902": otherRealDraft });
      expect(s.scope.stockObservationDrafts).toEqual({ "11:901": otherObservationDraft });
      expect(s.memberOrder(22)).toEqual([902, 901]);
      s.scope.finishStockLotEditing(11);
      expect(s.scope.stockLotMemberEditOrders).toEqual({});
      expect(s.scope.stockParticipationDrafts["11:902"]).toBe(otherRealDraft);
      expect(s.scope.stockObservationDrafts["11:901"]).toBe(otherObservationDraft);
    });
    it.each(["失败", "部分成功"])("%s仍保留editing、草稿和快照，真正成功后才按新保存量重排", async mode => {
      const s = renderer();
      s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 10, entryPrice: 10 }, { userId: 902, remainingQuantity: 20, entryPrice: 10 }];
      s.runInitialEditOrderEffect();
      s.field("分配比例", 901).props.onChange({ target: { value: "40" } });
      s.field("分配比例", 902).props.onChange({ target: { value: "5" } });
      const snapshot = s.scope.stockLotMemberEditOrders[22];
      const drafts = structuredClone(s.scope.stockParticipationDrafts);
      const persist = async (row: any) => {
        s.matrix.lots[1].participations.find(item => item.userId === row.targetUserId)!.remainingQuantity = row.quantity;
        return {};
      };
      if (mode === "部分成功") s.scope.setStockParticipationMutation.mutateAsync.mockImplementationOnce(persist);
      s.scope.setStockParticipationMutation.mutateAsync.mockRejectedValueOnce(new Error("离线模拟保存失败"));
      await s.save();
      expect(s.scope.setStockParticipationMutation.mutateAsync).toHaveBeenCalledTimes(mode === "部分成功" ? 2 : 1);
      expect(s.scope.editingStockLots.has(22)).toBe(true);
      expect(s.scope.stockLotMemberEditOrders[22]).toBe(snapshot);
      expect(s.scope.stockParticipationDrafts).toEqual(drafts);
      expect(s.memberOrder()).toEqual([902, 901]);
      expect(s.scope.finishStockLotEditing).not.toHaveBeenCalled();
      expect(s.scope.discardStockLotDrafts).not.toHaveBeenCalled();
      expect(s.scope.toast.success).not.toHaveBeenCalled();
      expect(s.scope.refetchStockParticipationMatrix).not.toHaveBeenCalled();
      expect(s.scope.onStockAllocationSaved).not.toHaveBeenCalled();
      s.runInitialEditOrderEffect();
      expect(s.scope.stockLotMemberEditOrders[22]).toBe(snapshot);
      s.scope.setStockParticipationMutation.mutateAsync.mockImplementation(persist);
      s.scope.refetchStockParticipationMatrix.mockImplementation(async () => ({ data: s.matrix }));
      await s.save();
      expect(s.scope.finishStockLotEditing).toHaveBeenCalledOnce();
      expect(s.scope.finishStockLotEditing).toHaveBeenCalledWith(22);
      expect(s.scope.editingStockLots.has(22)).toBe(false);
      expect(s.scope.stockLotMemberEditOrders).toEqual({});
      expect(s.scope.stockParticipationDrafts).toEqual({});
      expect(s.memberOrder()).toEqual([901, 902]);
      expect(s.matrix.lots[1].participations.map(item => item.remainingQuantity)).toEqual([40, 5]);
      expect(s.scope.refetchStockParticipationMatrix).toHaveBeenCalledOnce();
      expect(s.scope.onStockAllocationSaved).toHaveBeenCalledOnce();
    });
  });
  describe("比例输入的不可编辑百分号后缀", () => {
    const row = (s: ReturnType<typeof renderer>, userId = 901) => nodes(s.render()).find(node => node.key === String(userId));
    const field = (s: ReturnType<typeof renderer>, label: string, userId = 901) => nodes(row(s, userId)).find(node => node.type === "input" && node.props["aria-label"] === label);
    const expectNoWrites = (s: ReturnType<typeof renderer>) => {
      expect(s.scope.setStockParticipationMutation.mutateAsync).not.toHaveBeenCalled();
      expect(s.scope.setStockObservationMutation.mutateAsync).not.toHaveBeenCalled();
      expect(s.scope.refetchStockParticipationMatrix).not.toHaveBeenCalled();
    };
    it.each([false, true])("真实/观察比例的value与placeholder不含%，后缀穿透且不可选中：观察=%s", observation => {
      const s = renderer();
      s.matrix.lots[1].currentQuantity = 200;
      s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 50, entryPrice: 10 }];
      if (observation) nodes(row(s)).find(node => node.props?.["aria-label"] === "成员甲的观察配额").props.onCheckedChange(true);
      const output = row(s);
      const input = nodes(output).find(node => node.type === "input" && node.props["aria-label"] === (observation ? "成员甲的观察比例（股数参考）" : "分配比例"));
      const wrapper = nodes(output).find(node => node.type === "label" && nodes(node).includes(input));
      expect(input.props.value).toBe("25");
      expect(input.props.placeholder).toBe("0");
      expect(input.props.value).not.toContain("%");
      expect(input.props.placeholder).not.toContain("%");
      expect(input.props.inputMode).toBe(observation ? "decimal" : "numeric");
      expect(input.props.disabled).toBe(false);
      expect(input.props.className.split(" ")).toEqual(expect.arrayContaining(["w-full", "pr-2.5", "text-right"]));
      expect(wrapper).toBeTruthy();
      expect(wrapper.props.className.split(" ")).toContain("relative");
      expect(wrapper.props.contentEditable).not.toBe(true);
      const suffixes = nodes(wrapper).filter(node => node.type === "span" && text(node) === "%");
      expect(suffixes).toHaveLength(1);
      const suffix = suffixes[0];
      expect(Array.isArray(wrapper.props.children) ? wrapper.props.children : [wrapper.props.children]).toContain(suffix);
      expect(suffix.props["aria-hidden"]).toBe("true");
      expect(suffix.props.className.split(" ")).toEqual(expect.arrayContaining(["pointer-events-none", "select-none", "absolute", "right-0.5", "text-gray-400"]));
      expect(suffix.props.contentEditable).not.toBe(true);
      expect(suffix.props.onChange).toBeUndefined();
      expect(suffix.props.onClick).toBeUndefined();
      expect(suffix.props.tabIndex).toBeUndefined();
      expectNoWrites(s);
    });
    it("真实25逐次退格为2、空白，再输入30；每次重渲染仅数字且金额和股数同步", () => {
      const s = renderer();
      s.matrix.lots[1].currentQuantity = 200;
      s.matrix.lots[1].participations = [{ userId: 901, remainingQuantity: 50, entryPrice: 10 }];
      const assertRendered = (percentage: string, amount: string, quantity: number) => {
        const input = field(s, "分配比例");
        expect(input.props.value).toBe(percentage);
        expect(input.props.value).not.toContain("%");
        expect(input.props.placeholder).toBe("0");
        expect(field(s, "分配金额（人民币）").props.value).toBe(amount);
        expect(nodes(row(s)).some(node => node.type === "div" && text(node) === `${quantity} 股`)).toBe(true);
        expectNoWrites(s);
      };
      assertRendered("25", "3500", 50);
      for (const [percentage, amount, quantity] of [["2", "280", 4], ["", "", 0]] as const) {
        const input = field(s, "分配比例");
        expect(input.props.value.slice(0, -1)).toBe(percentage);
        input.props.onChange({ target: { value: input.props.value.slice(0, -1) } });
        expect(s.scope.stockParticipationDrafts["22:901"]).toMatchObject({ percentage, amount, entryPrice: "10" });
        assertRendered(percentage, amount, quantity);
      }
      expect(field(s, "分配比例").props.value).not.toBe("0");
      expect(field(s, "分配比例").props.value).not.toBe("0%");
      field(s, "分配比例").props.onChange({ target: { value: "30" } });
      expect(s.scope.stockParticipationDrafts["22:901"]).toMatchObject({ percentage: "30", amount: "4200" });
      assertRendered("30", "4200", 60);
      expect(s.matrix.lots[1].participations[0].remainingQuantity).toBe(50);
      expect(s.scope.stockObservationDrafts).toEqual({});
    });
    it("粘贴25%仍接受，但重渲染与草稿只保留25且不立即保存", () => {
      const s = renderer();
      s.matrix.lots[1].currentQuantity = 200;
      field(s, "分配比例").props.onChange({ target: { value: "25%" } });
      expect(field(s, "分配比例").props.value).toBe("25");
      expect(field(s, "分配金额（人民币）").props.value).toBe("3500");
      expect(s.scope.stockParticipationDrafts["22:901"]).toMatchObject({ percentage: "25", amount: "3500" });
      expect(s.scope.stockObservationDrafts).toEqual({});
      expectNoWrites(s);
    });
    it("真实分配继续拒绝小数、限制100%，金额反推仍联动纯数字比例", () => {
      const s = renderer();
      s.matrix.lots[1].currentQuantity = 200;
      field(s, "分配比例").props.onChange({ target: { value: "1.5" } });
      expect(s.scope.setStockParticipationDraft).not.toHaveBeenCalled();
      expect(field(s, "分配比例").props.value).toBe("");
      field(s, "分配比例").props.onChange({ target: { value: "101" } });
      expect(field(s, "分配比例").props.value).toBe("100");
      expect(field(s, "分配金额（人民币）").props.value).toBe("14000");
      expect(nodes(row(s)).find(node => node.props?.["aria-label"] === "增加比例").props.disabled).toBe(true);
      field(s, "分配金额（人民币）").props.onChange({ target: { value: "3500" } });
      expect(field(s, "分配比例").props.value).toBe("25");
      expect(s.scope.stockParticipationDrafts["22:901"]).toMatchObject({ percentage: "25", amount: "3500" });
      expect(s.scope.stockObservationDrafts).toEqual({});
      expectNoWrites(s);
    });
    it("观察1.5与12.25小数按持仓基数生成独立quantity，清空及股数反推不改真实草稿", () => {
      const s = renderer();
      s.matrix.lots[1].currentQuantity = 200;
      s.scope.stockParticipationDrafts["22:902"] = { percentage: "30", amount: "4200", entryPrice: "10", startDate: "2026-11-12", pauseDate: "" };
      const realDrafts = structuredClone(s.scope.stockParticipationDrafts);
      nodes(row(s)).find(node => node.props?.["aria-label"] === "成员甲的观察配额").props.onCheckedChange(true);
      const allocationSummary = () => nodes(s.render()).find(node => node.type === "div" && node.props.className?.includes("whitespace-nowrap") && text(node).startsWith("已分配"));
      const initialSummary = comparable(allocationSummary());
      for (const [percentage, quantity, amount] of [["1.5", "3", "210"], ["12.25", "24.5", "1715"], ["", "", ""]]) {
        field(s, "成员甲的观察比例（股数参考）").props.onChange({ target: { value: percentage } });
        expect(s.scope.stockObservationDrafts["22:901"]).toMatchObject({ enabled: true, percentage, quantity, amount: undefined });
        expect(field(s, "成员甲的观察比例（股数参考）").props.value).toBe(percentage);
        expect(field(s, "成员甲的独立观察股数").props.value).toBe(quantity);
        expect(field(s, "成员甲的观察金额（人民币）").props.value).toBe(amount);
        expect(s.scope.stockParticipationDrafts).toEqual(realDrafts);
        expect(comparable(allocationSummary())).toEqual(initialSummary);
        expectNoWrites(s);
      }
      expect(field(s, "成员甲的观察比例（股数参考）").props.placeholder).toBe("0");
      field(s, "成员甲的独立观察股数").props.onChange({ target: { value: "3" } });
      expect(s.scope.stockObservationDrafts["22:901"]).toMatchObject({ quantity: "3", percentage: undefined, amount: undefined });
      expect(field(s, "成员甲的观察比例（股数参考）").props.value).toBe("1.5");
      expect(field(s, "成员甲的观察金额（人民币）").props.value).toBe("210");
      expect(s.scope.stockParticipationDrafts).toEqual(realDrafts);
      expect(s.scope.setStockParticipationDraft).not.toHaveBeenCalled();
      expectNoWrites(s);
    });
    it.each([
      { observation: false, initial: "30", increased: "31", initialQuantity: "60", increasedQuantity: "62", initialAmount: "4200", increasedAmount: "4340" },
      { observation: true, initial: "12.25", increased: "13.25", initialQuantity: "24.5", increasedQuantity: "26.5", initialAmount: "1715", increasedAmount: "1855" },
    ])("真实/观察加减按钮后重渲染value仍为纯数字：观察=$observation", mode => {
      const s = renderer();
      s.matrix.lots[1].currentQuantity = 200;
      if (mode.observation) nodes(row(s)).find(node => node.props?.["aria-label"] === "成员甲的观察配额").props.onCheckedChange(true);
      const percentageLabel = mode.observation ? "成员甲的观察比例（股数参考）" : "分配比例";
      const amountLabel = mode.observation ? "成员甲的观察金额（人民币）" : "分配金额（人民币）";
      field(s, percentageLabel).props.onChange({ target: { value: mode.initial } });
      for (const [buttonLabel, percentage, quantity, amount] of [
        ["增加比例", mode.increased, mode.increasedQuantity, mode.increasedAmount],
        ["减少比例", mode.initial, mode.initialQuantity, mode.initialAmount],
      ]) {
        const button = nodes(row(s)).find(node => node.type === "button" && node.props["aria-label"] === buttonLabel);
        expect(button.props.disabled).toBe(false);
        button.props.onClick();
        expect(field(s, percentageLabel).props.value).toBe(percentage);
        expect(field(s, percentageLabel).props.value).toMatch(/^\d+(?:\.\d+)?$/);
        expect(field(s, amountLabel).props.value).toBe(amount);
        if (mode.observation) {
          expect(field(s, "成员甲的独立观察股数").props.value).toBe(quantity);
          expect(s.scope.stockObservationDrafts["22:901"]).toMatchObject({ quantity, percentage: undefined, amount: undefined });
          expect(s.scope.stockParticipationDrafts).toEqual({});
        } else {
          expect(nodes(row(s)).some(node => node.type === "div" && text(node) === `${quantity} 股`)).toBe(true);
          expect(s.scope.stockParticipationDrafts["22:901"]).toMatchObject({ percentage, amount });
          expect(s.scope.stockObservationDrafts).toEqual({});
        }
        expectNoWrites(s);
      }
    });
    it("只读观察输入与加减仍禁用，后缀不新增可编辑入口", () => {
      const s = renderer();
      s.matrix.canEdit = false;
      s.scope.stockObservationDrafts["22:901"] = { enabled: true, quantity: "1.5", percentage: "1.5", entryPrice: "10", startDate: "2026-11-12", pauseDate: "" };
      expect(field(s, "成员甲的观察比例（股数参考）").props.value).toBe("1.5");
      for (const label of ["成员甲的观察比例（股数参考）", "成员甲的独立观察股数", "成员甲的观察金额（人民币）", "减少比例", "增加比例"]) {
        expect(nodes(row(s)).find(node => node.props?.["aria-label"] === label).props.disabled).toBe(true);
      }
      const suffix = nodes(row(s)).find(node => node.type === "span" && text(node) === "%");
      expect(suffix.props.className.split(" ")).toContain("pointer-events-none");
      expect(suffix.props.contentEditable).not.toBe(true);
      expect(nodes(s.render()).some(node => node.type === "button" && text(node).trim() === "保存")).toBe(false);
      expectNoWrites(s);
    });
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
