import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { CheckCircle, XCircle, Clock, ArrowLeft } from 'lucide-react';

/**
 * 支付宝支付结果页
 * 支付宝同步回调后跳转到此页面
 * URL 参数：orderId, tradeNo, status
 */
export default function PaymentResult() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'success' | 'pending' | 'failed'>('pending');
  const [orderId, setOrderId] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oid = params.get('orderId') || '';
    const tradeStatus = params.get('status') || '';
    setOrderId(oid);

    // 支付宝同步回调不一定代表支付成功，需要查询后端确认
    if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED' || tradeStatus === 'success') {
      setStatus('success');
    } else if (oid) {
      // 轮询后端确认订单状态
      pollOrderStatus(oid);
    } else {
      setStatus('failed');
    }
  }, []);

  const pollOrderStatus = async (oid: string) => {
    setChecking(true);
    let attempts = 0;
    const maxAttempts = 6;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await fetch(`/api/alipay/order-status?orderId=${oid}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'completed') {
            setStatus('success');
            setChecking(false);
            clearInterval(interval);
            return;
          }
        }
      } catch {
        // 忽略网络错误，继续轮询
      }
      if (attempts >= maxAttempts) {
        setStatus('pending');
        setChecking(false);
        clearInterval(interval);
      }
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航 */}
      <div className="bg-white px-4 py-3 flex items-center border-b border-gray-100">
        <button
          onClick={() => setLocation('/')}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
        >
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <h1 className="flex-1 text-center text-base font-semibold text-gray-900 pr-8">支付结果</h1>
      </div>

      {/* 结果内容 */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {status === 'success' && (
          <>
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6">
              <CheckCircle size={48} className="text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">支付成功</h2>
            <p className="text-sm text-gray-500 mb-1">感谢您的购买！</p>
            {orderId && (
              <p className="text-xs text-gray-400 mb-8">订单号：{orderId}</p>
            )}
            <div className="w-full space-y-3">
              <button
                onClick={() => setLocation('/')}
                className="w-full py-3.5 bg-[#D32F2F] text-white font-semibold rounded-xl"
              >
                返回首页
              </button>
              <button
                onClick={() => setLocation('/products')}
                className="w-full py-3.5 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl"
              >
                继续购买
              </button>
            </div>
          </>
        )}

        {status === 'pending' && (
          <>
            <div className="w-20 h-20 bg-yellow-50 rounded-full flex items-center justify-center mb-6">
              <Clock size={48} className="text-yellow-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {checking ? '支付确认中...' : '支付处理中'}
            </h2>
            <p className="text-sm text-gray-500 mb-2">
              {checking
                ? '正在查询支付状态，请稍候...'
                : '您的支付正在处理中，请稍后查看订单状态'}
            </p>
            {orderId && (
              <p className="text-xs text-gray-400 mb-8">订单号：{orderId}</p>
            )}
            {!checking && (
              <div className="w-full space-y-3 mt-4">
                <button
                  onClick={() => setLocation('/')}
                  className="w-full py-3.5 bg-[#D32F2F] text-white font-semibold rounded-xl"
                >
                  返回首页
                </button>
                <button
                  onClick={() => setLocation('/products')}
                  className="w-full py-3.5 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl"
                >
                  查看商品
                </button>
              </div>
            )}
          </>
        )}

        {status === 'failed' && (
          <>
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
              <XCircle size={48} className="text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">支付未完成</h2>
            <p className="text-sm text-gray-500 mb-8">
              支付已取消或未完成，您可以重新发起支付
            </p>
            <div className="w-full space-y-3">
              <button
                onClick={() => window.history.back()}
                className="w-full py-3.5 bg-[#D32F2F] text-white font-semibold rounded-xl"
              >
                重新支付
              </button>
              <button
                onClick={() => setLocation('/')}
                className="w-full py-3.5 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl"
              >
                返回首页
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
