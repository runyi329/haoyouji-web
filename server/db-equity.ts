import { getDb } from "./db";
import { equityInvestments, equityRules, equityContributions, users, contacts } from "../drizzle/schema";
import { eq, sql, sum, and, inArray } from "drizzle-orm";

/**
 * 获取股权规则配置
 */
export async function getEquityRules() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const rules = await db.select().from(equityRules);
  
  // 转换为键值对对象
  const rulesMap: Record<string, number> = {};
  for (const rule of rules) {
    rulesMap[rule.ruleKey] = Number(rule.ruleValue);
  }
  
  return rulesMap;
}

/**
 * 更新股权规则
 */
export async function updateEquityRule(ruleKey: string, ruleValue: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .update(equityRules)
    .set({ ruleValue: ruleValue.toString() })
    .where(eq(equityRules.ruleKey, ruleKey));
  
  return { success: true };
}

/**
 * 插入或更新股权规则（upsert）
 * 使用drizzle ORM的insert + onDuplicateKeyUpdate确保可靠性
 */
export async function upsertEquityRule(ruleKey: string, ruleValue: number, ruleDescription?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const desc = ruleDescription || ruleKey;
  const valStr = Number(ruleValue).toFixed(4);
  
  console.log(`[upsertEquityRule] key=${ruleKey}, value=${valStr}, desc=${desc}`);
  
  try {
    // 方法一：先查后插/更
    const existing = await db
      .select()
      .from(equityRules)
      .where(eq(equityRules.ruleKey, ruleKey));
    
    if (existing.length > 0) {
      console.log(`[upsertEquityRule] Updating existing rule: ${ruleKey}`);
      await db
        .update(equityRules)
        .set({
          ruleValue: valStr,
          ruleDescription: desc,
        })
        .where(eq(equityRules.ruleKey, ruleKey));
    } else {
      console.log(`[upsertEquityRule] Inserting new rule: ${ruleKey}`);
      await db
        .insert(equityRules)
        .values({
          ruleKey: ruleKey,
          ruleValue: valStr,
          ruleDescription: desc,
        });
      console.log(`[upsertEquityRule] Insert completed for: ${ruleKey}`);
    }
    
    // 验证写入是否成功
    const verify = await db
      .select()
      .from(equityRules)
      .where(eq(equityRules.ruleKey, ruleKey));
    console.log(`[upsertEquityRule] Verify result for ${ruleKey}:`, verify.length > 0 ? 'EXISTS' : 'NOT FOUND');
    
    return { success: true };
  } catch (error: any) {
    console.error(`[upsertEquityRule] Error for ${ruleKey}:`, error.message);
    throw error;
  }
}

/**
 * 删除股权规则
 */
export async function deleteEquityRule(ruleKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .delete(equityRules)
    .where(eq(equityRules.ruleKey, ruleKey));
  
  return { success: true };
}

/**
 * 获取所有规则详情（包含描述）
 */
export async function getEquityRulesDetail() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const rules = await db.select().from(equityRules);
  return rules.map(r => ({
    ruleKey: r.ruleKey,
    ruleValue: Number(r.ruleValue),
    ruleDescription: r.ruleDescription,
  }));
}

/**
 * 获取所有投资记录
 */
export async function getAllInvestments() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const investments = await db
    .select({
      id: equityInvestments.id,
      userId: equityInvestments.userId,
      userName: users.name,
      username: users.username,
      investorName: equityInvestments.investorName,
      investorIdCard: equityInvestments.investorIdCard,
      investmentAmount: equityInvestments.investmentAmount,
      investmentDate: equityInvestments.investmentDate,
      notes: equityInvestments.notes,
    })
    .from(equityInvestments)
    .leftJoin(users, eq(equityInvestments.userId, users.id))
    .orderBy(equityInvestments.investmentDate);
  
  return investments;
}

/**
 * 获取用户的投资记录
 */
export async function getUserInvestments(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const investments = await db
    .select()
    .from(equityInvestments)
    .where(eq(equityInvestments.userId, userId))
    .orderBy(equityInvestments.investmentDate);
  
  return investments;
}

/**
 * 添加投资记录
 */
