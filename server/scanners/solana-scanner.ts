import * as dbRecharge from "../db-recharge";
import type { RechargeScanTarget } from "../db-recharge";

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
 * 扫描处于支付窗口内订单绑定的Solana地址。
 */
export async function scanSolanaTransactions(targets?: RechargeScanTarget[]) {
  scanStats = {
    scannedAddresses: 0,
    foundTransactions: 0,
    matchedOrders: 0,
    unmatchedTransactions: 0,
  };

  try {
    const wallets = targets ?? (await dbRecharge.getActiveRechargeScanTargets())
      .filter((target) => target.network === 'SOLANA');
    
    if (wallets.length === 0) {
      console.log('[Solana Scanner] No active SOLANA recharge orders to scan');
      return scanStats;
    }

    scanStats.scannedAddresses = wallets.length;

    // 扫描每个地址
    for (const wallet of wallets) {
      await scanWalletAddress(wallet.walletAddress, wallet.label || wallet.walletAddress);
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
    // 部分交易所会直接展示 USDT Token Account，而不是其所有者主地址。
    // 若配置地址本身就是官方 USDT 的代币账户，直接扫描它即可。
    const directAccountResponse = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [walletAddress, { encoding: 'jsonParsed' }],
      }),
    });
    const directAccountData = await directAccountResponse.json();
    const directMint = String(directAccountData.result?.value?.data?.parsed?.info?.mint || '');
    if (directMint === USDT_MINT_ADDRESS) {
      return walletAddress;
    }

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
          // 只查询已完成最终确认的签名，避免确认中交易回滚后提前入账。
          { limit: 20, commitment: 'finalized' }
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
      if (sig.err === null && sig.confirmationStatus === 'finalized') { // 只处理最终确认的成功交易
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
          { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'finalized' }
        ]
      })
    });

    const txData = await txResponse.json();
    
    if (txData.error || !txData.result) {
      return;
    }

    const tx = txData.result;
    // Solana 的 blockTime 是秒级 Unix 时间戳，转换为毫秒
    const blockTimestamp = tx.blockTime ? tx.blockTime * 1000 : undefined;
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
            
            // 匹配订单（传入signature + blockTimestamp双重防重复）
            const matchResult = await dbRecharge.findOrderByAmount(amount, signature, blockTimestamp, {
              network: 'SOLANA',
              walletAddress,
            });
            
            if (matchResult) {
              const completed = await dbRecharge.completeRechargeOrder(
                matchResult.order.id,
                signature,
                amount,
                matchResult.matchType,
              );
              if (completed) {
                scanStats.matchedOrders++;
                processedTxns.add(signature);
                console.log(`[Solana Scanner] ✅ Order ${matchResult.order.orderNo} completed`);
              }
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
