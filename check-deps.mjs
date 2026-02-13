#!/usr/bin/env node

const deps = ['@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'];

console.log('检查备份脚本依赖:\n');

for (const dep of deps) {
  try {
    await import(dep);
    console.log('✅', dep);
  } catch (e) {
    console.log('❌', dep, '- 未安装或无法加载');
  }
}

console.log('\n检查 mysqldump 工具:');
try {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  const { stdout } = await execAsync('which mysqldump');
  console.log('✅ mysqldump -', stdout.trim());
} catch (e) {
  console.log('❌ mysqldump - 未安装');
}

console.log('\n✅ 所有依赖检查完成');
