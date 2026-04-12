/**
 * StockDetail.tsx
 * 个股详情页 — 基本信息 + 全生命周期涨跌天数
 * 路径: /stock/:tsCode
 * 公开访问（无需登录），已登录用户显示返回按钮
 */
import { useParams, useLocation } from "wouter";
import { ChevronLeft, TrendingUp, TrendingDown, Minus, Calendar, Building2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

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

export default function StockDetail() {
  const params = useParams<{ tsCode: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const tsCode = decodeURIComponent(params.tsCode || "");

  const { data, isLoading, error } = trpc.aiStockDetail.useQuery(
    { tsCode },
    { enabled: !!tsCode, staleTime: 300_000 }
  );

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col" style={{ background: BG }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: RED, color: "#fff" }}>
          {user && (
            <button
              onClick={() => window.history.back()}
              className="w-7 h-7 flex items-center justify-center rounded-full"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              <ChevronLeft className="w-4 h-4 text-white" />
            </button>
          )}
          <p className="font-bold text-base">个股详情</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center" style={{ color: MUTED }}>
            <div className="text-sm">加载中...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-screen flex flex-col" style={{ background: BG }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: RED, color: "#fff" }}>
          {user && (
            <button
              onClick={() => window.history.back()}
              className="w-7 h-7 flex items-center justify-center rounded-full"
              style={{ background: "rgba(255,255,255,0.2)" }}
            >
              <ChevronLeft className="w-4 h-4 text-white" />
            </button>
          )}
          <p className="font-bold text-base">个股详情</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center" style={{ color: MUTED }}>
            <div className="text-sm">未找到该股票数据</div>
            <div className="text-xs mt-1">{tsCode}</div>
          </div>
        </div>
      </div>
    );
  }

  const upRate = parseFloat(data.upRate || "0");
  const downRate = data.totalDays > 0
    ? ((data.downDays / data.totalDays) * 100)
    : 0;
  const flatRate = data.totalDays > 0
    ? ((data.flatDays / data.totalDays) * 100)
    : 0;

  const statusInfo = listStatusLabel(data.listStatus);

  // 上市年数
  const listYears = (() => {
    if (!data.listDate || data.listDate.length < 8) return null;
    const y = parseInt(data.listDate.slice(0, 4));
    const now = new Date().getFullYear();
    return now - y;
  })();

  return (
    <div className="h-screen flex flex-col" style={{ background: BG }}>
      {/* 顶部导航 */}
      <div
        className="px-4 py-3 flex items-center gap-3 flex-shrink-0"
        style={{ background: RED, color: "#fff" }}
      >
        {user && (
          <button
            onClick={() => window.history.back()}
            className="w-7 h-7 flex items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.2)" }}
          >
            <ChevronLeft className="w-4 h-4 text-white" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base truncate">{data.name}</p>
          <p className="text-xs opacity-70">{data.tsCode}</p>
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
                <div className="text-sm font-medium" style={{ color: TEXT }}>
                  {formatDate(data.listDate)}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Building2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: MUTED }} />
              <div>
                <div className="text-xs" style={{ color: MUTED }}>交易所</div>
                <div className="text-sm font-medium" style={{ color: TEXT }}>
                  {exchangeLabel(data.exchange)}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-4 h-4 mt-0.5 flex-shrink-0 flex items-center justify-center">
                <span className="text-xs" style={{ color: MUTED }}>板</span>
              </div>
              <div>
                <div className="text-xs" style={{ color: MUTED }}>板块</div>
                <div className="text-sm font-medium" style={{ color: TEXT }}>
                  {marketLabel(data.tsCode)}
                </div>
              </div>
            </div>
            {listYears !== null && (
              <div className="flex items-start gap-2">
                <div className="w-4 h-4 mt-0.5 flex-shrink-0 flex items-center justify-center">
                  <span className="text-xs" style={{ color: MUTED }}>年</span>
                </div>
                <div>
                  <div className="text-xs" style={{ color: MUTED }}>上市年数</div>
                  <div className="text-sm font-medium" style={{ color: TEXT }}>
                    {listYears} 年
                  </div>
                </div>
              </div>
            )}
            {data.industry && (
              <div className="flex items-start gap-2 col-span-2">
                <div className="w-4 h-4 mt-0.5 flex-shrink-0 flex items-center justify-center">
                  <span className="text-xs" style={{ color: MUTED }}>行</span>
                </div>
                <div>
                  <div className="text-xs" style={{ color: MUTED }}>所属行业</div>
                  <div className="text-sm font-medium" style={{ color: TEXT }}>
                    {data.industry}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 全生命周期涨跌统计卡片 */}
        <div className="mx-4 mt-3 rounded-xl p-4" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
          <div className="text-xs font-semibold mb-1" style={{ color: RED }}>全生命周期涨跌统计</div>
          <div className="text-xs mb-3" style={{ color: MUTED }}>
            自上市以来共 {data.totalDays} 个交易日
          </div>

          {/* 四格数据 */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div className="text-center rounded-lg py-2" style={{ background: "#FFF5F5" }}>
              <div className="text-lg font-bold" style={{ color: RED }}>{data.upDays}</div>
              <div className="text-xs mt-0.5" style={{ color: MUTED }}>涨天</div>
            </div>
            <div className="text-center rounded-lg py-2" style={{ background: "#F0FFF4" }}>
              <div className="text-lg font-bold" style={{ color: GREEN_A }}>{data.downDays}</div>
              <div className="text-xs mt-0.5" style={{ color: MUTED }}>跌天</div>
            </div>
            <div className="text-center rounded-lg py-2" style={{ background: "#F8F8F8" }}>
              <div className="text-lg font-bold" style={{ color: "#888" }}>{data.flatDays}</div>
              <div className="text-xs mt-0.5" style={{ color: MUTED }}>平天</div>
            </div>
            <div className="text-center rounded-lg py-2" style={{ background: "#F5F0FF" }}>
              <div className="text-lg font-bold" style={{ color: "#7B1FA2" }}>{data.totalDays}</div>
              <div className="text-xs mt-0.5" style={{ color: MUTED }}>总天</div>
            </div>
          </div>

          {/* 涨跌平进度条 */}
          <div className="space-y-2">
            {/* 涨天 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" style={{ color: RED }} />
                  <span className="text-xs" style={{ color: MUTED }}>涨天占比</span>
                </div>
                <span className="text-xs font-semibold" style={{ color: RED }}>
                  {upRate.toFixed(1)}%
                </span>
              </div>
              <div className="h-5 rounded-full overflow-hidden" style={{ background: "#F0F0F0" }}>
                <div
                  className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-700"
                  style={{
                    width: `${Math.max(upRate, 2)}%`,
                    background: "linear-gradient(90deg, #E53935 0%, #D32F2F 100%)",
                  }}
                >
                  {upRate >= 10 && (
                    <span className="text-white text-xs font-medium">{upRate.toFixed(1)}%</span>
                  )}
                </div>
              </div>
            </div>

            {/* 跌天 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" style={{ color: GREEN_A }} />
                  <span className="text-xs" style={{ color: MUTED }}>跌天占比</span>
                </div>
                <span className="text-xs font-semibold" style={{ color: GREEN_A }}>
                  {downRate.toFixed(1)}%
                </span>
              </div>
              <div className="h-5 rounded-full overflow-hidden" style={{ background: "#F0F0F0" }}>
                <div
                  className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-700"
                  style={{
                    width: `${Math.max(downRate, 2)}%`,
                    background: "linear-gradient(90deg, #43A047 0%, #00B050 100%)",
                  }}
                >
                  {downRate >= 10 && (
                    <span className="text-white text-xs font-medium">{downRate.toFixed(1)}%</span>
                  )}
                </div>
              </div>
            </div>

            {/* 平天 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1">
                  <Minus className="w-3 h-3" style={{ color: MUTED }} />
                  <span className="text-xs" style={{ color: MUTED }}>平天占比</span>
                </div>
                <span className="text-xs font-semibold" style={{ color: MUTED }}>
                  {flatRate.toFixed(1)}%
                </span>
              </div>
              <div className="h-5 rounded-full overflow-hidden" style={{ background: "#F0F0F0" }}>
                <div
                  className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-700"
                  style={{
                    width: `${Math.max(flatRate, 2)}%`,
                    background: "linear-gradient(90deg, #BDBDBD 0%, #9E9E9E 100%)",
                  }}
                >
                  {flatRate >= 10 && (
                    <span className="text-white text-xs font-medium">{flatRate.toFixed(1)}%</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 涨跌比 */}
          <div
            className="mt-4 p-3 rounded-lg flex items-center justify-between"
            style={{ background: "#F8F4F0" }}
          >
            <div className="text-xs" style={{ color: MUTED }}>涨跌比（涨天/跌天）</div>
            <div className="text-sm font-bold" style={{ color: data.upDays >= data.downDays ? RED : GREEN_A }}>
              {data.downDays > 0
                ? (data.upDays / data.downDays).toFixed(2)
                : "∞"
              }
            </div>
          </div>
        </div>

        {/* 七条路预告卡片 */}
        <div className="mx-4 mt-3 rounded-xl p-4" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
          <div className="text-xs font-semibold mb-2" style={{ color: RED }}>七条路分析</div>
          <div className="text-xs mb-3" style={{ color: MUTED }}>
            基于全生命周期数据的多维度信号分析，即将上线
          </div>
          <div className="space-y-2">
            {[
              { name: "珠盘路", desc: "原始K线胜负记录" },
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
                style={{ background: "#F8F4F0", opacity: 0.7 }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: RED, fontSize: 10 }}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium" style={{ color: TEXT }}>{item.name}</span>
                </div>
                <span className="text-xs" style={{ color: MUTED }}>{item.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 数据说明 */}
        {data.updatedAt && (
          <div className="mx-4 mt-3 mb-4 text-center text-xs" style={{ color: MUTED }}>
            数据更新时间：{data.updatedAt.slice(0, 10)}
          </div>
        )}
      </div>
    </div>
  );
}
