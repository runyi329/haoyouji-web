async function queryTransaction() {
  // 从截图中看到的交易版本
  const version = '4399696408';
  const APTOS_API_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
  
  console.log(`========== 查询交易详情 ==========`);
  console.log(`交易版本: ${version}\n`);
  
  try {
    const response = await fetch(`${APTOS_API_URL}/transactions/by_version/${version}`);
    
    if (!response.ok) {
      console.error(`❌ API请求失败: ${response.status}`);
      const text = await response.text();
      console.error(`响应: ${text}`);
      return;
    }
    
    const tx = await response.json();
    
    console.log('交易基本信息:');
    console.log(`  版本: ${tx.version}`);
    console.log(`  发送者: ${tx.sender}`);
    console.log(`  时间: ${new Date(parseInt(tx.timestamp) / 1000).toISOString()}`);
    console.log(`  成功: ${tx.success}`);
    console.log(`  函数: ${tx.payload?.function}`);
    
    console.log('\n事件列表:');
    if (tx.events && Array.isArray(tx.events)) {
      tx.events.forEach((event: any, i: number) => {
        console.log(`\n事件 ${i + 1}:`);
        console.log(`  类型: ${event.type}`);
        console.log(`  数据:`, JSON.stringify(event.data, null, 2));
      });
    }
    
    console.log('\n状态变化:');
    if (tx.changes && Array.isArray(tx.changes)) {
      tx.changes.forEach((change: any, i: number) => {
        if (change.type === 'write_resource' && change.data?.type?.includes('CoinStore')) {
          console.log(`\n变化 ${i + 1}:`);
          console.log(`  地址: ${change.address}`);
          console.log(`  类型: ${change.data.type}`);
          if (change.data.data?.coin) {
            console.log(`  余额: ${change.data.data.coin.value}`);
          }
        }
      });
    }
    
  } catch (error) {
    console.error('❌ 查询失败:', error);
  }
  
  console.log('\n========== 查询完成 ==========');
  process.exit(0);
}

queryTransaction().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
