import { readFileSync } from 'node:fs';
import React from 'react';
import ts from 'typescript';
import { describe, it, expect, vi } from 'vitest';
import { readTagVisible } from '../shared/tag-visibility';
const add = readFileSync(new URL('../client/src/pages/AddTransaction.tsx', import.meta.url), 'utf8');
const aa = readFileSync(new URL('../client/src/pages/LedgerDetailAA.tsx', import.meta.url), 'utf8');
function node(source: string, name: string) {
  const ast = ts.createSourceFile('actual.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.FunctionDeclaration | ts.VariableDeclaration | undefined;
  const visit = (value: ts.Node) => {
    if (ts.isFunctionDeclaration(value) && value.name?.text === name) found = value;
    if (ts.isVariableDeclaration(value) && value.name.getText(ast) === name) found = value;
    ts.forEachChild(value, visit);
  }; visit(ast); if (!found) throw new Error('Missing actual production code: '+name);
  return { ast, found };
}
function execute(source: string, name: string, bindings: Record<string, any>) {
  const { ast, found } = node(source, name);
  const expression = ts.isVariableDeclaration(found) ? found.initializer!.getText(ast) : found.getText(ast).replace(/^export\s+(?:default\s+)?/, '');
  const code = ts.transpileModule(`const actual = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.None } }).outputText;
  return new Function('React', ...Object.keys(bindings), code+'; return actual;')(React, ...Object.values(bindings));
}
const categories = [{ id: 90250, name: 'one', accountingMode: 'stock_portfolio' }, { id: 90251, name: 'two', accountingMode: 'stock_portfolio' }, { id: 7, name: 'ordinary', accountingMode: 'manual_balance' }];
function prefetch(patch: Record<string, any> = {}) {
  return execute(aa, 'stockCalendarPrefetchCategoryIds', { useMemo: (fn: any) => fn(), ledgerId: 37, allCategories: categories, initialBalancesData: { balances: {} },
    r1ShowsAi: false, r1PresentationQuery: { data: { aiEnabled: false }, isError: false }, readTagVisible, ...patch });
}

describe('37号全局AI深链和后台预取：真实前端执行，无DB/网络', () => {
  it.each(['36', '52', '1'])('非37录入入口%s保持原组件，不读取AI配置', id => {
    const component = execute(add, 'AddTransactionPresentationEntry', { useParams: () => ({ id }), AddTransaction: 'legacy', Ledger37AddTransactionEntry: 'global-entry' });
    expect(component().type).toBe('legacy');
  });
  it('37录入深链先进入同一个全局门控，原表单不作为入口', () => {
    const component = execute(add, 'AddTransactionPresentationEntry', { useParams: () => ({ id: '37' }), AddTransaction: 'legacy', Ledger37AddTransactionEntry: 'global-entry' });
    expect(component().type).toBe('global-entry'); expect(add).toContain('export default AddTransactionPresentationEntry');
  });
  it('录入包装只读取当前身份全局context，不包含标签/订单，不写viewAs身份', () => {
    const spy = vi.fn(() => ({ context: { viewerUserId: 28, aiEnabled: true, canManage: false } }));
    const component = execute(add, 'Ledger37AddTransactionEntry', { useAuth: () => ({ user: { id: 28 } }), useSearch: () => '?viewAs=29', useLedger37PresentationContext: spy,
      Ledger37PresentationGate: 'gate', AddTransaction: 'legacy' });
    const tree = component(); expect(spy).toHaveBeenCalledWith({ ledgerId: 37, search: '?viewAs=29', authUserId: 28 });
    expect(tree.type).toBe('gate'); expect(tree.props.ledgerId).toBe(37);
    const { ast, found } = node(add, 'Ledger37AddTransactionEntry'); expect(found.getText(ast)).not.toMatch(/categoryId|lotId|mutate|setItem/);
  });
  it.each([{ r1ShowsAi: true }, { r1PresentationQuery: { data: undefined, isError: false } }, { r1PresentationQuery: { data: { aiEnabled: false }, isError: true } }])('全局AI/未确认/读取失败不预取任何37股票总盘：%j', patch => {
    expect(prefetch(patch)).toEqual([]);
  });
  it('同一全局关闭状态支持两个不同stock标签，普通标签不误预取', () => {
    expect(prefetch()).toEqual([90250, 90251]);
    expect(prefetch({ ledgerId: 52 })).toEqual([]);
    expect(prefetch({ initialBalancesData: { balances: { one__visible: 0 } } })).toEqual([90251]);
  });
  it('AA全局模式不依赖selectedTagId，安全fallback是全账本首页不再固定R1', () => {
    const scope = node(aa, 'r1PresentationScope'); expect(scope.found.getText(scope.ast)).toBe('r1PresentationScope = ledgerId === 37');
    const query = node(aa, 'r1PresentationQuery'); expect(query.found.getText(query.ast)).toContain('getLedger37PresentationContext'); expect(query.found.getText(query.ast)).not.toContain('categoryId:');
    expect(aa).toContain('<Ledger37AiHome'); expect(aa).not.toContain('r1AiDisplayKey'); expect(aa).not.toContain('r1-ai-${R1_STOCK_CATEGORY_ID}');
  });
});
