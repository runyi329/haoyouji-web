import { scanAptosTransactions } from './server/scanners/aptos-scanner';

async function testAptosScanner() {
  console.log('========== 测试 Aptos 扫描器 ==========\n');
  
  try {
    const stats = await scanAptosTransactions();
    
    console.log('\n========== 扫描结果 ==========');
    console.log(`扫描地址数: ${stats.scannedAddresses}`);
    console.log(`发现交易数: ${stats.foundTransactions}`);
    console.log(`匹配订单数: ${stats.matchedOrders}`);
    console.log(`未匹配交易数: ${stats.unmatchedTransactions}`);
    console.log('========== 测试完成 ==========');
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
  
  process.exit(0);
}

testAptosScanner();
