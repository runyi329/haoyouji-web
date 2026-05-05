import { useLocation, useSearch } from "wouter";
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, Clock, ArrowDownCircle } from "lucide-react";
import { trpc } from "../lib/trpc";

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
                  const isManual = item.sourceType === 'manual';
                  const label = isRecharge ? (item.note || '充值') : (isManual ? '手动调账' : '系统结算');
                  return (
                    <div key={item.id} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>{amtDisplay}</span>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusStyle.bg} ${statusStyle.text} ${statusStyle.border}`}>
                          {label}
                        </span>
                      </div>
                      {isManual && item.note && (
                        <div className="text-xs text-gray-400 mb-1">{item.note}</div>
                      )}
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span></span>
                        <span>{formatDate(item.createdAt)}</span>
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
