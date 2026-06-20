#!/usr/bin/env node

import mysql from 'mysql2/promise';
import fs from 'fs';

const connection = await mysql.createConnection({
  host: 'gateway03.us-east-1.prod.aws.tidbcloud.com',
  port: 4000,
  user: 'XTqR3P9v8tSgKnm.a50f4dd2e0aa',
  password: 'Ba9vOSxsX44g116pXAKU',
  database: 'dWfvfUieyVkmVGc44bjad7',
  ssl: { rejectUnauthorized: true }
});

console.log('=== 执行邀请系统数据库迁移 ===\n');

// 1. 添加invite_code字段 (先不加UNIQUE约束)
try {
  await connection.query(`
    ALTER TABLE users ADD COLUMN invite_code VARCHAR(6) COMMENT '专属邀请码(6位随机字母数字)'
  `);
  console.log('✅ 添加 invite_code 字段');
} catch (e) {
  if (e.message.includes('Duplicate column')) {
    console.log('⏭️  invite_code 字段已存在');
  } else {
    console.error('❌ 添加 invite_code 失败:', e.message);
  }
}

// 2. 添加invite_link字段
try {
  await connection.query(`
    ALTER TABLE users ADD COLUMN invite_link VARCHAR(255) COMMENT '专属邀请链接'
  `);
  console.log('✅ 添加 invite_link 字段');
} catch (e) {
  if (e.message.includes('Duplicate column')) {
    console.log('⏭️  invite_link 字段已存在');
  } else {
    console.error('❌ 添加 invite_link 失败:', e.message);
  }
}

// 3. 添加invited_by_user_id字段
try {
  await connection.query(`
    ALTER TABLE users ADD COLUMN invited_by_user_id INT COMMENT '邀请者的用户ID'
  `);
  console.log('✅ 添加 invited_by_user_id 字段');
} catch (e) {
  if (e.message.includes('Duplicate column')) {
    console.log('⏭️  invited_by_user_id 字段已存在');
  } else {
    console.error('❌ 添加 invited_by_user_id 失败:', e.message);
  }
}

// 4. 添加invited_at字段
try {
  await connection.query(`
    ALTER TABLE users ADD COLUMN invited_at TIMESTAMP NULL COMMENT '被邀请注册的时间'
  `);
  console.log('✅ 添加 invited_at 字段');
} catch (e) {
  if (e.message.includes('Duplicate column')) {
    console.log('⏭️  invited_at 字段已存在');
  } else {
    console.error('❌ 添加 invited_at 失败:', e.message);
  }
}

// 5. 添加invite_count字段
try {
  await connection.query(`
    ALTER TABLE users ADD COLUMN invite_count INT DEFAULT 0 NOT NULL COMMENT '成功邀请的用户数量'
  `);
  console.log('✅ 添加 invite_count 字段');
} catch (e) {
  if (e.message.includes('Duplicate column')) {
    console.log('⏭️  invite_count 字段已存在');
  } else {
    console.error('❌ 添加 invite_count 失败:', e.message);
  }
}

// 6. 创建唯一索引
try {
  await connection.query(`CREATE UNIQUE INDEX idx_invite_code ON users(invite_code)`);
  console.log('✅ 创建 idx_invite_code 唯一索引');
} catch (e) {
  if (e.message.includes('Duplicate key') || e.message.includes('already exists')) {
    console.log('⏭️  idx_invite_code 索引已存在');
  } else {
    console.error('❌ 创建索引失败:', e.message);
  }
}

try {
  await connection.query(`CREATE INDEX idx_invited_by ON users(invited_by_user_id)`);
  console.log('✅ 创建 idx_invited_by 索引');
} catch (e) {
  if (e.message.includes('Duplicate key')) {
    console.log('⏭️  idx_invited_by 索引已存在');
  } else {
    console.error('❌ 创建索引失败:', e.message);
  }
}

console.log('\n=== 为现有用户生成邀请码 ===\n');

// 生成6位随机邀请码的函数
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去除易混淆的字符
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 获取所有没有邀请码的用户(按注册时间排序)
const [users] = await connection.query(`
  SELECT id, username, createdAt 
  FROM users 
  WHERE invite_code IS NULL 
  ORDER BY createdAt ASC, id ASC
`);

console.log(`找到 ${users.length} 个用户需要生成邀请码\n`);

let successCount = 0;
for (const user of users) {
  let code = generateInviteCode();
  let attempts = 0;
  const maxAttempts = 10;
  
  // 确保邀请码唯一
  while (attempts < maxAttempts) {
    try {
      const inviteLink = `https://jiangyuchen.cn/register?invite=${code}`;
      await connection.query(`
        UPDATE users 
        SET invite_code = ?, invite_link = ? 
        WHERE id = ?
      `, [code, inviteLink, user.id]);
      
      console.log(`✅ 用户 ${user.id} (${user.username || '未命名'}) -> 邀请码: ${code}`);
      successCount++;
      break;
    } catch (e) {
      if (e.message.includes('Duplicate entry')) {
        // 邀请码重复,重新生成
        code = generateInviteCode();
        attempts++;
      } else {
        console.error(`❌ 更新用户 ${user.id} 失败:`, e.message);
        break;
      }
    }
  }
  
  if (attempts >= maxAttempts) {
    console.error(`❌ 用户 ${user.id} 生成邀请码失败(尝试次数过多)`);
  }
}

console.log(`\n✅ 数据库迁移完成! 成功为 ${successCount}/${users.length} 个用户生成邀请码`);

await connection.end();
