import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Bitcoin, RefreshCw, ChevronLeft, TrendingUp, Users, CheckCircle2, Circle, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

// ============================================================
// 工具函数
// ============================================================

function formatProbability(price: string): string {
  const num = parseFloat(price);
  if (isNaN(num)) return "0%";
  return `${(num * 100).toFixed(1)}%`;
}

function formatVolume(vol: string): string {
  const num = parseFloat(vol);
  if (isNaN(num)) return "$0";
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

function formatEndDate(dateStr: string | null): string {
  if (!dateStr) return "长期";
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return "已截止";
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "今天截止";
  if (days < 30) return `${days}天后截止`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}个月后截止`;
  return `${Math.floor(months / 12)}年后截止`;
}

// ============================================================
// 单个竞猜卡片
// ============================================================

interface PredictionEvent {
  id: number;
  question: string;
  outcomes: string[];
  outcomePrices: string[];
  volume: string | null;
  endDate: string | null;
  imageUrl: string | null;
  myPrediction: { selectedOutcome: string; selectedIndex: number } | null;
}

function EventCard({
  event,
  ledgerId,
  onPredicted,
}: {
  event: PredictionEvent;
  ledgerId: number;
  onPredicted: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(
    event.myPrediction ? event.myPrediction.selectedIndex : null
  );
  const [expanded, setExpanded] = useState(false);

  const submitMutation = trpc.prediction.submitPrediction.useMutation({
    onSuccess: () => {
      toast.success("预测已提交 ✓", { description: "你的观点已记录" });
      onPredicted();
    },
    onError: (e) => {
      toast.error("提交失败", { description: e.message });
    },
  });

  const { data: statsData } = trpc.prediction.getEventStats.useQuery(
    { ledgerId, eventId: event.id },
    { enabled: expanded }
  );

  function handleSelect(idx: number) {
    if (submitMutation.isPending) return;
    setSelected(idx);
    submitMutation.mutate({
      ledgerId,
      eventId: event.id,
      selectedOutcome: event.outcomes[idx],
      selectedIndex: idx,
    });
  }

  const hasPredicted = selected !== null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-3 relative">
      {/* 题目 */}
      <div className="px-4 pt-4 pb-3">
        <p className="text-sm font-medium text-gray-800 leading-relaxed">{event.question}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
          {event.volume && (
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {formatVolume(event.volume)} 交易量
            </span>
          )}
          <span>{formatEndDate(event.endDate)}</span>
        </div>
      </div>

      {/* 选项按钮 */}
      <div className="px-4 pb-3 space-y-2">
        {event.outcomes.map((outcome, idx) => {
          const prob = event.outcomePrices[idx];
          const probNum = parseFloat(prob || "0");
          const isSelected = selected === idx;
          const isYes = idx === 0;

          return (
            <button
              key={idx}
              onClick={() => handleSelect(idx)}
              disabled={submitMutation.isPending}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${
                isSelected
                  ? isYes
                    ? "border-[#D32F2F] bg-[#FFF5F5]"
                    : "border-gray-700 bg-gray-50"
                  : "border-gray-100 bg-gray-50 active:bg-gray-100"
              }`}
            >
              <div className="flex items-center gap-2">
                {isSelected ? (
                  <CheckCircle2 className={`w-4 h-4 ${isYes ? "text-[#D32F2F]" : "text-gray-700"}`} />
                ) : (
                  <Circle className="w-4 h-4 text-gray-300" />
                )}
                <span className={`text-sm font-medium ${isSelected ? (isYes ? "text-[#D32F2F]" : "text-gray-800") : "text-gray-600"}`}>
                  {outcome === "Yes" ? "会" : outcome === "No" ? "不会" : outcome}
                </span>
              </div>
              <div className="text-right">
                <div className={`text-base font-bold ${probNum >= 0.5 ? "text-[#D32F2F]" : "text-gray-500"}`}>
                  {formatProbability(prob)}
                </div>
                <div className="text-xs text-gray-400">市场概率</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 展开查看成员投票分布 */}
      {hasPredicted && (
        <div className="border-t border-gray-50">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-gray-400 active:bg-gray-50"
          >
            <Users className="w-3.5 h-3.5" />
            {expanded ? "收起成员预测" : "查看成员预测分布"}
          </button>
          {expanded && statsData && (
            <div className="px-4 pb-3">
              <div className="text-xs text-gray-400 mb-2">共 {statsData.total} 人预测</div>
              {event.outcomes.map((outcome, idx) => {
                const displayName = outcome === "Yes" ? "会" : outcome === "No" ? "不会" : outcome;
                const count = statsData.distribution[outcome] || 0;
                const pct = statsData.total > 0 ? Math.round((count / statsData.total) * 100) : 0;
                return (
                  <div key={idx} className="mb-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600">{displayName}</span>
                      <span className="text-gray-500">{count}人 ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${idx === 0 ? "bg-[#D32F2F]" : "bg-gray-400"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 加载中遮罩 */}
      {submitMutation.isPending && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-2xl">
          <Loader2 className="w-5 h-5 animate-spin text-[#D32F2F]" />
        </div>
      )}
    </div>
  );
}

// ============================================================
// 主页面
// ============================================================

export default function CryptoPrediction() {
  const [, params] = useRoute("/ledger/:id/crypto-prediction");
  const [, setLocation] = useLocation();
  const ledgerId = parseInt(params?.id || "0");
  const [activeCoin, setActiveCoin] = useState<"BTC" | "ETH">("BTC");

  const { data, isLoading, refetch, isFetching } = trpc.prediction.listEvents.useQuery(
    { ledgerId, coin: activeCoin, limit: 30 },
    { enabled: !!ledgerId }
  );

  const syncMutation = trpc.prediction.syncPolymarket.useMutation({
    onSuccess: (res) => {
      toast.success("同步完成", { description: `已同步 ${res.synced} 条 ${activeCoin} 竞猜事件` });
      refetch();
    },
    onError: (e) => {
      toast.error("同步失败", { description: e.message });
    },
  });

  const events: PredictionEvent[] = (data?.events || []) as PredictionEvent[];

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => setLocation(`/ledger/${ledgerId}`)} className="p-1 -ml-1">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-base font-semibold text-gray-800 flex-1">加密货币竞猜</h1>
          <button
            onClick={() => syncMutation.mutate({ coin: activeCoin })}
            disabled={syncMutation.isPending || isFetching}
            className="flex items-center gap-1 text-xs text-[#D32F2F] px-2 py-1 rounded-lg active:bg-red-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${(syncMutation.isPending || isFetching) ? "animate-spin" : ""}`} />
            同步
          </button>
        </div>

        {/* BTC / ETH 切换 */}
        <div className="flex px-4 pb-3 gap-2">
          {(["BTC", "ETH"] as const).map((coin) => (
            <button
              key={coin}
              onClick={() => setActiveCoin(coin)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeCoin === coin
                  ? "bg-[#D32F2F] text-white shadow-sm"
                  : "bg-gray-100 text-gray-500"
              }`}
            >
              <Bitcoin className="w-4 h-4" />
              {coin}
            </button>
          ))}
        </div>
      </div>

      {/* 说明横幅 */}
      <div className="mx-4 mt-3 mb-1 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 leading-relaxed">
          竞猜数据来自 <span className="font-semibold">Polymarket</span> 预测市场，概率为实时市场价格，仅供参考，不构成投资建议。本功能不涉及资金。
        </p>
      </div>

      {/* 事件列表 */}
      <div className="px-4 pt-3 pb-24">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-[#D32F2F] animate-spin" />
            <p className="text-sm text-gray-400">加载中...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Bitcoin className="w-14 h-14 text-gray-200" />
            <p className="text-base text-gray-400 font-medium">暂无 {activeCoin} 竞猜事件</p>
            <p className="text-sm text-gray-400">点击右上角「同步」拉取最新数据</p>
            <button
              onClick={() => syncMutation.mutate({ coin: activeCoin })}
              disabled={syncMutation.isPending}
              className="mt-2 flex items-center gap-2 bg-[#D32F2F] text-white px-5 py-2.5 rounded-xl text-sm font-medium active:bg-[#B71C1C]"
            >
              <RefreshCw className={`w-4 h-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              立即同步 Polymarket 数据
            </button>
          </div>
        ) : (
          events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              ledgerId={ledgerId}
              onPredicted={() => refetch()}
            />
          ))
        )}
      </div>
    </div>
  );
}
