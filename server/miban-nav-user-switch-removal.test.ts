import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const navBarPath = resolve(process.cwd(), "client/src/pages/miban/NavBar.tsx");
const mibanAppPath = resolve(process.cwd(), "client/src/pages/miban/MibanApp.tsx");
const navBarSource = readFileSync(navBarPath, "utf8");
const mibanAppSource = readFileSync(mibanAppPath, "utf8");
const navBarFile = ts.createSourceFile(
  navBarPath,
  navBarSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const mibanAppFile = ts.createSourceFile(
  mibanAppPath,
  mibanAppSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

function walk(node: ts.Node, visit: (node: ts.Node) => void) {
  visit(node);
  node.forEachChild(child => walk(child, visit));
}

function identifiers(file: ts.SourceFile) {
  const names: string[] = [];
  walk(file, node => {
    if (ts.isIdentifier(node)) names.push(node.text);
  });
  return names;
}

function functionNames(file: ts.SourceFile) {
  const names: string[] = [];
  walk(file, node => {
    if (ts.isFunctionDeclaration(node) && node.name) names.push(node.name.text);
  });
  return names;
}

function jsxTagNames(file: ts.SourceFile) {
  const names: string[] = [];
  walk(file, node => {
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName;
      if (ts.isIdentifier(tag)) names.push(tag.text);
    }
    if (ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName;
      if (ts.isIdentifier(tag)) names.push(tag.text);
    }
  });
  return names;
}

describe("Miban NavBar identity switch removal", () => {
  it("removes the test identity switcher and its dedicated dependencies", () => {
    const names = identifiers(navBarFile);
    const bannedIdentifiers = [
      "IdentitySwitcherNav",
      "ALLOWED_IDENTITIES",
      "IDENTITY_COLORS",
      "saveToken",
    ];

    for (const name of bannedIdentifiers) {
      expect(names, `NavBar must not reference ${name}`).not.toContain(name);
    }

    expect(navBarSource).not.toMatch(/mibanImpersonate\s*\.\s*switchToAny/);
    expect(navBarSource).not.toMatch(/from\s+["'][^"']*tokenStorage["']/);
  });

  it("keeps the shared NavBar shell and the user-facing navigation entry points", () => {
    const names = functionNames(navBarFile);
    const tags = jsxTagNames(navBarFile);

    expect(names).toEqual(expect.arrayContaining([
      "LogoWithVersionSwitch",
      "PersonalWalletEntry",
      "UserMenu",
    ]));
    expect(tags).toEqual(expect.arrayContaining([
      "LogoWithVersionSwitch",
      "PersonalWalletEntry",
      "UserMenu",
    ]));

    for (const text of [
      "钱包可用余额",
      "管理后台",
      "钱包充值",
      "扫码邀请",
      "退出登录",
      "切换版本",
      "首页",
      "百科",
      "限时",
      "我的",
    ]) {
      expect(navBarSource, `NavBar must retain ${text}`).toContain(text);
    }

    expect(navBarSource).toContain("<LogoWithVersionSwitch />");
    expect(navBarSource).toContain("<PersonalWalletEntry />");
    expect(navBarSource).toContain("<UserMenu");
    expect(navBarSource).not.toContain("<IdentitySwitcherNav");
  });

  it("continues to mount one shared NavBar from MibanApp", () => {
    const importsNavBar = /import\s+NavBar\s+from\s+["']\.\/NavBar["']/u.test(mibanAppSource);
    expect(importsNavBar).toBe(true);
    expect(mibanAppSource).toContain("<NavBar />");
  });
});
