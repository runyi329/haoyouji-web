import { trpc } from "@/lib/trpc";
import { useEffect } from "react";
import { useLocation, useParams } from "wouter";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const NAMES: Record<string, string> = {
  BTCUSDT: "比特币",
  ETHUSDT: "以太坊",
  SOLUSDT: "Solana",
};
const SHORT: Record<string, string> = {
  BTCUSDT: "BTC",
  ETHUSDT: "ETH",
  SOLUSDT: "SOL",
};
const COLORS: Record<string, string> = {
  BTCUSDT: "#f7931a",   // 比特币橙
  ETHUSDT: "#627eea",   // 以太坊蓝
  SOLUSDT: "#9945ff",   // SOL紫
};

function fmtRate(rate: number) {
  const pct = (rate * 100).toFixed(4);
  return rate >= 0 ? `+${pct}%` : `${pct}%`;
}
function fmtAnnual(rate: number) {
  const pct = (rate * 100).toFixed(2);
  return rate >= 0 ? `+${pct}%` : `${pct}%`;
}
function fmtTime(ts: number) {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:00`;
}

export default function CryptoFundingHistoryPage() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const ledgerId = params?.id || "";
  const backPath = ledgerId ? `/ledger/${ledgerId}` : "/";

  const { data: rawData, isLoading, error } = trpc.crypto.getAllFundingHistory.useQuery();
  const CACHE_KEY = "crypto_funding_history_cache";

  // 成功拉到数据时写入缓存
  useEffect(() => {
    if (rawData && (rawData as any).grouped && Object.keys((rawData as any).grouped).length > 0) {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: rawData, savedAt: Date.now() })); } catch {}
    }
  }, [rawData]);

  // 读取缓存兜底
  const cachedRaw = (() => {
    try { const s = localStorage.getItem(CACHE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  })();
  const data = (rawData && (rawData as any).grouped && Object.keys((rawData as any).grouped).length > 0)
    ? rawData
    : cachedRaw?.data;
  const isUsingCache = !rawData && !!cachedRaw?.data;
  const cacheTime = isUsingCache ? new Date(cachedRaw.savedAt) : null;

  if (isLoading) {
    return (
      <div style={{ background: "#0d1117", minHeight: "100vh", color: "#e6edf3", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#8b949e" }}>加载中...</div>
        </div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div style={{ background: "#0d1117", minHeight: "100vh", color: "#e6edf3", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#f85149" }}>加载失败</div>
          <button onClick={() => setLocation(backPath)} style={{ marginTop: 12, padding: "6px 16px", background: "#21262d", border: "1px solid #30363d", borderRadius: 6, color: "#e6edf3", fontSize: 12 }}>返回</button>
        </div>
      </div>
    );
  }

  const { grouped, stats } = data as any;

  // 构建统一时间轴（所有合约的时间点合并去重排序）
  const allTimes = new Set<number>();
  for (const sym of SYMBOLS) {
    if (grouped[sym]) {
      for (const r of grouped[sym]) allTimes.add(r.fundingTime);
    }
  }
  const sortedTimes = Array.from(allTimes).sort((a, b) => b - a); // 最新在前

  // 建立快速查找 map
  const rateMap: Record<string, Record<number, number>> = {};
  for (const sym of SYMBOLS) {
    rateMap[sym] = {};
    if (grouped[sym]) {
      for (const r of grouped[sym]) {
        rateMap[sym][r.fundingTime] = r.fundingRate;
      }
    }
  }

  return (
    <div style={{ background: "#0d1117", minHeight: "100vh", color: "#e6edf3", fontFamily: "monospace" }}>
      {/* 顶部导航 */}
      <div style={{ position: "sticky", top: 0, background: "#0d1117", borderBottom: "1px solid #21262d", zIndex: 10, display: "flex", alignItems: "center", padding: "10px 12px", gap: 8 }}>
        <button
          onClick={() => setLocation(backPath)}
          style={{ background: "none", border: "none", color: "#8b949e", fontSize: 18, cursor: "pointer", padding: "0 4px", lineHeight: 1 }}
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3" }}>加密货币资金费率历史</div>
          <div style={{ fontSize: 10, color: "#8b949e" }}>
            BTC / ETH / SOL · 2025-01-01 至今 · {sortedTimes.length > 0 ? `共 ${sortedTimes.length} 期` : ""}
            {isUsingCache && cacheTime && (
              <span style={{ marginLeft: 6, color: "#d29922" }}>
                缓存 {cacheTime.toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 年化统计卡片 */}
      <div style={{ padding: "12px 12px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {SYMBOLS.map(sym => {
            const s = stats?.[sym];
            const color = COLORS[sym];
            return (
              <div key={sym} style={{ background: "#161b22", border: `1px solid ${color}33`, borderRadius: 8, padding: "10px 8px" }}>
                <div style={{ textAlign: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: color, fontWeight: 800 }}>{SHORT[sym]}</span>
                  <span style={{ fontSize: 9, color: "#8b949e", marginLeft: 4 }}>{NAMES[sym]}</span>
                </div>
                {/* 多头净年化 */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                  <span style={{ fontSize: 9, color: "#8b949e" }}>多头净年化</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: s?.netAnnual >= 0 ? "#f85149" : "#3fb950" }}>
                    {s ? fmtAnnual(s.netAnnual) : "--"}
                  </span>
                </div>
                {/* 空头净年化（与多头相反） */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 9, color: "#8b949e" }}>空头净年化</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: s ? (s.netAnnual >= 0 ? "#3fb950" : "#f85149") : "#8b949e" }}>
                    {s ? fmtAnnual(-s.netAnnual) : "--"}
                  </span>
                </div>
                <div style={{ borderTop: "1px solid #21262d", paddingTop: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ fontSize: 9, color: "#8b949e" }}>正费率均化</span>
                    <span style={{ fontSize: 9, color: "#f85149" }}>{s ? fmtAnnual(s.posAnnual) : "--"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                    <span style={{ fontSize: 9, color: "#8b949e" }}>负费率均化</span>
                    <span style={{ fontSize: 9, color: "#3fb950" }}>{s ? fmtAnnual(s.negAnnual) : "--"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 9, color: "#8b949e" }}>共 {s?.count ?? 0} 次</span>
                    <span style={{ fontSize: 9, color: "#8b949e" }}>正{s?.posCount ?? 0}/负{s?.negCount ?? 0}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 说明 */}
      <div style={{ padding: "8px 12px", fontSize: 10, color: "#6e7681", lineHeight: 1.5 }}>
        多头净年化：正负费率抵消后的年化成本（正值=多头净付出，负值=多头净收益）；空头净年化与多头相反
      </div>

      {/* 三列表头 */}
      <div style={{ position: "sticky", top: 45, background: "#0d1117", zIndex: 9, borderBottom: "1px solid #21262d" }}>
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr 1fr", padding: "6px 12px" }}>
          <div style={{ fontSize: 10, color: "#8b949e" }}>时间</div>
          {SYMBOLS.map(sym => (
            <div key={sym} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: COLORS[sym], fontWeight: 800 }}>{SHORT[sym]}</div>
              <div style={{ fontSize: 9, color: "#8b949e" }}>{NAMES[sym]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 数据列表 */}
      <div style={{ padding: "0 12px 24px" }}>
        {sortedTimes.map((ts, idx) => {
          const isEven = idx % 2 === 0;
          return (
            <div
              key={ts}
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 1fr 1fr",
                padding: "5px 0",
                borderBottom: "1px solid #161b22",
                background: isEven ? "transparent" : "#0d1117",
              }}
            >
              <div style={{ fontSize: 10, color: "#8b949e", alignSelf: "center" }}>{fmtTime(ts)}</div>
              {SYMBOLS.map(sym => {
                const rate = rateMap[sym]?.[ts];
                if (rate === undefined) {
                  return <div key={sym} style={{ textAlign: "center", fontSize: 10, color: "#30363d" }}>—</div>;
                }
                const isPos = rate >= 0;
                return (
                  <div key={sym} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: isPos ? "#f85149" : "#3fb950" }}>
                    {fmtRate(rate)}
                  </div>
                );
              })}
            </div>
          );
        })}
        {sortedTimes.length === 0 && (
          <div style={{ textAlign: "center", padding: 32, color: "#8b949e", fontSize: 13 }}>暂无数据</div>
        )}
      </div>
    </div>
  );
}
