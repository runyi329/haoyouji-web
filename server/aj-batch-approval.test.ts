import { describe, it, expect, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import { runAJBatchApproval } from './aj-batch-approval';

describe('AJ batch approval result accounting', () => {
  it('empty selection performs no review', async () => {
    const review = vi.fn();
    expect(await runAJBatchApproval([], review)).toEqual({ approved: 0, totalAmount: 0, totalBonus: 0, skipped: 0, failed: [], remaining: 0 });
    expect(review).not.toHaveBeenCalled();
  });

  it('uses stable ID order and does not count an unchanged invoice as approval or reward', async () => {
    const rows = [{ id: 3 }, { id: 1 }, { id: 2 }];
    const order: number[] = [];
    const result = await runAJBatchApproval(rows, async row => {
      order.push(row.id);
      return row.id === 2 ? { changed: false, amount: 1000, usdtRewarded: 100 }
        : { changed: true, amount: row.id === 1 ? 0.1 : 0.2, usdtRewarded: 0.0001 };
    });
    expect(order).toEqual([1, 2, 3]);
    expect(rows.map(row => row.id)).toEqual([3, 1, 2]);
    expect(result).toEqual({ approved: 2, totalAmount: 0.3, totalBonus: 0.0002, skipped: 1, failed: [], remaining: 0 });
  });

  it('stops after a fingerprint failure and retains accurately reported committed results', async () => {
    const calls: number[] = [];
    const result = await runAJBatchApproval([{ id: 1 }, { id: 2 }, { id: 3 }], async row => {
      calls.push(row.id);
      if (row.id === 2) throw new TRPCError({ code: 'CONFLICT', message: '核对信息已过期；本次尚未批准任何申请' });
      return { changed: true, amount: 45.67, usdtRewarded: 0.065242 };
    });
    expect(calls).toEqual([1, 2]);
    expect(result).toEqual({ approved: 1, totalAmount: 45.67, totalBonus: 0.0652, skipped: 0,
      failed: [{ id: 2, message: '核对信息已过期' }], remaining: 1 });
  });

  it('a first-row failure reports zero approvals and does not reveal low-level errors', async () => {
    const review = vi.fn().mockRejectedValue(new Error('mysql private query / secret credential'));
    const result = await runAJBatchApproval([{ id: 8 }, { id: 9 }], review);
    expect(review).toHaveBeenCalledTimes(1);
    expect(result.approved).toBe(0);
    expect(result.remaining).toBe(1);
    expect(result.failed[0].id).toBe(8);
    expect(result.failed[0].message).not.toContain('credential');
    expect(result.failed[0].message).not.toContain('mysql');
  });
});
