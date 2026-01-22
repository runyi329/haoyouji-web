import crypto from 'crypto';
import fs from 'fs/promises';

/**
 * 将驼峰命名转换为下划线命名
 */
export function convertKeysToSnake(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => convertKeysToSnake(item));
  }
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    result[snakeKey] = convertKeysToSnake(value);
  }
  return result;
}

/**
 * 计算文件校验和
 */
export async function calculateChecksum(filePath) {
  const content = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * 进度条类
 */
export class ProgressBar {
  constructor(total, label = '') {
    this.total = total;
    this.current = 0;
    this.label = label;
    this.startTime = Date.now();
  }
  
  increment() {
    this.current++;
    this.render();
  }
  
  update(current) {
    this.current = current;
    this.render();
  }
  
  render() {
    const percent = Math.floor((this.current / this.total) * 100);
    const bar = '█'.repeat(Math.floor(percent / 2)) + '░'.repeat(50 - Math.floor(percent / 2));
    process.stdout.write(`\r${this.label} [${bar}] ${percent}% (${this.current}/${this.total})`);
  }
  
  complete() {
    this.current = this.total;
    this.render();
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
    console.log(` - 完成 (${elapsed}s)`);
  }
}

/**
 * 读取 JSON 文件
 */
export async function readJsonFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * 日志记录器
 */
export class Logger {
  constructor(logFile) {
    this.logFile = logFile;
  }
  
  async log(level, message) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] ${message}\n`;
    await fs.appendFile(this.logFile, logLine);
  }
  
  info(message) {
    return this.log('INFO', message);
  }
  
  warn(message) {
    return this.log('WARN', message);
  }
  
  error(message) {
    return this.log('ERROR', message);
  }
  
  success(message) {
    return this.log('SUCCESS', message);
  }
}

/**
 * 获取表导入顺序（按依赖关系）
 */
export function getTableImportOrder(tables) {
  // 定义表依赖关系
  const dependencies = {
    'users': [],
    'families': ['users'],
    'contacts': ['users'],
    'contact_tags': ['users'],
    'personal_contact_tags': ['users'],
    'contact_tag_relations': ['contacts', 'contact_tags', 'personal_contact_tags'],
    'contact_interactions': ['contacts', 'users'],
    'contact_sharing_connections': ['users'],
    'reminders': ['contacts', 'users'],
    'user_preferences': ['users'],
    'family_characters': ['families', 'users'],
    'vocabularies': ['users'],
    'characters': ['users'],
    'knowledge_items': ['users'],
    'knowledge_categories': ['users'],
    'wrong_questions': ['users'],
    'game_records': ['users'],
    'point_transactions': ['users'],
    'exercise_records': ['users'],
    'reading_records': ['users'],
    'star_rewards': ['users'],
    'user_badges': ['users'],
    'rewards': ['users'],
    'reward_redemptions': ['users', 'rewards']
  };
  
  // 简单的拓扑排序
  const sorted = [];
  const visited = new Set();
  
  function visit(table) {
    if (visited.has(table)) return;
    visited.add(table);
    
    const deps = dependencies[table] || [];
    for (const dep of deps) {
      if (tables.includes(dep)) {
        visit(dep);
      }
    }
    
    sorted.push(table);
  }
  
  for (const table of tables) {
    visit(table);
  }
  
  return sorted;
}

/**
 * 解析时间戳
 */
export function parseTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  return new Date(value);
}
