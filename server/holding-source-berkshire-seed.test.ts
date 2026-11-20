import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import seed from './holding-source-berkshire-seed.json';
import { getVerifiedHoldingDisplaySymbol } from './holding-security-catalog';
import { getExternalHoldingSources, normalizeBerkshireOfficialTextSeed, parse13FInformationTable } from './holding-source-cache';

const clone = () => JSON.parse(JSON.stringify(seed));
afterEach(() => { vi.doUnmock('./holding-source-berkshire-seed.json'); vi.resetModules(); });

describe('Berkshire verified official full extracted text normalized seed', () => {
  it('retains complete 89 manager lines and exact source, period, publication and real retrieval times', () => {
    expect(seed).toMatchObject({ asOf: '2026-09-30', publishedAt: '2026-11-16', checkedAt: '2026-11-19T05:26:59.000Z', sourceUrl: 'https://www.sec.gov/Archives/edgar/data/1067983/000119312526463399/60471.xml' });
    expect(seed.provenance).toMatchObject({ origin: 'SEC 13F官方原文', format: 'official-full-extracted-text-normalized', rawXML: false, cik: '0001067983', schemaVersion: 'X0202', isAmendment: false, isConfidentialOmitted: false, tableEntryTotal: 89, tableValueTotal: '304196581325', valueUnit: 'USD' });
    expect(seed.originalLines).toHaveLength(89);
    const fullText = seed.originalLines.map(row => row.rawLine).join(' ');
    expect(fullText.length).toBe(6660);
    expect(createHash('sha256').update(fullText).digest('hex')).toBe('0ebd2e3d56405e7216382f14fe793d8933db0df2e0b95e4f174c6b611b05c5ed');
    expect(seed.originalLines.reduce((sum, row) => sum + BigInt(row.valueUSD), BigInt('0')).toString()).toBe('304196581325');
    expect(seed.originalLines.reduce((sum, row) => sum + BigInt(row.shares), BigInt('0')).toString()).toBe('2456049989');
    expect(seed.originalLines.reduce((sum, row) => sum + row.weightPct, 0)).toBeCloseTo(100, 12);
    expect(seed.originalLines.filter(row => row.cusip === '037833100')).toHaveLength(12);
    expect(new Set(seed.originalLines.filter(row => row.cusip === '037833100').map(row => row.otherManagers)).size).toBe(12);
  });
  it('customer output merges by exact CUSIP and class using string-constructed BigInt shares, not display name', () => {
    const rows = normalizeBerkshireOfficialTextSeed(seed);
    expect(rows).toHaveLength(30);
    expect(new Set(rows.map(row => row.symbol)).size).toBe(30);
    expect(rows.reduce((sum, row) => sum + BigInt(row.shares!), BigInt('0')).toString()).toBe('2456049989');
    expect(rows.reduce((sum, row) => sum + row.weightPct!, 0)).toBeCloseTo(100, 12);
    for (const row of rows) {
      const original = seed.originalLines.filter(input => row.symbol === `CUSIP:${input.cusip}`);
      const totalValue = original.reduce((sum, input) => sum + Number(input.valueUSD), 0);
      const totalShares = original.reduce((sum, input) => sum + BigInt(input.shares), BigInt('0'));
      expect(row.shares).toBe(totalShares.toString());
      expect(row.weightPct).toBe(totalValue / 304196581325 * 100);
      expect(row.displaySymbol).toBe(getVerifiedHoldingDisplaySymbol(original[0].cusip, original[0].titleOfClass));
    }
    expect(rows.find(row => row.displaySymbol === 'AAPL')).toMatchObject({ shares: '227917808' });
    expect(rows.find(row => row.displaySymbol === 'KO')).toMatchObject({ shares: '400000000' });
    expect(rows.find(row => row.displaySymbol === 'GOOG')).toMatchObject({ symbol: 'CUSIP:02079K107', shares: '27188433' });
    expect(rows.find(row => row.displaySymbol === 'GOOGL')).toMatchObject({ symbol: 'CUSIP:02079K305', shares: '78791167' });
    expect(rows.filter(row => row.displaySymbol)).toHaveLength(5);
    const publicSource = getExternalHoldingSources()[0];
    expect(publicSource.coverageNote).toContain('SEC 13F官方原文');
    expect(JSON.stringify(publicSource)).not.toMatch(/originalLines|rawLine|otherManagers|votingSole|tableEntryTotal|tableValueTotal|provenance/);
  });
  it('rejects unconsumed text, missing lines, changed value, manager, class, period, and a forged raw-XML label', () => {
    const mutations = [
      (input: any) => { input.originalLines[0].rawLine += ' trailing'; },
      (input: any) => { input.originalLines.pop(); },
      (input: any) => { input.originalLines[0].valueUSD = '472572547'; },
      (input: any) => { input.originalLines[0].otherManagers = '99'; },
      (input: any) => { input.originalLines[0].titleOfClass = 'PREFERRED'; },
      (input: any) => { input.asOf = '2026-06-30'; },
      (input: any) => { input.provenance.rawXML = true; },
      (input: any) => { input.provenance.tableValueTotal = '304196581326'; },
    ];
    for (const mutate of mutations) { const input = clone(); mutate(input); expect(() => normalizeBerkshireOfficialTextSeed(input)).toThrow(); }
    expect(normalizeBerkshireOfficialTextSeed(seed)).toHaveLength(30); // no partial mutation after failure
  });
  it('official extracted text is never accepted as raw XML by the unchanged runtime parser', async () => {
    await expect(parse13FInformationTable(seed.originalLines.map(row => row.rawLine).join(' '), seed.publishedAt, seed.asOf)).rejects.toThrow();
  });
  it('invalid Berkshire seed fails atomically at import while NVIDIA and other sources survive', async () => {
    vi.resetModules();
    const invalid = clone(); invalid.originalLines[0].shares = '0';
    vi.doMock('./holding-source-berkshire-seed.json', () => ({ default: invalid }));
    const cache = await import('./holding-source-cache');
    const sources = cache.getExternalHoldingSources();
    expect(sources[0]).toMatchObject({ status: 'unavailable', holdings: [] });
    expect(sources[0].coverageNote).toContain('核验失败');
    expect(sources[3]).toMatchObject({ status: 'available', asOf: '2026-09-30' });
    expect(sources[3].holdings).toHaveLength(8);
    expect(sources.slice(1, 3).every(row => row.status === 'unavailable' && row.holdings.length === 0)).toBe(true);
  });
});
