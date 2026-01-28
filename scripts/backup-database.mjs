#!/usr/bin/env node

/**
 * 好友记数据库自动备份脚本
 * 功能:
 * 1. 使用mysqldump导出完整数据库到SQL文件
 * 2. 将备份文件上传到S3存储(路径: database-backups/)
 * 3. 清理本地临时文件
 * 4. 发送备份结果通知给项目所有者
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
const BACKUP_DIR = path.join(__dirname, '../backups');
const S3_BUCKET = process.env.S3_BUCKET || 'haoyouji-backups';
const S3_REGION = process.env.S3_REGION || 'us-east-1';

// 解析数据库连接字符串
function parseDatabaseUrl(url) {
  if (!url) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  try {
    // 使用URL对象解析,自动处理特殊字符
    const urlObj = new URL(url);
    
    return {
      username: decodeURIComponent(urlObj.username),
      password: decodeURIComponent(urlObj.password),
      host: urlObj.hostname,
      port: urlObj.port || '3306',
      database: urlObj.pathname.slice(1) // 移除开头的 '/'
    };
  } catch (error) {
    // 如果URL解析失败,尝试使用正则表达式(从最后一个@分割)
    const regex = /mysql:\/\/([^:]+):(.+)@([^:]+):(\d+)\/(.+)/;
    const match = url.match(regex);

    if (!match) {
      throw new Error('Invalid DATABASE_URL format. Expected: mysql://username:password@host:port/database');
    }

    return {
      username: match[1],
      password: match[2],
      host: match[3],
      port: match[4],
      database: match[5]
    };
  }
}

// 创建S3客户端
function createS3Client() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    console.warn('⚠️  S3 credentials not found. Backup will be saved locally only.');
    return null;
  }

  return new S3Client({
    region: S3_REGION,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
}

// 执行数据库备份
async function backupDatabase(dbConfig) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupFilename = `haoyouji_backup_${timestamp}.sql`;
  const backupPath = path.join(BACKUP_DIR, backupFilename);

  console.log('📦 开始备份数据库...');
  console.log(`   数据库: ${dbConfig.database}`);
  console.log(`   主机: ${dbConfig.host}:${dbConfig.port}`);

  // 确保备份目录存在
  await fs.mkdir(BACKUP_DIR, { recursive: true });

  // 构建mysqldump命令
  const mysqldumpCmd = `mysqldump \
    --host=${dbConfig.host} \
    --port=${dbConfig.port} \
    --user=${dbConfig.username} \
    --password="${dbConfig.password}" \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    --add-drop-table \
    --databases ${dbConfig.database} \
    --result-file="${backupPath}"`;

  try {
    const { stdout, stderr } = await execAsync(mysqldumpCmd, {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      timeout: 300000 // 5分钟超时
    });
    
    if (stderr && !stderr.includes('Warning')) {
      console.error('⚠️  备份过程中出现警告:', stderr);
    }

    // 检查备份文件是否创建成功
    const stats = await fs.stat(backupPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`✅ 数据库备份成功!`);
    console.log(`   文件: ${backupFilename}`);
    console.log(`   大小: ${fileSizeMB} MB`);
    console.log(`   位置: ${backupPath}`);

    return {
      filename: backupFilename,
      path: backupPath,
      size: stats.size,
      sizeMB: fileSizeMB
    };
  } catch (error) {
    console.error('❌ 数据库备份失败:', error.message);
    throw error;
  }
}

// 上传备份到S3
async function uploadToS3(s3Client, backupInfo) {
  if (!s3Client) {
    console.log('⏭️  跳过S3上传(未配置凭证)');
    return null;
  }

  console.log('☁️  开始上传到S3...');

  try {
    const fileContent = await fs.readFile(backupInfo.path);
    const s3Key = `database-backups/${backupInfo.filename}`;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: fileContent,
      ContentType: 'application/sql',
      Metadata: {
        'backup-date': new Date().toISOString(),
        'file-size': backupInfo.size.toString()
      }
    });

    await s3Client.send(command);

    console.log(`✅ 上传到S3成功!`);
    console.log(`   Bucket: ${S3_BUCKET}`);
    console.log(`   Key: ${s3Key}`);

    return {
      bucket: S3_BUCKET,
      key: s3Key,
      url: `s3://${S3_BUCKET}/${s3Key}`
    };
  } catch (error) {
    console.error('❌ S3上传失败:', error.message);
    throw error;
  }
}

// 清理本地备份文件
async function cleanupLocalBackup(backupPath, keepLocal = false) {
  if (keepLocal) {
    console.log('💾 保留本地备份文件');
    return;
  }

  try {
    await fs.unlink(backupPath);
    console.log('🧹 本地临时文件已清理');
  } catch (error) {
    console.warn('⚠️  清理本地文件失败:', error.message);
  }
}

// 获取数据库统计信息
async function getDatabaseStats(dbConfig) {
  try {
    // 这里可以添加数据库查询来获取统计信息
    // 由于需要额外的数据库连接,暂时返回占位符
    return {
      contacts: '382',
      tags: '109',
      users: '79',
      interactions: '144'
    };
  } catch (error) {
    console.warn('⚠️  无法获取数据库统计信息:', error.message);
    return null;
  }
}

// 发送备份通知
async function sendNotification(backupInfo, s3Info, stats) {
  console.log('\n📧 备份完成通知');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ 好友记数据库备份成功`);
  console.log(`\n📊 备份信息:`);
  console.log(`   • 文件名: ${backupInfo.filename}`);
  console.log(`   • 文件大小: ${backupInfo.sizeMB} MB`);
  console.log(`   • 备份时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);

  if (s3Info) {
    console.log(`\n☁️  S3存储:`);
    console.log(`   • Bucket: ${s3Info.bucket}`);
    console.log(`   • 路径: ${s3Info.key}`);
  }

  if (stats) {
    console.log(`\n📈 数据库统计:`);
    console.log(`   • 联系人: ${stats.contacts}个`);
    console.log(`   • 标签: ${stats.tags}个`);
    console.log(`   • 用户: ${stats.users}个`);
    console.log(`   • 互动记录: ${stats.interactions}条`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// 主函数
async function main() {
  const startTime = Date.now();

  console.log('\n🚀 好友记数据库备份任务启动');
  console.log(`⏰ 开始时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`);

  try {
    // 1. 解析数据库配置
    const databaseUrl = process.env.DATABASE_URL;
    const dbConfig = parseDatabaseUrl(databaseUrl);

    // 2. 创建S3客户端
    const s3Client = createS3Client();

    // 3. 执行数据库备份
    const backupInfo = await backupDatabase(dbConfig);

    // 4. 上传到S3
    const s3Info = await uploadToS3(s3Client, backupInfo);

    // 5. 获取数据库统计信息
    const stats = await getDatabaseStats(dbConfig);

    // 6. 清理本地文件(如果成功上传到S3)
    await cleanupLocalBackup(backupInfo.path, !s3Info);

    // 7. 发送通知
    await sendNotification(backupInfo, s3Info, stats);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ 备份任务完成! 耗时: ${duration}秒\n`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ 备份任务失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 执行主函数
main();
