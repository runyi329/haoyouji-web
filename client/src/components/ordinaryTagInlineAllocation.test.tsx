import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  emptyInlineObservation, inlineObservationFromConfig, inlineObservationsEqual, inlineConfigFromDraft, toggleInlineObservation, stepInlineRatio, parseInlineRatioInput,
  ordinaryInlineScope, ordinaryActualPreviewKey, ordinaryInlinePreviewKey,
  readInlineObservationPreview, readOrdinaryActualPreview, zeroOrdinaryActual,
  validateInlineActual, summarizeOrdinaryInlineRows, saveOrdinaryInlineTag,
  type OrdinaryInlineSaveRow, type OrdinaryInlineSaveDependencies,
} from "./ordinaryTagInlineAllocation";
import { OrdinaryTagInlineMemberFields } from "./OrdinaryTagInlineMemberRow";

vi.mock("@/lib/trpc", () => ({ trpc: {} }));
vi.mock("@/components/UserAvatar", () => ({ UserAvatar: (props: any) => createElement("span", { "data-avatar": props.username }, props.nickname || props.username) }));
const config = { enabled: true, initialAmount: 100000, ratio: 12.5, startDate: "2026-11-01", pauseDate: null };
const actual = { amount: "100000", ratio: "20", targetAmount: "20000" };
const observation = inlineObservationFromConfig(config);
const saveInput = (rows: OrdinaryInlineSaveRow[]) => ({ ledgerId: 37, categoryId: 201, tagName: "普通标签", rows });
const row = (patch: Partial<OrdinaryInlineSaveRow> = {}): OrdinaryInlineSaveRow => ({
  userId: 101, name: "成员甲", observation, observationChanged: true,
  actual, actualChanged: false, previousActualRatio: 20, ...patch,
});
function deps(isDev = false): OrdinaryInlineSaveDependencies & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return { isDev, values, storage: { setItem: vi.fn((key, value) => { values.set(key, value); }) }, confirm: vi.fn(() => true),
    dispatchPreviewChange: vi.fn(), saveObservation: vi.fn().mockResolvedValue({ success: true }), saveActual: vi.fn().mockResolvedValue({ success: true }),
    onObservationSaved: vi.fn(), onActualSaved: vi.fn() };
}

