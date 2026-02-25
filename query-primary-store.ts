async function queryPrimaryStore() {
  const address = '0x46f7f36fe362c05fd326b9689a63461adb0548a857033325892205b9f3b6ed2d';
  const APTOS_API_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
  
  // USDT Fungible Asset metadata
  const USDT_FA_METADATA = '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDT';
  
  console.log(`========== 查询 Primary Fungible Store ==========`);
  console.log(`地址: ${address}\n`);
  
  try {
    // 方法1：通过 view function 查询
    console.log('1. 通过 view function 查询 Primary Store...');
    const viewResponse = await fetch(`${APTOS_API_URL}/view`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        function: '0x1::primary_fungible_store::primary_store_address',
        type_arguments: [USDT_FA_METADATA],
        arguments: [address]
      })
    });
    
    if (viewResponse.ok) {
      const result = await viewResponse.json();
      console.log(`   Primary Store 地址:`, result);
      
      if (result && result[0]) {
        const storeAddress = result[0];
        console.log(`\n   ✅ 找到 Store: ${storeAddress}`);
        
        // 查询这个 Store 的资源
        console.log(`\n2. 查询 Store 的资源...`);
        const storeResourceResponse = await fetch(
          `${APTOS_API_URL}/accounts/${storeAddress}/resources`
        );
        
        if (storeResourceResponse.ok) {
          const resources = await storeResourceResponse.json();
          console.log(`   找到 ${resources.length} 个资源\n`);
          
          // 查找 FungibleStore
          const fungibleStore = resources.find((r: any) => 
            r.type && r.type.includes('FungibleStore')
          );
          
          if (fungibleStore) {
            console.log(`   ✅ 找到 FungibleStore:`);
            console.log(`      类型: ${fungibleStore.type}`);
            console.log(`      数据:`, JSON.stringify(fungibleStore.data, null, 2));
          }
        }
      }
    } else {
      console.log(`   ❌ 查询失败: ${viewResponse.status}`);
    }
    
    // 方法2：从交易记录中提取 Store 地址
    console.log(`\n3. 从交易记录中提取 Store 地址...`);
    const txResponse = await fetch(
      `${APTOS_API_URL}/accounts/${address}/transactions?limit=1`
    );
    
    if (txResponse.ok) {
      const transactions = await txResponse.json();
      if (transactions.length > 0) {
        const tx = transactions[0];
        if (tx.events && Array.isArray(tx.events)) {
          const withdrawEvents = tx.events.filter((e: any) => 
            e.type && e.type.includes('Withdraw')
          );
          
          if (withdrawEvents.length > 0) {
            console.log(`   找到 Withdraw 事件:`);
            withdrawEvents.forEach((e: any) => {
              console.log(`      Store: ${e.data.store}`);
            });
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

queryPrimaryStore().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
