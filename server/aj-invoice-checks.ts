import { createHash } from 'crypto';
import { TRPCError } from '@trpc/server';
import type { Connection, PoolConnection } from 'mysql2/promise';
import { getBeijingLedgerRecordToday } from '../shared/ledger-record-date';
import { decryptValue } from './encryption';
import { getAJInvoiceAIReviewStates } from './aj-invoice-ai';
import type { AJApprovalGuard } from './aj-invoice-review';

export type AJReviewWarning = { code: string; label: string; detail: string };
export type AJSameAmountInvoice = {
  id: number; amount: number; employeeName: string; companyName: string; recordDate: string; status: string;
};
export type AJCheckedInvoice = {
  id: number; recordDate: string; amount: number; employeeName: string; companyName: string;
  expenseReason: string; taxCategory: string; companyId: number | null; createdBy: number | null;
  images: string[]; description: string; reviewWarnings: AJReviewWarning[];
  sameAmountInvoices: AJSameAmountInvoice[]; sameAmountCount: number; reviewFingerprint: string;
};
export type AJCheckScope = {
  ledgerId: number; companyId?: number; employeeName?: string;
  period: 'all' | 'day' | 'week' | 'month' | 'quarter' | 'year';
  recordIds?: number[];
};
export type AJReviewAcknowledgement = { id: number; fingerprint: string };

// DECIMAL(10,2) 直接按字符串转换为分，不使用浮点相减或 5% 容差。
function amountCents(value: unknown): number | null {
  const text = typeof value === 'number' || typeof value === 'string' ? String(value).trim() : '';
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const cents = Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0'));
  const signed = match[1] === '-' ? -cents : cents;
  return Number.isSafeInteger(signed) ? signed : null;
}

