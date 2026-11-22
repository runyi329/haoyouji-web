import { parseStringPromise, processors } from 'xml2js';
import { createHash } from 'node:crypto';
import type { Ledger37HoldingPosition, Ledger37HoldingSource } from '../shared/ledger37-ai-holdings';
import nvidiaSeed from './holding-source-nvidia-seed.json';
import berkshireSeed from './holding-source-berkshire-seed.json';
import { getVerifiedHoldingDisplaySymbol } from './holding-security-catalog';
import { getManualExternalHoldingSources } from './holding-source-manual';

export type ExternalHoldingSourceId = 'berkshire' | 'pelosi' | 'ark' | 'nvidia';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const IDS: ExternalHoldingSourceId[] = ['berkshire', 'pelosi', 'ark', 'nvidia'];
const CATALOG: Record<ExternalHoldingSourceId, Omit<Ledger37HoldingSource, 'status' | 'asOf' | 'publishedAt' | 'checkedAt' | 'holdings'>> = {
  berkshire: { id: 'berkshire', displayName: '巴菲特持股', entityName: 'BERKSHIRE HATHAWAY INC (CIK 1067983)', kind: '13f', sourceUrl: 'https://www.sec.gov/edgar/browse/?CIK=1067983', description: '伯克希尔哈撒韦的SEC 13F公开持仓披露，不是巴菲特个人全部资产，也不是实时仓位。', coverageNote: '仅最近 submissions 中未修订 13F-HR 的普通 SH 非期权条目；13F 不涵盖全部资产、现金或空头。保留 CUSIP 原识别，仅同一 CUSIP 及明确股类的官方参考已核验时附加股票代码，其余显示 CUSIP。权重分母为同一披露期全部纳入普通 SH 非期权条目的申报市值之和，不是公司总资产。' },
  pelosi: { id: 'pelosi', displayName: '佩洛西持股', entityName: 'Nancy Pelosi 公开财务披露', kind: 'disclosure', sourceUrl: 'https://disclosures-clerk.house.gov/FinancialDisclosure', description: '美国众议院官方财务披露入口。', coverageNote: '公开申报不是完整、实时持仓；交易金额区间、期权和家庭申报不能重建精确股数。商业再利用未授权，当前不可用，只提供官方入口，不推算或购买许可。' },
  ark: { id: 'ark', displayName: '木头姐持股', entityName: 'ARK Innovation ETF (ARKK)', kind: 'etf', sourceUrl: 'https://www.ark-funds.com/funds/arkk', description: '仅 ARKK 基金官方持仓，不代表 Cathie Wood 个人或全部 ARK 基金。', coverageNote: '待授权数据；ARKK 基金，不是个人全部持仓。官方条款限制自动提取及再发布，未取得书面许可前禁用 CSV 自动刷新，仅链接官方页面。' },
  nvidia: { id: 'nvidia', displayName: '英伟达持股', entityName: 'NVIDIA CORP (CIK 1045810)', kind: '13f', sourceUrl: 'https://www.sec.gov/edgar/browse/?CIK=1045810', description: '英伟达公司公开 13F 投资披露，不是 NVDA 股东名单或黄仁勋个人持仓。', coverageNote: '仅已取得的 SEC 正常未修订季度 13F 普通 SH 非期权条目；非公司全部资产、现金、空头或个人仓位。保留 CUSIP，仅同一标识及明确股类的官方参考已核验时附加股票代码。权重分母为同一披露期全部纳入普通 SH 非期权条目的申报市值之和，不是公司总资产。' },
};
type CacheEntry = { lastGood: Ledger37HoldingSource | null; checkedAt: string | null; failure: string | null };
// Application-owned memory only. Restart rebuilds from public disclosures; no database writes/DDL.
const cache = new Map<ExternalHoldingSourceId, CacheEntry>();
/** Independent normalized official-text snapshot; never reconstruct or feed text into XML parser. */
export function normalizeBerkshireOfficialTextSeed(input: unknown): Ledger37HoldingPosition[] {
  const seed = object(input), provenance = object(seed.provenance);
  if (seed.asOf !== '2026-09-30' || seed.publishedAt !== '2026-11-16' || seed.checkedAt !== '2026-11-19T05:26:59.000Z' ||
      seed.sourceUrl !== 'https://www.sec.gov/Archives/edgar/data/1067983/000119312526463399/60471.xml' ||
      provenance.format !== 'official-full-extracted-text-normalized' || provenance.rawXML !== false ||
      provenance.cik !== '0001067983' || provenance.schemaVersion !== 'X0202' || provenance.submissionType !== '13F-HR' ||
      provenance.liveTestFlag !== 'LIVE' || provenance.isAmendment !== false || provenance.isConfidentialOmitted !== false ||
      provenance.reportType !== '13F HOLDINGS REPORT' || provenance.valueUnit !== 'USD' ||
      provenance.tableEntryTotal !== 89 || provenance.tableValueTotal !== '304196581325' ||
      provenance.includedValueTotalUSD !== '304196581325' || provenance.totalShares !== '2456049989' ||
      !Array.isArray(seed.originalLines) || seed.originalLines.length !== 89) throw new Error('13F 官方文本快照身份或摘要异常');
  const groups = new Map<string, { cusip: string; titleOfClass: string; stockName: string; shares: bigint; value: number }>();
  let total = 0, sharesTotal = BigInt('0');
  const rawLines: string[] = [];
  for (const inputRow of seed.originalLines) {
    const row = object(inputRow);
    const match = typeof row.rawLine === 'string' ? /^([A-Z][A-Z0-9 .&'-]*?) (CAP STK CL C|CAP STK CL A|COM SHS SER C|COM SER A|COMMON STOCK|MTN BE CL A|COM NEW|COM SHS|CL A|CL B|COM) ([A-Z0-9]{9}) (\d+) (\d+) SH DFND (\d+(?:,\d+)*) (\d+) 0 0$/.exec(row.rawLine) : null;
    if (!match || match[1] !== row.stockName || match[2] !== row.titleOfClass || match[3] !== row.cusip ||
        match[4] !== row.valueUSD || match[5] !== row.shares || match[6] !== row.otherManagers || match[7] !== row.votingSole ||
        row.unit !== 'SH' || row.investmentDiscretion !== 'DFND' || row.votingShared !== '0' || row.votingNone !== '0' ||
        row.shares !== row.votingSole || row.otherManagers.split(',').some((n: string) => Number(n) < 1 || Number(n) > 14)) throw new Error('13F 官方文本快照未严格消费原行');
    const value = Number(row.valueUSD), shares = BigInt(row.shares);
    if (!Number.isSafeInteger(value) || value <= 0 || shares <= BigInt('0') || row.weightPct !== value / 304196581325 * 100) throw new Error('13F 官方文本快照股数或权重异常');
    total += value; sharesTotal += shares; rawLines.push(row.rawLine);
    const key = `${row.cusip}|${row.titleOfClass}`, existing = groups.get(key);
    if (existing) {
      if (existing.stockName !== row.stockName) throw new Error('13F 官方文本同股类发行人不一致');
      existing.shares += shares; existing.value += value;
    } else groups.set(key, { cusip: row.cusip, titleOfClass: row.titleOfClass, stockName: row.stockName, shares, value });
  }
  const fullText = rawLines.join(' ');
  if (total !== Number(provenance.tableValueTotal) || sharesTotal.toString() !== provenance.totalShares ||
      fullText.length !== provenance.originalTextLength || createHash('sha256').update(fullText).digest('hex') !== provenance.originalTextSha256) throw new Error('13F 官方文本快照总数、市值或全文校验失败');
  return Array.from(groups.values()).map(row => {
    const displaySymbol = getVerifiedHoldingDisplaySymbol(row.cusip, row.titleOfClass);
    return { symbol: `CUSIP:${row.cusip}`, ...(displaySymbol ? { displaySymbol } : {}), stockName: row.stockName, currency: 'USD', shares: row.shares.toString(), weightPct: row.value / total * 100 };
  });
}
// Commit only a completely validated snapshot. A bad Berkshire seed never disables other sources.
try {
  const holdings = normalizeBerkshireOfficialTextSeed(berkshireSeed);
  cache.set('berkshire', { lastGood: {
    ...CATALOG.berkshire, status: 'available', asOf: berkshireSeed.asOf, publishedAt: berkshireSeed.publishedAt,
    checkedAt: berkshireSeed.checkedAt, sourceUrl: berkshireSeed.sourceUrl, holdings,
    coverageNote: CATALOG.berkshire.coverageNote + ' 本地快照来自 SEC 13F官方原文的完整文本提取严格核验与归一化，不是重建 XML；原89管理人条目保留于内部seed，客户按精确CUSIP及股类汇总股数和申报市值权重。',
  }, checkedAt: berkshireSeed.checkedAt, failure: null });
} catch {
  cache.set('berkshire', { lastGood: null, checkedAt: null, failure: '13F 官方文本快照核验失败，未加载' });
}
// Verified official XML parsed offline once; only public whitelist facts survive in this seed.
// Never stamp seed's check/publication times with process startup time.
cache.set('nvidia', { lastGood: {
  ...CATALOG.nvidia, status: 'available', asOf: nvidiaSeed.asOf,
  publishedAt: nvidiaSeed.publishedAt, checkedAt: nvidiaSeed.checkedAt, sourceUrl: nvidiaSeed.sourceUrl,
  holdings: nvidiaSeed.holdings.map(row => ({ symbol: row.symbol, ...(row.displaySymbol ? { displaySymbol: row.displaySymbol } : {}), stockName: row.stockName, currency: 'USD', shares: row.shares, weightPct: row.weightPct })),
}, checkedAt: nvidiaSeed.checkedAt, failure: null });
let refreshInFlight: Promise<void> | null = null;
let stopRefresh: (() => void) | null = null;

/** Returns a defensive snapshot immediately; requests never wait on external network. */
export function getExternalHoldingSources(): Ledger37HoldingSource[] {
  const original: Ledger37HoldingSource[] = IDS.map(id => {
    const entry = cache.get(id);
    if (entry?.lastGood) return {
      ...entry.lastGood, checkedAt: entry.checkedAt,
      coverageNote: entry.lastGood.coverageNote + (entry.failure ? ` 最近检查失败：${entry.failure}；保留上次成功披露，非实时持仓。` : ''),
      holdings: entry.lastGood.holdings.map(row => ({ ...row })),
    };
    return { ...CATALOG[id], status: 'unavailable', asOf: null, publishedAt: null, checkedAt: entry?.checkedAt ?? null, holdings: [], coverageNote: CATALOG[id].coverageNote + (entry?.failure ? ` ${entry.failure}` : ' 尚未取得可验证快照。') };
  });
  const manual = getManualExternalHoldingSources();
  const replacements = new Map(manual.map(source => [source.id, source]));
  return [...original.map(source => replacements.get(source.id) || source), ...manual.filter(source => !original.some(existing => existing.id === source.id))];
}

/** Internal-only URL construction: callers can select catalog ID, never provide a URL. */
async function publicGet(urlText: string, signal: AbortSignal): Promise<string> {
  const url = new URL(urlText);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.search) throw new Error('公开来源地址不在白名单');
  if (!((url.hostname === 'data.sec.gov' && /^\/submissions\/CIK\d{10}\.json$/.test(url.pathname)) || (url.hostname === 'www.sec.gov' && /^\/Archives\/edgar\/data\/\d+\/\d{18}\/[A-Za-z0-9_.-]+$/.test(url.pathname)))) throw new Error('公开来源地址不在白名单');
  const userAgent = process.env.HOLDING_SOURCES_SEC_USER_AGENT;
  if (!userAgent || !/^[\x20-\x7e]{8,200}$/.test(userAgent) || !userAgent.includes('@')) throw new Error('SEC 公开访问需配置真实联系 User-Agent');
  const response = await fetch(url, { method: 'GET', redirect: 'error', signal, headers: { 'User-Agent': userAgent, Accept: 'application/json, application/xml, text/xml' } });
  if (!response.ok) throw new Error(response.status === 403 ? '官方来源拒绝公开访问（403），未绕过限制' : `官方来源 HTTP ${response.status}`);
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('公开来源文件过大');
  if (!response.body) throw new Error('公开来源正文缺失');
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('公开来源文件过大'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('公开披露结构无效');
  return value as Record<string, any>;
}
function date(value: unknown, today: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value).toISOString().slice(0, 10) !== value || value > today) throw new Error('公开披露日期无效或在未来');
  return value;
}
function xmlDate(value: unknown, today: string): string {
  if (typeof value !== 'string') throw new Error('13F 报告截止日缺失');
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  return date(match ? `${match[3]}-${match[1]}-${match[2]}` : value, today);
}
async function xml(text: string): Promise<Record<string, any>> {
  if (Buffer.byteLength(text) > MAX_BYTES || /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text)) throw new Error('不安全或过大的 XML');
  return object(await parseStringPromise(text, { strict: true, explicitArray: true, trim: true, tagNameProcessors: [processors.stripPrefix] }));
}
function one(parent: Record<string, any>, key: string): any {
  const values = parent[key];
  if (!Array.isArray(values) || values.length !== 1) throw new Error(`13F 必要字段无效：${key}`);
  return values[0];
}
function optional(parent: Record<string, any>, key: string): string | null {
  if (parent[key] === undefined) return null;
  const value = one(parent, key);
  if (typeof value !== 'string') throw new Error('13F 字段必须为文本');
  return value;
}

