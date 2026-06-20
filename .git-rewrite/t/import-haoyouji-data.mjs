#!/usr/bin/env node

import mysql from 'mysql2/promise';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  convertKeysToSnake,
  calculateChecksum,
  ProgressBar,
  readJsonFile,
  Logger,
  getTableImportOrder,
  parseTimestamp
} from './utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 从环境变量读取数据库配置
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ 错误：未找到 DATABASE_URL 环境变量');
  console.error('请确保在项目环境中运行此脚本');
  process.exit(1);
}

// 解析 DATABASE_URL
// 格式: mysql://user:password@host:port/database?ssl=...
const dbUrlMatch = DATABASE_URL.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);

if (!dbUrlMatch) {
  console.error('❌ 错误：无法解析 DATABASE_URL');
  process.exit(1);
}

const [, user, password, host, port, database] = dbUrlMatch;

// 配置
const CONFIG = {
  database: {
    host,
    port: parseInt(port),
    user,
    password,
    database,
    ssl: { rejectUnauthorized: true }
  },
  
  import: {
    timezone: '+08:00',
    batchSize: 500,
    convertFieldNames: false,
    validateChecksums: false,
    clearExistingData: true,
    skipErrors: true,
  }
};

/**
 * 主导入类
 */
class DataImporter {
  constructor(config, importDir) {
    this.config = config;
    this.importDir = importDir;
    this.connection = null;
    this.logger = null;
    this.metadata = null;
    this.importStats = {
      totalTables: 0,
      successTables: 0,
      failedTables: 0,
      totalRows: 0,
      successRows: 0,
      failedRows: 0,
      errors: []
    };
  }
  
  async validateExportDir() {
    console.log('验证导出目录...');
    
    try {
      await fs.access(this.importDir);
    } catch {
      throw new Error(`导出目录不存在: ${this.importDir}`);
    }
    
    const requiredFiles = ['metadata.json', 'data'];
    for (const file of requiredFiles) {
      const filePath = path.join(this.importDir, file);
      try {
        await fs.access(filePath);
      } catch {
        throw new Error(`缺少必要文件或目录: ${file}`);
      }
    }
    
    const metadataFile = path.join(this.importDir, 'metadata.json');
    this.metadata = await readJsonFile(metadataFile);
    
    console.log(`✅ 导出目录验证通过`);
    console.log(`   - 导出时间: ${this.metadata.exportTime}`);
    console.log(`   - 表数量: ${Object.keys(this.metadata.tables).length}`);
  }
  
  async connect() {
    console.log('\n正在连接数据库...');
    this.connection = await mysql.createConnection(this.config.database);
    
    if (this.config.import.timezone !== 'UTC') {
      await this.connection.query(`SET time_zone = '${this.config.import.timezone}'`);
    }
    
    const [version] = await this.connection.query('SELECT VERSION() as version');
    
    console.log(`✅ 已连接到数据库 (版本: ${version[0].version})`);
    console.log(`   - 数据库: ${this.config.database.database}`);
  }
  
  async createLogger() {
    const logFile = path.join(this.importDir, 'import.log');
    this.logger = new Logger(logFile);
    this.logger.info(`开始导入数据`);
    this.logger.info(`导出时间: ${this.metadata.exportTime}`);
  }
  
  async clearTableData(tableName) {
    if (!this.config.import.clearExistingData) return;
    
    this.logger.warn(`清空表数据: ${tableName}`);
    console.log(`⚠️  清空表数据: ${tableName}`);
    
    await this.connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await this.connection.query(`TRUNCATE TABLE ${tableName}`);
    await this.connection.query('SET FOREIGN_KEY_CHECKS = 1');
  }
  
  async importTableData(tableName) {
    this.logger.info(`开始导入表: ${tableName}`);
    
    const dataFile = path.join(this.importDir, 'data', `${tableName}.json`);
    let rows;
    
    try {
      rows = await readJsonFile(dataFile);
    } catch (error) {
      this.logger.error(`无法读取数据文件: ${tableName} - ${error.message}`);
      throw error;
    }
    
    if (rows.length === 0) {
      console.log(`⚠️  表 ${tableName} 没有数据，跳过`);
      this.logger.warn(`表 ${tableName} 没有数据，跳过`);
      return { success: 0, failed: 0 };
    }
    
    console.log(`\n导入表: ${tableName} (${rows.length} 行)`);
    const progress = new ProgressBar(rows.length, tableName);
    
    await this.clearTableData(tableName);
    await this.connection.query('SET FOREIGN_KEY_CHECKS = 0');
    
    let successCount = 0;
    let failedCount = 0;
    const batchSize = this.config.import.batchSize;
    
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      try {
        const processedBatch = this.config.import.convertFieldNames
          ? batch.map(row => convertKeysToSnake(row))
          : batch;
        
        if (processedBatch.length > 0) {
          const firstRow = processedBatch[0];
          const columns = Object.keys(firstRow);
          const placeholders = columns.map(() => '?').join(', ');
          
          const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
          
          for (const row of processedBatch) {
            try {
              const values = columns.map(col => row[col]);
              await this.connection.query(sql, values);
              successCount++;
              progress.increment();
            } catch (error) {
              failedCount++;
              this.importStats.errors.push({
                table: tableName,
                row: row,
                error: error.message
              });
              
              if (!this.config.import.skipErrors) {
                throw error;
              }
              
              this.logger.error(`插入失败 (${tableName}): ${error.message}`);
              progress.increment();
            }
          }
        }
      } catch (error) {
        this.logger.error(`批量导入失败 (${tableName}): ${error.message}`);
        
        if (!this.config.import.skipErrors) {
          throw error;
        }
        
        failedCount += batch.length - successCount;
        progress.update(i + batch.length);
      }
    }
    
