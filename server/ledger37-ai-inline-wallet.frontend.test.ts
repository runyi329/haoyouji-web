import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { Ledger37PresentationContext } from "../shared/ledger37-ai-presentation";

const source = readFileSync(new URL("../client/src/components/Ledger37AiIdentityHeader.tsx", import.meta.url), "utf8");
const aiNavigationSource = readFileSync(new URL("../client/src/components/AIStockNavigation.tsx", import.meta.url), "utf8");
const logoSource = readFileSync(new URL("../client/src/components/AnimatedWalletLogo.tsx", import.meta.url), "utf8");
const mibanSource = readFileSync(new URL("../client/src/pages/miban/useMibanWalletValue.ts", import.meta.url), "utf8");
const mibanCalculationSource = readFileSync(new URL("../shared/miban-wallet-value.ts", import.meta.url), "utf8");

// Execute the actual pure renderer and wrapper, with query hooks and animation replaced
// locally. No auth provider, DB, network, browser or Lottie fetch is involved.
function actual(scope: Record<string, any> = {}) {
  const file = ts.createSourceFile("header.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const code = file.statements.filter(node => !ts.isImportDeclaration(node))
    .map(node => node.getText(file).replace(/^export\s+(default\s+)?/, "")).join("\n");
  const js = ts.transpileModule(code, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React,
  } }).outputText;
  const bindings = {
    React, useState: React.useState, ArrowLeft: "span", WalletIcon: "span", ChevronRight: "span",
    // SSR-compatible local wrappers intentionally expose menu children to assertions.
    Popover: ({ children }: any) => React.createElement(React.Fragment, null, children),
    PopoverTrigger: ({ children }: any) => React.createElement(React.Fragment, null, children),
    PopoverContent: ({ children }: any) => React.createElement("div", { "data-test-avatar-menu": true }, children),
    UserAvatar: (props: any) => React.createElement("img", { src: props.avatar || undefined, alt: props.nickname || props.username || "用户" }),
    AnimatedWalletLogo: () => React.createElement("span", { "data-test-wallet-animation": true }),
    ...scope,
  };
  return new Function(...Object.keys(bindings), `${js}; return { resolveLedger37AiViewer, ledger37AiWalletHref, Ledger37AiIdentityHeaderRenderer, Ledger37AiIdentityHeader };`)(...Object.values(bindings));
}
function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
}
const context = (patch: Partial<Ledger37PresentationContext> = {}): Ledger37PresentationContext => ({
  ledgerId: 37, viewerUserId: 901, canManage: false, aiEnabled: true, isViewingAs: false,
  viewer: { userId: 901, username: "user901", nickname: "客户甲", avatar: "https://example.test/u901.png" }, ...patch,
});
const wallet = (availableCny: number | null = 1234.56, viewerUserId = 901) => ({ viewerUserId, availableCny });
function renderer(patch: Record<string, any> = {}) {
  return actual().Ledger37AiIdentityHeaderRenderer({ context: context(), viewerUserId: 901, wallet: wallet(), onBack: vi.fn(), ...patch });
}
function html(patch: Record<string, any> = {}) { return renderToStaticMarkup(renderer(patch)); }
function fixture(contextPatch: Record<string, any> = {}, walletPatch: Record<string, any> = {}) {
  const contextResponse: any = { data: context(), isFetchedAfterMount: true, isLoading: false, isFetching: false, error: null, ...contextPatch };
  const walletResponse: any = { data: wallet(), isFetchedAfterMount: true, isLoading: false, isFetching: false, error: null, ...walletPatch };
  const contextQuery = vi.fn((_input: any, _options: any) => contextResponse);
  const walletQuery = vi.fn((_input: any, _options: any) => walletResponse);
  const api = actual({ trpc: { ledger: {
    getLedger37PresentationContext: { useQuery: contextQuery },
    getMyLedger37AiWalletValue: { useQuery: walletQuery },
  } } });
  const render = (viewerUserId = 901) => api.Ledger37AiIdentityHeader({ viewerUserId, onBack: vi.fn() });
  const markup = (viewerUserId = 901) => renderToStaticMarkup(render(viewerUserId));
  return { contextResponse, walletResponse, contextQuery, walletQuery, render, markup };
}

