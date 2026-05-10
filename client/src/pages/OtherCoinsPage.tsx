import { useState, useMemo, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Search, X, Loader2, ChevronLeft as PrevIcon, ChevronRight } from "lucide-react";

interface CoinItem {
  symbol: string;
  list_date: string | null;
  list_price: number | null;
  ath: number | null;
  atl: number | null;
  ath_multiple: number | null;
  current_price: number | null;
  drawdown_from_ath: number | null;
  has_data: boolean;
  has_spot: boolean;
  has_futures: boolean;
  exchanges: string[];
  types: string[];
}

const PAGE_SIZE = 50;

// ─── 格式化价格 ────────────────────────────────────────────────────────────────
function fmtPrice(val: number | null): string {
  if (val === null || val === undefined || val === 0) return "—";
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

// ─── 格式化涨幅倍数 ────────────────────────────────────────────────────────────
function fmtMultiple(m: number | null): string {
  if (m === null || m === undefined) return "—";
  if (m >= 10000) return `${(m / 1000).toFixed(0)}K×`;
  if (m >= 1000) return `${(m / 1000).toFixed(1)}K×`;
  if (m >= 100) return `${m.toFixed(0)}×`;
  return `${m.toFixed(1)}×`;
}

// ─── 格式化跌幅（两位小数%） ─────────────────────────────────────────────────
function fmtDrawdown(d: number | null): string {
  if (d === null || d === undefined) return "—";
  return `${d.toFixed(2)}%`;
}

// ─── 计算缩水倍数（高点/现价） ────────────────────────────────────────────────
function calcShrinkMultiple(ath: number | null, current: number | null): number | null {
  if (!ath || !current || current <= 0) return null;
  return ath / current;
}

// ─── 格式化缩水倍数（直接显示全数字，不换单位） ────────────────────────────────────────────
function fmtShrink(m: number | null): string {
  if (m === null || m === undefined) return "";
  // 直接显示全数字，不换K/M单位
  if (m >= 100) return `${Math.round(m)}×`;
  if (m >= 10) return `${m.toFixed(1)}×`;
  return `${m.toFixed(1)}×`;
}

// ─── 缩水倍数热力绿色 ─────────────────────────────────────────────────────────
// 倍数越大 → 越深绿（代表跌得越惨）
function shrinkColor(m: number | null): string {
  if (m === null) return "#ccc";
  if (m >= 1000) return "#1B5E20"; // 极深绿
  if (m >= 100)  return "#2E7D32";
  if (m >= 50)   return "#388E3C";
  if (m >= 20)   return "#43A047";
  if (m >= 10)   return "#66BB6A";
  if (m >= 5)    return "#81C784";
  if (m >= 2)    return "#A5D6A7";
  return "#C8E6C9"; // 浅绿（缩水不多）
}

type SortKey = "list_date" | "list_price" | "ath" | "atl" | "ath_multiple" | "current_price" | "drawdown_from_ath" | "shrink_multiple";

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export default function OtherCoinsPage() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const ledgerId = params.id ?? "52";

  const [coins, setCoins] = useState<CoinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("list_date");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [filterSpot, setFilterSpot] = useState<boolean | null>(null);
  const [filterFutures, setFilterFutures] = useState<boolean | null>(null);

  // 加载JSON数据
  useEffect(() => {
    fetch("/other-coins-full.json")
      .then(r => r.json())
      .then((data: CoinItem[]) => {
        setCoins(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 过滤 + 排序
  const filteredData = useMemo(() => {
    let list = coins.filter(c => {
      if (searchText && !c.symbol.toLowerCase().includes(searchText.toLowerCase())) return false;
      if (filterSpot !== null && c.has_spot !== filterSpot) return false;
      if (filterFutures !== null && c.has_futures !== filterFutures) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      if (!a.has_data && b.has_data) return 1;
      if (a.has_data && !b.has_data) return -1;
      if (!a.has_data && !b.has_data) return a.symbol.localeCompare(b.symbol);

      let va: number, vb: number;
      if (sortKey === "list_date") {
        va = parseInt((a.list_date || "0").replace("-", ""));
        vb = parseInt((b.list_date || "0").replace("-", ""));
      } else if (sortKey === "shrink_multiple") {
        va = (a.ath && a.current_price && a.current_price > 0) ? a.ath / a.current_price : 0;
        vb = (b.ath && b.current_price && b.current_price > 0) ? b.ath / b.current_price : 0;
      } else {
        va = (a[sortKey as keyof typeof a] as number) ?? 0;
        vb = (b[sortKey as keyof typeof b] as number) ?? 0;
      }
      return sortAsc ? va - vb : vb - va;
    });
    return list;
  }, [coins, searchText, sortKey, sortAsc, filterSpot, filterFutures]);

  // 分页
  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);
  const pageData = filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [searchText, filterSpot, filterFutures, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(v => !v);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const SortArrow = ({ k }: { k: SortKey }) => (
    <span style={{ marginLeft: 2, fontSize: 8, opacity: sortKey === k ? 1 : 0.3 }}>
      {sortKey === k ? (sortAsc ? "▲" : "▼") : "▼"}
    </span>
  );

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#F5F5F5", overflow: "hidden" }}>
      {/* ── 顶部彩色区域 ── */}
      <div style={{
        background: "linear-gradient(160deg, #1A237E 0%, #283593 40%, #1565C0 70%, #0D47A1 100%)",
        padding: "10px 14px 14px",
        flexShrink: 0,
        zIndex: 10,
      }}>
        {/* 第一行：返回 + 标题 + 更新按钮 */}
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
              OKX & 币安 · 全量 USDT 交易对
            </p>
          </div>
          <button
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer", flexShrink: 0 }}
            onClick={() => window.location.reload()}
          >
            更新
          </button>
        </div>

        {/* 筛选按钮行 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {[
            {
              label: "全部",
              count: loading ? "..." : `${coins.length}`,
              action: () => { setFilterSpot(null); setFilterFutures(null); },
              active: filterSpot === null && filterFutures === null,
            },
            {
              label: "现货+合约",
              count: loading ? "..." : `${coins.filter(c => c.has_spot && c.has_futures).length}`,
              action: () => { setFilterSpot(true); setFilterFutures(true); },
              active: filterSpot === true && filterFutures === true,
            },
            {
              label: "仅现货",
              count: loading ? "..." : `${coins.filter(c => c.has_spot && !c.has_futures).length}`,
              action: () => { setFilterSpot(true); setFilterFutures(false); },
              active: filterSpot === true && filterFutures === false,
            },
            {
              label: "仅合约",
              count: loading ? "..." : `${coins.filter(c => !c.has_spot && c.has_futures).length}`,
              action: () => { setFilterSpot(false); setFilterFutures(true); },
              active: filterSpot === false && filterFutures === true,
            },
          ].map(({ label, count, action, active }) => (
            <button
              key={label}
              onClick={action}
              style={{
                padding: "4px 10px", borderRadius: 12, fontSize: 10, fontWeight: 600,
                border: active ? "1px solid #fff" : "1px solid rgba(255,255,255,0.3)",
                background: active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
                color: active ? "#fff" : "rgba(255,255,255,0.65)",
                cursor: "pointer",
              }}
            >
              {label}({count})
            </button>
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

      {/* ── 白色列表区域（可滚动） ── */}
      <div style={{ flex: 1, background: "#fff", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {/* 表头 - 8列：币名 | 涨幅 | 上市时间 | 上市价 | 历史最高 | 现价 | 跌幅% | 缩水倍 */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "46px 40px 52px 60px 60px 60px 58px 44px",
          gap: 0,
          padding: "7px 8px",
          background: "#fafafa",
          borderBottom: "1px solid #e5e7eb",
          position: "sticky",
          top: 0,
          zIndex: 5,
        }}>
          {([
            { key: "list_date" as SortKey, label: "币名", idx: 0, sortable: false },
            { key: "ath_multiple" as SortKey, label: "涨幅", idx: 1, sortable: true },
            { key: "list_date" as SortKey, label: "上市时间", idx: 2, sortable: true },
            { key: "list_price" as SortKey, label: "上市价", idx: 3, sortable: true },
            { key: "ath" as SortKey, label: "历史最高", idx: 4, sortable: true },
            { key: "current_price" as SortKey, label: "现价", idx: 5, sortable: true },
            { key: "drawdown_from_ath" as SortKey, label: "跌幅%", idx: 6, sortable: true },
            { key: "shrink_multiple" as SortKey, label: "缩水倍", idx: 7, sortable: true },
          ]).map(({ key, label, idx, sortable }) => (
            <div
              key={`${key}-${idx}`}
              onClick={() => sortable && handleSort(key)}
              style={{
                fontSize: 9, fontWeight: 600, color: "#888",
                textAlign: idx === 0 ? "left" : "right",
                cursor: sortable ? "pointer" : "default",
                userSelect: "none",
                display: "flex", alignItems: "center",
                justifyContent: idx === 0 ? "flex-start" : "flex-end",
              }}
            >
              {label}
              {sortable && <SortArrow k={key} />}
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
          <>
            {pageData.map((coin, idx) => {
              const m = coin.ath_multiple;
              const isHighMultiple = m !== null && m >= 100;
              const isMidMultiple = m !== null && m >= 10;
              const hasData = coin.has_data;
              const dd = coin.drawdown_from_ath;
              const shrink = calcShrinkMultiple(coin.ath, coin.current_price);
              const shrinkBg = shrinkColor(shrink);

              return (
                <div
                  key={coin.symbol}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "46px 40px 52px 60px 60px 60px 58px 44px",
                    gap: 0,
                    padding: "8px 8px",
                    borderBottom: "1px solid #f0f0f0",
                    background: idx % 2 === 0 ? "#fff" : "#fafafa",
                    alignItems: "center",
                  }}
                >
                  {/* 币名 + 类型标签 */}
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#1a1a1a" }}>{coin.symbol}</span>
                    <div style={{ display: "flex", gap: 2, marginTop: 1, flexWrap: "wrap" }}>
                      {coin.has_spot && (
                        <span style={{
                          fontSize: 7, fontWeight: 600, color: "#fff",
                          background: "#1565C0", borderRadius: 2, padding: "0px 2px",
                        }}>现</span>
                      )}
                      {coin.has_futures && (
                        <span style={{
                          fontSize: 7, fontWeight: 600, color: "#fff",
                          background: "#6A1B9A", borderRadius: 2, padding: "0px 2px",
                        }}>合</span>
                      )}
                    </div>
                  </div>

                  {/* 涨幅倍数 */}
                  <div style={{ textAlign: "right" }}>
                    {hasData && m !== null ? (
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: "#fff",
                        background: isHighMultiple ? "#D32F2F" : isMidMultiple ? "#E65100" : "#546E7A",
                        borderRadius: 3, padding: "2px 3px",
                        display: "inline-block",
                      }}>
                        {fmtMultiple(m)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 9, color: "#ccc" }}>—</span>
                    )}
                  </div>

                  {/* 上市时间 */}
                  <div style={{ textAlign: "right", fontSize: 10, color: hasData ? "#555" : "#ccc", fontVariantNumeric: "tabular-nums" }}>
                    {coin.list_date ?? "暂无"}
                  </div>

                  {/* 上市价 */}
                  <div style={{ textAlign: "right", fontSize: 10, color: hasData ? "#333" : "#ccc", fontVariantNumeric: "tabular-nums", fontFamily: "monospace" }}>
                    {fmtPrice(coin.list_price)}
                  </div>

                  {/* 历史最高 */}
                  <div style={{ textAlign: "right", fontSize: 10, color: hasData ? "#D32F2F" : "#ccc", fontWeight: hasData ? 600 : 400, fontVariantNumeric: "tabular-nums", fontFamily: "monospace" }}>
                    {fmtPrice(coin.ath)}
                  </div>

                  {/* 现价 */}
                  <div style={{ textAlign: "right", fontSize: 10, color: coin.current_price ? "#1565C0" : "#ccc", fontWeight: coin.current_price ? 600 : 400, fontVariantNumeric: "tabular-nums", fontFamily: "monospace" }}>
                    {fmtPrice(coin.current_price)}
                  </div>

                  {/* 跌幅%列 */}
                  <div style={{ textAlign: "right", fontSize: 9, color: "#888", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {dd !== null ? fmtDrawdown(dd) : "—"}
                  </div>

                  {/* 缩水倍列 */}
                  <div style={{ textAlign: "right" }}>
                    {shrink !== null && shrink > 1 ? (
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: "#fff",
                        background: shrinkBg,
                        borderRadius: 3, padding: "1px 3px",
                        display: "inline-block",
                        whiteSpace: "nowrap",
                      }}>
                        {fmtShrink(shrink)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 9, color: "#ccc" }}>—</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* 分页控件 */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: 8, padding: "16px 12px 24px",
              borderTop: "1px solid #f0f0f0",
            }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  width: 32, height: 32, borderRadius: "50%", border: "1px solid #e0e0e0",
                  background: page === 1 ? "#f5f5f5" : "#fff",
                  cursor: page === 1 ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: page === 1 ? "#ccc" : "#333",
                }}
              >
                <PrevIcon style={{ width: 14, height: 14 }} />
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let p: number;
                if (totalPages <= 5) {
                  p = i + 1;
                } else if (page <= 3) {
                  p = i + 1;
                } else if (page >= totalPages - 2) {
                  p = totalPages - 4 + i;
                } else {
                  p = page - 2 + i;
                }
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    style={{
                      width: 32, height: 32, borderRadius: "50%",
                      border: p === page ? "none" : "1px solid #e0e0e0",
                      background: p === page ? "#1565C0" : "#fff",
                      color: p === page ? "#fff" : "#333",
                      fontSize: 12, fontWeight: p === page ? 700 : 400,
                      cursor: "pointer",
                    }}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  width: 32, height: 32, borderRadius: "50%", border: "1px solid #e0e0e0",
                  background: page === totalPages ? "#f5f5f5" : "#fff",
                  cursor: page === totalPages ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: page === totalPages ? "#ccc" : "#333",
                }}
              >
                <ChevronRight style={{ width: 14, height: 14 }} />
              </button>

              <span style={{ fontSize: 11, color: "#888", marginLeft: 4 }}>
                {page} / {totalPages} 页
              </span>
            </div>
          </>
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
