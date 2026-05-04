/**
 * StockLifecycle.tsx
 * 个股全生命周期涨跌天数列表
 * 路径: /ledger/:id/stock-lifecycle
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ChevronLeft, Search, X, ChevronUp, ChevronDown, SlidersHorizontal } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { keepPreviousData } from "@tanstack/react-query";

// ─── 总天数筛选选项 ────────────────────────────────────────────────────────
const MIN_DAYS_OPTIONS: { label: string; value: number }[] = [
  { label: "不限", value: 0 },
  { label: "≥100天", value: 100 },
  { label: "≥200天", value: 200 },
  { label: "≥500天", value: 500 },
  { label: "≥1000天", value: 1000 },
  { label: "≥2000天", value: 2000 },
  { label: "≥3000天", value: 3000 },
];

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

type StockItem = {
  tsCode: string;
  name: string;
  listStatus: string;
  upDays: number;
  downDays: number;
  flatDays: number;
  totalDays: number;
  upRate: number;
};

export default function StockLifecycle({ homeMode = false }: { homeMode?: boolean }) {
  const { id: ledgerId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  const [market, setMarket] = useState<Market>("all");
  const [keyword, setKeyword] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("upRate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [minTotalDays, setMinTotalDays] = useState(0);
  const [showDaysFilter, setShowDaysFilter] = useState(false);

  // 累积列表：key 为 market+keyword+sortBy+sortDir+minTotalDays，变化时清空
  const listKey = `${market}|${keyword}|${sortBy}|${sortDir}|${minTotalDays}`;
  const listKeyRef = useRef(listKey);
  const [allItems, setAllItems] = useState<StockItem[]>([]);
  const [total, setTotal] = useState(0);

  // 当筛选条件变化时重置
  useEffect(() => {
    if (listKeyRef.current !== listKey) {
      listKeyRef.current = listKey;
      setAllItems([]);
      setTotal(0);
      setPage(1);
    }
  }, [listKey]);

  const { data, isFetching } = trpc.aiStockLifecycle.useQuery(
    { page, pageSize: PAGE_SIZE, market, keyword: keyword || undefined, sortBy, sortDir, minTotalDays },
    { placeholderData: keepPreviousData }
  );

  // 追加数据到列表
  const appendedPageRef = useRef(0);
  useEffect(() => {
    if (!data) return;
    // 防止同一页重复追加
    if (appendedPageRef.current === data.page && data.page !== 1) return;
    appendedPageRef.current = data.page;

    setTotal(data.total);
    if (data.page === 1) {
      setAllItems(data.list);
    } else {
      setAllItems(prev => {
        const existingCodes = new Set(prev.map(s => s.tsCode));
        const newItems = data.list.filter(s => !existingCodes.has(s.tsCode));
        return [...prev, ...newItems];
      });
    }
  }, [data]);

  // 重置 appendedPageRef 当 listKey 变化
  useEffect(() => {
    appendedPageRef.current = 0;
  }, [listKey]);

  const hasMore = allItems.length < total;

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
    if (col === "total") {
      // 总天列：点击排序图标排序，点击漏斗图标弹出筛选
      if (sortBy === col) {
        setSortDir(d => (d === "desc" ? "asc" : "desc"));
      } else {
        setSortBy(col);
        setSortDir("desc");
      }
    } else {
      if (sortBy === col) {
        setSortDir(d => (d === "desc" ? "asc" : "desc"));
      } else {
        setSortBy(col);
        setSortDir("desc");
      }
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
          onClick={() => homeMode ? setLocation('/stock-tracker') : setLocation(`/ledger/${ledgerId}/ai-database`)}
          className="w-7 h-7 flex items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1">
          <p className="font-bold text-lg">个股涨跌天数</p>
          {total > 0 && (
            <p className="text-xs opacity-80">共 {total.toLocaleString()} 只</p>
          )}
        </div>
        <button
          onClick={() => window.location.reload()}
          className="text-xs font-medium px-2.5 py-1 rounded-full"
          style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}
        >
          刷新
        </button>
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
        className="flex items-center px-3 py-1.5 flex-shrink-0 text-xs font-medium relative"
        style={{ background: "#F8F4F0", borderBottom: `1px solid ${BORDER}`, color: MUTED }}
      >
        <div className="flex-1 min-w-0">股票</div>
        {SORT_COLS.map(col => (
          col.key === "total" ? (
            // 总天列：排序按钮 + 漏斗筛选图标
            <div key={col.key} className="flex items-center justify-center flex-shrink-0" style={{ width: col.width + 20 }}>
              <button
                onClick={() => handleSort(col.key)}
                className="flex items-center gap-0.5"
                style={{ color: sortBy === col.key ? RED : MUTED, fontWeight: sortBy === col.key ? 700 : 500 }}
              >
                {col.label}<SortIcon col={col.key} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowDaysFilter(v => !v); }}
                className="ml-1 flex items-center justify-center"
                style={{ color: minTotalDays > 0 ? RED : MUTED }}
              >
                <SlidersHorizontal className="w-3 h-3" />
              </button>
            </div>
          ) : (
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
          )
        ))}
        {/* AI按钮占位 */}
        <div style={{ width: 36, flexShrink: 0 }} />

        {/* 总天数筛选弹出层 */}
        {showDaysFilter && (
          <div
            className="absolute right-2 top-full z-50 rounded-xl shadow-lg py-1"
            style={{ background: CARD, border: `1px solid ${BORDER}`, minWidth: 110, marginTop: 2 }}
          >
            {MIN_DAYS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { setMinTotalDays(opt.value); setShowDaysFilter(false); setPage(1); }}
                className="w-full text-left px-4 py-2 text-xs"
                style={{
                  color: minTotalDays === opt.value ? RED : TEXT,
                  fontWeight: minTotalDays === opt.value ? 700 : 400,
                  background: minTotalDays === opt.value ? "#FFF0F0" : "transparent",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 列表 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {/* 初始加载中 */}
        {allItems.length === 0 && isFetching && (
          <div className="flex items-center justify-center h-32 text-sm" style={{ color: MUTED }}>
            加载中...
          </div>
        )}
        {/* 无数据 */}
        {allItems.length === 0 && !isFetching && (
          <div className="flex items-center justify-center h-32 text-sm" style={{ color: MUTED }}>
            暂无数据
          </div>
        )}
        {allItems.map((stock, idx) => (
          <StockRow key={stock.tsCode} stock={stock} idx={idx} sortBy={sortBy} onAI={(tsCode) => setLocation(`/stock/${tsCode.replace(/\./g, '-')}`)} />
        ))}
        {/* 加载更多 */}
        {isFetching && allItems.length > 0 && (
          <div className="flex items-center justify-center py-4 text-xs" style={{ color: MUTED }}>
            加载中...
          </div>
        )}
        {/* 全部加载完 */}
        {!hasMore && allItems.length > 0 && (
          <div className="flex items-center justify-center py-4 text-xs" style={{ color: MUTED }}>
            已加载全部 {allItems.length.toLocaleString()} 只
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 单行股票组件 ─────────────────────────────────────────────────────────
function StockRow({ stock, idx, sortBy, onAI }: { stock: StockItem; idx: number; sortBy: SortBy; onAI: (tsCode: string) => void }) {
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

      {/* AI 按钮 */}
      <button
        onClick={() => onAI(stock.tsCode)}
        className="flex-shrink-0 ml-1 flex items-center justify-center rounded-full text-xs font-bold"
        style={{
          width: 32,
          height: 22,
          background: "linear-gradient(135deg, #E53935 0%, #B71C1C 100%)",
          color: "#fff",
          boxShadow: "0 1px 4px rgba(211,47,47,0.35)",
          letterSpacing: "0.02em",
        }}
      >
        AI
      </button>
    </div>
  );
}

// 首页模式：返回/stock-tracker，无账本上下文
export function StockTrackerLifecycle() {
  return <StockLifecycle homeMode={true} />;
}
