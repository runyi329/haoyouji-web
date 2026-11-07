import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// 合成流水仅存在于本隔离测试：不用于 UI、不保存、不 runtime import 任何业务模块。
// 只读生产源码，通过 AST 抽取实际声明/回调，require 被封锁；不连接 DB、不启动浏览器或真实 timer。
function source(path: string, kind = ts.ScriptKind.TS) {
  return ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest, true, kind);
}
const page = source("../client/src/pages/T0Journal.tsx", ts.ScriptKind.TSX);
const journal = source("./ledger52-t0-journal.ts");
const app = source("../client/src/App.tsx", ts.ScriptKind.TSX);
function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing real production node: ${label}`);
  return value;
}
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}
function declaration(tree: ts.SourceFile, name: string) {
  return required(tree.statements.find((node) =>
    (ts.isFunctionDeclaration(node) && node.name?.text === name)
    || (ts.isVariableStatement(node) && node.declarationList.declarations.some((item) =>
      ts.isIdentifier(item.name) && item.name.text === name))), `${tree.fileName}:${name}`);
}
function initializer(tree: ts.SourceFile, name: string) {
  const matches = nodes(tree, ts.isVariableDeclaration).filter((node) =>
    ts.isIdentifier(node.name) && node.name.text === name);
  if (matches.length !== 1) throw new Error(`Expected one real production variable ${name}, got ${matches.length}`);
  return required(matches[0].initializer, `${name} initializer`);
}
// 自动纳入提取函数引用的顶层生产声明，允许父修复使用纯排序/retry helper；不重写任何业务算法。
function declarations(tree: ts.SourceFile, roots: ts.Node[]) {
  const named = new Map<string, ts.Statement>();
  for (const node of tree.statements) {
    if (ts.isFunctionDeclaration(node) && node.name) named.set(node.name.text, node);
    if (ts.isVariableStatement(node)) {
      for (const item of node.declarationList.declarations) {
        if (ts.isIdentifier(item.name)) named.set(item.name.text, node);
      }
    }
  }
  const selected = new Set<ts.Statement>();
  const visit = (root: ts.Node) => {
    for (const identifier of nodes(root, ts.isIdentifier)) {
      const dependency = named.get(identifier.text);
      if (!dependency || selected.has(dependency)) continue;
      selected.add(dependency);
      visit(dependency);
    }
  };
  for (const root of roots) visit(root);
  return [...selected].map((node) => node.getText(tree)).join("\n");
}
function isolated<T = any>(text: string, dependencies: Record<string, unknown>, result: string): T {
  const output = ts.transpileModule(`${text.replace(/^export /gm, "")}\nconst __result = (${result});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return new vm.Script(`${output}\n;__result;`).runInContext(vm.createContext({
    ...dependencies, exports: {}, require: (name: string) => { throw new Error(`Forbidden runtime import: ${name}`); },
  }), { timeout: 2000 });
}
function extract(tree: ts.SourceFile, names: string[]) {
  return isolated(declarations(tree, names.map((name) => declaration(tree, name))), {}, `({${names.join(",")}})`);
}
const client = extract(page, ["previewTradeFromEntry", "buildPositionBuckets", "buildOpeningClosingAllocations",
  "projectAdminCounterpartyTrades", "getStoredEntryId", "compareT0PositionRecordedOrder"]);
const server = extract(journal, ["mapEntry", "buildProfitShareOpeningMatches"]);

