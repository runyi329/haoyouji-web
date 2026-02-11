import mysql from 'mysql2/promise';
import COS from 'cos-nodejs-sdk-v5';
import crypto from 'crypto';

// 请在服务器上运行此脚本，确保.env文件中配置了COS密钥
if (!process.env.COS_SECRET_ID || !process.env.COS_SECRET_KEY) {
  console.error('错误: 未找到COS密钥，请配置.env文件');
  process.exit(1);
}

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID,
  SecretKey: process.env.COS_SECRET_KEY,
});

const BUCKET = process.env.COS_BUCKET || 'haoyouji-images-1396946788';
const REGION = process.env.COS_REGION || 'ap-shanghai';

const connection = await mysql.createConnection({
  host: '124.223.54.69',
  port: 3306,
  user: 'root',
  password: 'Miao@20190603',
  database: 'crm_db'
});

console.log('=== 开始迁移头像到腾讯COS ===\n');

try {
  // 1. 查询所有有头像的用户
  const [users] = await connection.execute(`
    SELECT id, username, avatar 
    FROM users 
    WHERE avatar IS NOT NULL 
      AND avatar != '' 
      AND avatar NOT LIKE 'https://%'
    LIMIT 100
  `);
  
  console.log(`找到 ${users.length} 个需要迁移的头像\n`);
  
  if (users.length === 0) {
    console.log('没有需要迁移的头像');
    process.exit(0);
  }
  
  let successCount = 0;
  let failCount = 0;
  
  // 2. 逐个上传到COS
  for (const user of users) {
    try {
      console.log(`[${user.id}] ${user.username} - 开始上传...`);
      
      // 解析base64数据
      let buffer;
      let contentType = 'image/jpeg';
      
      if (user.avatar.startsWith('data:image/')) {
        const matches = user.avatar.match(/^data:image\/(\w+);base64,(.+)$/);
        if (matches) {
          contentType = `image/${matches[1]}`;
          buffer = Buffer.from(matches[2], 'base64');
        } else {
          throw new Error('无法解析base64格式');
        }
      } else {
        // 纯base64字符串
        buffer = Buffer.from(user.avatar, 'base64');
      }
      
      // 生成文件名
      const hash = crypto.createHash('md5').update(buffer).digest('hex');
      const ext = contentType.split('/')[1] || 'jpg';
      const key = `avatars/migrated-${user.id}-${hash}.${ext}`;
      
      // 上传到COS
      await cos.putObject({
        Bucket: BUCKET,
        Region: REGION,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });
      
      const cosUrl = `https://${BUCKET}.cos.${REGION}.myqcloud.com/${key}`;
      
      // 更新数据库
      await connection.execute(
        'UPDATE users SET avatar = ? WHERE id = ?',
        [cosUrl, user.id]
      );
      
      console.log(`[${user.id}] ✅ 成功: ${cosUrl}`);
      successCount++;
      
    } catch (error) {
      console.error(`[${user.id}] ❌ 失败:`, error.message);
      failCount++;
    }
  }
  
  console.log('\n=== 迁移完成 ===');
  console.log(`成功: ${successCount} 个`);
  console.log(`失败: ${failCount} 个`);
  console.log(`总计: ${users.length} 个`);
  
} catch (error) {
  console.error('迁移失败:', error);
} finally {
  await connection.end();
}
