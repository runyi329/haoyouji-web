import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { assertLedger37OrderReferenceRead, ledger37OrderReferenceSchema } from './ledger37-order-reference';

const ACTOR = 101;
const OTHER = 202;
const MANAGER = 303;
const ORDER = 401;
const TAG = '脱敏引用A';
const PRIVATE_TAG = '脱敏个人引用B';
type Source = Record<string, unknown>;
type Kind = 'config' | 'summary' | 'valuation' | 'interest';

/** These are offline relational fixtures, not application/UI mock data or a live DB connection. */
function fixture(source: unknown = { ledgerId: 37, tagName: TAG }) {
  const members = [
    { id: 1, ledgerId: 52, userId: ACTOR, role: 'funder', member_type: 'real' },
    { id: 2, ledgerId: 52, userId: OTHER, role: 'member', member_type: 'real' },
    { id: 3, ledgerId: 52, userId: MANAGER, role: 'admin', member_type: 'real' },
  ];
  const orders = [{ id: ORDER, ledger_id: 52, user_id: ACTOR, order_role: 'finance', status: 'active',
    deleted_at: null as unknown, collateral_source: source }];
  const participants = [ACTOR, OTHER].map((userId, i) => ({
    id: 10 + i, order_id: ORDER, ledger_id: 52, user_id: userId, role: 'owner',
    order_snapshot: JSON.stringify({ collateral_share_mode: 'none', collateral_source: { ledgerId: 37, tagName: PRIVATE_TAG } }) as unknown,
  }));
  const execute = vi.fn(async (sql: string, args: any[]) => {
    expect(sql.trim()).toMatch(/^SELECT\s/i);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|REPLACE|FOR\s+UPDATE)\b/i);
    expect(sql).not.toMatch(/\b(?:ledger_records|tag_interest_periods|ledger_categories|users)\b/);
    expect(sql).not.toMatch(/SELECT\s+\*/i);
    expect(args).toHaveLength(7);
    const [memberLedger, actorId, orderId, orderLedger, userId, viewingAs] = args;
    expect(memberLedger).toBe(52);
    expect(orderLedger).toBe(52);
    const m = members.find(m => m.ledgerId === memberLedger && m.userId === actorId);
    const o = orders.find(o => o.id === orderId && o.ledger_id === orderLedger && o.deleted_at == null
      && ['finance', 'funder'].includes(o.order_role));
    const manager = m?.member_type === 'real' && ['owner', 'admin'].includes(m.role) && !viewingAs;
    const target = userId ?? (manager ? o?.user_id : actorId);
    const p = participants.find(p => p.order_id === o?.id && p.ledger_id === o?.ledger_id
      && p.user_id === target && !['inactive', 'deleted'].includes(p.role));
    return [[{
      member_id: m?.id, member_ledger_id: m?.ledgerId, member_user_id: m?.userId,
      member_role: m?.role, member_type: m?.member_type,
      order_id: o?.id, order_ledger_id: o?.ledger_id, order_owner_user_id: o?.user_id,
      order_role: o?.order_role, order_status: o?.status, order_deleted_at: o?.deleted_at,
      collateral_source: o?.collateral_source,
      participant_id: p?.id, participant_order_id: p?.order_id, participant_ledger_id: p?.ledger_id,
      participant_user_id: p?.user_id, participant_role: p?.role, order_snapshot: p?.order_snapshot,
    }], []];
  });
  const connection = { execute };
  const read = (options: { actor?: number; userId?: number; orderId?: number; ledgerId?: number;
    tagName?: string; kind?: Kind; isViewingAs?: boolean } = {}) => assertLedger37OrderReferenceRead(
    { user: { id: options.actor ?? ACTOR }, isViewingAs: options.isViewingAs },
    { ledgerId: options.ledgerId ?? 37, tagName: options.tagName ?? TAG,
      reference52: { orderId: options.orderId ?? ORDER, ...(options.userId === undefined ? {} : { userId: options.userId }) } },
    options.kind ?? 'summary', connection,
  );
  return { members, orders, participants, execute, connection, read };
}

