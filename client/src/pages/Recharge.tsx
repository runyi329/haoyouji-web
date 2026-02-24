import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Copy, Check, Clock, Wallet, AlertCircle } from "lucide-react";
import { trpc } from "../lib/trpc";
import QRCode from "qrcode";

export default function Recharge() {
  const [, setLocation] = useLocation();
  const [amount, setAmount] = useState<string>("");
  const [network, setNetwork] = useState<"TRC20" | "ERC20" | "BEP20">("TRC20");
  const [order, setOrder] = useState<any>(null);
  const [qrCode, setQrCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  const createOrderMutation = trpc.recharge.createOrder.useMutation();
  const balanceQuery = trpc.recharge.getBalance.useQuery();

  // 预设金额选项
  const presetAmounts = [10, 50, 100, 200, 500, 1000];

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

  // 如果已创建订单，显示支付页面
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

          {/* 重要提示 */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="font-medium text-yellow-900 mb-2">⚠️ 重要提示</div>
            <ul className="text-sm text-yellow-800 space-y-1">
              <li>• 请务必转账 <span className="font-bold">{order.amount} USDT</span>（精确金额）</li>
              <li>• 请选择 <span className="font-bold">{order.network}</span> 网络</li>
              <li>• 转账完成后，系统将在1-3分钟内自动到账</li>
              <li>• 请勿向此地址转账其他币种</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // 默认显示充值金额选择页面
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center px-4 py-3">
            <button onClick={() => window.history.back()} className="mr-3">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold">充值</h1>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 当前余额 */}
        <div className="bg-gradient-to-r from-[#D32F2F] to-[#E57373] rounded-lg p-6 text-white">
          <div className="flex items-center mb-2">
            <Wallet className="w-5 h-5 mr-2" />
            <span className="text-sm opacity-90">当前余额</span>
          </div>
          <div className="text-3xl font-bold">
            {balanceQuery.data?.toFixed(2) || '0.00'} USDT
          </div>
        </div>

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
          
          {/* 预设金额 */}
          <div className="grid grid-cols-3 gap-2">
            {presetAmounts.map((preset) => (
              <button
                key={preset}
                onClick={() => setAmount(preset.toString())}
                className="py-2 border border-gray-300 rounded-lg hover:border-[#D32F2F] hover:text-[#D32F2F] transition-colors"
              >
                {preset} USDT
              </button>
            ))}
          </div>
        </div>

        {/* 选择网络 */}
        <div className="bg-white rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-3">选择网络</div>
          <div className="space-y-2">
            {(['TRC20', 'ERC20', 'BEP20'] as const).map((net) => (
              <label
                key={net}
                className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                  network === net
                    ? 'border-[#D32F2F] bg-red-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <input
                  type="radio"
                  name="network"
                  value={net}
                  checked={network === net}
                  onChange={(e) => setNetwork(e.target.value as any)}
                  className="mr-3"
                />
                <div className="flex-1">
                  <div className="font-medium">{net}</div>
                  <div className="text-xs text-gray-500">
                    {net === 'TRC20' && '推荐 • 快速到账 • 低手续费'}
                    {net === 'ERC20' && '以太坊网络 • 手续费较高'}
                    {net === 'BEP20' && 'BSC网络 • 快速低费'}
                  </div>
                </div>
              </label>
            ))}
          </div>
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
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• 最低充值金额：1 USDT</li>
            <li>• 到账时间：1-3分钟（区块确认后自动到账）</li>
            <li>• 请确保转账金额与订单金额完全一致</li>
            <li>• 转账时请选择正确的网络，否则资产将无法找回</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
