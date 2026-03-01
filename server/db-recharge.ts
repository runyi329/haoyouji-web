import { eq, and, gte, lte, sql } from "drizzle-orm";
import { getDb, getDbConnection } from "./db";
import { rechargeOrders, balanceHistory, users, walletAddresses } from "../drizzle/schema";

// 生成唯一的充值金额（原金额 + 0.0001-0.9999的随机数）
function generateUniqueAmount(baseAmount: number): number {
  const randomDecimal = (Math.floor(Math.random() * 9999) + 1) / 10000;
  return parseFloat((baseAmount + randomDecimal).toFixed(4));
}

// 生成订单号
function generateOrderNo(): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `CHG${timestamp}${random}`;
}

// ========== 收款地址管理（数据库存储） ==========

// 获取所有启用的收款地址
export async function getEnabledWalletAddresses(network?: string) {
  const db = await getDb();
  
  if (network) {
    return await db
      .select()
      .from(walletAddresses)
      .where(and(eq(walletAddresses.enabled, 1), eq(walletAddresses.network, network)));
  }
  
  return await db
    .select()
    .from(walletAddresses)
    .where(eq(walletAddresses.enabled, 1));
}

// 获取所有收款地址（管理员用）
export async function getAllWalletAddresses() {
  const db = await getDb();
  
  return await db
    .select()
    .from(walletAddresses)
    .orderBy(sql`${walletAddresses.createdAt} DESC`);
}

// 随机选择一个启用的收款地址
export async function getRandomWalletAddress(network: string = 'TRC20'): Promise<{ address: string; id: number } | null> {
  const addresses = await getEnabledWalletAddresses(network);
  
  if (addresses.length === 0) {
    return null;
  }
  
  // 随机选择一个
  const randomIndex = Math.floor(Math.random() * addresses.length);
  return {
    address: addresses[randomIndex].address,
    id: addresses[randomIndex].id
  };
}

// 添加收款地址（防止重复添加）
export async function addWalletAddress(address: string, network: string, label?: string) {
  const db = await getDb();
  
  // 检查是否已存在相同地址
  const existing = await db
    .select()
    .from(walletAddresses)
    .where(and(eq(walletAddresses.address, address), eq(walletAddresses.network, network)))
    .limit(1);
  
  if (existing.length > 0) {
    throw new Error(`该${network}地址已存在（ID: ${existing[0].id}）`);
  }
  
  await db.insert(walletAddresses).values({
    address,
    network,
    label: label || null,
    enabled: 1
  });
  
  return { success: true };
}

// 更新收款地址
export async function updateWalletAddress(id: number, data: { address?: string; network?: string; label?: string; enabled?: number }) {
  const db = await getDb();
  
  const updateData: any = {};
  if (data.address !== undefined) updateData.address = data.address;
  if (data.network !== undefined) updateData.network = data.network;
  if (data.label !== undefined) updateData.label = data.label;
  if (data.enabled !== undefined) updateData.enabled = data.enabled;
  
  await db
    .update(walletAddresses)
    .set(updateData)
    .where(eq(walletAddresses.id, id));
  
  return { success: true };
}

// 删除收款地址
export async function deleteWalletAddress(id: number) {
  const db = await getDb();
  
  await db
    .delete(walletAddresses)
    .where(eq(walletAddresses.id, id));
  
  return { success: true };
}

// ========== 充值订单管理 ==========

// 创建充值订单（从数据库随机选择收款地址）
export async function createRechargeOrder(
  userId: number,
  baseAmount: number,
  network: string = 'TRC20'
) {
  const db = await getDb();
  
  // 从数据库获取随机收款地址
  const wallet = await getRandomWalletAddress(network);
  if (!wallet) {
    throw new Error('充值功能暂未开放，请联系管理员配置收款地址');
  }
  
  const uniqueAmount = generateUniqueAmount(baseAmount);
  const orderNo = generateOrderNo();
  
  // 30分钟后过期
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  
  await db.insert(rechargeOrders).values({
    userId,
    orderNo,
    amount: uniqueAmount.toString(),
    currency: 'USDT',
    network,
    walletAddress: wallet.address,
    status: 'pending',
    expiresAt: expiresAt.toISOString().slice(0, 19).replace('T', ' ')
  });
  
  return {
    orderNo,
    amount: uniqueAmount,
    currency: 'USDT',
    network,
    walletAddress: wallet.address,
    expiresAt
  };
}

