async function queryStoreEvents() {
  const storeAddress = '0x4303cfcca55f45d5a4c930d89fa5085e7a162d8ac042e39c00a987522e86f00c';
  const APTOS_API_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
  
  console.log(`========== 查询 Store 的 Deposit 事件 ==========`);
  console.log(`Store 地址: ${storeAddress}\n`);
  
  try {
    // 方法1：查询 Store 的所有事件
    console.log('方法1：查询 Store 的所有事件...');
    const eventsResponse = await fetch(
      `${APTOS_API_URL}/accounts/${storeAddress}/events/0x1::fungible_asset::FungibleStore/deposit_events?limit=10`
    );
    
    if (eventsResponse.ok) {
      const events = await eventsResponse.json();
      console.log(`   找到 ${events.length} 个 Deposit 事件\n`);
      
      events.forEach((event: any, index: number) => {
        const amount = parseFloat(event.data.amount) / 1e6;
        const timestamp = new Date(parseInt(event.version) / 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
        console.log(`   事件 ${index + 1}:`);
        console.log(`      版本: ${event.version}`);
        console.log(`      金额: ${amount} USDT`);
        console.log(`      序号: ${event.sequence_number}`);
      });
    } else {
      console.log(`   ❌ 查询失败: ${eventsResponse.status}`);
      const errorText = await eventsResponse.text();
      console.log(`   错误信息: ${errorText}`);
    }
    
    // 方法2：查询 Store 的资源
    console.log('\n\n方法2：查询 Store 的资源...');
    const resourceResponse = await fetch(
      `${APTOS_API_URL}/accounts/${storeAddress}/resources`
    );
    
    if (resourceResponse.ok) {
      const resources = await resourceResponse.json();
      console.log(`   找到 ${resources.length} 个资源\n`);
      
      const fungibleStore = resources.find((r: any) => 
        r.type && r.type.includes('FungibleStore')
      );
      
      if (fungibleStore) {
        console.log(`   ✅ 找到 FungibleStore:`);
        console.log(`      类型: ${fungibleStore.type}`);
        console.log(`      余额: ${fungibleStore.data.balance}`);
        console.log(`      所有者: ${fungibleStore.data.owner}`);
        
        if (fungibleStore.data.deposit_events) {
          console.log(`      Deposit events handle: ${JSON.stringify(fungibleStore.data.deposit_events)}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ 查询失败:', error);
  }
  
  console.log('\n========== 查询完成 ==========');
  process.exit(0);
}

queryStoreEvents();