describe("普通标签行内草稿纯函数", () => {
  it("默认不开启，点击开启才种子真实金额/比例/开始，无日期才当天；不拷贝真实暂停", () => {
    const original = emptyInlineObservation();
    expect(original).toEqual({ enabled: false, initialAmount: "", ratio: "", startDate: "", pauseDate: "" });
    const seeded = toggleInlineObservation(original, true, { ...actual, startDate: "2026-10-01" }, "2026-11-09");
    expect(seeded).toEqual({ enabled: true, initialAmount: "100000", ratio: "20", startDate: "2026-10-01", pauseDate: "" });
    expect(original.enabled).toBe(false);
    expect(toggleInlineObservation(original, true, { ...actual, startDate: "" }, "2026-11-09").startDate).toBe("2026-11-09");
    expect(actual).toEqual({ amount: "100000", ratio: "20", targetAmount: "20000" });
  });
  it("任意两种关闭状态互相等价，忽略空白/无效/残留参考字段；真正关闭开启基线仍dirty", () => {
    const variants = [emptyInlineObservation(), { ...observation, enabled: false }, { enabled: false, initialAmount: "NaN", ratio: "-1", startDate: "无效", pauseDate: "Infinity" }];
    for (const a of variants) for (const b of variants) expect(inlineObservationsEqual(a, b)).toBe(true);
    expect(inlineObservationsEqual(emptyInlineObservation(), observation)).toBe(false);
    expect(inlineObservationsEqual(observation, { ...observation, ratio: "13" })).toBe(false);
  });
  it("观察零值、比例超100与未来日期合法，非负有限数、合法日期及算术溢出仍严格拒绝", () => {
    expect(inlineConfigFromDraft({ ...observation, initialAmount: "0", ratio: "0", startDate: "2026-11-11" })).toEqual({ ...config, initialAmount: 0, ratio: 0, startDate: "2026-11-11" });
    expect(inlineConfigFromDraft({ ...observation, ratio: "125.5" }).ratio).toBe(125.5);
    for (const field of ["initialAmount", "ratio"] as const) {
      for (const value of ["-1", "NaN", "Infinity", "-Infinity", "."]) expect(() => inlineConfigFromDraft({ ...observation, [field]: value })).toThrow(field === "ratio" ? "观察比例" : "观察初始金额");
    }
    expect(() => inlineConfigFromDraft({ ...observation, startDate: "2026-02-30" })).toThrow("观察开始日期无效");
    expect(() => inlineConfigFromDraft({ ...observation, pauseDate: "2026-11-32" })).toThrow("观察暂停日期无效");
    expect(() => inlineConfigFromDraft({ ...observation, pauseDate: "2026-10-31" })).toThrow("观察暂停日期不能早于开始日期");
    expect(() => inlineConfigFromDraft({ ...observation, initialAmount: "1e308", ratio: "1e308" })).toThrow("溢出");
  });
  it("开关状态按ledger/user/tag隔离，关闭不恢复实际份额", () => {
    const scopes = [ordinaryInlineScope(37, 101, 201), ordinaryInlineScope(37, 102, 201), ordinaryInlineScope(37, 101, 202)];
    expect(new Set(scopes).size).toBe(3);
    const states = Object.fromEntries(scopes.map(scope => [scope, emptyInlineObservation()]));
    states[scopes[0]] = toggleInlineObservation(states[scopes[0]], true, { ...actual, startDate: "" }, "2026-11-09");
    expect(states[scopes[1]].enabled).toBe(false);
    expect(states[scopes[2]].enabled).toBe(false);
    const released = zeroOrdinaryActual(actual);
    const off = toggleInlineObservation(observation, false, { ...released, startDate: "" }, "2026-11-09");
    expect(off).toEqual({ ...observation, enabled: false });
    expect(released).toEqual({ amount: "100000", ratio: "0", targetAmount: "0" });
  });
  it("观察成员排除真实总比例/人数/分配金额，观察比例单列", () => {
    const total = summarizeOrdinaryInlineRows([
      { enabled: true, actual, observationRatio: "12.5" },
      { enabled: false, actual: { amount: "80000", ratio: "25.5", targetAmount: "20400" }, observationRatio: "99" },
      { enabled: false, actual: { amount: "5000", ratio: "0", targetAmount: "0" }, observationRatio: "5" },
    ]);
    expect(total).toEqual({ actualRatio: 25.5, actualAmount: 20400, actualCount: 1, observationRatio: 12.5, observerCount: 1 });
  });
  it("加减一百分点保持小数、仅下限0，允许超过100但拒绝非有限/负数/非法符号", () => {
    expect(stepInlineRatio("12.5", 1)).toBe("13.5");
    expect(stepInlineRatio("12.5", -1)).toBe("11.5");
    expect(stepInlineRatio("0.25", -1)).toBe("0");
    expect(stepInlineRatio("99.75", 1)).toBe("100.75");
    expect(stepInlineRatio("100", 1)).toBe("101");
    expect(stepInlineRatio("1234.5", 1)).toBe("1235.5");
    expect(stepInlineRatio("0", -1)).toBe("0");
    expect(stepInlineRatio("0.1", 1)).toBe("1.1");
    expect(parseInlineRatioInput("12.50%")).toBe("12.50");
    expect(parseInlineRatioInput("100.01")).toBe("100.01");
    expect(parseInlineRatioInput("1234.50%")).toBe("1234.50");
    expect(parseInlineRatioInput("9".repeat(309))).toBeNull();
    expect(parseInlineRatioInput("Infinity")).toBeNull();
    expect(parseInlineRatioInput("NaN")).toBeNull();
    expect(parseInlineRatioInput("-1")).toBeNull();
    expect(parseInlineRatioInput("a")).toBeNull();
    expect(parseInlineRatioInput("")).toBe("");
  });
  it("真实三联动零退出合法，缺项、负比例、金额与比例不一致拒绝", () => {
    expect(validateInlineActual({ amount: "0", ratio: "0", targetAmount: "0" })).toEqual({ amount: "0", ratio: "0", targetAmount: "0" });
    expect(validateInlineActual(zeroOrdinaryActual(actual)).ratio).toBe("0");
    expect(() => validateInlineActual({ ...actual, ratio: "" })).toThrow();
    expect(() => validateInlineActual({ ...actual, ratio: "-1" })).toThrow();
    expect(() => validateInlineActual({ ...actual, targetAmount: "1" })).toThrow("分配金额");
  });
  it("单人比例超过100合法，保留金额公式、有限值和算术溢出守卫", () => {
    const over = { amount: "1000", ratio: "125.5", targetAmount: "1255" };
    expect(validateInlineActual(over)).toEqual(over);
    for (const field of ["amount", "ratio", "targetAmount"] as const) {
      for (const value of ["Infinity", "-Infinity", "NaN", "-1"]) expect(() => validateInlineActual({ ...over, [field]: value })).toThrow();
    }
    expect(() => validateInlineActual({ amount: "1e308", ratio: "200", targetAmount: "1e308" })).toThrow("溢出");
    expect(() => validateInlineActual({ ...over, targetAmount: "1254" })).toThrow("分配金额");
  });
});

