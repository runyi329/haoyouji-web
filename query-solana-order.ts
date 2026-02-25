import { getDb } from "./server/db";
import { rechargeOrders, walletAddresses } from "./drizzle/schema";
import { eq } from "drizzle-orm";

async function queryOrder() {
  const db = await getDb();
  
  // 查询订单详情
  const order = await db
    .select()
    .from(rechargeOrders)
    .where(eq(rechargeOrders.orderNo, 'CHG1772004338369740'))
    .limit(1);
  
  if (order.length === 0) {
    console.log("订单不存在");
    return;
  }
  
  console.log("\n========== 订单详情 ==========");
  console.log("订单号:", order[0].orderNo);
  console.log("金额:", order[0].amount);
  console.log("网络:", order[0].network);
  console.log("状态:", order[0].status);
  console.log("钱包地址:", order[0].walletAddress);
  console.log("创建时间:", order[0].createdAt);
  console.log("完成时间:", order[0].completedAt);
  console.log("交易哈希:", order[0].txHash);
  
  // 查询钱包地址详情
  if (order[0].walletAddress) {
    const wallet = await db
      .select()
      .from(walletAddresses)
      .where(eq(walletAddresses.address, order[0].walletAddress))
      .limit(1);
    
    if (wallet.length > 0) {
      console.log("\n========== 钱包地址详情 ==========");
      console.log("地址:", wallet[0].address);
      console.log("网络:", wallet[0].network);
      console.log("标签:", wallet[0].label);
      console.log("是否启用:", wallet[0].isEnabled);
    }
  }
}

queryOrder();
