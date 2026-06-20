import { scanAptosTransactions } from "./server/scanners/aptos-scanner";
import { getDb } from "./server/db";

async function triggerAptosScanner() {
  console.log('========== 手动触发 Aptos 扫描器 ==========\n');
  
  // 初始化数据库
  await getDb();
  
  console.log('正在扫描 Aptos 网络...\n');
  
  try {
    await scanAptosTransactions();
    console.log('\n✅ 扫描完成！');
  } catch (error) {
    console.error('\n❌ 扫描失败:', error);
    throw error;
  }
  
  process.exit(0);
}

triggerAptosScanner().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