describe("标签级保存观察与真实请求隔离", () => {
  it("DEV混合保存仅sessionStorage，无任何mutation/POST；观察转换写实际零基线并派发事件", async () => {
    const d = deps(true);
    const result = await saveOrdinaryInlineTag(saveInput([
      row({ actualChanged: true }), // 之前实际draft绝不写回observer
      row({ userId: 102, name: "成员乙", observation: emptyInlineObservation(), observationChanged: false, actualChanged: true, actual: { amount: "80000", ratio: "30", targetAmount: "24000" } }),
    ]), d);
    expect(result).toBe(true);
    expect(d.saveObservation).not.toHaveBeenCalled();
    expect(d.saveActual).not.toHaveBeenCalled();
    expect(JSON.parse(d.values.get(ordinaryInlinePreviewKey(101, 201))!)).toEqual(config);
    expect(JSON.parse(d.values.get(ordinaryActualPreviewKey(37, 101, 201))!)).toEqual(zeroOrdinaryActual(actual));
    expect(JSON.parse(d.values.get(ordinaryActualPreviewKey(37, 102, 201))!)).toEqual({ amount: "80000", ratio: "30", targetAmount: "24000" });
    expect(d.dispatchPreviewChange).toHaveBeenCalledWith({ userId: 101, categoryId: 201 });
    expect(d.confirm).toHaveBeenCalledWith(expect.stringContaining("历史、押金和钱包不动"));
    expect(d.confirm).toHaveBeenCalledWith(expect.stringContaining("关闭观察不会自动恢复"));
  });
  it("普通实际preview与observe键各自隔离，其他user/tag不会串入", async () => {
    const d = deps(true);
    await saveOrdinaryInlineTag(saveInput([row({ previousActualRatio: 0 })]), d);
    const storage = { getItem: (key: string) => d.values.get(key) ?? null };
    expect(readInlineObservationPreview(storage, 101, 201)).toEqual(config);
    expect(readInlineObservationPreview(storage, 102, 201)).toBeNull();
    expect(readInlineObservationPreview(storage, 101, 202)).toBeNull();
    expect(readOrdinaryActualPreview(storage, 37, 101, 201)?.ratio).toBe("0");
    expect(readOrdinaryActualPreview(storage, 52, 101, 201)).toBeNull();
  });
  it("observer转换丢弃此前实际金额草稿；只保留已保存参考金额与零真实份额", async () => {
    const d = deps(true);
    await saveOrdinaryInlineTag(saveInput([row({ actual: { amount: "999999", ratio: "90", targetAmount: "899999.1" }, actualChanged: true, previousActual: actual })]), d);
    expect(JSON.parse(d.values.get(ordinaryActualPreviewKey(37, 101, 201))!)).toEqual({ amount: "100000", ratio: "0", targetAmount: "0" });
    expect(d.saveActual).not.toHaveBeenCalled();
  });
  it("PROD所有观察先保存（含off）再actual，实际只有本tag三键，观察行无旧实际载荷", async () => {
    const d = deps();
    const order: string[] = [];
    d.saveObservation = vi.fn(async input => { order.push(`observe:${input.targetUserId}:${input.config.enabled}`); });
    d.saveActual = vi.fn(async input => { order.push(`actual:${input.targetUserId}`); });
    const off = { ...observation, enabled: false };
    await saveOrdinaryInlineTag(saveInput([
      row({ actualChanged: true }),
      row({ userId: 102, observation: off, previousObservation: observation, actualChanged: true, actual: { amount: "100000", ratio: "15.5", targetAmount: "15500" }, previousActualRatio: 0 }),
    ]), d);
    expect(order).toEqual(["observe:101:true", "observe:102:false", "actual:102"]);
    expect(d.saveActual).toHaveBeenCalledTimes(1);
    expect(d.saveActual).toHaveBeenCalledWith({ ledgerId: 37, targetUserId: 102, balances: { "普通标签": 100000, "普通标签__ratio": 15.5, "普通标签__targetAmount": 15500 }, migratedMarginNoteIds: [] });
    expect(d.storage.setItem).not.toHaveBeenCalled();
  });
  it("off只保存disabled参数，无自动恢复actual请求", async () => {
    const d = deps();
    await saveOrdinaryInlineTag(saveInput([row({ observation: { ...observation, enabled: false }, previousObservation: observation, actual: zeroOrdinaryActual(actual), previousActualRatio: 0 })]), d);
    expect(d.saveObservation).toHaveBeenCalledWith(expect.objectContaining({ config: { ...config, enabled: false } }));
    expect(d.saveActual).not.toHaveBeenCalled();
  });
  it("转换被取消则无存储无请求，草稿保持", async () => {
    const d = deps(true);
    d.confirm = vi.fn(() => false);
    const r = row();
    const before = structuredClone(r);
    expect(await saveOrdinaryInlineTag(saveInput([r]), d)).toBe(false);
    expect(r).toEqual(before);
    expect(d.storage.setItem).not.toHaveBeenCalled();
    expect(d.onObservationSaved).not.toHaveBeenCalled();
  });
  it("观察请求失败保留draft且停止全部actual；实际失败保留其draft、已成功观察不复原", async () => {
    const d = deps();
    d.saveObservation = vi.fn().mockRejectedValue(new Error("观察失败"));
    const r = row();
    const a = row({ userId: 102, observation: emptyInlineObservation(), observationChanged: false, actualChanged: true });
    const before = structuredClone([r, a]);
    await expect(saveOrdinaryInlineTag(saveInput([r, a]), d)).rejects.toThrow("成员甲：观察保存失败");
    expect([r, a]).toEqual(before);
    expect(d.onObservationSaved).not.toHaveBeenCalled();
    expect(d.saveActual).not.toHaveBeenCalled();
    const partial = deps();
    partial.saveActual = vi.fn().mockRejectedValue(new Error("实际失败"));
    await expect(saveOrdinaryInlineTag(saveInput([r, a]), partial)).rejects.toThrow("成员甲：真实保存失败");
    expect(partial.onObservationSaved).toHaveBeenCalledTimes(1);
    expect(partial.onActualSaved).not.toHaveBeenCalled();
    expect([r, a]).toEqual(before);
  });
  it("存储失败不回退POST，多成员实际合计超100成功且观察不占总量", async () => {
    const d = deps(true);
    d.storage = { setItem: () => { throw new Error("会话存储不可用"); } };
    await expect(saveOrdinaryInlineTag(saveInput([row()]), d)).rejects.toThrow("成员甲：观察会话预览保存失败");
    expect(d.saveObservation).not.toHaveBeenCalled();
    expect(d.saveActual).not.toHaveBeenCalled();
    const over = row({ observation: emptyInlineObservation(), observationChanged: false, actualChanged: true, actual: { amount: "100000", ratio: "60", targetAmount: "60000" } });
    const live = deps();
    await expect(saveOrdinaryInlineTag(saveInput([over, { ...over, userId: 102 }]), live)).resolves.toBe(true);
    expect(live.saveActual).toHaveBeenCalledTimes(2);
    expect(live.saveActual).toHaveBeenCalledWith(expect.objectContaining({ targetUserId: 101, balances: { 普通标签: 100000, 普通标签__ratio: 60, 普通标签__targetAmount: 60000 } }));
    expect(live.saveActual).toHaveBeenCalledWith(expect.objectContaining({ targetUserId: 102 }));
    await expect(saveOrdinaryInlineTag(saveInput([row({ observation: { ...observation, ratio: "100" } }), over]), deps())).resolves.toBe(true);
  });
  it("单人超100实际保存成功，任何非法实际行在首个观察或真实请求前拒绝", async () => {
    const over = row({ observation: emptyInlineObservation(), observationChanged: false, actualChanged: true, actual: { amount: "1000", ratio: "101", targetAmount: "1010" } });
    const live = deps();
    await expect(saveOrdinaryInlineTag(saveInput([over]), live)).resolves.toBe(true);
    expect(live.saveActual).toHaveBeenCalledWith(expect.objectContaining({ balances: { 普通标签: 1000, 普通标签__ratio: 101, 普通标签__targetAmount: 1010 } }));
    for (const ratio of ["-1", "NaN", "Infinity"]) {
      const d = deps();
      await expect(saveOrdinaryInlineTag(saveInput([row(), { ...over, userId: 102, actual: { ...over.actual, ratio } }]), d)).rejects.toThrow();
      expect(d.saveObservation).not.toHaveBeenCalled(); expect(d.saveActual).not.toHaveBeenCalled();
    }
  });
  it("截图组合：修玉霞完整观察+9位真实+never-enabled空成员+开启关闭空draft，不写空观察或空白成员", async () => {
    const d = deps();
    const active = row({ name: "修玉霞", observation: { enabled: true, initialAmount: "10000", ratio: "100", startDate: "2026-11-11", pauseDate: "" }, previousObservation: emptyInlineObservation(), previousActualRatio: 0 });
    const actualRows = Array.from({ length: 9 }, (_, i) => row({ userId: 201 + i, name: `真实成员${i + 1}`, observation: emptyInlineObservation(), previousObservation: emptyInlineObservation(), observationChanged: false, actualChanged: true, actual: { amount: "10000", ratio: "12.5", targetAmount: "1250" } }));
    const blankRows = ["WHY", "空白成员乙", "开后关闭成员"].map((name, i) => row({ userId: 301 + i, name, observation: emptyInlineObservation(), previousObservation: emptyInlineObservation(), observationChanged: true, actualChanged: false, previousActualRatio: 0, actual: { amount: "", ratio: "", targetAmount: "" } }));
    await expect(saveOrdinaryInlineTag({ ...saveInput([active, ...actualRows, ...blankRows]), tagName: "辉达kk9902" }, d)).resolves.toBe(true);
    expect(d.saveObservation).toHaveBeenCalledTimes(1);
    expect(d.saveObservation).toHaveBeenCalledWith(expect.objectContaining({ targetUserId: 101, config: { enabled: true, initialAmount: 10000, ratio: 100, startDate: "2026-11-11", pauseDate: null } }));
    expect(d.saveActual).toHaveBeenCalledTimes(9);
    expect(vi.mocked(d.saveActual).mock.calls.map(([input]) => input.targetUserId)).toEqual(actualRows.map(r => r.userId));
  });
  it("已保存disabled及未提供基线的关闭草稿不写配置；真正关闭即使草稿为空仍提交原参数disabled", async () => {
    const d = deps();
    const blank = row({ observation: emptyInlineObservation(), previousActualRatio: 0 });
    await saveOrdinaryInlineTag(saveInput([
      blank,
      { ...blank, userId: 102, previousObservation: { ...observation, enabled: false } },
      { ...blank, userId: 103, observation: { ...emptyInlineObservation(), initialAmount: "NaN", ratio: "-1", startDate: "错误" }, previousObservation: emptyInlineObservation() },
      { ...blank, userId: 104, previousObservation: observation, observationChanged: false, actual: zeroOrdinaryActual(actual) },
    ]), d);
    expect(d.saveObservation).toHaveBeenCalledTimes(1);
    expect(d.saveObservation).toHaveBeenCalledWith(expect.objectContaining({ targetUserId: 104, config: { ...config, enabled: false } }));
    expect(d.saveActual).not.toHaveBeenCalled();
  });
  it.each([
    ["initialAmount", "观察初始金额未填写"], ["ratio", "观察比例未填写"], ["startDate", "观察开始日期未填写"],
  ] as const)("enabled成员缺%s给出具体姓名和字段，全部写请求及确认为0", async (field, message) => {
    const d = deps();
    const bad = row({ userId: 102, name: "WHY", observation: { ...observation, [field]: "" }, previousActualRatio: 0 });
    const real = row({ userId: 103, observation: emptyInlineObservation(), previousObservation: emptyInlineObservation(), actualChanged: true });
    await expect(saveOrdinaryInlineTag(saveInput([row(), real, bad]), d)).rejects.toThrow(`WHY：${message}`);
    expect(d.saveObservation).not.toHaveBeenCalled(); expect(d.saveActual).not.toHaveBeenCalled();
    expect(d.storage.setItem).not.toHaveBeenCalled(); expect(d.confirm).not.toHaveBeenCalled();
  });
  it("真实字段预检也指出姓名；观察和真实接口异常不泄漏raw SQL", async () => {
    const bad = row({ name: "真实成员乙", observation: emptyInlineObservation(), actualChanged: true, actual: { ...actual, ratio: "" } });
    const d = deps();
    await expect(saveOrdinaryInlineTag(saveInput([row(), bad]), d)).rejects.toThrow("真实成员乙：真实比例未填写");
    expect(d.saveObservation).not.toHaveBeenCalled(); expect(d.saveActual).not.toHaveBeenCalled();
    for (const kind of ["observation", "actual"] as const) {
      const live = deps();
      live[kind === "observation" ? "saveObservation" : "saveActual"] = vi.fn().mockRejectedValue(new Error("rawerrorSQL SELECT secret FROM users"));
      const r = kind === "observation" ? row({ name: "修玉霞" }) : { ...bad, actual };
      await expect(saveOrdinaryInlineTag(saveInput([r]), live)).rejects.toThrow(kind === "observation" ? "修玉霞：观察保存失败" : "真实成员乙：真实保存失败");
      try { await saveOrdinaryInlineTag(saveInput([r]), live); } catch (error) { expect((error as Error).message).not.toMatch(/rawerrorSQL|SELECT|secret/); }
    }
  });
  it("多成员真实减配先于增配，全部观察仍先于真实", async () => {
    const d = deps(), order: string[] = [];
    d.saveObservation = vi.fn(async input => { order.push(`observe:${input.targetUserId}`); });
    d.saveActual = vi.fn(async input => { order.push(`actual:${input.targetUserId}`); });
    await saveOrdinaryInlineTag(saveInput([
      row({ userId: 102, observation: emptyInlineObservation(), actualChanged: true, previousActualRatio: 10 }),
      row(),
      row({ userId: 103, observation: emptyInlineObservation(), actualChanged: true, previousActualRatio: 30 }),
    ]), d);
    expect(order).toEqual(["observe:101", "actual:103", "actual:102"]);
  });
});

