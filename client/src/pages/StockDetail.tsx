/**
 * StockDetail.tsx
 * 个股详情页 — 基本信息 + 珠盘路（方格横排+近期/历史对比）+ 全生命周期统计
 * 路径: /stock/:tsCode
 */
import { useParams } from "wouter";
import { ChevronLeft, Calendar, Building2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";

// ─── 配色 ────────────────────────────────────────────────
const RED = "#D32F2F";
const BG = "#F2EAE0";
const CARD = "#FFFFFF";
const BORDER = "#E8E0D8";
const TEXT = "#1A1A1A";
const MUTED = "#888888";
const GREEN_A = "#00B050";
const CARD_SHADOW = "0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)";

// ─── 工具函数 ────────────────────────────────────────────
function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  if (dateStr.length === 8) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }
  return dateStr;
}
function exchangeLabel(exchange: string) {
  if (exchange === "SSE") return "上交所";
  if (exchange === "SZSE") return "深交所";
  return exchange || "—";
}
function marketLabel(tsCode: string) {
  if (tsCode.startsWith("688")) return "科创板";
  if (tsCode.startsWith("6")) return "沪市主板";
  if (tsCode.startsWith("3")) return "创业板";
  if (tsCode.startsWith("0")) return "深市主板";
  return "其他";
}
function listStatusLabel(status: string) {
  if (status === "L") return { text: "上市", color: GREEN_A };
  if (status === "D") return { text: "退市", color: MUTED };
  if (status === "P") return { text: "暂停", color: "#FF9800" };
  return { text: status, color: MUTED };
}
// 将 YYYYMMDD 转为 M/D 简写
function shortDate(dateStr: string): string {
  if (dateStr.length === 8) {
    const m = parseInt(dateStr.slice(4, 6));
    const d = parseInt(dateStr.slice(6, 8));
    return `${m}/${d}`;
  }
  return dateStr;
}

