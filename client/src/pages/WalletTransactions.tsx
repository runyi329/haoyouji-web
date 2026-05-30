import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { trpc } from "../lib/trpc";

type TransactionType = "recharge" | "withdraw" | "reward" | "all";

// 从交易备注中提取世界杯球队 code（小写），如 [ES] → 'es'
// 支持格式：世界杯投注-西班牙[ES] / 订单作废-退回投注[ES]
function extractWcTeamCode(note: string): string | null {
  const isWcRelated = note.includes('世界杯投注') || note.includes('订单作废-退回投注');
  if (!isWcRelated) return null;
  // 新格式：提取 [XX] 中的 code
  const codeMatch = note.match(/\[([A-Z]{2,10})\]/);
  if (codeMatch) return codeMatch[1].toLowerCase();
  // 旧格式（无code）：通过球队名映射
  const nameToCode: Record<string, string> = {
    '西班牙': 'es', '法国': 'fr', '英格兰': 'gb-eng', '巴西': 'br', '阿根廷': 'ar',
    '葡萄牙': 'pt', '德国': 'de', '荷兰': 'nl', '挪威': 'no', '比利时': 'be',
    '哥伦比亚': 'co', '摩洛哥': 'ma', '日本': 'jp', '美国': 'us', '瑞士': 'ch',
    '乌拉圭': 'uy', '墨西哥': 'mx', '厄瓜多尔': 'ec', '克罗地亚': 'hr', '土耳其': 'tr',
    '塞内加尔': 'sn', '瑞典': 'se', '奥地利': 'at', '苏格兰': 'gb-sct', '加拿大': 'ca',
    '科特迪瓦': 'ci', '巴拉圭': 'py', '捷克': 'cz', '埃及': 'eg', '波黑': 'ba',
    '韩国': 'kr', '阿尔及利亚': 'dz', '加纳': 'gh', '澳大利亚': 'au', '突尼斯': 'tn',
    '伊朗': 'ir', '刚果民主共和国': 'cd', '南非': 'za', '沙特阿拉伯': 'sa', '巴拿马': 'pa',
    '卡塔尔': 'qa', '佛得角': 'cv', '新西兰': 'nz', '伊拉克': 'iq', '乌兹别克斯坦': 'uz',
    '库拉索': 'cw', '约旦': 'jo', '海地': 'ht',
  };
  for (const [name, code] of Object.entries(nameToCode)) {
    if (note.includes(name)) return code;
  }
  return null;
}