/** Pure parser: shares remain exact decimal strings; options/PRN never enter stocks' weights. */
export async function parse13FInformationTable(text: string, publishedAt: string, asOf: string): Promise<Ledger37HoldingPosition[]> {
  const root = await xml(text);
  const table = object(root.informationTable);
  const rows = table.infoTable;
  if (!Array.isArray(rows) || !rows.length || rows.length > 10000) throw new Error('13F 信息表无正常持仓记录');
  const accepted: Array<{ symbol: string; displaySymbol?: string; stockName: string; shares: string; value: number }> = [];
  const dollarUnit = publishedAt >= '2023-01-03' ? 1 : 1000;
  // SEC changed value units in the 2023-01-03 filing schema. Anchor to filing, not period.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf) || asOf > publishedAt) throw new Error('13F 日期顺序异常');
  for (const raw of rows) {
    const row = object(raw);
    const cusip = one(row, 'cusip'), stockName = one(row, 'nameOfIssuer');
    const titleOfClass = one(row, 'titleOfClass');
    if (typeof titleOfClass !== 'string' || !titleOfClass || titleOfClass.length > 300) throw new Error('13F 股类字段异常');
    const valueText = one(row, 'value');
    const quantity = object(one(row, 'shrsOrPrnAmt'));
    const shares = one(quantity, 'sshPrnamt'), unit = one(quantity, 'sshPrnamtType');
    const putCall = optional(row, 'putCall');
    if (typeof cusip !== 'string' || !/^[A-Z0-9*@#]{9}$/.test(cusip) || typeof stockName !== 'string' || !stockName || stockName.length > 300 || typeof shares !== 'string' || !/^\d+$/.test(shares) || typeof valueText !== 'string' || !/^\d+$/.test(valueText) || !['SH', 'PRN'].includes(unit) || (putCall !== null && !['Put', 'Call', 'PUT', 'CALL'].includes(putCall))) throw new Error('13F 持仓字段异常');
    const value = Number(valueText) * dollarUnit;
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('13F 披露市值异常');
    if (unit !== 'SH' || putCall !== null) continue;
    const displaySymbol = getVerifiedHoldingDisplaySymbol(cusip, titleOfClass);
    accepted.push({ symbol: `CUSIP:${cusip}`, ...(displaySymbol ? { displaySymbol } : {}), stockName, shares, value });
  }
  if (!accepted.length) throw new Error('13F 没有可纳入的普通 SH 非期权记录');
  const total = accepted.reduce((sum, row) => sum + row.value, 0);
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error('13F 披露总市值异常');
  // Preserve separate lines (classes/managers can repeat CUSIP); do not silently coalesce.
  return accepted.map(row => ({ symbol: row.symbol, ...(row.displaySymbol ? { displaySymbol: row.displaySymbol } : {}), stockName: row.stockName, currency: 'USD', shares: row.shares, weightPct: row.value / total * 100 }));
}

async function fetchSecSnapshot(id: 'berkshire' | 'nvidia', signal: AbortSignal, today: string): Promise<Ledger37HoldingSource> {
  const cik = id === 'berkshire' ? '1067983' : '1045810';
  const submission = object(JSON.parse(await publicGet(`https://data.sec.gov/submissions/CIK${cik.padStart(10, '0')}.json`, signal)));
  if (Number(submission.cik) !== Number(cik)) throw new Error('SEC 实体身份不匹配');
  const recent = object(object(submission.filings).recent);
  const columns = ['form', 'reportDate', 'filingDate', 'accessionNumber', 'primaryDocument'];
  if (columns.some(key => !Array.isArray(recent[key])) || columns.some(key => recent[key].length !== recent.form.length) || recent.form.length > 10000) throw new Error('SEC submissions 列结构异常');
  const candidates = recent.form.flatMap((form: string, i: number) => {
    if (form !== '13F-HR' && form !== '13F-HR/A') return [];
    const asOf = date(recent.reportDate[i], today), publishedAt = date(recent.filingDate[i], today);
    if (asOf > publishedAt) throw new Error('13F 披露日早于截止日');
    return [{ form, asOf, publishedAt, accession: recent.accessionNumber[i], primary: recent.primaryDocument[i] }];
  }).sort((a: any, b: any) => b.asOf.localeCompare(a.asOf) || b.publishedAt.localeCompare(a.publishedAt) || String(b.accession).localeCompare(String(a.accession)));
  const filing = candidates[0];
  if (!filing) throw new Error('SEC 最近公开 metadata 未提供 13F-HR');
  if (candidates.some((item: any) => item.asOf === filing.asOf && item.form === '13F-HR/A')) throw new Error('最新期间含 13F/A 修订，暂不支持合并；不以修订表覆盖原表');
  // Real SEC submissions often names the stylesheet view, e.g. xslForm13F_X02/primary_doc.xml.
  // Accept only that exact known presentation prefix; fetch original raw XML in the filing directory.
  if (typeof filing.primary !== 'string' || !/^(?:xslForm13F_X0[12]\/)?[A-Za-z0-9_.-]+\.xml$/i.test(filing.primary)) throw new Error('SEC 文件目录异常');
  const primaryName = filing.primary.replace(/^xslForm13F_X0[12]\//i, '');
  if (typeof filing.accession !== 'string' || !/^\d{10}-\d{2}-\d{6}$/.test(filing.accession) || primaryName.indexOf('..') !== -1) throw new Error('SEC 文件目录异常');
  const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${filing.accession.replace(/-/g, '')}/`;
  const primary = object((await xml(await publicGet(base + primaryName, signal))).edgarSubmission);
  const header = object(one(primary, 'headerData'));
  if (one(header, 'submissionType') !== '13F-HR') throw new Error('SEC 主文档类型不是正常 13F-HR');
  const filerInfo = object(one(header, 'filerInfo'));
  if (one(filerInfo, 'liveTestFlag') !== 'LIVE' || Number(one(object(one(object(one(filerInfo, 'filer')), 'credentials')), 'cik')) !== Number(cik)) throw new Error('SEC 主文档不是正确实体的正式记录');
  const version = one(primary, 'schemaVersion');
  if (typeof version !== 'string' || !/^X0[12]\d{2}$/.test(version) || (filing.publishedAt >= '2023-01-03') !== version.startsWith('X02')) throw new Error('SEC 13F schema 市值单位无法确认');
  const formData = object(one(primary, 'formData'));
  const cover = object(one(formData, 'coverPage'));
  if (optional(cover, 'isAmendment') !== 'false' && optional(cover, 'isAmendment') !== '0') throw new Error('SEC 主文档修订状态不正常');
  if (xmlDate(one(cover, 'reportCalendarOrQuarter'), today) !== filing.asOf) throw new Error('SEC 主文档截止日与 metadata 不一致');
  if (one(cover, 'reportType') !== '13F HOLDINGS REPORT') throw new Error('SEC 联合或部分持仓申报暂不支持');
  const summary = object(one(formData, 'summaryPage'));
  if (!['false', '0'].includes(one(summary, 'isConfidentialOmitted'))) throw new Error('SEC 含保密遗漏持仓，暂不支持');
  const entryTotal = one(summary, 'tableEntryTotal'), valueTotal = one(summary, 'tableValueTotal');
  if (typeof entryTotal !== 'string' || !/^\d+$/.test(entryTotal) || typeof valueTotal !== 'string' || !/^\d+$/.test(valueTotal)) throw new Error('SEC 总数摘要异常');
  const index = object(JSON.parse(await publicGet(base + 'index.json', signal)));
  const items = object(index.directory).item;
  if (!Array.isArray(items) || items.length > 100) throw new Error('SEC 文档目录异常');
  const names = items.map(item => object(item).name).filter(name => typeof name === 'string' && name !== primaryName && /^[A-Za-z0-9_.-]+\.xml$/i.test(name));
  if (!names.length || names.length > 3) throw new Error('SEC 信息表文件不能唯一安全定位');
  let holdings: Ledger37HoldingPosition[] | null = null;
  for (const name of names) {
    const text = await publicGet(base + name, signal);
    if (!/<(?:[A-Za-z_][\w.-]*:)?informationTable(?:\s|>)/.test(text)) continue;
    if (holdings) throw new Error('SEC 信息表多文件需要明确合并，暂不支持');
    const rawRows = object((await xml(text)).informationTable).infoTable;
    if (!Array.isArray(rawRows) || rawRows.length !== Number(entryTotal)) throw new Error('SEC 信息表条目数与主文档不一致');
    const rawValue = rawRows.reduce((sum: number, row: unknown) => sum + Number(one(object(row), 'value')), 0);
    if (!Number.isSafeInteger(rawValue) || rawValue !== Number(valueTotal)) throw new Error('SEC 信息表市值与主文档不一致');
    holdings = await parse13FInformationTable(text, filing.publishedAt, filing.asOf);
  }
  if (!holdings) throw new Error('SEC 信息表缺失');
  return { ...CATALOG[id], status: 'available', asOf: filing.asOf, publishedAt: filing.publishedAt, checkedAt: null, sourceUrl: base + filing.primary, holdings };
}
async function fetchSnapshot(id: ExternalHoldingSourceId, signal: AbortSignal, today: string): Promise<Ledger37HoldingSource> {
  if (id === 'berkshire' || id === 'nvidia') return fetchSecSnapshot(id, signal, today);
  throw new Error(id === 'pelosi' ? '暂无完整、合法公开持仓数据；商业再利用未授权，不从交易申报区间推算。' : '公开 CSV 自动提取及再发布待书面授权，自动刷新已禁用。');
}
async function refreshOne(id: ExternalHoldingSourceId): Promise<void> {
  const entry = cache.get(id) ?? { lastGood: null, checkedAt: null, failure: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  timer.unref();
  try {
    const snapshot = await fetchSnapshot(id, controller.signal, new Date().toISOString().slice(0, 10));
    if (!snapshot.asOf || (entry.lastGood?.asOf && snapshot.asOf < entry.lastGood.asOf) || (entry.lastGood?.asOf === snapshot.asOf && entry.lastGood.publishedAt && snapshot.publishedAt && snapshot.publishedAt < entry.lastGood.publishedAt)) throw new Error('旧版本披露不能覆盖较新缓存');
    entry.lastGood = snapshot;
    entry.failure = null;
  } catch (error) {
    // No response body, request URL, credentials or arbitrary exception text enters DTO/logs.
    const message = error instanceof Error ? error.message : '';
    entry.failure = /^(SEC |13F |公开|官方|最新期间|旧版本|暂无完整)/.test(message) ? message : '公开来源检查失败或超时';
  } finally {
    clearTimeout(timer);
    entry.checkedAt = new Date().toISOString();
    cache.set(id, entry);
  }
}
/** Finite daily public GET work; only 2 SEC sources, maximum 2 concurrent, no retries. */
export function refreshExternalHoldingSources(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const active: ExternalHoldingSourceId[] = ['berkshire', 'nvidia'];
    let next = 0;
    await Promise.all(Array.from({ length: 2 }, async () => {
      while (next < active.length) await refreshOne(active[next++]);
    }));
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}
/** Explicitly started by application's real index only. Idempotent, delayed, unref'ed, stoppable. */
export function startHoldingSourceRefresh(): () => void {
  if (stopRefresh) return stopRefresh;
  const initial = setTimeout(() => { void refreshExternalHoldingSources(); }, 5000);
  const interval = setInterval(() => { void refreshExternalHoldingSources(); }, DAY_MS);
  initial.unref(); interval.unref();
  stopRefresh = () => { clearTimeout(initial); clearInterval(interval); stopRefresh = null; };
  return stopRefresh;
}
