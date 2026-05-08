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
      featureKey: 'prediction_analysis',
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

  // ============================================================
  // 竞猜下单：扣除账本余额 + 写入 crypto_bets
  // ============================================================
  placeBet: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      coin: z.string(),
      direction: z.enum(["up", "down"]),
      rangeIndex: z.number().min(0).max(11),
      rangeLabel: z.string(),
      betAmount: z.number().positive(),
      odds: z.number().positive(),
      expectedReturn: z.number().positive(),
      houseEdge: z.number(),
      probability: z.number(),
      targetDate: z.string(), // YYYY-MM-DD
    }))
    .mutation(async ({ input, ctx }) => {
      await ensureOnce();
      const conn = await getDbConnection();
      if (!conn) throw new Error("数据库连接失败");

      // 确保 crypto_bets 表存在
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS crypto_bets (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ledger_id INT NOT NULL,
          user_id INT NOT NULL,
          coin VARCHAR(10) NOT NULL,
          direction VARCHAR(10) NOT NULL,
          range_index INT NOT NULL,
          range_label VARCHAR(20) NOT NULL,
          bet_amount DECIMAL(20,8) NOT NULL,
          odds DECIMAL(10,4) NOT NULL,
          expected_return DECIMAL(20,8) NOT NULL,
          house_edge DECIMAL(5,4) NOT NULL,
          probability DECIMAL(10,6) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          settled_at TIMESTAMP NULL,
          actual_change_pct DECIMAL(10,4) NULL,
          settle_note TEXT NULL,
          target_date VARCHAR(10) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX crypto_bets_ledger_idx (ledger_id),
          INDEX crypto_bets_user_idx (user_id),
          INDEX crypto_bets_status_idx (status),
          INDEX crypto_bets_target_date_idx (target_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      const userId = ctx.user.id;
      const { ledgerId, coin, direction, rangeIndex, rangeLabel, betAmount, odds, expectedReturn, houseEdge, probability, targetDate } = input;

      // 生成6位订单编号（数字+大写字母）
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const orderNo = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

      // 1. 查询账本余额
      const { getUserBalance, addUserBalance } = await import("./db-recharge");
      const balance = await getUserBalance(userId, ledgerId);

      // 2. 查询今日已下注总额（同一账本同一目标日期）
      const [todayBets] = await conn.execute(
        `SELECT COALESCE(SUM(bet_amount), 0) as total FROM crypto_bets WHERE user_id = ? AND ledger_id = ? AND target_date = ? AND status != 'cancelled'`,
        [userId, ledgerId, targetDate]
      ) as any;
      const todayTotal = parseFloat((todayBets as any[])[0]?.total || '0');

      // 3. 余额检查
      if (balance < betAmount) {
        throw new Error(`余额不足，当前余额 ${balance.toFixed(2)} U，需要 ${betAmount.toFixed(2)} U`);
      }

      // 备注格式：委托买入 比特币 4-18 涨幅 编号XXXXXX
      const dirLabel = direction === 'up' ? '涨幅' : '跌幅';
      const coinFullName = coin === 'BTC' ? '比特币' : coin === 'ETH' ? '以太坊' : coin;
      // 日期简写：去掉年份，去掉前导零，如 2026-04-18 → 4-18
      const shortDate = targetDate.replace(/^\d{4}-0?(\d+)-0?(\d+)$/, '$1-$2');
      const betNote = `委托买入 ${coinFullName} ${shortDate} ${dirLabel} 编号${orderNo}`;

      // 4. 扣除余额：写入 af_manual_balances（负数），使账户明细可见，且余额计算自动扣除
      await conn.execute(
        `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [ledgerId, userId, -betAmount, betNote]
      );

      // 5. 写入竞猜订单（含 order_no）
      const [result] = await conn.execute(
        `INSERT INTO crypto_bets (order_no, ledger_id, user_id, coin, direction, range_index, range_label, bet_amount, odds, expected_return, house_edge, probability, target_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderNo, ledgerId, userId, coin, direction, rangeIndex, rangeLabel, betAmount, odds, expectedReturn, houseEdge, probability, targetDate]
      ) as any;

      // 6. YJH 返佣：若下单人是 YJH 本人或其下线，则给 YJH 打 10% 返佣
      const YJH_USER_ID_REBATE = 4957151;
      const isYJHOrDownline = async (uid: number, depth = 0): Promise<boolean> => {
        if (depth > 10) return false;
        if (uid === YJH_USER_ID_REBATE) return true;
        const [urows] = await conn.execute(
          `SELECT invited_by_user_id FROM users WHERE id = ? LIMIT 1`,
          [uid]
        ) as any[];
        const urow = (urows as any[])[0];
        if (!urow || !urow.invited_by_user_id) return false;
        if (urow.invited_by_user_id === YJH_USER_ID_REBATE) return true;
        return isYJHOrDownline(urow.invited_by_user_id, depth + 1);
      };
      try {
        const shouldRebate = await isYJHOrDownline(userId);
        if (shouldRebate) {
          const rebateAmount = parseFloat((betAmount * 0.1).toFixed(8));
          const rebateNote = `${coinFullName} ${shortDate} ${dirLabel} 编号${orderNo}`;
          // 1. 写入下单账本（竞猜子账本，用于竞猜页面展示返佣明细）
          await conn.execute(
            `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at)
             VALUES (?, ?, ?, ?, NOW(), NOW())`,
            [ledgerId, YJH_USER_ID_REBATE, rebateAmount, rebateNote]
          );
          // 2. 同时写入主账本52（实际到账，避免下单账本本身就是52时重复写入）
          if (ledgerId !== 52) {
            await conn.execute(
              `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at)
               VALUES (52, ?, ?, ?, NOW(), NOW())`,
              [YJH_USER_ID_REBATE, rebateAmount, rebateNote]
            );
          }
          console.log(`[竞猜返佣] 订单${orderNo} 下单人${userId} → YJH返佣${rebateAmount}U (账本${ledgerId}+账本52)`);
        }
      } catch (e) {
        console.error('[竞猜返佣] 返佣写入失败（不影响下单）:', e);
      }

      const newBalance = await getUserBalance(userId, ledgerId);

      return {
        success: true,
        betId: (result as any).insertId,
        newBalance,
        message: `下单成功！已扣除 ${betAmount} U，剩余 ${newBalance.toFixed(2)} U`,
      };
    }),

  // 查询用户竞猜记录
  getMyBets: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      coin: z.string().optional(),
      limit: z.number().default(20),
    }))
    .query(async ({ input, ctx }) => {
      await ensureOnce();
      const conn = await getDbConnection();
      if (!conn) return { bets: [] };

      // 确保表存在
      try {
        await conn.execute(`CREATE TABLE IF NOT EXISTS crypto_bets (id INT AUTO_INCREMENT PRIMARY KEY, ledger_id INT NOT NULL, user_id INT NOT NULL, coin VARCHAR(10) NOT NULL, direction VARCHAR(10) NOT NULL, range_index INT NOT NULL, range_label VARCHAR(20) NOT NULL, bet_amount DECIMAL(20,8) NOT NULL, odds DECIMAL(10,4) NOT NULL, expected_return DECIMAL(20,8) NOT NULL, house_edge DECIMAL(5,4) NOT NULL, probability DECIMAL(10,6) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending', settled_at TIMESTAMP NULL, actual_change_pct DECIMAL(10,4) NULL, settle_note TEXT NULL, target_date VARCHAR(10) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      } catch (_) {}

      const userId = ctx.user.id;
      const coinFilter = input.coin ? ` AND coin = '${input.coin}'` : '';
      const limitNum = parseInt(String(input.limit), 10) || 10;
      const [rows] = await conn.execute(
        `SELECT * FROM crypto_bets WHERE user_id = ? AND ledger_id = ?${coinFilter} ORDER BY created_at DESC LIMIT ${limitNum}`,
        [userId, input.ledgerId]
      ) as any;

      return { bets: rows as any[] };
    }),

  // 查询用户账本余额（用于竞猜页面显示）  // 查询账本余额
  getBetBalance: protectedProcedure
    .input(z.object({ ledgerId: z.number() }))
    .query(async ({ input, ctx }) => {
      const { getUserBalance } = await import("./db-recharge");
      const balance = await getUserBalance(ctx.user.id, input.ledgerId);
      return { balance };
    }),

  // 撤销竞猜订单（当天北京时间12:00前可撤销）
  cancelBet: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      betId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      await ensureOnce();
      const conn = await getDbConnection();
      if (!conn) throw new Error('数据库连接失败');

      const userId = ctx.user.id;
      const { ledgerId, betId } = input;

      // 查询订单
      const [betRows] = await conn.execute(
        `SELECT * FROM crypto_bets WHERE id = ? AND user_id = ? AND ledger_id = ? LIMIT 1`,
        [betId, userId, ledgerId]
      ) as any;
      const bet = (betRows as any[])[0];
      if (!bet) throw new Error('订单不存在');
      if (bet.status !== 'pending') throw new Error('该订单已结算或已撤销，无法撤销');
      // 撤销条件：当前北京日期 < target_date（目标日还未到则可撤销）
      // 例：今天 4-17 下单预测 4-18，4-17 内可撤销；到了4-18当天则不可撤销
      const nowBJ = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const todayBJ = nowBJ.toISOString().slice(0, 10);
      if (todayBJ >= String(bet.target_date)) {
        throw new Error('已到达目标日，无法撤销');
      }     // 撤销：更新状态为 cancelled
      await conn.execute(
        `UPDATE crypto_bets SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
        [betId]
      );

      // 退款：写入正数 af_manual_balances
      const coinFullName = bet.coin === 'BTC' ? '比特币' : bet.coin === 'ETH' ? '以太坊' : bet.coin;
      const shortDate = String(bet.target_date).replace(/^\d{4}-0?(\d+)-0?(\d+)$/, '$1-$2');
      const refundNote = `撤销委托 ${coinFullName} ${shortDate} 退款 编号${bet.order_no}`;
      await conn.execute(
        `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [ledgerId, userId, parseFloat(bet.bet_amount), refundNote]
      );

      const { getUserBalance } = await import('./db-recharge');
      const newBalance = await getUserBalance(userId, ledgerId);
      return { success: true, newBalance, message: `撤销成功，已退款 ${parseFloat(bet.bet_amount).toFixed(2)} U` };
    }),

  // 手动触发结算（管理员用）
  manualSettle: protectedProcedure
    .input(z.object({
      targetDate: z.string().optional(), // YYYY-MM-DD，不传则结算昨天
      overrideChangePctMap: z.record(z.string(), z.number()).optional(), // 历史补开奖：手动指定各币种涨跌幅，如 { ETH: -2.84, MSFT: -0.48 }
    }))
    .mutation(async ({ input }) => {
      const result = await settleDailyBets(input.targetDate, input.overrideChangePctMap);
      return result;
    }),

  // 撤销结算（管理员用）：把指定订单状态重置为 pending，并删除对应派奖记录
  revertSettle: protectedProcedure
    .input(z.object({
      betId: z.number(), // crypto_bets.id
    }))
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error('数据库连接失败');
      // 1. 查询订单当前状态
      const [rows] = await conn.execute(
        `SELECT id, order_no, ledger_id, user_id, status, expected_return FROM crypto_bets WHERE id = ? LIMIT 1`,
        [input.betId]
      ) as any[];
      const bet = (rows as any[])[0];
      if (!bet) throw new Error(`订单#${input.betId} 不存在`);
      if (bet.status === 'pending') return { success: true, message: '订单已是 pending 状态，无需撤销' };
      // 2. 如果是 won，删除对应派奖记录
      if (bet.status === 'won') {
        const [delRows] = await conn.execute(
          `DELETE FROM af_manual_balances WHERE ledger_id = ? AND user_id = ? AND amount = ? AND note LIKE ? ORDER BY created_at DESC LIMIT 1`,
          [bet.ledger_id, bet.user_id, parseFloat(bet.expected_return), `%编号${bet.order_no}%`]
        ) as any[];
        console.log(`[撤销结算] 删除派奖记录: ledger=${bet.ledger_id} user=${bet.user_id} amount=${bet.expected_return} order=${bet.order_no}`);
      }
      // 3. 重置订单状态为 pending
      await conn.execute(
        `UPDATE crypto_bets SET status = 'pending', settled_at = NULL, actual_change_pct = NULL, settle_note = NULL WHERE id = ?`,
        [input.betId]
      );
      console.log(`[撤销结算] 订单#${input.betId} (${bet.order_no}) 已重置为 pending`);
      return { success: true, message: `订单#${input.betId} (${bet.order_no}) 已撤销结算，状态重置为 pending` };
    }),
  // 补录历史返佣（一次性，内部管理用）
  addHistoricalRebate: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      userId: z.number(),   // 返佣接收方 user_id
      amount: z.number(),   // 返佣金额
      note: z.string(),     // 备注
    }))
    .mutation(async ({ input }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error('数据库连接失败');
      await conn.execute(
        `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [input.ledgerId, input.userId, input.amount, input.note]
      );
      console.log(`[补录返佣] ledger=${input.ledgerId} user=${input.userId} amount=${input.amount} note=${input.note}`);
      return { success: true };
    }),

  // 行情竞猜订单汇总（供邀请页面展示）
  getAllBetsStats: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error('数据库连接失败');
      const { ledgerId } = input;

      // YJH的用户ID
      const YJH_USER_ID = 4957151;

      // 递归查找某用户是否是YJH的下线（通过invited_by_user_id链）
      const isYJHDownline = async (userId: number, depth = 0): Promise<boolean> => {
        if (depth > 10) return false;
        if (userId === YJH_USER_ID) return true;
        const [rows] = await conn.execute(
          `SELECT invited_by_user_id FROM users WHERE id = ? LIMIT 1`,
          [userId]
        ) as any[];
        const row = (rows as any[])[0];
        if (!row || !row.invited_by_user_id) return false;
        if (row.invited_by_user_id === YJH_USER_ID) return true;
        return isYJHDownline(row.invited_by_user_id, depth + 1);
      };

      // 所有订单（含撤销）
      const [allRows] = await conn.execute(
        `SELECT cb.id, cb.order_no, cb.user_id, cb.coin, cb.direction, cb.range_label,
                cb.bet_amount, cb.odds, cb.expected_return, cb.status,
                cb.actual_change_pct, cb.settle_note, cb.target_date, cb.created_at,
                COALESCE(u.name, u.username, CONCAT('uid', cb.user_id)) AS user_name,
                u.username
         FROM crypto_bets cb
         LEFT JOIN users u ON u.id = cb.user_id
         WHERE cb.ledger_id = ?
         ORDER BY cb.created_at DESC
         LIMIT 500`,
        [ledgerId]
      ) as any;
      const allRowsArr: any[] = allRows as any[];

      // 过滤：只保留YJH自己和他的下线用户的订单
      const userIdCache = new Map<number, boolean>();
      const allBets: any[] = [];
      for (const bet of allRowsArr) {
        const uid = bet.user_id;
        if (!userIdCache.has(uid)) {
          userIdCache.set(uid, uid === YJH_USER_ID || await isYJHDownline(uid));
        }
        if (userIdCache.get(uid)) {
          allBets.push(bet);
        }
      }

      // 当前北京日期
      const nowBJ = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const todayBJ = nowBJ.toISOString().slice(0, 10);

      // 汇总统计：撤销不计入流水，且只统计已进入不可撤销状态的订单（todayBJ >= target_date）
      const nonCancelledBets = allBets.filter((b: any) => b.status !== 'cancelled' && String(b.target_date) <= todayBJ);
      const totalOrders = nonCancelledBets.length;
      const totalTurnover = nonCancelledBets.reduce((s: number, b: any) => s + parseFloat(b.bet_amount), 0);
      const wonBets = nonCancelledBets.filter((b: any) => b.status === 'won');
      const lostBets = nonCancelledBets.filter((b: any) => b.status === 'lost');
      const pendingBets = nonCancelledBets.filter((b: any) => b.status === 'pending');
      const totalWonAmount = wonBets.reduce((s: number, b: any) => s + parseFloat(b.expected_return), 0);
      const totalLostAmount = lostBets.reduce((s: number, b: any) => s + parseFloat(b.bet_amount), 0);
      const commission = totalTurnover * 0.1;

      return {
        summary: {
          totalOrders,
          totalTurnover: parseFloat(totalTurnover.toFixed(2)),
          wonCount: wonBets.length,
          lostCount: lostBets.length,
          pendingCount: pendingBets.length,
          cancelledCount: allBets.filter((b: any) => b.status === 'cancelled').length,
          totalWonAmount: parseFloat(totalWonAmount.toFixed(2)),
          totalLostAmount: parseFloat(totalLostAmount.toFixed(2)),
          commission: parseFloat(commission.toFixed(2)),
        },
        orders: allBets.map((b: any) => ({
          id: b.id,
          orderNo: b.order_no || '',
          userId: b.user_id,
          userName: b.user_name || '',
          username: b.username || '',
          coin: b.coin,
          direction: b.direction,
          rangeLabel: b.range_label,
          betAmount: parseFloat(b.bet_amount),
          odds: parseFloat(b.odds),
          expectedReturn: parseFloat(b.expected_return),
          status: b.status,
          actualChangePct: b.actual_change_pct != null ? parseFloat(b.actual_change_pct) : null,
          settleNote: b.settle_note || '',
          targetDate: b.target_date,
          createdAt: b.created_at,
        })),
      };
    }),

  // 用户ETH持仓汇总（行情评估页面用）
  getMyEthPosition: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      const conn = await getDbConnection();
      if (!conn) throw new Error('数据库连接失败');
      const userId = ctx.user.id;
      const { ledgerId } = input;

      // 确保表存在
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS eth_position_records (
          id INT AUTO_INCREMENT PRIMARY KEY,
          ledger_id INT NOT NULL,
          user_id INT NOT NULL,
          bet_id INT NOT NULL,
          bet_order_no VARCHAR(20) DEFAULT '',
          loss_amount DECIMAL(20,8) NOT NULL,
          eth_price DECIMAL(20,4) NOT NULL,
          eth_qty DECIMAL(20,8) NOT NULL,
          target_date VARCHAR(10) NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_epr_user (user_id),
          INDEX idx_epr_ledger (ledger_id),
          INDEX idx_epr_bet (bet_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      // 1. 查询该用户所有ETH持仓买入记录
      const [posRows] = await conn.execute(
        `SELECT id, bet_id, bet_order_no, loss_amount, eth_price, eth_qty, target_date, created_at
         FROM eth_position_records
         WHERE user_id = ? AND ledger_id = ?
         ORDER BY created_at DESC`,
        [userId, ledgerId]
      ) as any;
      const positions: any[] = posRows as any[];

      // 2. 查询该用户ETH竞猜的总盈亏（已结算的won+lost）
      const [ethBetRows] = await conn.execute(
        `SELECT status, bet_amount, expected_return FROM crypto_bets
         WHERE user_id = ? AND ledger_id = ? AND coin = 'ETH' AND status IN ('won','lost')`,
        [userId, ledgerId]
      ) as any;
      const ethBets: any[] = ethBetRows as any[];
      const totalWon = ethBets.filter((b: any) => b.status === 'won').reduce((s: number, b: any) => s + parseFloat(b.expected_return) - parseFloat(b.bet_amount), 0);
      const totalLost = ethBets.filter((b: any) => b.status === 'lost').reduce((s: number, b: any) => s + parseFloat(b.bet_amount), 0);

      // 累计买入ETH总金额和总数量
      const totalBuyAmount = positions.reduce((s: number, p: any) => s + parseFloat(p.loss_amount), 0);
      const totalEthQty = positions.reduce((s: number, p: any) => s + parseFloat(p.eth_qty), 0);
      const avgBuyPrice = totalEthQty > 0 ? totalBuyAmount / totalEthQty : 0;

      // 净亏损 = 总亏损 - 总盈利（最小0，最大=累计买入金额）
      const netLoss = Math.max(0, Math.min(totalLost - totalWon, totalBuyAmount));
      // 持仓占比 = 净亏损 / 累计买入金额
      const positionRatio = totalBuyAmount > 0 ? netLoss / totalBuyAmount : 0;
      // 实际持有ETH数量 = 累计买入数量 × 持仓占比
      const actualEthQty = totalEthQty * positionRatio;

      // 3. 取最新ETH价格（使用 price-scanner 内存缓存，实时价格，规范：crypto-price-unified）
      const { getLatestPrice } = await import('./price-scanner');
      const currentEthPrice = getLatestPrice('ETH') ?? 0;

      // 持仓市值 & 浮盈浮亏
      const positionValue = actualEthQty * currentEthPrice;
      const positionPnl = positionValue - netLoss;

      return {
        summary: {
          totalBuyAmount: parseFloat(totalBuyAmount.toFixed(2)),
          totalEthQty: parseFloat(totalEthQty.toFixed(8)),
          avgBuyPrice: parseFloat(avgBuyPrice.toFixed(2)),
          totalWon: parseFloat(totalWon.toFixed(2)),
          totalLost: parseFloat(totalLost.toFixed(2)),
          netLoss: parseFloat(netLoss.toFixed(2)),
          positionRatio: parseFloat(positionRatio.toFixed(4)),
          actualEthQty: parseFloat(actualEthQty.toFixed(8)),
          currentEthPrice: parseFloat(currentEthPrice.toFixed(2)),
          positionValue: parseFloat(positionValue.toFixed(2)),
          positionPnl: parseFloat(positionPnl.toFixed(2)),
        },
        records: positions.map((p: any) => ({
          id: p.id,
          betId: p.bet_id,
          orderNo: p.bet_order_no || '',
          lossAmount: parseFloat(p.loss_amount),
          ethPrice: parseFloat(p.eth_price),
          ethQty: parseFloat(p.eth_qty),
          targetDate: p.target_date,
          createdAt: p.created_at,
        })),
      };
    }),
});

// ─── 每日结算函数 ───────────────────────────────────────────────────────────────
/**
 * 结算指定日期（默认昨天）的所有 pending 竞猜订单
 * 逻辑：
 * 1. 从 crypto_klines 取该日期的实际涨跌幅
 * 2. 判断每笔订单的 direction + range_index 是否命中
 * 3. 命中：status='won'，往 af_manual_balances 写 +expected_return
 * 4. 未命中：status='lost'
 */
/**
 * 从第三方 API 实时获取指定币种的当日涨跌幅
 * BTC/ETH: Binance 日K（UTC 当日 open→close）
 * 美股: 使用 OKX SWAP 日K
 * 备用: 火币日K
 */
async function fetchDayChangePct(coin: string, targetDate: string): Promise<number | null> {
  const US_STOCKS = new Set(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META']);
  
  // 将 targetDate 转为时间戳范围（UTC 当日）
  const startTs = new Date(targetDate + 'T00:00:00Z').getTime();
  const endTs = startTs + 86400000;

  if (!US_STOCKS.has(coin)) {
    // BTC/ETH: 从 Binance 日K获取
    try {
      const symbol = coin + 'USDT';
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${startTs}&endTime=${endTs}&limit=1`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const data: any[] = await r.json();
        if (data.length > 0) {
          const open = parseFloat(data[0][1]);
          const close = parseFloat(data[0][4]);
          if (open > 0) return ((close - open) / open) * 100;
        }
      }
    } catch {}
    // 备用：火币日K
    try {
      const sym = coin.toLowerCase() + 'usdt';
      const url = `https://api.huobi.pro/market/history/kline?symbol=${sym}&period=1day&size=10`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const j: any = await r.json();
        const klines: any[] = j.data || [];
        // 找到对应日期的K线（火币时间戳是北京时间00:00）
        const targetDay = new Date(targetDate + 'T00:00:00+08:00').getTime() / 1000;
        const k = klines.find((k: any) => Math.abs(k.id - targetDay) < 3600);
        if (k) return ((k.close - k.open) / k.open) * 100;
      }
    } catch {}
  } else {
    // 美股: OKX SWAP 日K
    try {
      const instId = `${coin}-USD-SWAP`;
      const url = `https://www.okx.com/api/v5/market/history-candles?instId=${instId}&bar=1D&limit=10`;
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const j: any = await r.json();
        const candles: any[] = j.data || [];
        // 找到对应日期的K线
        for (const c of candles) {
          const ts = parseInt(c[0]);
          const d = new Date(ts).toISOString().slice(0, 10);
          if (d === targetDate) {
            const open = parseFloat(c[1]);
            const close = parseFloat(c[4]);
            if (open > 0) return ((close - open) / open) * 100;
          }
        }
      }
    } catch {}
  }
  return null;
}

