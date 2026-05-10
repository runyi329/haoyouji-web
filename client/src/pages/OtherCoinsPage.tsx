import { useState, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Search, X } from "lucide-react";

// ─── 静态数据：177个主流币种（排除BTC/ETH/SOL） ────────────────────────────────
const OTHER_COINS_DATA = [
  { symbol: "BNB", listDate: "2017-11", listPrice: 1.5, histHigh: 1375.11, histLow: 0.5 },
  { symbol: "NEO", listDate: "2017-11", listPrice: 36.0, histHigh: 198.6, histLow: 2.347 },
  { symbol: "LTC", listDate: "2017-12", listPrice: 272.0, histHigh: 413.49, histLow: 22.32 },
  { symbol: "QTUM", listDate: "2018-03", listPrice: 16.0, histHigh: 35.685, histLow: 0.71 },
  { symbol: "ADA", listDate: "2018-04", listPrice: 0.25551, histHigh: 3.101, histLow: 0.01765 },
  { symbol: "IOTA", listDate: "2018-05", listPrice: 1.4, histHigh: 2.6773, histLow: 0.0515 },
  { symbol: "XLM", listDate: "2018-05", listPrice: 0.28021, histHigh: 0.7985, histLow: 0.026 },
  { symbol: "XRP", listDate: "2018-05", listPrice: 0.5, histHigh: 3.6607, histLow: 0.10129 },
  { symbol: "ETC", listDate: "2018-06", listPrice: 16.2, histHigh: 179.83, histLow: 3.0726 },
  { symbol: "ICX", listDate: "2018-06", listPrice: 1.9525, histHigh: 3.2, histLow: 0.0002 },
  { symbol: "ONT", listDate: "2018-06", listPrice: 8.335, histHigh: 8.642, histLow: 0.03893 },
  { symbol: "TRX", listDate: "2018-06", listPrice: 0.05, histHigh: 0.45, histLow: 0.00684 },
  { symbol: "VET", listDate: "2018-07", listPrice: 0.0225, histHigh: 0.279829, histLow: 0.001565 },
  { symbol: "LINK", listDate: "2019-01", listPrice: 0.5355, histHigh: 53.0, histLow: 0.0001 },
  { symbol: "ZIL", listDate: "2019-02", listPrice: 0.0195, histHigh: 0.25691, histLow: 0.00224 },
  { symbol: "ZRX", listDate: "2019-02", listPrice: 0.265, histHigh: 2.4, histLow: 0.0868 },
  { symbol: "BAT", listDate: "2019-03", listPrice: 0.1691, histHigh: 1.929, histLow: 0.08 },
  { symbol: "DASH", listDate: "2019-03", listPrice: 90.0, histHigh: 478.0, histLow: 17.4 },
  { symbol: "IOST", listDate: "2019-03", listPrice: 0.03, histHigh: 0.091254, histLow: 0.0000140 },
  { symbol: "ZEC", listDate: "2019-03", listPrice: 58.5, histHigh: 750.0, histLow: 15.78 },
  { symbol: "ATOM", listDate: "2019-04", listPrice: 4.755, histHigh: 44.8, histLow: 0.001 },
  { symbol: "ENJ", listDate: "2019-04", listPrice: 0.179, histHigh: 4.845, histLow: 0.00001 },
  { symbol: "THETA", listDate: "2019-04", listPrice: 0.135, histHigh: 15.88, histLow: 0.03554 },
  { symbol: "ALGO", listDate: "2019-06", listPrice: 3.4, histHigh: 3.44, histLow: 0.0794 },
  { symbol: "ONE", listDate: "2019-06", listPrice: 0.015, histHigh: 0.38, histLow: 0.00118 },
  { symbol: "DOGE", listDate: "2019-07", listPrice: 0.00449, histHigh: 0.73995, histLow: 0.0011345 },
  { symbol: "BAND", listDate: "2019-09", listPrice: 2.365, histHigh: 23.3046, histLow: 0.1923 },
  { symbol: "CHZ", listDate: "2019-09", listPrice: 0.00743, histHigh: 0.9449, histLow: 0.0038 },
  { symbol: "HBAR", listDate: "2019-09", listPrice: 0.1, histHigh: 0.5701, histLow: 0.00975 },
  { symbol: "KAVA", listDate: "2019-10", listPrice: 0.4, histHigh: 9.1, histLow: 0.3 },
  { symbol: "LUNA", listDate: "2019-11", listPrice: 0.1, histHigh: 119.18, histLow: 0.00001 },
  { symbol: "OGN", listDate: "2019-11", listPrice: 0.1, histHigh: 3.28, histLow: 0.0297 },
  { symbol: "CELR", listDate: "2019-12", listPrice: 0.0065, histHigh: 0.1965, histLow: 0.00107 },
  { symbol: "MATIC", listDate: "2019-12", listPrice: 0.00263, histHigh: 2.92, histLow: 0.00263 },
  { symbol: "FET", listDate: "2020-02", listPrice: 0.0886, histHigh: 3.4, histLow: 0.00856 },
  { symbol: "KNC", listDate: "2020-02", listPrice: 0.9, histHigh: 6.77, histLow: 0.1 },
  { symbol: "COMP", listDate: "2020-06", listPrice: 239.0, histHigh: 911.2, histLow: 20.0 },
  { symbol: "DOT", listDate: "2020-08", listPrice: 2.69, histHigh: 55.0, histLow: 2.69 },
  { symbol: "FIL", listDate: "2020-10", listPrice: 26.0, histHigh: 237.0, histLow: 2.0 },
  { symbol: "UNI", listDate: "2020-09", listPrice: 3.0, histHigh: 44.97, histLow: 1.03 },
  { symbol: "AAVE", listDate: "2020-10", listPrice: 55.0, histHigh: 661.69, histLow: 26.02 },
  { symbol: "SUSHI", listDate: "2020-09", listPrice: 2.5, histHigh: 23.38, histLow: 0.4951 },
  { symbol: "YFI", listDate: "2020-07", listPrice: 1000.0, histHigh: 93435.0, histLow: 672.0 },
  { symbol: "NEAR", listDate: "2020-10", listPrice: 1.0, histHigh: 20.44, histLow: 0.526 },
  { symbol: "AVAX", listDate: "2020-09", listPrice: 4.0, histHigh: 146.22, histLow: 2.8 },
  { symbol: "AXS", listDate: "2020-11", listPrice: 0.15, histHigh: 164.9, histLow: 0.1234 },
  { symbol: "GRT", listDate: "2020-12", listPrice: 0.1, histHigh: 2.88, histLow: 0.0527 },
  { symbol: "1INCH", listDate: "2020-12", listPrice: 0.75, histHigh: 8.65, histLow: 0.1485 },
  { symbol: "SAND", listDate: "2020-08", listPrice: 0.05, histHigh: 8.44, histLow: 0.0285 },
  { symbol: "MANA", listDate: "2020-08", listPrice: 0.05, histHigh: 5.85, histLow: 0.0082 },
  { symbol: "CHR", listDate: "2019-08", listPrice: 0.16, histHigh: 0.9863, histLow: 0.0145 },
  { symbol: "FLOW", listDate: "2021-01", listPrice: 10.0, histHigh: 46.16, histLow: 0.3615 },
  { symbol: "ICP", listDate: "2021-05", listPrice: 630.0, histHigh: 750.0, histLow: 2.97 },
  { symbol: "SHIB", listDate: "2021-05", listPrice: 0.000008, histHigh: 0.00008845, histLow: 0.0000000056 },
  { symbol: "STX", listDate: "2021-01", listPrice: 0.5, histHigh: 3.87, histLow: 0.0459 },
  { symbol: "GALA", listDate: "2021-09", listPrice: 0.0025, histHigh: 0.8237, histLow: 0.000499 },
  { symbol: "IMX", listDate: "2021-11", listPrice: 2.5, histHigh: 9.52, histLow: 0.3648 },
  { symbol: "LDO", listDate: "2021-12", listPrice: 2.0, histHigh: 7.3, histLow: 0.4074 },
  { symbol: "APE", listDate: "2022-03", listPrice: 8.0, histHigh: 39.4, histLow: 0.3574 },
  { symbol: "OP", listDate: "2022-05", listPrice: 1.0, histHigh: 4.84, histLow: 0.4048 },
  { symbol: "APT", listDate: "2022-10", listPrice: 8.0, histHigh: 20.4, histLow: 3.08 },
  { symbol: "ARB", listDate: "2023-03", listPrice: 1.2, histHigh: 2.39, histLow: 0.3573 },
  { symbol: "SUI", listDate: "2023-05", listPrice: 1.0, histHigh: 5.35, histLow: 0.3674 },
  { symbol: "SEI", listDate: "2023-08", listPrice: 0.1, histHigh: 0.9, histLow: 0.0784 },
  { symbol: "TIA", listDate: "2023-10", listPrice: 2.0, histHigh: 21.0, histLow: 0.3 },
  { symbol: "INJ", listDate: "2020-10", listPrice: 0.5, histHigh: 52.0, histLow: 0.3 },
  { symbol: "BLUR", listDate: "2023-02", listPrice: 0.5, histHigh: 1.19, histLow: 0.0744 },
  { symbol: "JUP", listDate: "2024-01", listPrice: 0.7, histHigh: 1.9, histLow: 0.2 },
  { symbol: "WLD", listDate: "2023-07", listPrice: 2.0, histHigh: 11.74, histLow: 0.7 },
  { symbol: "PYTH", listDate: "2023-11", listPrice: 0.4, histHigh: 1.15, histLow: 0.1 },
  { symbol: "JTO", listDate: "2023-12", listPrice: 2.5, histHigh: 4.95, histLow: 0.7 },
  { symbol: "STRK", listDate: "2024-02", listPrice: 2.0, histHigh: 3.3, histLow: 0.1 },
  { symbol: "MANTA", listDate: "2024-01", listPrice: 3.0, histHigh: 3.65, histLow: 0.2 },
  { symbol: "ALT", listDate: "2024-01", listPrice: 0.3, histHigh: 0.5, histLow: 0.04 },
  { symbol: "PENDLE", listDate: "2021-06", listPrice: 0.1, histHigh: 7.52, histLow: 0.03 },
  { symbol: "RENDER", listDate: "2020-10", listPrice: 0.05, histHigh: 13.6, histLow: 0.036 },
  { symbol: "TAO", listDate: "2023-03", listPrice: 30.0, histHigh: 750.0, histLow: 30.0 },
  { symbol: "MOVE", listDate: "2024-12", listPrice: 1.0, histHigh: 1.73, histLow: 0.18 },
  { symbol: "ENA", listDate: "2024-04", listPrice: 1.0, histHigh: 1.52, histLow: 0.18 },
  { symbol: "EIGEN", listDate: "2024-10", listPrice: 4.0, histHigh: 7.64, histLow: 0.7 },
  { symbol: "BERA", listDate: "2025-02", listPrice: 7.0, histHigh: 15.8, histLow: 1.5 },
  { symbol: "RPL", listDate: "2021-11", listPrice: 20.0, histHigh: 60.0, histLow: 4.0 },
  { symbol: "SNX", listDate: "2019-03", listPrice: 0.3, histHigh: 28.77, histLow: 0.03 },
  { symbol: "CRV", listDate: "2020-08", listPrice: 3.0, histHigh: 60.5, histLow: 0.1748 },
  { symbol: "GMX", listDate: "2021-09", listPrice: 15.0, histHigh: 90.0, histLow: 10.0 },
  { symbol: "DYDX", listDate: "2021-09", listPrice: 7.0, histHigh: 27.86, histLow: 0.4 },
  { symbol: "PEPE", listDate: "2023-04", listPrice: 0.000001, histHigh: 0.00002803, histLow: 0.0000006 },
  { symbol: "WIF", listDate: "2023-12", listPrice: 0.1, histHigh: 4.83, histLow: 0.08 },
  { symbol: "BONK", listDate: "2023-01", listPrice: 0.000001, histHigh: 0.00005927, histLow: 0.0000001 },
  { symbol: "FLOKI", listDate: "2021-06", listPrice: 0.0001, histHigh: 0.0003404, histLow: 0.0000001 },
  { symbol: "ONDO", listDate: "2024-01", listPrice: 0.1, histHigh: 2.14, histLow: 0.07 },
  { symbol: "XTZ", listDate: "2018-07", listPrice: 2.0, histHigh: 9.12, histLow: 0.35 },
  { symbol: "BCH", listDate: "2017-08", listPrice: 300.0, histHigh: 4355.62, histLow: 76.93 },
  { symbol: "CAKE", listDate: "2020-09", listPrice: 0.5, histHigh: 44.18, histLow: 0.25 },
  { symbol: "RAY", listDate: "2020-12", listPrice: 0.5, histHigh: 16.93, histLow: 0.1 },
  { symbol: "XMR", listDate: "2018-01", listPrice: 300.0, histHigh: 517.62, histLow: 35.0 },
  { symbol: "LUNC", listDate: "2022-05", listPrice: 0.0002, histHigh: 0.00063, histLow: 0.00001 },
  { symbol: "KAS", listDate: "2022-05", listPrice: 0.0001, histHigh: 0.2088, histLow: 0.0001 },
  { symbol: "POPCAT", listDate: "2024-03", listPrice: 0.05, histHigh: 2.06, histLow: 0.03 },
  { symbol: "FARTCOIN", listDate: "2024-12", listPrice: 0.1, histHigh: 2.5, histLow: 0.05 },
  { symbol: "BRETT", listDate: "2024-03", listPrice: 0.01, histHigh: 0.2, histLow: 0.005 },
  { symbol: "DRIFT", listDate: "2024-05", listPrice: 0.5, histHigh: 2.5, histLow: 0.1 },
  { symbol: "MOCA", listDate: "2024-06", listPrice: 0.2, histHigh: 0.6, histLow: 0.05 },
  { symbol: "MAVIA", listDate: "2024-02", listPrice: 5.0, histHigh: 12.0, histLow: 0.5 },
  { symbol: "TAIKO", listDate: "2024-05", listPrice: 2.5, histHigh: 8.0, histLow: 0.5 },
  { symbol: "CHILLGUY", listDate: "2024-11", listPrice: 0.05, histHigh: 0.7, histLow: 0.01 },
  { symbol: "PUMP", listDate: "2025-09", listPrice: 0.004502, histHigh: 0.00898, histLow: 0.000411 },
  { symbol: "SKY", listDate: "2025-09", listPrice: 0.07558, histHigh: 0.095, histLow: 0.03491 },
  { symbol: "WLFI", listDate: "2025-09", listPrice: 0.2, histHigh: 0.478, histLow: 0.0512 },
  { symbol: "XPL", listDate: "2025-09", listPrice: 0.1, histHigh: 1.693, histLow: 0.07 },
  { symbol: "ASTER", listDate: "2025-10", listPrice: 1.5, histHigh: 3.0, histLow: 0.403 },
  { symbol: "MORPHO", listDate: "2025-10", listPrice: 1.55, histHigh: 2.365, histLow: 0.557 },
  { symbol: "ALLO", listDate: "2025-11", listPrice: 0.22, histHigh: 0.9887, histLow: 0.0453 },
  { symbol: "KITE", listDate: "2025-11", listPrice: 0.03, histHigh: 0.3233, histLow: 0.03 },
  { symbol: "MET", listDate: "2025-11", listPrice: 0.467, histHigh: 0.549, histLow: 0.1238 },
  { symbol: "MMT", listDate: "2025-11", listPrice: 0.1, histHigh: 4.4754, histLow: 0.1 },
  { symbol: "BREV", listDate: "2026-01", listPrice: 0.075, histHigh: 0.596, histLow: 0.075 },
  { symbol: "FOGO", listDate: "2026-01", listPrice: 0.035, histHigh: 0.09708, histLow: 0.01578 },
  { symbol: "SENT", listDate: "2026-01", listPrice: 0.011, histHigh: 0.0495, histLow: 0.011 },
  { symbol: "ZAMA", listDate: "2026-02", listPrice: 0.025, histHigh: 0.04888, histLow: 0.0166 },
  { symbol: "KAT", listDate: "2026-03", listPrice: 0.005, histHigh: 0.03065, histLow: 0.005 },
  { symbol: "NIGHT", listDate: "2026-03", listPrice: 0.0424, histHigh: 0.05523, histLow: 0.02974 },
  { symbol: "ROBO", listDate: "2026-03", listPrice: 0.0348, histHigh: 0.05018, histLow: 0.01601 },
  { symbol: "CHIP", listDate: "2026-04", listPrice: 0.012, histHigh: 0.14069, histLow: 0.012 },
  { symbol: "MEGA", listDate: "2026-04", listPrice: 0.053, histHigh: 0.37, histLow: 0.053 },
];

