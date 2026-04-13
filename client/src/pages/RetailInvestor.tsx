import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { ChevronLeft, Search, TrendingUp, TrendingDown, Minus, RefreshCw, Info } from "lucide-react";
import { trpc } from "@/lib/trpc";

const RED = "#D32F2F";
const BG = "#FAF3ED";
const CARD_BG = "#FFFFFF";
const BORDER = "#EDE0D4";
const TEXT = "#1A1A1A";
const TEXT_MUTED = "#888";

// 信号等级定义
const SIGNAL_LEVELS = [
  { min: 70, label: "强烈看涨", color: "#C62828", bg: "#FFEBEE", dot: "🔴" },
  { min: 55, label: "温和看涨", color: "#E53935", bg: "#FFF3F3", dot: "🟠" },
  { min: 45, label: "中性观望", color: "#F57C00", bg: "#FFF8E1", dot: "🟡" },
  { min: 30, label: "温和看跌", color: "#388E3C", bg: "#F1F8E9", dot: "🟢" },
  { min: 0,  label: "强烈看跌", color: "#1B5E20", bg: "#E8F5E9", dot: "🟩" },
];

function getSignal(score: number) {
  return SIGNAL_LEVELS.find(l => score >= l.min) ?? SIGNAL_LEVELS[SIGNAL_LEVELS.length - 1];
}

// 信号灯组件
function TrafficLight({ score }: { score: number }) {
  const sig = getSignal(score);
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold"
      style={{ background: sig.bg, color: sig.color }}
    >
      <span className="text-base">{sig.dot}</span>
      <span>{sig.label}</span>
    </div>
  );
}

// 评分条
function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const color = score >= 55 ? RED : score >= 45 ? "#F57C00" : "#388E3C";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-xs font-bold w-8 text-right" style={{ color }}>{score}</span>
    </div>
  );
}

// 单只股票卡片
function StockCard({ stock }: { stock: RetailStock }) {
  const [expanded, setExpanded] = useState(false);
  const sig = getSignal(stock.score);

  return (
    <div
      className="rounded-2xl overflow-hidden mb-3"
      style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}
    >
      {/* 主行 */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* 左：股票名称 + 代码 */}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base truncate" style={{ color: TEXT }}>{stock.name}</p>
          <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{stock.code}</p>
        </div>

        {/* 中：信号标签 */}
        <TrafficLight score={stock.score} />

        {/* 右：展开箭头 */}
        <div className="text-gray-300 text-xs">{expanded ? "▲" : "▼"}</div>
      </div>

      {/* 评分条 */}
      <div className="px-4 pb-3">
        <ScoreBar score={stock.score} />
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: BORDER }}>
          <p className="text-sm mt-3 leading-relaxed" style={{ color: TEXT }}>
            {stock.reason}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {stock.stats.map((s, i) => (
              <div key={i} className="rounded-xl p-2 text-center" style={{ background: BG }}>
                <p className="text-xs" style={{ color: TEXT_MUTED }}>{s.label}</p>
                <p className="text-sm font-bold mt-0.5" style={{ color: s.color ?? TEXT }}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface RetailStock {
  code: string;
  name: string;
  score: number;
  reason: string;
  stats: { label: string; value: string; color?: string }[];
}

// 主页面
export default function RetailInvestor() {
  const params = useParams<{ id: string }>();
  const ledgerId = params.id;
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"hot" | "rising" | "cooling">("hot");

  const { data, isLoading, refetch } = trpc.retailSignalList.useQuery({ tab });

  const filtered = (data?.stocks ?? []).filter(s =>
    !search || s.name.includes(search) || s.code.includes(search)
  );

  const tabList = [
    { key: "hot" as const, label: "今日热点" },
    { key: "rising" as const, label: "信号上升" },
    { key: "cooling" as const, label: "信号降温" },
  ];

  return (
    <div className="h-screen flex flex-col" style={{ background: BG }}>
      {/* 顶部导航 */}
      <div className="px-4 py-3 flex items-center gap-3 flex-shrink-0" style={{ background: RED }}>
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/ai-database`)}
          className="w-7 h-7 flex items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>
        <div className="flex-1">
          <p className="font-bold text-lg text-white">散户信号站</p>
          <p className="text-xs text-white/70">每日更新 · 仅供参考</p>
        </div>
        <button
          onClick={() => refetch()}
          className="w-7 h-7 flex items-center justify-center rounded-full"
          style={{ background: "rgba(255,255,255,0.2)" }}
        >
          <RefreshCw className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* 搜索框 */}
      <div className="px-4 py-3 flex-shrink-0" style={{ background: RED }}>
        <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/20">
          <Search className="w-4 h-4 text-white/70" />
          <input
            className="flex-1 bg-transparent text-white placeholder-white/60 text-sm outline-none"
            placeholder="搜索股票名称或代码"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* 信号说明横幅 */}
      <div className="mx-4 mt-3 mb-1 rounded-xl px-3 py-2 flex items-start gap-2 flex-shrink-0"
        style={{ background: "#FFF8E1", border: "1px solid #FFE082" }}>
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#F57C00" }} />
        <p className="text-xs leading-relaxed" style={{ color: "#795548" }}>
          信号基于历史涨天率、量能变化、K线强度综合计算，<strong>不构成投资建议</strong>，市场有风险，入市需谨慎。
        </p>
      </div>

      {/* Tab 切换 */}
      <div className="px-4 mt-2 flex gap-2 flex-shrink-0">
        {tabList.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: tab === t.key ? RED : CARD_BG,
              color: tab === t.key ? "#fff" : TEXT_MUTED,
              border: `1px solid ${tab === t.key ? RED : BORDER}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <RefreshCw className="w-8 h-8 animate-spin" style={{ color: RED }} />
            <p className="text-sm" style={{ color: TEXT_MUTED }}>正在计算信号...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p className="text-base font-bold" style={{ color: TEXT_MUTED }}>暂无符合条件的股票</p>
            <p className="text-sm" style={{ color: TEXT_MUTED }}>换个 Tab 试试</p>
          </div>
        ) : (
          <>
            <p className="text-xs mb-3" style={{ color: TEXT_MUTED }}>
              共 {filtered.length} 只 · 点击卡片查看详情
            </p>
            {filtered.map(s => (
              <StockCard key={s.code} stock={s} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