    progress.complete();
    await this.connection.query('SET FOREIGN_KEY_CHECKS = 1');
    
    this.logger.success(`表 ${tableName} 导入完成: 成功 ${successCount}, 失败 ${failedCount}`);
    
    return { success: successCount, failed: failedCount };
  }
  
  async importAllTables() {
    console.log('\n' + '='.repeat(80));
    console.log('开始导入数据');
    console.log('='.repeat(80));
    
    const tables = Object.keys(this.metadata.tables);
    this.importStats.totalTables = tables.length;
    
    const orderedTables = getTableImportOrder(tables);
    
    console.log(`\n导入顺序: ${orderedTables.join(' → ')}`);
    this.logger.info(`导入顺序: ${orderedTables.join(' → ')}`);
    
    for (const tableName of orderedTables) {
      try {
        const { success, failed } = await this.importTableData(tableName);
        
        this.importStats.successTables++;
        this.importStats.totalRows += success + failed;
        this.importStats.successRows += success;
        this.importStats.failedRows += failed;
        
      } catch (error) {
        this.importStats.failedTables++;
        this.logger.error(`导入表 ${tableName} 失败: ${error.message}`);
        console.error(`❌ 导入表 ${tableName} 失败:`, error.message);
        
        if (!this.config.import.skipErrors) {
          throw error;
        }
      }
    }
  }
  
  async validateImport() {
    console.log('\n' + '='.repeat(80));
    console.log('验证导入结果');
    console.log('='.repeat(80));
    
    for (const [tableName, info] of Object.entries(this.metadata.tables)) {
      const [result] = await this.connection.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      const actualCount = result[0].count;
      const expectedCount = info.rowCount;
      
      if (actualCount === expectedCount) {
        console.log(`✅ ${tableName.padEnd(35)} ${actualCount}/${expectedCount} 行`);
        this.logger.success(`${tableName}: ${actualCount}/${expectedCount} 行`);
      } else {
        console.log(`⚠️  ${tableName.padEnd(35)} ${actualCount}/${expectedCount} 行 (不匹配)`);
        this.logger.warn(`${tableName}: ${actualCount}/${expectedCount} 行 (不匹配)`);
      }
    }
  }
  
  printSummary() {
    console.log('\n' + '='.repeat(80));
    console.log('导入完成');
    console.log('='.repeat(80));
    console.log(`总表数: ${this.importStats.totalTables}`);
    console.log(`成功: ${this.importStats.successTables}`);
    console.log(`失败: ${this.importStats.failedTables}`);
    console.log(`总行数: ${this.importStats.totalRows}`);
    console.log(`成功行: ${this.importStats.successRows}`);
    console.log(`失败行: ${this.importStats.failedRows}`);
    
    if (this.importStats.errors.length > 0) {
      console.log(`\n错误数: ${this.importStats.errors.length}`);
      console.log(`详细错误请查看日志文件: ${path.join(this.importDir, 'import.log')}`);
    }
  }
  
  async run() {
    try {
      await this.validateExportDir();
      await this.connect();
      await this.createLogger();
      await this.importAllTables();
      await this.validateImport();
      this.printSummary();
      
      await this.connection.end();
      process.exit(0);
    } catch (error) {
      console.error('\n❌ 导入失败:', error.message);
      if (this.logger) {
        this.logger.error(`导入失败: ${error.message}`);
      }
      if (this.connection) {
        await this.connection.end();
      }
      process.exit(1);
    }
  }
}

// 主程序
const importDir = process.argv[2] || path.join(__dirname, '../upload/export-2026-01-22-164956');

console.log('好友记数据导入工具');
console.log('='.repeat(80));
console.log(`导入目录: ${importDir}`);
console.log(`数据库: ${CONFIG.database.database}`);
console.log('='.repeat(80));

const importer = new DataImporter(CONFIG, importDir);
importer.run();
