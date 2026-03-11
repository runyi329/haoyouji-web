import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Loader2, RefreshCw, Database, WifiOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

export default function MarketEvalSettings() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 1;
  const [coin, setCoin] = useState<"BTC" | "ETH" | "SOL">("BTC");

  const utils = trpc.useUtils();

  // 查询缓存状态（最后刷新时间 + 条数）
  const { data: cacheStatus, refetch: refetchStatus } = trpc.prediction.getCacheStatus.useQuery(
    { coin },
    { staleTime: 10000 }
  );

  // 从数据库缓存读取事件列表（含可见性设置）
  const { data, isLoading, error, refetch } = trpc.prediction.listEventsForAdmin.useQuery(
    { ledgerId, coin },
    { staleTime: 10000, retry: 1 }
  );

  const events = data?.events || [];
  const cacheEmpty = data?.cacheEmpty ?? (events.length === 0);

  const WORKER_URL = "https://polymarket-proxy.runyihongkong.workers.dev";
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 存入数据库的 mutation
  const saveCacheMutation = trpc.prediction.saveCache.useMutation({
    onSuccess: (result) => {
      toast.success(`刷新成功，已更新 ${result.synced} 条 ${result.coin} 事件数据`);
      refetch();
      refetchStatus();
      utils.prediction.listEventsForAdmin.invalidate({ ledgerId, coin });
    },
    onError: (e) => {
      toast.error("存入失败", { description: e.message });
    },
  });

  const lastRefreshed = cacheStatus?.lastRefreshed
    ? new Date(cacheStatus.lastRefreshed).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // 切换可见性
  const toggleMutation = trpc.prediction.setEventVisibility.useMutation({
    onSuccess: () => {
      utils.prediction.listEventsForAdmin.invalidate({ ledgerId, coin });
      utils.prediction.getVisibleQuestions.invalidate({ ledgerId, coin });
    },
    onError: (e) => {
      toast.error("设置失败", { description: e.message });
    },
  });

  const handleToggle = (question: string, currentVisible: boolean) => {
    toggleMutation.mutate({ ledgerId, coin, question, visible: !currentVisible });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // 前端直接请求 Cloudflare Worker（5G可访问）
      const res = await fetch(`${WORKER_URL}/events?coin=${coin}&limit=100`, {
        signal: AbortSignal.timeout(20000),
        headers: { "Accept": "application/json" },
      });
      if (!res.ok) {
        throw new Error(`Worker 返回 ${res.status}`);
      }
      const data = await res.json() as { events: any[]; count: number };
      const workerEvents = data.events || [];
      if (workerEvents.length === 0) {
        toast.error("未获取到数据", { description: "请确认已切换5G网络" });
        return;
      }
      // 将数据通过 tRPC 存入数据库
      saveCacheMutation.mutate({
        coin,
        events: workerEvents.map((e: any) => ({
          question: e.question,
          outcomes: e.outcomes || [],
          outcomePrices: (e.outcomePrices || []).map(String),
          volume: e.volume ? String(e.volume) : null,
          endDate: e.endDate || null,
          imageUrl: e.imageUrl || null,
        })),
      });
    } catch (err: any) {
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        toast.error("请求超时", { description: "请切换5G网络后重试" });
      } else {
        toast.error("刷新失败", { description: err.message || "请切换5G网络后重试" });
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-10 bg-[#B71C1C] text-white">
        <div className="flex items-center justify-between h-14 px-4">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
            className="p-2 -ml-2"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-base font-semibold">竞猜事件设置</span>
          <div className="w-9" />
        </div>
      </div>

      {/* 币种切换 */}
      <div className="flex gap-2 px-4 py-3">
        {(["BTC", "ETH", "SOL"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCoin(c)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              coin === c
                ? "bg-[#B71C1C] text-white"
                : "bg-white text-gray-600 border border-gray-200"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* 刷新数据区域 */}
      <div className="mx-4 mb-3 bg-white rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-700">Polymarket 数据</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {lastRefreshed
                  ? `上次刷新：${lastRefreshed}（共 ${cacheStatus?.count ?? 0} 条）`
                  : "尚未刷新，暂无缓存数据"}
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || saveCacheMutation.isPending}
            className="flex items-center gap-1.5 bg-[#B71C1C] text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60 active:scale-95 transition-transform"
          >
            <RefreshCw className={`w-4 h-4 ${(isRefreshing || saveCacheMutation.isPending) ? "animate-spin" : ""}`} />
            {isRefreshing ? "获取中..." : saveCacheMutation.isPending ? "存入中..." : "刷新数据"}
          </button>
        </div>
        {cacheEmpty && !isRefreshing && !saveCacheMutation.isPending && (
          <div className="mt-3 flex items-start gap-2 bg-amber-50 rounded-lg px-3 py-2">
            <WifiOff className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 leading-relaxed">
              暂无缓存数据。请在手机5G网络下点击「刷新数据」，数据将保存到数据库供所有成员使用。
            </p>
          </div>
        )}
      </div>

      {/* 说明 */}
      <div className="px-4 pb-2">
        <p className="text-xs text-gray-500 leading-relaxed">
          勾选后，对应的事件将在行情评估页面中显示给所有成员。未勾选任何事件时，默认显示全部。
        </p>
      </div>

      {/* 事件列表 */}
      <div className="px-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            <p className="text-sm text-gray-500">正在加载事件列表...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-sm text-red-500">加载失败：{error.message}</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-[#B71C1C] text-white rounded-lg text-sm"
            >
              重试
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">暂无 {coin} 缓存数据，请先点击「刷新数据」</p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((event, idx) => (
              <div
                key={idx}
                className="bg-white rounded-xl p-4 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-relaxed break-words">
                    {event.question}
                  </p>
                  {/* 赔率盘口 */}
                  {event.outcomes && event.outcomes.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      {event.outcomes.map((outcome: string, oi: number) => {
                        const price = event.outcomePrices?.[oi];
                        const pct = price ? Math.round(parseFloat(price) * 100) : null;
                        const isYes = oi === 0;
                        return (
                          <div key={oi} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
                            isYes ? "bg-teal-50 text-teal-700" : "bg-red-50 text-red-600"
                          }`}>
                            <span>{outcome === "Yes" ? "会" : outcome === "No" ? "不会" : outcome}</span>
                            {pct !== null && <span className="font-bold">{pct}%</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    {event.volume && (
                      <span className="text-xs text-gray-400">
                        交易量: ${Number(event.volume).toLocaleString()}
                      </span>
                    )}
                    {event.endDate && (
                      <span className="text-xs text-gray-400">
                        截止: {new Date(event.endDate).toLocaleDateString("zh-CN")}
                      </span>
                    )}
                  </div>
                </div>
                <Switch
                  checked={event.visible}
                  onCheckedChange={() => handleToggle(event.question, event.visible)}
                  disabled={toggleMutation.isPending}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="h-8" />
    </div>
  );
}
