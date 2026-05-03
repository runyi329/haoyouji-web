/**
 * 人民币汇率详情页
 * 并列显示在岸人民币（USD/CNY）和离岸人民币（USD/CNH）
 * 参考石油详情页风格
 */
import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Loader2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";

// ===== 人民币 SVG 图标 =====
// 在岸CNY：红底白色¥符号
const CnyIcon = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="16" fill="#CC0000"/>
    <text x="16" y="22" textAnchor="middle" fill="white" fontSize="18" fontWeight="bold" fontFamily="serif">¥</text>
  </svg>
);

// 离岸CNH：白底红色¥符号（反色）
const CnhIcon = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="16" fill="white" stroke="#CC0000" strokeWidth="1.5"/>
    <text x="16" y="22" textAnchor="middle" fill="#CC0000" fontSize="18" fontWeight="bold" fontFamily="serif">¥</text>
  </svg>
);

// ===== 主题配置 =====
const THEME = {
  CNY: {
    label: "在岸人民币",
    shortLabel: "CNY",
    subLabel: "USD/CNY",
    IconComp: CnyIcon,
    cardBg: "rgba(0,0,0,0.85)",
    cardBorder: "rgba(255,255,255,0.15)",
    textColor: "text-white",
    labelColor: "text-white/60",
    valueColor: "text-white",
    badgeUp: "bg-red-500/20 text-red-300",
    badgeDown: "bg-green-500/20 text-green-300",
    badgeFlat: "bg-white/10 text-white/60",
  },
  CNH: {
    label: "离岸人民币",
    shortLabel: "CNH",
    subLabel: "USD/CNH",
    IconComp: CnhIcon,
    cardBg: "rgba(255,255,255,0.92)",
    cardBorder: "rgba(204,0,0,0.2)",
    textColor: "text-gray-900",
    labelColor: "text-gray-500",
    valueColor: "text-gray-900",
    badgeUp: "bg-red-100 text-red-600",
    badgeDown: "bg-green-100 text-green-600",
    badgeFlat: "bg-gray-100 text-gray-500",
  },
};