export async function addInvestment(
  userId: number,
  investorName?: string,
  investorIdCard?: string,
  amount?: number,
  investmentDate?: string,
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  if (!amount) throw new Error("Investment amount is required");
  
  // 如果传入了投资日期，使用传入的日期；否则用当前时间
  let dateStr: string;
  if (investmentDate) {
    // 前端传入的是 YYYY-MM-DD 格式，补上时间部分
    dateStr = `${investmentDate} 00:00:00`;
  } else {
    const now = new Date();
    dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  }
  
  const [result] = await db
    .insert(equityInvestments)
    .values({
      userId,
      investorName: investorName || null,
      investorIdCard: investorIdCard || null,
      investmentAmount: amount.toFixed(2),
      investmentDate: dateStr,
      notes: notes || null,
    });
  
  return { success: true, id: result.insertId };
}

/**
 * 更新投资记录
 */
export async function updateInvestment(
  id: number,
  amount: number,
  investorName?: string,
  investorIdCard?: string,
  investmentDate?: string,
  notes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const updateData: any = {
    investmentAmount: amount.toString(),
    notes: notes || null,
    investorName: investorName || null,
    investorIdCard: investorIdCard || null,
  };
  
  if (investmentDate) {
    updateData.investmentDate = `${investmentDate} 00:00:00`;
  }
  
  await db
    .update(equityInvestments)
    .set(updateData)
    .where(eq(equityInvestments.id, id));
  
  return { success: true };
}

/**
 * 删除投资记录
 */
export async function deleteInvestment(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db
    .delete(equityInvestments)
    .where(eq(equityInvestments.id, id));
  
  return { success: true };
}

/**
 * 获取用户的席位编号（按首笔投资时间排序）
 * 每个用户只取第一笔投资的时间来排序
 */
export async function getUserSeatNumber(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 获取每个用户的首笔投资时间，按时间排序
  const firstInvestments = await db.execute(sql`
    SELECT user_id, MIN(investment_date) as first_investment_date
    FROM equity_investments
    GROUP BY user_id
    ORDER BY first_investment_date ASC
  `);
  
  // 兼容不同数据库驱动的返回格式
  const rawRows = Array.isArray(firstInvestments) 
    ? (Array.isArray(firstInvestments[0]) ? firstInvestments[0] : firstInvestments)
    : (firstInvestments.rows || []);
  const rows = rawRows as { user_id: number; first_investment_date: string }[];
  const seatIndex = rows.findIndex(r => Number(r.user_id) === userId);
  
  if (seatIndex === -1) {
    return { seatNumber: 0, totalSeats: rows.length };
  }
  
  return {
    seatNumber: seatIndex + 1, // 1-based
    totalSeats: rows.length,
  };
}

/**
 * 获取所有用户的席位编号映射（按首笔投资时间排序）
 */
export async function getAllSeatNumbers(): Promise<Map<number, number>> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const firstInvestments = await db.execute(sql`
    SELECT user_id, MIN(investment_date) as first_investment_date
    FROM equity_investments
    GROUP BY user_id
    ORDER BY first_investment_date ASC
  `);
  
  const rawRows = Array.isArray(firstInvestments) 
    ? (Array.isArray(firstInvestments[0]) ? firstInvestments[0] : firstInvestments)
    : (firstInvestments.rows || []);
  const rows = rawRows as { user_id: number; first_investment_date: string }[];
  
  const seatMap = new Map<number, number>();
  rows.forEach((row, index) => {
    seatMap.set(Number(row.user_id), index + 1);
  });
  
  return seatMap;
}

/**
 * 计算动态杠杆系数
 * 基于席位编号，越早进入杠杆越高
 * 波次管理：T1创始波次 2.0x→1.8x，T2加速波次 1.8x→1.5x，T3标准波次 1.5x→1.2x
 * 每位微减 0.0001
 */
