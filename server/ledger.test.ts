import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from './routers';
import * as db from './db';
import { getDb } from './db';
import { ledgers, ledgerMembers, transactions } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

describe('Ledger System', () => {
  let testUserId: number;
  let testOpenId: string;
  
  beforeAll(async () => {
    // 创建测试用户
    testOpenId = `test-ledger-${Date.now()}`;
    await db.upsertUser({
      openId: testOpenId,
      name: '测试用户',
      role: 'parent',
    });
    const user = await db.getUserByOpenId(testOpenId);
    if (!user) throw new Error('Failed to create test user');
    testUserId = user.id;
  });
  
  afterAll(async () => {
    // 清理测试数据
    const database = await getDb();
    if (!database) return;
    
    // 获取测试用户创建的所有账本
    const testLedgers = await database
      .select()
      .from(ledgers)
      .where(eq(ledgers.ownerId, testUserId));
    
    // 删除所有测试账本的数据
    for (const ledger of testLedgers) {
      await database.delete(transactions).where(eq(transactions.ledgerId, ledger.id));
      await database.delete(ledgerMembers).where(eq(ledgerMembers.ledgerId, ledger.id));
      await database.delete(ledgers).where(eq(ledgers.id, ledger.id));
    }
    
    // 删除测试用户
    if (testUserId) {
      await db.deleteUser(testUserId);
    }
  });
  
  it('should complete full ledger workflow', async () => {
    const caller = appRouter.createCaller({
      user: { id: testUserId, role: 'parent' } as any,
      req: {} as any,
      res: {} as any,
    });
    
    // 1. 创建账本
    const ledger = await caller.ledger.createLedger({ name: '测试账本' });
    expect(ledger).toBeDefined();
    expect(ledger.name).toBe('测试账本');
    expect(ledger.ownerId).toBe(testUserId);
    
    const ledgerId = ledger.id;
    
    // 2. 获取账本列表
    const myLedgers = await caller.ledger.getMyLedgers();
    expect(myLedgers).toBeDefined();
    expect(Array.isArray(myLedgers)).toBe(true);
    expect(myLedgers.length).toBeGreaterThan(0);
    expect(myLedgers.some(l => l.id === ledgerId)).toBe(true);
    
    // 3. 获取账本详情
    const detail = await caller.ledger.getLedgerDetail({ ledgerId });
    expect(detail).toBeDefined();
    expect(detail.members).toBeDefined();
    expect(detail.stats).toBeDefined();
    expect(detail.members.length).toBe(1);
    expect(detail.members[0].userId).toBe(testUserId);
    expect(detail.members[0].role).toBe('owner');
    expect(detail.stats.totalIncome).toBe(0);
    expect(detail.stats.totalExpense).toBe(0);
    expect(detail.stats.balance).toBe(0);
    
    // 4. 添加支出账单
    const expense = await caller.ledger.addTransaction({
      ledgerId,
      type: 'expense',
      amount: '100.50',
      category: '餐饮',
      description: '午餐',
      transactionDate: new Date(),
    });
    expect(expense).toBeDefined();
    expect(expense.type).toBe('expense');
    expect(expense.amount).toBe('100.50');
    expect(expense.category).toBe('餐饮');
    
    // 5. 添加收入账单
    const income = await caller.ledger.addTransaction({
      ledgerId,
      type: 'income',
      amount: '500.00',
      category: '工资',
      transactionDate: new Date(),
    });
    expect(income).toBeDefined();
    expect(income.type).toBe('income');
    expect(income.amount).toBe('500.00');
    
    // 6. 获取账单列表
    const transactionList = await caller.ledger.getTransactions({ ledgerId });
    expect(transactionList).toBeDefined();
    expect(Array.isArray(transactionList)).toBe(true);
    expect(transactionList.length).toBe(2);
    
    // 7. 验证统计数据
    const updatedDetail = await caller.ledger.getLedgerDetail({ ledgerId });
    expect(updatedDetail.stats.totalIncome).toBe(500);
    expect(updatedDetail.stats.totalExpense).toBe(100.5);
    expect(updatedDetail.stats.balance).toBe(399.5);
  });
});