// ─── 珠盘路组件（统计数字主体 + 弹出框明细）────────────────────
function ZhuPanLu({
  items,
  lifetimeUpRate,
  lifetimeUpDays,
  lifetimeDownDays,
  lifetimeFlatDays,
  lifetimeTotalDays,
}: {
  items: { tradeDate: string; pct: number; solid: boolean }[];
  lifetimeUpRate: number;
  lifetimeUpDays: number;
  lifetimeDownDays: number;
  lifetimeFlatDays: number;
  lifetimeTotalDays: number;
}) {
  const [tab, setTab] = useState<30 | 60 | 90 | 180>(60);
  const [showDetail, setShowDetail] = useState(false);

  const displayed = items.slice(-tab);
  const upItems = displayed.filter(d => d.pct > 0);
  const downItems = displayed.filter(d => d.pct < 0);
  const flatItems = displayed.filter(d => d.pct === 0);

  const recentUpRate = displayed.length > 0 ? (upItems.length / displayed.length) * 100 : 0;
  const recentDownRate = displayed.length > 0 ? (downItems.length / displayed.length) * 100 : 0;
  const deviation = recentUpRate - lifetimeUpRate;
  const deviationAbs = Math.abs(deviation);
  const deviationColor = deviationAbs < 3 ? MUTED : deviation < 0 ? GREEN_A : RED;
  const deviationLabel =
    deviationAbs < 3
      ? "与历史调性一致"
      : deviation < 0
      ? `近期偏空 ${deviationAbs.toFixed(1)}%`
      : `近期偏多 ${deviationAbs.toFixed(1)}%`;

  const lifetimeDownRate = lifetimeTotalDays > 0 ? (lifetimeDownDays / lifetimeTotalDays) * 100 : 0;

  // 进度条
  const Bar = ({ val, hist, color }: { val: number; hist: number; color: string }) => (
    <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: "#F0F0F0" }}>
      <div className="absolute top-0 left-0 h-full rounded-full" style={{ width: `${Math.max(hist, 1)}%`, background: `${color}33` }} />
      <div className="absolute top-0 left-0 h-full rounded-full" style={{ width: `${Math.max(val, 1)}%`, background: color }} />
      <div className="absolute top-0 h-full" style={{ left: `${Math.max(hist, 1)}%`, width: 2, background: "#fff", opacity: 0.85 }} />
    </div>
  );

  return (
    <div>
      {/* ── 顶部：Tab切换 + 报告图标 ── */}
      <div className="flex items-center gap-1.5 px-4 mb-3">
        {([30, 60, 90, 180] as const).map(n => (
          <button
            key={n}
            onClick={() => setTab(n)}
            className="px-2.5 py-1 rounded-full text-xs font-medium"
            style={{ background: tab === n ? RED : "#F0F0F0", color: tab === n ? "#fff" : MUTED }}
          >
            {n}天
          </button>
        ))}
        <button
          onClick={() => setShowDetail(true)}
          className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: "#F0F0F0", color: MUTED }}
          title="查看每日明细"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          明细
        </button>
      </div>

      {/* 近期行 */}
      <div className="px-4 py-3" style={{ background: "#FFF8F2" }}>
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {[
            { val: upItems.length, rate: recentUpRate, color: RED, bg: "#FFF0F0", suffix: "天涨" },
            { val: downItems.length, rate: recentDownRate, color: GREEN_A, bg: "#F0FFF4", suffix: "天跌" },
            { val: flatItems.length, rate: displayed.length > 0 ? (flatItems.length / displayed.length) * 100 : 0, color: MUTED, bg: "#F5F5F5", suffix: "天平" },
            { val: displayed.length, rate: displayed.length > 0 ? ((upItems.length + downItems.length + flatItems.length) / displayed.length) * 100 : 0, color: "#7B1FA2", bg: "#EEE8FF", suffix: "天" },
          ].map((item, i) => (
            <div key={i} className="rounded-lg py-2.5" style={{ background: item.bg }}>
              <div className="text-lg font-bold leading-tight" style={{ color: item.color }}>
                {`${item.rate.toFixed(1)}%`}
              </div>
              <div className="text-xs mt-0.5" style={{ color: item.color, opacity: 0.75 }}>{item.val}{item.suffix}</div>
            </div>
          ))}
        </div>
        {/* 涨跌天率进度条对比 */}
        <div className="mt-2.5 space-y-1.5">
          <div>
            <div className="flex justify-between text-xs mb-0.5">
              <span style={{ color: MUTED }}>涨天率 vs 历史</span>
              <span style={{ color: RED }}>{recentUpRate.toFixed(1)}% <span style={{ color: MUTED }}>/ {lifetimeUpRate.toFixed(1)}%</span></span>
            </div>
            <Bar val={recentUpRate} hist={lifetimeUpRate} color={RED} />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-0.5">
              <span style={{ color: MUTED }}>跌天率 vs 历史</span>
              <span style={{ color: GREEN_A }}>{recentDownRate.toFixed(1)}% <span style={{ color: MUTED }}>/ {lifetimeDownRate.toFixed(1)}%</span></span>
            </div>
            <Bar val={recentDownRate} hist={lifetimeDownRate} color={GREEN_A} />
          </div>
        </div>
      </div>

      {/* 间隙 */}
      <div style={{ height: 6, background: BG }} />
      {/* 全生命周期行 */}
      <div className="px-4 py-3" style={{ background: "#F5F0FF" }}>
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {[
            { val: lifetimeUpDays, rate: lifetimeUpRate, color: RED, bg: "#FFF0F0", suffix: "天涨" },
            { val: lifetimeDownDays, rate: lifetimeDownRate, color: GREEN_A, bg: "#F0FFF4", suffix: "天跌" },
            { val: lifetimeFlatDays, rate: lifetimeTotalDays > 0 ? (lifetimeFlatDays / lifetimeTotalDays) * 100 : 0, color: MUTED, bg: "#F5F5F5", suffix: "天平" },
            { val: lifetimeTotalDays, rate: lifetimeTotalDays > 0 ? ((lifetimeUpDays + lifetimeDownDays + lifetimeFlatDays) / lifetimeTotalDays) * 100 : 0, color: "#7B1FA2", bg: "#EEE8FF", suffix: "天" },
          ].map((item, i) => (
            <div key={i} className="rounded-lg py-2.5" style={{ background: item.bg }}>
              <div className="text-lg font-bold leading-tight" style={{ color: item.color }}>
                {`${item.rate.toFixed(1)}%`}
              </div>
              <div className="text-xs mt-0.5" style={{ color: item.color, opacity: 0.75 }}>{item.val}{item.suffix}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 间隙 */}
      <div style={{ height: 6, background: BG }} />
      {/* ── 偏离值 ── */}
      <div
        className="p-4"
        style={{ background: deviationAbs < 3 ? "#F8F8F8" : deviation < 0 ? "#F0FFF4" : "#FFF5F5" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs" style={{ color: MUTED }}>偏离值（近{tab}天 vs 历史）</div>
            <div className="text-2xl font-bold mt-0.5" style={{ color: deviationColor }}>
              {deviation >= 0 ? "+" : ""}{deviation.toFixed(1)}%
            </div>
          </div>
          <div className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: deviationColor, color: "#fff" }}>
            {deviationLabel}
          </div>
        </div>
        {deviationAbs >= 3 && (
          <div className="mt-1.5 text-xs" style={{ color: deviationColor }}>
            {deviation < 0 ? "近期跌天偏多，历史均值回归信号，可关注反弹机会" : "近期涨天偏多，注意高位风险，可关注回调压力"}
          </div>
        )}
      </div>

      {/* 底部收尾 */}
      <div className="pb-4" style={{ background: CARD }} />

      {/* ── 每日明细弹出框 ── */}
      {showDetail && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={() => setShowDetail(false)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl overflow-hidden"
            style={{ background: CARD, maxHeight: "80vh" }}
            onClick={e => e.stopPropagation()}
          >
            {/* 弹出框标题栏 */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <span className="text-sm font-semibold" style={{ color: TEXT }}>近{tab}天每日涨跌明细</span>
              <button onClick={() => setShowDetail(false)} style={{ color: MUTED, fontSize: 20, lineHeight: 1 }}>×</button>
            </div>
            {/* 汇总行 */}
            <div className="flex items-center gap-3 px-4 py-2" style={{ background: "#FFF8F2", borderBottom: `1px solid ${BORDER}` }}>
              <span className="text-xs" style={{ color: MUTED }}>共 {displayed.length} 个交易日</span>
              <span className="text-xs font-semibold" style={{ color: RED }}>涨 {upItems.length} 天（{recentUpRate.toFixed(1)}%）</span>
              <span className="text-xs font-semibold" style={{ color: GREEN_A }}>跌 {downItems.length} 天（{recentDownRate.toFixed(1)}%）</span>
              {flatItems.length > 0 && <span className="text-xs" style={{ color: MUTED }}>平 {flatItems.length} 天</span>}
            </div>
            {/* 明细列表 */}
            <div className="overflow-y-auto" style={{ maxHeight: "calc(80vh - 100px)" }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "#F8F8F8", borderBottom: `1px solid ${BORDER}` }}>
                    <th className="text-left px-4 py-2" style={{ color: MUTED, fontWeight: 500 }}>日期</th>
                    <th className="text-right px-4 py-2" style={{ color: MUTED, fontWeight: 500 }}>涨跌幅</th>
                    <th className="text-right px-4 py-2" style={{ color: MUTED, fontWeight: 500 }}>结果</th>
                  </tr>
                </thead>
                <tbody>
                  {[...displayed].reverse().map((d, i) => {
                    const isUp = d.pct > 0;
                    const isDown = d.pct < 0;
                    const rowColor = isUp ? RED : isDown ? GREEN_A : MUTED;
                    const rowBg = i % 2 === 0 ? "#FFFFFF" : "#FAFAFA";
                    return (
                      <tr key={i} style={{ background: rowBg, borderBottom: `1px solid #F0F0F0` }}>
                        <td className="px-4 py-2" style={{ color: TEXT }}>
                          {d.tradeDate.length === 8
                            ? `${d.tradeDate.slice(0, 4)}-${d.tradeDate.slice(4, 6)}-${d.tradeDate.slice(6, 8)}`
                            : d.tradeDate}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold" style={{ color: rowColor }}>
                          {d.pct > 0 ? "+" : ""}{d.pct.toFixed(2)}%
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span
                            className="px-1.5 py-0.5 rounded text-xs font-bold"
                            style={{ background: isUp ? "#FFF0F0" : isDown ? "#F0FFF4" : "#F5F5F5", color: rowColor }}
                          >
                            {isUp ? "涨" : isDown ? "跌" : "平"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StockDetail() {
  const params = useParams<{ tsCode: string }>();
  const { user } = useAuth();

  // wouter 路由不支持含 . 的参数，跳转时 . 被替换为 -，这里还原
  const tsCode = (params.tsCode || "").replace(/-(?=[A-Z]{2}$)/g, ".");

  const { data, isLoading, error } = trpc.aiStockDetail.useQuery(
    { tsCode },
    { enabled: !!tsCode, staleTime: 300_000 }
  );

  // 日线数据（珠盘路）
  const { data: dailyData, isLoading: dailyLoading } = trpc.aiStockDailyData.useQuery(
    { tsCode, limit: 180 },
    { enabled: !!tsCode, staleTime: 300_000 }
  );

  // 兜底数据：即使后端报错也能显示页面框架
  const fallback = {
    tsCode,
    name: tsCode,
    listStatus: 'L',
    listDate: null as string | null,
    delistDate: null as string | null,
    exchange: '',
    industry: null as string | null,
    upDays: 0,
    downDays: 0,
    flatDays: 0,
    totalDays: 0,
    upRate: '0.00',
    updatedAt: null as string | null,
  };
  const displayData = data ?? fallback;

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col" style={{ background: BG }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: RED, color: "#fff" }}>
          <button
            onClick={() => window.history.back()}
            className="w-7 h-7 flex items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.2)" }}
          >
            <ChevronLeft className="w-4 h-4 text-white" />
          </button>
          <p className="font-bold text-base">个股详情</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm" style={{ color: MUTED }}>加载中...</div>
        </div>
      </div>
    );
  }

  const upRate = parseFloat(displayData.upRate || "0");
  const downRate = displayData.totalDays > 0 ? ((displayData.downDays / displayData.totalDays) * 100) : 0;
  const flatRate = displayData.totalDays > 0 ? ((displayData.flatDays / displayData.totalDays) * 100) : 0;
  const statusInfo = listStatusLabel(displayData.listStatus);
  const listYears = (() => {
    if (!displayData.listDate || displayData.listDate.length < 8) return null;
    const y = parseInt(displayData.listDate.slice(0, 4));
    return new Date().getFullYear() - y;
  })();

  return (
    <div className="h-screen flex flex-col" style={{ background: BG }}>
      {/* 顶部导航 */}
      <div
        className="px-4 py-3 flex items-center gap-3 flex-shrink-0"
        style={{ background: RED, color: "#fff" }}
      >
        <button
          onClick={() => window.history.back()}
          className="w-7 h-7 flex items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base truncate">{displayData.name}</p>
          <p className="text-xs opacity-70">{displayData.tsCode}</p>
        </div>
        <span
          className="px-2 py-0.5 rounded-full text-xs font-medium"
          style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}
        >
          {statusInfo.text}
        </span>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto pb-8">

        {/* 基本信息卡片 */}
        <div className="mx-4 mt-4 rounded-xl p-4" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
          <div className="text-xs font-semibold mb-3" style={{ color: RED }}>基本信息</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2">
              <Calendar className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: MUTED }} />
              <div>
                <div className="text-xs" style={{ color: MUTED }}>上市日期</div>
                <div className="text-sm font-medium" style={{ color: TEXT }}>{formatDate(displayData.listDate)}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Building2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: MUTED }} />
              <div>
                <div className="text-xs" style={{ color: MUTED }}>交易所</div>
                <div className="text-sm font-medium" style={{ color: TEXT }}>{exchangeLabel(displayData.exchange)}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-4 h-4 mt-0.5 flex-shrink-0 flex items-center justify-center">
                <span className="text-xs" style={{ color: MUTED }}>板</span>
              </div>
              <div>
                <div className="text-xs" style={{ color: MUTED }}>板块</div>
                <div className="text-sm font-medium" style={{ color: TEXT }}>{marketLabel(displayData.tsCode)}</div>
              </div>
            </div>
            {listYears !== null && (
              <div className="flex items-start gap-2">
                <div className="w-4 h-4 mt-0.5 flex-shrink-0 flex items-center justify-center">
                  <span className="text-xs" style={{ color: MUTED }}>年</span>
                </div>
                <div>
                  <div className="text-xs" style={{ color: MUTED }}>上市年数</div>
                  <div className="text-sm font-medium" style={{ color: TEXT }}>{listYears} 年</div>
                </div>
              </div>
            )}
            {displayData.industry && (
              <div className="flex items-start gap-2 col-span-2">
                <div className="w-4 h-4 mt-0.5 flex-shrink-0 flex items-center justify-center">
                  <span className="text-xs" style={{ color: MUTED }}>行</span>
                </div>
                <div>
                  <div className="text-xs" style={{ color: MUTED }}>所属行业</div>
                  <div className="text-sm font-medium" style={{ color: TEXT }}>{displayData.industry}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 珠盘路卡片 ── */}
        <div className="mt-3" style={{ background: CARD }}>
          <div className="px-4 pt-4 pb-1">
            <div className="text-xs font-semibold" style={{ color: RED }}>珠盘路</div>
          </div>
          {dailyLoading ? (
            <div className="flex items-center justify-center h-16" style={{ color: MUTED }}>
              <span className="text-xs">日线数据加载中...</span>
            </div>
          ) : dailyData?.items?.length ? (
            <ZhuPanLu
              items={dailyData.items}
              lifetimeUpRate={upRate}
              lifetimeUpDays={displayData.upDays}
              lifetimeDownDays={displayData.downDays}
              lifetimeFlatDays={displayData.flatDays}
              lifetimeTotalDays={displayData.totalDays}
            />
          ) : (
            <div className="flex items-center justify-center h-16" style={{ color: MUTED }}>
              <span className="text-xs">暂无日线数据</span>
            </div>
          )}
        </div>
        <div style={{ height: 8, background: BG }} />

        {/* 七条路预告卡片 */}
        <div className="mx-4 mt-3 rounded-xl p-4" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
          <div className="text-xs font-semibold mb-2" style={{ color: RED }}>七条路分析</div>
          <div className="text-xs mb-3" style={{ color: MUTED }}>基于全生命周期数据的多维度信号分析</div>
          <div className="space-y-2">
            {[
              { name: "珠盘路", desc: "原始K线胜负记录", done: true },
              { name: "大路", desc: "连续涨跌方向" },
              { name: "量能路", desc: "放量/缩量信号" },
              { name: "强度路", desc: "强弱阳/强弱阴" },
              { name: "形态路", desc: "K线组合信号" },
              { name: "组合路", desc: "规则加权综合信号" },
              { name: "AI翻译路", desc: "深度学习状态分类（6-8色标签）" },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-2 rounded-lg"
                style={{ background: item.done ? "#FFF5F5" : "#F8F4F0", opacity: item.done ? 1 : 0.7 }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: item.done ? RED : MUTED, fontSize: 10 }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium" style={{ color: item.done ? RED : TEXT }}>{item.name}</span>
                </div>
                <span className="text-xs" style={{ color: item.done ? RED : MUTED }}>
                  {item.done ? "已上线" : item.desc}
                </span>
              </div>
            ))}
          </div>
        </div>

        {displayData.updatedAt && (
          <div className="mx-4 mt-3 mb-4 text-center text-xs" style={{ color: MUTED }}>
            数据更新时间：{displayData.updatedAt?.slice(0, 10)}
          </div>
        )}

        {/* DEBUG 信息（临时，排查问题后删除） */}
        <div className="mx-4 mt-2 mb-4 p-3 rounded-lg text-xs break-all" style={{ background: '#333', color: '#0f0', fontFamily: 'monospace' }}>
          <div>tsCode参数: {tsCode}</div>
          <div>error: {error ? error.message : 'null'}</div>
          <div>data: {data ? 'yes' : 'null'}</div>
          <div>data.name: {data?.name ?? 'N/A'}</div>
          <div>data.listDate: {data?.listDate ?? 'N/A'}</div>
          <div>data.industry: {data?.industry ?? 'N/A'}</div>
          <div>data.totalDays: {data?.totalDays ?? 'N/A'}</div>
          <div>debugMsg: {(data as any)?.debugMsg ?? 'none'}</div>
          <div>dailyItems: {dailyData?.items?.length ?? 'N/A'}</div>
        </div>
      </div>
    </div>
  );
}
