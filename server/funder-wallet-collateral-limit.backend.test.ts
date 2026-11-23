import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomBytes, randomInt } from 'node:crypto';
import ts from 'typescript';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import { AI_WALLET_ASSET_CATALOG, AI_WALLET_SETTLEMENT_ASSETS, AI_WALLET_CRYPTO_MARKET_ASSETS, AI_WALLET_FUNDING_ASSETS } from '../shared/ai-wallet-assets';

// No production modules imported except the pure asset catalog. No router/DB/scanner/network.
// The adapter interprets production SQL predicates; it does NOT implement collateral target/delta logic.
const astOf = (file: string) => ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const routerAst = astOf('./routers.ts');
function route(name: string) {
  let found: ts.PropertyAssignment | undefined;
  function visit(n: ts.Node) { if (ts.isPropertyAssignment(n) && n.name.getText(routerAst) === name) found = n; ts.forEachChild(n, visit); }
  visit(routerAst); if (!found) throw new Error('Missing real route: ' + name);
  let callback = '', schema = '';
  let callbackNode: ts.Expression | undefined;
  function calls(n: ts.Node) {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      if (['mutation', 'query'].includes(n.expression.name.text)) {
        callbackNode = n.arguments[0]; callback = callbackNode.getText(routerAst);
      }
      if (n.expression.name.text === 'input') schema = n.arguments[0].getText(routerAst);
    }
    ts.forEachChild(n, calls);
  }
  calls(found.initializer); return { callback, callbackNode, schema, text: found.getText(routerAst) };
}
function vm(code: string, deps: Record<string, any>) {
  return runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, { ...deps, exports: {} });
}
function functions(file: string, deps: Record<string, any>, names: string[], variables: string[]) {
  const ast = astOf(file);
  const declarations = ast.statements.filter(n =>
    (ts.isFunctionDeclaration(n) && n.name && (!n.name.text.startsWith('ensure') || n.name.text === 'ensureBalanceRow') && n.name.text !== 'getCnyValue') ||
    (ts.isVariableStatement(n) && n.declarationList.declarations.some(d => ts.isIdentifier(d.name) && variables.includes(d.name.text)))
  ).map(n => n.getText(ast).replace(/^export /, ''));
  return vm(declarations.join('\n') + `\n({${names.join(',')}});`, deps);
}
const SCALE = 10n ** 18n;
function units(value: string | number): bigint {
  const text = String(value), negative = text.startsWith('-');
  const [integer, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  return (BigInt(integer) * SCALE + BigInt(fraction.padEnd(18, '0'))) * (negative ? -1n : 1n);
}
function decimal(value: bigint): string {
  if (value < 0n) return '-' + decimal(-value);
  const fraction = (value % SCALE).toString().padStart(18, '0').replace(/0+$/, '');
  return String(value / SCALE) + (fraction ? '.' + fraction : '');
}
const tag = (order = 130, segment = '__primary__') => segment === '__primary__' ? `52号融资订单 #${order} 钱包担保` : `52号融资订单 #${order} · 联合段 ${segment} 钱包担保`;
const hold = (id: number, user = 18, asset = 'USDT', amount = '18', order = 130, segment = '__primary__', ledger = 52) => ({ id, user_id: user, ledger_id: ledger, asset_code: asset, amount, released_amount: '0', status: 'active', tag_name: tag(order, segment), hold_no: 'H' + id });
const lock = (id: number, user = 18, amount = '18', order = 130, segment = '__primary__', ledger = 52) => ({ id, user_id: user, ledger_id: ledger, asset_code: 'ETH', amount, status: 'active', order_id: order, joint_segment_id: segment });
class Offline {
  users = [{ id: 18, balance: '100', cny_balance: '100' }, { id: 28, balance: '100', cny_balance: '100' }];
  manual: any[] = [];
  holds: any[] = [hold(1), hold(2, 28), hold(3, 18, 'USDT', '10', 131), hold(4, 18, 'USDT', '2', 130, 's1')];
  locks: any[] = [lock(1), lock(2, 28), lock(3, 18, '10', 131), lock(4, 18, '2', 130, 's1')];
  balances: any[] = [{ id: 1, user_id: 18, asset_code: 'ETH', available_balance: '70', frozen_balance: '30' }, { id: 2, user_id: 28, asset_code: 'ETH', available_balance: '82', frozen_balance: '18' }];
  order: any = { id: 130, ledger_id: 52, user_id: 18, status: 'active', deleted_at: null, collateral_assets: null };
  participants: any[] = [{ id: 101, order_id: 130, ledger_id: 52, user_id: 18, role: 'owner', order_snapshot: JSON.stringify({ joint_order_segments: [{ id: 's1', owner_user_id: 18, status: 'active', collateral_assets: [] }] }) }];
  entries: any[] = []; releases: any[] = []; logs: any[] = [];
  trace: Array<{ sql: string; values: any[]; activeTransaction: boolean }> = [];
  events: Array<{ action: string; activeTransaction: boolean; sql?: string }> = [];
  role = 'admin'; member = true; commits = 0; rollbacks = 0; begins = 0; implicitCommits = 0; connections = 0;
  totalDDL = 0; activeTransactionDDL = 0; connectionReleases = 0;
  fail?: 'entry' | 'balance' | 'log' | 'ddl';
  market: any; funding: any; save: any; contributors: any;
  constructor() {
    const deps = { randomBytes, randomInt, AI_WALLET_ASSET_CATALOG, AI_WALLET_SETTLEMENT_ASSETS, AI_WALLET_CRYPTO_MARKET_ASSETS,
      ensureMultiAssetWalletInfrastructure: async () => {}, ensureLedger37WalletInfrastructure: async () => {},
      getDbTransactionConnection: async () => { this.connections++; return this.transaction(); },
      getDbConnection: async () => this.transaction(),
      // Only valuation is stubbed: the real implementation dynamically imports a live price scanner.
      getCnyValue: async () => '1',
    };
    this.market = functions('./db-multi-asset-wallet.ts', deps, ['syncWalletCollateralLocks', 'getActiveWalletCollateralLocks', 'PRIMARY_JOINT_SEGMENT_ID', 'normalizeJointCollateralSegmentId'],
      ['MULTI_ASSET_WALLET_ASSETS', 'PRIMARY_JOINT_SEGMENT_ID', 'JOINT_SEGMENT_ID_PATTERN', 'DECIMAL_PATTERN']);
    this.funding = functions('./ledger37-wallet.ts', { ...deps, dbMultiAssetWallet: this.market },
      ['syncLedger52FundingCollateralHolds', 'getLedger52FundingCollateralHoldsForOrder', 'lockLedgerWalletUsersForUpdate'],
      ['LEDGER_37_ID', 'LEDGER_52_ID', 'ledger52FundingCollateralTag', 'ledger52FundingCollateralTagsForOrder']);
    const parser = routerAst.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'parseFunderParticipantSnapshot')!.getText(routerAst);
    const routerDeps = { ...deps, ...this.funding, dbMultiAssetWallet: this.market, TRPCError, asRows: (r: any) => Array.isArray(r) ? r : [],
      ensureFunderParticipantSnapshotColumns: async () => {},
    };
    this.save = vm(`${parser}\n(${route('funderSaveWalletCollateral').callback});`, routerDeps);
    this.contributors = vm(`(${route('funderGetOrderWalletCollateralContributors').callback});`, routerDeps);
  }
  state() { return structuredClone({ users: this.users, holds: this.holds, locks: this.locks, balances: this.balances, order: this.order, participants: this.participants, entries: this.entries, releases: this.releases, logs: this.logs }); }
  summary(asset = 'USDT', user = 18) {
    const total = units(asset === 'CNY' ? this.users.find(r => r.id === user)!.cny_balance : this.users.find(r => r.id === user)!.balance) +
      this.manual.filter(r => r.user_id === user && (asset === 'CNY' ? String(r.note).startsWith('[CNY]') : !String(r.note).startsWith('[CNY]') && !String(r.note).startsWith('[BALANCE_BASE]'))).reduce((n, r) => n + units(r.amount), 0n);
    const frozen = this.holds.filter(r => r.user_id === user && r.asset_code === asset && r.status === 'active').reduce((n, r) => n + units(r.amount) - units(r.released_amount), 0n);
    return { total: decimal(total), frozen: decimal(frozen), available: decimal(total - frozen) };
  }
  select(rows: any[], sql: string, values: any[]) {
    const where = sql.slice(sql.indexOf('WHERE'));
    function valueFor(condition: string) {
      const match = new RegExp(`\\b${condition.replace(/\?/g, '\\?')}`).exec(where);
      return match ? values[(where.slice(0, match.index).match(/\?/g) || []).length] : undefined;
    }
    return rows.filter(r => {
      for (const col of ['id', 'ledger_id', 'order_id', 'user_id', 'asset_code', 'joint_segment_id', 'request_id']) {
        const v = valueFor(col + ' = ?'); if (v !== undefined && r[col] !== v) return false;
      }
      const exact = valueFor('tag_name = ?'), like = valueFor('tag_name LIKE ?');
      if (exact !== undefined && r.tag_name !== exact && !(like && new RegExp('^' + String(like).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$').test(r.tag_name))) return false;
      if (where.includes("status = 'active'") && r.status !== 'active') return false;
      if (where.includes('amount >') && units(r.amount) <= units(r.released_amount ?? '0')) return false;
      if (where.includes("asset_code IN ('CNY', 'USDT')") && !['CNY', 'USDT'].includes(r.asset_code)) return false;
      if (where.includes("role <> 'inactive'") && r.role === 'inactive') return false;
      return true;
    });
  }
  transaction() {
    let undo: ReturnType<Offline['state']> | undefined;
    let active = false;
    const owned = new Set<number>();
    return {
      beginTransaction: async () => {
        expect(active).toBe(false); this.begins++; undo = this.state(); active = true; owned.clear();
        this.events.push({ action: 'begin', activeTransaction: active });
      },
      commit: async () => {
        this.events.push({ action: 'commit', activeTransaction: active });
        this.commits++; undo = undefined; active = false; owned.clear();
      },
      rollback: async () => {
        this.events.push({ action: 'rollback', activeTransaction: active });
        this.rollbacks++; if (undo) Object.assign(this, undo); undo = undefined; active = false; owned.clear();
      },
      release: () => { this.connectionReleases++; this.events.push({ action: 'release', activeTransaction: active }); },
      execute: async (raw: string, values: any[] = []) => {
        const sql = raw.replace(/\s+/g, ' ').trim(); this.trace.push({ sql, values, activeTransaction: active });
        this.events.push({ action: 'execute', activeTransaction: active, sql });
        if (/^(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/i.test(sql)) {
          this.totalDDL++;
          // Model ordinary DDL pre-commit only when this connection has an active transaction.
          // A transaction-before-DDL regression must still destroy its undo snapshot.
          if (active) { this.activeTransactionDDL++; this.implicitCommits++; undo = undefined; active = false; owned.clear(); }
        }
        if (sql.startsWith('CREATE TABLE IF NOT EXISTS ledger_order_logs')) {
          // Documented MySQL semantics are simulated; no database or actual DDL executes.
          if (this.fail === 'ddl') throw new Error('offline DDL initialization failure');
          return [{ affectedRows: 0 }];
        }
        if (/\b(CREATE|ALTER|DROP|TRUNCATE|RENAME|DELETE)\b/i.test(sql)) throw new Error('FORBIDDEN SQL');
        if (sql.startsWith('SELECT role FROM ledger_members')) return [[{ role: this.role }]];
        if (sql.startsWith('SELECT 1 FROM ledger_members')) return [this.member ? [{ 1: 1 }] : []];
        if (sql.startsWith('SELECT lm.userId')) return [this.users.map(r => ({ userId: r.id, display_name: 'User' + r.id }))];
        if (sql.includes('FROM ledger_orders')) return [this.select([this.order], sql, values).map(r => ({ ...r }))];
        if (sql.includes('FROM ledger_order_participants')) return [this.select(this.participants, sql, values).map(r => ({ ...r }))];
        if (sql.startsWith('UPDATE ledger_orders')) { this.order.collateral_assets = values[0]; return [{ affectedRows: 1 }]; }
        if (sql.startsWith('UPDATE ledger_order_participants')) { this.participants.find(r => r.id === values[1])!.order_snapshot = values[0]; return [{ affectedRows: 1 }]; }
        if (sql.includes('FROM users')) {
          if (sql.includes('FOR UPDATE')) owned.add(values[0]);
          return [this.users.filter(r => r.id === values[0]).map(r => ({ ...r }))];
        }
        if (sql.startsWith('SELECT amount FROM af_manual_balances')) {
          expect(owned.has(values[0])).toBe(true);
          return [this.manual.filter(r => r.user_id === values[0] && (sql.includes("NOT LIKE '[CNY]%'") ? !String(r.note).startsWith('[CNY]') && !String(r.note).startsWith('[BALANCE_BASE]') : String(r.note).startsWith('[CNY]')))];
        }
        if (sql.includes('FROM ai_wallet_project_holds')) {
          const selected = this.select(this.holds, sql, values);
          if (sql.includes('SUM(')) return [[{ frozen: decimal(selected.reduce((n, r) => n + units(r.amount) - units(r.released_amount), 0n)) }]];
          return [selected.map(r => ({ ...r }))];
        }
        if (sql.includes('FROM ai_wallet_asset_collateral_locks')) return [this.select(this.locks, sql, values).map(r => ({ ...r }))];
        if (sql.startsWith('INSERT INTO ai_wallet_asset_balances')) {
          if (!this.balances.some(r => r.user_id === values[0] && r.asset_code === values[1])) this.balances.push({ id: this.balances.length + 1, user_id: values[0], asset_code: values[1], available_balance: '0', frozen_balance: '0' });
          return [{ affectedRows: 1 }];
        }
        if (sql.includes('FROM ai_wallet_asset_balances')) return [this.balances.filter(r => r.user_id === values[0] && r.asset_code === values[1]).map(r => ({ ...r }))];
        if (sql.startsWith('UPDATE ai_wallet_asset_balances')) {
          const r = this.balances.find(r => r.user_id === values[2] && r.asset_code === values[3]);
          const freeze = sql.includes('available_balance = available_balance -');
          // Require and evaluate the ACTUAL production conditional UPDATE; no fabricated limit algorithm.
          expect(sql).toContain((freeze ? 'available_balance' : 'frozen_balance') + ' >= CAST(? AS DECIMAL(36,18))');
          expect(values[0]).toBe(values[1]); expect(values[0]).toBe(values[4]);
          if (this.fail === 'balance' || !r || units(r[freeze ? 'available_balance' : 'frozen_balance']) < units(values[4])) return [{ affectedRows: 0 }];
          const delta = units(values[0]) * (freeze ? -1n : 1n);
          r.available_balance = decimal(units(r.available_balance) + delta); r.frozen_balance = decimal(units(r.frozen_balance) - delta);
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('INSERT INTO ai_wallet_asset_entries')) {
          if (this.fail === 'entry') throw new Error('offline entry failure');
          this.entries.push({ user: values[2], asset: values[3], amount: values[4], event: values[6] }); return [{ insertId: this.entries.length }];
        }
        if (sql.startsWith('INSERT INTO ai_wallet_asset_collateral_locks')) {
          const id = Math.max(0, ...this.locks.map(r => r.id)) + 1;
          this.locks.push({ id, ledger_id: values[0], order_id: values[1], joint_segment_id: values[2], user_id: values[3], asset_code: values[4], amount: values[5], status: 'active' }); return [{ insertId: id }];
        }
        if (sql.startsWith('UPDATE ai_wallet_asset_collateral_locks')) {
          if (sql.includes("SET amount =")) Object.assign(this.locks.find(r => r.id === values[1])!, { amount: values[0], status: 'active' });
          else this.locks.find(r => r.id === values[1])!.status = 'released';
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('INSERT INTO ai_wallet_project_holds')) {
          const id = Math.max(0, ...this.holds.map(r => r.id)) + 1;
          this.holds.push({ id, hold_no: values[0], request_id: values[1], ledger_id: values[2], user_id: values[3], tag_name: values[4], asset_code: values[5], amount: values[6], released_amount: '0', status: 'active' }); return [{ insertId: id }];
        }
        if (sql.startsWith('INSERT INTO ai_wallet_project_hold_releases')) { this.releases.push({ hold: values[2], amount: values[3] }); return [{ insertId: this.releases.length }]; }
        if (sql.startsWith('UPDATE ai_wallet_project_holds')) {
          if (sql.includes('released_amount = amount')) { const r = this.holds.find(r => r.id === values[2])!; r.released_amount = r.amount; r.status = 'released'; }
          else { const r = this.holds.find(r => r.id === values[3])!; r.released_amount = decimal(units(r.released_amount) + units(values[0])); }
          return [{ affectedRows: 1 }];
        }
        if (sql.startsWith('INSERT INTO ledger_order_logs')) {
          if (this.fail === 'log') throw new Error('offline order-log failure');
          this.logs.push([...values]); return [{ insertId: this.logs.length }];
        }
        throw new Error('Unsupported offline SQL: ' + sql);
      },
    };
  }
  call(assets: any[], extra: Record<string, any> = {}) {
    return this.save({ ctx: { user: { id: 99 } }, input: { ledgerId: 52, orderId: 130, userId: 18, assets, autoRegisterOwner: false, ...extra } });
  }
}
function schema(name = 'funderSaveWalletCollateral') {
  return vm(`(${route(name).schema});`, { z, AI_WALLET_SETTLEMENT_ASSETS, AI_WALLET_FUNDING_ASSETS });
}
const params = { orderId: 130, userId: 18, actorUserId: 99 };
const sync = (h: Offline, asset: string, qty: string, extra: any = {}) => asset === 'ETH'
  ? h.market.syncWalletCollateralLocks({ ledgerId: 52, ...params, assets: [{ coin: asset, qty }], ...extra })
  : h.funding.syncLedger52FundingCollateralHolds({ ...params, assets: [{ coin: asset, qty }], ...extra });

describe('real collateral sync and SQL limits: offline only', () => {
  it.each(['ETH', 'USDT', 'CNY'])('%s rejects screenshot 150000.12 against real available 10000.01/frozen0', async asset => {
    const h = new Offline(); h.holds = []; h.locks = [];
    h.users[0].balance = h.users[0].cny_balance = '10000.01'; h.balances[0].available_balance = '10000.01'; h.balances[0].frozen_balance = '0';
    const before = h.state(); await expect(sync(h, asset, '150000.12')).rejects.toThrow('可用余额不足');
    expect(h.state()).toEqual(before); expect(h.commits).toBe(0); expect(h.rollbacks).toBe(1);
  });
  it.each(['ETH', 'USDT', 'CNY'])('%s repeated original target is idempotent, not a draft increment', async asset => {
    const h = new Offline(); if (asset === 'CNY') h.holds.forEach(r => { r.asset_code = 'CNY'; });
    await sync(h, asset, '18'); const after = h.state(); await sync(h, asset, '18'); await sync(h, asset, '18'); expect(h.state()).toEqual(after);
  });
  it.each(['ETH', 'USDT', 'CNY'])('%s reuses only own active order/segment amount; higher draft cannot enlarge budget', async asset => {
    const h = new Offline(); if (asset === 'CNY') h.holds.forEach(r => { r.asset_code = 'CNY'; });
    const unrelated = structuredClone((asset === 'ETH' ? h.locks : h.holds).slice(1));
    await sync(h, asset, '88'); const after = h.state();
    await expect(sync(h, asset, '89')).rejects.toThrow('可用余额不足'); expect(h.state()).toEqual(after);
    expect((asset === 'ETH' ? h.locks : h.holds).slice(1, 4)).toEqual(unrelated);
    if (asset === 'ETH') expect(h.balances[0]).toMatchObject({ available_balance: '0', frozen_balance: '100' });
    else expect(h.summary(asset)).toEqual({ total: '100', frozen: '100', available: '0' });
  });
  it.each(['ETH', 'USDT', 'CNY'])('%s decreasing target releases only its own amount and preserves total', async asset => {
    const h = new Offline(); if (asset === 'CNY') h.holds.forEach(r => { r.asset_code = 'CNY'; });
    const before = structuredClone((asset === 'ETH' ? h.locks : h.holds).slice(1));
    await sync(h, asset, '12'); expect((asset === 'ETH' ? h.locks : h.holds).slice(1)).toEqual(before);
    if (asset === 'ETH') expect(h.balances[0]).toMatchObject({ available_balance: '76', frozen_balance: '24' });
    else expect(h.summary(asset)).toEqual({ total: '100', frozen: '24', available: '76' });
  });
  it.each(['USDT', 'CNY'])('%s real funding total includes matching manual adjustments and all-ledger active holds only', async asset => {
    const h = new Offline(); h.holds.forEach(r => { r.asset_code = asset; });
    h.holds.push(hold(5, 18, asset, '10', 130, '__primary__', 37));
    h.manual = [{ user_id: 18, note: asset === 'CNY' ? '[CNY]adjustment' : 'adjustment', amount: '15' },
      { user_id: 18, note: asset === 'CNY' ? 'other currency' : '[CNY]other currency', amount: '999' },
      { user_id: 18, note: '[BALANCE_BASE]already in users.balance', amount: '999' },
      { user_id: 28, note: asset === 'CNY' ? '[CNY]adjustment' : 'adjustment', amount: '999' }];
    const before = h.state(); await expect(sync(h, asset, '94')).rejects.toThrow('可用余额不足'); expect(h.state()).toEqual(before);
    await sync(h, asset, '93'); expect(h.summary(asset)).toEqual({ total: '115', frozen: '115', available: '0' });
    expect(h.holds.find(r => r.id === 5)).toMatchObject({ ledger_id: 37, amount: '10', status: 'active' });
  });
  it('ETH released historical row contributes zero reusable budget even with an old large amount', async () => {
    const h = new Offline(); h.locks[0].status = 'released'; h.locks[0].amount = '500';
    h.balances[0].available_balance = '1'; h.balances[0].frozen_balance = '12';
    const before = h.state(); await expect(sync(h, 'ETH', '2')).rejects.toThrow('可用余额不足'); expect(h.state()).toEqual(before);
  });
  it.each(['ETH', 'USDT', 'CNY'])('%s duplicate desired asset cannot multiply the effective limit', async asset => {
    const h = new Offline(), before = h.state();
    await expect(sync(h, asset, '1', { assets: [{ coin: asset, qty: '1' }, { coin: asset, qty: '1' }] })).rejects.toThrow('同一币种只能');
    expect(h.state()).toEqual(before); expect(h.trace).toHaveLength(0);
  });
  it('ETH conditional affectedRows=0 rolls back without changing lock or balance', async () => {
    const h = new Offline(), before = h.state(); h.fail = 'balance'; await expect(sync(h, 'ETH', '19')).rejects.toThrow('可用余额不足'); expect(h.state()).toEqual(before);
  });
  it('ETH immutable-entry failure rolls back the successful conditional balance update', async () => {
    const h = new Offline(), before = h.state(); h.fail = 'entry'; await expect(sync(h, 'ETH', '19')).rejects.toThrow('entry failure'); expect(h.state()).toEqual(before);
  });
  it('ETH DECIMAL preserves 18 digits and rejects one-unit overshoot exactly', async () => {
    const h = new Offline(); h.locks = []; h.balances[0].available_balance = '1.000000000000000001'; h.balances[0].frozen_balance = '0';
    await sync(h, 'ETH', '1.000000000000000001'); const before = h.state();
    await expect(sync(h, 'ETH', '1.000000000000000002')).rejects.toThrow('可用余额不足'); expect(h.state()).toEqual(before);
  });
  it.each(['USDT', 'CNY'])('KNOWN LIMIT %s ignores delta below 1e-8 instead of matching target exactly', async asset => {
    const h = new Offline(); if (asset === 'CNY') h.holds.forEach(r => { r.asset_code = asset; });
    const before = h.state(); await sync(h, asset, '18.000000001'); expect(h.state()).toEqual(before);
  });
  it.each(['USDT', 'CNY'])('KNOWN LIMIT %s permits tiny overshoot under funding +1e-8 tolerance', async asset => {
    const h = new Offline(); h.holds = []; h.users[0].balance = h.users[0].cny_balance = '1';
    await sync(h, asset, '1.000000001'); expect(units(h.summary(asset).available)).toBeLessThan(0n);
  });
});

describe('actual save mutation, schema and contributor query', () => {
  it('real AST initializes logs on the same connection inside try before begin, with log INSERT before commit and no transaction DDL', () => {
    const callback = route('funderSaveWalletCollateral').callbackNode!;
    expect(ts.isArrowFunction(callback)).toBe(true);
    const body = (callback as ts.ArrowFunction).body as ts.Block;
    const transactionDeclaration = body.statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(routerAst) === 'transaction')) as ts.VariableStatement;
    const declaration = transactionDeclaration.declarationList.declarations.find(d => d.name.getText(routerAst) === 'transaction')!;
    expect(ts.isAsExpression(declaration.initializer!)).toBe(true);
    expect((declaration.initializer as ts.AsExpression).expression.getText(routerAst)).toBe('conn');
    const tryStatement = body.statements.find(ts.isTryStatement)!;
    const transactionCalls: ts.CallExpression[] = [];
    function collect(n: ts.Node) {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.expression.getText(routerAst) === 'transaction') transactionCalls.push(n);
      ts.forEachChild(n, collect);
    }
    collect(callback);
    const method = (n: ts.CallExpression) => (n.expression as ts.PropertyAccessExpression).name.text;
    const begins = transactionCalls.filter(n => method(n) === 'beginTransaction');
    const commits = transactionCalls.filter(n => method(n) === 'commit');
    expect(begins).toHaveLength(1); expect(commits).toHaveLength(1);
    const sqlCalls = transactionCalls.filter(n => method(n) === 'execute').map(n => {
      expect(ts.isStringLiteralLike(n.arguments[0])).toBe(true);
      return { node: n, sql: (n.arguments[0] as ts.StringLiteralLike).text.replace(/\s+/g, ' ').trim() };
    });
    const ddl = sqlCalls.filter(r => /^(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/i.test(r.sql));
    expect(ddl).toHaveLength(1);
    expect(ddl[0].sql).toMatch(/^CREATE TABLE IF NOT EXISTS ledger_order_logs /);
    expect(ddl[0].node.getStart(routerAst)).toBeGreaterThan(tryStatement.tryBlock.getStart(routerAst));
    expect(ddl[0].node.end).toBeLessThan(begins[0].getStart(routerAst));
    expect(begins[0].end).toBeLessThan(tryStatement.tryBlock.end);
    // DDL and begin must be unconditional, adjacent await statements directly in this try.
    const directCall = (statement: ts.Statement) => ts.isExpressionStatement(statement) && ts.isAwaitExpression(statement.expression) ? statement.expression.expression : undefined;
    expect(directCall(tryStatement.tryBlock.statements[0])).toBe(ddl[0].node);
    expect(directCall(tryStatement.tryBlock.statements[1])).toBe(begins[0]);
    expect(sqlCalls.filter(r => /^(CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/i.test(r.sql) && r.node.getStart(routerAst) > begins[0].getStart(routerAst))).toHaveLength(0);
    const log = sqlCalls.filter(r => r.sql.startsWith('INSERT INTO ledger_order_logs'));
    expect(log).toHaveLength(1);
    expect(log[0].node.getStart(routerAst)).toBeGreaterThan(begins[0].end);
    expect(log[0].node.end).toBeLessThan(commits[0].getStart(routerAst));
    expect(commits[0].end).toBeLessThan(tryStatement.tryBlock.end);
    expect(transactionCalls.some(n => method(n) === 'rollback' && n.getStart(routerAst) > tryStatement.catchClause!.getStart(routerAst) && n.end < tryStatement.catchClause!.end)).toBe(true);
    expect(transactionCalls.some(n => method(n) === 'release' && n.getStart(routerAst) > tryStatement.finallyBlock!.getStart(routerAst) && n.end < tryStatement.finallyBlock!.end)).toBe(true);
  });
  it('adapter counts transaction-before DDL separately and still models active-transaction DDL destroying undo', async () => {
    const h = new Offline(), conn = h.transaction(), before = h.state();
    const ddl = 'CREATE TABLE IF NOT EXISTS ledger_order_logs (id INT)';
    await conn.execute(ddl);
    expect(h.totalDDL).toBe(1); expect(h.activeTransactionDDL).toBe(0); expect(h.implicitCommits).toBe(0);
    await conn.beginTransaction();
    await conn.execute('UPDATE ledger_orders SET collateral_assets = ? WHERE id = ? AND ledger_id = ?', ['offline adapter marker', 130, 52]);
    await conn.execute(ddl); await conn.rollback();
    expect(h.totalDDL).toBe(2); expect(h.activeTransactionDDL).toBe(1); expect(h.implicitCommits).toBe(1);
    expect(h.order.collateral_assets).toBe('offline adapter marker'); expect(h.state()).not.toEqual(before);
  });
  it('actual caller rolls back ETH already frozen when subsequent USDT freeze is insufficient', async () => {
    const h = new Offline(), before = h.state();
    await expect(h.call([{ coin: 'ETH', qty: '19' }, { coin: 'USDT', qty: '150000.12' }])).rejects.toThrow('可用余额不足');
    expect(h.trace.some(t => t.sql.startsWith('INSERT INTO ai_wallet_asset_entries'))).toBe(true);
    expect(h.state()).toEqual(before); expect(h.rollbacks).toBe(1); expect(h.commits).toBe(0); expect(h.implicitCommits).toBe(0);
    expect(h.totalDDL).toBe(1); expect(h.activeTransactionDDL).toBe(0);
  });
  it('actual caller rolls back ETH and earlier CNY when later USDT fails', async () => {
    const h = new Offline(), before = h.state();
    await expect(h.call([{ coin: 'ETH', qty: '19' }, { coin: 'CNY', qty: '10' }, { coin: 'USDT', qty: '150000.12' }])).rejects.toThrow('可用余额不足');
    expect(h.trace.some(t => t.sql.startsWith('INSERT INTO ai_wallet_project_holds') && t.values[5] === 'CNY')).toBe(true);
    expect(h.state()).toEqual(before); expect(h.implicitCommits).toBe(0);
    expect(h.totalDDL).toBe(1); expect(h.activeTransactionDDL).toBe(0);
  });
  it('actual successful save shares one transaction, prelocks owner and updates collateral only after both freezes', async () => {
    const h = new Offline(); await h.call([{ coin: 'ETH', qty: '19' }, { coin: 'USDT', qty: '19' }]);
    expect(h.begins).toBe(1); expect(h.connections).toBe(1); expect(h.commits).toBe(1);
    expect(h.rollbacks).toBe(0); expect(h.connectionReleases).toBe(1);
    expect(h.totalDDL).toBe(1); expect(h.activeTransactionDDL).toBe(0); expect(h.implicitCommits).toBe(0);
    const ddlEvent = h.events.findIndex(e => e.action === 'execute' && e.sql?.startsWith('CREATE TABLE IF NOT EXISTS ledger_order_logs'));
    const beginEvent = h.events.findIndex(e => e.action === 'begin');
    const logEvent = h.events.findIndex(e => e.action === 'execute' && e.sql?.startsWith('INSERT INTO ledger_order_logs'));
    const commitEvent = h.events.findIndex(e => e.action === 'commit');
    expect(ddlEvent).toBe(0); expect(ddlEvent).toBeLessThan(beginEvent); expect(h.events[ddlEvent].activeTransaction).toBe(false);
    expect(logEvent).toBeGreaterThan(beginEvent); expect(logEvent).toBeLessThan(commitEvent); expect(h.events[logEvent].activeTransaction).toBe(true);
    expect(h.trace.filter(t => /^(UPDATE|INSERT)\b/.test(t.sql)).every(t => t.activeTransaction)).toBe(true);
    const owner = h.trace.findIndex(t => t.sql.includes('FROM users') && t.sql.includes('FOR UPDATE'));
    const firstLock = h.trace.findIndex(t => t.sql.includes('FROM ai_wallet_asset_collateral_locks'));
    const ethFreeze = h.trace.findIndex(t => t.sql.startsWith('UPDATE ai_wallet_asset_balances'));
    const usdtFreeze = h.trace.findIndex(t => t.sql.startsWith('INSERT INTO ai_wallet_project_holds'));
    const mirror = h.trace.findIndex(t => t.sql.startsWith('UPDATE ledger_orders'));
    expect(owner).toBeLessThan(firstLock);
    expect(ethFreeze).toBeGreaterThan(firstLock); expect(usdtFreeze).toBeGreaterThan(ethFreeze); expect(mirror).toBeGreaterThan(usdtFreeze);
    expect(h.trace.filter(t => t.sql.includes('FROM ai_wallet_asset_balances')).every(t => t.sql.includes('FOR UPDATE'))).toBe(true);
    expect(JSON.parse(h.order.collateral_assets).map((r: any) => r.qty)).toEqual(['19', '19']);
    expect(h.balances[0]).toMatchObject({ available_balance: '69', frozen_balance: '31' });
    expect(h.summary()).toEqual({ total: '100', frozen: '31', available: '69' }); expect(h.logs).toHaveLength(1);
  });
  it.each(['primary', 'joint'] as const)('actual %s log failure fully rolls back ETH, USDT, order JSON, participant snapshots and entries after transaction-before DDL', async scope => {
    const h = new Offline(); h.fail = 'log';
    h.order.collateral_assets = JSON.stringify([{ coin: 'CNY', qty: '2', source: 'manual' }, { coin: 'ETH', qty: '18', source: 'wallet' }]);
    const before = h.state(), fundingBefore = h.summary();
    const extra = scope === 'joint' ? { jointSegmentId: 's1' } : {};
    await expect(h.call([{ coin: 'ETH', qty: '19' }, { coin: 'USDT', qty: '19' }], extra)).rejects.toThrow('offline order-log failure');
    expect(h.trace.some(t => t.sql.startsWith('UPDATE ai_wallet_asset_balances'))).toBe(true);
    expect(h.trace.some(t => t.sql.startsWith('INSERT INTO ai_wallet_asset_entries'))).toBe(true);
    expect(h.trace.some(t => t.sql.startsWith('INSERT INTO ai_wallet_project_holds') && t.values[5] === 'USDT')).toBe(true);
    expect(h.trace.some(t => t.sql.startsWith(scope === 'joint' ? 'UPDATE ledger_order_participants' : 'UPDATE ledger_orders'))).toBe(true);
    expect(h.trace.find(t => t.sql.startsWith('INSERT INTO ledger_order_logs'))?.activeTransaction).toBe(true);
    expect(h.trace.filter(t => /^(UPDATE|INSERT)\b/.test(t.sql)).every(t => t.activeTransaction)).toBe(true);
    expect(h.state()).toEqual(before); expect(h.summary()).toEqual(fundingBefore);
    expect(h.order.collateral_assets).toBe(before.order.collateral_assets); expect(h.participants).toEqual(before.participants);
    expect(h.entries).toEqual(before.entries); expect(h.locks).toEqual(before.locks); expect(h.holds).toEqual(before.holds); expect(h.balances).toEqual(before.balances);
    expect(h.begins).toBe(1); expect(h.connections).toBe(1); expect(h.rollbacks).toBe(1); expect(h.commits).toBe(0); expect(h.connectionReleases).toBe(1);
    expect(h.totalDDL).toBe(1); expect(h.activeTransactionDDL).toBe(0); expect(h.implicitCommits).toBe(0);
  });
  it('actual DDL initialization failure never begins or executes any financial or mirror UPDATE/INSERT', async () => {
    const h = new Offline(), before = h.state(); h.fail = 'ddl';
    await expect(h.call([{ coin: 'ETH', qty: '19' }, { coin: 'USDT', qty: '19' }])).rejects.toThrow('offline DDL initialization failure');
    expect(h.state()).toEqual(before); expect(h.begins).toBe(0); expect(h.commits).toBe(0); expect(h.rollbacks).toBe(1);
    expect(h.connections).toBe(1); expect(h.connectionReleases).toBe(1);
    expect(h.totalDDL).toBe(1); expect(h.activeTransactionDDL).toBe(0); expect(h.implicitCommits).toBe(0);
    expect(h.trace).toHaveLength(1); expect(h.trace[0].sql).toMatch(/^CREATE TABLE IF NOT EXISTS ledger_order_logs /);
    expect(h.trace[0].activeTransaction).toBe(false);
    expect(h.trace.some(t => /^(UPDATE|INSERT)\b/.test(t.sql))).toBe(false);
    expect(h.events.some(e => e.action === 'begin')).toBe(false);
    expect(h.events.find(e => e.action === 'rollback')?.activeTransaction).toBe(false);
  });
  it.each(['member', 'funder'])('%s actor cannot save or freeze', async role => {
    const h = new Offline(), before = h.state(); h.role = role;
    await expect(h.call([{ coin: 'ETH', qty: '19' }])).rejects.toThrow('仅52号账本管理员'); expect(h.state()).toEqual(before);
  });
  it.each(['deleted', 'settled', 'wrong holder', 'wrong segment', 'other segment owner', 'settled segment', 'settled primary'])('real permission/lifecycle guard rejects %s before balance changes', async kind => {
    const h = new Offline(); let extra: any = {};
    if (kind === 'deleted') h.order.deleted_at = '2026-11-23';
    if (kind === 'settled') h.order.status = 'settled';
    if (kind === 'wrong holder') extra.userId = 28;
    if (kind === 'wrong segment') extra.jointSegmentId = 'missing';
    if (kind === 'other segment owner') { extra.jointSegmentId = 's1'; h.participants[0].order_snapshot = JSON.stringify({ joint_order_segments: [{ id: 's1', owner_user_id: 28 }] }); }
    if (kind === 'settled segment') { extra.jointSegmentId = 's1'; h.participants[0].order_snapshot = JSON.stringify({ joint_order_segments: [{ id: 's1', owner_user_id: 18, status: 'settled' }] }); }
    if (kind === 'settled primary') h.participants[0].order_snapshot = JSON.stringify({ joint_order_primary_settlement: { status: 'completed' } });
    const before = h.state(); await expect(h.call([{ coin: 'ETH', qty: '19' }], extra)).rejects.toThrow(); expect(h.state()).toEqual(before);
    expect(h.trace.some(t => t.sql.startsWith('UPDATE ai_wallet_asset_balances'))).toBe(false);
  });
  it('real joint save changes only exact own segment, not primary or another user/order', async () => {
    const h = new Offline(), before = structuredClone(h.locks.slice(0, 3));
    await h.call([{ coin: 'ETH', qty: '3' }], { jointSegmentId: 's1' });
    expect(h.locks.slice(0, 3)).toEqual(before); expect(h.locks[3].amount).toBe('3'); expect(h.order.collateral_assets).toBeNull();
    expect(JSON.parse(h.participants[0].order_snapshot).joint_order_segments[0].collateral_assets[0].qty).toBe('3');
  });
  it.each([{ ledgerId: 51 }, { orderId: -1 }, { userId: 1.5 }, { jointSegmentId: '../s1' }, { assets: [{ coin: 'BAD', qty: '1' }] }, { assets: [{ coin: 'ETH', qty: '1e8' }] }, { assets: [{ coin: 'ETH', qty: '-1' }] }, { assets: [{ coin: 'ETH', qty: '1.1234567890123456789' }] }])('real zod schema rejects invalid %j', bad => {
    expect(schema().safeParse({ ledgerId: 52, orderId: 130, userId: 18, assets: [{ coin: 'ETH', qty: '1' }], ...bad }).success).toBe(false);
  });
  it('real schema retains default autoRegisterOwner false, optional primary segment and max asset count', () => {
    const s = schema(); const base = { ledgerId: 52, orderId: 130, userId: 18, assets: [] };
    expect(s.parse(base).autoRegisterOwner).toBe(false);
    expect(s.safeParse({ ...base, assets: Array.from({ length: AI_WALLET_SETTLEMENT_ASSETS.length + AI_WALLET_FUNDING_ASSETS.length + 1 }, () => ({ coin: 'ETH', qty: '1' })) }).success).toBe(false);
    expect(route('funderSaveWalletCollateral').text.startsWith('funderSaveWalletCollateral: protectedProcedure')).toBe(true);
  });
  it('real contributors includes only active holds/locks and preserves user plus primary/joint scope', async () => {
    const h = new Offline(); h.holds.push({ ...hold(5, 18, 'USDT', '99'), status: 'released' }, { ...hold(6, 18, 'USDT', '10'), released_amount: '10' });
    h.locks.push({ ...lock(5, 18, '99'), status: 'released' });
    const result = await h.contributors({ ctx: { user: { id: 99 } }, input: { ledgerId: 52, orderId: 130 } });
    expect(result.map((r: any) => r.userId)).toEqual([18, 28]);
    expect(result[0].assets).toEqual(expect.arrayContaining([{ coin: 'ETH', qty: '18', source: 'wallet', jointSegmentId: '__primary__' }, { coin: 'ETH', qty: '2', source: 'wallet', jointSegmentId: 's1' }, { coin: 'USDT', qty: '18', source: 'wallet', jointSegmentId: '__primary__' }, { coin: 'USDT', qty: '2', source: 'wallet', jointSegmentId: 's1' }]));
    expect(result[0].assets).toHaveLength(4); expect(result[1].assets).toHaveLength(2);
  });
  it.each(['funderCreateAssetOrder', 'financeCreateOrder'])('%s real AST is separate autocommit INSERT, no atomic wallet sync', name => {
    const r = route(name);
    expect(r.text.startsWith(name + ': protectedProcedure')).toBe(true);
    expect(r.callback).toContain('INSERT INTO ledger_orders'); expect(r.callback).toContain('return { success: true, orderId:');
    expect(r.callback).not.toContain('beginTransaction'); expect(r.callback).not.toContain('syncWalletCollateralLocks'); expect(r.callback).not.toContain('syncLedger52FundingCollateralHolds');
    // These callbacks are never evaluated: financeCreateOrder contains dynamic real-connection imports.
  });
});
