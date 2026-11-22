import type { Ledger37HoldingPosition, Ledger37HoldingSource, Ledger37HoldingSourceId } from '../shared/ledger37-ai-holdings';
import seeds from './holding-source-manual-seeds.json';
import { getVerifiedHoldingDisplaySymbol } from './holding-security-catalog';

type ManualId = Extract<Ledger37HoldingSourceId, 'duan' | 'soros' | 'ark' | 'pershing' | 'bridgewater'>;
const CATALOG: Record<ManualId, { displayName: string; entityName: string; cik: string | null; description: string }> = {
  duan: { displayName: '段永平持股', entityName: 'H&H International Investment', cik: '1759760', description: '段永平关联的H&H International Investment管理机构公开披露，不代表段永平个人或机构全部资产。' },
  soros: { displayName: '索罗斯持股', entityName: 'Soros Fund Management', cik: '1029160', description: '索罗斯基金管理机构公开持仓，不是乔治·索罗斯个人账户或个人全部资产。' },
  ark: { displayName: '木头姐持股', entityName: 'ARK Innovation ETF · ARKK', cik: '1579982', description: '仅ARKK基金的正式公开披露，不是凯茜·伍德个人持仓，也不是ARK全部基金组合。' },
  pershing: { displayName: '阿克曼持股', entityName: 'Pershing Square Capital Management', cik: '1336528', description: '阿克曼关联的潘兴广场管理机构公开披露，不是阿克曼个人账户。' },
  bridgewater: { displayName: '桥水持股', entityName: 'Bridgewater Associates · 达利欧创办', cik: '1350694', description: '桥水机构公开披露，达利欧为创办人，不是达利欧个人现时持仓或机构全部策略。' },
};
const SCALE = BigInt(10) ** BigInt(24);
const ZERO = BigInt(0);
function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('公开快照结构异常');
  return value as Record<string, any>;
}
function money(value: unknown): bigint {
  if (typeof value !== 'string' || !/^\d{1,24}(?:\.\d{1,24})?$/.test(value)) throw new Error('公开快照金额异常');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(24, '0'));
}
function day(value: unknown, today: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('公开快照日期异常');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value > today) throw new Error('公开快照日期异常');
  return value;
}
/** Loads only finite, reviewed SEC disclosure files. Never performs network, SQL or scheduled work. */
export function normalizeManualHoldingSeed(input: unknown): Ledger37HoldingSource {
  const seed = record(input), provenance = record(seed.provenance);
  if (typeof seed.id !== 'string' || !Object.prototype.hasOwnProperty.call(CATALOG, seed.id)) throw new Error('公开快照来源异常');
  const id = seed.id as ManualId, catalog = CATALOG[id];
  const today = new Date().toISOString().slice(0, 10);
  const asOf = day(seed.asOf, today);
  const publishedAt = seed.publishedAt === null ? null : day(seed.publishedAt, today);
  if (publishedAt && asOf > publishedAt) throw new Error('公开快照披露日异常');
  if (typeof seed.checkedAt !== 'string' || !Number.isFinite(Date.parse(seed.checkedAt)) || Date.parse(seed.checkedAt) > Date.now() + 60_000 || seed.checkedAt.slice(0, 10) < (publishedAt || asOf)) throw new Error('公开快照核验时间异常');
  const nport = id === 'ark';
  if (!(nport ? ['sec-nport-raw-xml', 'sec-nport-official-text'] : ['sec-13f-raw-xml', 'sec-13f-official-text']).includes(provenance.format)
    || provenance.isAmendment !== false || provenance.isConfidentialOmitted !== false
    || typeof provenance.rawSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(provenance.rawSha256)
    || typeof provenance.cik !== 'string' || !/^\d{1,10}$/.test(provenance.cik)
    || (catalog.cik && Number(provenance.cik) !== Number(catalog.cik))
    || (nport && provenance.seriesId !== 'S000042977')) throw new Error('公开快照证据异常');
  const url = new URL(seed.sourceUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'www.sec.gov' || url.username || url.password || url.port || url.hash || url.search
    || !new RegExp(`^/Archives/edgar/data/${Number(provenance.cik)}/\\d{18}/(?:xsl[A-Za-z0-9_]+/)?[A-Za-z0-9_.-]+$`).test(url.pathname)) throw new Error('公开快照原始地址异常');
  if (!Array.isArray(seed.originalRows) || !seed.originalRows.length || seed.originalRows.length > 10000 || seed.originalRows.length !== provenance.tableEntryTotal) throw new Error('公开快照原表行数异常');
  const groups = new Map<string, { symbol: string; displaySymbol?: string; stockName: string; titleOfClass: string; shares: bigint; value: bigint }>();
  let fullValue = ZERO, includedValue = ZERO;
  for (const inputRow of seed.originalRows) {
    const row = record(inputRow), value = money(row.valueUSD), shares = money(row.shares);
    if (typeof row.symbol !== 'string' || !/^(?:CUSIP:[A-Z0-9*@#]{9}|ISIN:[A-Z0-9]{12})$/.test(row.symbol)
      || typeof row.stockName !== 'string' || !row.stockName.trim() || row.stockName.length > 300
      || typeof row.titleOfClass !== 'string' || row.titleOfClass.length > 300
      || !['SH', 'PRN', 'OTHER'].includes(row.unit) || ![null, 'Put', 'Call'].includes(row.putCall)) throw new Error('公开快照证券行异常');
    fullValue += value;
    if (row.unit !== 'SH' || row.putCall !== null || shares === ZERO) continue;
    includedValue += value;
    const key = `${row.symbol}|${row.titleOfClass}`;
    const existing = groups.get(key);
    const displaySymbol = typeof row.displaySymbol === 'string' && /^[A-Z0-9][A-Z0-9.^/-]{0,19}$/.test(row.displaySymbol)
      ? row.displaySymbol : row.symbol.startsWith('CUSIP:') ? getVerifiedHoldingDisplaySymbol(row.symbol.slice(6), row.titleOfClass) : undefined;
    if (existing) {
      if (existing.stockName !== row.stockName || existing.displaySymbol !== displaySymbol) throw new Error('公开快照同证券身份异常');
      existing.shares += shares; existing.value += value;
    } else groups.set(key, { symbol: row.symbol, ...(displaySymbol ? { displaySymbol } : {}), stockName: row.stockName, titleOfClass: row.titleOfClass, shares, value });
  }
  const denominator = money(provenance.denominatorUSD);
  if (fullValue !== money(provenance.tableValueTotalUSD) || includedValue !== money(provenance.includedValueTotalUSD) || !groups.size || denominator <= ZERO
    || (nport ? provenance.weightBasis !== 'reported-net-assets' || includedValue > denominator : provenance.weightBasis !== 'included-equity-market-value' || includedValue !== denominator)) throw new Error('公开快照市值或分母异常');
  const holdings: Ledger37HoldingPosition[] = Array.from(groups.values()).map(row => {
    const fraction = (row.shares % SCALE).toString().padStart(24, '0').replace(/0+$/, '');
    const shares = `${row.shares / SCALE}${fraction ? `.${fraction}` : ''}`;
    const weightPct = Number(row.value) / Number(denominator) * 100;
    if (!Number.isFinite(weightPct) || weightPct < 0 || weightPct > 100) throw new Error('公开快照权重异常');
    return { symbol: row.symbol, ...(row.displaySymbol ? { displaySymbol: row.displaySymbol } : {}), stockName: row.stockName, currency: 'USD', shares, weightPct };
  });
  return { id, displayName: catalog.displayName, entityName: catalog.entityName, kind: nport ? 'etf' : '13f', status: 'available', asOf, publishedAt, checkedAt: seed.checkedAt, sourceUrl: url.href,
    description: catalog.description,
    coverageNote: `${catalog.description} 本条为手动导入的SEC${nport ? ' N-PORT基金' : ' 13F季度'}真实披露快照，截止日期以本条标注为准，不是实时持仓。只显示已披露的非期权股票及权益证券；${nport ? '比例按该报告基金净资产计算，未显示部分不重新归一化为100%。' : '重复管理人条目按证券识别码及股类合并，比例分母为同份报告纳入的非期权SH证券申报市值，不是机构全部资产。'}现金、债务及期权不计入股票列表，不推断本人私人账户或交易记录。`, holdings };
}
const loaded: Ledger37HoldingSource[] = [];
const seen = new Set<Ledger37HoldingSourceId>();
for (const seed of seeds) {
  try {
    const source = normalizeManualHoldingSeed(seed);
    if (seen.has(source.id)) continue;
    seen.add(source.id); loaded.push(source);
  } catch { /* One invalid public seed never breaks R1 or other valid source snapshots. */ }
}
export function getManualExternalHoldingSources(): Ledger37HoldingSource[] {
  return loaded.map(source => ({ ...source, holdings: source.holdings.map(row => ({ ...row })) }));
}
