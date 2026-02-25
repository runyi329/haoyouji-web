async function debugAssetType() {
  const INDEXER_API_URL = 'https://api.mainnet.aptoslabs.com/v1/graphql';
  const walletAddress = '0x46f7f36fe362c05fd326b9689a63461adb0548a857033325892205b9f3b6ed2d';
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  console.log(`========== 调试 Asset Type ==========\n`);
  
  const query = `
    query GetFungibleAssetDeposits($owner_address: String!, $since: timestamp!) {
      fungible_asset_activities(
        where: {
          owner_address: { _eq: $owner_address }
          type: { _like: "%Deposit%" }
          transaction_timestamp: { _gte: $since }
          is_transaction_success: { _eq: true }
        }
        order_by: { transaction_version: desc }
        limit: 5
      ) {
        transaction_version
        transaction_timestamp
        type
        amount
        asset_type
        storage_id
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
          owner_address: walletAddress,
          since: oneDayAgo
        }
      })
    });
    
    const result = await response.json();
    const activities = result.data?.fungible_asset_activities || [];
    
    console.log(`找到 ${activities.length} 个活动\n`);
    
    activities.forEach((activity: any, index: number) => {
      console.log(`活动 ${index + 1}:`);
      console.log(`  版本: ${activity.transaction_version}`);
      console.log(`  金额: ${parseFloat(activity.amount) / 1e6}`);
      console.log(`  Asset Type: ${activity.asset_type}`);
      console.log(`  包含USDT: ${activity.asset_type?.includes('USDT')}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('错误:', error);
  }
  
  process.exit(0);
}

debugAssetType();
