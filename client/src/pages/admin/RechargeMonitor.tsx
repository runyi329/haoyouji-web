import { useLocation } from "wouter";
import { ArrowLeft, Activity, Clock, CheckCircle2, XCircle, AlertTriangle, Wallet, TrendingUp, RefreshCw } from "lucide-react";
import { trpc } from "../../lib/trpc";
import { useState } from "react";

export default function RechargeMonitor() {
  const [, setLocation] = useLocation();
  const [refreshKey, setRefresh] = useState(0);

  const statsQuery = trpc.recharge.adminGetSystemStats.useQuery(undefined, {
    refetchInterval: 30000 // 每30秒自动刷新
  });
  const heartbeatQuery = trpc.recharge.adminGetScannerHeartbeat.useQuery(undefined, {
    refetchInterval: 10000 // 每10秒刷新心跳
  });
  const pendingOrdersQuery = trpc.recharge.adminGetPendingOrders.useQuery();
  const unmatchedQuery = trpc.recharge.adminGetUnmatchedTransactions.useQuery();

  const stats = statsQuery.data;

  // 手动刷新
  const handleRefresh = () => {
    setRefresh(prev => prev + 1);
    statsQuery.refetch();
    heartbeatQuery.refetch();
    pendingOrdersQuery.refetch();
    unmatchedQuery.refetch();
  };

  // 计算扫描器状态
  const getScannerStatus = () => {
    const heartbeat = heartbeatQuery.data;
    if (!heartbeat) {
      return { status: 'unknown', text: '未知', color: 'bg-gray-100 text-gray-800' };
    }
    
    const lastScanTime = new Date(heartbeat.lastScanAt).getTime();
    const now = Date.now();
    const diffMinutes = (now - lastScanTime) / 1000 / 60;
    
    if (diffMinutes < 2) {
      return { status: 'running', text: '✅ 正常运行', color: 'bg-green-100 text-green-800' };
    } else if (diffMinutes < 5) {
      return { status: 'warning', text: '⚠️ 响应迟缓', color: 'bg-yellow-100 text-yellow-800' };
    } else {
      return { status: 'stopped', text: '❌ 已停止', color: 'bg-red-100 text-red-800' };
    }
  };

  // 格式化相对时间
  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = Date.now();
    const diff = now - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (seconds < 60) return `${seconds}秒前`;
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    return formatDate(dateStr);
  };

  // 格式化时间
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  };

  // 订单状态配置
  const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
    pending: { label: '待支付', color: 'text-orange-700', bgColor: 'bg-orange-100', icon: Clock },
    submitted: { label: '确认中', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: Clock },
    completed: { label: '已完成', color: 'text-green-700', bgColor: 'bg-green-100', icon: CheckCircle2 },
    expired: { label: '已过期', color: 'text-gray-500', bgColor: 'bg-gray-100', icon: XCircle },
    cancelled: { label: '已取消', color: 'text-red-600', bgColor: 'bg-red-100', icon: XCircle },
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 顶部导航 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <button onClick={() => setLocation("/admin")} className="mr-3">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold">充值系统监控</h1>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${statsQuery.isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 扫描器状态 */}
        <div className="bg-white rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 flex items-center">
              <Activity className="w-5 h-5 mr-2 text-[#D32F2F]" />
              扫描器状态
            </h2>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getScannerStatus().color}`}>
              {getScannerStatus().text}
            </span>
          </div>
          
          <div className="space-y-2 text-sm">
            {/* 心跳信息 */}
            {heartbeatQuery.data && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600">最后扫描</span>
                  <span className="font-medium">{formatRelativeTime(heartbeatQuery.data.lastScanAt)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 py-2 border-t border-b border-gray-100">
                  <div className="text-center">
                    <div className="text-xs text-gray-500">扫描次数</div>
                    <div className="text-lg font-semibold text-gray-900">{heartbeatQuery.data.scanCount}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500">成功率</div>
                    <div className="text-lg font-semibold text-green-600">
                      {heartbeatQuery.data.scanCount > 0 
                        ? Math.round((heartbeatQuery.data.successCount! / heartbeatQuery.data.scanCount) * 100)
                        : 0}%
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">已匹配</span>
                    <span className="font-medium text-green-600">{heartbeatQuery.data.matchedOrders}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">未匹配</span>
                    <span className="font-medium text-orange-600">{heartbeatQuery.data.unmatchedTransactions}</span>
                  </div>
                </div>
                {heartbeatQuery.data.lastError && (
                  <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-700">
                    <div className="font-medium">最后错误：</div>
                    <div className="mt-1">{heartbeatQuery.data.lastError}</div>
                  </div>
                )}
              </>
            )}
            
            <div className="flex justify-between pt-2 border-t border-gray-100">
              <span className="text-gray-600">启用地址数</span>
              <span className="font-medium">{stats?.walletAddresses?.length || 0} 个</span>
            </div>
            {stats?.walletAddresses && stats.walletAddresses.length > 0 && (
              <div className="space-y-1">
                {stats.walletAddresses.map((wa: any) => (
                  <div key={wa.id} className="flex justify-between items-center">
                    <span className="text-gray-500 text-xs">{wa.label || wa.network}</span>
                    <span className="font-mono text-xs">{wa.address.slice(0, 8)}...{wa.address.slice(-6)}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setLocation('/admin/wallet-addresses')}
              className="w-full mt-2 py-2 text-sm text-[#D32F2F] border border-[#D32F2F] rounded-lg hover:bg-red-50 transition-colors"
            >
              管理收款地址
            </button>
          </div>
        </div>

        {/* 今日统计 */}
        <div className="bg-gradient-to-r from-[#D32F2F] to-[#E57373] rounded-lg p-5 text-white">
          <div className="flex items-center mb-2">
            <TrendingUp className="w-5 h-5 mr-2" />
            <span className="text-sm opacity-90">今日充值统计</span>
          </div>
          <div className="flex items-baseline gap-4">
            <div>
              <div className="text-3xl font-bold">{stats?.todayTotalAmount?.toFixed(2) || '0.00'}</div>
              <div className="text-sm opacity-90">USDT</div>
            </div>
            <div className="text-lg opacity-90">
              {stats?.todayCount || 0} 笔
            </div>
          </div>
        </div>

        {/* 订单状态统计 */}
        <div className="bg-white rounded-lg p-4">
          <h2 className="font-semibold text-gray-900 mb-3">订单状态统计</h2>
          <div className="grid grid-cols-2 gap-3">
            {stats?.orderStats?.map((stat: any) => {
              const config = statusConfig[stat.status] || statusConfig.pending;
              const StatusIcon = config.icon;
              return (
                <div key={stat.status} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600">{config.label}</span>
                    <StatusIcon className={`w-4 h-4 ${config.color}`} />
                  </div>
                  <div className="text-xl font-bold text-gray-900">{stat.count}</div>
                  <div className="text-xs text-gray-500">{stat.totalAmount.toFixed(2)} USDT</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 未匹配交易警告 */}
        {stats && stats.unmatchedCount > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium text-yellow-900">
                  {stats.unmatchedCount} 笔交易未匹配
                </div>
                <div className="text-sm text-yellow-700 mt-1">
                  总金额: {stats.unmatchedTotalAmount.toFixed(2)} USDT，需要手动处理
                </div>
                <button
                  onClick={() => setLocation("/admin/recharge/unmatched")}
                  className="mt-2 text-sm text-yellow-800 underline"
                >
                  查看详情 →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 最近订单 */}
        <div className="bg-white rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold text-gray-900">最近订单</h2>
          </div>
          {stats?.recentOrders && stats.recentOrders.length > 0 ? (
            <div className="divide-y">
              {stats.recentOrders.map((order: any) => {
                const config = statusConfig[order.status] || statusConfig.pending;
                const StatusIcon = config.icon;
                return (
                  <div key={order.id} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center">
                        <span className="font-medium text-gray-900">{order.amount} USDT</span>
                        <span className="text-xs text-gray-400 ml-2">{order.network}</span>
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
                        <StatusIcon className="w-3 h-3 mr-1" />
                        {config.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>订单号: {order.orderNo}</span>
                      <span>{formatDate(order.createdAt)}</span>
                    </div>
                    {order.txnHash && (
                      <div className="text-xs text-gray-400 mt-1 truncate">
                        交易哈希: {order.txnHash}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">暂无订单</div>
          )}
        </div>

        {/* 快捷操作 */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setLocation("/admin/recharge/manual-confirm")}
            className="bg-[#D32F2F] text-white py-3 rounded-lg font-medium text-sm hover:bg-[#B71C1C]"
          >
            手动确认
          </button>
          <button
            onClick={() => setLocation("/admin/wallet-addresses")}
            className="bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-medium text-sm"
          >
            收款地址
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setLocation("/admin/recharge/orders")}
            className="bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-medium text-sm"
          >
            所有订单
          </button>
          <button
            onClick={() => setLocation("/admin/recharge/unmatched")}
            className="bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-medium text-sm"
          >
            未匹配交易
          </button>
        </div>
      </div>
    </div>
  );
}