// 用户提交转账确认（将订单状态从pending改为submitted）
export async function submitTransferConfirmation(orderNo: string, userId: number) {
  const db = await getDb();
  
  // 查找订单并验证所有权
  const orders = await db
    .select()
    .from(rechargeOrders)
    .where(
      and(
        eq(rechargeOrders.orderNo, orderNo),
        eq(rechargeOrders.userId, userId),
        eq(rechargeOrders.status, 'pending')
      )
    )
    .limit(1);
  
  if (orders.length === 0) {
    throw new Error('订单不存在或已处理');
  }
  
  // 更新状态为submitted
  await db
    .update(rechargeOrders)
    .set({ status: 'submitted' })
    .where(eq(rechargeOrders.id, orders[0].id));
  
  console.log(`[Recharge] User ${userId} submitted transfer confirmation for order ${orderNo}`);
  
  return { success: true, orderNo, status: 'submitted' };
}

// 查询充值订单
export async function getRechargeOrder(orderNo: string) {
  const db = await getDb();
  
  const orders = await db
    .select()
    .from(rechargeOrders)
    .where(eq(rechargeOrders.orderNo, orderNo))
    .limit(1);
  
  return orders[0] || null;
}

// 查询用户的充值订单列表
export async function getUserRechargeOrders(userId: number, limit: number = 20) {
  const db = await getDb();
  
  return await db
    .select()
    .from(rechargeOrders)
    .where(eq(rechargeOrders.userId, userId))
    .orderBy(sql`${rechargeOrders.createdAt} DESC`)
    .limit(limit);
}

/**
 * 根据金额查找匹配的订单（改进版：submitted优先 + 精确匹配优先 + 模糊匹配兜底）
 * 
 * 匹配策略（按/**
 * 改进的订单匹配算法（按优先级）：
 * 1. 完全匹配（金额完全相同）— 直接自动确认
 * 2. 精确匹配（误差 ±0.01 USDT）— 直接自动确认
 * 3. 模糊匹配（到账金额 < 订单金额，差额在手续费范围内 ≤0.1 USDT）— 自动确认，按实际到账金额入账
 * 4. 无法匹配 — 记录未匹配交易，等待管理员手动处理
 * 
 * @param amount 交易金额
 * @param txnHash 交易哈希（用于防止重复匹配）
 */
export async function findOrderByAmount(amount: number, txnHash?: string): Promise<{
  order: any;
  matchType: 'exact' | 'fuzzy' | 'none';
  amountDiff: number;
} | null> {
  const db = await getDb();
  
  // 按优先级搜索：先submitted，再pending
  const statusPriority = ['submitted', 'pending'] as const;
  
  for (const status of statusPriority) {
    // 精确匹配（误差 ±0.01 USDT），且未被其他交易使用
    const exactConditions = [
      eq(rechargeOrders.status, status),
      sql`ABS(CAST(${rechargeOrders.amount} AS DECIMAL(20,8)) - ${amount}) <= 0.01`
    ];
    
    // 如果提供了txnHash，排除已被其他交易使用的订单
    if (txnHash) {
      exactConditions.push(sql`(txn_hash IS NULL OR txn_hash = ${txnHash})`);
    }
    
    const exactOrders = await db
      .select()
      .from(rechargeOrders)
      .where(and(...exactConditions))
      .limit(1);
    
    if (exactOrders.length > 0) {
      console.log(`[Recharge] Exact match found in ${status} orders`);
      return {
        order: exactOrders[0],
        matchType: 'exact',
        amountDiff: 0
      };
    }
    
    // 模糊匹配（到账金额略少于订单金额，差额 ≤0.1 USDT，覆盖手续费场景）
    const fuzzyConditions = [
      eq(rechargeOrders.status, status),
      sql`CAST(${rechargeOrders.amount} AS DECIMAL(20,8)) > ${amount}`,
      sql`CAST(${rechargeOrders.amount} AS DECIMAL(20,8)) - ${amount} <= 0.1`
    ];
    
    // 如果提供了txnHash，排除已被其他交易使用的订单
    if (txnHash) {
      fuzzyConditions.push(sql`(txn_hash IS NULL OR txn_hash = ${txnHash})`);
    }
    
    const fuzzyOrders = await db
      .select()
      .from(rechargeOrders)
      .where(and(...fuzzyConditions))
      .orderBy(sql`ABS(CAST(${rechargeOrders.amount} AS DECIMAL(20,8)) - ${amount}) ASC`)
      .limit(1);
    
    if (fuzzyOrders.length > 0) {
      const orderAmount = parseFloat(fuzzyOrders[0].amount);
      console.log(`[Recharge] Fuzzy match found in ${status} orders`);
      return {
        order: fuzzyOrders[0],
        matchType: 'fuzzy',
        amountDiff: parseFloat((orderAmount - amount).toFixed(4))
      };
    }
  }
  
  // 无法匹配
  return null;
}

