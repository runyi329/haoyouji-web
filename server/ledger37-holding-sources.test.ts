import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ state: vi.fn(), snapshot: vi.fn(), member: vi.fn(), closed: vi.fn(), changes: vi.fn(), external: vi.fn(), db: vi.fn(() => { throw new Error('No real DB in tests'); }) }));
vi.mock('./db', () => ({ getDbConnection: mocks.db, getDbTransactionConnection: mocks.db }));
vi.mock('./ledger37-ai-presentation', () => ({
  readLedger37PresentationState: mocks.state,
}));
vi.mock('./ledger-stock-portfolio', () => ({ getMyLedger37R1HoldingSnapshot: mocks.snapshot, getMyLedger37MemberHoldingSnapshot: mocks.member, getMyLedger37MemberClosedTrades: mocks.closed, getMyLedger37MemberPositionChanges: mocks.changes }));
vi.mock('./holding-source-cache', () => ({ getExternalHoldingSources: mocks.external }));
import { getMyLedger37HoldingSources } from './ledger37-holding-sources';
const input = { ledgerId: 37 as const, userId: 17 };
function state(aiEnabled = true, canManage = false) { return { isMember: true, context: { ledgerId: 37, viewerUserId: 17, aiEnabled, canManage, viewer: { userId: 17 } } }; }
function snapshot(holdings: any[] = [], extra: Record<string, unknown> = {}) {
  return { viewerUserId: 17, aiEnabled: true, holdings, valuationAsOf: null, reportingCurrency: null, ...extra };
}
const stock = { symbol: 'NVDA', stockName: '英伟达', currency: 'USD', shares: '9007199254740993.00000001', weightPct: null };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.mockResolvedValue(state());
  mocks.snapshot.mockResolvedValue(snapshot());
  mocks.member.mockResolvedValue(snapshot());
  mocks.closed.mockResolvedValue({ viewerUserId: 17, aiEnabled: true, closedTrades: [] });
  mocks.changes.mockResolvedValue({ viewerUserId: 17, aiEnabled: true, positionChanges: [] });
  mocks.external.mockReturnValue([]);
});
describe('37 holding sources read-only safety', () => {
  it('validates member first; global membership errors do not become empty', async () => {
    mocks.state.mockRejectedValue(new Error('数据库连接不可用'));
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('数据库连接不可用');
    expect(mocks.snapshot).not.toHaveBeenCalled(); expect(mocks.external).not.toHaveBeenCalled();
  });
  it.each([{ isMember: false }, { context: { ...state().context, viewer: null } }, { context: { ...state().context, viewer: { userId: 22 } } }, { context: { ...state().context, viewerUserId: 22 } }, { context: { ...state().context, ledgerId: 52 } }])('rejects member or viewer mismatch %j', async patch => {
    mocks.state.mockResolvedValue({ ...state(), ...patch });
    await expect(getMyLedger37HoldingSources({ ...input, systemRole: 'admin' })).rejects.toThrow();
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it.each([{ systemRole: 'user' }, { systemRole: 'admin' }, { systemRole: 'super_admin' }, { systemRole: 'systemadmin' }, { systemRole: 'admin', isViewingAs: true }, { systemRole: 'super_admin', isViewingAs: true }, {}])('AI-off cannot be bypassed by non-owner system role or viewing-as %j', async role => {
    mocks.state.mockResolvedValue(state(false));
    await expect(getMyLedger37HoldingSources({ ...input, ...role })).rejects.toThrow('尚未开启');
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
  it('permits AI-off only for an authoritative real owner context, without system-role exemption', async () => {
    mocks.state.mockResolvedValue(state(false, true));
    mocks.snapshot.mockResolvedValue(snapshot([], { aiEnabled: false }));
    mocks.member.mockResolvedValue(snapshot([], { aiEnabled: false }));
    mocks.closed.mockResolvedValue({ viewerUserId: 17, aiEnabled: false, closedTrades: [] });
    mocks.changes.mockResolvedValue({ viewerUserId: 17, aiEnabled: false, positionChanges: [] });
    expect((await getMyLedger37HoldingSources({ ...input, systemRole: 'parent' })).aiEnabled).toBe(false);
  });
  it('whitelists source-wide exact shares, never personal participation or prices', async () => {
    mocks.snapshot.mockResolvedValue(snapshot([{ ...stock, hasParticipation: true, pnlCny: 99999, categoryId: 123, tag: 'private', orders: [{ price: 9 }], allocatedQuantity: '1', costValue: 90 }]));
    const result = await getMyLedger37HoldingSources(input);
    expect(result.sources[0].holdings).toEqual([stock]);
    expect(JSON.stringify(result)).not.toMatch(/pnlCny|hasParticipation|categoryId|orders|private|allocatedQuantity|costValue/);
    expect(result.sources[0].coverageNote).toContain('比例留空');
    expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.state.mock.invocationCallOrder[0]).toBeLessThan(mocks.snapshot.mock.invocationCallOrder[0]);
  });
  it('permits verified full weights and communicates current-quantity/close-date/reporting basis', async () => {
    mocks.snapshot.mockResolvedValue(snapshot([{ ...stock, weightPct: 60 }, { ...stock, symbol: 'MSFT', shares: '1', weightPct: 40 }], { valuationAsOf: '2026-11-18', reportingCurrency: 'USD' }));
    const result = await getMyLedger37HoldingSources(input);
    expect(result.sources[0].holdings.map(s => s.weightPct)).toEqual([60, 40]);
    expect(result.sources[0].coverageNote).toContain('2026-11-18');
    expect(result.sources[0].coverageNote).toContain('报告币种USD');
  });
  it.each([null, 9007199254740992, '', 'NaN', '-1', '0', '0.00000000', '1e3'])('unverified or lost quantity fails closed (%s)', async shares => {
    mocks.snapshot.mockResolvedValue(snapshot([{ ...stock, shares }]));
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('股数不可用');
  });
  it.each([NaN, Infinity, -1, 101, undefined])('invalid weight fails closed (%s)', async weightPct => {
    mocks.snapshot.mockResolvedValue(snapshot([{ ...stock, weightPct }]));
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('权重无效');
  });
  it('rejects incomplete denominator, missing snapshot currency/date, and unmerged duplicates', async () => {
    for (const data of [snapshot([{ ...stock, weightPct: 50 }], { valuationAsOf: '2026-11-18', reportingCurrency: 'USD' }),
      snapshot([{ ...stock, weightPct: 100 }]),
      snapshot([{ ...stock, weightPct: 100 }, { ...stock, symbol: 'MSFT' }], { valuationAsOf: '2026-11-18', reportingCurrency: 'USD' })]) {
      mocks.snapshot.mockResolvedValue(data);
      await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('估值不完整');
    }
    mocks.snapshot.mockResolvedValue(snapshot([stock, stock]));
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('完成合并');
  });
  it('R1 works with unavailable external sources without querying external network', async () => {
    mocks.external.mockReturnValue([{ id: 'pelosi', status: 'unavailable', holdings: [] }]);
    const result = await getMyLedger37HoldingSources(input);
    expect(result.sources[0].status).toBe('available'); expect(result.sources[1].holdings).toEqual([]);
  });
  it('does not swallow DB errors or changed global AI/member identity', async () => {
    mocks.snapshot.mockRejectedValue(new Error('原始JSON损坏'));
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('原始JSON损坏');
    for (const patch of [{ viewerUserId: 22 }, { aiEnabled: false }]) {
      mocks.snapshot.mockResolvedValue(snapshot([], patch));
      await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('状态已变化');
    }
  });
});


describe('37 holding sources member values: strict isolated projection', () => {
  const valueDate = '2026-11-18';
  const ownStock = () => ({ ...stock, shares: '2.12345678', weightPct: 100, marketValue: { amount: '12345678901234567890.123456789012345678', currency: 'USD', asOf: valueDate } });
  const ownSnapshot = (row: any = ownStock(), extra: any = {}) => snapshot([row], { valuationAsOf: valueDate, reportingCurrency: 'USD', ...extra });
  it('projects own exact value only, leaving full-source holdings and external snapshots unchanged', async () => {
    mocks.snapshot.mockResolvedValue(snapshot([stock]));
    mocks.member.mockResolvedValue(ownSnapshot({ ...ownStock(), categoryId: 90250, entryPrice: 111, price: 222, pnl: 333, otherUser: 999, projectName: 'PRIVATE_PROJECT', marketValue: { ...ownStock().marketValue, privateField: 'SECRET' } }));
    const result = await getMyLedger37HoldingSources(input);
    expect(result.sources[0].holdings).toEqual([stock]);
    expect(result.sources[0].memberPortfolio).toEqual({ holdings: [ownStock()], valuationAsOf: valueDate, reportingCurrency: 'USD', closedTrades: [], positionChanges: [] });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_PROJECT|SECRET|categoryId|entryPrice|otherUser|projectName|privateField|"pnl"|"price"/);
    expect(mocks.member).toHaveBeenCalledWith(input); expect(mocks.db).not.toHaveBeenCalled();
  });
  it('empty own allocation never falls back to full R1 source; missing quote remains null not zero', async () => {
    mocks.snapshot.mockResolvedValue(snapshot([stock]));
    let result = await getMyLedger37HoldingSources(input);
    expect(result.sources[0].holdings).toHaveLength(1); expect(result.sources[0].memberPortfolio?.holdings).toEqual([]);
    mocks.member.mockResolvedValue(snapshot([{ ...stock, shares: '2' }]));
    result = await getMyLedger37HoldingSources(input);
    expect(result.sources[0].memberPortfolio?.holdings).toEqual([{ ...stock, shares: '2', marketValue: null }]);
  });
  it.each([{ viewerUserId: 22 }, { aiEnabled: false }])('changed own identity is rejected without third-party/source fallback %j', async patch => {
    mocks.member.mockResolvedValue(snapshot([], patch));
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('个人持仓展示状态已变化');
  });
  it.each([null, 'NaN', 'Infinity', '-1', '1e3', 9007199254740992, '', '0.1.2'])('bad amount cannot become a formatted market value %s', async amount => {
    mocks.member.mockResolvedValue(ownSnapshot({ ...ownStock(), marketValue: { ...ownStock().marketValue, amount } }));
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('个人持仓市值无效');
  });
  it.each([{ asOf: '2026-11-17' }, { asOf: '2026-02-30' }, { currency: 'CNY' }, { currency: 'EUR' }])('wrong date/currency cannot mix into personal denominator %j', async patch => {
    mocks.member.mockResolvedValue(ownSnapshot({ ...ownStock(), marketValue: { ...ownStock().marketValue, ...patch } }));
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('个人持仓市值无效');
  });
  it('known zero remains zero and missing one price cannot create partially-valued personal holdings', async () => {
    mocks.member.mockResolvedValue(ownSnapshot({ ...ownStock(), marketValue: { ...ownStock().marketValue, amount: '0' } }));
    expect((await getMyLedger37HoldingSources(input)).sources[0].memberPortfolio?.holdings[0].marketValue?.amount).toBe('0');
    mocks.member.mockResolvedValue(ownSnapshot({ ...ownStock(), marketValue: null }));
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('个人持仓估值不完整');
    mocks.member.mockResolvedValue(ownSnapshot({ ...ownStock(), weightPct: null }));
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('个人持仓估值不完整');
  });
  it('member SQL failures are surfaced, not converted to full-source or an empty personal account', async () => {
    mocks.member.mockRejectedValue(new Error('personal read unavailable'));
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('personal read unavailable');
  });
});

describe('37 member closed-trade adapter: isolated whitelist', () => {
  const trade = { symbol: 'NVDA', stockName: '英伟达', openedDate: '2026-11-02', closedDate: '2026-11-18' };
  it('keeps each real partial closure while current holdings and personal market values remain independent', async () => {
    mocks.snapshot.mockResolvedValue(snapshot([stock]));
    mocks.closed.mockResolvedValue({ viewerUserId: 17, aiEnabled: true, closedTrades: [
      { ...trade, categoryId: 9, lotId: 99, sellEventId: 88, participationId: 77, userId: 66,
        price: '999', remaining: '555', pnl: '444', quantity: '0.000000000000000001', secret: 'SECRET' },
      { ...trade }, { ...trade, closedDate: null },
    ] });
    const result = await getMyLedger37HoldingSources(input);
    expect(result.sources[0].holdings).toEqual([stock]);
    expect(result.sources[0].memberPortfolio).toEqual({ holdings: [], valuationAsOf: null, reportingCurrency: null,
      closedTrades: [trade, trade, { ...trade, closedDate: null }], positionChanges: [] });
    expect(JSON.stringify(result)).not.toMatch(/categoryId|lotId|sellEventId|participationId|"userId"|"price"|remaining|pnl|quantity|SECRET/);
    expect(mocks.closed).toHaveBeenCalledWith(input); expect(mocks.db).not.toHaveBeenCalled();
    expect(mocks.member.mock.invocationCallOrder[0]).toBeLessThan(mocks.closed.mock.invocationCallOrder[0]);
  });
  it.each([{ viewerUserId: 999 }, { aiEnabled: false }])('changed closed-history identity/AI is rejected %j', async patch => {
    mocks.closed.mockResolvedValue({ viewerUserId: 17, aiEnabled: true, closedTrades: [], ...patch });
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('个人交易展示状态已变化');
  });
  it.each([undefined, '', '2026-02-30', '2026-11-18T00:00:00Z', '2026-1-2', 1])('invalid date cannot masquerade as trading date %j', async date => {
    mocks.closed.mockResolvedValue({ viewerUserId: 17, aiEnabled: true, closedTrades: [{ ...trade, closedDate: date }] });
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('个人交易历史无效');
  });
  it('null trading dates remain null and cannot fall back to checkedAt or valuation date', async () => {
    mocks.closed.mockResolvedValue({ viewerUserId: 17, aiEnabled: true, closedTrades: [{ ...trade, openedDate: null, closedDate: null }] });
    expect((await getMyLedger37HoldingSources(input)).sources[0].memberPortfolio?.closedTrades).toEqual([{ ...trade, openedDate: null, closedDate: null }]);
  });
  it('missing helper infrastructure does not become empty history or full-source inferred closures', async () => {
    mocks.closed.mockRejectedValue(new Error('closed read unavailable'));
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('closed read unavailable');
    expect(mocks.external).not.toHaveBeenCalled(); expect(mocks.db).not.toHaveBeenCalled();
  });
  it('authorization/member valuation failures prevent history reads', async () => {
    mocks.member.mockRejectedValue(new Error('personal unavailable'));
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('personal unavailable');
    expect(mocks.closed).not.toHaveBeenCalled();
  });
});

describe('37 member position changes: proven safe allocations and reductions', () => {
  const addition = { symbol: 'GOOGL', stockName: '谷歌', action: 'new' };
  it('adds real allocation even without closed trades, quote or full-source holdings', async () => {
    mocks.changes.mockResolvedValue({ viewerUserId: 17, aiEnabled: true, positionChanges: [addition] });
    const result = await getMyLedger37HoldingSources(input);
    expect(result.sources[0].holdings).toEqual([]);
    expect(result.sources[0].memberPortfolio?.holdings).toEqual([]);
    expect(result.sources[0].memberPortfolio?.closedTrades).toEqual([]);
    expect(result.sources[0].memberPortfolio?.positionChanges).toEqual([addition]);
    expect(mocks.changes).toHaveBeenCalledWith(input);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('strictly projects symbols, names and actions; no dates, monetary or project/audit identifiers', async () => {
    const rows = [{ ...addition, categoryId: 90250, lotId: 92, orderId: 123, participationId: 77,
      userId: 998, allocatedQuantity: '100', quantity: '9007199254740993', price: '444', pnl: '555',
      openedDate: '2026-01-01', assignedAt: '2026-11-19', note: 'PRIVATE_NOTE', rawAudit: { secret: 'SECRET' } },
      { ...addition, action: 'increase' }, { ...addition, action: 'decrease' }, { ...addition, action: 'decrease' }];
    mocks.changes.mockResolvedValue({ viewerUserId: 17, aiEnabled: true, positionChanges: rows });
    const changes = (await getMyLedger37HoldingSources(input)).sources[0].memberPortfolio?.positionChanges;
    expect(changes).toEqual([addition, { ...addition, action: 'increase' }, { ...addition, action: 'decrease' }, { ...addition, action: 'decrease' }]);
    expect(JSON.stringify(changes)).not.toMatch(/categoryId|lotId|orderId|participationId|userId|quantity|Quantity|price|pnl|Date|assignedAt|PRIVATE|SECRET|rawAudit/);
  });
  it.each([{ viewerUserId: 999 }, { aiEnabled: false }])('rejects changed member identity/AI rather than leaking another user %j', async patch => {
    mocks.changes.mockResolvedValue({ viewerUserId: 17, aiEnabled: true, positionChanges: [addition], ...patch });
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('个人仓位变动展示状态已变化');
    expect(mocks.external).not.toHaveBeenCalled();
  });
  it.each(['', 'buy', 'sell', 'reduce', 'NEW', null, undefined, 1])('rejects unrecognized or missing action %j', async action => {
    mocks.changes.mockResolvedValue({ viewerUserId: 17, aiEnabled: true, positionChanges: [{ ...addition, action }] });
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('个人仓位变动无效');
  });
  it.each([null, { ...addition, symbol: '' }, { ...addition, symbol: 123 }, { ...addition, stockName: '' }, { ...addition, stockName: null }])('rejects bad stock record %j', async row => {
    mocks.changes.mockResolvedValue({ viewerUserId: 17, aiEnabled: true, positionChanges: [row] });
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('个人仓位变动无效');
  });
  it.each([null, undefined, {}])('missing history infrastructure never falls back to holdings-derived additions %j', async positionChanges => {
    mocks.member.mockResolvedValue(snapshot([stock]));
    mocks.changes.mockResolvedValue({ viewerUserId: 17, aiEnabled: true, positionChanges });
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('个人仓位变动不可用');
    expect(mocks.external).not.toHaveBeenCalled();
  });
  it('SQL errors are surfaced and prior valuation failure prevents the read', async () => {
    mocks.changes.mockRejectedValue(new Error('allocation read unavailable'));
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('allocation read unavailable');
    mocks.changes.mockClear();
    mocks.member.mockRejectedValue(new Error('member valuation unavailable'));
    await expect(getMyLedger37HoldingSources(input)).rejects.toThrow('member valuation unavailable');
    expect(mocks.changes).not.toHaveBeenCalled();
  });
});
