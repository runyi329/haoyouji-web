/**
 * USStockTracker.tsx
 * 美股七巨头全景仪表盘 - 重新设计版 v3
 * 每张卡片4行紧凑展示，第一屏放下7张
 */
import { useMemo } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, TrendingUp, TrendingDown, BarChart2, Search } from "lucide-react";
import { trpc } from "@/lib/trpc";

// ─── 配色 ────────────────────────────────────────────────
const BLUE = "#1565C0";
const BLUE_DARK = "#0D47A1";
const BG = "#EEF2F8";
const CARD = "#FFFFFF";
const BORDER = "#D8E0EC";
const TEXT = "#1A1A1A";
const MUTED = "#888888";
const MUTED2 = "#AAAAAA";
const RED = "#D32F2F";
const GREEN = "#00B050";
const GOLD = "#B8860B";
const CARD_SHADOW = "0 1px 6px rgba(0,0,0,0.07)";

// ─── 七巨头配置 ────────────────────────────────────────────
const COS = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets";
const MEGA_SEVEN = [
  { symbol: "AAPL.US",  name: "Apple",     code: "AAPL",  sector: "科技", logo: `${COS}/logo_apple_3d_t_16b8b55f.png` },
  { symbol: "MSFT.US",  name: "Microsoft", code: "MSFT",  sector: "科技", logo: `${COS}/logos/logo_microsoft_3d.png` },
  { symbol: "NVDA.US",  name: "NVIDIA",    code: "NVDA",  sector: "半导体", logo: `${COS}/logo_nvidia_3d_t_d451eb3d.png` },
  { symbol: "GOOGL.US", name: "Alphabet",  code: "GOOGL", sector: "科技", logo: `${COS}/logos/logo_google_3d.png` },
  { symbol: "AMZN.US",  name: "Amazon",    code: "AMZN",  sector: "电商", logo: `${COS}/logo_amazon_3d_t_0c61d380.png` },
  { symbol: "META.US",  name: "Meta",      code: "META",  sector: "社交", logo: `${COS}/logo_meta_3d_t_5b7237ab.png` },
  { symbol: "TSLA.US",  name: "Tesla",     code: "TSLA",  sector: "新能源", logo: `${COS}/logo_tesla_3d_t_0d585ca4.png` },
];

// 格式化成交量
function fmtVol(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1e8) return (v / 1e8).toFixed(1) + "亿";
  if (v >= 1e4) return (v / 1e4).toFixed(0) + "万";
  return v.toFixed(0);
}

// 格式化价格
function fmtPrice(v: number | null): string {
  if (v == null) return "—";
  return "$" + v.toFixed(2);
}

// 52周进度条
function Week52Bar({ low, high, current }: { low: number; high: number; current: number }) {
  const range = high - low;
  const pct = range > 0 ? Math.max(0, Math.min(100, ((current - low) / range) * 100)) : 50;
  const color = pct >= 70 ? RED : pct >= 40 ? GOLD : GREEN;
  return (
    <div style={{ flex: 1 }}>
      <div style={{ position: "relative", height: 4, borderRadius: 2, background: "#E0E8F0", overflow: "visible" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, borderRadius: 2, background: color, transition: "width 0.4s" }} />
        <div style={{
          position: "absolute",
          top: -3, left: `calc(${pct}% - 4px)`,
          width: 8, height: 8, borderRadius: "50%",
          background: color, border: "1.5px solid #fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span style={{ fontSize: 8, color: MUTED2 }}>{fmtPrice(low)}</span>
        <span style={{ fontSize: 8, color: color, fontWeight: 600 }}>{pct.toFixed(0)}%</span>
        <span style={{ fontSize: 8, color: MUTED2 }}>{fmtPrice(high)}</span>
      </div>
    </div>
  );
}

// 评级标签
function RatingBadge({ rating }: { rating: string | null }) {
  if (!rating) return null;
  const r = rating.toUpperCase();
  const color = r === "BUY" ? GREEN : r === "SELL" ? RED : GOLD;
  const label = r === "BUY" ? "买入" : r === "SELL" ? "卖出" : "持有";
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color: "#fff",
      background: color, borderRadius: 3,
      padding: "1px 4px", lineHeight: 1.4,
    }}>{label}</span>
  );
}

// 技术面方向标签
function TrendBadge({ dir }: { dir: string | null }) {
  if (!dir) return null;
  const isBull = dir.toLowerCase().includes("bull");
  return (
    <span style={{
      fontSize: 9, fontWeight: 600,
      color: isBull ? RED : GREEN,
      background: isBull ? "rgba(211,47,47,0.08)" : "rgba(0,176,80,0.08)",
      borderRadius: 3, padding: "1px 4px", lineHeight: 1.4,
    }}>{isBull ? "↑看多" : "↓看空"}</span>
  );
}