// 记录未匹配的交易（供管理员手动处理）
export async function recordUnmatchedTransaction(
  txnHash: string,
  amount: number,
  fromAddress: string
) {
  const db = await getDb();
  
  // 检查是否已记录
  const existing = await db.execute(
    sql`SELECT id FROM unmatched_transactions WHERE txn_hash = ${txnHash} LIMIT 1`
  );
  
  if ((existing as any)[0]?.length > 0 || (existing as any)?.length > 0) {
    return;
  }
  
  try {
    await db.execute(sql`
      INSERT INTO unmatched_transactions (txn_hash, amount, from_address, status, created_at)
      VALUES (${txnHash}, ${amount}, ${fromAddress}, 'pending', NOW())
    `);
    console.log(`[Recharge] Recorded unmatched transaction: ${txnHash}, ${amount} USDT`);
  } catch (error) {
    // 表可能不存在，忽略错误
    console.error('[Recharge] Failed to record unmatched transaction:', error);
  }
}

// 完成充值订单（改进版：支持按实际到账金额入账）
export async function completeRechargeOrder(
  orderId: number,
  txnHash: string,
  actualAmount: number,
  matchType: 'exact' | 'fuzzy' = 'exact'
) {
  const db = await getDb();
  
  // 更新订单状态
  await db
    .update(rechargeOrders)
    .set({
      status: 'completed',
      txnHash,
      completedAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
    })
    .where(eq(rechargeOrders.id, orderId));
  
  // 获取订单信息
  const order = await db
    .select()
    .from(rechargeOrders)
    .where(eq(rechargeOrders.id, orderId))
    .limit(1);
  
  if (order.length === 0) return false;
  
  // 按实际到账金额入账（而不是订单金额）
  const creditAmount = actualAmount;
  const description = matchType === 'fuzzy' 
    ? `充值到账（订单金额${order[0].amount}，实际到账${actualAmount}，差额为手续费）`
    : `充值到账`;
  
  await addUserBalance(order[0].userId, creditAmount, 'recharge', orderId, description);
  
  return true;
}

// 管理员手动确认充值（将未匹配交易关联到指定订单或用户）
export async function adminConfirmRecharge(
  adminId: number,
  orderId: number,
  txnHash: string,
  actualAmount: number
) {
  const db = await getDb();
  
  // 检查订单是否存在且状态为pending或submitted
  const order = await db
    .select()
    .from(rechargeOrders)
    .where(eq(rechargeOrders.id, orderId))
    .limit(1);
  
  if (order.length === 0) {
    throw new Error('订单不存在');
  }
  
  if (order[0].status === 'completed') {
    throw new Error('订单已完成');
  }
  
  // 完成订单
  await db
    .update(rechargeOrders)
    .set({
      status: 'completed',
      txnHash,
      completedAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
    })
    .where(eq(rechargeOrders.id, orderId));
  
  // 按实际到账金额入账
  const description = `管理员手动确认充值（操作人ID:${adminId}，交易哈希:${txnHash}）`;
  await addUserBalance(order[0].userId, actualAmount, 'recharge', orderId, description);
  
  // 更新未匹配交易状态（如果有）
  try {
    await db.execute(sql`
      UPDATE unmatched_transactions SET status = 'resolved' WHERE txn_hash = ${txnHash}
    `);
  } catch (e) {
    // 忽略
  }
  
  return { success: true, userId: order[0].userId, amount: actualAmount };
}

// 管理员直接给用户充值（无需链上交易）
export async function adminDirectRecharge(
  adminId: number,
  userId: number,
  amount: number,
  description?: string
) {
  const desc = description || `管理员手动充值（操作人ID:${adminId}）`;
  const newBalance = await addUserBalance(userId, amount, 'recharge', undefined, desc);
  return { success: true, userId, amount, newBalance };
}

