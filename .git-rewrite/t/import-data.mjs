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

// 配置
const CONFIG = {
  // 数据库连接信息（从环境变量或命令行参数获取）
  database: {
    host: process.env.DB_HOST || 'gateway03.us-east-1.prod.aws.tidbcloud.com',
    port: parseInt(process.env.DB_PORT || '4000'),
    user: process.env.DB_USER || 'XTqR3P9v8tSgKnm.a50f4dd2e0aa',
    password: process.env.DB_PASSWORD || 'Ba9vOSxsX44g116pXAKU',
    database: process.env.DB_NAME || 'dWfvfUieyVkmVGc44bjad7',
    ssl: { rejectUnauthorized: true }
  },
  
  // 导入配置
  import: {
    timezone: '+08:00', // 目标时区：'UTC' 或 '+08:00'
    batchSize: 1000, // 批量插入大小
    convertFieldNames: true, // 是否转换字段名（驼峰 → 下划线）
    validateChecksums: true, // 是否验证校验和
    clearExistingData: false, // 是否清空现有数据（危险操作！）
    skipErrors: false, // 是否跳过错误继续导入
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
  
  /**
   * 验证导出目录
   */
  async validateExportDir() {
    console.log('验证导出目录...');
    
    // 检查目录是否存在
    try {
      await fs.access(this.importDir);
    } catch {
      throw new Error(`导出目录不存在: ${this.importDir}`);
    }
    
    // 检查必要文件
    const requiredFiles = ['metadata.json', 'data'];
    for (const file of requiredFiles) {
      const filePath = path.join(this.importDir, file);
      try {
        await fs.access(filePath);
      } catch {
        throw new Error(`缺少必要文件或目录: ${file}`);
      }
    }
    
    // 读取元数据
    const metadataFile = path.join(this.importDir, 'metadata.json');
    this.metadata = await readJsonFile(metadataFile);
    
    console.log(`✅ 导出目录验证通过`);
    console.log(`   - 导出时间: ${this.metadata.exportTime}`);
    console.log(`   - 导出时区: ${this.metadata.timezone}`);
    console.log(`   - 表数量: ${Object.keys(this.metadata.tables).length}`);
  }
  
  /**
   * 验证校验和
   */
  async validateChecksums() {
    if (!this.config.import.validateChecksums) {
      console.log('⚠️  跳过校验和验证');
      return;
    }
    
    console.log('\n验证文件校验和...');
    
    const checksumFile = path.join(this.importDir, 'checksums.txt');
    try {
      await fs.access(checksumFile);
    } catch {
      console.log('⚠️  校验和文件不存在，跳过验证');
      return;
    }
    
    const checksumContent = await fs.readFile(checksumFile, 'utf-8');
    const checksums = checksumContent.trim().split('\n');
    
    let verified = 0;
    let failed = 0;
    
    for (const line of checksums) {
      const [expectedChecksum, filePath] = line.split(/\s+/);
      const fullPath = path.join(this.importDir, filePath);
      
      try {
        const actualChecksum = await calculateChecksum(fullPath);
        if (actualChecksum === expectedChecksum) {
          verified++;
        } else {
          failed++;
          console.error(`❌ 校验和不匹配: ${filePath}`);
        }
      } catch (error) {
        failed++;
        console.error(`❌ 无法验证: ${filePath} - ${error.message}`);
      }
    }
    
    if (failed > 0) {
      throw new Error(`校验和验证失败: ${failed} 个文件不匹配`);
    }
    
    console.log(`✅ 校验和验证通过: ${verified} 个文件`);
  }
  
  /**
   * 连接数据库
   */
  async connect() {
    console.log('\n正在连接数据库...');
    this.connection = await mysql.createConnection(this.config.database);
    
    // 设置时区
    if (this.config.import.timezone !== 'UTC') {
      await this.connection.query(`SET time_zone = '${this.config.import.timezone}'`);
    }
    
    // 获取数据库版本
    const [version] = await this.connection.query('SELECT VERSION() as version');
    
    console.log(`✅ 已连接到数据库 (版本: ${version[0].version})`);
    console.log(`   - 目标时区: ${this.config.import.timezone}`);
  }
  
  /**
   * 创建日志文件
   */
  async createLogger() {
    const logFile = path.join(this.importDir, 'import.log');
    this.logger = new Logger(logFile);
    this.logger.info(`开始导入数据`);
    this.logger.info(`导出时间: ${this.metadata.exportTime}`);
    this.logger.info(`目标时区: ${this.config.import.timezone}`);
  }
  
  /**
   * 清空表数据（危险操作！）
   */
  async clearTableData(tableName) {
    if (!this.config.import.clearExistingData) return;
    
    this.logger.warn(`清空表数据: ${tableName}`);
    console.log(`⚠️  清空表数据: ${tableName}`);
    
    // 禁用外键检查
    await this.connection.query('SET FOREIGN_KEY_CHECKS = 0');
    
    // 清空表
    await this.connection.query(`TRUNCATE TABLE ${tableName}`);
    
    // 启用外键检查
    await this.connection.query('SET FOREIGN_KEY_CHECKS = 1');
  }
  
  /**
   * 导入表数据
   */
  async importTableData(tableName) {
    this.logger.info(`开始导入表: ${tableName}`);
    
    // 读取数据文件
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
    
    // 清空现有数据（如果配置）
    await this.clearTableData(tableName);
    
    // 禁用外键检查（导入时）
    await this.connection.query('SET FOREIGN_KEY_CHECKS = 0');
    
    let successCount = 0;
    let failedCount = 0;
    const batchSize = this.config.import.batchSize;
    
    // 分批导入
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      
      try {
        // 转换字段名（驼峰 → 下划线）
        const processedBatch = this.config.import.convertFieldNames
          ? batch.map(row => convertKeysToSnake(row))
          : batch;
        
        // 构建批量插入语句
        if (processedBatch.length > 0) {
          const firstRow = processedBatch[0];
          const columns = Object.keys(firstRow);
          const placeholders = columns.map(() => '?').join(', ');
          
          const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
          
          // 批量插入
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
    
    // 启用外键检查
    await this.connection.query('SET FOREIGN_KEY_CHECKS = 1');
    
    this.logger.success(`表 ${tableName} 导入完成: 成功 ${successCount}, 失败 ${failedCount}`);
    
    return { success: successCount, failed: failedCount };
  }
  
  /**
   * 导入所有表
   */
  async importAllTables() {
    console.log('\n' + '='.repeat(80));
    console.log('开始导入数据');
    console.log('='.repeat(80));
    
    // 获取表列表
    const tables = Object.keys(this.metadata.tables);
    this.importStats.totalTables = tables.length;
    
    // 按依赖顺序排序
    const orderedTables = getTableImportOrder(tables);
    
    console.log(`\n导入顺序: ${orderedTables.join(' → ')}`);
    this.logger.info(`导入顺序: ${orderedTables.join(' → ')}`);
    
    // 逐表导入
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
  
  /**
   * 验证导入结果
   */
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
  
  /**
   * 生成导入报告
   */
  async generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('生成导入报告');
    console.log('='.repeat(80));
    
    const report = [];
    report.push('='.repeat(80));
    report.push('数据导入报告');
    report.push('='.repeat(80));
    report.push('');
    report.push(`导入时间: ${new Date().toISOString()}`);
    report.push(`源导出时间: ${this.metadata.exportTime}`);
    report.push(`目标时区: ${this.config.import.timezone}`);
    report.push('');
    report.push('='.repeat(80));
    report.push('导入统计');
    report.push('='.repeat(80));
    report.push('');
    report.push(`总表数: ${this.importStats.totalTables}`);
    report.push(`成功: ${this.importStats.successTables}`);
    report.push(`失败: ${this.importStats.failedTables}`);
    report.push('');
    report.push(`总行数: ${this.importStats.totalRows}`);
    report.push(`成功: ${this.importStats.successRows}`);
    report.push(`失败: ${this.importStats.failedRows}`);
    report.push('');
    
    if (this.importStats.errors.length > 0) {
      report.push('='.repeat(80));
      report.push('错误列表');
      report.push('='.repeat(80));
      report.push('');
      
      for (const error of this.importStats.errors.slice(0, 10)) {
        report.push(`表: ${error.table}`);
        report.push(`错误: ${error.error}`);
        report.push('');
      }
      
      if (this.importStats.errors.length > 10) {
        report.push(`... 还有 ${this.importStats.errors.length - 10} 个错误`);
        report.push('');
      }
    }
    
    report.push('='.repeat(80));
    
    const reportFile = path.join(this.importDir, 'import-report.txt');
    await fs.writeFile(reportFile, report.join('\n'), 'utf-8');
    
    // 输出到控制台
    console.log('\n' + report.join('\n'));
    
    this.logger.success('导入报告已生成');
  }
  
  /**
   * 关闭连接
   */
  async close() {
    if (this.connection) {
      await this.connection.end();
      console.log('\n✅ 数据库连接已关闭');
    }
    
    if (this.logger) {
      await this.logger.save();
    }
  }
  
  /**
   * 执行导入
   */
  async run() {
    try {
      await this.validateExportDir();
      await this.validateChecksums();
      await this.connect();
      await this.createLogger();
      await this.importAllTables();
      await this.validateImport();
      await this.generateReport();
      
      console.log('\n' + '='.repeat(80));
      console.log('✅ 数据导入完成！');
      console.log('='.repeat(80));
      console.log(`\n导入报告: ${path.join(this.importDir, 'import-report.txt')}`);
      console.log(`导入日志: ${path.join(this.importDir, 'import.log')}`);
      console.log('');
      
    } catch (error) {
      console.error('\n❌ 导入失败:', error);
      if (this.logger) {
        this.logger.error(`导入失败: ${error.message}`);
        this.logger.error(error.stack);
      }
      throw error;
    } finally {
      await this.close();
    }
  }
}

// 主函数
async function main() {
  console.log('='.repeat(80));
  console.log('好友记项目 - 数据导入工具');
  console.log('='.repeat(80));
  console.log('');
  
  // 获取导入目录
  const importDir = process.argv[2];
  
  if (!importDir) {
    console.error('❌ 错误: 请指定导入目录');
    console.error('\n用法:');
    console.error('  node import-data.mjs <导出目录路径>');
    console.error('\n示例:');
    console.error('  node import-data.mjs exports/export-20260123-160000/');
    process.exit(1);
  }
  
  // 确认危险操作
  if (CONFIG.import.clearExistingData) {
    console.log('⚠️  警告: 将清空现有数据！');
    console.log('⚠️  这是一个危险操作，将删除目标数据库中的所有数据！');
    console.log('⚠️  请确认你已经备份了数据库。');
    console.log('');
    console.log('按 Ctrl+C 取消，或等待 5 秒后继续...');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  const importer = new DataImporter(CONFIG, importDir);
  await importer.run();
}

// 运行
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
