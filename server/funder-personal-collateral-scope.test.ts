import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { assertFunderPersonalCollateralReleaseScope as assertScope, assertFunderJointCollateralReleaseScope as assertJoint } from './funder-personal-collateral-scope';

const scope = { ledgerId: 52, orderId: 130, userId: 1 };
const evidence = (userId = 1) => ({ version: 2, evidenceScope: { ...scope, userId, sourceKind: 'individual_snapshot', jointSegmentId: null as string | null } });
const settled = (userId = 1) => ({ status: 'settled', settlement_snapshot: evidence(userId), joint_order_segments: [] });
const jointPart = (id: string, userId = 1) => ({ id, owner_user_id: userId, status: 'settled', settlement_snapshot: { version: 2, evidenceScope: { ...scope, userId, jointSegmentId: id, sourceKind: id === '__primary__' ? 'joint_primary' : 'joint_segment' } } });

describe('personal collateral release scope', () => {
  it('accepts matched settled evidence without treating physical owner as superior', () => {
    expect(() => assertScope(settled(), scope)).not.toThrow();
    expect(() => assertScope(settled(2), { ...scope, userId: 2 })).not.toThrow();
  });
  it.each(['active', 'cancelled', ''])('rejects non-final personal state %s', status => {
    expect(() => assertScope({ ...settled(), status }, scope)).toThrow('尚未结清');
  });
  it.each(['ledgerId', 'orderId', 'userId'])('rejects different evidence %s', key => {
    const snapshot = settled(); (snapshot.settlement_snapshot.evidenceScope as any)[key] += 1;
    expect(() => assertScope(snapshot, scope)).toThrow('归属不一致');
  });
  it('does not automatically release legacy settled state lacking evidence', () => {
    expect(() => assertScope({ status: 'settled' }, scope)).toThrow('归属不一致');
  });
  it('rejects malformed and uncompleted joint segments', () => {
    expect(() => assertScope({ ...settled(), joint_order_segments: 'bad' }, scope)).toThrow('记录异常');
    expect(() => assertScope({ ...settled(), joint_order_segments: [{ id: 's1', status: 'active' }] }, scope)).toThrow('未结清');
  });
  it('fully settled joint cleanup still requires all parts to belong to this user', () => {
    const primary = jointPart('__primary__');
    const snapshot = { status: 'settled', settlement_snapshot: primary.settlement_snapshot, joint_order_primary_settlement: primary, joint_order_segments: [jointPart('s1')] };
    expect(() => assertScope(snapshot, scope)).not.toThrow();
    snapshot.joint_order_segments[0].owner_user_id = 2;
    expect(() => assertScope(snapshot, scope)).toThrow('未结清');
  });
  it('single-segment evidence cannot authorize entire personal order release', () => {
    expect(() => assertScope({ ...settled(), settlement_snapshot: jointPart('s1').settlement_snapshot }, scope)).toThrow('单段');
  });
  it('joint retry evidence must match exact user and segment', () => {
    expect(() => assertJoint(jointPart('s1'), { ...scope, jointSegmentId: 's1' })).not.toThrow();
    expect(() => assertJoint(jointPart('s1'), { ...scope, jointSegmentId: 's2' })).toThrow('分段不一致');
    expect(() => assertJoint(jointPart('s1', 2), { ...scope, jointSegmentId: 's1' })).toThrow('归属不一致');
  });
});

