/**
 * 世界杯赔率追踪 tRPC 路由
 * 管理员专用：手动触发抓取、查询历史快照
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { TRPCError } from '@trpc/server';
import { db } from '../db';
import { wcOddsSnapshots, wcOddsRecords } from '../../drizzle/schema';
import { desc, eq, asc, inArray } from 'drizzle-orm';
import { fetchAndSaveOdds } from '../wcOddsScraper';

// 管理员检查中间件
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可操作' });
  }
  return next({ ctx });
});

export const wcOddsRouter = router({
  /**
   * 手动触发一次抓取（管理员）
   */
  triggerFetch: adminProcedure.mutation(async () => {
    try {
      const result = await fetchAndSaveOdds();
      return { success: true, ...result };
    } catch (e: any) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: e.message });
    }
  }),

  /**
   * 获取所有快照列表（管理员）
   */
  getSnapshots: adminProcedure.query(async () => {
    const snapshots = await db
      .select()
      .from(wcOddsSnapshots)
      .orderBy(desc(wcOddsSnapshots.fetchedAt))
      .limit(100);
    return snapshots;
  }),

  /**
   * 获取赔率追踪矩阵：行=球队，列=快照时间
   * 返回最近N次快照的所有球队赔率，用于横向时间轴表格
   */
  getOddsMatrix: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(30) }))
    .query(async ({ input }) => {
      // 获取最近N次快照
      const snapshots = await db
        .select()
        .from(wcOddsSnapshots)
        .orderBy(desc(wcOddsSnapshots.fetchedAt))
        .limit(input.limit);

      if (snapshots.length === 0) {
        return { snapshots: [], teams: [], matrix: {} };
      }

      const snapshotIds = snapshots.map(s => s.id);

      // 获取这些快照的所有赔率记录
      const allRecords = await db
        .select()
        .from(wcOddsRecords)
        .where(
          snapshotIds.length === 1
            ? eq(wcOddsRecords.snapshotId, snapshotIds[0])
            : inArray(wcOddsRecords.snapshotId, snapshotIds)
        )
        .orderBy(asc(wcOddsRecords.rank));

      // 构建球队列表（按排名排序，取第一个快照的排名）
      const firstSnapshotId = snapshots[snapshots.length - 1].id; // 最早的快照
      const teamsFromFirst = allRecords
        .filter(r => r.snapshotId === firstSnapshotId)
        .sort((a, b) => a.rank - b.rank);

      // 如果第一个快照没有数据，用所有记录中出现的球队
      const teamNames = teamsFromFirst.length > 0
        ? teamsFromFirst.map(r => ({ name: r.teamName, code: r.teamCode || '' }))
        : [...new Map(allRecords.map(r => [r.teamName, { name: r.teamName, code: r.teamCode || '' }])).values()];

      // 构建矩阵: matrix[teamName][snapshotId] = { pinnacle, wh }
      const matrix: Record<string, Record<number, { pinnacle: string | null; wh: string | null; rank: number }>> = {};
      for (const record of allRecords) {
        if (!matrix[record.teamName]) matrix[record.teamName] = {};
        matrix[record.teamName][record.snapshotId] = {
          pinnacle: record.pinnacleOdds,
          wh: record.williamHillOdds,
          rank: record.rank,
        };
      }

      return {
        snapshots: snapshots.reverse(), // 时间正序（旧→新）
        teams: teamNames,
        matrix,
      };
    }),

  /**
   * 获取追踪统计信息
   */
  getStats: adminProcedure.query(async () => {
    const snapshots = await db
      .select()
      .from(wcOddsSnapshots)
      .orderBy(desc(wcOddsSnapshots.fetchedAt))
      .limit(1);

    const totalCount = await db
      .select()
      .from(wcOddsSnapshots);

    return {
      totalRuns: totalCount.length,
      lastFetchedAt: snapshots[0]?.fetchedAt || null,
      source: 'wc-2026.com',
      interval: '每4小时',
    };
  }),
});
