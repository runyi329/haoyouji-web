#!/usr/bin/env node

/**
 * 脉动节点工作平台 - 数据库迁移脚本
 * 执行work_groups表创建和ledgers表字段添加
 */

import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  let connection;
  
  try {
    console.log('🔄 开始数据库迁移...');
    
    // 从环境变量读取数据库配置
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'haoyouji',
    };
    
    console.log(`📡 连接到数据库: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
    
    // 创建数据库连接
    connection = await mysql.createConnection(dbConfig);
    
    // 读取SQL迁移脚本
    const sqlPath = path.join(__dirname, 'drizzle/migrations/add_work_groups.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
    
    // 分割SQL语句（按分号分割，忽略注释）
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`📝 准备执行 ${statements.length} 条SQL语句`);
    
    // 执行每条SQL语句
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`\n执行语句 ${i + 1}/${statements.length}:`);
      console.log(statement.substring(0, 100) + '...');
      
      try {
        await connection.query(statement);
        console.log('✅ 执行成功');
      } catch (error) {
        // 如果是表已存在或字段已存在的错误，则忽略
        if (error.code === 'ER_TABLE_EXISTS_ERROR' || error.code === 'ER_DUP_FIELDNAME') {
          console.log('⚠️  表或字段已存在，跳过');
        } else {
          throw error;
        }
      }
    }
    
    console.log('\n✅ 数据库迁移完成！');
    
    // 验证迁移结果
    console.log('\n🔍 验证迁移结果...');
    
    // 检查work_groups表是否存在
    const [tables] = await connection.query(
      "SHOW TABLES LIKE 'work_groups'"
    );
    
    if (tables.length > 0) {
      console.log('✅ work_groups表创建成功');
      
      // 显示表结构
      const [columns] = await connection.query('DESCRIBE work_groups');
      console.log('\nwork_groups表结构:');
      console.table(columns);
    } else {
      console.log('❌ work_groups表创建失败');
    }
    
    // 检查ledgers表的group_id字段
    const [ledgerColumns] = await connection.query(
      "SHOW COLUMNS FROM ledgers LIKE 'group_id'"
    );
    
    if (ledgerColumns.length > 0) {
      console.log('\n✅ ledgers表的group_id字段添加成功');
      console.table(ledgerColumns);
    } else {
      console.log('\n❌ ledgers表的group_id字段添加失败');
    }
    
  } catch (error) {
    console.error('\n❌ 数据库迁移失败:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n🔌 数据库连接已关闭');
    }
  }
}

// 执行迁移
migrate();