type Trade = Record<string, any> & { id: string; quantity: number; createdAt: string };
const RECORDED_OPEN = "2026-11-06T04:00:00.000Z";
function trade(id: string, extra: Record<string, unknown> = {}): Trade {
  return { id, accountId: "1", relatedUserId: "2", relatedFundId: "3", symbol: "ETH",
    action: "openShort", instrumentType: "contract", price: 2530, quantity: 50, fee: 0,
    createdAt: RECORDED_OPEN, recordedAt: RECORDED_OPEN, ...extra };
}
function closing(id: string, extra: Record<string, unknown> = {}): Trade {
  return trade(id, { action: "closeShort", price: 2500, quantity: 10, targetPrice: 2530,
    createdAt: "2026-11-05T21:00:00.000Z", recordedAt: "2026-11-06T05:00:00.000Z", ...extra });
}
function rawRows(trades: Trade[]) {
  return trades.map((item) => ({ id: Number(client.getStoredEntryId(item)), account_id: Number(item.accountId),
    related_user_id: Number(item.relatedUserId), related_fund_id: Number(item.relatedFundId), symbol: item.symbol,
    action: item.action, instrument_type: item.instrumentType, execution_status: "filled", is_counterparty: item.isCounterparty ? 1 : 0,
    price: String(item.price), quantity: String(item.quantity), fee_usdt: String(item.fee),
    target_price: item.targetPrice === undefined ? null : String(item.targetPrice),
    target_opening_entry_id: Number(item.targetOpeningEntryId) || null,
    trade_time: item.createdAt, created_at: item.recordedAt || item.createdAt }));
}
function mapped(trades: Trade[]): Trade[] {
  return rawRows(trades).map((row) => client.previewTradeFromEntry(server.mapEntry(row)));
}
function historical50(explicitSource = false, side = "short"): Trade[] {
  const action = side === "short" ? "closeShort" : "closeLong";
  return [trade("172", { action: side === "short" ? "openShort" : "openLong" }),
    ...["179", "180", "181", "183"].map((id, index) => closing(id, { action,
      createdAt: `2026-11-05T21:${String(index).padStart(2, "0")}:00.000Z`,
      recordedAt: `2026-11-06T05:${String(index).padStart(2, "0")}:00.000Z`,
      ...(explicitSource ? { targetOpeningEntryId: "172" } : {}),
    }))];
}
function allocations(trades: Trade[], id: string): Array<{ trade: Trade; quantity: number }> {
  return client.buildOpeningClosingAllocations(trades).get(id) ?? [];
}
function allocated(trades: Trade[], id: string): number {
  return allocations(trades, id).reduce((total, row) => total + row.quantity, 0);
}
function bucket(trades: Trade[], side = "short") {
  return required(client.buildPositionBuckets(trades).find((item: any) => item.side === side && item.price === 2530), `${side}2530 bucket`);
}

