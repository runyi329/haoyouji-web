import express, { Request, Response, Router } from 'express';
import ExcelJS from 'exceljs';
import * as dbLedger from './db-ledger';

const router = Router();

// 导出账本为Excel
router.get('/api/ledger/:ledgerId/export', async (req: Request, res: Response) => {
  try {
    const ledgerId = parseInt(req.params.ledgerId);
    
    // 从请求头中获取userId（由前端传递）
    const userIdHeader = req.headers['x-user-id'];
    if (!userIdHeader || typeof userIdHeader !== 'string') {
      return res.status(401).json({ error: '未登录' });
    }
    
    const userId = parseInt(userIdHeader);    
    console.log('[exportLedger] 开始导出:', { ledgerId, userId });
    
    // 获取账本信息
    const ledger = await dbLedger.getLedgerById(ledgerId, userId);
    if (!ledger) {
      return res.status(404).json({ error: '账本不存在' });
    }
    
    // 获取账目数据
    const transactions = await dbLedger.getTransactionsList(
      ledgerId,
      userId,
      {}
    );
    
    console.log('[exportLedger] 获取到账目数据:', { count: transactions.length });
    
    // 创建 Excel工作簿
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('账目明细');
    
    // 设置列
    worksheet.columns = [
      { header: '日期', key: 'date', width: 15 },
      { header: '类型', key: 'type', width: 10 },
      { header: '分类', key: 'category', width: 15 },
      { header: '金额', key: 'amount', width: 15 },
      { header: '备注', key: 'description', width: 30 },
      { header: '创建人', key: 'creator', width: 15 },
    ];
    
    // 添加数据 - transactions是按日期分组的数组
    let rowCount = 0;
    transactions.forEach((dayGroup: any) => {
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
      });
    });
    
    console.log('[exportLedger] 添加了', rowCount, '条记录');
    
    // 生成buffer
    const buffer = await workbook.xlsx.writeBuffer();
    
    // 设置响应头 - 使用账本名称
    const dateStr = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-');
    const filename = `${ledger.name}_${dateStr}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader('Content-Length', buffer.length);
    
    // 发送文件
    res.send(buffer);
    
    console.log('[exportLedger] 导出成功');
  } catch (error: any) {
    console.error('[exportLedger] 错误:', error);
    res.status(500).json({ error: `导出失败: ${error.message}` });
  }
});

export default router;
