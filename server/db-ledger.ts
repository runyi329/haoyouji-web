import { getDb } from './db';
import { ledgers, ledgerMembers, transactions } from '../drizzle/schema';
import { eq, and, desc } from 'drizzle-orm';

/**
 * 创建账本
 */
export async function createLedger(data: {
  name: string;
  description?: string;
  creatorId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [ledger] = await db.insert(ledgers).values(data).$returningId();
  
  // 自动将创建者添加为账本成员（owner）
  await db.insert(ledgerMembers).values({
    ledgerId: ledger.id,
    userId: data.creatorId,
    role: 'owner',
  });
  
  return ledger;
}

/**
 * 获取用户的所有账本
 */
export async function getUserLedgers(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const members = await db
    .select({
      id: ledgers.id,
      name: ledgers.name,
      description: ledgers.description,
      creatorId: ledgers.creatorId,
      createdAt: ledgers.createdAt,
      updatedAt: ledgers.updatedAt,
      role: ledgerMembers.role,
    })
    .from(ledgerMembers)
    .innerJoin(ledgers, eq(ledgerMembers.ledgerId, ledgers.id))
    .where(eq(ledgerMembers.userId, userId))
    .orderBy(desc(ledgers.updatedAt));
  
  return members;
}

/**
 * 获取账本详情
 */
export async function getLedgerDetail(ledgerId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 检查用户是否有权限访问该账本
  const [member] = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, userId)
      )
    );
  
  if (!member) {
    throw new Error('无权访问该账本');
  }
  
  const [ledger] = await db
    .select()
    .from(ledgers)
    .where(eq(ledgers.id, ledgerId));
  
  return ledger;
}

/**
 * 添加账单
 */
export async function createTransaction(data: {
  ledgerId: number;
  userId: number;
  type: string;
  amount: string;
  category: string;
  description?: string;
  transactionDate: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [transaction] = await db.insert(transactions).values(data).$returningId();
  return transaction;
}

/**
 * 获取账本的所有账单
 */
export async function getLedgerTransactions(ledgerId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 检查用户是否有权限访问该账本
  const [member] = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, userId)
      )
    );
  
  if (!member) {
    throw new Error('无权访问该账本');
  }
  
  const transactionList = await db
    .select()
    .from(transactions)
    .where(eq(transactions.ledgerId, ledgerId))
    .orderBy(desc(transactions.transactionDate));
  
  return transactionList;
}

/**
 * 获取账本统计信息
 */
export async function getLedgerStats(ledgerId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // 检查用户是否有权限访问该账本
  const [member] = await db
    .select()
    .from(ledgerMembers)
    .where(
      and(
        eq(ledgerMembers.ledgerId, ledgerId),
        eq(ledgerMembers.userId, userId)
      )
    );
  
  if (!member) {
    throw new Error('无权访问该账本');
  }
  
  const transactionList = await db
    .select()
    .from(transactions)
    .where(eq(transactions.ledgerId, ledgerId));
  
  let totalIncome = 0;
  let totalExpense = 0;
  
  transactionList.forEach((t: { type: string; amount: string }) => {
    const amount = parseFloat(t.amount);
    if (t.type === 'income') {
      totalIncome += amount;
    } else if (t.type === 'expense') {
      totalExpense += amount;
    }
  });
  
  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    transactionCount: transactionList.length,
  };
}
