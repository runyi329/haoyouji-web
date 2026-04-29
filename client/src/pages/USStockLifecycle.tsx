/**
 * USStockLifecycle.tsx
 * 美股个股全生命周期涨跌天数列表
 * 路径: /us-stock-tracker/stock-lifecycle
 * 风格与 StockLifecycle（A股）完全一致，主色改为深蓝 #1565C0
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
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

// ─── 配色（美股主题：深蓝） ────────────────────────────────────────────────
const BLUE = "#1565C0";
const BG = "#EEF2F8";
const CARD = "#FFFFFF";
const BORDER = "#D8E0EC";
const TEXT = "#1A1A1A";
const MUTED = "#555555";
const STOCK_RED = "#D32F2F";
const STOCK_GREEN = "#00B050";

// ─── 分类 Tab 配置 ────────────────────────────────────────────────────────
type Classify = "all" | "stock" | "etf" | "fund";
const CLASSIFY_TABS: { key: Classify; label: string }[] = [
  { key: "all", label: "全市场" },
  { key: "stock", label: "普通股" },
  { key: "etf", label: "ETF" },
  { key: "fund", label: "基金" },
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
  name: string | null;
  enname: string | null;
  classify: string | null;
  listDate: string | null;
  delistDate: string | null;
  upDays: number;
  downDays: number;
  flatDays: number;
  totalDays: number;
  upRate: number;
};

export default function USStockLifecycle() {
  const [, setLocation] = useLocation();
  const [classify, setClassify] = useState<Classify>("all");
  const [keyword, setKeyword] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("upRate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [minTotalDays, setMinTotalDays] = useState(0);
  const [showDaysFilter, setShowDaysFilter] = useState(false);

  // 累积列表：key 变化时清空
  const listKey = `${classify}|${keyword}|${sortBy}|${sortDir}|${minTotalDays}`;
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

  const { data, isFetching } = trpc.usStockLifecycle.useQuery(
    {
      page,
      pageSize: PAGE_SIZE,
      sortBy,
      sortDir,
      keyword: keyword || undefined,
      minTotalDays,
      classify: classify === "all" ? undefined : classify,
    },
    { placeholderData: keepPreviousData }
  );

  // 追加数据到列表
  const appendedPageRef = useRef(0);
  useEffect(() => {
    if (!data) return;
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

  // 数据未就绪提示
  const dataNotReady = data && (data as any).dataReady === false;

  return (
    <div className="h-screen flex flex-col" style={{ background: BG }}>
      {/* 顶部导航 */}
      <div className="px-4 py-3 flex items-center gap-3 flex-shrink-0" style={{ background: BLUE, color: "#fff" }}>
        <button
          onClick={() => setLocation('/us-stock-tracker')}
          className="w-7 h-7 flex items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1">
          <p className="font-bold text-lg">美股涨跌天数</p>
          {total > 0 && (
            <p className="text-xs opacity-80">共 {total.toLocaleString()} 只</p>
          )}
        </div>
      </div>

      {/* 搜索框 */}
      <div className="px-4 py-2 flex-shrink-0" style={{ background: BLUE }}>
        <div className="flex items-center gap-2 px-3 h-8 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }}>
          <Search className="w-3.5 h-3.5 text-white opacity-80 flex-shrink-0" />
          <input
            className="flex-1 bg-transparent text-white placeholder-white/60 text-sm outline-none"
            placeholder="搜索股票名称或代码（如 AAPL、苹果）"
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

      {/* 分类 Tab */}
      <div className="flex-shrink-0 overflow-x-auto" style={{ background: CARD, borderBottom: `1px solid ${BORDER}` }}>
        <div className="flex" style={{ minWidth: "max-content" }}>
          {CLASSIFY_TABS.map((tab) => {
            const active = classify === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setClassify(tab.key)}
                className="relative flex-shrink-0 text-xs font-medium py-2.5 px-4 transition-colors"
                style={{
                  color: active ? BLUE : MUTED,
                  fontWeight: active ? 700 : 400,
                }}
              >
                {tab.label}
                {active && (
                  <span
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
                    style={{ width: 20, height: 2, background: BLUE }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 列头 */}
      <div
        className="flex items-center px-3 flex-shrink-0"
        style={{ background: "#F0F4FA", borderBottom: `1px solid ${BORDER}`, height: 32 }}
      >
        <div className="flex-1 text-xs font-medium" style={{ color: MUTED }}>股票</div>
        {SORT_COLS.map(col => (
          <button
            key={col.key}
            onClick={() => col.key === "total" ? undefined : handleSort(col.key)}
            className="flex-shrink-0 flex items-center justify-center gap-0.5 text-xs"
            style={{
              width: col.key === "total" ? 52 : col.width,
              color: sortBy === col.key ? BLUE : MUTED,
              fontWeight: sortBy === col.key ? 700 : 400,
            }}
          >
            {col.label}
            {col.key === "total" ? (
              <button
                onClick={() => setShowDaysFilter(v => !v)}
                className="ml-0.5"
                style={{ color: minTotalDays > 0 ? BLUE : MUTED }}
              >
                <SlidersHorizontal className="w-3 h-3 inline" />
              </button>
            ) : (
              <SortIcon col={col.key} />
            )}
          </button>
        ))}
        {/* AI 列占位 */}
        <div style={{ width: 33 }} />
      </div>

      {/* 总天数筛选下拉 */}
      {showDaysFilter && (
        <div
          className="absolute z-50 right-4 rounded-lg shadow-lg py-1"
          style={{ top: 160, background: CARD, border: `1px solid ${BORDER}`, minWidth: 110, marginTop: 2 }}
        >
          {MIN_DAYS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setMinTotalDays(opt.value); setShowDaysFilter(false); setPage(1); }}
              className="w-full text-left px-4 py-2 text-xs"
              style={{
                color: minTotalDays === opt.value ? BLUE : TEXT,
                fontWeight: minTotalDays === opt.value ? 700 : 400,
                background: minTotalDays === opt.value ? "#EEF2F8" : "transparent",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* 列表 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
      >
        {/* 数据未就绪提示 */}
        {dataNotReady && (
          <div className="flex flex-col items-center justify-center h-48 gap-3 px-8 text-center">
            <div className="text-3xl">⏳</div>
            <div className="text-sm font-medium" style={{ color: TEXT }}>数据回填中</div>
            <div className="text-xs leading-relaxed" style={{ color: MUTED }}>
              美股历史数据正在后台回填（约需 8-12 小时），完成后将显示全部数据。
            </div>
          </div>
        )}
        {/* 初始加载中 */}
        {!dataNotReady && allItems.length === 0 && isFetching && (
          <div className="flex items-center justify-center h-32 text-sm" style={{ color: MUTED }}>
            加载中...
          </div>
        )}
        {/* 无数据 */}
        {!dataNotReady && allItems.length === 0 && !isFetching && (
          <div className="flex items-center justify-center h-32 text-sm" style={{ color: MUTED }}>
            暂无数据
          </div>
        )}
        {allItems.map((stock, idx) => (
          <StockRow
            key={stock.tsCode}
            stock={stock}
            idx={idx}
            sortBy={sortBy}
            onDetail={(tsCode) => setLocation(`/us-stock/${encodeURIComponent(tsCode)}`)}
          />
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
function StockRow({
  stock,
  idx,
  sortBy,
  onDetail,
}: {
  stock: StockItem;
  idx: number;
  sortBy: SortBy;
  onDetail: (tsCode: string) => void;
}) {
  const isDelisted = !!stock.delistDate;
  const upRateColor = stock.upRate >= 50 ? STOCK_RED : STOCK_GREEN;
  // 显示名称：优先中文名，其次英文名，最后代码
  const displayName = stock.name || stock.enname || stock.tsCode;

  return (
    <div
      className="flex items-center px-3 py-2"
      style={{
        background: idx % 2 === 0 ? CARD : "#F4F7FC",
        borderBottom: `1px solid ${BORDER}`,
        minHeight: 44,
      }}
    >
      {/* 股票名称 + 代码 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate" style={{ color: TEXT }}>
            {displayName}
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
        style={{ width: 44, color: sortBy === "up" ? STOCK_RED : TEXT, fontWeight: sortBy === "up" ? 700 : 400 }}
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
      {/* 详情按钮 */}
      <button
        onClick={() => onDetail(stock.tsCode)}
        className="flex-shrink-0 ml-1 flex items-center justify-center rounded-full text-xs font-bold"
        style={{
          width: 32,
          height: 22,
          background: "linear-gradient(135deg, #1976D2 0%, #0D47A1 100%)",
          color: "#fff",
          boxShadow: "0 1px 4px rgba(21,101,192,0.35)",
          letterSpacing: "0.02em",
        }}
      >
        AI
      </button>
    </div>
  );
}