// 获取所有待处理订单（管理员用）
export async function getAllPendingOrders() {
  const db = await getDb();
  
  return await db
    .select({
      id: rechargeOrders.id,
      userId: rechargeOrders.userId,
      orderNo: rechargeOrders.orderNo,
      amount: rechargeOrders.amount,
      currency: rechargeOrders.currency,
      network: rechargeOrders.network,
      status: rechargeOrders.status,
      createdAt: rechargeOrders.createdAt,
      expiresAt: rechargeOrders.expiresAt,
    })
    .from(rechargeOrders)
    .where(eq(rechargeOrders.status, 'pending'))
    .orderBy(sql`${rechargeOrders.createdAt} DESC`);
}

// 获取所有充值订单（管理员用）
export async function getAllOrders(limit: number = 50) {
  const db = await getDb();
  
  return await db
    .select()
    .from(rechargeOrders)
    .orderBy(sql`${rechargeOrders.createdAt} DESC`)
    .limit(limit);
}

// 获取未匹配交易列表（管理员用）
export async function getUnmatchedTransactions() {
  const db = await getDb();
  
  try {
    const result = await db.execute(sql`
      SELECT * FROM unmatched_transactions 
      WHERE status = 'pending' 
      ORDER BY created_at DESC 
      LIMIT 50
    `);
    return (result as any)[0] || [];
  } catch (e) {
    return [];
  }
}

// 给用户添加余额
export async function addUserBalance(
  userId: number,
  amount: number,
  type: 'recharge' | 'consume' | 'refund' | 'reward' | 'withdraw',
  relatedId?: number,
  description?: string
) {
  const db = await getDb();
  
  // 更新用户余额
  await db.execute(sql`
    UPDATE users 
    SET balance = COALESCE(balance, 0) + ${amount}
    WHERE id = ${userId}
  `);
  
  // 获取更新后的余额
  const userResult = await db
    .select({ balance: users.balance })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  const newBalance = userResult[0]?.balance || 0;
  
  // 记录余额变动
  await db.insert(balanceHistory).values({
    userId,
    amount: amount.toString(),
    type,
    relatedId,
    balance: newBalance.toString(),
    description
  });
  
  return newBalance;
}

// 获取用户余额
export async function getUserBalance(userId: number): Promise<number> {
  const db = await getDb();
  
  const result = await db
    .select({ balance: users.balance })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  return parseFloat(result[0]?.balance?.toString() || '0');
}

// 获取用户余额变动记录
export async function getUserBalanceHistory(userId: number, limit: number = 50) {
  const db = await getDb();
  
  return await db
    .select()
    .from(balanceHistory)
    .where(eq(balanceHistory.userId, userId))
    .orderBy(sql`${balanceHistory.createdAt} DESC`)
    .limit(limit);
}

// 定期清理过期订单（只清理pending状态，submitted状态的不过期，因为用户已确认转账）
export async function cleanExpiredOrders() {
  const db = await getDb();
  
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  
  await db
    .update(rechargeOrders)
    .set({ status: 'expired' })
    .where(
      and(
        eq(rechargeOrders.status, 'pending'),
        sql`${rechargeOrders.expiresAt} < ${now}`
      )
    );
}

