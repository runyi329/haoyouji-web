import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, ChevronDown, ChevronRight, Loader2, RefreshCw, Database, WifiOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

// 序号字符
const CIRCLE_NUMS = ["①","②","③","④","⑤","⑥","⑦","⑧","⑨","⑩","⑪","⑫","⑬","⑭","⑮","⑯","⑰","⑱","⑲","⑳"];

// ============================================================
// 编译版计算逻辑
// ============================================================
const HIGH_WIN_THRESHOLD = 0.70;

interface CompiledOdds {
  type: "annualized" | "multiplier";
  annualizedPct?: number;
  daysLeft?: number;
  winProb?: number;
  multiplier?: number;
  winProbPct?: number;
}

function compileOdds(outcomes: string[], outcomePrices: string[], endDate: string | null): CompiledOdds | null {
  if (!outcomes?.length || !outcomePrices?.length) return null;
  const yesIdx = outcomes.findIndex(o => o.toLowerCase() === "yes" || o.toLowerCase() === "会");
  const targetIdx = yesIdx >= 0 ? yesIdx : 0;
  const prob = parseFloat(outcomePrices[targetIdx] || "0");
  if (isNaN(prob) || prob <= 0 || prob >= 1) return null;

  if (prob >= HIGH_WIN_THRESHOLD) {
    const netReturn = (1 - prob) / prob;
    let daysLeft = 30;
    if (endDate) {
      const end = new Date(endDate);
      const now = new Date();
      const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diff > 0) daysLeft = diff;
    }
    const annualizedPct = (netReturn / daysLeft) * 365 * 100;
    return { type: "annualized", annualizedPct: Math.round(annualizedPct * 10) / 10, daysLeft, winProb: Math.round(prob * 100) };
  } else {
    return { type: "multiplier", multiplier: Math.round((1 / prob) * 10) / 10, winProbPct: Math.round(prob * 100) };
  }
}