function centsText(cents: number): string {
  return `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;
}

function dateText(value: unknown): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return '';
    // mysql2 DATE 默认为连接本地时间的 Date；取日历字段而非 UTC 日期。
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return typeof value === 'string' ? value.trim() : '';
}

function validDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text.slice(0, 4) === '0000') return false;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

function validImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  const text = value.trim();
  if (/\s|[\u0000-\u001f\u007f\\]/.test(text)) return false;
  // 仅校验 URL/数据格式，不读取图片、不做 OCR、不声称已识别内容。
  if (/^data:/i.test(text)) {
    const base64 = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/]+={0,2})$/i.exec(text);
    if (base64) {
      const encoded = base64[1];
      return encoded.length % 4 === 0 && Buffer.from(encoded, 'base64').toString('base64') === encoded;
    }
    const encodedImage = /^data:image\/[a-z0-9.+-]+(?:;charset=[a-z0-9-]+)?,(.+)$/i.exec(text);
    if (!encodedImage || /[<>]/.test(encodedImage[1])) return false;
    try { return decodeURIComponent(encodedImage[1]).length > 0; } catch { return false; }
  }
  try {
    if (/^https?:\/\//i.test(text)) {
      const url = new URL(text);
      return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
    }
    // 相对 URL 不接受其他 scheme 或协议相对外部链接。
    if (/^[a-z][a-z0-9+.-]*:/i.test(text) || text.startsWith('//') || /^[?#]/.test(text)) return false;
    const url = new URL(text, 'https://aj-local.invalid/');
    return url.origin === 'https://aj-local.invalid' && !!url.pathname;
  } catch { return false; }
}

function parseImages(raw: unknown, imageUrl: unknown): { images: string[]; malformed: boolean } {
  let values: unknown = raw;
  let malformed = false;
  if (typeof values === 'string') {
    if (!values.trim()) values = [];
    else {
      try { values = JSON.parse(values); } catch { malformed = true; values = []; }
    }
  }
  if (values == null) values = [];
  if (!Array.isArray(values)) { malformed = true; values = []; }
  const images: string[] = [];
  for (const value of [...(values as unknown[]), ...(imageUrl == null || imageUrl === '' ? [] : [imageUrl])]) {
    if (validImageUrl(value)) images.push(value.trim());
    else malformed = true;
  }
  return { images: [...new Set(images)], malformed };
}

function scopeSql(input: AJCheckScope, userId: number, role: string) {
  let sql = 'lr.ledgerId=? AND lr.deleted_at IS NULL';
  const params: Array<string | number> = [input.ledgerId];
  if (input.companyId !== undefined) { sql += ' AND lr.aj_company_id=?'; params.push(input.companyId); }
  if (role === 'funder') {
    sql += ` AND EXISTS (SELECT 1 FROM aj_companies ac
      INNER JOIN aj_company_access a ON a.company_id=ac.id AND a.ledger_id=ac.ledger_id
      WHERE ac.id=lr.aj_company_id AND ac.ledger_id=lr.ledgerId
        AND a.user_id=? AND a.is_enabled=1 AND COALESCE(a.access_type,'worker')='funder')`;
    params.push(userId);
  } else if (['owner', 'admin'].includes(role)) {
    // 管理员兼容无企业历史单，但不让错误的跨账本企业绑定进入批审。
    sql += ' AND (lr.aj_company_id IS NULL OR lr.aj_company_id=0 OR c.id IS NOT NULL)';
  } else {
    sql += ` AND lr.createdBy=? AND c.id IS NOT NULL AND (c.created_by=? OR EXISTS (
      SELECT 1 FROM aj_company_access a WHERE a.company_id=c.id AND a.ledger_id=c.ledger_id
        AND a.user_id=? AND a.is_enabled=1))`;
    params.push(userId, userId, userId);
  }
  return { sql, params };
}

const joins = `FROM ledger_records lr
  LEFT JOIN users u ON u.id=lr.createdBy
  LEFT JOIN ledger_members lm ON lm.userId=lr.createdBy AND lm.ledgerId=lr.ledgerId
  LEFT JOIN aj_companies c ON c.id=lr.aj_company_id AND c.ledger_id=lr.ledgerId`;
const amountSql = 'COALESCE(lr.reimbursement_amount, lr.amount)';
const fields = `lr.id, lr.ledgerId, lr.recordDate, ${amountSql} AS amount,
  lr.amount AS originalAmount, lr.reimbursement_amount AS reimbursementAmount,
  lr.createdBy, lr.aj_company_id AS companyId, lr.images, lr.imageUrl, lr.description,
  lr.aj_expense_reason AS expenseReason, lr.aj_tax_category AS taxCategory,
  lr.aj_status AS status, lr.reimbursement_status AS reimbursementStatus,
  lr.categoryId, lr.type, lr.updatedAt,
  COALESCE(lm.nickname, u.name, u.username) AS employeeName, c.name AS companyName`;

/** 调用者须先验证 AJ ledger/selected company 审核权限；只查询，不产生任何写入。 */
export async function getAJPendingInvoiceChecks(
  conn: Connection | PoolConnection, input: AJCheckScope, userId: number, role: string
): Promise<AJCheckedInvoice[]> {
  const today = getBeijingLedgerRecordToday();
  const scope = scopeSql(input, userId, role);
  let filter = '';
  const params: Array<string | number> = [...scope.params];
  if (input.period === 'day') { filter += ' AND lr.recordDate=?'; params.push(today); }
  else if (input.period === 'week') {
    const start = new Date(`${today}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    filter += ' AND lr.recordDate>=? AND lr.recordDate<=?'; params.push(start.toISOString().slice(0, 10), today);
  } else if (input.period !== 'all') {
    let start = `${today.slice(0, 4)}-01-01`;
    if (input.period === 'month') start = `${today.slice(0, 7)}-01`;
    if (input.period === 'quarter') {
      const month = Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1;
      start = `${today.slice(0, 4)}-${String(month).padStart(2, '0')}-01`;
    }
    filter += ' AND lr.recordDate>=? AND lr.recordDate<=?'; params.push(start, today);
  }
  if (input.employeeName) {
    filter += ' AND COALESCE(lm.nickname, u.name, u.username)=?'; params.push(input.employeeName);
  }
  if (input.recordIds) {
    if (!input.recordIds.length || input.recordIds.length > 5000 || new Set(input.recordIds).size !== input.recordIds.length) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '请选择1至5000张不重复的申请单' });
    }
    filter += ` AND lr.id IN (${input.recordIds.map(() => '?').join(',')})`; params.push(...input.recordIds);
  }
  const [rows] = await conn.execute(
    `SELECT ${fields} ${joins} WHERE ${scope.sql}
      AND (lr.aj_status IS NULL OR lr.aj_status='pending') ${filter}
      ORDER BY lr.recordDate DESC, lr.id DESC`, params
  );
  const pending = rows as any[];
  if (input.recordIds) {
    const found = new Set(pending.map(row => Number(row.id)));
    if (found.size !== input.recordIds.length || input.recordIds.some(id => !found.has(id))) {
      throw new TRPCError({ code: 'CONFLICT', message: '选中的申请已变化、取消待审或不在当前授权筛选范围，请刷新后重新核对' });
    }
  }
  if (!pending.length) return [];
  // 一次集合加载权限内历史识别及企业设置；批审绝不自动调用 AI。
  const aiStates = await getAJInvoiceAIReviewStates(conn, input.ledgerId, userId, role, pending.map(row => Number(row.id)));
  const amounts = [...new Set(pending.map(row => amountCents(row.amount)).filter((value): value is number => value !== null))];
  const groups = new Map<number, AJSameAmountInvoice[]>();
  if (amounts.length) {
    // 所有相关金额一次查询；同额历史不套日期/业务员筛选，不截断完整同额集合。
    const [peers] = await conn.execute(
      `SELECT lr.id, ${amountSql} AS amount, lr.recordDate,
        COALESCE(lr.aj_status,'pending') AS status,
        COALESCE(lm.nickname,u.name,u.username) AS employeeName, c.name AS companyName
       ${joins} WHERE ${scope.sql} AND COALESCE(lr.aj_status,'pending') IN ('pending','approved')
         AND ${amountSql} IN (${amounts.map(() => '?').join(',')}) ORDER BY lr.id ASC`,
      [...scope.params, ...amounts.map(centsText)]
    );
    for (const raw of peers as any[]) {
      const cents = amountCents(raw.amount);
      if (cents === null) continue;
      const group = groups.get(cents) || [];
      group.push({ id: Number(raw.id), amount: cents / 100, recordDate: dateText(raw.recordDate),
        status: raw.status, employeeName: raw.employeeName || '', companyName: raw.companyName || '' });
      groups.set(cents, group);
    }
  }
  // 每金额分组只哈希一次，避免为每单重复扫描所有记录来判断是否同额。
  const groupFingerprints = new Map<number, string>();
  const groupIds = new Map<number, Set<number>>();
  for (const [cents, peers] of groups) {
    groupFingerprints.set(cents, createHash('sha256').update(JSON.stringify(peers)).digest('hex'));
    groupIds.set(cents, new Set(peers.map(peer => peer.id)));
  }
  const representedAmounts = new Set<number>();
  return pending.map(raw => {
    const id = Number(raw.id);
    const cents = amountCents(raw.amount);
    const recordDate = dateText(raw.recordDate);
    const { images, malformed } = parseImages(raw.images, raw.imageUrl);
    const description = typeof raw.description === 'string' ? decryptValue(raw.description) : '';
    const expenseReason = typeof raw.expenseReason === 'string' ? raw.expenseReason : '';
    const taxCategory = typeof raw.taxCategory === 'string' ? raw.taxCategory : '';
    const group = cents === null ? [] : groups.get(cents) || [];
    const sameAmountCount = group.length - (cents !== null && groupIds.get(cents)?.has(id) ? 1 : 0);
    // 每金额只有首个待审代表携带完整 peer（排除自身）；其他行用计数/指纹共享同额提示。
    const sameAmountInvoices = cents !== null && !representedAmounts.has(cents)
      ? group.filter(peer => peer.id !== id) : [];
    if (cents !== null) representedAmounts.add(cents);
    const reviewWarnings: AJReviewWarning[] = [];
    const warn = (code: string, label: string, detail: string) => reviewWarnings.push({ code, label, detail });
    if (sameAmountCount) warn('same_amount', '存在同额发票', `当前授权企业范围内有${sameAmountCount}张其他待审或已批准申请金额相同；同额仅是风险提示，不代表重复，请人工区分。`);
    if (!images.length) warn('missing_images', '未上传有效图片', '未找到有效的凭证图片链接，请人工确认是否需要补充材料；系统未读取或识别图片内容。');
    if (malformed) warn('malformed_images', '图片字段异常', '部分图片数据无法解析或链接格式无效；仅检查存储格式，未验证图片是否可访问、未识别图片内容。');
    if (cents === null || cents <= 0) warn('invalid_amount', '金额异常', '报销金额格式无效或不大于0，请核对原单。');
    if (!validDate(recordDate)) warn('invalid_date', '日期无效', '申请日期不是有效的真实日历日期，请核对原单。');
    else if (recordDate > today) warn('future_date', '日期晚于今天', `申请日期晚于北京时间今天（${today}），请人工核对。`);
    if (!raw.companyId) warn('missing_company', '未绑定企业', '该申请没有绑定企业，请人工确认报销归属。');
    if (!description.trim() && !expenseReason.trim()) warn('missing_description', '缺少报销说明', '备注和报销事由均为空，请人工确认用途。');
    if (!taxCategory.trim()) warn('missing_tax_category', '未选报销类目', '该申请没有选择报销类目，请人工确认分类。');
    const ai = aiStates.get(id);
    if (ai) reviewWarnings.push(...ai.state.checks);
    else warn('ai_not_analyzed', '尚未完成 AI 核对', '未找到当前权限内可用识别；未识别历史不能保证没有重复发票。');
    const reviewFingerprint = createHash('sha256').update(JSON.stringify({
      version: 2, id, ledgerId: raw.ledgerId, companyId: raw.companyId ?? null, createdBy: raw.createdBy ?? null,
      recordDate, amount: raw.amount, originalAmount: raw.originalAmount, reimbursementAmount: raw.reimbursementAmount,
      status: raw.status ?? 'pending', reimbursementStatus: raw.reimbursementStatus,
      rawImages: raw.images, imageUrl: raw.imageUrl, images, rawDescription: raw.description, description,
      expenseReason, taxCategory, categoryId: raw.categoryId, type: raw.type, updatedAt: raw.updatedAt,
      employeeName: raw.employeeName, companyName: raw.companyName,
      sameAmountGroup: cents === null ? null : groupFingerprints.get(cents) ?? null, reviewWarnings,
      aiFingerprint: ai?.fingerprint ?? null,
    })).digest('hex');
    return { id, recordDate, amount: cents === null ? 0 : cents / 100,
      employeeName: raw.employeeName || '', companyName: raw.companyName || '', expenseReason, taxCategory,
      companyId: raw.companyId ? Number(raw.companyId) : null, createdBy: raw.createdBy ? Number(raw.createdBy) : null,
      images, description, reviewWarnings, sameAmountInvoices, sameAmountCount, reviewFingerprint };
  });
}

