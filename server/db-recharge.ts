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
  network: string = 'TRC20',
  ledgerId?: number  // 关联账本 ID，为空表示通用充値
) {
  const db = await getDb();
  
  // 从数据库获取随机收款地址
  const wallet = await getRandomWalletAddress(network);
  if (!wallet) {
    throw new Error('充値功能暂未开放，请联系管理员配置收款地址');
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
    ledgerId: ledgerId ?? null,  // 关联账本 ID
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

// 获取用户统一余额（三个来源合计：users.balance + recharge_orders已完成充值 + af_manual_balances手动调账）
// 获取用户余额
// 如果传入 ledgerId，则按账本隔离计算：充値(recharge_orders WHERE ledger_id=X) + 手动调账(af_manual_balances WHERE ledger_id=X)
// 如果不传 ledgerId，则使用旧的三合一逻辑（兼容旧代码）
export async function getUserBalance(userId: number, ledgerId?: number): Promise<number> {
  const db = await getDb();
  
  if (ledgerId !== undefined) {
    // 账本隔离模式：只计算该账本的充値和手动调账
    const result = await db.execute(
      sql`SELECT
        (SELECT COALESCE(SUM(CAST(amount AS DECIMAL(20,8))), 0) FROM recharge_orders WHERE user_id = ${userId} AND ledger_id = ${ledgerId} AND status = 'completed') as recharged,
        (SELECT COALESCE(SUM(amount), 0) FROM af_manual_balances WHERE user_id = ${userId} AND ledger_id = ${ledgerId}) as manual`
    ) as any;
    
    const row = result[0]?.[0] ?? result[0];
    const recharged = parseFloat(row?.recharged?.toString() || '0');
    const manual = parseFloat(row?.manual?.toString() || '0');
    
    return recharged + manual;
  }
  
  // 兼容旧模式：三合一
  const result = await db.execute(
    sql`SELECT
      (SELECT COALESCE(balance, 0) FROM users WHERE id = ${userId}) as userBalance,
      (SELECT COALESCE(SUM(CAST(amount AS DECIMAL(20,8))), 0) FROM recharge_orders WHERE user_id = ${userId} AND status = 'completed') as recharged,
      (SELECT COALESCE(SUM(amount), 0) FROM af_manual_balances WHERE user_id = ${userId}) as manual`
  ) as any;
  
  const row = result[0]?.[0] ?? result[0];
  const userBalance = parseFloat(row?.userBalance?.toString() || '0');
  const recharged = parseFloat(row?.recharged?.toString() || '0');
  const manual = parseFloat(row?.manual?.toString() || '0');
  
  return userBalance + recharged + manual;
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


// ========== SNT 提现功能（基于 snt_withdrawals 表） ==========

// 确保 snt_withdrawals 和 user_bsc_wallets 表存在
async function ensureWithdrawalTables() {
  const conn = await getDbConnection();
  if (!conn) return;
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`user_bsc_wallets\` (
      \`id\` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
      \`user_id\` int NOT NULL,
      \`bsc_address\` varchar(100) NOT NULL,
      \`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      \`updated_at\` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      UNIQUE KEY \`user_bsc_wallets_user_id_unique\` (\`user_id\`),
      INDEX \`user_bsc_wallets_user_id_idx\` (\`user_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`snt_withdrawals\` (
      \`id\` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
      \`user_id\` int NOT NULL,
      \`ledger_id\` int DEFAULT NULL COMMENT '关联账本ID',
      \`snt_amount\` decimal(20, 4) NOT NULL,
      \`bsc_address\` varchar(100) NOT NULL,
      \`status\` enum('pending','processing','completed','rejected') DEFAULT 'pending' NOT NULL,
      \`admin_note\` text,
      \`txn_hash\` varchar(100),
      \`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      \`updated_at\` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
      INDEX \`snt_withdrawals_user_id_idx\` (\`user_id\`),
      INDEX \`snt_withdrawals_status_idx\` (\`status\`),
      INDEX \`snt_withdrawals_ledger_id_idx\` (\`ledger_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // 安全添加 ledger_id 字段（如果表已存在但字段不存在，兼容 MySQL 5.x）
  try {
    const [cols] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='snt_withdrawals' AND COLUMN_NAME='ledger_id'`
    );
    if ((cols as any[])[0]?.cnt === 0) {
      await conn.execute(`ALTER TABLE snt_withdrawals ADD COLUMN ledger_id INT DEFAULT NULL COMMENT '关联账本ID'`);
    }
  } catch (_e) { /* 忽略 */ }
  try {
    const [idxs] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='snt_withdrawals' AND INDEX_NAME='snt_withdrawals_ledger_id_idx'`
    );
    if ((idxs as any[])[0]?.cnt === 0) {
      await conn.execute(`ALTER TABLE snt_withdrawals ADD INDEX snt_withdrawals_ledger_id_idx (ledger_id)`);
    }
  } catch (_e) { /* 忽略 */ }
}

// 获取用户绑定的 BSC 钱包地址
export async function getUserBscWallet(userId: number): Promise<{ id: number; bscAddress: string } | null> {
  await ensureWithdrawalTables();
  const conn = await getDbConnection();
  if (!conn) return null;
  const [rows] = await conn.execute(
    `SELECT id, bsc_address as bscAddress FROM user_bsc_wallets WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  const arr = rows as any[];
  return arr.length > 0 ? arr[0] : null;
}

// 绑定/更新用户 BSC 钱包地址
export async function upsertUserBscWallet(userId: number, bscAddress: string): Promise<{ success: boolean }> {
  await ensureWithdrawalTables();
  const conn = await getDbConnection();
  if (!conn) throw new Error('数据库连接失败');
  // 验证地址格式（BSC/ETH地址格式：0x开头，42位）
  if (!/^0x[0-9a-fA-F]{40}$/.test(bscAddress)) {
    throw new Error('无效的 BSC 地址格式，请输入 0x 开头的 42 位地址');
  }
  await conn.execute(
    `INSERT INTO user_bsc_wallets (user_id, bsc_address) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE bsc_address = VALUES(bsc_address)`,
    [userId, bscAddress]
  );
  return { success: true };
}

// 用户申请 SNT 提现
export async function requestSntWithdraw(
  userId: number,
  sntAmount: number,
  bscAddress: string,
  ledgerId: number = 52,  // 默认账本52（谷底增筹），支持未来扩展
): Promise<{ success: boolean; message: string; withdrawalId: number }> {
  await ensureWithdrawalTables();
  const conn = await getDbConnection();
  if (!conn) throw new Error('数据库连接失败');

  if (sntAmount < 10) {
    throw new Error('最低提现金额为 10 USDT');
  }

  // 检查用户是否存在
  const [userRows] = await conn.execute(
    `SELECT id FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const userArr = userRows as any[];
  if (!userArr.length) throw new Error('用户不存在');

  // 按账本隔离计算余额：只计算该账本的充值和手动调账
  const balance = await getUserBalance(userId, ledgerId);
  if (balance < sntAmount) {
    throw new Error(`余额不足，当前账本可提现余额 ${balance.toFixed(2)} USDT`);
  }

  // 检查是否有未处理的提现申请（按账本隔离：检查同一账本的pending/processing，包含旧数据 ledger_id IS NULL）
  const [pendingRows] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM snt_withdrawals WHERE user_id = ? AND (ledger_id = ? OR ledger_id IS NULL) AND status IN ('pending','processing')`,
    [userId, ledgerId]
  );
  const pendingCount = (pendingRows as any[])[0]?.cnt || 0;
  if (pendingCount > 0) {
    throw new Error('您有未处理的提现申请，请等待处理完成后再提交新申请');
  }

  // 创建提现申请（存入 ledger_id）
  const [result] = await conn.execute(
    `INSERT INTO snt_withdrawals (user_id, ledger_id, snt_amount, bsc_address, status) VALUES (?, ?, ?, ?, 'pending')`,
    [userId, ledgerId, sntAmount, bscAddress]
  );
  const insertId = (result as any).insertId;

  // 冻结余额：在 af_manual_balances 记录一笔负数（提现冻结），使用对应账本ID
  await conn.execute(
    `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(), NOW())`,
    [ledgerId, userId, -sntAmount, `提现申请冻结 #${insertId} ${sntAmount} USDT → ${bscAddress.slice(0, 10)}...`]
  );

  // 同时记录到 balance_history 方便历史查询
  await conn.execute(
    `INSERT INTO balance_history (user_id, amount, type, related_id, balance, description)
     VALUES (?, ?, 'withdraw', ?, ?, ?)`,
    [userId, -sntAmount, insertId, balance - sntAmount, `提现申请 ${sntAmount} USDT → ${bscAddress.slice(0, 10)}...`]
  );

  return {
    success: true,
    message: '提现申请已提交，等待管理员审核',
    withdrawalId: insertId,
  };
}

// 获取用户 SNT 提现记录
export async function getUserSntWithdrawals(userId: number, limit: number = 50, ledgerId?: number) {
  await ensureWithdrawalTables();
  const conn = await getDbConnection();
  if (!conn) return [];
  let query = `SELECT id, ledger_id as ledgerId, snt_amount as sntAmount, bsc_address as bscAddress, status, admin_note as adminNote, txn_hash as txnHash, created_at as createdAt, updated_at as updatedAt
     FROM snt_withdrawals WHERE user_id = ?`;
  const params: any[] = [userId];
  if (ledgerId !== undefined) {
    // 按账本过滤：包含该账本的记录，以及旧数据（ledger_id IS NULL）
    query += ` AND (ledger_id = ? OR ledger_id IS NULL)`;
    params.push(ledgerId);
  }
  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);
  const [rows] = await conn.execute(query, params);
  return rows as any[];
}

// 管理员获取所有 SNT 提现申请
export async function adminGetAllSntWithdrawals(status?: string, limit: number = 100, ledgerId?: number) {
  await ensureWithdrawalTables();
  const conn = await getDbConnection();
  if (!conn) return [];
  let query = `
    SELECT w.id, w.user_id as userId, u.username, u.name as userName, w.snt_amount as sntAmount, 
           w.bsc_address as bscAddress, w.status, w.admin_note as adminNote, 
           w.txn_hash as txnHash, w.ledger_id as ledgerId, w.created_at as createdAt, w.updated_at as updatedAt
    FROM snt_withdrawals w
    LEFT JOIN users u ON w.user_id = u.id
  `;
  const params: any[] = [];
  const conditions: string[] = [];
  if (status) {
    conditions.push(`w.status = ?`);
    params.push(status);
  }
  if (ledgerId !== undefined) {
    conditions.push(`w.ledger_id = ?`);
    params.push(ledgerId);
  }
  if (conditions.length > 0) {
    query += ` WHERE ` + conditions.join(' AND ');
  }
  query += ` ORDER BY w.created_at DESC LIMIT ?`;
  params.push(limit);
  const [rows] = await conn.execute(query, params);
  return rows as any[];
}

// 管理员审核通过提现（确认已转账）
export async function adminApproveSntWithdrawal(
  withdrawalId: number,
  txnHash?: string,
  adminNote?: string
): Promise<{ success: boolean; message: string }> {
  await ensureWithdrawalTables();
  const conn = await getDbConnection();
  if (!conn) throw new Error('数据库连接失败');

  // 检查提现申请状态
  const [rows] = await conn.execute(
    `SELECT id, user_id, snt_amount, status FROM snt_withdrawals WHERE id = ? LIMIT 1`,
    [withdrawalId]
  );
  const arr = rows as any[];
  if (!arr.length) throw new Error('提现申请不存在');
  const withdrawal = arr[0];
  if (withdrawal.status !== 'pending' && withdrawal.status !== 'processing') {
    throw new Error(`提现申请状态为 ${withdrawal.status}，无法审核`);
  }

  // 更新提现状态为 completed
  await conn.execute(
    `UPDATE snt_withdrawals SET status = 'completed', txn_hash = ?, admin_note = ? WHERE id = ?`,
    [txnHash || null, adminNote || '管理员已确认转账', withdrawalId]
  );

  return {
    success: true,
    message: `提现申请 #${withdrawalId} 已审核通过`,
  };
}

// 管理员拒绝提现（退回余额）
export async function adminRejectSntWithdrawal(
  withdrawalId: number,
  adminNote: string
): Promise<{ success: boolean; message: string }> {
  await ensureWithdrawalTables();
  const conn = await getDbConnection();
  if (!conn) throw new Error('数据库连接失败');

  // 检查提现申请状态
  const [rows] = await conn.execute(
    `SELECT id, user_id, snt_amount, status FROM snt_withdrawals WHERE id = ? LIMIT 1`,
    [withdrawalId]
  );
  const arr = rows as any[];
  if (!arr.length) throw new Error('提现申请不存在');
  const withdrawal = arr[0];
  if (withdrawal.status !== 'pending' && withdrawal.status !== 'processing') {
    throw new Error(`提现申请状态为 ${withdrawal.status}，无法拒绝`);
  }

  const sntAmount = parseFloat(withdrawal.snt_amount);
  const userId = withdrawal.user_id;

  // 更新提现状态为 rejected
  await conn.execute(
    `UPDATE snt_withdrawals SET status = 'rejected', admin_note = ? WHERE id = ?`,
    [adminNote || '管理员拒绝', withdrawalId]
  );

  // 退回冻结余额：查找原提现冻结记录以确定账本ID
  // 先尝试查找对应的冻结记录获取 ledger_id
  const [freezeRows] = await conn.execute(
    `SELECT ledger_id FROM af_manual_balances WHERE user_id = ? AND amount = ? AND note LIKE ? ORDER BY created_at DESC LIMIT 1`,
    [userId, -sntAmount, `%提现申请冻结 #${withdrawalId}%`]
  );
  const freezeArr = freezeRows as any[];
  const refundLedgerId = freezeArr.length > 0 ? freezeArr[0].ledger_id : 52;  // 默认账本52

  await conn.execute(
    `INSERT INTO af_manual_balances (ledger_id, user_id, amount, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(), NOW())`,
    [refundLedgerId, userId, sntAmount, `提现退回 #${withdrawalId} ${sntAmount} USDT（${adminNote || '管理员拒绝'}）`]
  );

  // 获取退回后的账本余额
  const newBalance = await getUserBalance(userId, refundLedgerId);

  // 记录余额变动（退回）
  await conn.execute(
    `INSERT INTO balance_history (user_id, amount, type, related_id, balance, description)
     VALUES (?, ?, 'refund', ?, ?, ?)`,
    [userId, sntAmount, withdrawalId, newBalance, `提现退回 ${sntAmount} USDT（${adminNote || '管理员拒绝'}）`]
  );

  return {
    success: true,
    message: `提现申请 #${withdrawalId} 已拒绝，${sntAmount} USDT 已退回用户余额`,
  };
}

// 管理员将提现状态改为处理中
export async function adminProcessingSntWithdrawal(
  withdrawalId: number,
  adminNote?: string
): Promise<{ success: boolean; message: string }> {
  await ensureWithdrawalTables();
  const conn = await getDbConnection();
  if (!conn) throw new Error('数据库连接失败');

  const [rows] = await conn.execute(
    `SELECT id, status FROM snt_withdrawals WHERE id = ? LIMIT 1`,
    [withdrawalId]
  );
  const arr = rows as any[];
  if (!arr.length) throw new Error('提现申请不存在');
  if (arr[0].status !== 'pending') {
    throw new Error(`提现申请状态为 ${arr[0].status}，无法标记为处理中`);
  }

  await conn.execute(
    `UPDATE snt_withdrawals SET status = 'processing', admin_note = ? WHERE id = ?`,
    [adminNote || '管理员处理中', withdrawalId]
  );

  return {
    success: true,
    message: `提现申请 #${withdrawalId} 已标记为处理中`,
  };
}
