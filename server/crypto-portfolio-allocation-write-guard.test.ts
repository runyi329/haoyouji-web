import { isLedger37FullManager } from '../shared/ledger37-permissions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as instruments from '../shared/portfolio-instruments';
import * as observations from '../shared/stock-observation-portfolio';
import { selectStockLotDownsideRule } from '../shared/stock-lot-downside';
import { readTagVisible } from '../shared/tag-visibility';
import { CRYPTO_PORTFOLIO_POLICY_VERSION as POLICY } from '../shared/crypto-portfolio-policy';
import { guardCryptoPortfolioAllocationWrite, CRYPTO_ALLOCATION_HISTORY_PENDING as PENDING } from './crypto-portfolio-allocation-write-guard';

const DAY = '2026-11-16', PREV = '2026-11-15', OLD = '2026-11-14', NEXT = '2026-11-17';
const BTC = 'CRYPTO:BTC-USDT';
const input = { ledgerId: 37, categoryId: 81, lotId: 1, targetUserId: 99, userId: 28 };
const ast = ts.createSourceFile('real-handlers.ts', readFileSync(new URL('./ledger-stock-portfolio.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
function actualHandlers(deps: Record<string, any>) {
  const names = ['setStockLotParticipation', 'setStockLotObservation', 'assertStockTagAccess',
    'stockObservationTableExists', 'normalizeStoredDate', 'beijingDate', 'numberValue', 'validateCryptoQuantity',
    'portfolioQuantityExceeds', 'portfolioRemainingQuantity'];
  const text = names.map(name => {
    const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
    if (!node) throw new Error(name);
    return node.getText(ast).replace(/^export\s+/, '');
  }).join('\n');
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(deps), `${js}\nreturn {setStockLotParticipation,setStockLotObservation};`)(...Object.values(deps));
}
const now = (time: string, day = DAY) => vi.setSystemTime(new Date(`${day}T${time}+08:00`));
function proof(date = DAY, activation = DAY) {
  const snap = { snapshotDate: date, ready: true, policyVersion: POLICY };
  return { ledger_id: 37, category_id: 81, policy_version: POLICY, snapshot_date: date, activation_date: activation,
    payload: JSON.stringify({ ledgerId: 37, categoryId: 81, policyVersion: POLICY, activationDate: activation, snapshotDate: date,
      total: { ...snap, scope: 'tag-total' }, members: { '99': snap }, observations: { '99': snap } }) };
}
// Offline evidence fixtures only: metadata, no fabricated production balances.
const HISTORY = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', OLD, PREV, DAY];
const LAST_FIXTURE_MEMBER = '2098';
function largeProof(date = DAY, activation = HISTORY[0]) {
  const row = proof(date, activation), payload = JSON.parse(row.payload);
  const entries = () => Object.fromEntries(Array.from({ length: 2000 }, (_, i) =>
    [String(99 + i), { ...payload.members['99'] }]));
  payload.members = entries(); payload.observations = entries();
  row.payload = JSON.stringify(payload);
  expect(Buffer.byteLength(row.payload, 'utf8')).toBeGreaterThan(256 * 1024);
  return row;
}
function changeLargePayload(row: ReturnType<typeof proof>, change: (payload: any) => void) {
  const payload = JSON.parse(row.payload); change(payload); row.payload = JSON.stringify(payload);
  expect(Buffer.byteLength(row.payload, 'utf8')).toBeGreaterThan(256 * 1024);
}
function setup(options: { symbol?: string; activation?: string; existing?: boolean; observation?: boolean; missingTable?: boolean;
  noSource?: boolean; role?: string; hidden?: boolean; failAt?: string; crossAt?: string } = {}) {
  const symbol = options.symbol ?? BTC, activation = options.activation ?? DAY;
  const lot = { id: 1, symbol, unit_cost: 100, initial_quantity: 2, opened_at: `${activation} 14:00:00` };
  const source = { id: 1, symbol: BTC, ledger_id: 37, category_id: 81, effective_date: activation,
    actual_traded_at: `${activation} 14:00:00`, registered_at: `${activation} 14:00:01` };
  const state: any = { participation: options.existing === false ? null : { id: 10, ledger_id: 37, category_id: 81,
    allocated_quantity: 1, remaining_quantity: 1, entry_price: 100, start_date: activation, pause_date: null, closure_count: 0 },
    observation: options.observation ? { ledger_id: 37, category_id: 81, enabled: 1, quantity: 1,
      entry_price: 100, start_date: activation, pause_date: null } : null };
  const saved: any[] = [], sqls: Array<{ sql: string; params: any[]; tx: boolean }> = [];
  let snapshot: any, active = false;
  const execute = (tx: boolean) => vi.fn(async (sql: string, params: any[] = []) => {
    sqls.push({ sql, params, tx });
    if (sql.includes('FROM ledger_categories c')) return [[{ id: 81, ledgerId: 37, name: '组合', parentId: null,
      accounting_mode: 'stock_portfolio', ledger_owner_id: options.role === 'member' || options.hidden ? 999 : 28, member_user_id: 28, member_role: options.role ?? 'admin',
      initialBalances: options.hidden ? '{"组合__visible":0}' : '{}' }]];
    if (sql.includes('information_schema.tables')) return [[{ TABLE_NAME: 'ledger_stock_lot_observations' }]];
    if (!tx) throw new Error(`unexpected read SQL ${sql}`);
    if (!active) throw new Error('guard not in transaction');
    if (sql.includes("l.symbol LIKE 'CRYPTO:%-USDT'")) {
      expect(sql).toContain('e.ledger_id=l.ledger_id'); expect(sql).toContain('e.category_id=l.category_id');
      expect(params).toEqual([37, 81]);
      if (options.crossAt === 'source') now('15:05:00.000');
      return [options.noSource ? [] : [source]];
    }
    if (sql.includes('FROM ledger_crypto_portfolio_daily_snapshots')) {
      expect(params.slice(0, 3)).toEqual([37, 81, POLICY]);
      if (options.missingTable) throw Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' });
      if (options.failAt === 'proof') throw Object.assign(new Error('Out of sort memory, consider increasing server sort buffer size'),
        { code: 'ER_OUT_OF_SORTMEMORY', errno: 1038, sqlState: 'HY001' });
      const result = saved.filter(r => r.snapshot_date <= params[3]);
      if (options.crossAt === 'proof') now('15:05:00.000');
      return [result];
    }
    if (sql.includes('FROM ledger_members')) return [[{ userId: 99 }]];
    if (sql.includes('FROM ledger_stock_lots l')) { expect(sql).toContain('FOR UPDATE'); return [[lot]]; }
    if (sql.includes('globally_sold_quantity')) return [[{ globally_sold_quantity: 0 }]];
    if (sql.includes('SUM(remaining_quantity)')) return [[{ allocated_quantity: 0 }]];
    if (sql.includes('FROM ledger_stock_lot_observations')) return [state.observation ? [{ ...state.observation }] : []];
    if (sql.trimStart().startsWith('SELECT') && sql.includes('FROM ledger_stock_lot_participations')) return [state.participation ? [{ ...state.participation }] : []];
    if (options.failAt === 'write') throw new Error('write failed');
    if (sql.startsWith('DELETE FROM ledger_stock_lot_participations')) state.participation = null;
    else if (sql.includes('UPDATE ledger_stock_lot_participations')) {
      Object.assign(state.participation, { allocated_quantity: params[0], remaining_quantity: params[1] });
      if (params.length > 6 && params[5]) state.participation.start_date = params[6];
    } else if (sql.includes('INSERT INTO ledger_stock_lot_participations')) state.participation = {
      ledger_id: params[0], category_id: params[1], allocated_quantity: params[4], remaining_quantity: params[5], start_date: params[7] };
    else if (sql.includes('INSERT INTO ledger_stock_lot_observations')) {
      if (options.failAt === 'upsert') throw new Error('upsert failed');
      state.observation = { ledger_id: params[0], category_id: params[1], enabled: params[4], quantity: params[5], start_date: params[7] };
    } else throw new Error(`forbidden SQL ${sql}`);
    if (options.crossAt === 'write') now('15:05:00.000');
    return [{ affectedRows: 1 }];
  });
  const read = { execute: execute(false) };
  const tx = { execute: execute(true), beginTransaction: vi.fn(async () => { active = true; snapshot = structuredClone(state); }),
    commit: vi.fn(async () => { if (options.failAt === 'commit') throw new Error('commit failed'); active = false; }),
    rollback: vi.fn(async () => { Object.assign(state, snapshot); active = false; }), release: vi.fn() };
  const invalidate = vi.fn();
  const handlers = actualHandlers({ ...instruments, ...observations, guardCryptoPortfolioAllocationWrite, readTagVisible, isLedger37FullManager,
    STOCK_LEDGER_ID: 37, EPSILON: 1e-8, ensureLedgerStockPortfolioTables: vi.fn(),
    getDbConnection: vi.fn(async () => { if (active) throw new Error('extra connection under lock'); return read; }),
    selectStockLotDownsideRule, readStockLotDownsideRules: vi.fn(async (conn: any, ledgerId: number, categoryId: number, fresh: boolean) => {
      expect(conn).toBe(tx); expect(active).toBe(true); expect([ledgerId, categoryId, fresh]).toEqual([37, 81, true]);
      return []; // Offline fixture: no active downside rule; never import the DB-backed rule reader.
    }),
    getDbTransactionConnection: vi.fn(async () => tx), invalidateMemberStockReadCaches: invalidate });
  return { state, saved, source, tx, sqls, invalidate, read,
    allocation: (patch: any = {}) => handlers.setStockLotParticipation({ ...input, quantity: 0.5, ...patch }),
    observation: (patch: any = {}) => handlers.setStockLotObservation({ ...input, enabled: true, quantity: 1, ...patch }) };
}
const writes = (s: ReturnType<typeof setup>) => s.sqls.filter(q => !q.sql.trimStart().startsWith('SELECT'));
async function denied(s: ReturnType<typeof setup>, run: () => Promise<any>) {
  const before = JSON.stringify(s.state), frozen = JSON.stringify(s.saved);
  await expect(run()).rejects.toThrow(PENDING);
  expect(writes(s)).toHaveLength(0); expect(JSON.stringify(s.state)).toBe(before); expect(JSON.stringify(s.saved)).toBe(frozen);
  expect(s.tx.rollback).toHaveBeenCalledTimes(1); expect(s.tx.commit).not.toHaveBeenCalled();
  expect(s.tx.release).toHaveBeenCalledTimes(1); expect(s.invalidate).not.toHaveBeenCalled();
}
beforeEach(() => { vi.useFakeTimers(); now('16:00:00'); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('真实handler写前数字币历史证据保护（完全离线，普通通过断言）', () => {
  it.each([{ quantity: 0 }, { startDate: NEXT }, { entryPrice: 110 }, { pauseDate: DAY }])('截止前当日尚未到期允许配置 %j', async patch => {
    now('15:04:59.999'); const s = setup(); await s.allocation(patch); expect(s.tx.commit).toHaveBeenCalledTimes(1);
  });
  it('截止前当日允许观察释放未结算余量', async () => {
    now('15:04:59.999'); const s = setup(); await s.observation(); expect(s.state.participation.remaining_quantity).toBe(0);
  });
  it.each(['15:05:00.000', '15:05:00.001', '16:00:00'])('截止%s缺当日证据拒绝删除并保留当前行', async time => {
    now(time); const s = setup(); await denied(s, () => s.allocation({ quantity: 0 }));
  });
  it.each([{ startDate: NEXT }, { entryPrice: 120 }, { pauseDate: DAY }, { quantity: 0.1 }])('截止后缺快照拒绝现有配置 %j', async patch => {
    const s = setup(); await denied(s, () => s.allocation(patch));
  });
  it('缺证据拒绝观察开启释放真实余量', async () => { const s = setup(); await denied(s, () => s.observation()); });
  it.each([{ enabled: false }, { startDate: NEXT }, { quantity: 0 }, { entryPrice: 120 }])('缺证据拒绝已有观察配置 %j', async patch => {
    const s = setup({ existing: false, observation: true }); await denied(s, () => s.observation(patch));
  });
  it.each(['delete', 'start', 'release', 'observation'])('已有完整同scope快照允许%s且快照字节不变', async action => {
    const s = setup({ observation: action === 'observation', existing: action !== 'observation' }); s.saved.push(proof());
    const frozen = JSON.stringify(s.saved);
    await (action === 'delete' ? s.allocation({ quantity: 0 }) : action === 'start' ? s.allocation({ startDate: NEXT })
      : action === 'release' ? s.observation() : s.observation({ enabled: false }));
    expect(s.tx.commit).toHaveBeenCalledTimes(1); expect(JSON.stringify(s.saved)).toBe(frozen);
    expect(s.sqls.filter(q => q.sql.includes('FROM ledger_crypto')).every(q => q.tx)).toBe(true);
  });
  it.each([{ ledger_id: 38 }, { category_id: 82 }, { policy_version: 'old-policy' }, { payload: '{}' },
    { payload: JSON.stringify({ ...JSON.parse(proof().payload), categoryId: 82 }) },
    { payload: JSON.stringify({ ...JSON.parse(proof().payload), members: { '99': { ready: false } } }) }])('错误scope/policy/未完成payload拒绝 %j', async patch => {
    const s = setup(); s.saved.push({ ...proof(), ...patch }); await denied(s, () => s.allocation());
  });
  it.each(['600519.SH', 'AAPL', 'ETH'])('无数字币源及持久激活纯证券%s不受限制，新表缺失兼容', async symbol => {
    const s = setup({ symbol, noSource: true, missingTable: true }); await s.allocation({ quantity: 0 }); expect(s.tx.commit).toHaveBeenCalled();
  });
  it('纯证券观察开启释放也不受数字币表缺失限制', async () => {
    const s = setup({ symbol: 'AAPL', noSource: true, missingTable: true }); await s.observation();
    expect(s.state.participation.remaining_quantity).toBe(0); expect(s.tx.commit).toHaveBeenCalled();
  });
  it('混合数字币标签内证券成员修改同样需证据', async () => {
    const s = setup({ symbol: 'AAPL' }); await denied(s, () => s.allocation({ startDate: NEXT }));
  });
  it('最后币源已不存在、持久激活仍保护证券成员旧日', async () => {
    const s = setup({ symbol: 'AAPL', noSource: true }); s.saved.push(proof(PREV, OLD), proof(DAY, OLD));
    await denied(s, () => s.allocation({ quantity: 0 }));
  });
  it.each(['allocation', 'observation'])('最新截止后才生效的全新币批次首次%s允许，旧未发布日不被改变', async action => {
    const s = setup({ existing: false, activation: NEXT }); s.saved.push(proof(PREV, OLD));
    await (action === 'allocation' ? s.allocation() : s.observation()); expect(s.tx.commit).toHaveBeenCalled();
  });
  it('仅把startDate设为未来不是新批次豁免', async () => {
    const s = setup({ existing: false }); await denied(s, () => s.allocation({ startDate: NEXT }));
  });
  it('新表未初始化且带币源时截止前仍fail closed，不自动建表', async () => {
    now('15:04:59.999'); const s = setup({ missingTable: true }); await denied(s, () => s.allocation());
    expect(s.sqls.every(q => q.sql.trimStart().startsWith('SELECT'))).toBe(true);
  });
  it('数字币源日期错误或无法验证时fail closed', async () => {
    const s = setup(); s.source.effective_date = NEXT; await denied(s, () => s.allocation());
  });
  it.each(['15:04:59.999', '16:00:00'])('即使最新截止日已有快照，旧未发布空洞不漏 %s', async time => {
    now(time); const s = setup({ activation: OLD }); s.saved.push(proof(PREV, OLD), proof(DAY, OLD));
    await denied(s, () => s.allocation({ quantity: 0 }));
  });
  it.each(['start', 'release'])('截止前仍保护昨天及更早未发布证据，不允许%s', async action => {
    now('15:04:59.999'); const s = setup({ activation: OLD }); s.saved.push(proof(PREV, OLD));
    await denied(s, () => action === 'start' ? s.allocation({ startDate: NEXT }) : s.observation());
  });
  it('全部旧自然日（含周末）完成才允许，旧快照字节不变', async () => {
    const s = setup({ activation: OLD }); s.saved.push(proof(OLD, OLD), proof(PREV, OLD), proof(DAY, OLD));
    const frozen = JSON.stringify(s.saved); await s.observation(); expect(s.tx.commit).toHaveBeenCalled(); expect(JSON.stringify(s.saved)).toBe(frozen);
  });
  it.each(['source', 'proof'])('原锁内读取%s耗时跨15:05，写前重新判截止拒绝', async crossAt => {
    now('15:04:59.999'); const s = setup({ crossAt }); await denied(s, () => s.allocation({ quantity: 0 }));
  });
  it('awaited DELETE跨15:05在提交前拒绝并rollback恢复当前行', async () => {
    now('15:04:59.999'); const s = setup({ crossAt: 'write' }), before = JSON.stringify(s.state);
    await expect(s.allocation({ quantity: 0 })).rejects.toThrow(PENDING); expect(writes(s)).toHaveLength(1);
    expect(JSON.stringify(s.state)).toBe(before); expect(s.tx.commit).not.toHaveBeenCalled(); expect(s.tx.rollback).toHaveBeenCalled();
  });
  it.each(['upsert', 'commit'])('证据正确后%s失败，释放和观察配置原子回滚，快照不改', async failAt => {
    const s = setup({ failAt }); s.saved.push(proof()); const before = JSON.stringify(s.state), frozen = JSON.stringify(s.saved);
    await expect(s.observation()).rejects.toThrow('failed'); expect(JSON.stringify(s.state)).toBe(before);
    expect(JSON.stringify(s.saved)).toBe(frozen); expect(s.tx.rollback).toHaveBeenCalled(); expect(s.tx.release).toHaveBeenCalled();
    expect(s.invalidate).not.toHaveBeenCalled();
  });
  it.each(['member', 'hidden', 'ledger', 'category'])('既有权限%s在guard/交易前拒绝，不改变修改权限', async mode => {
    const patch = mode === 'ledger' ? { ledgerId: 52 } : mode === 'category' ? { categoryId: 82 } : {};
    for (const method of ['allocation', 'observation'] as const) {
      const s = setup({ role: mode === 'member' ? 'member' : 'admin', hidden: mode === 'hidden' });
      // Category query must reflect a not-found scope, rather than allow guessed tag IDs.
      if (mode === 'category') s.read.execute.mockResolvedValueOnce([[]]);
      await expect(s[method](patch)).rejects.toThrow(); expect(s.tx.beginTransaction).not.toHaveBeenCalled();
      expect(s.sqls.some(q => q.sql.includes('FROM ledger_crypto'))).toBe(false);
    }
  });
});

describe('排序内存修复专项：真实guard/handler离线证据完整性', () => {
  it('真实guard按限定基础日期字段排序，完整读取payload且不限制行数或绕过校验', async () => {
    const s = setup(); s.saved.push(proof()); await s.tx.beginTransaction();
    const recheck = await guardCryptoPortfolioAllocationWrite(s.tx, {
      ledgerId: 37, categoryId: 81, lotId: 1, symbol: BTC, hasExistingConfiguration: true,
    });
    await recheck();
    const queries = s.sqls.filter(q => q.sql.includes('FROM ledger_crypto_portfolio_daily_snapshots'));
    expect(queries).toHaveLength(1);
    const sql = queries[0].sql.replace(/\s+/g, ' ').trim();
    expect(sql).toMatch(/ORDER BY ledger_crypto_portfolio_daily_snapshots\.snapshot_date ASC\b/i);
    expect(sql).not.toMatch(/ORDER BY\s+(?:`?snapshot_date`?|DATE_FORMAT\s*\()/i);
    expect(sql.split(/\bFROM\b/i)[0]).toMatch(/\bpayload\b/);
    expect(sql).toMatch(/DATE_FORMAT\(snapshot_date,'%Y-%m-%d'\) AS snapshot_date/);
    expect(sql).not.toMatch(/\b(?:LIMIT|SET|DROP|DELETE|UPDATE|INSERT|REPLACE)\b|sort_buffer|skip_?check/i);
    expect(queries[0].params).toEqual([37, 81, POLICY, DAY]);
    expect(s.sqls.every(q => q.tx && q.sql.trimStart().startsWith('SELECT'))).toBe(true);
    expect(writes(s)).toHaveLength(0);
    await s.tx.rollback(); s.tx.release();
  });
  it('七个自然日每行大于256KB的完整证据允许分配/观察，全部payload字节不变', async () => {
    for (const method of ['allocation', 'observation'] as const) {
      const s = setup({ activation: HISTORY[0] }); s.saved.push(...HISTORY.map(date => largeProof(date)));
      const frozen = JSON.stringify(s.saved);
      await s[method]();
      expect(s.tx.commit).toHaveBeenCalledTimes(1); expect(s.tx.rollback).not.toHaveBeenCalled();
      expect(s.saved).toHaveLength(7); expect(JSON.stringify(s.saved)).toBe(frozen);
      expect(s.sqls.filter(q => q.sql.includes('FROM ledger_crypto_portfolio_daily_snapshots'))).toHaveLength(1);
    }
  });
  it('大payload即使其余六日ready，最早旧日缺失仍拒绝两种写操作', async () => {
    for (const method of ['allocation', 'observation'] as const) {
      const s = setup({ activation: HISTORY[0] }); s.saved.push(...HISTORY.slice(1).map(date => largeProof(date)));
      await denied(s, () => s[method]());
    }
  });
  it('大payload最后一日末尾成员日期损坏仍被完整校验并拒绝', async () => {
    for (const method of ['allocation', 'observation'] as const) {
      const s = setup({ activation: HISTORY[0] }); s.saved.push(...HISTORY.map(date => largeProof(date)));
      changeLargePayload(s.saved[6], payload => { payload.members[LAST_FIXTURE_MEMBER].snapshotDate = PREV; });
      await denied(s, () => s[method]());
    }
  });
  it('大payload旧日末尾观察成员非ready仍拒绝且不修改历史证据', async () => {
    for (const method of ['allocation', 'observation'] as const) {
      const s = setup({ activation: HISTORY[0] }); s.saved.push(...HISTORY.map(date => largeProof(date)));
      changeLargePayload(s.saved[0], payload => { payload.observations[LAST_FIXTURE_MEMBER].ready = false; });
      await denied(s, () => s[method]());
    }
  });
  it('新future lot仅豁免旧日空洞，仍先完整读取有效大payload再进行分配/观察写入', async () => {
    for (const method of ['allocation', 'observation'] as const) {
      const s = setup({ existing: false, activation: NEXT }); s.saved.push(largeProof(PREV, OLD));
      const frozen = JSON.stringify(s.saved);
      await s[method]();
      const proofRead = s.sqls.findIndex(q => q.sql.includes('FROM ledger_crypto_portfolio_daily_snapshots'));
      const firstWrite = s.sqls.findIndex(q => !q.sql.trimStart().startsWith('SELECT'));
      expect(proofRead).toBeGreaterThanOrEqual(0); expect(firstWrite).toBeGreaterThan(proofRead);
      expect(s.tx.commit).toHaveBeenCalledTimes(1); expect(JSON.stringify(s.saved)).toBe(frozen);
    }
  });
  it('新future lot不能绕过已有saved大payload成员损坏校验', async () => {
    for (const method of ['allocation', 'observation'] as const) {
      const s = setup({ existing: false, activation: NEXT }); s.saved.push(largeProof(PREV, OLD));
      changeLargePayload(s.saved[0], payload => { payload.members[LAST_FIXTURE_MEMBER].policyVersion = 'damaged-policy'; });
      await denied(s, () => s[method]());
      expect(s.sqls.filter(q => q.sql.includes('FROM ledger_crypto_portfolio_daily_snapshots'))).toHaveLength(1);
    }
  });
  it('proof SELECT模拟真实errno1038，分配与观察均在任何DML前回滚并保留原异常', async () => {
    for (const method of ['allocation', 'observation'] as const) {
      const s = setup({ failAt: 'proof' }); s.saved.push(largeProof());
      const before = JSON.stringify(s.state), frozen = JSON.stringify(s.saved);
      await expect(s[method]()).rejects.toMatchObject({ code: 'ER_OUT_OF_SORTMEMORY', errno: 1038, sqlState: 'HY001',
        message: 'Out of sort memory, consider increasing server sort buffer size' });
      expect(s.sqls.filter(q => q.sql.includes('FROM ledger_crypto_portfolio_daily_snapshots'))).toHaveLength(1);
      expect(writes(s)).toHaveLength(0); expect(JSON.stringify(s.state)).toBe(before); expect(JSON.stringify(s.saved)).toBe(frozen);
      expect(s.tx.rollback).toHaveBeenCalledTimes(1); expect(s.tx.commit).not.toHaveBeenCalled();
      expect(s.tx.release).toHaveBeenCalledTimes(1); expect(s.invalidate).not.toHaveBeenCalled();
    }
  });
});
