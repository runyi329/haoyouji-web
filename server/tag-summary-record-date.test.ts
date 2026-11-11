import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { getLedgerRecordDateError } from '../shared/ledger-record-date';

const routerSource = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('routers.ts', routerSource, ts.ScriptTarget.Latest, true);
function expressionFor(name: string): string {
  const matches: ts.VariableDeclaration[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name && node.initializer) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  if (matches.length !== 1) throw new Error(`Expected one actual ${name} declaration`);
  return matches[0].initializer!.getText(tree);
}
const singleExpression = expressionFor('latestBalanceRows');
// The all-tags route has a unique latestRows initializer in its own source range.
const batchText = routerSource.slice(routerSource.indexOf('    getAllTagsMarginSummary:'), routerSource.indexOf('    getTagInterestSettings:'));
const batchTree = ts.createSourceFile('batch.ts', `const route = {${batchText.replace(/,\s*\/\/ ===== 标签利息管理[\s\S]*$/, '')}};`, ts.ScriptTarget.Latest, true);
function batchExpression(): string {
  let found: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(batchTree) === 'latestRows') found = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(batchTree);
  if (!found) throw new Error('Missing actual all-tags latestRows expression');
  return found.getText(batchTree);
}
type Statement = { text: string; args: unknown[] };
async function capture(expression: string, ledgerId = 37, pause: string | null = null, category: { id: number } | null = { id: 7 }) {
  const statements: Statement[] = [];
  const js = ts.transpileModule(`(async () => (${expression}))()`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const result = await new vm.Script(js).runInNewContext({
    input: { ledgerId }, LEDGER_37_ID: 37, category, recordToday: '2026-11-11', settlementCutoffDate: pause,
    db: { execute: async (query: Statement) => { statements.push(query); return [[]]; } },
    sql: (parts: TemplateStringsArray, ...args: unknown[]) => ({ text: parts.join('?'), args }),
  });
  return { statements, result };
}

describe('guarantee summaries ignore future ledger37 business dates (offline production SQL)', () => {
  it('keeps existing registered business routers imported while adding the date helper', () => {
    const mibanImport = tree.statements.find(node => ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === './miban') as ts.ImportDeclaration;
    const bindings = mibanImport.importClause?.namedBindings;
    expect(bindings && ts.isNamedImports(bindings)).toBeTruthy();
    const names = bindings && ts.isNamedImports(bindings) ? bindings.elements.map(item => item.name.text) : [];
    for (const name of ['mibanLimitedProductRouter', 'mibanAgentRouter', 'mibanInventoryRouter',
      'mibanAddressRouter', 'mibanReviewRouter', 'mibanFavoriteRouter', 'mibanImpersonateRouter']) {
      expect(names).toContain(name);
    }
  });
  it('single-tag filters by server Beijing today and uses latest business date, registration time, ID', async () => {
    const { statements: [q] } = await capture(singleExpression);
    expect(q.text).toContain("DATE_FORMAT(lr.recordDate, '%Y-%m-%d') AS recordDate");
    expect(q.text).toContain('OR lr.recordDate <= ?');
    expect(q.args).toEqual([37, 7, 37, 37, '2026-11-11', null, null]);
    expect(q.text).toContain('ORDER BY lr.recordDate DESC, lr.createdAt DESC, lr.id DESC');
    expect(q.text).toContain("lr.type != 'transfer'");
    expect(q.text).toContain('lr.deleted_at IS NULL');
  });
  it('keeps legitimate zero and negative balances rather than treating them as blank', async () => {
    for (const expression of [singleExpression, batchExpression()]) {
      const { statements: [q] } = await capture(expression);
      expect(q.text).not.toMatch(/amount\s*(?:>|!=|<>|=)\s*0/);
    }
  });
  it('single-tag preserves a paused settlement cutoff independently of today', async () => {
    const { statements: [q] } = await capture(singleExpression, 37, '2026-11-06');
    expect(q.args.slice(-3)).toEqual(['2026-11-11', '2026-11-06', '2026-11-06']);
    expect(q.text).toContain('AND (? IS NULL OR lr.recordDate <= ?)');
  });
  it('does not query other tags when requested category is absent', async () => {
    const { statements, result } = await capture(singleExpression, 37, null, null);
    expect(statements).toHaveLength(0);
    expect(result).toEqual([[]]);
  });
  it('all-tags uses identical nonfuture cutoff and business-date ordering, not MAX ID', async () => {
    const { statements: [q] } = await capture(batchExpression());
    expect(q.text).toContain('ROW_NUMBER() OVER');
    expect(q.text).toContain('PARTITION BY BINARY lc.name');
    expect(q.text).toContain('lc.ledgerId = lr.ledgerId');
    expect(q.text).toContain('ORDER BY lr.recordDate DESC, lr.createdAt DESC, lr.id DESC');
    expect(q.text).toContain('lr.recordDate <= ?');
    expect(q.args).toEqual([37, '2026-11-11']);
    expect(q.text).not.toContain('MAX(lr2.id)');
    expect(q.text).toContain("COALESCE(cfg.margin_pause_date, cfg.pause_date, '9999-12-31')");
    expect(q.text).toContain('WHERE ranked.balance_rank = 1');
  });
  it('other-ledger batch query keeps its original selection and cutoff policy', async () => {
    const { statements: [q] } = await capture(batchExpression(), 52);
    expect(q.text).toContain('MAX(lr2.id)');
    expect(q.text).not.toContain('ROW_NUMBER()');
    expect(q.args).not.toContain('2026-11-11');
    expect(q.text).toContain("ELSE COALESCE(cfg2.margin_pause_date, '9999-12-31')");
  });
  it('UI distinguishes missing balance from a registered zero and uses finite values', () => {
    const page = readFileSync(new URL('../client/src/pages/DepositManage.tsx', import.meta.url), 'utf8');
    expect(page).toContain('const autoBalanceNum = Number.isFinite(parsedBalance) ? parsedBalance : null;');
    expect(page).toContain("String(latestBalance.balance).trim() !== ''");
    expect(page).not.toContain('latestBalance?.balance ? parseFloat');
  });
});

describe('bulk import actual mutation preflight (offline, no database)', () => {
  function mutation() {
    let callback: ts.Node | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isPropertyAssignment(node) && node.name.getText(tree) === 'importRecords') {
        const find = (child: ts.Node) => {
          if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression)
            && child.expression.name.text === 'mutation') callback = child.arguments[0];
          ts.forEachChild(child, find);
        };
        find(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
    if (!callback) throw new Error('Missing real import mutation callback');
    const calls: string[] = [];
    const text = ts.transpileModule(`(${callback.getText(tree)})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const run = new vm.Script(text).runInNewContext({
      getLedgerRecordDateError, TRPCError,
      Date: class extends Date { constructor() { super('2026-11-11T08:00:00.000Z'); } },
      getDb: async () => { calls.push('database'); throw new Error('offline database boundary'); },
    });
    return { run, calls };
  }
  it('a later future record rejects the entire import before any database call', async () => {
    const { run, calls } = mutation();
    await expect(run({ ctx: { user: { id: 2 } }, input: { ledgerId: 37,
      records: [{ date: '2026-11-06' }, { date: '2026-11-12' }] } }))
      .rejects.toThrow('第2笔：账目日期不能晚于今天');
    expect(calls).toEqual([]);
  });
  it.each([37, 52])('past dates in ledger %s pass the preflight without changing import logic', async (ledgerId) => {
    const { run, calls } = mutation();
    await expect(run({ ctx: { user: { id: 2 } }, input: { ledgerId,
      records: [{ date: '2026-11-06' }] } })).rejects.toThrow('offline database boundary');
    expect(calls).toEqual(['database']);
  });
  it('other ledgers retain future-date eligibility', async () => {
    const { run, calls } = mutation();
    await expect(run({ ctx: { user: { id: 2 } }, input: { ledgerId: 52,
      records: [{ date: '2026-11-16' }] } })).rejects.toThrow('offline database boundary');
    expect(calls).toEqual(['database']);
  });
});
