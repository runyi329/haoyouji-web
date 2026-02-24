import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Wallet as WalletIcon, TrendingUp, CreditCard } from "lucide-react";
import { trpc } from "../lib/trpc";
import Recharge from "./Recharge";
import PaymentAccounts from "./PaymentAccounts";

type TabType = "home" | "recharge" | "withdraw";

export default function Wallet() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>("home");
  
  const balanceQuery = trpc.recharge.getBalance.useQuery();

  // 如果Tab是充值或提现账户，直接渲染对应组件（隐藏顶部导航）
  if (activeTab === "recharge") {
    return <Recharge />;
  }
  
  if (activeTab === "withdraw") {
    return <PaymentAccounts />;
  }

  // 主页面（默认显示：余额 + 两个按钮）
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center px-4 py-3">
          <button onClick={() => setLocation("/profile")} className="mr-3">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold">我的钱包</h1>
        </div>
      </div>

      {/* 余额卡片 */}
      <div className="p-4">
        <div className="bg-gradient-to-br from-[#D32F2F] to-[#B71C1C] rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center mb-4">
            <WalletIcon className="w-6 h-6 mr-2" />
            <span className="text-sm opacity-90">账户余额</span>
          </div>
          <div className="text-4xl font-bold mb-2">
            {balanceQuery.data?.balance?.toFixed(2) || "0.00"}
          </div>
          <div className="text-sm opacity-75">USDT</div>
        </div>
      </div>

      {/* Tab选择 */}
      <div className="p-4 space-y-3">
        <button
          onClick={() => setActiveTab("recharge")}
          className="w-full bg-white rounded-xl p-6 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mr-4">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-gray-900">充值</div>
              <div className="text-sm text-gray-500">USDT充值到账户</div>
            </div>
          </div>
          <ArrowLeft className="w-5 h-5 text-gray-400 rotate-180" />
        </button>

        <button
          onClick={() => setActiveTab("withdraw")}
          className="w-full bg-white rounded-xl p-6 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mr-4">
              <CreditCard className="w-6 h-6 text-blue-600" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-gray-900">提现账户</div>
              <div className="text-sm text-gray-500">管理收款方式</div>
            </div>
          </div>
          <ArrowLeft className="w-5 h-5 text-gray-400 rotate-180" />
        </button>
      </div>
    </div>
  );
}