// ─── 格式化价格 ────────────────────────────────────────────────────────────────
function fmtPrice(val: number): string {
  if (val === 0) return "—";
  if (val >= 10000) return val.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (val >= 1000) return val.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (val >= 100) return val.toFixed(2);
  if (val >= 10) return val.toFixed(3);
  if (val >= 1) return val.toFixed(4);
  if (val >= 0.01) return val.toFixed(5);
  if (val >= 0.001) return val.toFixed(6);
  if (val >= 0.0001) return val.toFixed(7);
  return val.toExponential(3);
}

// ─── 计算涨幅倍数 ──────────────────────────────────────────────────────────────
function calcMultiple(listPrice: number, histHigh: number): string {
  if (!listPrice || !histHigh) return "—";
  const m = histHigh / listPrice;
  if (m >= 1000) return `${(m / 1000).toFixed(1)}K×`;
  if (m >= 100) return `${m.toFixed(0)}×`;
  return `${m.toFixed(1)}×`;
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export default function OtherCoinsPage() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const ledgerId = params.id ?? "52";

  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState<"listDate" | "listPrice" | "histHigh" | "histLow" | "multiple">("listDate");
  const [sortAsc, setSortAsc] = useState(true);

  // 过滤 + 排序
  const filteredData = useMemo(() => {
    let list = OTHER_COINS_DATA.filter(c =>
      c.symbol.toLowerCase().includes(searchText.toLowerCase())
    );
    list = [...list].sort((a, b) => {
      let va: number, vb: number;
      if (sortKey === "listDate") {
        va = a.listDate.replace("-", "").padEnd(6, "0") as unknown as number;
        vb = b.listDate.replace("-", "").padEnd(6, "0") as unknown as number;
        va = parseInt(a.listDate.replace("-", ""));
        vb = parseInt(b.listDate.replace("-", ""));
      } else if (sortKey === "multiple") {
        va = a.listPrice > 0 ? a.histHigh / a.listPrice : 0;
        vb = b.listPrice > 0 ? b.histHigh / b.listPrice : 0;
      } else {
        va = a[sortKey] as number;
        vb = b[sortKey] as number;
      }
      return sortAsc ? va - vb : vb - va;
    });
    return list;
  }, [searchText, sortKey, sortAsc]);

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortAsc(v => !v);
    } else {
      setSortKey(key);
      setSortAsc(key === "listDate" ? true : false);
    }
  };

  const SortArrow = ({ k }: { k: typeof sortKey }) => (
    <span style={{ marginLeft: 2, fontSize: 8, opacity: sortKey === k ? 1 : 0.3 }}>
      {sortKey === k ? (sortAsc ? "▲" : "▼") : "▲"}
    </span>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#F5F5F5" }}>
      {/* ── 顶部彩色区域 ── */}
      <div style={{
        background: "linear-gradient(160deg, #1A237E 0%, #283593 40%, #1565C0 70%, #0D47A1 100%)",
        padding: "10px 14px 14px",
        flexShrink: 0,
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}>
        {/* 第一行：返回 + 标题 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/be-data?filter=crypto`)}
            style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "rgba(255,255,255,0.18)", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0,
            }}
          >
            <ChevronLeft style={{ width: 16, height: 16, color: "#fff" }} />
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 800, fontSize: 15, color: "#fff", margin: 0, lineHeight: 1.2 }}>
              其他币种
            </p>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.3 }}>
              OKX & 币安 · 主流 USDT 交易对
            </p>
          </div>
          <div style={{
            padding: "3px 8px", borderRadius: 12,
            background: "rgba(255,255,255,0.15)",
            border: "1px solid rgba(255,255,255,0.25)",
            fontSize: 10, color: "rgba(255,255,255,0.85)", fontWeight: 600,
          }}>
            {filteredData.length} 个
          </div>
        </div>

        {/* 统计摘要行 */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: 6, marginBottom: 10,
        }}>
          {[
            { label: "最早上市", value: "2017-08" },
            { label: "总计币种", value: `${OTHER_COINS_DATA.length}` },
            { label: "最新上市", value: "2026-04" },
          ].map(({ label, value }) => (
            <div key={label} style={{
              borderRadius: 8, padding: "6px 8px",
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.15)",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* 搜索框 */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "rgba(255,255,255,0.15)",
          border: "1px solid rgba(255,255,255,0.25)",
          borderRadius: 20, padding: "5px 10px",
        }}>
          <Search style={{ width: 13, height: 13, color: "rgba(255,255,255,0.7)", flexShrink: 0 }} />
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="搜索币种名称..."
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              fontSize: 12, color: "#fff",
            }}
          />
          {searchText && (
            <button
              onClick={() => setSearchText("")}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
            >
              <X style={{ width: 13, height: 13, color: "rgba(255,255,255,0.6)" }} />
            </button>
          )}
        </div>
      </div>

      {/* ── 白色列表区域 ── */}
      <div style={{ flex: 1, background: "#fff" }}>
        {/* 表头 */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "52px 60px 72px 72px 72px",
          gap: 0,
          padding: "7px 12px",
          background: "#fafafa",
          borderBottom: "1px solid #e5e7eb",
          position: "sticky",
          top: "calc(10px + 28px + 10px + 52px + 10px + 30px + 14px)",
        }}>
          {[
            { key: "listDate" as const, label: "币名" },
            { key: "listDate" as const, label: "上市时间" },
            { key: "listPrice" as const, label: "上市价" },
            { key: "histHigh" as const, label: "历史最高" },
            { key: "histLow" as const, label: "历史最低" },
          ].map(({ key, label }, idx) => (
            <div
              key={`${key}-${idx}`}
              onClick={() => idx > 0 && handleSort(key)}
              style={{
                fontSize: 9, fontWeight: 600, color: "#888",
                textAlign: idx === 0 ? "left" : "right",
                cursor: idx > 0 ? "pointer" : "default",
                userSelect: "none",
                display: "flex", alignItems: "center",
                justifyContent: idx === 0 ? "flex-start" : "flex-end",
              }}
            >
              {label}
              {idx > 0 && <SortArrow k={key} />}
            </div>
          ))}
        </div>

        {/* 数据行 */}
        {filteredData.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#aaa", fontSize: 13 }}>
            未找到匹配的币种
          </div>
        ) : (
          filteredData.map((coin, idx) => {
            const multiple = coin.listPrice > 0 ? coin.histHigh / coin.listPrice : 0;
            const isHighMultiple = multiple >= 100;
            const isMidMultiple = multiple >= 10;
            return (
              <div
                key={coin.symbol}
                style={{
                  display: "grid",
                  gridTemplateColumns: "52px 60px 72px 72px 72px",
                  gap: 0,
                  padding: "8px 12px",
                  borderBottom: "1px solid #f0f0f0",
                  background: idx % 2 === 0 ? "#fff" : "#fafafa",
                  alignItems: "center",
                }}
              >
                {/* 币名 */}
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a" }}>{coin.symbol}</span>
                  <span style={{
                    fontSize: 8, fontWeight: 600, color: "#fff",
                    background: isHighMultiple ? "#D32F2F" : isMidMultiple ? "#E65100" : "#546E7A",
                    borderRadius: 3, padding: "1px 3px",
                    display: "inline-block", marginTop: 1, width: "fit-content",
                  }}>
                    {calcMultiple(coin.listPrice, coin.histHigh)}
                  </span>
                </div>
                {/* 上市时间 */}
                <div style={{ textAlign: "right", fontSize: 10, color: "#555", fontVariantNumeric: "tabular-nums" }}>
                  {coin.listDate}
                </div>
                {/* 上市价 */}
                <div style={{ textAlign: "right", fontSize: 10, color: "#333", fontVariantNumeric: "tabular-nums", fontFamily: "monospace" }}>
                  {fmtPrice(coin.listPrice)}
                </div>
                {/* 历史最高 */}
                <div style={{ textAlign: "right", fontSize: 10, color: "#D32F2F", fontWeight: 600, fontVariantNumeric: "tabular-nums", fontFamily: "monospace" }}>
                  {fmtPrice(coin.histHigh)}
                </div>
                {/* 历史最低 */}
                <div style={{ textAlign: "right", fontSize: 10, color: "#388E3C", fontVariantNumeric: "tabular-nums", fontFamily: "monospace" }}>
                  {fmtPrice(coin.histLow)}
                </div>
              </div>
            );
          })
        )}

        {/* 底部留白（避免被底部按钮遮挡） */}
        <div style={{ height: 80 }} />
      </div>

      {/* ── 底部返回按钮 ── */}
      <div style={{
        position: "fixed", bottom: 24, left: 0, right: 0, zIndex: 100,
        display: "flex", justifyContent: "center", pointerEvents: "none",
      }}>
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/be-data?filter=crypto`)}
          style={{
            pointerEvents: "auto",
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 18px", borderRadius: 20,
            background: "rgba(255,255,255,0.95)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
            border: "none", cursor: "pointer",
            fontSize: 12, fontWeight: 600, color: "#1565C0",
            backdropFilter: "blur(8px)",
          }}
        >
          <ChevronLeft style={{ width: 14, height: 14 }} />
          返回行情
        </button>
      </div>
    </div>
  );
}
