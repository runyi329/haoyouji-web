import { eq, and, gte, lte, sql } from "drizzle-orm";
import { getDb } from "./db";
import { rechargeOrders, balanceHistory, users } from "../drizzle/schema";

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

// 创建充值订单
export async function createRechargeOrder(
  userId: number,
  baseAmount: number,
  network: string = 'TRC20'
) {
  const db = await getDb();
  
  // 检查钱包地址是否已配置
  const walletAddress = process.env.RECHARGE_WALLET_ADDRESS_TRC20 || '';
  if (!walletAddress) {
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
    status: 'pending',
    expiresAt: expiresAt.toISOString().slice(0, 19).replace('T', ' ')
  });
  
  return {
    orderNo,
    amount: uniqueAmount,
    currency: 'USDT',
    network,
    walletAddress,
    expiresAt
  };
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

// 根据金额查找匹配的订单（误差范围±0.01 USDT）
export async function findOrderByAmount(amount: number) {
  const db = await getDb();
  
  const orders = await db
    .select()
    .from(rechargeOrders)
    .where(
      and(
        eq(rechargeOrders.status, 'pending'),
        sql`ABS(CAST(${rechargeOrders.amount} AS DECIMAL(20,8)) - ${amount}) <= 0.01`
      )
    )
    .limit(1);
  
  return orders[0] || null;
}

// 完成充值订单
export async function completeRechargeOrder(orderId: number, txnHash: string, actualAmount: number) {
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
  
  // 给用户加余额
  await addUserBalance(order[0].userId, actualAmount, 'recharge', orderId);
  
  return true;
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

// 定期清理过期订单
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
