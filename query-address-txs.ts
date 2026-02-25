async function queryAddressTransactions() {
  const address = '0x46f7f36fe362c05fd326b9689a63461adb0548a857033325892205b9f3b6ed2d';
  const APTOS_API_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
  
  console.log(`========== 查询地址交易记录 ==========`);
  console.log(`地址: ${address}\n`);
  
  try {
    // 查询最近的交易
    console.log('查询最近10笔交易...\n');
    const response = await fetch(`${APTOS_API_URL}/accounts/${address}/transactions?limit=10`);
    
    if (!response.ok) {
      console.error(`❌ API请求失败: ${response.status}`);
      const text = await response.text();
      console.error(`响应: ${text}`);
      return;
    }
    
    const transactions = await response.json();
    console.log(`找到 ${transactions.length} 笔交易\n`);
    
    if (transactions.length === 0) {
      console.log('❌ 没有找到任何交易');
      return;
    }
    
    // 分析每笔交易
    transactions.forEach((tx: any, i: number) => {
      console.log(`========== 交易 ${i + 1} ==========`);
      console.log(`版本: ${tx.version}`);
      console.log(`时间: ${new Date(parseInt(tx.timestamp) / 1000).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}`);
      console.log(`发送者: ${tx.sender}`);
      console.log(`成功: ${tx.success}`);
      console.log(`函数: ${tx.payload?.function || 'N/A'}`);
      
      // 查找 USDT 相关事件
      if (tx.events && Array.isArray(tx.events)) {
        const usdtEvents = tx.events.filter((e: any) => 
          e.type.includes('fungible_asset') && 
          (e.type.includes('Withdraw') || e.type.includes('Deposit'))
        );
        
        if (usdtEvents.length > 0) {
          console.log(`\nUSDT 相关事件:`);
          usdtEvents.forEach((event: any) => {
            const amount = parseFloat(event.data.amount) / 1e6;
            const type = event.type.includes('Withdraw') ? '转出' : '转入';
            console.log(`  ${type}: ${amount} USDT`);
            console.log(`  Store: ${event.data.store}`);
          });
        }
      }
      
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ 查询失败:', error);
  }
  
  console.log('\n========== 查询完成 ==========');
  process.exit(0);
}

queryAddressTransactions().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
