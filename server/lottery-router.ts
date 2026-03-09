/**
 * AE 定制账本 - 共享抽奖 tRPC 路由
 *
 * 接口列表：
 *   lottery.create          - 创建抽奖活动（组织者）
 *   lottery.update          - 更新活动设置（组织者）
 *   lottery.getActivity     - 获取活动详情（公开）
 *   lottery.listByLedger    - 获取账本下所有抽奖（历史记录）
 *   lottery.addPrize        - 添加奖项（组织者）
 *   lottery.updatePrize     - 更新奖项（组织者）
 *   lottery.deletePrize     - 删除奖项（组织者）
 *   lottery.signup          - 参与者报名
 *   lottery.cancelSignup    - 取消报名
 *   lottery.getParticipants - 获取报名列表（组织者）
 *   lottery.instantDraw     - 即时自助抽奖（参与者触发）
 *   lottery.startDraw       - 开始定时开奖（组织者触发）
 *   lottery.getResults      - 获取开奖结果（公开）
 *   lottery.verifyFairness  - 公平性验证（任何人）
 */

import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDbConnection } from "./db";
import crypto from "crypto";


// ─────────────────────────────────────────────
// 辅助：封装 getDbConnection 执行原始 SQL
// ─────────────────────────────────────────────
async function _execQuery(sql: string, params?: any[]): Promise<any[]> {
  const conn = await getDbConnection();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库不可用" });
  const [rows] = await conn.execute(sql, params ?? []);
  // SELECT 返回数组，INSERT/UPDATE/DELETE 返回 ResultSetHeader（对象）
  // 统一包装为数组，方便调用方解构
  if (Array.isArray(rows)) return rows as any[];
  return [rows] as any[]; // ResultSetHeader 包装成单元素数组
}

// ─────────────────────────────────────────────
// 工具函数：公平随机算法
// ─────────────────────────────────────────────

/**
 * 生成随机种子哈希（开奖前公示，不泄露结果）
 */
function generateSeedHash(): { seed: string; hash: string } {
  const seed = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(seed).digest("hex");
  return { seed, hash };
}

