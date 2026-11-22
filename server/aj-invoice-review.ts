import { TRPCError } from '@trpc/server';
import type { Connection, PoolConnection } from 'mysql2/promise';
import { getDbTransactionConnection } from './db';

export type AJInvoiceStatus = 'pending' | 'approved' | 'rejected' | 'support_needed';
export type AJConnection = Connection | PoolConnection;
export type AJApprovalGuard = (conn: AJConnection, row: any, role: string) => Promise<void>;

function reviewComment(comment?: string): string | null {
  if (comment !== undefined && comment.length > 1000) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '审批或复核说明最多1000字' });
  }
  return comment?.trim() || null;
}

// 必须使用独占连接；不能在 getDbConnection 返回的共享 pool 上开启事务。
async function inAJTransaction<T>(operation: (conn: AJConnection) => Promise<T>): Promise<T> {
  const conn = await getDbTransactionConnection();
  if (!conn || !('release' in conn)) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'AJ 操作需要独占数据库事务连接' });
  try {
    // 锁内批审范围锁必须阻止 peer 插入；不依赖连接池前一调用遗留的隔离级别。
    await conn.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await conn.beginTransaction();
    const result = await operation(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    if ('release' in conn) conn.release();
  }
}

export async function assertAJLedgerAccess(conn: AJConnection, ledgerId: number, userId: number, review = false, lock = false) {
  const [rows] = await conn.execute(
    `SELECT l.type, lm.role FROM ledgers l
     LEFT JOIN ledger_members lm ON lm.ledgerId=l.id AND lm.userId=?
     WHERE l.id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [userId, ledgerId]
  );
  const row = (rows as any[])[0];
  if (!row || row.type !== 'custom_aj') {
    throw new TRPCError({ code: 'FORBIDDEN', message: '此操作仅限 AJ 账本' });
  }
  if (!row.role || (review && !['owner', 'admin', 'funder'].includes(row.role))) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '您没有该账本的操作权限' });
  }
  return row.role as string;
}

export async function assertAJCompanyAccess(
  conn: AJConnection, ledgerId: number, companyId: number | null, userId: number, role: string,
  review = false, lock = false
) {
  // 兼容旧 AJ 管理员处理的未绑定企业历史单；资方/业务员必须有企业授权。
  if (!companyId) {
    if (role === 'owner' || role === 'admin') return;
    throw new TRPCError({ code: 'FORBIDDEN', message: '申请尚未绑定授权企业' });
  }
  const [rows] = await conn.execute(
    `SELECT c.id, c.created_by,
       EXISTS(SELECT 1 FROM aj_company_access a
         WHERE a.company_id=c.id AND a.ledger_id=c.ledger_id AND a.user_id=? AND a.is_enabled=1
           AND (COALESCE(a.access_type,'worker')='funder' OR ?=0)${lock ? ' FOR UPDATE' : ''}) AS hasAccess
     FROM aj_companies c WHERE c.id=? AND c.ledger_id=? LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [userId, review || role === 'funder' ? 1 : 0, companyId, ledgerId]
  );
  const company = (rows as any[])[0];
  const authorized = company && (['owner', 'admin'].includes(role) || Number(company.hasAccess)
    || (role !== 'funder' && Number(company.created_by) === userId));
  if (!authorized) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '您没有该企业的操作授权' });
  }
}

async function lockInvoice(conn: AJConnection, transactionId: number, ledgerId?: number) {
  const [rows] = await conn.execute(
    `SELECT id, ledgerId, createdBy, amount, reimbursement_amount AS reimbursementAmount,
       reimbursement_status AS reimbursementStatus, aj_company_id AS ajCompanyId,
       aj_status AS ajStatus, aj_approve_comment AS ajApproveComment,
       aj_approved_at AS ajApprovedAt, recordDate
     FROM ledger_records WHERE id=? AND deleted_at IS NULL ${ledgerId === undefined ? '' : 'AND ledgerId=?'}
     LIMIT 1 FOR UPDATE`, ledgerId === undefined ? [transactionId] : [transactionId, ledgerId]
  );
  const row = (rows as any[])[0];
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: '申请不存在或不属于该账本' });
  return row;
}

