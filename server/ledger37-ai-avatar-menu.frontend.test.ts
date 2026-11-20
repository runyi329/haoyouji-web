import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { Ledger37PresentationContext } from "../shared/ledger37-ai-presentation";

const source = readFileSync(new URL("../client/src/components/Ledger37AiIdentityHeader.tsx", import.meta.url), "utf8");
const context = (id = 901, isViewingAs = false): Ledger37PresentationContext => ({
  ledgerId: 37, viewerUserId: id, canManage: false, aiEnabled: true, isViewingAs,
  viewer: { userId: id, username: `user${id}`, nickname: id === 901 ? "客户甲" : "客户乙", avatar: `https://example.test/u${id}.png` },
});
function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === "object" ? [tree, ...nodes(tree.props?.children)] : [];
}
function actual(useState: any) {
  const file = ts.createSourceFile("header.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const code = file.statements.filter(node => !ts.isImportDeclaration(node))
    .map(node => node.getText(file).replace(/^export\s+(default\s+)?/, "")).join("\n");
  const js = ts.transpileModule(code, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React,
  } }).outputText;
  const bindings = {
    React, useState,
    Popover: ({ children }: any) => React.createElement(React.Fragment, null, children),
    PopoverTrigger: ({ children }: any) => React.createElement(React.Fragment, null, children),
    PopoverContent: ({ children }: any) => React.createElement("div", { "data-test-menu": true }, children),
    UserAvatar: (props: any) => React.createElement("img", { src: props.avatar || undefined, alt: props.nickname || props.username || "用户" }),
    AnimatedWalletLogo: () => React.createElement("span", { "data-test-wallet-animation": true }),
  };
  return new Function(...Object.keys(bindings), `${js}; return { Ledger37AiAvatarMenu, Ledger37AiIdentityHeaderRenderer };`)(...Object.values(bindings));
}

// Execute the real child and its state transitions without DOM, auth, queries or Radix portals.
// A trigger activation follows Radix's controlled contract: onOpenChange(!open).
function harness() {
  let state: boolean | undefined;
  let mountedKey: string | null | undefined;
  let mounted: any;
  const changes: boolean[] = [];
  const useState = (initial: boolean) => {
    if (state === undefined) state = initial;
    return [state, (next: boolean | ((previous: boolean) => boolean)) => {
      state = typeof next === "function" ? next(state!) : next;
      changes.push(state!);
    }];
  };
  const api = actual(useState);
  const onBack = vi.fn(() => { expect(state).toBe(false); });
  const header = (data: Ledger37PresentationContext | undefined = context(), id = 901) => api.Ledger37AiIdentityHeaderRenderer({
    context: data, viewerUserId: id, wallet: { viewerUserId: id, availableCny: 12.34 }, onBack,
  });
  const mount = (tree: any) => {
    const child = nodes(tree).find(node => node.type === api.Ledger37AiAvatarMenu);
    expect(child).toBeTruthy();
    if (child.key !== mountedKey) { state = undefined; mountedKey = child.key; }
    mounted = child;
    return child;
  };
  const render = () => api.Ledger37AiAvatarMenu(mounted.props);
  const trigger = () => {
    const root = render();
    const wrapper = nodes(root).find(node => node.type.name === "PopoverTrigger");
    expect(wrapper.props.asChild).toBe(true);
    expect(wrapper.props.children.type).toBe("button");
    return wrapper.props.children;
  };
  const clickAvatar = () => {
    expect(trigger().props.disabled).not.toBe(true);
    const root = render();
    root.props.onOpenChange(!root.props.open);
  };
  const visibleMenu = () => {
    const root = render();
    if (!root.props.open) return [];
    const content = nodes(root).find(node => node.type.name === "PopoverContent");
    return nodes(content).filter(node => node.type === "button");
  };
  return { api, onBack, changes, header, mount, render, trigger, clickAvatar, visibleMenu };
}

