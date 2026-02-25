async function debugRecentTransactions() {
  const address = '0x46f7f36fe362c05fd326b9689a63461adb0548a857033325892205b9f3b6ed2d';
  const APTOS_API_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
  
  console.log(`========== 查看地址最近的交易 ==========`);
  console.log(`地址: ${address}\n`);
  
  try {
    const response = await fetch(
      `${APTOS_API_URL}/accounts/${address}/transactions?limit=10`
    );
    
    if (!response.ok) {
      console.log(`❌ 查询失败: ${response.status}`);
      return;
    }
    
    const transactions = await response.json();
    
    console.log(`找到 ${transactions.length} 笔交易\n`);
    
    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      console.log(`\n========== 交易 ${i + 1} ==========`);
      console.log(`哈希: ${tx.hash}`);
      console.log(`版本: ${tx.version}`);
      console.log(`时间: ${new Date(parseInt(tx.timestamp) / 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
      console.log(`发送方: ${tx.sender}`);
      console.log(`成功: ${tx.success}`);
      
      if (tx.events && Array.isArray(tx.events)) {
        console.log(`\n事件数: ${tx.events.length}`);
        
        const depositEvents = tx.events.filter((e: any) => e.type?.includes('Deposit'));
        const withdrawEvents = tx.events.filter((e: any) => e.type?.includes('Withdraw'));
        
        if (depositEvents.length > 0) {
          console.log(`\n  Deposit 事件:`);
          depositEvents.forEach((e: any) => {
            console.log(`    Store: ${e.data.store}`);
            console.log(`    金额: ${e.data.amount}`);
          });
        }
        
        if (withdrawEvents.length > 0) {
          console.log(`\n  Withdraw 事件:`);
          withdrawEvents.forEach((e: any) => {
            console.log(`    Store: ${e.data.store}`);
            console.log(`    金额: ${e.data.amount}`);
          });
        }
      }
    }
    
  } catch (error) {
    console.error('❌ 查询失败:', error);
  }
  
  console.log('\n========== 查询完成 ==========');
  process.exit(0);
}

debugRecentTransactions();
