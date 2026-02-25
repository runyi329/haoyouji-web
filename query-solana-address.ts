// 查询 SOLANA 地址的交易记录
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
const USDT_MINT_ADDRESS = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

// 从诊断页面看到的地址（部分）
const WALLET_ADDRESS = '2XUAwfrXpMaZHadCRQYqRy9xvJYKT3XP4uSKvvCUKo3z'; // 请替换为完整地址

async function getTokenAccount(walletAddress: string) {
  console.log(`\n========== 查询钱包地址的 Token Account ==========`);
  console.log(`钱包地址: ${walletAddress}`);
  
  const response = await fetch(SOLANA_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenAccountsByOwner',
      params: [
        walletAddress,
        {
          mint: USDT_MINT_ADDRESS
        },
        {
          encoding: 'jsonParsed'
        }
      ]
    })
  });

  const data = await response.json();
  
  if (data.error) {
    console.error(`错误:`, data.error);
    return null;
  }

  const accounts = data.result?.value || [];
  
  if (accounts.length === 0) {
    console.log(`❌ 没有找到 USDT Token Account`);
    return null;
  }

  console.log(`✅ 找到 ${accounts.length} 个 Token Account`);
  const tokenAccount = accounts[0].pubkey;
  console.log(`Token Account: ${tokenAccount}`);
  
  return tokenAccount;
}

async function getRecentTransactions(tokenAccount: string) {
  console.log(`\n========== 查询最近的交易 ==========`);
  
  const response = await fetch(SOLANA_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params: [
        tokenAccount,
        { limit: 10 }
      ]
    })
  });

  const data = await response.json();
  
  if (data.error) {
    console.error(`错误:`, data.error);
    return;
  }

  const signatures = data.result || [];
  console.log(`找到 ${signatures.length} 笔交易\n`);
  
  for (let i = 0; i < signatures.length; i++) {
    const sig = signatures[i];
    console.log(`\n交易 ${i + 1}:`);
    console.log(`  签名: ${sig.signature}`);
    console.log(`  时间: ${new Date(sig.blockTime * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    console.log(`  状态: ${sig.err ? '失败' : '成功'}`);
    
    if (sig.err === null) {
      await getTransactionDetails(sig.signature, tokenAccount);
    }
  }
}

async function getTransactionDetails(signature: string, tokenAccount: string) {
  const response = await fetch(SOLANA_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTransaction',
      params: [
        signature,
        { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }
      ]
    })
  });

  const data = await response.json();
  
  if (data.error || !data.result) {
    return;
  }

  const tx = data.result;
  const instructions = tx.transaction?.message?.instructions || [];

  for (const instruction of instructions) {
    if (instruction.program === 'spl-token' && 
        (instruction.parsed?.type === 'transfer' || 
         instruction.parsed?.type === 'transferChecked')) {
      
      const info = instruction.parsed.info;
      
      if (info.destination && info.destination === tokenAccount) {
        let amount = 0;
        if (info.tokenAmount?.uiAmount) {
          amount = parseFloat(info.tokenAmount.uiAmount);
        } else if (info.amount && info.decimals !== undefined) {
          amount = parseFloat(info.amount) / Math.pow(10, info.decimals);
        } else if (info.amount) {
          amount = parseFloat(info.amount) / 1e6;
        }
        
        console.log(`  ✅ 转入金额: ${amount} USDT`);
        console.log(`  发送方: ${info.source}`);
        console.log(`  接收方: ${info.destination}`);
      }
    }
  }
}

async function main() {
  try {
    const tokenAccount = await getTokenAccount(WALLET_ADDRESS);
    if (tokenAccount) {
      await getRecentTransactions(tokenAccount);
    }
  } catch (error) {
    console.error('查询失败:', error);
  }
}

main();
