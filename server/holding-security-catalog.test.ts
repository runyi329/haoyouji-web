import { describe, expect, it } from 'vitest';
import { getHoldingSecurityReferences, getVerifiedHoldingDisplaySymbol } from './holding-security-catalog';

describe('finite primary-evidence security display references', () => {
  it.each([
    ['037833100', 'COM', 'AAPL'], ['02079K305', 'CAP STK CL A', 'GOOGL'],
    ['02079K107', 'CAP STK CL C', 'GOOG'], ['191216100', 'COM', 'KO'],
    ['025816109', 'COMMON STOCK', 'AXP'], ['458140100', 'COM', 'INTC'],
  ])('maps exact CUSIP %s and class %s to %s', (cusip, shareClass, expected) => {
    expect(getVerifiedHoldingDisplaySymbol(cusip, shareClass)).toBe(expected);
  });
  it('does not confuse Alphabet A/C, preferred stocks, options, or an unknown CUSIP', () => {
    expect(getVerifiedHoldingDisplaySymbol('02079K305', 'CAP STK CL C')).toBeUndefined();
    expect(getVerifiedHoldingDisplaySymbol('02079K107', 'CAP STK CL A')).toBeUndefined();
    expect(getVerifiedHoldingDisplaySymbol('02079K305', 'PREFERRED')).toBeUndefined();
    expect(getVerifiedHoldingDisplaySymbol('037833100', 'CALL')).toBeUndefined();
    expect(getVerifiedHoldingDisplaySymbol('037833101', 'COM')).toBeUndefined();
    expect(getVerifiedHoldingDisplaySymbol('84615Q103', 'CLASS A COM STK')).toBeUndefined();
  });
  it('only normalizes whitespace and case of reviewed class names, never issuer text', () => {
    expect(getVerifiedHoldingDisplaySymbol('02079K305', '  cap  stk cl a ')).toBe('GOOGL');
    expect(getVerifiedHoldingDisplaySymbol('APPLE INC', 'COM')).toBeUndefined();
    expect(getVerifiedHoldingDisplaySymbol('037833100', 'APPLE INC COM')).toBeUndefined();
    expect(getVerifiedHoldingDisplaySymbol('CUSIP:037833100', 'COM')).toBeUndefined();
  });
  it('retains official original links, exact share class and verification date for every reference', () => {
    const references = getHoldingSecurityReferences();
    expect(new Set(references.map(item => item.cusip)).size).toBe(references.length);
    for (const item of references) {
      expect(item.cusip).toMatch(/^[A-Z0-9]{9}$/);
      expect(item.displaySymbol).toMatch(/^[A-Z]{1,5}$/);
      expect(item.verifiedAt).toBe('2026-11-19');
      expect(item.shareClass.length).toBeGreaterThan(0);
      expect(item.sourceUrls.length).toBeGreaterThan(0);
      for (const url of item.sourceUrls) expect(new URL(url).hostname).toMatch(/^(www\.sec\.gov|investor\.apple\.com|investors\.coca-colacompany\.com|www\.americanexpress\.com|www\.intc\.com)$/);
    }
    const first = references[0];
    (first.sourceUrls as string[])[0] = 'https://invalid.test';
    (first.accepted13FClasses as string[])[0] = 'INVALID';
    expect(getHoldingSecurityReferences()[0].sourceUrls[0]).not.toContain('invalid.test');
    expect(getVerifiedHoldingDisplaySymbol('037833100', 'COM')).toBe('AAPL');
  });
});
