import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Copy, Check, Clock, Wallet, AlertCircle, CheckCircle2, History } from "lucide-react";
import { trpc } from "../lib/trpc";
import QRCode from "qrcode";

interface RechargeProps {
  hideHeader?: boolean;
  hideBalance?: boolean;
}

export default function Recharge({ hideHeader = false, hideBalance = false }: RechargeProps = {}) {
  const [location, setLocation] = useLocation();
  // 解析来源参数，支持从账本跳转过来后返回
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const fromLedger = searchParams.get('from') === 'ledger';
  const fromLedgerId = searchParams.get('ledgerId');
  const handleBack = () => {
    if (fromLedger && fromLedgerId) {
      setLocation(`/ledger/${fromLedgerId}`);
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

  const createOrderMutation = trpc.recharge.createOrder.useMutation();
  const submitTransferMutation = trpc.recharge.submitTransfer.useMutation();
  const balanceQuery = trpc.recharge.getBalance.useQuery();



  // 创建充值订单
  const handleCreateOrder = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 1) {
      alert("请输入有效的充值金额");
      return;
    }

    try {
      const result = await createOrderMutation.mutateAsync({
        amount: numAmount,
        network
      });

      setOrder(result);

      // 生成二维码（确保walletAddress不为空）
      if (result.walletAddress) {
        const qr = await QRCode.toDataURL(result.walletAddress);
        setQrCode(qr);
      }

      // 计算剩余时间
      const expiresAt = new Date(result.expiresAt).getTime();
      const now = Date.now();
      setTimeLeft(Math.floor((expiresAt - now) / 1000));

    } catch (error: any) {
      alert(error.message || "创建订单失败");
    }
  };

  // 提交转账确认
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

  // 复制到剪贴板
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 倒计时
  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  // 格式化倒计时
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ========== 已提交确认页面 ==========
  if (submitted && order) {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        {/* 顶部导航 */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="flex items-center px-4 py-3">
            <button onClick={() => setLocation("/recharge/history")} className="mr-3">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold">提交成功</h1>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* 成功图标 */}
          <div className="bg-white rounded-lg p-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">转账确认已提交</h2>
            <p className="text-gray-500">系统正在扫描链上交易，确认到账后将自动入账</p>
          </div>

          {/* 订单信息 */}
          <div className="bg-white rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">订单号</span>
              <span className="font-mono text-sm">{order.orderNo}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">充值金额</span>
              <span className="font-bold text-[#D32F2F]">{order.amount} USDT</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">网络</span>
              <span>{order.network}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">状态</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                <Clock className="w-3 h-3 mr-1" />
                确认中
              </span>
            </div>
          </div>

          {/* 提示 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="font-medium text-blue-900 mb-2">💡 温馨提示</div>
            <ul className="text-sm text-blue-800 space-y-1.5">
              <li>• 系统将自动扫描链上交易并匹配您的订单</li>
              <li>• 通常1-3分钟内即可确认到账</li>
              <li>• 您可以在充值记录中查看订单状态</li>
              <li>• 如果超过30分钟未到账，请联系管理员处理</li>
            </ul>
          </div>

          {/* 操作按钮 */}
          <div className="space-y-3">
            <button
              onClick={() => setLocation("/recharge/history")}
              className="w-full bg-[#D32F2F] text-white py-4 rounded-lg font-medium"
            >
              查看充值记录
            </button>
            <button
              onClick={() => { setOrder(null); setSubmitted(false); }}
              className="w-full bg-white border border-gray-300 text-gray-700 py-4 rounded-lg font-medium"
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
      <div className="min-h-screen bg-gray-50 pb-20">
        {/* 顶部导航 */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="flex items-center px-4 py-3">
            <button onClick={() => setOrder(null)} className="mr-3">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold">确认支付</h1>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* 倒计时提示 */}
          {timeLeft > 0 ? (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-start">
              <Clock className="w-5 h-5 text-orange-500 mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium text-orange-900">请在 {formatTime(timeLeft)} 内完成支付</div>
                <div className="text-sm text-orange-700 mt-1">订单将在30分钟后自动过期</div>
              </div>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium text-red-900">订单已过期</div>
                <div className="text-sm text-red-700 mt-1">请重新创建充值订单</div>
              </div>
            </div>
          )}

          {/* 支付金额 */}
          <div className="bg-white rounded-lg p-6 text-center">
            <div className="text-gray-600 mb-2">应付金额</div>
            <div className="text-4xl font-bold text-[#D32F2F] mb-1">
              {order.amount}
            </div>
            <div className="text-gray-500">USDT ({order.network})</div>
          </div>

          {/* 二维码 */}
          <div className="bg-white rounded-lg p-6">
            <div className="text-center mb-4">
              <div className="text-sm text-gray-600 mb-3">扫码支付</div>
              {qrCode && (
                <img src={qrCode} alt="QR Code" className="w-48 h-48 mx-auto" />
              )}
            </div>
          </div>

          {/* 收款地址 */}
          <div className="bg-white rounded-lg p-4">
            <div className="text-sm text-gray-600 mb-2">收款地址</div>
            <div className="flex items-center bg-gray-50 rounded-lg p-3">
              <div className="flex-1 font-mono text-sm break-all mr-2">
                {order.walletAddress}
              </div>
              <button
                onClick={() => copyToClipboard(order.walletAddress)}
                className="flex-shrink-0 p-2 hover:bg-gray-200 rounded"
              >
                {copied ? (
                  <Check className="w-5 h-5 text-green-500" />
                ) : (
                  <Copy className="w-5 h-5 text-gray-600" />
                )}
              </button>
            </div>
          </div>

          {/* 订单号 */}
          <div className="bg-white rounded-lg p-4">
            <div className="text-sm text-gray-600 mb-2">订单号</div>
            <div className="font-mono text-sm">{order.orderNo}</div>
          </div>

          {/* ★ 我已成功转账，提交确认 按钮 — 放在订单号下面、重要提示上面 */}
          <button
            onClick={handleSubmitTransfer}
            disabled={submitting || timeLeft <= 0}
            className="w-full bg-[#D32F2F] text-white py-4 rounded-lg font-medium text-lg disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
          >
            {submitting ? (
              <>
                <Clock className="w-5 h-5 animate-spin" />
                提交中...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                我已成功转账，提交确认
              </>
            )}
          </button>

          {/* 重要提示 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="font-medium text-yellow-900 mb-2">⚠️ 重要提示</div>
            <ul className="text-sm text-yellow-800 space-y-1.5">
              <li>• 请转账 <span className="font-bold">{order.amount} USDT</span>，系统按实际到账金额入账</li>
              <li>• 请选择 <span className="font-bold">{order.network}</span> 网络</li>
              <li>• 转账完成后，请点击上方按钮提交确认</li>
              <li>• 请勿向此地址转账其他币种</li>
            </ul>
          </div>

          {/* 手续费说明 */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="font-medium text-gray-700 mb-2">💬 关于手续费</div>
            <ul className="text-sm text-gray-600 space-y-1.5">
              <li>• 部分钱包会从转账金额中扣除手续费，导致实际到账金额略少</li>
              <li>• 系统支持智能匹配，即使因手续费导致金额不完全一致，也能自动识别并入账</li>
              <li>• 如果超过30分钟未自动到账，请联系管理员手动处理</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // ========== 默认显示充值金额选择页面 ==========
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      {!hideHeader && (<div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <button onClick={handleBack} className="mr-3">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold">充值</h1>
          </div>
          <button
            onClick={() => setLocation("/recharge/history")}
            className="flex items-center text-sm text-gray-600 hover:text-[#D32F2F]"
          >
            <History className="w-4 h-4 mr-1" />
            充值记录
          </button>
        </div>
      </div>)}

      <div className="p-4 space-y-4">
        {/* 当前余额 */}
        {!hideBalance && (<div className="bg-gradient-to-r from-[#D32F2F] to-[#E57373] rounded-lg p-6 text-white">
          <div className="flex items-center mb-2">
            <Wallet className="w-5 h-5 mr-2" />
            <span className="text-sm opacity-90">当前余额</span>
          </div>
          <div className="text-3xl font-bold">
            {balanceQuery.data?.toFixed(2) || '0.00'} USDT
          </div>
        </div>)}

        {/* 充值金额 */}
        <div className="bg-white rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-3">充值金额</div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="请输入充值金额"
            className="w-full text-2xl font-bold border-0 outline-none mb-4"
            min="1"
            step="0.01"
          />
        </div>

        {/* 选择网络 */}
        <div className="bg-white rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-3">选择网络</div>
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value as "TRC20" | "ERC20" | "BEP20" | "APTOS" | "SOLANA")}
            className="w-full p-3 border border-gray-300 rounded-lg focus:border-[#D32F2F] focus:outline-none transition-colors"
          >
            <option value="TRC20">TRC20 - 推荐 • 快速到账 • 低手续费</option>
            <option value="APTOS">Aptos - 新一代公链 • 快速安全</option>
            <option value="ERC20">ERC20 - 以太坊网络 • 手续费较高</option>
            <option value="SOLANA">Solana - 高性能公链 • 极速到账</option>
            <option value="BEP20">BSC(BEP20) - 币安智能链 • 快速低费</option>
          </select>
        </div>

        {/* 提交按钮 */}
        <button
          onClick={handleCreateOrder}
          disabled={!amount || parseFloat(amount) < 1 || createOrderMutation.isPending}
          className="w-full bg-[#D32F2F] text-white py-4 rounded-lg font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {createOrderMutation.isPending ? '创建中...' : '下一步'}
        </button>

        {/* 温馨提示 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="font-medium text-blue-900 mb-2">💡 温馨提示</div>
          <ul className="text-sm text-blue-800 space-y-1.5">
            <li>• 最低充值金额：1 USDT</li>
            <li>• 到账时间：1-3分钟（区块确认后自动到账）</li>
            <li>• 系统按实际到账金额入账，无需担心手续费差异</li>
            <li>• 转账时请选择正确的网络，否则资产将无法找回</li>
            <li>• 如果长时间未到账，请联系管理员处理</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
