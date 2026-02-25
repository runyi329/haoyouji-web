import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Wallet as WalletIcon, FileText } from "lucide-react";
import { trpc } from "../lib/trpc";
import Recharge from "./Recharge";
import PaymentAccounts from "./PaymentAccounts";

type TabType = "recharge" | "withdraw";

export default function Wallet() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>("recharge");
  
  const balanceQuery = trpc.recharge.getBalance.useQuery();

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
            {typeof balanceQuery.data === 'number' ? balanceQuery.data.toFixed(2) : "0.00"}
          </div>
          <div className="text-sm opacity-75">USDT</div>
        </div>
        
        {/* 交易明细按钮 */}
        <button
          onClick={() => setLocation("/wallet/transactions")}
          className="mt-3 w-full bg-white rounded-lg p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center">
            <FileText className="w-5 h-5 text-[#D32F2F] mr-3" />
            <span className="font-medium text-gray-900">交易明细</span>
          </div>
          <ArrowLeft className="w-5 h-5 text-gray-400 transform rotate-180" />
        </button>
      </div>

      {/* Tab切换栏 */}
      <div className="bg-white border-b sticky top-[57px] z-10">
        <div className="flex">
          <button
            onClick={() => setActiveTab("recharge")}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              activeTab === "recharge"
                ? "text-[#D32F2F] border-b-2 border-[#D32F2F]"
                : "text-gray-500"
            }`}
          >
            充值
          </button>
          <button
            onClick={() => setActiveTab("withdraw")}
            className={`flex-1 py-3 text-center font-medium transition-colors ${
              activeTab === "withdraw"
                ? "text-[#D32F2F] border-b-2 border-[#D32F2F]"
                : "text-gray-500"
            }`}
          >
            提现账户
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="bg-gray-50">
        {activeTab === "recharge" ? (
          <div className="p-4">
            <Recharge hideHeader hideBalance />
          </div>
        ) : (
          <div className="p-4">
            <PaymentAccounts hideHeader />
          </div>
        )}
      </div>
    </div>
  );
}
