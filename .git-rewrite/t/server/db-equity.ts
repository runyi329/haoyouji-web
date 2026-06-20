import { getDb } from "./db";
import { equityInvestments, equityRules, equityContributions, users, contacts, contactTags, personalContactTags, contactInteractions } from "../drizzle/schema";
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
  
  // 获取每个用户的首笔投资时间，按时间排序，日期相同时按记录创建时间排序
  const firstInvestments = await db.execute(sql`
    SELECT user_id, MIN(investment_date) as first_investment_date, MIN(created_at) as first_created_at
    FROM equity_investments
    GROUP BY user_id
    ORDER BY first_investment_date ASC, first_created_at ASC
  `);
  
  // 兼容不同数据库驱动的返回格式
  const rawRows = Array.isArray(firstInvestments) 
    ? (Array.isArray(firstInvestments[0]) ? firstInvestments[0] : firstInvestments)
    : (firstInvestments.rows || []);
  const rows = rawRows as { user_id: number; first_investment_date: string; first_created_at: string }[];
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
    SELECT user_id, MIN(investment_date) as first_investment_date, MIN(created_at) as first_created_at
    FROM equity_investments
    GROUP BY user_id
    ORDER BY first_investment_date ASC, first_created_at ASC
  `);
  
  const rawRows = Array.isArray(firstInvestments) 
    ? (Array.isArray(firstInvestments[0]) ? firstInvestments[0] : firstInvestments)
    : (firstInvestments.rows || []);
  const rows = rawRows as { user_id: number; first_investment_date: string; first_created_at: string }[];
  
  const seatMap = new Map<number, number>();
  rows.forEach((row, index) => {
    seatMap.set(Number(row.user_id), index + 1);
  });
  
  return seatMap;
}

/**
 * 计算动态杠杆系数（资本加速系数）
 * 基于席位编号，越早进入系数越高
 * 新公式：1.0 + 2.0 × √((660 - seatNumber) / 659)
 * 第1名：3.0x，第660名：1.0x
 */
export function calculateDynamicLeverage(seatNumber: number, totalSeats: number) {
  // 新公式：曲线衰减，从 3.0 到 1.0
  let leverage: number;
  
  if (seatNumber < 1) {
    leverage = 0.0; // 没有编号
  } else if (seatNumber > 660) {
    leverage = 1.0; // 超过660名
  } else {
    // 公式：1.0 + 2.0 × √((660 - seatNumber) / 659)
    leverage = 1.0 + 2.0 * Math.sqrt((660 - seatNumber) / 659);
  }
  
  return {
    leverage: Number(leverage.toFixed(4)),
    seatNumber,
    totalSeats,
    // 保留这些字段以保持API兼容性，但不再使用波次逻辑
    currentRound: null,
    nextRound: null,
    nextRoundLeverage: null,
    hesitationCost: null,
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
  // 核心逻辑：只有有投资记录的用户（股东）才计算市场资源股份
  let inviteCount = 0;
  let inviteEquity = 0;
  let referralNetworkCount = 0;
  let referralNetworkEquity = 0;
  
  if (userInvestment > 0) {
    // 用户有投资记录，才计算资源股份
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
  
  // 5. 计算资本加速明细
  const seatInfo = await getUserSeatNumber(userId);
  const seatNumber = seatInfo.seatNumber;
  const leverageInfo = calculateDynamicLeverage(seatNumber, 660);
  const originalAcceleration = leverageInfo.leverage;
  
  // 计算实际加速：基于原始加速的比例计算
  // 公式：实际加速 = 原始加速 × (投资万数 / 10)
  // 当投资10万时，实际加速 = 原始加速
  // 投资额单位：元，需要转换为万元
  const investmentInWan = userInvestment / 10000; // 转换为万元
  let actualAcceleration = 0;
  
  if (investmentInWan > 0) {
    if (investmentInWan >= 10) {
      // 投资额 >= 10万：实际加速 = 原始加速
      actualAcceleration = originalAcceleration;
    } else {
      // 投资额 < 10万：实际加速 = 原始加速 × (投资万数 / 10)
      actualAcceleration = originalAcceleration * (investmentInWan / 10);
    }
  }
  
  // 6. 计算资源加速明细
  const promotionStats = await getUserPromotionStats(userId);
  const hasInvestment = userInvestment > 0;
  
  // 计算资源加速倍数
  let resourceAcceleration = 1.0;
  if (promotionStats.currentLevel === 'standard' || promotionStats.currentLevel === 'standard_user') {
    resourceAcceleration = 1.0;
  } else if (promotionStats.currentLevel === 'advanced' || promotionStats.currentLevel === 'advanced_user') {
    resourceAcceleration = 2.0;
  } else if (promotionStats.currentLevel === 'super' || promotionStats.currentLevel === 'super_user') {
    resourceAcceleration = 3.0;
  }
  
  // 7. 计算总股份
  const totalEquity = investmentEquity + inviteEquity + referralNetworkEquity;
  
  return {
    totalEquity: Number(totalEquity.toFixed(4)),
    investmentEquity: Number(investmentEquity.toFixed(4)),
    inviteEquity: Number(inviteEquity.toFixed(4)),
    referralNetworkEquity: Number(referralNetworkEquity.toFixed(4)),
    capitalAccelerationDetail: {
      originalAcceleration: Number(originalAcceleration.toFixed(4)),
      investmentAmount: userInvestment,
      actualAcceleration: Number(actualAcceleration.toFixed(4)),
      seatNumber,
    },
    resourceAccelerationDetail: {
      contactCount: promotionStats.contactCount,
      tagCount: promotionStats.tagCount,
      interactionCount: promotionStats.interactionCount,
      currentLevel: promotionStats.currentLevel,
      levelName: promotionStats.levelName,
      hasInvestment,
      resourceAcceleration: Number(resourceAcceleration.toFixed(4)),
    },
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

/**
 * 获取用户晋升数据统计
 * @param userId 用户ID
 * @returns 人脉数、标签数、联络数
 */
export async function getUserPromotionStats(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 0. 查询用户的投资金额
  const [investmentResult] = await db
    .select({ totalInvestment: sql<number>`SUM(${equityInvestments.investmentAmount})` })
    .from(equityInvestments)
    .where(eq(equityInvestments.userId, userId));
  
  const totalInvestment = Number(investmentResult?.totalInvestment || 0);
  const hasInvestment = totalInvestment > 0;
  
  // 1. 统计人脉数（用户自己添加的联系人总数）
  const [contactsResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(contacts)
    .where(eq(contacts.parentUserId, userId));
  
  const contactCount = Number(contactsResult?.count || 0);
  
  // 2. 统计标签数（全局标签 + 个人标签）
  const [globalTagsResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(contactTags)
    .where(eq(contactTags.parentUserId, userId));
  
  const [personalTagsResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(personalContactTags)
    .where(eq(personalContactTags.parentUserId, userId));
  
  const globalTagCount = Number(globalTagsResult?.count || 0);
  const personalTagCount = Number(personalTagsResult?.count || 0);
  const totalTagCount = globalTagCount + personalTagCount;
  
  // 3. 统计联络数（本周日往前30天）
  // 计算本周日的日期（晚上12点）
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=周日, 1=周一, ..., 6=周六
  const thisSunday = new Date(now);
  
  if (dayOfWeek === 0) {
    // 如果今天是周日，就是今天
    thisSunday.setHours(23, 59, 59, 999);
  } else {
    // 否则计算本周的周日
    thisSunday.setDate(now.getDate() + (7 - dayOfWeek));
    thisSunday.setHours(23, 59, 59, 999);
  }
  
  // 从本周日往前推30天
  const thirtyDaysAgo = new Date(thisSunday);
  thirtyDaysAgo.setDate(thisSunday.getDate() - 29); // 包括周日当天，所以是-29
  thirtyDaysAgo.setHours(0, 0, 0, 0);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
  
  // 先获取用户的所有联系人ID
  const userContacts = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.parentUserId, userId));
  
  const contactIds = userContacts.map(c => c.id);
  
  let interactionCount = 0;
  if (contactIds.length > 0) {
    const [interactionsResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(contactInteractions)
      .where(
        and(
          inArray(contactInteractions.contactId, contactIds),
          sql`${contactInteractions.interactionDate} >= ${thirtyDaysAgoStr}`
        )
      );
    
    interactionCount = Number(interactionsResult?.count || 0);
  }
  
  // 4. 判断当前等级（基于晋升攻略的要求）
  let currentLevel = 'user';  // 默认用户
  let levelName = '用户';
  
  // 节点层判断（根据投资判断是否加“准”）
  if (contactCount >= 150 && totalTagCount >= 500 && interactionCount >= 210) {
    currentLevel = 'super';
    levelName = hasInvestment ? '超级节点' : '准超级节点';
  } else if (contactCount >= 100 && totalTagCount >= 300 && interactionCount >= 180) {
    currentLevel = 'advanced';
    levelName = hasInvestment ? '高级节点' : '准高级节点';
  } else if (contactCount >= 50 && totalTagCount >= 100 && interactionCount >= 150) {
    currentLevel = 'standard';
    levelName = hasInvestment ? '标准节点' : '准标准节点';
  }
  // 用户层判断（不加“准”字）
  else if (contactCount >= 30 && totalTagCount >= 100 && interactionCount >= 120) {
    currentLevel = 'super_user';
    levelName = '超级用户';
  } else if (contactCount >= 20 && totalTagCount >= 50 && interactionCount >= 60) {
    currentLevel = 'advanced_user';
    levelName = '高级用户';
  } else if (contactCount >= 10 && totalTagCount >= 20 && interactionCount >= 30) {
    currentLevel = 'standard_user';
    levelName = '标准用户';
  }
  
  // 5. 计算本周的日期范围（周一到周日）
  // 重用上面已经声明的 now 和 dayOfWeek
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  const formatDate = (date: Date) => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  };
  
  const qualifiedPeriod = `${formatDate(monday)}-${formatDate(sunday)}`;
  
  // 6. 更新历史最高等级
  const levelPriority: Record<string, number> = {
    'partner': 0,
    'standard_user': 1,
    'advanced_user': 2,
    'super_user': 3,
    'standard': 4,
    'advanced': 5,
    'super': 6,
  };
  
  // 获取用户当前的历史最高等级
  const [userResult] = await db
    .select({ highestLevelAchieved: users.highestLevelAchieved })
    .from(users)
    .where(eq(users.id, userId));
  
  const currentHighest = userResult?.highestLevelAchieved || 'partner';
  
  // 如果当前等级高于历史最高等级，则更新
  if (levelPriority[currentLevel] > levelPriority[currentHighest]) {
    await db
      .update(users)
      .set({ highestLevelAchieved: currentLevel })
      .where(eq(users.id, userId));
  }
  
  // 计算考核期信息
  const assessmentPeriodStart = thirtyDaysAgo;
  const assessmentPeriodEnd = thisSunday;
  const daysInPeriod = 30;
  const daysPassed = Math.floor((now.getTime() - assessmentPeriodStart.getTime()) / (1000 * 60 * 60 * 24));
  const daysRemaining = daysInPeriod - daysPassed;
  
  return {
    contactCount,
    tagCount: totalTagCount,
    interactionCount,
    currentLevel,
    levelName,
    qualifiedPeriod,
    // 考核期信息
    assessmentPeriod: {
      startDate: assessmentPeriodStart.toISOString().split('T')[0],
      endDate: assessmentPeriodEnd.toISOString().split('T')[0],
      totalDays: daysInPeriod,
      daysPassed,
      daysRemaining,
      currentInteractionCount: interactionCount,
    },
  };
}

/**
 * 获取我邀请的用户统计
 * @param userId 用户ID
 * @returns 已成功分享和分享中的人脉节点统计
 */
export async function getMyInvitedUsersStats(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. 获取我邀请的所有用户
  const invitedUsers = await db
    .select({
      id: users.id,
      highestLevelAchieved: users.highestLevelAchieved,
    })
    .from(users)
    .where(eq(users.invitedByUserId, userId));
  
  // 2. 为每个邀请的用户计算当前等级
  const usersWithCurrentLevel = await Promise.all(
    invitedUsers.map(async (user) => {
      const stats = await getUserPromotionStats(user.id);
      return {
        id: user.id,
        highestLevelAchieved: user.highestLevelAchieved || 'partner',
        currentLevel: stats.currentLevel,
      };
    })
  );
  
  // 3. 统计累计业务资产（基于历史最高等级）
  // 用户层面和节点层面规则相同：
  // - 标准：曾经达到过标准用户或更高
  // - 高级：曾经达到过高级用户或更高
  // - 超级：曾经达到过超级用户
  
  const totalInvitedCount = usersWithCurrentLevel.length;
  
  // 用户层面
  const achievedStandardUser = usersWithCurrentLevel.filter(u => 
    ['standard_user', 'advanced_user', 'super_user']
    .includes(u.highestLevelAchieved)
  ).length;
  
  const achievedAdvancedUser = usersWithCurrentLevel.filter(u => 
    ['advanced_user', 'super_user']
    .includes(u.highestLevelAchieved)
  ).length;
  
  const achievedSuperUser = usersWithCurrentLevel.filter(u => 
    ['super_user']
    .includes(u.highestLevelAchieved)
  ).length;
  
  // 节点层面（规则与用户层面相同）
  const achievedStandardNode = usersWithCurrentLevel.filter(u => 
    ['standard_user', 'advanced_user', 'super_user']
    .includes(u.highestLevelAchieved)
  ).length;
  
  const achievedAdvancedNode = usersWithCurrentLevel.filter(u => 
    ['advanced_user', 'super_user']
    .includes(u.highestLevelAchieved)
  ).length;
  
  const achievedSuperNode = usersWithCurrentLevel.filter(u => 
    ['super_user']
    .includes(u.highestLevelAchieved)
  ).length;
  
  // 4. 统计本周业务拓展（基于当前等级）
  // 用户层面和节点层面规则相同：
  // - 潜在标准：所有邀请的人
  // - 潜在高级：达到标准用户或更高
  // - 潜在超级：达到高级用户或更高
  
  // 用户层面
  const potentialStandardUser = totalInvitedCount; // 所有邀请的人
  
  const potentialAdvancedUser = usersWithCurrentLevel.filter(u => 
    ['standard_user', 'advanced_user', 'super_user']
    .includes(u.currentLevel)
  ).length;
  
  const potentialSuperUser = usersWithCurrentLevel.filter(u => 
    ['advanced_user', 'super_user']
    .includes(u.currentLevel)
  ).length;
  
  // 节点层面（规则与用户层面相同）
  const potentialStandardNode = totalInvitedCount; // 所有邀请的人
  
  const potentialAdvancedNode = usersWithCurrentLevel.filter(u => 
    ['standard_user', 'advanced_user', 'super_user']
    .includes(u.currentLevel)
  ).length;
  
  const potentialSuperNode = usersWithCurrentLevel.filter(u => 
    ['advanced_user', 'super_user']
    .includes(u.currentLevel)
  ).length;
  
  return {
    // 累计业务资产（曾经达到过）
    achieved: {
      standardUser: achievedStandardUser,
      advancedUser: achievedAdvancedUser,
      superUser: achievedSuperUser,
      standardNode: achievedStandardNode,
      advancedNode: achievedAdvancedNode,
      superNode: achievedSuperNode,
    },
    
    // 本周业务拓展（当前状态）
    potential: {
      standardUser: potentialStandardUser,
      advancedUser: potentialAdvancedUser,
      superUser: potentialSuperUser,
      standardNode: potentialStandardNode,
      advancedNode: potentialAdvancedNode,
      superNode: potentialSuperNode,
    },
  };
}

/**
 * 获取用户的历史周报
 * 从用户注册日期开始，按自然周生成周报列表
 */
export async function getUserWeeklyReports(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 获取用户注册时间和座位编号
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.length === 0) {
    throw new Error("User not found");
  }
  
  // 获取座位编号（根据首笔投资时间排序）
  const seatInfo = await getUserSeatNumber(userId);
  const seatNumber = seatInfo.seatNumber || 0;
  
  const registrationDate = new Date(user[0].createdAt);
  const now = new Date();
  
  // 计算从注册到现在有多少个自然周
  // 自然周定义：周一到周日
  const getWeekStart = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 调整到周一
    d.setDate(diff);
    d.setHours(0, 0, 0, 0); // 重置时间为00:00:00
    return d;
  };
  
  const getWeekEnd = (weekStart: Date) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6); // 周日
    return d;
  };
  
  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
  };
  
  const getWeekNumber = (date: Date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
  };
  
  // 生成周报列表
  const reports = [];
  let currentWeekStart = getWeekStart(registrationDate);
  const nowWeekStart = getWeekStart(now);
  
  while (currentWeekStart <= nowWeekStart) {
    const weekEnd = getWeekEnd(currentWeekStart);
    const weekNumber = getWeekNumber(currentWeekStart);
    const dateRange = `${formatDate(currentWeekStart)} - ${formatDate(weekEnd)}`;
    
    // TODO: 这里暂时使用默认值，后续需要根据实际数据计算
    reports.push({
      weekNumber,
      dateRange,
      status: 'confirmed' as const,
      weightGain: 0,
      equityGain: 0,
      blockchainHash: `0x${Math.random().toString(16).substring(2, 42)}`,
      personalContribution: {
        networkSize: 0,
        tagCompleteness: 0,
        contactFrequency: 0,
      },
      sharedContribution: {
        seniorNodes: 0,
        advancedNodes: 0,
        superNodes: 0,
      },
      nationalRank: 0,
    });
    
    // 移动到下一周
    currentWeekStart = new Date(currentWeekStart);
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  }
  
  // 反转数组，最新的周报在前面
  reports.reverse();
  
  // 计算概览数据
  const overview = {
    archiveId: seatNumber.toString().padStart(4, '0'),
    totalWeeks: reports.length,
    highestWeightGain: Math.max(...reports.map(r => r.weightGain), 0),
    totalWeightGain: reports.reduce((sum, r) => sum + r.weightGain, 0),
  };
  
  return {
    overview,
    reports,
  };
}