function CompiledOddsTag({ compiled }: { compiled: CompiledOdds | null }) {
  if (!compiled) return null;
  if (compiled.type === "annualized") {
    return (
      <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded px-2 py-0.5 text-xs">
        <span className="text-emerald-600">年化</span>
        <span className="font-bold text-emerald-700">{compiled.annualizedPct}%</span>
        <span className="text-gray-400">· {compiled.daysLeft}天 · 胜率{compiled.winProb}%</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 bg-orange-50 border border-orange-200 rounded px-2 py-0.5 text-xs">
      <span className="text-orange-600">赔率</span>
      <span className="font-bold text-orange-700">{compiled.multiplier}倍</span>
      <span className="text-gray-400">· 胜率{compiled.winProbPct}%</span>
    </span>
  );
}

// ============================================================
// 单个事件组卡片
// ============================================================
function EventGroupCard({
  group,
  idx,
  tab,
  onToggle,
  togglePending,
}: {
  group: any;
  idx: number;
  tab: "raw" | "zh" | "compiled";
  onToggle: (group: any, currentVisible: boolean) => void;
  togglePending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const circleNum = CIRCLE_NUMS[idx] || `${idx + 1}.`;

  // 事件组标题
  let groupTitle: string;
  let groupTitleStyle = "text-gray-800 font-semibold";
  if (tab === "raw") {
    groupTitle = group.eventTitle;
  } else if (tab === "zh") {
    groupTitle = group.eventTitleZh || "翻译中...";
    if (!group.eventTitleZh) groupTitleStyle = "text-gray-400 italic font-normal";
  } else {
    groupTitle = group.eventTitleZh || group.eventTitle;
  }

  const markets: any[] = group.markets || [];
  const hasMultipleMarkets = markets.length > 1;

  return (
    <div className="bg-white rounded-xl overflow-hidden">
      {/* 事件组头部 */}
      <div className="flex items-start gap-3 p-4">
        <span className="text-sm font-bold text-[#B71C1C] shrink-0 mt-0.5 w-6 text-center">{circleNum}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-relaxed break-words ${groupTitleStyle}`}>{groupTitle}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-400">{markets.length} 个价格档位</span>
            {hasMultipleMarkets && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-0.5 text-xs text-[#B71C1C] font-medium"
              >
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {expanded ? "收起" : "展开"}
              </button>
            )}
          </div>
        </div>
        <Switch
          checked={group.visible}
          onCheckedChange={() => onToggle(group, group.visible)}
          disabled={togglePending}
        />
      </div>

      {/* 档位列表（展开后显示） */}
      {(expanded || !hasMultipleMarkets) && markets.length > 0 && (
        <div className="border-t border-gray-100">
          {markets.map((market: any, mi: number) => {
            let mTitle: string;
            let mTitleStyle = "text-gray-700";
            if (tab === "raw") {
              mTitle = market.question;
            } else if (tab === "zh") {
              mTitle = market.questionZh || "翻译中...";
              if (!market.questionZh) mTitleStyle = "text-gray-400 italic";
            } else {
              mTitle = market.questionZh || market.question;
            }

            const compiled = compileOdds(market.outcomes, market.outcomePrices, market.endDate);

            return (
              <div key={mi} className={`px-4 py-3 ${mi > 0 ? "border-t border-gray-50" : ""}`}>
                <div className="flex items-start gap-2 ml-9">
                  <span className="text-xs text-gray-400 shrink-0 mt-0.5 w-4 text-center">{mi + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs leading-relaxed break-words ${mTitleStyle}`}>{mTitle}</p>

                    {/* 原始/翻译版：显示原始概率 */}
                    {(tab === "raw" || tab === "zh") && market.outcomes?.length > 0 && (
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        {market.outcomes.map((outcome: string, oi: number) => {
                          const price = market.outcomePrices?.[oi];
                          const pct = price ? Math.round(parseFloat(price) * 100) : null;
                          const isYes = oi === 0;
                          return (
                            <span key={oi} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${
                              isYes ? "bg-teal-50 text-teal-700" : "bg-red-50 text-red-600"
                            }`}>
                              {outcome === "Yes" ? "会" : outcome === "No" ? "不会" : outcome}
                              {pct !== null && <span className="font-bold">{pct}%</span>}
                            </span>
                          );
                        })}
                        {market.volume && (
                          <span className="text-xs text-gray-400">
                            ${Number(market.volume).toLocaleString()}
                          </span>
                        )}
                        {market.endDate && (
                          <span className="text-xs text-gray-400">
                            截止{new Date(market.endDate).toLocaleDateString("zh-CN")}
                          </span>
                        )}
                      </div>
                    )}

                    {/* 编译版：显示年化/倍数 */}
                    {tab === "compiled" && (
                      <div className="mt-1.5">
                        <CompiledOddsTag compiled={compiled} />
                        {market.endDate && (
                          <span className="ml-2 text-xs text-gray-400">
                            截止{new Date(market.endDate).toLocaleDateString("zh-CN")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
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

  const eventGroups: any[] = data?.eventGroups || [];
  const cacheEmpty = data?.cacheEmpty ?? (eventGroups.length === 0);

  // 翻译进度
  const totalForTranslation = cacheStatus?.totalForTranslation ?? 0;
  const untranslated = cacheStatus?.untranslated ?? 0;
  const translatedCount = totalForTranslation - untranslated;

  const WORKER_URL = "https://polymarket-proxy.runyihongkong.workers.dev";
  const [isRefreshing, setIsRefreshing] = useState(false);

  const saveCacheMutation = trpc.prediction.saveCache.useMutation({
    onSuccess: (result) => {
      toast.success(`刷新成功，已更新 ${result.synced} 个价格档位`, {
        description: "AI 正在后台翻译中文标题，约1分钟后刷新页面可查看",
      });
      refetch();
      refetchStatus();
    },
    onError: (e) => {
      toast.error("存入失败", { description: e.message });
    },
  });

  const lastRefreshed = cacheStatus?.lastRefreshed
    ? new Date(cacheStatus.lastRefreshed).toLocaleString("zh-CN", {
        month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
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

  const handleToggle = (group: any, currentVisible: boolean) => {
    toggleMutation.mutate({
      ledgerId,
      coin,
      question: group.eventTitle,
      visible: !currentVisible,
      eventGroupId: group.groupId || null,
    });
  };

  // 解析 Polymarket market 对象，处理 outcomes/outcomePrices 可能是字符串的情况
  const parseMarket = (m: any, eventTitle: string) => {
    let outcomes: string[], outcomePrices: string[];
    try {
      outcomes = typeof m.outcomes === "string" ? JSON.parse(m.outcomes) : (m.outcomes || ["Yes", "No"]);
      outcomePrices = typeof m.outcomePrices === "string" ? JSON.parse(m.outcomePrices) : (m.outcomePrices || ["0.5", "0.5"]);
    } catch {
      outcomes = ["Yes", "No"];
      outcomePrices = ["0.5", "0.5"];
    }
    return {
      question: m.question || eventTitle,
      outcomes,
      outcomePrices,
      volume: String(m.volume || "0"),
      endDate: m.endDate || null,
      imageUrl: m.image || null,
    };
  };

  // 精准 slug 映射（直接抓取指定事件）
  const ETH_SLUGS: Record<string, string> = {
    ETH: "what-price-will-ethereum-hit-in-march-2026",
    BTC: "what-price-will-bitcoin-hit-in-march-2026",
    SOL: "what-price-will-solana-hit-in-march-2026",
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // 精准抓取指定事件（直接请求 Polymarket gamma-api）
      const slug = ETH_SLUGS[coin];
      const url = `https://gamma-api.polymarket.com/events?slug=${slug}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        headers: { "Accept": "application/json" },
      });

      if (!res.ok) throw new Error(`API 返回 ${res.status}`);
      const allEvents = await res.json() as any[];

      if (!allEvents || allEvents.length === 0) {
        // 精准 slug 找不到，降级到按关键词搜索
        throw new Error("精准slug未找到事件，降级搜索");
      }

      // 转换为事件组格式
      const eventGroups: any[] = [];
      for (const event of allEvents) {
        const activeMarkets = (event.markets || []).filter((m: any) => !m.closed);
        if (activeMarkets.length === 0) continue;
        eventGroups.push({
          eventTitle: event.title,
          imageUrl: event.image || null,
          markets: activeMarkets.map((m: any) => parseMarket(m, event.title)),
        });
      }

      if (eventGroups.length === 0) {
        toast.error("未找到活跃事件", { description: "该事件可能已结束" });
        return;
      }

      saveCacheMutation.mutate({ coin, eventGroups });
    } catch (err: any) {
      // 降级：按关键词搜索所有加密事件
      try {
        const directRes = await fetch(
          `https://gamma-api.polymarket.com/events?limit=100&active=true&order=volume&ascending=false&tag_slug=crypto`,
          { signal: AbortSignal.timeout(20000), headers: { "Accept": "application/json" } }
        );
        if (!directRes.ok) throw new Error(`Polymarket API 返回 ${directRes.status}`);
        const allEvents = await directRes.json() as any[];

        const keywords: Record<string, string[]> = {
          BTC: ["bitcoin", "btc"],
          ETH: ["ethereum", "eth"],
          SOL: ["solana", "sol"],
        };
        const kws = keywords[coin] || [];

        // 按事件组分组
        const eventGroups: any[] = [];
        for (const event of allEvents) {
          const title = (event.title || "").toLowerCase();
          if (!kws.some(kw => title.includes(kw))) continue;

          const activeMarkets = (event.markets || []).filter((m: any) => !m.closed);
          if (activeMarkets.length === 0) continue;

          eventGroups.push({
            eventTitle: event.title,
            imageUrl: event.image || null,
            markets: activeMarkets.map((m: any) => parseMarket(m, event.title)),
          });
        }

        if (eventGroups.length === 0) {
          toast.error("未获取到数据", { description: "请确认已切换5G网络" });
          return;
        }

        saveCacheMutation.mutate({ coin, eventGroups });
      } catch (directErr: any) {
        if (directErr.name === "TimeoutError" || directErr.name === "AbortError") {
          toast.error("请求超时", { description: "请切换5G网络后重试" });
        } else {
          toast.error("刷新失败", { description: directErr.message || "请切换5G网络后重试" });
        }
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const TAB_LABELS = [
    { key: "raw" as const, label: "原始" },
    { key: "zh" as const, label: "翻译" },
    { key: "compiled" as const, label: "编译" },
  ];

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
                  ? `上次刷新：${lastRefreshed}（${cacheStatus?.groupCount ?? 0} 组 · ${cacheStatus?.count ?? 0} 个档位）`
                  : "尚未刷新，暂无缓存数据"}
              </p>
              {totalForTranslation > 0 && (
                <p className="text-xs mt-0.5" style={{ color: untranslated === 0 ? "#16a34a" : "#d97706" }}>
                  {untranslated === 0
                    ? `✓ 中文翻译完成（${translatedCount}/${totalForTranslation}）`
                    : `AI 翻译中（${translatedCount}/${totalForTranslation}）…刷新页面查看进度`}
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
            勾选后，对应事件组将在行情评估页面显示。三个版本打勾状态同步。
          </p>
          {eventGroups.length > 0 && (
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

        {tab === "compiled" && eventGroups.length > 0 && (
          <div className="bg-blue-50 rounded-lg px-3 py-2 mb-2">
            <p className="text-xs text-blue-700 leading-relaxed">
              <span className="font-semibold">编译版</span>：胜率 ≥70% 显示
              <span className="text-emerald-600 font-medium">年化收益率</span>，胜率 &lt;70% 显示
              <span className="text-orange-600 font-medium">赔率倍数</span>。前端用户看到的是此版本。
            </p>
          </div>
        )}
      </div>

      {/* 事件组列表 */}
      <div className="px-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            <p className="text-sm text-gray-500">正在加载事件列表...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-sm text-red-500">加载失败：{error.message}</p>
            <button onClick={() => refetch()} className="px-4 py-2 bg-[#B71C1C] text-white rounded-lg text-sm">重试</button>
          </div>
        ) : eventGroups.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400">暂无 {coin} 缓存数据，请先点击「刷新数据」</p>
          </div>
        ) : (
          <div className="space-y-2">
            {eventGroups.map((group: any, idx: number) => (
              <EventGroupCard
                key={group.groupId ?? idx}
                group={group}
                idx={idx}
                tab={tab}
                onToggle={handleToggle}
                togglePending={toggleMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      <div className="h-8" />
    </div>
  );
}