describe("37号AI头像菜单：真实子组件离线交互", () => {
  it("头像44px触发器初始关闭，点击只开菜单，唯一返回项先闭合再调用原onBack一次", () => {
    const h = harness(); h.mount(h.header());
    expect(h.render().props.open).toBe(false);
    expect(h.visibleMenu()).toHaveLength(0);
    expect(h.trigger().props["aria-label"]).toBe("打开客户甲的账户操作");
    expect(h.trigger().props.title).toBe("点击头像：返回");
    expect(h.trigger().props.className).toContain("h-11 w-11");
    h.clickAvatar();
    expect(h.render().props.open).toBe(true);
    expect(h.onBack).not.toHaveBeenCalled();
    const menu = h.visibleMenu();
    expect(menu).toHaveLength(1);
    expect(menu[0].props.children).toBe("返回");
    expect(menu[0].props.className).toContain("min-h-11");
    menu[0].props.onClick();
    expect(h.changes).toEqual([true, false]);
    expect(h.render().props.open).toBe(false);
    expect(h.visibleMenu()).toHaveLength(0);
    expect(h.onBack).toHaveBeenCalledTimes(1);
  });
  it("点击外部关闭菜单不执行返回，也不增加刷新操作", () => {
    const h = harness(); h.mount(h.header()); h.clickAvatar();
    h.render().props.onOpenChange(false);
    expect(h.render().props.open).toBe(false);
    expect(h.onBack).not.toHaveBeenCalled();
    expect(source).not.toMatch(/ArrowLeft|\.refetch\(|\.useMutation\(|\.mutate\(|clearLedgerViewAsState/);
  });
  it.each([false, true])("钱包数字链接与头像/返回不同作用域，代看%s沿用href且不切菜单状态", isViewingAs => {
    const h = harness(); const tree = h.header(context(901, isViewingAs)); const child = h.mount(tree);
    const links = nodes(tree).filter(node => node.type === "a");
    expect(links).toHaveLength(1);
    const link = links[0];
    expect(link.props.href).toBe(`/wallet?fromLedger=37${isViewingAs ? "&viewAs=901" : ""}`);
    expect(link.props.onClick).toBeUndefined();
    expect(nodes(link)).not.toContain(child);
    expect(nodes(link).some(node => node.type === "button")).toBe(false);
    expect(nodes(link).some(node => node.props?.["data-header-wallet-balance"] !== undefined)).toBe(true);
    expect(nodes(tree).some(node => node.type === "button" && node.props.onClick === h.onBack)).toBe(false);
    // Native navigation is carried by href, with no avatar/menu callback to invoke.
    link.props.onClick?.();
    expect(h.render().props.open).toBe(false);
    h.clickAvatar(); link.props.onClick?.();
    expect(h.render().props.open).toBe(true);
    expect(h.onBack).not.toHaveBeenCalled();
    expect(h.changes).toEqual([true]);
    const markup = renderToStaticMarkup(React.createElement(h.api.Ledger37AiIdentityHeaderRenderer, {
      context: context(901, isViewingAs), viewerUserId: 901, wallet: { viewerUserId: 901, availableCny: 12.34 }, onBack: h.onBack,
    }));
    expect(markup).toContain("¥12.34");
    expect(markup).toContain("data-test-wallet-animation");
  });
  it("key由viewerUserId决定，同用户保留状态、切人及切回均重挂关闭菜单", () => {
    const h = harness();
    expect(h.mount(h.header()).key).toBe("901"); h.clickAvatar();
    h.mount(h.header()); expect(h.render().props.open).toBe(true);
    expect(h.mount(h.header(context(902, true), 902)).key).toBe("902");
    expect(h.render().props.open).toBe(false);
    expect(h.trigger().props["aria-label"]).toBe("打开客户乙的账户操作");
    h.clickAvatar();
    expect(h.mount(h.header()).key).toBe("901");
    expect(h.render().props.open).toBe(false);
    expect(h.onBack).not.toHaveBeenCalled();
  });
  it.each([undefined, { ...context(), viewer: null }, { ...context(), viewerUserId: 902 }])(
    "无/错身份不显示旧头像余额且钱包禁用，但仍可打开菜单纯导航返回：%j", data => {
      const h = harness();
      // Pass undefined explicitly because header's convenience default is a valid context.
      const tree = h.api.Ledger37AiIdentityHeaderRenderer({ context: data, viewerUserId: 901,
        wallet: { viewerUserId: 901, availableCny: 12.34 }, onBack: h.onBack });
      const child = h.mount(tree);
      expect(child.props.viewer).toBeNull();
      expect(nodes(tree).some(node => node.type === "a")).toBe(false);
      expect(nodes(tree).find(node => node.type === "button" && node.props["aria-label"] === "钱包身份待确认").props.disabled).toBe(true);
      expect(h.trigger().props["aria-label"]).toBe("打开账户操作");
      expect(nodes(h.trigger()).some(node => node.type.name === "UserAvatar")).toBe(false);
      expect(renderToStaticMarkup(tree)).not.toMatch(/u901\.png|¥12\.34/);
      h.clickAvatar();
      expect(h.visibleMenu()).toHaveLength(1);
      h.visibleMenu()[0].props.onClick();
      expect(h.render().props.open).toBe(false);
      expect(h.onBack).toHaveBeenCalledTimes(1);
    },
  );
});
