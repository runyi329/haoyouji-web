import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { getDb, getDbConnection } from "./db";
import { predictionEvents, userPredictions } from "../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { invokeLLM } from "./_core/llm";

// ============================================================
// 自动建表 & 迁移
// ============================================================
async function ensurePredictionTables() {
  try {
    const conn = await getDbConnection();
    if (!conn) return;

    // 原有表保留
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

    // ★ 新版：事件组表（一个事件对应多个价格档位）
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS polymarket_event_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        coin ENUM('BTC','ETH','SOL') NOT NULL,
        event_title TEXT NOT NULL,
        event_title_zh TEXT NULL COMMENT 'AI翻译的中文事件标题',
        event_title_hash VARCHAR(64) NOT NULL,
        image_url TEXT,
        refreshed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_coin_event (coin, event_title_hash)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ★ 新版：每个价格档位（market）存储在 polymarket_cache，关联 event_group_id
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS polymarket_cache (
        id INT AUTO_INCREMENT PRIMARY KEY,
        coin ENUM('BTC','ETH','SOL') NOT NULL,
        event_group_id INT NULL COMMENT '关联 polymarket_event_groups.id',
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

    // 自动迁移：旧表可能缺少 event_group_id 字段
    try {
      await conn.execute(
        `ALTER TABLE polymarket_cache ADD COLUMN event_group_id INT NULL COMMENT '关联 polymarket_event_groups.id'`
      );
      console.log('[prediction] 自动迁移：已添加 event_group_id 字段');
    } catch (_) {
      // 字段已存在，忽略
    }
    // 自动迁移：旧表可能缺少 question_zh 字段
    try {
      await conn.execute(
        `ALTER TABLE polymarket_cache ADD COLUMN question_zh TEXT NULL COMMENT 'AI翻译的中文标题'`
      );
      console.log('[prediction] 自动迁移：已添加 question_zh 字段');
    } catch (_) {
      // 字段已存在，忽略
    }

    // 可见性设置表迁移：支持按 event_group_id 设置可见性
    try {
      await conn.execute(
        `ALTER TABLE market_eval_visible ADD COLUMN event_group_id INT NULL COMMENT '关联事件组ID'`
      );
    } catch (_) {}

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
// Hash 工具
// ============================================================
async function hashText(text: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(text).digest("hex");
}

// ============================================================
// 从数据库读取事件组（含所有档位）
// ============================================================
async function getCachedEventGroups(coin: "BTC" | "ETH" | "SOL", conn: any): Promise<any[]> {
  // 读取事件组
  const [groupRows] = await conn.execute(
    `SELECT id, event_title, event_title_zh, image_url, refreshed_at
     FROM polymarket_event_groups WHERE coin = ? ORDER BY id ASC`,
    [coin]
  );
  const groups = groupRows as any[];

  if (groups.length === 0) {
    // 兼容旧数据：如果没有事件组，返回旧格式（event_group_id IS NULL）
    const [oldRows] = await conn.execute(
      `SELECT id, question, question_zh, outcomes, outcome_prices, volume, end_date, image_url, refreshed_at
       FROM polymarket_cache WHERE coin = ? AND (event_group_id IS NULL) ORDER BY id ASC`,
      [coin]
    );
    return (oldRows as any[]).map((r: any) => ({
      groupId: null,
      eventTitle: r.question,
      eventTitleZh: r.question_zh || null,
      imageUrl: r.image_url,
      refreshedAt: r.refreshed_at,
      markets: [{
        id: r.id,
        question: r.question,
        questionZh: r.question_zh || null,
        outcomes: typeof r.outcomes === "string" ? JSON.parse(r.outcomes) : r.outcomes,
        outcomePrices: typeof r.outcome_prices === "string" ? JSON.parse(r.outcome_prices) : r.outcome_prices,
        volume: r.volume,
        endDate: r.end_date,
      }],
    }));
  }

  // 读取所有档位
  const groupIds = groups.map((g: any) => g.id);
  const placeholders = groupIds.map(() => '?').join(',');
  const [marketRows] = await conn.execute(
    `SELECT id, event_group_id, question, question_zh, outcomes, outcome_prices, volume, end_date
     FROM polymarket_cache WHERE event_group_id IN (${placeholders}) ORDER BY event_group_id ASC, id ASC`,
    groupIds
  );
  const markets = marketRows as any[];

  // 按 event_group_id 分组
  const marketsByGroup: Record<number, any[]> = {};
  for (const m of markets) {
    const gid = m.event_group_id;
    if (!marketsByGroup[gid]) marketsByGroup[gid] = [];
    marketsByGroup[gid].push({
      id: m.id,
      question: m.question,
      questionZh: m.question_zh || null,
      outcomes: typeof m.outcomes === "string" ? JSON.parse(m.outcomes) : m.outcomes,
      outcomePrices: typeof m.outcome_prices === "string" ? JSON.parse(m.outcome_prices) : m.outcome_prices,
      volume: m.volume,
      endDate: m.end_date,
    });
  }

  return groups.map((g: any) => ({
    groupId: g.id,
    eventTitle: g.event_title,
    eventTitleZh: g.event_title_zh || null,
    imageUrl: g.image_url,
    refreshedAt: g.refreshed_at,
    markets: marketsByGroup[g.id] || [],
  }));
}

// ============================================================
// AI 批量翻译（事件组标题 + 档位标题）
// ============================================================
async function translateInBackground(coin: string, conn: any): Promise<void> {
  try {
    // 翻译事件组标题
    const [groupRows] = await conn.execute(
      `SELECT id, event_title FROM polymarket_event_groups WHERE coin = ? AND (event_title_zh IS NULL OR event_title_zh = '') ORDER BY id ASC`,
      [coin]
    );
    const untranslatedGroups = groupRows as any[];

    // 翻译档位标题
    const [marketRows] = await conn.execute(
      `SELECT id, question FROM polymarket_cache WHERE coin = ? AND (question_zh IS NULL OR question_zh = '') ORDER BY id ASC`,
      [coin]
    );
    const untranslatedMarkets = marketRows as any[];

    const allTexts = [
      ...untranslatedGroups.map((r: any) => r.event_title),
      ...untranslatedMarkets.map((r: any) => r.question),
    ];

    if (allTexts.length === 0) {
      console.log(`[prediction] 所有 ${coin} 条目已有中文翻译，跳过`);
      return;
    }

    console.log(`[prediction] 开始 AI 翻译 ${allTexts.length} 条 ${coin} 标题...`);

    const numbered = allTexts.map((t, i) => `${i + 1}. ${t}`);
    const prompt = `你是专业的加密货币金融翻译专家。请将以下 Polymarket 预测市场的英文标题翻译成准确、自然的中文。

翻译要求：
- 保留专有名词（公司名、代币名等）的英文，如 MicroStrategy、Bitcoin、BTC、ETH、SOL
- 金额保留美元符号，如 $150k 翻译为「15万美元」，$3,600 翻译为「3600美元」
- 日期格式："by December 31, 2026" 翻译为「在2026年12月31日前」，"in March" 翻译为「3月」
- 价格问题："Will Ethereum reach $3,600 in March?" 翻译为「ETH 3月能否触及3600美元？」
- 语气自然，符合中文习惯
- 只返回翻译结果，格式：序号. 中文翻译（每行一条）

英文原文：
${numbered.join('\n')}`;

    const response = await invokeLLM({
      messages: [
        { role: 'system', content: '你是专业的加密货币金融翻译专家，只返回翻译结果，不添加任何解释。' },
        { role: 'user', content: prompt },
      ],
    });

    const content = response?.choices?.[0]?.message?.content || '';
    const lines = content.split('\n').filter((l: string) => l.trim());

    let lineIdx = 0;
    // 写入事件组翻译
    for (const group of untranslatedGroups) {
      const line = lines[lineIdx++] || '';
      const translated = line.replace(/^\d+\.\s*/, '').replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '').trim();
      if (translated) {
        await conn.execute(
          `UPDATE polymarket_event_groups SET event_title_zh = ? WHERE id = ?`,
          [translated, group.id]
        );
      }
    }
    // 写入档位翻译
    for (const market of untranslatedMarkets) {
      const line = lines[lineIdx++] || '';
      const translated = line.replace(/^\d+\.\s*/, '').replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '').trim();
      if (translated) {
        await conn.execute(
          `UPDATE polymarket_cache SET question_zh = ? WHERE id = ?`,
          [translated, market.id]
        );
      }
    }
    console.log(`[prediction] AI 翻译完成: ${coin} ${allTexts.length} 条`);
  } catch (e) {
    console.error('[prediction] translateInBackground error:', e);
  }
}

// ============================================================
// tRPC Router
// ============================================================
export const predictionRouter = router({

  // ★ 前端直接传入事件数据（按事件组结构）存入数据库
  saveCache: protectedProcedure
    .input(z.object({
      coin: z.enum(["BTC", "ETH", "SOL"]),
      // 新格式：事件组
      eventGroups: z.array(z.object({
        eventTitle: z.string(),
        imageUrl: z.string().nullable().optional(),
        markets: z.array(z.object({
          question: z.string(),
          outcomes: z.array(z.string()),
          outcomePrices: z.array(z.string()),
          volume: z.string().nullable().optional(),
          endDate: z.string().nullable().optional(),
          imageUrl: z.string().nullable().optional(),
        })),
      })).optional(),
      // 旧格式兼容（扁平列表）
      events: z.array(z.object({
        question: z.string(),
        outcomes: z.array(z.string()),
        outcomePrices: z.array(z.string()),
        volume: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        imageUrl: z.string().nullable().optional(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      await ensureOnce();
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");

      let totalMarkets = 0;

      if (input.eventGroups && input.eventGroups.length > 0) {
        // 新格式：按事件组存储
        for (const group of input.eventGroups) {
          const titleHash = await hashText(group.eventTitle);

          // UPSERT 事件组
          await conn.execute(
            `INSERT INTO polymarket_event_groups (coin, event_title, event_title_hash, image_url)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               event_title = VALUES(event_title),
               image_url = VALUES(image_url),
               refreshed_at = CURRENT_TIMESTAMP`,
            [input.coin, group.eventTitle, titleHash, group.imageUrl || null]
          );

          // 获取 event_group_id
          const [gRows] = await conn.execute(
            `SELECT id FROM polymarket_event_groups WHERE coin = ? AND event_title_hash = ?`,
            [input.coin, titleHash]
          );
          const groupId = (gRows as any[])[0]?.id;
          if (!groupId) continue;

          // UPSERT 每个档位
          for (const m of group.markets) {
            const qHash = await hashText(m.question);
            await conn.execute(
              `INSERT INTO polymarket_cache (coin, event_group_id, question, question_hash, outcomes, outcome_prices, volume, end_date, image_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 event_group_id = VALUES(event_group_id),
                 outcomes = VALUES(outcomes),
                 outcome_prices = VALUES(outcome_prices),
                 volume = VALUES(volume),
                 end_date = VALUES(end_date),
                 image_url = VALUES(image_url),
                 refreshed_at = CURRENT_TIMESTAMP`,
              [
                input.coin, groupId, m.question, qHash,
                JSON.stringify(m.outcomes), JSON.stringify(m.outcomePrices),
                m.volume || null, m.endDate || null, m.imageUrl || null,
              ]
            );
            totalMarkets++;
          }
        }
      } else if (input.events && input.events.length > 0) {
        // 旧格式兼容：扁平存储（event_group_id = NULL）
        for (const e of input.events) {
          const qHash = await hashText(e.question);
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
              input.coin, e.question, qHash,
              JSON.stringify(e.outcomes), JSON.stringify(e.outcomePrices),
              e.volume || null, e.endDate || null, e.imageUrl || null,
            ]
          );
          totalMarkets++;
        }
      } else {
        throw new Error("事件列表为空");
      }

      console.log(`[prediction] 存入缓存完成: ${input.coin} ${totalMarkets} 个档位`);
      // 异步后台翻译
      translateInBackground(input.coin, conn).catch(e =>
        console.error('[prediction] 后台翻译失败:', e)
      );
      return { synced: totalMarkets, coin: input.coin };
    }),

  // ★ 查询缓存状态
  getCacheStatus: protectedProcedure
    .input(z.object({ coin: z.enum(["BTC", "ETH", "SOL"]) }))
    .query(async ({ input }) => {
      await ensureOnce();
      const conn = await getDbConnection();
      if (!conn) return { count: 0, groupCount: 0, lastRefreshed: null };

      const [groupRows] = await conn.execute(
        `SELECT COUNT(*) as cnt, MAX(refreshed_at) as last_refreshed FROM polymarket_event_groups WHERE coin = ?`,
        [input.coin]
      );
      const [marketRows] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM polymarket_cache WHERE coin = ?`,
        [input.coin]
      );
      const gRow = (groupRows as any[])[0];
      const mRow = (marketRows as any[])[0];

      // 翻译进度
      const [zhGroupRows] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM polymarket_event_groups WHERE coin = ? AND (event_title_zh IS NULL OR event_title_zh = '')`,
        [input.coin]
      );
      const [zhMarketRows] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM polymarket_cache WHERE coin = ? AND (question_zh IS NULL OR question_zh = '')`,
        [input.coin]
      );
      const untranslatedCount = ((zhGroupRows as any[])[0]?.cnt ?? 0) + ((zhMarketRows as any[])[0]?.cnt ?? 0);
      const totalCount = (gRow?.cnt ?? 0) + (mRow?.cnt ?? 0);

      return {
        groupCount: gRow?.cnt ?? 0,
        count: mRow?.cnt ?? 0,
        lastRefreshed: gRow?.last_refreshed ?? null,
        untranslated: untranslatedCount,
        totalForTranslation: totalCount,
      };
    }),

  // 获取某个账本的竞猜事件列表（从数据库缓存读取，按事件组）
  listEvents: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      coin: z.enum(["BTC", "ETH", "SOL"]),
      limit: z.number().default(20),
    }))
    .query(async ({ input }) => {
      await ensureOnce();
      const conn = await getDbConnection();
      if (!conn) return { eventGroups: [] };

      const groups = await getCachedEventGroups(input.coin, conn);
      return { eventGroups: groups.slice(0, input.limit) };
    }),

  // 提交/更新预测
  submitPrediction: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      eventId: z.number(),
      selectedOutcome: z.string(),
      selectedIndex: z.number(),
      note: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const existing = await db
        .select({ id: userPredictions.id })
        .from(userPredictions)
        .where(and(
          eq(userPredictions.ledgerId, input.ledgerId),
          eq(userPredictions.userId, ctx.user.id),
          eq(userPredictions.eventId, input.eventId)
        ))
        .limit(1);

      if (existing.length > 0) {
        await db.update(userPredictions).set({
          selectedOutcome: input.selectedOutcome,
          selectedIndex: input.selectedIndex,
          note: input.note || null,
        }).where(eq(userPredictions.id, existing[0].id));
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

  // 获取事件统计
  getEventStats: protectedProcedure
    .input(z.object({ ledgerId: z.number(), eventId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const predictions = await db
        .select({ selectedOutcome: userPredictions.selectedOutcome, selectedIndex: userPredictions.selectedIndex })
        .from(userPredictions)
        .where(and(eq(userPredictions.ledgerId, input.ledgerId), eq(userPredictions.eventId, input.eventId)));
      const stats: Record<string, number> = {};
      for (const p of predictions) {
        stats[p.selectedOutcome] = (stats[p.selectedOutcome] || 0) + 1;
      }
      return { total: predictions.length, distribution: stats };
    }),

  // ============================================================
  // 行情评估设置 API
  // ============================================================

  // 获取已勾选为可见的事件组 ID 列表
  getVisibleQuestions: protectedProcedure
    .input(z.object({ ledgerId: z.number(), coin: z.enum(["BTC", "ETH", "SOL"]) }))
    .query(async ({ input }) => {
      await ensureOnce();
      const conn = await getDbConnection();
      if (!conn) return { visibleQuestions: [], visibleGroupIds: [] };
      const [rows] = await conn.execute(
        `SELECT question_text, event_group_id FROM market_eval_visible WHERE ledger_id = ? AND coin = ? AND visible = 1`,
        [input.ledgerId, input.coin]
      );
      return {
        visibleQuestions: (rows as any[]).map((r: any) => r.question_text),
        visibleGroupIds: (rows as any[]).filter((r: any) => r.event_group_id).map((r: any) => r.event_group_id),
      };
    }),

  // 管理员：获取所有事件组（含可见性）
  listEventsForAdmin: protectedProcedure
    .input(z.object({ ledgerId: z.number(), coin: z.enum(["BTC", "ETH", "SOL"]) }))
    .query(async ({ input }) => {
      await ensureOnce();
      const conn = await getDbConnection();
      if (!conn) return { eventGroups: [], cacheEmpty: true };

      const groups = await getCachedEventGroups(input.coin, conn);

      // 查询可见性（按事件组ID）
      const [visRows] = await conn.execute(
        `SELECT question_text, event_group_id, visible FROM market_eval_visible WHERE ledger_id = ? AND coin = ?`,
        [input.ledgerId, input.coin]
      );
      const visibilityByGroupId = new Map<number, boolean>();
      const visibilityByQuestion = new Map<string, boolean>();
      for (const r of visRows as any[]) {
        if (r.event_group_id) visibilityByGroupId.set(r.event_group_id, r.visible === 1);
        if (r.question_text) visibilityByQuestion.set(r.question_text, r.visible === 1);
      }

      return {
        eventGroups: groups.map((g, idx) => ({
          groupId: g.groupId,
          idx: idx + 1,
          eventTitle: g.eventTitle,
          eventTitleZh: g.eventTitleZh || null,
          imageUrl: g.imageUrl,
          refreshedAt: g.refreshedAt,
          visible: g.groupId
            ? (visibilityByGroupId.get(g.groupId) ?? false)
            : (visibilityByQuestion.get(g.eventTitle) ?? false),
          markets: g.markets,
        })),
        cacheEmpty: groups.length === 0,
      };
    }),

  // 管理员：设置事件组可见性
  setEventVisibility: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      coin: z.enum(["BTC", "ETH", "SOL"]),
      question: z.string(),
      visible: z.boolean(),
      eventGroupId: z.number().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      await ensureOnce();
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");

      const qHash = await hashText(input.question);

      await conn.execute(
        `INSERT INTO market_eval_visible (ledger_id, question_hash, question_text, coin, visible, event_group_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE visible = VALUES(visible), question_text = VALUES(question_text), event_group_id = VALUES(event_group_id), updated_at = CURRENT_TIMESTAMP`,
        [input.ledgerId, qHash, input.question, input.coin, input.visible ? 1 : 0, input.eventGroupId || null]
      );

      return { success: true };
    }),

  // 保留旧接口兼容（refreshCache）
  refreshCache: protectedProcedure
    .input(z.object({ coin: z.enum(["BTC", "ETH", "SOL"]) }))
    .mutation(async ({ input }) => {
      return { synced: 0, coin: input.coin, message: "请使用前端刷新功能（5G网络）" };
    }),
});
