import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, BarChart3, Plus, FileText } from "lucide-react";

export default function OilTradesPage() {
  const [location, setLocation] = useLocation();
  const params = useParams();
  const ledgerId = params.id;
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-gray-900/90 backdrop-blur-sm border-b border-gray-800">
        <div className="px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/oil`)}
            className="p-2 rounded-full hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">石油交易记录</h1>
          <div className="w-10"></div>
        </div>
      </div>
      
      {/* 主要内容 */}
      <div className="p-4">
        <div className="bg-gray-800/30 rounded-xl p-6 text-center border border-gray-700">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-4">
            <BarChart3 className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-xl font-bold mb-2">交易记录系统</h2>
          <p className="text-gray-400 mb-6">
            石油交易记录、合同管理、结算功能开发中
          </p>
          
          <div className="max-w-md mx-auto space-y-4">
            <div className="bg-gray-900/50 rounded-lg p-4 text-left">
              <h3 className="font-medium mb-2">计划功能</h3>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>• 石油交易记录管理</li>
                <li>• 合同文档存储</li>
                <li>• 结算与付款跟踪</li>
                <li>• 交易统计分析</li>
                <li>• 风险控制管理</li>
              </ul>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => alert('新建交易功能开发中')}
                className="px-4 py-3 bg-green-500 hover:bg-green-600 text-black font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                新建交易
              </button>
              
              <button
                onClick={() => alert('交易报表功能开发中')}
                className="px-4 py-3 bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <FileText className="w-5 h-5" />
                交易报表
              </button>
            </div>
            
            <button
              onClick={() => setLocation(`/ledger/${ledgerId}/oil`)}
              className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              返回石油业务中心
            </button>
          </div>
        </div>
        
        {/* 开发提示 */}
        <div className="mt-6 text-center text-gray-500 text-sm">
          交易管理系统框架已搭建，具体功能正在开发
        </div>
      </div>
    </div>
  );
}