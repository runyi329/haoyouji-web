import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { validateOrdinaryTagObservationConfig, type OrdinaryTagObservationConfig } from "@shared/ordinary-tag-observation";
import OrdinaryTagObservationEditor, {
  createOrdinaryObservationEditorState,
  ordinaryObservationEditorReducer,
  ordinaryObservationConfigFromDraft,
  ordinaryObservationPreviewKey,
  readOrdinaryObservationPreview,
  saveOrdinaryObservationConfig,
  type OrdinaryObservationDraft,
} from "./OrdinaryTagObservationEditor";

// 完全离线：只允许独立观察读写 hook；任何真实资金 route 的接触直接失败。
const api = vi.hoisted(() => ({
  query: vi.fn(), mutation: vi.fn(), mutateAsync: vi.fn(), refetch: vi.fn(),
  realFundsMutation: vi.fn(() => { throw new Error("不得调用真实资金 mutation"); }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    ledger: new Proxy({
      adminGetOrdinaryTagObservationConfig: { useQuery: api.query },
      adminSetOrdinaryTagObservationConfig: { useMutation: api.mutation },
    }, { get: (routes, route) => {
      if (!(route in routes)) return { useMutation: api.realFundsMutation };
      return routes[route as keyof typeof routes];
    } }),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const fixture: OrdinaryTagObservationConfig = {
  enabled: true,
  initialAmount: 125000,
  ratio: 12.5,
  startDate: "2026-11-01",
  pauseDate: null,
};
const completeDraft: OrdinaryObservationDraft = {
  enabled: true, initialAmount: "125000", ratio: "12.5", startDate: "2026-11-01", pauseDate: "",
};
const scope = "37:101:201";
function savedState(config = fixture) {
  return ordinaryObservationEditorReducer(createOrdinaryObservationEditorState(scope), {
    type: "hydrate", scope, config, source: "saved",
  });
}
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.query.mockReturnValue({ data: { config: null }, dataUpdatedAt: 1, isLoading: false, isError: false, refetch: api.refetch });
  api.mutation.mockReturnValue({ mutateAsync: api.mutateAsync });
});

describe("普通标签独立观察编辑器草稿", () => {
  it("无配置默认 off 且金额、比例、日期均空，不伪造 0 或当日日期", () => {
    const state = createOrdinaryObservationEditorState(scope);
    expect(state.draft).toEqual({ enabled: false, initialAmount: "", ratio: "", startDate: "", pauseDate: "" });
    expect(state.dirty).toBe(false);
    expect(() => ordinaryObservationConfigFromDraft(state.draft)).toThrow("明确填写");
  });

  it("2秒后台刷新不会覆盖 dirty 草稿，包括金额清空、0和日期输入", () => {
    for (const patch of [{ initialAmount: "" }, { initialAmount: "0" }, { ratio: "30" }, { pauseDate: "2026-11-06" }]) {
      const dirty = ordinaryObservationEditorReducer(savedState(), { type: "edit", scope, patch });
      const refreshed = ordinaryObservationEditorReducer(dirty, {
        type: "hydrate", scope, config: { ...fixture, initialAmount: 999999 }, source: "saved",
      });
      expect(refreshed).toBe(dirty);
      expect(refreshed.draft).toMatchObject(patch);
    }
  });

  it("未编辑时可同步后台独立配置；撤销只回退观察基线", () => {
    const state = ordinaryObservationEditorReducer(savedState(), { type: "hydrate", scope, config: { ...fixture, ratio: 15 }, source: "saved" });
    const dirty = ordinaryObservationEditorReducer(state, { type: "edit", scope, patch: { ratio: "25" } });
    expect(ordinaryObservationEditorReducer(dirty, { type: "discard", scope }).draft.ratio).toBe("15");
    expect(ordinaryObservationEditorReducer(dirty, { type: "discard", scope }).dirty).toBe(false);
  });

  it("关闭观察保留全部独立参数；开关不生成真实资金字段", () => {
    const original = savedState({ ...fixture, pauseDate: "2026-11-07" });
    const state = ordinaryObservationEditorReducer(original, { type: "edit", scope, patch: { enabled: false } });
    const config = ordinaryObservationConfigFromDraft(state.draft);
    expect(config).toEqual({ ...fixture, enabled: false, pauseDate: "2026-11-07" });
    expect(Object.keys(config).sort()).toEqual(["enabled", "initialAmount", "pauseDate", "ratio", "startDate"]);
  });

  it("身份键隔离：其他用户/标签的 hydrate、edit、saved、discard 均不能串入", () => {
    const state = savedState();
    for (const otherScope of ["37:102:201", "37:101:202", "52:101:201"]) {
      for (const action of [
        { type: "hydrate", scope: otherScope, config: { ...fixture, initialAmount: 88 }, source: "preview" },
        { type: "edit", scope: otherScope, patch: { ratio: "88" } },
        { type: "saved", scope: otherScope, config: fixture, source: "saved", submitted: completeDraft },
        { type: "discard", scope: otherScope },
      ] as const) expect(ordinaryObservationEditorReducer(state, action)).toBe(state);
    }
    expect(createOrdinaryObservationEditorState("37:102:201").draft.initialAmount).toBe("");
  });

  it("保存回执不能覆盖保存过程中更晚的草稿", () => {
    const dirty = ordinaryObservationEditorReducer(savedState(), { type: "edit", scope, patch: { ratio: "20" } });
    const submitted = dirty.draft;
    const newer = ordinaryObservationEditorReducer(dirty, { type: "edit", scope, patch: { ratio: "25" } });
    const resolved = ordinaryObservationEditorReducer(newer, { type: "saved", scope, config: { ...fixture, ratio: 20 }, source: "saved", submitted });
    expect(resolved.baseline.ratio).toBe("20");
    expect(resolved.draft.ratio).toBe("25");
    expect(resolved.dirty).toBe(true);
  });

  it("日期边界与明确 0 输入：允许未来开始/暂停、拒绝不存在日期和早于开始的暂停", () => {
    expect(ordinaryObservationConfigFromDraft({ ...completeDraft, initialAmount: "0", ratio: "0", startDate: "2027-01-01" })).toMatchObject({ initialAmount: 0, ratio: 0, startDate: "2027-01-01" });
    for (const invalid of [{ initialAmount: "" }, { ratio: "" }, { initialAmount: "-1" }, { ratio: "-1" }, { ratio: "100.01" }, { ratio: "Infinity" }, { startDate: "2026-02-30" }, { startDate: "0999-12-31" }, { pauseDate: "2026-10-31" }]) {
      expect(() => ordinaryObservationConfigFromDraft({ ...completeDraft, ...invalid })).toThrow();
    }
  });

  it("观察比例0和100合法，超100拒绝；合法前端配置能通过共享契约校验", () => {
    for (const ratio of ["0", "12.5", "100"]) {
      const config = ordinaryObservationConfigFromDraft({ ...completeDraft, ratio });
      expect(validateOrdinaryTagObservationConfig(config)).toEqual(config);
    }
    expect(() => ordinaryObservationConfigFromDraft({ ...completeDraft, ratio: "100.0001" })).toThrow("0 至 100%");
  });
});

describe("普通标签观察保存隔离", () => {
  it("DEV仅保存精确sessionStorage键和固定config，派发预览变更，不调用任何mutation", async () => {
    const storage = memoryStorage();
    const dispatchPreviewChange = vi.fn();
    const mutate = vi.fn();
    const result = await saveOrdinaryObservationConfig({ ledgerId: 37, categoryId: 201, targetUserId: 101, config: fixture }, { isDev: true, storage, dispatchPreviewChange, mutate });
    expect(result).toEqual(fixture);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith("ordinary-tag-observation-preview:101:201", JSON.stringify(fixture));
    expect(dispatchPreviewChange).toHaveBeenCalledTimes(1);
    expect(dispatchPreviewChange).toHaveBeenCalledWith({ userId: 101, categoryId: 201 });
    expect(mutate).not.toHaveBeenCalled();
    expect(api.mutateAsync).not.toHaveBeenCalled();
    expect(api.realFundsMutation).not.toHaveBeenCalled();
  });

  it("每人每标签预览独立；关闭保存保留参数，不清理任何其他键", async () => {
    const storage = memoryStorage();
    storage.values.set("real-balances", "untouched");
    const deps = { isDev: true, storage, dispatchPreviewChange: vi.fn(), mutate: vi.fn() };
    for (const [targetUserId, categoryId, ratio] of [[101, 201, 10], [102, 201, 20], [101, 202, 30]]) {
      await saveOrdinaryObservationConfig({ ledgerId: 37, targetUserId, categoryId, config: { ...fixture, ratio } }, deps);
    }
    await saveOrdinaryObservationConfig({ ledgerId: 37, targetUserId: 101, categoryId: 201, config: { ...fixture, ratio: 10, enabled: false } }, deps);
    expect(readOrdinaryObservationPreview(storage, 101, 201)).toEqual({ ...fixture, ratio: 10, enabled: false });
    expect(readOrdinaryObservationPreview(storage, 102, 201)?.ratio).toBe(20);
    expect(readOrdinaryObservationPreview(storage, 101, 202)?.ratio).toBe(30);
    expect(readOrdinaryObservationPreview(storage, 102, 202)).toBeNull();
    expect(storage.values.get("real-balances")).toBe("untouched");
  });

  it("正式模式只调用专用观察mutation，载荷不含真实余额/显示/保证金/钱包/股票字段", async () => {
    const storage = memoryStorage();
    const dispatchPreviewChange = vi.fn();
    const mutate = vi.fn().mockResolvedValue({ success: true, config: fixture });
    const input = { ledgerId: 37, categoryId: 201, targetUserId: 101, config: fixture };
    await saveOrdinaryObservationConfig(input, { isDev: false, storage, dispatchPreviewChange, mutate });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(input);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(dispatchPreviewChange).not.toHaveBeenCalled();
    expect(api.realFundsMutation).not.toHaveBeenCalled();
  });

  it("范围保护：其他账本/无效身份在任何存储或mutation前拒绝", async () => {
    const deps = { isDev: true, storage: memoryStorage(), dispatchPreviewChange: vi.fn(), mutate: vi.fn() };
    for (const invalid of [{ ledgerId: 52 }, { ledgerId: 36 }, { categoryId: 0 }, { categoryId: -1 }, { targetUserId: 0 }, { targetUserId: NaN }]) {
      await expect(saveOrdinaryObservationConfig({ ledgerId: 37, categoryId: 201, targetUserId: 101, config: fixture, ...invalid }, deps)).rejects.toThrow("仅支持 37");
    }
    expect(deps.storage.setItem).not.toHaveBeenCalled();
    expect(deps.mutate).not.toHaveBeenCalled();
  });

  it("sessionStorage失败不得回退到POST或报已保存", async () => {
    const mutate = vi.fn();
    const dispatchPreviewChange = vi.fn();
    await expect(saveOrdinaryObservationConfig({ ledgerId: 37, categoryId: 201, targetUserId: 101, config: fixture }, {
      isDev: true, storage: { setItem: () => { throw new Error("storage disabled"); } }, dispatchPreviewChange, mutate,
    })).rejects.toThrow("storage disabled");
    expect(mutate).not.toHaveBeenCalled();
    expect(dispatchPreviewChange).not.toHaveBeenCalled();
  });

  it("损坏、未知或空金额预览不伪造配置", () => {
    const storage = memoryStorage();
    for (const value of ["{", "null", JSON.stringify({ enabled: true }), JSON.stringify({ ...fixture, initialAmount: "" }), JSON.stringify({ ...fixture, pauseDate: "2026-02-30" })]) {
      storage.values.set(ordinaryObservationPreviewKey(101, 201), value);
      expect(readOrdinaryObservationPreview(storage, 101, 201)).toBeNull();
    }
  });
});

describe("组件与管理页离线接线", () => {
  it("引用真实金额只显示placeholder/明确填入按钮，初始input仍为空", () => {
    const html = renderToStaticMarkup(createElement(OrdinaryTagObservationEditor, { ledgerId: 37, categoryId: 201, targetUserId: 101, referenceInitialAmount: 125000 }));
    expect(html).toContain("明确填入已保存真实初始金额");
    expect(html).toContain("真实起点参考：125000");
    expect(html).toMatch(/type="number"[^>]*value=""/);
    expect(html).toContain("不进账、不参与结算");
    expect(html).toContain("实际比例和实际权益设为0");
    expect(html).toContain("不自动恢复实际比例");
    expect(html).toContain("观察关闭");
    expect(html).toContain('max="100"');
    expect(api.query).toHaveBeenCalledWith({ ledgerId: 37, categoryId: 201, targetUserId: 101 }, expect.objectContaining({ refetchInterval: 2000, placeholderData: undefined }));
    expect(api.realFundsMutation).not.toHaveBeenCalled();
  });

  it("切用户或标签重建key，并且范围外不挂载任何观察读写hook", () => {
    const props = { ledgerId: 37, categoryId: 201, targetUserId: 101 };
    expect(OrdinaryTagObservationEditor(props)?.key).toBe("37:101:201");
    expect(OrdinaryTagObservationEditor({ ...props, targetUserId: 102 })?.key).toBe("37:102:201");
    expect(OrdinaryTagObservationEditor({ ...props, categoryId: 202 })?.key).toBe("37:101:202");
    expect(OrdinaryTagObservationEditor({ ...props, ledgerId: 52 })).toBeNull();
    expect(OrdinaryTagObservationEditor({ ...props, targetUserId: 0 })).toBeNull();
    expect(api.query).not.toHaveBeenCalled();
    expect(api.mutation).not.toHaveBeenCalled();
  });

  it("仅37号普通标签的用户展开与标签弹窗共用新字段，其他账本恢复旧表单回调", () => {
    const source = readFileSync(new URL("../pages/LedgerAAInitialBalance.tsx", import.meta.url), "utf8");
    expect(source).toContain("ledgerId === 37 && !isStockTag && renderOrdinaryTagEditor(userId, cat, member)");
    expect(source).toContain("ledgerId === 37 && !isStockTag && category && renderOrdinaryTagEditor(userId, category, member, true)");
    const detail = source.slice(source.indexOf("const renderOrdinaryTagEditor"), source.indexOf("const getMarginEntryCNY"));
    expect(detail).toContain("if (ledgerId !== 37 || isStockPortfolioTag(category)) return null;");
    expect(detail).toContain("<OrdinaryTagInlineMemberRow");
    expect(source).not.toContain("<OrdinaryTagAllocationFields");
    expect(source.match(/>日期设置<\/div>/g)).toHaveLength(2);
    expect(source.match(/>金额与比例<\/div>/g)).toHaveLength(2);
    expect(source).toContain("updateEntry(userId, cat.name, { startDate: event.target.value })");
    expect(source).toContain("updateEntry(userId, tagName, { startDate: e.target.value })");
    expect(source).toContain("categoryId={Number(category.id)}");
    expect(source).not.toContain("<OrdinaryTagObservationEditor");
    expect(source).toContain("保存日期与押金");
    expect(source).toContain("updateAllocationLink(userId, category.name, field, value");
    expect(source).toContain("updateAllocationLink(userId, tagName, 'ratio'");
    const editorSource = readFileSync(new URL("./OrdinaryTagObservationEditor.tsx", import.meta.url), "utf8");
    expect(editorSource).toContain("new CustomEvent(\"ordinary-tag-observation-preview-change\"");
    expect(editorSource).toContain('removeEventListener("ordinary-tag-observation-preview-change", hydrate)');
    expect(editorSource).not.toMatch(/\bfetch\s*\(/);
    for (const forbidden of ["updateMyInitialBalances", "adminSetMemberInitialBalances", "freezeLedger37", "releaseLedger37", "setStockLotObservation", "localStorage", "axios", "updateAllocationLink", "setPauseWallet"]) {
      expect(editorSource).not.toContain(forbidden);
    }
  });
});
