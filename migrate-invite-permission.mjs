#!/usr/bin/env node
/**
 * 数据库迁移脚本: 添加邀请功能权限控制
 * 
 * 功能:
 * 1. 添加 invite_enabled 字段到 users 表
 * 2. 默认所有用户的邀请功能为关闭状态
 * 3. 管理员可以在后台控制开启/关闭
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
dotenv.config({ path: join(__dirname, '.env') });

const dbConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  user: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'crm_db',
};

async function migrate() {
  let connection;
  
  try {
    console.log('=== 执行邀请功能权限控制迁移 ===\n');
    
    connection = await mysql.createConnection(dbConfig);
    
    // 1. 检查字段是否已存在
    const [columns] = await connection.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'users' 
        AND COLUMN_NAME = 'invite_enabled'
    `, [dbConfig.database]);
    
    if (columns.length > 0) {
      console.log('⚠️  invite_enabled 字段已存在,跳过添加');
    } else {
      // 2. 添加 invite_enabled 字段
      await connection.query(`
        ALTER TABLE users 
        ADD COLUMN invite_enabled TINYINT(1) NOT NULL DEFAULT 0 
        COMMENT '是否开启邀请功能: 0=关闭, 1=开启'
      `);
      console.log('✅ 添加 invite_enabled 字段');
    }
    
    // 3. 确保所有现有用户的邀请功能默认关闭
    await connection.query(`
      UPDATE users 
      SET invite_enabled = 0 
      WHERE invite_enabled IS NULL OR invite_enabled = 1
    `);
    console.log('✅ 设置所有用户邀请功能默认关闭');
    
    // 4. 显示统计信息
    const [stats] = await connection.query(`
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN invite_enabled = 1 THEN 1 ELSE 0 END) as enabled_users,
        SUM(CASE WHEN invite_enabled = 0 THEN 1 ELSE 0 END) as disabled_users
      FROM users
    `);
    
    console.log('\n=== 迁移完成 ===');
    console.log(`总用户数: ${stats[0].total_users}`);
    console.log(`邀请功能已开启: ${stats[0].enabled_users}`);
    console.log(`邀请功能已关闭: ${stats[0].disabled_users}`);
    console.log('\n💡 提示: 管理员可以在后台为用户开启邀请功能');
    
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

migrate();
