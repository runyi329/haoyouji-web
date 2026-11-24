import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Ledger37OrderReferenceScope } from '../shared/ledger37-order-reference';

export const ledger37OrderReferenceSchema = z.object({
  orderId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  userId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();

type ReferenceContext = { user: { id: number }; isViewingAs?: boolean };
type ReferenceInput = { ledgerId: number; tagName?: string; reference52?: Ledger37OrderReferenceScope };
type ReferenceKind = 'config' | 'summary' | 'valuation' | 'interest';
type JsonObject = Record<string, unknown>;

function badRequest(message: string): never {
  throw new TRPCError({ code: 'BAD_REQUEST', message });
}

function parseSavedObject(value: unknown, label: string): JsonObject {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { badRequest(`${label}格式损坏`); }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    badRequest(`${label}不存在或格式损坏`);
  }
  return parsed as JsonObject;
}

/** Match only the collateral_source projection in routers' syncFunderParticipantCollateralSnapshot.
 * Personal collateral is independent unless cross sharing is explicitly saved without an override.
 * Never import routers, initialize tables, mutate snapshots, or sync financial fields here.
 */
function participantSource(snapshot: JsonObject, parentSource: unknown): unknown {
  return snapshot.participant_collateral_override !== true && snapshot.collateral_share_mode === 'cross'
    ? parentSource
    : snapshot.collateral_source;
}

function allowedTags(source: JsonObject, kind: ReferenceKind): Set<string> {
  if (source.ledgerId !== 37) badRequest('订单未保存有效的37号账本引用');
  const names = ['tagName', 'floatingPnlTagName', 'collateralTagName', 'marginRateTagName',
    'pendingInterestTagName', 'paidInterestTagName', 'interestTagName'] as const;
  const flags = ['useFloatingPnl', 'useCollateral', 'useMarginRate', 'usePendingInterest',
    'usePaidInterest', 'useInterest'] as const;
  for (const name of names) {
    if (source[name] !== undefined && (typeof source[name] !== 'string'
      || (source[name] !== '' && !(source[name] as string).trim()))) {
      badRequest('订单37号引用标签配置损坏');
    }
  }
  for (const flag of flags) {
    if (source[flag] !== undefined && typeof source[flag] !== 'boolean') {
      badRequest('订单37号引用开关配置损坏');
    }
  }
  const base = (source.tagName as string | undefined) || '';
  const floating = (source.floatingPnlTagName as string | undefined)
    || (source.useFloatingPnl !== false ? base : '');
  const collateral = (source.collateralTagName as string | undefined)
    || (source.useCollateral !== false ? base : '');
  const margin = source.useMarginRate === true ? (source.marginRateTagName as string | undefined) || '' : '';
  const pending = (source.pendingInterestTagName as string | undefined)
    || (source.usePendingInterest === true ? base : '');
  const paid = (source.paidInterestTagName as string | undefined)
    || (source.interestTagName as string | undefined)
    || (source.usePaidInterest === true || source.useInterest === true ? base : '');
  const byKind: Record<ReferenceKind, string[]> = {
    config: [floating, collateral, margin, pending, paid],
    summary: [floating, collateral, margin],
    valuation: [collateral, margin],
    interest: [pending, paid],
  };
  return new Set(byKind[kind].filter(Boolean));
}

/**
 * Returns false ONLY when reference52 is absent, so the router keeps its original ledger-37 guard.
 * An explicit reference is a narrow read grant, never ledger membership or a write grant.
 * The caller supplies its existing connection; this helper performs exactly one scoped SELECT.
 */
export async function assertLedger37OrderReferenceRead(
  ctx: ReferenceContext,
  input: ReferenceInput,
  kind: ReferenceKind,
  connection: any,
): Promise<boolean> {
  if (input.reference52 === undefined) return false;
  if (input.ledgerId !== 37) badRequest('52号订单引用仅支持读取37号账本');
  if (!['config', 'summary', 'valuation', 'interest'].includes(kind)) badRequest('不支持的订单引用读取类型');
  const scopeResult = ledger37OrderReferenceSchema.safeParse(input.reference52);
  if (!scopeResult.success) badRequest('52号订单引用范围无效');
  const scope = scopeResult.data;
  if (typeof input.tagName !== 'string' || !input.tagName.trim()) {
    badRequest(kind === 'interest' ? '订单引用利息必须指定非空标签，不能列出全部37号利息' : '订单引用读取必须指定非空标签');
  }
  if (!Number.isSafeInteger(ctx.user.id) || ctx.user.id <= 0) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '当前有效身份无效' });
  }
  if (!connection || typeof connection.execute !== 'function') {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '订单引用读取数据库连接不可用' });
  }

  // Anchor preserves the distinction between non-membership and a missing/deleted order.
  // Only ledger-52 membership is read. The target participant is bound to this exact order and ledger.
  const result = await connection.execute(
    `SELECT m.id AS member_id, m.ledgerId AS member_ledger_id, m.userId AS member_user_id,
            m.role AS member_role, m.member_type,
            o.id AS order_id, o.ledger_id AS order_ledger_id, o.user_id AS order_owner_user_id,
            o.order_role, o.status AS order_status, o.deleted_at AS order_deleted_at, o.collateral_source,
            p.id AS participant_id, p.order_id AS participant_order_id, p.ledger_id AS participant_ledger_id,
            p.user_id AS participant_user_id, p.role AS participant_role, p.order_snapshot
       FROM (SELECT 1 AS anchor) reference_scope
       LEFT JOIN ledger_members m ON m.ledgerId = ? AND m.userId = ?
       LEFT JOIN ledger_orders o ON o.id = ? AND o.ledger_id = ?
         AND o.deleted_at IS NULL AND o.order_role IN ('finance', 'funder')
       LEFT JOIN ledger_order_participants p ON p.order_id = o.id AND p.ledger_id = o.ledger_id
         AND p.user_id = COALESCE(?, CASE WHEN m.member_type = 'real'
           AND m.role IN ('owner', 'admin') AND ? = 0 THEN o.user_id ELSE ? END)
         AND p.role NOT IN ('inactive', 'deleted')
       LIMIT 1`,
    [52, ctx.user.id, scope.orderId, 52, scope.userId ?? null, ctx.isViewingAs ? 1 : 0, ctx.user.id],
  );
  if (!Array.isArray(result) || !Array.isArray(result[0])) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: '订单引用读取结果格式异常' });
  }
  const row = result[0][0];
  if (!row || !row.member_id || Number(row.member_ledger_id) !== 52 || Number(row.member_user_id) !== ctx.user.id) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '仅52号账本成员可读取订单引用' });
  }
  const isManager = !ctx.isViewingAs && row.member_type === 'real'
    && (row.member_role === 'owner' || row.member_role === 'admin');
  if (!isManager && scope.userId !== undefined && scope.userId !== ctx.user.id) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '只能读取当前身份自己的订单引用视角' });
  }
  if (!row.order_id || Number(row.order_id) !== scope.orderId || Number(row.order_ledger_id) !== 52
    || row.order_deleted_at != null || !['finance', 'funder'].includes(row.order_role)
    || ['inactive', 'deleted'].includes(row.order_status)) {
    throw new TRPCError({ code: 'NOT_FOUND', message: '52号融资订单不存在、已停用或已删除' });
  }
  const targetUserId = scope.userId ?? (isManager ? Number(row.order_owner_user_id) : ctx.user.id);
  let sourceValue: unknown;
  if (targetUserId === Number(row.order_owner_user_id)) {
    // Physical ownership already grants the main-order view in financeGetOrders.
    // Legacy orders need no redundant participant row, and no row is created during this read.
    sourceValue = row.collateral_source;
  } else {
    if (!row.participant_id || Number(row.participant_order_id) !== scope.orderId
      || Number(row.participant_ledger_id) !== 52 || Number(row.participant_user_id) !== targetUserId
      || typeof row.participant_role !== 'string' || !row.participant_role
      || ['inactive', 'deleted'].includes(row.participant_role)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: '该订单没有当前目标身份的有效参与关系' });
    }
    const snapshot = parseSavedObject(row.order_snapshot, '个人订单快照');
    if (['inactive', 'deleted'].includes(String(snapshot.status))) {
      throw new TRPCError({ code: 'FORBIDDEN', message: '该个人订单视角已停用或已删除' });
    }
    sourceValue = participantSource(snapshot, row.collateral_source);
  }
  const source = parseSavedObject(sourceValue, '订单37号引用');
  if (!allowedTags(source, kind).has(input.tagName)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '该标签未被此订单视角保存并用于当前读取类型' });
  }
  return true;
}
