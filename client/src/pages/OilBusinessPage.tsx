import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, BarChart3, TrendingUp, DollarSign, Zap, Globe, Package, Users } from "lucide-react";

export default function OilBusinessPage() {
  const [location, setLocation] = useLocation();
  const params = useParams();
  const ledgerId = params.id;
  
  const [isLoading, setIsLoading] = useState(true);
  const [oilData, setOilData] = useState<any>(null);
  
  // 模拟加载数据
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
      // 模拟石油数据
      setOilData({
        brentPrice: 85.42,
        wtiPrice: 82.15,
        dailyChange: 1.23,
        weeklyChange: 3.45,
        inventoryLevel: "中等",
        demandTrend: "上升",
        supplyStatus: "稳定"
      });
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
        <div className="p-4">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-800 rounded w-1/4 mb-4"></div>
            <div className="h-64 bg-gray-800 rounded mb-4"></div>
            <div className="h-32 bg-gray-800 rounded"></div>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-gray-900/90 backdrop-blur-sm border-b border-gray-800">
        <div className="px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}`)}
            className="p-2 rounded-full hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">石油业务中心</h1>
          <div className="w-10"></div> {/* 占位保持对称 */}
        </div>
      </div>
      
      {/* 主要内容 */}
      <div className="p-4">
        {/* 欢迎区域 */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-yellow-500/20">
              <Zap className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold">石油业务平台</h2>
              <p className="text-gray-400 text-sm">52号账本专属石油业务管理</p>
            </div>
          </div>
          <p className="text-gray-300 mt-2">
            欢迎使用石油业务管理平台。这里将集成石油价格监控、交易记录、供应链管理等功能。
          </p>
        </div>
        
        {/* 石油价格卡片 */}
        <div className="bg-gray-800/50 rounded-xl p-4 mb-6 border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-400" />
              实时油价
            </h3>
            <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">
              实时更新
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-900/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">布伦特原油</span>
                <Globe className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-bold">${oilData?.brentPrice?.toFixed(2) || "85.42"}</div>
              <div className="text-green-400 text-sm mt-1">+{oilData?.dailyChange?.toFixed(2) || "1.23"}%</div>
            </div>
            
            <div className="bg-gray-900/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">WTI原油</span>
                <DollarSign className="w-4 h-4 text-yellow-400" />
              </div>
              <div className="text-2xl font-bold">${oilData?.wtiPrice?.toFixed(2) || "82.15"}</div>
              <div className="text-green-400 text-sm mt-1">+{(oilData?.dailyChange || 1.23).toFixed(2)}%</div>
            </div>
          </div>
          
          <div className="mt-4 text-center">
            <button
              onClick={() => setLocation(`/ledger/${ledgerId}/oil/prices`)}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-medium rounded-lg transition-colors w-full"
            >
              查看详细价格分析
            </button>
          </div>
        </div>
        
        {/* 功能模块网格 */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-4">业务功能模块</h3>
          <div className="grid grid-cols-2 gap-3">
            {/* 价格监控 */}
            <button
              onClick={() => setLocation(`/ledger/${ledgerId}/oil/prices`)}
              className="bg-gray-800/50 rounded-xl p-4 text-left hover:bg-gray-800 transition-colors border border-gray-700"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <TrendingUp className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h4 className="font-medium">价格监控</h4>
                  <p className="text-gray-400 text-xs">实时油价追踪</p>
                </div>
              </div>
            </button>
            
            {/* 交易记录 */}
            <button
              onClick={() => setLocation(`/ledger/${ledgerId}/oil/trades`)}
              className="bg-gray-800/50 rounded-xl p-4 text-left hover:bg-gray-800 transition-colors border border-gray-700"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <BarChart3 className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h4 className="font-medium">交易记录</h4>
                  <p className="text-gray-400 text-xs">石油交易管理</p>
                </div>
              </div>
            </button>
            
            {/* 供应链 */}
            <button
              onClick={() => setLocation(`/ledger/${ledgerId}/oil/supply`)}
              className="bg-gray-800/50 rounded-xl p-4 text-left hover:bg-gray-800 transition-colors border border-gray-700"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-purple-500/20">
                  <Package className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h4 className="font-medium">供应链</h4>
                  <p className="text-gray-400 text-xs">物流与库存</p>
                </div>
              </div>
            </button>
            
            {/* 合作伙伴 */}
            <button
              onClick={() => setLocation(`/ledger/${ledgerId}/oil/partners`)}
              className="bg-gray-800/50 rounded-xl p-4 text-left hover:bg-gray-800 transition-colors border border-gray-700"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-orange-500/20">
                  <Users className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <h4 className="font-medium">合作伙伴</h4>
                  <p className="text-gray-400 text-xs">供应商与客户</p>
                </div>
              </div>
            </button>
          </div>
        </div>
        
        {/* 开发状态提示 */}
        <div className="bg-gray-800/30 rounded-xl p-4 border border-gray-700">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/20 flex-shrink-0">
              <Zap className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h4 className="font-medium mb-1">开发中功能</h4>
              <p className="text-gray-400 text-sm">
                石油业务平台正在开发中。当前页面为基础框架，后续将逐步添加：
              </p>
              <ul className="text-gray-300 text-sm mt-2 space-y-1">
                <li>• 实时油价数据接入</li>
                <li>• 石油交易记录系统</li>
                <li>• 供应链管理功能</li>
                <li>• 财务报表分析</li>
                <li>• 市场预测工具</li>
              </ul>
              <div className="mt-4">
                <button
                  onClick={() => alert('功能开发中，敬请期待！')}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
                >
                  提交需求建议
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* 底部导航提示 */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/90 backdrop-blur-sm border-t border-gray-800 p-4">
        <div className="text-center text-gray-400 text-sm">
          石油业务平台 v0.1 • 52号账本专属
        </div>
      </div>
    </div>
  );
}