import { db } from './server/db/db';
import { rechargeOrders } from './drizzle/schema';
import { eq } from 'drizzle-orm';

async function queryOrder() {
  console.log('=== 查询订单详情 ===\n');
  
  const order = await db.query.rechargeOrders.findFirst({
    where: eq(rechargeOrders.orderNumber, 'CHG1772004338369740')
  });

  if (!order) {
    console.log('❌ 未找到订单');
    return;
  }

  console.log('订单信息:');
  console.log(JSON.stringify(order, null, 2));
}

queryOrder().catch(console.error).finally(() => process.exit(0));
