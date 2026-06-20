import { getDb } from "./db";
import { sql } from "drizzle-orm";

/**
 * AI操作速率限制配置
 * 
 * 修改方法：
 * 1. 找到下面的 RATE_LIMITS 配置对象
 * 2. 修改对应操作的限制数值
 * 3. 重新构建并重启服务器
 */
export const RATE_LIMITS = {
  // 添加人脉
  add_contact: {
    perMinute: 10,   // 每分钟最多10次
    perHour: 50,     // 每小时最多50次
    perDay: 200,     // 每天最多200次
  },
  
  // 修改人脉
  update_contact: {
    perMinute: 20,   // 每分钟最多20次
    perHour: 100,    // 每小时最多100次
    perDay: 500,     // 每天最多500次
  },
  
  // 删除人脉
  delete_contact: {
    perMinute: 5,    // 每分钟最多5次（敏感操作）
    perHour: 20,     // 每小时最多20次
    perDay: 50,      // 每天最多50次
  },
  
  // 添加联络记录
  add_interaction: {
    perMinute: 15,   // 每分钟最多15次
    perHour: 100,    // 每小时最多100次
    perDay: 500,     // 每天最多500次
  },
  
  // 标签操作
  tag_operation: {
    perMinute: 20,   // 每分钟最多20次
    perHour: 100,    // 每小时最多100次
    perDay: 500,     // 每天最多500次
  },
  
  // 扩展字段操作
  field_operation: {
    perMinute: 20,   // 每分钟最多20次
    perHour: 100,    // 每小时最多100次
    perDay: 500,     // 每天最多500次
  },
};

/**
 * 操作日志表结构（如果不存在则自动创建）
 */
async function ensureLogTable() {
  const db = await getDb();
  if (!db) return;

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ai_operation_logs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      operation_type VARCHAR(50) NOT NULL,
      details JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_operation (user_id, operation_type, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

/**
 * 记录操作日志
 */
export async function logAIOperation(
  userId: number,
  operationType: string,
  details: any = {}
) {
  try {
    await ensureLogTable();
    const db = await getDb();
    if (!db) return;

    await db.execute(sql`
      INSERT INTO ai_operation_logs (user_id, operation_type, details)
      VALUES (${userId}, ${operationType}, ${JSON.stringify(details)})
    `);
  } catch (error) {
    console.error("[AI Rate Limit] 记录日志失败:", error);
  }
}

/**
 * 获取最近的操作次数
 */
async function getRecentOperationCount(
  userId: number,
  operationType: string,
  seconds: number
): Promise<number> {
  try {
    await ensureLogTable();
    const db = await getDb();
    if (!db) return 0;

    const result = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM ai_operation_logs
      WHERE user_id = ${userId}
        AND operation_type = ${operationType}
        AND created_at > DATE_SUB(NOW(), INTERVAL ${seconds} SECOND)
    `);

    return (result[0] as any)?.count || 0;
  } catch (error) {
    console.error("[AI Rate Limit] 查询操作次数失败:", error);
    return 0;
  }
}

/**
 * 检查速率限制
 * 
 * @param userId 用户ID
 * @param operationType 操作类型（如 'add_contact'）
 * @throws Error 如果超过限制
 */
export async function checkRateLimit(
  userId: number,
  operationType: keyof typeof RATE_LIMITS
) {
  const limits = RATE_LIMITS[operationType];
  if (!limits) {
    console.warn(`[AI Rate Limit] 未定义的操作类型: ${operationType}`);
    return;
  }

  // 检查每分钟限制
  if (limits.perMinute) {
    const countPerMinute = await getRecentOperationCount(userId, operationType, 60);
    if (countPerMinute >= limits.perMinute) {
      throw new Error(
        `操作过于频繁，请稍后再试。每分钟最多 ${limits.perMinute} 次。`
      );
    }
  }

  // 检查每小时限制
  if (limits.perHour) {
    const countPerHour = await getRecentOperationCount(userId, operationType, 3600);
    if (countPerHour >= limits.perHour) {
      throw new Error(
        `操作过于频繁，请稍后再试。每小时最多 ${limits.perHour} 次。`
      );
    }
  }

  // 检查每天限制
  if (limits.perDay) {
    const countPerDay = await getRecentOperationCount(userId, operationType, 86400);
    if (countPerDay >= limits.perDay) {
      throw new Error(
        `今日操作次数已达上限。每天最多 ${limits.perDay} 次。`
      );
    }
  }
}

/**
 * 获取用户的操作统计
 */
export async function getUserOperationStats(userId: number) {
  try {
    await ensureLogTable();
    const db = await getDb();
    if (!db) return {};

    const stats: any = {};

    for (const [operationType, limits] of Object.entries(RATE_LIMITS)) {
      const countPerMinute = await getRecentOperationCount(userId, operationType, 60);
      const countPerHour = await getRecentOperationCount(userId, operationType, 3600);
      const countPerDay = await getRecentOperationCount(userId, operationType, 86400);

      stats[operationType] = {
        perMinute: {
          used: countPerMinute,
          limit: limits.perMinute,
          remaining: Math.max(0, limits.perMinute - countPerMinute),
        },
        perHour: {
          used: countPerHour,
          limit: limits.perHour,
          remaining: Math.max(0, limits.perHour - countPerHour),
        },
        perDay: {
          used: countPerDay,
          limit: limits.perDay,
          remaining: Math.max(0, limits.perDay - countPerDay),
        },
      };
    }

    return stats;
  } catch (error) {
    console.error("[AI Rate Limit] 获取统计失败:", error);
    return {};
  }
}