// 获取系统统计信息（管理员用）— 从数据库读取收款地址配置
export async function getSystemStats() {
  const db = await getDb();
  
  // 从数据库获取收款地址配置
  const enabledAddresses = await getEnabledWalletAddresses();
  const allAddresses = await getAllWalletAddresses();
  const scannerEnabled = enabledAddresses.length > 0;
  
  // 统计各状态订单数量
  const orderStats = await db
    .select({
      status: rechargeOrders.status,
      count: sql<number>`COUNT(*)`,
      totalAmount: sql<string>`SUM(CAST(${rechargeOrders.amount} AS DECIMAL(20,8)))`
    })
    .from(rechargeOrders)
    .groupBy(rechargeOrders.status);
  
  // 统计未匹配交易数量
  let unmatchedCount = 0;
  let unmatchedTotalAmount = 0;
  try {
    const unmatchedResult = await db.execute(sql`
      SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as totalAmount 
      FROM unmatched_transactions WHERE status = 'pending'
    `);
    const row = (unmatchedResult as any)[0]?.[0];
    unmatchedCount = Number(row?.count || 0);
    unmatchedTotalAmount = parseFloat(row?.totalAmount || '0');
  } catch (e) {
    // 表可能不存在
  }
  
  // 统计已匹配订单数（completed状态的订单）
  const [matchedStats] = await db
    .select({
      count: sql<number>`COUNT(*)`
    })
    .from(rechargeOrders)
    .where(eq(rechargeOrders.status, 'completed'));
  
  const matchedOrdersCount = Number(matchedStats?.count || 0);
  
  // 统计今日充值（使用北京时间 GMT+8）
  // 计算北京时间今天 00:00 对应的 UTC 时间
  const now = new Date();
  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();
  const utcDate = now.getUTCDate();
  const utcHours = now.getUTCHours();
  
  // 计算北京时间的日期（UTC+8）
  let beijingDate = utcDate;
  let beijingMonth = utcMonth;
  let beijingYear = utcYear;
  
  if (utcHours >= 16) {
    // UTC 16:00 = 北京 00:00（第二天）
    beijingDate++;
    const daysInMonth = new Date(beijingYear, beijingMonth + 1, 0).getDate();
    if (beijingDate > daysInMonth) {
      beijingDate = 1;
      beijingMonth++;
      if (beijingMonth > 11) {
        beijingMonth = 0;
        beijingYear++;
      }
    }
  }
  
  // 北京时间今天 00:00（UTC 表示）
  const beijingTodayStart = new Date(Date.UTC(beijingYear, beijingMonth, beijingDate, -8, 0, 0, 0));
  const beijingTomorrowStart = new Date(beijingTodayStart.getTime() + 24 * 60 * 60 * 1000);
  
  const todayStartUTC = beijingTodayStart.toISOString().slice(0, 19).replace('T', ' ');
  const todayEndUTC = beijingTomorrowStart.toISOString().slice(0, 19).replace('T', ' ');
  
  const [todayStats] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      totalAmount: sql<string>`SUM(CAST(${rechargeOrders.amount} AS DECIMAL(20,8)))`
    })
    .from(rechargeOrders)
    .where(
      and(
        eq(rechargeOrders.status, 'completed'),
        sql`${rechargeOrders.completedAt} >= ${todayStartUTC}`,
        sql`${rechargeOrders.completedAt} < ${todayEndUTC}`
      )
    );
  
  // 获取最近10笔订单（关联用户表）
  const recentOrders = await db
    .select({
      id: rechargeOrders.id,
      userId: rechargeOrders.userId,
      orderNo: rechargeOrders.orderNo,
      amount: rechargeOrders.amount,
      network: rechargeOrders.network,
      walletAddress: rechargeOrders.walletAddress,
      txnHash: rechargeOrders.txnHash,
      status: rechargeOrders.status,
      createdAt: rechargeOrders.createdAt,
      completedAt: rechargeOrders.completedAt,
      username: users.username,
    })
    .from(rechargeOrders)
    .leftJoin(users, eq(rechargeOrders.userId, users.id))
    .orderBy(sql`${rechargeOrders.createdAt} DESC`)
    .limit(10);
  
  return {
    scannerEnabled,
    walletAddresses: enabledAddresses.map(a => ({
      id: a.id,
      address: a.address,
      network: a.network,
      label: a.label
    })),
    allWalletAddresses: allAddresses,
    scanInterval: 60,
    orderStats: orderStats.map(s => ({
      status: s.status,
      count: Number(s.count),
      totalAmount: parseFloat(s.totalAmount || '0')
    })),
    matchedOrdersCount,
    unmatchedCount,
    unmatchedTotalAmount,
    todayCount: Number(todayStats?.count || 0),
    todayTotalAmount: parseFloat(todayStats?.totalAmount || '0'),
    recentOrders
  };
}

// ========== 提现功能 ==========

// 用户申请提现
export async function requestWithdraw(
  userId: number,
  amount: number,
  paymentAccountId: number,
  remark?: string
): Promise<{ success: boolean; message: string }> {
  const db = await getDb();

  // 检查用户余额
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || user.length === 0) {
    throw new Error('用户不存在');
  }

  const balance = parseFloat(user[0].balance || '0');

  if (balance < amount) {
    throw new Error('余额不足');
  }

  if (amount < 10) {
    throw new Error('最低提现金额为 10 USDT');
  }

  // 扣除余额
  await db
    .update(users)
    .set({
      balance: sql`${users.balance} - ${amount}`,
    })
    .where(eq(users.id, userId));

  // 记录余额变动
  await db.insert(balanceHistory).values({
    userId,
    amount: -amount, // 负数表示减少
    type: 'withdraw',
    relatedId: paymentAccountId,
    balance: balance - amount,
    description: remark || `提现 ${amount} USDT`,
  });

  return {
    success: true,
    message: '提现申请已提交，等待管理员审核',
  };
}

