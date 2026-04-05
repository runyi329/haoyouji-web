/**
 * CryptoPrediction.tsx
 * 布局：
 *   顶部导航栏（返回 + 币种名）
 *   K 线图区域（固定，不随 Tab 切换）
 *   三 Tab 切换：无损合约 / 无损现货 / 行情评估（含竞猜）
 */
import React, { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ChevronLeft, RefreshCw, TrendingUp, TrendingDown, Bitcoin,
  AlertCircle, WifiOff, CheckCircle2, Circle, Loader2, Users,
} from "lucide-react";
import { toast } from "sonner";

// ─── 币种配置 ──────────────────────────────────────────────────
// 委买价格档位（低于市价，抄底用）
const BUY_PRICE_OPTIONS: Record<string, number[]> = {
  BTC: [70000, 69000, 68000, 67000, 66000, 65000, 64000, 63000, 62000, 61000, 60000],
  ETH: [2100, 2050, 2000, 1950, 1900, 1850, 1800, 1750, 1700, 1650, 1600, 1550, 1500],
  SOL: [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50],
};

// 委卖价格档位（高于市价，止盈用）
const SELL_PRICE_OPTIONS: Record<string, number[]> = {
  BTC: [100000, 99000, 98000, 97000, 96000, 95000, 94000, 93000, 92000, 91000, 90000, 89000, 88000, 87000, 86000, 85000, 84000, 83000, 82000, 81000, 80000],
  ETH: [5000, 4900, 4800, 4700, 4600, 4500, 4400, 4300, 4200, 4100, 4000, 3900, 3800, 3700, 3600, 3500, 3400, 3300, 3200, 3100, 3000, 2900, 2800, 2700, 2600, 2500],
  SOL: [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50],
};

const COIN_CONFIG: Record<string, {
  symbol: string; name: string; fullName: string; color: string; imgUrl: string;
}> = {
  BTC: {
    symbol: "BTCUSDT", name: "BTC", fullName: "比特币", color: "#F7931A",
    imgUrl: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/btc-official.png",
  },
  ETH: {
    symbol: "ETHUSDT", name: "ETH", fullName: "以太坊", color: "#627EEA",
    imgUrl: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/eth-official.png",
  },
  SOL: {
    symbol: "SOLUSDT", name: "SOL", fullName: "索拉纳", color: "#9945FF",
    imgUrl: "https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/sol-official.png",
  },
};

const INTERVALS = [
  { label: "15m", value: "15m" },
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
];

interface KlineBar {
  openTime: number; open: number; high: number; low: number; close: number; volume: number;
}

// ─── Canvas K 线图 ─────────────────────────────────────────────
function KlineChart({ bars, coinColor }: { bars: KlineBar[]; coinColor: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bars.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const prices = bars.flatMap((b) => [b.high, b.low]);
    const minP = Math.min(...prices), maxP = Math.max(...prices);
    const range = maxP - minP || 1;
    const padL = 4, padR = 4, padT = 8, padB = 8;
    const chartW = W - padL - padR, chartH = H - padT - padB;
    const barW = Math.max(1, chartW / bars.length);
    const gap = Math.max(0.5, barW * 0.15);
    const bodyW = Math.max(1, barW - gap * 2);
    const toY = (p: number) => padT + chartH - ((p - minP) / range) * chartH;
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 3; i++) {
      const y = padT + (chartH / 4) * i;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    }
    bars.forEach((bar, i) => {
      const x = padL + i * barW;
      const isUp = bar.close >= bar.open;
      const color = isUp ? "#26a69a" : "#ef5350";
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + barW / 2, toY(bar.high)); ctx.lineTo(x + barW / 2, toY(bar.low)); ctx.stroke();
      ctx.fillStyle = color;
      const bodyTop = Math.min(toY(bar.open), toY(bar.close));
      const bodyH = Math.max(1, Math.abs(toY(bar.open) - toY(bar.close)));
      ctx.fillRect(x + gap, bodyTop, bodyW, bodyH);
    });
    const last = bars[bars.length - 1];
    const lastY = toY(last.close);
    ctx.strokeStyle = last.close >= last.open ? "#26a69a" : "#ef5350";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(padL, lastY); ctx.lineTo(W - padR, lastY); ctx.stroke();
    ctx.setLineDash([]);
  }, [bars, coinColor]);
  return <canvas ref={canvasRef} width={360} height={160} className="w-full" style={{ height: 160 }} />;
}

// ─── 工具函数 ──────────────────────────────────────────────────
// 整数型币种（单价较低，通常以整数计量）
const INTEGER_COINS_FIN = new Set(['SUI', 'ONDO', 'LOD', 'ENA', 'ARKM', 'AAVE']);

function formatCoinQty(qty: number, coin: string): string {
  if (INTEGER_COINS_FIN.has(coin)) return Math.round(qty).toLocaleString('en-US');
  if (coin === 'BTC') return parseFloat(qty.toFixed(6)).toString();
  return parseFloat(qty.toFixed(4)).toString();
}

