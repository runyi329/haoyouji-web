import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, TrendingUp, BarChart3, Download } from "lucide-react";

export default function OilPricesPage() {
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
          <h1 className="text-lg font-semibold">石油价格分析</h1>
          <div className="w-10"></div>
        </div>
      </div>
      
      {/* 主要内容 */}
      <div className="p-4">
        <div className="bg-gray-800/30 rounded-xl p-6 text-center border border-gray-700">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500/20 mb-4">
            <TrendingUp className="w-8 h-8 text-yellow-400" />
          </div>
          <h2 className="text-xl font-bold mb-2">价格分析模块</h2>
          <p className="text-gray-400 mb-6">
            实时油价监控、历史价格分析、价格预测功能开发中
          </p>
          
          <div className="max-w-md mx-auto space-y-4">
            <div className="bg-gray-900/50 rounded-lg p-4 text-left">
              <h3 className="font-medium mb-2">计划功能</h3>
              <ul className="text-gray-300 text-sm space-y-1">
                <li>• 布伦特/WTI原油实时价格</li>
                <li>• 历史价格图表分析</li>
                <li>• 技术指标计算</li>
                <li>• 价格预测模型</li>
                <li>• 市场情绪分析</li>
              </ul>
            </div>
            
            <button
              onClick={() => alert('价格分析功能开发中')}
              className="w-full px-4 py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Download className="w-5 h-5" />
              导出价格数据（开发中）
            </button>
            
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
          此页面为框架页面，实际功能正在开发中
        </div>
      </div>
    </div>
  );
}