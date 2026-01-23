#!/usr/bin/env node

/**
 * 用户凭证修复脚本
 * 从原始导出数据中恢复用户的 username 和 passwordHash
 */

import fs from 'fs';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const ORIGINAL_DATA_PATH = '/home/ubuntu/upload/export-2026-01-22-164956/data/users.json';

async function main() {
  console.log('🔧 开始修复用户凭证...\n');

  // 读取原始用户数据
  console.log('📖 读取原始用户数据...');
  const originalUsers = JSON.parse(fs.readFileSync(ORIGINAL_DATA_PATH, 'utf8'));
  console.log(`✅ 读取到 ${originalUsers.length} 个用户\n`);

  // 连接数据库
  console.log('🔌 连接数据库...');
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  console.log('✅ 数据库连接成功\n');

  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;

  console.log('🔄 开始更新用户凭证...\n');

  for (const user of originalUsers) {
    const { id, username, passwordHash } = user;

    // 跳过没有 username 或 passwordHash 的用户
    if (!username || !passwordHash) {
      console.log(`⏭️  跳过用户 ID ${id} (name: ${user.name}) - 原始数据中没有 username 或 passwordHash`);
      skippedCount++;
      continue;
    }

    try {
      // 更新用户的 username 和 passwordHash
      const [result] = await connection.query(
        'UPDATE users SET username = ?, passwordHash = ? WHERE id = ?',
        [username, passwordHash, id]
      );

      if (result.affectedRows > 0) {
        console.log(`✅ 更新用户 ID ${id} (username: ${username}, name: ${user.name})`);
        successCount++;
      } else {
        console.log(`⚠️  用户 ID ${id} 不存在于数据库中`);
        skippedCount++;
      }
    } catch (error) {
      console.error(`❌ 更新用户 ID ${id} 失败:`, error.message);
      failCount++;
    }
  }

  await connection.end();

  console.log('\n' + '='.repeat(60));
  console.log('📊 修复完成统计:');
  console.log(`  ✅ 成功: ${successCount}`);
  console.log(`  ❌ 失败: ${failCount}`);
  console.log(`  ⏭️  跳过: ${skippedCount}`);
  console.log('='.repeat(60));

  // 验证修复结果
  console.log('\n🔍 验证修复结果...\n');
  const conn = await mysql.createConnection(process.env.DATABASE_URL);

  const [hyy329] = await conn.query('SELECT id, username, passwordHash, name FROM users WHERE id = 28');
  const [yunting] = await conn.query('SELECT id, username, passwordHash, name FROM users WHERE id = 540801');
  const [jiang] = await conn.query('SELECT id, username, passwordHash, name FROM users WHERE id = 870413');

  console.log('hyy329:', hyy329.length > 0 ? {
    id: hyy329[0].id,
    username: hyy329[0].username,
    name: hyy329[0].name,
    hasPassword: !!hyy329[0].passwordHash
  } : '不存在');

  console.log('yunting:', yunting.length > 0 ? {
    id: yunting[0].id,
    username: yunting[0].username,
    name: yunting[0].name,
    hasPassword: !!yunting[0].passwordHash
  } : '不存在');

  console.log('jiang:', jiang.length > 0 ? {
    id: jiang[0].id,
    username: jiang[0].username,
    name: jiang[0].name,
    hasPassword: !!jiang[0].passwordHash
  } : '不存在');

  // 统计有 username 的用户数量
  const [countResult] = await conn.query('SELECT COUNT(*) as total FROM users WHERE username IS NOT NULL');
  console.log(`\n✅ 数据库中有 username 的用户总数: ${countResult[0].total}`);

  await conn.end();

  console.log('\n✨ 修复完成！');
}

main().catch(console.error);