describe("T0 账本录入时间排序：真实生产映射、仓位桶与逐源分配", () => {
  it.each([[false, "short"], [true, "short"], [false, "long"], [true, "long"]])(
    "50 开仓 + 四次 10 平仓（具名来源=%s，方向=%s），旧显示时间早八小时仍真实剩 10",
    (explicit, side) => {
      // Fixture 本身按真实 created_at ASC, id ASC；服务端 helper 接受 SQL 排好序的 rows。
      const fixture = historical50(explicit, side);
      const rows = rawRows(fixture);
      const trades = mapped(fixture).reverse(); // 客户端接口顺序不能决定 FIFO。
      const before = JSON.stringify(trades);
      const source = required(trades.find((item) => item.id === "172"), "source 172");
      for (const close of trades.filter((item) => item.id !== "172")) {
        expect(close.createdAt < source.createdAt).toBe(true);
        expect(close.recordedAt > source.recordedAt).toBe(true);
        expect(Date.parse(close.recordedAt) - Date.parse(close.createdAt)).toBe(8 * 60 * 60 * 1000);
      }
      expect(bucket(trades, side)).toMatchObject({ originalQuantity: 50, closedQuantity: 40, remainingQuantity: 10,
        openedAt: source.createdAt });
      expect(allocations(trades, "172").map((item) => [item.trade.id, item.quantity]))
        .toEqual([["179", 10], ["180", 10], ["181", 10], ["183", 10]]);
      expect(source.quantity - allocated(trades, "172")).toBe(10);
      expect(bucket(trades, side).remainingQuantity).toBeLessThan(20);
      expect(server.buildProfitShareOpeningMatches(rows, side === "short" ? "closeShort" : "closeLong",
        "2530", 2, 3, 2000, 172)).toEqual([{ openingEntryId: 172, matchedQuantityCents: 1000, remainingBeforeCents: 1000 }]);
      expect(JSON.stringify(trades)).toBe(before); // 排序不得改变输入，也不改历史交易时间展示。
    });

  it("较早 25 开仓/25 平仓已结清，不因后 source172 的回填展示时间而偷扣其余量", () => {
    const fixture = [trade("169", { quantity: 25, createdAt: "2026-11-06T02:00:00.000Z", recordedAt: "2026-11-06T02:00:00.000Z" }),
      closing("170", { quantity: 25, createdAt: "2026-11-06T03:00:00.000Z", recordedAt: "2026-11-06T03:00:00.000Z" }),
      ...historical50().map((item) => item.id === "172" ? { ...item, createdAt: "2026-11-06T01:00:00.000Z",
        filledAt: "2026-11-05T18:00:00.000Z" } : item)];
    const trades = [...fixture].reverse();
    expect(allocations(trades, "169").map((item) => [item.trade.id, item.quantity])).toEqual([["170", 25]]);
    expect(allocated(trades, "172")).toBe(40);
    expect(bucket(trades)).toMatchObject({ originalQuantity: 75, closedQuantity: 65, remainingQuantity: 10 });
    expect(server.buildProfitShareOpeningMatches(rawRows(fixture), "closeShort", "2530", 2, 3, 2000, 172))
      .toEqual([{ openingEntryId: 172, matchedQuantityCents: 1000, remainingBeforeCents: 1000 }]);
  });

  it.each(["2", "999"])("明确来源 %s 不足或不存在，不能穿透借同档其他开仓", (targetOpeningEntryId) => {
    const fixture = [trade("2", { quantity: 5 }), trade("11", { quantity: 100 }),
      closing("179", { quantity: 10, targetOpeningEntryId })];
    const result = client.buildOpeningClosingAllocations([...fixture].reverse());
    expect((result.get("2") ?? []).reduce((sum: number, row: any) => sum + row.quantity, 0))
      .toBe(targetOpeningEntryId === "2" ? 5 : 0);
    expect(result.get("11") ?? []).toEqual([]);
    expect(server.buildProfitShareOpeningMatches(rawRows(fixture), "closeShort", "2530", 2, 3, 2000, Number(targetOpeningEntryId))).toEqual([]);
  });

  it.each(["accountId", "relatedUserId", "relatedFundId", "action", "symbol"])(
    "具名 source 的 %s 不符不能借其他账户/用户/项目/方向/币种的开仓", (field) => {
      const mismatch = field === "action" ? "openLong" : field === "symbol" ? "BTC" : "99";
      const fixture = [trade("172", { [field]: mismatch }), trade("175", { quantity: 100 }),
        closing("179", { targetOpeningEntryId: "172" })];
      expect(allocations(fixture, "172")).toEqual([]);
      expect(allocations(fixture, "175")).toEqual([]);
    });

  it("自动止盈不可变外键优先且不重复 FIFO，即使落库也早于 source 或平仓写有另一来源", () => {
    const fixture = [trade("169", { quantity: 25, recordedAt: "2026-11-06T02:00:00.000Z" }),
      closing("179", { targetOpeningEntryId: "169", recordedAt: "2026-11-06T03:00:00.000Z" }),
      trade("172", { takeProfitPlans: [
        { id: "tp1", status: "triggered", closingEntryId: "179", triggeredQuantity: 10, quantity: 10 },
        { id: "duplicate", status: "triggered", closingEntryId: "179", triggeredQuantity: 10, quantity: 10 },
      ] }), closing("180", { targetOpeningEntryId: "172" })];
    expect(allocations([...fixture].reverse(), "169")).toEqual([]);
    expect(allocations([...fixture].reverse(), "172").map((item) => [item.trade.id, item.quantity]))
      .toEqual([["179", 10], ["180", 10]]);
    expect(allocated(fixture, "172")).toBe(20);
  });

  it("同一录入时间按数字 ID 2 < 10 < 11，不按字符串顺序或接口数组顺序", () => {
    const fixture = [trade("2", { quantity: 3 }), closing("10", { quantity: 3, createdAt: RECORDED_OPEN, recordedAt: RECORDED_OPEN }),
      trade("11", { quantity: 5 })];
    for (const input of [fixture, [...fixture].reverse(), [fixture[1], fixture[2], fixture[0]]]) {
      expect(bucket(input)).toMatchObject({ remainingQuantity: 5, closedQuantity: 3 });
      expect(allocations(input, "2").map((item) => [item.trade.id, item.quantity])).toEqual([["10", 3]]);
      expect(allocations(input, "11")).toEqual([]);
    }
  });

  it("同时间镜像片段按存储数字 ID 排序，片段原 ID 仅作为最后稳定 tie-break", () => {
    const fixture = [trade("z-opening", { sourceEntryId: "2", quantity: 3 }),
      closing("a-closing", { sourceEntryId: "10", targetOpeningEntryId: "2", quantity: 3,
        createdAt: RECORDED_OPEN, recordedAt: RECORDED_OPEN }),
      trade("b-neighbor", { sourceEntryId: "11", quantity: 5 })];
    expect(bucket([...fixture].reverse())).toMatchObject({ remainingQuantity: 5, closedQuantity: 3 });
    expect(allocated([...fixture].reverse(), "z-opening")).toBe(3);
    expect(allocated([...fixture].reverse(), "b-neighbor")).toBe(0);
    const first = trade("fragment-a", { sourceEntryId: "2" });
    const last = trade("fragment-z", { sourceEntryId: "2" });
    expect(client.compareT0PositionRecordedOrder(first, last)).toBeLessThan(0);
    expect(client.compareT0PositionRecordedOrder(last, first)).toBeGreaterThan(0);
  });

  it.each([undefined, null, ""])("无 recordedAt（%s）回退 createdAt，兼容旧客户端流水", (recordedAt) => {
    const fixture = [trade("2", { quantity: 10, recordedAt }), closing("10", { quantity: 3, recordedAt,
      createdAt: "2026-11-06T05:00:00.000Z" })];
    expect(bucket([...fixture].reverse())).toMatchObject({ remainingQuantity: 7, closedQuantity: 3 });
    expect(allocated([...fixture].reverse(), "2")).toBe(3);
  });

  it("混合旧/新流水逐条回退，仍不采用更早 filledAt 或交易展示时间", () => {
    const fixture = [trade("172", { recordedAt: undefined }), closing("179", { targetOpeningEntryId: "172",
      filledAt: "2026-11-05T18:00:00.000Z" })];
    expect(bucket([...fixture].reverse()).remainingQuantity).toBe(40);
    expect(allocated([...fixture].reverse(), "172")).toBe(10);
  });

  it.each(["short", "long"])("管理员镜像 %s 只反转显示，不让真实相反方向源仓吞掉四次历史平仓", (side) => {
    const opposite = side === "short" ? "long" : "short";
    const fixture = [...historical50(true, side).map((item) => item.id === "172" ? { ...item, isCounterparty: true } : item),
      trade("190", { action: opposite === "short" ? "openShort" : "openLong", quantity: 7,
        recordedAt: "2026-11-06T04:30:00.000Z" }),
      closing("191", { action: opposite === "short" ? "closeShort" : "closeLong", quantity: 7,
        targetOpeningEntryId: "190", recordedAt: "2026-11-06T05:40:00.000Z" })];
    const before = JSON.stringify(fixture);
    expect(bucket(fixture, side).remainingQuantity).toBe(10);
    expect(bucket(fixture, opposite).remainingQuantity).toBe(0);
    const projected = client.projectAdminCounterpartyTrades([...fixture].reverse());
    expect(projected.find((item: Trade) => item.id === "172")).toMatchObject({
      action: opposite === "short" ? "openShort" : "openLong", sourceAction: side === "short" ? "openShort" : "openLong",
      recordedAt: RECORDED_OPEN, createdAt: RECORDED_OPEN,
    });
    expect(allocated(fixture, "172")).toBe(40);
    expect(allocated(projected, "172")).toBe(40);
    expect(allocated(projected, "190")).toBe(7);
    expect(bucket(projected, opposite).remainingQuantity).toBe(10);
    for (const close of projected.filter((item: Trade) => ["179", "180", "181", "183"].includes(item.id))) {
      expect(close.action).toBe(opposite === "short" ? "closeShort" : "closeLong");
      expect(close.targetOpeningEntryId).toBe("172");
    }
    expect(JSON.stringify(fixture)).toBe(before);
  });

  it("服务端仍锁读 ledger/user/account/symbol 范围并按 created_at ASC,id ASC，不能改为 trade_time", () => {
    const save = declaration(journal, "saveLedger52T0JournalEntry");
    const lockedSelects = nodes(save, ts.isNoSubstitutionTemplateLiteral).map((node) => node.text)
      .filter((text) => text.includes("ledger52_t0_journal_entries") && text.includes("FOR UPDATE")
        && text.includes("account_id = ?") && text.includes("symbol = ?"));
    expect(lockedSelects.length).toBeGreaterThan(0);
    for (const sql of lockedSelects) {
      expect(sql).toMatch(/WHERE ledger_id = \? AND user_id = \? AND account_id = \? AND symbol = \?/);
      expect(sql).toMatch(/ORDER BY created_at ASC, id ASC FOR UPDATE/);
      expect(sql).not.toMatch(/ORDER BY\s+trade_time/);
    }
  });
});