// 估值标签
function ValBadge({ desc, discount }: { desc: string | null; discount: string | null }) {
  if (!desc) return null;
  const isOver = desc.toLowerCase().includes("over");
  const isFair = desc.toLowerCase().includes("fair");
  const color = isOver ? RED : isFair ? GOLD : GREEN;
  const label = isOver ? "高估" : isFair ? "合理" : "低估";
  return (
    <span style={{ fontSize: 9, color, fontWeight: 600 }}>
      {label}{discount ? ` ${discount}` : ""}
    </span>
  );
}

// 骨架屏
function Sk({ w = 40 }: { w?: number }) {
  return <span style={{ display: "inline-block", width: w, height: 10, borderRadius: 3, background: "#E0E8F0", animation: "pulse 1.5s infinite" }} />;
}

// ─── 单只股票卡片（4行紧凑）────────────────────────────────
function StockCard({
  stock,
  priceData,
  fundamentals,
  onClick,
  isLast,
}: {
  stock: typeof MEGA_SEVEN[0];
  priceData?: { close: number; changePct: number | null; date: string; open?: number; high?: number; low?: number; volume?: number; amplitudePct?: number | null };
  fundamentals?: {
    week52High: number | null;
    week52Low: number | null;
    tradingDays?: number;
  } | null;
  onClick: () => void;
  isLast: boolean;
}) {
  const isUp = (priceData?.changePct ?? 0) >= 0;
  const changeColor = isUp ? RED : GREEN;
  const sign = isUp ? "+" : "";

  const vol = priceData?.volume ?? null;
  const w52H = fundamentals?.week52High ?? null;
  const w52L = fundamentals?.week52Low ?? null;
  const curPrice = priceData?.close ?? null;

  return (
    <div
      onClick={onClick}
      style={{
        padding: "5px 10px",
        borderBottom: isLast ? "none" : `1px solid ${BORDER}`,
        cursor: "pointer",
      }}
    >
      {/* ── 第一行：Logo + 公司名/代码/行业 + 价格 + 涨跌幅 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Logo */}
        <img
          src={stock.logo}
          alt={stock.name}
          style={{ width: 28, height: 28, objectFit: "contain", flexShrink: 0, filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.12))" }}
        />
        {/* 公司名 + 代码 + 行业 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: TEXT, lineHeight: 1.2 }}>{stock.name}</span>
            <span style={{ fontSize: 9, color: "#fff", background: BLUE, borderRadius: 3, padding: "1px 4px", lineHeight: 1.4, flexShrink: 0 }}>{stock.sector}</span>
          </div>
          <span style={{ fontSize: 9, color: MUTED, lineHeight: 1.2 }}>{stock.code} · {priceData?.date ?? "—"}</span>
        </div>
        {/* 价格 + 涨跌幅 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
          {priceData ? (
            <>
              <span style={{ fontSize: 14, fontWeight: 800, color: TEXT, lineHeight: 1.2 }}>${priceData.close.toFixed(2)}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, color: changeColor,
                background: isUp ? "rgba(211,47,47,0.08)" : "rgba(0,176,80,0.08)",
                borderRadius: 4, padding: "1px 5px", marginTop: 1, lineHeight: 1.3,
              }}>{sign}{priceData.changePct?.toFixed(2) ?? "—"}%</span>
            </>
          ) : (
            <>
              <Sk w={56} />
              <div style={{ marginTop: 3 }}><Sk w={40} /></div>
            </>
          )}
        </div>
        <span style={{ color: MUTED2, fontSize: 12, marginLeft: 2 }}>›</span>
      </div>

      {/* ── 第二行：今日开高低量振幅 ── */}
      <div style={{ display: "flex", gap: 0, marginTop: 3 }}>
        {[
          { label: "开", val: priceData?.open != null ? `$${priceData.open.toFixed(1)}` : "—" },
          { label: "高", val: priceData?.high != null ? `$${priceData.high.toFixed(1)}` : "—" },
          { label: "低", val: priceData?.low != null ? `$${priceData.low.toFixed(1)}` : "—" },
          { label: "量", val: fmtVol(vol) },
          { label: "振", val: priceData?.amplitudePct != null ? `${priceData.amplitudePct.toFixed(1)}%` : "—" },
        ].map((item, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 7.5, color: MUTED2, lineHeight: 1.2 }}>{item.label}</div>
            <div style={{ fontSize: 9.5, fontWeight: 600, color: TEXT, lineHeight: 1.2 }}>{item.val}</div>
          </div>
        ))}
      </div>

      {/* ── 第三行：52周高低 + 进度条 ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 3 }}>
        {fundamentals !== undefined ? (
          w52H != null && w52L != null ? (
            <>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 7.5, color: MUTED2, lineHeight: 1.2 }}>52W高</div>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: RED, lineHeight: 1.2 }}>{fmtPrice(w52H)}</div>
              </div>
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 7.5, color: MUTED2, lineHeight: 1.2 }}>52W低</div>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: GREEN, lineHeight: 1.2 }}>{fmtPrice(w52L)}</div>
              </div>
              {curPrice != null && w52H > w52L && (
                <div style={{ flex: 3, paddingLeft: 8 }}>
                  <Week52Bar low={w52L} high={w52H} current={curPrice} />
                </div>
              )}
            </>
          ) : (
            <span style={{ fontSize: 9, color: MUTED2 }}>暂无年度数据</span>
          )
        ) : (
          <Sk w={200} />
        )}
      </div>
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────
export default function USStockTracker() {
  const [, setLocation] = useLocation();

  // 批量获取7只股票最新日线价格
  const codes = useMemo(() => MEGA_SEVEN.map(s => s.code), []);
  const { data: latestPrices } = trpc.cryptoData.getLatestPrices.useQuery(
    { symbols: codes },
    { refetchInterval: 60_000, staleTime: 30_000 }
  );

  // 标普500指数
  const { data: sp500 } = trpc.stock.getSP500Index.useQuery(undefined, {
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const sp500Up = (sp500?.changePercent ?? 0) >= 0;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: BG }}>

      {/* ── 顶部导航 ── */}
      <div
        style={{
          padding: "10px 16px 12px",
          background: `linear-gradient(135deg, ${BLUE} 0%, ${BLUE_DARK} 100%)`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <button
            onClick={() => setLocation("/")}
            style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.2)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
          >
            <ChevronLeft style={{ width: 16, height: 16, color: "#fff" }} />
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: 16, color: "#fff", margin: 0, lineHeight: 1.2 }}>美股七巨头</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", margin: 0, lineHeight: 1.3 }}>七大科技巨头 · 日线行情</p>
          </div>
          <button
            onClick={() => setLocation("/us-stock-tracker/stock-lifecycle")}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer" }}
          >
            <Search style={{ width: 11, height: 11 }} />
            全市场
          </button>
        </div>

        {/* 标普500 指数条 */}
        <div style={{ borderRadius: 10, padding: "6px 12px", background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", lineHeight: 1.3 }}>标普500 S&P 500</div>
            {sp500 ? (
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 1 }}>
                <span style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>
                  {sp500.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: sp500Up ? "#FF8A80" : "#69F0AE" }}>
                  {sp500Up ? "+" : ""}{sp500.changePercent.toFixed(2)}%
                </span>
              </div>
            ) : (
              <div style={{ marginTop: 4 }}><Sk w={120} /></div>
            )}
          </div>
          {sp500Up ? (
            <TrendingUp style={{ width: 18, height: 18, color: "#FF8A80" }} />
          ) : (
            <TrendingDown style={{ width: 18, height: 18, color: "#69F0AE" }} />
          )}
        </div>
      </div>

      {/* ── 主内容区 ── */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 24 }}>

        {/* 七巨头卡片列表 */}
        <div style={{ padding: "10px 12px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>七巨头行情</span>
            <span style={{ fontSize: 10, color: MUTED }}>点击查看日线详情</span>
          </div>
          <div style={{
            borderRadius: 14,
            background: CARD,
            boxShadow: CARD_SHADOW,
            border: `1px solid ${BORDER}`,
            overflow: "hidden",
          }}>
            {MEGA_SEVEN.map((stock, idx) => {
              const pd = latestPrices?.[stock.code];
              return (
                <StockCardWithFundamentals
                  key={stock.symbol}
                  stock={stock}
                  priceData={pd}
                  onClick={() => setLocation(`/ledger/52/be-data?filter=stocks&symbol=${stock.symbol}`)}
                  isLast={idx === MEGA_SEVEN.length - 1}
                />
              );
            })}
          </div>
          <div style={{ marginTop: 6, fontSize: 9, textAlign: "center", color: MUTED2 }}>
            * 收盘价、量、振幅、52周高低均来自数据库 · 每日收盘后自动更新
          </div>
        </div>

        {/* 功能入口 */}
        <div style={{ padding: "10px 12px 0" }}>
          <div
            style={{
              borderRadius: 12, padding: "10px 14px", cursor: "pointer",
              background: CARD, boxShadow: CARD_SHADOW, border: `1px solid ${BORDER}`,
              display: "flex", alignItems: "center", gap: 12,
            }}
            onClick={() => setLocation("/ledger/52/be-data?filter=stocks")}
          >
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${BLUE}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <BarChart2 style={{ width: 18, height: 18, color: BLUE }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>七巨头日线数据分析</div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>涨跌幅 · 振幅 · 连涨连跌 · 历史K线</div>
            </div>
            <span style={{ color: BLUE, fontSize: 16 }}>›</span>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── 带基本面数据的卡片包装器（每只股票独立请求）────────────
function StockCardWithFundamentals({
  stock,
  priceData,
  onClick,
  isLast,
}: {
  stock: typeof MEGA_SEVEN[0];
  priceData?: { close: number; changePct: number | null; date: string; open?: number; high?: number; low?: number; volume?: number; amplitudePct?: number | null };
  onClick: () => void;
  isLast: boolean;
}) {
  const { data: fundamentals } = trpc.cryptoData.getStockFundamentals.useQuery(
    { symbol: stock.code },
    { staleTime: 5 * 60_000, refetchInterval: 10 * 60_000 }
  );

  return (
    <StockCard
      stock={stock}
      priceData={priceData}
      fundamentals={fundamentals}
      onClick={onClick}
      isLast={isLast}
    />
  );
}