function expectUnknown(markup: string) {
  expect(markup).not.toMatch(/¥|1234\.56|1,234\.56/);
  expect(markup).toMatch(/加载|读取|更新|确认|暂不可用/);
}

describe("37号AI姓名旁可用余额：真实组件离线回归", () => {
  it("姓名和人民币数值采用钱包 availableCny，不把可用余额标成总资产", () => {
    const markup = html();
    expect(markup).toContain("客户甲");
    expect(markup).toContain("¥1,234.56");
    expect(markup).not.toMatch(/总资产|总收益|累计收益|USDT/);
  });
  it.each([[0, "¥0.00"], [-1234.56, "¥-1,234.56"], [12.345, "¥12.35"], [1000000.2, "¥1,000,000.20"]])(
    "真实余额 %s 不取绝对值、不把合法零隐藏，固定两位小数", (value, formatted) => {
      expect(html({ wallet: wallet(value as number) })).toContain(formatted as string);
    },
  );
  it.each([null, undefined, NaN, Infinity, -Infinity, "9012", {}, false])(
    "未知/非有限余额 %j 不伪造 ¥0 或收益", value => {
      expectUnknown(html({ wallet: { viewerUserId: 901, availableCny: value } }));
    },
  );
  it("钱包尚无数据、初次加载、首次失败都不默认零", () => {
    expectUnknown(html({ wallet: undefined }));
    expectUnknown(html({ wallet: undefined, walletLoading: true }));
    expectUnknown(html({ wallet: undefined, walletError: true }));
  });
  it("钱包身份与当前用户不一致时不泄露数字", () => {
    expectUnknown(html({ wallet: wallet(987654.32, 902) }));
    expect(html({ wallet: wallet(987654.32, 902) })).not.toMatch(/987,654|987654/);
  });
  it.each([
    context({ viewerUserId: 902 }),
    context({ viewer: { userId: 902, username: "ADMIN_SECRET", nickname: "ADMIN_SECRET", avatar: "https://example.test/admin.png" } }),
    context({ viewer: null }),
    context({ isViewingAs: undefined }),
    undefined,
  ])("身份解析或代看状态不确定时不显示旧余额，也不打开钱包：%j", data => {
    const tree = renderer({ context: data });
    expectUnknown(renderToStaticMarkup(tree));
    expect(nodes(tree).some(node => node.type === "a")).toBe(false);
    expect(nodes(tree).some(node => node.type === "button" && node.props.disabled && node.props["aria-label"] === "钱包身份待确认")).toBe(true);
    expect(renderToStaticMarkup(tree)).not.toContain("ADMIN_SECRET");
  });
  it("context/viewer 夹带的收益、本金或 availableCny 都不成为余额来源", () => {
    const data = context();
    Object.assign(data, { availableCny: 876543.21, totalAssets: 111222333, totalPnl: 444555666, principal: 777888999 });
    Object.assign(data.viewer!, { availableCny: 876543.21, balance: 111222333, totalPnl: 444555666, principal: 777888999, recordedMargins: 888777666 });
    const markup = html({ context: data, wallet: wallet(12.34) });
    expect(markup).toContain("¥12.34");
    expect(markup).not.toMatch(/876,543|876543|111222333|444555666|777888999|888777666/);
    expectUnknown(html({ context: data, wallet: undefined }));
    expect(source).not.toMatch(/useAuth|Math\.abs|totalPnl|receivedDividends|recordedMargins|\.useMutation\(|\.mutate\(/);
  });
  it("后台错误仍保留同身份最近成功数值，并用 title 说明非最新值", () => {
    const tree = renderer({ walletError: true });
    expect(renderToStaticMarkup(tree)).toContain("¥1,234.56");
    expect(nodes(tree).some(node => typeof node.props?.title === "string" && /最近成功/.test(node.props.title))).toBe(true);
    expectUnknown(html({ wallet: wallet(null), walletError: true }));
  });

  it("wrapper 显式查询37号同一目标，可用余额采用30秒刷新和禁用重试策略", () => {
    const f = fixture();
    expect(f.markup()).toContain("¥1,234.56");
    expect(f.contextQuery).toHaveBeenCalledWith({ ledgerId: 37, viewAsUserId: 901 }, expect.objectContaining({
      placeholderData: undefined, staleTime: 0, refetchOnMount: "always", retry: false,
    }));
    expect(f.walletQuery).toHaveBeenCalledWith({ ledgerId: 37, viewAsUserId: 901 }, expect.objectContaining({
      enabled: true, placeholderData: undefined, staleTime: 30_000, refetchOnMount: "always",
      refetchInterval: 30_000, refetchOnWindowFocus: true, retry: false,
    }));
  });
  it("首次挂载 presentation 旧缓存未确认时禁用余额 query 且不显示旧值", () => {
    const f = fixture({ isFetchedAfterMount: false });
    expectUnknown(f.markup());
    expect(f.render().props.context).toBeUndefined();
    expect(f.walletQuery.mock.calls.at(-1)?.[1].enabled).toBe(false);
    f.contextResponse.isFetchedAfterMount = true;
    expect(f.markup()).toContain("¥1,234.56");
    expect(f.walletQuery.mock.calls.at(-1)?.[1].enabled).toBe(true);
  });
  it("context 成功也不能显示钱包首次挂载尚未确认的缓存数字", () => {
    const f = fixture({}, { isFetchedAfterMount: false });
    expectUnknown(f.markup());
    expect(f.render().props.wallet).toBeUndefined();
    expect(f.walletQuery.mock.calls.at(-1)?.[1].enabled).toBe(true);
    f.walletResponse.isFetchedAfterMount = true;
    expect(f.markup()).toContain("¥1,234.56");
  });
  it("首次钱包缓存读取失败且未 freshly confirmed，不因存在旧 data 显示旧数值", () => {
    const f = fixture({}, { isFetchedAfterMount: false, error: new Error("read failed") });
    expectUnknown(f.markup());
    expect(f.markup()).not.toContain("¥0.00");
  });
  it("query 后台刷新失败保留同scope已经成功确认的有限数值", () => {
    const f = fixture();
    expect(f.markup()).toContain("¥1,234.56");
    f.walletResponse.isFetching = true;
    expect(f.markup()).toContain("¥1,234.56");
    f.walletResponse.error = new Error("background failed");
    expect(f.markup()).toContain("¥1,234.56");
    expect(f.markup()).toMatch(/最近成功/);
    f.walletResponse.data = wallet(null);
    expectUnknown(f.markup());
  });
  it("query 无 data 的失败只显示未知，不以 context 或零补数", () => {
    const f = fixture({}, { data: undefined, error: new Error("first failed") });
    expectUnknown(f.markup());
    expect(f.markup()).not.toContain("¥0.00");
  });
  it("切换用户立即隐藏旧值；context先确认也不会展示前用户迟到的钱包 response", () => {
    const f = fixture();
    expect(f.markup()).toContain("¥1,234.56");
    expectUnknown(f.markup(902));
    expect(f.walletQuery.mock.calls.at(-1)?.[1].enabled).toBe(false);
    f.contextResponse.data = context({ viewerUserId: 902, isViewingAs: true, viewer: { userId: 902, username: "user902", nickname: "客户乙", avatar: null } });
    expectUnknown(f.markup(902));
    expect(f.walletQuery.mock.calls.at(-1)?.[1].enabled).toBe(true);
    expect(f.walletQuery.mock.calls.at(-1)?.[0]).toEqual({ ledgerId: 37, viewAsUserId: 902 });
    f.walletResponse.data = wallet(22.22, 902);
    expect(f.markup(902)).toContain("¥22.22");
    expect(f.markup(902)).toContain("/wallet?fromLedger=37&amp;viewAs=902");
    f.walletResponse.data = wallet(987654.32, 901);
    expectUnknown(f.markup(902));
    expect(f.markup(902)).not.toMatch(/987,654|987654/);
  });
  it.each([
    { data: undefined }, { error: new Error("context failed") },
    { data: context({ viewerUserId: 902 }) },
    { data: context({ viewer: null }) },
    { data: context({ viewer: { userId: 902, username: "user902", nickname: "客户乙", avatar: null } }) },
    { data: context({ isViewingAs: undefined }) },
  ])("context 无资料/失败/错身份/未知代看禁用钱包读取：%j", patch => {
    const f = fixture(patch);
    expectUnknown(f.markup());
    expect(f.walletQuery.mock.calls.at(-1)?.[1].enabled).toBe(false);
  });
  it.each([0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("无效用户 %s 两个 query 均禁用", viewerUserId => {
    const f = fixture();
    expectUnknown(f.markup(viewerUserId));
    expect(f.contextQuery.mock.calls.at(-1)?.[1].enabled).toBe(false);
    expect(f.walletQuery.mock.calls.at(-1)?.[1].enabled).toBe(false);
  });
  it.each([false, true])("本人/代看 %s 保持原钱包路由语义，不调用米瓣身份清除", isViewingAs => {
    const tree = renderer({ context: context({ isViewingAs }) });
    const link = nodes(tree).find(node => node.type === "a");
    expect(link.props.href).toBe(`/wallet?fromLedger=37${isViewingAs ? "&viewAs=901" : ""}`);
    expect(link.props.href).not.toMatch(/from=miban|account=CNY|targetUserId/);
    expect(source).not.toContain("clearLedgerViewAsState");
  });
  it("与米瓣及原AI复用 AnimatedWalletLogo 和 wallet_gold loop/autoplay 素材，无箭头入口", () => {
    expect(source).toMatch(/import AnimatedWalletLogo from ["']@\/components\/AnimatedWalletLogo["']/);
    expect(source).toContain("<AnimatedWalletLogo");
    expect(aiNavigationSource).toContain("<AnimatedWalletLogo");
    expect(mibanSource).toContain("calculateMibanWalletValue");
    expect(mibanCalculationSource).toContain("availableCny");
    expect(logoSource).toContain('fetch("/wallet_gold.json"');
    expect(logoSource).toMatch(/<Lottie[^>]*\bloop\s+autoplay/s);
    expect(renderToStaticMarkup(renderer())).toContain("data-test-wallet-animation");
    expect(source).not.toMatch(/ChevronRight|ArrowRight|>\s*[›»→]\s*</);
    expect(nodes(renderer()).find(node => node.type === "h1").props.children).toBe("客户甲");
  });
  it("浅蓝头部与白色卡片包含头像、浅蓝薄分隔线与姓名上/动画金额下两行，青绿数字可换行且入口44px", () => {
    const tree = renderer();
    expect(tree.props.className).toContain("bg-[#F2F6FA]");
    expect(tree.props.className).toContain("border-[#DCE7F0]");
    const all = nodes(tree);
    const card = all.find(node => (node.props?.className || "").includes("bg-white") && nodes(node).some(child => child.type === "h1"));
    expect(card).toBeTruthy();
    const avatarMenu = nodes(card).find(node => typeof node.type === "function" && node.type.name === "Ledger37AiAvatarMenu");
    expect(avatarMenu).toBeTruthy();
    expect(renderToStaticMarkup(avatarMenu)).toContain("u901.png");
    expect(nodes(card).some(node => /\bw-px\b/.test(node.props?.className || ""))).toBe(true);
    const link = all.find(node => node.type === "a");
    expect(link.props.className).toContain("min-h-[44px]");
    expect(renderToStaticMarkup(avatarMenu)).toMatch(/<button[^>]*class="[^"]*h-11 w-11/);
    expect(source).toMatch(/(?:break-words|break-all|overflow-wrap|flex-wrap)/);
    const amount = all.find(node => node.props?.["data-header-wallet-balance"] !== undefined);
    expect(amount).toBeTruthy();
    expect((amount.props.className || "") + JSON.stringify(amount.props.style || {})).toContain("#087987");
    expect(nodes(link).some(node => node.type === "h1")).toBe(true);
    expect(nodes(link).some(node => /row-start-2/.test(node.props?.className || ""))).toBe(true);
  });
});
