import { useState, useRef, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";

const SYMBOLS = [
  { key: "BTCUSDT", label: "比特币" },
  { key: "ETHUSDT", label: "以太坊" },
];

const PAGE_SIZE = 60;

function formatPrice(val: number, symbol: string): string {
  if (symbol === "BTCUSDT") {
    // BTC 价格较大，保留整数
    return val >= 1000
      ? val.toLocaleString("en-US", { maximumFractionDigits: 0 })
      : val.toFixed(2);
  }
  // ETH
  return val >= 100
    ? val.toLocaleString("en-US", { maximumFractionDigits: 1 })
    : val.toFixed(2);
}

function formatPct(val: number | null): string {
  if (val == null) return "-";
  return (val >= 0 ? "+" : "") + val.toFixed(2) + "%";
}

export default function BeDataPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 52;

  const [activeSymbol, setActiveSymbol] = useState(SYMBOLS[0].key);
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = trpc.cryptoData.getKlines.useQuery(
    { symbol: activeSymbol, page, pageSize: PAGE_SIZE },
    { keepPreviousData: true }
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleSymbolChange = (sym: string) => {
    setActiveSymbol(sym);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center h-12 px-3">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/settings`)}
            className="flex items-center text-gray-600 mr-2"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-gray-800 text-base">BE数据</span>
        </div>

        {/* Tab 切换 */}
        <div className="flex border-b border-gray-100">
          {SYMBOLS.map((s) => (
            <button
              key={s.key}
              onClick={() => handleSymbolChange(s.key)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeSymbol === s.key
                  ? "text-[#D32F2F] border-b-2 border-[#D32F2F]"
                  : "text-gray-500"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 数据表格 */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
            加载中...
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-sm gap-2">
            <span>暂无数据</span>
            <span className="text-xs text-gray-300">数据导入后即可查看</span>
          </div>
        ) : (
          <>
            {/* 表头 */}
            <div
              className="grid text-xs text-gray-400 font-medium bg-gray-50 border-b border-gray-100 sticky top-0"
              style={{ gridTemplateColumns: "72px 1fr 1fr 1fr 1fr 60px 60px" }}
            >
              <div className="px-2 py-2">日期</div>
              <div className="px-1 py-2 text-right">开盘</div>
              <div className="px-1 py-2 text-right">收盘</div>
              <div className="px-1 py-2 text-right">最高</div>
              <div className="px-1 py-2 text-right">最低</div>
              <div className="px-1 py-2 text-right">涨跌</div>
              <div className="px-1 py-2 text-right">振幅</div>
            </div>

            {/* 数据行 */}
            {rows.map((row, idx) => {
              const isUp = row.changePct != null && row.changePct > 0;
              const isDown = row.changePct != null && row.changePct < 0;
              const pctColor = isUp
                ? "text-red-500"
                : isDown
                ? "text-green-600"
                : "text-gray-400";

              return (
                <div
                  key={row.date}
                  className={`grid text-xs border-b border-gray-50 ${
                    idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                  }`}
                  style={{ gridTemplateColumns: "72px 1fr 1fr 1fr 1fr 60px 60px" }}
                >
                  <div className="px-2 py-2.5 text-gray-500 font-mono">{row.date}</div>
                  <div className="px-1 py-2.5 text-right text-gray-700 font-mono">
                    {formatPrice(row.open, activeSymbol)}
                  </div>
                  <div className={`px-1 py-2.5 text-right font-mono font-medium ${pctColor}`}>
                    {formatPrice(row.close, activeSymbol)}
                  </div>
                  <div className="px-1 py-2.5 text-right text-gray-600 font-mono">
                    {formatPrice(row.high, activeSymbol)}
                  </div>
                  <div className="px-1 py-2.5 text-right text-gray-600 font-mono">
                    {formatPrice(row.low, activeSymbol)}
                  </div>
                  <div className={`px-1 py-2.5 text-right font-mono ${pctColor}`}>
                    {formatPct(row.changePct)}
                  </div>
                  <div className="px-1 py-2.5 text-right text-gray-500 font-mono">
                    {row.amplitudePct != null ? row.amplitudePct.toFixed(2) + "%" : "-"}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* 分页控制 */}
      {totalPages > 1 && (
        <div className="bg-white border-t border-gray-100 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isFetching}
            className="px-4 py-1.5 text-sm rounded border border-gray-200 text-gray-600 disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-xs text-gray-400">
            第 {page} / {totalPages} 页（共 {total} 条）
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isFetching}
            className="px-4 py-1.5 text-sm rounded border border-gray-200 text-gray-600 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
