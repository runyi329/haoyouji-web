#!/usr/bin/env node

/**
 * 修复全局标签数据导入问题
 * 
 * 问题描述：
 * - contact_tags 表在数据导入时没有成功导入数据
 * - 导致累计标签统计不准确
 * 
 * 解决方案：
 * - 从原始导出文件重新导入 contact_tags 数据
 * - 保持数据的完整性和一致性
 */

import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 从环境变量读取数据库配置
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ 错误：未找到 DATABASE_URL 环境变量');
  process.exit(1);
}

// 解析 DATABASE_URL
const dbUrlMatch = DATABASE_URL.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);

if (!dbUrlMatch) {
  console.error('❌ 错误：无法解析 DATABASE_URL');
  process.exit(1);
}

const [, user, password, host, port, database] = dbUrlMatch;

// 数据库配置
const dbConfig = {
  host,
  port: parseInt(port),
  user,
  password,
  database,
  ssl: { rejectUnauthorized: true }
};

// 数据文件路径
const DATA_FILE = path.join(__dirname, '../upload/export-2026-01-22-164956/data/contact_tags.json');

/**
 * 读取 JSON 文件
 */
async function readJsonFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`无法读取文件 ${filePath}: ${error.message}`);
  }
}

/**
 * 修复全局标签数据
 */
async function fixGlobalTags() {
  let connection;
  
  try {
    console.log('🔧 开始修复全局标签数据...\n');
    
    // 1. 读取数据文件
    console.log('📖 读取数据文件...');
    const tags = await readJsonFile(DATA_FILE);
    console.log(`✅ 成功读取 ${tags.length} 条全局标签数据\n`);
    
    // 2. 连接数据库
    console.log('🔌 连接数据库...');
    connection = await mysql.createConnection(dbConfig);
    await connection.query(`SET time_zone = '+08:00'`);
    console.log('✅ 数据库连接成功\n');
    
    // 3. 检查当前数据
    console.log('🔍 检查当前数据库中的全局标签数据...');
    const [currentData] = await connection.query('SELECT COUNT(*) as count FROM contact_tags');
    const currentCount = currentData[0].count;
    console.log(`   当前数据库中有 ${currentCount} 条全局标签记录\n`);
    
    // 4. 清空现有数据（如果有）
    if (currentCount > 0) {
      console.log('🗑️  清空现有数据...');
      await connection.query('SET FOREIGN_KEY_CHECKS = 0');
      await connection.query('TRUNCATE TABLE contact_tags');
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
      console.log('✅ 现有数据已清空\n');
    }
    
    // 5. 批量导入数据
    console.log('📥 开始导入数据...');
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    
    const batchSize = 100;
    let successCount = 0;
    let failedCount = 0;
    const errors = [];
    
    for (let i = 0; i < tags.length; i += batchSize) {
      const batch = tags.slice(i, i + batchSize);
      const progress = Math.round(((i + batch.length) / tags.length) * 100);
      
      for (const tag of batch) {
        try {
          await connection.query(
            `INSERT INTO contact_tags (id, name, color, parentUserId, sortOrder, isPreset, createdAt) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              tag.id, 
              tag.name, 
              tag.color, 
              tag.parentUserId, 
              tag.sortOrder || 0, 
              tag.isPreset || false, 
              tag.createdAt
            ]
          );
          successCount++;
        } catch (error) {
          failedCount++;
          errors.push({
            tag,
            error: error.message
          });
        }
      }
      
      process.stdout.write(`\r   进度: ${progress}% (${successCount}/${tags.length})`);
    }
    
    console.log('\n');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    
    // 6. 验证导入结果
    console.log('✅ 数据导入完成\n');
    console.log('📊 导入统计：');
    console.log(`   - 总数: ${tags.length}`);
    console.log(`   - 成功: ${successCount}`);
    console.log(`   - 失败: ${failedCount}`);
    
    if (failedCount > 0) {
      console.log('\n⚠️  导入错误详情：');
      errors.slice(0, 5).forEach((err, idx) => {
        console.log(`   ${idx + 1}. 标签 ID ${err.tag.id}: ${err.error}`);
      });
      if (errors.length > 5) {
        console.log(`   ... 还有 ${errors.length - 5} 个错误`);
      }
    }
    
    // 7. 最终验证
    console.log('\n🔍 验证数据库中的数据...');
    const [finalData] = await connection.query('SELECT COUNT(*) as count FROM contact_tags');
    const finalCount = finalData[0].count;
    console.log(`   数据库中现在有 ${finalCount} 条全局标签记录`);
    
    if (finalCount === successCount) {
      console.log('\n✅ 全局标签数据修复成功！');
    } else {
      console.log('\n⚠️  数据验证失败，请检查数据库');
    }
    
  } catch (error) {
    console.error('\n❌ 修复失败:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 运行修复脚本
fixGlobalTags()
  .then(() => {
    console.log('\n🎉 修复脚本执行完成！');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ 修复脚本执行失败:', error);
    process.exit(1);
  });