const queryCall = initializer(page, "t0SharedIncomeServerPlanQuery");
if (!ts.isCallExpression(queryCall)) throw new Error("Missing real plan query call");
const queryOptions = required(queryCall.arguments[1], "actual plan query options");
function planOptions(active = true) {
  return isolated(declarations(page, [queryOptions]), {
    sharedIncomeServerPlanActive: active,
    sharedIncomeServerPlanInput: { price: "2500", quantity: "10", targetPrice: "2530" },
  }, queryOptions.getText(page));
}
function retry(failureCount: number, error: unknown) {
  const callback = planOptions().retry;
  expect(callback).toBeTypeOf("function");
  return callback(failureCount, error);
}

describe("T0 正式 plan 查询只对瞬时错误有限重试", () => {
  it.each(["CONFLICT", "BAD_REQUEST", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"])(
    "%s 是确定性业务/权限错误，不进行 retry", (code) => {
      for (const failureCount of [0, 1, 2, 10]) {
        expect(retry(failureCount, Object.assign(new Error("正式计划拒绝"), { data: { code } }))).toBe(false);
      }
    });
  it.each([
    Object.assign(new Error("暂时服务失败"), { data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } }),
    new TypeError("Failed to fetch"),
  ])("瞬时错误可首次重试，但不会无限自动重复请求：%s", (error) => {
    expect(retry(0, error)).toBe(true);
    for (const failureCount of [1, 2, 3, 10]) expect(retry(failureCount, error)).toBe(false);
  });
  it("保持正式查询的输入、45秒签名续期、focus refresh 与启用范围", () => {
    expect(queryCall.expression.getText(page)).toBe("trpc.ledger.t0PreviewSharedIncomeAllocation.useQuery");
    expect(queryCall.arguments[0].getText(page)).toBe("sharedIncomeServerPlanInput");
    expect(planOptions()).toMatchObject({ enabled: true, staleTime: 20_000, refetchInterval: 45_000, refetchOnWindowFocus: true });
    expect(planOptions(false)).toMatchObject({ enabled: false, refetchInterval: false });
  });
});

