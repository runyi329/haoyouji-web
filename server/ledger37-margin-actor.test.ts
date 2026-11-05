import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getLedger37MarginActor, getLedger37MarginPermission } from '../shared/ledger37-margin-actor';

// 只导入真实认证middleware，数据库依赖全部拦截。路由源片段只装配本次接口，
// 不加载巨大appRouter的其他模块/定时器，更不连接数据库或运行DDL。
vi.mock('./db', () => ({
  setCurrentIsGuest: vi.fn(),
  getActiveZidingLoginBlock: vi.fn(async () => null),
}));
import { protectedProcedure, router } from './_core/trpc';
import type { TrpcContext } from './_core/context';

const source = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
function between(start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Missing production route: ${start}`);
  return source.slice(from, to);
}
const guard = between('function requireLedger37MarginActor(', 'function asRows(');
function route(name: string, next: string) {
  // 下个属性前的注释可以保留；只执行受测生产schema、guard与handler。
  return between(`    ${name}: protectedProcedure`, `    ${next}: protectedProcedure`);
}
const routes = [
  route('getLedger37MarginActor', 'getLedger37WalletMarginContext'),
  route('getLedger37WalletMarginContext', 'getLedger37ManualMarginMigrationPlan'),
  route('freezeLedger37MarginFromWallet', 'releaseLedger37MarginToWallet'),
  route('releaseLedger37MarginToWallet', 'revokeLedger37MarginReleaseToWallet'),
  route('getMyStockTagObservationPortfolio', 'getMyStockTagObservationOverview')
    .replace("await import('./ledger-stock-portfolio')", 'await mockedStockModule()'),
].join('\n');
const code = transformSync(`${guard}\nreturn router({${routes}});`, { loader: 'ts', target: 'es2022' }).code;
const tx = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
const hold = { id: 11, userId: 201, tagName: '测试标签', assetCode: 'CNY', amount: '10', createdAt: '2026-11-05' };
const mocks = {
  getDbTransactionConnection: vi.fn(async () => tx),
  assertAiWalletOperationEnabled: vi.fn(async () => undefined),
  getLedger37FundingBalanceSummary: vi.fn(async () => ({ available: '100' })),
  listLedger37WalletHolds: vi.fn(async () => [hold]),
  dbMultiAssetWallet: { getUserMultiAssetBalances: vi.fn(async () => []) },
  dbLedger: {
    getUserMembership: vi.fn(async () => ({ role: 'member' })),
    getLedgerCategories: vi.fn(async () => [{ name: '测试标签', isDefault: false }]),
  },
  freezeLedger37WalletHold: vi.fn(async () => ({ hold, walletBalanceSnapshot: {} })),
  releaseLedger37WalletHold: vi.fn(async () => ({ hold, releasedAmount: '5', remainingAmount: '5', fullyReleased: false })),
  appendLedger37WalletMarginRecord: vi.fn(async () => undefined),
  mockedStockModule: vi.fn(async () => ({ getMyStockTagObservationPortfolio: vi.fn(async (input: Record<string, unknown>) => input) })),
};
const deps = { router, protectedProcedure, TRPCError, z, getLedger37MarginActor, getLedger37MarginPermission,
  LEDGER_37_ID: 37, LEDGER_37_WALLET_OPERATOR_ID: 870413, ...mocks };
const testedRouter = new Function(...Object.keys(deps), code)(...Object.values(deps));
const identity = (id: number, role = 'user') => ({ id, name: `用户${id}`, role });
function caller(user: ReturnType<typeof identity> | null, realUser = user) {
  return testedRouter.createCaller({ user, realUser, isViewingAs: user?.id !== realUser?.id,
    isGuest: false, req: { headers: {} }, res: {} } as TrpcContext);
}
const freezeInput = { ledgerId: 37, targetUserId: 201, tagName: '测试标签', assetCode: 'CNY', amount: '10' };
const releaseInput = { ledgerId: 37, holdId: 11, amount: '5' };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('DEV_BYPASS_AUTH', 'false'); });
afterEach(() => vi.unstubAllEnvs());

const actions = [
  ['context', (c: any, target = 870413) => c.getLedger37WalletMarginContext({ targetUserId: target })],
  ['freeze', (c: any, target = 870413) => c.freezeLedger37MarginFromWallet({ ...freezeInput, targetUserId: target, actorUserId: 870413, operatorId: 870413 })],
  ['release', (c: any) => c.releaseLedger37MarginToWallet({ ...releaseInput, targetUserId: 870413, actorUserId: 870413 })],
] as const;

describe('ledger37 real margin actor: production handlers, strict mocks', () => {
  it('pure权限仅返回真实operator及布尔值，普通成员有效视角不剥夺真实870413权限', () => {
    expect(getLedger37MarginPermission({ user: identity(201), realUser: identity(870413, 'admin') }))
      .toEqual({ canManageMargins: true, operator: { id: 870413, name: '用户870413' } });
    expect(getLedger37MarginPermission({ user: identity(870413), realUser: identity(201) }).canManageMargins).toBe(false);
  });
  it('最小只读query不因伪造目标授予权限，不查询数据库', async () => {
    expect(await caller(identity(201)).getLedger37MarginActor({ ledgerId: 37, targetUserId: 870413 }))
      .toEqual({ canManageMargins: false, operator: { id: 201, name: '用户201' } });
    expect(await caller(identity(201), identity(870413, 'admin')).getLedger37MarginActor({ ledgerId: 37, targetUserId: 201 }))
      .toEqual({ canManageMargins: true, operator: { id: 870413, name: '用户870413' } });
    expect(mocks.getDbTransactionConnection).not.toHaveBeenCalled();
    expect(mocks.getLedger37FundingBalanceSummary).not.toHaveBeenCalled();
  });
  for (const [name, action] of actions) {
    it(`${name}: 真实870413+viewAs普通成员允许`, async () => {
      await action(caller(identity(201), identity(870413, 'admin')), 201);
      if (name === 'context') {
        expect(mocks.getLedger37FundingBalanceSummary).toHaveBeenCalledWith(201, 'CNY');
        expect(mocks.listLedger37WalletHolds).toHaveBeenCalledWith(201);
      } else {
        const walletWrite = name === 'freeze' ? mocks.freezeLedger37WalletHold : mocks.releaseLedger37WalletHold;
        expect(walletWrite).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 870413, transaction: tx }));
        expect(mocks.appendLedger37WalletMarginRecord).toHaveBeenCalledWith(tx, expect.objectContaining({ userId: 201, holdId: 11 }));
        expect(tx.beginTransaction).toHaveBeenCalledOnce(); expect(tx.commit).toHaveBeenCalledOnce();
        expect(tx.rollback).not.toHaveBeenCalled(); expect(tx.release).toHaveBeenCalledOnce();
        if (name === 'freeze') {
          expect(mocks.dbLedger.getUserMembership).toHaveBeenCalledWith(37, 201);
          expect(mocks.dbLedger.getLedgerCategories).toHaveBeenCalledWith(37, 870413, undefined, null);
          expect(walletWrite).toHaveBeenCalledWith(expect.objectContaining({ userId: 201 }));
        }
      }
    });
    it(`${name}: 直接登录870413管理员允许`, async () => {
      await expect(action(caller(identity(870413, 'admin')), 201)).resolves.toBeDefined();
    });
    it(`${name}: 普通user冒用870413目标或operator参数拒绝`, async () => {
      await expect(action(caller(identity(201)))).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(mocks.getDbTransactionConnection).not.toHaveBeenCalled();
      expect(mocks.getLedger37FundingBalanceSummary).not.toHaveBeenCalled();
      expect(mocks.assertAiWalletOperationEnabled).not.toHaveBeenCalled();
    });
    it(`${name}: 其他admin甚至代入870413仍拒绝`, async () => {
      await expect(action(caller(identity(870413), identity(202, 'super_admin')))).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(mocks.getDbTransactionConnection).not.toHaveBeenCalled();
    });
    it(`${name}: 未认证拒绝`, async () => {
      await expect(action(caller(null))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      expect(mocks.getDbTransactionConnection).not.toHaveBeenCalled();
    });
    it(`${name}: realUser丢失不降级信任有效ctx.user`, async () => {
      await expect(action(caller(identity(870413), null))).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  }
  for (const name of ['freeze', 'release'] as const) {
    it(`${name}: 预览原有禁写门禁保留`, async () => {
      vi.stubEnv('DEV_BYPASS_AUTH', 'true');
      const action = actions.find(([key]) => key === name)![1];
      await expect(action(caller(identity(201), identity(870413, 'admin')), 201))
        .rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
      expect(mocks.getDbTransactionConnection).not.toHaveBeenCalled();
    });
    it(`${name}: 押金追加失败回滚同一正式事务`, async () => {
      mocks.appendLedger37WalletMarginRecord.mockRejectedValueOnce(new Error('append failed'));
      const action = actions.find(([key]) => key === name)![1];
      await expect(action(caller(identity(201), identity(870413, 'admin')), 201)).rejects.toThrow('append failed');
      expect(tx.rollback).toHaveBeenCalledOnce(); expect(tx.commit).not.toHaveBeenCalled();
      expect(tx.release).toHaveBeenCalledOnce();
    });
  }
  it('观察详情target仅为cache key，读对象始终ctx.user；伪造跨user参数拒绝', async () => {
    const c = caller(identity(201), identity(870413, 'admin'));
    expect(await c.getMyStockTagObservationPortfolio({ ledgerId: 37, categoryId: 301, viewAsUserId: 201 }))
      .toMatchObject({ userId: 201 });
    await expect(c.getMyStockTagObservationPortfolio({ ledgerId: 37, categoryId: 301, viewAsUserId: 202 }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.mockedStockModule).toHaveBeenCalledOnce();
    await expect(c.getMyStockTagObservationPortfolio({ ledgerId: 37, categoryId: 301, viewAsUserId: 0 }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
  it('前端入口使用只读真实权限、有效target查询键，不动DEV禁写及目标确认组件', () => {
    const page = readFileSync(new URL('../client/src/pages/LedgerDetailAA.tsx', import.meta.url), 'utf8');
    expect(page).toContain('trpc.ledger.getLedger37MarginActor.useQuery');
    expect(page).toContain('{ ledgerId: 37, targetUserId: marginTargetUserId }');
    expect(page).toContain('{canManageMargins && (');
    expect(page).toContain('targetUserId={marginTargetUserId}');
    expect(page).toContain('marginActorPermission.isFetchedAfterMount');
  });
});
