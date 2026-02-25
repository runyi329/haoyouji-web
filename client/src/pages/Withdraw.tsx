import { useState } from "react";
import { trpc } from "../lib/trpc";
import { toast } from "sonner";
import { Loader2, AlertCircle } from "lucide-react";

interface WithdrawProps {
  hideHeader?: boolean;
}

export default function Withdraw({ hideHeader }: WithdrawProps) {
  const [amount, setAmount] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [remark, setRemark] = useState("");

  const balanceQuery = trpc.recharge.getBalance.useQuery();
  const accountsQuery = trpc.payment.getMyAccounts.useQuery();
  const withdrawMutation = trpc.recharge.requestWithdraw.useMutation({
    onSuccess: () => {
      toast.success("提现申请已提交，等待管理员审核");
      setAmount("");
      setSelectedAccountId(null);
      setRemark("");
    },
    onError: (error) => {
      toast.error(error.message || "提现申请失败");
    },
  });

  const handleSubmit = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("请输入有效的提现金额");
      return;
    }

    if (!selectedAccountId) {
      toast.error("请选择收款账户");
      return;
    }

    const amountNum = parseFloat(amount);
    const balance = balanceQuery.data || 0;

    if (amountNum > balance) {
      toast.error("提现金额不能大于账户余额");
      return;
    }

    if (amountNum < 10) {
      toast.error("最低提现金额为 10 USDT");
      return;
    }

    withdrawMutation.mutate({
      amount: amountNum,
      paymentAccountId: selectedAccountId,
      remark: remark || undefined,
    });
  };

  const balance = balanceQuery.data || 0;
  const accounts = accountsQuery.data || [];

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <div className="text-sm text-gray-600 mb-1">可提现余额</div>
          <div className="text-2xl font-bold text-[#D32F2F]">
            {balance.toFixed(2)} <span className="text-base text-gray-600">USDT</span>
          </div>
        </div>
      )}

      {/* 提现金额 */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          提现金额
        </label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="请输入提现金额"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D32F2F] focus:border-transparent text-lg"
            step="0.01"
            min="10"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">
            USDT
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-gray-500">最低提现：10 USDT</span>
          <button
            onClick={() => setAmount(balance.toString())}
            className="text-[#D32F2F] font-medium"
          >
            全部提现
          </button>
        </div>
      </div>

      {/* 选择收款账户 */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          选择收款账户
        </label>
        
        {accounts.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>暂无收款账户</p>
            <p className="text-sm mt-1">请先在"提现账户"标签页添加收款账户</p>
          </div>
        ) : (
          <div className="space-y-2">
            {accounts.map((account) => (
              <button
                key={account.id}
                onClick={() => setSelectedAccountId(account.id)}
                className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                  selectedAccountId === account.id
                    ? "border-[#D32F2F] bg-red-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">
                      {account.type === "bank" && "银行卡"}
                      {account.type === "alipay" && "支付宝"}
                      {account.type === "wechat" && "微信"}
                      {account.type === "blockchain" && "区块链钱包"}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {account.type === "bank" && `${account.bankName} ${account.accountNumber}`}
                      {account.type === "alipay" && account.accountNumber}
                      {account.type === "wechat" && account.accountNumber}
                      {account.type === "blockchain" && `${account.network} ${account.address?.slice(0, 10)}...${account.address?.slice(-8)}`}
                    </div>
                  </div>
                  {selectedAccountId === account.id && (
                    <div className="w-5 h-5 rounded-full bg-[#D32F2F] flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 备注 */}
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          备注（选填）
        </label>
        <textarea
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="请输入备注信息"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#D32F2F] focus:border-transparent resize-none"
          rows={3}
        />
      </div>

      {/* 提交按钮 */}
      <button
        onClick={handleSubmit}
        disabled={withdrawMutation.isPending || !amount || !selectedAccountId}
        className="w-full bg-[#D32F2F] text-white py-4 rounded-lg font-medium text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#B71C1C] transition-colors flex items-center justify-center"
      >
        {withdrawMutation.isPending ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            提交中...
          </>
        ) : (
          "提交提现申请"
        )}
      </button>

      {/* 提示信息 */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800">
            <p className="font-medium mb-1">提现说明：</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>最低提现金额为 10 USDT</li>
              <li>提现申请提交后需要管理员审核</li>
              <li>审核通过后将在 1-3 个工作日内到账</li>
              <li>请确保收款账户信息准确无误</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