// ===== 工具函数 =====
function fmtRate(v: number | null | undefined, digits = 4) {
  if (v == null || v === 0) return "--";
  return v.toFixed(digits);
}
function fmtPct(v: number | null | undefined) {
  if (v == null) return "--";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(4)}%`;
}
function fmtDate4(s: string) {
  if (!s) return "--";
  // 将 YY/MM/DD 或 YYYY-MM-DD 转为 YYYY/MM/DD
  const clean = s.replace(/-/g, "/");
  const parts = clean.split("/");
  if (parts[0].length === 2) return `20${clean}`;
  return clean;
}
function fmtDate2(s: string) {
  if (!s) return "--";
  const clean = s.replace(/-/g, "/");
  const parts = clean.split("/");
  if (parts[0].length === 4) return `${parts[0].slice(2)}/${parts[1]}/${parts[2]}`;
  return clean;
}

// ===== 行情卡片组件 =====
function CnyQuoteCard({
  sym,
  price,
  changePercent,
  stats,
  meta,
  isLoading,
}: {
  sym: "CNY" | "CNH";
  price: number;
  changePercent: number;
  stats: any;
  meta: any;
  isLoading: boolean;
}) {
  const t = THEME[sym];
  const IconComp = t.IconComp;
  const isUp = changePercent > 0;
  const isDown = changePercent < 0;
  const changeBadge = isUp ? t.badgeUp : isDown ? t.badgeDown : t.badgeFlat;

  return (
    <div
      className="flex-1 rounded-2xl p-4 flex flex-col gap-2"
      style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}` }}
    >
      {/* 标题行 */}
      <div className="flex items-center gap-2">
        <IconComp size={28} />
        <div>
          <div className={`text-sm font-bold ${t.textColor}`}>{t.label}</div>
          <div className={`text-xs ${t.labelColor}`}>{t.subLabel}</div>
        </div>
      </div>

      {/* 价格 + 涨跌幅 */}
      {isLoading ? (
        <div className={`flex items-center gap-1 ${t.labelColor}`}>
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="text-xs">加载中</span>
        </div>
      ) : (
        <div className={`flex items-center justify-between`}>
          <span className={`text-2xl font-bold ${t.valueColor}`}>{fmtRate(price)}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${changeBadge}`}>
            {fmtPct(changePercent)}
          </span>
        </div>
      )}

      {/* 统计行 */}
      <div className="space-y-1 mt-1">
        {[
          { label: "涨跌天数", value: stats ? `↑${stats.upDays} ↓${stats.downDays}` : "--" },
          { label: "涨跌比", value: stats ? `${((stats.upDays / (stats.upDays + stats.downDays)) * 100).toFixed(1)}%` : "--" },
          { label: "数据条数", value: meta?.totalCount ? `${meta.totalCount.toLocaleString()}条` : "--" },
          { label: "起始日期", value: meta?.oldestDate ? fmtDate4(meta.oldestDate) : "--" },
        ].map(({ label, value }) => (
          <div key={label} className="flex justify-between items-center">
            <span className={`text-xs ${t.labelColor}`}>{label}</span>
            <span className={`text-xs font-medium ${t.valueColor}`}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== 涨跌幅频率分布图 =====
function ChangePctDistChart({ symbol, labelIcon, labelText, textColor, labelColor }: {
  symbol: string;
  labelIcon: React.ReactNode;
  labelText: string;
  textColor: string;
  labelColor: string;
}) {
  const { data: allPcts } = trpc.cryptoData.getAllChangePcts.useQuery({ symbol });

  if (!allPcts?.changePcts?.length) return null;

  const pcts = allPcts.changePcts.filter((v: number) => v != null && !isNaN(v));
  const buckets: Record<string, number> = {};
  const ranges = [
    { label: "<-2%", min: -Infinity, max: -2 },
    { label: "-2~-1%", min: -2, max: -1 },
    { label: "-1~0%", min: -1, max: 0 },
    { label: "0~1%", min: 0, max: 1 },
    { label: "1~2%", min: 1, max: 2 },
    { label: ">2%", min: 2, max: Infinity },
  ];
  ranges.forEach(r => { buckets[r.label] = 0; });
  pcts.forEach((p: number) => {
    for (const r of ranges) {
      if (p >= r.min && p < r.max) { buckets[r.label]++; break; }
    }
  });
  const maxCount = Math.max(...Object.values(buckets));

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2">
        {labelIcon}
        <span className={`text-xs font-medium ${textColor}`}>{labelText} 涨跌幅频率分布</span>
      </div>
      <div className="space-y-1">
        {ranges.map(r => {
          const count = buckets[r.label];
          const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
          const isPos = r.label.startsWith("0") || r.label.startsWith("1") || r.label.startsWith(">");
          return (
            <div key={r.label} className="flex items-center gap-2">
              <span className={`text-xs w-14 text-right ${labelColor}`}>{r.label}</span>
              <div className="flex-1 bg-white/10 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${isPos ? "bg-red-400" : "bg-green-400"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={`text-xs w-10 ${labelColor}`}>{count}天</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== AI 分析组件 =====
function AiAnalysis({ cnyPrice, cnhPrice }: { cnyPrice: number; cnhPrice: number }) {
  const [expanded, setExpanded] = useState(false);
  // AI 接口预留：将来接入真实 AI 分析
  const aiData: { trend?: string; keyLevel?: string; tip?: string } | null = null;
  const aiLoading = false;
  return (
    <div
      onClick={() => setExpanded(v => !v)}
      style={{
        borderRadius: 12,
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.18)",
        padding: "9px 12px",
        cursor: "pointer",
        marginTop: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: 0.3 }}>
            AI × 人民币汇率 CNY/CNH
          </span>
          {aiLoading && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>分析中...</span>}
        </div>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{expanded ? "▲ 收起" : "▼ 展开"}</span>
      </div>
      {expanded && (
        <div style={{ marginTop: 10 }}>
          {aiLoading ? (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "center", padding: "8px 0" }}>AI 分析生成中...</div>
          ) : aiData ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "趋势判断", content: aiData.trend },
                { label: "关键位置", content: aiData.keyLevel },
                { label: "投资提示", content: aiData.tip },
              ].filter(s => s.content).map((section, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>{section.label}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.9)", lineHeight: 1.6 }}>{section.content}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "趋势判断", content: "AI 分析接口待接入" },
                { label: "关键位置", content: "AI 分析接口待接入" },
                { label: "投资提示", content: "AI 分析接口待接入" },
              ].map((section, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>{section.label}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>{section.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ===== 历史数据表格 =====
function HistoryTable({ symbol, theme }: { symbol: "CNY" | "CNH"; theme: typeof THEME["CNY"] }) {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;

  const { data, isLoading } = trpc.cryptoData.getKlines.useQuery({
    symbol,
    page,
    pageSize: PAGE_SIZE,
  });

  const rows = data?.klines ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-white/60" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-white/40 text-sm">暂无数据</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-white/50 border-b border-white/10">
                  <th className="text-left py-2 pr-2 font-medium">日期</th>
                  <th className="text-right py-2 px-1 font-medium">开盘</th>
                  <th className="text-right py-2 px-1 font-medium">最高</th>
                  <th className="text-right py-2 px-1 font-medium">最低</th>
                  <th className="text-right py-2 px-1 font-medium">收盘</th>
                  <th className="text-right py-2 pl-1 font-medium">涨跌%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any, i: number) => {
                  const chg = row.changePct ?? 0;
                  const chgColor = chg > 0 ? "text-red-400" : chg < 0 ? "text-green-400" : "text-white/50";
                  return (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-1.5 pr-2 text-white/70 whitespace-nowrap">{fmtDate2(row.date)}</td>
                      <td className="py-1.5 px-1 text-right text-white/80">{fmtRate(row.open)}</td>
                      <td className="py-1.5 px-1 text-right text-white/80">{fmtRate(row.high)}</td>
                      <td className="py-1.5 px-1 text-right text-white/80">{fmtRate(row.low)}</td>
                      <td className="py-1.5 px-1 text-right text-white font-medium">{fmtRate(row.close)}</td>
                      <td className={`py-1.5 pl-1 text-right font-medium ${chgColor}`}>
                        {chg != null ? `${chg > 0 ? "+" : ""}${chg.toFixed(4)}%` : "--"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* 翻页 */}
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-white/40">共 {total.toLocaleString()} 条</span>
            <div className="flex items-center gap-2">
              <button
                className="p-1 rounded text-white/60 hover:text-white disabled:opacity-30"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-white/60">{page}/{totalPages}</span>
              <button
                className="p-1 rounded text-white/60 hover:text-white disabled:opacity-30"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ===== 主页面 =====
export default function CNYDetailPage() {
  const [activeTab, setActiveTab] = useState<"analysis" | "history">("analysis");
  const [historySymbol, setHistorySymbol] = useState<"CNY" | "CNH">("CNY");
  const [refreshKey, setRefreshKey] = useState(0);

  // 实时价格
  const { data: dualPrice, isLoading: priceLoading, refetch: refetchPrice } = trpc.stock.getCnyDualPrice.useQuery(
    undefined,
    { refetchInterval: 30000 }
  );

  // 统计数据
  const { data: cnyStats } = trpc.cryptoData.getStats.useQuery({ symbol: "CNY" });
  const { data: cnhStats } = trpc.cryptoData.getStats.useQuery({ symbol: "CNH" });

  // Meta 数据
  const { data: cnyMeta } = trpc.cryptoData.getMeta.useQuery({ symbol: "CNY" });
  const { data: cnhMeta } = trpc.cryptoData.getMeta.useQuery({ symbol: "CNH" });
  const handleRefresh = () => {
    window.location.reload();
  };

  const cnyPrice = dualPrice?.cny?.price ?? 0;
  const cnhPrice = dualPrice?.cnh?.price ?? 0;
  const cnyChangePct = dualPrice?.cny?.changePercent ?? 0;
  const cnhChangePct = dualPrice?.cnh?.changePercent ?? 0;

  return (
    <div className="min-h-screen pb-20 max-w-md mx-auto" style={{ background: "#0f1117" }}>
      {/* 红色渐变头部区域（导航栏 + 双卡片 + AI分析）*/}
      <div style={{ background: "linear-gradient(135deg, #7b0000 0%, #cc0000 50%, #1a0000 100%)", borderRadius: "0 0 24px 24px", padding: "16px 16px 20px" }}>
        {/* 顶部导航栏 */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1 text-white/80 hover:text-white text-sm"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>返回</span>
          </button>
          <div className="flex items-center gap-2">
            <CnyIcon size={22} />
            <span className="text-white font-bold text-base">人民币汇率</span>
          </div>
          <button
            onClick={handleRefresh}
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", fontSize: 11, fontWeight: 500, cursor: "pointer", flexShrink: 0 }}
          >
            更新
          </button>
        </div>

        {/* 双卡片并列 */}
        <div className="flex gap-3">
          <CnyQuoteCard
            sym="CNY"
            price={cnyPrice}
            changePercent={cnyChangePct}
            stats={cnyStats}
            meta={cnyMeta}
            isLoading={priceLoading}
          />
          <CnyQuoteCard
            sym="CNH"
            price={cnhPrice}
            changePercent={cnhChangePct}
            stats={cnhStats}
            meta={cnhMeta}
            isLoading={priceLoading}
          />
        </div>

        {/* AI 分析 */}
        <AiAnalysis cnyPrice={cnyPrice} cnhPrice={cnhPrice} />
      </div>

      {/* 下方内容区（黑色背景，Tab 切换 + 数据分析 + 日线历史）*/}
      <div className="px-4 pt-4">
        {/* Tab 切换 */}
        <div className="flex gap-2 mb-4">
          {(["analysis", "history"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab
                  ? "bg-red-600 text-white shadow-lg"
                  : "text-white/60 hover:text-white/80"
              }`}
              style={activeTab !== tab ? { background: "rgba(255,255,255,0.08)" } : {}}
            >
              {tab === "analysis" ? "数据分析" : "日线历史"}
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        {activeTab === "analysis" && (
          <div className="space-y-4">
            {/* 涨跌天数对比 */}
            <div className="bg-white/8 rounded-2xl p-4">
              <div className="text-white/60 text-xs mb-3 font-medium">涨跌天数对比</div>
              <div className="grid grid-cols-2 gap-3">
                {(["CNY", "CNH"] as const).map(sym => {
                  const stats = sym === "CNY" ? cnyStats : cnhStats;
                  const t = THEME[sym];
                  const IconComp = t.IconComp;
                  const total = (stats?.upDays ?? 0) + (stats?.downDays ?? 0) + (stats?.flatDays ?? 0);
                  const upPct = total > 0 ? ((stats?.upDays ?? 0) / total * 100).toFixed(1) : "0";
                  const downPct = total > 0 ? ((stats?.downDays ?? 0) / total * 100).toFixed(1) : "0";
                  return (
                    <div key={sym} className="bg-white/5 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <IconComp size={18} />
                        <span className="text-white text-xs font-medium">{t.shortLabel}</span>
                      </div>
                      <div className="space-y-1.5">
                        <div>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-red-400">上涨 {stats?.upDays ?? "--"}天</span>
                            <span className="text-red-400">{upPct}%</span>
                          </div>
                          <div className="h-1.5 bg-white/10 rounded-full">
                            <div className="h-1.5 bg-red-400 rounded-full" style={{ width: `${upPct}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-green-400">下跌 {stats?.downDays ?? "--"}天</span>
                            <span className="text-green-400">{downPct}%</span>
                          </div>
                          <div className="h-1.5 bg-white/10 rounded-full">
                            <div className="h-1.5 bg-green-400 rounded-full" style={{ width: `${downPct}%` }} />
                          </div>
                        </div>
                        <div className="text-xs text-white/40">平盘 {stats?.flatDays ?? "--"}天</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 最长连涨/连跌 */}
            <div className="bg-white/8 rounded-2xl p-4">
              <div className="text-white/60 text-xs mb-3 font-medium">最长连涨 / 连跌</div>
              <div className="grid grid-cols-2 gap-3">
                {(["CNY", "CNH"] as const).map(sym => {
                  const stats = sym === "CNY" ? cnyStats : cnhStats;
                  const t = THEME[sym];
                  const IconComp = t.IconComp;
                  return (
                    <div key={sym} className="bg-white/5 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <IconComp size={18} />
                        <span className="text-white text-xs font-medium">{t.shortLabel}</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-white/50">最长连涨</span>
                          <span className="text-red-400 font-bold">{stats?.maxConsecUp ?? "--"}天</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-white/50">最长连跌</span>
                          <span className="text-green-400 font-bold">{stats?.maxConsecDown ?? "--"}天</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 涨跌幅频率分布 */}
            <div className="bg-white/8 rounded-2xl p-4">
              <ChangePctDistChart
                symbol="CNY"
                labelIcon={<CnyIcon size={18} />}
                labelText="在岸CNY"
                textColor="text-white"
                labelColor="text-white/50"
              />
              <div className="mt-4 border-t border-white/10 pt-4">
                <ChangePctDistChart
                  symbol="CNH"
                  labelIcon={<CnhIcon size={18} />}
                  labelText="离岸CNH"
                  textColor="text-white"
                  labelColor="text-white/50"
                />
              </div>
            </div>

            {/* CNY vs CNH 对比表 */}
            <div className="bg-white/8 rounded-2xl p-4">
              <div className="text-white/60 text-xs mb-3 font-medium">在岸 vs 离岸 对比</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-white/40 border-b border-white/10">
                    <th className="text-left py-2 font-medium">指标</th>
                    <th className="text-right py-2 font-medium">
                      <div className="flex items-center justify-end gap-1"><CnyIcon size={14} /><span>CNY</span></div>
                    </th>
                    <th className="text-right py-2 font-medium">
                      <div className="flex items-center justify-end gap-1"><CnhIcon size={14} /><span>CNH</span></div>
                    </th>
                  </tr>
                </thead>
                <tbody className="text-white/80">
                  {[
                    { label: "市场类型", cny: "在岸（受管控）", cnh: "离岸（自由市场）" },
                    { label: "交易地点", cny: "中国大陆银行间", cnh: "香港/新加坡" },
                    { label: "中间价管控", cny: "有（每日公布）", cnh: "无" },
                    { label: "波动幅度", cny: "较小", cnh: "较大" },
                    { label: "参考意义", cny: "官方汇率基准", cnh: "市场预期信号" },
                  ].map(row => (
                    <tr key={row.label} className="border-b border-white/5">
                      <td className="py-2 text-white/50">{row.label}</td>
                      <td className="py-2 text-right">{row.cny}</td>
                      <td className="py-2 text-right">{row.cnh}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 相关性说明 */}
            <div className="bg-white/8 rounded-2xl p-4">
              <div className="text-white/60 text-xs mb-2 font-medium">与主要资产相关性</div>
              <div className="space-y-2">
                {[
                  { asset: "美元指数 DXY", desc: "正相关 — 美元强则人民币贬值（汇率数值上升）" },
                  { asset: "黄金 XAU/USD", desc: "负相关 — 人民币贬值时黄金人民币价格上涨" },
                  { asset: "A股/港股", desc: "负相关 — 人民币贬值压力加大时资本外流风险上升" },
                  { asset: "美联储利率", desc: "正相关 — 美联储加息推高美元，人民币承压" },
                ].map(item => (
                  <div key={item.asset} className="flex gap-2 text-xs">
                    <span className="text-red-400 font-medium whitespace-nowrap">{item.asset}</span>
                    <span className="text-white/60">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <div>
            {/* 历史数据品种切换 */}
            <div className="flex gap-2 mb-4">
              {(["CNY", "CNH"] as const).map(sym => {
                const t = THEME[sym];
                const IconComp = t.IconComp;
                return (
                  <button
                    key={sym}
                    onClick={() => setHistorySymbol(sym)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      historySymbol === sym
                        ? "bg-red-600 text-white"
                        : "bg-white/10 text-white/60 hover:bg-white/15"
                    }`}
                  >
                    <IconComp size={16} />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
            <HistoryTable key={`${historySymbol}-${refreshKey}`} symbol={historySymbol} theme={THEME[historySymbol]} />
          </div>
        )}
      </div>
    </div>
  );
}
