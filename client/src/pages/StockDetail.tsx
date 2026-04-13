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

// ─── 珠盘路组件（方格横排 + 近期/历史对比）────────────────────
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
  const [tab, setTab] = useState<30 | 60>(60);

  const displayed = items.slice(-tab);
  const upItems = displayed.filter(d => d.pct > 0);
  const downItems = displayed.filter(d => d.pct < 0);
  const flatItems = displayed.filter(d => d.pct === 0);

  const recentUpRate = displayed.length > 0 ? (upItems.length / displayed.length) * 100 : 0;
  const recentDownRate = displayed.length > 0 ? (downItems.length / displayed.length) * 100 : 0;
  const recentFlatRate = displayed.length > 0 ? (flatItems.length / displayed.length) * 100 : 0;
  const deviation = recentUpRate - lifetimeUpRate;

  // 偏离状态
  const deviationAbs = Math.abs(deviation);
  const deviationColor = deviationAbs < 3 ? MUTED : deviation < 0 ? GREEN_A : RED;
  const deviationLabel =
    deviationAbs < 3
      ? "与历史调性一致"
      : deviation < 0
      ? `近期偏空 ${deviationAbs.toFixed(1)}%`
      : `近期偏多 ${deviationAbs.toFixed(1)}%`;

  // 渲染方格行
  const renderRow = (
    list: { tradeDate: string; pct: number }[],
    isUp: boolean,
    label: string,
    count: number
  ) => {
    const color = isUp ? RED : GREEN_A;
    const bgFill = isUp ? "#FFF0F0" : "#F0FFF4";
    const bgEmpty = isUp ? "#FFF8F8" : "#F8FFF8";
    return (
      <div className="mb-3">
        {/* 行标题 */}
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: color, color: "#fff", letterSpacing: 1 }}
          >
            {label}
          </span>
          <span className="text-sm font-bold" style={{ color }}>
            {count} 天
          </span>
          <span className="text-xs" style={{ color: MUTED }}>
            ({((count / (displayed.length || 1)) * 100).toFixed(1)}%)
          </span>
        </div>
        {/* 方格横排，自动换行 */}
        <div className="flex flex-wrap gap-1">
          {list.length === 0 ? (
            <div
              className="flex items-center justify-center rounded"
              style={{
                width: 36, height: 26,
                background: bgEmpty,
                border: `1px dashed ${color}`,
                fontSize: 10, color: MUTED,
              }}
            >
              无
            </div>
          ) : (
            list.map((d, i) => (
              <div
                key={i}
                className="flex items-center justify-center rounded"
                style={{
                  width: 36,
                  height: 26,
                  background: bgFill,
                  border: `1.5px solid ${color}`,
                  fontSize: 10,
                  color,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {shortDate(d.tradeDate)}
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  // 进度条（双行对比）
  const CompareBar = ({
    recentVal,
    histVal,
    color,
    label,
  }: {
    recentVal: number;
    histVal: number;
    color: string;
    label: string;
  }) => (
    <div className="mb-2">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs" style={{ color: MUTED }}>{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color }}>近{tab}天 {recentVal.toFixed(1)}%</span>
          <span className="text-xs" style={{ color: MUTED }}>历史 {histVal.toFixed(1)}%</span>
        </div>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden" style={{ background: "#F0F0F0" }}>
        {/* 历史基准（半透明底色） */}
        <div
          className="absolute top-0 left-0 h-full rounded-full"
          style={{ width: `${Math.max(histVal, 1)}%`, background: `${color}33` }}
        />
        {/* 近期实际 */}
        <div
          className="absolute top-0 left-0 h-full rounded-full"
          style={{ width: `${Math.max(recentVal, 1)}%`, background: color }}
        />
        {/* 历史基准刻度线 */}
        <div
          className="absolute top-0 h-full"
          style={{
            left: `${Math.max(histVal, 1)}%`,
            width: 2,
            background: "#fff",
            opacity: 0.9,
          }}
        />
      </div>
    </div>
  );

  const lifetimeDownRate = lifetimeTotalDays > 0 ? (lifetimeDownDays / lifetimeTotalDays) * 100 : 0;
  const lifetimeFlatRate = lifetimeTotalDays > 0 ? (lifetimeFlatDays / lifetimeTotalDays) * 100 : 0;

  return (
    <div>
      {/* Tab 切换 */}
      <div className="flex items-center gap-2 mb-4">
        {([30, 60] as const).map(n => (
          <button
            key={n}
            onClick={() => setTab(n)}
            className="px-3 py-1 rounded-full text-xs font-medium"
            style={{
              background: tab === n ? RED : "#F0F0F0",
              color: tab === n ? "#fff" : MUTED,
            }}
          >
            近{n}天
          </button>
        ))}
        <span className="ml-auto text-xs" style={{ color: MUTED }}>
          共 {displayed.length} 个交易日
        </span>
      </div>

      {/* 涨天方格行 */}
      {renderRow(upItems, true, "涨", upItems.length)}

      {/* 跌天方格行 */}
      {renderRow(downItems, false, "跌", downItems.length)}

      {/* 平天（若有） */}
      {flatItems.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: "#9E9E9E", color: "#fff", letterSpacing: 1 }}
            >
              平
            </span>
            <span className="text-sm font-bold" style={{ color: MUTED }}>
              {flatItems.length} 天
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {flatItems.map((d, i) => (
              <div
                key={i}
                className="flex items-center justify-center rounded"
                style={{
                  width: 36, height: 26,
                  background: "#F5F5F5",
                  border: "1.5px solid #BDBDBD",
                  fontSize: 10, color: MUTED, fontWeight: 700,
                }}
              >
                {shortDate(d.tradeDate)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 分隔线 */}
      <div className="my-3" style={{ borderTop: `1px dashed ${BORDER}` }} />

      {/* 近期小结 */}
      <div
        className="rounded-xl p-3 mb-2"
        style={{ background: "#FFF8F2", border: `1px solid #F5E0C8` }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold" style={{ color: RED }}>近{tab}天小结</span>
          <span className="text-xs" style={{ color: MUTED }}>
            {displayed.length} 个交易日
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center mb-2">
          <div className="rounded-lg py-1.5" style={{ background: "#FFF0F0" }}>
            <div className="text-base font-bold" style={{ color: RED }}>{upItems.length}</div>
            <div className="text-xs" style={{ color: MUTED }}>涨天</div>
          </div>
          <div className="rounded-lg py-1.5" style={{ background: "#F0FFF4" }}>
            <div className="text-base font-bold" style={{ color: GREEN_A }}>{downItems.length}</div>
            <div className="text-xs" style={{ color: MUTED }}>跌天</div>
          </div>
          <div className="rounded-lg py-1.5" style={{ background: "#F5F5F5" }}>
            <div className="text-base font-bold" style={{ color: MUTED }}>{flatItems.length}</div>
            <div className="text-xs" style={{ color: MUTED }}>平天</div>
          </div>
        </div>
        {/* 进度条对比（近期 vs 历史） */}
        <CompareBar recentVal={recentUpRate} histVal={lifetimeUpRate} color={RED} label="涨天率" />
        <CompareBar recentVal={recentDownRate} histVal={lifetimeDownRate} color={GREEN_A} label="跌天率" />
      </div>

      {/* 全生命周期小结（与近期小结对齐） */}
      <div
        className="rounded-xl p-3 mb-2"
        style={{ background: "#F5F0FF", border: `1px solid #DDD0F0` }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold" style={{ color: "#7B1FA2" }}>全生命周期</span>
          <span className="text-xs" style={{ color: MUTED }}>
            {lifetimeTotalDays} 个交易日
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="rounded-lg py-1.5" style={{ background: "#FFF0F0" }}>
            <div className="text-base font-bold" style={{ color: RED }}>{lifetimeUpDays}</div>
            <div className="text-xs" style={{ color: MUTED }}>涨天</div>
          </div>
          <div className="rounded-lg py-1.5" style={{ background: "#F0FFF4" }}>
            <div className="text-base font-bold" style={{ color: GREEN_A }}>{lifetimeDownDays}</div>
            <div className="text-xs" style={{ color: MUTED }}>跌天</div>
          </div>
          <div className="rounded-lg py-1.5" style={{ background: "#F5F5F5" }}>
            <div className="text-base font-bold" style={{ color: MUTED }}>{lifetimeFlatDays}</div>
            <div className="text-xs" style={{ color: MUTED }}>平天</div>
          </div>
          <div className="rounded-lg py-1.5" style={{ background: "#EEE8FF" }}>
            <div className="text-base font-bold" style={{ color: "#7B1FA2" }}>{lifetimeTotalDays}</div>
            <div className="text-xs" style={{ color: MUTED }}>总天</div>
          </div>
        </div>
      </div>

      {/* 偏离值指示器 */}
      <div
        className="rounded-xl p-3"
        style={{
          background: deviationAbs < 3 ? "#F8F8F8" : deviation < 0 ? "#F0FFF4" : "#FFF5F5",
          border: `1.5px solid ${deviationColor}`,
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs" style={{ color: MUTED }}>偏离值（近{tab}天 vs 历史）</div>
            <div className="text-lg font-bold mt-0.5" style={{ color: deviationColor }}>
              {deviation >= 0 ? "+" : ""}{deviation.toFixed(1)}%
            </div>
          </div>
          <div
            className="px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: deviationColor, color: "#fff" }}
          >
            {deviationLabel}
          </div>
        </div>
        {deviationAbs >= 3 && (
          <div className="mt-1.5 text-xs" style={{ color: deviationColor }}>
            {deviation < 0
              ? `近期跌天偏多，历史均值回归信号，可关注反弹机会`
              : `近期涨天偏多，注意高位风险，可关注回调压力`}
          </div>
        )}
      </div>
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
    { tsCode, limit: 60 },
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
        <div className="mx-4 mt-3 rounded-xl p-4" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-semibold" style={{ color: RED }}>珠盘路</div>
            <div className="text-xs" style={{ color: MUTED }}>
              红格=涨天 · 绿格=跌天
            </div>
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
