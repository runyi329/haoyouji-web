async function queryAptosTransactions() {
  const address = '0x46f7f36fe362c05fd326b9689a63461adb0548a857033325892205b9f3b6ed2d';
  const APTOS_API_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
  
  console.log(`========== 查询 Aptos 地址交易记录 ==========`);
  console.log(`地址: ${address}\n`);
  
  try {
    // 查询账户交易
    const url = `${APTOS_API_URL}/accounts/${address}/transactions?limit=20`;
    console.log(`API URL: ${url}\n`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`❌ API请求失败: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(`响应内容: ${text}`);
      return;
    }
    
    const transactions = await response.json();
    
    console.log(`找到 ${transactions.length} 笔交易\n`);
    
    if (transactions.length === 0) {
      console.log('该地址没有任何交易记录');
      return;
    }
    
    // 显示最近的交易
    transactions.forEach((tx: any, i: number) => {
      console.log(`\n交易 ${i + 1}:`);
      console.log(`  版本: ${tx.version}`);
      console.log(`  哈希: ${tx.hash}`);
      console.log(`  类型: ${tx.type}`);
      console.log(`  发送者: ${tx.sender}`);
      console.log(`  时间戳: ${new Date(parseInt(tx.timestamp) / 1000).toISOString()}`);
      console.log(`  成功: ${tx.success}`);
      
      if (tx.payload) {
        console.log(`  Payload类型: ${tx.payload.type}`);
        if (tx.payload.function) {
          console.log(`  函数: ${tx.payload.function}`);
        }
      }
      
      // 查找USDT转账
      if (tx.events) {
        tx.events.forEach((event: any) => {
          if (event.type && event.type.includes('transfer')) {
            console.log(`  事件: ${event.type}`);
            console.log(`  数据:`, JSON.stringify(event.data, null, 2));
          }
        });
      }
    });
    
  } catch (error) {
    console.error('❌ 查询失败:', error);
  }
  
  console.log('\n========== 查询完成 ==========');
  process.exit(0);
}

queryAptosTransactions().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
