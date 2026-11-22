import { TRPCError } from '@trpc/server';

export type AJBatchApprovalResult = {
  approved: number; totalAmount: number; totalBonus: number; skipped: number;
  failed: Array<{ id: number; message: string }>; remaining: number;
};
export type AJSingleApprovalResult = { changed: boolean; amount: number; usdtRewarded: number };

/** 每单由调用者提供独占事务；失败即停止，不声称整批回滚。此执行器自身不访问数据库或AI。 */
export async function runAJBatchApproval<T extends { id: number }>(
  records: T[], review: (record: T) => Promise<AJSingleApprovalResult>,
): Promise<AJBatchApprovalResult> {
  let approved = 0;
  let totalAmount = 0;
  let totalBonus = 0;
  let skipped = 0;
  let processed = 0;
  const failed: AJBatchApprovalResult['failed'] = [];
  for (const record of [...records].sort((a, b) => a.id - b.id)) {
    try {
      const result = await review(record);
      processed++;
      if (result.changed) {
        approved++;
        totalAmount = Math.round((totalAmount + result.amount) * 100) / 100;
        totalBonus += result.usdtRewarded;
      } else skipped++;
    } catch (error) {
      processed++;
      const message = error instanceof TRPCError
        ? error.message.replace(/；本次尚未批准任何申请/g, '')
        : '处理失败，请刷新核对实际状态后重试；系统不会继续处理剩余申请';
      failed.push({ id: record.id, message });
      break;
    }
  }
  return { approved, totalAmount, totalBonus: Number(totalBonus.toFixed(4)), skipped,
    failed, remaining: records.length - processed };
}
