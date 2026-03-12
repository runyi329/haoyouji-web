import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb, getDbConnection } from "./db";
import { predictionEvents, userPredictions } from "../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";

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
    // 行情评估可见性设置表
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS market_eval_visible (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ledger_id INT NOT NULL,
        question_hash VARCHAR(64) NOT NULL COMMENT 'SHA-256 hash of question text',
        question_text TEXT NOT NULL COMMENT 'Original question text for display',
        coin ENUM('BTC','ETH') NOT NULL,
        visible TINYINT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_ledger_question (ledger_id, question_hash),
        INDEX idx_ledger_visible (ledger_id, visible)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    // ★ 新增：Polymarket 数据缓存表（管理员手动刷新后存入，用户从此表读取）
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS polymarket_cache (
        id INT AUTO_INCREMENT PRIMARY KEY,
        coin ENUM('BTC','ETH') NOT NULL,
        question TEXT NOT NULL,
        question_hash VARCHAR(64) NOT NULL,
        question_zh TEXT NULL COMMENT 'AI翻译的中文标题',
        outcomes JSON NOT NULL,
        outcome_prices JSON NOT NULL,
        volume VARCHAR(50),
        end_date VARCHAR(50),
        image_url TEXT,
        refreshed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_coin_question (coin, question_hash)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    // ★ 自动迁移：如果旧表没有 question_zh 字段，自动添加
    try {
      await conn.execute(
        `ALTER TABLE polymarket_cache ADD COLUMN question_zh TEXT NULL COMMENT 'AI翻译的中文标题'`
      );
      console.log('[prediction] 自动迁移：已添加 question_zh 字段');
    } catch (alterErr: any) {
      // 字段已存在时会报错，忽略即可
      if (!alterErr.message?.includes('Duplicate column')) {
        // 非重复字段错误才记录
        console.log('[prediction] question_zh 字段已存在，跳过迁移');
      }
    }
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
// Polymarket 数据获取（直接请求 gamma-api，仅供管理员刷新时调用）
// ============================================================

const POLYMARKET_API = "https://gamma-api.polymarket.com";
const COIN_KEYWORDS: Record<string, string[]> = {
  BTC: ["bitcoin", "btc"],
  ETH: ["ethereum", "eth"],
};

async function fetchPolymarketEvents(coin: "BTC" | "ETH" | "SOL", limit = 30): Promise<any[]> {
  try {
    const url = `${POLYMARKET_API}/events?limit=50&active=true&closed=false&order=volume&ascending=false&tag_slug=crypto`;
    console.log(`[prediction] 直接请求 Polymarket API: ${url}`);

    const res = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; haoyouji-proxy/1.0)",
        "Accept": "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Polymarket API 返回 ${res.status}: ${text.substring(0, 200)}`);
    }

    const data = await res.json() as any[];
    const keywords = COIN_KEYWORDS[coin];
    const results: any[] = [];

    for (const event of data) {
      const title = (event.title || "").toLowerCase();
      const isMatch = keywords.some((kw: string) => title.includes(kw));
      if (!isMatch) continue;

      for (const market of event.markets || []) {
        if (market.closed) continue;

        let outcomes: string[], outcomePrices: string[];
        try {
          outcomes = typeof market.outcomes === "string" ? JSON.parse(market.outcomes) : market.outcomes || ["Yes", "No"];
          outcomePrices = typeof market.outcomePrices === "string" ? JSON.parse(market.outcomePrices) : market.outcomePrices || ["0.5", "0.5"];
        } catch {
          outcomes = ["Yes", "No"];
          outcomePrices = ["0.5", "0.5"];
        }

        results.push({
          question: market.question || event.title,
          outcomes,
          outcomePrices,
          volume: String(market.volume || "0"),
          endDate: market.endDate || event.endDate || null,
          imageUrl: market.image || market.icon || null,
        });

        if (results.length >= limit) break;
      }
      if (results.length >= limit) break;
    }

    console.log(`[prediction] ${coin} 获取到 ${results.length} 条数据`);
    return results;
  } catch (e) {
    console.error(`[prediction] fetchPolymarketEvents(${coin}) error:`, e);
    return [];
  }
}

