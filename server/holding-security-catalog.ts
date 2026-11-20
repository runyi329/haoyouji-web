export type HoldingSecurityReference = {
  cusip: string;
  displaySymbol: string;
  shareClass: string;
  accepted13FClasses: readonly string[];
  sourceUrls: readonly string[];
  verifiedAt: string;
};

// A finite, reviewed reference, not an issuer-name/ticker guessing service.
// Every CUSIP + class is supported by the cited public primary records.
// This catalog is display-only: it never rewrites the original CUSIP identity.
const REFERENCES: readonly HoldingSecurityReference[] = [
  {
    cusip: '037833100', displaySymbol: 'AAPL', shareClass: 'Common Stock',
    accepted13FClasses: ['COM', 'COMMON STOCK'], verifiedAt: '2026-11-19',
    sourceUrls: [
      'https://www.sec.gov/Archives/edgar/data/320193/000119312519041014/d667611dsc13g.htm',
      'https://investor.apple.com/faq/default.aspx',
    ],
  },
  {
    cusip: '02079K305', displaySymbol: 'GOOGL', shareClass: 'Class A Common Stock',
    accepted13FClasses: ['CAP STK CL A'], verifiedAt: '2026-11-19',
    sourceUrls: [
      'https://www.sec.gov/Archives/edgar/data/1067983/000119312526463399/60471.xml',
      'https://www.sec.gov/Archives/edgar/data/1652044/000165204426000084/goog-20260930.htm',
    ],
  },
  {
    cusip: '02079K107', displaySymbol: 'GOOG', shareClass: 'Class C Capital Stock',
    accepted13FClasses: ['CAP STK CL C'], verifiedAt: '2026-11-19',
    sourceUrls: [
      'https://www.sec.gov/Archives/edgar/data/1067983/000119312526463399/60471.xml',
      'https://www.sec.gov/Archives/edgar/data/1652044/000165204426000084/goog-20260930.htm',
    ],
  },
  {
    cusip: '191216100', displaySymbol: 'KO', shareClass: 'Common Stock',
    accepted13FClasses: ['COM', 'COMMON STOCK'], verifiedAt: '2026-11-19',
    sourceUrls: [
      'https://www.sec.gov/Archives/edgar/data/102909/000110465921017780/tv0566-cocacolaco.htm',
      'https://investors.coca-colacompany.com/filings-reports/all-sec-filings/content/0001628280-26-067844/ko-20261002.htm',
    ],
  },
  {
    cusip: '025816109', displaySymbol: 'AXP', shareClass: 'Common Stock',
    accepted13FClasses: ['COM', 'COMMON STOCK'], verifiedAt: '2026-11-19',
    sourceUrls: [
      'https://www.sec.gov/Archives/edgar/data/102909/000110465920018770/tv02010-americanexpressco.htm',
      'https://www.americanexpress.com/en-us/newsroom/company-financial-news/american-express-third-quarter-2026-financial-results/',
    ],
  },
  {
    cusip: '458140100', displaySymbol: 'INTC', shareClass: 'Common Stock',
    accepted13FClasses: ['COM', 'COMMON STOCK'], verifiedAt: '2026-11-19',
    sourceUrls: ['https://www.intc.com/stock-info/faq'],
  },
];

/** Fail closed for unknown CUSIPs or ambiguous/mismatching class descriptions. */
export function getVerifiedHoldingDisplaySymbol(cusip: string, titleOfClass: string): string | undefined {
  const normalizedClass = titleOfClass.trim().replace(/\s+/g, ' ').toUpperCase();
  const reference = REFERENCES.find(item => item.cusip === cusip);
  if (!reference || reference.accepted13FClasses.indexOf(normalizedClass) === -1) return undefined;
  return reference.displaySymbol;
}

/** Internal provenance accessor returns copies, never expands the public position DTO. */
export function getHoldingSecurityReferences(): HoldingSecurityReference[] {
  return REFERENCES.map(item => ({ ...item, accepted13FClasses: item.accepted13FClasses.slice(), sourceUrls: item.sourceUrls.slice() }));
}
