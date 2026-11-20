import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { Ledger37PresentationContext } from "../shared/ledger37-ai-presentation";

const source = readFileSync(new URL("../client/src/components/Ledger37AiIdentityHeader.tsx", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../client/src/components/Ledger37AiHome.tsx", import.meta.url), "utf8");
function actual(scope: Record<string, any> = {}) {
  const file = ts.createSourceFile("header.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const code = file.statements.filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(file).replace(/^export\s+(default\s+)?/, "")).join("\n");
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
  const bindings = {
    React, useState: React.useState, ArrowLeft: "span", WalletIcon: "span", ChevronRight: "span",
    // Render children offline rather than using Radix's closed SSR portal.
    Popover: ({ children }: any) => React.createElement(React.Fragment, null, children),
    PopoverTrigger: ({ children }: any) => React.createElement(React.Fragment, null, children),
    PopoverContent: ({ children, className }: any) => React.createElement("div", { "data-test-avatar-menu": true, className }, children),
    AnimatedWalletLogo: () => React.createElement("span", { "data-test-wallet-animation": true }),
    UserAvatar: (props: any) => React.createElement("img", { src: props.avatar || undefined, alt: props.nickname || props.username || "用户" }),
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
function queryFixture(contextQuery: (...args: any[]) => any) {
  return { ledger: {
    getLedger37PresentationContext: { useQuery: contextQuery },
    getMyLedger37AiWalletValue: { useQuery: vi.fn(() => ({ data: undefined, isFetchedAfterMount: false, isLoading: false, isFetching: false, error: null })) },
  } };
}
function renderer(data: Ledger37PresentationContext | undefined = context(), viewerUserId = 901) {
  return actual().Ledger37AiIdentityHeaderRenderer({ context: data, viewerUserId, onBack: vi.fn() });
}

describe("37号AI头像钱包头部：真实前端离线执行", () => {
  it("只显示当前有效用户头像姓名，顶部没有项目/份额标题或虚构钱包余额", () => {
    const tree = renderer(); const html = renderToStaticMarkup(tree);
    expect(html).toContain("客户甲"); expect(html).toContain("user901"); expect(html).toContain("u901.png");
    expect(html).not.toMatch(/我的\s*AI\s*项目|我的份额|我的参与|钱包余额|¥|USDT/);
    expect(nodes(tree).find(node => node.type === "h1").props.children).toBe("客户甲");
    expect(source).not.toMatch(/useAuth|getBalance|totalPnl|receivedDividends|recordedMargins/);
  });
  it("本人钱包沿用37号统一入口，不传代看或米瓣清除身份参数", () => {
    const api = actual(); expect(api.ledger37AiWalletHref(context(), 901)).toBe("/wallet?fromLedger=37");
    const link = nodes(renderer()).find(node => node.type === "a");
    expect(link.props.href).toBe("/wallet?fromLedger=37"); expect(link.props.href).not.toMatch(/viewAs|from=miban|targetUserId/);
  });
  it("管理员代看只打开目标用户钱包，目标管理员也不能省略代看标记", () => {
    for (const canManage of [false, true]) {
      const data = context({ isViewingAs: true, canManage });
      expect(actual().ledger37AiWalletHref(data, 901)).toBe("/wallet?fromLedger=37&viewAs=901");
      expect(nodes(renderer(data)).find(node => node.type === "a").props.href).toBe("/wallet?fromLedger=37&viewAs=901");
    }
  });
  it.each([
    context({ viewerUserId: 909 }), context({ viewer: { userId: 909, username: "ADMIN_SECRET", nickname: "ADMIN_SECRET", avatar: "https://example.test/admin-secret.png" } }),
    context({ viewer: null }), context({ isViewingAs: undefined }),
  ])("缺资料/身份不符/未知代看状态不会打开错钱包：%j", data => {
    const tree = renderer(data);
    expect(nodes(tree).some(node => node.type === "a")).toBe(false);
    expect(nodes(tree).find(node => node.type === "button" && node.props.disabled && node.props["aria-label"] === "钱包身份待确认")).toBeTruthy();
    expect(renderToStaticMarkup(tree)).not.toMatch(/ADMIN_SECRET|admin-secret/);
  });
  it("逐字段头像白名单不把夹带的管理员、联系方式、余额透传到UI", () => {
    const data = context(); Object.assign(data.viewer!, { password: "PASS_SECRET", realUser: "ADMIN_SECRET", email: "EMAIL_SECRET", totalPnl: 888012347 });
    expect(actual().resolveLedger37AiViewer(data, 901)).toEqual({ userId: 901, username: "user901", nickname: "客户甲", avatar: "https://example.test/u901.png" });
    expect(renderToStaticMarkup(renderer(data))).not.toMatch(/PASS_SECRET|ADMIN_SECRET|EMAIL_SECRET|888012347/);
  });
  it("加载/失败/首次缓存未确认时头像和钱包不冒用旧响应，后台刷新保留正确身份", () => {
    const response: any = { data: context(), isFetchedAfterMount: false };
    const spy = vi.fn(() => response); const api = actual({ trpc: queryFixture(spy) });
    const render = (viewerUserId = 901) => api.Ledger37AiIdentityHeader({ viewerUserId, onBack: vi.fn() });
    expect(render().props.context).toBeUndefined();
    response.isFetchedAfterMount = true; expect(render().props.context.viewer.userId).toBe(901);
    response.isFetching = true; expect(render().props.context.viewer.userId).toBe(901);
    expect(render(902).props.context).toBeUndefined();
    response.error = new Error("read failed"); expect(render().props.context).toBeUndefined();
    expect(spy).toHaveBeenCalledWith({ ledgerId: 37, viewAsUserId: 901 }, expect.objectContaining({ placeholderData: undefined, refetchOnMount: "always", staleTime: 0 }));
  });
  it.each([0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("无效用户%s不发送读取且不打开钱包", viewerUserId => {
    const spy = vi.fn((_input: any, _options: any) => ({})); const api = actual({ trpc: queryFixture(spy) });
    api.Ledger37AiIdentityHeader({ viewerUserId, onBack: vi.fn() });
    expect(spy.mock.calls[0][1].enabled).toBe(false); expect(api.ledger37AiWalletHref(context(), viewerUserId)).toBeNull();
  });
  it("头像头部采用浅蓝青绿主题与白色卡片，保留两行版式和至少44px点击区域", () => {
    const tree = renderer();
    expect(tree.props.style.background).toBe("#F2F6FA");
    expect(tree.props.className).toContain("bg-[#F2F6FA]");
    expect(tree.props.className).toContain("border-[#DCE7F0]");
    expect(tree.props.className).toContain("text-[#61758A]");
    const link = nodes(tree).find(node => node.type === "a");
    const amount = nodes(tree).find(node => node.props?.["data-header-wallet-balance"] !== undefined);
    expect(amount.props.className).toContain("text-[#087987]");
    expect(amount.props.className).toContain("row-start-2");
    expect(amount.props.className).toContain("[overflow-wrap:anywhere]");
    const card = nodes(tree).find(node => node.props?.["data-wallet-avatar-group"] === "true");
    expect(card.props.className).toContain("bg-white");
    expect(card.props.className).toContain("border-[#DCE7F0]");
    expect(card.props.className).toContain("shadow-none");
    expect(nodes(card).some(node => node.props?.className === "h-[26px] w-px shrink-0 bg-[#DCE7F0]")).toBe(true);
    const name = nodes(link).find(node => node.type === "h1");
    expect(name.props.className).toContain("text-[#142A3F]");
    expect(name.props.className).toContain("row-start-1");
    expect(renderToStaticMarkup(tree)).toContain("data-test-wallet-animation");
    expect(link.props.className).toContain("min-h-[44px]");
    expect(link.props.className).toContain("focus-visible:ring-[#087987]");
    const avatarMenu = nodes(tree).find(node => typeof node.type === "function" && node.type.name === "Ledger37AiAvatarMenu");
    expect(avatarMenu).toBeTruthy();
    expect(renderToStaticMarkup(avatarMenu)).toMatch(/<button[^>]*class="[^"]*h-11 w-11/);
    expect(source).not.toMatch(/bg-black|bg-gray-9|#11161C|#171C23|#2B333E|#A0AABB|#F0F3F7|#FF9F43/);
  });
  it.each([true, false])("头像和返回弹层在有/无身份%s时均采用白底深文字与青绿强调，返回行为不变", hasViewer => {
    const onBack = vi.fn(); const setOpen = vi.fn();
    const api = actual({ useState: () => [true, setOpen] });
    const header = api.Ledger37AiIdentityHeaderRenderer({ context: hasViewer ? context() : undefined, viewerUserId: 901, onBack });
    const menu = nodes(header).find(node => typeof node.type === "function" && node.type.name === "Ledger37AiAvatarMenu");
    const tree = menu.type(menu.props);
    const content = nodes(tree).find(node => node.type.name === "PopoverContent");
    expect(content.props.className).toContain("bg-white");
    expect(content.props.className).toContain("border-[#DCE7F0]");
    expect(content.props.className).toContain("text-[#142A3F]");
    expect(content.props.className).toContain("shadow-sm");
    const trigger = nodes(tree).find(node => node.type === "button" && node.props.title === "点击头像：返回");
    expect(trigger.props.className).toContain("focus-visible:ring-[#087987]");
    if (hasViewer) {
      expect(nodes(trigger).find(node => node.type.name === "UserAvatar").props.style.backgroundColor).toBe("#087987");
    } else {
      const placeholder = nodes(trigger).find(node => node.props?.["aria-label"] === "正在读取用户头像");
      expect(placeholder.props.className).toContain("border-[#DCE7F0]");
      expect(placeholder.props.className).toContain("bg-[#F2F6FA]");
    }
    const back = nodes(content).find(node => node.type === "button");
    expect(back.props.children).toBe("返回");
    expect(back.props.className).toContain("hover:bg-[#EAF2F7]");
    expect(back.props.className).toContain("min-h-11");
    back.props.onClick();
    expect(setOpen).toHaveBeenCalledWith(false);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(setOpen.mock.invocationCallOrder[0]).toBeLessThan(onBack.mock.invocationCallOrder[0]);
  });
  it("AI首页和所有股票明细复用同一个头像钱包头部，不残留顶部旧标题", () => {
    expect((homeSource.match(/<Ledger37AiIdentityHeader\s/g) || [])).toHaveLength(2);
    expect(homeSource).not.toMatch(/<h1[^>]*>我的\s*AI\s*项目|<h1[^>]*>AI\s*参与|我的份额\s*·/);
    expect(source).not.toMatch(/\.mutate\(|\.useMutation\(|setLedger37AiDisplay|setR1StockAiDisplay/);
  });
});
