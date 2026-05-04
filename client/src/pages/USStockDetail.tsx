/**
 * USStockDetail.tsx
 * 美股个股详情页 - 基本信息 + 全生命周期涨跌天数统计
 * 路径: /us-stock/:tsCode
 */
import { useParams } from "wouter";
import { ChevronLeft, Calendar, Globe } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

// ─── 配色 ────────────────────────────────────────────────
const BLUE = "#1565C0";
const BG = "#EEF2F8";
const CARD = "#FFFFFF";
const BORDER = "#D8E0EC";
const TEXT = "#1A1A1A";
const MUTED = "#888888";
const STOCK_RED = "#D32F2F";
const STOCK_GREEN = "#00B050";
const CARD_SHADOW = "0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)";

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "-";
  if (dateStr.length === 8) {
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  }
  return dateStr;
}

function classifyLabel(classify: string | null | undefined) {
  if (!classify) return "普通股";
  const map: Record<string, string> = {
    stock: "普通股",
    etf: "ETF",
    fund: "基金",
    adr: "ADR",
    gdr: "GDR",
  };
  return map[classify.toLowerCase()] || classify;
}

function DonutChart({
  upDays,
  downDays,
  flatDays,
  totalDays,
}: {
  upDays: number;
  downDays: number;
  flatDays: number;
  totalDays: number;
}) {
  if (totalDays === 0) return null;
  const upPct = (upDays / totalDays) * 100;
  const downPct = (downDays / totalDays) * 100;
  const flatPct = (flatDays / totalDays) * 100;
  const r = 40;
  const cx = 60;
  const cy = 60;
  const circumference = 2 * Math.PI * r;
  const upLen = (upPct / 100) * circumference;
  const downLen = (downPct / 100) * circumference;
  const flatLen = (flatPct / 100) * circumference;
  const upOffset = 0;
  const downOffset = -upLen;
  const flatOffset = -(upLen + downLen);
  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      {/* 跌 */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={STOCK_GREEN}
        strokeWidth="18"
        strokeDasharray={`${downLen} ${circumference - downLen}`}
        strokeDashoffset={downOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* 平 */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="#BDBDBD"
        strokeWidth="18"
        strokeDasharray={`${flatLen} ${circumference - flatLen}`}
        strokeDashoffset={flatOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* 涨 */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={STOCK_RED}
        strokeWidth="18"
        strokeDasharray={`${upLen} ${circumference - upLen}`}
        strokeDashoffset={upOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* 中心文字 */}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize="13" fontWeight="700" fill={STOCK_RED}>
        {upPct.toFixed(1)}%
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="9" fill={MUTED}>
        涨幅率
      </text>
    </svg>
  );
}

export default function USStockDetail() {
  const params = useParams<{ tsCode: string }>();
  const [, setLocation] = useLocation();
  const tsCode = decodeURIComponent(params?.tsCode ?? "");

  const { data, isLoading } = trpc.usStockDetail.useQuery(
    { tsCode },
    { enabled: !!tsCode }
  );

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col" style={{ background: BG }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: BLUE }}>
          <button onClick={() => setLocation('/us-stock-tracker/stock-lifecycle')}
            className="w-7 h-7 flex items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.2)" }}>
            <ChevronLeft className="w-4 h-4 text-white" />
          </button>
          <p className="font-bold text-lg text-white">美股个股详情</p>
        </div>
        <div className="flex items-center justify-center flex-1 text-sm" style={{ color: MUTED }}>
          加载中...
        </div>
      </div>
    );
  }

  const d = data;
  const displayName = d?.name || d?.enname || tsCode;
  const isDelisted = !!d?.delistDate;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: BG }}>
      {/* 顶部导航 */}
      <div className="px-4 py-3 flex items-center gap-3 flex-shrink-0" style={{ background: BLUE, color: "#fff" }}>
        <button
          onClick={() => setLocation('/us-stock-tracker/stock-lifecycle')}
          className="w-7 h-7 flex items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-lg truncate">{displayName}</p>
          <p className="text-xs opacity-80">{tsCode}</p>
        </div>
        {isDelisted && (
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}>
            已退市
          </span>
        )}
        <button
          onClick={() => window.location.reload()}
          className="text-xs font-medium px-2.5 py-1 rounded-full"
          style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}
        >
          刷新
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-8">
        {/* 基本信息卡片 */}
        <div className="mx-4 mt-4 rounded-2xl p-4" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
          <div className="text-sm font-bold mb-3" style={{ color: BLUE }}>基本信息</div>
          <div className="grid grid-cols-2 gap-y-3 gap-x-4">
            <div>
              <div className="text-xs mb-0.5" style={{ color: MUTED }}>股票代码</div>
              <div className="text-sm font-medium" style={{ color: TEXT }}>{tsCode}</div>
            </div>
            <div>
              <div className="text-xs mb-0.5" style={{ color: MUTED }}>类型</div>
              <div className="text-sm font-medium" style={{ color: TEXT }}>{classifyLabel(d?.classify)}</div>
            </div>
            {d?.enname && (
              <div className="col-span-2">
                <div className="text-xs mb-0.5" style={{ color: MUTED }}>英文名称</div>
                <div className="text-sm font-medium" style={{ color: TEXT }}>{d.enname}</div>
              </div>
            )}
            <div>
              <div className="text-xs mb-0.5 flex items-center gap-1" style={{ color: MUTED }}>
                <Calendar className="w-3 h-3" />上市日期
              </div>
              <div className="text-sm font-medium" style={{ color: TEXT }}>{formatDate(d?.listDate)}</div>
            </div>
            {d?.delistDate && (
              <div>
                <div className="text-xs mb-0.5 flex items-center gap-1" style={{ color: MUTED }}>
                  <Calendar className="w-3 h-3" />退市日期
                </div>
                <div className="text-sm font-medium" style={{ color: TEXT }}>{formatDate(d.delistDate)}</div>
              </div>
            )}
          </div>
        </div>

        {/* 全生命周期统计卡片 */}
        <div className="mx-4 mt-4 rounded-2xl p-4" style={{ background: CARD, boxShadow: CARD_SHADOW }}>
          <div className="text-sm font-bold mb-3" style={{ color: BLUE }}>全生命周期涨跌统计</div>
          {d && d.totalDays > 0 ? (
            <div className="flex items-center gap-4">
              {/* 甜甜圈图 */}
              <div className="flex-shrink-0">
                <DonutChart
                  upDays={d.upDays}
                  downDays={d.downDays}
                  flatDays={d.flatDays}
                  totalDays={d.totalDays}
                />
              </div>
              {/* 数据列表 */}
              <div className="flex-1 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: STOCK_RED }} />
                    <span className="text-xs" style={{ color: MUTED }}>上涨天数</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: STOCK_RED }}>
                    {d.upDays.toLocaleString()} 天
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: STOCK_GREEN }} />
                    <span className="text-xs" style={{ color: MUTED }}>下跌天数</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: STOCK_GREEN }}>
                    {d.downDays.toLocaleString()} 天
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#BDBDBD" }} />
                    <span className="text-xs" style={{ color: MUTED }}>平盘天数</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: TEXT }}>
                    {d.flatDays.toLocaleString()} 天
                  </span>
                </div>
                <div className="pt-1 border-t" style={{ borderColor: BORDER }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium" style={{ color: MUTED }}>总交易天数</span>
                    <span className="text-sm font-bold" style={{ color: TEXT }}>
                      {d.totalDays.toLocaleString()} 天
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: MUTED }}>上涨概率</span>
                  <span className="text-base font-bold" style={{ color: Number(d.upRate) >= 50 ? STOCK_RED : STOCK_GREEN }}>
                    {Number(d.upRate).toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Globe className="w-8 h-8" style={{ color: MUTED }} />
              <div className="text-sm" style={{ color: MUTED }}>
                {d?.totalDays === 0 ? "暂无历史数据" : "加载中..."}
              </div>
            </div>
          )}
          {d?.updatedAt && (
            <div className="mt-3 text-xs text-right" style={{ color: MUTED }}>
              数据更新：{d.updatedAt}
              {(d as any).fromCache ? "（缓存）" : "（实时）"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