export function calculateDynamicLeverage(seatNumber: number, totalSeats: number) {
  // 波次配置（后续可改为从数据库读取）
  const rounds = [
    { name: 'T1 创始波次', maxLeverage: 2.0, minLeverage: 1.8, label: '创始轮' },
    { name: 'T2 加速波次', maxLeverage: 1.8, minLeverage: 1.5, label: '加速轮' },
    { name: 'T3 标准波次', maxLeverage: 1.5, minLeverage: 1.2, label: '标准轮' },
  ];
  
  // 当前波次进度（模拟数据：85%，后续可从数据库读取）
  const currentRoundIndex = 0; // T1创始波次
  const currentRoundProgress = 0.85; // 85%已消耗
  
  const currentRound = rounds[currentRoundIndex];
  const nextRound = rounds[currentRoundIndex + 1];
  
  // 基于席位编号计算精确杠杆
  // 在当前波次范围内线性递减：每位减少 0.0001
  const decayPerSeat = 0.0001;
  const baseLeverage = currentRound.maxLeverage - (seatNumber - 1) * decayPerSeat;
  // 确保不低于当前波次最小值
  const leverage = Math.max(currentRound.minLeverage, baseLeverage);
  
  // 犹豫成本：下一波次的杠杆预估
  const nextRoundLeverage = nextRound ? nextRound.maxLeverage : 1.0;
  
  return {
    leverage: Number(leverage.toFixed(4)),
    seatNumber,
    totalSeats,
    currentRound: {
      name: currentRound.name,
      label: currentRound.label,
      maxLeverage: currentRound.maxLeverage,
      minLeverage: currentRound.minLeverage,
      progress: currentRoundProgress,
    },
    nextRound: nextRound ? {
      name: nextRound.name,
      label: nextRound.label,
      maxLeverage: nextRound.maxLeverage,
    } : null,
    nextRoundLeverage,
    hesitationCost: Number((leverage - nextRoundLeverage).toFixed(4)),
  };
}

/**
 * 计算用户的股权信息
 */
export async function calculateUserEquity(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 获取规则配置
  const rules = await getEquityRules();
  const investmentPoolPercentage = rules['investment_pool_percentage'] || 33.3333;
  const invitePerUserPercentage = rules['invite_per_user_percentage'] || 0.05;
  const referralNetworkPer100Percentage = rules['referral_network_per_100_percentage'] || 0.02;
  
  // 2. 计算投资股份
  // 获取所有投资总额
  const [totalInvestmentResult] = await db
    .select({ total: sum(equityInvestments.investmentAmount) })
    .from(equityInvestments);
  
  const totalInvestment = Number(totalInvestmentResult?.total || 0);
  
  // 获取用户投资总额
  const [userInvestmentResult] = await db
    .select({ total: sum(equityInvestments.investmentAmount) })
    .from(equityInvestments)
    .where(eq(equityInvestments.userId, userId));
  
  const userInvestment = Number(userInvestmentResult?.total || 0);
  
  // 计算投资股份百分比
  let investmentEquity = 0;
  if (totalInvestment > 0 && userInvestment > 0) {
    investmentEquity = (userInvestment / totalInvestment) * investmentPoolPercentage;
  }
  
  // 3. 计算邀请贡献和人脉贡献
  // 核心逻辑：只有有投资记录的用户（股东）才计算市场贡献股份
  let inviteCount = 0;
  let inviteEquity = 0;
  let referralNetworkCount = 0;
  let referralNetworkEquity = 0;
  
  if (userInvestment > 0) {
    // 用户有投资记录，才计算贡献股份
    const [user] = await db
      .select({ inviteCount: users.inviteCount })
      .from(users)
      .where(eq(users.id, userId));
    
    inviteCount = user?.inviteCount || 0;
    inviteEquity = inviteCount * invitePerUserPercentage;
    
    // 4. 计算人脉贡献（被邀请人的人脉总数）
    const invitedUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.invitedByUserId, userId));
    
    const invitedUserIds = invitedUsers.map(u => u.id);
    
    if (invitedUserIds.length > 0) {
      const [networkResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(contacts)
        .where(inArray(contacts.parentUserId, invitedUserIds));
      
      referralNetworkCount = Number(networkResult?.count || 0);
    }
    
    referralNetworkEquity = Math.floor(referralNetworkCount / 100) * referralNetworkPer100Percentage;
  }
  // 如果用户没有投资记录，inviteEquity 和 referralNetworkEquity 保持为 0
  
  // 5. 计算总股份
  const totalEquity = investmentEquity + inviteEquity + referralNetworkEquity;
  
  return {
    totalEquity: Number(totalEquity.toFixed(4)),
    investmentEquity: Number(investmentEquity.toFixed(4)),
    inviteEquity: Number(inviteEquity.toFixed(4)),
    referralNetworkEquity: Number(referralNetworkEquity.toFixed(4)),
    details: {
      userInvestment,
      totalInvestment,
      inviteCount,
      referralNetworkCount,
    },
  };
}

