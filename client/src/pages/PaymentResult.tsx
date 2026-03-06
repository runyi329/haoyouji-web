import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';

/**
 * 支付结果页
 * 参照支付宝支付结果页风格，使用好友记网站配色
 * 支付宝同步回调后跳转到此页面
 * URL 参数：orderId, tradeNo, status
 */
export default function PaymentResult() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'loading' | 'success' | 'pending' | 'failed'>('loading');
  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState('');
  const [productName, setProductName] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oid = params.get('orderId') || '';
    const tradeStatus = params.get('status') || '';
    const tradeNo = params.get('tradeNo') || '';

    setOrderId(oid);

    // 支付宝同步回调的 trade_status 参数
    if (
      tradeStatus === 'TRADE_SUCCESS' ||
      tradeStatus === 'TRADE_FINISHED' ||
      tradeStatus === 'success'
    ) {
      setStatus('success');
    } else if (oid) {
      // 有订单号但状态不明确，轮询后端确认
      pollOrderStatus(oid);
    } else {
      // 没有任何参数，可能是直接访问或支付取消
      setStatus('failed');
    }
  }, []);

  const pollOrderStatus = async (oid: string) => {
    setStatus('loading');
    let attempts = 0;
    const maxAttempts = 8;
    const token = localStorage.getItem('auth-token');

    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/alipay/order-status?orderId=${oid}`, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'completed') {
            setStatus('success');
            if (data.amount) setAmount(data.amount);
            if (data.productName) setProductName(data.productName);
            clearInterval(interval);
            return;
          }
          if (data.status === 'failed') {
            setStatus('failed');
            clearInterval(interval);
            return;
          }
        }
      } catch {
        // 网络错误，继续轮询
      }
      if (attempts >= maxAttempts) {
        setStatus('pending');
        clearInterval(interval);
      }
    }, 2000);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f5f5f5' }}>
      {/* 顶部状态栏区域 - 参照支付宝的红色顶部 */}
      <div
        className="w-full flex flex-col items-center pt-12 pb-10"
        style={{
          background: 'linear-gradient(160deg, #D32F2F 0%, #B71C1C 100%)',
        }}
      >
        {status === 'loading' && (
          <>
            {/* 加载动画圆圈 */}
            <div className="w-20 h-20 rounded-full border-4 border-white/30 border-t-white animate-spin mb-5" />
            <p className="text-white text-lg font-semibold">支付确认中</p>
            <p className="text-white/70 text-sm mt-1">正在查询支付结果，请稍候...</p>
          </>
        )}

        {status === 'success' && (
          <>
            {/* 成功勾选图标 */}
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
            >
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <circle cx="22" cy="22" r="21" stroke="white" strokeWidth="2" />
                <path
                  d="M12 22L19 29L32 15"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="text-white text-2xl font-bold tracking-wide">支付成功</p>
            {amount && (
              <p className="text-white/90 text-base mt-1">
                ¥<span className="text-3xl font-bold">{amount}</span>
              </p>
            )}
            {productName && (
              <p className="text-white/70 text-sm mt-1">{productName}</p>
            )}
          </>
        )}

        {status === 'pending' && (
          <>
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
            >
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <circle cx="22" cy="22" r="21" stroke="white" strokeWidth="2" />
                <path d="M22 12V22L28 28" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-white text-2xl font-bold">支付处理中</p>
            <p className="text-white/70 text-sm mt-1">请稍后查看订单状态</p>
          </>
        )}

        {status === 'failed' && (
          <>
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
            >
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <circle cx="22" cy="22" r="21" stroke="white" strokeWidth="2" />
                <path d="M15 15L29 29M29 15L15 29" stroke="white" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-white text-2xl font-bold">支付未完成</p>
            <p className="text-white/70 text-sm mt-1">支付已取消或未成功</p>
          </>
        )}
      </div>

      {/* 订单信息卡片 */}
      <div className="mx-4 -mt-4 bg-white rounded-2xl shadow-sm overflow-hidden">
        {/* 订单号 */}
        {orderId && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <span className="text-sm text-gray-500">订单编号</span>
            <span className="text-sm text-gray-800 font-medium">{orderId.slice(-12)}</span>
          </div>
        )}

        {/* 状态说明 */}
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-sm text-gray-500">支付状态</span>
          <span
            className="text-sm font-semibold"
            style={{
              color:
                status === 'success'
                  ? '#2E7D32'
                  : status === 'failed'
                  ? '#D32F2F'
                  : '#FF6B35',
            }}
          >
            {status === 'loading'
              ? '查询中...'
              : status === 'success'
              ? '支付成功'
              : status === 'pending'
              ? '处理中'
              : '未完成'}
          </span>
        </div>
      </div>

      {/* 温馨提示 */}
      {status === 'success' && (
        <div className="mx-4 mt-3 bg-white rounded-2xl px-5 py-4">
          <p className="text-xs text-gray-400 leading-relaxed">
            💡 您的订单已支付成功，服务将在短时间内为您开通。如有疑问，请联系客服。
          </p>
        </div>
      )}

      {status === 'pending' && (
        <div className="mx-4 mt-3 bg-white rounded-2xl px-5 py-4">
          <p className="text-xs text-gray-400 leading-relaxed">
            ⏳ 您的支付正在处理中，通常在几分钟内完成。如长时间未到账，请联系客服处理。
          </p>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="mx-4 mt-4 space-y-3">
        {(status === 'success' || status === 'pending') && (
          <>
            <button
              onClick={() => setLocation('/')}
              className="w-full py-4 rounded-2xl text-white font-semibold text-base"
              style={{ backgroundColor: '#D32F2F' }}
            >
              返回首页
            </button>
            <button
              onClick={() => setLocation('/coupons')}
              className="w-full py-4 rounded-2xl font-medium text-base border"
              style={{ borderColor: '#D32F2F', color: '#D32F2F', backgroundColor: 'white' }}
            >
              查看我的订单
            </button>
          </>
        )}

        {status === 'failed' && (
          <>
            <button
              onClick={() => window.history.back()}
              className="w-full py-4 rounded-2xl text-white font-semibold text-base"
              style={{ backgroundColor: '#D32F2F' }}
            >
              重新支付
            </button>
            <button
              onClick={() => setLocation('/')}
              className="w-full py-4 rounded-2xl font-medium text-base border border-gray-200 text-gray-600 bg-white"
            >
              返回首页
            </button>
          </>
        )}

        {status === 'loading' && (
          <button
            onClick={() => setLocation('/')}
            className="w-full py-4 rounded-2xl font-medium text-base border border-gray-200 text-gray-500 bg-white"
          >
            返回首页
          </button>
        )}
      </div>

      {/* 底部客服 */}
      <div className="mt-8 pb-8 flex justify-center">
        <p className="text-xs text-gray-400">
          遇到问题？
          <a href="/" className="ml-1" style={{ color: '#D32F2F' }}>
            联系客服
          </a>
        </p>
      </div>
    </div>
  );
}
