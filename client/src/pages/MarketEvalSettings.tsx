import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Loader2, RefreshCw, Database, WifiOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

// 序号字符：①②③...
const CIRCLE_NUMS = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩","⑪","⑫","⑬","⑭","⑮","⑯","⑰","⑱","⑲","⑳"];

// ============================================================
// 编译版计算逻辑
// ============================================================

// 高胜率分界线（≥70% 胜率 → 年化；< 70% → 倍数）
const HIGH_WIN_THRESHOLD = 0.70;

interface CompiledOdds {
  type: "annualized" | "multiplier";
  // 年化类型
  annualizedPct?: number;    // 年化收益率，如 19.4
  daysLeft?: number;         // 剩余天数
  winProb?: number;          // 胜率 %
  // 倍数类型
  multiplier?: number;       // 倍数，如 6.25
  winProbPct?: number;       // 胜率 %
}

/**
 * 计算编译版赔率展示
 * @param outcomes  结果数组，如 ["Yes","No"]
 * @param outcomePrices 概率数组，如 ["0.84","0.16"]（对应 No/Yes 的概率）
 * @param endDate   截止日期字符串
 */
function compileOdds(
  outcomes: string[],
  outcomePrices: string[],
  endDate: string | null
): CompiledOdds | null {
  if (!outcomes || outcomes.length === 0 || !outcomePrices || outcomePrices.length === 0) {
    return null;
  }

  // 找 "Yes" 对应的概率（第一个 outcome 通常是 Yes）
  const yesIdx = outcomes.findIndex(
    (o) => o.toLowerCase() === "yes" || o.toLowerCase() === "会"
  );
  const targetIdx = yesIdx >= 0 ? yesIdx : 0;
  const prob = parseFloat(outcomePrices[targetIdx] || "0");

  if (isNaN(prob) || prob <= 0 || prob >= 1) return null;

  if (prob >= HIGH_WIN_THRESHOLD) {
    // ── 高胜率：折算年化 ──
    // 净收益率 = (1 - prob) / prob
    const netReturn = (1 - prob) / prob;

    // 计算剩余天数
    let daysLeft = 30; // 默认30天
    if (endDate) {
      const end = new Date(endDate);
      const now = new Date();
      const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diff > 0) daysLeft = diff;
    }

    // 年化 = 净收益率 / 剩余天数 × 365
    const annualizedPct = (netReturn / daysLeft) * 365 * 100;

    return {
      type: "annualized",
      annualizedPct: Math.round(annualizedPct * 10) / 10,
      daysLeft,
      winProb: Math.round(prob * 100),
    };
  } else {
    // ── 低胜率：折算倍数 ──
    // 倍数 = 1 / prob（买1元，赢 1/prob 元）
    const multiplier = 1 / prob;

    return {
      type: "multiplier",
      multiplier: Math.round(multiplier * 10) / 10,
      winProbPct: Math.round(prob * 100),
    };
  }
}