/** 整批预检只改善体验；正式批准仍须用 createAJBatchApprovalGuard 锁内复核。 */
export function assertAJBatchInvoiceChecks(
  records: AJCheckedInvoice[], reviewedRisks?: AJReviewAcknowledgement[], expectedChecks?: AJReviewAcknowledgement[]
) {
  const acknowledgements = (values: AJReviewAcknowledgement[] | undefined) => {
    const map = new Map<number, string>();
    for (const item of values || []) {
      if (map.has(item.id)) throw new TRPCError({ code: 'BAD_REQUEST', message: '核对信息中包含重复申请单号' });
      map.set(item.id, item.fingerprint);
    }
    return map;
  };
  const reviewed = acknowledgements(reviewedRisks);
  const expected = acknowledgements(expectedChecks);
  for (const record of records) {
    if (expectedChecks !== undefined && expected.get(record.id) !== record.reviewFingerprint) {
      throw new TRPCError({ code: 'CONFLICT', message: `申请#${record.id}或同额关联记录已变化，请刷新后重新核对` });
    }
    if (record.reviewWarnings.some(warning => warning.code === 'invalid_amount' || warning.code === 'invalid_date')) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `申请#${record.id}的金额或日期无效，请先修正原单或退回处理，不能仅凭已核对批准` });
    }
    if (record.reviewWarnings.length && reviewed.get(record.id) !== record.reviewFingerprint) {
      throw new TRPCError({ code: 'CONFLICT', message: `申请#${record.id}存在风险或核对信息已过期，请刷新并人工核对后再批准` });
    }
  }
}

