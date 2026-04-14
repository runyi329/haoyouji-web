import { getDb } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

/**
 * AI会话管理模块
 * 负责会话的创建、查询、更新和删除
 */

/**
 * 创建新会话
 * @param userId 用户ID
 * @param title 会话标题（可选）
 * @returns 会话ID
 */
export async function createSession(userId: number, title: string = "新对话"): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.execute(
    `INSERT INTO ai_sessions (user_id, title) VALUES (?, ?)`,
    [userId, title]
  );

  // 获取插入的ID
  const insertId = (result as any).insertId;
  console.log(`[AI Session] Created session ${insertId} for user ${userId}`);
  
  return insertId;
}

/**
 * 获取用户的会话列表
 * @param userId 用户ID
 * @param page 页码（从1开始）
 * @param limit 每页数量
 * @returns 会话列表和总数
 */
export async function getUserSessions(userId: number, page: number = 1, limit: number = 20) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 200));
  const offset = (page - 1) * safeLimit;

  // 查询会话列表
  const sessions = await db.execute(
    `SELECT id, title, total_tokens, total_cost, message_count, created_at, updated_at
     FROM ai_sessions
     WHERE user_id = ?
     ORDER BY updated_at DESC
     LIMIT ${safeLimit} OFFSET ${offset}`,
    [userId]
  );

  // 查询总数
  const countResult = await db.execute(
    `SELECT COUNT(*) as total FROM ai_sessions WHERE user_id = ?`,
    [userId]
  );

  const total = (countResult as any)[0]?.total || 0;
  const sessionList = Array.isArray(sessions) ? sessions : (sessions.rows || []);

  return {
    sessions: sessionList,
    total,
    page,
    limit,
  };
}

/**
 * 获取会话详情（包含所有消息）
 * @param sessionId 会话ID
 * @param userId 用户ID（用于权限验证）
 * @returns 会话详情和消息列表
 */
export async function getSessionDetail(sessionId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 查询会话信息
  const sessionResult = await db.execute(
    `SELECT * FROM ai_sessions WHERE id = ? AND user_id = ?`,
    [sessionId, userId]
  );

  const session = Array.isArray(sessionResult) ? sessionResult[0] : (sessionResult.rows?.[0] || null);

  if (!session) {
    throw new Error("会话不存在或无权访问");
  }

  // 查询消息列表
  const messagesResult = await db.execute(
    `SELECT * FROM ai_messages WHERE session_id = ? ORDER BY created_at ASC`,
    [sessionId]
  );

  const messages = Array.isArray(messagesResult) ? messagesResult : (messagesResult.rows || []);

  return {
    session,
    messages,
  };
}

/**
 * 更新会话标题
 * @param sessionId 会话ID
 * @param userId 用户ID（用于权限验证）
 * @param title 新标题
 */
export async function updateSessionTitle(sessionId: number, userId: number, title: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.execute(
    `UPDATE ai_sessions SET title = ?, updated_at = NOW() WHERE id = ? AND user_id = ?`,
    [title, sessionId, userId]
  );

  console.log(`[AI Session] Updated session ${sessionId} title to "${title}"`);
}

/**
 * 删除会话（级联删除所有消息）
 * @param sessionId 会话ID
 * @param userId 用户ID（用于权限验证）
 */
export async function deleteSession(sessionId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 由于设置了外键级联删除，删除会话会自动删除所有消息
  await db.execute(
    `DELETE FROM ai_sessions WHERE id = ? AND user_id = ?`,
    [sessionId, userId]
  );

  console.log(`[AI Session] Deleted session ${sessionId}`);
}

/**
 * 保存消息到会话
 * @param sessionId 会话ID
 * @param role 消息角色（user/assistant/system）
 * @param content 消息内容
 * @param tokensUsed 消耗的token数（可选）
 * @param cost 费用（可选）
 * @returns 消息ID
 */
export async function saveMessage(
  sessionId: number,
  role: string,
  content: string,
  tokensUsed: number = 0,
  cost: number = 0
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.execute(
    `INSERT INTO ai_messages (session_id, role, content, tokens_used, cost) 
     VALUES (?, ?, ?, ?, ?)`,
    [sessionId, role, content, tokensUsed, cost]
  );

  const messageId = (result as any).insertId;

  // 更新会话统计
  await db.execute(
    `UPDATE ai_sessions 
     SET message_count = message_count + 1,
         total_tokens = total_tokens + ?,
         total_cost = total_cost + ?,
         updated_at = NOW()
     WHERE id = ?`,
    [tokensUsed, cost, sessionId]
  );

  console.log(`[AI Message] Saved message ${messageId} to session ${sessionId}`);
  
  return messageId;
}

/**
 * 根据第一条用户消息自动生成会话标题
 * @param sessionId 会话ID
 * @param userId 用户ID
 * @param firstMessage 第一条用户消息
 */
export async function autoGenerateSessionTitle(
  sessionId: number,
  userId: number,
  firstMessage: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // 截取前20个字符作为标题
  let title = firstMessage.substring(0, 20);
  if (firstMessage.length > 20) {
    title += "...";
  }

  await updateSessionTitle(sessionId, userId, title);
}

/**
 * 获取会话的消息历史（用于AI上下文）
 * @param sessionId 会话ID
 * @param limit 最多返回多少条消息（默认20条）
 * @returns 消息历史数组
 */
export async function getSessionHistory(sessionId: number, limit: number = 20) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 200));
  const messagesResult = await db.execute(
    `SELECT role, content FROM ai_messages 
     WHERE session_id = ? AND role IN ('user', 'assistant')
     ORDER BY created_at DESC
     LIMIT ${safeLimit}`,
    [sessionId]
  );

  const messages = Array.isArray(messagesResult) ? messagesResult : (messagesResult.rows || []);

  // 反转顺序（最早的在前）
  return messages.reverse().map((msg: any) => ({
    role: msg.role,
    content: msg.content,
  }));
}