// 简单的 hash 函数，用于生成 question 的唯一标识
async function hashQuestion(question: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(question).digest("hex");
}

// ============================================================
// 从数据库缓存读取事件（所有用户和管理员列表都走这里）
// ============================================================
async function getCachedEvents(coin: "BTC" | "ETH" | "SOL", conn: any): Promise<any[]> {
  const [rows] = await conn.execute(
    `SELECT question, question_zh, outcomes, outcome_prices, volume, end_date, image_url, refreshed_at
     FROM polymarket_cache WHERE coin = ? ORDER BY id ASC`,
    [coin]
  );
  return (rows as any[]).map((r: any) => ({
    question: r.question,
    questionZh: r.question_zh || null,
    outcomes: typeof r.outcomes === "string" ? JSON.parse(r.outcomes) : r.outcomes,
    outcomePrices: typeof r.outcome_prices === "string" ? JSON.parse(r.outcome_prices) : r.outcome_prices,
    volume: r.volume,
    endDate: r.end_date,
    imageUrl: r.image_url,
    refreshedAt: r.refreshed_at,
  }));
}

// AI 批量翻译 Polymarket 标题（异步后台执行，不阻塞响应）
async function translateQuestionsInBackground(coin: string, conn: any): Promise<void> {
  try {
    // 查找没有中文翻译的条目
    const [rows] = await conn.execute(
      `SELECT id, question FROM polymarket_cache WHERE coin = ? AND (question_zh IS NULL OR question_zh = '') ORDER BY id ASC`,
      [coin]
    );
    const untranslated = rows as any[];
    if (untranslated.length === 0) {
      console.log(`[prediction] 所有 ${coin} 条目已有中文翻译，跳过`);
      return;
    }
    console.log(`[prediction] 开始 AI 翻译 ${untranslated.length} 条 ${coin} 标题...`);

    // 批量翻译（一次请求翻译所有，减少 API 调用次数）
    const questions = untranslated.map((r: any, i: number) => `${i + 1}. ${r.question}`);
    const prompt = `你是专业的加密货币金融翻译专家。请将以下 Polymarket 预测市场的英文问题翻译成准确、自然的中文。

翻译要求：
- 保留专有名词（公司名、代币名等）的英文，如 MicroStrategy、Bitcoin、BTC、ETH、SOL
- 金额保留美元符号，如 $150k 翻译为「15万美元」
- 日期格式："by December 31, 2026" 翻译为「在2026年12月31日前」
- 语气自然，符合中文习惯
- 只返回翻译结果，格式：序号. 中文翻译（每行一条）

英文原文：
${questions.join('\n')}`;

    const response = await invokeLLM({
      messages: [
        { role: 'system', content: '你是专业的加密货币金融翻译专家，只返回翻译结果，不添加任何解释。' },
        { role: 'user', content: prompt },
      ],
    });

    const content = response?.choices?.[0]?.message?.content || '';
    const lines = content.split('\n').filter((l: string) => l.trim());

    // 解析翻译结果并写入数据库
    for (let i = 0; i < untranslated.length; i++) {
      const line = lines[i] || '';
      // 去掉序号前缀，如 "1. " 或 "①"
      const translated = line.replace(/^\d+\.\s*/, '').replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '').trim();
      if (translated) {
        await conn.execute(
          `UPDATE polymarket_cache SET question_zh = ? WHERE id = ?`,
          [translated, untranslated[i].id]
        );
      }
    }
    console.log(`[prediction] AI 翻译完成: ${coin} ${untranslated.length} 条`);
  } catch (e) {
    console.error('[prediction] translateQuestionsInBackground error:', e);
  }
}

// ============================================================
// tRPC Router
// ============================================================

