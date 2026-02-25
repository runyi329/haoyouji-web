import { scanSolanaTransactions } from "./server/scanners/solana-scanner";

async function testSolanaScanner() {
  console.log("========== 测试 SOLANA 扫描器 ==========");
  
  try {
    const stats = await scanSolanaTransactions();
    console.log("\n扫描结果:");
    console.log("- 扫描地址数:", stats.scannedAddresses);
    console.log("- 发现交易数:", stats.foundTransactions);
    console.log("- 匹配订单数:", stats.matchedOrders);
    console.log("- 未匹配交易:", stats.unmatchedTransactions);
  } catch (error) {
    console.error("扫描失败:", error);
  }
}

testSolanaScanner();
