import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ledger37PresentationInput } from './ledger37-ai-presentation';
import { LEDGER37_AI_DISPLAY_KEY } from '../shared/ledger37-ai-presentation';
const deps = vi.hoisted(() => ({ db: vi.fn(), tx: vi.fn(), prices: vi.fn(), rate: vi.fn(), calculate: vi.fn() }));
vi.mock('./db', () => ({ getDbConnection: deps.db, getDbTransactionConnection: deps.tx }));
vi.mock('./ledger37-ai-wallet-market', () => ({ readLedger37AiWalletMarket: async () => ({
  prices: Object.fromEntries(Object.entries(deps.prices()).map(([code, entry]) => [code, (entry as { price: number }).price])),
  usdtCnyRate: deps.rate(),
}) }));
vi.mock('../shared/miban-wallet-value', async importOriginal => {
  const actual = await importOriginal<typeof import('../shared/miban-wallet-value')>();
  return { ...actual, calculateMibanWalletValue: (...args: Parameters<typeof actual.calculateMibanWalletValue>) => {
    deps.calculate(...args);
    return actual.calculateMibanWalletValue(...args);
  } };
});
import { getMyLedger37AiWalletValue } from './ledger37-ai-wallet-value';
import { calculateMibanWalletValue, type MibanWalletValueInput } from '../shared/miban-wallet-value';

const input: Ledger37PresentationInput = { ledgerId: 37, userId: 201 };
const identity = (overrides: Record<string, unknown> = {}) => ({ ledger_id: 37,
  ledger_owner_id: 870413,
  member_user_id: 201, member_role: 'member', viewer_user_id: 201,
  initialBalances: JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1 }), ...overrides });
// Real global users base + all adjustment entries; active holds from projects/orders/manual.
const funding = (overrides: Record<string, unknown> = {}) => ({ user_id: 201,
  usdt_total: '125', usdt_frozen: '23', usdt_available: '102',
  cny_total: '750', cny_frozen: '70', cny_available: '680',
  invalid_manual: 0, invalid_holds: 0, ...overrides });
const asset = (code: string, available: string, frozen: string, total: string) => ({
  asset_code: code, available_balance: available, frozen_balance: frozen, total_balance: total,
  priceUsdt: 999999, priceCny: 999999, password: 'MARKET_SECRET' });