async function denied(promise: Promise<unknown>, code: 'FORBIDDEN' | 'BAD_REQUEST' | 'NOT_FOUND' | 'INTERNAL_SERVER_ERROR') {
  await expect(promise).rejects.toMatchObject({ name: 'TRPCError', code });
}

describe('ledger37OrderReferenceSchema', () => {
  it('is strict with positive safe integer orderId and optional userId', () => {
    expect(ledger37OrderReferenceSchema.parse({ orderId: ORDER })).toEqual({ orderId: ORDER });
    expect(ledger37OrderReferenceSchema.parse({ orderId: Number.MAX_SAFE_INTEGER, userId: ACTOR })).toBeDefined();
    for (const value of [null, {}, { orderId: '401' }, { orderId: 0 }, { orderId: -1 }, { orderId: 1.1 },
      { orderId: Infinity }, { orderId: Number.MAX_SAFE_INTEGER + 1 }, { orderId: ORDER, userId: 0 },
      { orderId: ORDER, userId: 1.2 }, { orderId: ORDER, userId: null }, { orderId: ORDER, userId: Number.MAX_SAFE_INTEGER + 1 },
      { orderId: ORDER, tagName: '伪造' }]) expect(ledger37OrderReferenceSchema.safeParse(value).success).toBe(false);
  });
});

