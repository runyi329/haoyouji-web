import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList
} from "recharts";

const SYMBOLS = [
  { key: "BTCUSDT", label: "比特币 BTC" },
  { key: "ETHUSDT", label: "以太坊 ETH" },
];

const PAGE_SIZE = 60;
const TABS = [
  { key: "data", label: "日线数据" },
  { key: "analysis", label: "数据分析" },
];

function formatPrice(val: number): string {
  return val.toFixed(2);
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
  const [activeTab, setActiveTab] = useState("data");
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching } = trpc.cryptoData.getKlines.useQuery(
    { symbol: activeSymbol, page, pageSize: PAGE_SIZE },
    { keepPreviousData: true } as any
  );

  const { data: stats, isLoading: statsLoading } = trpc.cryptoData.getStats.useQuery(
    { symbol: activeSymbol },
    { enabled: activeTab === "analysis" }
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const latestRow = page === 1 ? rows[0] : null;
  const oldestDate = total > 0 ? "17/08/17" : "-";
  const latestDate = latestRow ? latestRow.date : "-";
  const latestClose = latestRow ? latestRow.close : null;
  const latestChangePct = latestRow ? latestRow.changePct : null;
  const isUp = latestChangePct != null && latestChangePct > 0;
  const isDown = latestChangePct != null && latestChangePct < 0;
  const pctColor = isUp ? "text-red-500" : isDown ? "text-green-600" : "text-gray-500";

  const handleSymbolChange = (sym: string) => {
    setActiveSymbol(sym);
    setPage(1);
  };

  // 构建连涨/连跌图表数据（最多显示到10天）
  const MAX_CONSEC = 10;
  const buildConsecData = (map: Record<number, number>, maxKey: number) => {
    const result = [];
    for (let i = 1; i <= Math.min(maxKey, MAX_CONSEC); i++) {
      result.push({ days: `${i}天`, count: map[i] ?? 0, key: i });
    }
    if (maxKey > MAX_CONSEC) {
      const rest = Object.entries(map)
        .filter(([k]) => parseInt(k) > MAX_CONSEC)
        .reduce((s, [, v]) => s + v, 0);
      if (rest > 0) result.push({ days: `>${MAX_CONSEC}天`, count: rest, key: MAX_CONSEC + 1 });
    }
    return result;
  };

  const upData = stats ? buildConsecData(stats.consecutiveUp, stats.maxConsecUp) : [];
  const downData = stats ? buildConsecData(stats.consecutiveDown, stats.maxConsecDown) : [];

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
          <span className="font-semibold text-gray-800 text-base flex-1">BE数据</span>
          <button
            onClick={() => window.location.reload()}
            className="text-xs font-medium text-white bg-[#D32F2F] rounded-full px-3 py-1 active:opacity-70"
          >
            更新
          </button>
        </div>

        {/* 币种 Tab */}
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
        <div className="bg-white border-b border-gray-200 px-3 py-2.5">
          <div className="flex flex-col gap-1.5">
            <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400 shrink-0">数据范围</span>
              <span className="text-xs font-medium text-gray-700 font-mono ml-2">
                {oldestDate} ~ {latestDate}
              </span>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400 shrink-0">历史数据</span>
              <span className="text-xs font-medium text-gray-700 ml-2">
                <span className="text-[#D32F2F] font-bold">{total}</span> 天 &nbsp;
                <span className="text-[#D32F2F] font-bold">{total}</span> 条日线
              </span>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400 shrink-0">最新收盘</span>
              <span className="text-xs text-gray-400 font-mono ml-2 mr-auto pl-1.5">{latestDate}</span>
              <span className={`text-xs font-bold font-mono ${pctColor}`}>
                {latestClose != null ? formatPrice(latestClose) : "-"}
                <span className="ml-1.5 font-normal">{formatPct(latestChangePct)}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 功能 Tab */}
      <div className="bg-white border-b border-gray-200 flex">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              activeTab === t.key
                ? "text-[#D32F2F] border-b-2 border-[#D32F2F]"
                : "text-gray-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== 日线数据 Tab ===== */}
      {activeTab === "data" && (
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">加载中...</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 text-sm gap-2">
              <span>暂无数据</span>
            </div>
          ) : (
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-1.5 py-2 text-center text-gray-500 font-medium w-[68px]">日期</th>
                  <th className="border border-gray-300 px-1 py-2 text-center text-gray-500 font-medium">开盘</th>
                  <th className="border border-gray-300 px-1 py-2 text-center text-gray-500 font-medium">收盘</th>
                  <th className="border border-gray-300 px-1 py-2 text-center text-gray-500 font-medium">最高</th>
                  <th className="border border-gray-300 px-1 py-2 text-center text-gray-500 font-medium">最低</th>
                  <th className="border border-gray-300 px-1 py-2 text-center text-gray-500 font-medium w-[58px]">涨跌</th>
                  <th className="border border-gray-300 px-1 py-2 text-center text-gray-500 font-medium w-[52px]">振幅</th>
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
                      <td className="border border-gray-200 px-1.5 py-2 text-gray-500 font-mono">{row.date}</td>
                      <td className="border border-gray-200 px-1 py-2 text-right text-gray-700 font-mono">{formatPrice(row.open)}</td>
                      <td className={`border border-gray-200 px-1 py-2 text-right font-mono font-medium ${color}`}>{formatPrice(row.close)}</td>
                      <td className="border border-gray-200 px-1 py-2 text-right text-gray-600 font-mono">{formatPrice(row.high)}</td>
                      <td className="border border-gray-200 px-1 py-2 text-right text-gray-600 font-mono">{formatPrice(row.low)}</td>
                      <td className={`border border-gray-200 px-1 py-2 text-right font-mono ${color}`}>{formatPct(row.changePct)}</td>
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
      )}

      {/* ===== 数据分析 Tab ===== */}
      {activeTab === "analysis" && (
        <div className="flex-1 overflow-auto pb-6">
          {statsLoading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">计算中...</div>
          ) : !stats ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm">暂无数据</div>
          ) : (
            <div className="px-3 pt-3 space-y-4">

              {/* 涨跌天数概览 */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">涨跌天数统计</span>
                  <span className="text-xs text-gray-400 ml-2">共 {stats.total} 天</span>
                </div>
                <div className="grid grid-cols-3 divide-x divide-gray-100">
                  <div className="flex flex-col items-center py-4">
                    <span className="text-2xl font-bold text-red-500">{stats.upDays}</span>
                    <span className="text-xs text-gray-400 mt-1">上涨天数</span>
                    <span className="text-xs text-red-400 font-medium mt-0.5">{stats.upPct}%</span>
                  </div>
                  <div className="flex flex-col items-center py-4">
                    <span className="text-2xl font-bold text-green-600">{stats.downDays}</span>
                    <span className="text-xs text-gray-400 mt-1">下跌天数</span>
                    <span className="text-xs text-green-500 font-medium mt-0.5">{stats.downPct}%</span>
                  </div>
                  <div className="flex flex-col items-center py-4">
                    <span className="text-2xl font-bold text-gray-400">{stats.flatDays}</span>
                    <span className="text-xs text-gray-400 mt-1">平盘天数</span>
                    <span className="text-xs text-gray-400 font-medium mt-0.5">
                      {stats.total > 0 ? (stats.flatDays / stats.total * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>
                {/* 涨跌比例条 */}
                <div className="px-4 pb-4">
                  <div className="flex h-2.5 rounded-full overflow-hidden">
                    <div className="bg-red-400" style={{ width: `${stats.upPct}%` }} />
                    <div className="bg-gray-200" style={{ width: `${(stats.flatDays / stats.total * 100).toFixed(1)}%` }} />
                    <div className="bg-green-500 flex-1" />
                  </div>
                </div>
              </div>

              {/* 最长连涨/连跌 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-col items-center">
                  <span className="text-xs text-gray-400 mb-1">最长连涨</span>
                  <span className="text-3xl font-bold text-red-500">{stats.maxConsecUp}</span>
                  <span className="text-xs text-gray-400 mt-1">天</span>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-col items-center">
                  <span className="text-xs text-gray-400 mb-1">最长连跌</span>
                  <span className="text-3xl font-bold text-green-600">{stats.maxConsecDown}</span>
                  <span className="text-xs text-gray-400 mt-1">天</span>
                </div>
              </div>

              {/* 连涨次数分布图 */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">连涨次数分布</span>
                  <span className="text-xs text-gray-400 ml-2">连续上涨N天出现的次数</span>
                </div>
                <div className="px-2 pt-3 pb-2">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={upData} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="days" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={{ stroke: "#e5e7eb" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(val: any) => [`${val} 次`, "出现次数"]}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={32}>
                        {upData.map((_, i) => (
                          <Cell key={i} fill="#ef4444" fillOpacity={0.75 + (i / upData.length) * 0.25} />
                        ))}
                        <LabelList dataKey="count" position="top" style={{ fontSize: 10, fill: "#ef4444", fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 连跌次数分布图 */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">连跌次数分布</span>
                  <span className="text-xs text-gray-400 ml-2">连续下跌N天出现的次数</span>
                </div>
                <div className="px-2 pt-3 pb-2">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={downData} margin={{ top: 16, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="days" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={{ stroke: "#e5e7eb" }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(val: any) => [`${val} 次`, "出现次数"]}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={32}>
                        {downData.map((_, i) => (
                          <Cell key={i} fill="#22c55e" fillOpacity={0.75 + (i / downData.length) * 0.25} />
                        ))}
                        <LabelList dataKey="count" position="top" style={{ fontSize: 10, fill: "#16a34a", fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* 分页（仅日线数据 Tab 显示） */}
      {activeTab === "data" && totalPages > 1 && (
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
