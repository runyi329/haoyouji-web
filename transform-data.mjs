#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

/**
 * 数据转换脚本
 * 将旧格式的导出数据转换为新数据库格式
 */

const EXPORT_DIR = process.argv[2] || '/home/ubuntu/upload/export-2026-01-22-164956';
const DATA_DIR = path.join(EXPORT_DIR, 'data');
const TRANSFORMED_DIR = path.join(EXPORT_DIR, 'data-transformed');

// 字段映射规则
const FIELD_MAPPINGS = {
  users: {
    remove: ['userType', 'password', 'parentId', 'birthDate', 'gender', 'stars', 'lastLoginAt'],
    rename: {},
    defaults: {}
  },
  contacts: {
    remove: ['interactionCount'],
    rename: {},
    defaults: {}
  },
  contact_tags: {
    remove: [],
    rename: {},
    defaults: {}
  },
  personal_contact_tags: {
    remove: [],
    rename: {},
    defaults: {}
  },
  contact_tag_relations: {
    remove: [],
    rename: {},
    defaults: {}
  },
  contact_interactions: {
    remove: [],
    rename: {},
    defaults: {}
  },
  contact_sharing_connections: {
    remove: [],
    rename: {},
    defaults: {}
  }
};

/**
 * 转换单条记录
 */
function transformRecord(record, tableName) {
  const mapping = FIELD_MAPPINGS[tableName];
  if (!mapping) return record;
  
  const transformed = { ...record };
  
  // 删除不需要的字段
  for (const field of mapping.remove) {
    delete transformed[field];
  }
  
  // 重命名字段
  for (const [oldName, newName] of Object.entries(mapping.rename)) {
    if (oldName in transformed) {
      transformed[newName] = transformed[oldName];
      delete transformed[oldName];
    }
  }
  
  // 添加默认值
  for (const [field, value] of Object.entries(mapping.defaults)) {
    if (!(field in transformed)) {
      transformed[field] = value;
    }
  }
  
  return transformed;
}

/**
 * 转换表数据
 */
async function transformTable(tableName) {
  console.log(`转换表: ${tableName}`);
  
  const inputFile = path.join(DATA_DIR, `${tableName}.json`);
  const outputFile = path.join(TRANSFORMED_DIR, `${tableName}.json`);
  
  try {
    const content = await fs.readFile(inputFile, 'utf-8');
    const records = JSON.parse(content);
    
    const transformed = records.map(record => transformRecord(record, tableName));
    
    await fs.writeFile(outputFile, JSON.stringify(transformed, null, 2));
    
    console.log(`✅ ${tableName}: ${records.length} 条记录已转换`);
  } catch (error) {
    console.error(`❌ ${tableName} 转换失败:`, error.message);
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('好友记数据转换工具');
  console.log('='.repeat(80));
  console.log(`源目录: ${DATA_DIR}`);
  console.log(`目标目录: ${TRANSFORMED_DIR}`);
  console.log('='.repeat(80));
  
  // 创建输出目录
  try {
    await fs.mkdir(TRANSFORMED_DIR, { recursive: true });
  } catch (error) {
    console.error('创建输出目录失败:', error.message);
    process.exit(1);
  }
  
  // 转换所有表
  const tables = Object.keys(FIELD_MAPPINGS);
  
  for (const tableName of tables) {
    await transformTable(tableName);
  }
  
  // 复制 metadata.json
  try {
    const metadataFile = path.join(EXPORT_DIR, 'metadata.json');
    const outputMetadata = path.join(TRANSFORMED_DIR, '../metadata.json');
    await fs.copyFile(metadataFile, outputMetadata);
    console.log('\n✅ metadata.json 已复制');
  } catch (error) {
    console.log('\n⚠️  metadata.json 复制失败:', error.message);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('转换完成！');
  console.log('='.repeat(80));
  console.log(`\n现在可以使用转换后的数据导入：`);
  console.log(`node import-haoyouji-data.mjs ${TRANSFORMED_DIR}/..\n`);
}

main().catch(error => {
  console.error('转换失败:', error);
  process.exit(1);
});
