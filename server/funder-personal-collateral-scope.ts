import { TRPCError } from '@trpc/server';

type PersonScope = { ledgerId: number; orderId: number; userId: number };
function assertEvidenceScope(evidence: any, scope: PersonScope): void {
  if (![scope.ledgerId, scope.orderId, scope.userId].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '个人担保解锁范围无效' });
  }
  const stored = evidence?.evidenceScope;
  if (Number(evidence?.version) !== 2 || !stored
    || Number(stored.ledgerId) !== scope.ledgerId
    || Number(stored.orderId) !== scope.orderId
    || Number(stored.userId) !== scope.userId) {
    throw new TRPCError({ code: 'CONFLICT', message: '个人结清证据与担保归属不一致，请人工核对，不能自动解锁' });
  }
}

/** Only a selected person's complete settled view authorizes releasing all their order locks. */
export function assertFunderPersonalCollateralReleaseScope(snapshot: Record<string, any>, scope: PersonScope): void {
  if (!['settled', 'completed'].includes(String(snapshot.status || ''))) {
    throw new TRPCError({ code: 'CONFLICT', message: '个人订单尚未结清，不能解除钱包担保' });
  }
  const segments = snapshot.joint_order_segments;
  if (segments != null && !Array.isArray(segments)) {
    throw new TRPCError({ code: 'CONFLICT', message: '联合订单分段记录异常，不能解除钱包担保' });
  }
  const evidence = snapshot.settlement_snapshot;
  assertEvidenceScope(evidence, scope);
  if (Array.isArray(segments) && segments.length > 0) {
    const primary = snapshot.joint_order_primary_settlement;
    if (!['settled', 'completed'].includes(String(primary?.status || ''))
      || segments.some(segment => !['settled', 'completed'].includes(String(segment?.status || ''))
        || (segment?.owner_user_id != null && Number(segment.owner_user_id) !== scope.userId))) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '仍有未结清的联合订单分段，请使用分段结清，不能整份解锁' });
    }
    assertFunderJointCollateralReleaseScope(primary, { ...scope, jointSegmentId: '__primary__' });
    for (const segment of segments) {
      assertFunderJointCollateralReleaseScope(segment, { ...scope, jointSegmentId: String(segment?.id || '') });
    }
    if (evidence.evidenceScope.sourceKind !== 'joint_primary' || evidence.evidenceScope.jointSegmentId !== '__primary__') {
      throw new TRPCError({ code: 'CONFLICT', message: '联合订单整份解锁证据不完整，不能解除担保' });
    }
  } else if (evidence.evidenceScope.sourceKind !== 'individual_snapshot' || evidence.evidenceScope.jointSegmentId != null) {
    throw new TRPCError({ code: 'CONFLICT', message: '个人结清证据不能由单段或主订单证据代替，不能整份解锁' });
  }
}

export function assertFunderJointCollateralReleaseScope(
  part: Record<string, any>,
  scope: PersonScope & { jointSegmentId: string },
): void {
  if (!['settled', 'completed'].includes(String(part.status || ''))) {
    throw new TRPCError({ code: 'CONFLICT', message: '联合订单分段尚未结清，不能解锁' });
  }
  assertEvidenceScope(part.settlement_snapshot, scope);
  const expectedKind = scope.jointSegmentId === '__primary__' ? 'joint_primary' : 'joint_segment';
  if (!/^(?:__primary__|[A-Za-z0-9_-]{1,48})$/.test(scope.jointSegmentId)
    || part.settlement_snapshot.evidenceScope.jointSegmentId !== scope.jointSegmentId
    || part.settlement_snapshot.evidenceScope.sourceKind !== expectedKind
    || (part.owner_user_id != null && Number(part.owner_user_id) !== scope.userId)) {
    throw new TRPCError({ code: 'CONFLICT', message: '联合订单结清证据与本人的担保分段不一致，不能解锁' });
  }
}
