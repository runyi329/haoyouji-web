async function testGraphQLAPI() {
  const INDEXER_API_URL = 'https://api.mainnet.aptoslabs.com/v1/graphql';
  const walletAddress = '0x46f7f36fe362c05fd326b9689a63461adb0548a857033325892205b9f3b6ed2d';
  
  console.log(`========== 测试 Aptos Indexer GraphQL API ==========`);
  console.log(`钱包地址: ${walletAddress}\n`);
  
  // 查询最近的 Fungible Asset Activities
  const query = `
    query GetFungibleAssetActivities($owner_address: String!) {
      fungible_asset_activities(
        where: {
          owner_address: { _eq: $owner_address }
          type: { _like: "%Deposit%" }
        }
        order_by: { transaction_version: desc }
        limit: 10
      ) {
        transaction_version
        transaction_timestamp
        type
        amount
        asset_type
        storage_id
        entry_function_id_str
        is_transaction_success
      }
    }
  `;
  
  try {
    const response = await fetch(INDEXER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          owner_address: walletAddress
        }
      })
    });
    
    if (!response.ok) {
      console.log(`❌ 查询失败: ${response.status}`);
      const errorText = await response.text();
      console.log(`错误信息: ${errorText}`);
      return;
    }
    
    const result = await response.json();
    
    if (result.errors) {
      console.log(`❌ GraphQL 错误:`, result.errors);
      return;
    }
    
    const activities = result.data.fungible_asset_activities;
    
    console.log(`✅ 找到 ${activities.length} 个 Deposit 活动\n`);
    
    activities.forEach((activity: any, index: number) => {
      const amount = parseFloat(activity.amount) / 1e6; // USDT 6位小数
      const timestamp = new Date(activity.transaction_timestamp).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      
      console.log(`活动 ${index + 1}:`);
      console.log(`  版本: ${activity.transaction_version}`);
      console.log(`  时间: ${timestamp}`);
      console.log(`  类型: ${activity.type}`);
      console.log(`  金额: ${amount} USDT`);
      console.log(`  Store: ${activity.storage_id}`);
      console.log(`  函数: ${activity.entry_function_id_str || 'N/A'}`);
      console.log(`  成功: ${activity.is_transaction_success}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ 查询失败:', error);
  }
  
  console.log('========== 测试完成 ==========');
  process.exit(0);
}

testGraphQLAPI();
