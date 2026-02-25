import { getDb } from "./server/db";
import { walletAddresses } from "./drizzle/schema";

async function checkWallets() {
  console.log('========== 检查所有网络的钱包地址 ==========\n');
  
  const db = await getDb();
  const allWallets = await db.select().from(walletAddresses);
  
  console.log(`数据库中总共有 ${allWallets.length} 个钱包地址\n`);
  
  if (allWallets.length === 0) {
    console.log('❌ 数据库中没有任何钱包地址！');
    process.exit(0);
  }
  
  const networks = ['TRC20', 'APTOS', 'SOLANA', 'ERC20', 'BEP20'];
  
  for (const network of networks) {
    const networkWallets = allWallets.filter(w => w.network === network);
    console.log(`\n---------- ${network} ----------`);
    console.log(`地址数量: ${networkWallets.length}`);
    
    if (networkWallets.length > 0) {
      networkWallets.forEach((w, i) => {
        console.log(`  ${i+1}. ${w.label || '未命名'}`);
        console.log(`     地址: ${w.address}`);
        console.log(`     状态: ${w.enabled ? '✅ 启用' : '❌ 禁用'}`);
        console.log(`     创建时间: ${w.createdAt}`);
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