describe('52-order reference read boundary without any ledger-37 identity', () => {
  it.each(['config', 'summary', 'valuation'] as Kind[])('allows main-owner %s with no 37 member, owner or AI view', async kind => {
    const f = fixture();
    expect(await f.read({ kind })).toBe(true);
    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.members.every(m => m.ledgerId === 52)).toBe(true);
  });
  it.each(['config', 'summary', 'valuation'] as Kind[])('physical main-owner %s needs no redundant participant relation', async kind => {
    const f = fixture(); f.participants.length = 0;
    expect(await f.read({ kind })).toBe(true);
    expect(await f.read({ kind, userId: ACTOR })).toBe(true);
    expect(await f.read({ actor: MANAGER, kind, userId: ACTOR })).toBe(true);
    await denied(f.read({ actor: OTHER, kind }), 'FORBIDDEN');
    expect(f.participants).toHaveLength(0);
  });
  it('real two-order source shapes retain their distinct interest switches with no participant rows', async () => {
    const sources = [
      { tagName: TAG, ledgerId: 37, useInterest: false, useCollateral: true, useMarginRate: false,
        useFloatingPnl: true, usePaidInterest: false, collateralTagName: TAG, floatingPnlTagName: TAG,
        usePendingInterest: false, floatingPnlCalculationMode: 'raw_net_pnl' },
      { tagName: TAG, ledgerId: 37, useInterest: true, useCollateral: true, useMarginRate: false,
        useFloatingPnl: true, interestTagName: TAG, usePaidInterest: true, collateralTagName: TAG,
        floatingPnlTagName: TAG, usePendingInterest: true, paidInterestTagName: TAG,
        pendingInterestTagName: TAG, floatingPnlCalculationMode: 'raw_net_pnl' },
    ];
    for (const [index, source] of sources.entries()) {
      // Production configurations were verified read-only; names and identities are redacted here.
      const f = fixture(source); f.participants.length = 0;
      for (const kind of ['config', 'summary', 'valuation'] as Kind[]) expect(await f.read({ kind })).toBe(true);
      if (index === 1) expect(await f.read({ kind: 'interest' })).toBe(true);
      else await denied(f.read({ kind: 'interest' }), 'FORBIDDEN');
    }
  });
  it('absence returns false before validation or reading, preserving every original interface guard', async () => {
    const execute = vi.fn();
    expect(await assertLedger37OrderReferenceRead({ user: { id: ACTOR } }, { ledgerId: 999 }, 'interest', { execute })).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
  it('an explicitly invalid scope never falls back', async () => {
    const f = fixture();
    for (const reference52 of [null, {}, { orderId: 0 }, { orderId: ORDER, userId: OTHER, extra: 1 }]) {
      await denied(assertLedger37OrderReferenceRead({ user: { id: ACTOR } }, { ledgerId: 37, tagName: TAG, reference52 } as any,
        'summary', f.connection), 'BAD_REQUEST');
    }
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('another person cannot use the order or its main-owner tag without their own participant', async () => {
    const f = fixture(); f.participants.pop();
    await denied(f.read({ actor: OTHER }), 'FORBIDDEN');
  });
  it('an order co-owner is not a 52 manager and cannot inspect another private scope', async () => {
    const f = fixture();
    await denied(f.read({ userId: OTHER, tagName: PRIVATE_TAG }), 'FORBIDDEN');
    await denied(f.read({ actor: OTHER, userId: ACTOR }), 'FORBIDDEN');
  });
  it('main owner uses physical collateral_source even when its snapshot has a different private reference', async () => {
    const f = fixture();
    expect(await f.read({ userId: ACTOR })).toBe(true);
    await denied(f.read({ userId: ACTOR, tagName: PRIVATE_TAG }), 'FORBIDDEN');
  });
  it('ordinary participant defaults to its saved private snapshot, never the main order', async () => {
    const f = fixture();
    expect(await f.read({ actor: OTHER, tagName: PRIVATE_TAG })).toBe(true);
    expect(await f.read({ actor: OTHER, userId: OTHER, tagName: PRIVATE_TAG })).toBe(true);
    await denied(f.read({ actor: OTHER }), 'FORBIDDEN');
  });
  it.each(['owner', 'admin'])('real 52 %s manager may inspect each valid order view', async role => {
    const f = fixture(); f.members[2].role = role;
    expect(await f.read({ actor: MANAGER })).toBe(true);
    expect(await f.read({ actor: MANAGER, userId: ACTOR })).toBe(true);
    expect(await f.read({ actor: MANAGER, userId: OTHER, tagName: PRIVATE_TAG })).toBe(true);
    await denied(f.read({ actor: MANAGER, userId: OTHER }), 'FORBIDDEN');
  });
  it('manager cannot select a non-participant view', async () => {
    const f = fixture();
    await denied(f.read({ actor: MANAGER, userId: MANAGER }), 'FORBIDDEN');
  });
  it('AI-typed 52 member cannot elevate an owner/admin role to manager', async () => {
    const f = fixture(); f.members[2].member_type = 'ai';
    await denied(f.read({ actor: MANAGER, userId: OTHER, tagName: PRIVATE_TAG }), 'FORBIDDEN');
  });
  it('AI-typed ordinary membership imposes no ledger-37 AI permission requirement', async () => {
    const f = fixture(); f.members[0].member_type = 'ai';
    expect(await f.read()).toBe(true);
  });
  it('view-as uses the effective user, allows their own view, and never elevates management', async () => {
    const f = fixture();
    expect(await f.read({ actor: OTHER, tagName: PRIVATE_TAG, isViewingAs: true })).toBe(true);
    await denied(f.read({ actor: OTHER, userId: ACTOR, isViewingAs: true }), 'FORBIDDEN');
    await denied(f.read({ actor: MANAGER, userId: OTHER, tagName: PRIVATE_TAG, isViewingAs: true }), 'FORBIDDEN');
    await denied(f.read({ actor: MANAGER, isViewingAs: true }), 'FORBIDDEN');
  });
  it('a viewed-as manager who is an actual participant keeps only its own snapshot', async () => {
    const f = fixture(); f.members[1].role = 'admin';
    expect(await f.read({ actor: OTHER, tagName: PRIVATE_TAG, isViewingAs: true })).toBe(true);
  });
  it('nonmembers cannot use even a valid participant and system-admin-like extra context', async () => {
    const f = fixture(); f.members.shift();
    await denied(f.read(), 'FORBIDDEN');
    await denied(assertLedger37OrderReferenceRead({ user: { id: ACTOR, role: 'super_admin' }, realUser: { id: MANAGER } } as any,
      { ledgerId: 37, tagName: TAG, reference52: { orderId: ORDER } }, 'summary', f.connection), 'FORBIDDEN');
  });
  it.each(['inactive', 'deleted'])('rejects %s participant relationships', async role => {
    const f = fixture(); f.participants[1].role = role;
    await denied(f.read({ actor: OTHER, tagName: PRIVATE_TAG }), 'FORBIDDEN');
  });
  it.each(['inactive', 'deleted'])('rejects %s order status', async status => {
    const f = fixture(); f.orders[0].status = status;
    await denied(f.read(), 'NOT_FOUND');
  });
  it.each(['inactive', 'deleted'])('rejects %s personal snapshot', async status => {
    const f = fixture(); f.participants[1].order_snapshot = { status, collateral_source: { ledgerId: 37, tagName: PRIVATE_TAG } };
    await denied(f.read({ actor: OTHER, tagName: PRIVATE_TAG }), 'FORBIDDEN');
  });
  it.each(['settled', 'completed'])('does not confuse retained %s orders with deletion', async status => {
    const f = fixture(); f.orders[0].status = status;
    expect(await f.read()).toBe(true);
  });
  it('rejects deleted, missing, cross-ledger and non-finance orders', async () => {
    let f = fixture(); f.orders[0].deleted_at = '2026-01-01'; await denied(f.read(), 'NOT_FOUND');
    f = fixture(); await denied(f.read({ orderId: 999 }), 'NOT_FOUND');
    f = fixture(); f.orders[0].ledger_id = 53; await denied(f.read(), 'NOT_FOUND');
    f = fixture(); f.orders[0].order_role = 'unrelated'; await denied(f.read(), 'NOT_FOUND');
    f = fixture(); f.orders[0].order_role = 'funder'; expect(await f.read()).toBe(true);
  });
  it('rejects cross-ledger participant/membership and wrong-order participant', async () => {
    let f = fixture(); f.participants[1].ledger_id = 53; await denied(f.read({ actor: OTHER, tagName: PRIVATE_TAG }), 'FORBIDDEN');
    f = fixture(); f.members[0].ledgerId = 37; await denied(f.read(), 'FORBIDDEN');
    f = fixture(); f.participants[1].order_id = 999; await denied(f.read({ actor: OTHER, tagName: PRIVATE_TAG }), 'FORBIDDEN');
  });
  it('rejects a forged target ledger before reading', async () => {
    const f = fixture(); await denied(f.read({ ledgerId: 52 }), 'BAD_REQUEST');
    expect(f.execute).not.toHaveBeenCalled();
  });
});

describe('personal source projection matches existing pure collateral sync semantics', () => {
  it('only explicit cross without override reads the latest physical source', async () => {
    const f = fixture(); f.participants[1].order_snapshot = { collateral_share_mode: 'cross', collateral_source: { ledgerId: 37, tagName: PRIVATE_TAG } };
    expect(await f.read({ actor: OTHER })).toBe(true);
    await denied(f.read({ actor: OTHER, tagName: PRIVATE_TAG }), 'FORBIDDEN');
  });
  it.each(['none', 'self', undefined])('non-cross %s never falls back to the main order', async mode => {
    const f = fixture(); f.participants[1].order_snapshot = { collateral_share_mode: mode };
    await denied(f.read({ actor: OTHER }), 'BAD_REQUEST');
  });
  it('an explicit personal override keeps private collateral even in cross mode', async () => {
    const f = fixture(); f.participants[1].order_snapshot = { collateral_share_mode: 'cross', participant_collateral_override: true,
      collateral_source: { ledgerId: 37, tagName: PRIVATE_TAG } };
    expect(await f.read({ actor: OTHER, tagName: PRIVATE_TAG })).toBe(true);
    await denied(f.read({ actor: OTHER }), 'FORBIDDEN');
  });
  it('does not repair, initialize or use the main order for a missing/corrupt personal snapshot', async () => {
    for (const snapshot of [null, '', '{broken', [], 'null', '[]', 0]) {
      const f = fixture(); f.participants[1].order_snapshot = snapshot;
      await denied(f.read({ actor: OTHER }), 'BAD_REQUEST');
      expect(f.participants[1].order_snapshot).toEqual(snapshot);
    }
  });
  it('parses string and object source formats without changing saved data', async () => {
    const f = fixture(JSON.stringify({ ledgerId: 37, tagName: TAG }));
    const before = JSON.stringify({ orders: f.orders, participants: f.participants });
    expect(await f.read()).toBe(true);
    expect(JSON.stringify({ orders: f.orders, participants: f.participants })).toBe(before);
  });
});

describe('only tags actually saved and used by each calculation are readable', () => {
  const splitSource: Source = { ledgerId: 37, tagName: '旧默认不使用', useFloatingPnl: false, useCollateral: false,
    floatingPnlTagName: '浮盈', collateralTagName: '担保', useMarginRate: true, marginRateTagName: '保证金',
    pendingInterestTagName: '未付', paidInterestTagName: '已付' };
  it.each([
    ['config', ['浮盈', '担保', '保证金', '未付', '已付']],
    ['summary', ['浮盈', '担保', '保证金']],
    ['valuation', ['担保', '保证金']],
    ['interest', ['未付', '已付']],
  ] as Array<[Kind, string[]]>)('%s reads only its category union', async (kind, allowed) => {
    for (const tag of ['浮盈', '担保', '保证金', '未付', '已付', '旧默认不使用', '伪造标签']) {
      const f = fixture(splitSource);
      if (allowed.includes(tag)) expect(await f.read({ kind, tagName: tag })).toBe(true);
      else await denied(f.read({ kind, tagName: tag }), 'FORBIDDEN');
    }
  });
  it('default float/collateral fallback does not allow default interest or margin', async () => {
    const f = fixture({ ledgerId: 37, tagName: TAG, marginRateTagName: '保存但关闭' });
    expect(await f.read()).toBe(true);
    expect(await f.read({ kind: 'valuation' })).toBe(true);
    await denied(f.read({ kind: 'interest' }), 'FORBIDDEN');
    await denied(f.read({ kind: 'config', tagName: '保存但关闭' }), 'FORBIDDEN');
  });
  it.each(['usePendingInterest', 'usePaidInterest', 'useInterest'])('%s permits the saved default tag for interest', async flag => {
    const f = fixture({ ledgerId: 37, tagName: TAG, useFloatingPnl: false, useCollateral: false, [flag]: true });
    expect(await f.read({ kind: 'interest' })).toBe(true);
    expect(await f.read({ kind: 'config' })).toBe(true);
    await denied(f.read(), 'FORBIDDEN');
  });
  it('explicit category names follow the existing precedence even when legacy switches are false', async () => {
    const f = fixture({ ledgerId: 37, useFloatingPnl: false, useCollateral: false, usePendingInterest: false,
      usePaidInterest: false, useInterest: false, floatingPnlTagName: '浮盈', collateralTagName: '担保',
      pendingInterestTagName: '未付', interestTagName: '旧已付' });
    expect(await f.read({ tagName: '浮盈' })).toBe(true);
    expect(await f.read({ tagName: '担保', kind: 'valuation' })).toBe(true);
    expect(await f.read({ tagName: '未付', kind: 'interest' })).toBe(true);
    expect(await f.read({ tagName: '旧已付', kind: 'interest' })).toBe(true);
  });
  it('paidInterestTagName takes precedence over interestTagName and enabled default', async () => {
    const f = fixture({ ledgerId: 37, tagName: TAG, useFloatingPnl: false, useCollateral: false,
      paidInterestTagName: '新已付', interestTagName: '旧已付', useInterest: true });
    expect(await f.read({ kind: 'interest', tagName: '新已付' })).toBe(true);
    await denied(f.read({ kind: 'interest', tagName: '旧已付' }), 'FORBIDDEN');
    await denied(f.read({ kind: 'interest' }), 'FORBIDDEN');
  });
  it('disabled float/collateral/default interest never enlarge the tag union', async () => {
    const f = fixture({ ledgerId: 37, tagName: TAG, useFloatingPnl: false, useCollateral: false, useInterest: false,
      usePendingInterest: false, usePaidInterest: false, useMarginRate: false });
    for (const kind of ['config', 'summary', 'valuation', 'interest'] as Kind[]) await denied(f.read({ kind }), 'FORBIDDEN');
  });
  it.each(['', ' ', '\t'])('empty interest tag %j cannot list the whole 37 interest ledger', async tagName => {
    const f = fixture({ ledgerId: 37, paidInterestTagName: TAG });
    await denied(f.read({ kind: 'interest', tagName }), 'BAD_REQUEST');
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('missing tag is rejected for every explicit-reference read kind', async () => {
    const f = fixture();
    for (const kind of ['config', 'summary', 'valuation', 'interest'] as Kind[]) {
      await denied(assertLedger37OrderReferenceRead({ user: { id: ACTOR } }, { ledgerId: 37, reference52: { orderId: ORDER } },
        kind, f.connection), 'BAD_REQUEST');
    }
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('tag equality is exact, not prefix/trim/coercion-based', async () => {
    const f = fixture();
    for (const tagName of [` ${TAG}`, `${TAG} `, `${TAG}后缀`, TAG.toLowerCase() + 'x']) await denied(f.read({ tagName }), 'FORBIDDEN');
  });
  it('two offline legacy shapes retain default and split source behavior without any 37 membership', async () => {
    const legacy = fixture({ ledgerId: 37, tagName: TAG, useInterest: true });
    for (const kind of ['config', 'summary', 'valuation', 'interest'] as Kind[]) expect(await legacy.read({ kind })).toBe(true);
    const split = fixture(splitSource);
    expect(await split.read({ tagName: '浮盈' })).toBe(true);
    expect(await split.read({ kind: 'valuation', tagName: '担保' })).toBe(true);
    expect(await split.read({ kind: 'interest', tagName: '未付' })).toBe(true);
  });
  it.each([null, '', '{broken', [], 'null', '[]', 1, { ledgerId: 38, tagName: TAG }, { ledgerId: '37', tagName: TAG },
    { tagName: TAG }, { ledgerId: 37, tagName: 123 }, { ledgerId: 37, tagName: ' ' },
    { ledgerId: 37, tagName: TAG, useMarginRate: 'true' }, { ledgerId: 37, tagName: TAG, paidInterestTagName: null },
  ])('rejects corrupt or cross-ledger saved source %j without fallback', async source => {
    const f = fixture(source); await denied(f.read(), 'BAD_REQUEST');
    expect(f.execute).toHaveBeenCalledTimes(1);
  });
});

describe('read-only execution and failures', () => {
  it('propagates SELECT failures without granting, returning false or defaulting financial values to zero', async () => {
    const error = new Error('offline SELECT failed');
    const f = fixture(); f.execute.mockRejectedValueOnce(error);
    await expect(f.read()).rejects.toBe(error);
  });
  it('missing connection and malformed SELECT results fail clearly', async () => {
    const input = { ledgerId: 37, tagName: TAG, reference52: { orderId: ORDER } };
    await denied(assertLedger37OrderReferenceRead({ user: { id: ACTOR } }, input, 'summary', null), 'INTERNAL_SERVER_ERROR');
    for (const result of [null, {}, [{}], ['not rows']]) {
      await denied(assertLedger37OrderReferenceRead({ user: { id: ACTOR } }, input, 'summary', { execute: async () => result }),
        'INTERNAL_SERVER_ERROR');
    }
  });
  it('helper imports no app DB/router/business modules and contains no write or 37-wide query', () => {
    const text = readFileSync(new URL('./ledger37-order-reference.ts', import.meta.url), 'utf8');
    const imports = text.split('\n').filter(line => /^import /.test(line));
    expect(imports).toHaveLength(3);
    expect(imports.join('\n')).not.toMatch(/(?:['"]\.\/db|['"]\.\/routers|ledger37-access|ai-presentation)/);
    expect(text).not.toMatch(/\b(?:ensure\w*|INSERT INTO|ALTER TABLE|CREATE TABLE|UPDATE ledger|DELETE FROM|FOR UPDATE)\b/);
    expect(text).not.toMatch(/ledger_records|tag_interest_periods|ledger_categories/);
    const shared = readFileSync(new URL('../shared/ledger37-order-reference.ts', import.meta.url), 'utf8');
    expect(shared).not.toMatch(/import|zod/i);
  });
  it('errors remain TRPCError rather than opaque errors or a false return', async () => {
    try { await fixture().read({ tagName: '伪造' }); } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).message).toContain('此订单视角');
      return;
    }
    throw new Error('expected explicit rejection');
  });
});
