import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
import { buildCryptoPortfolioDailyPayload, revalueCryptoPortfolioDailyPayloadsAsync, cryptoPortfolioDownsideFingerprint,
  cryptoPortfolioStockAnchor, type CryptoCalendarInput } from './shared/crypto-portfolio-calendar';
import { stockUserTagOverridesFingerprint } from './shared/stock-user-tag-downside';
import { isUserTagDownsideExempt, type UserTagDownsideOverride } from '../shared/user-tag-downside-override';
import { cryptoPortfolioBeijingDate, cryptoPortfolioCutoffAt } from '../shared/crypto-portfolio-policy';
import { StockPortfolioReadCache } from './stock-portfolio-read-cache';
import { USDT_USD_PARITY_POLICY, USDT_USD_PARITY_SOURCE } from '../shared/usdt-usd-parity-policy';
const file = fs.readFileSync(new URL('./crypto-portfolio-settlement.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('offline.ts', file, ts.ScriptTarget.Latest, true);
const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'readDerivedPayloads')!;
const js = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const categoryId = 81, date = '2026-11-25';
const os = (mode: 'exempt' | 'follow_tag', version: number): UserTagDownsideOverride => ({ ledgerId: 37, categoryId,
  targetUserId: 101, actorUserId: 7, mode, version, createdAt: '2026-11-26T03:00:00.000Z' });
function fixture() {
  const a = cryptoPortfolioStockAnchor(date)!.A, symbol = 'CRYPTO:BTC-USDT';
  const d: CryptoCalendarInput = { categoryId, snapshotDate: date, activationDate: date, now: new Date(`${date}T16:00:00+08:00`),
    lots: [{ id: 1, symbol, initialQuantity: 2, unitCost: 200, openingFee: null, openedDate: date }],
    participations: [101,102].map((userId, i) => ({ id: 11+i, lotId: 1, userId, allocatedQuantity: 1, remainingQuantity: 0,
      entryPrice: 200, startDate: date, pauseDate: null, assignedAt: `${date}T08:00:00+08:00`, updatedAt: `${date}T08:00:00+08:00` })),
    sales: [{ lotId: 1, quantity: 2, eventQuantity: 2, salePrice: 100, countedSalePrice: 180, closeDate: date,
      transactionFee: null, soldAt: `${date}T12:00:00+08:00` }],
    closures: [11,12].map(participationId => ({ participationId, quantity: 1, salePrice: 100, countedSalePrice: 180,
      closeDate: date, soldAt: `${date}T12:00:00+08:00` })), observations: [], quotes: [], usdFx: null,
    usdtFx: { snapshotDate: date, pair: 'USDT/CNY', usdtCnyRate: 7, conversionPolicy: USDT_USD_PARITY_POLICY,
      source: `${USDT_USD_PARITY_SOURCE}_x_sina_usdcny`, asOf: `${a}T15:04:00+08:00`, lockedAt: `${date}T15:05:00+08:00`,
      carried: false, forexSnapshotDate: a, usdCnyRate: 7, usdCnyAsOf: `${a}T15:04:00+08:00`, usdCnySource: 'sina_usdcny',
      usdtUsdRate: 1, usdtUsdAsOf: `${date}T15:05:00+08:00`, usdtUsdSource: USDT_USD_PARITY_SOURCE, observedAt: `${date}T15:05:03+08:00` }, captureHistoryEvidence: true };
  const original = buildCryptoPortfolioDailyPayload(d), saved = JSON.stringify(original);
  let overrides = [os('exempt', 1)], error: Error | undefined;
  const calls: string[] = [];
  const conn = { execute: vi.fn(async (sql: string) => { calls.push(sql); if (!sql.startsWith('SELECT')) throw new Error('write forbidden'); return [[{ payload: saved }]]; }) };
  const deps = { LEDGER_ID: 37, POLICY: original.policyVersion, cryptoPortfolioCutoffAt, cryptoPortfolioBeijingDate,
    readStockLotDownsideRules: vi.fn(async () => []), readUserTagDownsideOverrides: vi.fn(async () => { if (error) throw error; return overrides; }),
    isUserTagDownsideExempt, missingTable: (e: any) => e.code === 'ER_NO_SUCH_TABLE', decodePayload: JSON.parse,
    readHistory: vi.fn(async (_conn: unknown, _cat: number, rules: unknown[], userTagDownsideOverrides: unknown[]) => ({
      lots: d.lots, participations: d.participations, sales: d.sales, closures: d.closures, observations: [],
      downsideRules: rules, downsideMemberEpochs: [], userTagDownsideOverrides })),
    savedStockProofs: vi.fn(async () => []), readRevaluedStockBaseline: vi.fn(async () => null),
    buildLegacyCryptoPublicationHistory: vi.fn(() => { throw new Error('immutable evidence does not require legacy'); }),
    readLegacyPublicationProofs: vi.fn(() => { throw new Error('must not need legacy'); }),
    revalueCryptoPortfolioDailyPayloadsAsync, cryptoPortfolioDownsideFingerprint, derivedCalendarCaches: new StockPortfolioReadCache() };
  const read = new Function(...Object.keys(deps), `${js}; return readDerivedPayloads`)(...Object.values(deps));
  return { conn, calls, deps, original, saved, read, revise: () => { overrides = [os('exempt',1),os('follow_tag',2)]; }, fail: () => { error = new Error('DB offline'); } };
}
describe('extracted crypto derived reads, no production modules initialized', () => {
  it('no global retro rules still derives members raw; cache reuse and next latest follow restores immutable payload', async () => {
    const f = fixture(), now = new Date('2026-11-26T03:00:00Z');
    const first = await f.read(f.conn, categoryId, date, now);
    expect(first[0].members['101'].realizedPnl).toBe(700);
    expect(first[0].members['102'].realizedPnl).toBe(140); expect(first[0].total).toEqual(f.original.total);
    await f.read(f.conn, categoryId, date, now); expect(f.deps.readHistory).toHaveBeenCalledTimes(1);
    f.revise(); const next = await f.read(f.conn, categoryId, date, now);
    expect(next[0]).toEqual(f.original); expect(next[0].members['101'].realizedPnl).toBe(140);
    expect(f.calls).toHaveLength(2); expect(JSON.stringify(f.original)).toBe(f.saved);
    expect(f.calls.every(sql => sql.startsWith('SELECT'))).toBe(true);
  });
  it('override DB error fails closed before returning an already-cached exempt result', async () => {
    const f = fixture(), now = new Date('2026-11-26T03:00:00Z');
    await f.read(f.conn, categoryId, date, now); f.fail();
    await expect(f.read(f.conn, categoryId, date, now)).rejects.toThrow('DB offline');
  });
  it('publication caller explicitly disables user override reads and preserves old counted payload', async () => {
    const f = fixture(), result = await f.read(f.conn, categoryId, date, new Date('2026-11-26T03:00:00Z'), false);
    expect(f.deps.readUserTagDownsideOverrides).not.toHaveBeenCalled(); expect(result[0]).toEqual(f.original);
    expect(stockUserTagOverridesFingerprint([os('exempt',1)])).not.toEqual(stockUserTagOverridesFingerprint([os('follow_tag',2)]));
  });
});
