// 标记代表管理员确认的CNY历史微信本金来源；只读展示，不是新增余额流水。
export const HISTORICAL_PRINCIPAL_START = '[历史微信本金V1:';
export const HISTORICAL_PRINCIPAL_END = ']';

export type HistoricalPrincipalSource = {
  id: string;
  businessDate: string;
  amount: string;
  sourceTag: string;
  targetTag: string;
  walletRecordedAt: string;
  linkedWalletEntryId: number;
  paymentMethod: 'wechat';
  note: string;
  countsTowardBalance: false;
};

function cnyUnits(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^\d{1,18}(?:\.\d{1,8})?$/.test(value)) return null;
  const [integer, fraction = ''] = value.split('.');
  return BigInt(integer) * 100000000n + BigInt(fraction.padEnd(8, '0'));
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** 来源注释不是记账记录；损坏/超额/重复标记整条拒绝，不猜测金额和日期。 */
export function parseHistoricalPrincipalSources(row: {
  id: number;
  ledger_id: number;
  amount: string;
  note: string;
  created_at: string;
}): HistoricalPrincipalSource[] {
  const note = String(row.note ?? '');
  if (row.ledger_id !== 37 || !Number.isSafeInteger(row.id) || row.id <= 0
    || !note.startsWith('[CNY]历史手工保证金迁入并冻结')) return [];
  const start = note.indexOf(HISTORICAL_PRINCIPAL_START);
  if (start < 0 || note.indexOf(HISTORICAL_PRINCIPAL_START, start + 1) >= 0) return [];
  const end = note.indexOf(HISTORICAL_PRINCIPAL_END, start + HISTORICAL_PRINCIPAL_START.length);
  if (end < 0) return [];
  const fields = note.slice(start + HISTORICAL_PRINCIPAL_START.length, end).split(',');
  if (fields.length !== 3) return [];
  const [businessDate, amount, sourceTag] = fields;
  const walletDay = String(row.created_at).slice(0, 10);
  if (!validDate(businessDate) || !validDate(walletDay) || businessDate > walletDay
    || !sourceTag.trim() || sourceTag.length > 50 || /[\[\]\r\n]/.test(sourceTag)) return [];
  const units = cnyUnits(amount);
  const walletUnits = cnyUnits(row.amount);
  if (units === null || walletUnits === null || units <= 0n || units > walletUnits) return [];
  const targetTag = note.match(/^\[CNY\]历史手工保证金迁入并冻结\s*·\s*([^·]+)/)?.[1]?.trim();
  if (!targetTag || targetTag.includes(HISTORICAL_PRINCIPAL_START)) return [];
  return [{
    id: `historical-principal-${row.id}`,
    businessDate,
    amount,
    sourceTag: sourceTag.trim(),
    targetTag,
    walletRecordedAt: row.created_at,
    linkedWalletEntryId: row.id,
    paymentMethod: 'wechat',
    note: `历史微信存入本金，业务日期经管理员确认。已包含在${walletDay}的${targetTag}迁入流水（#${row.id}）中；此处仅还原来源，不重复增加余额。`,
    countsTowardBalance: false,
  }];
}