/**
 * 基于种子的确定性随机洗牌（Fisher-Yates）
 * 相同种子 + 相同数组 → 相同结果，可验证
 */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  const result = [...arr];
  // 用种子生成伪随机数序列
  let hash = crypto.createHash("sha256").update(seed).digest("hex");
  for (let i = result.length - 1; i > 0; i--) {
    // 每轮重新哈希，保证足够的随机性
    hash = crypto.createHash("sha256").update(hash + i).digest("hex");
    const j = parseInt(hash.slice(0, 8), 16) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 权重随机抽取（不放回）
 */
function weightedDraw(
  participants: Array<{ id: number; weight: number }>,
  count: number,
  seed: string
): number[] {
  const pool = [...participants];
  const winners: number[] = [];
  let currentSeed = seed;

  for (let i = 0; i < count && pool.length > 0; i++) {
    const totalWeight = pool.reduce((s, p) => s + p.weight, 0);
    currentSeed = crypto.createHash("sha256").update(currentSeed + i).digest("hex");
    let rand = (parseInt(currentSeed.slice(0, 8), 16) / 0xffffffff) * totalWeight;

    for (let j = 0; j < pool.length; j++) {
      rand -= pool[j].weight;
      if (rand <= 0) {
        winners.push(pool[j].id);
        pool.splice(j, 1);
        break;
      }
    }
  }
  return winners;
}

// ─────────────────────────────────────────────
// 路由定义
// ─────────────────────────────────────────────

export const lotteryRouter = router({

  // ── 创建抽奖活动 ──────────────────────────
  create: protectedProcedure
    .input(z.object({
      ledgerId: z.number(),
      title: z.string().min(1).max(100),
      description: z.string().optional(),
      mode: z.enum(["instant", "scheduled", "milestone"]),
      instantStyle: z.enum(["scratch", "wheel", "flip", "egg"]).optional(),
      drawAt: z.string().optional(),           // ISO 时间字符串
      autoDrawEnabled: z.boolean().default(true),
      milestoneType: z.enum(["amount", "member_count", "record_count"]).optional(),
      milestoneTarget: z.number().optional(),
      signupStartAt: z.string().optional(),
      signupEndAt: z.string().optional(),
      maxParticipants: z.number().optional(),
      requiresInfo: z.boolean().default(false),
      requiredFields: z.array(z.object({
        name: z.string(),
        label: z.string(),
        type: z.enum(["text", "phone", "select"]),
        options: z.array(z.string()).optional(),
      })).optional(),
      signupFee: z.number().default(0),
      registrationMode: z.enum(['invite', 'organizer_add', 'open']).default('open'),
      useParticipantSeed: z.boolean().default(false),
      isPublic: z.boolean().default(true),
      // 外部开奖数据源
      externalSeedType: z.enum(['sh_index', 'sz_index', 'ssq', 'dlt']).optional(),
      externalSeedDate: z.string().optional(), // YYYY-MM-DD
      participantScale: z.enum(['small', 'large']).default('small'),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user.id;

      // 验证账本成员权限
      const [member] = await _execQuery(
        `SELECT role FROM ledger_members WHERE ledgerId = ? AND userId = ?`,
        [input.ledgerId, userId]
      ) as any[];
      if (!member || !["owner", "admin"].includes(member.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "只有账本管理员才能创建抽奖" });
      }

      // 预生成种子哈希（开奖前公示用）
      const { seed, hash } = generateSeedHash();

      const [result] = await _execQuery(
        `INSERT INTO lottery_activities
          (ledger_id, created_by, title, description, mode, instant_style,
           draw_at, auto_draw_enabled, milestone_type, milestone_target,
           signup_start_at, signup_end_at, max_participants, requires_info,
           required_fields, signup_fee, registration_mode, random_seed_hash, random_seed,
           use_participant_seed, status, is_public,
           external_seed_type, external_seed_date, participant_scale)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          input.ledgerId, userId, input.title, input.description ?? null,
          input.mode, input.instantStyle ?? "scratch",
          input.drawAt ?? null, input.autoDrawEnabled ? 1 : 0,
          input.milestoneType ?? null, input.milestoneTarget ?? null,
          input.signupStartAt ?? null, input.signupEndAt ?? null,
          input.maxParticipants ?? null, input.requiresInfo ? 1 : 0,
          input.requiredFields ? JSON.stringify(input.requiredFields) : null,
          input.signupFee, input.registrationMode ?? 'open', hash, seed,
          input.useParticipantSeed ? 1 : 0,
          "draft", input.isPublic ? 1 : 0,
          input.externalSeedType ?? null, input.externalSeedDate ?? null,
          input.participantScale ?? 'small',
        ]
      ) as any;

      return { id: result.insertId, seedHash: hash };
    }),

  // ── 更新活动设置 ──────────────────────────
  update: protectedProcedure
    .input(z.object({
      activityId: z.number(),
      title: z.string().min(1).max(100).optional(),
      description: z.string().optional(),
      mode: z.enum(["instant", "scheduled", "milestone"]).optional(),
      instantStyle: z.enum(["scratch", "wheel", "flip", "egg"]).optional(),
      drawAt: z.string().optional(),
      autoDrawEnabled: z.boolean().optional(),
      signupStartAt: z.string().optional(),
      signupEndAt: z.string().optional(),
      maxParticipants: z.number().nullable().optional(),
      requiresInfo: z.boolean().optional(),
      requiredFields: z.array(z.any()).optional(),
      signupFee: z.number().optional(),
      registrationMode: z.enum(['invite', 'organizer_add', 'open', 'member_only', 'invite_only']).optional(),
      status: z.enum(["draft", "open", "drawing", "completed", "cancelled"]).optional(),
      isPublic: z.boolean().optional(),
      externalSeedType: z.enum(['sh_index', 'sz_index', 'ssq', 'dlt']).optional(),
      externalSeedDate: z.string().optional(),
      participantScale: z.enum(['small', 'large']).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { activityId, ...fields } = input;
      await ensureOrganizer(activityId, ctx.user.id);

      const updates: string[] = [];
      const values: any[] = [];

      if (fields.title !== undefined) { updates.push("title=?"); values.push(fields.title); }
      if (fields.description !== undefined) { updates.push("description=?"); values.push(fields.description); }
      if (fields.mode !== undefined) { updates.push("mode=?"); values.push(fields.mode); }
      if (fields.instantStyle !== undefined) { updates.push("instant_style=?"); values.push(fields.instantStyle); }
      if (fields.drawAt !== undefined) { updates.push("draw_at=?"); values.push(fields.drawAt); }
      if (fields.autoDrawEnabled !== undefined) { updates.push("auto_draw_enabled=?"); values.push(fields.autoDrawEnabled ? 1 : 0); }
      if (fields.signupStartAt !== undefined) { updates.push("signup_start_at=?"); values.push(fields.signupStartAt); }
      if (fields.signupEndAt !== undefined) { updates.push("signup_end_at=?"); values.push(fields.signupEndAt); }
      if (fields.maxParticipants !== undefined) { updates.push("max_participants=?"); values.push(fields.maxParticipants); }
      if (fields.requiresInfo !== undefined) { updates.push("requires_info=?"); values.push(fields.requiresInfo ? 1 : 0); }
      if (fields.requiredFields !== undefined) { updates.push("required_fields=?"); values.push(JSON.stringify(fields.requiredFields)); }
      if (fields.signupFee !== undefined) { updates.push("signup_fee=?"); values.push(fields.signupFee); }
      if (fields.registrationMode !== undefined) { updates.push("registration_mode=?"); values.push(fields.registrationMode); }
      if (fields.status !== undefined) { updates.push("status=?"); values.push(fields.status); }
      if (fields.isPublic !== undefined) { updates.push("is_public=?"); values.push(fields.isPublic ? 1 : 0); }
      if (fields.externalSeedType !== undefined) { updates.push("external_seed_type=?"); values.push(fields.externalSeedType); }
      if (fields.externalSeedDate !== undefined) { updates.push("external_seed_date=?"); values.push(fields.externalSeedDate); }
      if (fields.participantScale !== undefined) { updates.push("participant_scale=?"); values.push(fields.participantScale); }

      if (updates.length === 0) return { success: true };
      values.push(activityId);
      await _execQuery(`UPDATE lottery_activities SET ${updates.join(",")} WHERE id=?`, values);
      return { success: true };
    }),

  // ── 获取活动详情 ──────────────────────────
  getActivity: publicProcedure
    .input(z.object({ activityId: z.number() }))
    .query(async ({ input }) => {
      const [activity] = await _execQuery(
        `SELECT a.*, 
           (SELECT COUNT(*) FROM lottery_participants WHERE activity_id=a.id AND status='confirmed') AS participantCount
         FROM lottery_activities a WHERE a.id=?`,
        [input.activityId]
      ) as any[];
      if (!activity) throw new TRPCError({ code: "NOT_FOUND" });
      // 将 BigInt 转为 Number（mysql2 的 COUNT(*) 子查询返回 BigInt）
      activity.participantCount = Number(activity.participantCount ?? 0);
      // 将 Date 对象转为 ISO 字符串，防止 superjson 将 Date 传给前端导致渲染崩溃
      const dateFields = ['draw_at', 'signup_start_at', 'signup_end_at', 'created_at', 'updated_at'];
      for (const f of dateFields) {
        if (activity[f] instanceof Date) activity[f] = (activity[f] as Date).toISOString();
      }
      // external_seed_date 是 DATE 类型，也可能是 Date 对象
      // 必须用本地时区提取日期，而非 UTC，否则在 UTC+8 服务器上会少一天
      if (activity.external_seed_date instanceof Date) {
        const d = activity.external_seed_date as Date;
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const dy = String(d.getDate()).padStart(2, '0');
        activity.external_seed_date = `${y}-${mo}-${dy}`;
      }
      const prizes = await _execQuery(
        `SELECT * FROM lottery_prizes WHERE activity_id=? ORDER BY sort_order ASC`,
        [input.activityId]
      ) as any[];
      // 奖项字段标准化：INT 确保是 Number，DECIMAL 转为字符串
      const normalizedPrizes = prizes.map((p: any) => ({
        ...p,
        quantity: Number(p.quantity ?? 1),
        sort_order: Number(p.sort_order ?? 0),
        weight: Number(p.weight ?? 1),
        is_consolation: Number(p.is_consolation ?? 0),
        prize_value: p.prize_value != null ? String(p.prize_value) : null,
      }));
      return { ...activity, prizes: normalizedPrizes };
    }),

  // ── 账本下的抽奖历史列表 ──────────────────
  listByLedger: publicProcedure
    .input(z.object({ ledgerId: z.number() }))
    .query(async ({ input }) => {
      const activities = await _execQuery(
        `SELECT a.*,
           (SELECT COUNT(*) FROM lottery_participants WHERE activity_id=a.id AND status='confirmed') AS participantCount,
           (SELECT COUNT(*) FROM lottery_results WHERE activity_id=a.id) AS winnerCount,
           (SELECT u.name FROM lottery_results lr
              JOIN users u ON u.id=lr.winner_id
              WHERE lr.activity_id=a.id ORDER BY lr.drawn_at ASC LIMIT 1) AS firstWinnerName
         FROM lottery_activities a
         WHERE a.ledger_id=?
         ORDER BY a.created_at DESC`,
        [input.ledgerId]
      ) as any[];

      // 为每个活动附加最近 3 个参与者头像
      const activitiesWithParticipants = await Promise.all(
        activities.map(async (a: any) => {
          const recentParticipants = await _execQuery(
            `SELECT u.name AS display_name, u.avatar AS avatar_url
             FROM lottery_participants lp
             JOIN users u ON u.id=lp.user_id
             WHERE lp.activity_id=? AND lp.status='confirmed'
             ORDER BY lp.created_at DESC LIMIT 3`,
            [a.id]
          ) as any[];
          const prizes = await _execQuery(
            `SELECT id, name, quantity, is_consolation FROM lottery_prizes WHERE activity_id=? ORDER BY sort_order ASC`,
            [a.id]
          ) as any[];
          return { ...a, recentParticipants, prizes };
        })
      );
      // 将 BigInt 转为 Number（mysql2 的 COUNT(*) 子查询返回 BigInt）
      return activitiesWithParticipants.map((a: any) => ({
        ...a,
        participantCount: Number(a.participantCount ?? 0),
        winnerCount: Number(a.winnerCount ?? 0),
      }));
    }),

  // ── 添加奖项 ──────────────────────────────
  addPrize: protectedProcedure
    .input(z.object({
      activityId: z.number(),
      name: z.string().min(1).max(50),
      description: z.string().optional(),
      imageUrl: z.string().optional(),
      quantity: z.number().min(1).default(1),
      sortOrder: z.number().default(0),
      prizeValue: z.number().optional(),
      weight: z.number().min(1).default(1),
      isConsolation: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      await ensureOrganizer(input.activityId, ctx.user.id);
      const [result] = await _execQuery(
        `INSERT INTO lottery_prizes (activity_id, name, description, image_url, quantity, sort_order, prize_value, weight, is_consolation)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [input.activityId, input.name, input.description ?? null, input.imageUrl ?? null,
         input.quantity, input.sortOrder, input.prizeValue ?? null, input.weight, input.isConsolation ? 1 : 0]
      ) as any;
      return { id: (result as any).insertId };
    }),

  // ── 更新奖项 ──────────────────────────────
  updatePrize: protectedProcedure
    .input(z.object({
      prizeId: z.number(),
      activityId: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      quantity: z.number().optional(),
      sortOrder: z.number().optional(),
      prizeValue: z.number().optional(),
      weight: z.number().optional(),
      isConsolation: z.boolean().optional(),
      imageUrl: z.string().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await ensureOrganizer(input.activityId, ctx.user.id);
      const { prizeId, activityId, ...fields } = input;
      const updates: string[] = [];
      const values: any[] = [];
      if (fields.name !== undefined) { updates.push("name=?"); values.push(fields.name); }
      if (fields.description !== undefined) { updates.push("description=?"); values.push(fields.description); }
      if (fields.quantity !== undefined) { updates.push("quantity=?"); values.push(fields.quantity); }
      if (fields.sortOrder !== undefined) { updates.push("sort_order=?"); values.push(fields.sortOrder); }
      if (fields.prizeValue !== undefined) { updates.push("prize_value=?"); values.push(fields.prizeValue); }
      if (fields.weight !== undefined) { updates.push("weight=?"); values.push(fields.weight); }
      if (fields.isConsolation !== undefined) { updates.push("is_consolation=?"); values.push(fields.isConsolation ? 1 : 0); }
      if (fields.imageUrl !== undefined) { updates.push("image_url=?"); values.push(fields.imageUrl); }
      if (updates.length === 0) return { success: true };
      values.push(prizeId);
      await _execQuery(`UPDATE lottery_prizes SET ${updates.join(",")} WHERE id=?`, values);
      return { success: true };
    }),

  // ── 删除奖项 ──────────────────────────────
  deletePrize: protectedProcedure
    .input(z.object({ prizeId: z.number(), activityId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await ensureOrganizer(input.activityId, ctx.user.id);
      await _execQuery(`DELETE FROM lottery_prizes WHERE id=?`, [input.prizeId]);
      return { success: true };
    }),

  // ── 参与者报名 ────────────────────────────
  signup: publicProcedure
    .input(z.object({
      activityId: z.number(),
      displayName: z.string().min(1).max(50),
      extraInfo: z.record(z.string()).optional(),
      userId: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const [activity] = await _execQuery(
        `SELECT * FROM lottery_activities WHERE id=?`, [input.activityId]
      ) as any[];
      if (!activity) throw new TRPCError({ code: "NOT_FOUND" });
      if (activity.status !== "open") throw new TRPCError({ code: "BAD_REQUEST", message: "活动未开放报名" });
      // 检查报名开始时间
      if (activity.signup_start_at && new Date(activity.signup_start_at) > new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "报名尚未开始" });
      }
      // 检查报名截止时间
      if (activity.signup_end_at && new Date(activity.signup_end_at) < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "报名已截止" });
      }

      // 检查人数上限
      if (activity.max_participants) {
        const [{ cnt }] = await _execQuery(
          `SELECT COUNT(*) AS cnt FROM lottery_participants WHERE activity_id=? AND status='confirmed'`,
          [input.activityId]
        ) as any[];
        if (Number(cnt) >= activity.max_participants) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "报名人数已满" });
        }
      }

      // 防重复报名（同一 userId 或同一 displayName）
      if (input.userId) {
        const [existing] = await _execQuery(
          `SELECT id FROM lottery_participants WHERE activity_id=? AND user_id=? AND status='confirmed'`,
          [input.activityId, input.userId]
        ) as any[];
        if (existing) throw new TRPCError({ code: "BAD_REQUEST", message: "您已报名" });
      }

      // 生成参与者随机贡献（用于共同决定种子）
      const participantSeed = activity.use_participant_seed
        ? crypto.randomBytes(16).toString("hex")
        : null;

      const [result] = await _execQuery(
        `INSERT INTO lottery_participants (activity_id, user_id, display_name, extra_info, participant_seed, status)
         VALUES (?,?,?,?,?,'confirmed')`,
        [input.activityId, input.userId ?? null, input.displayName,
         input.extraInfo ? JSON.stringify(input.extraInfo) : null, participantSeed]
      ) as any;

      return { id: (result as any).insertId, participantSeed };
    }),

  // ── 取消报名 ──────────────────────────────
  cancelSignup: protectedProcedure
    .input(z.object({ participantId: z.number(), activityId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await _execQuery(
        `UPDATE lottery_participants SET status='cancelled' WHERE id=? AND user_id=?`,
        [input.participantId, ctx.user.id]
      );
      return { success: true };
    }),

  // ── 获取报名列表（组织者，含完整信息） ─────────────────
  getParticipants: protectedProcedure
    .input(z.object({ activityId: z.number() }))
    .query(async ({ input, ctx }) => {
      await ensureOrganizer(input.activityId, ctx.user.id);
      const participants = await _execQuery(
        `SELECT * FROM lottery_participants WHERE activity_id=? AND status='confirmed' ORDER BY created_at ASC`,
        [input.activityId]
      ) as any[];
      return participants;
    }),

  // ── 获取报名名单（公开，仅展示昵称和时间） ─────────────────
  getPublicParticipants: publicProcedure
    .input(z.object({ activityId: z.number() }))
    .query(async ({ input }) => {
      const participants = await _execQuery(
        `SELECT lp.id, lp.display_name, lp.created_at, u.avatar AS avatar_url
         FROM lottery_participants lp
         LEFT JOIN users u ON u.id = lp.user_id
         WHERE lp.activity_id=? AND lp.status='confirmed'
         ORDER BY lp.created_at ASC`,
        [input.activityId]
      ) as any[];
      return participants;
    }),

  // ── 即时自助抽奖（参与者触发） ────────────
  instantDraw: publicProcedure
    .input(z.object({
      activityId: z.number(),
      participantId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const [activity] = await _execQuery(
        `SELECT * FROM lottery_activities WHERE id=? AND mode='instant'`,
        [input.activityId]
      ) as any[];
      if (!activity) throw new TRPCError({ code: "NOT_FOUND" });
      if (activity.status !== "open") throw new TRPCError({ code: "BAD_REQUEST", message: "活动未开放" });

      const [participant] = await _execQuery(
        `SELECT * FROM lottery_participants WHERE id=? AND activity_id=? AND status='confirmed'`,
        [input.participantId, input.activityId]
      ) as any[];
      if (!participant) throw new TRPCError({ code: "NOT_FOUND", message: "报名记录不存在" });
      if (participant.draw_used >= participant.draw_count) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "抽奖次数已用完" });
      }

      // 获取可用奖项（剩余名额 > 0）
      const prizes = await _execQuery(
        `SELECT p.*, 
           p.quantity - COALESCE((SELECT COUNT(*) FROM lottery_results r WHERE r.prize_id=p.id), 0) AS remaining
         FROM lottery_prizes p WHERE p.activity_id=? HAVING remaining > 0 ORDER BY p.sort_order ASC`,
        [input.activityId]
      ) as any[];

      if (prizes.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "奖品已全部发完" });
      }

      // 用活动种子 + 参与者ID + 已用次数 生成本次随机种子
      const drawSeed = crypto.createHash("sha256")
        .update(`${activity.random_seed}:${input.participantId}:${participant.draw_used}`)
        .digest("hex");

      // 权重随机抽取一个奖项
      const prizePool = prizes.map((p: any) => ({
        id: p.id,
        weight: p.weight * p.remaining, // 剩余名额多的权重更高
      }));
      const [winnerPrizeId] = weightedDraw(prizePool, 1, drawSeed);
      const prize = prizes.find((p: any) => p.id === winnerPrizeId) ?? prizes[prizes.length - 1];

      // 记录结果
      await _execQuery(
        `INSERT INTO lottery_results (activity_id, prize_id, participant_id, winner_id, winner_name, random_seed, draw_index)
         VALUES (?,?,?,?,?,?,?)`,
        [input.activityId, prize.id, input.participantId,
         participant.user_id, participant.display_name, drawSeed, participant.draw_used]
      );

      // 更新已用次数
      await _execQuery(
        `UPDATE lottery_participants SET draw_used=draw_used+1 WHERE id=?`,
        [input.participantId]
      );

      return {
        prize: { id: prize.id, name: prize.name, description: prize.description, imageUrl: prize.image_url },
        drawSeed,
      };
    }),

  // ── 定时开奖（组织者触发） ────────────
  startDraw: protectedProcedure
    .input(z.object({ activityId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await ensureOrganizer(input.activityId, ctx.user.id);

      const [activity] = await _execQuery(
        `SELECT * FROM lottery_activities WHERE id=?`, [input.activityId]
      ) as any[];
      if (!activity) throw new TRPCError({ code: "NOT_FOUND" });
      if (activity.status !== "open") throw new TRPCError({ code: "BAD_REQUEST", message: "活动状态不允许开奖" });

      // 标记为开奖中
      await _execQuery(`UPDATE lottery_activities SET status='drawing' WHERE id=?`, [input.activityId]);

      // 获取所有已确认参与者
      const participants = await _execQuery(
        `SELECT * FROM lottery_participants WHERE activity_id=? AND status='confirmed'`,
        [input.activityId]
      ) as any[];

      // 获取奖项（按等级排序，高奖先抽）
      const prizes = await _execQuery(
        `SELECT * FROM lottery_prizes WHERE activity_id=? ORDER BY sort_order ASC`,
        [input.activityId]
      ) as any[];

      // ── 外部数据种子：拉取外部公认数据作为随机依据 ──
      let externalSeedValue: string | null = null;
      let externalSeedSource: string | null = null;
      if (activity.external_seed_type) {
        try {
          const seedDate = activity.external_seed_date
            ? new Date(activity.external_seed_date)
            : new Date();
          const dateStr = seedDate.toISOString().split('T')[0];
          if (activity.external_seed_type === 'sh_index' || activity.external_seed_type === 'sz_index') {
            // 沪深股市收盘价（Yahoo Finance）
            const symbol = activity.external_seed_type === 'sh_index' ? '000001.SS' : '399001.SZ';
            const indexName = activity.external_seed_type === 'sh_index' ? '上证指数' : '深证成指';
            const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
            const resp = await fetch(yahooUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const data = await resp.json() as any;
            const result = data?.chart?.result?.[0];
            if (result) {
              const timestamps: number[] = result.timestamp || [];
              const closes: number[] = result.indicators?.quote?.[0]?.close || [];
              // 找到最接近指定日期的收盘价
              let bestClose = closes[closes.length - 1];
              for (let i = 0; i < timestamps.length; i++) {
                const d = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
                if (d <= dateStr && closes[i]) bestClose = closes[i];
              }
              externalSeedValue = bestClose.toFixed(2);
              externalSeedSource = `${indexName}(${symbol}) ${dateStr} 收盘价: ${externalSeedValue} 点 | 数据来源: Yahoo Finance`;
            }
          } else if (activity.external_seed_type === 'ssq' || activity.external_seed_type === 'dlt') {
            // 双色球/大乐透：尝试从聚合数据 API 获取（需要 API key，否则用占位符提示）
            const lotteryName = activity.external_seed_type === 'ssq' ? '双色球' : '大乐透';
            const apiKey = process.env.JUHE_LOTTERY_API_KEY;
            if (apiKey) {
              const lotteryId = activity.external_seed_type === 'ssq' ? 'ssq' : 'dlt';
              const apiUrl = `https://apis.juhe.cn/lottery/query?lottery_id=${lotteryId}&lottery_no=&key=${apiKey}`;
              const resp = await fetch(apiUrl);
              const data = await resp.json() as any;
              if (data?.result?.data?.[0]) {
                const latest = data.result.data[0];
                const nums = latest.lottery_no || latest.preDrawNo || '';
                externalSeedValue = nums;
                externalSeedSource = `${lotteryName} 第${latest.lottery_id || ''}期 开奖号码: ${nums} | 数据来源: 聚合数据`;
              }
            } else {
              // 无 API Key 时，使用占位符（管理员需手动填入）
              externalSeedValue = `[待填入${lotteryName}开奖号码]`;
              externalSeedSource = `${lotteryName} ${dateStr} 开奖号码（请在开奖后手动填入）`;
            }
          }
          // 将外部数据写入数据库
          if (externalSeedValue) {
            await _execQuery(
              `UPDATE lottery_activities SET external_seed_value=?, external_seed_source=? WHERE id=?`,
              [externalSeedValue, externalSeedSource, input.activityId]
            );
          }
        } catch (err) {
          console.warn('[Lottery] Failed to fetch external seed data:', err);
        }
      }

      // 决定最终种子（如果开启了参与者共同决定）
      let finalSeed = activity.random_seed;
      // 如果有外部数据，将外部数据混入种子
      if (externalSeedValue) {
        finalSeed = crypto.createHash("sha256")
          .update(`${activity.random_seed}:external:${externalSeedValue}`)
          .digest("hex");
      }
      if (activity.use_participant_seed) {
        const allSeeds = participants
          .map((p: any) => p.participant_seed)
          .filter(Boolean)
          .join(":");
        finalSeed = crypto.createHash("sha256")
          .update(`${finalSeed}:${allSeeds}`)
          .digest("hex");
      }

      // 洗牌参与者
      const shuffled = seededShuffle(
        participants.map((p: any) => ({ id: p.id, userId: p.user_id, name: p.display_name, weight: 1 })),
        finalSeed
      );

      // 按奖项分配中奖者（高奖先抽，中奖者不重复参与低奖）
      const winners: Array<{ prizeId: number; prizeName: string; participantId: number; winnerName: string; drawIndex: number }> = [];
      const usedParticipantIds = new Set<number>();

      for (const prize of prizes) {
        if (prize.is_consolation) continue; // 保底奖最后处理
        const available = shuffled.filter((p: any) => !usedParticipantIds.has(p.id));
        const count = Math.min(prize.quantity, available.length);
        for (let i = 0; i < count; i++) {
          const winner = available[i];
          winners.push({
            prizeId: prize.id,
            prizeName: prize.name,
            participantId: winner.id,
            winnerName: winner.name,
            drawIndex: winners.length,
          });
          usedParticipantIds.add(winner.id);
        }
      }

      // 保底奖：剩余参与者全部获得
      const consolationPrize = prizes.find((p: any) => p.is_consolation);
      if (consolationPrize) {
        const remaining = shuffled.filter((p: any) => !usedParticipantIds.has(p.id));
        for (const p of remaining) {
          winners.push({
            prizeId: consolationPrize.id,
            prizeName: consolationPrize.name,
            participantId: p.id,
            winnerName: p.name,
            drawIndex: winners.length,
          });
        }
      }

      // 批量写入结果
      for (const w of winners) {
        await _execQuery(
          `INSERT INTO lottery_results (activity_id, prize_id, participant_id, winner_id, winner_name, random_seed, draw_index)
           SELECT ?, ?, ?, lp.user_id, ?, ?, ?
           FROM lottery_participants lp WHERE lp.id=?`,
          [input.activityId, w.prizeId, w.participantId, w.winnerName, finalSeed, w.drawIndex, w.participantId]
        );
      }

      // 更新活动状态为已完成，公布种子
      await _execQuery(
        `UPDATE lottery_activities SET status='completed', random_seed=? WHERE id=?`,
        [finalSeed, input.activityId]
      );

      return { winners, finalSeed };
    }),

  // ── 获取开奖结果（公开） ──────────────────
  getResults: publicProcedure
    .input(z.object({ activityId: z.number() }))
    .query(async ({ input }) => {
      const results = await _execQuery(
        `SELECT r.*, p.name AS prize_name, p.description AS prize_description, p.image_url AS prize_image,
                p.sort_order AS prize_sort_order
         FROM lottery_results r
         JOIN lottery_prizes p ON r.prize_id = p.id
         WHERE r.activity_id=?
         ORDER BY p.sort_order ASC, r.draw_index ASC`,
        [input.activityId]
      ) as any[];
      // 将 INT/BigInt 字段转为 Number，防止 React 渲染崩溃
      const normalizedResults = results.map((r: any) => ({
        ...r,
        prize_sort_order: Number(r.prize_sort_order ?? 0),
        draw_index: Number(r.draw_index ?? 0),
        prize_id: Number(r.prize_id ?? 0),
        participant_id: Number(r.participant_id ?? 0),
        winner_id: r.winner_id != null ? Number(r.winner_id) : null,
      }));

      const [activity] = await _execQuery(
        `SELECT random_seed, random_seed_hash, use_participant_seed FROM lottery_activities WHERE id=?`,
        [input.activityId]
      ) as any[];

      return { results: normalizedResults, fairnessInfo: activity };
    }),

  // ── 删除活动（物理删除） ──────────────────────
  deleteActivity: protectedProcedure
    .input(z.object({ activityId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await ensureOrganizer(input.activityId, ctx.user.id);
      // 先删除关联数据，再删除活动本身
      await _execQuery(`DELETE FROM lottery_results WHERE activity_id=?`, [input.activityId]);
      await _execQuery(`DELETE FROM lottery_participants WHERE activity_id=?`, [input.activityId]);
      await _execQuery(`DELETE FROM lottery_prizes WHERE activity_id=?`, [input.activityId]);
      await _execQuery(`DELETE FROM lottery_activities WHERE id=?`, [input.activityId]);
      return { success: true };
    }),

  // ── 公平性验证 ────────────────────────────
  verifyFairness: publicProcedure
    .input(z.object({ activityId: z.number() }))
    .query(async ({ input }) => {
      const [activity] = await _execQuery(
        `SELECT random_seed, random_seed_hash FROM lottery_activities WHERE id=?`,
        [input.activityId]
      ) as any[];
      if (!activity?.random_seed) {
        return { verified: false, message: "活动尚未开奖或种子未公布" };
      }
      const computedHash = crypto.createHash("sha256")
        .update(activity.random_seed).digest("hex");
      const verified = computedHash === activity.random_seed_hash;
      return {
        verified,
        seed: activity.random_seed,
        seedHash: activity.random_seed_hash,
        computedHash,
        message: verified ? "✓ 验证通过，开奖结果未被篡改" : "✗ 验证失败，种子与哈希不匹配",
      };
    }),
});

// ─────────────────────────────────────────────
// 辅助：验证组织者权限
// ─────────────────────────────────────────────
async function ensureOrganizer(activityId: number, userId: number) {
  const [activity] = await _execQuery(
    `SELECT a.created_by, a.ledger_id FROM lottery_activities a WHERE a.id=?`,
    [activityId]
  ) as any[];
  if (!activity) throw new TRPCError({ code: "NOT_FOUND" });

  if (activity.created_by === userId) return; // 创建者直接通过

  const [member] = await _execQuery(
    `SELECT role FROM ledger_members WHERE ledgerId=? AND userId=?`,
    [activity.ledger_id, userId]
  ) as any[];
  if (!member || !["owner", "admin"].includes(member.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "无权限操作此抽奖" });
  }
}