/** 传给 reviewAJInvoice.beforeApprove，必须使用客户端明确确认的原指纹。
 * 本单已经锁定后，再锁账本现有记录/日志/企业配置及授权范围并首次一致性读取；
 * reviewAJInvoice 使用 REPEATABLE READ + 授权锁定读取，避免先建立过时快照。
 * 同批前序成功也会改变 peer 指纹：保守拒绝下一单，由router报告前序成功+本单冲突。
 * 范围锁可能死锁，数据库将回滚当前单；不是整批原子、不保证外部不规范写入的隔离。
 */
export function createAJBatchApprovalGuard(input: AJCheckScope, userId: number,
  expected: AJReviewAcknowledgement, reviewedRisk?: AJReviewAcknowledgement): AJApprovalGuard {
  return async (conn, row, role) => {
    if (Number(row.ledgerId) !== input.ledgerId || Number(row.id) !== expected.id || !/^[a-f0-9]{64}$/.test(expected.fingerprint)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '锁内核对信息与申请不一致' });
    }
    await conn.execute('SELECT id FROM ledgers WHERE id=? FOR UPDATE', [input.ledgerId]);
    await conn.execute('SELECT id FROM ledger_records WHERE ledgerId=? ORDER BY id FOR UPDATE', [input.ledgerId]);
    await conn.execute('SELECT id FROM ledger_record_logs WHERE ledger_id=? ORDER BY id FOR UPDATE', [input.ledgerId]);
    await conn.execute('SELECT id FROM aj_companies WHERE ledger_id=? ORDER BY id FOR UPDATE', [input.ledgerId]);
    await conn.execute('SELECT id FROM aj_company_access WHERE ledger_id=? ORDER BY id FOR UPDATE', [input.ledgerId]);
    await conn.execute('SELECT id FROM ledger_members WHERE ledgerId=? ORDER BY id FOR UPDATE', [input.ledgerId]);
    try { await conn.execute('SELECT company_id FROM aj_company_expense_types WHERE ledger_id=? FOR UPDATE', [input.ledgerId]); }
    catch (error) { if (!['ER_NO_SUCH_TABLE', 'ER_BAD_TABLE_ERROR'].includes((error as any)?.code)) throw error; }
    const latest = await getAJPendingInvoiceChecks(conn, { ...input, recordIds: [expected.id] }, userId, role);
    assertAJBatchInvoiceChecks(latest, reviewedRisk ? [reviewedRisk] : [], [expected]);
  };
}