function pollingHarness(location = "/ledger/52/t0") {
  const listeners = new Map<string, () => void>();
  const document = { visibilityState: "visible", addEventListener: vi.fn((name: string, callback: () => void) => listeners.set(name, callback)),
    removeEventListener: vi.fn((name: string) => listeners.delete(name)) };
  let tick: (() => void) | undefined;
  let cleanup: (() => void) | undefined;
  const invalidate = vi.fn(async (_input?: unknown, _filters?: { predicate: (query: { queryKey: unknown[] }) => boolean }) => undefined);
  const window = { setInterval: vi.fn((callback: () => void, _interval: number) => { tick = callback; return 71; }), clearInterval: vi.fn() };
  const poll = declaration(app, "ActiveLedgerPagePolling");
  isolated(declarations(app, [poll]), { document, window, useLocation: () => [location],
    trpc: { useUtils: () => ({ ledger: { invalidate } }) },
    useEffect: (effect: () => (() => void) | undefined) => { cleanup = effect(); },
  }, "ActiveLedgerPagePolling()");
  return { invalidate, window, document, listeners, tick: () => required(tick, "real polling tick")(),
    cleanup: () => required(cleanup, "real polling cleanup")() };
}
describe("原两秒轮询只排除可执行 plan 查询，其他同步与前台守卫保留", () => {
  it.each(["/ledger/52/t0", "/ledger/37/orders?tab=active"])("%s 仍两秒轮询，精确排除 plan 而非其他 ledger 查询", (location) => {
    const h = pollingHarness(location);
    expect(h.invalidate).toHaveBeenCalledOnce();
    expect(h.window.setInterval).toHaveBeenCalledWith(expect.any(Function), 2_000);
    const [input, filters] = h.invalidate.mock.calls[0];
    expect(input).toBeUndefined();
    const predicate = required(filters, "production invalidate filter").predicate;
    expect(predicate({ queryKey: [["ledger", "t0PreviewSharedIncomeAllocation"], { type: "query" }] })).toBe(false);
    for (const path of [["ledger", "t0GetJournal"], ["ledger", "t0GetTeamOverview"], ["ledger", "t0GetPayoutLogs"],
      ["ledger", "t0GetMarketContributionFacts"], ["ledger", "t0PreviewSharedIncomeAllocationExtra"],
      ["ledger", "t0PreviewSharedIncomeAllocation", "nested"], ["other", "t0PreviewSharedIncomeAllocation"], ["getT0EthPerpetualMark"]]) {
      expect(predicate({ queryKey: [path] })).toBe(true);
    }
    expect(predicate({ queryKey: ["legacy-key"] })).toBe(true);
    h.tick();
    expect(h.invalidate).toHaveBeenCalledTimes(2);
  });
  it("后台不轮询，回前台立即同步，卸载清理仍完整", () => {
    const h = pollingHarness();
    h.invalidate.mockClear();
    h.document.visibilityState = "hidden";
    h.tick();
    required(h.listeners.get("visibilitychange"), "real visibility callback")();
    expect(h.invalidate).not.toHaveBeenCalled();
    h.document.visibilityState = "visible";
    required(h.listeners.get("visibilitychange"), "real visibility callback")();
    expect(h.invalidate).toHaveBeenCalledOnce();
    h.cleanup();
    expect(h.window.clearInterval).toHaveBeenCalledWith(71);
    expect(h.document.removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(h.listeners.size).toBe(0);
  });
});
