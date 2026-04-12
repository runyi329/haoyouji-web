/**
 * StockLifecycle.tsx
 * 个股全生命周期涨跌天数列表
 * 路径: /ledger/:id/stock-lifecycle
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { trpc } from "@/lib/trpc";

// ─── 配色（与 LedgerAIDatabase 一致） ────────────────────────────────────
const RED = "#D32F2F";
const BG = "#F2EAE0";
const CARD = "#FFFFFF";
const BORDER = "#E8E0D8";
const TEXT = "#1A1A1A";
const MUTED = "#555555";
const STOCK_GREEN = "#00B050";

// ─── 板块 Tab 配置 ────────────────────────────────────────────────────────
type Market = "all" | "SH" | "SZ" | "GEM" | "STAR" | "DELISTED";
const MARKET_TABS: { key: Market; label: string }[] = [
  { key: "all", label: "全市场" },
  { key: "SH", label: "沪市" },
  { key: "SZ", label: "深市" },
  { key: "GEM", label: "创业板" },
  { key: "STAR", label: "科创板" },
  { key: "DELISTED", label: "退市" },
];

// ─── 排序列配置 ────────────────────────────────────────────────────────────
type SortBy = "up" | "down" | "flat" | "total" | "upRate";
const SORT_COLS: { key: SortBy; label: string; width: number }[] = [
  { key: "upRate", label: "涨%", width: 44 },
  { key: "up", label: "涨天", width: 44 },
  { key: "down", label: "跌天", width: 44 },
  { key: "flat", label: "平天", width: 44 },
  { key: "total", label: "总天", width: 44 },
];

const PAGE_SIZE = 50;

export default function StockLifecycle() {
  const { id: ledgerId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const [market, setMarket] = useState<Market>("all");
  const [keyword, setKeyword] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("upRate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [hasMore, setHasMore] = useState(true);

  // 切换市场/关键词/排序时重置列表
  const resetList = useCallback(() => {
    setAllItems([]);
    setPage(1);
    setHasMore(true);
  }, []);

  const prevMarket = useRef(market);
  const prevKeyword = useRef(keyword);
  const prevSortBy = useRef(sortBy);
  const prevSortDir = useRef(sortDir);

  useEffect(() => {
    if (
      prevMarket.current !== market ||
      prevKeyword.current !== keyword ||
      prevSortBy.current !== sortBy ||
      prevSortDir.current !== sortDir
    ) {
      prevMarket.current = market;
      prevKeyword.current = keyword;
      prevSortBy.current = sortBy;
      prevSortDir.current = sortDir;
      resetList();
    }
  }, [market, keyword, sortBy, sortDir, resetList]);

  const { data, isFetching } = trpc.aiStockLifecycle.useQuery(
    { page, pageSize: PAGE_SIZE, market, keyword: keyword || undefined, sortBy, sortDir },
    { keepPreviousData: true }
  );

  useEffect(() => {
    if (!data) return;
    if (page === 1) {
      setAllItems(data.list);
    } else {
      setAllItems(prev => {
        const existingCodes = new Set(prev.map((s: any) => s.tsCode));
        const newItems = data.list.filter((s: any) => !existingCodes.has(s.tsCode));
        return [...prev, ...newItems];
      });
    }
    setHasMore(data.list.length === PAGE_SIZE && allItems.length + data.list.length < data.total);
  }, [data]);

  // 无限滚动
  const scrollRef = useRef<HTMLDivElement>(null);
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || isFetching || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
      setPage(p => p + 1);
    }
  }, [isFetching, hasMore]);

  // 搜索防抖
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleInputChange = (v: string) => {
    setInputVal(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setKeyword(v.trim()), 400);
  };

  // 排序列点击
  const handleSort = (col: SortBy) => {
    if (sortBy === col) {
      setSortDir(d => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ col }: { col: SortBy }) => {
    if (sortBy !== col) return <span style={{ opacity: 0.3, fontSize: 9 }}>↕</span>;
    return sortDir === "desc"
      ? <ChevronDown className="w-3 h-3 inline" />
      : <ChevronUp className="w-3 h-3 inline" />;
  };

  return (
    <div className="h-screen flex flex-col" style={{ background: BG }}>
      {/* 顶部导航 */}
      <div className="px-4 py-3 flex items-center gap-3 flex-shrink-0" style={{ background: RED, color: "#fff" }}>
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/ai-database`)}
          className="w-7 h-7 flex items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1">
          <p className="font-bold text-lg">个股涨跌天数</p>
          {data && (
            <p className="text-xs opacity-80">共 {data.total.toLocaleString()} 只</p>
          )}
        </div>
      </div>

      {/* 搜索框 */}
      <div className="px-4 py-2 flex-shrink-0" style={{ background: RED }}>
        <div className="flex items-center gap-2 px-3 h-8 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }}>
          <Search className="w-3.5 h-3.5 text-white opacity-80 flex-shrink-0" />
          <input
            className="flex-1 bg-transparent text-white placeholder-white/60 text-sm outline-none"
            placeholder="搜索股票名称或代码"
            value={inputVal}
            onChange={e => handleInputChange(e.target.value)}
          />
          {inputVal && (
            <button onClick={() => { setInputVal(""); setKeyword(""); }}>
              <X className="w-3.5 h-3.5 text-white opacity-80" />
            </button>
          )}
        </div>
      </div>

      {/* 板块 Tab */}
      <div className="flex-shrink-0 overflow-x-auto" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex" style={{ minWidth: "max-content" }}>
          {MARKET_TABS.map((tab, i) => {
            const active = market === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setMarket(tab.key)}
                className="relative flex-shrink-0 text-xs font-medium py-2.5 px-4 transition-colors"
                style={{
                  color: active ? RED : MUTED,
                  background: active ? "#F5EDED" : "transparent",
                  borderRight: i < MARKET_TABS.length - 1 ? `1px solid ${BORDER}` : "none",
                }}
              >
                {tab.label}
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: RED }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 表头 */}
      <div
        className="flex items-center px-3 py-1.5 flex-shrink-0 text-xs font-medium"
        style={{ background: "#F8F4F0", borderBottom: `1px solid ${BORDER}`, color: MUTED }}
      >
        <div className="flex-1 min-w-0">股票</div>
        {SORT_COLS.map(col => (
          <button
            key={col.key}
            onClick={() => handleSort(col.key)}
            className="flex items-center justify-center gap-0.5 flex-shrink-0"
            style={{
              width: col.width,
              color: sortBy === col.key ? RED : MUTED,
              fontWeight: sortBy === col.key ? 700 : 500,
            }}
          >
            {col.label}<SortIcon col={col.key} />
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {allItems.length === 0 && !isFetching && (
          <div className="flex items-center justify-center h-32 text-sm" style={{ color: MUTED }}>
            暂无数据
          </div>
        )}
        {allItems.map((stock, idx) => (
          <StockRow key={stock.tsCode} stock={stock} idx={idx} sortBy={sortBy} />
        ))}
        {isFetching && (
          <div className="flex items-center justify-center py-4 text-xs" style={{ color: MUTED }}>
            加载中...
          </div>
        )}
        {!hasMore && allItems.length > 0 && (
          <div className="flex items-center justify-center py-4 text-xs" style={{ color: MUTED }}>
            已加载全部 {allItems.length} 只
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 单行股票组件 ─────────────────────────────────────────────────────────
function StockRow({ stock, idx, sortBy }: { stock: any; idx: number; sortBy: SortBy }) {
  const isDelisted = stock.listStatus === "D";
  const upRateColor = stock.upRate >= 50 ? RED : STOCK_GREEN;

  return (
    <div
      className="flex items-center px-3 py-2"
      style={{
        background: idx % 2 === 0 ? CARD : "#FAF6F2",
        borderBottom: `1px solid ${BORDER}`,
        minHeight: 44,
      }}
    >
      {/* 股票名称 + 代码 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate" style={{ color: TEXT }}>
            {stock.name}
          </span>
          {isDelisted && (
            <span className="text-xs px-1 rounded" style={{ background: "#F5F5F5", color: "#999", fontSize: 9 }}>
              退
            </span>
          )}
        </div>
        <div className="text-xs mt-0.5" style={{ color: MUTED }}>{stock.tsCode}</div>
      </div>

      {/* 涨% */}
      <div
        className="flex-shrink-0 text-center"
        style={{ width: 44, color: upRateColor, fontWeight: sortBy === "upRate" ? 700 : 500, fontSize: 12 }}
      >
        {stock.upRate.toFixed(1)}%
      </div>

      {/* 涨天 */}
      <div
        className="flex-shrink-0 text-center text-xs"
        style={{ width: 44, color: sortBy === "up" ? RED : TEXT, fontWeight: sortBy === "up" ? 700 : 400 }}
      >
        {stock.upDays.toLocaleString()}
      </div>

      {/* 跌天 */}
      <div
        className="flex-shrink-0 text-center text-xs"
        style={{ width: 44, color: sortBy === "down" ? STOCK_GREEN : TEXT, fontWeight: sortBy === "down" ? 700 : 400 }}
      >
        {stock.downDays.toLocaleString()}
      </div>

      {/* 平天 */}
      <div
        className="flex-shrink-0 text-center text-xs"
        style={{ width: 44, color: sortBy === "flat" ? "#888" : TEXT, fontWeight: sortBy === "flat" ? 700 : 400 }}
      >
        {stock.flatDays.toLocaleString()}
      </div>

      {/* 总天 */}
      <div
        className="flex-shrink-0 text-center text-xs"
        style={{ width: 44, color: sortBy === "total" ? "#555" : MUTED, fontWeight: sortBy === "total" ? 700 : 400 }}
      >
        {stock.totalDays.toLocaleString()}
      </div>
    </div>
  );
}