export async function settleDailyBets(targetDateInput?: string, overrideChangePctMap?: Record<string, number>): Promise<{
  settled: number;
  won: number;
  lost: number;
  totalPayout: number;
  details: string[];
}> {
  const conn = await getDbConnection();
  if (!conn) throw new Error("数据库连接失败");

  // 确定结算日期（北京时间昨天）
  const bjtNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  let targetDate: string;
  if (targetDateInput) {
    targetDate = targetDateInput;
  } else {
    const yesterday = new Date(bjtNow);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    targetDate = yesterday.toISOString().slice(0, 10);
  }

  console.log(`[竞猜结算] 开始结算日期: ${targetDate}`);

  // 1. 查询该日期所有 pending 订单
  const [pendingRows] = await conn.execute(
    `SELECT id, order_no, ledger_id, user_id, coin, direction, range_index, range_label, bet_amount, odds, expected_return
     FROM crypto_bets
     WHERE target_date = ? AND status = 'pending'`,
    [targetDate]
  ) as any;
  const pendingBets: any[] = pendingRows as any[];

  if (pendingBets.length === 0) {
    console.log(`[竞猜结算] ${targetDate} 无 pending 订单`);
    return { settled: 0, won: 0, lost: 0, totalPayout: 0, details: [`${targetDate} 无待结算订单`] };
  }

  // 2. 取需要的币种列表
  const coins = [...new Set(pendingBets.map((b: any) => b.coin))] as string[];

  // ★ 确保eth_position_records表存在
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS eth_position_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ledger_id INT NOT NULL,
      user_id INT NOT NULL,
      bet_id INT NOT NULL COMMENT '关联crypto_bets.id',
      bet_order_no VARCHAR(20) DEFAULT '' COMMENT '订单编号',
      loss_amount DECIMAL(20,8) NOT NULL COMMENT '亏损金额(U)',
      eth_price DECIMAL(20,4) NOT NULL COMMENT '买入时ETH价格(U)',
      eth_qty DECIMAL(20,8) NOT NULL COMMENT '买入ETH数量',
      target_date VARCHAR(10) NOT NULL COMMENT '结算日期',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_epr_user (user_id),
      INDEX idx_epr_ledger (ledger_id),
      INDEX idx_epr_bet (bet_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ETH竞猜亏损自动买入ETH持仓记录'
  `);

  // ★ 取当日ETH价格（用于亏损单自动买入）——从 price-scanner 实时缓存取，不查数据库
  let ethPriceForBuy: number | null = null;
  const { getLatestPrice } = await import('./price-scanner.js');
  const cachedEthPrice = getLatestPrice('ETH');
  if (cachedEthPrice && cachedEthPrice > 0) {
    ethPriceForBuy = cachedEthPrice;
    console.log(`[竞猜结算] 当日ETH价格(实时缓存): ${ethPriceForBuy} U`);
  } else {
    // 备用：实时查询 Binance ETH 价格
    try {
      const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT', { signal: AbortSignal.timeout(5000) });
      if (r.ok) {
        const j: any = await r.json();
        if (j.price) ethPriceForBuy = parseFloat(j.price);
      }
    } catch {}
    if (ethPriceForBuy) {
      console.log(`[竞猜结算] 当日ETH价格(Binance实时): ${ethPriceForBuy} U`);
    } else {
      console.log(`[竞猜结算] 未找到当日ETH价格，亏损单将不写入持仓记录`);
    }
  }

  // 3. 获取实际涨跌幅：优先用 overrideChangePctMap（历史补开奖），否则从第三方 API 实时获取
  const changePctMap: Record<string, number | null> = {};
  for (const coin of coins) {
    if (overrideChangePctMap && overrideChangePctMap[coin] !== undefined) {
      // 历史补开奖：使用传入的涨跌幅
      changePctMap[coin] = overrideChangePctMap[coin];
      console.log(`[竞猜结算] ${coin} ${targetDate} 使用手动传入涨跌幅: ${changePctMap[coin]}%`);
    } else {
      // 实时开奖：从第三方 API 获取当日涨跌幅
      changePctMap[coin] = await fetchDayChangePct(coin, targetDate);
      console.log(`[竞猜结算] ${coin} ${targetDate} 实时涨跌幅: ${changePctMap[coin]}%`);
    }
  }

  // 4. 区间边界定义（与前端 RANGE_LABELS 一致）
  // range_index 0~11 对应 0~1%, 1~2%, ..., 11~12%
  // direction='up': 涨幅 >= rangeMin && < rangeMax
  // direction='down': 跌幅 >= rangeMin && < rangeMax（即 changePct <= -rangeMin && > -rangeMax）
  const getRangeBounds = (rangeIndex: number) => {
    const min = rangeIndex;       // %
    const max = rangeIndex + 1;   // %
    return { min, max };
  };

  // 解析 4档模式的 range_label，返回中奖判断函数
  // range_label 格式："大涨 ≥X%" | "小涨 0~X%" | "大跌 ≥Y%" | "小跌 0~Y%"
  const parseTierLabel = (rangeLabel: string): ((pct: number) => boolean) | null => {
    const bigUpMatch = rangeLabel.match(/大涨[\s≥>=]+([\d.]+)%/);
    if (bigUpMatch) {
      const threshold = parseFloat(bigUpMatch[1]);
      return (pct: number) => pct >= threshold;
    }
    const smallUpMatch = rangeLabel.match(/小涨[\s0~]+([\d.]+)%/);
    if (smallUpMatch) {
      const threshold = parseFloat(smallUpMatch[1]);
      return (pct: number) => pct >= 0 && pct < threshold;
    }
    const bigDownMatch = rangeLabel.match(/大跌[\s≥>=]+([\d.]+)%/);
    if (bigDownMatch) {
      const threshold = parseFloat(bigDownMatch[1]);
      return (pct: number) => pct <= -threshold;
    }
    const smallDownMatch = rangeLabel.match(/小跌[\s0~]+([\d.]+)%/);
    if (smallDownMatch) {
      const threshold = parseFloat(smallDownMatch[1]);
      return (pct: number) => pct <= 0 && pct > -threshold;
    }
    return null;
  };

  let wonCount = 0, lostCount = 0, totalPayout = 0;
  const details: string[] = [];

  for (const bet of pendingBets) {
    const actualPct = changePctMap[bet.coin];
    if (actualPct === null || actualPct === undefined) {
      // 无数据，跳过（保持 pending）
      details.push(`订单#${bet.id} ${bet.coin} 无K线数据，跳过`);
      continue;
    }

    // 优先用 range_label 解析 4档模式（大涨/小涨/大跌/小跌）
    const tierJudge = parseTierLabel(bet.range_label);
    let isWon = false;
    if (tierJudge) {
      // 4档模式：直接用 range_label 判断
      isWon = tierJudge(actualPct);
    } else {
      // 旧版区间模式：用 range_index 判断
      const { min, max } = getRangeBounds(parseInt(bet.range_index));
      if (bet.direction === 'up') {
        isWon = actualPct >= min && actualPct < max;
      } else {
        // direction='down': 跌幅在区间内，即 changePct <= -min && > -max
        isWon = actualPct <= -min && actualPct > -max;
      }
    }

    const expectedReturn = parseFloat(bet.expected_return);
    const betAmount = parseFloat(bet.bet_amount);
    const status = isWon ? 'won' : 'lost';
    const settleNote = isWon
      ? `命中！实际${bet.direction === 'up' ? '涨' : '跌'}幅 ${Math.abs(actualPct).toFixed(2)}%，区间 ${bet.range_label}，派奖 ${expectedReturn.toFixed(2)} U`
      : `未命中。实际${bet.direction === 'up' ? '涨' : '跌'}幅 ${Math.abs(actualPct).toFixed(2)}%，区间 ${bet.range_label}`;

    // 5. 更新订单状态
    await conn.execute(
      `UPDATE crypto_bets SET status = ?, settled_at = NOW(), actual_change_pct = ?, settle_note = ? WHERE id = ?`,
      [status, actualPct, settleNote, bet.id]
    );

    // 6. 命中则派奖
    if (isWon) {
      await conn.execute(
        `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, NOW(), NOW())`,
        [bet.ledger_id, bet.user_id, expectedReturn,
          `委托买入 ${bet.coin === 'BTC' ? '比特币' : bet.coin === 'ETH' ? '以太坊' : bet.coin} ${targetDate.replace(/^\d{4}-0?(\d+)-0?(\d+)$/, '$1-$2')} ${bet.direction === 'up' ? '涨幅' : '跌幅'} 中奖派发${bet.order_no ? ` 编号${bet.order_no}` : ''}`]
      );
      wonCount++;
      totalPayout += expectedReturn;
    } else {
      lostCount++;
      // ★ ETH竞猜亏损：自动买入ETH写入持仓记录
      if (bet.coin === 'ETH' && ethPriceForBuy && ethPriceForBuy > 0) {
        const ethQty = betAmount / ethPriceForBuy;
        await conn.execute(
          `INSERT INTO eth_position_records (ledger_id, user_id, bet_id, bet_order_no, loss_amount, eth_price, eth_qty, target_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [bet.ledger_id, bet.user_id, bet.id, bet.order_no || '', betAmount, ethPriceForBuy, ethQty, targetDate]
        );
        console.log(`[竞猜结算] ETH亏损单#${bet.id} 自动买入 ${ethQty.toFixed(8)} ETH @${ethPriceForBuy}`);
      }
    }

    details.push(`订单#${bet.id} ${isWon ? '✓中奖' : '✗未中'} | ${bet.coin} ${bet.direction === 'up' ? '涨' : '跌'} ${bet.range_label} | 实际${Math.abs(actualPct).toFixed(2)}% | ${isWon ? `派奖${expectedReturn.toFixed(2)}U` : `亏${betAmount.toFixed(2)}U`}`);
  }

  console.log(`[竞猜结算] ${targetDate} 完成：共${pendingBets.length}单，中奖${wonCount}单，未中${lostCount}单，派奖${totalPayout.toFixed(2)}U`);
  return {
    settled: wonCount + lostCount,
    won: wonCount,
    lost: lostCount,
    totalPayout,
    details,
  };
}