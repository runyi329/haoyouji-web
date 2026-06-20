/**
 * 量化回测分析工具
 * 52号账本 QQ 按钮入口页面
 */
import { useState, useCallback } from "react";
import { useLocation } from "wouter";

// ─── 类型定义 ─────────────────────────────────────────────────

interface ParsedStrategy {
  symbol: string;
  start_date: string;
  end_date: string;
  strategy_type: string;
  fast_period: number;
  slow_period: number;
  rsi_period: number;
  rsi_buy: number;
  rsi_sell: number;
  stop_loss: number;
  take_profit: number;
  description_summary: string;
}

interface BacktestMetrics {
  total_return: number;
  annual_return: number;
  max_drawdown: number;
  sharpe_ratio: number;
  win_rate: number;
  avg_holding_days: number;
  trade_count: number;
  final_value: number;
  initial_cash: number;
}

interface BacktestResult {
  metrics: BacktestMetrics;
  chart_json: string;
  symbol: string;
  start_date: string;
  end_date: string;
}

// ─── 常量 ─────────────────────────────────────────────────────

const STRATEGY_EXAMPLES = [
  "过去3年在20日均线上穿60日均线时买入茅台（600519），回撤5%止损",
  "用RSI策略回测苹果股票（AAPL）最近2年，RSI低于30买入，高于70卖出",
  "过去5年对贵州茅台（600519）做20日高点突破策略，不设止损",
  "用均线交叉策略回测特斯拉（TSLA）2022年至今，止损8%",
];

const STRATEGY_TYPE_LABELS: Record<string, string> = {
  ma_cross: "均线交叉",
  rsi: "RSI策略",
  price_breakout: "价格突破",
};

// ─── 指标卡片 ─────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  unit = "",
  positive,
}: {
  label: string;
  value: number | string;
  unit?: string;
  positive?: boolean;
}) {
  const isNum = typeof value === "number";
  const color =
    positive === undefined
      ? "#1a1a1a"
      : positive
      ? "#D32F2F"
      : "#2E7D32";

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #eee",
        borderRadius: 10,
        padding: "12px 14px",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>
        {isNum ? value.toLocaleString() : value}
        <span style={{ fontSize: 12, fontWeight: 400, color: "#888", marginLeft: 2 }}>
          {unit}
        </span>
      </div>
    </div>
  );
}

// ─── 简易折线图（纯Canvas，无需第三方库）─────────────────────

