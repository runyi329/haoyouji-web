/**
 * 补全历史报销订单的员工编号
 * 用法: node scripts/backfill-employee-no.mjs
 */
import { createConnection } from 'mysql2/promise';
import { pinyin } from 'pinyin-pro';
import dotenv from 'dotenv';
dotenv.config();

function getCompanyInitials(companyName) {
  if (!companyName) return 'EMP';
  // 1. 去掉公司后缀
  let cleaned = companyName
    .replace(/(有限责任公司|有限公司|股份有限公司|股份公司|集团有限公司|集团公司|集团|公司|企业|工作室|合伙企业|个体工商户)/g, '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .trim();
  // 2. 去掉省市地名前缀
  cleaned = cleaned
    .replace(/^(北京|上海|天津|重庆|香港|澳门|台湾)/g, '')
    .replace(/^(黑龙江|内蒙古|新疆|西藏)/g, '')
    .replace(/^[\u4e00-\u9fa5]{2,3}(省|市|区|县|州)/g, '')
    .trim();
  // 3. 去掉通用行业词
  cleaned = cleaned
    .replace(/(商务|信息|咨询|科技|技术|贸易|实业|投资|管理|服务|文化|传媒|网络|电子|机械|建筑|装饰|装修|物流|运输|租赁|餐饮|食品|医疗|教育|培训|金融|保险|房地产|农业|能源|化工|纺织|服装)/g, '')
    .trim();
  if (!cleaned) {
    cleaned = companyName
      .replace(/(有限责任公司|有限公司|股份有限公司|股份公司|集团有限公司|集团公司|集团|公司)/g, '')
      .replace(/[（(][^）)]*[）)]/g, '')
      .trim();
  }
  if (!cleaned) return 'EMP';
  // 4. 取前2~4个汉字的拼音首字母
  const chars = cleaned.match(/[\u4e00-\u9fa5]/g) || [];
  const coreChars = chars.slice(0, 4).join('');
  if (!coreChars) return 'EMP';
  const initials = pinyin(coreChars, { pattern: 'first', toneType: 'none', separator: '' })
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return initials || 'EMP';
}

async function main() {
  // 解析 DATABASE_URL
  const dbUrl = process.env.DATABASE_URL || process.env.EXTERNAL_DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not found');
    process.exit(1);
  }

  let conn;
  try {
    conn = await createConnection(dbUrl + '?ssl={"rejectUnauthorized":false}');
    console.log('✅ 数据库连接成功');
  } catch (e) {
    // 尝试不带 ssl
    try {
      conn = await createConnection(dbUrl);
      console.log('✅ 数据库连接成功（无SSL）');
    } catch (e2) {
      console.error('❌ 数据库连接失败:', e2.message);
      process.exit(1);
    }
  }

  // 1. 先清空所有旧编号，重新按新规则生成
  await conn.execute(`
    UPDATE ledger_records lr
    JOIN ledgers l ON l.id = lr.ledgerId
    SET lr.aj_employee_no = NULL
    WHERE l.type = 'custom_aj'
  `);
  console.log('✅ 已清空旧编号，重新按新规则生成');

  // 2. 查询需要补全的记录
  const [records] = await conn.execute(`
    SELECT lr.id, lr.ledgerId, lr.createdBy, lr.aj_company_name
    FROM ledger_records lr
    JOIN ledgers l ON l.id = lr.ledgerId
    WHERE l.type = 'custom_aj'
      AND lr.aj_company_name IS NOT NULL
    ORDER BY lr.ledgerId, lr.createdBy, lr.id
  `);
  console.log(`\n需要补全的记录数: ${records.length}`);
  if (records.length === 0) {
    console.log('没有需要补全的记录');
    await conn.end();
    return;
  }

  // 3. 查询各账本各前缀的最大序号（清空后为空）
  const [maxRows] = await conn.execute(`
    SELECT ledgerId,
           SUBSTRING_INDEX(aj_employee_no, '-', 1) as prefix,
           MAX(CAST(SUBSTRING_INDEX(aj_employee_no, '-', -1) AS UNSIGNED)) as maxNum
    FROM ledger_records
    WHERE aj_employee_no IS NOT NULL
    GROUP BY ledgerId, SUBSTRING_INDEX(aj_employee_no, '-', 1)
  `);
  const maxMap = new Map();
  for (const row of maxRows) {
    maxMap.set(`${row.ledgerId}:${row.prefix}`, Number(row.maxNum) || 0);
  }

  // 4. 按 (ledgerId, createdBy) 分组生成编号
  const groups = new Map();
  for (const rec of records) {
    const key = `${rec.ledgerId}:${rec.createdBy}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rec);
  }

  const newAssignments = new Map();
  const updates = [];

  for (const [key, recs] of groups) {
    let empNo;
    if (newAssignments.has(key)) {
      empNo = newAssignments.get(key);
    } else {
      const companyName = recs[0].aj_company_name || '';
      const prefix = getCompanyInitials(companyName) || 'EMP';
      const prefixKey = `${recs[0].ledgerId}:${prefix}`;
      const currentMax = maxMap.get(prefixKey) || 0;
      const nextNum = currentMax + 1;
      empNo = `${prefix}-${String(nextNum).padStart(4, '0')}`;
      maxMap.set(prefixKey, nextNum);
      newAssignments.set(key, empNo);
      console.log(`  用户 ${recs[0].createdBy} 账本 ${recs[0].ledgerId}: 新编号 ${empNo}（${companyName}），${recs.length} 条`);
    }
    for (const rec of recs) {
      updates.push([empNo, rec.id]);
    }
  }

  // 5. 批量更新
  console.log(`\n开始更新 ${updates.length} 条记录...`);
  let success = 0, fail = 0;
  for (const [empNo, id] of updates) {
    try {
      await conn.execute('UPDATE ledger_records SET aj_employee_no = ? WHERE id = ?', [empNo, id]);
      success++;
    } catch (e) {
      console.error(`  ❌ 更新 id=${id} 失败:`, e.message);
      fail++;
    }
  }

  console.log(`\n✅ 成功: ${success} 条，❌ 失败: ${fail} 条`);

  // 6. 验证
  const [verifyRows] = await conn.execute(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN aj_employee_no IS NULL THEN 1 ELSE 0 END) as missing
    FROM ledger_records lr
    JOIN ledgers l ON l.id = lr.ledgerId
    WHERE l.type = 'custom_aj' AND lr.aj_company_name IS NOT NULL
  `);
  console.log(`\n验证结果: 总计 ${verifyRows[0].total} 条，仍缺少编号 ${verifyRows[0].missing} 条`);

  await conn.end();
}

main().catch(e => {
  console.error('❌ 脚本执行失败:', e);
  process.exit(1);
});
