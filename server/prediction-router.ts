import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { predictionEvents, userPredictions } from "../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";

// ============================================================
// Polymarket 数据同步
// ============================================================

const POLYMARKET_API = "https://gamma-api.polymarket.com";

// BTC 和 ETH 的关键词过滤
const COIN_KEYWORDS: Record<string, string[]> = {
  BTC: ["bitcoin", "btc"],
  ETH: ["ethereum", "eth"],
};

async function fetchPolymarketEvents(coin: "BTC" | "ETH"): Promise<any[]> {
  const keywords = COIN_KEYWORDS[coin];
  const results: any[] = [];

  try {
    // 拉取 crypto 分类下最热门的 50 个活跃事件
    const res = await fetch(
      `${POLYMARKET_API}/events?limit=50&active=true&closed=false&order=volume&ascending=false&tag_slug=crypto`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`);
    const data: any[] = await res.json();

    for (const event of data) {
      const title = (event.title || "").toLowerCase();
      const isMatch = keywords.some((kw) => title.includes(kw));
      if (!isMatch) continue;

      // 每个 event 下可能有多个 market（如多个价格区间）
      for (const market of event.markets || []) {
        if (market.closed) continue;
        results.push({
          polymarketEventId: String(event.id),
          polymarketMarketId: String(market.id),
          coin,
          question: market.question || event.title,
          description: market.description || "",
          outcomes: JSON.parse(market.outcomes || '["Yes","No"]'),
          outcomePrices: JSON.parse(market.outcomePrices || '["0.5","0.5"]'),
          volume: String(market.volume || "0"),
          endDate: market.endDate || event.endDate,
          imageUrl: market.image || market.icon || null,
          active: 1,
          closed: 0,
        });
      }
    }
  } catch (e) {
    console.error(`[prediction] fetchPolymarketEvents(${coin}) error:`, e);
  }

  return results;
}

// ============================================================
// tRPC Router
// ============================================================

export const predictionRouter = router({
  // 同步 Polymarket 数据（管理员调用，或定时触发）
  syncPolymarket: protectedProcedure
    .input(z.object({ coin: z.enum(["BTC", "ETH"]) }))
    .mutation(async ({ input }) => {
      const events = await fetchPolymarketEvents(input.coin);
      if (!events.length) return { synced: 0 };

      const db = await getDb();
      let synced = 0;
      for (const ev of events) {
        // 用 polymarketMarketId 做 upsert
        const existing = await db
          .select({ id: predictionEvents.id })
          .from(predictionEvents)
          .where(eq(predictionEvents.polymarketMarketId, ev.polymarketMarketId))
          .limit(1);

        if (existing.length > 0) {
          // 更新价格和状态
          await db
            .update(predictionEvents)
            .set({
              outcomePrices: ev.outcomePrices,
              volume: ev.volume,
              active: ev.active,
              closed: ev.closed,
              syncedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
            })
            .where(eq(predictionEvents.polymarketMarketId, ev.polymarketMarketId));
        } else {
          await db.insert(predictionEvents).values({
            ...ev,
            syncedAt: new Date().toISOString().slice(0, 19).replace("T", " "),
          });
        }
        synced++;
      }

      return { synced };
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
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      // 获取事件列表
      const events = await db
        .select()
        .from(predictionEvents)
        .where(
          and(
            eq(predictionEvents.coin, input.coin),
            eq(predictionEvents.active, 1),
            eq(predictionEvents.closed, 0)
          )
        )
        .orderBy(desc(predictionEvents.syncedAt))
        .limit(input.limit);

      if (!events.length) return { events: [] };

      // 获取当前用户在这些事件上的预测
      const eventIds = events.map((e) => e.id);
      const myPredictions = await db
        .select()
        .from(userPredictions)
        .where(
          and(
            eq(userPredictions.ledgerId, input.ledgerId),
            eq(userPredictions.userId, ctx.user.id),
            inArray(userPredictions.eventId, eventIds)
          )
        );

      const predictionMap = new Map(myPredictions.map((p) => [p.eventId, p]));

      return {
        events: events.map((e) => ({
          ...e,
          myPrediction: predictionMap.get(e.id) || null,
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
