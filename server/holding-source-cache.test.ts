import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./db', () => ({ getDbConnection: vi.fn(() => { throw new Error('No real DB'); }) }));
const fetchMock = vi.fn();
let module: typeof import('./holding-source-cache');
const table = (rows: string) => `<?xml version="1.0"?><ns:informationTable xmlns:ns="http://www.sec.gov/edgar/document/thirteenf/informationtable">${rows}</ns:informationTable>`;
const row = (value: string, shares = '9007199254740993', unit = 'SH', option = '', cusip = '037833100') => `<ns:infoTable><ns:nameOfIssuer>APPLE INC</ns:nameOfIssuer><ns:titleOfClass>COM</ns:titleOfClass><ns:cusip>${cusip}</ns:cusip><ns:value>${value}</ns:value><ns:shrsOrPrnAmt><ns:sshPrnamt>${shares}</ns:sshPrnamt><ns:sshPrnamtType>${unit}</ns:sshPrnamtType></ns:shrsOrPrnAmt>${option ? `<ns:putCall>${option}</ns:putCall>` : ''}</ns:infoTable>`;
const metadata = (period = '2026-09-30', form = '13F-HR', filing = '2026-11-16') => ({ cik: 1067983, filings: { recent: { form: [form], reportDate: [period], filingDate: [filing], accessionNumber: ['0001067983-26-000001'], primaryDocument: ['primary_doc.xml'] } } });
const primary = (period = '2026-09-30') => `<edgarSubmission><schemaVersion>X0202</schemaVersion><headerData><submissionType>13F-HR</submissionType><filerInfo><liveTestFlag>LIVE</liveTestFlag><filer><credentials><cik>1067983</cik></credentials></filer></filerInfo></headerData><formData><coverPage><isAmendment>false</isAmendment><reportCalendarOrQuarter>${period}</reportCalendarOrQuarter><reportType>13F HOLDINGS REPORT</reportType></coverPage><summaryPage><isConfidentialOmitted>false</isConfidentialOmitted><tableEntryTotal>2</tableEntryTotal><tableValueTotal>400</tableValueTotal></summaryPage></formData></edgarSubmission>`;
const response = (text: string, status = 200) => new Response(text, { status });
function goodSource(period = '2026-09-30', filing = '2026-11-16') {
  fetchMock.mockImplementation((url: URL) => {
    if (url.hostname === 'data.sec.gov') return Promise.resolve(response(JSON.stringify(metadata(period, '13F-HR', filing))));
    if (url.pathname.endsWith('/index.json')) return Promise.resolve(response(JSON.stringify({ directory: { item: [{ name: 'primary_doc.xml' }, { name: 'infotable.xml' }] } })));
    if (url.pathname.endsWith('/primary_doc.xml')) return Promise.resolve(response(primary(period)));
    if (url.pathname.endsWith('/infotable.xml')) return Promise.resolve(response(table(row('100') + row('300', '10', 'SH', '', '594918104'))));
    throw new Error('Unexpected URL');
  });
}
beforeEach(async () => {
  vi.resetModules(); fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock); vi.stubEnv('HOLDING_SOURCES_SEC_USER_AGENT', 'HoldingApp contact@example.test');
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-19T01:00:00Z'));
  module = await import('./holding-source-cache');
});
afterEach(() => { module.startHoldingSourceRefresh()(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('application-owned public holding cache', () => {
  it('cold aggregate returns verified Berkshire and NVIDIA seeds without automatic fetch; restricted sources stay disabled', () => {
    expect(fetchMock).not.toHaveBeenCalled();
    expect(module.getExternalHoldingSources().slice(1, 3).map(x => [x.status, x.asOf, x.checkedAt, x.holdings])).toEqual(Array.from({ length: 2 }, () => ['unavailable', null, null, []]));
    expect(module.getExternalHoldingSources()[0]).toMatchObject({ status: 'available', asOf: '2026-09-30', publishedAt: '2026-11-16', checkedAt: '2026-11-19T05:26:59.000Z' });
    expect(module.getExternalHoldingSources()[0].holdings).toHaveLength(30);
    expect(module.getExternalHoldingSources()[3]).toMatchObject({ status: 'available', asOf: '2026-09-30', publishedAt: '2026-11-16', checkedAt: '2026-11-19T02:37:18.488Z' });
    expect(module.getExternalHoldingSources()[3].holdings).toHaveLength(8);
  });
  it('only public whitelist seed fields are delivered, with exact string shares and weights summing to 100', () => {
    const seed = module.getExternalHoldingSources()[3];
    expect(seed.holdings.every(row => typeof row.shares === 'string' && /^CUSIP:[A-Z0-9]{9}$/.test(row.symbol))).toBe(true);
    expect(seed.holdings.find(row => row.symbol === 'CUSIP:458140100')).toMatchObject({ displaySymbol: 'INTC', shares: '161082488' });
    expect(seed.holdings.filter(row => row.displaySymbol)).toHaveLength(1);
    expect(seed.holdings.reduce((sum, row) => sum + row.weightPct!, 0)).toBeCloseTo(100);
    expect(Object.keys(seed.holdings[0]).sort()).toEqual(['currency', 'shares', 'stockName', 'symbol', 'weightPct']);
    expect(Object.keys(seed.holdings[3]).sort()).toEqual(['currency', 'displaySymbol', 'shares', 'stockName', 'symbol', 'weightPct']);
    expect(JSON.stringify(seed)).not.toMatch(/credentials|votingSole|investmentDiscretion|rawPaths|returnPct|costBasis/);
  });
  it('NVIDIA official public refresh can update a newer complete snapshot; work is deduplicated', async () => {
    fetchMock.mockImplementation((url: URL) => {
      if (url.hostname === 'data.sec.gov') {
        const meta = metadata('2026-09-30', '13F-HR', '2026-11-17');
        if (url.pathname.includes('1045810')) meta.cik = 1045810;
        return Promise.resolve(response(JSON.stringify(meta)));
      }
      if (url.pathname.endsWith('/index.json')) return Promise.resolve(response(JSON.stringify({ directory: { item: [{ name: 'primary_doc.xml' }, { name: 'infotable.xml' }] } })));
      if (url.pathname.endsWith('/primary_doc.xml')) return Promise.resolve(response(url.pathname.includes('/1045810/') ? primary().replace('<cik>1067983</cik>', '<cik>1045810</cik>') : primary()));
      return Promise.resolve(response(table(row('100') + row('300', '10', 'SH', '', '594918104'))));
    });
    const refresh = module.refreshExternalHoldingSources();
    expect(module.refreshExternalHoldingSources()).toBe(refresh);
    await refresh;
    expect(module.getExternalHoldingSources()[3]).toMatchObject({ status: 'available', publishedAt: '2026-11-17' });
    expect(module.getExternalHoldingSources()[3].holdings).toHaveLength(2);
    expect(fetchMock.mock.calls).toHaveLength(8);
  });
  it('maximum two concurrent public requests time out finitely, while cached reads never await them', async () => {
    let active = 0, peak = 0;
    fetchMock.mockImplementation((_url: URL, options: RequestInit) => new Promise((_resolve, reject) => {
      active++; peak = Math.max(peak, active);
      options.signal!.addEventListener('abort', () => { active--; reject(new Error('aborted')); }, { once: true });
    }));
    const refresh = module.refreshExternalHoldingSources();
    expect(module.getExternalHoldingSources()[3].holdings).toHaveLength(8);
    expect(peak).toBe(2);
    await vi.advanceTimersByTimeAsync(8000); await refresh;
    expect(active).toBe(0); expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(module.getExternalHoldingSources()[0]).toMatchObject({ status: 'available', checkedAt: '2026-11-19T01:00:08.000Z' });
    expect(module.getExternalHoldingSources()[3]).toMatchObject({ status: 'available', asOf: '2026-09-30', publishedAt: '2026-11-16' });
    expect(module.getExternalHoldingSources().slice(1, 3).every(row => row.checkedAt === null)).toBe(true);
  });
  it('SEC official GET only; preserves asOf, publication and check dates independently', async () => {
    goodSource(); await module.refreshExternalHoldingSources();
    const berkshire = module.getExternalHoldingSources()[0];
    expect(berkshire).toMatchObject({ status: 'available', asOf: '2026-09-30', publishedAt: '2026-11-16', checkedAt: '2026-11-19T01:00:00.000Z' });
    expect(berkshire.holdings[0]).toMatchObject({ shares: '9007199254740993', weightPct: 25, symbol: 'CUSIP:037833100', displaySymbol: 'AAPL' });
    expect(berkshire.coverageNote).toContain('权重分母');
    expect(berkshire.holdings[1].displaySymbol).toBeUndefined(); // finite reviewed catalog, never issuer-name guesses
    expect(module.getExternalHoldingSources().slice(1, 3).every(x => x.status === 'unavailable' && !x.holdings.length && x.checkedAt === null)).toBe(true);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(['data.sec.gov', 'www.sec.gov']).toContain(url.hostname); expect(options).toMatchObject({ method: 'GET', redirect: 'error' });
    }
  });
  it('failure preserves lastGood, never refreshes disclosure date, records real attempted check', async () => {
    goodSource(); await module.refreshExternalHoldingSources();
    vi.setSystemTime(new Date('2026-11-20T01:00:00Z'));
    fetchMock.mockResolvedValue(response('blocked', 403));
    const before = fetchMock.mock.calls.length;
    await module.refreshExternalHoldingSources();
    const source = module.getExternalHoldingSources()[0];
    expect(source).toMatchObject({ status: 'available', asOf: '2026-09-30', publishedAt: '2026-11-16', checkedAt: '2026-11-20T01:00:00.000Z' });
    expect(source.coverageNote).toContain('403'); expect(source.holdings).toHaveLength(2);
    expect(fetchMock.mock.calls.length - before).toBe(2); // one each SEC source, never retry blocked requests
  });
  it('older report cannot overwrite a newer successful snapshot', async () => {
    goodSource(); await module.refreshExternalHoldingSources();
    goodSource('2026-06-30', '2026-08-14'); await module.refreshExternalHoldingSources();
    expect(module.getExternalHoldingSources()[0].asOf).toBe('2026-09-30');
    expect(module.getExternalHoldingSources()[0].coverageNote).toContain('旧版本');
  });
  it('same-period older publication cannot overwrite the verified official seed', async () => {
    goodSource('2026-09-30', '2026-11-13'); await module.refreshExternalHoldingSources();
    expect(module.getExternalHoldingSources()[0]).toMatchObject({ asOf: '2026-09-30', publishedAt: '2026-11-16' });
    expect(module.getExternalHoldingSources()[0].holdings).toHaveLength(30);
    expect(module.getExternalHoldingSources()[0].coverageNote).toContain('旧版本');
  });
  it('13F/A is fail-closed and cannot replace original table with an incomplete amendment', async () => {
    goodSource(); await module.refreshExternalHoldingSources();
    fetchMock.mockResolvedValue(response(JSON.stringify(metadata('2026-09-30', '13F-HR/A'))));
    await module.refreshExternalHoldingSources();
    const source = module.getExternalHoldingSources()[0];
    expect(source.holdings).toHaveLength(2); expect(source.coverageNote).toContain('修订');
  });
  it('rejects future report dates, unknown identity and malicious document path without fetching them', async () => {
    for (const meta of [metadata('2027-03-31'), { ...metadata(), cik: 123 }, { ...metadata(), filings: { recent: { ...metadata().filings.recent, primaryDocument: ['https://127.0.0.1/secret.xml'] } } }]) {
      fetchMock.mockResolvedValue(response(JSON.stringify(meta)));
      const before = fetchMock.mock.calls.length;
      await module.refreshExternalHoldingSources();
      expect(fetchMock.mock.calls.length - before).toBe(2); expect(module.getExternalHoldingSources()[0].status).toBe('available');
    }
  });
  it('missing actual SEC contact config makes no unauthenticated request', async () => {
    vi.stubEnv('HOLDING_SOURCES_SEC_USER_AGENT', ''); await module.refreshExternalHoldingSources();
    expect(fetchMock).not.toHaveBeenCalled(); expect(module.getExternalHoldingSources()[0].status).toBe('available');
    expect(module.getExternalHoldingSources()[0].holdings).toHaveLength(30);
    expect(module.getExternalHoldingSources()[0].coverageNote).toContain('真实联系');
  });
  it('defensive copies cannot mutate lastGood', async () => {
    goodSource(); await module.refreshExternalHoldingSources();
    module.getExternalHoldingSources()[0].holdings[0].shares = '0';
    module.getExternalHoldingSources()[0].holdings[0].displaySymbol = 'BAD';
    module.getExternalHoldingSources()[3].holdings[3].displaySymbol = 'BAD';
    expect(module.getExternalHoldingSources()[0].holdings[0].shares).toBe('9007199254740993');
    expect(module.getExternalHoldingSources()[0].holdings[0].displaySymbol).toBe('AAPL');
    expect(module.getExternalHoldingSources()[3].holdings[3].displaySymbol).toBe('INTC');
  });
  it('accepts the exact official stylesheet primaryDocument prefix but requests only raw filing XML', async () => {
    goodSource();
    const getGood = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: URL) => {
      if (url.hostname === 'data.sec.gov') {
        const meta = metadata();
        meta.filings.recent.primaryDocument = ['xslForm13F_X02/primary_doc.xml'];
        return Promise.resolve(response(JSON.stringify(meta)));
      }
      return getGood(url);
    });
    await module.refreshExternalHoldingSources();
    expect(module.getExternalHoldingSources()[0]).toMatchObject({ status: 'available', holdings: [{ symbol: 'CUSIP:037833100', displaySymbol: 'AAPL' }, { symbol: 'CUSIP:594918104' }] });
    expect(fetchMock.mock.calls.some(([url]) => url.pathname.indexOf('xslForm13F_') !== -1)).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => url.pathname.endsWith('/primary_doc.xml'))).toBe(true);
  });
  it.each(['other/primary_doc.xml', 'xslForm13F_X02/../primary_doc.xml', 'xslForm13F_X02/..xml', 'xslForm13F_X03/primary_doc.xml', '//evil.test/a.xml'])('refuses unapproved or traversing primary document path %s without following it', async path => {
    const meta = metadata(); meta.filings.recent.primaryDocument = [path];
    fetchMock.mockResolvedValue(response(JSON.stringify(meta)));
    await module.refreshExternalHoldingSources();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(module.getExternalHoldingSources()[0].status).toBe('available');
    expect(module.getExternalHoldingSources()[0].holdings).toHaveLength(30);
  });
  it('explicit startup is idempotent, delayed 5 sec, daily, and stoppable', async () => {
    goodSource(); const stop = module.startHoldingSourceRefresh();
    expect(module.startHoldingSourceRefresh()).toBe(stop); expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4999); expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(fetchMock).toHaveBeenCalled();
    const count = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000 - 5000); expect(fetchMock.mock.calls.length).toBeGreaterThan(count);
    stop(); const after = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000); expect(fetchMock.mock.calls.length).toBe(after);
  });
});
describe('strict 13F parsing', () => {
  it('keeps exact shares and only weights SH non-options even across 2023 unit change', async () => {
    for (const publishedAt of ['2022-11-14', '2023-01-03']) {
      const result = await module.parse13FInformationTable(table(row('100') + row('300', '2', 'SH', '', '594918104') + row('999', '99', 'PRN') + row('999', '99', 'SH', 'Call')), publishedAt, '2022-09-30');
      expect(result).toHaveLength(2); expect(result[0].shares).toBe('9007199254740993'); expect(result.map(x => x.weightPct)).toEqual([25, 75]);
    }
  });
  it('preserves separate manager lines and original CUSIP while attaching only class-verified symbols', async () => {
    const result = await module.parse13FInformationTable(table(
      row('100') + row('200', '2') +
      row('300', '3', 'SH', '', '02079K305').replace('<ns:titleOfClass>COM</ns:titleOfClass>', '<ns:titleOfClass>CAP STK CL A</ns:titleOfClass>') +
      row('400', '4', 'SH', '', '02079K107').replace('<ns:titleOfClass>COM</ns:titleOfClass>', '<ns:titleOfClass>CAP STK CL C</ns:titleOfClass>')
    ), '2026-11-16', '2026-09-30');
    expect(result).toHaveLength(4);
    expect(result.map(row => row.symbol)).toEqual(['CUSIP:037833100', 'CUSIP:037833100', 'CUSIP:02079K305', 'CUSIP:02079K107']);
    expect(result.map(row => row.displaySymbol)).toEqual(['AAPL', 'AAPL', 'GOOGL', 'GOOG']);
    expect(result.map(row => row.weightPct)).toEqual([10, 20, 30, 40]);
    expect(Object.keys(result[0]).sort()).toEqual(['currency', 'displaySymbol', 'shares', 'stockName', 'symbol', 'weightPct']);
  });
  it('does not assign a symbol when known CUSIP has wrong class, or issuer has unknown CUSIP', async () => {
    const result = await module.parse13FInformationTable(table(row('100', '1', 'SH', '', '02079K305') + row('100', '1', 'SH', '', '037833101')), '2026-11-16', '2026-09-30');
    expect(result.every(row => row.displaySymbol === undefined)).toBe(true);
  });
  it('requires an unambiguous share-class field in the original XML', async () => {
    for (const text of [row('100').replace('<ns:titleOfClass>COM</ns:titleOfClass>', ''), row('100').replace('<ns:titleOfClass>COM</ns:titleOfClass>', '<ns:titleOfClass>COM</ns:titleOfClass><ns:titleOfClass>PREFERRED</ns:titleOfClass>')]) {
      await expect(module.parse13FInformationTable(table(text), '2026-11-16', '2026-09-30')).rejects.toThrow();
    }
  });
  it.each(['<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]><informationTable/>', '<informationTable><broken></informationTable>', table(row('-1')), table(row('0')), table(row('100', '1e9')), table(row('100', '10', 'USD')), table(row('100', '10', 'SH', 'invalid'))])('rejects unsafe, malformed or abnormal records %s', async text => {
    await expect(module.parse13FInformationTable(text, '2026-11-13', '2026-09-30')).rejects.toThrow();
  });
});
