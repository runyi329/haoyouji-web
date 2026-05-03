/**
 * GoldAIPage.tsx
 * 黄金AI分析追踪页面
 * 配色与 StockDetail 保持一致：米白背景 + 红色主色调 + 白色卡片
 */
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ChevronLeft, RefreshCw, TrendingUp, TrendingDown, Sparkles,
  Plus, Trash2
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import ReactECharts from "echarts-for-react";
import { Streamdown } from "streamdown";

// ─── 配色（与 StockDetail 完全一致）────────────────────────────────────────────
const RED = "#D32F2F";
const BG = "#F2EAE0";
const CARD = "#FFFFFF";
const BORDER = "#E8E0D8";
const TEXT = "#1A1A1A";
const MUTED = "#888888";
const GREEN_A = "#00B050";
const CARD_SHADOW = "0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)";

// ─── 涨跌颜色（中国习惯：涨红跌绿）────────────────────────────────────────────
function pctColor(pct: number) {
  if (pct > 0) return RED;
  if (pct < 0) return GREEN_A;
  return MUTED;
}
function pctSign(pct: number) {
  return pct > 0 ? "+" : "";
}

// ─── 持仓本地存储 ────────────────────────────────────────────────────────────
interface Position {
  id: string;
  direction: "buy" | "sell";
  lots: number;
  openPrice: number;
  openTime: string;
  note: string;
}
const POSITIONS_KEY = "gold_ai_positions_v1";
function loadPositions(): Position[] {
  try {
    const raw = localStorage.getItem(POSITIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function savePositions(positions: Position[]) {
  localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
}

// ─── 涨跌路格子颜色（与 StockDetail 珠路图一致）─────────────────────────────
function getBarColor(pct: number) {
  if (pct > 1.5) return { bg: "#C62828", fg: "#fff" };
  if (pct > 0.5) return { bg: "#EF5350", fg: "#fff" };
  if (pct > 0) return { bg: "#FFCDD2", fg: "#C62828" };
  if (pct < -1.5) return { bg: "#1B5E20", fg: "#fff" };
  if (pct < -0.5) return { bg: "#43A047", fg: "#fff" };
  if (pct < 0) return { bg: "#C8E6C9", fg: "#1B5E20" };
  return { bg: "#EEEEEE", fg: "#888" };
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────
export default function GoldAIPage() {
  const [, setLocation] = useLocation();

  // 综合行情数据
  const { data: goldData, isLoading: goldLoading, refetch: refetchGold } =
    trpc.stock.getGoldComprehensive.useQuery(undefined, {
      refetchInterval: 3_000,   // 每3秒实时刷新，与首页行情保持一致
      staleTime: 1_000,
    });

  // K线数据
  const [range, setRange] = useState<"1m" | "3m" | "6m" | "1y" | "5y" | "all">("3m");
  const [bars, setBars] = useState<{ time: number; open: number; high: number; low: number; close: number }[]>([]);
  const [barsLoading, setBarsLoading] = useState(false);

  const fetchBars = useCallback(async () => {
    setBarsLoading(true);
    try {
      const res = await fetch(`/api/gold/bars?range=${range}`);
      const data = await res.json();
      setBars(data.bars || []);
    } catch (e: any) {
      toast.error("K线获取失败：" + e.message);
    } finally {
      setBarsLoading(false);
    }
  }, [range]);

  useEffect(() => { fetchBars(); }, [fetchBars]);

  // AI分析
  const [aiContent, setAiContent] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiGeneratedAt, setAiGeneratedAt] = useState<string>("");
  const aiMutation = trpc.stock.getGoldAIAnalysis.useMutation();

  const handleGenerateAI = async () => {
    if (!goldData?.success) {
      toast.error("请等待行情数据加载完成");
      return;
    }
    setAiLoading(true);
    setAiContent("");
    try {
      const recentBars = bars.slice(-10);
      let recentTrend = "";
      if (recentBars.length >= 2) {
        const first = recentBars[0].close;
        const last = recentBars[recentBars.length - 1].close;
        const pct = ((last - first) / first * 100).toFixed(2);
        recentTrend = `近${recentBars.length}个交易日${Number(pct) > 0 ? "上涨" : "下跌"}${Math.abs(Number(pct))}%`;
      }
      const result = await aiMutation.mutateAsync({
        xauPrice: goldData.xau.price,
        xauChangePct: goldData.xau.changePercent,
        xauHigh: goldData.xau.high,
        xauLow: goldData.xau.low,
        cnyPrice: goldData.cny.price,
        usdCny: goldData.usdCny,
        recentTrend,
      });
      setAiContent(typeof result.content === 'string' ? result.content : String(result.content ?? ''));
      setAiGeneratedAt(result.generatedAt);
    } catch (e: any) {
      toast.error("AI分析失败：" + e.message);
    } finally {
      setAiLoading(false);
    }
  };

  // 持仓管理
  const [positions, setPositions] = useState<Position[]>(loadPositions);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPos, setNewPos] = useState({
    direction: "buy" as "buy" | "sell",
    lots: "1",
    openPrice: "",
    openTime: new Date().toISOString().slice(0, 16),
    note: "",
  });

  useEffect(() => { savePositions(positions); }, [positions]);

  const handleAddPosition = () => {
    const price = parseFloat(newPos.openPrice);
    const lots = parseFloat(newPos.lots);
    if (!price || price <= 0) { toast.error("请输入有效的开仓价格"); return; }
    if (!lots || lots <= 0) { toast.error("请输入有效的手数"); return; }
    const pos: Position = {
      id: Date.now().toString(),
      direction: newPos.direction,
      lots,
      openPrice: price,
      openTime: newPos.openTime,
      note: newPos.note,
    };
    setPositions(prev => [...prev, pos]);
    setShowAddForm(false);
    setNewPos({ direction: "buy", lots: "1", openPrice: "", openTime: new Date().toISOString().slice(0, 16), note: "" });
    toast.success("持仓已添加");
  };

  const handleDeletePosition = (id: string) => {
    setPositions(prev => prev.filter(p => p.id !== id));
    toast.success("持仓已删除");
  };

  // 计算持仓盈亏（1手 = 100盎司）
  function calcPnL(pos: Position) {
    const currentPrice = goldData?.xau.price || 0;
    if (!currentPrice) return null;
    const diff = pos.direction === "buy"
      ? currentPrice - pos.openPrice
      : pos.openPrice - currentPrice;
    const pnl = diff * pos.lots * 100;
    const pct = (diff / pos.openPrice) * 100;
    return { pnl, pct, diff };
  }

  // K线图配置（与 StockDetail 风格一致：白色背景）
  const klineOption = {
    backgroundColor: "transparent",
    grid: { top: 30, bottom: 30, left: 10, right: 10, containLabel: true },
    xAxis: {
      type: "category",
      data: bars.map(b => {
        const d = new Date(b.time);
        return `${d.getMonth() + 1}/${d.getDate()}`;
      }),
      axisLine: { lineStyle: { color: BORDER } },
      axisLabel: { color: MUTED, fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: 10 },
      splitLine: { lineStyle: { color: "#F0EBE5" } },
    },
    series: [{
      type: "candlestick",
      data: bars.map(b => [b.open, b.close, b.low, b.high]),
      itemStyle: {
        color: RED,
        color0: GREEN_A,
        borderColor: RED,
        borderColor0: GREEN_A,
      },
    }],
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      backgroundColor: "rgba(255,255,255,0.95)",
      borderColor: BORDER,
      textStyle: { color: TEXT, fontSize: 11 },
    },
  };

  // 涨跌路数据（从K线计算）
  const [zhuluTab, setZhuluTab] = useState<30 | 60 | 90 | 180>(60);
  const zhuluData = bars.slice(-zhuluTab).map(b => ({
    time: b.time,
    pct: b.open > 0 ? ((b.close - b.open) / b.open * 100) : 0,
  }));

  // 统计连涨连跌
  function calcStreaks(data: { pct: number }[]) {
    const upMap: Record<number, number> = {};
    const downMap: Record<number, number> = {};
    let streak = 0;
    let dir: "up" | "down" | null = null;
    for (const d of data) {
      if (d.pct > 0) {
        if (dir === "up") streak++;
        else { streak = 1; dir = "up"; }
        upMap[streak] = (upMap[streak] || 0) + 1;
      } else if (d.pct < 0) {
        if (dir === "down") streak++;
        else { streak = 1; dir = "down"; }
        downMap[streak] = (downMap[streak] || 0) + 1;
      } else {
        streak = 0; dir = null;
      }
    }
    return { upMap, downMap };
  }
  const { upMap, downMap } = calcStreaks(zhuluData);
  const maxStreak = Math.max(
    ...Object.keys(upMap).map(Number),
    ...Object.keys(downMap).map(Number),
    1
  );

  const xau = goldData?.xau;
  const cny = goldData?.cny;
  const usdCny = goldData?.usdCny || 7.25;

  return (
    <div className="min-h-screen pb-8" style={{ background: BG, color: TEXT }}>
      {/* 顶部导航（与 StockDetail 完全一致：红色背景 + 白色文字） */}
      <div
        className="sticky top-0 z-30 px-4 py-3 flex items-center gap-3 flex-shrink-0"
        style={{ background: RED, color: "#fff" }}
      >
        <button
          onClick={() => setLocation("/")}
          className="w-7 h-7 flex items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base">黄金 AI 分析</p>
          <p className="text-xs opacity-70">XAU/USD · AU9999 · 实时行情</p>
        </div>
        <button
          onClick={() => { refetchGold(); fetchBars(); }}
          disabled={goldLoading}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer", flexShrink: 0, opacity: goldLoading ? 0.6 : 1 }}
        >
          {goldLoading && <RefreshCw size={11} className="animate-spin" style={{ color: "#fff" }} />}
          更新
        </button>
      </div>

      {/* ── 行情卡片：伦敦金 vs 上海金并列 ── */}
      <div className="mx-0 mt-0" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
        {goldLoading && !goldData ? (
          <div className="text-center py-6" style={{ color: MUTED }}>行情加载中...</div>
        ) : (
          <div className="px-4 pt-4 pb-4">
            {/* 两品种并列：伦敦金 | 上海金 */}
            <div className="grid grid-cols-2 gap-0" style={{ marginBottom: 12 }}>
              {/* 左：伦敦金 XAU/USD + 人民币折算价 */}
              <div className="pr-4" style={{ borderRight: `1px solid ${BORDER}` }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold" style={{ color: MUTED }}>
                    伦敦金 <span style={{ color: BORDER, fontWeight: 400 }}>/</span> 纽约金
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#FFF0F0", color: RED, fontSize: 10 }}>XAU/USD</span>
                </div>
                <div className="text-xl font-bold" style={{ color: TEXT }}>
                  {xau?.price ? xau.price.toFixed(2) : "--"}
                </div>
                <div className="text-xs" style={{ color: MUTED }}>美元/盎司</div>
                {xau && xau.price > 0 && (
                  <div className="text-xs font-semibold mt-0.5" style={{ color: pctColor(xau.changePercent) }}>
                    {pctSign(xau.changePercent)}{xau.changePercent.toFixed(2)}%
                    <span className="ml-1 font-normal" style={{ color: MUTED }}>
                      ({pctSign(xau.change)}{xau.change.toFixed(2)})
                    </span>
                  </div>
                )}
                {/* 人民币折算价（辅助信息） */}
                {cny && cny.price > 0 && (
                  <div className="mt-2 pt-2" style={{ borderTop: `1px dashed ${BORDER}` }}>
                    <div className="text-xs" style={{ color: MUTED }}>折算人民币价</div>
                    <div className="text-sm font-semibold" style={{ color: TEXT }}>
                      {cny.price.toFixed(2)} <span className="text-xs font-normal" style={{ color: MUTED }}>元/克</span>
                    </div>
                    <div className="text-xs" style={{ color: MUTED }}>汇率 {usdCny.toFixed(4)}</div>
                  </div>
                )}
              </div>

              {/* 右：上海金 AU9999 真实报价 */}
              <div className="pl-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold" style={{ color: MUTED }}>上海金</span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#FFF8F2", color: "#B8860B", fontSize: 10 }}>AU9999</span>
                </div>
                <div className="text-xl font-bold" style={{ color: TEXT }}>
                  {goldData?.au9999?.price ? goldData.au9999.price.toFixed(2) : "--"}
                </div>
                <div className="text-xs" style={{ color: MUTED }}>元/克</div>
                {goldData?.au9999 && goldData.au9999.price > 0 && (
                  <div className="text-xs font-semibold mt-0.5" style={{ color: pctColor(goldData.au9999.changePercent) }}>
                    {pctSign(goldData.au9999.changePercent)}{goldData.au9999.changePercent.toFixed(2)}%
                    <span className="ml-1 font-normal" style={{ color: MUTED }}>
                      ({pctSign(goldData.au9999.change)}{goldData.au9999.change.toFixed(2)})
                    </span>
                  </div>
                )}
                {/* 与伦敦金折算价的价差（溢价/折价） */}
                {goldData?.au9999 && goldData.au9999.price > 0 && cny && cny.price > 0 && (
                  <div className="mt-2 pt-2" style={{ borderTop: `1px dashed ${BORDER}` }}>
                    <div className="text-xs" style={{ color: MUTED }}>对伦敦金折算价</div>
                    {(() => {
                      const diff = goldData.au9999.price - cny.price;
                      const diffPct = cny.price > 0 ? (diff / cny.price * 100) : 0;
                      return (
                        <div className="text-sm font-semibold" style={{ color: diff >= 0 ? RED : GREEN_A }}>
                          {diff >= 0 ? "+" : ""}{diff.toFixed(2)}
                          <span className="text-xs font-normal ml-1">({diff >= 0 ? "+" : ""}{diffPct.toFixed(2)}%)</span>
                        </div>
                      );
                    })()}
                    <div className="text-xs" style={{ color: MUTED }}>{goldData.au9999.price > cny.price ? "溢价" : "折价"}</div>
                  </div>
                )}
              </div>
            </div>

            {/* XAU/USD 详细行情（高低开昨收） */}
            {xau && xau.price > 0 && (
              <div className="flex gap-4 pt-3 text-xs" style={{ borderTop: `1px solid ${BORDER}`, color: MUTED }}>
                <span>开 <span style={{ color: TEXT, fontWeight: 600 }}>{xau.open.toFixed(2)}</span></span>
                <span>高 <span style={{ color: RED, fontWeight: 600 }}>{xau.high.toFixed(2)}</span></span>
                <span>低 <span style={{ color: GREEN_A, fontWeight: 600 }}>{xau.low.toFixed(2)}</span></span>
                <span>昨收 <span style={{ color: TEXT, fontWeight: 600 }}>{xau.prevClose.toFixed(2)}</span></span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 间隙 */}
      <div style={{ height: 6, background: BG }} />

      {/* ── K线图 ── */}
      <div className="mx-0" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
        <div className="flex items-center justify-between px-4 pt-3 pb-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <span className="text-sm font-semibold" style={{ color: TEXT }}>K线图</span>
          <div className="flex gap-1">
            {(["1m", "3m", "6m", "1y", "5y", "all"] as const).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  background: range === r ? RED : "transparent",
                  color: range === r ? "#fff" : MUTED,
                  fontWeight: range === r ? 700 : 400,
                }}
              >
                {r === "all" ? "全部" : r}
              </button>
            ))}
          </div>
        </div>
        {barsLoading ? (
          <div className="flex items-center justify-center py-8" style={{ color: MUTED }}>
            <RefreshCw size={16} className="animate-spin mr-2" />加载中...
          </div>
        ) : bars.length > 0 ? (
          <ReactECharts option={klineOption} style={{ height: 220, width: "100%" }} />
        ) : (
          <div className="text-center py-8" style={{ color: MUTED }}>暂无K线数据</div>
        )}
      </div>

      {/* 间隙 */}
      <div style={{ height: 6, background: BG }} />

      {/* ── 涨跌路 ── */}
      <div className="mx-0" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
        <div className="flex items-center justify-between px-4 pt-3 pb-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <span className="text-sm font-semibold" style={{ color: TEXT }}>涨跌路</span>
          <div className="flex gap-1">
            {([30, 60, 90, 180] as const).map(n => (
              <button
                key={n}
                onClick={() => setZhuluTab(n)}
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  background: zhuluTab === n ? RED : "transparent",
                  color: zhuluTab === n ? "#fff" : MUTED,
                  fontWeight: zhuluTab === n ? 700 : 400,
                }}
              >
                {n}天
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-3">
          {/* 格子图 */}
          {zhuluData.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-0.5 mb-3">
                {zhuluData.map((d, i) => {
                  const { bg, fg } = getBarColor(d.pct);
                  const label = Math.abs(d.pct) >= 0.1 ? Math.abs(d.pct).toFixed(1) : "";
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-center rounded-sm text-center"
                      style={{
                        width: 22, height: 22,
                        background: bg,
                        color: fg,
                        fontSize: 8,
                        fontWeight: 600,
                      }}
                      title={`${new Date(d.time).toLocaleDateString()} ${d.pct > 0 ? "+" : ""}${d.pct.toFixed(2)}%`}
                    >
                      {label}
                    </div>
                  );
                })}
              </div>

              {/* 连涨连跌统计 */}
              <div className="mt-2">
                <div className="text-xs mb-2" style={{ color: MUTED }}>连涨/连跌统计（近{zhuluTab}天）</div>
                <div className="flex flex-col gap-1">
                  {Array.from({ length: maxStreak }, (_, i) => i + 1).map(n => {
                    const up = upMap[n] || 0;
                    const down = downMap[n] || 0;
                    if (up === 0 && down === 0) return null;
                    const maxVal = Math.max(up, down, 1);
                    return (
                      <div key={n} className="flex items-center gap-2">
                        <span className="text-xs w-6 text-right" style={{ color: MUTED }}>{n}天</span>
                        <div className="flex-1 flex items-center gap-1">
                          {/* 涨（红色，向右） */}
                          <div className="flex-1 flex justify-end">
                            {up > 0 && (
                              <div
                                className="flex items-center justify-end px-1 rounded-sm text-xs"
                                style={{
                                  width: `${(up / maxVal) * 100}%`,
                                  minWidth: 20,
                                  background: RED,
                                  color: "#fff",
                                  fontSize: 9,
                                  height: 14,
                                }}
                              >
                                {up}
                              </div>
                            )}
                          </div>
                          <div className="w-px h-3" style={{ background: BORDER }} />
                          {/* 跌（绿色，向右） */}
                          <div className="flex-1">
                            {down > 0 && (
                              <div
                                className="flex items-center px-1 rounded-sm text-xs"
                                style={{
                                  width: `${(down / maxVal) * 100}%`,
                                  minWidth: 20,
                                  background: GREEN_A,
                                  color: "#fff",
                                  fontSize: 9,
                                  height: 14,
                                }}
                              >
                                {down}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-1 text-xs" style={{ color: MUTED }}>
                  <span>← 连涨次数</span>
                  <span>连跌次数 →</span>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-4" style={{ color: MUTED }}>暂无数据</div>
          )}
        </div>
      </div>

      {/* 间隙 */}
      <div style={{ height: 6, background: BG }} />

      {/* ── AI 分析报告 ── */}
      <div className="mx-0" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
        <div className="flex items-center justify-between px-4 pt-3 pb-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-2">
            <Sparkles size={15} style={{ color: RED }} />
            <span className="text-sm font-semibold" style={{ color: TEXT }}>AI 行情分析</span>
          </div>
          <button
            onClick={handleGenerateAI}
            disabled={aiLoading || !goldData?.success}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full"
            style={{
              background: aiLoading ? "#F5F5F5" : RED,
              color: aiLoading ? MUTED : "#fff",
              fontWeight: 600,
              opacity: (!goldData?.success) ? 0.5 : 1,
            }}
          >
            {aiLoading ? (
              <><RefreshCw size={12} className="animate-spin" />生成中...</>
            ) : (
              <><Sparkles size={12} />生成分析</>
            )}
          </button>
        </div>

        <div className="px-4 py-3">
          {aiContent ? (
            <div>
              <div
                className="rounded-xl p-3 text-sm leading-relaxed"
                style={{ background: "#FFF8F2", border: `1px solid ${BORDER}` }}
              >
                <Streamdown>{aiContent}</Streamdown>
              </div>
              {aiGeneratedAt && (
                <div className="text-xs mt-2 text-right" style={{ color: MUTED }}>
                  生成于 {new Date(aiGeneratedAt).toLocaleString("zh-CN")}
                </div>
              )}
            </div>
          ) : (
            <div
              className="text-center py-6 rounded-xl"
              style={{ background: "#FFF8F2", border: `1px dashed ${BORDER}` }}
            >
              <Sparkles size={24} style={{ color: MUTED, margin: "0 auto 8px" }} />
              <div className="text-sm" style={{ color: MUTED }}>
                点击「生成分析」获取 AI 黄金行情分析报告
              </div>
              <div className="text-xs mt-1" style={{ color: MUTED }}>
                基于实时价格、K线走势综合分析
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 间隙 */}
      <div style={{ height: 6, background: BG }} />

      {/* ── 持仓追踪 ── */}
      <div className="mx-0" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
        <div className="flex items-center justify-between px-4 pt-3 pb-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <span className="text-sm font-semibold" style={{ color: TEXT }}>持仓追踪</span>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full"
            style={{ background: RED, color: "#fff", fontWeight: 600 }}
          >
            <Plus size={12} />添加持仓
          </button>
        </div>

        <div className="px-4 py-3">
          {/* 添加持仓表单 */}
          {showAddForm && (
            <div
              className="rounded-xl p-3 mb-3"
              style={{ background: "#FFF8F2", border: `1px solid ${BORDER}` }}
            >
              {/* 方向 */}
              <div className="flex gap-2 mb-2">
                {(["buy", "sell"] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setNewPos(p => ({ ...p, direction: d }))}
                    className="flex-1 py-1.5 rounded text-sm font-semibold"
                    style={{
                      background: newPos.direction === d
                        ? (d === "buy" ? RED : GREEN_A)
                        : "#F5F5F5",
                      color: newPos.direction === d ? "#fff" : MUTED,
                    }}
                  >
                    {d === "buy" ? "做多（买入）" : "做空（卖出）"}
                  </button>
                ))}
              </div>
              {/* 开仓价 + 手数 */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <div className="text-xs mb-1" style={{ color: MUTED }}>开仓价（美元/盎司）</div>
                  <Input
                    type="number"
                    placeholder="如 3300.00"
                    value={newPos.openPrice}
                    onChange={e => setNewPos(p => ({ ...p, openPrice: e.target.value }))}
                    className="text-sm"
                    style={{ background: CARD, borderColor: BORDER, color: TEXT }}
                  />
                </div>
                <div>
                  <div className="text-xs mb-1" style={{ color: MUTED }}>手数（1手=100盎司）</div>
                  <Input
                    type="number"
                    placeholder="如 1"
                    value={newPos.lots}
                    onChange={e => setNewPos(p => ({ ...p, lots: e.target.value }))}
                    className="text-sm"
                    style={{ background: CARD, borderColor: BORDER, color: TEXT }}
                  />
                </div>
              </div>
              {/* 备注 */}
              <div className="mb-2">
                <div className="text-xs mb-1" style={{ color: MUTED }}>备注（可选）</div>
                <Input
                  placeholder="如：趋势做多"
                  value={newPos.note}
                  onChange={e => setNewPos(p => ({ ...p, note: e.target.value }))}
                  className="text-sm"
                  style={{ background: CARD, borderColor: BORDER, color: TEXT }}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleAddPosition}
                  className="flex-1 text-sm"
                  style={{ background: RED, color: "#fff", fontWeight: 600, border: "none" }}
                >
                  确认添加
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 text-sm"
                  style={{ borderColor: BORDER, color: MUTED, background: "transparent" }}
                >
                  取消
                </Button>
              </div>
            </div>
          )}

          {/* 持仓列表 */}
          {positions.length === 0 ? (
            <div className="text-center py-4" style={{ color: MUTED }}>
              暂无持仓记录，点击「添加持仓」开始追踪
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {positions.map(pos => {
                const pnl = calcPnL(pos);
                return (
                  <div
                    key={pos.id}
                    className="rounded-xl p-3"
                    style={{
                      background: pos.direction === "buy" ? "#FFF0F0" : "#F0FFF4",
                      border: `1px solid ${pos.direction === "buy" ? "#FFCDD2" : "#C8E6C9"}`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {pos.direction === "buy"
                          ? <TrendingUp size={14} style={{ color: RED }} />
                          : <TrendingDown size={14} style={{ color: GREEN_A }} />
                        }
                        <span className="text-sm font-semibold" style={{ color: pos.direction === "buy" ? RED : GREEN_A }}>
                          {pos.direction === "buy" ? "做多" : "做空"}
                        </span>
                        <span className="text-xs" style={{ color: MUTED }}>{pos.lots}手</span>
                      </div>
                      <button
                        onClick={() => handleDeletePosition(pos.id)}
                        style={{ color: MUTED }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs" style={{ color: MUTED }}>
                        开仓价 <span style={{ color: TEXT, fontWeight: 600 }}>{pos.openPrice.toFixed(2)}</span>
                        {pos.note && <span className="ml-2">{pos.note}</span>}
                      </div>
                      {pnl ? (
                        <div className="text-right">
                          <div className="text-sm font-bold" style={{ color: pctColor(pnl.pnl) }}>
                            {pnl.pnl > 0 ? "+" : ""}{pnl.pnl.toFixed(0)} USD
                          </div>
                          <div className="text-xs" style={{ color: pctColor(pnl.pct) }}>
                            {pctSign(pnl.pct)}{pnl.pct.toFixed(2)}%
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs" style={{ color: MUTED }}>等待行情</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 底部说明 */}
      <div className="px-4 mt-4 pb-4">
        <div className="text-xs text-center" style={{ color: MUTED }}>
          行情数据来源：新浪财经 · 仅供参考，不构成投资建议
        </div>
      </div>
    </div>
  );
}
