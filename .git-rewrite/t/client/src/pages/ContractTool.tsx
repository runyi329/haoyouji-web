import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, TrendingUp } from "lucide-react";

// Chart.js 动态加载
declare global {
  interface Window {
    Chart: any;
  }
}

export default function ContractTool() {
  const [, setLocation] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  const chartJsLoaded = useRef(false);

  const [nSpot, setNSpot] = useState(10111);
  const [nContract, setNContract] = useState(9805);
  const [nEntry, setNEntry] = useState(0.9041);
  const [uCash, setUCash] = useState(123);
  const [targetP, setTargetP] = useState(0.3);

  const [liqPrice, setLiqPrice] = useState("0.0000");
  const [liqColor, setLiqColor] = useState("#3fb950");
  const [needCash, setNeedCash] = useState(0);

  const refresh = useCallback(() => {
    if (!chartJsLoaded.current || !window.Chart || !canvasRef.current) return;

    const rho = 0.9;
    const mmr = 0.01;

    const lp = (nContract * nEntry - uCash) / (nSpot * rho + nContract * (1 - mmr));
    const displayPrice = lp > 0 ? lp.toFixed(4) : "安全/无爆仓";
    setLiqPrice(displayPrice);
    setLiqColor(lp > nEntry * 0.8 ? "#ff4d4f" : "#3fb950");

    const need = nContract * nEntry - (nSpot * rho + nContract * (1 - mmr)) * targetP - uCash;
    setNeedCash(need > 0 ? Math.ceil(need) : 0);

    // 图表
    const chartMin = lp > 0 ? lp * 0.7 : 0.1;
    const chartMax = nEntry * 1.3;
    const step = (chartMax - chartMin) / 12;
    const prices: string[] = [];
    const equities: number[] = [];
    const margins: number[] = [];

    for (let p = chartMin; p <= chartMax; p += step) {
      prices.push(p.toFixed(2));
      equities.push(nSpot * p * rho + uCash + nContract * (p - nEntry));
      margins.push(nContract * p * mmr);
    }

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    chartRef.current = new window.Chart(ctx, {
      type: "line",
      data: {
        labels: prices,
        datasets: [
          {
            label: "账户净值",
            data: equities,
            borderColor: "#58a6ff",
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 0,
          },
          {
            label: "强平红线",
            data: margins,
            borderColor: "#ff4d4f",
            borderDash: [4, 4],
            borderWidth: 1,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#8b949e", font: { size: 10 } } },
          y: { display: false },
        },
      },
    });
  }, [nSpot, nContract, nEntry, uCash, targetP]);

  useEffect(() => {
    if (chartJsLoaded.current) {
      refresh();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/chart.js";
    script.onload = () => {
      chartJsLoaded.current = true;
      refresh();
    };
    document.head.appendChild(script);
  }, [refresh]);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#0d1117", color: "white", fontFamily: "-apple-system, sans-serif" }}
    >
      {/* 顶部导航 */}
      <div
        style={{
          background: "linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%)",
          borderBottom: "1px solid #30363d",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <button
          onClick={() => setLocation("/tools")}
          style={{
            background: "none",
            border: "none",
            color: "#58a6ff",
            cursor: "pointer",
            padding: "4px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <ArrowLeft style={{ width: 22, height: 22 }} />
        </button>
        <TrendingUp style={{ width: 22, height: 22, color: "#58a6ff" }} />
        <div>
          <div style={{ fontSize: 16, fontWeight: "bold" }}>合约工具</div>
          <div style={{ fontSize: 11, color: "#8b949e" }}>SUI 动态风控 PRO</div>
        </div>
      </div>

      {/* 主体内容 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "10px", gap: "10px", overflowY: "auto" }}>
        {/* 强平价显示 */}
        <div
          style={{
            textAlign: "center",
            padding: "15px",
            background: "#161b22",
            borderRadius: 12,
            border: "1px solid #30363d",
          }}
        >
          <div style={{ fontSize: 14, color: "#8b949e" }}>动态强平参考价 (USDT)</div>
          <div
            style={{
              fontSize: 42,
              fontWeight: "bold",
              color: liqColor,
              margin: "5px 0",
              textShadow: `0 0 10px ${liqColor}44`,
            }}
          >
            {liqPrice}
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, color: "#8b949e" }}>
            账户模式：OE 跨币种保证金 (SUI折算率0.9)
          </div>
        </div>

        {/* 图表 */}
        <div
          style={{
            background: "#161b22",
            borderRadius: 12,
            padding: "10px",
            height: 200,
            border: "1px solid #30363d",
          }}
        >
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
        </div>
      </div>

      {/* 底部控制区 */}
      <div
        style={{
          background: "#161b22",
          padding: "15px",
          borderRadius: "12px 12px 0 0",
          borderTop: "1px solid #30363d",
          boxShadow: "0 -5px 15px rgba(0,0,0,0.3)",
        }}
      >
        {/* 目标爆仓价建议 */}
        <div
          style={{
            background: "#1f2937",
            padding: "10px 12px",
            borderRadius: 8,
            fontSize: 13,
            borderLeft: "4px solid #1890ff",
            marginBottom: 12,
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 4,
          }}
        >
          <span>🛡️ 目标爆仓价</span>
          <input
            type="number"
            value={targetP}
            step={0.05}
            onChange={(e) => setTargetP(parseFloat(e.target.value) || 0)}
            style={{
              background: "#0d1117",
              border: "1px solid #30363d",
              color: "white",
              padding: "2px 5px",
              borderRadius: 4,
              width: 60,
              fontSize: 13,
            }}
          />
          <span>，需补充</span>
          <span style={{ color: "#ff4d4f", fontSize: 16, fontWeight: "bold" }}>
            {needCash.toLocaleString()}
          </span>
          <span>USDT 现金</span>
        </div>

        {/* 现货 SUI */}
        <SliderRow
          label="现货 SUI"
          value={nSpot}
          displayValue={nSpot.toLocaleString()}
          min={0}
          max={30000}
          step={100}
          onChange={setNSpot}
        />

        {/* 多单 SUI */}
        <SliderRow
          label="多单 SUI"
          value={nContract}
          displayValue={nContract.toLocaleString()}
          min={0}
          max={30000}
          step={100}
          onChange={setNContract}
        />

        {/* 合约均价 */}
        <SliderRow
          label="合约均价"
          value={nEntry}
          displayValue={nEntry.toFixed(4)}
          min={0.5}
          max={2.0}
          step={0.01}
          onChange={setNEntry}
        />

        {/* USDT 现金 */}
        <SliderRow
          label="USDT 现金"
          value={uCash}
          displayValue={uCash.toLocaleString()}
          min={0}
          max={10000}
          step={100}
          onChange={setUCash}
        />
      </div>
    </div>
  );
}

interface SliderRowProps {
  label: string;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

function SliderRow({ label, value, displayValue, min, max, step, onChange }: SliderRowProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 13,
          marginBottom: 5,
          color: "#8b949e",
        }}
      >
        <span>{label}</span>
        <span style={{ color: "#58a6ff", fontWeight: "bold" }}>{displayValue}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", height: 6, borderRadius: 3, accentColor: "#58a6ff" }}
      />
    </div>
  );
}
