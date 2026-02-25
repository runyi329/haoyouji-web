import * as dbRecharge from "./server/db-recharge";
import { getDb } from "./server/db";

async function checkWallets() {
  // 初始化数据库连接
  await getDb();
  console.log('========== 检查所有网络的钱包地址 ==========\n');
  
  const networks = ['TRC20', 'APTOS', 'SOLANA', 'ERC20', 'BEP20'];
  
  for (const network of networks) {
    console.log(`\n---------- ${network} ----------`);
    const wallets = await dbRecharge.getEnabledWalletAddresses(network);
    console.log(`启用的地址数量: ${wallets.length}`);
    
    if (wallets.length > 0) {
      wallets.forEach((w, i) => {
        console.log(`  ${i+1}. ${w.label || '未命名'}`);
        console.log(`     地址: ${w.address}`);
        console.log(`     状态: ${w.isEnabled ? '启用' : '禁用'}`);
      });
    } else {
      console.log('  (无地址)');
    }
  }
  
  console.log('\n========== 检查完成 ==========');
  process.exit(0);
}

checkWallets().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
