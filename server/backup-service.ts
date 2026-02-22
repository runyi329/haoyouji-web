import { getDb } from './db';
import { sendBackupEmail } from './email-service';
import ExcelJS from 'exceljs';

/**
 * 执行单个账本的备份
 */
export async function executeBackup(ledgerId: number, userId: number): Promise<void> {
  const db_instance = await getDb();
  if (!db_instance) throw new Error("Database not available");
  
  const { ledgers, ledgerMembers, users, transactions, categories } = await import("../drizzle/schema");
  const { eq, and, desc } = await import("drizzle-orm");
  
  // 1. 获取账本信息
  const ledger = await db_instance
    .select()
    .from(ledgers)
    .where(eq(ledgers.id, ledgerId))
    .limit(1);
  
  if (ledger.length === 0) {
    throw new Error(`账本不存在: ${ledgerId}`);
  }
  
  // 2. 获取用户信息（邮箱）
  const user = await db_instance
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  if (user.length === 0 || !user[0].email) {
    throw new Error(`用户邮箱未设置: ${userId}`);
  }
  
  // 3. 获取所有交易记录
  const txList = await db_instance
    .select({
      id: transactions.id,
      date: transactions.date,
      type: transactions.type,
      amount: transactions.amount,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      description: transactions.description,
      memberId: transactions.memberId,
      memberNickname: ledgerMembers.nickname,
      memberUsername: users.username,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(ledgerMembers, eq(transactions.memberId, ledgerMembers.id))
    .leftJoin(users, eq(ledgerMembers.userId, users.id))
    .where(eq(transactions.ledgerId, ledgerId))
    .orderBy(desc(transactions.date));
  
  // 4. 计算统计信息
  let totalIncome = 0;
  let totalExpense = 0;
  let earliestDate = '';
  let latestDate = '';
  
  if (txList.length > 0) {
    latestDate = txList[0].date;
    earliestDate = txList[txList.length - 1].date;
    
    txList.forEach(tx => {
      const amount = parseFloat(tx.amount);
      if (tx.type === 'income') {
        totalIncome += amount;
      } else {
        totalExpense += amount;
      }
    });
  }
  
  const balance = totalIncome - totalExpense;
  
  // 5. 生成Excel文件
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('账目明细');
  
  // 设置列
  worksheet.columns = [
    { header: '日期', key: 'date', width: 15 },
    { header: '类型', key: 'type', width: 10 },
    { header: '金额', key: 'amount', width: 15 },
    { header: '分类', key: 'category', width: 15 },
    { header: '成员', key: 'member', width: 15 },
    { header: '备注', key: 'description', width: 30 },
  ];
  
  // 添加数据
  txList.forEach(tx => {
    worksheet.addRow({
      date: tx.date,
      type: tx.type === 'income' ? '收入' : '支出',
      amount: parseFloat(tx.amount),
      category: tx.categoryName || '',
      member: tx.memberNickname || tx.memberUsername || '',
      description: tx.description || '',
    });
  });
  
  // 设置表头样式
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD32F2F' },
  };
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  
  // 生成Buffer
  const excelBuffer = await workbook.xlsx.writeBuffer();
  
  // 6. 发送邮件
  await sendBackupEmail({
    to: user[0].email,
    ledgerName: ledger[0].name,
    excelBuffer: Buffer.from(excelBuffer),
    stats: {
      totalRecords: txList.length,
      earliestDate,
      latestDate,
      totalIncome,
      totalExpense,
      balance,
    },
  });
  
  console.log(`备份邮件已发送: 账本=${ledger[0].name}, 用户=${user[0].email}`);
}

/**
 * 检查并执行所有到期的备份任务
 */
export async function checkAndExecuteBackups(): Promise<void> {
  const db_instance = await getDb();
  if (!db_instance) throw new Error("Database not available");
  
  const { ledgerBackupSettings } = await import("../drizzle/schema");
  const { lte, eq, and } = await import("drizzle-orm");
  
  const now = new Date();
  
  // 查询所有启用且到期的备份设置
  const dueBackups = await db_instance
    .select()
    .from(ledgerBackupSettings)
    .where(
      and(
        eq(ledgerBackupSettings.enabled, 1),
        lte(ledgerBackupSettings.nextBackupAt, now.toISOString())
      )
    );
  
  console.log(`找到 ${dueBackups.length} 个到期的备份任务`);
  
  // 执行每个备份任务
  for (const backup of dueBackups) {
    try {
      await executeBackup(backup.ledgerId, backup.userId);
      
      // 计算下次备份时间
      let nextBackupAt = new Date(now);
      if (backup.frequency === 'weekly') {
        nextBackupAt.setDate(now.getDate() + 7);
      } else if (backup.frequency === 'monthly') {
        nextBackupAt.setMonth(now.getMonth() + 1);
      } else if (backup.frequency === 'quarterly') {
        nextBackupAt.setMonth(now.getMonth() + 3);
      }
      
      // 更新备份记录
      await db_instance
        .update(ledgerBackupSettings)
        .set({
          lastBackupAt: now,
          nextBackupAt: nextBackupAt,
        })
        .where(eq(ledgerBackupSettings.id, backup.id));
      
      console.log(`备份任务完成: ID=${backup.id}`);
    } catch (error) {
      console.error(`备份任务失败: ID=${backup.id}`, error);
    }
  }
}
