async function querySenderTransaction() {
  const txHash = '0xb17afd6e0fe9f9e89bf808d964df3187f73d6d2202e36d8962af8f5e66188c70';
  const APTOS_API_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
  
  console.log(`========== 查询对方转出交易 ==========`);
  console.log(`交易哈希: ${txHash}\n`);
  
  try {
    const response = await fetch(
      `${APTOS_API_URL}/transactions/by_hash/${txHash}`
    );
    
    if (!response.ok) {
      console.log(`❌ 查询失败: ${response.status}`);
      return;
    }
    
    const tx = await response.json();
    
    console.log(`✅ 找到交易`);
    console.log(`   版本号: ${tx.version}`);
    console.log(`   时间戳: ${new Date(parseInt(tx.timestamp) / 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    console.log(`   发送方: ${tx.sender}`);
    console.log(`   成功: ${tx.success}`);
    
    if (tx.events && Array.isArray(tx.events)) {
      console.log(`\n📋 事件列表 (共 ${tx.events.length} 个):`);
      
      tx.events.forEach((event: any, index: number) => {
        console.log(`\n   事件 ${index + 1}:`);
        console.log(`      类型: ${event.type}`);
        console.log(`      序号: ${event.sequence_number}`);
        
        if (event.type.includes('Withdraw')) {
          console.log(`      ⬅️  Withdraw (转出)`);
          console.log(`         Store: ${event.data.store}`);
          console.log(`         金额: ${event.data.amount}`);
        } else if (event.type.includes('Deposit')) {
          console.log(`      ➡️  Deposit (转入)`);
          console.log(`         Store: ${event.data.store}`);
          console.log(`         金额: ${event.data.amount}`);
        }
      });
      
      // 找出 Deposit 事件
      const depositEvents = tx.events.filter((e: any) => 
        e.type && e.type.includes('Deposit')
      );
      
      if (depositEvents.length > 0) {
        console.log(`\n\n🎯 关键信息：`);
        console.log(`   发现 ${depositEvents.length} 个 Deposit 事件`);
        depositEvents.forEach((e: any) => {
          console.log(`   ➡️  转入到 Store: ${e.data.store}`);
          console.log(`      金额: ${e.data.amount}`);
        });
        
        // 查询这个 Store 属于哪个地址
        console.log(`\n\n🔍 查询 Store 所属地址...`);
        for (const depositEvent of depositEvents) {
          const storeAddress = depositEvent.data.store;
          console.log(`\n   Store: ${storeAddress}`);
          
          // 查询这个 Store 的资源
          const storeResponse = await fetch(
            `${APTOS_API_URL}/accounts/${storeAddress}/resources`
          );
          
          if (storeResponse.ok) {
            const resources = await storeResponse.json();
            const fungibleStore = resources.find((r: any) => 
              r.type && r.type.includes('FungibleStore')
            );
            
            if (fungibleStore && fungibleStore.data && fungibleStore.data.owner) {
              console.log(`   ✅ 所属地址: ${fungibleStore.data.owner}`);
              
              // 检查是否是我们的地址
              const ourAddress = '0x46f7f36fe362c05fd326b9689a63461adb0548a857033325892205b9f3b6ed2d';
              if (fungibleStore.data.owner.toLowerCase() === ourAddress.toLowerCase()) {
                console.log(`   🎉 这是我们的地址！`);
              }
            }
          }
        }
      }
    }
    
  } catch (error) {
    console.error('❌ 查询失败:', error);
  }
  
  console.log('\n========== 查询完成 ==========');
  process.exit(0);
}

querySenderTransaction().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
