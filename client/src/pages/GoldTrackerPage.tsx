/**
 * 黄金行情追踪页面
 * 数据来源：新浪财经 hq.sinajs.cn（伦敦金现货，实时无延迟）
 * 功能：实时价格、K线图、持仓录入、盈亏计算
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Plus, Trash2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import ReactECharts from "echarts-for-react";

// ─── 类型 ───────────────────────────────────────────────────────────────────

interface GoldPrice {
  symbol: string;
  name: string;
  price: number;
  prevClose: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  volume: number;
  marketState: string;
  timestamp: number;
  currency: string;
  stale?: boolean;
}

interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Position {
  id: string;
  direction: "buy" | "sell";
  lots: number;
  openPrice: number;
  openTime: string;
  note: string;
}

// ─── 本地存储 key ────────────────────────────────────────────────────────────
const POSITIONS_KEY = "gold_positions_v1";

function loadPositions(): Position[] {
  try {
    const raw = localStorage.getItem(POSITIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePositions(positions: Position[]) {
  localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
}

// ─── 主组件 ─────────────────────────────────────────────────────────────────

export default function GoldTrackerPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const ledgerId = params.id;

  // 价格数据
  const [price, setPrice] = useState<GoldPrice | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);

  // K线数据
  const [bars, setBars] = useState<Bar[]>([]);
  const [barsLoading, setBarsLoading] = useState(true);
  const [range, setRange] = useState<string>("1y");

  // 持仓管理
  const [positions, setPositions] = useState<Position[]>(loadPositions);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPos, setNewPos] = useState<Omit<Position, "id">>({
    direction: "buy",
    lots: 0.01,
    openPrice: 0,
    openTime: new Date().toISOString().slice(0, 16),
    note: "",
  });

  // 刷新价格
  const fetchPrice = useCallback(async () => {
    try {
      setPriceLoading(true);
      const res = await fetch("/api/gold/price");
      if (!res.ok) throw new Error("请求失败");
      const data = await res.json();
      setPrice(data);
    } catch (e: any) {
      toast.error("价格获取失败：" + e.message);
    } finally {
      setPriceLoading(false);
    }
  }, []);

  // 刷新K线
  const fetchBars = useCallback(async () => {
    try {
      setBarsLoading(true);
      const res = await fetch(`/api/gold/bars?range=${range}`);
      if (!res.ok) throw new Error("请求失败");
      const data = await res.json();
      setBars(data.bars || []);
    } catch (e: any) {
      toast.error("K线获取失败：" + e.message);
    } finally {
      setBarsLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchPrice();
    // 每60秒自动刷新价格
    const timer = setInterval(fetchPrice, 60000);
    return () => clearInterval(timer);
  }, [fetchPrice]);

  useEffect(() => {
    fetchBars();
  }, [fetchBars]);

  // 持仓变更时同步到 localStorage
  useEffect(() => {
    savePositions(positions);
  }, [positions]);

  // 添加持仓
  const addPosition = () => {
    if (!newPos.openPrice || newPos.openPrice <= 0) {
      toast.error("请输入有效的开仓价格");
      return;
    }
    if (!newPos.lots || newPos.lots <= 0) {
      toast.error("请输入有效的手数");
      return;
    }
    const pos: Position = {
      ...newPos,
      id: `pos_${Date.now()}`,
    };
    setPositions((prev) => [pos, ...prev]);
    setShowAddForm(false);
    setNewPos({
      direction: "buy",
      lots: 0.01,
      openPrice: 0,
      openTime: new Date().toISOString().slice(0, 16),
      note: "",
    });
    toast.success("持仓已添加");
  };

  // 删除持仓
  const deletePosition = (id: string) => {
    setPositions((prev) => prev.filter((p) => p.id !== id));
    toast.success("持仓已删除");
  };

  // 计算持仓盈亏（黄金：1手 = 100盎司）
  const calcPnl = (pos: Position, currentPrice: number) => {
    const contractSize = 100; // 1手 = 100盎司
    const priceDiff =
      pos.direction === "buy"
        ? currentPrice - pos.openPrice
        : pos.openPrice - currentPrice;
    const pnl = priceDiff * pos.lots * contractSize;
    const pnlPercent = (priceDiff / pos.openPrice) * 100;
    return { pnl, pnlPercent };
  };

  // 总盈亏
  const totalPnl = positions.reduce((sum, pos) => {
    if (!price) return sum;
    const { pnl } = calcPnl(pos, price.price);
    return sum + pnl;
  }, 0);

  // ECharts K线图配置
  const chartOption = {
    backgroundColor: "transparent",
    animation: false,
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      backgroundColor: "rgba(20,20,30,0.92)",
      borderColor: "rgba(201,168,76,0.3)",
      textStyle: { color: "#e8d5a3", fontSize: 11 },
      formatter: (params: any[]) => {
        const k = params.find((p: any) => p.seriesType === "candlestick");
        if (!k) return "";
        const d = new Date(k.name);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const [o, c, l, h] = k.value;
        const isUp = c >= o;
        const color = isUp ? "#e84040" : "#22c55e";
        return `<div style="font-size:11px;line-height:1.8">
          <div style="color:#aaa">${dateStr}</div>
          <div>开: <span style="color:${color}">${o}</span></div>
          <div>收: <span style="color:${color}">${c}</span></div>
          <div>高: <span style="color:#e84040">${h}</span></div>
          <div>低: <span style="color:#22c55e">${l}</span></div>
        </div>`;
      },
    },
    grid: { left: 8, right: 60, top: 10, bottom: 50 },
    xAxis: {
      type: "category",
      data: bars.map((b) => {
        const d = new Date(b.time);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }),
      axisLabel: {
        color: "rgba(201,168,76,0.6)",
        fontSize: 9,
        interval: Math.floor(bars.length / 6),
      },
      axisLine: { lineStyle: { color: "rgba(201,168,76,0.2)" } },
      splitLine: { show: false },
    },
    yAxis: {
      scale: true,
      position: "right",
      axisLabel: { color: "rgba(201,168,76,0.6)", fontSize: 9 },
      axisLine: { lineStyle: { color: "rgba(201,168,76,0.2)" } },
      splitLine: { lineStyle: { color: "rgba(201,168,76,0.08)" } },
    },
    series: [
      {
        type: "candlestick",
        data: bars.map((b) => [b.open, b.close, b.low, b.high]),
        itemStyle: {
          color: "#e84040",
          color0: "#22c55e",
          borderColor: "#e84040",
          borderColor0: "#22c55e",
        },
      },
    ],
    dataZoom: [
      {
        type: "inside",
        start: Math.max(0, 100 - (60 / bars.length) * 100),
        end: 100,
      },
      {
        type: "slider",
        height: 18,
        bottom: 0,
        start: Math.max(0, 100 - (60 / bars.length) * 100),
        end: 100,
        fillerColor: "rgba(201,168,76,0.1)",
        borderColor: "rgba(201,168,76,0.2)",
        handleStyle: { color: "#C9A84C" },
        textStyle: { color: "rgba(201,168,76,0.5)", fontSize: 9 },
      },
    ],
  };

  const isUp = price ? price.change >= 0 : true;
  const changeColor = isUp ? "#e84040" : "#22c55e";

  return (
    <div
      className="min-h-screen pb-8"
      style={{
        background: "linear-gradient(160deg, #0d0a05 0%, #1a1208 40%, #0d0a05 100%)",
        color: "#e8d5a3",
      }}
    >
      {/* 顶部导航 */}
      <div
        className="sticky top-0 z-30 flex items-center px-4 py-3"
        style={{ background: "rgba(13,10,5,0.95)", borderBottom: "1px solid rgba(201,168,76,0.15)" }}
      >
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}`)}
          className="flex items-center gap-1 text-sm"
          style={{ color: "rgba(201,168,76,0.7)" }}
        >
          <ArrowLeft size={16} />
          返回
        </button>
        <div className="flex-1 text-center font-bold" style={{ color: "#C9A84C", fontSize: 15 }}>
          黄金行情
        </div>
        <button
          onClick={() => { fetchPrice(); fetchBars(); }}
          disabled={priceLoading}
          style={{ color: "rgba(201,168,76,0.7)" }}
        >
          <RefreshCw size={16} className={priceLoading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* 价格卡片 */}
      <div className="px-4 pt-4">
        <div
          className="rounded-2xl p-4"
          style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)" }}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs mb-1" style={{ color: "rgba(201,168,76,0.5)" }}>
                XAUUSD · 黄金现货
                {price?.stale && <span className="ml-1 text-yellow-500">（缓存）</span>}
              </div>
              {priceLoading && !price ? (
                <div className="text-3xl font-bold" style={{ color: "#C9A84C" }}>
                  加载中...
                </div>
              ) : (
                <div className="text-4xl font-bold" style={{ color: "#C9A84C", letterSpacing: -1 }}>
                  {price?.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  <span className="text-sm font-normal ml-1" style={{ color: "rgba(201,168,76,0.5)" }}>
                    USD
                  </span>
                </div>
              )}
              {price && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm font-semibold" style={{ color: changeColor }}>
                    {isUp ? "+" : ""}
                    {price.change.toFixed(2)}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: changeColor }}>
                    ({isUp ? "+" : ""}
                    {price.changePercent.toFixed(2)}%)
                  </span>
                  {isUp ? (
                    <TrendingUp size={14} style={{ color: changeColor }} />
                  ) : (
                    <TrendingDown size={14} style={{ color: changeColor }} />
                  )}
                </div>
              )}
            </div>
            {price && (
              <div className="text-right text-xs space-y-1" style={{ color: "rgba(201,168,76,0.5)" }}>
                <div>
                  开 <span style={{ color: "#e8d5a3" }}>{price.open.toFixed(2)}</span>
                </div>
                <div>
                  高 <span style={{ color: "#e84040" }}>{price.high.toFixed(2)}</span>
                </div>
                <div>
                  低 <span style={{ color: "#22c55e" }}>{price.low.toFixed(2)}</span>
                </div>
                <div>
                  昨收 <span style={{ color: "#e8d5a3" }}>{price.prevClose.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
          {price && (
            <div className="mt-2 text-xs" style={{ color: "rgba(201,168,76,0.35)" }}>
              更新于 {price.updateTime || new Date(price.timestamp).toLocaleTimeString("zh-CN")} · 数据来源：新浪财经（实时）
            </div>
          )}
        </div>
      </div>

      {/* K线图 */}
      <div className="px-4 mt-4">
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.15)" }}
        >
          {/* 周期切换（新浪财经仅提供日K线，通过range控制显示范围） */}
          <div className="flex gap-1 px-3 pt-3 pb-2 overflow-x-auto">
            {[
              { label: "1月", range: "1mo" },
              { label: "3月", range: "3mo" },
              { label: "6月", range: "6mo" },
              { label: "1年", range: "1y" },
              { label: "2年", range: "2y" },
              { label: "5年", range: "5y" },
              { label: "全部", range: "max" },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => setRange(opt.range)}
                className="px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 transition-all"
                style={
                  range === opt.range
                    ? { background: "rgba(201,168,76,0.25)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.4)" }
                    : { background: "transparent", color: "rgba(201,168,76,0.45)", border: "1px solid rgba(201,168,76,0.15)" }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 图表 */}
          <div style={{ height: 260, position: "relative" }}>
            {barsLoading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <RefreshCw size={20} className="animate-spin" style={{ color: "rgba(201,168,76,0.4)" }} />
              </div>
            ) : bars.length > 0 ? (
              <ReactECharts
                option={chartOption}
                style={{ height: "100%", width: "100%" }}
                opts={{ renderer: "canvas" }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: "rgba(201,168,76,0.4)" }}>
                暂无数据
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 持仓管理 */}
      <div className="px-4 mt-4">
        <div
          className="rounded-2xl"
          style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.15)" }}
        >
          {/* 标题行 */}
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <span className="font-bold text-sm" style={{ color: "#C9A84C" }}>
                持仓追踪
              </span>
              {positions.length > 0 && price && (
                <span
                  className="ml-2 text-sm font-semibold"
                  style={{ color: totalPnl >= 0 ? "#e84040" : "#22c55e" }}
                >
                  {totalPnl >= 0 ? "+" : ""}
                  {totalPnl.toFixed(2)} USD
                </span>
              )}
            </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-full"
              style={{
                background: showAddForm ? "rgba(201,168,76,0.2)" : "rgba(201,168,76,0.1)",
                color: "#C9A84C",
                border: "1px solid rgba(201,168,76,0.3)",
              }}
            >
              <Plus size={12} />
              添加持仓
            </button>
          </div>

          {/* 添加持仓表单 */}
          {showAddForm && (
            <div
              className="mx-3 mb-3 rounded-xl p-3 space-y-2"
              style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.2)" }}
            >
              {/* 方向 */}
              <div className="flex gap-2">
                <button
                  onClick={() => setNewPos((p) => ({ ...p, direction: "buy" }))}
                  className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
                  style={
                    newPos.direction === "buy"
                      ? { background: "rgba(232,64,64,0.2)", color: "#e84040", border: "1px solid #e84040" }
                      : { background: "transparent", color: "rgba(232,64,64,0.4)", border: "1px solid rgba(232,64,64,0.2)" }
                  }
                >
                  做多 (Buy)
                </button>
                <button
                  onClick={() => setNewPos((p) => ({ ...p, direction: "sell" }))}
                  className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
                  style={
                    newPos.direction === "sell"
                      ? { background: "rgba(34,197,94,0.2)", color: "#22c55e", border: "1px solid #22c55e" }
                      : { background: "transparent", color: "rgba(34,197,94,0.4)", border: "1px solid rgba(34,197,94,0.2)" }
                  }
                >
                  做空 (Sell)
                </button>
              </div>

              {/* 开仓价 + 手数 */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <div className="text-xs mb-1" style={{ color: "rgba(201,168,76,0.5)" }}>
                    开仓价 (USD)
                  </div>
                  <Input
                    type="number"
                    value={newPos.openPrice || ""}
                    onChange={(e) => setNewPos((p) => ({ ...p, openPrice: parseFloat(e.target.value) || 0 }))}
                    placeholder={price ? price.price.toFixed(2) : "3300.00"}
                    className="h-9 text-sm"
                    style={{
                      background: "rgba(201,168,76,0.08)",
                      border: "1px solid rgba(201,168,76,0.25)",
                      color: "#e8d5a3",
                    }}
                  />
                </div>
                <div className="flex-1">
                  <div className="text-xs mb-1" style={{ color: "rgba(201,168,76,0.5)" }}>
                    手数 (Lots)
                  </div>
                  <Input
                    type="number"
                    value={newPos.lots || ""}
                    onChange={(e) => setNewPos((p) => ({ ...p, lots: parseFloat(e.target.value) || 0 }))}
                    placeholder="0.01"
                    step="0.01"
                    className="h-9 text-sm"
                    style={{
                      background: "rgba(201,168,76,0.08)",
                      border: "1px solid rgba(201,168,76,0.25)",
                      color: "#e8d5a3",
                    }}
                  />
                </div>
              </div>

              {/* 开仓时间 */}
              <div>
                <div className="text-xs mb-1" style={{ color: "rgba(201,168,76,0.5)" }}>
                  开仓时间
                </div>
                <Input
                  type="datetime-local"
                  value={newPos.openTime}
                  onChange={(e) => setNewPos((p) => ({ ...p, openTime: e.target.value }))}
                  className="h-9 text-sm"
                  style={{
                    background: "rgba(201,168,76,0.08)",
                    border: "1px solid rgba(201,168,76,0.25)",
                    color: "#e8d5a3",
                  }}
                />
              </div>

              {/* 备注 */}
              <div>
                <div className="text-xs mb-1" style={{ color: "rgba(201,168,76,0.5)" }}>
                  备注（可选）
                </div>
                <Input
                  value={newPos.note}
                  onChange={(e) => setNewPos((p) => ({ ...p, note: e.target.value }))}
                  placeholder="如：趋势做多"
                  className="h-9 text-sm"
                  style={{
                    background: "rgba(201,168,76,0.08)",
                    border: "1px solid rgba(201,168,76,0.25)",
                    color: "#e8d5a3",
                  }}
                />
              </div>

              {/* 按钮 */}
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={addPosition}
                  className="flex-1 h-9 text-sm font-bold"
                  style={{ background: "rgba(201,168,76,0.25)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.4)" }}
                >
                  确认添加
                </Button>
                <Button
                  onClick={() => setShowAddForm(false)}
                  variant="ghost"
                  className="flex-1 h-9 text-sm"
                  style={{ color: "rgba(201,168,76,0.5)" }}
                >
                  取消
                </Button>
              </div>
            </div>
          )}

          {/* 持仓列表 */}
          {positions.length === 0 ? (
            <div className="px-4 pb-4 text-center text-sm" style={{ color: "rgba(201,168,76,0.3)" }}>
              暂无持仓记录，点击"添加持仓"开始追踪
            </div>
          ) : (
            <div className="px-3 pb-3 space-y-2">
              {positions.map((pos) => {
                const { pnl, pnlPercent } = price ? calcPnl(pos, price.price) : { pnl: 0, pnlPercent: 0 };
                const pnlColor = pnl >= 0 ? "#e84040" : "#22c55e";
                const dirColor = pos.direction === "buy" ? "#e84040" : "#22c55e";
                const dirLabel = pos.direction === "buy" ? "多" : "空";
                return (
                  <div
                    key={pos.id}
                    className="rounded-xl p-3"
                    style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.15)" }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded"
                          style={{ background: `${dirColor}22`, color: dirColor }}
                        >
                          {dirLabel}
                        </span>
                        <span className="text-sm font-bold" style={{ color: "#e8d5a3" }}>
                          {pos.lots} 手
                        </span>
                        <span className="text-xs" style={{ color: "rgba(201,168,76,0.5)" }}>
                          @ {pos.openPrice.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {price && (
                          <div className="text-right">
                            <div className="text-sm font-bold" style={{ color: pnlColor }}>
                              {pnl >= 0 ? "+" : ""}
                              {pnl.toFixed(2)}
                            </div>
                            <div className="text-xs" style={{ color: pnlColor }}>
                              {pnlPercent >= 0 ? "+" : ""}
                              {pnlPercent.toFixed(2)}%
                            </div>
                          </div>
                        )}
                        <button
                          onClick={() => deletePosition(pos.id)}
                          style={{ color: "rgba(201,168,76,0.3)" }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs" style={{ color: "rgba(201,168,76,0.4)" }}>
                        {new Date(pos.openTime).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {pos.note && (
                        <span className="text-xs" style={{ color: "rgba(201,168,76,0.5)" }}>
                          {pos.note}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 说明 */}
      <div className="px-4 mt-3 text-xs text-center" style={{ color: "rgba(201,168,76,0.25)" }}>
        数据来源：新浪财经 · 伦敦金现货（XAUUSD）· 实时报价 · 仅供参考
      </div>

      {/* 历史全量K线图 */}
      <GoldHistoryKlineChart />
    </div>
  );
}

// ─── 历史全量K线图组件（1975年至今，数据来源：美联储）─────────────────────────
function GoldHistoryKlineChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ count: number; startDate: string; endDate: string } | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    let chart: any = null;
    let candleSeries: any = null;

    async function initChart() {
      try {
        setLoading(true);
        setError(null);

        // 动态导入 lightweight-charts
        const { createChart, CandlestickSeries } = await import('lightweight-charts');

        // 拉取历史数据
        const resp = await fetch('/api/gold/history-kline');
        if (!resp.ok) throw new Error('数据加载失败');
        const data = await resp.json();

        if (!data.bars || data.bars.length === 0) {
          setError('暂无历史数据，请稍后再试');
          setLoading(false);
          return;
        }

        setMeta({ count: data.count, startDate: data.startDate, endDate: data.endDate });

        // 创建图表
        chart = createChart(chartContainerRef.current!, {
          width: chartContainerRef.current!.clientWidth,
          height: 320,
          layout: {
            background: { color: '#1a0a00' },
            textColor: 'rgba(201,168,76,0.7)',
          },
          grid: {
            vertLines: { color: 'rgba(201,168,76,0.08)' },
            horzLines: { color: 'rgba(201,168,76,0.08)' },
          },
          crosshair: {
            mode: 1,
          },
          rightPriceScale: {
            borderColor: 'rgba(201,168,76,0.2)',
          },
          timeScale: {
            borderColor: 'rgba(201,168,76,0.2)',
            timeVisible: true,
          },
        });

        candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#e84040',
          downColor: '#26a69a',
          borderUpColor: '#e84040',
          borderDownColor: '#26a69a',
          wickUpColor: '#e84040',
          wickDownColor: '#26a69a',
        });

        // 设置数据（time 字段为 'YYYY-MM-DD' 字符串，lightweight-charts 原生支持）
        candleSeries.setData(data.bars);

        // 自适应宽度
        const resizeObserver = new ResizeObserver(() => {
          if (chartContainerRef.current && chart) {
            chart.applyOptions({ width: chartContainerRef.current.clientWidth });
          }
        });
        resizeObserver.observe(chartContainerRef.current!);

        setLoading(false);

        return () => {
          resizeObserver.disconnect();
          chart.remove();
        };
      } catch (e: any) {
        setError(e.message || '图表加载失败');
        setLoading(false);
      }
    }

    const cleanup = initChart();
    return () => {
      cleanup.then(fn => fn && fn());
    };
  }, []);

  return (
    <div className="mx-4 mt-6 mb-6 rounded-2xl overflow-hidden" style={{ background: 'rgba(26,10,0,0.9)', border: '1px solid rgba(201,168,76,0.15)' }}>
      {/* 标题栏 */}
      <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(201,168,76,0.1)' }}>
        <div>
          <div className="text-sm font-bold" style={{ color: '#c9a84c' }}>XAUUSD 历史价格走势</div>
          <div className="text-xs mt-0.5" style={{ color: 'rgba(201,168,76,0.5)' }}>
            {meta ? `${meta.startDate} ~ ${meta.endDate}（共 ${meta.count.toLocaleString()} 个交易日）` : '加载中...'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs" style={{ color: 'rgba(201,168,76,0.4)' }}>数据来源</div>
          <div className="text-xs font-medium" style={{ color: 'rgba(201,168,76,0.6)' }}>美联储（FRED）</div>
        </div>
      </div>

      {/* 图表区域 */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: 'rgba(26,10,0,0.8)' }}>
            <div className="text-center">
              <div className="text-sm" style={{ color: 'rgba(201,168,76,0.6)' }}>正在加载历史数据...</div>
              <div className="text-xs mt-1" style={{ color: 'rgba(201,168,76,0.3)' }}>约 1 万条K线，请稍候</div>
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="text-sm" style={{ color: 'rgba(201,168,76,0.5)' }}>{error}</div>
              <div className="text-xs mt-1" style={{ color: 'rgba(201,168,76,0.3)' }}>历史数据将在首次部署后自动导入</div>
            </div>
          </div>
        )}
        <div ref={chartContainerRef} style={{ width: '100%', height: loading || error ? '0px' : '320px' }} />
      </div>

      {/* 操作提示 */}
      {!loading && !error && (
        <div className="px-4 py-2 text-xs text-center" style={{ color: 'rgba(201,168,76,0.25)', borderTop: '1px solid rgba(201,168,76,0.08)' }}>
          ← 左右滑动查看历史 · 双指缩放 · 每日自动更新
        </div>
      )}
    </div>
  );
}
