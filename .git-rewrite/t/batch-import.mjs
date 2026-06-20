#!/usr/bin/env node

import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';

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

// 表字段映射（只包含数据库中实际存在的字段）
const TABLE_FIELDS = {
  users: ['id', 'openId', 'name', 'email', 'loginMethod', 'role', 'createdAt', 'updatedAt', 'lastSignedIn'],
  contacts: ['id', 'parentUserId', 'name', 'title', 'gender', 'birthDate', 'occupation', 'address', 'region', 'wechat', 'phone', 'tags', 'referrerId', 'isBlacklisted', 'createdAt', 'updatedAt'],
  contact_tags: ['id', 'name', 'color', 'icon', 'description', 'sortOrder', 'isPreset', 'createdAt', 'updatedAt'],
  personal_contact_tags: ['id', 'parentUserId', 'name', 'color', 'icon', 'description', 'sortOrder', 'createdAt', 'updatedAt'],
  contact_tag_relations: ['id', 'contactId', 'tagId', 'createdAt'],
  contact_interactions: ['id', 'contactId', 'interactionDate', 'note', 'createdAt'],
  contact_sharing_connections: ['id', 'sharerId', 'receiverId', 'createdAt', 'updatedAt']
};

// 导入顺序（考虑外键依赖）
const IMPORT_ORDER = [
  'users',
  'contacts',
  'contact_tags',
  'personal_contact_tags',
  'contact_tag_relations',
  'contact_interactions',
  'contact_sharing_connections'
];

async function batchImport() {
  const dataDir = '/home/ubuntu/upload/export-2026-01-22-164956/data';
  
  console.log('='.repeat(80));
  console.log('好友记数据批量导入');
  console.log('='.repeat(80));
  console.log(`数据目录: ${dataDir}`);
  console.log(`数据库: ${database}`);
  console.log('='.repeat(80));
  
  const connection = await mysql.createConnection(config);
  console.log('✅ 数据库连接成功\n');
  
  // 禁用外键检查
  await connection.query('SET FOREIGN_KEY_CHECKS = 0');
  
  const stats = {
    totalTables: 0,
    successTables: 0,
    totalRows: 0,
    successRows: 0,
    failedRows: 0
  };
  
  for (const tableName of IMPORT_ORDER) {
    const dataFile = path.join(dataDir, `${tableName}.json`);
    
    try {
      const content = await fs.readFile(dataFile, 'utf-8');
      const allData = JSON.parse(content);
      
      if (allData.length === 0) {
        console.log(`⚠️  ${tableName}: 无数据，跳过\n`);
        continue;
      }
      
      stats.totalTables++;
      stats.totalRows += allData.length;
      
      console.log(`📋 ${tableName} (${allData.length} 行)`);
      
      // 清空现有数据
      await connection.query(`DELETE FROM ${tableName}`);
      
      const allowedFields = TABLE_FIELDS[tableName];
      let successCount = 0;
      let failedCount = 0;
      
      for (const row of allData) {
        // 只保留允许的字段
        const cleanRow = {};
        for (const field of allowedFields) {
          if (row[field] !== undefined) {
            cleanRow[field] = row[field];
          }
        }
        
        // 特殊处理
        if (tableName === 'users' && !cleanRow.lastSignedIn) {
          cleanRow.lastSignedIn = cleanRow.createdAt || new Date().toISOString();
        }
        
        try {
          const columns = Object.keys(cleanRow);
          const placeholders = columns.map(() => '?').join(', ');
          const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
          const values = columns.map(col => cleanRow[col]);
          
          await connection.query(sql, values);
          successCount++;
        } catch (error) {
          failedCount++;
          if (failedCount <= 3) {
            console.log(`  ❌ 插入失败 (ID: ${row.id}): ${error.message}`);
          }
        }
      }
      
      stats.successRows += successCount;
      stats.failedRows += failedCount;
      
      if (failedCount === 0) {
        console.log(`  ✅ 全部成功 (${successCount}/${allData.length})\n`);
        stats.successTables++;
      } else {
        console.log(`  ⚠️  部分失败 (成功: ${successCount}, 失败: ${failedCount})\n`);
      }
      
    } catch (error) {
      console.log(`  ❌ 处理失败: ${error.message}\n`);
    }
  }
  
  // 启用外键检查
  await connection.query('SET FOREIGN_KEY_CHECKS = 1');
  
  await connection.end();
  
  console.log('='.repeat(80));
  console.log('导入完成');
  console.log('='.repeat(80));
  console.log(`总表数: ${stats.totalTables}`);
  console.log(`成功表数: ${stats.successTables}`);
  console.log(`总行数: ${stats.totalRows}`);
  console.log(`成功行数: ${stats.successRows}`);
  console.log(`失败行数: ${stats.failedRows}`);
  console.log('='.repeat(80));
}

batchImport().catch(console.error);
