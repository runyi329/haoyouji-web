import mysql from 'mysql2/promise';

// 直接使用解析好的连接参数（密码中含@，需特殊处理）
const config = {
  host: '124.223.54.69',
  port: 3306,
  user: 'root',
  password: 'Miao@20190603',
  database: 'crm_db',
  connectTimeout: 10000,
};

// 59号账本的14位股东
const shareholders = [
  { userId: 870413,  name: '胡永煜',    shareNo: '0001' },
  { userId: 510025,  name: 'Julie',      shareNo: '0002' },
  { userId: 4957147, name: '陈奇戌',    shareNo: '0003' },
  { userId: 4957151, name: '大饼江湖',  shareNo: '0004' },
  { userId: 4957141, name: 'vesen',      shareNo: '0005' },
  { userId: 4957213, name: 'cyndi2109', shareNo: '0006' },
  { userId: 4957217, name: '李斌Luby',  shareNo: '0007' },
  { userId: 4680302, name: '张慧',      shareNo: '0008' },
  { userId: 4957155, name: 'Johnson',   shareNo: '0009' },
  { userId: 4952766, name: '刘力凡',   shareNo: '0010' },
  { userId: 3060001, name: '阿潇',      shareNo: '0011' },
  { userId: 4957222, name: 'LK070865', shareNo: '0012' },
  { userId: 4957247, name: 'Mychael',  shareNo: '0013' },
  { userId: 4957293, name: '袁贇',      shareNo: '0014' },
];

async function main() {
  const conn = await mysql.createConnection(config);
  console.log('数据库连接成功\n');

  const results = [];

  for (const sh of shareholders) {
    const uid = sh.userId;

    // 1. 直接手动添加的好友（我自己录入的联系人）
    const [directRows] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM contacts WHERE parentUserId = ?`,
      [uid]
    );
    const directCount = Number(directRows[0].cnt);

    // 2. 面对面扫码/用户名共享来的好友（无介绍人）
    const [scanShareRows] = await conn.execute(
      `SELECT COUNT(DISTINCT c.id) as cnt
       FROM contact_sharing_connections csc
       JOIN contacts c ON c.parentUserId = csc.sharerId
       WHERE csc.receiverId = ?
         AND csc.status = 'active'
         AND (csc.introducer_id IS NULL OR csc.introducer_id = 0)`,
      [uid]
    );
    const scanShareCount = Number(scanShareRows[0].cnt);

    // 3. 通过聚合码/介绍码间接介绍来的好友（有介绍人）
    const [introRows] = await conn.execute(
      `SELECT COUNT(DISTINCT c.id) as cnt
       FROM contact_sharing_connections csc
       JOIN contacts c ON c.parentUserId = csc.sharerId
       WHERE csc.receiverId = ?
         AND csc.status = 'active'
         AND csc.introducer_id IS NOT NULL
         AND csc.introducer_id != 0`,
      [uid]
    );
    const introCount = Number(introRows[0].cnt);

    // 4. 我作为介绍人，帮助他人建立的共享连接数
    const [myIntroRows] = await conn.execute(
      `SELECT COUNT(*) as cnt
       FROM contact_sharing_connections
       WHERE introducer_id = ?
         AND status = 'active'`,
      [uid]
    );
    const myIntroCount = Number(myIntroRows[0].cnt);

    // 5. 聚合码订阅者数量
    let aggregateSubscribers = 0;
    try {
      const [subRows] = await conn.execute(
        `SELECT COUNT(*) as cnt FROM sharing_subscriptions WHERE introducer_id = ?`,
        [uid]
      );
      aggregateSubscribers = Number(subRows[0].cnt);
    } catch (e) {
      // 表可能不存在
    }

    const total = directCount + scanShareCount + introCount;

    results.push({
      shareNo: sh.shareNo,
      name: sh.name,
      userId: uid,
      directCount,
      scanShareCount,
      introCount,
      total,
      myIntroCount,
      aggregateSubscribers,
    });
  }

  await conn.end();

  // 打印表格
  console.log('=== 59号账本股东 三种来源人脉统计 ===\n');
  const header = 
    '编号  ' +
    '姓名          ' +
    '①直接添加  ' +
    '②扫码共享  ' +
    '③聚合码介绍  ' +
    '合计可见  ' +
    '我介绍他人  ' +
    '我的聚合订阅者';
  console.log(header);
  console.log('-'.repeat(100));

  for (const r of results) {
    const line = 
      r.shareNo.padEnd(6) +
      r.name.padEnd(14) +
      String(r.directCount).padEnd(11) +
      String(r.scanShareCount).padEnd(11) +
      String(r.introCount).padEnd(13) +
      String(r.total).padEnd(10) +
      String(r.myIntroCount).padEnd(12) +
      String(r.aggregateSubscribers);
    console.log(line);
  }

  console.log('\n说明：');
  console.log('① 直接添加：contacts表中 parentUserId=本人 的记录（自己手动录入）');
  console.log('② 扫码共享：对方直接扫码或输入用户名共享给我的联系人（无介绍人）');
  console.log('③ 聚合码介绍：通过他人聚合码/介绍码间接建立的共享（有introducer_id）');
  console.log('  我介绍他人：我作为介绍人帮助建立的共享连接数');
  console.log('  我的聚合订阅者：订阅了我聚合码的人数');
}

main().catch(console.error);