async function hasAllowance(conn: AJConnection, row: any): Promise<boolean> {
  const note = `成本津贴 #${row.id}`;
  // 同时识别旧入口写入的两种财务记录；不删除、不冲销任何津贴。
  const [balances] = await conn.execute(
    `SELECT id FROM af_manual_balances WHERE ledger_id=? AND note=? LIMIT 1 FOR UPDATE`,
    [row.ledgerId, note]
  );
  const [history] = await conn.execute(
    `SELECT id FROM balance_history WHERE type='reward' AND related_id=? AND description=? LIMIT 1 FOR UPDATE`,
    [row.id, note]
  );
  return (balances as any[]).length > 0 || (history as any[]).length > 0;
}

async function assertReturnSafe(conn: AJConnection, row: any) {
  if (row.ajStatus === 'approved' || row.reimbursementStatus === 'completed' || await hasAllowance(conn, row)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '已批准、已报销或已有津贴的申请不能普通退回或撤审，请走专门财务处理流程' });
  }
}

// 直接在状态事务内写既有表；失败必须回滚，不能调用会吞错误的旧 insertRecordLog。
async function statusLog(conn: AJConnection, row: any, userId: number, action: string, newStatus: string | null, note: string | null) {
  if (note != null && Buffer.byteLength(note, 'utf8') > 48 * 1024) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '审批历史说明超过48KB，请走专门历史数据处理流程' });
  }
  await conn.execute(
    `INSERT INTO ledger_record_logs
       (record_id, ledger_id, operator_id, action, field_name, old_value, new_value, note, created_at)
     VALUES (?, ?, ?, ?, 'aj_status', ?, ?, ?, CONVERT_TZ(NOW(), '+00:00', '+08:00'))`,
    [row.id, row.ledgerId, userId, action, row.ajStatus ?? 'pending', newStatus, note]
  );
}

// 沿用通过后报销金额的 1% / USD-CNY 成本津贴规则，汇率失败仍使用原兜底。
export async function getAJUsdCnyRate(): Promise<number> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(5000) });
    const data = await res.json() as { result?: string; rates?: Record<string, number> };
    const rate = Number(data.rates?.CNY);
    if (data.result === 'success' && Number.isFinite(rate) && rate > 0) return rate;
  } catch { /* 外部汇率不可用时沿用兜底，不涉及数据库错误。 */ }
  return 7.2;
}

