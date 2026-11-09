import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  emptyInlineObservation, inlineObservationFromConfig, toggleInlineObservation, stepInlineRatio, parseInlineRatioInput,
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
  it("加减一百分点保持小数、边界0和100，不接受负数/超限/非法符号", () => {
    expect(stepInlineRatio("12.5", 1)).toBe("13.5");
    expect(stepInlineRatio("12.5", -1)).toBe("11.5");
    expect(stepInlineRatio("0.25", -1)).toBe("0");
    expect(stepInlineRatio("99.75", 1)).toBe("100");
    expect(stepInlineRatio("100", 1)).toBe("100");
    expect(stepInlineRatio("0", -1)).toBe("0");
    expect(stepInlineRatio("0.1", 1)).toBe("1.1");
    expect(parseInlineRatioInput("12.50%")).toBe("12.50");
    expect(parseInlineRatioInput("100.01")).toBe("100");
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
      row({ userId: 102, observation: off, actualChanged: true, actual: { amount: "100000", ratio: "15.5", targetAmount: "15500" }, previousActualRatio: 0 }),
    ]), d);
    expect(order).toEqual(["observe:101:true", "observe:102:false", "actual:102"]);
    expect(d.saveActual).toHaveBeenCalledTimes(1);
    expect(d.saveActual).toHaveBeenCalledWith({ ledgerId: 37, targetUserId: 102, balances: { "普通标签": 100000, "普通标签__ratio": 15.5, "普通标签__targetAmount": 15500 }, migratedMarginNoteIds: [] });
    expect(d.storage.setItem).not.toHaveBeenCalled();
  });
  it("off只保存disabled参数，无自动恢复actual请求", async () => {
    const d = deps();
    await saveOrdinaryInlineTag(saveInput([row({ observation: { ...observation, enabled: false }, actual: zeroOrdinaryActual(actual), previousActualRatio: 0 })]), d);
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
    await expect(saveOrdinaryInlineTag(saveInput([r, a]), d)).rejects.toThrow("观察失败");
    expect([r, a]).toEqual(before);
    expect(d.onObservationSaved).not.toHaveBeenCalled();
    expect(d.saveActual).not.toHaveBeenCalled();
    const partial = deps();
    partial.saveActual = vi.fn().mockRejectedValue(new Error("实际失败"));
    await expect(saveOrdinaryInlineTag(saveInput([r, a]), partial)).rejects.toThrow("实际失败");
    expect(partial.onObservationSaved).toHaveBeenCalledTimes(1);
    expect(partial.onActualSaved).not.toHaveBeenCalled();
    expect([r, a]).toEqual(before);
  });
  it("存储失败不回退POST，实际超100总量拒绝；观察100不占总量", async () => {
    const d = deps(true);
    d.storage = { setItem: () => { throw new Error("会话存储不可用"); } };
    await expect(saveOrdinaryInlineTag(saveInput([row()]), d)).rejects.toThrow("会话存储不可用");
    expect(d.saveObservation).not.toHaveBeenCalled();
    expect(d.saveActual).not.toHaveBeenCalled();
    const over = row({ observation: emptyInlineObservation(), observationChanged: false, actualChanged: true, actual: { amount: "100000", ratio: "60", targetAmount: "60000" } });
    const live = deps();
    await expect(saveOrdinaryInlineTag(saveInput([over, { ...over, userId: 102 }]), live)).rejects.toThrow("不能超过 100%");
    expect(live.saveActual).not.toHaveBeenCalled();
    await expect(saveOrdinaryInlineTag(saveInput([row({ observation: { ...observation, ratio: "100" } }), over]), deps())).resolves.toBe(true);
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
