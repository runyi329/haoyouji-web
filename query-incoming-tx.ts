async function queryIncomingTransaction() {
  const txVersion = '4399696408';
  const APTOS_API_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
  const ourStore = '0x4303cfcca55f45d5a4c930d89fa5085e7a162d8ac042e39c00a987522e86f00c';
  
  console.log(`========== 查询真正的转入交易 ==========`);
  console.log(`交易版本: ${txVersion}\n`);
  
  try {
    const response = await fetch(
      `${APTOS_API_URL}/transactions/by_version/${txVersion}`
    );
    
    if (!response.ok) {
      console.log(`❌ 查询失败: ${response.status}`);
      return;
    }
    
    const tx = await response.json();
    
    console.log(`✅ 找到交易`);
    console.log(`   哈希: ${tx.hash}`);
    console.log(`   版本号: ${tx.version}`);
    console.log(`   时间戳: ${new Date(parseInt(tx.timestamp) / 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    console.log(`   发送方: ${tx.sender}`);
    console.log(`   成功: ${tx.success}`);
    
    if (tx.events && Array.isArray(tx.events)) {
      console.log(`\n📋 事件列表 (共 ${tx.events.length} 个):`);
      
      let foundOurDeposit = false;
      
      tx.events.forEach((event: any, index: number) => {
        if (event.type.includes('Deposit')) {
          const store = event.data.store;
          const amount = event.data.amount;
          
          if (store.toLowerCase() === ourStore.toLowerCase()) {
            console.log(`\n   🎯 事件 ${index + 1}: Deposit 到我们的 Store！`);
            console.log(`      Store: ${store}`);
            console.log(`      金额: ${amount} (${parseFloat(amount) / 1e6} USDT)`);
            foundOurDeposit = true;
          }
        }
      });
      
      if (!foundOurDeposit) {
        console.log(`\n   ❌ 没有找到 Deposit 到我们 Store 的事件`);
      } else {
        console.log(`\n   ✅ 确认：这是一笔转入到我们地址的交易！`);
      }
    }
    
  } catch (error) {
    console.error('❌ 查询失败:', error);
  }
  
  console.log('\n========== 查询完成 ==========');
  process.exit(0);
}

queryIncomingTransaction();
