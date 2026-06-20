import { getDb } from "./server/db";
import { rechargeOrders } from "./drizzle/schema";
import { eq } from "drizzle-orm";

async function fixOrderAddress() {
  const orderNo = 'CHG1771986246733318';
  const walletAddress = '0x46f7f36fe362c05fd326b9689a63461adb0548a857033325892205b9f3b6ed2d';
  
  console.log(`正在更新订单 ${orderNo} 的收款地址...`);
  console.log(`地址: ${walletAddress}\n`);
  
  const db = await getDb();
  
  // 更新订单
  const result = await db
    .update(rechargeOrders)
    .set({ walletAddress })
    .where(eq(rechargeOrders.orderNo, orderNo));
  
  console.log('✅ 订单已更新！');
  
  // 验证更新
  const order = await db
    .select()
    .from(rechargeOrders)
    .where(eq(rechargeOrders.orderNo, orderNo))
    .limit(1);
  
  if (order.length > 0) {
    console.log('\n验证结果:');
    console.log(`  订单号: ${order[0].orderNo}`);
    console.log(`  金额: ${order[0].amount} USDT`);
    console.log(`  网络: ${order[0].network}`);
    console.log(`  收款地址: ${order[0].walletAddress}`);
    console.log(`  状态: ${order[0].status}`);
  }
  
  console.log('\n✅ 完成！现在可以手动触发扫描器了。');
  process.exit(0);
}

fixOrderAddress().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
