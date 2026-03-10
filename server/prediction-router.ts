import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb, getDbConnection } from "./db";
import { predictionEvents, userPredictions } from "../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";

// 自动建表（如果生产库还没执行 pnpm db:push）
async function ensurePredictionTables() {
  try {
    const conn = await getDbConnection();
    if (!conn) return;
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS prediction_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        polymarket_event_id VARCHAR(100) NOT NULL,
        polymarket_market_id VARCHAR(100) NOT NULL,
        coin ENUM('BTC','ETH') NOT NULL,
        question TEXT NOT NULL,
        description TEXT,
        outcomes JSON NOT NULL,
        outcome_prices JSON NOT NULL,
        volume VARCHAR(50),
        end_date TIMESTAMP NULL,
        image_url TEXT,
        active TINYINT NOT NULL DEFAULT 1,
        closed TINYINT NOT NULL DEFAULT 0,
        synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_market_id (polymarket_market_id),
        INDEX prediction_events_coin_idx (coin),
        INDEX prediction_events_market_idx (polymarket_market_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_predictions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ledger_id INT NOT NULL,
        user_id INT NOT NULL,
        event_id INT NOT NULL,
        selected_outcome VARCHAR(50) NOT NULL,
        selected_index INT NOT NULL,
        note TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_user_event_ledger (ledger_id, user_id, event_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('[prediction] Tables ensured');
  } catch (e) {
    console.error('[prediction] ensurePredictionTables error:', e);
  }
}

let tablesEnsured = false;
async function ensureOnce() {
  if (!tablesEnsured) {
    await ensurePredictionTables();
    tablesEnsured = true;
  }
}

// ============================================================
// Polymarket 数据获取（通过 Cloudflare Worker 代理）
// ============================================================

// Cloudflare Worker 代理 URL（新加坡/全球边缘节点，解决腾讯云无法访问境外 API 的问题）
// 部署后替换为实际的 Worker URL
const POLYMARKET_PROXY_URL = process.env.POLYMARKET_PROXY_URL || "https://polymarket-proxy.runyihongkong.workers.dev";

async function fetchPolymarketEvents(coin: "BTC" | "ETH"): Promise<any[]> {
  try {
    const url = `${POLYMARKET_PROXY_URL}/events?coin=${coin}&limit=30`;
    console.log(`[prediction] 请求代理: ${url}`);
    
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { "Accept": "application/json" },
    });
    
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Worker 代理返回 ${res.status}: ${text.substring(0, 200)}`);
    }
    
    const data = await res.json() as { events: any[]; count: number };
    console.log(`[prediction] ${coin} 获取到 ${data.count ?? data.events?.length ?? 0} 条数据`);
    return data.events || [];
  } catch (e) {
    console.error(`[prediction] fetchPolymarketEvents(${coin}) error:`, e);
    return [];
  }
}

// ============================================================
// tRPC Router
// ============================================================

export const predictionRouter = router({
  // 直接从 Polymarket 实时拉取数据（不存数据库，最简单可靠）
  syncPolymarket: protectedProcedure
    .input(z.object({ coin: z.enum(["BTC", "ETH"]) }))
    .mutation(async ({ input }) => {
      const events = await fetchPolymarketEvents(input.coin);
      return { synced: events.length, events };
    }),

  // 获取某个账本的竞猜事件列表（按 coin 分类）
  listEvents: protectedProcedure
    .input(
      z.object({
        ledgerId: z.number(),
        coin: z.enum(["BTC", "ETH"]),
        limit: z.number().default(20),
      })
    )
    .query(async ({ input }) => {
      // 直接实时从 Polymarket 拉取，不依赖数据库
      const events = await fetchPolymarketEvents(input.coin);
      const limited = events.slice(0, input.limit);
      return {
        events: limited.map((e, idx) => ({
          id: idx + 1,
          question: e.question,
          outcomes: e.outcomes,
          outcomePrices: e.outcomePrices,
          volume: e.volume,
          endDate: e.endDate,
          imageUrl: e.imageUrl,
          myPrediction: null, // 无数据库时不记录预测
        })),
      };
    }),

  // 提交/更新预测
  submitPrediction: protectedProcedure
    .input(
      z.object({
        ledgerId: z.number(),
        eventId: z.number(),
        selectedOutcome: z.string(),
        selectedIndex: z.number(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      // 检查是否已有预测
      const existing = await db
        .select({ id: userPredictions.id })
        .from(userPredictions)
        .where(
          and(
            eq(userPredictions.ledgerId, input.ledgerId),
            eq(userPredictions.userId, ctx.user.id),
            eq(userPredictions.eventId, input.eventId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // 更新
        await db
          .update(userPredictions)
          .set({
            selectedOutcome: input.selectedOutcome,
            selectedIndex: input.selectedIndex,
            note: input.note || null,
          })
          .where(eq(userPredictions.id, existing[0].id));
      } else {
        // 新建
        await db.insert(userPredictions).values({
          ledgerId: input.ledgerId,
          userId: ctx.user.id,
          eventId: input.eventId,
          selectedOutcome: input.selectedOutcome,
          selectedIndex: input.selectedIndex,
          note: input.note || null,
        });
      }

      return { success: true };
    }),

  // 获取账本内所有成员的预测统计（某个事件的投票分布）
  getEventStats: protectedProcedure
    .input(
      z.object({
        ledgerId: z.number(),
        eventId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      const predictions = await db
        .select({
          selectedOutcome: userPredictions.selectedOutcome,
          selectedIndex: userPredictions.selectedIndex,
        })
        .from(userPredictions)
        .where(
          and(
            eq(userPredictions.ledgerId, input.ledgerId),
            eq(userPredictions.eventId, input.eventId)
          )
        );

      // 统计各选项票数
      const stats: Record<string, number> = {};
      for (const p of predictions) {
        stats[p.selectedOutcome] = (stats[p.selectedOutcome] || 0) + 1;
      }

      return {
        total: predictions.length,
        distribution: stats,
      };
    }),
});
