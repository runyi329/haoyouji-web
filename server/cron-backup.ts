/**
 * 定时备份任务脚本
 * 
 * 使用方法：
 * 1. 在服务器上配置cron job，每小时执行一次
 * 2. crontab -e
 * 3. 添加：0 * * * * cd /path/to/haoyouji-web && node --loader ts-node/esm server/cron-backup.ts
 */

import { checkAndExecuteBackups } from './backup-service';

async function main() {
  console.log(`[${new Date().toISOString()}] 开始检查备份任务...`);
  
  try {
    await checkAndExecuteBackups();
    console.log(`[${new Date().toISOString()}] 备份任务检查完成`);
    process.exit(0);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] 备份任务执行失败:`, error);
    process.exit(1);
  }
}

main();