// 获取用户提现记录
export async function getUserWithdrawHistory(userId: number, limit: number = 50) {
  const db = await getDb();

  return await db
    .select()
    .from(balanceHistory)
    .where(and(eq(balanceHistory.userId, userId), eq(balanceHistory.type, 'withdraw')))
    .orderBy(sql`${balanceHistory.createdAt} DESC`)
    .limit(limit);
}

// 管理员获取所有提现申请
export async function getAllWithdrawRequests(limit: number = 100) {
  const db = await getDb();

  return await db
    .select({
      id: balanceHistory.id,
      userId: balanceHistory.userId,
      username: users.username,
      amount: balanceHistory.amount,
      balance: balanceHistory.balance,
      description: balanceHistory.description,
      createdAt: balanceHistory.createdAt,
    })
    .from(balanceHistory)
    .leftJoin(users, eq(balanceHistory.userId, users.id))
    .where(eq(balanceHistory.type, 'withdraw'))
    .orderBy(sql`${balanceHistory.createdAt} DESC`)
    .limit(limit);
}

// ========== SNT 会员间划转 ==========

// 确保 snt_transfers 表存在（自动建表）
async function ensureSntTransfersTable() {
  const conn = await getDbConnection();
  if (!conn) return;
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`snt_transfers\` (
      \`id\` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
      \`from_user_id\` int NOT NULL,
      \`to_user_id\` int NOT NULL,
      \`snt_amount\` decimal(20, 4) NOT NULL,
      \`remark\` varchar(200),
      \`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      INDEX \`snt_transfers_from_user_idx\` (\`from_user_id\`),
      INDEX \`snt_transfers_to_user_idx\` (\`to_user_id\`)
    )
  `);
}

// 获取用户 SNT 净持仓（充值到账 - 划转出 + 划转入）
export async function getUserSntBalance(userId: number): Promise<number> {
  await ensureSntTransfersTable();
  const conn = await getDbConnection();
  if (!conn) return 0;
  const [rechargeRows]: any = await conn.execute(
    `SELECT COALESCE(SUM(amount), 0) as total FROM recharge_orders WHERE user_id = ? AND status = 'completed'`,
    [userId]
  );
  const rechargedSNT = parseFloat(rechargeRows[0]?.total || '0') / 0.04;
  const [outRows]: any = await conn.execute(
    `SELECT COALESCE(SUM(snt_amount), 0) as total FROM snt_transfers WHERE from_user_id = ?`,
    [userId]
  );
  const transferOut = parseFloat(outRows[0]?.total || '0');
  const [inRows]: any = await conn.execute(
    `SELECT COALESCE(SUM(snt_amount), 0) as total FROM snt_transfers WHERE to_user_id = ?`,
    [userId]
  );
  const transferIn = parseFloat(inRows[0]?.total || '0');
  return Math.max(0, rechargedSNT - transferOut + transferIn);
}

// 执行 SNT 划转
export async function transferSNT(
  fromUserId: number,
  toUserId: number,
  sntAmount: number,
  remark?: string
): Promise<{ success: boolean; message: string }> {
  await ensureSntTransfersTable();
  if (sntAmount <= 0) throw new Error('划转数量必须大于 0');
  if (fromUserId === toUserId) throw new Error('不能划转给自己');
  const balance = await getUserSntBalance(fromUserId);
  if (balance < sntAmount) {
    throw new Error(`SNT 余额不足，当前可划转：${balance.toFixed(4)} SNT`);
  }
  const conn = await getDbConnection();
  if (!conn) throw new Error('数据库连接失败');
  await conn.execute(
    `INSERT INTO snt_transfers (from_user_id, to_user_id, snt_amount, remark) VALUES (?, ?, ?, ?)`,
    [fromUserId, toUserId, sntAmount.toFixed(4), remark || null]
  );
  return { success: true, message: `成功划转 ${sntAmount} SNT` };
}

// 获取用户划转记录（转入 + 转出）
export async function getUserSntTransfers(userId: number, limit: number = 20) {
  await ensureSntTransfersTable();
  const conn = await getDbConnection();
  if (!conn) return [];
  const [rows]: any = await conn.execute(
    `SELECT t.*, 
      u_from.username as from_username, u_from.name as from_name,
      u_to.username as to_username, u_to.name as to_name
     FROM snt_transfers t
     LEFT JOIN users u_from ON t.from_user_id = u_from.id
     LEFT JOIN users u_to ON t.to_user_id = u_to.id
     WHERE t.from_user_id = ? OR t.to_user_id = ?
     ORDER BY t.created_at DESC
     LIMIT ?`,
    [userId, userId, limit]
  );
  return rows;
}
