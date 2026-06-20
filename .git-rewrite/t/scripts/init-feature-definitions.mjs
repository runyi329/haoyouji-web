import mysql from 'mysql2/promise';
import 'dotenv/config';

/**
 * 初始化 feature_definitions 表
 * 插入 19 个容器的定义数据
 */

const featureDefinitions = [
  { featureId: 1, title: '人脉总数', description: '显示所有人脉的总数', defaultPosition: 0 },
  { featureId: 2, title: '本周新增', description: '本周新增的人脉数量', defaultPosition: 1 },
  { featureId: 3, title: '本月新增', description: '本月新增的人脉数量', defaultPosition: 2 },
  { featureId: 4, title: '今年新增', description: '今年新增的人脉数量', defaultPosition: 3 },
  { featureId: 5, title: '联络频率', description: '平均联络频率（天）', defaultPosition: 4 },
  { featureId: 6, title: '需要关注', description: '需要关注的人脉数量', defaultPosition: 5 },
  { featureId: 7, title: '本月活跃', description: '本月活跃的人脉数量', defaultPosition: 6 },
  { featureId: 8, title: '本周活跃', description: '本周活跃的人脉数量', defaultPosition: 7 },
  { featureId: 9, title: '今年活跃', description: '今年活跃的人脉数量', defaultPosition: 8 },
  { featureId: 10, title: '拉黑名单', description: '拉黑的人脉数量', defaultPosition: 9 },
  { featureId: 11, title: '今日提醒', description: '今日需要提醒的人脉', defaultPosition: 10 },
  { featureId: 12, title: '本周提醒', description: '本周需要提醒的人脉', defaultPosition: 11 },
  { featureId: 13, title: '本月提醒', description: '本月需要提醒的人脉', defaultPosition: 12 },
  { featureId: 14, title: '今日活跃', description: '今日活跃的人脉数量', defaultPosition: 13 },
  { featureId: 15, title: '休眠名单', description: '长时间未联系的人脉', defaultPosition: 14 },
  { featureId: 16, title: '公司数量', description: '人脉所在公司的数量', defaultPosition: 15 },
  { featureId: 17, title: '累计联络', description: '累计联络次数', defaultPosition: 16 },
  { featureId: 18, title: '累计标签', description: '累计标签数量', defaultPosition: 17 },
  { featureId: 19, title: '累计使用', description: '累计使用天数', defaultPosition: 18 },
];

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  
  try {
    console.log('开始初始化 feature_definitions 表...');
    
    // 检查是否已经有数据
    const [existing] = await conn.query('SELECT COUNT(*) as count FROM feature_definitions');
    if (existing[0].count > 0) {
      console.log(`表中已有 ${existing[0].count} 条数据，跳过初始化`);
      return;
    }
    
    // 获取系统管理员 ID（假设是第一个超级管理员）
    const [admins] = await conn.query("SELECT id FROM users WHERE role = 'super_admin' ORDER BY id LIMIT 1");
    if (admins.length === 0) {
      throw new Error('未找到超级管理员用户');
    }
    const createdBy = admins[0].id;
    
    // 批量插入
    const values = featureDefinitions.map(def => 
      `(${def.featureId}, '${def.title}', '${def.description}', 1, ${def.defaultPosition}, ${createdBy})`
    ).join(',\n  ');
    
    const sql = `
      INSERT INTO feature_definitions (featureId, title, description, isActive, defaultPosition, createdBy)
      VALUES
        ${values}
    `;
    
    await conn.query(sql);
    
    console.log(`✅ 成功插入 ${featureDefinitions.length} 条容器定义数据`);
    
    // 验证
    const [result] = await conn.query('SELECT * FROM feature_definitions ORDER BY defaultPosition');
    console.log('\n已插入的数据：');
    result.forEach(row => {
      console.log(`  [${row.featureId}] ${row.title} (位置: ${row.defaultPosition})`);
    });
    
  } catch (error) {
    console.error('❌ 初始化失败:', error);
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch(console.error);