const defaultAssets = () => [asset('ETH', '3', '2', '5'), asset('BTY', '1.123456781234567891', '9', '10.123456781234567891')];
function offline(options: { identity?: Record<string, unknown>; funding?: Record<string, unknown>;
  assets?: Record<string, unknown>[]; errorAt?: 'identity' | 'funding' | 'assets'; error?: Error & { code?: string }; emptyIdentity?: boolean; emptyFunding?: boolean } = {}) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const connection = { execute: vi.fn(async (sql: string, values: unknown[]) => {
    calls.push({ sql, values });
    if (!/^\s*SELECT\b/i.test(sql) || /FOR UPDATE|LOCK IN SHARE|GET_LOCK|RELEASE_LOCK|\b(?:CREATE|ALTER|INSERT|DELETE|REPLACE|UPDATE)\b/i.test(sql)) throw new Error('只允许非锁定SELECT');
    const kind = /FROM ledgers l/.test(sql) ? 'identity' : /FROM users u/.test(sql) ? 'funding' : /FROM ai_wallet_asset_balances/.test(sql) ? 'assets' : null;
    if (kind === options.errorAt) throw options.error ?? new Error('SQL_FAILURE');
    if (kind === 'identity') { expect(values).toEqual([201, 37]); return [options.emptyIdentity ? [] : [options.identity ?? identity()]]; }
    if (kind === 'funding') { expect(values).toEqual([201, 201, 201]); return [options.emptyFunding ? [] : [options.funding ?? funding()]]; }
    if (kind === 'assets') { expect(values).toEqual([201]); return [options.assets ?? defaultAssets()]; }
    throw new Error(`未知读取: ${sql}`);
  }) };
  deps.db.mockResolvedValue(connection);
  return { calls, connection };
}
const expectedInput = (): MibanWalletValueInput => ({
  usdt: { total: 125, frozen: 23, available: 102 }, cny: { total: 750, frozen: 70, available: 680 },
  assets: defaultAssets().map(row => ({ assetCode: row.asset_code, availableBalance: row.available_balance,
    frozenBalance: row.frozen_balance, totalBalance: row.total_balance })),
  prices: { ETH: 3000, BTY: 0.2, CNY: 999, USDT: 999 }, usdtCnyRate: 7.1,
});
beforeEach(() => {
  vi.clearAllMocks();
  deps.prices.mockReturnValue({ ETH: { price: 3000 }, BTY: { price: 0.2 }, CNY: { price: 999 }, USDT: { price: 999 } });
  deps.rate.mockReturnValue(7.1);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('禁止真实网络'); }));
});
afterEach(() => {
  expect(deps.tx).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('37AI钱包：权限先于钱包DB和行情缓存读取', () => {
  it('已开启会员可读，返回封闭的两个字段，金额复用真正共享纯函数', async () => {
    const f = offline();
    const result = await getMyLedger37AiWalletValue(input);
    expect(result).toEqual({ viewerUserId: 201, availableCny: calculateMibanWalletValue(expectedInput()).availableCny });
    expect(Object.keys(result)).toEqual(['viewerUserId', 'availableCny']);
    expect(JSON.stringify(result)).not.toMatch(/SECRET|balance|assets|frozen|prices|role|password|nickname|username/);
    expect(f.calls).toHaveLength(3);
  });
  it.each(['member', 'owner', 'admin'])('会员角色%s但AI关闭不能借canManage开权限', async role => {
    const f = offline({ identity: identity({ member_role: role, initialBalances: '{}' }) });
    await expect(getMyLedger37AiWalletValue(input)).rejects.toThrow('尚未开启');
    expect(f.calls).toHaveLength(1);
    expect(deps.db).toHaveBeenCalledTimes(1);
    expect(deps.prices).not.toHaveBeenCalled();
    expect(deps.rate).not.toHaveBeenCalled();
  });
  it.each(['admin', 'super_admin', 'systemadmin'])('真实系统管理员本人%s仍必须是37成员，不能非会员读钱包', async systemRole => {
    const f = offline({ identity: identity({ member_user_id: null, viewer_user_id: null, initialBalances: null }) });
    await expect(getMyLedger37AiWalletValue({ ...input, systemRole })).rejects.toThrow('成员');
    expect(f.calls).toHaveLength(1);
    expect(deps.prices).not.toHaveBeenCalled();
  });
  it.each(['admin', 'super_admin', 'systemadmin'])('非owner系统管理员%s即使是37成员，AI关闭不能预览', async systemRole => {
    const f = offline({ identity: identity({ initialBalances: '{}' }) });
    await expect(getMyLedger37AiWalletValue({ ...input, systemRole })).rejects.toThrow('尚未开启');
    expect(f.calls).toHaveLength(1);
    expect(deps.prices).not.toHaveBeenCalled();
  });
  it('唯一真实owner可预览AI关闭的钱包，不依赖系统角色', async () => {
    offline({ identity: identity({ ledger_owner_id: 201, member_role: 'owner', initialBalances: '{}' }) });
    expect((await getMyLedger37AiWalletValue({ ...input, systemRole: 'parent' })).viewerUserId).toBe(201);
  });
  it('唯一owner代看也不能取得关闭状态AI预览', async () => {
    const f = offline({ identity: identity({ ledger_owner_id: 201, member_role: 'owner', initialBalances: '{}' }) });
    await expect(getMyLedger37AiWalletValue({ ...input, isViewingAs: true })).rejects.toThrow('尚未开启');
    expect(f.calls).toHaveLength(1);
  });
  it('普通非会员在唯一身份SELECT后拒绝', async () => {
    const f = offline({ identity: identity({ member_user_id: null, viewer_user_id: null }) });
    await expect(getMyLedger37AiWalletValue(input)).rejects.toThrow('成员');
    expect(f.calls).toHaveLength(1);
    expect(deps.prices).not.toHaveBeenCalled();
  });
  it.each([false, true])('另一管理员代看关闭目标不能继承系统角色(会员=%s)', async member => {
    const f = offline({ identity: identity({ initialBalances: '{}', member_user_id: member ? 201 : null, viewer_user_id: member ? 201 : null }) });
    await expect(getMyLedger37AiWalletValue({ ...input, systemRole: 'super_admin', isViewingAs: true })).rejects.toThrow(member ? '尚未开启' : '成员');
    expect(f.calls).toHaveLength(1);
    expect(deps.prices).not.toHaveBeenCalled();
  });
  it('只读代看开启会员只读目标自己的全局钱包', async () => {
    const f = offline();
    expect((await getMyLedger37AiWalletValue({ ...input, systemRole: 'super_admin', isViewingAs: true })).viewerUserId).toBe(201);
    expect(f.calls.map(row => row.values)).toEqual([[201, 37], [201, 201, 201], [201]]);
  });
  it('夹带realUser/targetUserId/ctx不授权', async () => {
    const f = offline({ identity: identity({ initialBalances: '{}' }) });
    const malicious = { ...input, realUser: { id: 28, role: 'super_admin' }, ctx: { realUser: { role: 'super_admin' } }, targetUserId: 28 };
    await expect(getMyLedger37AiWalletValue(malicious)).rejects.toThrow('尚未开启');
    expect(f.calls).toHaveLength(1);
    expect(deps.prices).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('无效ID %s先拒绝，零DB和行情读取', async userId => {
    await expect(getMyLedger37AiWalletValue({ ...input, userId })).rejects.toThrow('ID无效');
    expect(deps.db).not.toHaveBeenCalled();
    expect(deps.prices).not.toHaveBeenCalled();
  });
  it('wrongledger先拒绝零DB和行情读取', async () => {
    await expect(getMyLedger37AiWalletValue({ ...input, ledgerId: 52 } as unknown as Ledger37PresentationInput)).rejects.toThrow('37号');
    expect(deps.db).not.toHaveBeenCalled();
    expect(deps.rate).not.toHaveBeenCalled();
  });
  it.each([28, '201'])('JOIN返回foreign/非精确身份 %s拒绝', async viewer_user_id => {
    const f = offline({ identity: identity({ viewer_user_id }) });
    await expect(getMyLedger37AiWalletValue(input)).rejects.toThrow('身份不匹配');
    expect(f.calls).toHaveLength(1);
    expect(deps.prices).not.toHaveBeenCalled();
  });
  it('账本不存在拒绝，不读取钱包', async () => {
    const f = offline({ emptyIdentity: true });
    await expect(getMyLedger37AiWalletValue(input)).rejects.toThrow('账本不存在');
    expect(f.calls).toHaveLength(1);
  });
});

describe('全球原币可用余额+米瓣权威价格与完整精度', () => {
  it('总额扣所有holds，市场available不加冻结、不再扣冻结、不叠加收益本金', async () => {
    const f = offline();
    await getMyLedger37AiWalletValue(input);
    expect(deps.calculate).toHaveBeenCalledTimes(1);
    expect(deps.calculate).toHaveBeenCalledWith(expectedInput());
    const query = f.calls[1].sql;
    expect(query).toContain("NOT LIKE '[BALANCE_BASE]%'");
    expect(query).toContain("LIKE '[CNY]%'");
    expect(query).toContain("status = 'active'");
    expect(query).toContain('amount - COALESCE(released_amount, 0)');
    expect(query).not.toMatch(/ledger_id\s*=|dividend|profit|principal|balance_history|recharge_orders/);
  });
  it('CNY/USDT权威锚定而非行情同名伪价格，BTY来自统一现货快照', async () => {
    offline({ funding: funding({ usdt_total: '10', usdt_frozen: '2', usdt_available: '8', cny_total: '100', cny_frozen: '10', cny_available: '90' }),
      assets: [asset('BTY', '2', '4000', '4002'), asset('USDT', '888', '0', '888'), asset('CNY', '888', '0', '888')] });
    const result = await getMyLedger37AiWalletValue(input);
    const expected = calculateMibanWalletValue({ usdt: { total: 10, frozen: 2, available: 8 }, cny: { total: 100, frozen: 10, available: 90 },
      assets: [{ assetCode: 'BTY', availableBalance: '2', frozenBalance: '4000' }], prices: { BTY: 0.2, CNY: 999, USDT: 999 }, usdtCnyRate: 7.1 });
    expect(result.availableCny).toBe(expected.availableCny);
  });
  it('18位小数/大量真实资产原字符串交给同一纯函数，不toFixed截断', async () => {
    const assets = Array.from({ length: 80 }, (_, n) => asset(`ASSET${n}`, `${n + 1}.123456789123456789`, '0.000000000000000001', `${n + 1}.123456789123456790`));
    const prices = Object.fromEntries(assets.map((row, n) => [row.asset_code, (n + 1) / 7]));
    deps.prices.mockReturnValue(Object.fromEntries(Object.entries(prices).map(([code, price]) => [code, { price }])));
    offline({ assets });
    const result = await getMyLedger37AiWalletValue(input);
    const pureInput = { ...expectedInput(), assets: assets.map(row => ({ assetCode: row.asset_code, availableBalance: row.available_balance,
      frozenBalance: row.frozen_balance, totalBalance: row.total_balance })), prices };
    expect(result.availableCny).toBe(calculateMibanWalletValue(pureInput).availableCny);
    expect(deps.calculate.mock.calls[0][0].assets[79].availableBalance).toBe('80.123456789123456789');
  });
  it('未知非零资产缺价返回null，绝不丢弃或补0', async () => {
    offline({ assets: [asset('UNKNOWN', '1', '0', '1')] });
    expect(await getMyLedger37AiWalletValue(input)).toEqual({ viewerUserId: 201, availableCny: null });
  });
  it('未知资产只冻结无可用不阻断可用合计，按共享函数处理', async () => {
    offline({ assets: [asset('UNKNOWN', '0', '10', '10')] });
    const expected = calculateMibanWalletValue({ ...expectedInput(), assets: [{ assetCode: 'UNKNOWN', availableBalance: '0', frozenBalance: '10' }] });
    expect((await getMyLedger37AiWalletValue(input)).availableCny).toBe(expected.availableCny);
  });
  it.each([0, -1])('BTY无有效行情%s返回未知，不能使用余额priceUsdt', async price => {
    offline(); deps.prices.mockReturnValue({ ETH: { price: 3000 }, BTY: { price } });
    expect((await getMyLedger37AiWalletValue(input)).availableCny).toBeNull();
  });
  it('适配器明确FX未知null返回null，不向purecalc捏造正数rate', async () => {
    offline(); deps.rate.mockReturnValue(null);
    expect(await getMyLedger37AiWalletValue(input)).toEqual({ viewerUserId: 201, availableCny: null });
    expect(deps.calculate).not.toHaveBeenCalled();
  });
  it.each([undefined, NaN, Infinity, 0, -1])('适配器非法FX %s拒绝，不猜默认汇率', async rate => {
    offline(); deps.rate.mockReturnValue(rate);
    await expect(getMyLedger37AiWalletValue(input)).rejects.toThrow('汇率数据无效');
    expect(deps.calculate).not.toHaveBeenCalled();
  });
  it('有来源的合法6.7与米瓣same snapshot同值，不能按数字拒绝', async () => {
    offline(); deps.rate.mockReturnValue(6.7);
    expect((await getMyLedger37AiWalletValue(input)).availableCny).toBe(calculateMibanWalletValue({ ...expectedInput(), usdtCnyRate: 6.7 }).availableCny);
  });
  it('纯CNY及冻结资产在缺rate时同米瓣保持未知，不捏造单位FX', async () => {
    offline({ funding: funding({ usdt_total: '23', usdt_frozen: '23', usdt_available: '0' }),
      assets: [asset('ETH', '0', '2', '2'), asset('UNKNOWN', '0', '4', '4')] });
    deps.rate.mockReturnValue(null);
    expect(await getMyLedger37AiWalletValue(input)).toEqual({ viewerUserId: 201, availableCny: null });
    expect(deps.calculate).not.toHaveBeenCalled();
  });
  it('纯CNY无市场资产但缺FX不抄算法绕过共享engine', async () => {
    offline({ funding: funding({ usdt_total: '0', usdt_frozen: '0', usdt_available: '0', cny_available: '123.123456789123456789' }), assets: [] });
    deps.rate.mockReturnValue(null);
    expect((await getMyLedger37AiWalletValue(input)).availableCny).toBeNull();
  });
  it('父行情source严格映射getCryptoPrices相同prices/usdtCnyRate，无联网或启动刷新', () => {
    const source = readFileSync(new URL('./ledger37-ai-wallet-market.ts', import.meta.url), 'utf8');
    expect(source).toContain("from './price-scanner'");
    expect(source).toContain('getAllLatestPrices()');
    expect(source).toContain('getUsdtCnyRate()');
    expect(source).toContain('prices[code] = entry.price');
    expect(source).toContain('return { prices, usdtCnyRate:');
    expect(source).not.toMatch(/\bfetch\s*\(|refresh|startPriceScanner|getLive|ensure|\.execute\s*\(/);
  });
  it('每次读取新权威快照，不缓存上一人的估值', async () => {
    offline(); const first = await getMyLedger37AiWalletValue(input);
    deps.rate.mockReturnValue(7.2); const second = await getMyLedger37AiWalletValue(input);
    expect(first.availableCny).not.toBe(second.availableCny);
    expect(deps.prices).toHaveBeenCalledTimes(2); expect(deps.rate).toHaveBeenCalledTimes(2);
  });
});

describe('读失败/坏数据不造0且无任何资金或schema写入口', () => {
  it('仅合法不存在市场余额表empty安全，仍保留真实CNY/USDT', async () => {
    offline({ errorAt: 'assets', error: Object.assign(new Error('absent market table'), { code: 'ER_NO_SUCH_TABLE' }) });
    const expected = calculateMibanWalletValue({ ...expectedInput(), assets: [] });
    expect((await getMyLedger37AiWalletValue(input)).availableCny).toBe(expected.availableCny);
  });
  it.each(['ER_TABLEACCESS_DENIED_ERROR', 'ER_BAD_FIELD_ERROR', 'ECONNRESET'])('市场读取%s必须传播而非empty/zero', async code => {
    const error = Object.assign(new Error(code), { code }); offline({ errorAt: 'assets', error });
    await expect(getMyLedger37AiWalletValue(input)).rejects.toBe(error); expect(deps.prices).not.toHaveBeenCalled();
  });
  it.each(['ER_NO_SUCH_TABLE', 'ER_ACCESS_DENIED_ERROR', 'ECONNRESET'])('资金读取%s不能吞错，包括必需users/流水/holds缺失', async code => {
    const error = Object.assign(new Error(code), { code }); offline({ errorAt: 'funding', error });
    await expect(getMyLedger37AiWalletValue(input)).rejects.toBe(error); expect(deps.prices).not.toHaveBeenCalled();
  });
  it.each([{ usdt_total: null }, { cny_available: '' }, { usdt_frozen: 'NaN' }, { cny_total: Infinity }, { invalid_manual: 1 }, { invalid_holds: 1 }, { invalid_holds: null }, { user_id: 28 }])('损坏资金%s拒绝', async values => {
    offline({ funding: funding(values) }); await expect(getMyLedger37AiWalletValue(input)).rejects.toThrow();
    expect(deps.prices).not.toHaveBeenCalled();
  });
  it('坏市场余额不会因FX缺失被隐藏为null', async () => {
    offline({ assets: [asset('ETH', '', '0', '1')] }); deps.rate.mockReturnValue(null);
    await expect(getMyLedger37AiWalletValue(input)).rejects.toThrow('数据无效');
  });
  it('重复市场资产让共享估值拒绝，不双重计总', async () => {
    offline({ assets: [asset('ETH', '1', '0', '1'), asset('eth', '2', '0', '2')] });
    await expect(getMyLedger37AiWalletValue(input)).rejects.toThrow('重复');
  });
  it('用户记录丢失不能返回0', async () => {
    offline({ emptyFunding: true }); await expect(getMyLedger37AiWalletValue(input)).rejects.toThrow('用户不存在');
  });
  it('钱包连接不可用不能返回0', async () => {
    offline(); deps.db.mockResolvedValueOnce({ execute: async () => [[identity()]] }).mockResolvedValueOnce(null);
    await expect(getMyLedger37AiWalletValue(input)).rejects.toThrow('数据库连接不可用');
  });
  it('行情读取抛错传播，不补0', async () => {
    offline(); const error = new Error('QUOTE_FAILURE'); deps.prices.mockImplementationOnce(() => { throw error; });
    await expect(getMyLedger37AiWalletValue(input)).rejects.toBe(error);
  });
  it('真实源码AST只调用纯估值/权限读取/SELECT，无mutating函数、网络或旧summary', () => {
    const source = readFileSync(new URL('./ledger37-ai-wallet-value.ts', import.meta.url), 'utf8');
    const ast = ts.createSourceFile('service.ts', source, ts.ScriptTarget.Latest, true);
    const calls: string[] = [], imports: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) calls.push(node.expression.getText(ast));
      if (ts.isImportDeclaration(node)) imports.push(node.moduleSpecifier.getText(ast));
      ts.forEachChild(node, visit);
    }; visit(ast);
    expect((ast as any).parseDiagnostics).toHaveLength(0);
    expect(calls).toContain('readLedger37PresentationState'); expect(calls).toContain('calculateMibanWalletValue');
    expect(calls.join('\n')).not.toMatch(/ensure|adjust|debit|credit|freeze|transfer|Transaction|startPrice|refresh|fetch|\.toFixed|\.commit|\.query/);
    expect(imports.join('\n')).not.toMatch(/routers|db-recharge|db-multi-asset-wallet|ledger37-wallet|crypto-portfolio-fx/);
    expect(source).toContain('state.context.viewerUserId !== input.userId');
    expect(source).not.toMatch(/ctx\.|realUser|targetUserId/);
  });
});