// ============================================================
// 编译版赔率展示组件
// ============================================================
function CompiledOddsDisplay({ compiled }: { compiled: CompiledOdds | null }) {
  if (!compiled) return null;

  if (compiled.type === "annualized") {
    return (
      <div className="mt-2 flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
          <span className="text-xs text-emerald-600">年化收益</span>
          <span className="text-base font-bold text-emerald-700">
            {compiled.annualizedPct}%
          </span>
        </div>
        <div className="text-xs text-gray-400">
          胜率 {compiled.winProb}% · 剩余 {compiled.daysLeft} 天
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5">
        <span className="text-xs text-orange-600">赔率</span>
        <span className="text-base font-bold text-orange-700">
          {compiled.multiplier}倍
        </span>
      </div>
      <div className="text-xs text-gray-400">
        胜率 {compiled.winProbPct}%
      </div>
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================
export default function MarketEvalSettings() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 1;
  const [coin, setCoin] = useState<"BTC" | "ETH" | "SOL">("BTC");
  // 三个版本 Tab
  const [tab, setTab] = useState<"raw" | "zh" | "compiled">("raw");

  const utils = trpc.useUtils();

  const { data: cacheStatus, refetch: refetchStatus } = trpc.prediction.getCacheStatus.useQuery(
    { coin },
    { staleTime: 10000 }
  );

  const { data, isLoading, error, refetch } = trpc.prediction.listEventsForAdmin.useQuery(
    { ledgerId, coin },
    { staleTime: 10000, retry: 1 }
  );

  const events = data?.events || [];
  const cacheEmpty = data?.cacheEmpty ?? (events.length === 0);
  const zhCount = events.filter((e: any) => e.questionZh).length;

  const WORKER_URL = "https://polymarket-proxy.runyihongkong.workers.dev";
  const [isRefreshing, setIsRefreshing] = useState(false);

  const saveCacheMutation = trpc.prediction.saveCache.useMutation({
    onSuccess: (result) => {
      toast.success(`刷新成功，已更新 ${result.synced} 条 ${result.coin} 事件数据`, {
        description: "AI 正在后台翻译中文标题，约1分钟后刷新页面可查看",
      });
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
      const res = await fetch(`${WORKER_URL}/events?coin=${coin}&limit=100`, {
        signal: AbortSignal.timeout(20000),
        headers: { "Accept": "application/json" },
      });
      if (!res.ok) throw new Error(`Worker 返回 ${res.status}`);
      const data = await res.json() as { events: any[]; count: number };
      const workerEvents = data.events || [];
      if (workerEvents.length === 0) {
        toast.error("未获取到数据", { description: "请确认已切换5G网络" });
        return;
      }
      saveCacheMutation.mutate({
        coin,
        events: workerEvents.map((e: any) => {
          let outcomes: string[] = [];
          let outcomePrices: string[] = [];
          if (e.odds && Array.isArray(e.odds)) {
            outcomes = e.odds.map((o: any) => o.outcome || 'Yes');
            outcomePrices = e.odds.map((o: any) => String((o.probability || 0) / 100));
          } else {
            outcomes = e.outcomes || [];
            outcomePrices = (e.outcomePrices || []).map(String);
          }
          return {
            question: e.question,
            outcomes,
            outcomePrices,
            volume: e.volume ? String(e.volume) : null,
            endDate: e.endDate || null,
            imageUrl: e.imageUrl || null,
          };
        }),
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

  const TAB_LABELS = [
    { key: "raw", label: "原始" },
    { key: "zh", label: "翻译" },
    { key: "compiled", label: "编译" },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-10 bg-[#B71C1C] text-white">
        <div className="flex items-center justify-between h-14 px-4">
          <button onClick={() => setLocation(`/ledger/${ledgerId}/settings`)} className="p-2 -ml-2">
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
              coin === c ? "bg-[#B71C1C] text-white" : "bg-white text-gray-600 border border-gray-200"
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
              {events.length > 0 && (
                <p className="text-xs mt-0.5" style={{ color: zhCount === events.length ? "#16a34a" : "#d97706" }}>
                  {zhCount === events.length
                    ? `✓ 中文翻译完成（${zhCount}/${events.length}）`
                    : `AI 翻译中（${zhCount}/${events.length}）…刷新页面查看进度`}
                </p>
              )}
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

      {/* 三版本 Tab + 说明 */}
      <div className="px-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-500 leading-relaxed flex-1 mr-3">
            勾选后，对应事件将在行情评估页面显示给成员。三个版本打勾状态同步。
          </p>
          {events.length > 0 && (
            <div className="flex rounded-lg overflow-hidden border border-gray-200 shrink-0">
              {TAB_LABELS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    tab === key ? "bg-[#B71C1C] text-white" : "bg-white text-gray-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 编译版说明 */}
        {tab === "compiled" && events.length > 0 && (
          <div className="bg-blue-50 rounded-lg px-3 py-2 mb-2">
            <p className="text-xs text-blue-700 leading-relaxed">
              <span className="font-semibold">编译版</span>：胜率 ≥70% 显示<span className="text-emerald-600 font-medium">年化收益率</span>，胜率 &lt;70% 显示<span className="text-orange-600 font-medium">赔率倍数</span>。前端用户看到的是此版本。
            </p>
          </div>
        )}
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
            <button onClick={() => refetch()} className="px-4 py-2 bg-[#B71C1C] text-white rounded-lg text-sm">
              重试
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">暂无 {coin} 缓存数据，请先点击「刷新数据」</p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((event: any, idx: number) => {
              const circleNum = CIRCLE_NUMS[idx] || `${idx + 1}.`;
              const compiled = compileOdds(event.outcomes, event.outcomePrices, event.endDate);

              // 根据 Tab 决定显示的标题
              let displayTitle: string;
              let titleStyle = "text-gray-800";
              if (tab === "raw") {
                displayTitle = event.question;
              } else if (tab === "zh") {
                if (event.questionZh) {
                  displayTitle = event.questionZh;
                } else {
                  displayTitle = "翻译中...";
                  titleStyle = "text-gray-400 italic";
                }
              } else {
                // 编译版：优先用中文翻译，没有就用英文
                displayTitle = event.questionZh || event.question;
              }

              return (
                <div key={idx} className="bg-white rounded-xl p-4 flex items-start gap-3">
                  {/* 序号 */}
                  <span className="text-sm font-bold text-[#B71C1C] shrink-0 mt-0.5 w-6 text-center">
                    {circleNum}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-relaxed break-words ${titleStyle}`}>
                      {displayTitle}
                    </p>

                    {/* 原始版 / 翻译版：显示原始赔率 */}
                    {(tab === "raw" || tab === "zh") && event.outcomes && event.outcomes.length > 0 && (
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

                    {/* 编译版：显示年化/倍数 */}
                    {tab === "compiled" && <CompiledOddsDisplay compiled={compiled} />}

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
                  {/* 打勾开关（三个版本共用，状态同步） */}
                  <Switch
                    checked={event.visible}
                    onCheckedChange={() => handleToggle(event.question, event.visible)}
                    disabled={toggleMutation.isPending}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="h-8" />
    </div>
  );
}
