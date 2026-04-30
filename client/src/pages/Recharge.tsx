import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, Copy, Check, Clock, AlertCircle, CheckCircle2, History, ChevronDown, ChevronUp } from "lucide-react";
import { trpc } from "../lib/trpc";
import QRCode from "qrcode";

interface RechargeProps {
  hideHeader?: boolean;
  hideBalance?: boolean;
}

export default function Recharge({ hideHeader = false, hideBalance = false }: RechargeProps = {}) {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const fromLedger = searchParams.get('from') === 'ledger';
  const fromLedgerId = searchParams.get('ledgerId');
  const viewAsUserId = searchParams.get('viewAs');
  const handleBack = () => {
    if (fromLedger && fromLedgerId) {
      setLocation(`/ledger/${fromLedgerId}${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`);
    } else {
      window.history.back();
    }
  };
  const [amount, setAmount] = useState<string>("");
  const [network, setNetwork] = useState<"TRC20" | "ERC20" | "BEP20" | "APTOS" | "SOLANA">("TRC20");
  const [order, setOrder] = useState<any>(null);
  const [qrCode, setQrCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showLedgerHistory, setShowLedgerHistory] = useState(false);

  const { data: ledgerHistoryData, isLoading: ledgerHistoryLoading } = trpc.ledger.afGetMyRechargeHistory.useQuery(
    { ledgerId: Number(fromLedgerId), ...(viewAsUserId ? { viewAsUserId: Number(viewAsUserId) } : {}) },
    { enabled: !!fromLedgerId && showLedgerHistory, staleTime: 30000 }
  );
  const ledgerHistoryList: any[] = (ledgerHistoryData as any[]) || [];

  const createOrderMutation = trpc.recharge.createOrder.useMutation();
  const submitTransferMutation = trpc.recharge.submitTransfer.useMutation();
  const balanceQuery = trpc.recharge.getBalance.useQuery(
    fromLedgerId
      ? { ledgerId: Number(fromLedgerId), ...(viewAsUserId ? { viewAsUserId: Number(viewAsUserId) } : {}) }
      : (viewAsUserId ? { viewAsUserId: Number(viewAsUserId) } : undefined)
  );
  const displayBalance = balanceQuery.data;

  const handleCreateOrder = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 1) {
      alert("请输入有效的充值金额");
      return;
    }
    try {
      const result = await createOrderMutation.mutateAsync({
        amount: numAmount,
        network,
        ...(fromLedgerId ? { ledgerId: Number(fromLedgerId) } : {}),
        ...(viewAsUserId ? { viewAsUserId: Number(viewAsUserId) } : {}),
      });
      setOrder(result);
      if (result.walletAddress) {
        const qr = await QRCode.toDataURL(result.walletAddress);
        setQrCode(qr);
      }
      const expiresAt = new Date(result.expiresAt).getTime();
      const now = Date.now();
      setTimeLeft(Math.floor((expiresAt - now) / 1000));
    } catch (error: any) {
      alert(error.message || "创建订单失败");
    }
  };

  const handleSubmitTransfer = async () => {
    if (!order?.orderNo) return;
    setSubmitting(true);
    try {
      await submitTransferMutation.mutateAsync({ orderNo: order.orderNo });
      setSubmitted(true);
    } catch (error: any) {
      alert(error.message || "提交失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 黑金通用样式
  const darkBg = "min-h-screen pb-20" ;
  const darkNavBar = "sticky top-0 z-10 border-b border-[#2a2a2a]";
  const goldText = "text-[#CBA471]";
  const goldBorder = "border-[#CBA471]";

  // ========== 已提交确认页面 ==========
  if (submitted && order) {
    return (
      <div className={darkBg} style={{background:'linear-gradient(160deg,#111111 0%,#1a1a1a 100%)'}}>
        <div className={darkNavBar} style={{background:'#111111'}}>
          <div className="flex items-center px-4 py-3">
            <button onClick={() => setLocation(fromLedgerId ? `/recharge/history?ledgerId=${fromLedgerId}${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}` : '/recharge/history')} className="mr-3">
              <ArrowLeft className="w-6 h-6 text-[#CBA471]" />
            </button>
            <h1 className="text-lg font-semibold text-[#CBA471] tracking-widest">提交成功</h1>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* 成功图标 */}
          <div className="rounded-2xl p-6 text-center" style={{background:'linear-gradient(135deg,#1e1e1e,#252525)',border:'1px solid #2a2a2a',boxShadow:'0 8px 32px rgba(0,0,0,0.5)'}}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{background:'linear-gradient(135deg,#1a3a1a,#2d5a2d)'}}>
              <CheckCircle2 className="w-9 h-9 text-green-400" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">转账确认已提交</h2>
            <p className="text-sm text-gray-400">系统正在扫描链上交易，确认到账后将自动入账</p>
          </div>

          {/* 订单信息 */}
          <div className="rounded-2xl p-4 space-y-3" style={{background:'linear-gradient(135deg,#1e1e1e,#252525)',border:'1px solid #2a2a2a',boxShadow:'0 4px 20px rgba(0,0,0,0.4)'}}>
            <div className="flex justify-between items-center py-2 border-b border-[#2a2a2a]">
              <span className="text-gray-400 text-sm">订单号</span>
              <span className="font-mono text-sm text-white">{order.orderNo}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#2a2a2a]">
              <span className="text-gray-400 text-sm">充值金额</span>
              <span className="font-bold text-[#CBA471]">{order.amount} USDT</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#2a2a2a]">
              <span className="text-gray-400 text-sm">网络</span>
              <span className="text-white">{order.network}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-400 text-sm">状态</span>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-900/40 text-blue-300 border border-blue-700/50">
                <Clock className="w-3 h-3 mr-1" />确认中
              </span>
            </div>
          </div>

          {/* 提示 */}
          <div className="rounded-2xl p-4" style={{background:'rgba(203,164,113,0.08)',border:'1px solid rgba(203,164,113,0.2)'}}>
            <div className="text-sm font-medium text-[#CBA471] mb-2">温馨提示</div>
            <ul className="text-xs text-gray-400 space-y-1.5">
              <li>• 通常1-3分钟内即可确认到账</li>
              <li>• 您可以在充值记录中查看订单状态</li>
              <li>• 如超过30分钟未到账，请联系客服处理</li>
            </ul>
          </div>

          {/* 操作按钮 */}
          <div className="space-y-3">
            <button
              onClick={() => setLocation(fromLedgerId ? `/recharge/history?ledgerId=${fromLedgerId}${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}` : '/recharge/history')}
              className="w-full py-4 rounded-xl font-semibold text-black tracking-widest"
              style={{background:'linear-gradient(135deg,#CBA471,#e8c98a,#CBA471)',boxShadow:'0 4px 20px rgba(203,164,113,0.4)'}}
            >
              查看充值记录
            </button>
            <button
              onClick={() => { setOrder(null); setSubmitted(false); }}
              className="w-full py-4 rounded-xl font-semibold text-[#CBA471]"
              style={{background:'transparent',border:'1px solid #CBA471'}}
            >
              继续充值
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========== 确认支付页面（已创建订单） ==========
  if (order) {
    return (
      <div className={darkBg} style={{background:'linear-gradient(160deg,#111111 0%,#1a1a1a 100%)'}}>
        <div className={darkNavBar} style={{background:'#111111'}}>
          <div className="flex items-center px-4 py-3">
            <button onClick={() => setOrder(null)} className="mr-3">
              <ArrowLeft className="w-6 h-6 text-[#CBA471]" />
            </button>
            <h1 className="text-lg font-semibold text-[#CBA471] tracking-widest">确认支付</h1>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* 倒计时 */}
          {timeLeft > 0 ? (
            <div className="rounded-xl p-4 flex items-start" style={{background:'rgba(255,160,0,0.08)',border:'1px solid rgba(255,160,0,0.25)'}}>
              <Clock className="w-5 h-5 text-amber-400 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <div className="font-medium text-amber-300">请在 {formatTime(timeLeft)} 内完成支付</div>
                <div className="text-xs text-amber-500/80 mt-1">订单将在30分钟后自动过期</div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl p-4 flex items-start" style={{background:'rgba(244,67,54,0.08)',border:'1px solid rgba(244,67,54,0.25)'}}>
              <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <div className="font-medium text-red-300">订单已过期</div>
                <div className="text-xs text-red-500/80 mt-1">请重新创建充值订单</div>
              </div>
            </div>
          )}

          {/* 支付金额 */}
          <div className="rounded-2xl p-6 text-center" style={{background:'linear-gradient(135deg,#1e1e1e,#252525)',border:'1px solid #2a2a2a',boxShadow:'0 8px 32px rgba(0,0,0,0.5)'}}>
            <div className="text-gray-400 text-sm mb-2">应付金额</div>
            <div className="text-5xl font-bold text-[#CBA471] mb-1" style={{textShadow:'0 0 20px rgba(203,164,113,0.4)'}}>
              {order.amount}
            </div>
            <div className="text-gray-400 text-sm">USDT ({order.network})</div>
          </div>

          {/* 二维码 */}
          <div className="rounded-2xl p-6" style={{background:'linear-gradient(135deg,#1e1e1e,#252525)',border:'1px solid #2a2a2a',boxShadow:'0 4px 20px rgba(0,0,0,0.4)'}}>
            <div className="text-center">
              <div className="text-sm text-gray-400 mb-4">扫码支付</div>
              {qrCode && (
                <div className="inline-block p-3 rounded-xl bg-white">
                  <img src={qrCode} alt="QR Code" className="w-44 h-44" />
                </div>
              )}
            </div>
          </div>

          {/* 收款地址 */}
          <div className="rounded-2xl p-4" style={{background:'linear-gradient(135deg,#1e1e1e,#252525)',border:'1px solid #2a2a2a',boxShadow:'0 4px 20px rgba(0,0,0,0.4)'}}>
            <div className="text-sm text-gray-400 mb-3">收款地址</div>
            <div className="flex items-center rounded-xl p-3" style={{background:'rgba(0,0,0,0.3)',border:'1px solid #333'}}>
              <div className="flex-1 font-mono text-sm break-all mr-2 text-gray-200">
                {order.walletAddress}
              </div>
              <button
                onClick={() => copyToClipboard(order.walletAddress)}
                className="flex-shrink-0 p-2 rounded-lg transition-colors"
                style={{background: copied ? 'rgba(76,175,80,0.2)' : 'rgba(203,164,113,0.15)',border:`1px solid ${copied ? '#4CAF50' : '#CBA471'}`}}
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-[#CBA471]" />}
              </button>
            </div>
          </div>

          {/* 提交按钮 */}
          <button
            onClick={handleSubmitTransfer}
            disabled={submitting || timeLeft === 0}
            className="w-full py-4 rounded-xl font-semibold text-black tracking-widest disabled:opacity-50"
            style={{background:'linear-gradient(135deg,#CBA471,#e8c98a,#CBA471)',boxShadow:'0 4px 20px rgba(203,164,113,0.4)'}}
          >
            {submitting ? '提交中...' : '我已完成转账'}
          </button>
        </div>
      </div>
    );
  }

  // ========== 主页面 ==========
  const networks = ["TRC20", "ERC20", "BEP20", "APTOS", "SOLANA"] as const;
  const quickAmounts = [100, 500, 1000, 5000];

  return (
    <>
    <div className={darkBg} style={{background:'linear-gradient(160deg,#111111 0%,#1a1a1a 100%)'}}>
      {/* 顶部导航 */}
      {!hideHeader && (
        <div className={darkNavBar} style={{background:'#111111'}}>
          {/* 金色高光线 */}
          <div style={{height:'2px',background:'linear-gradient(90deg,transparent,#CBA471,#e8c98a,#CBA471,transparent)'}} />
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center">
              <button onClick={handleBack} className="mr-3">
                <ArrowLeft className="w-6 h-6 text-[#CBA471]" />
              </button>
              <h1 className="text-lg font-semibold text-[#CBA471] tracking-widest">充值</h1>
            </div>
            <button
              onClick={() => setLocation(fromLedgerId ? `/recharge/history?ledgerId=${fromLedgerId}${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}` : '/recharge/history')}
              className="flex items-center text-sm text-[#CBA471] opacity-80"
            >
              <History className="w-4 h-4 mr-1" />记录
            </button>
          </div>
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* 余额卡 */}
        {!hideBalance && (
          <div className="rounded-2xl p-5 relative overflow-hidden" style={{background:'linear-gradient(135deg,#1a1a1a 0%,#222222 50%,#1a1a1a 100%)',border:'1px solid #2a2a2a',boxShadow:'0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(203,164,113,0.15)'}}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:'2px',background:'linear-gradient(90deg,transparent,#CBA471,#e8c98a,#CBA471,transparent)'}} />
            <div className="text-gray-400 text-sm mb-1">当前余额</div>
            <div className="text-3xl font-bold text-[#CBA471]" style={{textShadow:'0 0 20px rgba(203,164,113,0.4)'}}>
              {displayBalance != null ? parseFloat(String(displayBalance)).toFixed(2) : '0.00'}
              <span className="text-base font-normal text-gray-400 ml-2">USDT</span>
            </div>
          </div>
        )}

        {/* 选择网络 */}
        <div className="rounded-2xl p-4" style={{background:'linear-gradient(135deg,#1e1e1e,#252525)',border:'1px solid #2a2a2a',boxShadow:'0 4px 20px rgba(0,0,0,0.4)'}}>
          <div className="text-sm text-gray-400 mb-3">选择网络</div>
          <div className="flex flex-wrap gap-2">
            {networks.map(n => (
              <button
                key={n}
                onClick={() => setNetwork(n)}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={network === n
                  ? {background:'linear-gradient(135deg,#CBA471,#e8c98a)',color:'#111',boxShadow:'0 4px 12px rgba(203,164,113,0.4)'}
                  : {background:'rgba(255,255,255,0.05)',color:'#888',border:'1px solid #333'}
                }
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* 输入金额 */}
        <div className="rounded-2xl p-4" style={{background:'linear-gradient(135deg,#1e1e1e,#252525)',border:'1px solid #2a2a2a',boxShadow:'0 4px 20px rgba(0,0,0,0.4)'}}>
          <div className="text-sm text-gray-400 mb-3">充值金额</div>
          <div className="flex items-center rounded-xl px-4 py-3 mb-3" style={{background:'rgba(0,0,0,0.3)',border:'1px solid #333'}}>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="请输入充值金额"
              className="flex-1 min-w-0 text-xl font-bold outline-none bg-transparent text-white placeholder-gray-600"
              step="1"
              min="1"
            />
            <span className="text-[#CBA471] text-sm font-medium ml-2">USDT</span>
          </div>
          {/* 快捷金额 */}
          <div className="flex gap-2">
            {quickAmounts.map(q => (
              <button
                key={q}
                onClick={() => setAmount(String(q))}
                className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                style={amount === String(q)
                  ? {background:'rgba(203,164,113,0.2)',color:'#CBA471',border:'1px solid #CBA471'}
                  : {background:'rgba(255,255,255,0.05)',color:'#888',border:'1px solid #333'}
                }
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* 确认按钮 */}
        <button
          onClick={handleCreateOrder}
          disabled={createOrderMutation.isPending || !amount}
          className="w-full py-4 rounded-xl font-semibold text-black tracking-widest disabled:opacity-50"
          style={{background:'linear-gradient(135deg,#CBA471,#e8c98a,#CBA471)',boxShadow:'0 4px 20px rgba(203,164,113,0.4)'}}
        >
          {createOrderMutation.isPending ? '创建中...' : '立即充值'}
        </button>

        {/* 安全提示 */}
        <div className="rounded-2xl p-4" style={{background:'rgba(203,164,113,0.06)',border:'1px solid rgba(203,164,113,0.15)'}}>
          <div className="text-sm font-medium text-[#CBA471] mb-2">充值说明</div>
          <ul className="text-xs text-gray-500 space-y-1.5">
            <li>• 请确认选择正确的网络，转错网络资产无法找回</li>
            <li>• 最小充值金额为 1 USDT</li>
            <li>• 充值到账时间通常为1-3分钟</li>
            <li>• 请勿向上述地址转入非 USDT 资产</li>
          </ul>
        </div>

        {/* 账本历史记录（仅从账本进入时显示） */}
        {fromLedgerId && (
          <div className="rounded-2xl overflow-hidden" style={{background:'linear-gradient(135deg,#1e1e1e,#252525)',border:'1px solid #2a2a2a'}}>
            <button
              className="w-full flex items-center justify-between px-4 py-3"
              onClick={() => setShowLedgerHistory(v => !v)}
            >
              <span className="text-sm font-medium text-[#CBA471]">账本充值记录</span>
              {showLedgerHistory ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {showLedgerHistory && (
              <div className="border-t border-[#2a2a2a]">
                {ledgerHistoryLoading ? (
                  <div className="p-6 text-center text-gray-500 text-sm">加载中...</div>
                ) : ledgerHistoryList.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 text-sm">暂无记录</div>
                ) : (
                  <div className="divide-y divide-[#2a2a2a]">
                    {(() => {
                      let runningBalance = 0;
                      const sorted = [...ledgerHistoryList].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                      const balances = sorted.map(item => {
                        const amt = parseFloat(String(item.amount));
                        runningBalance += amt;
                        return runningBalance;
                      });
                      return sorted.slice().reverse().map((item, i) => {
                        const revIdx = sorted.length - 1 - i;
                        const amt = parseFloat(String(item.amount));
                        const isPositive = amt >= 0;
                        const date = new Date(item.createdAt);
                        const dateStr = `${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
                        const rawNote = item.note || '';
                        const orderNoMatch = rawNote.match(/AF\d{12}/);
                        const orderNo = orderNoMatch ? orderNoMatch[0] : null;
                        const cleanNote = rawNote.replace(/\s*AF\d{12}/, '').trim();
                        const typeLabel = item.sourceType === 'recharge'
                          ? (item.status === 'completed' ? '充值到账' : item.status === 'submitted' ? '确认中' : item.status === 'pending' ? '待支付' : cleanNote || '充值')
                          : (cleanNote ? cleanNote.replace('管理员调账', '调账').replace('管理员', '') : '调账');
                        const balanceAfter = balances[revIdx];
                        const showBalance = item.sourceType === 'manual' || (item.sourceType === 'recharge' && item.status === 'completed');
                        return (
                          <div key={item.id || i} className="flex items-start justify-between px-4 py-3">
                            <div className="flex-1 min-w-0 mr-3">
                              <div className="text-gray-300 text-xs leading-snug" style={{wordBreak:'break-all',whiteSpace:'normal',overflowWrap:'anywhere'}}>{typeLabel}</div>
                              <div className="text-gray-600 text-xs mt-0.5">{dateStr}{orderNo && <span className="ml-1">{orderNo}</span>}</div>
                            </div>
                            <div className="flex flex-col items-end">
                              <div className={`text-sm font-semibold whitespace-nowrap ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                                {isPositive ? '+' : ''}{amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} U
                              </div>
                              {showBalance && (
                                <div className="text-gray-600 text-xs mt-0.5 whitespace-nowrap">余额 {balanceAfter.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} U</div>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