export async function reviewAJInvoice(input: {
  transactionId: number; ledgerId?: number; userId: number; status: AJInvoiceStatus;
  comment?: string; onlyPending?: boolean; usdCnyRate?: number;
  beforeApprove?: AJApprovalGuard;
}) {
  const comment = reviewComment(input.comment);
  if (input.status === 'rejected' && !comment) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '拒绝退回必须填写理由' });
  }
  return inAJTransaction(async conn => {
    const row = await lockInvoice(conn, input.transactionId, input.ledgerId);
    const role = await assertAJLedgerAccess(conn, row.ledgerId, input.userId, true, true);
    await assertAJCompanyAccess(conn, row.ledgerId, row.ajCompanyId, input.userId, role, true, true);
    const oldStatus = row.ajStatus ?? 'pending';
    // 批量候选在取锁前可能已改变；必须跳过，不得重新审批退回单。
    if (input.onlyPending && oldStatus !== 'pending') {
      return { success: true, transactionId: row.id, status: oldStatus as AJInvoiceStatus, changed: false, usdtRewarded: 0, amount: 0 };
    }
    // 重复通过仅返回成功，不重写审批人、时间或理由，也不重复发放津贴。
    if (oldStatus === 'approved' && input.status === 'approved') {
      return { success: true, transactionId: row.id, status: input.status, changed: false, usdtRewarded: 0, amount: 0 };
    }
    if (input.status === 'approved') {
      if (oldStatus !== 'pending') throw new TRPCError({ code: 'BAD_REQUEST', message: '退回或待补材料的原单须由本人修改/说明后重新提交待审' });
      const text = String(row.reimbursementAmount ?? row.amount ?? '');
      const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
      const cents = match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : NaN;
      const date = row.recordDate instanceof Date
        ? `${row.recordDate.getFullYear()}-${String(row.recordDate.getMonth() + 1).padStart(2, '0')}-${String(row.recordDate.getDate()).padStart(2, '0')}`
        : String(row.recordDate || '');
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00.000Z`) : new Date(NaN);
      if (!Number.isSafeInteger(cents) || cents <= 0 || date.startsWith('0000') || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '申请金额或日期无效，请先修正原单，不能直接批准' });
      }
      if (row.reimbursementStatus === 'completed' || await hasAllowance(conn, row)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '待审状态与已报销/津贴财务记录不一致，请走专门财务处理流程' });
      }
    }
    // 只有此处已经取得本单行锁、并验证当前授权；批审不可仅凭锁前预检批准。
    if (input.status === 'approved' && input.beforeApprove) await input.beforeApprove(conn, row, role);
    if (input.status !== 'approved') {
      await assertReturnSafe(conn, row);
      if (input.status === 'pending' && ['rejected', 'support_needed'].includes(oldStatus)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '退回申请请由申请人保存修改或填写复核说明后重新提交' });
      }
    }
    const [updated] = await conn.execute(
      `UPDATE ledger_records SET aj_status=?, aj_approved_by=?, aj_approved_at=NOW(),
         aj_approve_comment=?, updatedAt=NOW()
       WHERE id=? AND ledgerId=? AND deleted_at IS NULL AND aj_status <=> ?`,
      [input.status, input.userId, comment, row.id, row.ledgerId, row.ajStatus ?? null]
    );
    if ((updated as any).affectedRows !== 1) throw new TRPCError({ code: 'CONFLICT', message: '申请状态已变化，请刷新后重试' });
    const note = row.ajApproveComment && row.ajApproveComment !== comment
      ? `原审批理由：${row.ajApproveComment}\n本次说明：${comment ?? ''}` : comment;
    const action = input.status === 'approved' ? 'approve' : input.status === 'rejected' ? 'reject' : input.status;
    await statusLog(conn, row, input.userId, action, input.status, note);
    let usdtRewarded = 0;
    const amount = Number(row.reimbursementAmount ?? row.amount ?? '0');
    if (input.status === 'approved' && row.createdBy && amount > 0 && !await hasAllowance(conn, row)) {
      const rate = input.usdCnyRate ?? await getAJUsdCnyRate();
      if (!Number.isFinite(rate) || rate <= 0) throw new TRPCError({ code: 'BAD_REQUEST', message: '津贴汇率无效' });
      usdtRewarded = parseFloat((amount * 0.01 / rate).toFixed(6));
      if (usdtRewarded > 0) {
        const note = `成本津贴 #${row.id}`;
        await conn.execute(
          `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, NOW(), NOW())`, [row.ledgerId, row.createdBy, usdtRewarded, note]
        );
        await conn.execute(
          `INSERT INTO balance_history (user_id, amount, type, related_id, balance, description, created_at)
           VALUES (?, ?, 'reward', ?, 0, ?, NOW())`, [row.createdBy, usdtRewarded, row.id, note]
        );
      }
    }
    return { success: true, transactionId: row.id, status: input.status, changed: true, usdtRewarded, amount };
  });
}

export async function resubmitAJInvoice(input: { ledgerId: number; transactionId: number; userId: number; comment?: string }) {
  const comment = reviewComment(input.comment);
  return inAJTransaction(async conn => {
    const row = await lockInvoice(conn, input.transactionId, input.ledgerId);
    const role = await assertAJLedgerAccess(conn, input.ledgerId, input.userId, false, true);
    if (Number(row.createdBy) !== input.userId) throw new TRPCError({ code: 'FORBIDDEN', message: '只能重新提交自己的申请' });
    await assertAJCompanyAccess(conn, input.ledgerId, row.ajCompanyId, input.userId, role, false, true);
    if (!['rejected', 'support_needed'].includes(row.ajStatus)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '只能重新提交拒绝退回或待补充材料的原申请' });
    }
    await assertReturnSafe(conn, row);
    if (!comment) {
      // 使用递增日志 ID 定位本轮退回，避免旧编辑或时间时区误差被当成新修改。
      const [reviewRows] = await conn.execute(
        `SELECT id FROM ledger_record_logs WHERE record_id=? AND ledger_id=?
           AND field_name='aj_status' AND new_value=? ORDER BY id DESC LIMIT 1`,
        [row.id, row.ledgerId, row.ajStatus]
      );
      const reviewId = (reviewRows as any[])[0]?.id;
      // 历史无状态日志的退回单要求显式复核说明，不能猜测其修改基线。
      if (!reviewId) throw new TRPCError({ code: 'BAD_REQUEST', message: '此历史申请请填写复核说明后重新提交' });
      const [editRows] = await conn.execute(
        `SELECT id FROM ledger_record_logs WHERE record_id=? AND ledger_id=? AND operator_id=?
           AND action='edit' AND id>? AND NOT(old_value <=> new_value)
           AND field_name IN ('类型','金额','分类','备注','日期','凭证图片','支出人','账户',
             'amount','categoryId','description','recordDate','images','aj_expense_reason','aj_tax_category','aj_accounting_code')
         LIMIT 1`, [row.id, row.ledgerId, input.userId, reviewId]
      );
      if (!(editRows as any[]).length) throw new TRPCError({ code: 'BAD_REQUEST', message: '请先保存修改，或填写非空复核说明后重新提交' });
    }
    // 先将旧理由保留到历史；本事务失败时状态和日志一并回滚。
    await statusLog(conn, row, input.userId, 'resubmit', 'pending',
      `原审批理由：${row.ajApproveComment ?? ''}\n复核说明：${comment ?? '申请人已保存修改后重新提交'}`);
    const [updated] = await conn.execute(
      `UPDATE ledger_records SET aj_status='pending', aj_approved_by=NULL, aj_approved_at=NULL,
         aj_approve_comment=NULL, updatedAt=NOW()
       WHERE id=? AND ledgerId=? AND createdBy=? AND deleted_at IS NULL AND aj_status <=> ?`,
      [row.id, row.ledgerId, input.userId, row.ajStatus]
    );
    if ((updated as any).affectedRows !== 1) throw new TRPCError({ code: 'CONFLICT', message: '申请状态已变化，请刷新后重试' });
    return { success: true, ledgerId: row.ledgerId, transactionId: row.id, status: 'pending' as const };
  });
}