// Extract just the real mutation; NEVER import routers/db, run scanners, DDL or real networking.
const source = ts.createSourceFile('routers.ts', readFileSync(new URL('./routers.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function mutationText(name: string): string {
  let result = '';
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === name) {
      const find = (child: ts.Node) => {
        if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression) && child.expression.name.text === 'mutation') result = child.arguments[0].getText(source);
        else ts.forEachChild(child, find);
      };
      find(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(source); if (!result) throw new Error('Missing real route: ' + name); return result;
}
const callbackText = mutationText('funderSettleIndividualOrder');
const jointText = mutationText('funderSettleJointOrderSegments');

function harness() {
  const h: any = {
    participants: [1, 2].map(user => ({ id: user + 100, user_id: user, role: 'owner', order_snapshot: JSON.stringify({ status: 'active', joint_order_segments: [] }) })),
    locks: [{ id: 24, order: 130, user: 1, amount: 18n, active: true }, { id: 35, order: 130, user: 2, amount: 18n, active: true }, { id: 17, order: 249, user: 1, amount: 10n, active: true }],
    balances: new Map([[1, { available: 0n, frozen: 28n }], [2, { available: 3n, frozen: 20n }]]),
    trace: [] as any[], commits: 0, rollbacks: 0, builds: 0, role: 'owner', failFunding: false,
  };
  let undo: any;
  const conn = {
    beginTransaction: async () => { undo = structuredClone({ participants: h.participants, locks: h.locks, balances: h.balances }); },
    commit: async () => { h.commits++; },
    rollback: async () => { h.rollbacks++; Object.assign(h, undo); }, release: () => {},
    execute: async (raw: string, values: any[]) => {
      const sql = raw.replace(/\s+/g, ' ').trim(); h.trace.push(['sql', sql, values]);
      if (sql.startsWith('SELECT * FROM ledger_orders')) return [[{ id: 130, ledger_id: 52, user_id: 1, status: 'active' }]];
      if (sql.startsWith('SELECT role FROM ledger_members')) return [[{ role: h.actorRole ?? h.role }]];
      if (sql.startsWith('SELECT p.id AS participant_id')) return [[{ id: 130, user_id: 1, participant_id: 101, status: 'active', order_snapshot: h.participants[0].order_snapshot }]];
      if (sql.includes('FROM ledger_order_participants')) return [structuredClone(h.participants)];
      if (sql.startsWith('UPDATE ledger_order_participants')) {
        expect(values.slice(2)).toEqual([130, 52, values[1] - 100]);
        const p = h.participants.find((p: any) => p.id === values[1]); p.order_snapshot = values[0]; return [{ affectedRows: 1 }];
      }
      throw new Error('Unsupported isolated SQL: ' + sql);
    },
  };
  const deps = {
    TRPCError, console: { error: () => {} }, sql: () => 'role', asRows: (rows: any) => rows,
    getLedgerDb: async () => ({ execute: async () => [[{ role: h.role }]] }),
    ensureFunderParticipantSnapshotColumns: async () => {}, getDbTransactionConnection: async () => conn,
    buildFunderParticipantSnapshot: (x: any) => ({ ...x }), parseFunderParticipantSnapshot: (x: any) => JSON.parse(x),
    syncFunderParticipantSharedAssetSnapshot: (x: any) => x, syncFunderParticipantCollateralSnapshot: (x: any) => x,
    buildFunderSettlementSnapshot: async (...args: any[]) => { h.builds++; return { version: 2, evidenceScope: args.at(-1) }; },
    assertFunderPersonalCollateralReleaseScope: assertScope,
    assertFunderJointCollateralReleaseScope: assertJoint,
    lockLedgerWalletUsersForUpdate: async (tx: any, ids: number[]) => { expect(tx).toBe(conn); h.trace.push(['prelock', [...ids]]); },
    dbMultiAssetWallet: { releaseWalletCollateralLocksForOrder: async (params: any) => {
      expect(params.transaction).toBe(conn); expect(params.ledgerId).toBe(52); expect(params.userId).toBeGreaterThan(0);
      h.trace.push(['release', params.userId]); let releasedCount = 0;
      for (const lock of h.locks.filter((l: any) => l.active && l.order === params.orderId && l.user === params.userId
        && (!params.jointSegmentId || (l.segment || '__primary__') === params.jointSegmentId))) {
        const balance = h.balances.get(lock.user); balance.available += lock.amount; balance.frozen -= lock.amount; lock.active = false; releasedCount++;
      }
      return { releasedCount };
    } },
    releaseLedger52FundingCollateralHoldsForOrder: async (params: any) => {
      expect(params.transaction).toBe(conn); expect(params.prelockedUserIds).toContain(params.userId);
      if (h.failFunding) throw new Error('offline funding release failed'); return { releasedCount: 0 };
    },
  };
  const compiled = ts.transpileModule(`const callback = ${callbackText}; callback;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  h.run = runInNewContext(compiled, deps);
  h.call = (userIds = [1]) => h.run({ ctx: { user: { id: 99 } }, input: { ledgerId: 52, orderId: 130, userIds, interestEndDate: '2026-11-23' } });
  h.jointRun = runInNewContext(ts.transpileModule(`const jointCallback = ${jointText}; jointCallback;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, deps);
  h.jointCall = (ids = ['__primary__']) => h.jointRun({ ctx: { user: { id: 99 } }, input: { ledgerId: 52, orderId: 130, userId: 1, segments: ids.map(segmentId => ({ segmentId, interestEndDate: '2026-11-23' })) } });
  return h;
}

describe('real individual settlement route with isolated transaction', () => {
  it('settles Xiaopang and releases only his 18ETH, preserving Ocean and other order 10ETH', async () => {
    const h = harness(); const result = await h.call();
    expect(result.releasedCollateralCount).toBe(1); expect(h.balances.get(1)).toEqual({ available: 18n, frozen: 10n });
    expect(h.balances.get(2)).toEqual({ available: 3n, frozen: 20n }); expect(h.locks.filter((l: any) => l.active).map((l: any) => l.id)).toEqual([35, 17]);
    expect(JSON.parse(h.participants[0].order_snapshot).status).toBe('settled'); expect(JSON.parse(h.participants[1].order_snapshot).status).toBe('active');
    expect(h.commits).toBe(1);
  });
  it('all selected people release exactly both 18ETH locks after ascending prelock', async () => {
    const h = harness(); const result = await h.call([2, 1, 2]);
    expect(result.releasedCollateralCount).toBe(2); expect(h.trace.find((t: any) => t[0] === 'prelock')).toEqual(['prelock', [1, 2]]);
    expect(h.trace.filter((t: any) => t[0] === 'release').map((t: any) => t[1])).toEqual([1, 2]);
    expect(h.balances.get(2)).toEqual({ available: 21n, frozen: 2n }); expect(h.locks.find((l: any) => l.id === 17).active).toBe(true);
  });
  it('repeat is idempotent and does not rebuild settlement evidence', async () => {
    const h = harness(); await h.call(); const original = h.participants[0].order_snapshot; await h.call();
    expect(h.builds).toBe(1); expect(h.participants[0].order_snapshot).toBe(original); expect(h.balances.get(1)).toEqual({ available: 18n, frozen: 10n });
  });
  it('repairs old matching settled evidence without rewriting historical record', async () => {
    const h = harness(); h.participants[0].order_snapshot = JSON.stringify(settled()); const original = h.participants[0].order_snapshot;
    await h.call(); expect(h.builds).toBe(0); expect(h.participants[0].order_snapshot).toBe(original); expect(h.balances.get(1).frozen).toBe(10n);
  });
  it('release failure rolls back both wallet and settlement status, with no success commit', async () => {
    const h = harness(); h.failFunding = true; await expect(h.call()).rejects.toThrow('结清所选订单视图失败');
    expect(h.balances.get(1)).toEqual({ available: 0n, frozen: 28n }); expect(h.locks[0].active).toBe(true); expect(JSON.parse(h.participants[0].order_snapshot).status).toBe('active');
    expect(h.commits).toBe(0); expect(h.rollbacks).toBe(1);
  });
  it('rejects another person, mismatched old evidence and unresolved joint route', async () => {
    const h = harness(); await expect(h.call([3])).rejects.toThrow('不是此订单');
    h.participants[0].order_snapshot = JSON.stringify(settled(2)); await expect(h.call()).rejects.toThrow('归属不一致');
    h.participants[0].order_snapshot = JSON.stringify({ status: 'active', joint_order_segments: [{ id: 's1', status: 'active' }] });
    await expect(h.call()).rejects.toThrow('分段结清'); expect(h.locks[0].active).toBe(true);
  });
  it('ordinary member cannot perform settlement or move balances', async () => {
    const h = harness(); h.role = 'member'; await expect(h.call()).rejects.toThrow('无权'); expect(h.commits).toBe(0); expect(h.locks[0].active).toBe(true);
  });
  it('joint route always supplies userId for both segment release and old-lock cleanup', () => {
    const calls = jointText.match(/(?:dbMultiAssetWallet\.)?release(?:WalletCollateralLocksForOrder|Ledger52FundingCollateralHoldsForOrder)\(\{[\s\S]*?\}\)/g) || [];
    expect(calls).toHaveLength(4); for (const text of calls) expect(text).toContain('userId: input.userId');
    expect(jointText).toContain('input.ledgerId === 52');
  });
});

describe('real joint settlement route with isolated transaction', () => {
  const jointHarness = () => {
    const h = harness();
    h.participants[0].order_snapshot = JSON.stringify({ status: 'active', joint_order_segments: [{ id: 's1', owner_user_id: 1, status: 'active' }] });
    h.locks.push({ id: 50, order: 130, user: 1, amount: 2n, active: true, segment: 's1' });
    h.balances.get(1).frozen += 2n;
    return h;
  };
  it('selected primary unlocks only its owner; unfinished s1 and other owner stay frozen', async () => {
    const h = jointHarness(); await h.jointCall();
    expect(h.balances.get(1)).toEqual({ available: 18n, frozen: 12n });
    expect(h.balances.get(2)).toEqual({ available: 3n, frozen: 20n });
    expect(h.locks.find((l: any) => l.id === 50).active).toBe(true);
    expect(JSON.parse(h.participants[0].order_snapshot).status).toBe('active');
  });
  it('retry of old completed primary repairs its matching lock without rebuilding evidence', async () => {
    const h = jointHarness(); const snapshot = JSON.parse(h.participants[0].order_snapshot);
    snapshot.joint_order_primary_settlement = jointPart('__primary__'); h.participants[0].order_snapshot = JSON.stringify(snapshot);
    await h.jointCall(); expect(h.builds).toBe(0); expect(h.locks[0].active).toBe(false); expect(h.locks[1].active).toBe(true);
    await h.jointCall(); expect(h.balances.get(1)).toEqual({ available: 18n, frozen: 12n });
  });
  it('all parts settled clean up only current user and keep another same-name segment frozen', async () => {
    const h = jointHarness(); h.locks.push({ id: 51, order: 130, user: 2, amount: 2n, active: true, segment: 's1' });
    h.balances.get(2).frozen += 2n; const result = await h.jointCall(['__primary__', 's1']);
    expect(result.allSegmentsSettled).toBe(true); expect(h.balances.get(1)).toEqual({ available: 20n, frozen: 10n });
    expect(h.locks.filter((l: any) => l.active).map((l: any) => l.id)).toEqual([35, 17, 51]);
  });
  it('transaction-current revoked administrator cannot settle or release', async () => {
    const h = jointHarness(); h.actorRole = 'member'; await expect(h.jointCall()).rejects.toThrow('权限已变化');
    expect(h.commits).toBe(0); expect(h.locks[0].active).toBe(true);
  });
  it('wrong old segment evidence rejects before any release', async () => {
    const h = jointHarness(); const snapshot = JSON.parse(h.participants[0].order_snapshot);
    snapshot.joint_order_primary_settlement = jointPart('__primary__', 2); h.participants[0].order_snapshot = JSON.stringify(snapshot);
    await expect(h.jointCall()).rejects.toThrow('归属不一致'); expect(h.locks[0].active).toBe(true); expect(h.commits).toBe(0);
  });
});
