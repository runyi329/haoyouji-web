import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// 只读生产源码，不导入页面/应用/DB，不调用接口或资金 mutation。
// 执行的算法、状态 updater 与 JSX 均来自真实 AST；deps 仅提供内存输入和无副作用渲染器。
const page = ts.createSourceFile("T0Journal.tsx", readFileSync(new URL("../client/src/pages/T0Journal.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function nodes<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  const visit = (node: ts.Node) => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return found;
}
function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Missing production AST node: ${name}`);
  return value;
}
const declarations = nodes(page, ts.isVariableDeclaration);
function initializer(name: string) {
  return required(required(declarations.find(node => node.name.getText(page) === name), name).initializer, `${name} initializer`);
}
function evaluate<T = any>(node: ts.Node, deps: Record<string, any> = {}): T {
  const output = ts.transpileModule(`const isolated = (${node.getText(page)});`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  return new Function(...Object.keys(deps), "useMemo", `${output}\nreturn isolated;`)(...Object.values(deps), (factory: () => unknown) => factory());
}
function productionFunction(name: string, deps: Record<string, any> = {}) {
  const declaration = required(nodes(page, ts.isFunctionDeclaration).find(node => node.name?.text === name), name);
  const output = ts.transpileModule(declaration.getText(page), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(deps), `${output}\nreturn ${name};`)(...Object.values(deps));
}
const tokenDeps = { T0_REFERRAL_DESCENDANTS_TOKEN_PREFIX: evaluate(initializer("T0_REFERRAL_DESCENDANTS_TOKEN_PREFIX")) };
const getT0ReferralDescendantsRootUserId = productionFunction("getT0ReferralDescendantsRootUserId", tokenDeps);
const resolveT0RelatedUserFilter = productionFunction("resolveT0RelatedUserFilter", { getT0ReferralDescendantsRootUserId });
const isT0RelatedUserSelectionEquivalentToAll = productionFunction("isT0RelatedUserSelectionEquivalentToAll");
const hasSameT0StringArrayValues = productionFunction("hasSameT0StringArrayValues");
const effects = nodes(page, ts.isCallExpression).filter(node => node.expression.getText(page) === "useEffect");
const initializationEffect = required(effects.find(node => node.arguments[0]?.getText(page).includes("const journal = activeJournalData as any;")), "journal initialization effect");
const modeBranch = required(nodes(initializationEffect.arguments[0], ts.isIfStatement).find(node => node.expression.getText(page) === 'journal.viewerMode === "admin"'), "initialization mode branch");
function updater(root: ts.Node, setter: string) {
  const call = required(nodes(root, ts.isCallExpression).find(node => node.expression.getText(page) === setter), setter);
  const callback = required(call.arguments[0], `${setter} callback`);
  if (!ts.isArrowFunction(callback)) throw new Error(`Expected production state updater: ${setter}`);
  return callback;
}
const adminTopUpdater = updater(modeBranch.thenStatement, "setRelatedUserFilterIds");
const memberTopUpdater = updater(required(modeBranch.elseStatement, "member initialization branch"), "setRelatedUserFilterIds");
const historyEffect = required(effects.find(node => node.getText(page).includes("setHistoryAccountFilterIds") && node.getText(page).includes("adminFilterMemberDirectoryLoaded")), "history filter cleanup effect");
const historyUpdater = updater(historyEffect.arguments[0], "setHistoryRelatedUserFilterIds");

type Member = { id: number; name: string; username?: string; avatar?: string };
type Recent = { id: string; name: string; username?: string; avatar?: string };
type Trade = { relatedUserId?: string; relatedUserName?: string; relatedUsername?: string; relatedUserAvatar?: string; relatedUserHidden?: boolean };
type Identity = { name: string; username: string; avatar: string };
const loggedInAdmin = { id: 28, name: "登录管理员", username: "admin", avatar: "admin-avatar" };
function identity(patch: Record<string, any> = {}): Identity {
  return evaluate(initializer("payoutTargetUserIdentity"), {
    isMemberView: true, me: loggedInAdmin, memberRelatedUserName: "目标成员", payoutLogs: [],
    payoutTargetRelatedUserId: 101, previewMembers: [], recentRelatedUsers: [], trades: [], ...patch,
  });
}
function filterHarness(input: {
  members?: Member[]; recent?: Recent[]; trades?: Trade[]; state?: "loading" | "error" | "success";
  isMemberView?: boolean; viewerId?: number; rootId?: string;
} = {}) {
  const state = input.state ?? "success";
  const t0PreviewMembersQuery = { data: input.members, isSuccess: state === "success", isLoading: state === "loading", isError: state === "error" };
  const previewMembers: Member[] = evaluate(initializer("previewMembers"), { t0PreviewMembersQuery });
  const recentRelatedUsers: Recent[] = evaluate(initializer("nextRecentRelatedUsers"), { journal: { recentUsers: input.recent ?? [] } });
  const adminFilterMemberIds = evaluate<Set<string>>(initializer("adminFilterMemberIds"), { previewMembers });
  const adminFilterMemberDirectoryLoaded = evaluate<boolean>(initializer("adminFilterMemberDirectoryLoaded"), { t0PreviewMembersQuery });
  const trades = input.trades ?? [];
  const isMemberView = input.isMemberView ?? false;
  const base = {
    isMemberView, trades, me: loggedInAdmin, memberRelatedUserName: "授权本人", viewerProfitShareBeneficiaryUserId: input.viewerId ?? 101,
    getTradeRelatedUserName: evaluate(initializer("getTradeRelatedUserName")),
    previewMembers, recentRelatedUsers, adminFilterMemberIds, adminFilterMemberDirectoryLoaded,
    referralDataLoaded: true, referralDescendantsByRootUserId: new Map<string, string[]>(),
    getT0ReferralDescendantsRootUserId, hasSameT0StringArrayValues,
  };
  const memberSourceUserFilterOptions = evaluate(initializer("memberSourceUserFilterOptions"), base);
  const adminRelatedUserFilterMembers: Recent[] = evaluate(initializer("adminRelatedUserFilterMembers"), base);
  const currentReferralRootUserId = input.rootId ?? "";
  const deps = {
    ...base, memberSourceUserFilterOptions, adminRelatedUserFilterMembers, currentReferralRootUserId,
    currentReferralRootUser: recentRelatedUsers.find(user => user.id === currentReferralRootUserId),
    currentReferralDescendants: undefined, shouldKeepCurrentReferralLoadingOption: false, currentReferralToken: "",
    hasUnlinkedTrades: trades.some(trade => !trade.relatedUserId || trade.relatedUserHidden),
    toRelatedUserFilterOption: evaluate(initializer("toRelatedUserFilterOption")),
  };
  const relatedUserFilterOptions: Array<{ id: string; label: string; summaryLabel?: string }> = evaluate(initializer("relatedUserFilterOptions"), deps);
  const topSelectableRelatedUserIds: string[] = evaluate(initializer("topSelectableRelatedUserIds"), deps);
  function equivalentToAll(ids: string[], history = false) {
    const resolved = resolveT0RelatedUserFilter(ids, base.referralDescendantsByRootUserId, base.referralDataLoaded);
    return evaluate<boolean>(initializer(history ? "historyRelatedUserSelectionIsAll" : "topRelatedUserSelectionIsAll"), {
      ...deps, topSelectableRelatedUserIds, isT0RelatedUserSelectionEquivalentToAll,
      relatedUserFilterIds: ids, topRelatedUserFilter: resolved, historyRelatedUserFilterIds: ids, historyRelatedUserFilter: resolved,
    });
  }
  return {
    previewMembers, recentRelatedUsers, adminRelatedUserFilterMembers, relatedUserFilterOptions, topSelectableRelatedUserIds,
    adminFilterMemberDirectoryLoaded, equivalentToAll,
    top(current: string[], persisted?: string[]) {
      return evaluate<(ids: string[]) => string[]>(isMemberView ? memberTopUpdater : adminTopUpdater, {
        ...deps, nextRecentRelatedUsers: recentRelatedUsers,
        memberSourceUserIds: evaluate(initializer("memberSourceUserIds"), { nextTrades: trades }),
        shouldRestoreTopFilters: persisted !== undefined, restoredMemberSourceUserFilterV2: true,
        persistedTopFilters: persisted === undefined ? null : { relatedUserIds: persisted },
      })(current);
    },
    history(current: string[]) {
      return evaluate<(ids: string[]) => string[]>(historyUpdater, deps)(current);
    },
    summary(ids: string[]) {
      const summaryDeps = { ...deps, canManage: !isMemberView, relatedUserFilterIds: ids, relatedUserFilterOptions, topRelatedUserSelectionIsAll: equivalentToAll(ids) };
      const adminFilterSelectedMemberId = evaluate(initializer("adminFilterSelectedMemberId"), summaryDeps);
      const adminFilterSelectedMember = evaluate(initializer("adminFilterSelectedMember"), { ...summaryDeps, adminFilterSelectedMemberId });
      return evaluate<string>(initializer("adminFilterSummary"), { ...summaryDeps, adminFilterSelectedMemberId, adminFilterSelectedMember });
    },
  };
}
const completeMembers: Member[] = Array.from({ length: 31 }, (_, index) => ({ id: 101 + index, name: `完整成员${index + 1}`, username: `member${index + 1}` }));
const recentThirty: Recent[] = completeMembers.slice(0, 30).map(member => ({ ...member, id: String(member.id) }));
const completeIds = completeMembers.map(member => String(member.id));

describe("T0 报告头像：执行真实目标身份表达式", () => {
  it("连续换三位目标只读取同 ID 成员资料，不串上一位或管理员头像", () => {
    const previewMembers = [
      { id: 101, name: "甲", username: "a", avatar: "avatar-a" },
      { id: 102, name: "乙", username: "b", avatar: "avatar-b" },
      { id: 103, name: "丙", username: "c" },
    ];
    for (const [id, name, username, avatar] of [[101, "甲", "a", "avatar-a"], [102, "乙", "b", "avatar-b"], [103, "丙", "c", ""], [101, "甲", "a", "avatar-a"]]) {
      expect(identity({ payoutTargetRelatedUserId: id, previewMembers })).toEqual({ name, username, avatar });
    }
  });

  it("完整目录头像优先于同 ID 订单与本人 me 兜底", () => {
    expect(identity({
      me: { ...loggedInAdmin, id: 101 }, previewMembers: [{ id: 101, name: "目录名", username: "directory", avatar: "directory-avatar" }],
      trades: [{ relatedUserId: "999", relatedUserAvatar: "wrong" }, { relatedUserId: "101", relatedUsername: "order", relatedUserAvatar: "order-avatar" }],
    })).toEqual({ name: "目录名", username: "directory", avatar: "directory-avatar" });
  });

  it("目录用户无头像时仅以同 ID 订单头像兜底，忽略其它目标订单", () => {
    expect(identity({
      previewMembers: [{ id: 101, name: "成员" }],
      trades: [{ relatedUserId: "102", relatedUserAvatar: "other-avatar" }, { relatedUserId: "101", relatedUsername: "order-user", relatedUserAvatar: "own-order-avatar" }],
    })).toEqual({ name: "成员", username: "order-user", avatar: "own-order-avatar" });
  });

  it("只有订单资料也可得到目标头像，而非管理员登录头像", () => {
    const result = identity({ trades: [{ relatedUserId: "101", relatedUsername: "source", relatedUserAvatar: "only-order-avatar" }] });
    expect(result).toMatchObject({ username: "source", avatar: "only-order-avatar" });
  });

  it("只有登录本人 ID 匹配才可使用 me，数字与字符串 ID 均匹配并去空白", () => {
    for (const id of [101, "101"]) {
      expect(identity({ me: { id, username: " self-user ", avatar: " self-avatar " } })).toMatchObject({ username: "self-user", avatar: "self-avatar" });
    }
    expect(identity({ me: { ...loggedInAdmin, id: 102 } })).toMatchObject({ username: "", avatar: "" });
  });

  it("成员与管理员目标无头像均保持空默认，不借最近用户或其它用户头像", () => {
    for (const isMemberView of [true, false]) {
      expect(identity({
        isMemberView, recentRelatedUsers: [{ id: "101", name: "无头像用户", avatar: "stale-recent-avatar" }],
        previewMembers: [{ id: 102, name: "其它用户", avatar: "other-avatar" }],
        trades: [{ relatedUserId: "102", relatedUserAvatar: "other-order-avatar" }],
      }).avatar).toBe("");
    }
  });

  it("全部/无有效目标返回空默认身份，不显示任何登录头像", () => {
    for (const payoutTargetRelatedUserId of [0, -1]) expect(identity({ payoutTargetRelatedUserId })).toEqual({ name: "当前用户", username: "", avatar: "" });
  });

  it("管理员模式名字来自同 ID 最近用户，头像仍来自同 ID 完整目录", () => {
    expect(identity({
      isMemberView: false, recentRelatedUsers: [{ id: "102", name: "错误用户" }, { id: "101", name: "目标昵称", username: "target" }],
      previewMembers: [{ id: 101, name: "成员目录", avatar: "target-avatar" }],
    })).toEqual({ name: "目标昵称", username: "target", avatar: "target-avatar" });
  });

  it("管理员单选/URL、成员和用户预览使用真实目标 ID 表达式", () => {
    const base = { isUserPreview: false, previewUserId: 102, isMemberView: false, activeJournalData: { viewerRelatedUserId: 103 }, canManage: true, payoutUserIdFromUrl: 0, relatedUserFilterIds: ["101"] };
    for (const [patch, expected] of [
      [{}, 101], [{ relatedUserFilterIds: [] }, 0], [{ relatedUserFilterIds: ["101", "102"] }, 0],
      [{ payoutUserIdFromUrl: 104 }, 104], [{ isMemberView: true }, 103], [{ isUserPreview: true, isMemberView: true }, 102],
    ] as const) {
      expect(evaluate(initializer("payoutTargetRelatedUserId"), { ...base, ...patch })).toBe(expected);
    }
  });

  it("总收益头像 JSX 与结算组件 props 执行后复用同一身份；无头像渲染文字默认", () => {
    const incomeAvatar = required(nodes(page, ts.isConditionalExpression).find(node => node.condition.getText(page) === "payoutTargetUserIdentity.avatar" && ts.isJsxSelfClosingElement(node.whenTrue) && node.whenTrue.tagName.getText(page) === "img"), "total income avatar JSX");
    const settlementCard = required(nodes(page, ts.isJsxSelfClosingElement).find(node => node.tagName.getText(page) === "T0MemberWeeklySettlementCurrentCard"), "member settlement card JSX");
    const React = { createElement: (type: unknown, props: any, ...children: unknown[]) => ({ type, props, children }) };
    for (const avatar of ["target-avatar", ""]) {
      const payoutTargetUserIdentity = identity({ previewMembers: [{ id: 101, name: "目标昵称", avatar }] });
      const income = evaluate(incomeAvatar, { React, payoutTargetUserIdentity });
      const settlement = evaluate(settlementCard, {
        React, payoutTargetUserIdentity, T0MemberWeeklySettlementCurrentCard: "SettlementCard",
        selectedMemberSettlementReport: null, displayedWeeklySettlementCenter: { current: {} },
        selectedMemberSettlementIsRealtime: true, currentSettlementCountdown: "countdown",
      });
      expect(settlement.props).toMatchObject({ displayName: "目标昵称", avatar });
      if (avatar) expect(income).toMatchObject({ type: "img", props: { src: settlement.props.avatar, alt: `${settlement.props.displayName}头像` } });
      else expect(income).toMatchObject({ type: "span", children: ["目"] });
      expect(JSON.stringify([income, settlement])).not.toContain(loggedInAdmin.avatar);
    }
  });
});

describe("T0 管理员完整目录筛选：执行真实合并与状态 updater", () => {
  it("31 位成员完整保留，最近 30 人之外历史成员可选且顶部/历史均不清除", () => {
    const h = filterHarness({ members: completeMembers, recent: recentThirty });
    expect(h.adminRelatedUserFilterMembers).toHaveLength(31);
    expect(h.topSelectableRelatedUserIds).toEqual(completeIds);
    expect(h.relatedUserFilterOptions.find(option => option.id === "131")).toMatchObject({ label: "完整成员31 · @member31", summaryLabel: "完整成员31" });
    expect(h.top(["131"])).toEqual(["131"]);
    expect(h.history(["131"])).toEqual(["131"]);
  });

  it("纯分佣成员无订单且不在 recent 仍来自完整目录并保持选择", () => {
    const h = filterHarness({ members: [{ id: 701, name: "纯分佣成员", username: "commission" }], trades: [], recent: [] });
    expect(h.relatedUserFilterOptions).toEqual([{ id: "701", label: "纯分佣成员 · @commission", summaryLabel: "纯分佣成员", kind: undefined }]);
    expect(h.top(["701"])).toEqual(["701"]);
    expect(h.history(["701"])).toEqual(["701"]);
    expect(h.summary(["701"])).toBe("纯分佣成员");
  });

  it("recent 字符串 ID 与目录数字 ID 合并去重，保留最近资料且根用户只出现一次", () => {
    const h = filterHarness({
      members: [{ id: 101, name: "目录旧名" }, { id: 102, name: "目录补充" }, { id: 102, name: "目录重复" }],
      recent: [{ id: "101", name: "最近昵称", username: "recent", avatar: "recent-avatar" }], rootId: "101",
    });
    expect(h.adminRelatedUserFilterMembers.map(user => user.id)).toEqual(["101", "102"]);
    expect(h.adminRelatedUserFilterMembers[0]).toMatchObject({ name: "最近昵称", avatar: "recent-avatar" });
    expect(h.relatedUserFilterOptions.map(option => option.id)).toEqual(["101", "102"]);
  });

  it("目录加载前顶部与历史保留合法数字 ID，不因空目录扩大到全部", () => {
    const h = filterHarness({ state: "loading" });
    expect(h.adminFilterMemberDirectoryLoaded).toBe(false);
    const selection = ["131", "999", "bogus", "0", "-1", "1.5"];
    expect(h.top(selection)).toEqual(["131", "999"]);
    expect(h.history(selection)).toEqual(["131", "999"]);
    expect(h.summary(["131"])).toBe("用户#131");
  });

  it("目录失败仍保留未返回目录的历史数字 ID，不能误认为成功的空名单", () => {
    const h = filterHarness({ state: "error" });
    expect(h.adminFilterMemberDirectoryLoaded).toBe(false);
    expect(h.top(["701", "999"])).toEqual(["701", "999"]);
    expect(h.history(["701", "999"])).toEqual(["701", "999"]);
  });

  it("目录成功后剔除无效 ID，目录成员与仅 recent 成员均有效", () => {
    const h = filterHarness({ members: [{ id: 131, name: "历史成员" }], recent: [{ id: "101", name: "最近用户" }] });
    expect(h.adminFilterMemberDirectoryLoaded).toBe(true);
    expect(h.top(["131", "101", "999", "bogus"])).toEqual(["131", "101"]);
    expect(h.history(["131", "101", "999", "bogus"])).toEqual(["131", "101"]);
    const emptySuccess = filterHarness({ members: [] });
    expect(emptySuccess.top(["999"])).toEqual([]);
    expect(emptySuccess.history(["999"])).toEqual([]);
  });

  it("首次初始化从 persisted 恢复历史/分佣 ID，加载/失败保留且成功后仅清无效项", () => {
    for (const state of ["loading", "error", "success"] as const) {
      const h = filterHarness({ state, members: state === "success" ? completeMembers : undefined, recent: recentThirty });
      expect(h.top(["101"], ["131", "999"])).toEqual(state === "success" ? ["131"] : ["131", "999"]);
    }
  });

  it("目录从加载到失败再成功时保持同一选中用户，并保留无变化顶部状态引用", () => {
    let top = ["131", "999"];
    let history = ["131", "999"];
    for (const state of ["loading", "error", "success"] as const) {
      const h = filterHarness({ state, members: state === "success" ? completeMembers : undefined });
      const previousTop = top;
      top = h.top(top);
      history = h.history(history);
      expect(top).toEqual(state === "success" ? ["131"] : ["131", "999"]);
      expect(history).toEqual(top);
      if (state !== "success") expect(top).toBe(previousTop);
    }
    expect(filterHarness({ members: completeMembers }).top(top)).toBe(top);
  });

  it("管理员单选目录成员优先昵称，即使仅一人使 equivalent-to-all 为真", () => {
    const h = filterHarness({ members: [{ id: 101, name: "目录新昵称" }], recent: [{ id: "101", name: "最近旧昵称" }] });
    expect(h.equivalentToAll(["101"])).toBe(true);
    expect(h.summary(["101"])).toBe("目录新昵称");
    expect(h.summary([])).toBe("全部");
  });

  it("顶部/历史全部判断使用完整 31 人目录，最近 30 人不冒充全部", () => {
    const h = filterHarness({ members: completeMembers, recent: recentThirty });
    for (const history of [false, true]) {
      expect(h.equivalentToAll(completeIds.slice(0, 30), history)).toBe(false);
      expect(h.equivalentToAll(completeIds, history)).toBe(true);
      expect(h.equivalentToAll([], history)).toBe(false);
    }
    expect(h.summary(completeIds)).toBe("全部");
  });

  it("成员选项只含授权订单来源且本人优先，隐藏/无关联/目录陌生用户不进入", () => {
    const h = filterHarness({
      isMemberView: true, members: [{ id: 999, name: "目录陌生用户" }], recent: [{ id: "999", name: "最近陌生用户" }],
      trades: [
        { relatedUserId: "201", relatedUserName: "已分佣来源", relatedUsername: "source" },
        { relatedUserId: "101", relatedUserName: "订单旧名" },
        { relatedUserId: "201", relatedUserName: "重复来源" },
        { relatedUserId: "301", relatedUserName: "隐藏来源", relatedUserHidden: true }, {},
      ],
    });
    expect(h.relatedUserFilterOptions.map(option => option.id)).toEqual(["101", "201"]);
    expect(h.relatedUserFilterOptions[0]).toMatchObject({ label: "授权本人（本人）", summaryLabel: "授权本人（本人）" });
    expect(h.relatedUserFilterOptions[1]).toMatchObject({ label: "已分佣来源 · @source", summaryLabel: "已分佣来源" });
    expect(h.topSelectableRelatedUserIds).toEqual(["101", "201"]);
    expect(h.equivalentToAll(["101", "201"])).toBe(true);
    expect(h.equivalentToAll(["101"])).toBe(false);
  });

  it("成员顶部与历史在加载/失败/成功均剔除未授权目录 ID，不套管理员保留逻辑", () => {
    for (const state of ["loading", "error", "success"] as const) {
      const h = filterHarness({
        state, isMemberView: true, members: [{ id: 999, name: "未授权目录用户" }], recent: [{ id: "999", name: "未授权最近用户" }],
        trades: [{ relatedUserId: "101" }, { relatedUserId: "201" }, { relatedUserId: "301", relatedUserHidden: true }],
      });
      const ids = ["101", "201", "301", "999", "unlinked"];
      expect(h.top(ids)).toEqual(["101", "201"]);
      expect(h.history(ids)).toEqual(["101", "201"]);
      expect(h.top([], ids)).toEqual(["101", "201"]);
    }
  });

  it("真实 effect/memo 依赖包含目录与目标更新信号，成功/换目标会重新计算", () => {
    for (const effect of [initializationEffect, historyEffect]) {
      const dependencyArray = required(effect.arguments[1], "effect dependencies");
      if (!ts.isArrayLiteralExpression(dependencyArray)) throw new Error("Expected dependency array");
      expect(dependencyArray.elements.map(node => node.getText(page))).toEqual(expect.arrayContaining(["adminFilterMemberDirectoryLoaded", "adminFilterMemberIds"]));
    }
    const memo = initializer("payoutTargetUserIdentity");
    if (!ts.isCallExpression(memo) || !ts.isArrayLiteralExpression(memo.arguments[1])) throw new Error("Expected identity memo dependencies");
    expect(memo.arguments[1].elements.map(node => node.getText(page))).toEqual(expect.arrayContaining(["payoutTargetRelatedUserId", "previewMembers", "trades", "me"]));
  });
});
