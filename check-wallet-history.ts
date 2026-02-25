import { getDb } from './server/db';
import { walletAddresses, rechargeOrders } from './server/db/schema';
import { eq, desc } from 'drizzle-orm';

async function checkWalletHistory() {
  const db = await getDb();

  try {
    // 查询所有钱包地址及其创建时间
    const wallets = await db
      .select()
      .from(walletAddresses);
    
    console.log('\n========== 钱包地址历史 ==========');
    console.table(wallets.map(w => ({
      id: w.id,
      network: w.network,
      address: w.address.substring(0, 20) + '...',
      enabled: w.enabled,
      created_at: w.createdAt
    })));
    
    // 查询问题订单
    const orders = await db
      .select()
      .from(rechargeOrders)
      .where(eq(rechargeOrders.orderNo, 'CHG1772004338369740'));
    
    console.log('\n========== 问题订单详情 ==========');
    if (orders.length > 0) {
      console.table(orders.map(o => ({
        order_no: o.orderNo,
        amount: o.amount,
        network: o.network,
        wallet_address: o.walletAddress?.substring(0, 30) + '...',
        full_address: o.walletAddress,
        status: o.status,
        created_at: o.createdAt
      })));
    } else {
      console.log('未找到订单');
    }
    
    // 查询所有 SOLANA 订单
    const solanaOrders = await db
      .select()
      .from(rechargeOrders)
      .where(eq(rechargeOrders.network, 'SOLANA'))
      .orderBy(desc(rechargeOrders.createdAt))
      .limit(10);
    
    console.log('\n========== 所有 SOLANA 订单 ==========');
    console.table(solanaOrders.map(o => ({
      order_no: o.orderNo,
      amount: o.amount,
      network: o.network,
      wallet_address: o.walletAddress?.substring(0, 30) + '...',
      status: o.status,
      created_at: o.createdAt
    })));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkWalletHistory();
