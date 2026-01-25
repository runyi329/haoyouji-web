import { getDb } from "./db";
import { ledgers, ledgerMembers, transactions } from "../drizzle/schema";
import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm";

/**
 * 获取用户的所有账本（包括自己创建的和共享的）
 */
export async function getUserLedgers(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 查询用户作为成员的所有账本ID
  const memberLedgers = await db
    .select({ ledgerId: ledgerMembers.ledgerId })
    .from(ledgerMembers)
    .where(eq(ledgerMembers.userId, userId));
  
  const ledgerIds = memberLedgers.map(m => m.ledgerId);
  
  if (ledgerIds.length === 0) {
    return [];
  }
  
  // 查询账本详情
  const result = await db
    .select()
    .from(ledgers)
    .where(inArray(ledgers.id, ledgerIds));
  
  return result;
}

/**
 * 创建新账本
 */
export async function createLedger(name: string, ownerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 创建账本
  const [ledger] = await db.insert(ledgers).values([{
    name,
    ownerId,
    isVip: false,
    isArchived: false,
  }]);
  
  const ledgerId = ledger.insertId;
  
  // 添加创建者为账本成员
  await db.insert(ledgerMembers).values([{
    ledgerId,
    userId: ownerId,
    role: "owner",
  }]);
  
  return { id: ledgerId, name, ownerId };
}

/**
 * 获取账本的所有成员
 */
export async function getLedgerMembers(ledgerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db
    .select()
    .from(ledgerMembers)
    .where(eq(ledgerMembers.ledgerId, ledgerId));
  
  return result;
}

/**
 * 获取账本的账单列表
 */
export async function getTransactions(ledgerId: number, startDate?: Date, endDate?: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const conditions = [eq(transactions.ledgerId, ledgerId)];
  
  if (startDate) {
    conditions.push(gte(transactions.transactionDate, startDate));
  }
  
  if (endDate) {
    conditions.push(lte(transactions.transactionDate, endDate));
  }
  
  const result = await db
    .select()
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.transactionDate));
  
  return result;
}

/**
 * 添加账单
 */
export async function addTransaction(data: {
  ledgerId: number;
  userId: number;
  type: "income" | "expense";
  amount: string;
  category: string;
  subcategory?: string;
  description?: string;
  transactionDate: Date;
  images?: string[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db.insert(transactions).values([data]);
  
  return { id: result.insertId, ...data };
}

/**
 * 获取账本统计数据
 */
export async function getLedgerStats(ledgerId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db
    .select({
      totalIncome: sql<number>`SUM(CASE WHEN ${transactions.type} = 'income' THEN ${transactions.amount} ELSE 0 END)`,
      totalExpense: sql<number>`SUM(CASE WHEN ${transactions.type} = 'expense' THEN ${transactions.amount} ELSE 0 END)`,
    })
    .from(transactions)
    .where(eq(transactions.ledgerId, ledgerId));
  
  const stats = result[0] || { totalIncome: 0, totalExpense: 0 };
  
  return {
    totalIncome: Number(stats.totalIncome) || 0,
    totalExpense: Number(stats.totalExpense) || 0,
    balance: (Number(stats.totalIncome) || 0) - (Number(stats.totalExpense) || 0),
  };
}
