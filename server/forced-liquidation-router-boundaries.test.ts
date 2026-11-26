import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Deliberately inspect source only. Never import appRouter, index, scanners, or the full backend bundle.
const router = readFileSync(new URL('./routers.ts', import.meta.url), 'utf8');
const store = readFileSync(new URL('./ordinary-tag-downside-rules.ts', import.meta.url), 'utf8');
const payment = readFileSync(new URL('./ordinary-tag-downside-payment-readback.ts', import.meta.url), 'utf8');
const block = (start: string, end: string) => {
  const from = router.indexOf(start); expect(from).toBeGreaterThanOrEqual(0);
  const until = router.indexOf(end, from + start.length); expect(until).toBeGreaterThan(from);
  return router.slice(from, until);
};

describe('forced liquidation routes preserve owner, raw-value and manual-payment boundaries', () => {
  it.each([
    ['getForcedLiquidationSettings: protectedProcedure', 'getForcedLiquidationSettingDetail: protectedProcedure'],
    ['getForcedLiquidationSettingDetail: protectedProcedure', 'setOrdinaryTagDownsideRule: protectedProcedure'],
    ['setOrdinaryTagDownsideRule: protectedProcedure', 'getMyOrdinaryTagDownsideValuations: protectedProcedure'],
  ])('owner-only route %s checks actual owner before loading services', (start, end) => {
    const body = block(start, end);
    expect(body).toContain('ledgerId: z.literal(37)');
    expect(body).toContain('.strict()');
    expect(body.indexOf('await assertLedger37Owner')).toBeLessThan(body.indexOf('await import('));
    expect(body).toContain('userId: ctx.user.id');
    expect(body).toContain('isViewingAs: Boolean(ctx.isViewingAs)');
    expect(body).not.toMatch(/createLedger37Dividend|recoverLedger37Dividend|releaseLedger37WalletHold|createStockTagEvent/);
  });
  it('member read endpoint only accepts ledger37 and derives the effective identity from ctx', () => {
    const body = block('getMyOrdinaryTagDownsideValuations: protectedProcedure', 'getStockLotDownsideRule: protectedProcedure');
    expect(body).toContain('z.object({ ledgerId: z.literal(37) }).strict()');
    expect(body).toContain('userId: ctx.user.id');
    expect(body).not.toMatch(/input\.(?:userId|targetUserId|viewAsUserId)/);
  });
  it('ordinary saves write only an appended dedicated rule row and no original money record', () => {
    expect(store).toContain('INSERT INTO ledger_ordinary_tag_downside_rules');
    expect(store).not.toMatch(/(?:UPDATE|INSERT INTO|DELETE FROM)\s+(?:ledger_records|ledger_members|ledger_tag_config|users|dividend_records|ai_wallet)/i);
    expect(store).not.toMatch(/createLedger37Dividend|recoverLedger37Dividend|releaseLedger37WalletHold|setInterval|setTimeout/);
    expect(store.indexOf('checkInput(input)')).toBeLessThan(store.indexOf("await import('./db')"));
  });
  it('tag summary returns a separately named counted value and does not change raw holding value or reference52', () => {
    const body = block('getTagSummary: protectedProcedure', 'getTagMarginValuation: protectedProcedure');
    expect(body).toContain('if (!input.reference52 && input.ledgerId === LEDGER_37_ID');
    expect(body).toContain('countedHoldingValue');
    expect(body).toContain('balance: latestBalance.amount');
    expect(body).toContain('value: currentHoldingValue');
    expect(body).not.toMatch(/currentHoldingValue\s*=\s*countedOrdinaryTagBalance/);
  });
  it('availability uses one batch of rules and pure member builders, not per-member history API fan-out', () => {
    const body = block('async function getLedger37DividendAvailabilitySnapshot', '/** 批量分红/补差');
    expect(body.match(/readAllOrdinaryTagDownsideRules\(/g)).toHaveLength(1);
    expect(body).toContain('ordinaryRecordsByCategory');
    expect(body).toContain('buildOrdinaryTagDownsideValuation');
    expect(body).not.toContain('getMyOrdinaryTagDownsideValuations(');
    expect(body).toContain("valuation.status === 'ready' && valuation.totalPnl !== null");
  });
  it('manual paused settlement rechecks inside the transaction before releasing or crediting any funds', () => {
    const body = block('settleLedger37PausedTag: protectedProcedure', 'getTagConfig: protectedProcedure');
    const begin = body.indexOf('await transaction.beginTransaction()');
    const read = body.indexOf('await readOrdinaryTagDownsidePaymentReturn');
    const release = body.indexOf('await releaseLedger37WalletHold');
    expect(begin).toBeLessThan(read);
    expect(read).toBeLessThan(release);
    expect(body).toContain('actorUserId: ctx.user.id, expectedCategoryId: Number(category.id)');
    expect(body).toContain("ordinaryReadback.status !== 'ready'");
  });
  it('manual batch rechecks the current scoped rule and retains the requested-amount upper bound', () => {
    const body = block('adminExecuteLedger37DividendBatch: protectedProcedure', 'adminGetLedger37DividendAvailability: protectedProcedure');
    expect(body.indexOf('await transaction.beginTransaction()')).toBeLessThan(body.indexOf('await readOrdinaryTagDownsidePaymentReturn'));
    expect(body).toContain('actorUserId: ctx.user.id, expectedCategoryId: candidate.categoryId');
    expect(body).toContain('roundCny(lockedCumulativeReturn - currentPaid)');
    expect(body).toContain('Math.min(candidate.expectedAmount, Math.max(0, currentExpected))');
  });
  it('payment readback owns no transaction lifetime and performs no DDL or money write', () => {
    expect(payment).not.toMatch(/\.beginTransaction\(|\.commit\(|\.rollback\(|\.release\(|\.end\(/);
    expect(payment).not.toMatch(/CREATE TABLE|ALTER TABLE|INSERT INTO|DELETE FROM|UPDATE\s+(?:ledger|users|ai_wallet|dividend)/i);
    expect(payment).not.toMatch(/createLedger37Dividend|recoverLedger37Dividend|releaseLedger37WalletHold/);
  });
});
