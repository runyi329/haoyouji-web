import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { normalizePortfolioSymbol, portfolioCurrency, portfolioCashMultiplier, isCryptoPortfolioSymbol } from '../shared/portfolio-instruments';
import { readTagVisible } from '../shared/tag-visibility';
import { replaceTopLevelJsonValue } from './r1-lossless-json';
import { LEDGER37_AI_DISPLAY_KEY } from '../shared/ledger37-ai-presentation';

// 只执行生产源码的纯合并、权限函数和新SELECT入口；不import股票server的网络/DB依赖。
const source = readFileSync(new URL('./ledger-stock-portfolio.ts', import.meta.url), 'utf8');
const trees = [source, readFileSync(new URL('./ledger37-ai-presentation.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('./r1-stock-presentation.ts', import.meta.url), 'utf8')]
  .map(text => ts.createSourceFile('production.ts', text, ts.ScriptTarget.Latest, true));
function declaration(name: string) {
  for (const tree of trees) {
    const found = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (found) return found.getText(tree).replace(/^export /, '');
  }
  throw new Error(`生产函数缺失: ${name}`);
}
const names = ['mergeLedger37AiStockPool', 'getMyLedger37AiStockPool', 'calendarSourceNumber',
  'normalizeSymbol', 'stockCurrency', 'readLedger37Balances', 'readLedger37AiEnabled', 'validateInput',
  'isLedger37AiSystemAdmin', 'readLedger37AiViewer', 'readLedger37PresentationState',
  'readR1Balances', 'readR1AiEnabled', 'validateScope', 'systemAdmin', 'readR1StockPresentationState',
  'readLedger37StockPoolUsdCnyRate', 'readLiveUsdtCnyRate'];
const compiled = ts.transpileModule(names.map(declaration).join('\n') +
  '\n({ merge: mergeLedger37AiStockPool, read: getMyLedger37AiStockPool });', {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const self = { ledgerId: 37, userId: 201 };
const catalog = [
  { id: 1, ledgerId: 37, name: '绝密标签A', parentId: null, accounting_mode: 'stock_portfolio' },
  { id: 2, ledgerId: 37, name: '绝密标签B', parentId: null, accounting_mode: 'stock_portfolio' },
];
function row(symbol = '600000.SH', totalPnl: number | null = 10, extra: Record<string, unknown> = {}) {
  return { id: 9, symbol, stockName: '浦发银行', currency: portfolioCurrency(symbol), status: 'active',
    allocatedQuantity: 10, quantity: 5, totalPnl, floatingPnl: totalPnl, realizedPnl: 0, ...extra };
}
function lot(symbol = '600000.SH', currentQuantity = 5, stockName = '浦发银行', currency = portfolioCurrency(symbol)) {
  return { symbol, stockName, currency, currentQuantity };
}
function part(lots: any[], participations: any[] = [], usdCnyRate: number | null = 7, usdtCnyRate: number | null = 6) {
  return { lots, participations, usdCnyRate, usdtCnyRate };
}
function fixture() {
  const state = { member: true, role: 'member', raw: JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1 }),
    viewerUserId: 201, ledgerId: 37, ledgerExists: true, categoryError: '', noConnection: false,
    lotError: null as any, missingRows: false, fxError: false,
    usdQuote: { rate: 7, pair: 'USD/CNY', stale: false } as any,
    usdtQuote: { rate: 6, pair: 'USDT/CNY', stale: false } as any };
  const log: Array<{ sql: string; values: any[] }> = [];
  const lots: Record<number, any[]> = {
    1: [{ symbol: '600000.SH', stock_name: '浦发银行', current_quantity: '5', unit_cost: '999', order_id: 321 }],
    2: [{ symbol: 'AAPL', stock_name: '苹果', current_quantity: '0', category_name: '绝密标签B' }],
  };
  const portfolios: Record<number, { rows: any[]; usdCnyRate: number | null; usdtCnyRate: number | null }> = {
    1: { rows: [row()], usdCnyRate: 7, usdtCnyRate: 6 },
    2: { rows: [], usdCnyRate: 7, usdtCnyRate: 6 },
  };
  const privateRows = new WeakMap<object, any[]>();
  const conn = { execute: vi.fn(async (sql: string, values: any[] = []) => {
    log.push({ sql, values });
    if (!/^\s*SELECT\b/.test(sql) || /FOR UPDATE/i.test(sql)) throw new Error('只允许SELECT');
    if (/FROM ledgers l/.test(sql)) return [state.ledgerExists ? [{ ledger_id: state.ledgerId,
      member_user_id: state.member ? values[0] : null, member_role: state.role, initialBalances: state.raw,
      viewer_user_id: state.member ? state.viewerUserId : null }] : []];
    if (/FROM ledger_categories c/.test(sql)) {
      if (/LEFT JOIN ledger_members/.test(sql)) {
        if (state.categoryError) throw new Error(state.categoryError);
        const category = catalog.find(item => item.id === values[1]);
        return [category ? [{ ...category, member_user_id: state.member ? values[0] : null,
          member_role: state.role, initialBalances: state.raw }] : []];
      }
      expect(values).toEqual([201, 37]);
      return [catalog];
    }
    if (/FROM ledger_stock_lots l/.test(sql)) {
      if (state.lotError) throw state.lotError;
      expect(values[0]).toBe(37);
      return [lots[values[1]] ?? []];
    }
    throw new Error('离线测试未知SQL: ' + sql);
  }) };
  const cache = vi.fn(async (categoryId: number, userId: number) => {
    expect(userId).toBe(201);
    const stored = portfolios[categoryId];
    const portfolio = { summary: { usdCnyRate: stored.usdCnyRate, usdtCnyRate: stored.usdtCnyRate },
      // 污染raw组合和观察对象不能被新接口导出或用于权重。
      observations: [row('AAPL', 999999)], positions: [{ unitCost: 999, quantity: 999 }],
      categoryName: '绝密标签A', orderId: 321, members: [{ userId: 999 }] };
    if (!state.missingRows) privateRows.set(portfolio, stored.rows);
    return portfolio;
  });
  const db = vi.fn(async () => state.noConnection ? null : conn);
  const runtime = runInNewContext(compiled, {
    Error, Map, Set, WeakMap, Number, JSON, Array, getDbConnection: db,
    normalizePortfolioSymbol, portfolioCurrency, portfolioCashMultiplier, readTagVisible,
    replaceTopLevelJsonValue, LEDGER37_AI_DISPLAY_KEY, R1_STOCK_LEDGER_ID: 37,
    getCachedMemberStockPortfolio: cache, r1MemberPresentationRows: privateRows,
    isCryptoPortfolioSymbol,
    getLiveStockUsdCnyQuote: vi.fn(async () => { if (state.fxError) throw new Error('离线行情失败'); return state.usdQuote; }),
    getLiveCryptoUsdtCnyQuote: vi.fn(async () => { if (state.fxError) throw new Error('离线行情失败'); return state.usdtQuote; }),
  }, { timeout: 1000 }) as { merge: (parts: any[]) => any[]; read: (input: any) => Promise<any> };
  return { state, log, conn, cache, db, lots, portfolios, ...runtime };
}
function safe(value: unknown) {
  const text = JSON.stringify(value);
  expect(text).not.toMatch(/绝密标签|categoryId|categoryName|category_name|entryPrice|unitCost|unit_cost|marketPrice|costValue|marketValue|quantity|orderId|order_id|members|observations|floatingPnl|realizedPnl/);
  for (const stock of (value as any).stocks ?? []) expect(Object.keys(stock).sort()).toEqual(
    ['symbol', 'stockName', 'currency', 'status', 'pnlCny', 'hasParticipation'].sort());
}

describe('AI选股池纯白名单合并', () => {
  it('多lot/跨标签symbol+currency去重，任一未平仓即holding，未allocated不补0', () => {
    const { merge } = fixture();
    const stocks = merge([part([lot(), lot('600000.SH', 0), lot('AAPL', 0, '苹果')], [row()]),
      part([lot('600000.SH', 0)], [row('600000.SH', -4)])]);
    expect(stocks).toEqual([
      { symbol: '600000.SH', stockName: '浦发银行', currency: 'CNY', status: 'holding', pnlCny: 6, hasParticipation: true },
      { symbol: 'AAPL', stockName: '苹果', currency: 'USD', status: 'closed', pnlCny: null, hasParticipation: false },
    ]);
    safe({ stocks });
  });
  it('同名不同symbol、同symbol不同currency绝不混合', () => {
    const { merge } = fixture();
    const stocks = merge([part([lot('AAPL', 1, '同名', 'USD'), lot('MSFT', 1, '同名', 'USD'), lot('AAPL', 1, '同名', 'USDT')],
      [row('AAPL', 1), row('MSFT', 2), row('AAPL', 3, { currency: 'USDT' })])]);
    expect(stocks.map(s => [s.symbol, s.currency, s.pnlCny])).toEqual([['AAPL', 'USD', 7], ['AAPL', 'USDT', 18], ['MSFT', 'USD', 14]]);
  });
  it('native正负合计不doubleflip，真实0合法，USD和USDT独立FX', () => {
    const { merge } = fixture();
    const stocks = merge([part([lot('AAPL'), lot('CRYPTO:BTC-USDT'), lot()],
      [row('AAPL', 10), row('AAPL', -3), row('CRYPTO:BTC-USDT', -2), row('600000.SH', 0)], 7.2, 6.8)]);
    expect(stocks.map(s => s.pnlCny)).toEqual([0, 50.4, -13.6]);
  });
  it.each([null, Number.NaN, Infinity])('未知/nonfinite传播，不补0 (%s)', unknown => {
    const { merge } = fixture();
    expect(merge([part([lot()], [row('600000.SH', 3), row('600000.SH', unknown)])])[0])
      .toMatchObject({ pnlCny: null, hasParticipation: true });
  });
  it.each([null, 0, Number.NaN, Infinity, -1])('缺失/非法FX不补0且USDT不借USD (%s)', fx => {
    const { merge } = fixture();
    const stocks = merge([part([lot('AAPL'), lot('CRYPTO:BTC-USDT')], [row('AAPL', 0), row('CRYPTO:BTC-USDT', 2)], fx, fx)]);
    expect(stocks.every(s => s.pnlCny === null && s.hasParticipation)).toBe(true);
    expect(merge([part([lot('CRYPTO:BTC-USDT')], [row('CRYPTO:BTC-USDT', 2)], 7, null)])[0].pnlCny).toBeNull();
  });
  it('closed历史收益保留、paused/pending不可充当已知real pnl', () => {
    const { merge } = fixture();
    expect(merge([part([lot('600000.SH', 0)], [row('600000.SH', -8, { status: 'closed', quantity: 0 })])])[0])
      .toMatchObject({ status: 'closed', pnlCny: -8, hasParticipation: true });
    for (const status of ['paused', 'pending']) expect(merge([part([lot()], [row('600000.SH', 999, { status })])])[0].pnlCny).toBeNull();
  });
  it('零allocation/非目录参与不得混入，求和overflow必须null', () => {
    const { merge } = fixture();
    expect(merge([part([lot()], [row('600000.SH', 99, { allocatedQuantity: 0 }), row('AAPL', 99)])])[0])
      .toMatchObject({ pnlCny: null, hasParticipation: false });
    expect(merge([part([lot()], [row('600000.SH', Number.MAX_VALUE), row('600000.SH', Number.MAX_VALUE)])])[0].pnlCny).toBeNull();
  });
});

describe('AI选股池权限与SQL隔离', () => {
  it('member含全部未获配股票真实名称、只有本人Pnl；SQL SELECT-only且先逐category授权', async () => {
    const f = fixture(); const result = await f.read(self);
    expect(result).toMatchObject({ viewerUserId: 201, aiEnabled: true });
    expect(result.stocks).toHaveLength(2);
    expect(result.stocks[1]).toMatchObject({ stockName: '苹果', pnlCny: null, hasParticipation: false, status: 'closed' });
    safe(result);
    const metadata = f.log.filter(item => /FROM ledger_stock_lots l/.test(item.sql));
    expect(metadata).toHaveLength(2);
    for (const item of metadata) {
      const index = f.log.indexOf(item);
      expect(f.log[index - 1].sql).toMatch(/LEFT JOIN ledger_members/);
      expect(f.log[index - 1].values).toEqual([201, item.values[1], 37]);
      expect(item.sql).toContain('sale.status=\'active\'');
      expect(item.sql).toContain("sale.event_type IN ('reduce','sell')");
      expect(item.sql).toContain("opening.status='active'");
      expect(item.sql).toContain('sale.ledger_id=l.ledger_id');
      expect(item.sql).toContain('WHERE l.ledger_id=? AND l.category_id=?');
      expect(item.sql).not.toMatch(/execution_price|unit_cost|note|recipient|user_id|stock_name.*\*/);
    }
    expect(f.log.every(item => /^\s*SELECT/.test(item.sql))).toBe(true);
  });
  it('AIoff普通成员拒绝；adminself/owner/admin允许；系统管理员非会员仍拒绝', async () => {
    const f = fixture(); f.state.raw = '{}';
    await expect(f.read(self)).rejects.toThrow('尚未开启'); expect(f.cache).not.toHaveBeenCalled();
    for (const role of ['owner', 'admin']) { f.state.role = role; expect((await f.read(self)).aiEnabled).toBe(false); }
    f.state.role = 'member'; expect((await f.read({ ...self, systemRole: 'admin' })).aiEnabled).toBe(false);
    f.state.member = false; await expect(f.read({ ...self, systemRole: 'admin' })).rejects.toThrow('成员');
  });
  it('admin代看不继承任何管理权限；开启后仍只展示目标会员股票', async () => {
    const f = fixture(); f.state.raw = '{}'; f.state.role = 'admin';
    await expect(f.read({ ...self, systemRole: 'admin', isViewingAs: true })).rejects.toThrow('尚未开启');
    f.state.raw = JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1 });
    const result = await f.read({ ...self, systemRole: 'admin', isViewingAs: true }); safe(result);
    expect(result.viewerUserId).toBe(201);
    f.state.member = false; await expect(f.read({ ...self, systemRole: 'admin', isViewingAs: true })).rejects.toThrow('成员');
  });
  it.each(['PREVIEW_READONLY', 'DEV_BYPASS_AUTH'])('readonly %s不改变只读权限/无写入', async flag => {
    vi.stubEnv(flag, 'true');
    try { const f = fixture(); safe(await f.read(self)); expect(f.log.every(item => /^\s*SELECT/.test(item.sql))).toBe(true); }
    finally { vi.unstubAllEnvs(); }
  });
  it('错ledger/非法user/身份错配 failclosed', async () => {
    const f = fixture();
    await expect(f.read({ ...self, ledgerId: 52 })).rejects.toThrow('37号');
    for (const userId of [0, -1, 1.5, Number.NaN]) await expect(f.read({ ...self, userId })).rejects.toThrow('成员ID');
    expect(f.log).toHaveLength(0);
    f.state.viewerUserId = 999; await expect(f.read(self)).rejects.toThrow('身份不匹配');
    f.state.viewerUserId = 201; f.state.ledgerId = 52; await expect(f.read(self)).rejects.toThrow('账本不存在');
  });
  it('不可见标签只skip该标签，其他权限/JSON/读错误必须抛', async () => {
    const f = fixture(); f.state.raw = JSON.stringify({ [LEDGER37_AI_DISPLAY_KEY]: 1, '绝密标签B__visible': 0 });
    expect((await f.read(self)).stocks.map((s: any) => s.symbol)).toEqual(['600000.SH']);
    expect(f.cache).toHaveBeenCalledTimes(1);
    expect(f.log.filter(item => /FROM ledger_stock_lots l/.test(item.sql)).map(item => item.values)).toEqual([[37, 1]]);
    f.state.categoryError = 'read failed'; await expect(f.read(self)).rejects.toThrow('read failed');
    f.state.raw = 'broken'; await expect(f.read(self)).rejects.toThrow('JSON损坏');
  });
  it('完全无participations也展示全部stocks，不读取观察数据', async () => {
    const f = fixture(); f.portfolios[1].rows = [];
    const result = await f.read(self);
    expect(result.stocks.every((s: any) => s.pnlCny === null && !s.hasParticipation)).toBe(true); safe(result);
    expect(f.log.some(item => /observation|sale_profit_allocations|FOR UPDATE|information_schema/i.test(item.sql))).toBe(false);
    const body = declaration('getMyLedger37AiStockPool');
    expect(body).not.toMatch(/buildMyStockTagObservationPortfolio|getStockTagPublicPortfolio|ensure\w+|CREATE|ALTER|UPDATE/);
    expect(body).toContain('r1MemberPresentationRows.get(portfolio)');
    expect(body).toContain('getCachedMemberStockPortfolio(categoryId, input.userId)');
  });
  it('股票名称非字符串不序列化raw，缺计算/缺lot表明确报错且不DDL', async () => {
    const f = fixture(); f.lots[1][0].stock_name = { entryPrice: 99, userId: 999 };
    await expect(f.read(self)).rejects.toThrow('名称无效');
    f.lots[1][0].stock_name = '浦发银行'; f.state.missingRows = true;
    await expect(f.read(self)).rejects.toThrow('计算不可用');
    f.state.missingRows = false; f.state.lotError = Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' });
    await expect(f.read(self)).rejects.toThrow('批次数据表尚未就绪');
    f.state.lotError = new Error('SQL outage'); await expect(f.read(self)).rejects.toThrow('SQL outage');
    expect(f.log.every(item => /^\s*SELECT/.test(item.sql))).toBe(true);
  });
  it('当前状态未知不伪造closed；私有FX和native真实行参与CNY计算', async () => {
    const f = fixture(); f.lots[1] = [{ symbol: 'CRYPTO:BTC-USDT', stock_name: '比特币', current_quantity: '0.00000001' }];
    f.portfolios[1].rows = [row('CRYPTO:BTC-USDT', -2)];
    expect((await f.read(self)).stocks.find((s: any) => s.currency === 'USDT')).toMatchObject({ status: 'holding', pnlCny: -12 });
    f.state.usdtQuote = null;
    expect((await f.read(self)).stocks.find((s: any) => s.currency === 'USDT').pnlCny).toBeNull();
    f.lots[1][0].current_quantity = null; await expect(f.read(self)).rejects.toThrow('状态不可用');
  });
  it('live USD取代组合默认6.7；stale/错pair/缺quote/失败均null且USDT独立', async () => {
    const f = fixture();
    f.lots[1] = [{ symbol: 'CRYPTO:BTC-USDT', stock_name: '比特币', current_quantity: '1' }];
    f.portfolios[1].rows = [row('CRYPTO:BTC-USDT', 2)];
    f.portfolios[2].rows = [row('AAPL', 3, { status: 'closed' })];
    f.portfolios[2].usdCnyRate = 6.7; f.state.usdQuote.rate = 7.25;
    expect((await f.read(self)).stocks.map((s: any) => s.pnlCny)).toEqual([21.75, 12]);
    for (const quote of [null, { rate: 7.25, pair: 'USD/CNY', stale: true },
      { rate: 7.25, pair: 'USDT/CNY', stale: false }, { rate: 0, pair: 'USD/CNY', stale: false },
      { rate: Infinity, pair: 'USD/CNY', stale: false }, { rate: Number.NaN, pair: 'USD/CNY', stale: false }]) {
      f.state.usdQuote = quote;
      expect((await f.read(self)).stocks.map((s: any) => s.pnlCny)).toEqual([null, 12]);
    }
    f.state.usdQuote = { rate: 7, pair: 'USD/CNY', stale: false };
    f.state.usdtQuote.stale = true;
    expect((await f.read(self)).stocks.map((s: any) => s.pnlCny)).toEqual([21, null]);
    f.state.fxError = true;
    expect((await f.read(self)).stocks.every((s: any) => s.pnlCny === null)).toBe(true);
  });
  it('新增代码无ES5 Set/Map spread，源码解析有效', () => {
    expect((trees[0] as any).parseDiagnostics).toHaveLength(0);
    const body = declaration('mergeLedger37AiStockPool') + declaration('getMyLedger37AiStockPool');
    expect(body).not.toMatch(/\[\.\.\.(?:new Set|\w+\.(?:entries|values)\()/);
    expect(body).not.toMatch(/for\s*\([^)]*of\s+\w+\.(?:entries|values)\(/);
  });
});
