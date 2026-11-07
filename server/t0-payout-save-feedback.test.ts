import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// 只读取生产 TypeScript：不导入 React、router、tRPC、数据库或任何应用运行时。
// VM 执行真实 toast、reset、submit、三个 mutation 的 success/error 及通知 JSX；
// 桩仅模拟状态 setter、查询缓存和可控只读请求，绝不复制生产回调实现。
const source = readFileSync(new URL("../client/src/pages/T0Journal.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("T0Journal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const matches: T[] = [];
  const visit = (node: ts.Node) => {
    if (predicate(node)) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return matches;
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Missing production AST node: ${label}`);
  return value;
}

function variable(name: string) {
  return required(nodes(ast, ts.isVariableDeclaration).find((node) =>
    ts.isIdentifier(node.name) && node.name.text === name,
  ), name);
}

function initializer(name: string) {
  return required(variable(name).initializer, `${name} initializer`);
}

const mutations = [
  { kind: "create", name: "createPayoutLogMutation", endpoint: "t0CreatePayoutLog", success: "已保存成功，请勿重复登记。", fallback: "资金流水保存失败" },
  { kind: "update", name: "updatePayoutLogMutation", endpoint: "t0UpdatePayoutLog", success: "已更新成功，无需再次提交。", fallback: "资金流水更新失败" },
  { kind: "delete", name: "deletePayoutLogMutation", endpoint: "t0DeletePayoutLog", success: "已删除成功，无需再次操作。", fallback: "资金流水删除失败" },
] as const;
type Kind = typeof mutations[number]["kind"];

function mutationCallback(name: string, callbackName: "onSuccess" | "onError") {
  const call = initializer(name);
  if (!ts.isCallExpression(call)) throw new Error(`Expected production mutation call: ${name}`);
  const options = required(call.arguments[0], `${name} options`);
  if (!ts.isObjectLiteralExpression(options)) throw new Error(`Expected production mutation options: ${name}`);
  return required(options.properties.find((node): node is ts.PropertyAssignment =>
    ts.isPropertyAssignment(node) && node.name.getText(ast) === callbackName,
  ), `${name}.${callbackName}`).initializer;
}

const noticeElement = required(nodes(ast, ts.isJsxElement).find((node) =>
  node.openingElement.tagName.getText(ast) === "div"
  && node.openingElement.attributes.properties.some((attribute) =>
    ts.isJsxAttribute(attribute) && attribute.name.getText(ast) === "role"
    && attribute.initializer?.getText(ast) === '"status"',
  )
  && node.getText(ast).includes("payoutSubmitNotice.message"),
), "payout submit notice status element");
const noticeExpression = required(noticeElement.parent, "notice JSX parent");
if (!ts.isBinaryExpression(noticeExpression)) throw new Error("Expected production notice && expression");
const dateFunction = required(nodes(ast, ts.isFunctionDeclaration).find((node) =>
  node.name?.text === "getBeijingDateInputValue",
), "Beijing date helper");
const isolatedSource = [
  `const t0Toast = (${initializer("t0Toast").getText(ast)});`,
  dateFunction.getText(ast),
  `const resetPayoutLogForm = (${initializer("resetPayoutLogForm").getText(ast)});`,
  `const submitPayoutEntry = (${initializer("submitPayoutEntry").getText(ast)});`,
  `({ t0Toast, resetPayoutLogForm, submitPayoutEntry, renderNotice: () => (${noticeExpression.getText(ast)}), callbacks: {`,
  ...mutations.map(({ kind, name }) => `${kind}: {
    onSuccess: (${mutationCallback(name, "onSuccess").getText(ast)}),
    onError: (${mutationCallback(name, "onError").getText(ast)}),
  },`),
  `} });`,
].join("\n");
const compiled = ts.transpileModule(isolatedSource, {
  fileName: "t0-payout-save-feedback-isolated.tsx",
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.None,
    jsx: ts.JsxEmit.React,
    jsxFactory: "testElement",
    alwaysStrict: true,
  },
}).outputText;
const script = new Script(compiled, { filename: "production-payout-callbacks.vm.js" });

type Log = {
  id: string; relatedUserId: number; relatedUserName: string;
  occurredOn: string; direction: "deposit" | "withdrawal"; amount: number;
  ethReferencePrice?: string; ethQuantity?: string; depositInputMode?: "u" | "eth";
  note?: string; createdAt: string;
};
type Notice = { tone: "pending" | "success" | "error"; message: string } | null;
type Element = { type: string; props: Record<string, unknown> | null; children: unknown[] };
type Production = {
  t0Toast: Record<"success" | "error" | "message", (...args: unknown[]) => undefined>;
  resetPayoutLogForm: () => void;
  submitPayoutEntry: () => void;
  renderNotice: () => Element | null;
  callbacks: Record<Kind, {
    onSuccess: (log: Readonly<Log>) => Promise<void>;
    onError: (error: { message?: string }) => void;
  }>;
};

// 截图中的 270676.00 U / 2248.5 / 120.380698 仅为冻结的服务端响应 fixture，
// 不接触真实账本，不猜测另一个金额，不在成功回调中重新折算本金。
const savedLog: Readonly<Log> = Object.freeze({
  id: "payout-server-confirmed", relatedUserId: 28, relatedUserName: "测试用户",
  occurredOn: "2026-11-02", direction: "deposit", amount: 270676.00,
  ethReferencePrice: "2248.5", ethQuantity: "120.380698", depositInputMode: "u",
  note: "仅测试的服务端完整记录", createdAt: "2026-11-02T08:00:00.000Z",
});
const oldLog = Object.freeze({ ...savedLog, amount: 1, ethQuantity: "0.000445", note: "更新前测试记录" });
const otherLog = Object.freeze({ ...savedLog, id: "another-log", amount: 42.25, note: "应保留的既有记录" });
const otherUserLog = Object.freeze({ ...savedLog, id: "another-user", relatedUserId: 29, note: "全局缓存不混入当前用户" });

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function text(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "object") return (node as Element).children.map(text).join("");
  return String(node);
}

function harness(kind: Kind, options: { cache?: unknown; editing?: Readonly<Log> | null; previewUserId?: number | null } = {}) {
  const previewUserId = options.previewUserId ?? null;
  const scopedInput = { ledgerId: 52, relatedUserId: 28, previewUserId: previewUserId || undefined };
  const key = (input: unknown) => JSON.stringify(input);
  const initial = Object.prototype.hasOwnProperty.call(options, "cache")
    ? options.cache : Object.freeze([oldLog, otherLog, oldLog]);
  const globalCache = Object.freeze([oldLog, otherLog, otherUserLog]);
  const cache = new Map<string, unknown>([
    [key(scopedInput), initial], [key({ ledgerId: 52, allUsers: true }), globalCache],
  ]);
  const events: string[] = [];
  const reads = Array.from({ length: 3 }, deferred);
  let readIndex = 0;
  const state: Record<string, unknown> = {
    editingPayoutLog: options.editing === undefined ? (kind === "create" ? null : oldLog) : options.editing,
    payoutAmount: "270676.00", payoutDepositInputMode: "u", payoutEthQuantity: "120.380698",
    payoutEthReferencePrice: "2248.5", payoutEthReferencePriceIsManual: true,
    payoutNote: savedLog.note, payoutOccurredOn: savedLog.occurredOn,
    payoutSubmitNotice: { tone: "pending", message: "正在提交，请勿重复点击。" },
    deletePayoutLogId: kind === "delete" ? savedLog.id : null,
  };
  const setters: Record<string, ReturnType<typeof vi.fn>> = {};
  const globals: Record<string, unknown> = {
    ...state, payoutTargetRelatedUserId: 28, previewUserId,
    isEthDepositInput: false, isDepositEntry: true, requiresEthReferencePrice: true,
    payoutEntryDirection: "deposit", payoutFormWithdrawalLimit: null,
    formatPrice: (amount: number) => amount.toFixed(2),
    testElement: (type: string, props: Element["props"], ...children: unknown[]): Element => ({ type, props, children }),
  };
  for (const field of Object.keys(state)) {
    const name = `set${field[0].toUpperCase()}${field.slice(1)}`;
    setters[name] = vi.fn((value: unknown) => {
      events.push(field === "payoutSubmitNotice" ? `notice:${(value as Notice)?.tone ?? "null"}` : `set:${field}`);
      state[field] = value;
      globals[field] = value;
    });
    globals[name] = setters[name];
  }
  const forbiddenRequire = vi.fn(() => { throw new Error("require is forbidden in the production callback VM"); });
  globals.require = forbiddenRequire;
  const writes = Object.fromEntries(mutations.map(({ kind: action, name }) => {
    const mutate = vi.fn();
    globals[name] = { mutate, mutateAsync: vi.fn(() => { throw new Error("Unexpected duplicate write"); }) };
    return [action, mutate];
  })) as Record<Kind, ReturnType<typeof vi.fn>>;
  const refresh = (label: string) => vi.fn((input: unknown) => {
    events.push(`read:${label}`);
    return required(reads[readIndex++], "expected read refresh").promise;
  });
  const logInvalidate = refresh("logs");
  const availabilityInvalidate = refresh("availability");
  const setData = vi.fn((input: unknown, update: (current: unknown) => unknown) => {
    events.push("cache:write");
    cache.set(key(input), update(cache.get(key(input))));
  });
  globals.t0Utils = { ledger: {
    t0GetPayoutLogs: { setData, invalidate: logInvalidate },
    t0GetPayoutAvailability: { invalidate: availabilityInvalidate },
  } };
  const context = createContext(globals, { codeGeneration: { strings: false, wasm: false } });
  const production = script.runInContext(context, { timeout: 1000 }) as Production;
  const formSnapshot = () => Object.fromEntries(Object.entries(state).filter(([field]) => field !== "payoutSubmitNotice"));
  return {
    state, events, reads, globals, production, context, writes, setters, forbiddenRequire,
    setData, logInvalidate, availabilityInvalidate, scopedInput, initial, globalCache,
    scopedCache: () => cache.get(key(scopedInput)),
    allUsersCache: () => cache.get(key({ ledgerId: 52, allUsers: true })),
    formSnapshot,
  };
}

function expectNotice(h: ReturnType<typeof harness>, tone: "success" | "error", message: string) {
  expect(h.state.payoutSubmitNotice).toEqual({ tone, message });
  const rendered = h.production.renderNotice();
  expect(rendered?.props).toMatchObject({ role: "status", "aria-live": "polite" });
  expect(text(rendered)).toBe(`${tone === "success" ? "保存成功：" : "未保存："}${message}`);
  expect(rendered?.props?.className).toContain(tone === "success" ? "text-emerald-700" : "text-rose-700");
}

function expectReset(h: ReturnType<typeof harness>) {
  expect(h.formSnapshot()).toMatchObject({
    editingPayoutLog: null, payoutAmount: "", payoutDepositInputMode: "u", payoutEthQuantity: "",
    payoutEthReferencePrice: "", payoutEthReferencePriceIsManual: false, payoutNote: "",
  });
  expect(h.state.payoutOccurredOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(h.setters.setPayoutAmount).toHaveBeenCalledTimes(1);
  expect(h.setters.setPayoutAmount).toHaveBeenCalledWith("");
  expect(h.setters.setPayoutSubmitNotice.mock.calls.map(([notice]) => (notice as Notice)?.tone ?? null))
    .toEqual([null, "success"]);
}

function expectNoExtraWrites(h: ReturnType<typeof harness>, submittedKind?: "create" | "update") {
  for (const { kind, name } of mutations) {
    expect(h.writes[kind]).toHaveBeenCalledTimes(kind === submittedKind ? 1 : 0);
    expect((h.globals[name] as { mutateAsync: ReturnType<typeof vi.fn> }).mutateAsync).not.toHaveBeenCalled();
  }
  expect(h.forbiddenRequire).not.toHaveBeenCalled();
}

describe("T+0 资金保存反馈：真实生产 AST + 禁 require VM", () => {
  it("顶部唯一 t0Toast 定义与三种方法可调用，54处调用没有旧 toast 未定义引用", () => {
    const declarations = ast.statements.filter(ts.isVariableStatement).flatMap((statement) => [...statement.declarationList.declarations]);
    expect(declarations.filter((node) => node.name.getText(ast) === "t0Toast")).toHaveLength(1);
    expect(nodes(ast, ts.isIdentifier).filter((node) => node.text === "toast")).toEqual([]);
    const calls = nodes(ast, ts.isCallExpression).filter((node) =>
      ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(ast) === "t0Toast",
    );
    expect(calls).toHaveLength(54);
    const h = harness("create");
    for (const method of ["success", "error", "message"] as const) {
      expect(() => h.production.t0Toast[method]("通知", savedLog)).not.toThrow();
      expect(h.production.t0Toast[method]("通知")).toBeUndefined();
    }
    expect(new Script("typeof toast").runInContext(h.context)).toBe("undefined");
    for (const name of ["React", "trpc", "process", "module", "exports"]) {
      expect(new Script(`typeof ${name}`).runInContext(h.context)).toBe("undefined");
    }
    expect(() => new Script('require("react")').runInContext(h.context)).toThrow("require is forbidden");
    expect(compiled).not.toMatch(/\brequire\s*\(|\bimport\s/);
  });

  it.each(mutations)("$kind 抽取的是实际端点的 success/error 且用 allSettled 而非 Promise.all", ({ name, endpoint }) => {
    const call = initializer(name);
    if (!ts.isCallExpression(call)) throw new Error("Expected mutation call");
    expect(call.expression.getText(ast)).toBe(`trpc.ledger.${endpoint}.useMutation`);
    for (const callbackName of ["onSuccess", "onError"] as const) {
      expect(ts.isArrowFunction(mutationCallback(name, callbackName))).toBe(true);
    }
    const success = mutationCallback(name, "onSuccess");
    expect(nodes(success, ts.isAwaitExpression).map((node) => node.expression.getText(ast)))
      .toHaveLength(1);
    expect(success.getText(ast)).toContain("await Promise.allSettled(");
    expect(success.getText(ast)).not.toMatch(/\bPromise\.all\s*\(|\.mutate(?:Async)?\s*\(/);
  });

  for (const { kind, success } of mutations) {
    it.each([
      ["全部成功", []], ["当前用户流水拒绝", [0]], ["全局流水拒绝", [1]],
      ["可提额度拒绝", [2]], ["三个读取全部拒绝", [0, 1, 2]],
    ] as const)(`${kind} %s：刷新待完成时成功已可见，拒绝不冒充保存失败/重试/改金额`, async (_label, failures) => {
      const h = harness(kind);
      const snapshot = JSON.stringify(savedLog);
      if (kind !== "delete") {
        // 初次写请求也执行真实 submit 回调；后续 onSuccess/刷新不得追加任何 mutate。
        expect(() => h.production.submitPayoutEntry()).not.toThrow();
        expect(h.writes[kind]).toHaveBeenCalledTimes(1);
        expect(h.writes[kind]).toHaveBeenCalledWith({
          ledgerId: 52, relatedUserId: 28, occurredOn: savedLog.occurredOn,
          amount: "270676.00", direction: "deposit", note: savedLog.note,
          ...(kind === "update" ? { id: savedLog.id } : {}),
          ethReferencePrice: "2248.5", ethQuantity: undefined,
        });
        h.events.length = 0;
        h.setters.setPayoutSubmitNotice.mockClear();
      }
      const callbackError = vi.fn();
      let callbackComplete = false;
      // 如真正 success 回调 reject，模拟 mutation 库调用真实 onError，捕捉假“未保存”。
      const completion = h.production.callbacks[kind].onSuccess(savedLog).catch((error: Error) => {
        callbackError(error);
        h.production.callbacks[kind].onError(error);
        throw error;
      }).finally(() => { callbackComplete = true; });
      expect(callbackComplete).toBe(false);
      expectNotice(h, "success", success);
      expectReset(h);
      expect(h.events[0]).toBe("cache:write");
      const successIndex = h.events.indexOf("notice:success");
      expect(successIndex).toBeGreaterThan(h.events.indexOf("notice:null"));
      expect(successIndex).toBeLessThan(h.events.findIndex((event) => event.startsWith("read:")));
      expect(h.logInvalidate.mock.calls).toEqual([[h.scopedInput], [{ ledgerId: 52, allUsers: true }]]);
      expect(h.availabilityInvalidate).toHaveBeenCalledTimes(1);
      expect(h.availabilityInvalidate).toHaveBeenCalledWith({ ledgerId: 52, relatedUserId: 28 });
      const expectedLogs = kind === "delete" ? [otherLog] : [savedLog, otherLog];
      expect(h.scopedCache()).toEqual(expectedLogs);
      if (kind !== "delete") expect((h.scopedCache() as Log[])[0]).toBe(savedLog);
      expect(h.allUsersCache()).toBe(h.globalCache);
      expect(h.initial).toEqual([oldLog, otherLog, oldLog]);
      expect(JSON.stringify(savedLog)).toBe(snapshot);
      expectNoExtraWrites(h, kind === "delete" ? undefined : kind);
      const committedState = h.formSnapshot();
      const noticeCalls = h.setters.setPayoutSubmitNotice.mock.calls.length;
      h.reads.forEach((read, index) => {
        if ((failures as readonly number[]).includes(index)) read.reject(new Error(`只读刷新失败 ${index}`));
        else read.resolve();
      });
      await expect(completion).resolves.toBeUndefined();
      expect(callbackComplete).toBe(true);
      expect(callbackError).not.toHaveBeenCalled();
      expectNotice(h, "success", success);
      expect(h.setters.setPayoutSubmitNotice).toHaveBeenCalledTimes(noticeCalls);
      expect(h.formSnapshot()).toEqual(committedState);
      expect(h.scopedCache()).toEqual(expectedLogs);
      expect(JSON.stringify(savedLog)).toBe(snapshot);
      expectNoExtraWrites(h, kind === "delete" ? undefined : kind);
    });
  }

  it.each(mutations)("$kind 无原缓存时仍应用真实服务端响应并保持预览查询范围", async ({ kind, success }) => {
    for (const current of [undefined, null, { not: "an array" }]) {
      const h = harness(kind, { cache: current, previewUserId: 31 });
      const completion = h.production.callbacks[kind].onSuccess(savedLog);
      expect(h.setData.mock.calls[0][0]).toEqual({ ledgerId: 52, relatedUserId: 28, previewUserId: 31 });
      expect(h.scopedCache()).toEqual(kind === "delete" ? [] : [savedLog]);
      expectNotice(h, "success", success);
      h.reads.forEach((read) => read.resolve());
      await expect(completion).resolves.toBeUndefined();
      expectNoExtraWrites(h);
    }
  });

  it("删除其他记录不清掉正在编辑的表单，删除确认状态关闭且成功立即可见", async () => {
    const h = harness("delete", { editing: otherLog });
    const before = h.formSnapshot();
    const completion = h.production.callbacks.delete.onSuccess(savedLog);
    expect(h.formSnapshot()).toEqual({ ...before, deletePayoutLogId: null });
    expect(h.setters.setPayoutAmount).not.toHaveBeenCalled();
    expectNotice(h, "success", mutations[2].success);
    h.reads.forEach((read) => read.reject(new Error("读取拒绝不影响已删除事实")));
    await expect(completion).resolves.toBeUndefined();
    expectNoExtraWrites(h);
  });

  it.each(mutations)("$kind 真实 onError 显示未保存错误并保留表单、缓存和未完成操作供修正", ({ kind, fallback }) => {
    for (const message of ["服务端写入失败：测试错误", "", undefined]) {
      const h = harness(kind);
      const before = h.formSnapshot();
      expect(() => h.production.callbacks[kind].onError({ message })).not.toThrow();
      expect(h.formSnapshot()).toEqual(before);
      expect(h.setters.setPayoutAmount).not.toHaveBeenCalled();
      expect(h.setters.setEditingPayoutLog).not.toHaveBeenCalled();
      expect(h.setters.setPayoutOccurredOn).not.toHaveBeenCalled();
      expect(h.setters.setDeletePayoutLogId).not.toHaveBeenCalled();
      expect(h.scopedCache()).toBe(h.initial);
      expect(h.allUsersCache()).toBe(h.globalCache);
      expect(h.setData).not.toHaveBeenCalled();
      expect(h.logInvalidate).not.toHaveBeenCalled();
      expect(h.availabilityInvalidate).not.toHaveBeenCalled();
      expectNoExtraWrites(h);
      expectNotice(h, "error", message || fallback);
    }
  });
});