function SimpleChart({ chartJson }: { chartJson: string }) {
  try {
    const data = JSON.parse(chartJson);
    const traces = data.data || [];
    // 找净值曲线（第一条）
    const navTrace = traces.find((t: any) => t.name === "策略净值");
    const benchTrace = traces.find((t: any) => t.name === "基准（持有不动）");
    if (!navTrace || !navTrace.y?.length) return null;

    const navY: number[] = navTrace.y;
    const benchY: number[] = benchTrace?.y || [];
    const labels: string[] = navTrace.x || [];

    const minVal = Math.min(...navY, ...benchY.filter(Boolean));
    const maxVal = Math.max(...navY, ...benchY.filter(Boolean));
    const range = maxVal - minVal || 1;

    const W = 320;
    const H = 140;
    const PAD = 8;

    const toX = (i: number) => PAD + (i / (navY.length - 1)) * (W - PAD * 2);
    const toY = (v: number) => H - PAD - ((v - minVal) / range) * (H - PAD * 2);

    const navPath = navY
      .map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
      .join(" ");
    const benchPath = benchY.length
      ? benchY
          .map((v, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
          .join(" ")
      : "";

    // 买卖信号
    const buyTrace = traces.find((t: any) => t.name === "买入");
    const sellTrace = traces.find((t: any) => t.name === "卖出");

    const buyPoints: { x: number; y: number }[] = [];
    const sellPoints: { x: number; y: number }[] = [];

    if (buyTrace?.x?.length) {
      buyTrace.x.forEach((date: string, idx: number) => {
        const i = labels.indexOf(date);
        if (i >= 0) buyPoints.push({ x: toX(i), y: toY(navY[i]) });
      });
    }
    if (sellTrace?.x?.length) {
      sellTrace.x.forEach((date: string, idx: number) => {
        const i = labels.indexOf(date);
        if (i >= 0) sellPoints.push({ x: toX(i), y: toY(navY[i]) });
      });
    }

    const startLabel = labels[0]?.slice(0, 10) || "";
    const endLabel = labels[labels.length - 1]?.slice(0, 10) || "";
    const startVal = navY[0]?.toFixed(0) || "";
    const endVal = navY[navY.length - 1]?.toFixed(0) || "";

    return (
      <div style={{ overflowX: "auto" }}>
        <svg width={W} height={H + 20} style={{ display: "block", margin: "0 auto" }}>
          {/* 背景 */}
          <rect x={0} y={0} width={W} height={H} fill="#FAFAFA" rx={6} />
          {/* 基准线 */}
          {benchPath && (
            <path d={benchPath} fill="none" stroke="#ccc" strokeWidth={1.5} strokeDasharray="4,3" />
          )}
          {/* 净值曲线 */}
          <path d={navPath} fill="none" stroke="#D32F2F" strokeWidth={2} />
          {/* 买入信号 */}
          {buyPoints.map((p, i) => (
            <polygon
              key={i}
              points={`${p.x},${p.y - 8} ${p.x - 5},${p.y} ${p.x + 5},${p.y}`}
              fill="#D32F2F"
            />
          ))}
          {/* 卖出信号 */}
          {sellPoints.map((p, i) => (
            <polygon
              key={i}
              points={`${p.x},${p.y + 8} ${p.x - 5},${p.y} ${p.x + 5},${p.y}`}
              fill="#2E7D32"
            />
          ))}
          {/* 轴标签 */}
          <text x={PAD} y={H + 14} fontSize={9} fill="#aaa">{startLabel}</text>
          <text x={W - PAD} y={H + 14} fontSize={9} fill="#aaa" textAnchor="end">{endLabel}</text>
          <text x={PAD} y={PAD + 8} fontSize={9} fill="#aaa">{maxVal.toFixed(0)}</text>
          <text x={PAD} y={H - PAD} fontSize={9} fill="#aaa">{minVal.toFixed(0)}</text>
        </svg>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: "#D32F2F" }}>— 策略净值</span>
          <span style={{ fontSize: 10, color: "#ccc" }}>--- 基准</span>
          <span style={{ fontSize: 10, color: "#D32F2F" }}>▲ 买入</span>
          <span style={{ fontSize: 10, color: "#2E7D32" }}>▼ 卖出</span>
        </div>
      </div>
    );
  } catch {
    return null;
  }
}

// ─── 主页面 ─────────────────────────────────────────────────

