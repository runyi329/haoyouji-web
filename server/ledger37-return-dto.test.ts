import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { projectLedger37OrdinaryReturnDto, projectLedger37StockReturnDto } from './ledger37-return-dto';

const MEMBER = { ledgerId: 37, canManage: false, isViewingAs: false };
const OWNER = { ledgerId: 37, canManage: true, isViewingAs: false };
const VIEW_AS = { ledgerId: 37, canManage: true, isViewingAs: true };
const secretRule = { thresholdPrice: 77, downsidePercent: 0, version: 8,
  effectiveAt: '2026-11-02T00:00:00+08:00', startDate: '2026-11-02' };
function ordinaryFixture() {
  return { ledgerId: 37, categories: [{ categoryId: 10, categoryName: '普通', status: 'ready',
    latestDate: '2026-11-26', totalPnl: 70, todayPnl: 30,
    points: [{ date: '2026-11-26', balance: 600, countedBalance: 930, rawPnl: 400,
      pnl: 70, dailyPnl: 30, capitalChange: 25, withdrawToDate: 12,
      capitalChangeToday: 5, withdrawToday: 2, ruleVersion: 8 }] }] };
}
function stockFixture() {
  const snapshot = { snapshotDate: '2026-11-26', historical: true, ready: true, priced: true,
    status: 'ready', totalPnl: 50, dailyPnl: -20, dailyPnlReady: true, dailyPnlReason: null,
    policyVersion: 'cn-day-us-overnight-1505-v1', usdCnyRate: 7.2, fxLockedAt: '2026-11-26T15:05:00+08:00',
    missingSymbols: [], quoteAsOf: [{ symbol: 'X', source: 'verified_close', carried: false }],
    downsideRuleAudit: [{ lotId: 1, version: 8, rawPrice: 40, countedPrice: 77, effectiveAt: secretRule.effectiveAt }] };
  return { ledgerId: 37, categoryId: 20, canEdit: false, participantView: true,
    positions: [{ symbol: 'X', marketPrice: 40, marketValue: 400, countedMarketValue: 770,
      floatingPnl: 600, countedFloatingPnl: 230, countedPnl: 230,
      lots: [{ id: 1, quantity: 10, entryPrice: 100, unitCost: 100, marketPrice: 40,
        countedMarketPrice: 77, marketValue: 400, countedMarketValue: 770,
        floatingPnl: 600, countedFloatingPnl: 230, countedPnl: 230,
        entryAt: '2026-11-02T00:00:00+08:00', entryCountedOffset: -10,
        downsideRuleVersion: 8, downsideRule: secretRule,
        note: '真实卖出价格及分红回收风险', audit: { kind: 'buy_edit_audit', version: 1, executionPrice: 100 } }] }],
    participations: [{ id: 1, allocatedQuantity: 10, remainingQuantity: 10, entryPrice: 100,
      startDate: '2026-11-02', pauseDate: null, countedRealizedPnl: 11, countedRealizedPnlCny: 79.2,
      entryCountedOffset: -10, fxLockedAt: '2026-11-26T15:05:00+08:00' }],
    closedLots: [{ sellPrice: 120, sellValue: 1200, countedRealizedPnl: 13, realizedPnl: 20,
      transactionFee: 1.2, fxLocked: true }],
    dailySnapshots: [snapshot], summary: { totalPnl: 50, marketValue: 770, floatingPnl: 230,
      realizedPnl: 11, dailyChange: -20, dailyChangeReady: true, userTagOverrideVersion: 5,
      latestSnapshot: snapshot, priorSnapshot: null },
    settlementSummary: { totalPnl: 50, confirmedTotalPnl: 50, userTagOverrideVersion: 5,
      lastConfirmedSnapshot: snapshot },
    history: [{ type: 'buy', quantity: 10, executionPrice: 100, transactionFee: 1,
      status: 'active', note: '真实金融提示：押金未到账，分红超额需追回' }],
    quotes: { X: { price: 40 }, __stockLotDownside: { audit: [secretRule], countedMarketValue: 770 } },
  };
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('ledger 37 member return DTO (pure helper, no business imports/DB/network)', () => {
  it('removes ordinary comparison disclosures, retains final cumulative/daily returns and real balances/flows', () => {
    const fixture = deepFreeze(ordinaryFixture());
    const before = JSON.stringify(fixture);
    const result = projectLedger37OrdinaryReturnDto(fixture, MEMBER);
    expect(result).toEqual({ ledgerId: 37, categories: [{ categoryId: 10, categoryName: '普通', status: 'ready',
      latestDate: '2026-11-26', totalPnl: 70, todayPnl: 30,
      points: [{ date: '2026-11-26', balance: 600, pnl: 70, dailyPnl: 30,
        capitalChange: 25, withdrawToDate: 12, capitalChangeToday: 5, withdrawToday: 2 }] }] });
    expect(JSON.stringify(result)).not.toMatch(/ruleVersion|rawPnl|countedBalance/);
    expect(JSON.stringify(fixture)).toBe(before);
    expect(result).not.toBe(fixture);
  });

  it('removes stock rule config, audit, versions and internal counted price/carry at every nested boundary', () => {
    const fixture = deepFreeze(stockFixture());
    const before = JSON.stringify(fixture);
    const result = projectLedger37StockReturnDto(fixture, MEMBER);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/downsideRule|__stockLotDownside|effectiveAt|thresholdPrice|downsidePercent|userTagOverrideVersion|entryCountedOffset|countedMarketPrice/);
    const { countedMarketPrice: _price, entryCountedOffset: _carry, downsideRuleVersion: _version,
      downsideRule: _rule, ...financialLot } = fixture.positions[0].lots[0];
    expect(result.positions[0].lots[0]).toEqual(financialLot);
    expect(result.closedLots).toEqual(fixture.closedLots);
    expect(result.history).toEqual(fixture.history);
    expect(result.participations[0].entryPrice).toBe(100);
    expect(result.participations[0].countedRealizedPnlCny).toBe(79.2);
    expect(result.summary.totalPnl).toBe(50);
    expect(result.summary.dailyChange).toBe(-20);
    expect(result.summary.dailyChangeReady).toBe(true);
    expect(result.summary.latestSnapshot.ready).toBe(true);
    expect(result.summary.latestSnapshot.policyVersion).toBe(fixture.summary.latestSnapshot.policyVersion);
    expect(result.summary.latestSnapshot.quoteAsOf).toEqual(fixture.summary.latestSnapshot.quoteAsOf);
    expect(result.quotes.X).toEqual({ price: 40 });
    expect(JSON.stringify(fixture)).toBe(before);
  });

  it('projects snapshot arrays and overview nested confirmed snapshots, without mutating shared caches', () => {
    const fixture = stockFixture();
    const overview = [{ categoryId: fixture.categoryId, points: fixture.dailySnapshots, summary: fixture.settlementSummary }];
    const result = projectLedger37StockReturnDto(deepFreeze(overview), MEMBER);
    expect(result[0].points[0]).not.toHaveProperty('downsideRuleAudit');
    expect(result[0].summary.lastConfirmedSnapshot).not.toHaveProperty('downsideRuleAudit');
    expect(overview[0].points[0]).toHaveProperty('downsideRuleAudit');
    expect(result[0].points[0].dailyPnl).toBe(-20);
    expect(result[0].summary.confirmedTotalPnl).toBe(50);
  });

  it('preserves actual owner management DTOs exactly, but viewing-as never inherits the actor management flag', () => {
    const ordinary = ordinaryFixture(), stock = stockFixture();
    expect(projectLedger37OrdinaryReturnDto(ordinary, OWNER)).toBe(ordinary);
    expect(projectLedger37StockReturnDto(stock, OWNER)).toBe(stock);
    expect(projectLedger37OrdinaryReturnDto(ordinary, VIEW_AS)).toEqual(projectLedger37OrdinaryReturnDto(ordinary, MEMBER));
    expect(projectLedger37StockReturnDto(stock, VIEW_AS)).toEqual(projectLedger37StockReturnDto(stock, MEMBER));
    // Actor system role/admin and an unverified owner-looking tag do not grant management.
    expect(projectLedger37StockReturnDto(stock, { ...MEMBER, actorRole: 'admin', memberRole: 'owner' } as typeof MEMBER))
      .toEqual(projectLedger37StockReturnDto(stock, MEMBER));
  });

  it('preserves null/zero/status, ordinary observation config and true dividend/financial risk facts', () => {
    const fixture = { userId: 9, observations: [{ categoryId: 10, status: 'pending',
      totalPnl: null, todayPnl: 0, countedBalance: null, rawPnl: null, ruleVersion: null,
      config: { enabled: true, initialAmount: 1000, ratio: 0, startDate: '2026-11-02', pauseDate: null },
      points: [], riskNote: '真实价格缺失；已实收分红可能超过累计回报，需要追回',
      audit: { kind: 'dividend', amount: 100, verified: false }, dividend: 100 }] };
    const result = projectLedger37OrdinaryReturnDto(fixture, MEMBER);
    expect(result.observations[0]).not.toHaveProperty('ruleVersion');
    expect(result.observations[0].config).toEqual(fixture.observations[0].config);
    expect(result.observations[0].status).toBe('pending');
    expect(result.observations[0].totalPnl).toBeNull();
    expect(result.observations[0].todayPnl).toBe(0);
    expect(result.observations[0].riskNote).toBe(fixture.observations[0].riskNote);
    expect(result.observations[0].audit).toEqual(fixture.observations[0].audit);
  });

  it('only normalizes specific internal pending reasons, leaving financial verification reasons unchanged', () => {
    for (const reason of ['missing_downside_historical_baseline', 'missing_downside_sale_evidence', 'missing_downside_member_baseline']) {
      expect(projectLedger37StockReturnDto({ ready: false, dailyPnl: null, dailyPnlReady: false, dailyPnlReason: reason }, MEMBER))
        .toEqual({ ready: false, dailyPnl: null, dailyPnlReady: false, dailyPnlReason: 'pending_verification' });
    }
    for (const reason of ['missing_historical_fx', 'invalid_trade_history', 'missing_verified_close', 'missing_previous_session']) {
      expect(projectLedger37StockReturnDto({ dailyPnlReason: reason }, MEMBER)).toEqual({ dailyPnlReason: reason });
    }
  });

  it('does not affect any other ledger, mutate Dates, or change stock ordinary numeric results', () => {
    const fixture = stockFixture();
    expect(projectLedger37StockReturnDto(fixture, { ...MEMBER, ledgerId: 52 })).toBe(fixture);
    expect(projectLedger37OrdinaryReturnDto(ordinaryFixture(), { ...MEMBER, ledgerId: 52 }).categories[0].points[0]).toHaveProperty('ruleVersion');
    const date = new Date('2026-11-26T00:00:00Z');
    expect(projectLedger37StockReturnDto({ capturedAt: date, amount: '123.4500', zero: 0, pending: null }, MEMBER))
      .toEqual({ capturedAt: date, amount: '123.4500', zero: 0, pending: null });
  });
});

