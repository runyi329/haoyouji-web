import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ToggleLeft, ToggleRight, BarChart2, Zap, Calendar, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// 功能名称映射
const FEATURE_LABELS: Record<string, string> = {
  crypto_ai_analysis: "加密货币AI分析",
  generate_story: "儿童故事生成",
  recognize_business_card: "名片识别",
  recognize_address: "地址识别",
  recognize_bank: "银行信息识别",
  ai_insights: "客户意见洞察",
  recognize_qq_trade: "QQ交易图识别",
  analyze_qq_betting: "投注习惯分析",
  analyze_skin: "皮肤分析",
  gold_ai_analysis: "黄金AI分析",
  eth_position_analyze: "ETH持仓分析",
  diet_analysis: "饮食营养分析",
  lottery_analysis: "抽奖文案生成",
  okx_trader_chat: "OKX交易AI对话",
  prediction_analysis: "预测市场分析",
  bank_account_parser: "银行流水解析",
  ocr_recognize: "OCR文字识别",
  ai_employee: "AI员工(定时任务)",
  ai_search: "AI搜索增强",
  company_reports: "公司报告生成",
  db_ai_assistant: "AI数据助手",
};

// 功能颜色
const FEATURE_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-green-100 text-green-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
  "bg-cyan-100 text-cyan-700",
  "bg-indigo-100 text-indigo-700",
  "bg-yellow-100 text-yellow-700",
];

function getDateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days + 1);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

