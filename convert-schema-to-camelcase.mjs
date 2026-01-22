#!/usr/bin/env node

import fs from 'fs/promises';

/**
 * 将 schema 文件中的字段定义从下划线命名转换为驼峰命名
 * 例如：int("parent_user_id") → int("parentUserId")
 */

const SCHEMA_FILE = '/home/ubuntu/haoyouji/drizzle/schema.ts';

// 下划线转驼峰
function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

async function convertSchema() {
  console.log('开始转换 schema 文件...');
  
  // 读取文件
  let content = await fs.readFile(SCHEMA_FILE, 'utf-8');
  
  // 匹配所有字段定义：类型("字段名")
  // 例如：int("parent_user_id"), varchar("first_name", ...), timestamp("created_at")
  const fieldPattern = /(int|varchar|text|timestamp|boolean|mysqlEnum|json|float|double|decimal)\("([a-z_]+)"/g;
  
  let matches = [];
  let match;
  while ((match = fieldPattern.exec(content)) !== null) {
    const [fullMatch, type, fieldName] = match;
    if (fieldName.includes('_')) {
      matches.push({
        original: fullMatch,
        fieldName: fieldName,
        camelCase: snakeToCamel(fieldName)
      });
    }
  }
  
  console.log(`找到 ${matches.length} 个需要转换的字段`);
  
  // 按字段名长度倒序排序，避免替换冲突
  matches.sort((a, b) => b.fieldName.length - a.fieldName.length);
  
  // 执行替换
  let convertedCount = 0;
  for (const item of matches) {
    const newPattern = item.original.replace(item.fieldName, item.camelCase);
    const regex = new RegExp(item.original.replace(/[()]/g, '\\$&'), 'g');
    const newContent = content.replace(regex, newPattern);
    
    if (newContent !== content) {
      console.log(`  ${item.fieldName} → ${item.camelCase}`);
      content = newContent;
      convertedCount++;
    }
  }
  
  // 保存文件
  await fs.writeFile(SCHEMA_FILE, content, 'utf-8');
  
  console.log(`\n转换完成！共转换 ${convertedCount} 个字段`);
  console.log(`文件已保存：${SCHEMA_FILE}`);
}

convertSchema().catch(error => {
  console.error('转换失败:', error);
  process.exit(1);
});