/**
 * 获取所有股东的股权信息
 */
export async function getAllShareholdersEquity() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 获取所有有投资记录的用户
  const investors = await db
    .select({
      userId: equityInvestments.userId,
      userName: users.name,
      username: users.username,
    })
    .from(equityInvestments)
    .leftJoin(users, eq(equityInvestments.userId, users.id))
    .groupBy(equityInvestments.userId, users.name, users.username);
  
  // 计算每个股东的股权
  const shareholdersEquity = [];
  for (const investor of investors) {
    if (!investor.userId) continue;
    
    const equity = await calculateUserEquity(investor.userId);
    shareholdersEquity.push({
      userId: investor.userId,
      userName: investor.userName || investor.username || '未知',
      ...equity,
    });
  }
  
  // 按总股份降序排序
  shareholdersEquity.sort((a, b) => b.totalEquity - a.totalEquity);
  
  return shareholdersEquity;
}

/**
 * 获取估值历史
 */
export async function getValuationHistory() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const history = await db.execute(sql`
    SELECT valuation, record_date as recordDate
    FROM equity_valuation_history
    ORDER BY record_date ASC
  `);
  
  return history.rows as { valuation: string; recordDate: string }[];
}

/**
 * 获取股东排名信息
 */
export async function getShareholderRanking(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 获取所有股东的股份，按降序排列
  const allShareholders = await getAllShareholdersEquity();
  const sorted = allShareholders
    .filter(s => s.totalEquity > 0)
    .sort((a, b) => b.totalEquity - a.totalEquity);
  
  const userIndex = sorted.findIndex(s => s.userId === userId);
  if (userIndex === -1) {
    return {
      rank: sorted.length + 1,
      total: sorted.length,
      gapToNext: 0,
    };
  }
  
  const gapToNext = userIndex > 0 ? sorted[userIndex - 1].totalEquity - sorted[userIndex].totalEquity : 0;
  
  return {
    rank: userIndex + 1,
    total: sorted.length,
    gapToNext,
  };
}

/**
 * 获取股份池状态（总额、已分配、剩余）
 */
export async function getPoolStatus() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const rules = await db.select().from(equityRules);
  const poolRules = rules.filter(r => r.ruleKey.includes('pool') && r.ruleKey.endsWith('_percentage'));
  
  const allShareholders = await getAllShareholdersEquity();
  
  const poolStatus = poolRules.map(rule => {
    const poolKey = rule.ruleKey.replace('_percentage', '');
    let allocated = 0;
    
    if (poolKey === 'investment_pool') {
      allocated = allShareholders.reduce((sum, s) => sum + s.investmentEquity, 0);
    } else if (poolKey === 'contribution_pool') {
      allocated = allShareholders.reduce((sum, s) => sum + s.inviteEquity + s.referralNetworkEquity, 0);
    }
    
    const total = Number(rule.ruleValue);
    const remaining = Math.max(0, total - allocated);
    
    return {
      poolName: rule.ruleDescription || rule.ruleKey,
      poolKey: rule.ruleKey,
      total,
      allocated,
      remaining,
      allocationRate: total > 0 ? (allocated / total) * 100 : 0,
    };
  });
  
  return poolStatus;
}

/**
 * 获取最近动态（脱敏处理）
 */
export async function getRecentActivities(limit: number = 10) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const activities = await db.execute(sql`
    SELECT 
      ea.activity_type as activityType,
      ea.value,
      ea.created_at as createdAt,
      u.username
    FROM equity_activities ea
    LEFT JOIN users u ON ea.user_id = u.id
    ORDER BY ea.created_at DESC
    LIMIT ${limit}
  `);
  
  // 脱敏处理：隐藏用户名中间字符
  return (activities.rows as any[]).map(a => {
    const username = a.username || '匿名用户';
    const maskedName = username.length > 2 
      ? username[0] + 'X'.repeat(username.length - 2) + username[username.length - 1]
      : username[0] + 'X';
    
    return {
      activityType: a.activityType,
      value: Number(a.value),
      createdAt: a.createdAt,
      username: maskedName,
    };
  });
}

/**
 * 记录股权动态
 */
export async function recordActivity(userId: number, activityType: 'investment' | 'invite', value: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.execute(sql`
    INSERT INTO equity_activities (user_id, activity_type, value)
    VALUES (${userId}, ${activityType}, ${value})
  `);
}