export const predictionRouter = router({
  // ★ 管理员：刷新 Polymarket 缓存（需要有网络的环境下调用）
  refreshCache: protectedProcedure
    .input(z.object({ coin: z.enum(["BTC", "ETH", "SOL"]) }))
    .mutation(async ({ input }) => {
      await ensureOnce();
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");

      // 从 Polymarket 拉取最新数据
      const events = await fetchPolymarketEvents(input.coin);
      if (events.length === 0) {
        throw new Error("无法从 Polymarket 获取数据，请确保网络可访问（建议使用手机5G网络）");
      }

      // 写入数据库缓存（UPSERT）
      for (const e of events) {
        const qHash = await hashQuestion(e.question);
        await conn.execute(
          `INSERT INTO polymarket_cache (coin, question, question_hash, outcomes, outcome_prices, volume, end_date, image_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             outcomes = VALUES(outcomes),
             outcome_prices = VALUES(outcome_prices),
             volume = VALUES(volume),
             end_date = VALUES(end_date),
             image_url = VALUES(image_url),
             refreshed_at = CURRENT_TIMESTAMP`,
          [
            input.coin,
            e.question,
            qHash,
            JSON.stringify(e.outcomes),
            JSON.stringify(e.outcomePrices),
            e.volume || null,
            e.endDate || null,
            e.imageUrl || null,
          ]
        );
      }

      console.log(`[prediction] 缓存刷新完成: ${input.coin} ${events.length} 条`);
      return { synced: events.length, coin: input.coin };
    }),

  // ★ 前端直接传入事件数据存入数据库（前端直接请求Worker，再通过此接口存入数据库）
  saveCache: protectedProcedure
    .input(z.object({
      coin: z.enum(["BTC", "ETH", "SOL"]),
      events: z.array(z.object({
        question: z.string(),
        outcomes: z.array(z.string()),
        outcomePrices: z.array(z.string()),
        volume: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      await ensureOnce();
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");

      if (input.events.length === 0) {
        throw new Error("事件列表为空");
      }

      // 写入数据库缓存（UPSERT）
      for (const e of input.events) {
        const qHash = await hashQuestion(e.question);
        await conn.execute(
          `INSERT INTO polymarket_cache (coin, question, question_hash, outcomes, outcome_prices, volume, end_date, image_url)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             outcomes = VALUES(outcomes),
             outcome_prices = VALUES(outcome_prices),
             volume = VALUES(volume),
             end_date = VALUES(end_date),
             image_url = VALUES(image_url),
             refreshed_at = CURRENT_TIMESTAMP`,
          [
            input.coin,
            e.question,
            qHash,
            JSON.stringify(e.outcomes),
            JSON.stringify(e.outcomePrices),
            e.volume || null,
            e.endDate || null,
            e.imageUrl || null,
          ]
        );
      }

      console.log(`[prediction] 前端存入缓存完成: ${input.coin} ${input.events.length} 条`);
      // 异步后台翻译（不阻塞响应）
      translateQuestionsInBackground(input.coin, conn).catch(e =>
        console.error('[prediction] 后台翻译失败:', e)
      );
      return { synced: input.events.length, coin: input.coin };
    }),

  // ★ 查询缓存最后更新时间
  getCacheStatus: protectedProcedure
    .input(z.object({ coin: z.enum(["BTC", "ETH", "SOL"]) }))
    .query(async ({ input }) => {
      await ensureOnce();
      const conn = await getDbConnection();
      if (!conn) return { count: 0, lastRefreshed: null };
      const [rows] = await conn.execute(
        `SELECT COUNT(*) as cnt, MAX(refreshed_at) as last_refreshed FROM polymarket_cache WHERE coin = ?`,
        [input.coin]
      );
      const row = (rows as any[])[0];
      return {
        count: row?.cnt ?? 0,
        lastRefreshed: row?.last_refreshed ?? null,
      };
    }),

  // 获取某个账本的竞猜事件列表（从数据库缓存读取）
  listEvents: protectedProcedure
    .input(
      z.object({
        ledgerId: z.number(),
        coin: z.enum(["BTC", "ETH", "SOL"]),
        limit: z.number().default(20),
      })
    )
    .query(async ({ input }) => {
      await ensureOnce();
      const conn = await getDbConnection();
      if (!conn) return { events: [] };

      const cached = await getCachedEvents(input.coin, conn);
      const limited = cached.slice(0, input.limit);

      return {
        events: limited.map((e, idx) => ({
          id: idx + 1,
          question: e.question,
          outcomes: e.outcomes,
          outcomePrices: e.outcomePrices,
          volume: e.volume,
          endDate: e.endDate,
          imageUrl: e.imageUrl || null,
          myPrediction: null,
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
        await db
          .update(userPredictions)
          .set({
            selectedOutcome: input.selectedOutcome,
            selectedIndex: input.selectedIndex,
            note: input.note || null,
          })
          .where(eq(userPredictions.id, existing[0].id));
      } else {
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

      const stats: Record<string, number> = {};
      for (const p of predictions) {
        stats[p.selectedOutcome] = (stats[p.selectedOutcome] || 0) + 1;
      }

      return {
        total: predictions.length,
        distribution: stats,
      };
    }),

  // ============================================================
  // 行情评估设置 API（管理员控制哪些事件对用户可见）
  // ============================================================

  // 获取已勾选为可见的事件 question 列表（供前端过滤用）
  getVisibleQuestions: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      coin: z.enum(["BTC", "ETH", "SOL"]),
    }))
    .query(async ({ input }) => {
      await ensureOnce();
      const conn = await getDbConnection();
      if (!conn) return { visibleQuestions: [] };
      const [rows] = await conn.execute(
        `SELECT question_text FROM market_eval_visible WHERE ledger_id = ? AND coin = ? AND visible = 1`,
        [input.ledgerId, input.coin]
      );
      const questions = (rows as any[]).map((r: any) => r.question_text);
      return { visibleQuestions: questions };
    }),

  // 管理员：获取所有事件（含勾选状态，从数据库缓存读取）
  listEventsForAdmin: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      coin: z.enum(["BTC", "ETH", "SOL"]),
    }))
    .query(async ({ input }) => {
      await ensureOnce();
      const conn = await getDbConnection();
      if (!conn) return { events: [], cacheEmpty: true };

      // 从缓存读取事件
      const cached = await getCachedEvents(input.coin, conn);

      // 查询可见性设置
      const [visRows] = await conn.execute(
        `SELECT question_text, visible FROM market_eval_visible WHERE ledger_id = ? AND coin = ?`,
        [input.ledgerId, input.coin]
      );
      const visibilityMap = new Map<string, boolean>();
      for (const r of visRows as any[]) {
        visibilityMap.set(r.question_text, r.visible === 1);
      }

      return {
        events: cached.map((e: any, idx: number) => ({
          id: idx + 1,
          question: e.question,
          questionZh: e.questionZh || null,
          outcomes: e.outcomes || [],
          outcomePrices: e.outcomePrices || [],
          volume: e.volume || null,
          endDate: e.endDate || null,
          imageUrl: e.imageUrl || null,
          refreshedAt: e.refreshedAt || null,
          visible: visibilityMap.get(e.question) ?? false,
        })),
        cacheEmpty: cached.length === 0,
      };
    }),

  // 管理员：设置事件可见性
  setEventVisibility: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      coin: z.enum(["BTC", "ETH", "SOL"]),
      question: z.string(),
      visible: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      await ensureOnce();
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");

      const qHash = await hashQuestion(input.question);

      await conn.execute(
        `INSERT INTO market_eval_visible (ledger_id, question_hash, question_text, coin, visible)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE visible = VALUES(visible), question_text = VALUES(question_text), updated_at = CURRENT_TIMESTAMP`,
        [input.ledgerId, qHash, input.question, input.coin, input.visible ? 1 : 0]
      );

      return { success: true };
    }),
});
