import { useLocation, useSearch } from "wouter";
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, Clock, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { trpc } from "../lib/trpc";
import { PageTag } from "@/components/PageTag";

// 从备注中提取世界杯球队 code，与 P202 保持一致
function extractWcTeamCode(note: string): string | null {
  const isWcRelated = note.includes('世界杯投注') || note.includes('订单作废-退回投注');
  if (!isWcRelated) return null;
  const codeMatch = note.match(/\[([A-Z]{2,10})\]/);
  if (codeMatch) return codeMatch[1].toLowerCase();
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

export default function RechargeHistory() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const fromLedgerId = searchParams.get('ledgerId');
  const ledgerId = fromLedgerId ? parseInt(fromLedgerId) : null;
  const viewAsUserId = searchParams.get('viewAs') ? parseInt(searchParams.get('viewAs')!) : undefined;
  const viewAsParam = viewAsUserId ? `&viewAs=${viewAsUserId}` : '';
  const backToRecharge = fromLedgerId
    ? `/recharge?from=ledger&ledgerId=${fromLedgerId}${viewAsParam}`
    : '/recharge';

  const afHistoryQuery = trpc.ledger.afGetMyRechargeHistory.useQuery(
    { ledgerId: ledgerId!, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: !!ledgerId }
  );
  const normalOrdersQuery = trpc.recharge.getMyOrders.useQuery(
    { limit: 50 },
    { enabled: !ledgerId }
  );
  const balanceQuery = trpc.recharge.getBalance.useQuery(
    ledgerId && viewAsUserId
      ? { viewAsUserId, ledgerId }
      : ledgerId
      ? { ledgerId }
      : undefined
  );
  const displayBalance = balanceQuery.data;

  const formatDate = (dateStr: string | Date) => {
    const date = new Date(dateStr);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  };

  const statusConfig: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: any }> = {
    pending:   { label: '待支付',  color: 'text-amber-300',  bgColor: 'bg-amber-900/30',  borderColor: 'border-amber-700/40',  icon: Clock },
    submitted: { label: '确认中',  color: 'text-blue-300',   bgColor: 'bg-blue-900/30',   borderColor: 'border-blue-700/40',   icon: Clock },
    completed: { label: '充值成功', color: 'text-green-300',  bgColor: 'bg-green-900/30',  borderColor: 'border-green-700/40',  icon: CheckCircle2 },
    expired:   { label: '已过期',  color: 'text-gray-400',   bgColor: 'bg-gray-800/40',   borderColor: 'border-gray-600/40',   icon: XCircle },
    cancelled: { label: '已取消',  color: 'text-red-400',    bgColor: 'bg-red-900/30',    borderColor: 'border-red-700/40',    icon: XCircle },
  };

  const isAFMode = !!ledgerId;
  const isLoading = isAFMode ? afHistoryQuery.isLoading : normalOrdersQuery.isLoading;
  const afData = afHistoryQuery.data || [];
  const normalData = normalOrdersQuery.data || [];

  return (
    <div className="min-h-screen pb-20" style={{background:'linear-gradient(160deg,#111111 0%,#1a1a1a 100%)'}}>
      <PageTag code="P181" />
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 border-b border-[#2a2a2a]" style={{background:'#111111'}}>
        <div style={{height:'2px',background:'linear-gradient(90deg,transparent,#CBA471,#e8c98a,#CBA471,transparent)'}} />
        <div className="flex items-center px-4 py-3">
          <button onClick={() => setLocation(backToRecharge)} className="mr-3">
            <ArrowLeft className="w-6 h-6 text-[#CBA471]" />
          </button>
          <h1 className="text-lg font-semibold text-[#CBA471] tracking-widest">充值记录</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 余额卡 */}
        <div className="rounded-2xl p-5 relative overflow-hidden" style={{background:'linear-gradient(135deg,#1a1a1a 0%,#222222 50%,#1a1a1a 100%)',border:'1px solid #2a2a2a',boxShadow:'0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(203,164,113,0.15)'}}>
          <div style={{position:'absolute',top:0,left:0,right:0,height:'2px',background:'linear-gradient(90deg,transparent,#CBA471,#e8c98a,#CBA471,transparent)'}} />
          <div className="flex items-center mb-1">
            <ArrowDownCircle className="w-4 h-4 text-[#CBA471] mr-2" />
            <span className="text-sm text-gray-400">当前余额</span>
          </div>
          <div className="text-3xl font-bold text-[#CBA471]" style={{textShadow:'0 0 20px rgba(203,164,113,0.4)'}}>
            {displayBalance != null ? parseFloat(String(displayBalance)).toFixed(2) : '0.00'}
            <span className="text-base font-normal text-gray-400 ml-2">USDT</span>
          </div>
        </div>

        {/* AF 模式：合并记录列表 */}
        {isAFMode && (
          <div className="rounded-2xl overflow-hidden" style={{background:'linear-gradient(135deg,#1e1e1e,#252525)',border:'1px solid #2a2a2a',boxShadow:'0 4px 20px rgba(0,0,0,0.4)'}}>
            <div className="px-4 py-3 border-b border-[#2a2a2a]">
              <h2 className="font-semibold text-[#CBA471]">充值明细</h2>
              <p className="text-xs text-gray-500 mt-0.5">包含充值到账及系统结算</p>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-gray-500 text-sm">加载中...</div>
            ) : afData.length === 0 ? (
              <div className="p-8 text-center">
                <AlertCircle className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">暂无充值记录</p>
                <button
                  onClick={() => setLocation(backToRecharge)}
                  className="mt-4 px-6 py-2 rounded-lg text-sm font-medium text-black"
                  style={{background:'linear-gradient(135deg,#CBA471,#e8c98a)'}}
                >
                  去充值
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#2a2a2a]">
                {(afData as any[]).map((item: any) => {
                  const isRecharge = item.sourceType === 'recharge';
                  const amt = parseFloat(String(item.amount));
                  const isPositive = amt >= 0;
                  const amtDisplay = `${isPositive ? '+' : ''}${amt.toFixed(2)} USDT`;
                  const isManual = item.sourceType === 'manual';
                  const isBh = item.sourceType === 'balance_history';
                  // 提取世界杯国旗 code
                  const noteText = item.note || item.description || '';
                  const wcCode = extractWcTeamCode(noteText);
                  const bhTypeLabel: Record<string, string> = {
                    consume: '消费', refund: '退款', reward: '奖励', withdraw: '提现',
                    reward_clawback: '奖励回收',
                  };
                  const label = isRecharge
                    ? (item.note || '充值')
                    : isManual
                    ? '手动调账'
                    : isBh
                    ? (bhTypeLabel[item.type] || item.type || '流水')
                    : '系统结算';
                  const statusStyleMap: Record<string, { bg: string; text: string; border: string }> = {
                    completed: { bg: 'bg-green-900/30',  text: 'text-green-300',  border: 'border-green-700/40' },
                    submitted: { bg: 'bg-blue-900/30',   text: 'text-blue-300',   border: 'border-blue-700/40' },
                    pending:   { bg: 'bg-amber-900/30',  text: 'text-amber-300',  border: 'border-amber-700/40' },
                    expired:   { bg: 'bg-gray-800/40',   text: 'text-gray-400',   border: 'border-gray-600/40' },
                    cancelled: { bg: 'bg-red-900/30',    text: 'text-red-400',    border: 'border-red-700/40' },
                  };
                  const statusStyle = isRecharge
                    ? (statusStyleMap[item.status] || { bg: 'bg-gray-800/40', text: 'text-gray-400', border: 'border-gray-600/40' })
                    : { bg: 'bg-blue-900/30', text: 'text-blue-300', border: 'border-blue-700/40' };
                  return (
                    <div key={item.id} className="px-4 py-3">
                      <div className="flex items-start justify-between mb-1.5">
                        <div className="flex items-center">
                          {/* 图标区：世界杯交易显示国旗，其他显示箭头 */}
                          <div
                            className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center mr-2 flex-shrink-0"
                            style={{ background: isPositive ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)' }}
                          >
                            {wcCode ? (
                              <img
                                src={`/flags/${wcCode}.png`}
                                alt={wcCode}
                                className="w-8 h-8 object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : (
                              isPositive
                                ? <ArrowDownCircle className="w-5 h-5 text-green-400" />
                                : <ArrowUpCircle className="w-5 h-5 text-red-400" />
                            )}
                          </div>
                          <div>
                            {/* 世界杯交易：不显示文字标签 */}
                            {!wcCode && (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                                {label}
                              </span>
                            )}
                            <div className="text-xs text-gray-500 mt-0.5">{formatDate(item.createdAt)}</div>
                          </div>
                        </div>
                        <span className={`font-semibold text-base ${isPositive ? 'text-green-400' : 'text-red-400'}`}>{amtDisplay}</span>
                      </div>
                      {/* 非世界杯才显示备注文字 */}
                      {!wcCode && (isManual || isBh) && noteText && (
                        <div className="text-xs text-gray-400 mb-1 ml-10">{noteText}</div>
                      )}
                      <div className="flex items-center justify-between text-xs text-gray-600 ml-10">
                        <span>{item.balanceAfter != null ? `余额 ${parseFloat(String(item.balanceAfter)).toFixed(2)}` : ''}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 普通模式：充值订单列表 */}
        {!isAFMode && (
          <div className="rounded-2xl overflow-hidden" style={{background:'linear-gradient(135deg,#1e1e1e,#252525)',border:'1px solid #2a2a2a',boxShadow:'0 4px 20px rgba(0,0,0,0.4)'}}>
            <div className="px-4 py-3 border-b border-[#2a2a2a]">
              <h2 className="font-semibold text-[#CBA471]">充值订单</h2>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-gray-500 text-sm">加载中...</div>
            ) : normalData.length === 0 ? (
              <div className="p-8 text-center">
                <AlertCircle className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">暂无充值记录</p>
                <button
                  onClick={() => setLocation(backToRecharge)}
                  className="mt-4 px-6 py-2 rounded-lg text-sm font-medium text-black"
                  style={{background:'linear-gradient(135deg,#CBA471,#e8c98a)'}}
                >
                  去充值
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[#2a2a2a]">
                {(normalData as any[]).map((order: any) => {
                  const config = statusConfig[order.status] || statusConfig.pending;
                  const StatusIcon = config.icon;
                  return (
                    <div key={order.id} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center">
                          <span className="font-semibold text-white">{order.amount} USDT</span>
                          <span className="text-xs text-gray-500 ml-2">{order.network}</span>
                        </div>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bgColor} ${config.color} ${config.borderColor}`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {config.label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span>订单号: {order.orderNo}</span>
                        <span>{formatDate(order.createdAt)}</span>
                      </div>
                      {order.txnHash && (
                        <div className="text-xs text-gray-600 mt-1 truncate">
                          交易哈希: {order.txnHash}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
