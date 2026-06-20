#!/usr/bin/env node

import mysql from 'mysql2/promise';
import fs from 'fs/promises';

// 数据库配置
const dbUrl = process.env.DATABASE_URL;
const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:\/]+):(\d+)\/([^?]+)/);
const [, user, password, host, port, database] = match;

const config = {
  host,
  port: parseInt(port),
  user,
  password,
  database,
  ssl: { rejectUnauthorized: true }
};

async function testImport() {
  console.log('连接数据库...');
  const connection = await mysql.createConnection(config);
  
  console.log('读取 users 数据...');
  const usersData = JSON.parse(await fs.readFile('/home/ubuntu/upload/export-2026-01-22-164956/data/users.json', 'utf-8'));
  
  console.log(`共 ${usersData.length} 条用户数据`);
  console.log('第一条数据的字段:', Object.keys(usersData[0]));
  
  // 只导入第一条数据进行测试
  const testUser = usersData[0];
  
  // 只保留数据库中存在的字段
  const dbFields = ['id', 'openId', 'name', 'email', 'loginMethod', 'role', 'createdAt', 'updatedAt', 'lastSignedIn'];
  const cleanUser = {};
  
  for (const field of dbFields) {
    if (testUser[field] !== undefined) {
      cleanUser[field] = testUser[field];
    }
  }
  
  // 设置默认值
  if (!cleanUser.lastSignedIn) {
    cleanUser.lastSignedIn = cleanUser.createdAt || new Date().toISOString();
  }
  
  console.log('\n准备插入的数据:');
  console.log(JSON.stringify(cleanUser, null, 2));
  
  try {
    const columns = Object.keys(cleanUser);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT INTO users (${columns.join(', ')}) VALUES (${placeholders})`;
    
    console.log('\nSQL:', sql);
    console.log('Values:', columns.map(col => cleanUser[col]));
    
    await connection.query(sql, columns.map(col => cleanUser[col]));
    console.log('\n✅ 插入成功！');
    
    // 查询验证
    const [rows] = await connection.query('SELECT * FROM users WHERE id = ?', [cleanUser.id]);
    console.log('\n查询结果:');
    console.log(rows[0]);
    
  } catch (error) {
    console.error('\n❌ 插入失败:', error.message);
    console.error('SQL State:', error.sqlState);
    console.error('SQL Message:', error.sqlMessage);
  }
  
  await connection.end();
}

testImport().catch(console.error);
