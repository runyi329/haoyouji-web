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
 * 扫描单个Solana钱包地址
 */
async function scanWalletAddress(walletAddress: string, label: string) {
  try {
    console.log(`[Solana Scanner] Scanning ${label} (${walletAddress.slice(0, 10)}...)...`);
    
    // 获取账户的签名记录
    const signaturesResponse = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [
          walletAddress,
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

    // 获取每个交易的详情
    for (const sig of signatures) {
      if (sig.err === null) { // 只处理成功的交易
        await processTransaction(sig.signature, walletAddress);
      }
    }

  } catch (error) {
    console.error(`[Solana Scanner] Error scanning ${label}:`, error);
  }
}

/**
 * 处理单笔Solana交易
 */
async function processTransaction(signature: string, walletAddress: string) {
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
      if (instruction.program === 'spl-token' && 
          instruction.parsed?.type === 'transfer' ||
          instruction.parsed?.type === 'transferChecked') {
        
        const info = instruction.parsed.info;
        
        // 检查是否是USDT转账到我们的地址
        if (info.destination && info.destination === walletAddress) {
          const amount = parseFloat(info.tokenAmount?.uiAmount || info.amount) / (info.decimals ? Math.pow(10, info.decimals) : 1e6);
          
          if (amount > 0) {
            scanStats.foundTransactions++;
            console.log(`[Solana Scanner] Detected transfer: ${amount} USDT to ${walletAddress.slice(0, 10)}... (tx: ${signature})`);
            
            // 匹配订单
            const matchResult = await dbRecharge.findOrderByAmount(amount, signature);
            
            if (matchResult) {
              scanStats.matchedOrders++;
              processedTxns.add(signature);
              console.log(`[Solana Scanner] ✅ Matched order ${matchResult.orderNo}`);
            } else {
              scanStats.unmatchedTransactions++;
            }
          }
        }
      }
    }

  } catch (error) {
    console.error('[Solana Scanner] Error processing transaction:', error);
  }
}
