import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { transformSync } from 'esbuild';
import { describe, expect, it, vi } from 'vitest';

const dbSource = readFileSync(new URL('./db-ledger.ts', import.meta.url), 'utf8');
const dbAst = ts.createSourceFile('db-ledger.ts', dbSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const declaration = dbAst.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'updateLedgerCategory')!;
const code = transformSync(declaration.getText(dbAst).replace(/^export /, '')
  .replace("await import('./db')", 'await mockedDbModule()')
  .replace("await import('./ledger-category-rename')", 'await mockedRenameModule()')
  + '\nreturn updateLedgerCategory;', { loader: 'ts', target: 'es2022' }).code;
function fixture(memberAllowed = true, failRename = false) {
  let selects = 0;
  const release = vi.fn(); const tx = { release };
  const rename = vi.fn(async () => { if (failRename) throw new Error('目标名称已有配置'); return true; });
  const transactionConnection = vi.fn(async () => tx);
  const update = vi.fn(() => ({ set: () => ({ where: vi.fn(async () => undefined) }) }));
  const db = { update, select: vi.fn(() => {
    const rows = ++selects === 1 ? [{ id: 7, ledgerId: 37 }] : memberAllowed ? [{ id: 3 }] : [];
    const chain: any = { from: () => chain, where: () => chain, limit: async () => rows, then: (f: any) => Promise.resolve(rows).then(f) };
    return chain;
  }) };
  const deps = { getLedgerDb: async () => db, ledgerCategories: { id: 'id', ledgerId: 'ledgerId' }, ledgerMembers: { id: 'id', ledgerId: 'ledgerId', userId: 'userId' },
    eq: (...v: any[]) => v, and: (...v: any[]) => v, requireLedger52CreatorInDb: vi.fn(async () => undefined),
    mockedDbModule: async () => ({ getDbTransactionConnection: transactionConnection }), mockedRenameModule: async () => ({ renameLedgerCategoryPreservingConfig: rename }) };
  return { run: new Function(...Object.keys(deps), code)(...Object.values(deps)), rename, transactionConnection, update, release, tx };
}

describe('显式改名入口，不补迁移或覆盖以前新名称配置', () => {
  it('仅本次改名走独占连接及原子保留服务，category ID和真实权限检查沿用', async () => {
    const f = fixture(); expect(await f.run(7, { name: '新名称' }, 20)).toBe(true);
    expect(f.rename).toHaveBeenCalledOnce();
    expect(f.rename).toHaveBeenCalledWith(f.tx, 7, { name: '新名称' });
    expect(f.update).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledOnce();
  });
  it('名称冲突失败原样向上返回，不退回旧覆盖流程，连接仍释放', async () => {
    const f = fixture(true, true); await expect(f.run(7, { name: '已有新名' }, 20)).rejects.toThrow('已有配置');
    expect(f.update).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledOnce();
  });
  it('无权限不会取得写连接或触发配置改名', async () => {
    const f = fixture(false); await expect(f.run(7, { name: '新名称' }, 20)).rejects.toThrow('权限不足');
    expect(f.rename).not.toHaveBeenCalled(); expect(f.transactionConnection).not.toHaveBeenCalled();
  });
  it('仅改颜色沿用原更新，不扫描旧名或运行迁移', async () => {
    const f = fixture(); await f.run(7, { color: '#123456' });
    expect(f.rename).not.toHaveBeenCalled(); expect(f.update).toHaveBeenCalledOnce();
  });
});

const page = readFileSync(new URL('../client/src/pages/LedgerCategories.tsx', import.meta.url), 'utf8');
const pageAst = ts.createSourceFile('categories.tsx', page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(node: ts.Node): ts.CallExpression | undefined {
  if (ts.isCallExpression(node) && node.expression.getText(pageAst) === 'trpc.ledger.updateCategory.useMutation') return node;
  return ts.forEachChild(node, find);
}
const mutation = find(pageAst)!;
const callbackCode = transformSync('return ' + mutation.arguments[0].getText(pageAst) + ';', { loader: 'ts', target: 'es2022' }).code;
it('改名成功只失效当前账本读取缓存，回到利息/押金页不复用旧名称内容', () => {
  const invalidate = vi.fn(); const setRename = vi.fn();
  const deps = { id: '37', utils: { invalidate }, toast: { success: vi.fn() }, setShowRenameDialog: vi.fn(), setCategoryToRename: vi.fn(), setRenameValue: setRename };
  new Function(...Object.keys(deps), callbackCode)(...Object.values(deps)).onSuccess();
  const options = invalidate.mock.calls[0][1];
  expect(options.predicate({ queryKey: [['ledger','getTagConfig'], { input: { ledgerId: 37, tagName: '旧名' } }] })).toBe(true);
  expect(options.predicate({ queryKey: [['ledger','adminGetAllInitialBalances'], { input: { ledgerId: 37 } }] })).toBe(true);
  expect(options.predicate({ queryKey: [['ledger','getTagConfig'], { input: { ledgerId: 52 } }] })).toBe(false);
  expect(options.predicate({ queryKey: [['auth','me']] })).toBe(false);
  expect(options.refetchType).toBe('active'); expect(setRename).toHaveBeenCalledWith('');
});
