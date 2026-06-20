import { getSystemStats } from './server/db-recharge';

async function testStatsFix() {
  console.log('========== 测试修复后的统计数据 ==========\n');
  
  try {
    const stats = await getSystemStats();
    
    console.log('今日充值统计（使用北京时间）：');
    console.log(`  笔数: ${stats.todayCount}`);
    console.log(`  总金额: ${stats.todayTotalAmount.toFixed(2)} USDT`);
    
    console.log('\n订单状态统计：');
    stats.orderStats.forEach((stat: any) => {
      console.log(`  ${stat.status}: ${stat.count} 笔, ${stat.totalAmount.toFixed(2)} USDT`);
    });
    
    console.log('\n最近订单：');
    stats.recentOrders.slice(0, 5).forEach((order: any) => {
      console.log(`  ${order.orderNo}: ${order.amount} USDT (${order.network}, ${order.status})`);
    });
    
  } catch (error) {
    console.error('错误:', error);
  }
  
  console.log('\n========== 测试完成 ==========');
  process.exit(0);
}

testStatsFix();
