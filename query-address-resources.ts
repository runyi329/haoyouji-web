async function queryAddressResources() {
  const address = '0x46f7f36fe362c05fd326b9689a63461adb0548a857033325892205b9f3b6ed2d';
  const APTOS_API_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
  
  console.log(`========== 查询地址资源 ==========`);
  console.log(`地址: ${address}\n`);
  
  try {
    // 1. 查询所有资源
    console.log('1. 查询所有资源...');
    const response = await fetch(`${APTOS_API_URL}/accounts/${address}/resources`);
    
    if (!response.ok) {
      console.error(`❌ API请求失败: ${response.status}`);
      const text = await response.text();
      console.error(`响应: ${text}`);
      return;
    }
    
    const resources = await response.json();
    console.log(`   找到 ${resources.length} 个资源\n`);
    
    // 2. 查找 USDT 相关资源
    console.log('2. 查找 USDT 相关资源...');
    const usdtResources = resources.filter((r: any) => 
      r.type.includes('USDt') || 
      r.type.includes('USDT') ||
      r.type.includes('usdt') ||
      r.type.includes('0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa')
    );
    
    if (usdtResources.length > 0) {
      console.log(`   ✅ 找到 ${usdtResources.length} 个 USDT 资源:\n`);
      usdtResources.forEach((r: any, i: number) => {
        console.log(`   资源 ${i + 1}:`);
        console.log(`     类型: ${r.type}`);
        console.log(`     数据:`, JSON.stringify(r.data, null, 2));
        console.log('');
      });
    } else {
      console.log('   ❌ 没有找到 USDT 资源');
    }
    
    // 3. 列出所有资源类型
    console.log('\n3. 所有资源类型:');
    resources.forEach((r: any, i: number) => {
      console.log(`   ${i + 1}. ${r.type}`);
    });
    
    // 4. 查找 FungibleStore 资源
    console.log('\n4. 查找 FungibleStore 资源...');
    const fungibleStores = resources.filter((r: any) => 
      r.type.includes('FungibleStore') || 
      r.type.includes('fungible_asset')
    );
    
    if (fungibleStores.length > 0) {
      console.log(`   ✅ 找到 ${fungibleStores.length} 个 FungibleStore:\n`);
      fungibleStores.forEach((r: any, i: number) => {
        console.log(`   Store ${i + 1}:`);
        console.log(`     类型: ${r.type}`);
        console.log(`     数据:`, JSON.stringify(r.data, null, 2));
        console.log('');
      });
    } else {
      console.log('   ❌ 没有找到 FungibleStore');
    }
    
  } catch (error) {
    console.error('❌ 查询失败:', error);
  }
  
  console.log('\n========== 查询完成 ==========');
  process.exit(0);
}

queryAddressResources().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