export async function withdrawAJInvoice(input: { ledgerId: number; transactionId: number; userId: number }) {
  return inAJTransaction(async conn => {
    const row = await lockInvoice(conn, input.transactionId, input.ledgerId);
    const role = await assertAJLedgerAccess(conn, input.ledgerId, input.userId, false, true);
    if (Number(row.createdBy) !== input.userId) throw new TRPCError({ code: 'FORBIDDEN', message: '只能撤回自己提交的申请' });
    await assertAJCompanyAccess(conn, input.ledgerId, row.ajCompanyId, input.userId, role, false, true);
    if (row.ajStatus !== 'pending') throw new TRPCError({ code: 'BAD_REQUEST', message: '只能撤回待审批状态的申请' });
    await assertReturnSafe(conn, row);
    const [updated] = await conn.execute(
      `UPDATE ledger_records SET deleted_at=NOW(), deleted_by=?, aj_status=NULL, updatedAt=NOW()
       WHERE id=? AND ledgerId=? AND createdBy=? AND deleted_at IS NULL AND aj_status='pending'`,
      [input.userId, row.id, row.ledgerId, input.userId]
    );
    if ((updated as any).affectedRows !== 1) throw new TRPCError({ code: 'CONFLICT', message: '申请状态已变化，请刷新后重试' });
    await statusLog(conn, row, input.userId, 'withdraw', null, '申请人撤回待审批申请');
    return { success: true, deleted: true };
  });
}