export default function AiTokenMonitor() {
  const [, navigate] = useLocation();
  const [dateRange, setDateRange] = useState(3); // 默认最近3天
  const { startDate, endDate } = useMemo(() => getDateRange(dateRange), [dateRange]);

  // 获取开关状态
  const { data: switches, refetch: refetchSwitches, isLoading: switchesLoading } =
    trpc.aiMonitor.getSwitches.useQuery();

  // 获取用量统计
  const { data: usageStats, isLoading: usageLoading, refetch: refetchUsage } =
    trpc.aiMonitor.getUsageStats.useQuery({ startDate, endDate });

  // 获取每日统计
  const { data: dailyStats, isLoading: dailyLoading } =
    trpc.aiMonitor.getDailyStats.useQuery({ startDate, endDate });

  // 切换开关
  const toggleMutation = trpc.aiMonitor.toggleSwitch.useMutation({
    onSuccess: () => {
      refetchSwitches();
      toast.success("开关已更新");
    },
    onError: (e) => toast.error("操作失败：" + e.message),
  });

  const handleToggle = (featureKey: string, currentEnabled: boolean) => {
    toggleMutation.mutate({ featureKey, enabled: !currentEnabled });
  };

  // 汇总统计
  const totalTokens = usageStats?.reduce((sum, s) => sum + (s.totalTokens || 0), 0) || 0;
  const totalCalls = usageStats?.reduce((sum, s) => sum + (s.callCount || 0), 0) || 0;
  const estimatedCost = (totalTokens / 1_000_000 * 2).toFixed(4); // DeepSeek ~$2/M tokens

  return (
    <div className="min-h-screen bg-gray-50 pb-20 max-w-md mx-auto">
      {/* Header */}
      <div className="bg-white sticky top-0 z-10 px-4 py-3 flex items-center gap-3 border-b border-gray-100 shadow-sm">
        <button onClick={() => navigate("/parent/profile")} className="p-1 -ml-1">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-base font-semibold text-gray-900 flex-1">AI Token 用量监控</h1>
        <button
          onClick={() => { refetchSwitches(); refetchUsage(); }}
          className="p-1 text-gray-500"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* 日期范围选择 */}
      <div className="px-4 pt-4">
        <div className="flex gap-2">
          {[3, 7, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDateRange(d)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                dateRange === d
                  ? "bg-purple-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200"
              }`}
            >
              近{d}天
            </button>
          ))}
        </div>
      </div>

      {/* 汇总卡片 */}
      <div className="px-4 mt-3 grid grid-cols-3 gap-2">
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <div className="text-xs text-gray-500 mb-1">总调用次数</div>
          <div className="text-lg font-bold text-purple-600">{totalCalls.toLocaleString()}</div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <div className="text-xs text-gray-500 mb-1">总Token数</div>
          <div className="text-lg font-bold text-blue-600">{(totalTokens / 1000).toFixed(1)}K</div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <div className="text-xs text-gray-500 mb-1">估算费用</div>
          <div className="text-lg font-bold text-orange-600">${estimatedCost}</div>
        </div>
      </div>

      {/* 每日趋势 */}
      {dailyStats && dailyStats.length > 0 && (
        <div className="px-4 mt-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-700">每日消耗</h3>
            </div>
            <div className="space-y-2">
              {dailyStats.map((day: any) => {
                const maxTokens = Math.max(...dailyStats.map((d: any) => d.totalTokens || 0), 1);
                const pct = Math.round(((day.totalTokens || 0) / maxTokens) * 100);
                return (
                  <div key={day.date} className="flex items-center gap-2">
                    <div className="text-xs text-gray-500 w-16 shrink-0">{day.date?.slice(5)}</div>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-purple-500 h-2 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-600 w-14 text-right shrink-0">
                      {((day.totalTokens || 0) / 1000).toFixed(1)}K
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 功能用量排行 */}
      <div className="px-4 mt-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700">功能用量排行</h3>
          </div>
          {usageLoading ? (
            <div className="text-center text-gray-400 text-sm py-4">加载中…</div>
          ) : !usageStats || usageStats.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-4">暂无数据</div>
          ) : (
            <div className="space-y-3">
              {usageStats
                .sort((a: any, b: any) => (b.totalTokens || 0) - (a.totalTokens || 0))
                .map((stat: any, idx: number) => {
                  const maxTokens = Math.max(...usageStats.map((s: any) => s.totalTokens || 0), 1);
                  const pct = Math.round(((stat.totalTokens || 0) / maxTokens) * 100);
                  const colorClass = FEATURE_COLORS[idx % FEATURE_COLORS.length];
                  const label = FEATURE_LABELS[stat.featureKey] || stat.featureKey;
                  return (
                    <div key={stat.featureKey}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorClass}`}>
                          {label}
                        </span>
                        <div className="text-right">
                          <span className="text-xs text-gray-500">{stat.callCount}次</span>
                          <span className="text-xs text-gray-400 mx-1">·</span>
                          <span className="text-xs font-medium text-gray-700">
                            {((stat.totalTokens || 0) / 1000).toFixed(1)}K tokens
                          </span>
                        </div>
                      </div>
                      <div className="bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-purple-500 h-1.5 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* 功能开关控制 */}
      <div className="px-4 mt-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700">功能开关控制</h3>
            <span className="text-xs text-gray-400 ml-auto">关闭后不再消耗Token</span>
          </div>
          {switchesLoading ? (
            <div className="text-center text-gray-400 text-sm py-4">加载中…</div>
          ) : !switches || switches.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-4">暂无功能记录（功能被调用后自动出现）</div>
          ) : (
            <div className="space-y-2">
              {switches.map((sw: any) => {
                const label = FEATURE_LABELS[sw.featureKey] || sw.featureKey;
                const isEnabled = sw.enabled !== false;
                return (
                  <div
                    key={sw.featureKey}
                    className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                  >
                    <div>
                      <div className="text-sm text-gray-800">{label}</div>
                      <div className="text-xs text-gray-400">{sw.featureKey}</div>
                    </div>
                    <button
                      onClick={() => handleToggle(sw.featureKey, isEnabled)}
                      disabled={toggleMutation.isPending}
                      className="ml-3 shrink-0"
                    >
                      {isEnabled ? (
                        <ToggleRight className="w-8 h-8 text-green-500" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-gray-300" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 说明 */}
      <div className="px-4 mt-3">
        <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
          <p className="text-xs text-amber-700 leading-relaxed">
            <strong>费用估算说明：</strong>基于 DeepSeek 官方定价约 $2/百万 tokens 计算，仅供参考。实际费用以平台账单为准。关闭开关后，该功能调用将立即返回错误提示，不再消耗 Token。
          </p>
        </div>
      </div>
    </div>
  );
}