export default function WalletTransactions() {
  const [, setLocation] = useLocation();
  const [activeType, setActiveType] = useState<TransactionType>("all");

  // 三个接口：充值订单 + balance_history（含 withdraw/reward）+ AF 手动调账
  const rechargeQuery = trpc.recharge.getMyOrders.useQuery({ limit: 100 });
  const balanceHistoryQuery = trpc.recharge.getBalanceHistory.useQuery({ limit: 200 });
  const manualBalancesQuery = trpc.recharge.getMyManualBalances.useQuery({ limit: 200 });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    if (days === 1) return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const getBlockchainExplorerUrl = (network: string, txnHash: string) => {
    const baseUrls: Record<string, string> = {
      TRC20: 'https://tronscan.org/#/transaction/',
      ERC20: 'https://etherscan.io/tx/',
      BEP20: 'https://bscscan.com/tx/',
      APTOS: 'https://explorer.aptoslabs.com/txn/',
      SOLANA: 'https://solscan.io/tx/',
    };
    return baseUrls[network] ? baseUrls[network] + txnHash : null;
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'completed': return { icon: CheckCircle2, label: '已完成', color: 'text-green-300',  bgColor: 'bg-green-900/30',  borderColor: 'border-green-700/40' };
      case 'pending':   return { icon: Clock,        label: '待确认', color: 'text-amber-300',  bgColor: 'bg-amber-900/30',  borderColor: 'border-amber-700/40' };
      case 'expired':   return { icon: XCircle,      label: '已过期', color: 'text-gray-400',   bgColor: 'bg-gray-800/40',   borderColor: 'border-gray-600/40' };
      default:          return { icon: Clock,        label: '处理中', color: 'text-blue-300',   bgColor: 'bg-blue-900/30',   borderColor: 'border-blue-700/40' };
    }
  };

  const getAllTransactions = () => {
    const transactions: any[] = [];

    // 来源1：充值订单（recharge_orders 表）
    if (rechargeQuery.data) {
      (rechargeQuery.data as any[]).forEach((order: any) => {
        transactions.push({
          id: `recharge-${order.id}`, type: 'recharge',
          amount: order.amount, status: order.status,
          network: order.network, orderNo: order.orderNo,
          txnHash: order.txnHash, createdAt: order.createdAt,
          wcCode: null,
        });
      });
    }

    // 来源2：balance_history（提现 + 奖励 + 其他流水）
    if (balanceHistoryQuery.data) {
      (balanceHistoryQuery.data as any[]).forEach((history: any) => {
        const amt = Number(history.amount);
        const desc = history.description || '';
        const wcCode = extractWcTeamCode(desc);
        if (history.type === 'withdraw') {
          transactions.push({
            id: `bh-${history.id}`, type: 'withdraw',
            amount: Math.abs(amt), status: 'completed',
            description: desc, wcCode, createdAt: history.createdAt,
          });
        } else if (history.type === 'reward') {
          transactions.push({
            id: `bh-${history.id}`, type: 'reward',
            amount: Math.abs(amt), status: 'completed',
            description: desc, wcCode, createdAt: history.createdAt,
          });
        } else if (history.type === 'consume' || history.type === 'refund') {
          transactions.push({
            id: `bh-${history.id}`,
            type: amt < 0 ? 'deduct' : 'reward',
            amount: Math.abs(amt), status: 'completed',
            description: desc, wcCode, createdAt: history.createdAt,
          });
        }
      });
    }

    // 来源3：AF 手动调账（af_manual_balances 表，含所有账本的手动调账/奖励）
    if (manualBalancesQuery.data) {
      (manualBalancesQuery.data as any[]).forEach((m: any) => {
        const amt = Number(m.amount);
        if (amt === 0) return;
        const note = m.note || '';
        const wcCode = extractWcTeamCode(note);
        transactions.push({
          id: `manual-${m.id}`,
          type: amt > 0 ? 'reward' : 'deduct',
          amount: Math.abs(amt),
          status: 'completed',
          description: note,
          wcCode,
          createdAt: m.created_at || m.createdAt,
        });
      });
    }

    return transactions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  const filteredTransactions = (() => {
    const all = getAllTransactions();
    if (activeType === "all") return all;
    if (activeType === "reward") return all.filter(t => t.type === 'reward' || t.type === 'deduct');
    return all.filter(t => t.type === activeType);
  })();

  const isLoading = rechargeQuery.isLoading || balanceHistoryQuery.isLoading || manualBalancesQuery.isLoading;

  return (
    <div className="min-h-screen pb-20" style={{ background: 'linear-gradient(160deg,#111111 0%,#1a1a1a 100%)' }}>
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 border-b border-[#2a2a2a]" style={{ background: '#111111' }}>
        <div style={{ height: '2px', background: 'linear-gradient(90deg,transparent,#CBA471,#e8c98a,#CBA471,transparent)' }} />
        <div className="flex items-center px-4 py-3">
          <button onClick={() => setLocation("/wallet")} className="mr-3">
            <ArrowLeft className="w-6 h-6 text-[#CBA471]" />
          </button>
          <h1 className="text-lg font-semibold text-[#CBA471] tracking-widest">交易明细</h1>
        </div>
      </div>

      {/* 类型筛选 */}
      <div className="sticky top-[57px] z-10 border-b border-[#2a2a2a]" style={{ background: '#111111' }}>
        <div className="flex px-4">
          {(['all', 'recharge', 'withdraw', 'reward'] as TransactionType[]).map(type => {
            const labels: Record<TransactionType, string> = { all: '全部', recharge: '充値', withdraw: '提现', reward: '奖励' };
            return (
              <button
                key={type}
                onClick={() => setActiveType(type)}
                className="flex-1 py-3 text-center font-medium transition-colors text-sm"
                style={activeType === type
                  ? { color: '#CBA471', borderBottom: '2px solid #CBA471' }
                  : { color: '#666', borderBottom: '2px solid transparent' }
                }
              >
                {labels[type]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 交易列表 */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#CBA471]" />
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-20 text-gray-500">暂无交易记录</div>
        ) : (
          <div className="space-y-3">
            {filteredTransactions.map((transaction) => {
              const statusConfig = getStatusConfig(transaction.status);
              const StatusIcon = statusConfig.icon;
              const isRecharge = transaction.type === 'recharge';
              const isPositive = isRecharge || transaction.type === 'reward';
              const wcCode = transaction.wcCode as string | null;
              return (
                <div
                  key={transaction.id}
                  className="rounded-2xl p-4"
                  style={{ background: 'linear-gradient(135deg,#1e1e1e,#252525)', border: '1px solid #2a2a2a', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center">
                      {/* 图标区：世界杯交易显示国旗，其他显示箭头 */}
                      <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center mr-2 flex-shrink-0"
                        style={{ background: isPositive ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)' }}
                      >
                        {wcCode ? (
                          <img
                            src={`/flags/${wcCode}.png`}
                            alt={wcCode}
                            className="w-8 h-8 object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          isPositive
                            ? <ArrowDownCircle className="w-5 h-5 text-green-400" />
                            : <ArrowUpCircle className="w-5 h-5 text-red-400" />
                        )}
                      </div>
                      <div>
                        {/* 世界杯交易：不显示文字标题，只显示时间 */}
                        {!wcCode && (
                          <div className="font-medium text-white text-sm">
                            {isRecharge ? '充値' : transaction.type === 'withdraw' ? '提现' : transaction.type === 'reward' ? '奖励' : '扣费'}
                            {transaction.network && (
                              <span className="text-xs text-gray-500 ml-2">{transaction.network}</span>
                            )}
                          </div>
                        )}
                        <div className="text-xs text-gray-500 mt-0.5">{formatDate(transaction.createdAt)}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                        {isPositive ? '+' : '-'}{transaction.amount} USDT
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border mt-1 ${statusConfig.bgColor} ${statusConfig.color} ${statusConfig.borderColor}`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {statusConfig.label}
                      </span>
                    </div>
                  </div>

                  {transaction.orderNo && (
                    <div className="text-xs text-gray-600 mt-2 pt-2 border-t border-[#2a2a2a]">
                      订单号: {transaction.orderNo}
                    </div>
                  )}

                  {transaction.txnHash && transaction.network && (
                    <div className="text-xs mt-1">
                      <span className="text-gray-600">交易哈希: </span>
                      {getBlockchainExplorerUrl(transaction.network, transaction.txnHash) ? (
                        <a
                          href={getBlockchainExplorerUrl(transaction.network, transaction.txnHash)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#CBA471] hover:underline"
                        >
                          {transaction.txnHash.slice(0, 10)}...{transaction.txnHash.slice(-8)}
                        </a>
                      ) : (
                        <span className="text-gray-500">
                          {transaction.txnHash.slice(0, 10)}...{transaction.txnHash.slice(-8)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* 非世界杯交易才显示描述文字 */}
                  {!wcCode && transaction.description && (
                    <div className="text-xs text-gray-500 mt-1">{transaction.description}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