describe("纯UI和页面接线", () => {
  it("姓名头像观察首行、下方28px三列参考/日期与比例加减，带详情图标且不依赖弹窗", () => {
    const html = renderToStaticMarkup(createElement(OrdinaryTagInlineMemberFields, {
      ledgerId: 37, categoryId: 201, member: { userId: 101, username: "member", nickname: "成员甲" }, observation, actual,
      actualStartDate: "2026-10-01", visible: true, saving: false, accentColor: "#D32F2F",
      onConfigRead: vi.fn(), onToggle: vi.fn(), onObservationEdit: vi.fn(), onActualEdit: vi.fn(), onDetails: vi.fn(),
    }));
    for (const text of ["成员甲", "data-avatar", "观察", "h-7", "rounded-[3px]", "reference-dates", "allocation-ratio", "减少观察比例", "增加观察比例", "观察参考初始金额", "观察开始日期", "观察暂停日期", "查看详细设置", "#7C3AED", "#D9E8EE"]) expect(html).toContain(text);
    expect(html).not.toContain("真实分配金额");
  });
  it("真实模式显示三联动，页面原rows.map直接挂载inline组件，草稿排序不变", () => {
    const source = readFileSync(new URL("../pages/LedgerAAInitialBalance.tsx", import.meta.url), "utf8");
    expect(source).toContain("<OrdinaryTagInlineMemberRow key={ordinaryInlineScope");
    expect(source).toContain("actualStartDate={editState[member.userId]");
    expect(source).toContain("return b.savedRatio - a.savedRatio");
    expect(source).toContain("ratio: observation.enabled ? 0");
    expect(source).toContain("data-ordinary-inline-tag-save");
    expect(source).toContain("saveActual: input => ordinaryActualMutation.mutateAsync(input)");
    expect(source).toContain("if (isLocalHotPreview)");
    const helper = readFileSync(new URL("./ordinaryTagInlineAllocation.ts", import.meta.url), "utf8");
    expect(helper).not.toContain("handleSaveMember");
    expect(helper).not.toMatch(/\bfetch\s*\(/);
  });
});
