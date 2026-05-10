import { useState, useMemo, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Search, X, Loader2 } from "lucide-react";

interface CoinItem {
  symbol: string;
  listDate: string;
  listPrice: number;
  histHigh: number;
  histLow: number;
}

// ─── 格式化价格 ────────────────────────────────────────────────────────────────
function fmtPrice(val: number): string {
  if (!val || val === 0) return "—";
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

type SortKey = "listDate" | "listPrice" | "histHigh" | "histLow";

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export default function OtherCoinsPage() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const ledgerId = params.id ?? "52";

  const [coins, setCoins] = useState<CoinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("listDate");
  const [sortAsc, setSortAsc] = useState(true);

  // 加载JSON数据
  useEffect(() => {
    fetch("/other-coins-data.json")
      .then(r => r.json())
      .then((data: CoinItem[]) => {
        setCoins(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 过滤 + 排序
  const filteredData = useMemo(() => {
    let list = coins.filter(c =>
      c.symbol.toLowerCase().includes(searchText.toLowerCase())
    );
    list = [...list].sort((a, b) => {
      let va: number, vb: number;
      if (sortKey === "listDate") {
        va = parseInt(a.listDate.replace("-", ""));
        vb = parseInt(b.listDate.replace("-", ""));
      } else {
        va = (a[sortKey] as number) ?? 0;
        vb = (b[sortKey] as number) ?? 0;
      }
      return sortAsc ? va - vb : vb - va;
    });
    return list;
  }, [coins, searchText, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(v => !v);
    } else {
      setSortKey(key);
      setSortAsc(key === "listDate" ? true : false);
    }
  };

  const SortArrow = ({ k }: { k: SortKey }) => (
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
            {loading ? "..." : `${filteredData.length} 个`}
          </div>
        </div>

        {/* 统计摘要行 */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: 6, marginBottom: 10,
        }}>
          {[
            { label: "最早上市", value: "2017-08" },
            { label: "总计币种", value: loading ? "..." : `${coins.length}` },
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
          top: 148,
        }}>
          {([
            { key: "listDate" as SortKey, label: "币名", idx: 0 },
            { key: "listDate" as SortKey, label: "上市时间", idx: 1 },
            { key: "listPrice" as SortKey, label: "上市价", idx: 2 },
            { key: "histHigh" as SortKey, label: "历史最高", idx: 3 },
            { key: "histLow" as SortKey, label: "历史最低", idx: 4 },
          ]).map(({ key, label, idx }) => (
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

        {/* 加载中 */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "60px 0", color: "#aaa" }}>
            <Loader2 style={{ width: 24, height: 24, animation: "spin 1s linear infinite" }} />
          </div>
        ) : filteredData.length === 0 ? (
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
                {/* 币名 + 倍数标签 */}
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

        {/* 底部留白 */}
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
