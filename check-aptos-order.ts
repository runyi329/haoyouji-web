import { getDb } from "./server/db";
import { rechargeOrders } from "./drizzle/schema";
import { eq } from "drizzle-orm";

async function checkAptosOrder() {
  console.log('========== 检查Aptos订单 ==========\n');
  
  const db = await getDb();
  
  // 查询所有Aptos订单
  const aptosOrders = await db
    .select()
    .from(rechargeOrders)
    .where(eq(rechargeOrders.network, 'APTOS'));
  
  console.log(`Aptos订单数量: ${aptosOrders.length}\n`);
  
  if (aptosOrders.length === 0) {
    console.log('❌ 没有找到Aptos订单');
    process.exit(0);
  }
  
  aptosOrders.forEach((order, i) => {
    console.log(`\n订单 ${i+1}:`);
    console.log(`  订单号: ${order.orderNo}`);
    console.log(`  金额: ${order.amount} USDT`);
    console.log(`  网络: ${order.network}`);
    console.log(`  收款地址: ${order.walletAddress}`);
    console.log(`  状态: ${order.status}`);
    console.log(`  创建时间: ${order.createdAt}`);
    console.log(`  过期时间: ${order.expiresAt}`);
    if (order.txHash) {
      console.log(`  交易哈希: ${order.txHash}`);
    }
    if (order.completedAt) {
      console.log(`  完成时间: ${order.completedAt}`);
    }
  });
  
  // 检查扫描器心跳
  console.log('\n\n========== 检查扫描器状态 ==========\n');
  
  const heartbeats = await db.query.scannerHeartbeat.findMany();
  
  if (heartbeats.length === 0) {
    console.log('❌ 没有找到扫描器心跳记录');
  } else {
    heartbeats.forEach(hb => {
      console.log(`\n扫描器类型: ${hb.scannerType}`);
      console.log(`  最后扫描时间: ${hb.lastScanAt}`);
      console.log(`  扫描次数: ${hb.scanCount}`);
      console.log(`  成功次数: ${hb.successCount}`);
      console.log(`  失败次数: ${hb.errorCount}`);
      console.log(`  扫描地址数: ${hb.scannedAddresses || 0}`);
      console.log(`  发现交易数: ${hb.foundTransactions || 0}`);
      console.log(`  匹配订单数: ${hb.matchedOrders || 0}`);
      console.log(`  未匹配交易数: ${hb.unmatchedTransactions || 0}`);
      if (hb.lastError) {
        console.log(`  最后错误: ${hb.lastError}`);
      }
    });
  }
  
  console.log('\n========== 检查完成 ==========');
  process.exit(0);
}

checkAptosOrder().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
