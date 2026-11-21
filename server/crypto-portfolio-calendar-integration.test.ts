import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { mergeCryptoPortfolioCalendarSnapshots } from './shared/crypto-portfolio-calendar-integration';
import { pendingCryptoCalendarSnapshot } from './shared/crypto-portfolio-calendar';
import { CRYPTO_PORTFOLIO_POLICY_VERSION } from '../shared/crypto-portfolio-policy';
import { encodeStockCalendarResult, decodeStockCalendarResult } from './stock-calendar-result-cache';
import { vi } from 'vitest';
import { stockOverviewSettlementDisplay } from '../client/src/lib/stock-overview-settlement-display';
vi.mock('./db', () => ({ getDbConnection: () => { throw new Error('禁止连接真实DB'); }, getDbTransactionConnection: () => { throw new Error('禁止连接真实DB'); } }));
const now = new Date('2026-11-15T16:00:00+08:00');
const old = [{ snapshotDate: '2026-11-13', marketValue: 123, totalPnl: 23 }, { snapshotDate: '2026-11-14', marketValue: 999, totalPnl: 999 }];
const fresh = (date: string) => ({ ...pendingCryptoCalendarSnapshot(date), policyVersion: CRYPTO_PORTFOLIO_POLICY_VERSION, ready: true, priced: true, totalPnl: 40, marketValue: 140, scope: 'tag-total' as const });
const source = readFileSync(new URL('./ledger-stock-portfolio.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('core.ts', source, ts.ScriptTarget.Latest, true);
function fn(name: string) { const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name); if (!node) throw new Error(name); return node.getText(ast); }

describe('数字币新旧日历最终接线', () => {
  it('未启用数字币的股票标签完全保留原对象与数字', () => {
    const result = mergeCryptoPortfolioCalendarSnapshots(old, [fresh('2026-11-14')], null, now);
    expect(result).toEqual(old); expect(result[0]).toBe(old[0]);
  });
  it('只保留激活前证券历史，激活后只使用独立最终快照', () => {
    const row = fresh('2026-11-14');
    const result = mergeCryptoPortfolioCalendarSnapshots(old, [row], '2026-11-14', now);
    expect(result).toEqual([old[0], row]); expect(result[0]).toBe(old[0]); expect(result[1]).toBe(row);
    expect(old[1].totalPnl).toBe(999);
  });
  it('数字币缺日结证据不能回落旧股票当日或未来空占位', () => {
    const pending = { ...pendingCryptoCalendarSnapshot('2026-11-14'), scope: 'tag-total' as const };
    const result = mergeCryptoPortfolioCalendarSnapshots(old, [pending, fresh('2026-11-16')], '2026-11-14', now);
    expect(result).toHaveLength(2); expect(result[1].totalPnl).toBeNull();
  });
  it('周日快照保留，不跳过到下一个A股交易日', () => {
    expect(mergeCryptoPortfolioCalendarSnapshots(old, [fresh('2026-11-14'), fresh('2026-11-15')], '2026-11-14', now).map(x => x.snapshotDate)).toEqual(['2026-11-13', '2026-11-14', '2026-11-15']);
  });
  it('盘尾未到期的今天占位不污染固定日结累计回报', () => {
    expect(mergeCryptoPortfolioCalendarSnapshots(old, [fresh('2026-11-15')], '2026-11-14', new Date('2026-11-15T15:04:59+08:00')).map(x => x.snapshotDate)).toEqual(['2026-11-13']);
  });
  it('总盘新策略ready与pending都能通过原gzip缓存，scope始终tag-total', () => {
    const rows = [fresh('2026-11-14'), { ...pendingCryptoCalendarSnapshot('2026-11-15'), scope: 'tag-total' as const }];
    expect(decodeStockCalendarResult(encodeStockCalendarResult(rows))).toEqual(rows);
  });
  it('总盘引擎仅接股票，读取新快照复用缓存事务连接并补总盘scope', () => {
    const text = fn('calculateStockTagCalendar');
    expect(text).toContain('filter(row => !isCryptoPortfolioSymbol(row.symbol))');
    expect(text).toContain('getCryptoPortfolioActivationDate(access.categoryId, conn)');
    expect(text).toContain('readCryptoPortfolioCalendar(access.categoryId, undefined, now, conn)');
    expect(text).toContain("scope: 'tag-total' as const");
  });
  it('成员历史只把证券送旧引擎，数字币以当前userId独立读取，不借观察账户', () => {
    const text = fn('buildMemberStockPortfolio');
    expect(text).toContain('visibleParticipations.filter(item => !isCryptoPortfolioSymbol(item.symbol))');
    expect(text).toContain('participations: legacyParticipations');
    expect(text).toContain('readCryptoPortfolioCalendar(categoryId, userId, new Date(), conn)');
  });
  it('旧日结在新策略已生效时退出，旧交易时段取价永不包含数字币', () => {
    expect(fn('refreshLedgerStockTagCloseSnapshots')).toContain('if (activationDate && snapshotDate >= activationDate) continue;');
    expect(fn('refreshLedgerStockTagIntradaySnapshots')).toContain('!isCryptoPortfolioSymbol(lot.symbol)');
  });
  it('维护页旧日结接口和首页元数据都接新快照，前端尊重不同策略的日历时钟', () => {
    expect(fn('getStockTagDailySnapshots')).toContain('readCryptoPortfolioCalendar(input.categoryId, undefined, new Date(), conn)');
    const ui = readFileSync(new URL('../client/src/pages/LedgerDetailAA.tsx', import.meta.url), 'utf8');
    expect(ui).toContain('stockSettlementSummary: stockSummary');
    expect(ui).toContain('summary: (tag as any).stockSettlementSummary');
    expect(ui).toContain('stockDisplay!.dailyPnl');
    expect(ui).not.toContain('stockUsesCryptoPolicy: (stockOverview.points || []).some(isCryptoPortfolioCalendarPoint)');
    for (const settlementPolicy of ['stock-trading-day', 'mixed-crypto-natural-day']) {
      const expectedDate = settlementPolicy === 'stock-trading-day' ? '2026-11-20' : '2026-11-21';
      const result = stockOverviewSettlementDisplay({ summary: { settlementPolicy, expectedDate },
        points: [{ ...fresh('2026-11-20'), dailyPnl: 8, dailyPnlReady: true }], expectedStockDate: '2026-11-20', expectedCryptoDate: '2026-11-21' });
      expect(result.expectedDate).toBe(expectedDate);
      expect(result.usesCryptoPolicy).toBe(settlementPolicy === 'mixed-crypto-natural-day');
      expect(result.dailyPnl).toBe(settlementPolicy === 'stock-trading-day' ? 8 : null);
      expect(result.confirmedAsOf).toBe('2026-11-20');
    }
    expect(ui).toContain('millisecondsUntilStockCalendarWake(new Date(), watchingCrypto)');
    expect(ui).toContain('isCrypto ? crossedCryptoBoundary : crossedBoundary');
  });
});
