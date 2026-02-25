import { getDb } from './server/db';
import { rechargeOrders, walletAddresses } from './drizzle/schema';
import { eq } from 'drizzle-orm';

async function checkOrderData() {
  console.log('=== 检查订单数据 ===\n');
  
  const db = await getDb();
  
  if (!db) {
    console.error('❗ 无法连接数据库');
    process.exit(1);
  }
  
  // 1. 查询问题订单
  const order = await db.query.rechargeOrders.findFirst({
    where: eq(rechargeOrders.orderNumber, 'CHG1772004338369740')
  });

  if (order) {
    console.log('订单详情:');
    console.log(`  订单号: ${order.orderNumber}`);
    console.log(`  金额: ${order.amount} ${order.currency}`);
    console.log(`  网络: ${order.network}`);
    console.log(`  收款地址: ${order.walletAddress}`);
    console.log(`  状态: ${order.status}`);
    console.log(`  创建时间: ${order.createdAt}`);
    console.log(`  过期时间: ${order.expiresAt}`);
  } else {
    console.log('❌ 未找到订单');
  }

  console.log('\n=== 检查收款地址配置 ===\n');
  
  // 2. 查询所有收款地址
  const addresses = await db.query.walletAddresses.findMany();
  
  console.log(`总共 ${addresses.length} 个收款地址:\n`);
  
  for (const addr of addresses) {
    console.log(`${addr.network} - ${addr.enabled ? '✅ 启用' : '❌ 禁用'}`);
    console.log(`  地址: ${addr.address}`);
    console.log(`  标签: ${addr.label || '(无)'}`);
    console.log(`  ID: ${addr.id}`);
    console.log('');
  }

  // 3. 检查 SOLANA 地址
  const solanaAddresses = addresses.filter(a => a.network === 'SOLANA');
  console.log(`\nSOLANA 地址数量: ${solanaAddresses.length}`);
  console.log(`启用的 SOLANA 地址: ${solanaAddresses.filter(a => a.enabled).length}`);

  process.exit(0);
}

checkOrderData().catch(console.error);
