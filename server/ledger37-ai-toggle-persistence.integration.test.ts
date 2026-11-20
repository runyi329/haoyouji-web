import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// No real db module, HTTP, server, MySQL or live user configuration is loaded.
const deps = vi.hoisted(() => ({ read: vi.fn(), tx: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: deps.read, getDbTransactionConnection: deps.tx }));
vi.mock('./r1-stock-presentation', () => ({ readR1RecordedMargins: vi.fn(() => { throw new Error('outside isolated toggle test'); }) }));
import { getLedger37PresentationContext, setLedger37AiDisplay } from './ledger37-ai-presentation';
import { LEDGER37_AI_DISPLAY_KEY as key } from '../shared/ledger37-ai-presentation';

type Row = { id: number; userId: number; role: string; initial_balances: string | null };
type Fault = 'update' | 'cas' | 'commit' | 'rollback';
const actor = { ledgerId: 37 as const, userId: 100 };
const member = (userId: number) => ({ ledgerId: 37 as const, userId });
const toggle = (targetUserId: number, enabled: boolean) => ({ ...actor, targetUserId, enabled });
const rawA = ` { "amount":900719925474099312345, "decimal":2.123456789123456789, "nested":{"${key}":1,"s":"\\\"[,]"}, "legacy": [1,{"v":2}], "__stockAiDisplay_category_90250":1, "${key}" : 0 } `;
const rawB = `{"amount":987654321098765432109876,"${key}":0,"sibling":"other-member"}`;
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(yes => { resolve = yes; });
  return { promise, resolve };
}
function memoryStore() {
  const rows = new Map<number, Row>([
    [100, { id: 1, userId: 100, role: 'owner', initial_balances: '{}' }],
    [201, { id: 2, userId: 201, role: 'member', initial_balances: rawA }],
    [202, { id: 3, userId: 202, role: 'member', initial_balances: rawB }],
  ]);
  const logs: { connection: number; sql: string; values: any[] }[] = [];
  const transactions: any[] = [];
  let queue = Promise.resolve(), sequence = 0;
  let nextFault: Fault | undefined;
  let nextCommitGate: ReturnType<typeof deferred> | undefined;
  async function lock() {
    const previous = queue, gate = deferred();
    queue = previous.then(() => gate.promise);
    await previous;
    return gate.resolve;
  }
  function contextRows(values: any[]) {
    expect(values[1]).toBe(37);
    const row = rows.get(values[0]);
    return [[{ ledger_id: 37, ledger_owner_id: 100, member_user_id: row?.userId ?? null, member_role: row?.role, initialBalances: row?.initial_balances }]];
  }
  deps.read.mockResolvedValue({ execute: vi.fn(async (sql: string, values: any[]) => {
    expect(sql).toMatch(/FROM ledgers l LEFT JOIN ledger_members/);
    return contextRows(values);
  }) });
  deps.tx.mockImplementation(async () => {
    const connection = ++sequence, fault = nextFault, commitGate = nextCommitGate;
    nextFault = undefined; nextCommitGate = undefined;
    let releaseLock: (() => void) | undefined;
    const staged = new Map<number, Row>();
    const conn = {
      beginTransaction: vi.fn(async () => undefined),
      execute: vi.fn(async (sql: string, values: any[]) => {
        logs.push({ connection, sql, values });
        if (/SELECT id, ownerId AS ledger_owner_id FROM ledgers/.test(sql)) {
          expect(values).toEqual([37]); expect(sql).toContain('FOR UPDATE');
          releaseLock = await lock();
          return [[{ id: 37, ledger_owner_id: 100 }]];
        }
        expect(releaseLock).toBeDefined();
        if (/SELECT id, userId, role, initial_balances/.test(sql)) {
          expect(sql).toContain('ORDER BY userId FOR UPDATE'); expect(values[0]).toBe(37);
          return [[...new Set<number>(values.slice(1))].sort((a, b) => a - b).flatMap(id => rows.has(id) ? [{ ...rows.get(id)! }] : [])];
        }
        if (/^UPDATE ledger_members SET initial_balances = \?, updatedAt = updatedAt/.test(sql)) {
          expect(sql).toContain('BINARY initial_balances <=> BINARY ?');
          const [raw, id, ledgerId, userId, expected] = values;
          expect(ledgerId).toBe(37);
          const row = rows.get(userId);
          if (fault === 'update') throw new Error('injected update failure');
          if (fault === 'cas' || row?.id !== id || row.initial_balances !== expected) return [{ affectedRows: 0 }];
          staged.set(userId, { ...row, initial_balances: raw });
          return [{ affectedRows: 1 }];
        }
        throw new Error(`forbidden/non-whitelisted SQL: ${sql}`);
      }),
      commit: vi.fn(async () => {
        if (commitGate) await commitGate.promise;
        if (fault === 'commit' || fault === 'rollback') throw new Error('injected commit failure');
        for (const [id, row] of staged) rows.set(id, row);
        staged.clear(); releaseLock?.(); releaseLock = undefined;
      }),
      rollback: vi.fn(async () => {
        if (fault === 'rollback') throw new Error('injected rollback failure');
        staged.clear(); releaseLock?.(); releaseLock = undefined;
      }),
      release: vi.fn(() => { staged.clear(); releaseLock?.(); releaseLock = undefined; }),
    };
    transactions.push(conn);
    return conn;
  });
  return {
    rows, logs, transactions,
    fault: (value: Fault) => { nextFault = value; },
    commitGate: (value: ReturnType<typeof deferred>) => { nextCommitGate = value; },
    writes: () => logs.filter(entry => /^UPDATE/.test(entry.sql)),
    siblingWrite: async (userId: number) => {
      const unlock = await lock();
      const row = rows.get(userId)!;
      rows.set(userId, { ...row, initial_balances: row.initial_balances!.replace('900719925474099312345', '900719925474099312346') });
      unlock();
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('LEDGER_DATABASE_URL', ''); vi.stubEnv('CRM_DATABASE_URL', '');
  vi.stubEnv('DEV_BYPASS_AUTH', 'false'); vi.stubEnv('PREVIEW_READONLY', 'false');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('network forbidden'); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('independent isolated persistence: actual ledger37 set/get over committed memory transactions', () => {
  it('off -> save on -> fresh get -> save off -> fresh get; sibling bytes/other member intact', async () => {
    const s = memoryStore();
    expect((await getLedger37PresentationContext(member(201))).aiEnabled).toBe(false);
    await expect(setLedger37AiDisplay(toggle(201, true))).resolves.toEqual({ success: true, aiEnabled: true });
    expect((await getLedger37PresentationContext(member(201))).aiEnabled).toBe(true);
    expect(s.rows.get(201)!.initial_balances).toBe(rawA.replace(`"${key}" : 0`, `"${key}" : 1`));
    await setLedger37AiDisplay(toggle(201, false));
    expect((await getLedger37PresentationContext(member(201))).aiEnabled).toBe(false);
    expect(s.rows.get(201)!.initial_balances).toBe(rawA);
    expect(s.rows.get(202)!.initial_balances).toBe(rawB);
    expect(s.rows.get(100)!.initial_balances).toBe('{}');
    expect(s.writes()).toHaveLength(2);
    expect(s.transactions.every(tx => tx.commit.mock.calls.length === 1 && tx.release.mock.calls.length === 1)).toBe(true);
  });
  it('same-value repeats commit/release without UPDATE; NULL initializes then reloads', async () => {
    const s = memoryStore();
    await setLedger37AiDisplay(toggle(201, false));
    await setLedger37AiDisplay(toggle(201, true));
    await setLedger37AiDisplay(toggle(201, true));
    expect(s.writes()).toHaveLength(1); expect(s.transactions).toHaveLength(3);
    s.rows.get(202)!.initial_balances = null;
    await setLedger37AiDisplay(toggle(202, false));
    expect((await getLedger37PresentationContext(member(202))).aiEnabled).toBe(false);
    expect(s.rows.get(202)!.initial_balances).toBe(`{"${key}":0}`);
  });
  it.each(['update', 'cas', 'commit'] as Fault[])('%s failure retains previously committed ON and all other raw JSON', async fault => {
    const s = memoryStore(); await setLedger37AiDisplay(toggle(201, true));
    const before = s.rows.get(201)!.initial_balances;
    s.fault(fault);
    await expect(setLedger37AiDisplay(toggle(201, false))).rejects.toThrow();
    expect((await getLedger37PresentationContext(member(201))).aiEnabled).toBe(true);
    expect(s.rows.get(201)!.initial_balances).toBe(before); expect(s.rows.get(202)!.initial_balances).toBe(rawB);
    expect(s.transactions[1].rollback).toHaveBeenCalledOnce(); expect(s.transactions[1].release).toHaveBeenCalledOnce();
  });
  it('rollback failure exposes AggregateError and still releases, never reports success', async () => {
    const s = memoryStore(); s.fault('rollback');
    const error = await setLedger37AiDisplay(toggle(201, true)).catch(value => value);
    expect(error).toBeInstanceOf(AggregateError); expect(error.errors).toHaveLength(2);
    expect(s.transactions[0].release).toHaveBeenCalledOnce();
    // This fake discards staged data on release; real rollback failure is NOT a DB durability assertion.
  });
  it('independent concurrent members commit without losing either switch or precision', async () => {
    const s = memoryStore();
    await Promise.all([setLedger37AiDisplay(toggle(201, true)), setLedger37AiDisplay(toggle(202, true))]);
    expect((await getLedger37PresentationContext(member(201))).aiEnabled).toBe(true);
    expect((await getLedger37PresentationContext(member(202))).aiEnabled).toBe(true);
    expect(s.rows.get(201)!.initial_balances).toBe(rawA.replace(`"${key}" : 0`, `"${key}" : 1`));
    expect(s.rows.get(202)!.initial_balances).toBe(rawB.replace(`"${key}":0`, `"${key}":1`));
  });
  it('concurrent failed member transaction does not undo another member committed setting', async () => {
    const s = memoryStore(); s.fault('commit');
    const results = await Promise.allSettled([setLedger37AiDisplay(toggle(201, true)), setLedger37AiDisplay(toggle(202, true))]);
    expect(results.map(r => r.status)).toEqual(['rejected', 'fulfilled']);
    expect(s.rows.get(201)!.initial_balances).toBe(rawA);
    expect((await getLedger37PresentationContext(member(202))).aiEnabled).toBe(true);
  });
  it('same-member concurrent on then off serializes; shared-lock sibling writer is preserved', async () => {
    const s = memoryStore();
    await Promise.all([setLedger37AiDisplay(toggle(201, true)), setLedger37AiDisplay(toggle(201, false))]);
    expect(s.rows.get(201)!.initial_balances).toBe(rawA);
    await Promise.all([s.siblingWrite(201), setLedger37AiDisplay(toggle(201, true))]);
    expect(s.rows.get(201)!.initial_balances).toBe(rawA.replace('900719925474099312345', '900719925474099312346').replace(`"${key}" : 0`, `"${key}" : 1`));
    expect(s.rows.get(202)!.initial_balances).toBe(rawB);
  });
  it('fresh get cannot see staged ON until commit completes', async () => {
    const s = memoryStore(), gate = deferred(); s.commitGate(gate);
    const saving = setLedger37AiDisplay(toggle(201, true));
    await vi.waitFor(() => expect(s.transactions[0]?.commit).toHaveBeenCalledOnce());
    expect((await getLedger37PresentationContext(member(201))).aiEnabled).toBe(false);
    gate.resolve(); await saving;
    expect((await getLedger37PresentationContext(member(201))).aiEnabled).toBe(true);
  });
  it.each(['member', 'owner', 'admin'])('actual ledger owner with role %s may save, nonowner may not', async role => {
    const s = memoryStore(); s.rows.get(100)!.role = role;
    await setLedger37AiDisplay(toggle(201, true));
    s.rows.get(100)!.role = 'member';
    await expect(setLedger37AiDisplay({ ...toggle(201, false), userId: 201 })).rejects.toThrow('所有者');
    expect((await getLedger37PresentationContext(member(201))).aiEnabled).toBe(true);
  });
  it.each(['admin', 'super_admin', 'systemadmin'])('nonowner system %s cannot save without ledger membership', async systemRole => {
    const s = memoryStore(); s.rows.delete(100);
    await expect(setLedger37AiDisplay({ ...toggle(201, true), userId: 999, systemRole })).rejects.toThrow('所有者');
    expect((await getLedger37PresentationContext(member(201))).aiEnabled).toBe(false); expect(s.writes()).toHaveLength(0);
    await expect(setLedger37AiDisplay({ ...toggle(201, false), systemRole, isViewingAs: true })).rejects.toThrow('代看');
  });
  it.each(['PREVIEW_READONLY', 'DEV_BYPASS_AUTH'])('%s blocks before transaction acquisition; target membership required', async name => {
    const s = memoryStore(); vi.stubEnv(name, 'true');
    await expect(setLedger37AiDisplay(toggle(201, true))).rejects.toThrow('只读预览');
    expect(deps.tx).not.toHaveBeenCalled(); expect(s.writes()).toHaveLength(0);
    vi.stubEnv(name, 'false');
    await expect(setLedger37AiDisplay(toggle(999, true))).rejects.toThrow('目标用户');
  });
});

// A stale callback is different from an already-started request completing after navigation.
// Execute the actual save callback independently; no real database or network is used.
describe('independent actual frontend AST: stale save callback entry guard', () => {
  it.each(['38:1:self', '37:2:self', '38:2:self', '37:1:readonly', '37:1:self'])('旧回调scope %s须零请求；当前scope正常保存', async currentScope => {
    const source = readFileSync(new URL('../client/src/pages/LedgerAAInitialBalance.tsx', import.meta.url), 'utf8');
    const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let expression: ts.Expression | undefined;
    function visit(node: ts.Node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'saveLedger37AiDisplay') expression = node.initializer;
      ts.forEachChild(node, visit);
    }
    visit(ast); expect(expression).toBeDefined();
    const overrides: Record<string, any> = {};
    const ref = { current: overrides }, saving = { current: new Set<string>() }, view = { current: currentScope };
    const mutateAsync = vi.fn().mockResolvedValue({ success: true, aiEnabled: true });
    const scope: Record<string, any> = {
      canManageLedger37Ai: true, isLedger37AiReadonlyView: () => false,
      allBalancesData: { members: [{ userId: 201 }] }, ledgerId: 37, user: { id: 1 },
      ledger37AiDisplayScope: (ledgerId: number, userId: number) => `${ledgerId}:${userId}`,
      ledger37AiSavingRef: saving, setLedger37AiSavingScopes: vi.fn(),
      ledger37AiRequestIdRef: { current: 0 }, ledger37AiViewScopeRef: view,
      ledger37AiDisplayOverridesRef: ref,
      updateLedger37AiDisplayOverrides: (update: any) => { ref.current = update(ref.current); },
      ledger37AiDisplayMutation: { mutateAsync }, ledger37AiServerReadVersionsRef: { current: {} },
      queryUtils: { ledger: { adminGetAllInitialBalances: { setData: vi.fn(), getData: vi.fn(), invalidate: vi.fn() } } },
      queryClient: { invalidateQueries: vi.fn() }, ledger37AiCachePatchRef: { current: null },
      LEDGER37_AI_DISPLAY_KEY: key, toast: { success: vi.fn(), error: vi.fn() },
    };
    const js = ts.transpileModule(`const handler = ${expression!.getText(ast)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    const staleSave = new Function(...Object.keys(scope), `${js}; return handler;`)(...Object.values(scope));
    const result = await staleSave(201, true);
    if (currentScope === '37:1:self') {
      expect(result).toBe(true);
      expect(mutateAsync).toHaveBeenCalledTimes(1);
      expect(mutateAsync).toHaveBeenCalledWith({ ledgerId: 37, targetUserId: 201, enabled: true });
      expect(scope.queryUtils.ledger.adminGetAllInitialBalances.setData).toHaveBeenCalledTimes(1);
    } else {
      expect(result).toBe(false);
      expect(mutateAsync).not.toHaveBeenCalled();
      expect(scope.setLedger37AiSavingScopes).not.toHaveBeenCalled();
      expect(scope.ledger37AiRequestIdRef.current).toBe(0);
      expect(ref.current).toEqual({});
      expect(scope.queryUtils.ledger.adminGetAllInitialBalances.setData).not.toHaveBeenCalled();
      expect(scope.queryClient.invalidateQueries).not.toHaveBeenCalled();
      expect(scope.toast.success).not.toHaveBeenCalled();
    }
  });
});
