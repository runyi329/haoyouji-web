import { runDailyScan } from './server/stock-daily-scanner';

async function main() {
  console.log('[手动补拉] 开始补拉 20260429 数据...');
  try {
    await runDailyScan('20260429');
    console.log('[手动补拉] 完成！');
  } catch (err) {
    console.error('[手动补拉] 失败:', err);
  }
  process.exit(0);
}
main();
