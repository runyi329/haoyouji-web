/**
 * USStockTracker.tsx
 * 美股全市场仪表盘 v4
 * 顶部：七巨头快捷卡片 + 标普500
 * 主体：全市场12000+只股票列表（搜索+分类Tab+分页）
 * P032
 */
import { useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, TrendingUp, TrendingDown, Search, X, BarChart2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { PageTag } from "@/components/PageTag";

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
const CARD_SHADOW = "0 1px 6px rgba(0,0,0,0.07)";

// ─── 七巨头配置 ────────────────────────────────────────────
const COS = "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets";
const MEGA_SEVEN = [
  { symbol: "AAPL.US", name: "Apple",     code: "AAPL",  sector: "科技",  logo: `${COS}/logo_apple_3d_t_16b8b55f.png` },
  { symbol: "MSFT.US", name: "Microsoft", code: "MSFT",  sector: "科技",  logo: `${COS}/logos/logo_microsoft_3d.png` },
  { symbol: "NVDA.US", name: "NVIDIA",    code: "NVDA",  sector: "半导体", logo: `${COS}/logo_nvidia_3d_t_d451eb3d.png` },
  { symbol: "GOOGL.US",name: "Alphabet",  code: "GOOGL", sector: "科技",  logo: `${COS}/logos/logo_google_3d.png` },
  { symbol: "AMZN.US", name: "Amazon",    code: "AMZN",  sector: "电商",  logo: `${COS}/logo_amazon_3d_t_0c61d380.png` },
  { symbol: "META.US", name: "Meta",      code: "META",  sector: "社交",  logo: `${COS}/logo_meta_3d_t_5b7237ab.png` },
  { symbol: "TSLA.US", name: "Tesla",     code: "TSLA",  sector: "新能源", logo: `${COS}/logo_tesla_3d_t_0d585ca4.png` },
];

// ─── 分类Tab ────────────────────────────────────────────
const CLASSIFY_TABS = [
  { key: "", label: "全部" },
  { key: "EQ", label: "普通股" },
  { key: "ADR", label: "ADR" },
  { key: "ETF", label: "ETF" },
  { key: "GDR", label: "GDR" },
];

// ─── 工具函数 ────────────────────────────────────────────
function fmtPrice(v: number | null): string {
  if (v == null || v <= 0) return "—";
  if (v >= 1000) return "$" + v.toFixed(0);
  if (v >= 100) return "$" + v.toFixed(1);
  return "$" + v.toFixed(2);
}

// 骨架屏
function Sk({ w = 40 }: { w?: number }) {
  return (
    <span style={{
      display: "inline-block", width: w, height: 10, borderRadius: 3,
      background: "#E0E8F0", animation: "pulse 1.5s infinite",
    }} />
  );
}

// ─── 七巨头迷你卡片 ────────────────────────────────────────
function MegaSevenCard({
  stock,
  priceData,
  onClick,
}: {
  stock: typeof MEGA_SEVEN[0];
  priceData?: { close: number; changePct: number | null; date: string };
  onClick: () => void;
}) {
  const isUp = (priceData?.changePct ?? 0) >= 0;
  const changeColor = isUp ? RED : GREEN;
  const sign = isUp ? "+" : "";

  return (
    <div
      onClick={onClick}
      style={{
        minWidth: 80, padding: "6px 8px", borderRadius: 10,
        background: CARD, border: `1px solid ${BORDER}`,
        boxShadow: CARD_SHADOW, cursor: "pointer", flexShrink: 0,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
      }}
    >
      <img
        src={stock.logo}
        alt={stock.name}
        style={{ width: 24, height: 24, objectFit: "contain", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))" }}
      />
      <span style={{ fontSize: 10, fontWeight: 700, color: TEXT }}>{stock.code}</span>
      {priceData ? (
        <>
          <span style={{ fontSize: 10, fontWeight: 700, color: TEXT }}>{fmtPrice(priceData.close)}</span>
          <span style={{ fontSize: 9, fontWeight: 600, color: changeColor }}>
            {sign}{priceData.changePct?.toFixed(2) ?? "—"}%
          </span>
        </>
      ) : (
        <>
          <Sk w={44} />
          <Sk w={32} />
        </>
      )}
    </div>
  );
}

// ─── 全市场股票行 ────────────────────────────────────────
function StockRow({
  item,
  rank,
}: {
  item: {
    tsCode: string;
    name: string | null;
    enname: string | null;
    classify: string;
    exchange: string | null;
    lastClose: number | null;
    lastTradeDate: string | null;
  };
  rank: number;
}) {
  // 从 ts_code 提取纯代码（去掉 .US 后缀）
  const code = item.tsCode.replace(/\.US$/i, "");
  const displayName = item.name || item.enname || code;

  const classifyColor: Record<string, string> = {
    EQ: BLUE,
    ADR: "#7B1FA2",
    ETF: "#00695C",
    GDR: "#E65100",
  };
  const tagColor = classifyColor[item.classify] || MUTED;

  return (
    <div style={{
      display: "flex", alignItems: "center", padding: "7px 12px",
      borderBottom: `1px solid ${BORDER}`, gap: 8,
    }}>
      {/* 排名 */}
      <span style={{ fontSize: 10, color: MUTED2, width: 24, textAlign: "right", flexShrink: 0 }}>
        {rank}
      </span>
      {/* 代码 + 名称 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{code}</span>
          <span style={{
            fontSize: 8, color: "#fff", background: tagColor,
            borderRadius: 3, padding: "1px 3px", lineHeight: 1.4, flexShrink: 0,
          }}>{item.classify}</span>
        </div>
        <span style={{
          fontSize: 10, color: MUTED, lineHeight: 1.2,
          display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{displayName}</span>
      </div>
      {/* 价格 */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>
          {fmtPrice(item.lastClose)}
        </div>
        <div style={{ fontSize: 9, color: MUTED2 }}>
          {item.lastTradeDate || "—"}
        </div>
      </div>
    </div>
  );
}

// ─── 主页面 ────────────────────────────────────────────────
export default function USStockTracker() {
  const [, setLocation] = useLocation();
  const [keyword, setKeyword] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [classify, setClassify] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 七巨头价格
  const codes = MEGA_SEVEN.map(s => s.code);
  const { data: latestPrices } = trpc.cryptoData.getLatestPrices.useQuery(
    { symbols: codes },
    { refetchInterval: 60_000, staleTime: 30_000 }
  );

  // 标普500
  const { data: sp500 } = trpc.stock.getSP500Index.useQuery(undefined, {
    refetchInterval: 5000,
    staleTime: 2000,
  });
  const sp500Up = (sp500?.changePercent ?? 0) >= 0;

  // 全市场股票列表
  const { data: stockList, isLoading } = trpc.stock.getUsStockBasicList.useQuery(
    { page, pageSize: PAGE_SIZE, keyword: keyword || undefined, classify: classify || undefined },
    { staleTime: 5 * 60_000, keepPreviousData: true }
  );

  const totalPages = stockList ? Math.ceil(stockList.total / PAGE_SIZE) : 0;

  const handleSearch = useCallback((val: string) => {
    setInputVal(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setKeyword(val.trim());
      setPage(1);
    }, 400);
  }, []);

  const handleClassify = (key: string) => {
    setClassify(key);
    setPage(1);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: BG }}>
      <PageTag code="P032" />

      {/* ── 顶部导航 ── */}
      <div style={{
        padding: "10px 16px 10px",
        background: `linear-gradient(135deg, ${BLUE} 0%, ${BLUE_DARK} 100%)`,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <button
            onClick={() => setLocation("/")}
            style={{
              width: 28, height: 28, borderRadius: "50%",
              background: "rgba(255,255,255,0.2)", border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0,
            }}
          >
            <ChevronLeft style={{ width: 16, height: 16, color: "#fff" }} />
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 700, fontSize: 16, color: "#fff", margin: 0, lineHeight: 1.2 }}>
              美股全市场
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", margin: 0, lineHeight: 1.3 }}>
              {stockList ? `${stockList.total.toLocaleString()} 只股票` : "全量行情数据"}
            </p>
          </div>
          <button
            onClick={() => setLocation("/us-stock-tracker/stock-lifecycle")}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 10px", borderRadius: 20,
              background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
              color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer",
            }}
          >
            <BarChart2 style={{ width: 11, height: 11 }} />
            涨跌统计
          </button>
        </div>

        {/* 标普500 */}
        <div style={{
          borderRadius: 10, padding: "6px 12px",
          background: "rgba(255,255,255,0.12)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", lineHeight: 1.3 }}>
              标普500 S&P 500
            </div>
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
          {sp500Up
            ? <TrendingUp style={{ width: 18, height: 18, color: "#FF8A80" }} />
            : <TrendingDown style={{ width: 18, height: 18, color: "#69F0AE" }} />
          }
        </div>
      </div>

      {/* ── 七巨头横向滑动 ── */}
      <div style={{ padding: "10px 12px 0", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginBottom: 6 }}>
          七巨头快捷行情
        </div>
        <div style={{
          display: "flex", gap: 8, overflowX: "auto",
          paddingBottom: 4,
          scrollbarWidth: "none",
        }}>
          {MEGA_SEVEN.map(stock => (
            <MegaSevenCard
              key={stock.code}
              stock={stock}
              priceData={latestPrices?.[stock.code]}
              onClick={() => setLocation(`/ledger/52/be-data?filter=stocks&symbol=${stock.symbol}`)}
            />
          ))}
        </div>
      </div>

      {/* ── 搜索框 ── */}
      <div style={{ padding: "10px 12px 0", flexShrink: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: CARD, borderRadius: 10, border: `1px solid ${BORDER}`,
          padding: "6px 10px", boxShadow: CARD_SHADOW,
        }}>
          <Search style={{ width: 14, height: 14, color: MUTED, flexShrink: 0 }} />
          <input
            type="text"
            value={inputVal}
            onChange={e => handleSearch(e.target.value)}
            placeholder="搜索代码或名称，如 AAPL / Apple"
            style={{
              flex: 1, border: "none", outline: "none",
              fontSize: 13, color: TEXT, background: "transparent",
            }}
          />
          {inputVal && (
            <button
              onClick={() => { setInputVal(""); setKeyword(""); setPage(1); }}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
            >
              <X style={{ width: 14, height: 14, color: MUTED }} />
            </button>
          )}
        </div>
      </div>

      {/* ── 分类Tab ── */}
      <div style={{
        display: "flex", gap: 6, padding: "8px 12px 0",
        overflowX: "auto", scrollbarWidth: "none", flexShrink: 0,
      }}>
        {CLASSIFY_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleClassify(tab.key)}
            style={{
              padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 500,
              border: `1px solid ${classify === tab.key ? BLUE : BORDER}`,
              background: classify === tab.key ? BLUE : CARD,
              color: classify === tab.key ? "#fff" : TEXT,
              cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── 列表区 ── */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 80 }}>
        {/* 列表头 */}
        <div style={{
          display: "flex", alignItems: "center", padding: "6px 12px",
          borderBottom: `1px solid ${BORDER}`,
          background: "#F5F8FF", flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, color: MUTED, width: 24, textAlign: "right", marginRight: 8 }}>
            #
          </span>
          <span style={{ flex: 1, fontSize: 10, color: MUTED }}>代码 / 名称</span>
          <span style={{ fontSize: 10, color: MUTED }}>最新价</span>
        </div>

        {/* 加载中 */}
        {isLoading && (
          <div style={{ padding: "24px 0", textAlign: "center", color: MUTED, fontSize: 13 }}>
            加载中...
          </div>
        )}

        {/* 无数据 */}
        {!isLoading && stockList?.list.length === 0 && (
          <div style={{ padding: "40px 0", textAlign: "center", color: MUTED, fontSize: 13 }}>
            {keyword ? `未找到"${keyword}"相关股票` : "暂无数据"}
          </div>
        )}

        {/* 数据行 */}
        {!isLoading && stockList?.list.map((item, idx) => (
          <StockRow
            key={item.tsCode}
            item={item}
            rank={(page - 1) * PAGE_SIZE + idx + 1}
          />
        ))}

        {/* 分页 */}
        {totalPages > 1 && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 8, padding: "16px 12px",
          }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{
                padding: "5px 14px", borderRadius: 8, fontSize: 12,
                border: `1px solid ${BORDER}`, background: page <= 1 ? "#F5F8FF" : CARD,
                color: page <= 1 ? MUTED2 : TEXT, cursor: page <= 1 ? "default" : "pointer",
              }}
            >
              上一页
            </button>
            <span style={{ fontSize: 12, color: MUTED }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{
                padding: "5px 14px", borderRadius: 8, fontSize: 12,
                border: `1px solid ${BORDER}`, background: page >= totalPages ? "#F5F8FF" : CARD,
                color: page >= totalPages ? MUTED2 : TEXT,
                cursor: page >= totalPages ? "default" : "pointer",
              }}
            >
              下一页
            </button>
          </div>
        )}

        {/* 底部说明 */}
        {stockList && (
          <div style={{ padding: "0 12px 16px", textAlign: "center" }}>
            <span style={{ fontSize: 9, color: MUTED2 }}>
              共 {stockList.total.toLocaleString()} 只 · 数据来源 Tushare · 每日收盘后更新
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