describe('static authenticated response boundary wiring (source text only)', () => {
  const routers = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
  const portfolio = readFileSync(new URL('./ledger-stock-portfolio.ts', import.meta.url), 'utf8');
  const procedure = (name: string) => routers.slice(routers.indexOf(`    ${name}: protectedProcedure`))
    .split(/\n    [A-Za-z]\w*: protectedProcedure/)[0];
  it('new generic alias and legacy endpoint use the same calculator and safe projection, without target/role input', () => {
    for (const name of ['getMyOrdinaryTagReturnValuations', 'getMyOrdinaryTagDownsideValuations']) {
      const source = procedure(name);
      expect(source).toContain('.input(z.object({ ledgerId: z.literal(37) }).strict())');
      expect(source).toContain('const access = await getLedger37Access(ctx)');
      expect(source).toContain('const result = await getMyOrdinaryTagDownsideValuations');
      expect(source).toContain('userId: ctx.user.id');
      expect(source).toContain('return projectLedger37OrdinaryReturnDto(result');
      expect(source).toContain('canManage: access.canManage, isViewingAs: Boolean(ctx.isViewingAs)');
    }
  });
  it('ordinary observation overview rejects third-person parameter before projecting computed results', () => {
    const source = procedure('getMyOrdinaryTagObservationOverview');
    expect(source).toContain('input.viewAsUserId !== ctx.user.id');
    expect(source).toContain('userId: ctx.user.id');
    expect(source).toContain('projectLedger37OrdinaryReturnDto(result');
  });
  it('tag summary hides only internal rule version for ordinary reads, leaving 52 referenced values unchanged', () => {
    const source = procedure('getTagSummary');
    expect(source).toContain('input.ledgerId === 37 && !input.reference52');
    expect(source).toContain('canManage: (await getLedger37Access(ctx)).canManage');
    expect(source).toContain('return projectLedger37OrdinaryReturnDto({');
    const fixture = { currentHoldingValue: { value: 600, categoryId: 10 },
      countedHoldingValue: { value: 930, currency: 'CNY', updatedDate: '2026-11-26', ruleVersion: 8 },
      marginByCoin: { CNY: 100 }, latestBalance: { balance: '600.00' } };
    expect(projectLedger37OrdinaryReturnDto(fixture, MEMBER)).toEqual({ ...fixture,
      countedHoldingValue: { value: 930, currency: 'CNY', updatedDate: '2026-11-26' } });
  });
  it('real actor permissions and target membership are checked by existing server access, not client parameters', () => {
    const access = readFileSync(new URL('./ledger37-calendar-recorder.ts', import.meta.url), 'utf8');
    const permissions = readFileSync(new URL('../shared/ledger37-permissions.ts', import.meta.url), 'utf8');
    const context = readFileSync(new URL('./_core/context.ts', import.meta.url), 'utf8');
    expect(access).toContain('!ctx.isViewingAs && (!ctx.realUser || ctx.realUser.id === ctx.user.id)');
    expect(access).toContain('ownerId: row.ownerId');
    expect(access).toContain('isViewingAs: !realActor(ctx)');
    expect(permissions).toContain('input.userId === ownerId');
    expect(permissions).toContain('!input.isViewingAs');
    expect(context).toContain("opts.req.headers['x-view-as-user-id']");
    expect(context).toContain('user = targetUser as User');
    expect(context).toContain('isViewingAs = true');
  });
  it('stock ordinary endpoints reuse the authenticated access role and cover summary, participant, public and daily snapshots', () => {
    for (const name of ['getStockTagPortfolio', 'getStockTagPublicPortfolio', 'getMyStockTagParticipantPortfolio', 'getStockTagDailySnapshots']) {
      const start = portfolio.indexOf(`export async function ${name}(`);
      const source = portfolio.slice(start).split(/\n(?:export )?async function \w+\(/)[0];
      expect(source).toContain('assertStockPresentationReadAccess(input)');
      expect(source).toContain('projectLedger37StockReturnDto(');
      expect(source).toContain('canManage: access.canEdit');
      expect(source).toContain('isViewingAs: input.isViewingAs');
    }
    const overview = portfolio.slice(portfolio.indexOf('export async function getMyStockTagOverview('), portfolio.indexOf('export async function getStockTagDailySnapshots('));
    expect(overview).toContain('projectLedger37StockReturnDto(visible');
    expect(overview).toContain('canManage: context.canManage');
  });
  it('keeps owner-only secret settings checks unchanged', () => {
    for (const name of ['getForcedLiquidationSettings', 'getForcedLiquidationSettingDetail', 'getForcedLiquidationUserImpact', 'getStockLotDownsideRule']) {
      expect(procedure(name)).toContain('await assertLedger37Owner(ctx, input.ledgerId)');
      expect(procedure(name)).not.toContain('projectLedger37OrdinaryReturnDto');
    }
  });
});
