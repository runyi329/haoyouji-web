import { sendBackupEmail } from './email-service';
import * as dbLedger from './db-ledger';
import { getLedgerDb } from './db';
import ExcelJS from 'exceljs';

/**
 * 执行单个账本的备份并发送邮件
 * 
 * 直接复用 dbLedger 中已有的函数获取数据，
 * 复用 routers.ts 中 exportToExcel 的模式生成 Excel。
 */
export async function executeBackup(ledgerId: number, userId: number): Promise<void> {
  console.log('[executeBackup] 开始执行备份:', { ledgerId, userId });
  
  // 1. 获取账本信息（包含权限检查）
  //    复用 dbLedger.getLedgerById，它会验证用户是否是账本成员
  const ledgerInfo = await dbLedger.getLedgerById(ledgerId, userId);
  console.log('[executeBackup] 获取账本信息成功:', { name: ledgerInfo.name });
  
  // 2. 获取用户邮箱
  const db = await getLedgerDb();
  if (!db) throw new Error("Database not available");
  
  const { users } = await import("../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  
  const userRows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  
  if (userRows.length === 0 || !userRows[0].email) {
    throw new Error('用户邮箱未设置，请先在个人资料中填写邮箱地址');
  }
  
  const userEmail = userRows[0].email;
  console.log('[executeBackup] 用户邮箱:', userEmail);
  
  // 3. 获取账目数据
  //    复用 dbLedger.getTransactionsList，与 exportToExcel 使用完全相同的函数
  //    设置 limit 为 10000 以获取所有记录
  const transactions = await dbLedger.getTransactionsList(
    ledgerId,
    userId,
    { limit: 10000 }
  );
  
  console.log('[executeBackup] 获取到账目数据:', { dayGroups: transactions.length });
  
  // 4. 生成 Excel 文件
  //    完全复制 routers.ts 中 exportToExcel 的逻辑
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('账目明细');
  
  // 设置列（与 exportToExcel 完全一致）
  worksheet.columns = [
    { header: '日期', key: 'date', width: 15 },
    { header: '类型', key: 'type', width: 10 },
    { header: '分类', key: 'category', width: 15 },
    { header: '金额', key: 'amount', width: 15 },
    { header: '备注', key: 'description', width: 30 },
    { header: '创建人', key: 'creator', width: 15 },
  ];
  
  // 添加数据 - transactions 是按日期分组的数组（与 exportToExcel 完全一致）
  let rowCount = 0;
  let totalIncome = 0;
  let totalExpense = 0;
  let earliestDate = '';
  let latestDate = '';
  
  transactions.forEach((dayGroup: any) => {
    // 记录日期范围
    if (!earliestDate || dayGroup.date < earliestDate) {
      earliestDate = dayGroup.date;
    }
    if (!latestDate || dayGroup.date > latestDate) {
      latestDate = dayGroup.date;
    }
    
    dayGroup.records.forEach((record: any) => {
      worksheet.addRow({
        date: dayGroup.date,
        type: record.type === 'income' ? '收入' : '支出',
        category: record.category || '未分类',
        amount: record.amount,
        description: record.description || '',
        creator: record.member?.username || '',
      });
      rowCount++;
      
      // 统计收支
      const amount = Number(record.amount);
      if (record.type === 'income') {
        totalIncome += amount;
      } else {
        totalExpense += amount;
      }
    });
  });
  
  console.log('[executeBackup] 添加了', rowCount, '条记录');
  
  // 设置表头样式
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD32F2F' },
  };
  
  // 生成 Buffer
  const buffer = await workbook.xlsx.writeBuffer();
  
  const balance = totalIncome - totalExpense;
  
  // 5. 发送邮件
  await sendBackupEmail({
    to: userEmail,
    ledgerName: ledgerInfo.name,
    excelBuffer: Buffer.from(buffer),
    stats: {
      totalRecords: rowCount,
      earliestDate: earliestDate || '无记录',
      latestDate: latestDate || '无记录',
      totalIncome,
      totalExpense,
      balance,
    },
  });
  
  console.log(`[executeBackup] 备份邮件已发送: 账本=${ledgerInfo.name}, 用户=${userEmail}, 记录数=${rowCount}`);
}

/**
 * 检查并执行所有到期的备份任务
 */
export async function checkAndExecuteBackups(): Promise<void> {
  const db = await getLedgerDb();
  if (!db) throw new Error("Database not available");
  
  const { ledgerBackupSettings } = await import("../drizzle/schema");
  const { lte, eq, and, sql } = await import("drizzle-orm");
  
  const now = new Date();
  
  // 查询所有启用且到期的备份设置
  const dueBackups = await db
    .select()
    .from(ledgerBackupSettings)
    .where(
      and(
        eq(ledgerBackupSettings.enabled, 1),
        lte(ledgerBackupSettings.nextBackupAt, now.toISOString())
      )
    );
  
  console.log(`[checkAndExecuteBackups] 找到 ${dueBackups.length} 个到期的备份任务`);
  
  // 执行每个备份任务
  for (const backup of dueBackups) {
    try {
      await executeBackup(backup.ledgerId, backup.userId);
      
      // 计算下次备份时间
      const nextBackupAt = new Date(now);
      if (backup.frequency === 'weekly') {
        nextBackupAt.setDate(now.getDate() + 7);
      } else if (backup.frequency === 'monthly') {
        nextBackupAt.setMonth(now.getMonth() + 1);
      } else if (backup.frequency === 'quarterly') {
        nextBackupAt.setMonth(now.getMonth() + 3);
      }
      
      // 更新备份记录
      await db
        .update(ledgerBackupSettings)
        .set({
          backupCount: sql`backup_count + 1`,
          lastBackupAt: now.toISOString(),
          nextBackupAt: nextBackupAt.toISOString(),
        })
        .where(eq(ledgerBackupSettings.id, backup.id));
      
      console.log(`[checkAndExecuteBackups] 备份任务完成: ID=${backup.id}`);
    } catch (error) {
      console.error(`[checkAndExecuteBackups] 备份任务失败: ID=${backup.id}`, error);
    }
  }
}
