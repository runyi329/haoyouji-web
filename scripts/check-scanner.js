#!/usr/bin/env node

/**
 * 区块链扫描器诊断脚本
 * 检查扫描器运行所需的配置和环境
 */

import 'dotenv/config';
import { getDb } from '../server/db.js';
import { walletAddresses } from '../drizzle/schema.js';
import { eq } from 'drizzle-orm';

async function checkScanner() {
  console.log('🔍 开始检查区块链扫描器配置...\n');

  // 1. 检查环境变量
  console.log('📋 环境变量检查:');
  const apiKey = process.env.TRONGRID_API_KEY;
  if (apiKey) {
    console.log(`  ✅ TRONGRID_API_KEY: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);
  } else {
    console.log('  ⚠️  TRONGRID_API_KEY: 未配置（API调用可能受限）');
  }
  console.log('');

  // 2. 检查数据库中的收款地址
  console.log('💳 收款地址检查:');
  try {
    const db = await getDb();
    
    // 所有地址
    const allAddresses = await db.select().from(walletAddresses);
    console.log(`  总地址数: ${allAddresses.length}`);
    
    // 启用的地址
    const enabledAddresses = await db
      .select()
      .from(walletAddresses)
      .where(eq(walletAddresses.enabled, 1));
    
    console.log(`  已启用: ${enabledAddresses.length}`);
    console.log(`  已禁用: ${allAddresses.length - enabledAddresses.length}`);
    console.log('');
    
    if (enabledAddresses.length === 0) {
      console.log('  ❌ 错误: 没有启用的收款地址！');
      console.log('  💡 解决方案: 在管理后台添加并启用至少一个收款地址');
      console.log('');
    } else {
      console.log('  启用的地址列表:');
      enabledAddresses.forEach((addr, index) => {
        console.log(`  ${index + 1}. [${addr.network}] ${addr.address}`);
        if (addr.label) {
          console.log(`     标签: ${addr.label}`);
        }
      });
      console.log('');
    }
    
    // 3. 测试 TronGrid API
    console.log('🌐 TronGrid API 测试:');
    if (enabledAddresses.length > 0) {
      const testAddress = enabledAddresses[0].address;
      console.log(`  测试地址: ${testAddress}`);
      
      try {
        const response = await fetch(
          `https://api.trongrid.io/v1/accounts/${testAddress}/transactions/trc20?limit=1&only_to=true&contract_address=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`,
          {
            headers: apiKey ? { 'TRON-PRO-API-KEY': apiKey } : {}
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          console.log(`  ✅ API 调用成功`);
          console.log(`  最近交易数: ${data.data?.length || 0}`);
          
          if (data.data && data.data.length > 0) {
            const latestTx = data.data[0];
            const amount = parseFloat(latestTx.value) / 1e6;
            const date = new Date(latestTx.block_timestamp);
            console.log(`  最新交易: ${amount} USDT (${date.toLocaleString('zh-CN')})`);
          }
        } else {
          console.log(`  ⚠️  API 返回错误: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        console.log(`  ❌ API 调用失败: ${error.message}`);
      }
    }
    console.log('');
    
    // 4. 扫描器状态总结
    console.log('📊 扫描器状态总结:');
    const canRun = enabledAddresses.length > 0;
    if (canRun) {
      console.log('  ✅ 扫描器可以正常运行');
      console.log(`  🔄 将扫描 ${enabledAddresses.length} 个收款地址`);
      console.log('  ⏱️  扫描间隔: 60 秒');
    } else {
      console.log('  ❌ 扫描器无法运行');
      console.log('  原因: 没有启用的收款地址');
    }
    
  } catch (error) {
    console.error('❌ 检查失败:', error);
    process.exit(1);
  }
  
  console.log('\n✅ 检查完成！');
}

checkScanner().catch(console.error);
