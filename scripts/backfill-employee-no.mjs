/**
 * 批量补全现有报销记录的员工编号
 * 格式：公司名拼音缩写-4位数字（如 YJ-0001）
 * 规则：同一用户在同一账本内编号唯一，按首次提交时间排序分配
 * 移除再加入编号不变（查询时不过滤 deleted_at）
 */

import { pinyin } from 'pinyin-pro';
import mysql from 'mysql2/promise';

function getCompanyInitials(companyName) {
  if (!companyName) return 'EMP';
  const cleaned = companyName
    .replace(/(有限责任公司|有限公司|股份有限公司|股份公司|集团有限公司|集团公司|集团|公司|企业|工作室|合伙企业|个体工商户)/g, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .trim();
  if (!cleaned) return 'EMP';
  const initials = pinyin(cleaned, { pattern: 'first', toneType: 'none', separator: '' })
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return initials || 'EMP';
}

async function main() {
  // 优先使用 DATABASE_URL 环境变量，否则使用服务器本地 MySQL
  let conn;
  const DATABASE_URL = process.env.DATABASE_URL || process.env.EXTERNAL_DATABASE_URL;

  if (DATABASE_URL) {
    try {
      const url = new URL(DATABASE_URL);
      conn = await mysql.createConnection({
        host: url.hostname,
        port: parseInt(url.port) || 4000,
        user: url.username,
        password: decodeURIComponent(url.password),
        database: url.pathname.slice(1).split('?')[0],
        ssl: { rejectUnauthorized: false },
      });
    } catch (e) {
      console.log('DATABASE_URL 连接失败，尝试本地 MySQL...');
    }
  }

  if (!conn) {
    conn = await mysql.createConnection({
      host: '127.0.0.1',
      port: 3306,
      user: 'root',
      password: 'Miao@20190603',
      database: 'crm_db',
    });
  }

  console.log('✅ 数据库连接成功');

  // 查找所有 aj_status 不为 null 且 aj_employee_no 为 null 的记录
  const [rows] = await conn.execute(
    `SELECT id, ledgerId, createdBy, aj_company_name, created_at
     FROM ledger_records
     WHERE aj_status IS NOT NULL AND (aj_employee_no IS NULL OR aj_employee_no = '')
     ORDER BY created_at ASC`
  );

  console.log(`📊 找到 ${rows.length} 条需要补全编号的记录`);
  if (rows.length === 0) {
    console.log('✅ 无需补全，所有记录已有编号');
    await conn.end();
    return;
  }

  // 按 ledgerId + createdBy 分组
  const userLedgerMap = new Map();
  for (const row of rows) {
    const key = `${row.ledgerId}:${row.createdBy}`;
    if (!userLedgerMap.has(key)) {
      userLedgerMap.set(key, {
        ledgerId: row.ledgerId,
        createdBy: row.createdBy,
        companyName: row.aj_company_name || '',
        recordIds: [],
      });
    }
    userLedgerMap.get(key).recordIds.push(row.id);
  }

  // 按 ledgerId 分组
  const ledgerMap = new Map();
  for (const [, info] of userLedgerMap) {
    if (!ledgerMap.has(info.ledgerId)) ledgerMap.set(info.ledgerId, []);
    ledgerMap.get(info.ledgerId).push(info);
  }

  let totalUpdated = 0;

  for (const [ledgerId, users] of ledgerMap) {
    console.log(`\n📁 账本 ${ledgerId}，${users.length} 个用户需要分配编号`);

    // 查该账本已有的编号（包括已删除记录，避免重复）
    const [existingRows] = await conn.execute(
      `SELECT aj_employee_no FROM ledger_records
       WHERE ledgerId = ? AND aj_employee_no IS NOT NULL AND aj_employee_no != ''`,
      [ledgerId]
    );

    // 按前缀统计已有最大序号
    const prefixCounters = new Map();
    for (const row of existingRows) {
      const no = row.aj_employee_no;
      const lastDash = no.lastIndexOf('-');
      if (lastDash > 0) {
        const prefix = no.substring(0, lastDash);
        const num = parseInt(no.substring(lastDash + 1)) || 0;
        if (!prefixCounters.has(prefix) || prefixCounters.get(prefix) < num) {
          prefixCounters.set(prefix, num);
        }
      }
    }

    for (const userInfo of users) {
      // 先检查该用户是否已有编号（包括已删除记录）
      const [existCheck] = await conn.execute(
        `SELECT aj_employee_no FROM ledger_records
         WHERE ledgerId = ? AND createdBy = ? AND aj_employee_no IS NOT NULL AND aj_employee_no != ''
         LIMIT 1`,
        [ledgerId, userInfo.createdBy]
      );

      let employeeNo;
      if (existCheck.length > 0) {
        // 已有编号，直接用已有的（补全到其他记录）
        employeeNo = existCheck[0].aj_employee_no;
        console.log(`  👤 用户 ${userInfo.createdBy} 已有编号 ${employeeNo}，补全到空记录`);
      } else {
        // 生成新编号
        const prefix = getCompanyInitials(userInfo.companyName);
        const currentMax = prefixCounters.get(prefix) || 0;
        const nextNum = currentMax + 1;
        employeeNo = `${prefix}-${String(nextNum).padStart(4, '0')}`;
        prefixCounters.set(prefix, nextNum);
        console.log(`  👤 用户 ${userInfo.createdBy} → 新编号 ${employeeNo}（公司：${userInfo.companyName || '未知'}）`);
      }

      // 更新该用户在该账本的所有空编号记录
      const [updateResult] = await conn.execute(
        `UPDATE ledger_records SET aj_employee_no = ?
         WHERE ledgerId = ? AND createdBy = ? AND (aj_employee_no IS NULL OR aj_employee_no = '')`,
        [employeeNo, ledgerId, userInfo.createdBy]
      );
      console.log(`    更新 ${updateResult.affectedRows} 条记录`);
      totalUpdated += updateResult.affectedRows;
    }
  }

  console.log(`\n✅ 完成！共更新 ${totalUpdated} 条记录`);
  await conn.end();
}

main().catch(err => {
  console.error('❌ 错误：', err.message);
  process.exit(1);
});
