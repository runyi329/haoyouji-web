import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";

const SYMBOLS = [
  { key: "BTCUSDT", label: "比特币 BTC" },
  { key: "ETHUSDT", label: "以太坊 ETH" },
];

const PAGE_SIZE = 60;

function formatPrice(val: number, symbol: string): string {
  if (symbol === "BTCUSDT") {
    return val >= 1000
      ? val.toLocaleString("en-US", { maximumFractionDigits: 0 })
      : val.toFixed(2);
  }
  return val >= 100
    ? val.toLocaleString("en-US", { maximumFractionDigits: 1 })
    : val.toFixed(2);
}

function formatPct(val: number | null): string {
  if (val == null) return "-";
  return (val >= 0 ? "+" : "") + val.toFixed(2) + "%";
}

// 将 YYYY-MM-DD 转换为 YY/MM/DD
function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[0].slice(2)}/${parts[1]}/${parts[2]}`;
  }
  return dateStr;
}

export default function BeDataPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const ledgerId = params?.id ? parseInt(params.id) : 52;

  const [activeSymbol, setActiveSymbol] = useState(SYMBOLS[0].key);
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = trpc.cryptoData.getKlines.useQuery(
    { symbol: activeSymbol, page, pageSize: PAGE_SIZE },
    { keepPreviousData: true } as any
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // 统计信息：最新一条（第1页第1行）和最早一条（最后一页最后一行）
  // 第1页数据是最新的，所以 rows[0] 是最新日期
  const latestRow = page === 1 ? rows[0] : null;
  const oldestDate = total > 0 ? "17/08/17" : "-"; // BTC/ETH 数据从 2017-08-17 开始
  const latestDate = latestRow ? formatDate(latestRow.date) : "-";

  // 最新收盘价和涨跌幅（第1页第1行）
  const latestClose = latestRow ? latestRow.close : null;
  const latestChangePct = latestRow ? latestRow.changePct : null;
  const isUp = latestChangePct != null && latestChangePct > 0;
  const isDown = latestChangePct != null && latestChangePct < 0;
  const pctColor = isUp ? "text-red-500" : isDown ? "text-green-600" : "text-gray-500";

  const handleSymbolChange = (sym: string) => {
    setActiveSymbol(sym);
    setPage(1);
  };

  const symbolLabel = SYMBOLS.find((s) => s.key === activeSymbol)?.label ?? "";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
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
        <div className="flex border-b border-gray-200">
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

      {/* 统计栏 */}
      {!isLoading && total > 0 && (
        <div className="bg-white border-b border-gray-200 px-3 py-3">
          <div className="grid grid-cols-2 gap-2">
            {/* 左上：数据范围 */}
            <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
              <div className="text-xs text-gray-400 mb-0.5">数据范围</div>
              <div className="text-sm font-medium text-gray-700 font-mono">
                {oldestDate} ~ {latestDate}
              </div>
            </div>
            {/* 右上：数据条数 */}
            <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
              <div className="text-xs text-gray-400 mb-0.5">历史数据</div>
              <div className="text-sm font-medium text-gray-700">
                共 <span className="text-[#D32F2F] font-bold">{total}</span> 条日线
              </div>
            </div>
            {/* 左下：最新收盘价 */}
            <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
              <div className="text-xs text-gray-400 mb-0.5">最新收盘</div>
              <div className={`text-sm font-bold font-mono ${pctColor}`}>
                {latestClose != null ? formatPrice(latestClose, activeSymbol) : "-"} USDT
              </div>
            </div>
            {/* 右下：最新涨跌幅 */}
            <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
              <div className="text-xs text-gray-400 mb-0.5">当日涨跌</div>
              <div className={`text-sm font-bold font-mono ${pctColor}`}>
                {formatPct(latestChangePct)}
              </div>
            </div>
          </div>
        </div>
      )}

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
          <table className="w-full border-collapse text-xs">
            {/* 表头 */}
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-1.5 py-2 text-left text-gray-500 font-medium w-[68px]">日期</th>
                <th className="border border-gray-300 px-1 py-2 text-right text-gray-500 font-medium">开盘</th>
                <th className="border border-gray-300 px-1 py-2 text-right text-gray-500 font-medium">收盘</th>
                <th className="border border-gray-300 px-1 py-2 text-right text-gray-500 font-medium">最高</th>
                <th className="border border-gray-300 px-1 py-2 text-right text-gray-500 font-medium">最低</th>
                <th className="border border-gray-300 px-1 py-2 text-right text-gray-500 font-medium w-[58px]">涨跌</th>
                <th className="border border-gray-300 px-1 py-2 text-right text-gray-500 font-medium w-[52px]">振幅</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const up = row.changePct != null && row.changePct > 0;
                const down = row.changePct != null && row.changePct < 0;
                const color = up ? "text-red-500" : down ? "text-green-600" : "text-gray-400";
                const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";

                return (
                  <tr key={row.date} className={rowBg}>
                    <td className="border border-gray-200 px-1.5 py-2 text-gray-500 font-mono">
                      {formatDate(row.date)}
                    </td>
                    <td className="border border-gray-200 px-1 py-2 text-right text-gray-700 font-mono">
                      {formatPrice(row.open, activeSymbol)}
                    </td>
                    <td className={`border border-gray-200 px-1 py-2 text-right font-mono font-medium ${color}`}>
                      {formatPrice(row.close, activeSymbol)}
                    </td>
                    <td className="border border-gray-200 px-1 py-2 text-right text-gray-600 font-mono">
                      {formatPrice(row.high, activeSymbol)}
                    </td>
                    <td className="border border-gray-200 px-1 py-2 text-right text-gray-600 font-mono">
                      {formatPrice(row.low, activeSymbol)}
                    </td>
                    <td className={`border border-gray-200 px-1 py-2 text-right font-mono ${color}`}>
                      {formatPct(row.changePct)}
                    </td>
                    <td className="border border-gray-200 px-1 py-2 text-right text-gray-500 font-mono">
                      {row.amplitudePct != null ? row.amplitudePct.toFixed(2) + "%" : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 分页控制 */}
      {totalPages > 1 && (
        <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isFetching}
            className="px-4 py-1.5 text-sm rounded border border-gray-200 text-gray-600 disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-xs text-gray-400">
            第 {page} / {totalPages} 页 · 共 {total} 条
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