export async function editAJInvoice(recordId: number, userId: number, data: {
  type?: 'income' | 'expense' | 'transfer'; amount?: number; categoryId?: number;
  subcategoryId?: number; description?: string; transactionDate?: string; images?: string[];
  memberId?: number; accountId?: number; reimbursementStatus?: string;
  pendingType?: string | null; pendingIncludeStats?: number | null; stockCodes?: unknown;
}) {
  return inAJTransaction(async conn => {
    const locked = await lockInvoice(conn, recordId);
    const role = await assertAJLedgerAccess(conn, locked.ledgerId, userId, false, true);
    if (Number(locked.createdBy) !== userId && !['owner', 'admin'].includes(role)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: '只能修改自己的 AJ 申请' });
    }
    await assertAJCompanyAccess(conn, locked.ledgerId, locked.ajCompanyId, userId, role, false, true);
    await assertReturnSafe(conn, locked);
    // AJ 普通编辑不能变更财务状态，避免先清空 completed 再退回的绕过路径。
    if (data.reimbursementStatus !== undefined || data.pendingType !== undefined || data.pendingIncludeStats !== undefined) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'AJ 申请普通编辑不能变更报销或待结财务状态' });
    }
    if (data.subcategoryId !== undefined || data.memberId !== undefined || data.accountId !== undefined || data.stockCodes !== undefined) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'AJ 原单普通编辑仅支持金额、类型、类目、日期、备注和凭证图片' });
    }
    const [rows] = await conn.execute('SELECT * FROM ledger_records WHERE id=? AND ledgerId=? LIMIT 1', [recordId, locked.ledgerId]);
    const raw = (rows as any[])[0];
    const { decryptValue, encryptValue, isFieldEncryptionEnabled } = await import('./encryption');
    const old = { ...raw, description: raw.description ? decryptValue(raw.description) : raw.description };
    const update: Record<string, any> = {};
    const changes: Array<{ field: string; old: string | null; value: string | null }> = [];
    const add = (column: string, label: string, value: unknown, previous: unknown = old[column]) => {
      const text = value == null ? null : String(value);
      const prior = previous == null ? null : String(previous);
      if (text === prior) return;
      update[column] = value;
      changes.push({ field: label, old: prior, value: text });
    };
    if (data.type !== undefined) add('type', '类型', data.type);
    if (data.amount !== undefined) {
      if (!Number.isFinite(data.amount)) throw new TRPCError({ code: 'BAD_REQUEST', message: '金额无效' });
      add('amount', '金额', Math.abs(data.amount).toFixed(2), Math.abs(Number(old.amount)).toFixed(2));
    }
    if (data.categoryId !== undefined) {
      const [categories] = await conn.execute('SELECT id FROM ledger_categories WHERE id=? AND ledgerId=? LIMIT 1', [data.categoryId, locked.ledgerId]);
      if (!(categories as any[]).length) throw new TRPCError({ code: 'BAD_REQUEST', message: '类目不属于该账本' });
      add('categoryId', '分类', data.categoryId);
    }
    if (data.description !== undefined) add('description', '备注', data.description || null, old.description || null);
    if (data.transactionDate !== undefined) {
      const text = data.transactionDate;
      const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00.000Z`) : new Date(NaN);
      // AJ 可保留未来日期作为审核风险，但不能保存无效日历日期。
      if (text.startsWith('0000') || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: '日期必须为有效日历日期' });
      }
      const date = old.recordDate instanceof Date
        ? `${old.recordDate.getFullYear()}-${String(old.recordDate.getMonth() + 1).padStart(2, '0')}-${String(old.recordDate.getDate()).padStart(2, '0')}`
        : String(old.recordDate);
      add('recordDate', '日期', data.transactionDate, date);
    }
    if (data.images !== undefined) {
      const images = data.images.length ? JSON.stringify(data.images) : null;
      let parsedImages: unknown = old.images;
      if (typeof parsedImages === 'string') { try { parsedImages = JSON.parse(parsedImages); } catch { parsedImages = []; } }
      const priorImages = Array.isArray(parsedImages) && parsedImages.length ? JSON.stringify(parsedImages)
        : old.imageUrl ? JSON.stringify([old.imageUrl]) : null;
      add('images', '凭证图片', images, priorImages);
      const imageUrl = data.images[0] || null;
      if (imageUrl !== (old.imageUrl || null)) update.imageUrl = imageUrl;
    }
    if (!Object.keys(update).length) return { success: true, overwritten: false };
    // TEXT 最多65535字节；拒绝过大的旧/新图片日志，不能截断JSON或吞日志失败。
    if (changes.some(change => [change.old, change.value].some(value => value != null && Buffer.byteLength(value, 'utf8') > 48 * 1024))) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '修改日志超过48KB，请减少凭证或拆分申请' });
    }
    const encrypted = { ...update };
    if (typeof encrypted.description === 'string' && await isFieldEncryptionEnabled(conn, 'ledger_records', 'description')) {
      encrypted.description = encryptValue(encrypted.description);
    }
    const columns = Object.keys(encrypted);
    const [updated] = await conn.execute(
      `UPDATE ledger_records SET ${columns.map(column => `\`${column}\`=?`).join(',')}, updatedAt=NOW()
       WHERE id=? AND ledgerId=? AND deleted_at IS NULL AND aj_status <=> ?`,
      [...columns.map(column => (encrypted as any)[column]), recordId, locked.ledgerId, locked.ajStatus ?? null]
    );
    if ((updated as any).affectedRows !== 1) throw new TRPCError({ code: 'CONFLICT', message: '申请状态已变化，请刷新后重试' });
    for (const change of changes) {
      await conn.execute(
        `INSERT INTO ledger_record_logs (record_id, ledger_id, operator_id, action, field_name, old_value, new_value, note, created_at)
         VALUES (?, ?, ?, 'edit', ?, ?, ?, NULL, CONVERT_TZ(NOW(), '+00:00', '+08:00'))`,
        [recordId, locked.ledgerId, userId, change.field, change.old, change.value]
      );
    }
    return { success: true, overwritten: false };
  });
}
