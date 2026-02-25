import * as dbRecharge from "../db-recharge";

// Solana RPC配置
const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

// USDT SPL Token Mint Address
const USDT_MINT_ADDRESS = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

// 已处理的交易签名
const processedTxns = new Set<string>();

// 扫描统计
export let scanStats = {
  scannedAddresses: 0,
  foundTransactions: 0,
  matchedOrders: 0,
  unmatchedTransactions: 0,
};

/**
 * 扫描Solana网络的USDT交易
 */
export async function scanSolanaTransactions() {
  scanStats = {
    scannedAddresses: 0,
    foundTransactions: 0,
    matchedOrders: 0,
    unmatchedTransactions: 0,
  };

  try {
    // 获取所有启用的Solana地址
    const wallets = await dbRecharge.getEnabledWalletAddresses('SOLANA');
    
    if (wallets.length === 0) {
      console.log('[Solana Scanner] No enabled SOLANA wallet addresses found');
      return scanStats;
    }

    scanStats.scannedAddresses = wallets.length;

    // 扫描每个地址
    for (const wallet of wallets) {
      await scanWalletAddress(wallet.address, wallet.label || wallet.address);
    }

    console.log(`[Solana Scanner] Scan completed for ${wallets.length} wallet(s)`);
    return scanStats;
    
  } catch (error) {
    console.error('[Solana Scanner] Scan error:', error);
    throw error;
  }
}

/**
 * 获取钱包地址的USDT Token Account
 */
async function getTokenAccount(walletAddress: string): Promise<string | null> {
  try {
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
      console.error(`[Solana Scanner] Error getting token account:`, data.error);
      return null;
    }

    const accounts = data.result?.value || [];
    
    if (accounts.length === 0) {
      console.log(`[Solana Scanner] No USDT token account found for ${walletAddress.slice(0, 10)}...`);
      return null;
    }

    // 返回第一个Token Account的地址
    return accounts[0].pubkey;
    
  } catch (error) {
    console.error(`[Solana Scanner] Error getting token account:`, error);
    return null;
  }
}

/**
 * 扫描单个Solana钱包地址
 */
async function scanWalletAddress(walletAddress: string, label: string) {
  try {
    console.log(`[Solana Scanner] Scanning ${label} (${walletAddress.slice(0, 10)}...)...`);
    
    // 获取该钱包的USDT Token Account
    const tokenAccount = await getTokenAccount(walletAddress);
    
    if (!tokenAccount) {
      console.log(`[Solana Scanner] Skipping ${label} - no token account`);
      return;
    }

    console.log(`[Solana Scanner] Token Account: ${tokenAccount.slice(0, 10)}...`);
    
    // 获取Token Account的签名记录
    const signaturesResponse = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [
          tokenAccount,
          { limit: 20 }
        ]
      })
    });

    const signaturesData = await signaturesResponse.json();
    
    if (signaturesData.error) {
      console.error(`[Solana Scanner] API error:`, signaturesData.error);
      return;
    }

    const signatures = signaturesData.result || [];
    console.log(`[Solana Scanner] Found ${signatures.length} transactions for ${label}`);

    // 获取每个交易的详情
    for (const sig of signatures) {
      if (sig.err === null) { // 只处理成功的交易
        await processTransaction(sig.signature, tokenAccount, walletAddress);
      }
    }

  } catch (error) {
    console.error(`[Solana Scanner] Error scanning ${label}:`, error);
  }
}

/**
 * 处理单笔Solana交易
 */
async function processTransaction(signature: string, tokenAccount: string, walletAddress: string) {
  try {
    // 跳过已处理的交易
    if (processedTxns.has(signature)) {
      return;
    }

    // 获取交易详情
    const txResponse = await fetch(SOLANA_RPC_URL, {
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

    const txData = await txResponse.json();
    
    if (txData.error || !txData.result) {
      return;
    }

    const tx = txData.result;
    const instructions = tx.transaction?.message?.instructions || [];

    // 查找SPL Token转账指令
    for (const instruction of instructions) {
      // 修复：正确的逻辑运算符优先级
      if (instruction.program === 'spl-token' && 
          (instruction.parsed?.type === 'transfer' || 
           instruction.parsed?.type === 'transferChecked')) {
        
        const info = instruction.parsed.info;
        
        // 检查是否是转入到我们的Token Account
        if (info.destination && info.destination === tokenAccount) {
          // 解析金额
          let amount = 0;
          if (info.tokenAmount?.uiAmount) {
            amount = parseFloat(info.tokenAmount.uiAmount);
          } else if (info.amount && info.decimals !== undefined) {
            amount = parseFloat(info.amount) / Math.pow(10, info.decimals);
          } else if (info.amount) {
            amount = parseFloat(info.amount) / 1e6; // USDT默认6位小数
          }
          
          if (amount > 0) {
            scanStats.foundTransactions++;
            console.log(`[Solana Scanner] ✅ Detected transfer: ${amount} USDT to ${walletAddress.slice(0, 10)}... (tx: ${signature.slice(0, 10)}...)`);
            
            // 匹配订单
            const matchResult = await dbRecharge.findOrderByAmount(amount, signature);
            
            if (matchResult) {
              scanStats.matchedOrders++;
              processedTxns.add(signature);
              console.log(`[Solana Scanner] ✅ Matched order ${matchResult.orderNo}`);
            } else {
              scanStats.unmatchedTransactions++;
              console.log(`[Solana Scanner] ⚠️  No matching order found for ${amount} USDT`);
            }
          }
        }
      }
    }

  } catch (error) {
    console.error('[Solana Scanner] Error processing transaction:', error);
  }
}