export default function QQOnlinePage() {
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<"input" | "parsing" | "params" | "running" | "result">("input");
  const [description, setDescription] = useState("");
  const [parsed, setParsed] = useState<ParsedStrategy | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [params, setParams] = useState<Partial<ParsedStrategy>>({});

  // ── 步骤1：解析自然语言 ──
  const handleParse = useCallback(async () => {
    if (!description.trim()) return;
    setError("");
    setStep("parsing");
    try {
      const res = await fetch("/api/quant/parse-strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "解析失败");
      setParsed(data);
      setParams(data);
      setStep("params");
    } catch (e: any) {
      setError(e.message);
      setStep("input");
    }
  }, [description]);

  // ── 步骤2：执行回测 ──
  const handleBacktest = useCallback(async () => {
    if (!params) return;
    setError("");
    setStep("running");
    try {
      const body = {
        symbol: params.symbol,
        start_date: params.start_date,
        end_date: params.end_date,
        strategy_type: params.strategy_type,
        fast_period: params.fast_period ?? 20,
        slow_period: params.slow_period ?? 60,
        rsi_period: params.rsi_period ?? 14,
        rsi_buy: params.rsi_buy ?? 30,
        rsi_sell: params.rsi_sell ?? 70,
        stop_loss: params.stop_loss ?? 0.05,
        take_profit: params.take_profit ?? 0,
        initial_cash: 100000,
      };
      const res = await fetch("/api/quant/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "回测失败");
      setResult(data);
      setStep("result");
    } catch (e: any) {
      setError(e.message);
      setStep("params");
    }
  }, [params]);

  // ── 导出PDF ──
  const handleExportPdf = useCallback(async () => {
    if (!result) return;
    setExporting(true);
    try {
      const res = await fetch("/api/quant/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metrics: result.metrics,
          symbol: result.symbol,
          start_date: result.start_date,
          end_date: result.end_date,
          strategy_desc: parsed?.description_summary || description,
          strategy_type: params?.strategy_type || "ma_cross",
          trades: result.trades || [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "导出失败");
      const link = document.createElement("a");
      // 后端返回 HTML，用 Blob 下载
      const blob = new Blob([data.html], { type: "text/html;charset=utf-8" });
      link.href = URL.createObjectURL(blob);
      link.download = `回测报告_${result.symbol}_${result.start_date}.html`;
      link.click();
    } catch (e: any) {
      alert("PDF导出失败：" + e.message);
    } finally {
      setExporting(false);
    }
  }, [result, parsed, description]);

  const handleReset = () => {
    setStep("input");
    setDescription("");
    setParsed(null);
    setResult(null);
    setError("");
  };

  // ─── 渲染 ──────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#F5F5F5", fontFamily: "'PingFang SC','Helvetica Neue',sans-serif" }}>
      {/* 顶部导航 */}
      <div style={{
        background: "linear-gradient(135deg,#B71C1C 0%,#D32F2F 100%)",
        padding: "16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>
        <button
          onClick={() => window.history.back()}
          style={{
            background: "rgba(255,255,255,0.2)",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            width: 32,
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </button>
        <div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>量化回测分析</div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>AI 驱动的策略回测工具</div>
        </div>
      </div>

      <div style={{ padding: "16px", maxWidth: 600, margin: "0 auto" }}>

        {/* ── 步骤1：自然语言输入 ── */}
        {(step === "input" || step === "parsing") && (
          <div>
            <div style={{ background: "#fff", borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 10 }}>
                描述你的交易策略
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="例如：过去3年在20日均线上穿60日均线时买入茅台，回撤5%止损"
                style={{
                  width: "100%",
                  minHeight: 100,
                  border: "1.5px solid #e0e0e0",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 14,
                  color: "#1a1a1a",
                  resize: "vertical",
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
              {error && <div style={{ color: "#D32F2F", fontSize: 12, marginTop: 6 }}>{error}</div>}
              <button
                onClick={handleParse}
                disabled={!description.trim() || step === "parsing"}
                style={{
                  marginTop: 12,
                  width: "100%",
                  background: description.trim() ? "#D32F2F" : "#ccc",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "12px 0",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: description.trim() ? "pointer" : "not-allowed",
                }}
              >
                {step === "parsing" ? "AI 解析中..." : "AI 解析策略"}
              </button>
            </div>

            <div style={{ background: "#fff", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, color: "#888", marginBottom: 10 }}>快速示例</div>
              {STRATEGY_EXAMPLES.map((ex, i) => (
                <div
                  key={i}
                  onClick={() => setDescription(ex)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "#FFF8F8",
                    border: "1px solid #FFCDD2",
                    marginBottom: 8,
                    fontSize: 13,
                    color: "#B71C1C",
                    cursor: "pointer",
                    lineHeight: 1.5,
                  }}
                >
                  {ex}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 步骤2：确认/编辑参数 ── */}
        {(step === "params" || step === "running") && parsed && (
          <div style={{ background: "#fff", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>解析结果确认</div>
              <button onClick={handleReset} style={{ background: "none", border: "none", color: "#888", fontSize: 12, cursor: "pointer" }}>
                重新输入
              </button>
            </div>

            <div style={{ background: "#FFF8F8", borderRadius: 8, padding: "10px 12px", marginBottom: 14, fontSize: 13, color: "#B71C1C", lineHeight: 1.6 }}>
              {parsed.description_summary}
            </div>

            {[
              { label: "股票代码", key: "symbol", type: "text" },
              { label: "开始日期", key: "start_date", type: "date" },
              { label: "结束日期", key: "end_date", type: "date" },
              { label: "止损比例（如0.05=5%，0=不设止损）", key: "stop_loss", type: "number" },
            ].map(({ label, key, type }) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 3 }}>{label}</div>
                <input
                  type={type}
                  value={(params as any)[key] ?? ""}
                  onChange={(e) =>
                    setParams((p) => ({
                      ...p,
                      [key]: type === "number" ? parseFloat(e.target.value) : e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    border: "1.5px solid #e0e0e0",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 14,
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                />
              </div>
            ))}

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 3 }}>策略类型</div>
              <select
                value={params.strategy_type ?? "ma_cross"}
                onChange={(e) => setParams((p) => ({ ...p, strategy_type: e.target.value }))}
                style={{
                  width: "100%",
                  border: "1.5px solid #e0e0e0",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 14,
                  background: "#fff",
                  outline: "none",
                }}
              >
                {Object.entries(STRATEGY_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            {error && <div style={{ color: "#D32F2F", fontSize: 12, marginBottom: 8 }}>{error}</div>}

            <button
              onClick={handleBacktest}
              disabled={step === "running"}
              style={{
                width: "100%",
                background: "#D32F2F",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "12px 0",
                fontSize: 15,
                fontWeight: 600,
                cursor: step === "running" ? "not-allowed" : "pointer",
                opacity: step === "running" ? 0.7 : 1,
              }}
            >
              {step === "running" ? "回测执行中，请稍候..." : "开始回测"}
            </button>
          </div>
        )}

        {/* ── 步骤3：回测结果 ── */}
        {step === "result" && result && (
          <div>
            <div style={{
              background: "#fff",
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{result.symbol} 回测结果</div>
                <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
                  {result.start_date} ~ {result.end_date} · {STRATEGY_TYPE_LABELS[params.strategy_type ?? ""] || params.strategy_type}
                </div>
              </div>
              <button
                onClick={handleReset}
                style={{ background: "#F5F5F5", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#666", cursor: "pointer" }}
              >
                新建回测
              </button>
            </div>

            {/* 指标卡片 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <MetricCard label="总收益率" value={result.metrics.total_return} unit="%" positive={result.metrics.total_return > 0} />
              <MetricCard label="年化收益率" value={result.metrics.annual_return} unit="%" positive={result.metrics.annual_return > 0} />
              <MetricCard label="最大回撤" value={result.metrics.max_drawdown} unit="%" positive={false} />
              <MetricCard label="夏普比率" value={result.metrics.sharpe_ratio} positive={result.metrics.sharpe_ratio > 1} />
              <MetricCard label="胜率" value={result.metrics.win_rate} unit="%" positive={result.metrics.win_rate > 50} />
              <MetricCard label="交易次数" value={result.metrics.trade_count} unit="次" />
              <MetricCard label="平均持仓" value={result.metrics.avg_holding_days} unit="天" />
              <MetricCard label="最终资产" value={`¥${result.metrics.final_value.toLocaleString()}`} positive={result.metrics.final_value > result.metrics.initial_cash} />
            </div>

            {/* 图表 */}
            {result.chart_json && (
              <div style={{ background: "#fff", borderRadius: 12, padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 10 }}>净值曲线 & 买卖信号</div>
                <SimpleChart chartJson={result.chart_json} />
              </div>
            )}

            {/* 风险提示 */}
            <div style={{ background: "#FFF8F8", borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#B71C1C", lineHeight: 1.6 }}>
                风险提示：历史回测结果不代表未来收益，投资有风险，入市需谨慎。本工具仅供参考，不构成投资建议。
              </div>
            </div>

            {/* 导出PDF */}
            <button
              onClick={handleExportPdf}
              disabled={exporting}
              style={{
                width: "100%",
                background: exporting ? "#ccc" : "#1a1a1a",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "13px 0",
                fontSize: 15,
                fontWeight: 600,
                cursor: exporting ? "not-allowed" : "pointer",
                marginBottom: 20,
              }}
            >
              {exporting ? "生成报告中..." : "导出分析报告（HTML）"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