function formatPrice(p: string | number | undefined) {
  if (p === undefined || p === null) return "--";
  const n = typeof p === "string" ? parseFloat(p) : p;
  if (isNaN(n)) return "--";
  if (n >= 10000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 100) return n.toFixed(2);
  return n.toFixed(4);
}
function formatVol(v: string | undefined) {
  if (!v) return "--";
  const n = parseFloat(v);
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}
function fmtProb(price: string): string {
  const num = parseFloat(price);
  if (isNaN(num)) return "0%";
  return `${(num * 100).toFixed(1)}%`;
}
function fmtEndDate(dateStr: string | null): string {
  if (!dateStr) return "长期";
  const d = new Date(dateStr);
  const diff = d.getTime() - Date.now();
  if (diff < 0) return "已截止";
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "今天截止";
  if (days < 30) return `${days}天后截止`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}个月后截止`;
  return `${Math.floor(months / 12)}年后截止`;
}

// ─── 竞猜骨架屏 ───────────────────────────────────────────────
function EventCardSkeleton() {
  return (
    <div className="bg-[#1C2127] rounded-2xl overflow-hidden mb-3 p-4">
      <div className="h-4 bg-[#2A2E39] rounded-full w-full animate-pulse mb-2" />
      <div className="h-4 bg-[#2A2E39] rounded-full w-3/4 animate-pulse mb-3" />
      <div className="h-12 bg-[#2A2E39] rounded-xl animate-pulse mb-2" />
      <div className="h-12 bg-[#2A2E39] rounded-xl animate-pulse" />
    </div>
  );
}

// ─── 竞猜卡片 ─────────────────────────────────────────────────
interface PredictionEvent {
  id: number; question: string; outcomes: string[]; outcomePrices: string[];
  volume: string | null; endDate: string | null; imageUrl: string | null;
  myPrediction: { selectedOutcome: string; selectedIndex: number } | null;
}

function EventCard({ event, ledgerId, onPredicted }: {
  event: PredictionEvent; ledgerId: number; onPredicted: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(
    event.myPrediction ? event.myPrediction.selectedIndex : null
  );
  const [expanded, setExpanded] = useState(false);
  const submitMutation = trpc.prediction.submitPrediction.useMutation({
    onSuccess: () => { toast.success("预测已提交", { description: "你的观点已记录" }); onPredicted(); },
    onError: (e) => toast.error("提交失败", { description: e.message }),
  });
  const { data: statsData } = trpc.prediction.getEventStats.useQuery(
    { ledgerId, eventId: event.id }, { enabled: expanded }
  );
  function handleSelect(idx: number) {
    if (submitMutation.isPending) return;
    setSelected(idx);
    submitMutation.mutate({ ledgerId, eventId: event.id, selectedOutcome: event.outcomes[idx], selectedIndex: idx });
  }
  return (
    <div className="bg-[#1C2127] rounded-2xl overflow-hidden mb-3 relative">
      <div className="px-4 pt-4 pb-3">
        <p className="text-sm font-medium text-white leading-relaxed">{event.question}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          {event.volume && (
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />{formatVol(event.volume)} 交易量
            </span>
          )}
          <span>{fmtEndDate(event.endDate)}</span>
        </div>
      </div>
      <div className="px-4 pb-3 space-y-2">
        {event.outcomes.map((outcome, idx) => {
          const prob = event.outcomePrices[idx];
          const probNum = parseFloat(prob || "0");
          const isSelected = selected === idx;
          const isYes = idx === 0;
          return (
            <button key={idx} onClick={() => handleSelect(idx)} disabled={submitMutation.isPending}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                isSelected
                  ? isYes ? "bg-[#26a69a]/20 border-[#26a69a]" : "bg-[#ef5350]/20 border-[#ef5350]"
                  : "bg-[#131722] border-[#2A2E39]"
              }`}>
              <div className="flex items-center gap-2">
                {submitMutation.isPending && isSelected
                  ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  : isSelected
                    ? <CheckCircle2 className={`w-4 h-4 ${isYes ? "text-[#26a69a]" : "text-[#ef5350]"}`} />
                    : <Circle className="w-4 h-4 text-gray-600" />}
                <span className={`text-sm font-medium ${isSelected ? (isYes ? "text-[#26a69a]" : "text-[#ef5350]") : "text-gray-300"}`}>
                  {outcome === "Yes" ? "会" : outcome === "No" ? "不会" : outcome}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 rounded-full w-16 bg-[#2A2E39] overflow-hidden">
                  <div className={`h-full rounded-full ${isYes ? "bg-[#26a69a]" : "bg-[#ef5350]"}`}
                    style={{ width: `${Math.round(probNum * 100)}%` }} />
                </div>
                <span className={`text-xs font-semibold w-10 text-right ${isYes ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
                  {fmtProb(prob)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {selected !== null && (
        <div className="border-t border-[#2A2E39]">
          <button onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-gray-500">
            <Users className="w-3.5 h-3.5" />
            {expanded ? "收起成员预测" : "查看成员预测分布"}
          </button>
          {expanded && statsData && (
            <div className="px-4 pb-3">
              <div className="text-xs text-gray-500 mb-2">共 {statsData.total} 人预测</div>
              {event.outcomes.map((outcome, idx) => {
                const displayName = outcome === "Yes" ? "会" : outcome === "No" ? "不会" : outcome;
                const count = statsData.distribution[outcome] || 0;
                const pct = statsData.total > 0 ? Math.round((count / statsData.total) * 100) : 0;
                return (
                  <div key={idx} className="mb-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">{displayName}</span>
                      <span className="text-gray-500">{count}人 ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-[#2A2E39] rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${idx === 0 ? "bg-[#D32F2F]" : "bg-gray-500"}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {submitMutation.isPending && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-2xl">
          <Loader2 className="w-5 h-5 animate-spin text-white" />
        </div>
      )}
    </div>
  );
}

// ─── 收益权档位详情组件 ──────────────────────────────────────
// 收益权计算逻辑：
// 基准(第0档) = 100 × 0.75 × 0.7 = 52.5 → 对客户显示 100%
// 第N档(N≥2) = 100 ÷ N × 0.7，再除以52.5得到对客户百分比
const TIER_LABELS = [
  { tier: 1, drop: '-10%', ratio: '1/2', pct: '66.7%' },
  { tier: 2, drop: '-20%', ratio: '1/3', pct: '44.4%' },
  { tier: 3, drop: '-30%', ratio: '1/4', pct: '33.3%' },
  { tier: 4, drop: '-40%', ratio: '1/5', pct: '26.7%' },
  { tier: 5, drop: '-50%', ratio: '1/6', pct: '22.2%' },
  { tier: 6, drop: '-60%', ratio: '1/7', pct: '19.0%' },
  { tier: 7, drop: '-70%', ratio: '1/8', pct: '16.7%' },
  { tier: 8, drop: '-80%', ratio: '1/9', pct: '14.8%' },
  { tier: 9, drop: '-90%', ratio: '1/10', pct: '13.3%' },
];

function OrderDetail({ order, timeStr, ledgerId, viewAsUserId }: {
  order: any; timeStr: string; ledgerId: number; viewAsUserId?: number;
}) {
  const { data: tierData, isLoading: tierLoading } = trpc.ledger.afGetTierData.useQuery(
    { orderId: order.id, ledgerId, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: order.side === 'buy' } // 委托中和已成交的买单都查询
  );
  // 实时价格（用于计算当前市值）
  const coinSymbol = order.coin === 'BTC' ? 'BTCUSDT' : order.coin === 'ETH' ? 'ETHUSDT' : order.coin === 'SOL' ? 'SOLUSDT' : order.coin + 'USDT';
  const { data: liveTickerData } = trpc.ledger.getBinanceTicker.useQuery(
    { symbol: coinSymbol },
    { enabled: order.side === 'buy', staleTime: 30000, refetchInterval: 60000 }
  );
  const livePrice = liveTickerData ? parseFloat((liveTickerData as any).lastPrice || '0') : 0;
  const cancelMutation = trpc.ledger.afCancelOrder.useMutation({
    onSuccess: () => { toast.success('委托已撒销'); },
    onError: (e) => toast.error('撒单失败', { description: e.message }),
  });

  // 计算当前所在档位
  const triggeredTiers = new Set((tierData?.triggers || []).map((t: any) => t.tier));
  const maxTriggered = triggeredTiers.size > 0 ? Math.max(...Array.from(triggeredTiers)) : 0;
  const currentTier = maxTriggered; // 0 = 未触发任何档

  const isContract = !order.orderType || order.orderType === '无损合约';
  const isCompleted = order.status === 'completed';

  // 生成订单编号
  const orderDate = new Date(order.createdAt);
  const yy = String(orderDate.getFullYear()).slice(2);
  const mm = String(orderDate.getMonth() + 1).padStart(2, '0');
  const dd = String(orderDate.getDate()).padStart(2, '0');
  const orderNo = `AF${yy}${mm}${dd}${String(order.id).padStart(6, '0')}`;

  return (
    <div className="mt-2 rounded-xl p-3 space-y-2 text-[13px]" style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8FF', boxShadow: '0 2px 8px rgba(26,86,219,0.06)' }}>
      {/* 基本信息 - 统一风格：左侧标签灰色，右侧数値深色，强调数据用品牌色 */}
      <div className="space-y-2">

        {/* 币种：带买/卖标签 */}
        <div className="flex justify-between items-center">
          <span className="text-[#9CA3AF]">币种</span>
          <span className="text-[#1E293B] font-medium">
            <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold mr-1.5"
              style={{ backgroundColor: order.side === 'buy' ? '#EFF6FF' : '#FEF2F2', color: order.side === 'buy' ? '#1A56DB' : '#EF4444' }}>
              {order.side === 'buy' ? '买' : '卖'}
            </span>
            {order.coin}
          </span>
        </div>

        {/* 赠送订单：类型 + 来源 */}
        {order.isGift && (() => {
          const multiplier = (order as any).giftMultiplier || '1.5';
          const is10 = multiplier === '1.0';
          return (
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">订单类型</span>
              <span className="text-[#1E293B] font-medium">
                {order.sourceUsername && (
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold mr-1.5"
                    style={{ backgroundColor: is10 ? '#FFFBEB' : '#EFF6FF', color: is10 ? '#D97706' : '#1A56DB' }}>
                    {order.sourceUsername}
                  </span>
                )}
                {is10 ? '间接推荐奖励' : '推荐人奖励'}
              </span>
            </div>
          );
        })()}

        {/* 价格信息 */}
        {order.isGift ? (
          <>
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">成交价格</span>
              <span className="text-[#1E293B]">{parseFloat(order.limitPrice).toLocaleString()} USDT</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">实际投入</span>
              <span className="text-[#1E293B]">{(order as any).sourceAmount ? parseFloat((order as any).sourceAmount).toFixed(2) : '--'} USDT</span>
            </div>
            {/* 赠送订单的成交价値（赠送市値）移到持仓数量上方 */}
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">赠送市値</span>
              <span className="font-semibold" style={{ color: (order as any).giftMultiplier === '1.0' ? '#D97706' : '#EF4444' }}>
                {parseFloat(order.amount).toFixed(2)} USDT
                <span className="ml-1 text-[11px] font-normal opacity-70">({(order as any).giftMultiplier || '1.5'}倍)</span>
              </span>
            </div>
            {/* 持仓数量：计算过程小灰字 + 等号和结果同行显示 */}
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">持仓数量</span>
              <span>
                <span className="text-[11px] text-[#9CA3AF]">{parseFloat(order.amount).toFixed(2)} ÷ {parseFloat(order.limitPrice).toLocaleString()} = </span>
                <span className="text-[#1E293B] font-medium">{parseFloat(order.quantity).toFixed(8).replace(/\.?0+$/, '')} {order.coin}</span>
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">{(order as any).originalLimitPrice && (order as any).originalLimitPrice !== order.limitPrice ? '委托价格' : '成交价格'}</span>
              <span className="text-[#1E293B]">{parseFloat((order as any).originalLimitPrice || order.limitPrice).toLocaleString()} USDT</span>
            </div>
            {(order as any).originalLimitPrice && (order as any).originalLimitPrice !== order.limitPrice && (
              <div className="flex justify-between items-center">
                <span className="text-[#9CA3AF]">实际成交价</span>
                <span className="font-semibold text-[#1A56DB]">{parseFloat(order.limitPrice).toLocaleString()} USDT</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">实际投入</span>
              <span className="text-[#1E293B]">{parseFloat(order.amount).toFixed(2)} USDT</span>
            </div>
            {/* 成交价値：移到持仓数量上方 */}
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">成交价値</span>
              <span className="font-semibold text-[#1A56DB]">
                {(parseFloat(order.amount) * 5.25).toFixed(2)} USDT
                <span className="ml-1 text-[11px] font-normal opacity-60">(×5.25)</span>
              </span>
            </div>
            {/* 持仓数量：计算过程小灰字 + 等号和结果同行显示 */}
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">持仓数量</span>
              <span>
                <span className="text-[11px] text-[#9CA3AF]">{(parseFloat(order.amount) * 5.25).toFixed(2)} ÷ {parseFloat(order.limitPrice).toLocaleString()} = </span>
                <span className="text-[#1E293B] font-medium">{parseFloat(order.quantity).toFixed(8).replace(/\.?0+$/, '')} {order.coin}</span>
              </span>
            </div>
          </>
        )}

        {/* 管理费（仅已成交订单显示） */}
        {order.side === 'buy' && isContract && (() => {
          // 成交价値：普通订单 = amount×5.25，赠送订单 = amount（赠送市値）
          const amount = parseFloat(order.amount);
          const tradeValue = order.isGift ? amount : amount * 5.25;
          const dailyFee = tradeValue / 0.75 * 0.12 / 365;
          // 持仓天数：已卖出锁定到卖出成交日，否则实时到今天
          const startDate = new Date(order.createdAt);
          const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
          const endDate = order.sellStatus === 'sold' && order.sellConfirmedAt ? new Date(order.sellConfirmedAt) : new Date();
          const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          endDay.setHours(0,0,0,0);
          const holdDays = Math.max(1, Math.floor((endDay.getTime() - startDay.getTime()) / (1000*60*60*24)) + 1);
          const totalFee = dailyFee * holdDays;
          const isSold = order.sellStatus === 'sold';
          return (
            <div className="flex justify-between items-center">
              <span className="text-[#9CA3AF]">管理费</span>
              <span className="text-[#1E293B] font-medium">
                {dailyFee.toFixed(4)} <span className="text-[11px] text-[#9CA3AF]">USDT/天</span>
                <span className="text-[11px] text-[#9CA3AF] ml-1.5">· {isSold ? '已结清' : '已累计'} {totalFee.toFixed(4)} USDT（{holdDays}天）</span>
              </span>
            </div>
          );
        })()}

        {/* 类型 + 状态 */}
        <div className="flex justify-between items-center">
          <span className="text-[#9CA3AF]">类型 / 状态</span>
          <span className="text-[#1E293B]">
            {order.orderType === '无损合约' ? '谷底增筹' : (order.orderType || '谷底增筹')}
            <span className="mx-1.5 text-[#CBD5E1]">·</span>
            <span style={{ color: 
              order.sellStatus === 'sold' ? '#6B7280' :
              order.sellStatus === 'selling' ? '#EF4444' :
              order.status === 'completed' ? '#0EA56A' : 
              order.status === 'cancelled' ? '#94A3B8' : '#F59E0B' 
            }}>
              {order.sellStatus === 'sold' ? '已卖出' :
               order.sellStatus === 'selling' ? '委卖中' :
               order.status === 'completed' ? '持仓中' : 
               order.status === 'cancelled' ? '已撒单' : '委买中'}
            </span>
          </span>
        </div>

        {/* 卖出信息（委卖中或已卖出时显示） */}
        {(order.sellStatus === 'selling' || order.sellStatus === 'sold') && (
          <div className="flex justify-between items-center">
            <span className="text-[#9CA3AF]">委卖价格</span>
            <span className="text-[#EF4444] font-medium">{parseFloat(order.sellPrice).toLocaleString()} USDT</span>
          </div>
        )}

        {/* 净利润和回报率（已卖出时显示） */}
        {order.sellStatus === 'sold' && order.sellPrice && order.limitPrice && (() => {
          const buyPrice = parseFloat(order.limitPrice);
          const sellPrice = parseFloat(order.sellPrice);
          const quantity = parseFloat(order.quantity);
          const actualInvestment = parseFloat(order.amount);
          const profit = (sellPrice - buyPrice) * quantity;
          const profitRatio = actualInvestment > 0 ? (profit / actualInvestment) * 100 : 0;
          const priceGrowth = buyPrice > 0 ? ((sellPrice - buyPrice) / buyPrice) * 100 : 0;
          const isPositive = profit >= 0;
          return (
            <>
              <div className="flex justify-between items-center">
                <span className="text-[#9CA3AF]">净利润</span>
                <span className={`font-bold ${isPositive ? 'text-[#0EA56A]' : 'text-[#EF4444]'}`}>{isPositive ? '+' : ''}{profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#9CA3AF]">利润比</span>
                <span className={`font-bold ${isPositive ? 'text-[#0EA56A]' : 'text-[#EF4444]'}`}>{isPositive ? '+' : ''}{profitRatio.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#9CA3AF]">涨幅</span>
                <span className={`font-bold ${priceGrowth >= 0 ? 'text-[#0EA56A]' : 'text-[#EF4444]'}`}>{priceGrowth >= 0 ? '+' : ''}{priceGrowth.toFixed(2)}%</span>
              </div>
            </>
          );
        })()}

        {/* 买入时间 */}
        <div className="flex justify-between items-center">
          <span className="text-[#9CA3AF]">买入时间</span>
          <span className="text-[#64748B]">{timeStr}</span>
        </div>
        {/* 卖出时间（已卖出时显示） */}
        {order.sellStatus === 'sold' && order.sellConfirmedAt && (
          <div className="flex justify-between items-center">
            <span className="text-[#9CA3AF]">卖出时间</span>
            <span className="text-[#64748B]">{(() => { const dt = new Date(order.sellConfirmedAt); const y = dt.getFullYear(); const mo = String(dt.getMonth()+1).padStart(2,'0'); const d = String(dt.getDate()).padStart(2,'0'); const h = String(dt.getHours()).padStart(2,'0'); const mi = String(dt.getMinutes()).padStart(2,'0'); const s = String(dt.getSeconds()).padStart(2,'0'); return `${y}-${mo}-${d} ${h}:${mi}:${s}`; })()}</span>
          </div>
        )}
        {/* 订单编号 */}
        <div className="flex justify-between items-center">
          <span className="text-[#9CA3AF]">订单编号</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-[#64748B] tracking-wide">{orderNo}</span>
            {(order.status === 'pending' || order.sellStatus === 'selling') && (
              <button
                onClick={() => { 
                  const msg = order.sellStatus === 'selling' ? '确认撒销委托卖出？' : '确认撒销该委托单？';
                  if (window.confirm(msg)) { cancelMutation.mutate({ ledgerId, orderId: order.id }); } 
                }}
                disabled={cancelMutation.isPending}
                className="text-xs font-medium px-2 py-0.5 rounded border"
                style={{ color: '#EF4444', borderColor: '#FECACA', backgroundColor: '#FEF2F2' }}>
                {cancelMutation.isPending ? '撒销中...' : order.sellStatus === 'selling' ? '撒卖' : '撒单'}
              </button>
            )}
          </div>
        </div>

      </div>

      {/* 收益权档位表（无损合约买单均显示，包括委托中） */}
      {isContract && order.side === 'buy' && (
        <div className="pt-2" style={{ borderTop: '1px solid #E0E8FF' }}>
          {/* 扫描状态栏 */}
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold" style={{ color: '#1A56DB' }}>收益权扫描</span>
            {order.sellStatus === 'sold' ? (
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: '#6B7280' }} />
                <span style={{ color: '#6B7280' }}>已结束</span>
              </div>
            ) : tierData?.scanStatus ? (
              <div className="flex items-center gap-1">
                {tierData.scanStatus.scanning ? (
                  <><Loader2 className="w-2.5 h-2.5 animate-spin" style={{ color: '#F59E0B' }} />
                  <span style={{ color: '#F59E0B' }}>扫描中...</span></>
                ) : (
                  <><span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ backgroundColor: '#0EA56A' }} />
                  <span style={{ color: '#0EA56A' }}>实时扫描中</span></>
                )}
              </div>
            ) : tierLoading ? (
              <span style={{ color: '#9CA3AF' }}>加载中...</span>
            ) : (
              <span style={{ color: '#9CA3AF' }}>等待扫描</span>
            )}
          </div>

          {/* 扫描信息 */}
          {(tierData?.scanStatus?.lastScanAt || (tierData?.scanCount ?? 0) > 0) ? (
            <div className="rounded-lg px-3 py-2 mb-2 text-[12px]" style={{ backgroundColor: '#F5F7FF' }}>

              {/* 用 grid 布局：标签列 | 价格列 | 时间列 */}
              <div className="grid gap-y-1.5" style={{ gridTemplateColumns: '3.5rem 1fr auto' }}>

                {/* 累计扫描行 */}
                <span className="text-[#9CA3AF]">累计扫描</span>
                <span className="font-semibold text-[#1A56DB]">{tierData?.scanCount ?? 0} 次</span>
                <span className="text-[#94A3B8] text-right">每4小时一次</span>

                {/* 上次扫描行 */}
                {(tierData?.latestLowPrice || tierData?.scanStatus?.lastScanAt) && (
                  <>
                    <span className="text-[#9CA3AF]">上次扫描</span>
                    <span className="font-semibold text-[#EF4444]">
                      {tierData?.latestLowPrice ? `${parseFloat(tierData.latestLowPrice).toLocaleString()} USDT` : '--'}
                    </span>
                    <span className="text-[#94A3B8] text-right">
                      {tierData?.scanStatus?.lastScanAt
                        ? new Date(tierData.scanStatus.lastScanAt).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
                        : '--'}
                    </span>
                  </>
                )}

                {/* 历史最低行 */}
                {tierData?.allTimeLowPrice && (
                  <>
                    <span className="text-[#9CA3AF]">历史最低</span>
                    <span className="font-semibold text-[#EF4444]">
                      {parseFloat(tierData.allTimeLowPrice).toLocaleString()} USDT
                    </span>
                    <span className="text-[#94A3B8] text-right">
                      {tierData?.allTimeLowAt
                        ? new Date(tierData.allTimeLowAt).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })
                        : '--'}
                    </span>
                  </>
                )}

              </div>
            </div>
          ) : !tierLoading && (
            <div className="rounded-lg px-3 py-2 mb-2 text-[12px]" style={{ backgroundColor: '#F5F7FF' }}>
              <div className="flex justify-between items-center">
                <span className="text-[#9CA3AF] w-14 shrink-0">累计扫描</span>
                <span>
                  <span className="text-[#CBD5E1]">0 次</span>
                  <span className="text-[#CBD5E1] mx-1.5">·</span>
                  <span className="text-[#94A3B8]">每4小时一次</span>
                </span>
              </div>
            </div>
          )}

          {/* 收益权档位表 */}
          <div className="mb-1.5" style={{ color: '#6B7A9A' }}>收益权档位表</div>
          {/* 表头 */}
          <div className="grid grid-cols-4 text-xs mb-1 px-1" style={{ color: '#9CA3AF' }}>
            <span>跌幅档</span>
            <span className="text-center">收益权</span>
            <span className="text-center">触发时间</span>
            <span className="text-right">触发价格</span>
          </div>

          {/* 第0档：未触发，收益权100% */}
          <div className="grid grid-cols-4 items-center py-1 px-1 rounded-lg mb-0.5"
            style={currentTier === 0
              ? { backgroundColor: 'rgba(14,165,106,0.1)', border: '1px solid rgba(14,165,106,0.4)' }
              : { backgroundColor: '#F8FAFF' }}>
            <span style={{ color: currentTier === 0 ? '#0EA56A' : '#9CA3AF', fontWeight: currentTier === 0 ? 600 : 400 }}>基准</span>
            <span className="text-center font-semibold" style={{ color: currentTier === 0 ? '#0EA56A' : '#9CA3AF' }}>100%</span>
            <span className="text-center" style={{ color: '#C0C8D8' }}>--</span>
            <span className="text-right" style={{ color: '#C0C8D8' }}>{parseFloat(order.limitPrice).toLocaleString()}</span>
          </div>

          {/* 9档 */}
          {TIER_LABELS.map(({ tier, drop, ratio, pct }) => {
            const trigger = (tierData?.triggers || []).find((t: any) => t.tier === tier);
            const isCurrentTier = currentTier === tier;
            const isTriggered = triggeredTiers.has(tier);
            return (
              <div key={tier} className="grid grid-cols-4 items-center py-1 px-1 rounded-lg mb-0.5"
                style={isCurrentTier
                  ? { backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }
                  : isTriggered
                  ? { backgroundColor: '#EEF2FF' }
                  : { backgroundColor: '#F8FAFF' }}>
                <span style={{ color: isCurrentTier ? '#EF4444' : isTriggered ? '#6B7A9A' : '#C0C8D8', fontWeight: isCurrentTier ? 600 : 400 }}>{drop}</span>
                <span className="text-center font-semibold" style={{ color: isCurrentTier ? '#EF4444' : isTriggered ? '#1A56DB' : '#C0C8D8' }}>{pct}</span>
                <span className="text-center text-xs" style={{ color: isTriggered ? '#9CA3AF' : '#D0DBFF' }}>
                  {trigger ? new Date(trigger.triggeredAt).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '--'}
                </span>
                <span className="text-right" style={{ color: isTriggered ? '#EF4444' : '#C0C8D8' }}>
                  {trigger
                    ? parseFloat(trigger.triggerPrice).toLocaleString()
                    : parseFloat(order.limitPrice) > 0
                      ? (parseFloat(order.limitPrice) * (1 - tier * 0.1)).toFixed(2)
                      : '--'
                  }
                </span>
              </div>
            );
          })}
          {/* 当前收益权摘要 + 市值 + 管理费 */}
          <div className="mt-2 rounded-lg p-2" style={{ backgroundColor: '#EEF2FF' }}>
            {/* 当前收益权 */}
            <div className="flex justify-between items-center">
              <span style={{ color: '#6B7A9A' }}>当前收益权</span>
              <span className="font-bold text-sm" style={{ color: currentTier === 0 ? '#0EA56A' : '#EF4444' }}>
                {currentTier === 0 ? '100%' : TIER_LABELS[currentTier - 1]?.pct || '--'}
                <span className="text-xs ml-1" style={{ color: '#9CA3AF' }}>
                  ({currentTier === 0 ? '1/1' : TIER_LABELS[currentTier - 1]?.ratio || '--'})
                </span>
              </span>
            </div>
            {/* 当前持仓数量 + 市值 + 管理费 */}
            {(() => {
              const qty = parseFloat(order.quantity);
              const pctStr = currentTier === 0 ? '100%' : (TIER_LABELS[currentTier - 1]?.pct || '100%');
              const pct = parseFloat(pctStr) / 100;
              const remaining = qty * pct;
              const displayRemaining = remaining % 1 === 0 ? remaining.toString() : remaining.toFixed(8).replace(/[.]?0+$/, '');
              const displayQty = qty % 1 === 0 ? qty.toString() : qty.toFixed(8).replace(/[.]?0+$/, '');
              const marketValue = livePrice > 0 ? remaining * livePrice : null;
              const amount = parseFloat(order.amount);
              const tradeValue = order.isGift ? amount : amount * 5.25;
              const dailyFee = tradeValue / 0.75 * 0.12 / 365;
              const startDate = new Date(order.createdAt);
              const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
              const endDate = order.sellStatus === 'sold' && order.sellConfirmedAt ? new Date(order.sellConfirmedAt) : new Date();
              const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
              endDay.setHours(0,0,0,0);
              const holdDays = Math.max(1, Math.floor((endDay.getTime() - startDay.getTime()) / (1000*60*60*24)) + 1);
              const totalFee = dailyFee * holdDays;
              return (
                <>
                  <div className="flex justify-between items-center mt-1.5">
                    <span className="text-xs" style={{ color: '#6B7A9A' }}>当前持仓数量</span>
                    <span className="text-xs" style={{ color: '#1A2340' }}>
                      <span style={{ color: '#9CA3AF' }}>{displayQty} × {pctStr} = </span>
                      <span className="font-semibold">{displayRemaining} {order.coin}</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs" style={{ color: '#6B7A9A' }}>当前市值</span>
                    <span className="text-xs" style={{ color: '#1A2340' }}>
                      {livePrice > 0 && marketValue !== null ? (
                        <>
                          <span style={{ color: '#9CA3AF' }}>{displayRemaining} × {livePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} = </span>
                          <span className="font-semibold" style={{ color: '#1A56DB' }}>{marketValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span>
                        </>
                      ) : <span style={{ color: '#9CA3AF' }}>加载中...</span>}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-xs" style={{ color: '#6B7A9A' }}>当前需付管理费</span>
                    <span className="text-xs font-semibold" style={{ color: '#EF4444' }}>
                      -{dailyFee.toFixed(4)} <span className="font-normal" style={{ color: '#9CA3AF' }}>USDT/天</span>
                      <span className="font-normal ml-1" style={{ color: '#9CA3AF' }}>· 已累计 -{totalFee.toFixed(4)} USDT（{holdDays}天）</span>
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────

// 融资订单备注内联编辑子组件
function NoteRow({ orderId, ledgerId, initialNote, onSaved }: {
  orderId: number;
  ledgerId: number;
  initialNote: string;
  onSaved: (note: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const updateNote = trpc.ledger.financeUpdatePublicNote.useMutation();

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateNote.mutateAsync({ id: orderId, ledgerId, publicNote: value });
      onSaved(value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 text-xs" style={{ borderTop: '1px solid #E8EFFF' }}>
      <span className="shrink-0 mr-3" style={{ color: '#9CA3AF' }}>备注</span>
      <div className="flex-1 flex items-center gap-1 justify-end min-w-0">
        {editing ? (
          <>
            <input
              autoFocus
              className="flex-1 text-xs border rounded px-1.5 py-0.5 outline-none"
              style={{ borderColor: '#C7D7FF', color: '#1A2340', minWidth: 0 }}
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
              placeholder="输入备注..."
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="shrink-0 text-xs px-2 py-0.5 rounded"
              style={{ background: '#3B82F6', color: '#fff' }}
            >
              {saving ? '...' : '保存'}
            </button>
            <button
              onClick={() => { setEditing(false); setValue(initialNote); }}
              className="shrink-0 text-xs px-1.5 py-0.5 rounded"
              style={{ background: '#F3F4F6', color: '#6B7280' }}
            >取消</button>
          </>
        ) : (
          <>
            <span className="text-right truncate" style={{ color: value ? '#4B5563' : '#C0C8D8', wordBreak: 'break-all' }}>
              {value || '点击添加备注'}
            </span>
            <button
              onClick={() => setEditing(true)}
              className="shrink-0 ml-1"
              style={{ opacity: 0.5, lineHeight: 1 }}
              title="编辑备注"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function CryptoPrediction() {
  const [, params] = useRoute("/ledger/:id/crypto-prediction");
  const [, setLocation] = useLocation();
  const ledgerId = parseInt(params?.id || "0");

  const urlParams = new URLSearchParams(window.location.search);
  const viewAsUserId = urlParams.get("viewAs") ? parseInt(urlParams.get("viewAs")!) : undefined;
  const initialCoin = (urlParams.get("coin") || "BTC").toUpperCase();
  const coinKey = COIN_CONFIG[initialCoin] ? initialCoin : "BTC";
  const coin = COIN_CONFIG[coinKey];

  const [interval, setIntervalVal] = useState("1h");
  const initialTab = (() => {
    const t = urlParams.get("tab");
    if (t === "market" || t === "spot" || t === "contract" || t === "finance") return t;
    return "contract";
  })() as "contract" | "spot" | "market" | "finance";
  const [tab, setTab] = useState<"contract" | "spot" | "market" | "finance">(initialTab);

  // 委托交易面板状态
  const [orderSide, setOrderSide] = useState<"buy" | "sell">("buy");
  const [orderAmount, setOrderAmount] = useState("");
  const [orderPrice, setOrderPrice] = useState("");
  const [sliderPct, setSliderPct] = useState(0);
  // 委卖时选中的买入订单 id（支持多选批量卖出）
  const [selectedSellOrderIds, setSelectedSellOrderIds] = useState<Set<number>>(new Set());
  // 订单详情展开状态
  const [orderDetailId, setOrderDetailId] = useState<number | null>(null);

  // 账本信息（用于判断类型，定制 Tab 名称）
  const { data: ledgerInfo } = trpc.ledger.getById.useQuery(
    { ledgerId },
    { enabled: !!ledgerId, staleTime: 60000 }
  );
  const isCustomAF = (ledgerInfo as any)?.type === 'custom_af';
  const isFunder = (ledgerInfo as any)?.userRole === 'funder';

  // 融资付息：订单列表（仅非资方用户在融资付息Tab时加载）
  const { data: financeOrdersData, refetch: refetchFinanceOrders, isFetching: financeOrdersFetching } = trpc.ledger.financeGetOrders.useQuery(
    { ledgerId, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: isCustomAF && !isFunder && tab === 'finance' }
  );
  const financeOrders: any[] = (financeOrdersData as any)?.orders ?? [];
  // 融资付息：资产汇总
  const { data: financeAssetSummary } = trpc.ledger.financeGetAssetSummary.useQuery(
    { ledgerId },
    { enabled: isCustomAF && !isFunder && tab === 'finance' }
  );
  // 融资付息：已结利息汇总
  const { data: financeInterestSummary } = trpc.ledger.financeGetInterestPaymentSummary.useQuery(
    { ledgerId, orderIds: financeOrders.map((o: any) => o.id) },
    { enabled: isCustomAF && !isFunder && tab === 'finance' && financeOrders.length > 0 }
  );
  // 融资付息：实时价格（与资金方共用同一个 localStorage key）
  const FINANCE_PRICE_CACHE_KEY = `funder_live_prices_${ledgerId}`;
  const freshFinancePrices: Record<string, number> = (financeAssetSummary as any)?.livePrices ?? {};
  // 先读缓存，再用新鲜价格覆盖（保证某个币种价格获取失败时仍显示上次的值）
  let cachedFinancePrices: Record<string, number> = {};
  try { cachedFinancePrices = JSON.parse(localStorage.getItem(FINANCE_PRICE_CACHE_KEY) || '{}'); } catch {}
  const financeLivePrices: Record<string, number> = { ...cachedFinancePrices, ...freshFinancePrices };
  // 有新鲜价格时更新缓存（合并写入，保留未刷新到的币种旧价格）
  if (Object.keys(freshFinancePrices).length > 0) {
    try { localStorage.setItem(FINANCE_PRICE_CACHE_KEY, JSON.stringify(financeLivePrices)); } catch {}
  }

  // 当前登录用户（用于权限判断）
  const { data: meData } = trpc.auth.me.useQuery();
  const currentUserId = (meData as any)?.id;
  const canSeeQQ = currentUserId === 870413 || currentUserId === 4957151;

  // 可用余额（账本总资产）
  const { data: assetData } = trpc.ledger.afGetMyTotalAsset.useQuery(
    { ledgerId, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: !!ledgerId, staleTime: 30000 }
  );
  const availableUsdt = (assetData as any)?.total ?? 0;

  // 委托订单
  const utils = trpc.useUtils();
  const { data: ordersData, isLoading: ordersLoading } = trpc.ledger.afGetOrders.useQuery(
    { ledgerId, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: !!ledgerId, staleTime: 30000, refetchOnWindowFocus: false, refetchOnMount: 'always' }
  );
  const orders: any[] = (ordersData as any[]) || [];
  // 可卖数量（已成交买入 - 已成交卖出）
  const { data: availableSellData } = trpc.ledger.afGetAvailableSell.useQuery(
    { ledgerId, coin: coin.name, ...(viewAsUserId ? { viewAsUserId } : {}) },
    { enabled: !!ledgerId, staleTime: 30000, refetchOnWindowFocus: false, refetchOnMount: 'always' }
  );
  const availableSellQty = (availableSellData as any)?.available ?? 0;
  const submitOrderMutation = trpc.ledger.afSubmitOrder.useMutation({
    onSuccess: () => {
      toast.success("委托已提交");
      setOrderAmount("");
      setOrderPrice("");
      setSliderPct(0);
      utils.ledger.afGetOrders.invalidate({ ledgerId });
      utils.ledger.afGetAvailableSell.invalidate({ ledgerId, coin: coin.name });
      utils.ledger.afGetMyTotalAsset.invalidate({ ledgerId });
    },
    onError: (e) => toast.error("提交失败", { description: e.message }),
  });

  // 用户自助撤单
  const cancelOrderMutation = trpc.ledger.afCancelOrder.useMutation({
    onSuccess: () => {
      utils.ledger.afGetOrders.invalidate({ ledgerId });
      utils.ledger.afGetAvailableSell.invalidate({ ledgerId, coin: coin.name });
      utils.ledger.afGetMyTotalAsset.invalidate({ ledgerId });
    },
    onError: (e) => toast.error("撤单失败", { description: e.message }),
  });

  // Binance 行情（后端代理）
  const { data: tickerData, isLoading: tickerLoading, refetch: refetchTicker } =
    trpc.ledger.getBinanceTicker.useQuery({ symbol: coin.symbol }, { staleTime: 30000, refetchInterval: 30000 });
  const { data: klinesData, isLoading: klinesLoading, refetch: refetchKlines } =
    trpc.ledger.getBinanceKlines.useQuery({ symbol: coin.symbol, interval, limit: 60 }, { staleTime: 30000 });

  const bars: KlineBar[] = (klinesData as KlineBar[] | undefined) || [];
  const ticker = tickerData as any;
  const priceChange = ticker ? parseFloat(ticker.priceChangePercent) : 0;
  const isUp = priceChange >= 0;

  // 竞猜（行情评估 Tab）- 从数据库缓存读取，不依赖外网
  const predCoin = (coinKey === "SOL" ? "BTC" : coinKey) as "BTC" | "ETH";

  const { data: eventsData, isLoading: predLoading, error: predErrorRaw, refetch: refetchPredQuery } = trpc.prediction.listEvents.useQuery(
    { ledgerId: ledgerId!, coin: predCoin, limit: 20 },
    { enabled: !!ledgerId && tab === "market", staleTime: 30000, retry: 1 }
  );
  const predError = predErrorRaw ? (predErrorRaw instanceof Error ? predErrorRaw : new Error(predErrorRaw.message)) : null;
  const predFetching = false;

  // 把后端返回的事件格式转为前端 PredictionEvent 格式
  const events: PredictionEvent[] = (eventsData?.events || []).map((e: any) => ({
    id: e.id,
    question: e.question,
    outcomes: e.outcomes || [],
    outcomePrices: e.outcomePrices || [],
    volume: e.volume || null,
    endDate: e.endDate || null,
    imageUrl: e.imageUrl || null,
    myPrediction: null,
  }));

  // 可见事件列表（通过管理员设置控制）
  const { data: visibleData } = trpc.prediction.getVisibleQuestions.useQuery(
    { ledgerId: ledgerId!, coin: predCoin },
    { enabled: !!ledgerId && tab === "market", staleTime: 30000 }
  );
  const visibleQuestions: string[] = visibleData?.visibleQuestions || [];

  const refetchPred = () => { refetchPredQuery(); };

  // 技术指标
  const analysis = (() => {
    if (bars.length < 20) return null;
    const closes = bars.map((b) => b.close);
    const last = closes[closes.length - 1];
    const ma5 = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const n = 14;
    const gains: number[] = [], losses: number[] = [];
    for (let i = closes.length - n; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) gains.push(diff); else losses.push(Math.abs(diff));
    }
    const avgGain = gains.reduce((a, b) => a + b, 0) / n;
    const avgLoss = losses.reduce((a, b) => a + b, 0) / n;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    const variance = closes.slice(-20).reduce((a, b) => a + Math.pow(b - ma20, 2), 0) / 20;
    const volatility = (Math.sqrt(variance) / ma20) * 100;
    let score = 50;
    if (last > ma5) score += 10;
    if (last > ma20) score += 10;
    if (ma5 > ma20) score += 10;
    if (rsi < 30) score += 15;
    if (rsi > 70) score -= 15;
    if (volatility < 2) score += 5;
    score = Math.min(95, Math.max(5, score));
    const sentiment = score >= 70 ? "偏多" : score >= 50 ? "中性偏多" : score >= 35 ? "中性偏空" : "偏空";
    return { ma5, ma20, rsi, volatility, score, sentiment, last };
  })();

  return (
    <div className="min-h-screen pb-20" style={{ background: '#F0F4FF', color: '#1A2340' }}>
      {/* 顶部导航 */}
      <div className="sticky top-0 z-50 px-4 pt-3 pb-2 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' }}>
        <div className="flex items-center gap-2">
          <button onClick={() => setLocation(`/ledger/${ledgerId}${viewAsUserId ? `?viewAs=${viewAsUserId}` : ''}`)} className="p-1 -ml-1">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <img src={coin.imgUrl} alt={coin.name} className="w-6 h-6 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          <span className="text-base font-semibold">{coin.fullName}（{coin.name}）</span>
        </div>

      </div>

      {/* 视角切换横幅（固定底部） */}
      {viewAsUserId && (
        <div className="fixed bottom-0 left-0 right-0 z-[60] px-4 py-3 flex items-center justify-between text-sm safe-area-bottom" style={{ backgroundColor: '#F59E0B', color: '#1A2340' }}>
          <span className="font-medium">正在查看他人视角的订单</span>
          <button
            onClick={() => {
              const params = new URLSearchParams(window.location.search);
              params.delete('viewAs');
              const qs = params.toString();
              setLocation(`/ledger/${ledgerId}/crypto-prediction${qs ? '?' + qs : ''}`);
            }}
            className="px-3 py-1 rounded-full text-xs font-medium bg-white/90 text-gray-800"
          >
            切回我的视角
          </button>
        </div>
      )}

      {/* Tab 切换 */}
      <div className="px-4 pt-3">
        <div className="flex rounded-xl p-1 gap-1" style={{ backgroundColor: '#E8EEFF' }}>
          {(isCustomAF && !isFunder ? [
            { key: "contract", label: "谷底增筹" },
            { key: "finance", label: "融资付息" },
            { key: "market", label: "行情评估" },
          ] : [
            { key: "contract", label: isCustomAF ? "谷底增筹" : "无损合约" },
            { key: "market", label: "行情评估" },
          ]).map((t) => (
            <button key={t.key} onClick={() => {
              setTab(t.key as any);
            }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t.key ? "text-white shadow-sm" : "text-gray-500"
              }`}
              style={tab === t.key ? { backgroundColor: '#1A56DB' } : {}}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 内容 */}
      <div className="px-4 pt-3">

        {/* 无损合约 */}
        {tab === "contract" && (
          <div className="space-y-3 pb-4">
            {/* 委买 / 委卖 切换 */}
            <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid #D0DBFF' }}>
              <button
                onClick={() => { setOrderSide("buy"); setOrderAmount(""); setSliderPct(0); }}
                className={`flex-1 py-2.5 text-sm font-semibold transition-all ${
                  orderSide === "buy" ? "text-white" : "text-gray-500"
                }`}
                style={orderSide === "buy" ? { backgroundColor: '#1A56DB' } : { backgroundColor: '#F0F4FF' }}>
                委买
              </button>
              <button
                onClick={() => { setOrderSide("sell"); setOrderAmount(""); setSliderPct(0); setSelectedSellOrderIds(new Set()); setOrderPrice(""); }}
                className={`flex-1 py-2.5 text-sm font-semibold transition-all ${
                  orderSide === "sell" ? "text-white" : "text-gray-500"
                }`}
                style={orderSide === "sell" ? { backgroundColor: '#EF4444' } : { backgroundColor: '#F0F4FF' }}>
                委卖
              </button>
            </div>

            {/* 限价委托价格下拉选择器 */}
            <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ backgroundColor: '#FFFFFF', border: '1px solid #D0DBFF' }}>
              <span className="text-sm w-14 flex-shrink-0" style={{ color: '#6B7A9A' }}>限价委托</span>
              <select
                value={orderPrice}
                onChange={(e) => setOrderPrice(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: orderPrice ? '#1A2340' : '#9CA3AF', appearance: 'none', WebkitAppearance: 'none' }}
              >
                <option value="">选择价格</option>
                {((orderSide === 'sell' ? SELL_PRICE_OPTIONS : BUY_PRICE_OPTIONS)[coin.name] || []).map((p) => (
                  <option key={p} value={p.toString()}>{p.toLocaleString()} USDT</option>
                ))}
              </select>
              <svg className="w-4 h-4 flex-shrink-0" style={{ color: '#9CA3AF' }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>

            {/* 委买模式：金额输入 + 进度条 + 可用余额 */}
            {orderSide === "buy" && (
              <>
                {/* 金额输入框 */}
                <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ backgroundColor: '#FFFFFF', border: '1px solid #D0DBFF' }}>
                  <span className="text-sm w-14" style={{ color: '#6B7A9A' }}>金额</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={orderAmount}
                    onChange={(e) => {
                      const val = e.target.value;
                      setOrderAmount(val);
                      const num = parseFloat(val);
                      if (!isNaN(num) && availableUsdt > 0) {
                        setSliderPct(Math.min(100, Math.round((num / availableUsdt) * 100)));
                      } else {
                        setSliderPct(0);
                      }
                    }}
                    className="flex-1 bg-transparent text-sm outline-none"
                    style={{ color: '#1A2340' }}
                  />
                  <span className="text-sm" style={{ color: '#9CA3AF' }}>USDT</span>
                </div>
                {/* 5档进度条 */}
                <div className="px-0">
                  <div className="relative h-8 flex items-center select-none">
                    <div className="absolute left-0 right-0 h-0.5 rounded-full" style={{ backgroundColor: '#D0DBFF' }} />
                    <div className="absolute left-0 h-0.5 rounded-full" style={{ width: `${sliderPct}%`, backgroundColor: "#1A56DB" }} />
                    {[0, 25, 50, 75, 100].map((pct, idx) => {
                      let leftPx: string;
                      if (idx === 0) leftPx = '0px';
                      else if (idx === 4) leftPx = 'calc(100% - 6px)';
                      else leftPx = `calc(${pct}% - 3px)`;
                      return (
                        <div key={pct} className="absolute w-1.5 h-1.5 rounded-full z-10 pointer-events-none"
                          style={{ left: leftPx, backgroundColor: sliderPct >= pct ? "#1A56DB" : "#D0DBFF" }} />
                      );
                    })}
                    <div className="absolute w-4 h-4 rounded-full shadow-lg z-20 pointer-events-none"
                      style={{ backgroundColor: '#1A56DB', left: sliderPct === 0 ? '0px' : sliderPct === 100 ? 'calc(100% - 16px)' : `calc(${sliderPct}% - 8px)` }} />
                    <input type="range" min={0} max={100} step={1} value={sliderPct}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setSliderPct(val);
                        const amt = availableUsdt > 0 ? (availableUsdt * val / 100) : 0;
                        setOrderAmount(amt > 0 ? amt.toFixed(2) : "");
                      }}
                      className="absolute inset-0 w-full opacity-0 cursor-pointer z-30" />
                  </div>
                  <div className="flex justify-between mt-1">
                    {["0%", "25%", "50%", "75%", "100%"].map((label) => (
                      <span key={label} className="text-xs text-gray-600">{label}</span>
                    ))}
                  </div>
                </div>
                {/* 可用金额 + 充値按钮 */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs" style={{ color: '#9CA3AF' }}>可用</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: '#1A2340' }}>
                      {availableUsdt > 0 ? availableUsdt.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "--"} USDT
                    </span>
                    <button onClick={() => setLocation(`/recharge?from=ledger&ledgerId=${ledgerId}${viewAsUserId ? `&viewAs=${viewAsUserId}` : ''}`)}
                      className="w-5 h-5 rounded-full flex items-center justify-center transition-colors" style={{ backgroundColor: '#E8EEFF', color: '#1A56DB' }} title="充值">
                      <span className="text-xs leading-none">+</span>
                    </button>
                  </div>
                </div>
                {/* 可买数量 - 实时计算公式展示 */}
                <div className="rounded-xl px-4 py-3" style={{ backgroundColor: '#EEF2FF', border: '1px solid #D0DBFF' }}>
                  {(() => {
                    const amt = parseFloat(orderAmount);
                    const price = parseFloat(orderPrice);
                    const hasAmt = !isNaN(amt) && amt > 0;
                    const hasPrice = !isNaN(price) && price > 0;
                    const qty = hasAmt && hasPrice ? ((amt / price) * 5.25) : null;
                    return (
                      <>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-semibold" style={{ color: '#1A56DB' }}>可买数量（5.25倍收益）</span>
                          <span className="text-sm font-bold" style={{ color: qty !== null ? '#1A2340' : '#9CA3AF' }}>
                            {qty !== null ? `${qty.toFixed(6)} ${coin.name}` : `-- ${coin.name}`}
                          </span>
                        </div>
                        <div className="text-xs" style={{ color: '#6B7A9A' }}>
                          {hasAmt && hasPrice ? (
                            <span>
                              {amt.toLocaleString('en-US', { maximumFractionDigits: 2 })} ÷ {price.toLocaleString()} × 5.25 = <span className="font-semibold" style={{ color: '#1A56DB' }}>{qty!.toFixed(6)} {coin.name}</span>
                            </span>
                          ) : hasAmt && !hasPrice ? (
                            <span style={{ color: '#EF4444' }}>请先选择委托价格</span>
                          ) : !hasAmt && hasPrice ? (
                            <span>请滑动选择金额</span>
                          ) : (
                            <span>选择价格并滑动金额后自动计算</span>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </>
            )}

            {/* 委卖模式：已成交买入订单列表选择 */}
            {orderSide === "sell" && (() => {
              const completedBuyOrders = (ordersData as any[] || []).filter(
                (o: any) => (o.status === 'completed' || o.status === 'pending') && o.coin === coin.name && !o.sellStatus
              );
              // 显示未卖出且未委托卖的订单（包括委托中和已成交的买单）
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1 mb-1">
                  <p className="text-xs text-gray-500">选择要卖出的订单（可多选批量卖出）</p>
                  {completedBuyOrders.length > 1 && (
                    <button
                      onClick={() => {
                        const availableIds = completedBuyOrders.map((o: any) => o.id);
                        if (selectedSellOrderIds.size === availableIds.length) {
                          setSelectedSellOrderIds(new Set());
                        } else {
                          setSelectedSellOrderIds(new Set(availableIds));
                        }
                      }}
                      className="text-[10px] text-[#1A56DB] underline"
                    >
                      {selectedSellOrderIds.size === completedBuyOrders.length ? '取消全选' : '全选'}
                    </button>
                  )}
                </div>
                  {completedBuyOrders.length === 0 ? (
                    <p className="text-xs text-gray-600 px-1">暂无已成交的买入订单</p>
                  ) : (
                    completedBuyOrders.map((o: any) => {
                      const isSelected = selectedSellOrderIds.has(o.id);
                      return (
                        <div
                          key={o.id}
                          onClick={() => {
                            const next = new Set(selectedSellOrderIds);
                            if (isSelected) { next.delete(o.id); } else { next.add(o.id); }
                            setSelectedSellOrderIds(next);
                          }}
                          className={`rounded-xl px-4 py-3 border transition-colors ${
                            isSelected
                              ? 'bg-[#2A1A1A] border-[#ef5350] cursor-pointer'
                              : 'bg-[#1C2127] border-transparent cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                                isSelected ? 'bg-[#ef5350] border-[#ef5350]' : 'border-gray-500'
                              }`}>
                                {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-white font-medium">{o.coin}</span>
                                  {o.status === 'pending' && <span className="text-[9px] px-1 py-0.5 rounded" style={{backgroundColor:'rgba(245,158,11,0.2)',color:'#F59E0B'}}>委托中</span>}
                                </div>
                                <span className="text-[10px] text-gray-500">买入价 {parseFloat(o.limitPrice).toLocaleString()} USDT</span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-xs text-white">{(() => { const q = parseFloat(o.quantity); return q % 1 === 0 ? q.toString() : q.toFixed(8).replace(/0+$/, '').replace(/\.$/, ''); })()} {o.coin}</span>
                              <span className="text-[10px] text-gray-500">金额 {parseFloat(o.amount).toFixed(2)} USDT</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  {selectedSellOrderIds.size > 0 && (
                    <p className="text-[10px] text-[#ef5350] px-1">已选 {selectedSellOrderIds.size} 笔，将以相同价格批量委托卖出</p>
                  )}
                </div>
              );
            })()}

            {/* 确认按鈕 */}
            <button
              style={orderSide === "buy" ? { background: 'linear-gradient(135deg, #1A56DB 0%, #3B82F6 100%)' } : { backgroundColor: '#EF4444' }}
              onClick={async () => {
                const price = parseFloat(orderPrice);
                if (!price || price <= 0) { toast.error("请输入委托价格"); return; }
                if (orderSide === "buy") {
                  const amt = parseFloat(orderAmount);
                  if (!amt || amt <= 0) { toast.error("请输入金额"); return; }
                  if (amt > availableUsdt) { toast.error("金额超过可用余额"); return; }
                  const qty = ((amt / price) * 5.25).toFixed(8);
                  submitOrderMutation.mutate({
                    ledgerId,
                    coin: coin.name,
                    side: 'buy',
                    limitPrice: price.toString(),
                    amount: amt.toFixed(2),
                    quantity: qty,
                    orderType: '无损合约',
                  });
                } else {
                  // 委卖：批量提交选中的所有订单
                  if (selectedSellOrderIds.size === 0) { toast.error("请选择要卖出的订单"); return; }
                  const selectedOrders = (ordersData as any[] || []).filter((o: any) => selectedSellOrderIds.has(o.id));
                  if (selectedOrders.length === 0) { toast.error("订单不存在"); return; }
                  // 逐条提交（复用现有单条接口）
                  let successCount = 0;
                  let failCount = 0;
                  for (const selectedOrder of selectedOrders) {
                    try {
                      await submitOrderMutation.mutateAsync({
                        ledgerId,
                        coin: coin.name,
                        side: 'sell',
                        limitPrice: price.toString(),
                        amount: parseFloat(selectedOrder.amount).toFixed(2),
                        quantity: parseFloat(selectedOrder.quantity).toFixed(8),
                        orderType: '无损合约',
                        sourceOrderId: selectedOrder.id,
                      });
                      successCount++;
                    } catch (e: any) {
                      failCount++;
                      console.error('[批量卖出] 订单', selectedOrder.id, '失败:', e.message);
                    }
                  }
                  if (successCount > 0 && failCount === 0) {
                    toast.success(`成功委托卖出 ${successCount} 笔订单`);
                  } else if (successCount > 0 && failCount > 0) {
                    toast.success(`${successCount} 笔成功，${failCount} 笔失败（可能已有委托）`);
                  } else {
                    toast.error(`委托失败，请检查是否已有委托卖出记录`);
                  }
                  setSelectedSellOrderIds(new Set());
                  return;
                }
              }}
              disabled={orderSide === "sell" && selectedSellOrderIds.size === 0}
              className={`w-full py-3.5 rounded-2xl text-white font-semibold text-base transition-opacity ${(
                orderSide === "buy"
                  ? (!orderAmount || parseFloat(orderAmount) <= 0)
                  : selectedSellOrderIds.size === 0
              ) ? "opacity-50" : "opacity-100"}`}
            >
              {submitOrderMutation.isPending ? "提交中..." : orderSide === "buy" ? `买入 ${coin.name}` : selectedSellOrderIds.size > 1 ? `批量卖出 ${selectedSellOrderIds.size} 笔` : `卖出 ${coin.name}`}
            </button>
            {/* 当前委托订单列表 - 独立渲染，不依赖 K 线图加载状态 */}
            {/* 点击详情区域外关闭详情：透明覆盖层 */}
            {orderDetailId !== null && (
              <div
                className="fixed inset-0 z-10"
                onClick={() => setOrderDetailId(null)}
              />
            )}
            <div className="mt-4 relative z-20">
              <div className="text-sm font-semibold mb-2" style={{ color: '#1A2340' }}>当前订单</div>
              {ordersLoading ? (
                <div className="space-y-2 pt-1">
                  {[1,2,3].map(i => (
                    <div key={i} className="grid items-center gap-1 py-1.5" style={{gridTemplateColumns:'10fr 3fr 2fr 3fr 3fr 2fr'}}>
                      {[90,60,55,65,55,40].map((w, j) => (
                        <div key={j} className={`h-2.5 bg-[#2A2E39] rounded-full animate-pulse ${j > 0 ? 'ml-auto' : ''}`} style={{width:`${w}%`}} />
                      ))}
                    </div>
                  ))}
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-5 text-gray-500 text-xs">暂无委托记录</div>
              ) : (
                <div>
                  {/* 表头 */}
                  <div className="grid text-xs pb-1.5 mb-0.5" style={{gridTemplateColumns:'7fr 2.5fr 3fr 3fr 2fr', color: '#9CA3AF', borderBottom: '1px solid #E0E8FF'}}>
                    <span>日期</span>
                    <span className="text-center">币种</span>
                    <span className="text-right">数量</span>
                    <span className="text-right">状态</span>
                    <span></span>
                  </div>
                  {orders.map((order) => {
                    const createdAt = order.createdAt ? new Date(order.createdAt) : null;
                    const timeStr = createdAt ? (() => {
                      const y = createdAt.getFullYear();
                      const mo = String(createdAt.getMonth()+1).padStart(2,'0');
                      const d = String(createdAt.getDate()).padStart(2,'0');
                      const h = String(createdAt.getHours()).padStart(2,'0');
                      const mi = String(createdAt.getMinutes()).padStart(2,'0');
                      const s = String(createdAt.getSeconds()).padStart(2,'0');
                      return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
                    })() : '--';
                    return (
                      <div key={order.id} className="py-2" style={{ borderBottom: '1px solid #EEF2FF' }}>
                        <div className="grid text-xs items-center" style={{gridTemplateColumns:'7fr 2.5fr 3fr 3fr 2fr'}}>
                          <span className="whitespace-nowrap" style={{ color: '#6B7A9A' }}>{timeStr}</span>
                          <span className="font-medium text-center" style={{ color: '#1A2340' }}>
                            {order.coin}
                            {(order as any).isGift && <span className="ml-0.5 text-[#ef5350] font-bold animate-pulse">赠</span>}
                          </span>
                          <span className="text-right" style={{ color: '#1A2340' }}>{(() => { const q = parseFloat(order.quantity); return q % 1 === 0 ? q.toString() : q.toFixed(8).replace(/0+$/, '').replace(/\.$/, ''); })()}</span>
                          <span className={`text-right ${
                            (order as any).sellStatus === 'sold' ? 'text-[#6B7280]' :
                            (order as any).sellStatus === 'selling' ? 'text-[#EF4444]' :
                            order.status === 'completed' ? 'text-[#0EA56A]' :
                            order.status === 'cancelled' ? 'text-gray-400' :
                            'text-[#F59E0B]'
                          }`}>
                            {(order as any).sellStatus === 'sold' ? '已卖出' :
                             (order as any).sellStatus === 'selling' ? '委卖中' :
                             order.status === 'completed' ? '持仓中' :
                             order.status === 'cancelled' ? '已撒' :
                             '委买中'}
                          </span>
                          <div className="flex flex-col items-end gap-0.5">
                            {/* 所有状态都显示详情按鈕，撒单移入详情内 */}
                            <button
                              onClick={() => setOrderDetailId(order.id === orderDetailId ? null : order.id)}
                              className="text-xs font-medium" style={{ color: '#1A56DB' }}>
                              详情
                            </button>
                          </div>
                        </div>
                        {/* 详情展开 */}
                        {orderDetailId === order.id && (
                          <OrderDetail order={order} timeStr={timeStr} ledgerId={ledgerId} viewAsUserId={viewAsUserId} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 无损现货 */}
        {tab === "spot" && (
          <div className="space-y-3">
            <div className="bg-[#131722] rounded-2xl p-4">
              <div className="text-sm font-semibold text-white mb-2">无损现货策略</div>
              <div className="text-xs text-gray-400 leading-relaxed">
                通过网格交易与定投结合，在现货市场中分批建仓，利用价格波动自动低买高卖，降低持仓成本，实现无损增持。
              </div>
            </div>
            <div className="bg-[#131722] rounded-2xl p-4">
              <div className="text-xs text-gray-400 mb-3">实时行情</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1">当前价</div>
                  <div className={`text-base font-bold ${isUp ? "text-[#26a69a]" : "text-[#ef5350]"}`}>{formatPrice(ticker?.lastPrice)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">24H涨跌</div>
                  <div className={`text-base font-bold ${isUp ? "text-[#26a69a]" : "text-[#ef5350]"}`}>{isUp ? "+" : ""}{priceChange.toFixed(2)}%</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">24H最高</div>
                  <div className="text-sm text-white">{formatPrice(ticker?.highPrice)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">24H最低</div>
                  <div className="text-sm text-white">{formatPrice(ticker?.lowPrice)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">成交量</div>
                  <div className="text-sm text-white">{formatVol(ticker?.volume)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">加权均价</div>
                  <div className="text-sm text-white">{formatPrice(ticker?.weightedAvgPrice)}</div>
                </div>
              </div>
            </div>
            {analysis && (
              <div className="bg-[#131722] rounded-2xl p-4">
                <div className="text-xs text-gray-400 mb-3">综合评分</div>
                <div className="flex items-center gap-4">
                  <div className="relative w-14 h-14 flex-shrink-0">
                    <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                      <circle cx="32" cy="32" r="26" fill="none" stroke="#2A2E39" strokeWidth="6" />
                      <circle cx="32" cy="32" r="26" fill="none"
                        stroke={analysis.score >= 60 ? "#26a69a" : analysis.score >= 40 ? "#FFA000" : "#ef5350"}
                        strokeWidth="6"
                        strokeDasharray={`${(analysis.score / 100) * 163.4} 163.4`}
                        strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-bold text-white">{Math.round(analysis.score)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-base font-semibold text-white">{analysis.sentiment}</div>
                    <div className="text-xs text-gray-400 mt-1">波动率 {analysis.volatility.toFixed(2)}%</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 融资付息 */}
        {tab === "finance" && (
          <div className="pb-4">
            {/* 融资资产汇总卡片 */}
            {(() => {
              const cb = (financeAssetSummary as any)?.coinBreakdown || {};
              const coins = ['ETH', 'BTC', 'SOL'];
              let totalMarketValue = 0;
              for (const c of coins) {
                const qty = cb[c]?.quantity || 0;
                const price = financeLivePrices[c] || 0;
                totalMarketValue += qty * price;
              }
              const cnyValue = totalMarketValue * 7.15;
              return (
                <div className="rounded-2xl p-4 mb-4" style={{ background: 'linear-gradient(135deg, #1a3a8a 0%, #3B5BDB 100%)' }}>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-white/70 text-xs">融资资产</span>
                    <span className="text-white/70 text-xs">总市值 {totalMarketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} U ≈ {cnyValue >= 10000 ? (cnyValue / 10000).toFixed(2) + '万元' : cnyValue.toFixed(0) + '元'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-0">
                    {coins.map((coin, idx) => {
                      const info = cb[coin] || { quantity: 0, avgCost: 0 };
                      const price = financeLivePrices[coin] || 0;
                      const qty = info.quantity || 0;
                      const marketVal = qty * price;
                      return (
                        <div key={coin} className={`${idx < 2 ? 'border-r border-white/20' : ''} px-2`}>
                          <div className="text-white font-bold text-sm mb-1">{coin}</div>
                          <div className="text-white/60 text-[10px]">持有数量</div>
                          <div className="text-white text-xs font-medium">{formatCoinQty(qty, coin)}</div>
                          <div className="text-white/60 text-[10px] mt-1">平均成本</div>
                          <div className="text-white text-xs">{info.avgCost ? info.avgCost.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' U' : '0 U'}</div>
                          <div className="text-white/60 text-[10px] mt-1">当前价格</div>
                          <div className="text-white text-xs">{price ? price.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' U' : '0 U'}</div>
                          <div className="text-white/60 text-[10px] mt-1">当前市值</div>
                          <div className="text-white text-xs">{marketVal ? marketVal.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' U' : '0 U'}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            {/* 融资订单列表 */}
            <div className="flex items-center mb-3">
              <h3 className="text-base font-semibold" style={{ color: '#1A2340' }}>融资订单</h3>
              <span className="text-xs text-gray-400 ml-1.5">共 {financeOrders.length} 笔</span>
              <button
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.set('tab', 'finance');
                  window.location.href = url.toString();
                }}
                className="ml-2 px-2.5 py-0.5 rounded text-xs font-medium"
                style={{ backgroundColor: '#EEF2FF', color: '#3B82F6' }}
              >
                刷新
              </button>
            </div>
            {financeOrders.length === 0 ? (
              <div className="text-center py-12">
                <AlertCircle className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                <div className="text-gray-400 text-base mb-1">暂无融资订单</div>
                <div className="text-gray-400 text-sm">管理员将为您配置融资订单</div>
              </div>
            ) : (
              <div className="space-y-3">
                {financeOrders.map((order: any) => {
                  const paidInterest = (financeInterestSummary as any)?.[order.id] ?? 0;
                  const annualRate = parseFloat(order.interest_rate_annual || order.annualInterestRate || '0');
                  const isNegativeRate = true; // 融资付息页面用户均为付息方，利息一律显示为负数
                  const interestBase = parseFloat(order.interest_base || order.principal || '0');
                  const startDate = order.interest_start_date || order.startDate || null;
                  const coinQty = parseFloat(order.buy_quantity || order.coinQuantity || '0');
                  const buyPrice = parseFloat(order.buy_price || '0');
                  const buyValue = parseFloat(order.amount || '0');
                  const coinPrice = financeLivePrices[order.coin] || 0;
                  const marketValue = coinQty * coinPrice;
                  const statusLabel = order.status === 'active' ? '持有中' : order.status === 'settled' ? '已结算' : '已取消';
                  const statusColor = order.status === 'active' ? '#22C55E' : order.status === 'settled' ? '#3B82F6' : '#9CA3AF';
                  const coinColorMap: Record<string, string> = { BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF' };
                  const cc = coinColorMap[order.coin] || '#6B7280';
                  // 精确计息（秒级）
                  const nowTs = Date.now();
                  const startTs = startDate ? new Date(startDate + (startDate.includes('T') ? '' : 'T00:00:00')).getTime() : 0;
                  const elapsedSeconds = startTs > 0 ? Math.max(0, (nowTs - startTs) / 1000) : 0;
                  const perSecond = interestBase && annualRate ? (interestBase * Math.abs(annualRate) / 100) / (365 * 24 * 3600) : 0;
                  const accruedInterest = perSecond * elapsedSeconds;
                  const unpaidInterest = Math.max(0, accruedInterest - paidInterest);
                  // 持有时长
                  const holdingLabel = (() => {
                    if (!order.buy_date || order.status !== 'active') return null;
                    const elapsed = Date.now() - new Date(order.buy_date + 'T00:00:00').getTime();
                    if (elapsed < 0) return null;
                    const totalHours = Math.floor(elapsed / (1000 * 60 * 60));
                    const days = Math.floor(totalHours / 24);
                    const hours = totalHours % 24;
                    return days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
                  })();
                  return (
                    <div
                      key={order.id}
                      className="rounded-2xl shadow-sm"
                      style={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E8FF', boxShadow: '0 2px 8px rgba(26,86,219,0.08)', overflow: 'hidden' }}
                    >
                      {/* 顶部色条 */}
                      <div className="h-1" style={{ background: `linear-gradient(90deg, ${cc}, ${cc}55)` }} />

                      {/* 主体：左右两栏 */}
                      <div className="flex" style={{ minHeight: '100px' }}>

                        {/* 左栏：订单信息 */}
                        <div className="flex-1 p-4 pr-3">
                          {/* 标题：融资资产 */}                          <div className="text-[10px] mb-0.5" style={{ color: '#3B82F6' }}>融资资产<span className="text-gray-400">({order.finance_type === '自负盈亏' ? '自负盈亏 100%部分' : '保本分成 50%部分'})</span></div>
                          {/* 持币数量（大字突出） */}
                          <div className="flex items-baseline gap-1 mb-1">
                            <span className="text-2xl font-bold tabular-nums" style={{ color: '#1A2340' }}>
                              {coinQty > 0 ? formatCoinQty(coinQty, order.coin) : '—'}
                            </span>
                            <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>{order.coin}</span>
                          </div>
                          {/* 订单详情列表 */}
                          <div className="space-y-0.5">
                            {buyPrice > 0 && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400 shrink-0">买入币价</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>{buyPrice.toLocaleString()} U</span>
                              </div>
                            )}
                            {buyValue > 0 && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400 shrink-0">买入价值</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>{buyValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span>
                              </div>
                            )}
                            {order.buy_date && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400 shrink-0">买入时间</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>{order.buy_date}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-400 shrink-0">今日币价</span>
                              <span className="font-medium" style={{ color: '#4B5563' }}>
                                {coinPrice ? coinPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' U' : '---'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-400 shrink-0">当前价值</span>
                              <span className="font-medium" style={{ color: '#4B5563' }}>
                                {coinPrice && coinQty ? (coinQty * coinPrice).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' U' : '---'}
                              </span>
                            </div>

                            {order.order_no && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400 shrink-0">订单编号</span>
                                <span className="font-mono" style={{ color: '#9CA3AF', letterSpacing: '0.05em' }}>{order.order_no}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 中间分隔线 */}
                        <div className="w-px my-3" style={{ backgroundColor: '#E8EFFF' }} />

                        {/* 右栏：利息信息 */}
                        <div className="w-44 p-4 pl-3 flex flex-col" style={{ alignSelf: 'stretch' }}>
                          <div className="flex flex-col h-full">
                            {/* 待付/待收利息 */}
                            <div className="flex flex-col justify-start">
                              <div className="flex items-center gap-1 mb-0.5" style={{ height: '16px' }}>
                                <span className="text-[10px]" style={{ color: '#3B82F6' }}>
                                  {isNegativeRate ? '待付利息' : '待收利息'}
                                </span>
                                <span className="text-[10px] text-gray-400">{isNegativeRate ? '(整体部分年化12%)' : `(年化 ${Math.abs(annualRate)}%)`}</span>
                              </div>
                              <div className="flex items-baseline gap-0.5 mb-1">
                                <span
                                  className="text-2xl font-bold tabular-nums leading-tight"
                                  style={{ color: '#1A2340', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
                                >
                                  {unpaidInterest > 0 ? '-' : ''}{unpaidInterest.toFixed(2)}
                                </span>
                                <span className="text-sm font-semibold" style={{ color: '#1A2340' }}>USDT</span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">{isNegativeRate ? '已付利息' : '已收利息'}</span>
                                <span className="font-medium" style={{ color: '#4B5563' }}>{paidInterest.toFixed(2)} USDT</span>
                              </div>
                              {startDate && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-400">计息日期</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>
                                    {(() => {
                                      const d = startDate.replace(/^\d{4}-(\d{2})-(\d{2}).*$/, (_: string, m: string, dd: string) => `${parseInt(m)}月${parseInt(dd)}日`);
                                      return d;
                                    })()}
                                  </span>
                                </div>
                              )}
                              {holdingLabel && (
                                <div className="flex items-center justify-between mt-0.5 text-xs">
                                  <span className="text-gray-400">持有时长</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>{holdingLabel}</span>
                                </div>
                              )}
                              {(() => {
                                const collCoin = order.collateral_coin;
                                const collQty = parseFloat(order.collateral_qty || '0');
                                const hasCollateral = collCoin && collQty > 0;
                                const collPrice = hasCollateral ? (financeLivePrices[collCoin] || 0) : 0;
                                const collValue = collQty * collPrice;
                                const financeType = order.finance_type || '保本分成';
                                // 担保缺口计算：
                                // 保本分成：净担保价值（担保价值 - 已产生利息）- 基数（买入价值 × 24%）
                                //   净担保价值 >= 基数 → 超过100%；否则显示负缺口（红色）
                                // 自负盈亏：当前市值 + 担保价值 - 买入价值（原逻辑）
                                let gap: number | null = null;
                                if (hasCollateral && collPrice > 0) {
                                  if (financeType === '保本分成') {
                                    // 基数 = 买入价值 × 24%
                                    const base = buyValue * 0.24;
                                    // 代付利息 = 待付利息（负利率时为代垫金额，即 unpaidInterest 的绝对值）
                                    // unpaidInterest 已是正数（isNegativeRate 时代表代付金额）
                                    const advancedInterest = isNegativeRate ? unpaidInterest : 0;
                                    // 净担保价值 = 担保价值 - 代付利息
                                    const netCollValue = collValue - advancedInterest;
                                    // 缺口 = 净担保价值 - 基数（负数表示不足）
                                    gap = netCollValue - base;
                                  } else {
                                    // 自负盈亏：
                                    // USDT（稳定币）：担保价值 - 买入价值 - 待收利息
                                    // 其他币种：当前市值 + 担保价值 - 买入价值 - 待收利息
                                    if (order.coin === 'USDT') {
                                      gap = collValue - buyValue - unpaidInterest;
                                    } else if (coinPrice > 0) {
                                      gap = marketValue + collValue - buyValue - unpaidInterest;
                                    }
                                  }
                                }
                                return hasCollateral ? (
                                  <>
                                    <div className="flex items-center justify-between mt-0.5 text-xs">
                                      <span className="text-gray-400">担保利息</span>
                                      <span className="font-medium" style={{ color: '#4B5563' }}>
                                        {collQty % 1 === 0 ? collQty.toFixed(0) : collQty}{collCoin}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between mt-0.5 text-xs">
                                      <span className="text-gray-400">担保价值</span>
                                      <span className="font-medium" style={{ color: '#4B5563' }}>
                                        {collPrice > 0 ? `${collValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} U` : '---'}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between mt-0.5 text-xs">
                                      <div className="flex items-center gap-1">
                                        <span className="text-gray-400">担保缺口</span>
                                        {gap !== null && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const modal = document.getElementById(`gap_modal_${order.id}`);
                                              if (modal) modal.style.display = 'flex';
                                            }}
                                            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-white text-[9px] font-bold flex-shrink-0"
                                            style={{ background: '#9CA3AF', lineHeight: 1 }}
                                          >
                                            ?
                                          </button>
                                        )}
                                      </div>
                                      <span className="font-medium" style={{ color: gap === null ? '#4B5563' : gap < 0 ? '#EF4444' : '#4B5563' }}>
                                        {gap === null ? '---' : gap >= 0 ? '超过100%' : `${gap.toLocaleString(undefined, { maximumFractionDigits: 0 })} U`}
                                      </span>
                                    </div>
                                    {gap !== null && (
                                      <div
                                        id={`gap_modal_${order.id}`}
                                        style={{ display: 'none', position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', alignItems: 'flex-end', justifyContent: 'center' }}
                                        onClick={(e) => {
                                          if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).style.display = 'none';
                                        }}
                                      >
                                        <div style={{ width: '100%', background: '#fff', borderRadius: '16px 16px 0 0', padding: '20px 16px 32px' }}>
                                          <div className="flex items-center justify-between mb-4">
                                            <span className="font-semibold text-sm" style={{ color: '#1A2340' }}>担保缺口计算过程</span>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const modal = document.getElementById(`gap_modal_${order.id}`);
                                                if (modal) modal.style.display = 'none';
                                              }}
                                              className="text-gray-400 text-lg font-light leading-none"
                                              style={{ lineHeight: 1 }}
                                            >×</button>
                                          </div>
                                          {financeType === '保本分成' ? (
                                            <div className="space-y-2 text-sm" style={{ color: '#6B7280' }}>
                                              <div className="p-3 rounded-lg" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                                <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>基数 = 买入价値 × 24%</div>
                                                <div style={{ color: '#1F2937' }}>{buyValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} × 24% = <span style={{ color: '#D97706', fontWeight: 600 }}>{(buyValue * 0.24).toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span></div>
                                              </div>
                                              <div className="p-3 rounded-lg" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                                <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>担保价値 = 担保数量 × 实时币价</div>
                                                <div style={{ color: '#1F2937' }}>{collQty % 1 === 0 ? collQty.toFixed(0) : collQty.toFixed(4)} {collCoin} × {collPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} U = <span style={{ color: '#D97706', fontWeight: 600 }}>{collValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span></div>
                                              </div>
                                              <div className="p-3 rounded-lg" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                                <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>代付利息（待付利息累计）</div>
                                                <div style={{ color: '#1F2937' }}><span style={{ color: '#EF4444', fontWeight: 600 }}>{isNegativeRate ? unpaidInterest.toFixed(2) : '0.00'} U</span></div>
                                              </div>
                                              <div className="p-3 rounded-lg" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                                <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>净担保价値 = 担保价値 - 代付利息</div>
                                                <div style={{ color: '#1F2937' }}>{collValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} - {isNegativeRate ? unpaidInterest.toFixed(2) : '0.00'} = <span style={{ color: '#D97706', fontWeight: 600 }}>{(collValue - (isNegativeRate ? unpaidInterest : 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span></div>
                                              </div>
                                              <div className="p-3 rounded-lg" style={{ background: gap < 0 ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${gap < 0 ? '#FECACA' : '#BBF7D0'}` }}>
                                                <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>担保缺口 = 净担保价値 - 基数</div>
                                                <div style={{ color: gap < 0 ? '#EF4444' : '#059669', fontWeight: 700, fontSize: '15px' }}>{(collValue - (isNegativeRate ? unpaidInterest : 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })} - {(buyValue * 0.24).toLocaleString(undefined, { maximumFractionDigits: 2 })} = {gap.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</div>
                                              </div>
                                            </div>
                                          ) : (
                                            <div className="space-y-2 text-sm" style={{ color: '#6B7280' }}>
                                              <div className="p-3 rounded-lg" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                                <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>当前市値 = 持币数量 × 实时币价</div>
                                                <div style={{ color: '#1F2937' }}>{coinQty % 1 === 0 ? coinQty.toFixed(0) : coinQty.toFixed(4)} × {coinPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} U = <span style={{ color: '#D97706', fontWeight: 600 }}>{marketValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span></div>
                                              </div>
                                              <div className="p-3 rounded-lg" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                                <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>担保价値 = 担保数量 × 实时币价</div>
                                                <div style={{ color: '#1F2937' }}>{collQty % 1 === 0 ? collQty.toFixed(0) : collQty.toFixed(4)} {collCoin} × {collPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })} U = <span style={{ color: '#D97706', fontWeight: 600 }}>{collValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span></div>
                                              </div>
                                              <div className="p-3 rounded-lg" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                                                <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>买入价値</div>
                                                <div style={{ color: '#1F2937' }}><span style={{ color: '#D97706', fontWeight: 600 }}>{buyValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</span></div>
                                              </div>
                                              <div className="p-3 rounded-lg" style={{ background: gap < 0 ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${gap < 0 ? '#FECACA' : '#BBF7D0'}` }}>
                                                {order.coin === 'USDT' ? (
                                                  <>
                                                    <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>担保缺口 = 担保价値 - 买入价値 - 待收利息</div>
                                                    <div style={{ color: gap < 0 ? '#EF4444' : '#059669', fontWeight: 700, fontSize: '15px' }}>{collValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} - {buyValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} - {unpaidInterest.toFixed(2)} = {gap.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</div>
                                                  </>
                                                ) : (
                                                  <>
                                                    <div className="text-xs mb-1" style={{ color: '#9CA3AF' }}>担保缺口 = 当前市値 + 担保价値 - 买入价値 - 待收利息</div>
                                                    <div style={{ color: gap < 0 ? '#EF4444' : '#059669', fontWeight: 700, fontSize: '15px' }}>{marketValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} + {collValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} - {buyValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} - {unpaidInterest.toFixed(2)} = {gap.toLocaleString(undefined, { maximumFractionDigits: 2 })} U</div>
                                                  </>
                                                )}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </>
                                ) : null;
                              })()}
                              {order.counterparty && (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-400">对手方</span>
                                  <span className="font-medium" style={{ color: '#4B5563' }}>{order.counterparty}</span>
                                </div>
                              )}

                            </div>
                          </div>
                        </div>

                      </div>
                      <NoteRow
                        orderId={order.id}
                        ledgerId={ledgerId}
                        initialNote={order.public_note || ''}
                        onSaved={(newNote: string) => {
                          order.public_note = newNote || null;
                          refetchFinanceOrders();
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 行情评估（竞猜） */}
        {tab === "market" && (() => {
           // 根据管理员勾选过滤事件（如果管理员尚未设置任何勾选，默认显示全部）
           const filteredEvents = visibleQuestions.length > 0 ? events.filter(e => visibleQuestions.includes(e.question)) : events;
          return (
          <div>
            {predLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
                <p className="text-xs text-gray-500">正在加载预测数据...</p>
              </div>
            ) : predError ? (
              <div className="bg-[#1C2127] rounded-2xl px-5 py-8 flex flex-col items-center gap-3 text-center">
                <WifiOff className="w-10 h-10 text-gray-600" />
                <p className="text-sm font-medium text-gray-300">数据加载失败</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {predError.message || "无法连接到 Polymarket，请检查网络后重试"}
                </p>
                <button onClick={() => refetchPred()} disabled={predFetching}
                  className="mt-1 flex items-center gap-2 bg-[#D32F2F] text-white px-5 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60">
                  <RefreshCw className={`w-4 h-4 ${predFetching ? "animate-spin" : ""}`} />
                  重新加载
                </button>
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="bg-[#1C2127] rounded-2xl px-5 py-8 flex flex-col items-center gap-3 text-center">
                <Bitcoin className="w-12 h-12 text-gray-600" />
                <p className="text-sm font-medium text-gray-300">暂无 {coin.name} 行情评估数据</p>
                <p className="text-xs text-gray-500">暂无相关评估数据</p>
              </div>
            ) : (
              filteredEvents.map((event) => (
                <EventCard key={event.id} event={event} ledgerId={ledgerId} onPredicted={() => refetchPred()} />
              ))
            )}
            {/* QQ 容器入口 - 仅 jiang(870413) 和 yjh(4957151) 可见 */}
            {canSeeQQ && (
              <div
                className="mt-4 bg-[#1C2127] rounded-2xl p-4 flex items-center justify-between cursor-pointer active:opacity-70"
                onClick={() => setLocation(`/ledger/${ledgerId}/qq`)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#12B7F5] flex items-center justify-center">
                    <span className="text-white font-bold text-sm">QQ</span>
                  </div>
                  <div>
                    <div className="text-white font-medium text-sm">QQ</div>
                    <div className="text-gray-400 text-xs mt-0.5">点击进入</div>
                  </div>
                </div>
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            )}
          </div>
          );
        })()}
      </div>

    </div>
  );
}
