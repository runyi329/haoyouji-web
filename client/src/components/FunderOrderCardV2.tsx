// FunderOrderCardV2 —— OKX 深色风格订单卡片（资产感优先，服务费弱化）
// 仅用于对比展示，不影响原有 FunderOrderCard
import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { calcExpiryPnL } from '../../../shared/blackScholes';
import { useOptionGreeks } from "@/hooks/useOptionGreeks";
import { ChevronDown, ChevronUp, Copy } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { formatFunderAnnualRate } from "@/lib/funderAnnualRate";
import { RightMarginDetail } from "./RightMarginDetail";
import { RightInterestDetail } from "./RightInterestDetail";
import { OrderCardImageDownload } from "./OrderCardImageDownload";
import {
  COIN_COLORS,
  CoinType,
  fmtDate,
  formatCoinQtyFunder,
  useAccruedInterestFunder,
  FunderNoteRow,
  parseNotes,
  formatNoteTime,
  copyFunderNoteText,
  NoteAvatar,
  FunderOrderCard,
} from "./FunderOrderCard";

// ===== P&L 曲线图组件（复用自 OptionAnalysisPage）=====
function OptionPnlCanvas({
  data,
  strikePrice,
  currentPrice,
}: {
  data: { price: number; pnl: number }[];
  strikePrice: number;
  currentPrice?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragPrice, setDragPrice] = React.useState<number | null>(null);
  const isDraggingRef = useRef(false);
  const priceRangeRef = useRef<{ minP: number; maxP: number; W: number; padL: number; padR: number } | null>(null);
  const displayPrice = dragPrice ?? currentPrice;

  const xToPrice = useCallback((clientX: number) => {
    const range = priceRangeRef.current;
    const canvas = canvasRef.current;
    if (!range || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const { minP, maxP, W, padL, padR } = range;
    const logMin = Math.log(Math.max(minP, 1));
    const logMax = Math.log(Math.max(maxP, 1));
    const ratio = (x - padL) / (W - padL - padR);
    const p = Math.exp(logMin + ratio * (logMax - logMin));
    return Math.max(minP, Math.min(maxP, p));
  }, []);

  const toggleDragMode = useCallback(() => {
    if (isDraggingRef.current || dragPrice !== null) {
      isDraggingRef.current = false;
      setDragPrice(null);
    } else {
      isDraggingRef.current = true;
      if (currentPrice != null) setDragPrice(currentPrice);
    }
  }, [dragPrice, currentPrice]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const pad = { top: 24, right: 10, bottom: 28, left: 8 };
    const prices = data.map(d => d.price);
    const pnls = data.map(d => d.pnl);
    const minP = Math.min(...prices), maxP = Math.max(...prices);
    const rawMinV = Math.min(...pnls, 0);
    const rawMaxV = Math.max(...pnls, 0);
    // Y 轴：固定上限 50k，分五档，亏损区下方留白 35%
    const maxLossAbs = Math.abs(rawMinV) || 1000;
    const bottomMargin = Math.max(maxLossAbs * 0.35, 500);
    const minV = rawMinV - bottomMargin;
    const maxV = 52000; // 固定上限，稍大于 50k 让标签不被截断
    const vRange = maxV - minV || 1;
    const logMinP = Math.log(Math.max(minP, 1));
    const logMaxP = Math.log(Math.max(maxP, 1));
    const logPRange = logMaxP - logMinP || 1;
    const toX = (p: number) => pad.left + ((Math.log(Math.max(p, 1)) - logMinP) / logPRange) * (W - pad.left - pad.right);
    const toY = (v: number) => pad.top + ((maxV - v) / vRange) * (H - pad.top - pad.bottom);
    const zeroY = toY(0);
    priceRangeRef.current = { minP, maxP, W, padL: pad.left, padR: pad.right };

    // 背景：半透明深色覆盖，继承卡片紫色渐变背景
    ctx.fillStyle = 'rgba(30, 10, 60, 0.55)';
    ctx.fillRect(0, 0, W, H);

    // 网格线
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 3; i++) {
      const y = pad.top + (i / 3) * (H - pad.top - pad.bottom);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    }

    // 行权价处 P&L 插値
    const strikeInterp = (() => {
      for (let i = 1; i < data.length; i++) {
        const a = data[i - 1], b = data[i];
        if (a.price <= strikePrice && b.price >= strikePrice) {
          const t = (strikePrice - a.price) / (b.price - a.price);
          return a.pnl + t * (b.pnl - a.pnl);
        }
      }
      return data.find(d => d.price <= strikePrice)?.pnl ?? 0;
    })();
    const sX = toX(strikePrice);
    const sY = toY(strikeInterp);

    // 盈利区（红色）
    const profitGrad = ctx.createLinearGradient(0, pad.top, 0, zeroY);
    profitGrad.addColorStop(0, 'rgba(246,70,93,0.42)');
    profitGrad.addColorStop(1, 'rgba(246,70,93,0.05)');
    ctx.fillStyle = profitGrad;
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    data.forEach(d => ctx.lineTo(toX(d.price), toY(d.pnl)));
    ctx.lineTo(W - pad.right, zeroY);
    ctx.closePath();
    ctx.fill();

    // 亏损区（绿色）
    const lossGrad = ctx.createLinearGradient(0, zeroY, 0, H - pad.bottom);
    lossGrad.addColorStop(0, 'rgba(14,203,129,0.05)');
    lossGrad.addColorStop(1, 'rgba(14,203,129,0.42)');
    ctx.fillStyle = lossGrad;
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    data.filter(d => d.price <= strikePrice).forEach(d => ctx.lineTo(toX(d.price), toY(d.pnl)));
    ctx.lineTo(sX, sY);
    ctx.lineTo(sX, zeroY);
    ctx.closePath();
    ctx.fill();

    // 过渡区（灰色）
    const grayGrad = ctx.createLinearGradient(0, zeroY, 0, H - pad.bottom);
    grayGrad.addColorStop(0, 'rgba(160,160,160,0.05)');
    grayGrad.addColorStop(1, 'rgba(160,160,160,0.35)');
    ctx.fillStyle = grayGrad;
    ctx.beginPath();
    ctx.moveTo(sX, zeroY);
    ctx.lineTo(sX, sY);
    const negAfter = data.filter(d => d.price >= strikePrice && d.pnl < 0);
    negAfter.forEach(d => ctx.lineTo(toX(d.price), toY(d.pnl)));
    const beIdx = data.findIndex((d, i) => i > 0 && data[i-1].pnl < 0 && d.pnl >= 0);
    if (beIdx > 0) {
      const prev = data[beIdx - 1], curr = data[beIdx];
      const ratio = Math.abs(prev.pnl) / (Math.abs(prev.pnl) + Math.abs(curr.pnl));
      ctx.lineTo(toX(prev.price + ratio * (curr.price - prev.price)), zeroY);
    } else if (negAfter.length > 0) {
      ctx.lineTo(toX(negAfter[negAfter.length - 1].price), zeroY);
    }
    ctx.closePath();
    ctx.fill();

    // 零轴线
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(W - pad.right, zeroY);
    ctx.stroke();

    // Y 轴：固定 10k 步长，与期权分析总览一致
    ctx.font = 'bold 10px Inter, -apple-system, sans-serif';
    const yStep = 10000;
    const yTickStart = Math.ceil(minV / yStep) * yStep;
    let lastYBottom = Infinity;
    for (let v = yTickStart; v <= maxV; v += yStep) {
      const rawY = toY(v);
      if (rawY < pad.top + 4 || rawY > H - pad.bottom - 4) continue;
      // 每个刻度画分割线
      if (v !== 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(pad.left, rawY);
        ctx.lineTo(W - pad.right, rawY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // 负値（亏损区）不显示数字标签
      if (v < 0) continue;
      // 避免标签与上一个重叠
      if (rawY > lastYBottom - 12) continue;
      const absV = Math.abs(v);
      const label = v === 0 ? '0'
        : absV >= 1000 ? `+${Math.round(v / 1000)}k`
        : `+${Math.round(v)}`;
      ctx.fillStyle = v > 0 ? 'rgba(246,70,93,0.9)' : 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'left';
      ctx.fillText(label, pad.left + 2, v === 0 ? rawY - 4 : rawY + 3.5);
      lastYBottom = rawY;
    }

    // P&L 曲线（分段着色）
    ctx.lineWidth = 2;
    for (let i = 0; i < data.length - 1; i++) {
      const a = data[i], b = data[i + 1];
      if (a.pnl < 0 && b.pnl >= 0) {
        const ratio = Math.abs(a.pnl) / (Math.abs(a.pnl) + Math.abs(b.pnl));
        const cx = toX(a.price + ratio * (b.price - a.price));
        const segColorA = a.price > strikePrice ? 'rgba(160,160,160,0.85)' : '#0ECB81';
        ctx.strokeStyle = segColorA; ctx.beginPath(); ctx.moveTo(toX(a.price), toY(a.pnl)); ctx.lineTo(cx, zeroY); ctx.stroke();
        ctx.strokeStyle = '#F6465D'; ctx.beginPath(); ctx.moveTo(cx, zeroY); ctx.lineTo(toX(b.price), toY(b.pnl)); ctx.stroke();
        continue;
      }
      let segColor: string;
      if (a.pnl >= 0) segColor = '#F6465D';
      else if (a.price > strikePrice) segColor = 'rgba(160,160,160,0.85)';
      else segColor = '#0ECB81';
      ctx.strokeStyle = segColor;
      ctx.beginPath();
      ctx.moveTo(toX(a.price), toY(a.pnl));
      ctx.lineTo(toX(b.price), toY(b.pnl));
      ctx.stroke();
    }

    // BE 点
    ctx.font = 'bold 10px Inter, -apple-system, sans-serif';
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1], curr = data[i];
      if ((prev.pnl < 0 && curr.pnl >= 0) || (prev.pnl >= 0 && curr.pnl < 0)) {
        const ratio = Math.abs(prev.pnl) / (Math.abs(prev.pnl) + Math.abs(curr.pnl));
        const bePrice = prev.price + ratio * (curr.price - prev.price);
        const bx = toX(bePrice);
        ctx.fillStyle = '#F0B90B';
        ctx.beginPath();
        ctx.arc(bx, zeroY, 3, 0, Math.PI * 2);
        ctx.fill();
        const label = `${Math.round(bePrice)}U`;
        const tw = ctx.measureText(label).width;
        const lx = Math.min(bx + 5, W - pad.right - tw - 4);
        const ly = Math.min(zeroY + 14, H - pad.bottom - 2);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(lx - 2, ly - 10, tw + 6, 13);
        ctx.fillStyle = '#F0B90B';
        ctx.textAlign = 'left';
        ctx.fillText(label, lx, ly);
      }
    }

    // X 轴刻度（动态生成）
    // X 轴：固定稀疏刻度，与期权分析总览一致
    ctx.font = '9px Inter, -apple-system, sans-serif';
    ctx.fillStyle = 'rgba(132,142,156,0.8)';
    ctx.textAlign = 'center';
    const xTicks = [1400, 1600, 1800, 2000, 2500, 3000, 3500];
    let lastXRight = -Infinity;
    for (const p of xTicks) {
      if (p < minP || p > maxP) continue;
      const x = toX(p);
      if (x < pad.left + 10 || x > W - pad.right - 10) continue;
      const tw = ctx.measureText(String(p)).width;
      if (x - tw / 2 < lastXRight + 4) continue; // 避免重叠
      ctx.fillText(String(p), x, H - pad.bottom + 10);
      lastXRight = x + tw / 2;
    }

    // 行权价竖线
    if (strikePrice >= minP && strikePrice <= maxP) {
      const kx = toX(strikePrice);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(kx, pad.top);
      ctx.lineTo(kx, H - pad.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = '9px Inter, -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const klabel = `K${Math.round(strikePrice)}`;
      const ktw = ctx.measureText(klabel).width;
      const klx = Math.min(kx - ktw / 2, W - pad.right - ktw - 2);
      ctx.fillRect(klx - 2, pad.top + 2, ktw + 6, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'left';
      ctx.fillText(klabel, klx, pad.top + 12);
    }

    // 黄色竖线（实时价格）
    if (displayPrice != null && displayPrice >= minP && displayPrice <= maxP) {
      const cx = toX(displayPrice);
      ctx.strokeStyle = '#F0B90B';
      ctx.lineWidth = 0.8;
      ctx.setLineDash([]);
      const gap = 3;
      if (zeroY - gap > pad.top) {
        ctx.beginPath(); ctx.moveTo(cx, pad.top); ctx.lineTo(cx, zeroY - gap); ctx.stroke();
      }
      if (zeroY + gap < H - pad.bottom) {
        ctx.beginPath(); ctx.moveTo(cx, zeroY + gap); ctx.lineTo(cx, H - pad.bottom); ctx.stroke();
      }
      ctx.font = 'bold 9px Inter, -apple-system, sans-serif';
      const clabel = `${Math.round(displayPrice)}U`;
      const ctw = ctx.measureText(clabel).width;
      const clx = Math.min(cx - ctw / 2, W - pad.right - ctw - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(clx - 2, H - pad.bottom - 14, ctw + 6, 12);
      ctx.fillStyle = '#F0B90B';
      ctx.textAlign = 'left';
      ctx.fillText(clabel, clx, H - pad.bottom - 4);

      if (dragPrice !== null) {
        let pnlAtDrag = 0;
        for (let i = 1; i < data.length; i++) {
          if (data[i - 1].price <= displayPrice && data[i].price >= displayPrice) {
            const t = (displayPrice - data[i - 1].price) / (data[i].price - data[i - 1].price);
            pnlAtDrag = data[i - 1].pnl + t * (data[i].pnl - data[i - 1].pnl);
            break;
          }
        }
        const pnlLabel = pnlAtDrag >= 0 ? `+${Math.round(pnlAtDrag)}U` : `${Math.round(pnlAtDrag)}U`;
        const pnlColor = pnlAtDrag >= 0 ? '#F6465D' : '#0ECB81';
        ctx.font = 'bold 10px Inter, -apple-system, sans-serif';
        const ptw = ctx.measureText(pnlLabel).width;
        const plx = Math.max(pad.left + 2, Math.min(cx - ptw / 2, W - pad.right - ptw - 4));
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(plx - 3, pad.top + 4, ptw + 8, 15);
        ctx.fillStyle = pnlColor;
        ctx.textAlign = 'left';
        ctx.fillText(pnlLabel, plx, pad.top + 15);
      }
    }
  }, [data, strikePrice, displayPrice]);

  const isDragMode = dragPrice !== null;
  return (
    <div style={{ position: 'relative', width: '100%', height: 260 }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: 260, display: 'block', touchAction: isDragMode ? 'none' : 'auto' }}
        onTouchMove={isDragMode ? (e) => { e.preventDefault(); const p = xToPrice(e.touches[0].clientX); if (p !== null) setDragPrice(p); } : undefined}
        onTouchEnd={isDragMode ? () => { isDraggingRef.current = false; } : undefined}
        onMouseMove={isDragMode ? (e) => { const p = xToPrice(e.clientX); if (p !== null) setDragPrice(p); } : undefined}
        onMouseUp={isDragMode ? () => { isDraggingRef.current = false; } : undefined}
        onMouseLeave={isDragMode ? () => { isDraggingRef.current = false; } : undefined}
      />
      <button
        onClick={toggleDragMode}
        style={{
          position: 'absolute', bottom: 28, right: 6, width: 28, height: 28,
          borderRadius: '50%',
          border: isDragMode ? '1.5px solid #F6C90E' : '1.5px solid rgba(255,255,255,0.25)',
          background: isDragMode ? 'rgba(246,201,14,0.18)' : 'rgba(0,0,0,0.45)',
          color: isDragMode ? '#F6C90E' : 'rgba(255,255,255,0.5)',
          fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', zIndex: 10, lineHeight: 1, padding: 0,
        }}
      >⇔</button>
    </div>
  );
}

// OKX 风格颜色系统
const OKX_BG = "#0B0E11";
const OKX_CARD = "#161A1E";
const OKX_CARD2 = "#1C2128";       // 次要行背景
const OKX_BORDER = "rgba(255,255,255,0.08)";
const OKX_TEXT_PRI = "#EAECEF";    // 主文字
const OKX_TEXT_SEC = "rgba(255,255,255,0.40)"; // 次要文字
const OKX_TEXT_DIM = "rgba(255,255,255,0.18)"; // 极弱文字（服务费）
const OKX_YELLOW = "#F0B90B";      // 金黄主色
const OKX_GREEN = "#F6465D";       // 涨 = 红（中国习惯）
const OKX_RED = "#0ECB81";         // 跌 = 绿（中国习惯）
const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, 'PingFang SC', sans-serif";

const DEFAULT_CNY_RATE = 6.8;

// 读取利率字符串，当利率为0时从 display_config.rate_negative 判断符号
function getDisplayMode(order: any, key: string, fallback = 'U'): string {
  try {
    const raw = order?.display_config;
    const parsed = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    return typeof parsed?.[key] === 'string' ? parsed[key] : fallback;
  } catch {
    return fallback;
  }
}

function getBooleanDisplayFlag(order: any, key: string, fallback = false): boolean {
  try {
    const raw = order?.display_config;
    const parsed = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    return typeof parsed?.[key] === 'boolean' ? parsed[key] : fallback;
  } catch {
    return fallback;
  }
}

function getExactFinancingDisplayAmount(order: any, amountCurrency: string, calculatedAmount: number): number {
  try {
    const raw = order?.display_config;
    const parsed = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    const savedAmount = Number(parsed?.financingInputAmount);
    const savedCurrencyRaw = String(parsed?.financingInputCurrency || '').toUpperCase();
    const savedCurrency = savedCurrencyRaw === 'U' ? 'USDT' : savedCurrencyRaw === 'RMB' ? 'CNY' : savedCurrencyRaw;
    if (savedAmount > 0 && savedCurrency === amountCurrency) return savedAmount;
  } catch {}
  const interestBase = Number(order?.interest_base || 0);
  const interestCurrencyRaw = String(order?.interest_base_currency || '').toUpperCase();
  const interestCurrency = interestCurrencyRaw === 'U' ? 'USDT' : interestCurrencyRaw === 'RMB' ? 'CNY' : interestCurrencyRaw;
  if (interestBase > 0 && interestCurrency === amountCurrency && Math.abs(interestBase - calculatedAmount) <= 0.05) return interestBase;
  return calculatedAmount;
}

function getRateStr(order: any): string {
  const r = String(order.interest_rate_annual ?? '');
  if (r.startsWith('-')) return r;
  // 利率为0或空时，检查 display_config.rate_negative
  const rNum = parseFloat(r);
  if (rNum === 0 || r === '' || r === '0') {
    try {
      const dc = order.display_config;
      const parsed = dc ? (typeof dc === 'string' ? JSON.parse(dc) : dc) : null;
      if (parsed?.rate_negative === true) return '-0';
    } catch {}
  }
  return r;
}

interface FunderOrderCardV2Props {
  order: any;
  livePrices: Record<string, number>;
  priceDirection?: Record<string, "up" | "down" | "same">;
  cnyRate?: number;
  membersData?: any[];
  ledgerId?: number;
  currentUser?: { id: number; name?: string; username?: string; avatar?: string };
  /** 管理员订单列表始终显示下载按钮；普通用户仍受逐单权限控制 */
  isAdmin?: boolean;
  /** 共享担保弹窗点击订单号时，用于打开订单模式详情 */
  allOrders?: any[];
}

export function FunderOrderCardV2({
  order,
  livePrices,
  priceDirection = {},
  cnyRate = DEFAULT_CNY_RATE,
}: FunderOrderCardV2Props) {
  const [feeExpanded, setFeeExpanded] = useState(false);

  const coin = (order.coin || "ETH") as CoinType;
  const coinColor = COIN_COLORS[coin] || "#F0B90B";
  const qty = parseFloat(order.buy_quantity || "0");
  const buyPrice = parseFloat(order.buy_price || "0");
  const liveP = livePrices[coin] ?? null;

  // 当前市值 & 浮盈
  const currentValue = liveP !== null && qty > 0 ? liveP * qty : null;
  const buyValue = qty > 0 && buyPrice > 0 ? qty * buyPrice : parseFloat(order.amount || "0");
  const _isShort = (order as any).trade_direction === 'short';
  // 做空时取反：跌了是盈，涨了是亏
  const floatPnl = currentValue !== null && buyValue > 0
    ? (_isShort ? buyValue - currentValue : currentValue - buyValue)
    : null;
  const floatPct = floatPnl !== null && buyValue > 0 ? (floatPnl / buyValue) * 100 : null;
  const pnlColor = floatPnl === null ? OKX_TEXT_SEC : floatPnl >= 0 ? OKX_GREEN : OKX_RED;

  // 当前价涨跌
  const dir = priceDirection?.[coin] ?? "same";
  const priceDiff = liveP !== null && buyPrice > 0 ? liveP - buyPrice : null;
  const priceColor = priceDiff === null ? OKX_TEXT_PRI : priceDiff >= 0 ? OKX_GREEN : OKX_RED;

  // 利息计算
  const rateStr = getRateStr(order);
  const rateAbs = formatFunderAnnualRate(rateStr);
  const accrued = useAccruedInterestFunder(
    order.status === "active" ? order.interest_base : null,
    order.status === "active" ? order.interest_rate_annual : null,
    order.status === "active" ? order.interest_start_date : null,
    order.settled_at
  );
  const baseCur = order.interest_base_currency || "USDT";
  const rateCur = order.interest_rate_currency || "USDT";
  const interestUnit = rateCur === "CNY" ? "元" : "U";
  const convertAccrued = (val: number): number => {
    if (baseCur === rateCur) return val;
    if (baseCur === "USDT" && rateCur === "CNY") return val * cnyRate;
    if (baseCur === "CNY" && rateCur === "USDT") return val / cnyRate;
    return val;
  };
  const displayAccrued = convertAccrued(accrued);

  // 持有时长
  const holdDurationLabel = (() => {
    if (!order.buy_date) return "--";
    const endTs = order.settled_at ? new Date(order.settled_at).getTime() : Date.now();
    const elapsed = endTs - new Date(order.buy_date + "T00:00:00+08:00").getTime();
    if (elapsed <= 0) return "0小时";
    const totalHours = Math.floor(elapsed / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
  })();

  // 担保物
  let collateralAssets: { coin: string; qty: string }[] = [];
  try {
    const rawCA = order.collateral_assets;
    if (rawCA) {
      const parsed = typeof rawCA === "string" ? JSON.parse(rawCA) : rawCA;
      if (Array.isArray(parsed)) collateralAssets = parsed;
    }
  } catch {}

  const fmt = (v: number | null, digits = 2) =>
    v == null || isNaN(v) ? "--" : v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: OKX_CARD,
        border: `1px solid rgba(192,192,192,0.12)`,
        boxShadow: "0 2px 16px rgba(0,0,0,0.4)",
        fontFamily: FONT,
      }}
    >
      {/* ── 行1：标签行 ── */}
      <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-2 flex-wrap">
        {/* 币种标签 */}
        <span
          className="text-xs font-bold px-2 py-0.5 rounded"
          style={{ backgroundColor: "rgba(255,255,255,0.10)", color: OKX_TEXT_PRI }}
        >
          {coin}
        </span>
        {/* 数字币标签 */}
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{ backgroundColor: "rgba(255,255,255,0.05)", color: OKX_TEXT_SEC }}
        >
          数字币
        </span>
        {/* 持有时长 */}
        <span className="text-[10px]" style={{ color: OKX_TEXT_SEC }}>
          {holdDurationLabel}
        </span>
        {/* 订单号 */}
        {order.order_no && (
          <span
            className="ml-auto text-[10px] font-mono"
            style={{ color: "rgba(255,255,255,0.25)", letterSpacing: "0.05em" }}
          >
            {order.order_no}
          </span>
        )}
      </div>

      {/* ── 行2：主数据行（4列）—— 持有量 / 买入价 / 当前价 / 浮盈 ── */}
      <div
        className="grid grid-cols-4 gap-0 px-3 py-3"
        style={{ borderTop: `1px solid ${OKX_BORDER}` }}
      >
        {/* 持有数量 */}
        <div>
          <div className="text-[10px] mb-1" style={{ color: OKX_TEXT_SEC }}>
            {(order as any).principal_lent_out === 1 || (order as any).principal_lent_out === true ? `借出资产 (${coin})` : '持有数量'}
          </div>
          <div className="flex items-baseline gap-1" style={{ lineHeight: 1 }}>
            <span
              style={{
                fontSize: "1.15rem",
                fontWeight: 800,
                color: OKX_TEXT_PRI,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.02em",
              }}
            >
              {formatCoinQtyFunder(qty, coin)}
            </span>
            <span style={{ fontSize: "0.65rem", color: OKX_TEXT_SEC, fontWeight: 600 }}>{coin}</span>
          </div>
        </div>

        {/* 买入价 */}
        <div className="text-center">
          <div className="text-[10px] mb-1" style={{ color: OKX_TEXT_SEC }}>买入价</div>
          <div className="flex items-baseline justify-center gap-1" style={{ lineHeight: 1 }}>
            <span
              style={{
                fontSize: "0.9rem",
                fontWeight: 700,
                color: OKX_TEXT_PRI,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.01em",
              }}
            >
              {buyPrice > 0 ? fmt(buyPrice, 0) : "--"}
            </span>
            <span style={{ fontSize: "0.6rem", color: OKX_TEXT_SEC }}>U</span>
          </div>
        </div>

        {/* 当前价 */}
        <div className="text-center">
          <div className="text-[10px] mb-1" style={{ color: OKX_TEXT_SEC }}>当前价</div>
          <div className="flex items-baseline justify-center gap-1" style={{ lineHeight: 1 }}>
            <span
              style={{
                fontSize: "0.9rem",
                fontWeight: 700,
                color: OKX_TEXT_PRI,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.01em",
              }}
            >
              {liveP != null ? fmt(liveP, 0) : "--"}
            </span>
            <span style={{ fontSize: "0.6rem", color: OKX_TEXT_SEC }}>U</span>
          </div>
          {priceDiff !== null && (
            <div
              className="text-[9px] mt-0.5"
              style={{ color: priceColor, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
            >
              {dir === "up" ? "▲" : dir === "down" ? "▼" : ""}
              {priceDiff >= 0 ? "+" : ""}{fmt(priceDiff, 0)}
            </div>
          )}
        </div>

        {/* 浮动盈亏 */}
        <div className="text-right">
          <div className="text-[10px] mb-1" style={{ color: OKX_TEXT_SEC }}>浮动盈亏</div>
          {(order as any).order_fill_status === 'pending' ? (
            <div className="flex items-baseline justify-end" style={{ lineHeight: 1 }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 800, color: '#F97316', letterSpacing: "-0.01em" }}>挂单中</span>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-end gap-1" style={{ lineHeight: 1 }}>
                <span
                  style={{
                    fontSize: "0.9rem",
                    fontWeight: 800,
                    color: pnlColor,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {floatPnl != null
                    ? `${floatPnl >= 0 ? "+" : ""}${fmt(floatPnl, 0)}`
                    : "--"}
                </span>
                {floatPnl != null && <span style={{ fontSize: "0.6rem", color: OKX_TEXT_SEC }}>U</span>}
              </div>
              {floatPct != null && (
                <div
                  className="text-[9px] mt-0.5"
                  style={{ color: pnlColor, fontVariantNumeric: "tabular-nums" }}
                >
                  {floatPct >= 0 ? "+" : ""}{floatPct.toFixed(2)}%
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── 行3：次要数据行（3列）—— 当前市值 / 开仓日期 / 担保物 ── */}
      <div
        className="grid grid-cols-3 gap-0 px-3 py-2"
        style={{ borderTop: `1px solid ${OKX_BORDER}`, background: "rgba(0,0,0,0.18)" }}
      >
        <div>
          <div className="text-[10px] mb-0.5" style={{ color: OKX_TEXT_SEC }}>当前市值</div>
          <div
            className="text-sm"
            style={{ color: OKX_TEXT_PRI, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}
          >
            {currentValue != null ? fmt(currentValue, 0) : "--"}
            <span style={{ fontSize: "0.6rem", color: OKX_TEXT_SEC, marginLeft: 2 }}>U</span>
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] mb-0.5" style={{ color: OKX_TEXT_SEC }}>开仓日期</div>
          <div
            className="text-sm"
            style={{ color: OKX_TEXT_PRI, fontVariantNumeric: "tabular-nums" }}
          >
            {order.buy_date ? fmtDate(order.buy_date) : "--"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] mb-0.5" style={{ color: OKX_TEXT_SEC }}>担保资产</div>
          <div className="text-sm" style={{ color: (order as any).collateral_share_mode === 'self' ? '#A80000' : OKX_TEXT_PRI }}>
            {(order as any).collateral_share_mode === 'self'
              ? '共享担保'
              : collateralAssets.length > 0
                ? <>{collateralAssets.map((c, i) => <div key={i}>{c.qty} {c.coin}</div>)}</>
                : "--"}
          </div>
        </div>
      </div>

      {/* ── 行4：服务费（极弱化，可折叠）── */}
      <button
        className="w-full flex items-center justify-between px-3 py-2"
        style={{ borderTop: `1px solid ${OKX_BORDER}` }}
        onClick={() => setFeeExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: OKX_TEXT_DIM }}>
            服务费
          </span>
          {rateAbs && (
            <span
              className="text-[9px] px-1 py-0.5 rounded"
              style={{ background: "rgba(255,255,255,0.04)", color: OKX_TEXT_DIM }}
            >
              年化 {rateAbs}%
            </span>
          )}
          <span
            className="text-[10px] tabular-nums"
            style={{ color: OKX_TEXT_DIM, fontVariantNumeric: "tabular-nums" }}
          >
            待付 {fmt(displayAccrued, 2)} {interestUnit}
          </span>
        </div>
        {feeExpanded
          ? <ChevronUp className="w-3 h-3" style={{ color: OKX_TEXT_DIM }} />
          : <ChevronDown className="w-3 h-3" style={{ color: OKX_TEXT_DIM }} />}
      </button>

      {/* 服务费详情（展开） */}
      {feeExpanded && (
        <div
          className="px-3 pb-3 space-y-1.5 text-[10px]"
          style={{ background: "rgba(0,0,0,0.12)" }}
        >
          <div className="flex justify-between">
            <span style={{ color: OKX_TEXT_DIM }}>计息基数</span>
            <span style={{ color: OKX_TEXT_DIM }}>
              {order.interest_base
                ? parseFloat(order.interest_base).toLocaleString(undefined, { maximumFractionDigits: 2 })
                : "--"} {interestUnit}
            </span>
          </div>
          {order.interest_start_date && (
            <div className="flex justify-between">
              <span style={{ color: OKX_TEXT_DIM }}>计息日期</span>
              <span style={{ color: OKX_TEXT_DIM }}>{fmtDate(order.interest_start_date)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span style={{ color: OKX_TEXT_DIM }}>付息方式</span>
            <span style={{ color: OKX_TEXT_DIM }}>
              {({'monthly_pre':'月付先付','monthly_post':'月付后付','semi_pre':'半年付先付','semi_post':'半年付后付','annual_pre':'年付先付','annual_post':'年付后付','end_post':'结束后付','monthly_prepaid':'月付先付','monthly_postpaid':'月付后付','quarterly':'季付','maturity':'到期付','profit_post':'盈利后付','profit_pre':'盈利先付'} as any)[order.interest_payment_type] || order.interest_payment_type || '--'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 浅色版（白天模式）─────────────────────────────────────────────────────────
const LT_CARD = "#FFFFFF";
const LT_CARD2 = "#F8FAFC";
const LT_BORDER = "rgba(0,0,0,0.07)";
const LT_TEXT_PRI = "#0F1923";    // 主文字
const LT_TEXT_SEC = "rgba(0,0,0,0.40)"; // 次要文字
const LT_TEXT_DIM = "rgba(0,0,0,0.18)"; // 极弱文字（服务费）
const LT_GREEN = "#F6465D";  // 涨 = 红
const LT_RED = "#0ECB81";    // 跌 = 绿

export function FunderOrderCardV2Light({
  order,
  livePrices,
  priceDirection = {},
  cnyRate = DEFAULT_CNY_RATE,
}: FunderOrderCardV2Props) {
  const [feeExpanded, setFeeExpanded] = useState(false);

  const coin = (order.coin || "ETH") as CoinType;
  const qty = parseFloat(order.buy_quantity || "0");
  const buyPrice = parseFloat(order.buy_price || "0");
  const liveP = livePrices[coin] ?? null;

  const currentValue = liveP !== null && qty > 0 ? liveP * qty : null;
  const buyValue = qty > 0 && buyPrice > 0 ? qty * buyPrice : parseFloat(order.amount || "0");
  const _isShortLt = (order as any).trade_direction === 'short';
  const floatPnl = currentValue !== null && buyValue > 0
    ? (_isShortLt ? buyValue - currentValue : currentValue - buyValue)
    : null;
  const floatPct = floatPnl !== null && buyValue > 0 ? (floatPnl / buyValue) * 100 : null;
  const pnlColor = floatPnl === null ? LT_TEXT_SEC : floatPnl >= 0 ? LT_GREEN : LT_RED;

  const dir = priceDirection?.[coin] ?? "same";
  const priceDiff = liveP !== null && buyPrice > 0 ? liveP - buyPrice : null;
  const priceColor = priceDiff === null ? LT_TEXT_PRI : priceDiff >= 0 ? LT_GREEN : LT_RED;

  const rateStr = getRateStr(order);
  const rateAbs = formatFunderAnnualRate(rateStr);
  const accrued = useAccruedInterestFunder(
    order.status === "active" ? order.interest_base : null,
    order.status === "active" ? order.interest_rate_annual : null,
    order.status === "active" ? order.interest_start_date : null,
    order.settled_at
  );
  const baseCur = order.interest_base_currency || "USDT";
  const rateCur = order.interest_rate_currency || "USDT";
  const interestUnit = rateCur === "CNY" ? "元" : "U";
  const convertAccrued = (val: number): number => {
    if (baseCur === rateCur) return val;
    if (baseCur === "USDT" && rateCur === "CNY") return val * cnyRate;
    if (baseCur === "CNY" && rateCur === "USDT") return val / cnyRate;
    return val;
  };
  const displayAccrued = convertAccrued(accrued);

  const holdDurationLabel = (() => {
    if (!order.buy_date) return "--";
    const endTs = order.settled_at ? new Date(order.settled_at).getTime() : Date.now();
    const elapsed = endTs - new Date(order.buy_date + "T00:00:00+08:00").getTime();
    if (elapsed <= 0) return "0小时";
    const totalHours = Math.floor(elapsed / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
  })();

  let collateralAssets: { coin: string; qty: string }[] = [];
  try {
    const rawCA = order.collateral_assets;
    if (rawCA) {
      const parsed = typeof rawCA === "string" ? JSON.parse(rawCA) : rawCA;
      if (Array.isArray(parsed)) collateralAssets = parsed;
    }
  } catch {}

  const fmt = (v: number | null, digits = 2) =>
    v == null || isNaN(v) ? "--" : v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: LT_CARD,
        border: `1px solid rgba(0,0,0,0.10)`,
        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        fontFamily: FONT,
      }}
    >
      {/* 行1：标签行 */}
      <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-2 flex-wrap">
        <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(0,0,0,0.07)", color: LT_TEXT_PRI }}>
          {coin}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(0,0,0,0.04)", color: LT_TEXT_SEC }}>
          数字币
        </span>

        <span className="text-[10px]" style={{ color: LT_TEXT_SEC }}>{holdDurationLabel}</span>
        {order.order_no && (
          <span className="ml-auto text-[10px] font-mono" style={{ color: LT_TEXT_DIM, letterSpacing: "0.05em" }}>
            {order.order_no}
          </span>
        )}
      </div>

      {/* 行2：主数据行（4列） */}
      <div className="grid grid-cols-4 gap-0 px-3 py-3" style={{ borderTop: `1px solid ${LT_BORDER}` }}>
        <div>
          <div className="text-[10px] mb-1" style={{ color: LT_TEXT_SEC }}>
            {(order as any).principal_lent_out === 1 || (order as any).principal_lent_out === true ? `借出资产 (${coin})` : '持有数量'}
          </div>
          <div className="flex items-baseline gap-1" style={{ lineHeight: 1 }}>
            <span style={{ fontSize: "1.15rem", fontWeight: 800, color: LT_TEXT_PRI, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
              {fmt(qty, 2)}
            </span>
            <span style={{ fontSize: "0.65rem", color: LT_TEXT_SEC, fontWeight: 600 }}>{coin}</span>
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] mb-1" style={{ color: LT_TEXT_SEC }}>买入价</div>
          <div className="flex items-baseline justify-center gap-1" style={{ lineHeight: 1 }}>
            <span style={{ fontSize: "0.9rem", fontWeight: 700, color: LT_TEXT_PRI, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
              {buyPrice > 0 ? fmt(buyPrice, 0) : "--"}
            </span>
            <span style={{ fontSize: "0.6rem", color: LT_TEXT_SEC }}>U</span>
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] mb-1" style={{ color: LT_TEXT_SEC }}>当前价</div>
          <div className="flex items-baseline justify-center gap-1" style={{ lineHeight: 1 }}>
            <span style={{ fontSize: "0.9rem", fontWeight: 700, color: LT_TEXT_PRI, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
              {liveP != null ? fmt(liveP, 0) : "--"}
            </span>
            <span style={{ fontSize: "0.6rem", color: LT_TEXT_SEC }}>U</span>
          </div>
          {priceDiff !== null && (
            <div className="text-[9px] mt-0.5" style={{ color: priceColor, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
              {dir === "up" ? "▲" : dir === "down" ? "▼" : ""}{priceDiff >= 0 ? "+" : ""}{fmt(priceDiff, 0)}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-[10px] mb-1" style={{ color: LT_TEXT_SEC }}>浮动盈亏</div>
          {(order as any).order_fill_status === 'pending' ? (
            <div className="flex items-baseline justify-end" style={{ lineHeight: 1 }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 800, color: '#F97316', letterSpacing: "-0.01em" }}>挂单中</span>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-end gap-1" style={{ lineHeight: 1 }}>
                <span style={{ fontSize: "0.9rem", fontWeight: 800, color: pnlColor, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                  {floatPnl != null ? `${floatPnl >= 0 ? "+" : ""}${fmt(floatPnl, 0)}` : "--"}
                </span>
                {floatPnl != null && <span style={{ fontSize: "0.6rem", color: LT_TEXT_SEC }}>U</span>}
              </div>
              {floatPct != null && (
                <div className="text-[9px] mt-0.5" style={{ color: pnlColor, fontVariantNumeric: "tabular-nums" }}>
                  {floatPct >= 0 ? "+" : ""}{floatPct.toFixed(2)}%
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 行3：次要数据行（3列） */}
      <div className="grid grid-cols-3 gap-0 px-3 py-2" style={{ borderTop: `1px solid ${LT_BORDER}`, background: "rgba(0,0,0,0.02)" }}>
        <div>
          <div className="text-[10px] mb-0.5" style={{ color: LT_TEXT_SEC }}>当前市值</div>
          <div className="text-sm" style={{ color: LT_TEXT_PRI, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
            {currentValue != null ? fmt(currentValue, 0) : "--"}
            <span style={{ fontSize: "0.6rem", color: LT_TEXT_SEC, marginLeft: 2 }}>U</span>
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] mb-0.5" style={{ color: LT_TEXT_SEC }}>开仓日期</div>
          <div className="text-sm" style={{ color: LT_TEXT_PRI }}>
            {order.buy_date ? fmtDate(order.buy_date) : "--"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] mb-0.5" style={{ color: LT_TEXT_SEC }}>担保资产</div>
          <div className="text-sm" style={{ color: (order as any).collateral_share_mode === 'self' ? '#A80000' : LT_TEXT_PRI }}>
            {(order as any).collateral_share_mode === 'self'
              ? '共享担保'
              : collateralAssets.length > 0 ? <>{collateralAssets.map((c, i) => <div key={i}>{c.qty} {c.coin}</div>)}</> : "--"}
          </div>
        </div>
      </div>

      {/* 行4：服务费（极弱化，可折叠） */}
      <button
        className="w-full flex items-center justify-between px-3 py-2"
        style={{ borderTop: `1px solid ${LT_BORDER}` }}
        onClick={() => setFeeExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: LT_TEXT_DIM }}>服务费</span>
          {rateAbs && (
            <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.04)", color: LT_TEXT_DIM }}>
              年化 {rateAbs}%
            </span>
          )}
          <span className="text-[10px] tabular-nums" style={{ color: LT_TEXT_DIM, fontVariantNumeric: "tabular-nums" }}>
            待付 {fmt(displayAccrued, 2)} {interestUnit}
          </span>
        </div>
        {feeExpanded
          ? <ChevronUp className="w-3 h-3" style={{ color: LT_TEXT_DIM }} />
          : <ChevronDown className="w-3 h-3" style={{ color: LT_TEXT_DIM }} />}
      </button>

      {feeExpanded && (
        <div className="px-3 pb-3 space-y-1.5 text-[10px]" style={{ background: "rgba(0,0,0,0.02)" }}>
          <div className="flex justify-between">
            <span style={{ color: LT_TEXT_DIM }}>计息基数</span>
            <span style={{ color: LT_TEXT_DIM }}>
              {order.interest_base ? parseFloat(order.interest_base).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "--"} {interestUnit}
            </span>
          </div>
          {order.interest_start_date && (
            <div className="flex justify-between">
              <span style={{ color: LT_TEXT_DIM }}>计息日期</span>
              <span style={{ color: LT_TEXT_DIM }}>{fmtDate(order.interest_start_date)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span style={{ color: LT_TEXT_DIM }}>付息方式</span>
            <span style={{ color: LT_TEXT_DIM }}>
              {({'monthly_pre':'月付先付','monthly_post':'月付后付','semi_pre':'半年付先付','semi_post':'半年付后付','annual_pre':'年付先付','annual_post':'年付后付','end_post':'结束后付','monthly_prepaid':'月付先付','monthly_postpaid':'月付后付','quarterly':'季付','maturity':'到期付','profit_post':'盈利后付','profit_pre':'盈利先付'} as any)[order.interest_payment_type] || order.interest_payment_type || '--'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 银色拉丝版（名牌金属风格）────────────────────────────────────────────────
// 銀色磨砂底色：左上亮、右下暗，模拟左上方光源
const SL_BG = [
  // 层1：强烈斜向高光（左上角极亮，右下角极暗）
  'linear-gradient(135deg, rgba(255,255,255,0.80) 0%, rgba(255,255,255,0.30) 25%, rgba(255,255,255,0.0) 50%, rgba(0,0,0,0.0) 65%, rgba(0,0,0,0.20) 100%)',
  // 层2：水平光影分层（左亮右暗，增加纵深感）
  'linear-gradient(90deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.05) 40%, rgba(0,0,0,0.0) 60%, rgba(0,0,0,0.12) 100%)',
  // 层3：垂直光影（中间微亮，上下稍暗，模拟弧面金属）
  'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(255,255,255,0.18) 35%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.10) 70%, rgba(0,0,0,0.08) 100%)',
  // 层4：冷銀底色（更饱和的銀色）
  'linear-gradient(160deg, #d8dadf 0%, #b8bcc4 20%, #cdd0d6 45%, #b0b4bc 65%, #c8cbd2 80%, #d2d5da 100%)',
].join(', ');
const SL_BORDER = '1.5px solid rgba(200,205,210,0.9)';
const SL_SHADOW = [
  '0 6px 20px rgba(0,0,0,0.30)',          // 外部阴影
  '0 1px 3px rgba(0,0,0,0.20)',            // 近处阴影
  'inset 0 1.5px 0 rgba(255,255,255,0.90)', // 顶部亮边（模拟金属上边反光）
  'inset 0 -1.5px 0 rgba(100,105,115,0.50)', // 底部暗边（增加厚度感）
  'inset 1.5px 0 rgba(255,255,255,0.30)',   // 左侧亮边
  'inset -1.5px 0 rgba(0,0,0,0.10)',        // 右侧暗边
].join(', ');
const SL_RIVET_BG = 'radial-gradient(circle at 35% 35%, #ffffff 0%, #d8dadd 35%, #a0a4aa 65%, #707478 100%)';
// 期权紫色磨砂主题
const OPT_BG = [
  'linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.18) 22%, rgba(255,255,255,0.0) 45%, rgba(0,0,0,0.0) 60%, rgba(0,0,0,0.22) 100%)',
  'linear-gradient(90deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.05) 38%, rgba(0,0,0,0.0) 58%, rgba(0,0,0,0.14) 100%)',
  'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(255,255,255,0.16) 35%, rgba(255,255,255,0.22) 50%, rgba(255,255,255,0.08) 70%, rgba(0,0,0,0.10) 100%)',
  'linear-gradient(160deg, #5b21b6 0%, #7c3aed 18%, #8b5cf6 40%, #6d28d9 62%, #7c3aed 80%, #5b21b6 100%)',
].join(', ');
const OPT_BORDER = '1.5px solid rgba(109,40,217,0.90)';
const OPT_SHADOW = [
  '0 6px 20px rgba(91,33,182,0.35)',
  '0 1px 3px rgba(0,0,0,0.25)',
  'inset 0 1.5px 0 rgba(216,180,254,0.88)',
  'inset 0 -1.5px 0 rgba(46,16,101,0.62)',
  'inset 1.5px 0 rgba(167,139,250,0.28)',
  'inset -1.5px 0 rgba(0,0,0,0.16)',
].join(', ');
const OPT_RIVET_BG = 'radial-gradient(circle at 35% 35%, #ede9fe 0%, #a78bfa 35%, #6d28d9 65%, #3b0764 100%)';
// 期权紫色卡片专属白色文字常量（深紫背景上使用）
const OPT_TEXT_PRI = 'rgba(255,255,255,0.95)';    // 主文字：亮白
const OPT_TEXT_SEC = 'rgba(255,255,255,0.65)';    // 次要文字：半透明白
const OPT_TEXT_DIM = 'rgba(255,255,255,0.45)';    // 弱化文字：更透明白
const OPT_TEXT_SHADOW = '0 1px 2.5px rgba(0,0,0,0.60), 0 -0.5px 1px rgba(255,255,255,0.22)'; // 黑白反射渐变光泽字
const OPT_TEXT_SHADOW_LG = '0 1px 3px rgba(0,0,0,0.65), 0 -0.5px 1.5px rgba(255,255,255,0.25)'; // 大字加强版
const OPT_DIVIDER = 'rgba(255,255,255,0.15)';     // 分隔线：白色半透明
const SL_TEXT_PRI = '#1A1A1A';
const SL_NUM_FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, 'PingFang SC', sans-serif";
// G柔光凹刻（强度减半）：下方白色柔光 + 上方深影
const SL_TEXT_SHADOW = '0 1px 1.5px rgba(255,255,255,0.48), 0 -0.5px 1px rgba(0,0,0,0.18)';
// 大字加强版
const SL_TEXT_SHADOW_LG = '0 1px 2px rgba(255,255,255,0.48), 0 -0.5px 1.5px rgba(0,0,0,0.20)';
// 凹刻同款（年化利率区域用）
const SL_TEXT_ENGRAVE = '0 1px 1.5px rgba(255,255,255,0.48), 0 -0.5px 1px rgba(0,0,0,0.18)';
// 凹刻大字加强版
const SL_TEXT_ENGRAVE_LG = '0 1px 2px rgba(255,255,255,0.48), 0 -0.5px 1.5px rgba(0,0,0,0.20)';
const SL_TEXT_SEC = 'rgba(0,0,0,0.45)';
const SL_TEXT_DIM = 'rgba(0,0,0,0.38)';  // 弱化但在銀色背景上可见
const SL_GOLD = SL_TEXT_PRI;     // 去掉金色，改用主文字色
const SL_DIVIDER = 'rgba(0,0,0,0.08)';
const SL_GREEN = '#A80000';      // 涨 = 深红（中国习惯）
const SL_RED = '#16A34A';        // 跌 = 绿色
const LN_EARN = '#C00000';       // 收益型卡片应收利息颜色（深红）
// 参与者绿色磨砂主题
const GRN_BG = [
  'linear-gradient(135deg, rgba(255,255,255,0.50) 0%, rgba(255,255,255,0.15) 22%, rgba(255,255,255,0.0) 45%, rgba(0,0,0,0.0) 60%, rgba(0,0,0,0.20) 100%)',
  'linear-gradient(90deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.05) 38%, rgba(0,0,0,0.0) 58%, rgba(0,0,0,0.12) 100%)',
  'linear-gradient(180deg, rgba(0,0,0,0.06) 0%, rgba(255,255,255,0.14) 35%, rgba(255,255,255,0.20) 50%, rgba(255,255,255,0.06) 70%, rgba(0,0,0,0.08) 100%)',
  'linear-gradient(160deg, #064e3b 0%, #065f46 18%, #047857 40%, #059669 62%, #047857 80%, #064e3b 100%)',
].join(', ');
const GRN_BORDER = '1.5px solid rgba(4,120,87,0.90)';
const GRN_SHADOW = [
  '0 6px 20px rgba(4,120,87,0.35)',
  '0 1px 3px rgba(0,0,0,0.25)',
  'inset 0 1.5px 0 rgba(167,243,208,0.88)',
  'inset 0 -1.5px 0 rgba(2,44,34,0.62)',
  'inset 1.5px 0 rgba(110,231,183,0.28)',
  'inset -1.5px 0 rgba(0,0,0,0.16)',
].join(', ');
const GRN_RIVET_BG = 'radial-gradient(circle at 35% 35%, #d1fae5 0%, #6ee7b7 35%, #059669 65%, #064e3b 100%)';
const GRN_TEXT_PRI = 'rgba(255,255,255,0.95)';
const GRN_TEXT_SEC = 'rgba(255,255,255,0.65)';
const GRN_TEXT_DIM = 'rgba(255,255,255,0.45)';
const GRN_TEXT_SHADOW = '0 1px 2.5px rgba(0,0,0,0.60), 0 -0.5px 1px rgba(255,255,255,0.22)';
const GRN_TEXT_SHADOW_LG = '0 1px 3px rgba(0,0,0,0.65), 0 -0.5px 1.5px rgba(255,255,255,0.25)';
const GRN_DIVIDER = 'rgba(255,255,255,0.15)';

export function FunderOrderCardV2Silver({
  order,
  livePrices,
  priceDirection = {},
  cnyRate = DEFAULT_CNY_RATE,
  membersData = [],
  ledgerId,
  currentUser,
  isAdmin = false,
  allOrders,
}: FunderOrderCardV2Props) {
  const cardExportRef = useRef<HTMLDivElement>(null);
  const allowImageDownload = isAdmin || getBooleanDisplayFlag(order, 'allowUserImageDownload', true);
  const [activeTab, setActiveTab] = useState<'detail' | 'note' | null>(null);
  const feeExpanded = activeTab === 'detail';
  const noteExpanded = activeTab === 'note';
  const toggleTab = (tab: 'detail' | 'note') => setActiveTab(v => v === tab ? null : tab);
  const [showCollateralInfo, setShowCollateralInfo] = useState(false);
  // 卡片模式共享担保弹窗：点击订单号后打开订单详情
  const [clickedOrderNo, setClickedOrderNo] = useState<string | null>(null);
  const [showInterestDetail, setShowInterestDetail] = useState(false);
  const [showInterestHistory, setShowInterestHistory] = useState(false);
  const _v2IsParticipant = !!(order as any).participantInfo || !!(order as any)._isParticipant || !!(order as any)._fromFunder || (order as any).order_perspective === 'other';
  const _v2ParticipantUserId = _v2IsParticipant ? ((order as any).participantInfo?.userId || undefined) : undefined;
  const { data: interestPaymentsData } = trpc.ledger.funderGetInterestPayments.useQuery(
    { orderId: order.id as number, ledgerId: ledgerId as number, participantUserId: _v2ParticipantUserId },
    { enabled: showInterestHistory && !!ledgerId, staleTime: 10000 }
  );
  // 备注相关 state
  const [noteItems, setNoteItems] = useState(() => parseNotes(order.public_note || ''));
  const [noteEditingIdx, setNoteEditingIdx] = useState<number | null>(null);
  const [noteEditValue, setNoteEditValue] = useState('');
  const noteEditValueRef = useRef('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteDeleteConfirmIdx, setNoteDeleteConfirmIdx] = useState<number | null>(null);
  // 当order.public_note从服务器加载完成后同步更新noteItems
  useEffect(() => {
    setNoteItems(parseNotes(order.public_note || ''));
  }, [order.public_note]);
  const updateNoteM = trpc.ledger.funderUpdatePublicNote.useMutation();
  const saveNoteItems = async (newItems: ReturnType<typeof parseNotes>) => {
    if (!ledgerId) { toast.error('账本ID缺失，无法保存备注'); return; }
    setNoteSaving(true);
    try {
      const raw = JSON.stringify(newItems);
      await updateNoteM.mutateAsync({ id: order.id as number, ledgerId, publicNote: raw, participantUserId: _v2ParticipantUserId });
      setNoteItems(newItems);
      order.public_note = raw;
      toast.success('备注已保存');
    } catch (e: any) {
      toast.error('备注保存失败：' + (e?.message || '未知错误'));
    } finally { setNoteSaving(false); }
  };
  const handleNoteEditChange = (val: string) => {
    noteEditValueRef.current = val;
    setNoteEditValue(val);
  };

  // 期权订单：标的资产以 option_info.coin 为准（order.coin 可能是旧数据遗留的错误值）
  const _optInfo = (() => { try { const oi = (order as any).option_info; return typeof oi === 'string' ? JSON.parse(oi) : (oi || null); } catch { return null; } })();
  const _isOptCard = order.asset_type === 'crypto_option';
  const coin = (_isOptCard && _optInfo?.coin ? _optInfo.coin : (order.coin || 'ETH')) as CoinType;
  const qty = _isOptCard && _optInfo?.buyQty ? parseFloat(_optInfo.buyQty) : parseFloat(order.buy_quantity || '0');
  const buyPrice = parseFloat(order.buy_price || '0');
  const liveP = livePrices[coin] ?? null;
  const rawAmountCurrency = String((order as any).amount_currency || 'USDT').toUpperCase();
  const amountCurrency = rawAmountCurrency === 'U' ? 'USDT' : rawAmountCurrency;
  const storedAmountUsdt = parseFloat(order.amount || '0');
  const amountCurrencyPrice = livePrices[amountCurrency as CoinType];
  const buyPriceUsdt = amountCurrency === 'CNY'
    ? buyPrice / cnyRate
    : amountCurrency === 'USDT'
      ? buyPrice
      : (amountCurrencyPrice && amountCurrencyPrice > 0 ? buyPrice * amountCurrencyPrice : buyPrice);
  const calculatedFinancingDisplayAmount = amountCurrency === 'CNY'
    ? storedAmountUsdt * cnyRate
    : amountCurrency === 'USDT'
      ? storedAmountUsdt
      : (amountCurrencyPrice && amountCurrencyPrice > 0 ? storedAmountUsdt / amountCurrencyPrice : storedAmountUsdt);
  const financingDisplayAmount = getExactFinancingDisplayAmount(order, amountCurrency, calculatedFinancingDisplayAmount);
  const buyQuoteUnit = amountCurrency === 'CNY' ? '元' : amountCurrency === 'USDT' ? 'U' : amountCurrency;
  const displayFinancingAsPrimary = (order as any).principal_lent_out === 1 || (order as any).principal_lent_out === true || amountCurrency === 'CNY';

  const currentValue = liveP !== null && qty > 0 ? liveP * qty : null;
  const buyValue = storedAmountUsdt > 0 ? storedAmountUsdt : (qty > 0 && buyPriceUsdt > 0 ? qty * buyPriceUsdt : 0);
  const _isShortSl = (order as any).trade_direction === 'short';
  const floatPnl = currentValue !== null && buyValue > 0
    ? (_isShortSl ? buyValue - currentValue : currentValue - buyValue)
    : null;
  const floatPct = floatPnl !== null && buyValue > 0 ? (floatPnl / buyValue) * 100 : null;
  const dir = priceDirection?.[coin] ?? 'same';
  const pnlColor = floatPnl === null ? (_isOptCard ? OPT_TEXT_SEC : SL_TEXT_SEC) : floatPnl >= 0 ? SL_GREEN : SL_RED;
  const priceDiff = liveP !== null && buyPriceUsdt > 0 ? liveP - buyPriceUsdt : null;
  const priceColor = priceDiff === null ? (_isOptCard ? OPT_TEXT_PRI : SL_TEXT_PRI) : priceDiff >= 0 ? SL_GREEN : SL_RED;

  const rateStr = getRateStr(order);
  const rateAbs = formatFunderAnnualRate(rateStr);
  const accrued = useAccruedInterestFunder(
    order.status === 'active' ? order.interest_base : null,
    order.status === 'active' ? order.interest_rate_annual : null,
    order.status === 'active' ? order.interest_start_date : null,
    order.settled_at
  );
  const baseCur = order.interest_base_currency || 'USDT';
  const rateCur = order.interest_rate_currency || 'USDT';
  const interestUnit = rateCur === 'CNY' ? '元' : 'U';
  const convertAccrued = (val: number): number => {
    if (baseCur === rateCur) return val;
    if (baseCur === 'USDT' && rateCur === 'CNY') return val * cnyRate;
    if (baseCur === 'CNY' && rateCur === 'USDT') return val / cnyRate;
    return val;
  };
  const displayAccrued = convertAccrued(accrued);
  const totalPaid = (order as any).paidTotal ? parseFloat((order as any).paidTotal.amount || '0') : 0;
  const displayPaid = convertAccrued(totalPaid);
  const approxPaidMode = getDisplayMode(order, 'approxPaid', 'U');
  const approxPaidValue = approxPaidMode === 'U'
    ? (interestUnit === 'U' ? displayPaid : displayPaid / cnyRate)
    : (interestUnit === 'U' ? displayPaid * cnyRate : displayPaid);
  const approxPaidUnit = approxPaidMode === 'U' ? 'U' : '元';

  const holdDurationLabel = (() => {
    if (!order.buy_date) return '--';
    const endTs = order.settled_at ? new Date(order.settled_at).getTime() : Date.now();
    const elapsed = endTs - new Date(order.buy_date + 'T00:00:00').getTime();
    if (elapsed <= 0) return '0小时';
    const totalHours = Math.floor(elapsed / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return days > 0 ? `${days}天 ${hours}小时` : `${hours}小时`;
  })();

  let collateralAssets: { coin: string; qty: string }[] = [];
  try {
    const rawCA = order.collateral_assets;
    if (rawCA) {
      const parsed = typeof rawCA === 'string' ? JSON.parse(rawCA) : rawCA;
      if (Array.isArray(parsed)) collateralAssets = parsed;
    }
  } catch {}

  const isSharedMode = (order as any).collateral_share_mode === 'self';
  // 动态解析 collateral_source（调用其他账本担保物）
  const _parsedCollateralSource = useMemo(() => {
    try {
      const cs = (order as any).collateral_source;
      if (!cs) return null;
      const parsed = typeof cs === 'string' ? JSON.parse(cs) : cs;
      if (parsed && parsed.ledgerId && parsed.tagName) return parsed as { ledgerId: number; tagName: string };
    } catch {}
    return null;
  }, [(order as any).collateral_source]);
  const hasExternalCollateral = !!_parsedCollateralSource;
  // 兼容别名，保留下游代码不变
  const isFC2977 = hasExternalCollateral;
  const { data: _fc2977TagConfig } = trpc.ledger.getTagConfig.useQuery(
    { ledgerId: _parsedCollateralSource?.ledgerId ?? 0, tagName: _parsedCollateralSource?.tagName ?? '' },
    { enabled: hasExternalCollateral, staleTime: 3000 }
  );
  const { data: _fc2977TagSummary } = (trpc.ledger as any).getTagSummary.useQuery(
    { ledgerId: _parsedCollateralSource?.ledgerId ?? 0, tagName: _parsedCollateralSource?.tagName ?? '' },
    { enabled: hasExternalCollateral, staleTime: 3000 }
  );
  // 规则G：数字币价格前端直连（老方案已封存：trpc.getCryptoPrices）
  const { data: _fc2977CryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, { enabled: hasExternalCollateral, refetchInterval: 3000, staleTime: 2000 });
  const { fc2977RemainingMarginU, fc2977MarginBasePct } = (() => {
    if (!isFC2977 || !_fc2977TagConfig) return { fc2977RemainingMarginU: null as number | null, fc2977MarginBasePct: null as number | null };
    const _cnyR = (_fc2977CryptoPricesRaw as any)?.usdtCnyRate ?? 7.0;
    const _pricesMap = (_fc2977CryptoPricesRaw as any)?.prices ?? {};
    const _prices: Record<string, number> = {};
    for (const [k, v] of Object.entries(_pricesMap)) { _prices[k] = Number(v) * _cnyR; }
    _prices['USDT'] = _cnyR;
    const _toCNY = (m: string | number, coin: string) => {
      const n = typeof m === 'number' ? m : parseFloat(m as string);
      if (isNaN(n) || n === 0) return 0;
      if (!coin || coin === '人民币' || coin === '元') return n;
      return n * (_prices[coin] ?? 0);
    };
    let rightTotalCNY = 0;
    try {
      const parsed = JSON.parse(_fc2977TagConfig.margin_by_coin as string);
      const items = Array.isArray(parsed)
        ? parsed.map((e: any) => ({ coin: e.coin || '元', amount: Number(e.amount) }))
        : Object.entries(parsed).map(([coin, amount]) => ({ coin, amount: Number(amount) }));
      rightTotalCNY = items.reduce((s, { coin, amount }) => s + _toCNY(String(amount), coin), 0);
    } catch {}
    const latestBalance = (_fc2977TagSummary as any)?.latestBalance;
    const balanceNum = latestBalance?.balance ? parseFloat(String(latestBalance.balance)) : null;
    const initialNum = parseFloat((_fc2977TagConfig as any).initial_amount || '0') || 0;
    const multiplierNum = parseFloat((_fc2977TagConfig as any).account_multiplier || '1') || 1;
    if (balanceNum === null) return { fc2977RemainingMarginU: null, fc2977MarginBasePct: null };
    const pnl = (balanceNum - initialNum) * multiplierNum;
    const remainingCNY = pnl + rightTotalCNY;
    const remainingU = _cnyR > 0 ? remainingCNY / _cnyR : null;
    const marginBaseNum = parseFloat((_fc2977TagConfig as any).margin_base || '0') || 0;
    const pct = marginBaseNum > 0 ? (remainingCNY / marginBaseNum * 100) : null;
    return { fc2977RemainingMarginU: remainingU, fc2977MarginBasePct: pct };
  })();
  const { data: sharedPoolInfo } = trpc.ledger.funderGetSharedCollateralPool.useQuery(
    { ledgerId: (order as any).ledger_id ?? 0, userId: Number(order.user_id) },
    {
      enabled: isSharedMode && !!((order as any).ledger_id),
      staleTime: 5000,
      refetchInterval: 15000,
      refetchIntervalInBackground: false,
    }
  );

  // 卡片模式共享担保弹窗：点击订单号后打开订单详情（先从 allOrders 找，找不到则从 sharedPoolInfo 构造）
  const clickedOrder = clickedOrderNo ? (
    (allOrders ?? []).find((o: any) => o.order_no === clickedOrderNo)
    || (() => {
      const poolOrder = ((sharedPoolInfo as any)?.orders ?? []).find((o: any) => o.orderNo === clickedOrderNo);
      if (!poolOrder) return null;
      return {
        id: poolOrder.orderId,
        order_no: poolOrder.orderNo,
        coin: poolOrder.coin,
        amount: poolOrder.principal,
        buy_price: poolOrder.buyPrice,
        buy_quantity: poolOrder.quantity,
        interest_base: poolOrder.principal,
        interest_rate_annual: 0,
        collateral_assets: JSON.stringify(poolOrder.collateralAssets ?? []),
        collateral_share_mode: poolOrder.shareMode || 'self',
        principal_lent_out: poolOrder.principalLentOut ? 1 : 0,
        asset_type: poolOrder.assetType || 'crypto',
        status: 'active',
        user_id: (order as any).user_id,
        ledger_id: ledgerId,
      };
    })()
  ) : null;

  // 担保物价値计算（非共享担保模式）
  let collateralValue = 0;
  let collateralValueKnown = true;
  const collateralItemValues: (number | null)[] = [];
  for (const item of collateralAssets) {
    const iq = parseFloat(item.qty);
    if (!item.coin || isNaN(iq)) { collateralItemValues.push(null); collateralValueKnown = false; continue; }
    if (item.coin === 'USDT') { collateralValue += iq; collateralItemValues.push(iq); }
    else if (item.coin === 'CNY') { const cv = iq / cnyRate; collateralValue += cv; collateralItemValues.push(cv); }
    else {
      const p = livePrices[item.coin as CoinType] ?? null;
      if (p) { collateralValue += iq * p; collateralItemValues.push(iq * p); }
      else { collateralItemValues.push(null); collateralValueKnown = false; }
    }
  }
  // 担保缺口 = 担保总値 + 浮动盈亏 - 待结利息 + 已结利息
  const exposure = floatPnl !== null
    ? collateralValue + floatPnl - displayAccrued + displayPaid
    : collateralValue - displayAccrued + displayPaid;
  const isSufficient = exposure >= 0;

  const fmt = (v: number | null, digits = 2) =>
    v == null || isNaN(v) ? '--' : v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  // 动态小数位：有小数显两位，整数不显小数点
  const fmtQty = (v: number | null) =>
    v == null || isNaN(v) ? '--' : v % 1 === 0 ? v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // 四角铆钉位置
  const rivets = [
    { top: '6px', left: '7px' },
    { top: '6px', right: '7px' },
    { bottom: '6px', left: '7px' },
    { bottom: '6px', right: '7px' },
  ];

  // 金/银色：股票类用金色，数字币用银色
  const isStockCard = order.asset_type === 'stock';
  const isOptionCard = order.asset_type === 'crypto_option';
  // 期权 Greeks：前端直连 Deribit，自动触发，每5分钟刷新
  const greeksResult = useOptionGreeks({
    currency: (_isOptCard && _optInfo?.coin ? _optInfo.coin : (order.coin || 'ETH')) as 'BTC' | 'ETH',
    exerciseDate: _optInfo?.exerciseDate || '',
    strikePrice: _optInfo?.strikePrice ? Number(_optInfo.strikePrice) : 0,
    direction: (_optInfo?.direction || 'long_call') as 'long_call' | 'long_put' | 'short_call' | 'short_put',
    enabled: isOptionCard && !!_optInfo?.exerciseDate && !!_optInfo?.strikePrice,
  });
  // 期权浮动盈亏：用 markPrice（含时间价值）× 数量 - 权利金总成本
  const optPremiumTotal = isOptionCard && _optInfo?.premium && qty > 0
    ? parseFloat(_optInfo.premium) * qty
    : null;
  const optMarkPrice = greeksResult.data?.markPrice ?? null;
  // Gate.io 返回的 markPrice 单位已是 USDT，直接乘以张数
  const optCurrentValue = optMarkPrice != null && qty > 0
    ? optMarkPrice * qty
    : null;
  const optFloatPnl = optCurrentValue !== null && optPremiumTotal !== null
    ? optCurrentValue - optPremiumTotal
    : null;
  const optFloatPct = optFloatPnl !== null && optPremiumTotal !== null && optPremiumTotal > 0
    ? (optFloatPnl / optPremiumTotal) * 100
    : null;
  // 内在价值：不依赖 Deribit，纯本地计算
  const optStrike = _optInfo?.strikePrice ? Number(_optInfo.strikePrice) : null;
  const optIsCall = !_optInfo?.direction || _optInfo.direction === 'long_call' || _optInfo.direction === 'short_call';
  const optIntrinsic = isOptionCard && optStrike !== null && liveP !== null && qty > 0
    ? Math.max(0, optIsCall ? (liveP - optStrike) * qty : (optStrike - liveP) * qty)
    : null;
  const GOLD_BG_SV = [
    'linear-gradient(135deg, rgba(255,255,255,0.50) 0%, rgba(255,255,255,0.15) 22%, rgba(255,255,255,0.0) 45%, rgba(0,0,0,0.0) 60%, rgba(0,0,0,0.28) 100%)',
    'linear-gradient(90deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 35%, rgba(0,0,0,0.0) 55%, rgba(0,0,0,0.18) 100%)',
    'linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(255,255,255,0.18) 35%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.08) 70%, rgba(0,0,0,0.14) 100%)',
    'linear-gradient(160deg, #9e7c28 0%, #c89e32 18%, #ddb545 40%, #c49030 62%, #ceA03c 80%, #9e7c28 100%)',
  ].join(', ');
  const GOLD_BORDER_SV = '1.5px solid rgba(150,108,12,0.95)';
  const GOLD_SHADOW_SV = [
    '0 6px 20px rgba(0,0,0,0.35)',
    '0 1px 3px rgba(0,0,0,0.25)',
    'inset 0 1.5px 0 rgba(255,228,100,0.88)',
    'inset 0 -1.5px 0 rgba(80,48,0,0.62)',
    'inset 1.5px 0 rgba(245,205,65,0.28)',
    'inset -1.5px 0 rgba(0,0,0,0.16)',
  ].join(', ');
  // 本人 / 他人仅决定列表归属；绿色主题仅表达真实参与者身份。
  const isParticipant = !!(order as any).participantInfo || !!(order as any)._isParticipant || !!(order as any)._fromFunder;
  const cardBg = isParticipant ? GRN_BG : isStockCard ? GOLD_BG_SV : isOptionCard ? OPT_BG : SL_BG;
  const cardBorder = isParticipant ? GRN_BORDER : isStockCard ? GOLD_BORDER_SV : isOptionCard ? OPT_BORDER : SL_BORDER;
  const cardDisplayConfig = (() => {
    try {
      const raw = (order as any).display_config;
      return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
    } catch { return {}; }
  })();
  const showTradeDirection = cardDisplayConfig.showTradeDirection !== false;
  // 52号账本的手续费只有在订单控制区明确开启后才向前端展示。
  const isLedger52 = Number(ledgerId ?? (order as any).ledger_id) === 52;
  const showTradingFee = isLedger52 && cardDisplayConfig.tradingFee === true;
  const tradingFeeRatePerMille = (() => {
    const value = Number((order as any).trading_fee_rate_per_mille ?? 2);
    return Number.isFinite(value) && value >= 0 ? value : 2;
  })();
  const tradingFeeStatus = (['unpaid', 'half_paid', 'paid'].includes((order as any).trading_fee_status)
    ? (order as any).trading_fee_status
    : 'unpaid') as 'unpaid' | 'half_paid' | 'paid';
  const tradingFeeStatusLabel = ({ unpaid: '已付0%', half_paid: '已付50%', paid: '已付100%' } as const)[tradingFeeStatus];
  const cardShadow = isParticipant ? GRN_SHADOW : isStockCard ? GOLD_SHADOW_SV : isOptionCard ? OPT_SHADOW : SL_SHADOW;
  // 动态文字颜色：参与者和期权卡片用白色系列，其他用黑色系列
  const TXT_PRI = (isParticipant || isOptionCard) ? (isParticipant ? GRN_TEXT_PRI : OPT_TEXT_PRI) : SL_TEXT_PRI;
  const TXT_SEC = (isParticipant || isOptionCard) ? (isParticipant ? GRN_TEXT_SEC : OPT_TEXT_SEC) : SL_TEXT_SEC;
  const TXT_DIM = (isParticipant || isOptionCard) ? (isParticipant ? GRN_TEXT_DIM : OPT_TEXT_DIM) : SL_TEXT_DIM;
  const TXT_SHADOW = (isParticipant || isOptionCard) ? (isParticipant ? GRN_TEXT_SHADOW : OPT_TEXT_SHADOW) : SL_TEXT_SHADOW;
  const TXT_SHADOW_LG = (isParticipant || isOptionCard) ? (isParticipant ? GRN_TEXT_SHADOW_LG : OPT_TEXT_SHADOW_LG) : SL_TEXT_SHADOW_LG;
  const DIVIDER = (isParticipant || isOptionCard) ? (isParticipant ? GRN_DIVIDER : OPT_DIVIDER) : SL_DIVIDER;
  const rivetBg = isParticipant ? GRN_RIVET_BG
    : isStockCard
    ? 'radial-gradient(circle at 35% 35%, #fff8d0 0%, #e8c050 35%, #a07010 65%, #6a4800 100%)'
    : isOptionCard ? OPT_RIVET_BG : SL_RIVET_BG;
  const rivetShadow = isParticipant
    ? '0 1px 2px rgba(0,0,0,0.55), inset 0 1px 1px rgba(167,243,208,0.9)'
    : isStockCard
    ? '0 1px 2px rgba(0,0,0,0.55), inset 0 1px 1px rgba(255,240,140,0.9)'
    : isOptionCard
      ? '0 1px 2px rgba(0,0,0,0.55), inset 0 1px 1px rgba(216,180,254,0.9)'
      : '0 1px 2px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.8)';

  return (
    <div
      ref={cardExportRef}
      className="rounded-2xl overflow-hidden silver-card"
      style={{
        position: 'relative',
        background: cardBg,
        border: cardBorder,
        boxShadow: cardShadow,
      }}
    >
      {/* SVG 磨砂噪点滤镜定义（隐藏） */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id="brushed-metal-noise" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.65 0.015" numOctaves="4" seed="2" result="noise" />
            <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise" />
            <feBlend in="SourceGraphic" in2="grayNoise" mode="overlay" result="blended" />
            <feComposite in="blended" in2="SourceGraphic" operator="in" />
          </filter>
        </defs>
      </svg>
      {/* 磨砂噪点覆盖层 */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 1, borderRadius: 'inherit', pointerEvents: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75 0.02' numOctaves='4' seed='5'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.18'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px',
          mixBlendMode: 'overlay',
        }}
      />
      {/* 四角铆钉 */}
      {rivets.map((pos, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            zIndex: 10,
            ...pos,
            background: rivetBg,
            boxShadow: rivetShadow,
          }}
        />
      ))}

      {/* ── 页眉：身份、日期/行情与订单号同一行，左右预留铆钉安全距离 ── */}
      <div className="px-5 pt-2 pb-1.5" style={{ borderBottom: `1px solid ${DIVIDER}` }}>
        {(() => {
          const member = (membersData as any[])?.find((m: any) => Number(m.userId) === Number(order.user_id));
          const normalOwnerName = member?.nickname || (order as any).nickname || member?.username || order.owner_label || null;
          const orderOwnerName = isParticipant
            ? ((order as any).order_owner_name || (order as any).nickname || (order as any).username || normalOwnerName)
            : normalOwnerName;
          const participantName = isParticipant
            ? ((order as any).participant_name || order.owner_label || null)
            : null;
          const buyDateStr = order.buy_date ? fmtDate(order.buy_date) : null;
          const brokerText = isStockCard
            ? [order.broker_name, order.broker_account].filter(Boolean).join(' · ')
            : null;
          const showLivePrice = !isStockCard && coin !== 'CNY' && coin !== 'USDT';
          const livePriceColor = dir === 'up' ? SL_GREEN : dir === 'down' ? SL_RED : TXT_PRI;
          const ownerNameClass = String(orderOwnerName ?? '').length > 10 ? 'text-[8px]' : String(orderOwnerName ?? '').length > 6 ? 'text-[9px]' : 'text-[10px]';
          const participantNameClass = String(participantName ?? '').length > 10 ? 'text-[8px]' : String(participantName ?? '').length > 6 ? 'text-[9px]' : 'text-[10px]';
          const metadataLength = String(buyDateStr ?? '').length + String(brokerText ?? '').length + (showLivePrice ? String(coin).length + 10 : 0);
          const metadataClass = metadataLength > 28 ? 'text-[9px]' : 'text-[11px]';
          const identityMaxWidth = metadataLength > 24 ? '58px' : '70px';
          const hasMetadata = !!(buyDateStr || brokerText || showLivePrice);
          return (
            <div className="flex min-w-0 items-center">
              {orderOwnerName && (
                <div className="min-w-0" style={{ flex: '0 1 auto', maxWidth: isParticipant ? identityMaxWidth : '108px' }}>
                  <div className="text-[8px] leading-none" style={{ color: TXT_SEC }}>拥有者</div>
                  <div className={`mt-0.5 truncate font-semibold leading-tight ${ownerNameClass}`} style={{ color: TXT_PRI }} title={String(orderOwnerName)}>
                    {orderOwnerName}
                  </div>
                </div>
              )}
              {isParticipant && participantName && (
                <div
                  className="ml-0.5 min-w-0 pl-1"
                  style={{ flex: '0 1 auto', maxWidth: identityMaxWidth, borderLeft: orderOwnerName ? '1px solid rgba(255,255,255,0.5)' : undefined }}
                >
                  <div className="text-[8px] leading-none" style={{ color: TXT_SEC }}>参与者</div>
                  <div className={`mt-0.5 truncate font-semibold leading-tight ${participantNameClass}`} style={{ color: TXT_PRI }} title={String(participantName)}>
                    {participantName}
                  </div>
                </div>
              )}
              {hasMetadata && (
                <div className={`ml-1.5 flex min-w-0 flex-1 items-center gap-x-1 overflow-hidden whitespace-nowrap leading-tight ${metadataClass}`} style={{ color: TXT_SEC }}>
                  {buyDateStr && <span className="shrink-0 whitespace-nowrap">{buyDateStr}</span>}
                  {brokerText && <span className="min-w-0 flex-1 truncate" title={brokerText}>{brokerText}</span>}
                  {showLivePrice && (
                    <span className="inline-flex min-w-0 items-center gap-0.5 whitespace-nowrap font-medium">
                      {dir === 'up' && <span className="inline-flex items-center" style={{ color: SL_GREEN, animation: 'price-blink 1.5s ease-in-out infinite', lineHeight: 1 }}>▲</span>}
                      {dir === 'down' && <span className="inline-flex items-center" style={{ color: SL_RED, animation: 'price-blink 1.5s ease-in-out infinite', lineHeight: 1 }}>▼</span>}
                      <span style={{ color: TXT_PRI }}>{coin}</span>
                      <span className="truncate" style={{ marginLeft: '2px', color: livePriceColor }}>{liveP != null ? liveP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}</span>
                    </span>
                  )}
                </div>
              )}
              {order.order_no && (
                <span className="ml-1 max-w-[58px] shrink-0 truncate text-[10px] font-mono leading-tight" style={{ color: TXT_DIM, letterSpacing: '0.03em' }} title={String(order.order_no)}>
                  {order.order_no}
                </span>
              )}
              {allowImageDownload && (
                <span className="ml-1 shrink-0">
                  <OrderCardImageDownload
                    targetRef={cardExportRef}
                    currentUser={currentUser}
                    orderNo={order.order_no || order.id}
                    color={TXT_PRI}
                    captureFullContent
                  />
                </span>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── 行2：主数据行（持有数量占宽，其侙3列均分）── */}
      <div className="flex gap-0 px-5" style={{ borderBottom: `1px solid ${DIVIDER}`, paddingTop: isOptionCard ? '8px' : '12px', paddingBottom: isOptionCard ? '8px' : '12px' }}>
        {/* 持有数量/持有资产：占 40% */}
        <div style={{ flex: '0 0 40%' }}>
          {isStockCard ? (
            // 股票类：显示持有资产（计息基数，单位元）
            <>
              <div className="text-[10px] mb-1 flex items-center gap-1" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>
                <span>{(order as any).principal_lent_out === 1 || (order as any).principal_lent_out === true
                  ? `借出资产 (${baseCur === 'CNY' ? '元' : 'U'})`
                  : '仓位额度 (元)'}</span>
                {isParticipant && (
                  <span className="text-[10px] font-bold px-1.5 py-0" style={{ borderRadius: '4px', color: '#fff', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.7)' }}>参与</span>
                )}
              </div>
              <div style={{ lineHeight: 1 }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 700, color: TXT_PRI, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', textShadow: TXT_SHADOW_LG }}>
                  {order.interest_base ? parseFloat(order.interest_base).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '--'}
                </span>
              </div>
            </>
          ) : (
            // 数字币：人民币融资时优先显示融资金额，其余保持显示持有数量。
            <>
              <div className="text-[10px] mb-1 flex items-center gap-1" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>
                <span>{(order as any).principal_lent_out === 1 || (order as any).principal_lent_out === true ? `借出资产 (${amountCurrency})` : `持有资产 (${displayFinancingAsPrimary ? amountCurrency : coin})`}</span>
                {isParticipant && (
                  <span className="text-[10px] font-bold px-1.5 py-0" style={{ borderRadius: '4px', color: '#fff', backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.7)' }}>参与</span>
                )}
                {showTradeDirection && ((order as any).trade_direction === 'long' || (order as any).trade_direction === 'short') && (
                  <span
                    className="text-[10px] font-bold px-1 py-0"
                    style={{ borderRadius: '3px', color: '#fff', backgroundColor: (order as any).trade_direction === 'long' ? '#DC2626' : '#16A34A' }}
                  >
                    {(order as any).trade_direction === 'long' ? '多' : '空'}
                  </span>
                )}
              </div>
              <div style={{ lineHeight: 1 }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 700, color: TXT_PRI, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', textShadow: TXT_SHADOW_LG }}>
                  {displayFinancingAsPrimary ? fmt(financingDisplayAmount, 2) : fmt(qty, 2)}
                </span>
                {displayFinancingAsPrimary && storedAmountUsdt > 0 && amountCurrency === 'CNY' && (
                  <div className="mt-1 text-[10px]" style={{ color: TXT_SEC }}>≈{fmt(storedAmountUsdt, 2)} U</div>
                )}
              </div>
            </>
          )}

        </div>

        {/* 股票类：担保资产显示在右侧（行2） */}
        {isStockCard && (
          <div className="text-right" style={{ flex: 1 }}>
            {(order as any).collateral_share_mode === 'self' ? (
              <>
                <div className="text-[10px] mb-1" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>担保资产</div>
                <div className="text-sm font-semibold" style={{ color: '#A80000' }}>共享担保</div>
              </>
            ) : (
              <>
                <div className="text-[10px] mb-1" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>担保资产</div>
                <div className="text-sm text-right" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
                  {isFC2977 ? (
                    fc2977MarginBasePct !== null ? (
                      <span>
                        <span style={{ display: 'inline-block', backgroundColor: 'rgba(60,35,0,0.75)', color: '#F5C842', fontSize: '0.55rem', padding: '1.5px 5px', borderRadius: 8, fontWeight: 700, lineHeight: 1.2, verticalAlign: 'middle', marginRight: 3 }}>
                          {fc2977MarginBasePct >= 0 ? '余' : '缺'}
                        </span>
                        <span style={{ fontWeight: 400, color: TXT_PRI }}>
                          {fc2977MarginBasePct >= 0 ? '+' : '-'}{Math.abs(fc2977MarginBasePct).toFixed(1)}%
                        </span>
                      </span>
                    ) : <span style={{ color: TXT_DIM }}>加载中...</span>
                  ) : collateralAssets.length > 0
                    ? collateralAssets.map((c, i) => <div key={i}>{parseFloat(c.qty).toLocaleString()} {c.coin === 'CNY' ? '元' : c.coin}</div>)
                    : '--'}
                </div>
              </>
            )}
          </div>
        )}
        {/* 开仓价 / 当前价：股票类隐藏 */}
        {!isStockCard && (
          <>

            {/* 开仓价/权利金单价：靠右对齐 */}
            <div className="text-right" style={{ flex: 1 }}>
              <div className="text-[10px] mb-1" style={{ color: TXT_SEC }}>{isOptionCard ? '权利金 (U)' : `开仓价 (${buyQuoteUnit})`}</div>
              <div style={{ lineHeight: 1 }}>
                <span className="text-sm font-semibold" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: TXT_SHADOW }}>
                  {isOptionCard
                    ? (_optInfo?.premium ? fmt(parseFloat(_optInfo.premium), 2) : '--')
                    : (buyPrice > 0 ? fmt(buyPrice, 2) : '--')}
                </span>
              </div>
            </div>

            {/* 当前价：靠右对齐 */}
            <div className="text-right" style={{ flex: 1 }}>
              <div className="text-[10px] mb-1" style={{ color: TXT_SEC }}>{isOptionCard ? '期权现价 (U)' : '当前价 (U)'}</div>
              <div style={{ lineHeight: 1 }}>
                <span className="text-sm font-semibold" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: TXT_SHADOW }}>
                  {isOptionCard
                    ? (optMarkPrice != null ? fmt(optMarkPrice, 2) : (greeksResult.loading ? '...' : '--'))
                    : (liveP != null ? fmt(liveP, 2) : '--')}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── 行3：次要数据行（3列）── */}
      <div className="flex gap-0 px-5" style={{ fontFamily: SL_NUM_FONT, paddingTop: isOptionCard ? '6px' : '8px', paddingBottom: isOptionCard ? '6px' : '8px' }}>
        {isStockCard ? (
          // 股票类：交易周期居左（开仓日期 ~ 今天北京时间，单行显示）
          <div style={{ flex: '0 0 60%' }}>
            <div className="text-[10px] mb-0.5" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>
              交易周期{order.buy_date && (() => {
                const startDay = new Date(order.buy_date + 'T00:00:00+08:00').getTime();
                const nowBJStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
                const nowDay = new Date(nowBJStr + 'T00:00:00+08:00').getTime();
                const days = nowDay < startDay ? 0 : Math.floor((nowDay - startDay) / (1000 * 60 * 60 * 24)) + 1;
                return <span> ({days}天)</span>;
              })()}
            </div>
            <div className="text-sm" style={{ color: TXT_PRI, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}>
              {order.buy_date ? (() => {
                const todayBJ = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
                return `${fmtDate(order.buy_date)} ~ ${fmtDate(todayBJ)}`;
              })() : '--'}
            </div>
          </div>
        ) : (
          // 数字币类：期权卡片显示到期日，普通数字币显示开仓日期
          <div style={{ flex: isOptionCard ? '0 0 40%' : '0 0 auto', marginRight: isOptionCard ? 0 : 8 }}>
            {isOptionCard ? (
              <>
                <div className="text-[10px] mb-0.5" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>
                  到期日{_optInfo?.exerciseDate ? ` ${fmtDate(_optInfo.exerciseDate)}` : ''}
                </div>
                <div className="text-sm font-semibold" style={{ color: TXT_PRI, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', textShadow: TXT_SHADOW }}>
                  {_optInfo?.exerciseDate ? (() => {
                    const expDay = new Date(_optInfo.exerciseDate + 'T00:00:00+08:00').getTime();
                    const nowBJStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
                    const nowDay = new Date(nowBJStr + 'T00:00:00+08:00').getTime();
                    const daysLeft = Math.ceil((expDay - nowDay) / (1000 * 60 * 60 * 24));
                    const start = order.buy_date ? new Date(order.buy_date + 'T00:00:00+08:00').getTime() : null;
                    const totalDays = start ? Math.max(1, Math.ceil((expDay - start) / (1000 * 60 * 60 * 24))) : null;
                    const pct = totalDays ? Math.min(100, Math.max(0, ((totalDays - Math.max(0, daysLeft)) / totalDays) * 100)) : null;
                    const urgentColor = daysLeft <= 7 ? '#DC2626' : daysLeft <= 30 ? '#F97316' : TXT_PRI;
                    return (
                      <>
                        <span style={{ color: urgentColor }}>
                          {daysLeft > 0 ? `剩 ${daysLeft} 天` : daysLeft === 0 ? '今天到期' : '已到期'}
                        </span>
                        {pct !== null && (
                          <div style={{ width: '100%', height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', marginTop: 4 }}>
                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: daysLeft <= 7 ? '#DC2626' : daysLeft <= 30 ? '#F97316' : 'linear-gradient(90deg, #a855f7, #c084fc)', transition: 'width 0.3s' }} />
                          </div>
                        )}
                      </>
                    );
                  })() : '--'}
                </div>
              </>
            ) : (
              <>
                <div className="text-[10px] mb-0.5" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>
                  开仓日期{order.buy_date && (() => {
                    const startDay = new Date(order.buy_date + 'T00:00:00+08:00').getTime();
                    const nowBJStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
                    const nowDay = new Date(nowBJStr + 'T00:00:00+08:00').getTime();
                    const days = nowDay < startDay ? 0 : Math.floor((nowDay - startDay) / (1000 * 60 * 60 * 24)) + 1;
                    return <span> ({days}天)</span>;
                  })()}
                </div>
                <div className="text-sm font-semibold" style={{ color: TXT_PRI, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}>
                  {order.buy_date ? fmtDate(order.buy_date) : '--'}
                </div>
              </>
            )}
          </div>
        )}
        {!isStockCard && isOptionCard && (
          // 期权卡片：总投入（权利金单价xd7张数）
          <div className="text-right" style={{ flex: 1 }}>
            <div className="text-[10px] mb-0.5" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>总投入 (U)</div>
            <div className="text-sm font-semibold" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: TXT_SHADOW, whiteSpace: 'nowrap' }}>
              {optPremiumTotal !== null ? fmt(optPremiumTotal, 0) : '--'}
            </div>
          </div>
        )}
        {!isStockCard && (
          // 数字币类：浮动盈亏居右（期权对齐当前价列）
          <div className="text-right" style={{ flex: 1, minWidth: 0 }}>
            <div className="text-[10px] mb-0.5" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>
              {isOptionCard ? '行权价 (U)' : '浮动盈亏 (U)'}
            </div>
            {isOptionCard ? (
              <div className="text-sm font-semibold" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: TXT_SHADOW, whiteSpace: 'nowrap' }}>
                {_optInfo?.strikePrice ? fmt(Number(_optInfo.strikePrice), 0) : '--'}
              </div>
            ) : (order as any).order_fill_status === 'pending' ? (
              <div className="text-sm font-semibold" style={{ color: '#F97316', textShadow: TXT_SHADOW, whiteSpace: 'nowrap' }}>挂单中</div>
            ) : (
              <div className="text-sm font-semibold" style={{ color: pnlColor, fontVariantNumeric: 'tabular-nums', textShadow: TXT_SHADOW, whiteSpace: 'nowrap' }}>
                {floatPnl !== null
                  ? `${floatPnl >= 0 ? '+' : ''}${fmt(floatPnl, 0)}${floatPct !== null ? ` (${floatPct >= 0 ? '+' : ''}${floatPct.toFixed(2)}%)` : ''}`
                  : '--'}
              </div>
            )}
          </div>
        )}
        {/* 股票类：利息居右（行3） */}
        {isStockCard ? (
          <div className="text-right" style={{ flex: 1 }}>
            <div className="text-[10px] mb-0.5" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>利息</div>
            <div className="text-sm" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
              {rateAbs ? `${(parseFloat(rateAbs) / 12).toFixed(2)}%` : '--'}
            </div>
          </div>
        ) : isOptionCard ? null : (
          // 数字币类：担保资产居右（期权订单不显示）
          <div className="text-right" style={{ flex: '0 0 auto', marginLeft: 8 }}>
            <div className="text-[10px] mb-0.5" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>
              担保资产{(order as any).collateral_share_mode !== 'self' && collateralAssets.length > 0 && collateralAssets.length === 1 ? ` (${collateralAssets[0].coin})` : ''}
            </div>
            <div className="text-sm font-semibold" style={{ color: (order as any).collateral_share_mode === 'self' ? '#A80000' : TXT_PRI }}>
              {(order as any).collateral_share_mode === 'self'
                ? '共享担保'
                : collateralAssets.length > 0
                  ? collateralAssets.length === 1
                    ? collateralAssets[0].qty
                    : collateralAssets.map((c, i) => <div key={i}>{c.qty} {c.coin}</div>)
                  : '--'}
            </div>
          </div>
        )}
      </div>

      {/* ── 行4：期权专属——时间价值 / 内在价值 / 总价值 ── */}
      {isOptionCard && (() => {
        const optQty = qty > 0 ? qty : 0;
        // 单张内在价值
        const intrinsicPerUnit = optStrike !== null && liveP !== null
          ? Math.max(0, optIsCall ? (liveP - optStrike) : (optStrike - liveP))
          : null;
        // 单张时间价值
        const timeValuePerUnit = optMarkPrice != null && intrinsicPerUnit != null
          ? optMarkPrice - intrinsicPerUnit
          : null;
        // 单张总价值
        const totalPerUnit = optMarkPrice;
        // 总计
        const intrinsicTotal = intrinsicPerUnit !== null && optQty > 0 ? intrinsicPerUnit * optQty : null;
        const timeValueTotal = timeValuePerUnit !== null && optQty > 0 ? timeValuePerUnit * optQty : null;
        const totalValue = totalPerUnit !== null && optQty > 0 ? totalPerUnit * optQty : null;
        return (
          <div className="flex gap-0 px-5" style={{ fontFamily: SL_NUM_FONT, paddingTop: '5px', paddingBottom: '6px', borderTop: `1px solid ${DIVIDER}` }}>
            {/* 时间价值 */}
            <div style={{ flex: '0 0 40%' }}>
              <div className="text-[10px] mb-0.5" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>时间价值 (U)</div>
              <div className="text-sm font-semibold" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: TXT_SHADOW }}>
                {timeValuePerUnit !== null ? fmt(timeValuePerUnit, 2) : '--'}
              </div>
              <div className="text-[10px]" style={{ color: TXT_DIM, fontVariantNumeric: 'tabular-nums' }}>
                {timeValueTotal !== null ? `×${fmt(optQty, 2)}=${fmt(timeValueTotal, 0)}` : ''}
              </div>
            </div>
            {/* 内在价值 */}
            <div className="text-right" style={{ flex: 1 }}>
              <div className="text-[10px] mb-0.5" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>内在价值 (U)</div>
              <div className="text-sm font-semibold" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: TXT_SHADOW }}>
                {intrinsicPerUnit !== null ? fmt(intrinsicPerUnit, 2) : '--'}
              </div>
              <div className="text-[10px]" style={{ color: TXT_DIM, fontVariantNumeric: 'tabular-nums' }}>
                {intrinsicTotal !== null ? `×${fmt(optQty, 2)}=${fmt(intrinsicTotal, 0)}` : ''}
              </div>
            </div>
            {/* 总价值 */}
            <div className="text-right" style={{ flex: 1 }}>
              <div className="text-[10px] mb-0.5" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>总价值 (U)</div>
              <div className="text-sm font-semibold" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: TXT_SHADOW }}>
                {totalPerUnit !== null ? fmt(totalPerUnit, 2) : '--'}
              </div>
              <div className="text-[10px]" style={{ color: TXT_DIM, fontVariantNumeric: 'tabular-nums' }}>
                {totalValue !== null ? `×${fmt(optQty, 2)}=${fmt(totalValue, 0)}` : ''}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Tab栏：详情 | 备注 ── */}
      <div className="flex" style={{ borderTop: `1px solid ${DIVIDER}` }}>
        <button
          className="flex-1 flex items-center justify-center gap-1 py-2 relative"
          style={{ background: feeExpanded ? 'rgba(0,0,0,0.03)' : 'transparent' }}
          onClick={() => toggleTab('detail')}
        >
          <span style={{ color: feeExpanded ? TXT_PRI : TXT_DIM, fontSize: '0.7rem', fontWeight: feeExpanded ? 600 : 400 }}>详情</span>
          {feeExpanded
            ? <ChevronUp className="w-3 h-3" style={{ color: TXT_DIM }} />
            : <ChevronDown className="w-3 h-3" style={{ color: TXT_DIM }} />}
          {/* 不顶天立地的垂直分隔线 */}
          <span style={{ position: 'absolute', right: 0, top: '20%', height: '60%', width: 1, background: DIVIDER }} />
        </button>
        <button
          className="flex-1 flex items-center justify-center gap-1 py-2"
          style={{ background: noteExpanded ? 'rgba(0,0,0,0.03)' : 'transparent' }}
          onClick={() => toggleTab('note')}
        >
          <span style={{ color: noteExpanded ? TXT_PRI : TXT_DIM, fontSize: '0.7rem', fontWeight: noteExpanded ? 600 : 400 }}>备注</span>
          {(() => { const cnt = parseNotes(order.public_note || '').length; return cnt > 0 ? <span style={{ color: TXT_DIM, fontSize: '0.65rem' }}>({cnt})</span> : null; })()}
          {noteExpanded
            ? <ChevronUp className="w-3 h-3" style={{ color: TXT_DIM }} />
            : <ChevronDown className="w-3 h-3" style={{ color: TXT_DIM }} />}
        </button>
      </div>

      {feeExpanded && (() => {
        const interestBase = order.interest_base ? parseFloat(order.interest_base) : 0;
        // 参考手续费按费率（‰）计算；计息基数为空时回退使用订单金额。
        const feeBase = interestBase > 0 ? interestBase : (parseFloat(order.amount || '0') || 0);
        const referenceTradingFee = showTradingFee ? feeBase * tradingFeeRatePerMille / 1000 : 0;
        const payableTradingFee = referenceTradingFee * (tradingFeeStatus === 'paid' ? 0 : tradingFeeStatus === 'half_paid' ? 0.5 : 1);
        // 计息基数单位按 interest_base_currency 判断
        const baseUnit2 = (order.interest_base_currency || 'USDT') === 'CNY' ? '元' : 'u';
        // 天数算法与 hook 一致：北京时间自然日，开始日算第1天
        const calcDays = (startDateStr: string, endTs: number): number => {
          // 直接用 startDateStr 构造北京时间零点，避免 toISOString() 转 UTC 导致日期偏移
          const startDay = new Date(startDateStr + 'T00:00:00+08:00').getTime();
          // 用 toLocaleString 获取北京时间日期字符串，再构造北京时间零点
          const endDateBJStr = new Date(endTs).toLocaleString('sv', { timeZone: 'Asia/Shanghai' }).slice(0, 10);
          const endDay = new Date(endDateBJStr + 'T00:00:00+08:00').getTime();
          return Math.max(0, Math.floor((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1);
        };
        if (isOptionCard) {
          // 期权卡片详情：展示 P&L 曲线 + 最大亏损/盈利 + 希腊字母
          const d = greeksResult.data;
          const fmtG = (v: any, dp = 4) => v != null && !isNaN(Number(v)) ? Number(v).toFixed(dp) : '--';
          const loadingVal = <span style={{ color: TXT_DIM }}>--</span>;

          // 计算 P&L 曲线数据
          const optStrikeNum = _optInfo?.strikePrice ? Number(_optInfo.strikePrice) : null;
          const optPremiumNum = _optInfo?.premium ? parseFloat(_optInfo.premium) : null;
          const optQtyNum = _optInfo?.buyQty ? parseFloat(_optInfo.buyQty) : 1;
          const optDirRaw = _optInfo?.direction || 'long_call';
          const optContractType: 'call' | 'put' = optDirRaw.includes('put') ? 'put' : 'call';
          const optDirection: 'long' | 'short' = optDirRaw.startsWith('short') ? 'short' : 'long';
          const isLong = optDirection === 'long';
          const isCall = optContractType === 'call';

          const payoffData = (() => {
            if (!optStrikeNum || !optPremiumNum) return [];
            // X轴范围：与期权分析总览完全一致，固定 1200~4000
            const minP = 1200;
            const maxP = 4000;
            return calcExpiryPnL([{
              id: 0, label: '', color: '#a855f7',
              strikePrice: optStrikeNum,
              entryPrice: optPremiumNum, // 权利金单价（U/张）
              quantity: optQtyNum,
              contractType: optContractType,
              direction: optDirection,
              expiryDate: _optInfo?.exerciseDate || '',
            }], [minP, maxP], 100);
          })();

          // 最大亏损 / 最大盈利
          // 最大亏损 = 权利金总额（单价 xd7 张数）
          const optPremiumTotal2 = optPremiumNum != null ? optPremiumNum * optQtyNum : null;
          const maxLoss = isLong ? (optPremiumTotal2 != null ? Math.round(optPremiumTotal2) : null) : null;
          let maxProfit: number | null | '无限' = null;
          if (isLong && optStrikeNum != null && optPremiumTotal2 != null) {
            maxProfit = isCall ? '无限' : Math.round(optStrikeNum * optQtyNum - optPremiumTotal2);
          } else if (!isLong && optPremiumTotal2 != null) {
            maxProfit = Math.round(optPremiumTotal2);
          }

          return (
            <div className="text-[10px]">

              {/* 第1行：最大亏损 / 最大盈利 / IV —— 3列网格 */}
              <div className="grid grid-cols-3 gap-0 px-4 py-2" style={{ borderBottom: `1px solid ${DIVIDER}`, background: 'rgba(0,0,0,0.15)' }}>
                <div>
                  <div className="text-[9px] mb-0.5" style={{ color: TXT_SEC }}>最大亏损</div>
                  <div className="text-xs font-semibold" style={{ color: '#0ECB81', fontVariantNumeric: 'tabular-nums' }}>
                    {isLong ? (maxLoss != null ? `-${maxLoss.toLocaleString()}` : '--') : <span style={{ fontSize: '0.65rem' }}>无限</span>}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[9px] mb-0.5" style={{ color: TXT_SEC }}>最大盈利</div>
                  <div className="text-xs font-semibold" style={{ color: '#F6465D', fontVariantNumeric: 'tabular-nums' }}>
                    {maxProfit === '无限' ? <span style={{ fontSize: '0.65rem' }}>无限</span> : maxProfit != null ? `+${(maxProfit as number).toLocaleString()}` : '--'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] mb-0.5" style={{ color: TXT_SEC }}>IV 波动率</div>
                  <div className="text-xs font-semibold" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
                    {d?.iv != null ? `${(Number(d.iv) * 100).toFixed(1)}%` : '--'}
                  </div>
                </div>
              </div>

              {/* 第2行： Delta / Gamma / Theta / Vega —— 4列网格 */}
              <div className="grid grid-cols-4 gap-0 px-4 py-2" style={{ borderBottom: `1px solid ${DIVIDER}` }}>
                <div>
                  <div className="text-[9px] mb-0.5" style={{ color: TXT_SEC }}>Delta</div>
                  <div className="text-xs font-semibold" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums' }}>{d ? fmtG(d.delta) : '--'}</div>
                </div>
                <div className="text-center">
                  <div className="text-[9px] mb-0.5" style={{ color: TXT_SEC }}>Gamma</div>
                  <div className="text-xs font-semibold" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums' }}>{d ? fmtG(d.gamma) : '--'}</div>
                </div>
                <div className="text-center">
                  <div className="text-[9px] mb-0.5" style={{ color: TXT_SEC }}>Theta</div>
                  <div className="text-xs font-semibold" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums' }}>{d ? fmtG(d.theta) : '--'}</div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] mb-0.5" style={{ color: TXT_SEC }}>Vega</div>
                  <div className="text-xs font-semibold" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums' }}>{d ? fmtG(d.vega) : '--'}</div>
                </div>
              </div>

              {/* P&L 曲线图 */}
              {payoffData.length > 1 && optStrikeNum && (
                <OptionPnlCanvas
                  data={payoffData}
                  strikePrice={optStrikeNum}
                  currentPrice={liveP ?? undefined}
                />
              )}

              {greeksResult.error && (
                <div className="px-4 pt-1" style={{ color: '#DC2626', fontSize: '0.65rem' }}>数据获取失败</div>
              )}
            </div>
          );
        }
        return (
          <div className="px-4 pb-3 space-y-1.5 text-[10px]">
            <div className="flex justify-between">
              <span style={{ color: TXT_SEC }}>计息基数</span>
              <span style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
                {buyPrice > 0 && qty > 0
                  ? `${fmt(buyPrice, 0)}(U) × ${fmt(qty, qty % 1 === 0 ? 0 : 2)}(${coin}) = ${fmt(interestBase, 0)} ${baseUnit2}`
                  : interestBase ? `${fmt(interestBase, 0)} ${baseUnit2}` : '--'
                }
              </span>
            </div>
            {order.interest_start_date && (() => {
              const startD = new Date(order.interest_start_date + 'T00:00:00+08:00');
              const endD = order.settled_at ? new Date(order.settled_at) : new Date();
              const toBeijing = (d: Date) => new Date(d.getTime() + (8 * 60 - (-d.getTimezoneOffset())) * 60000);
              const s = toBeijing(startD);
              const e = toBeijing(endD);
              const fmtBJ = (d: Date) => `${String(d.getFullYear()).slice(2)}年${d.getMonth()+1}月${d.getDate()}日`;
              const days = calcDays(order.interest_start_date, endD.getTime());
              // 还没到开仓日（结束日 < 开始日），显示「未开始」
              const notStarted = endD.getTime() < startD.getTime();
              return (
                <div className="flex justify-between">
                  <span style={{ color: TXT_SEC }}>计息日期{order.interest_payment_type ? `（${({'monthly_pre':'月付先付','monthly_post':'月付后付','semi_pre':'半年付先付','semi_post':'半年付后付','annual_pre':'年付先付','annual_post':'年付后付','end_post':'结束后付','monthly_prepaid':'月付先付','monthly_postpaid':'月付后付','quarterly':'季付','maturity':'到期付','profit_post':'盈利后付','profit_pre':'盈利先付'} as any)[order.interest_payment_type] || order.interest_payment_type}）` : ''}</span>
                  <span style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums' }}>{notStarted ? `${fmtBJ(s)} 未开始` : `${fmtBJ(s)} ~ ${fmtBJ(e)}  ${days}天`}</span>
                </div>
              );
            })()}
            <div className="flex justify-between items-center">
              <span style={{ color: TXT_SEC }}>待付利息{rateAbs ? `（年化${rateAbs}%）` : ''}</span>
              <span style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
                {rateAbs && interestBase > 0 ? (() => {
                  const endTs = order.settled_at ? new Date(order.settled_at).getTime() : Date.now();
                  const days = order.interest_start_date ? calcDays(order.interest_start_date, endTs) : null;
                  return (
                    <>
                      <span style={{ color: TXT_PRI }}>{fmt(interestBase, 0)}×{rateAbs}%÷365{days != null ? `×${days}天` : ''} = </span>
                      <span style={{ color: TXT_PRI }}>{displayAccrued > 0 ? '-' : ''}{fmt(displayAccrued, 2)} {interestUnit}</span>
                    </>
                  );
                })() : <span style={{ color: TXT_PRI }}>{displayAccrued > 0 ? '-' : ''}{fmt(displayAccrued, 2)} {interestUnit}</span>}
              </span>
            </div>
            {/* 52号账本：仅在订单控制区开启“手续费”后显示参考手续费 */}
            {showTradingFee && (
              <div className="flex justify-between items-center">
                <span style={{ color: TXT_SEC }}>参考手续费 ({tradingFeeRatePerMille}‰)</span>
                <span className="flex items-center gap-1.5" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
                  <span>{referenceTradingFee > 0 ? '-' : ''}{fmt(referenceTradingFee, 2)} {interestUnit}</span>
                  <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{
                    background: tradingFeeStatus === 'paid' ? '#DCFCE7' : tradingFeeStatus === 'half_paid' ? '#FEF3C7' : '#FEE2E2',
                    color: tradingFeeStatus === 'paid' ? '#15803D' : tradingFeeStatus === 'half_paid' ? '#B45309' : '#B91C1C',
                  }}>{tradingFeeStatusLabel}</span>
                </span>
              </div>
            )}
            {/* 已结利息：始终显示 */}
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-1" style={{ color: TXT_SEC }}>
                已结利息
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); if (isFC2977 && _parsedCollateralSource) { setShowInterestDetail(true); } else { setShowInterestHistory(true); } }}
                  className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold leading-none"
                  style={{ background: '#8B6914', color: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.18)' }}
                >!</button>
              </span>
              <span className="flex flex-col items-end" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
                <span>+{fmt(displayPaid, 2)} {interestUnit}</span>
                {approxPaidMode !== 'hidden' && (
                  <span className="text-[10px]" style={{ color: TXT_DIM }}>≈{fmt(approxPaidValue, 2)} {approxPaidUnit}</span>
                )}
              </span>
            </div>
            {/* 合计待付 = 待付利息 + 手续费 - 已结利息 */}
            {(() => {
              // 已付50%或100%的手续费不再计入本次待付合计。
              const gross = displayAccrued + payableTradingFee;
              const net = gross - displayPaid;
              return (
                <div className="flex justify-between" style={{ borderTop: `1px solid ${DIVIDER}`, paddingTop: 4, marginTop: 4 }}>
                  <span style={{ color: TXT_SEC }}>合计待付</span>
                  <span style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {net > 0 ? '-' : ''}{fmt(Math.abs(net), 2)} {interestUnit}
                  </span>
                </div>
              );
            })()}
            {/* 担保资产行（股票类订单，非共享模式） */}
            {isStockCard && !isSharedMode && (
              <div className="flex justify-between items-start" style={{ borderTop: `1px solid ${DIVIDER}`, paddingTop: 4, marginTop: 4 }}>
                <span className="flex items-center gap-1" style={{ color: TXT_SEC }}>
                  担保资产
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setShowCollateralInfo(true); }}
                    className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold leading-none"
                    style={{ backgroundColor: '#8B6914', color: '#FFFFFF', border: 'none', cursor: 'pointer', lineHeight: 1, boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
                  >!</button>
                </span>
                {isFC2977 ? (
                  fc2977RemainingMarginU !== null ? (
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ backgroundColor: 'rgba(60,35,0,0.75)', color: '#F5C842', fontSize: '0.55rem', padding: '1.5px 5px', borderRadius: 8, fontWeight: 700, lineHeight: 1.2 }}>{fc2977RemainingMarginU >= 0 ? '余' : '缺'}</span>
                      <span style={{ color: TXT_PRI }}>{Math.abs(fc2977RemainingMarginU).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} U</span>
                    </span>
                  ) : (
                    <span style={{ color: TXT_DIM, fontSize: '0.75rem' }}>加载中...</span>
                  )
                ) : collateralAssets.length > 0 ? (
                  <div className="text-right" style={{ color: TXT_PRI }}>
                    {collateralAssets.map((c, i) => <div key={i}>{c.qty} {c.coin}</div>)}
                  </div>
                ) : (
                  <span style={{ color: TXT_DIM, fontSize: '0.75rem' }}>暂无 <span style={{ color: '#F59E0B', fontWeight: 700 }}>!</span></span>
                )}
              </div>
            )}
            {/* 保证金率行（FC2977专属，显示剩余保证金占基数比） */}
            {isFC2977 && isStockCard && !isSharedMode && (
              <div className="flex justify-between items-center" style={{ borderTop: `1px solid ${DIVIDER}`, paddingTop: 4, marginTop: 4 }}>
                <span style={{ color: TXT_SEC }}>保证金率</span>
                {fc2977MarginBasePct !== null ? (
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: TXT_PRI }}>
                    {fc2977MarginBasePct >= 0 ? '+' : '-'}{Math.abs(fc2977MarginBasePct).toFixed(1)}%
                  </span>
                ) : (
                  <span style={{ color: TXT_DIM, fontSize: '0.75rem' }}>--</span>
                )}
              </div>
            )}
            {/* 共享担保标记行（共享担保模式才显示） */}
            {isSharedMode && (
              <>
                {/* 共享担保缺口弹窗 */}
                {showCollateralInfo && (
                  <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowCollateralInfo(false)}>
                    <div className="rounded-2xl p-5 mx-4 w-full max-w-xs overflow-y-auto" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold" style={{ color: '#1A2340' }}>担保缺口计算说明</span>
                        <button onClick={() => setShowCollateralInfo(false)} className="text-gray-400 text-lg leading-none">×</button>
                      </div>
                      <div className="text-xs space-y-2.5" style={{ color: '#4B5563' }}>
                        {/* ①② 总计风险敞口 + 保证金比例：与订单模式使用同一口径 */}
                        {sharedPoolInfo && (() => {
                          const orders = (sharedPoolInfo as any).orders ?? [];
                          let totalRequired = 0;
                          let allHaveGap = true;
                          for (const o of orders) {
                            const oQty = Number(o.quantity ?? 0);
                            const oPrincipal = Number(o.principal ?? 0);
                            const oCoin = (o.coin || '').toUpperCase();
                            const isCNYr = oCoin === 'CNY';
                            const oPrincipalUR = isCNYr ? oPrincipal / cnyRate : oPrincipal;
                            const oPendingInterestR = isCNYr ? Number(o.pendingInterest ?? 0) / cnyRate : Number(o.pendingInterest ?? 0);
                            const oPrincipalLentOutR = o.principalLentOut === true || o.principalLentOut === 1;
                            const oPrincipalDeductR = oPrincipalLentOutR ? oPrincipalUR : 0;
                            // 数量为零的期权/借出本金订单没有可估值持仓，不能重复扣除本金。
                            const isOptionNoQtyR = o.assetType === 'crypto_option' || (oQty === 0 && oPrincipalLentOutR);
                            if (isOptionNoQtyR) {
                              totalRequired -= oPendingInterestR + oPrincipalDeductR;
                              continue;
                            }
                            const oLiveP = livePrices[oCoin] ?? (o.currentPrice !== null && o.currentPrice !== undefined ? Number(o.currentPrice) : null);
                            if (!isCNYr && oLiveP === null) { allHaveGap = false; continue; }
                            const oCurrentValueR = isCNYr ? oQty / cnyRate : oLiveP! * oQty;
                            const oFloatPnlR = oCurrentValueR - oPrincipalUR;
                            totalRequired += oFloatPnlR - oPendingInterestR - oPrincipalDeductR;
                          }
                          const totalColl = (sharedPoolInfo as any).totalCollateralValue ?? 0;
                          const diff = totalColl + totalRequired;
                          const totalBuyValue = (sharedPoolInfo as any).totalBuyValue ?? 0;
                          const marginRatio = totalBuyValue > 0 ? (diff / totalBuyValue) * 100 : null;
                          const diffColor = diff < 0 ? '#16A34A' : '#DC2626';
                          const ratioColor = marginRatio === null ? '#9CA3AF' : (marginRatio < 0 ? '#16A34A' : '#DC2626');
                          return (
                            <>
                              <div className="p-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
                                <div className="font-semibold mb-1" style={{ color: '#374151' }}>① 总计风险敞口</div>
                                <div className="font-mono text-xs mb-1.5" style={{ color: '#6B7280' }}>担保物合计 + 净缺口合计</div>
                                <div className="font-mono text-xs mb-1" style={{ color: '#6B7280' }}>
                                  {allHaveGap
                                    ? <>{totalColl.toFixed(2)} + ({totalRequired >= 0 ? '+' : ''}{totalRequired.toFixed(2)}) = <span className="font-bold text-sm" style={{ color: diffColor }}>{diff >= 0 ? '+' : ''}{diff.toFixed(2)} u</span></>
                                    : <span style={{ color: '#9CA3AF' }}>订单缺口加载中...</span>}
                                </div>
                              </div>
                              <div className="p-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
                                <div className="font-semibold mb-1" style={{ color: '#374151' }}>② 保证金比例</div>
                                <div className="font-mono text-xs mb-1.5" style={{ color: '#6B7280' }}>风险敞口 ÷ 总订单买入价値</div>
                                <div className="font-mono text-xs mb-1" style={{ color: '#6B7280' }}>
                                  {allHaveGap
                                    ? <>{diff >= 0 ? '+' : ''}{diff.toFixed(2)} ÷ {totalBuyValue.toFixed(2)} = <span className="font-bold text-sm" style={{ color: ratioColor }}>{marginRatio !== null ? `${marginRatio >= 0 ? '+' : ''}${marginRatio.toFixed(2)}%` : '--'}</span></>
                                    : <span style={{ color: '#9CA3AF' }}>订单缺口加载中...</span>}
                                </div>
                                <div className="text-xs" style={{ color: '#9CA3AF' }}>总买入价値 {totalBuyValue.toFixed(2)} u（各订单买入价 × 数量之和，不随币价变动）</div>
                              </div>
                            </>
                          );
                        })()}

                        {/* ③ 共享订单缺口汇总 */}
                        <div className="p-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
                          <div className="font-semibold mb-1.5" style={{ color: '#374151' }}>③ 共享订单缺口汇总</div>
                          <div className="mb-1" style={{ color: '#9CA3AF' }}>每张订单缺口 = 浮动盈亏 − 待结利息（已扣除已结利息）</div>
                          {sharedPoolInfo ? (
                            <>
                              <div className="space-y-0">
                                {((sharedPoolInfo as any).orders ?? []).map((o: any, _idx: number, _arr: any[]) => {
                                  const oQty = Number(o.quantity ?? 0);
                                  const oPrincipal = Number(o.principal ?? 0);
                                  const oCoin = (o.coin || '').toUpperCase();
                                  const isCNY = oCoin === 'CNY';
                                  const oPendingInterestRaw = Number(o.pendingInterest ?? 0);
                                  const oPendingInterest = isCNY ? oPendingInterestRaw / cnyRate : oPendingInterestRaw;
                                  const oPrincipalU = isCNY ? oPrincipal / cnyRate : oPrincipal;
                                  const oPrincipalLentOut = o.principalLentOut === true || o.principalLentOut === 1;
                                  const oPrincipalDeduct = oPrincipalLentOut ? oPrincipalU : 0;
                                  // 期权或零数量的借出本金订单没有可估值持仓，只计待结利息及借出本金。
                                  const isOptionNoQty = o.assetType === 'crypto_option' || (oQty === 0 && oPrincipalLentOut);
                                  if (isOptionNoQty) {
                                    const gap = -(oPendingInterest + oPrincipalDeduct);
                                    return (
                                      <div key={o.orderId} className="flex justify-between items-center py-1" style={_idx < _arr.length - 1 ? { borderBottom: '1px dashed #E5E7EB' } : undefined}>
                                        <div>
                                          <button type="button" onClick={() => setClickedOrderNo(o.orderNo)} className="font-mono font-medium underline underline-offset-2 cursor-pointer" style={{ color: '#1A56DB', background: 'none', border: 'none', padding: 0 }}>{o.orderNo}</button>
                                          <span className="ml-1.5" style={{ color: '#9CA3AF' }}>{o.coin}</span>
                                        </div>
                                        <div className="text-right"><span className="font-mono font-semibold" style={{ color: gap >= 0 ? '#DC2626' : '#16A34A' }}>{gap >= 0 ? '+' : ''}{gap.toFixed(2)} u</span></div>
                                      </div>
                                    );
                                  }
                                  const oLiveP = livePrices[oCoin as CoinType] ?? (o.currentPrice !== null && o.currentPrice !== undefined ? Number(o.currentPrice) : null);
                                  const oCurrentValue = isCNY ? oQty / cnyRate : (oLiveP !== null ? oLiveP * oQty : null);
                                  const oFloatPnl = oCurrentValue !== null ? oCurrentValue - oPrincipalU : null;
                                  const gap = oFloatPnl !== null ? oFloatPnl - oPendingInterest - oPrincipalDeduct : null;
                                  return (
                                    <div key={o.orderId} className="flex justify-between items-center py-1" style={_idx < _arr.length - 1 ? { borderBottom: '1px dashed #E5E7EB' } : undefined}>
                                      <div>
                                        <button type="button" onClick={() => setClickedOrderNo(o.orderNo)} className="font-mono font-medium underline underline-offset-2 cursor-pointer" style={{ color: '#1A56DB', background: 'none', border: 'none', padding: 0 }}>{o.orderNo}</button>
                                        <span className="ml-1.5" style={{ color: '#9CA3AF' }}>{o.coin}</span>
                                        {o.quantity ? <span className="ml-1" style={{ color: '#9CA3AF' }}>× {oCoin === 'BTC' ? oQty.toFixed(2) : oQty}</span> : null}
                                      </div>
                                      <div className="text-right">
                                        {gap !== null
                                          ? <span className="font-mono font-semibold" style={{ color: gap >= 0 ? '#DC2626' : '#16A34A' }}>{gap >= 0 ? '+' : ''}{gap.toFixed(2)} u</span>
                                          : <span className="font-mono" style={{ color: '#9CA3AF' }}>计算中...</span>}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {(() => {
                                const orders = (sharedPoolInfo as any).orders ?? [];
                                let totalGapLive = 0; let allKnown = true;
                                for (const o of orders) {
                                  const oQty = Number(o.quantity ?? 0); const oPrincipal = Number(o.principal ?? 0);
                                  const oCoin = (o.coin || '').toUpperCase();
                                  const isCNYt = oCoin === 'CNY';
                                  const oPrincipalUT = isCNYt ? oPrincipal / cnyRate : oPrincipal;
                                  const oPendingInterestT = isCNYt ? Number(o.pendingInterest ?? 0) / cnyRate : Number(o.pendingInterest ?? 0);
                                  const oPrincipalLentOutT = o.principalLentOut === true || o.principalLentOut === 1;
                                  const isOptionNoQtyT = o.assetType === 'crypto_option' || (oQty === 0 && oPrincipalLentOutT);
                                  if (isOptionNoQtyT) {
                                    totalGapLive -= oPendingInterestT + (oPrincipalLentOutT ? oPrincipalUT : 0);
                                    continue;
                                  }
                                  const oLiveP = livePrices[oCoin as CoinType] ?? (o.currentPrice !== null && o.currentPrice !== undefined ? Number(o.currentPrice) : null);
                                  if (!isCNYt && oLiveP === null) { allKnown = false; continue; }
                                  const oCurrentValueT = isCNYt ? oQty / cnyRate : oLiveP! * oQty;
                                  totalGapLive += oCurrentValueT - oPrincipalUT - oPendingInterestT - (oPrincipalLentOutT ? oPrincipalUT : 0);
                                }
                                return (
                                  <div className="mt-2 pt-1.5 flex justify-between font-semibold" style={{ borderTop: '1px solid #E5E7EB' }}>
                                    <span style={{ color: '#374151' }}>合计缺口需求</span>
                                    {allKnown
                                      ? <span className="font-mono" style={{ color: totalGapLive >= 0 ? '#DC2626' : '#16A34A' }}>{totalGapLive >= 0 ? '+' : ''}{totalGapLive.toFixed(2)} u</span>
                                      : <span className="font-mono" style={{ color: '#9CA3AF' }}>计算中...</span>}
                                  </div>
                                );
                              })()}
                            </>
                          ) : <div className="text-gray-400">加载中...</div>}
                        </div>
                        {/* ④ 共享担保物汇总 */}
                        <div className="p-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
                          <div className="font-semibold mb-1.5" style={{ color: '#374151' }}>④ 共享担保物汇总</div>
                          {sharedPoolInfo ? (
                            <>
                              <div className="space-y-0">
                                {((sharedPoolInfo as any).orders ?? []).map((o: any, idx: number, arr: any[]) => (
                                  <div key={o.orderId} className="flex justify-between items-center py-1" style={idx < arr.length - 1 ? { borderBottom: '1px dashed #E5E7EB' } : undefined}>
                                    <button
                                      type="button"
                                      onClick={() => setClickedOrderNo(o.orderNo)}
                                      className="font-mono underline underline-offset-2 cursor-pointer"
                                      style={{ color: '#1A56DB', border: 'none', background: 'transparent', padding: 0 }}
                                    >{o.orderNo}</button>
                                    {(o.collateralAssets ?? []).length === 0
                                      ? <span style={{ color: '#9CA3AF' }}>无担保物</span>
                                      : <span className="font-mono font-semibold" style={{ color: '#DC2626' }}>{o.collateralValue > 0 ? `+${o.collateralValue.toFixed(2)} u` : '+--- u'}</span>}
                                  </div>
                                ))}
                              </div>
                              <div className="mt-2 pt-1.5 flex justify-between font-semibold" style={{ borderTop: '1px solid #E5E7EB' }}>
                                <span style={{ color: '#374151' }}>合计担保物价値</span>
                                <span className="font-mono" style={{ color: '#DC2626' }}>+{((sharedPoolInfo as any).totalCollateralValue ?? 0).toFixed(2)} u</span>
                              </div>
                            </>
                          ) : <div className="text-gray-400">加载中...</div>}
                        </div>
                        {/* 共享担保计算说明：与订单模式保持一致 */}
                        <div className="mt-2 p-2.5 rounded-lg text-[10px] space-y-1.5" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', color: '#6B7280' }}>
                          <div className="font-semibold text-[11px]" style={{ color: '#374151' }}>计算说明</div>
                          <div>• <strong>每张订单缺口</strong> = 浮动盈亏 − 待结利息（已扣除已结利息），盈利订单缺口为正（盈余），亏损订单缺口为负</div>
                          <div>• <strong>总计风险敞口</strong> = 共享担保物合计 + 各订单缺口合计（正数表示担保充足，负数表示担保不足）</div>
                          <div>• <strong>保证金比例</strong> = 风险敞口 ÷ 全部订单买入价值，负数表示担保不足需补仓</div>
                          <div>• <strong>期权订单缺口</strong>：开启「借出本金」开关→ 缺口 = 计息基数 + 待结利息；未开启→ 缺口 = 只有待结利息</div>
                        </div>

                        {/* 已在弹窗顶部按订单模式统一展示总计风险敞口与保证金比例，隐藏旧的重复计算区。 */}
                        {false && sharedPoolInfo && (() => {
                          const orders = (sharedPoolInfo as any).orders ?? [];
                          let totalRequired = 0; let allHaveGap = true;
                          for (const o of orders) {
                            const oQty = Number(o.quantity ?? 0); const oPrincipal = Number(o.principal ?? 0);
                            const oCoin = (o.coin || '').toUpperCase();
                            const isCNYr = oCoin === 'CNY';
                            const oLiveP = livePrices[oCoin as CoinType] ?? (o.currentPrice !== null ? Number(o.currentPrice) : null);
                            if (!isCNYr && oLiveP === null) { allHaveGap = false; continue; }
                            const oCurrentValueR = isCNYr ? oQty / cnyRate : oLiveP! * oQty;
                            const oPrincipalUR = isCNYr ? oPrincipal / cnyRate : oPrincipal;
                            const oPendingInterestR = isCNYr ? Number(o.pendingInterest ?? 0) / cnyRate : Number(o.pendingInterest ?? 0);
                            const oPrincipalLentOutR = o.principalLentOut === true || o.principalLentOut === 1;
                            totalRequired += oCurrentValueR - oPrincipalUR - oPendingInterestR - (oPrincipalLentOutR ? oPrincipalUR : 0);
                          }
                          const totalColl = (sharedPoolInfo as any).totalCollateralValue ?? 0;
                          const totalBuyValue = (sharedPoolInfo as any).totalBuyValue ?? 0;
                          const diff = totalColl + totalRequired;
                          const diffColor = diff < 0 ? '#16A34A' : '#DC2626';
                          const marginRatio = totalBuyValue > 0 ? (diff / totalBuyValue) * 100 : null;
                          const ratioColor = marginRatio === null ? '#9CA3AF' : (marginRatio < 0 ? '#16A34A' : '#DC2626');
                          return (
                            <>
                              <div className="p-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
                                <div className="font-semibold mb-1" style={{ color: '#374151' }}>③ 总计风险敎口</div>
                                <div className="font-mono text-xs mb-1" style={{ color: '#6B7280' }}>担保物合计 + 净缺口合计</div>
                                <div className="font-mono text-xs" style={{ color: '#6B7280' }}>
                                  {allHaveGap
                                    ? <>{totalColl.toFixed(2)} + ({totalRequired >= 0 ? '+' : ''}{totalRequired.toFixed(2)}) = <span className="font-bold text-sm" style={{ color: diffColor }}>{diff >= 0 ? '+' : ''}{diff.toFixed(2)} u</span></>
                                    : <span style={{ color: '#9CA3AF' }}>订单缺口加载中...</span>}
                                </div>
                              </div>
                              <div className="p-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
                                <div className="font-semibold mb-1" style={{ color: '#374151' }}>④ 保证金比例</div>
                                <div className="font-mono text-xs mb-1.5" style={{ color: '#6B7280' }}>风险敎口 ÷ 总订单买入价値</div>
                                <div className="font-mono text-xs mb-1" style={{ color: '#6B7280' }}>
                                  {allHaveGap
                                    ? <>{diff >= 0 ? '+' : ''}{diff.toFixed(2)} ÷ {totalBuyValue.toFixed(2)} = <span className="font-bold text-sm" style={{ color: ratioColor }}>{marginRatio !== null ? `${marginRatio >= 0 ? '+' : ''}${marginRatio.toFixed(2)}%` : '--'}</span></>
                                    : <span style={{ color: '#9CA3AF' }}>订单缺口加载中...</span>}
                                </div>
                                <div className="text-xs" style={{ color: '#9CA3AF' }}>总买入价値 {totalBuyValue.toFixed(2)} u（各订单买入价 × 数量之和，不随币价变动）</div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex justify-between" style={{ marginTop: 6 }}>
                  <span className="flex items-center gap-1" style={{ color: TXT_SEC }}>
                    担保资产
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setShowCollateralInfo(true); }}
                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold leading-none"
                      style={{ backgroundColor: '#E5E7EB', color: '#6B7280', border: 'none', cursor: 'pointer', lineHeight: 1 }}
                    >!</button>
                  </span>
                  <span className="font-semibold" style={{ color: '#A80000' }}>共享担保</span>
                </div>
              </>
            )}
            {/* 非共享担保：担保货币 / 担保总值 / 担保缺口 */}
            {!isSharedMode && !isStockCard && collateralAssets.length > 0 && (
              <>
                {collateralAssets.map((a, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between" style={{ marginTop: 6 }}>
                      <span className="flex items-center gap-1" style={{ color: TXT_SEC }}>
                        {collateralAssets.length > 1 ? `担保货币${idx + 1}` : '担保货币'}
                        {isFC2977 && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setShowCollateralInfo(true); }}
                            className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold leading-none"
                            style={{ backgroundColor: '#E5E7EB', color: '#6B7280', border: 'none', cursor: 'pointer', lineHeight: 1 }}
                          >!</button>
                        )}
                      </span>
                      <span style={{ color: TXT_PRI }}>{parseFloat(a.qty).toLocaleString()} {a.coin === 'CNY' ? '元' : a.coin}</span>
                    </div>
                    {collateralItemValues[idx] !== null && (
                      <div className="flex justify-between">
                        <span></span>
                        <span style={{ color: TXT_SEC }}>≈ {(collateralItemValues[idx] as number).toLocaleString(undefined, { maximumFractionDigits: 2 })} u</span>
                      </div>
                    )}
                  </div>
                ))}
                {collateralAssets.length > 1 && (
                  <div className="flex justify-between" style={{ marginTop: 4 }}>
                    <span style={{ color: TXT_SEC }}>担保总值</span>
                    <span style={{ color: TXT_PRI }}>{collateralValueKnown ? `${collateralValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} u` : '计算中...'}</span>
                  </div>
                )}
                <div className="flex justify-between" style={{ marginTop: 4 }}>
                  <span className="flex items-center gap-1" style={{ color: TXT_SEC }}>
                    担保缺口
                    <button type="button" onClick={e => { e.stopPropagation(); setShowCollateralInfo(true); }}
                      className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold leading-none"
                      style={{ backgroundColor: '#E5E7EB', color: '#6B7280', border: 'none', cursor: 'pointer', lineHeight: 1 }}>!</button>
                  </span>
                  <span style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {isSufficient ? '+' : '-'}{Math.abs(exposure).toLocaleString(undefined, { maximumFractionDigits: 2 })} u
                  </span>
                </div>
                {showCollateralInfo && (
                  <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowCollateralInfo(false)}>
                    <div className="rounded-2xl p-5 mx-4 w-full max-w-xs" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold" style={{ color: '#1A2340' }}>担保缺口计算说明</span>
                        <button onClick={() => setShowCollateralInfo(false)} className="text-gray-400 text-lg leading-none">×</button>
                      </div>
                      <div className="text-xs space-y-2" style={{ color: '#4B5563' }}>
                        <div>担保缺口 = 担保总值 + 浮动盈亏 − 待结利息 + 已结利息</div>
                        <div className="font-mono p-2 rounded" style={{ background: '#F9FAFB' }}>
                          = {collateralValue.toFixed(2)}
                          {floatPnl !== null ? ` + (${floatPnl >= 0 ? '+' : ''}${floatPnl.toFixed(2)})` : ' + ---'}
                          {` − ${displayAccrued.toFixed(2)}`}
                          {` + ${displayPaid.toFixed(2)}`}
                          {` = `}
                          <strong style={{ color: isSufficient ? '#16A34A' : '#DC2626' }}>{exposure >= 0 ? '+' : ''}{exposure.toFixed(2)} u</strong>
                        </div>
                        <div style={{ color: '#9CA3AF' }}>正数表示担保充足，负数表示担保缺口</div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}
      {/* 担保资产专属弹窗 —— 动态联动外部账本担保物 */}
      {hasExternalCollateral && _parsedCollateralSource && showCollateralInfo && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowCollateralInfo(false)}>
          <div className="rounded-2xl p-5 mx-4 w-full max-w-xs overflow-y-auto" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold" style={{ color: '#1A2340' }}>{_parsedCollateralSource.tagName}</span>
              <button onClick={() => setShowCollateralInfo(false)} className="text-gray-400 text-lg leading-none">×</button>
            </div>
            <RightMarginDetail ledgerId={_parsedCollateralSource.ledgerId} tagName={_parsedCollateralSource.tagName} />
          </div>
        </div>
      )}
      {/* ── 已结利息详情弹窗 ── */}
      {showInterestHistory && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowInterestHistory(false)}>
          <div className="rounded-2xl p-5 mx-4 w-full max-w-xs overflow-y-auto" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold" style={{ color: '#1A2340' }}>已结利息记录</span>
              <button onClick={() => setShowInterestHistory(false)} className="text-gray-400 text-lg leading-none">×</button>
            </div>
            {(!interestPaymentsData || (interestPaymentsData as any[]).length === 0) ? (
              <div className="text-center py-6 text-gray-400 text-sm">暂无结息记录</div>
            ) : (
              <div className="space-y-2">
                {(interestPaymentsData as any[]).map((p: any, i: number) => (
                  <div key={i} className="flex justify-between items-start py-1.5" style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <div>
                      <div className="text-xs" style={{ color: '#6B7280' }}>{p.pay_date ? String(p.pay_date).slice(0, 10) : '--'}</div>
                      {p.note && <div className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>{p.note}</div>}
                    </div>
                    <div className="text-sm font-semibold" style={{ color: '#16A34A' }}>+{parseFloat(p.amount || '0').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {p.currency || interestUnit}</div>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2">
                  <span className="text-xs" style={{ color: '#6B7280' }}>共 {(interestPaymentsData as any[]).length} 笔</span>
                  <span className="text-sm font-bold" style={{ color: '#1A2340' }}>合计 +{(interestPaymentsData as any[]).reduce((s: number, p: any) => s + parseFloat(p.amount || '0'), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {interestUnit}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {showInterestDetail && isFC2977 && _parsedCollateralSource && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowInterestDetail(false)}>
          <div className="rounded-2xl p-5 mx-4 w-full max-w-xs overflow-y-auto" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold" style={{ color: '#1A2340' }}>利息明细 · {(_parsedCollateralSource as any).interestTagName || _parsedCollateralSource.tagName}</span>
              <button onClick={() => setShowInterestDetail(false)} className="text-gray-400 text-lg leading-none">×</button>
            </div>
            <RightInterestDetail
              ledgerId={_parsedCollateralSource.ledgerId}
              tagName={(_parsedCollateralSource as any).interestTagName || _parsedCollateralSource.tagName}
            />
          </div>
        </div>
      )}
      {/* ── 备注展开区 ── */}
      {noteExpanded && (
        <div className="px-4 pb-3 pt-2 text-xs" style={{ borderTop: `1px dashed ${DIVIDER}`, position: 'relative', zIndex: 2 }} onClick={e => e.stopPropagation()}>
          {noteItems.length === 0 && noteEditingIdx === null && (
            <div style={{ color: TXT_DIM }} className="py-1">暂无备注</div>
          )}
          {noteItems.map((note, idx) => (
            <div key={idx}>
              {idx > 0 && <div style={{ borderTop: `1px solid ${DIVIDER}` }} className="my-1.5" />}
              {noteEditingIdx === idx ? (
                <div className="flex items-center gap-1 py-0.5">
                  <input
                    autoFocus
                    className="flex-1 text-xs border rounded px-1.5 py-0.5 outline-none"
                    style={{ borderColor: '#C7D7FF', color: '#1A2340', minWidth: 0 }}
                    value={noteEditValue}
                    onChange={e => setNoteEditValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        if (!noteEditValue.trim()) return;
                        saveNoteItems(noteItems.map((n, i) => i === idx ? { ...n, text: noteEditValue.trim(), time: new Date().toISOString() } : n));
                        setNoteEditingIdx(null);
                      }
                      if (e.key === 'Escape') { setNoteEditingIdx(null); if (!note.text) setNoteItems(noteItems.filter((_, i) => i !== idx)); }
                    }}
                    placeholder="输入备注..."
                    maxLength={200}
                  />
                  <button
                    onClick={() => {
                      if (!noteEditValue.trim()) return;
                      saveNoteItems(noteItems.map((n, i) => i === idx ? { ...n, text: noteEditValue.trim(), time: new Date().toISOString() } : n));
                      setNoteEditingIdx(null);
                    }}
                    disabled={noteSaving}
                    className="shrink-0 text-xs px-2 py-0.5 rounded"
                    style={{ background: '#3B82F6', color: '#fff' }}
                  >{noteSaving ? '...' : '保存'}</button>
                  <button
                    onClick={() => { setNoteEditingIdx(null); if (!note.text) setNoteItems(noteItems.filter((_, i) => i !== idx)); }}
                    className="shrink-0 text-xs px-1.5 py-0.5 rounded"
                    style={{ background: '#F3F4F6', color: '#6B7280' }}
                  >取消</button>
                </div>
              ) : (
                <div className="flex gap-2 py-0.5">
                  <div className="shrink-0 self-start mt-0.5">
                    {(() => {
                      const avatarUrl = note.userAvatar || (note.userId ? (membersData as any[])?.find((m: any) => m.userId === note.userId)?.avatar : null);
                      const ownerMember = !note.userId ? (membersData as any[])?.find((m: any) => m.role === 'owner') : null;
                      const finalAvatar = avatarUrl || (!note.userId ? ownerMember?.avatar : null);
                      const name = note.userName || (!note.userId ? (ownerMember?.username || ownerMember?.nickname || '') : '');
                      if (finalAvatar) return <img src={finalAvatar} alt="" className="w-6 h-6 rounded-full object-cover" style={{ border: `1px solid ${DIVIDER}` }} />;
                      if (!name) return <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#E5E7EB' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>;
                      const initials = name.slice(0, 1).toUpperCase();
                      const colors = ['#6366F1','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6'];
                      const color = colors[name.charCodeAt(0) % colors.length] || '#6366F1';
                      return <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: color }}>{initials}</div>;
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    {note.time && <div className="text-[10px] mb-0.5" style={{ color: TXT_DIM }}>{formatNoteTime(note.time)}</div>}
                    <div className="break-all" style={{ color: TXT_PRI, fontSize: '11px', lineHeight: '1.5' }}>{note.text}</div>
                  </div>
                  <div className="shrink-0 flex flex-row gap-1.5 self-start mt-0.5 items-center">
                    <button
                      type="button"
                      onClick={() => copyFunderNoteText(note.text)}
                      className="p-1 rounded"
                      style={{ background: 'transparent', color: TXT_PRI, border: `1px solid ${TXT_PRI}` }}
                      title="复制备注"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    {/* 编辑图标 */}
                    <button
                      type="button"
                      onClick={() => { setNoteEditingIdx(idx); setNoteEditValue(note.text); setNoteDeleteConfirmIdx(null); }}
                      className="p-1 rounded"
                      style={{ background: 'transparent', color: TXT_PRI, border: `1px solid ${TXT_PRI}` }}
                      title="编辑"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    {/* 删除：两次确认 */}
                    {noteDeleteConfirmIdx === idx ? (
                      <button
                        type="button"
                        onClick={() => { saveNoteItems(noteItems.filter((_, i) => i !== idx)); setNoteDeleteConfirmIdx(null); }}
                        className="p-1 rounded text-[10px] font-bold px-1.5"
                        style={{ background: 'transparent', color: TXT_PRI, border: `1px solid ${TXT_PRI}` }}
                        title="再次点击确认删除"
                      >确认?</button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setNoteDeleteConfirmIdx(idx)}
                        className="p-1 rounded"
                        style={{ background: 'transparent', color: TXT_PRI, border: `1px solid ${TXT_PRI}` }}
                        title="删除"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div style={{ borderTop: noteItems.length > 0 ? `1px solid ${DIVIDER}` : 'none' }} className="mt-1 pt-1">
            <button
              type="button"
              onClick={() => {
                const newItems = [...noteItems, { text: '', time: new Date().toISOString(), userId: currentUser?.id, userName: currentUser?.username || currentUser?.name, userAvatar: currentUser?.avatar }];
                setNoteItems(newItems);
                setNoteEditingIdx(newItems.length - 1);
                setNoteEditValue('');
              }}
              className="flex items-center gap-1"
              style={{ color: TXT_PRI }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              <span style={{ fontSize: '11px' }}>添加备注</span>
            </button>
          </div>
        </div>
      )}

      {/* 第二层弹窗：卡片模式的共享担保订单号以订单模式打开详情 */}
      {clickedOrderNo && clickedOrder && (
        <div className="fixed inset-0 z-[220] flex items-end justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setClickedOrderNo(null)}>
          <div className="w-full max-w-lg bg-white rounded-t-2xl overflow-y-auto" style={{ maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <span className="text-sm font-bold" style={{ color: '#1A2340' }}>{clickedOrderNo} 订单详情</span>
              <button type="button" onClick={() => setClickedOrderNo(null)} className="text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="pb-4">
              <FunderOrderCard
                order={clickedOrder}
                livePrices={livePrices}
                priceDirection={priceDirection}
                currentUser={currentUser}
                isAdmin={false}
                membersData={membersData}
                ledgerId={ledgerId}
                previewMode={true}
                allOrders={allOrders}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 银色铭牌·收益型（出借方）────────────────────────────────────────────────
// 适用于 interest_rate_annual 为正数的订单（jennypu 等出借方）
// 突出应收利息，展开区分利息块和担保物块

export function FunderLenderCardSilver({
  order,
  livePrices,
  priceDirection = {},
  cnyRate = DEFAULT_CNY_RATE,
  membersData = [],
  ledgerId,
  currentUser,
  isAdmin = false,
}: FunderOrderCardV2Props) {
  const cardExportRef = useRef<HTMLDivElement>(null);
  const allowImageDownload = isAdmin || getBooleanDisplayFlag(order, 'allowUserImageDownload', true);
  const [activeTab, setActiveTab] = useState<'detail' | 'note' | null>(null);
  const feeExpanded = activeTab === 'detail';
  const noteExpanded = activeTab === 'note';
  const toggleTab = (tab: 'detail' | 'note') => setActiveTab(v => v === tab ? null : tab);
  // 备注相关 state
  const [noteItems, setNoteItems] = useState(() => parseNotes(order.public_note || ''));
  const [noteEditingIdx, setNoteEditingIdx] = useState<number | null>(null);
  const [noteEditValue, setNoteEditValue] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  // 当order.public_note从服务器加载完成后同步更新noteItems
  useEffect(() => {
    setNoteItems(parseNotes(order.public_note || ''));
  }, [order.public_note]);
  const updateNoteM = trpc.ledger.funderUpdatePublicNote.useMutation();
  const saveNoteItems = async (newItems: ReturnType<typeof parseNotes>) => {
    if (!ledgerId) { toast.error('账本ID缺失，无法保存备注'); return; }
    setNoteSaving(true);
    try {
      const raw = JSON.stringify(newItems);
      await updateNoteM.mutateAsync({ id: order.id as number, ledgerId, publicNote: raw, participantUserId: _lnParticipantUserId });
      setNoteItems(newItems);
      order.public_note = raw;
      toast.success('备注已保存');
    } catch (e: any) {
      toast.error('备注保存失败：' + (e?.message || '未知错误'));
    } finally { setNoteSaving(false); }
  };
  const [showInterestHistory, setShowInterestHistory] = useState(false);
  const [showCollateralInfo, setShowCollateralInfo] = useState(false);
  const _lnIsParticipant = !!(order as any).participantInfo || !!(order as any)._isParticipant || !!(order as any)._fromFunder || (order as any).order_perspective === 'other';
  const _lnParticipantUserId = _lnIsParticipant ? ((order as any).participantInfo?.userId || undefined) : undefined;
  const interestHistoryQuery = trpc.ledger.funderGetInterestPayments.useQuery(
    { ledgerId: ledgerId ?? 0, orderId: order.id as number, participantUserId: _lnParticipantUserId },
    { enabled: showInterestHistory && !!ledgerId, staleTime: 0 }
  );
  // 共享担保池查询（仅当订单开启了本人订单共享时才查询）
  const orderShareMode = (order as any).collateral_share_mode;
  const isSharedMode = orderShareMode === 'self';
  const { data: sharedPoolInfo } = trpc.ledger.funderGetSharedCollateralPool.useQuery(
    { ledgerId: ledgerId ?? 0, userId: Number(order.user_id) },
    {
      enabled: !!ledgerId && isSharedMode,
      staleTime: 5000,
      refetchInterval: 15000,
      refetchIntervalInBackground: false,
    }
  );

  // 期权订单：标的资产以 option_info.coin 为准（此处 isOption 尚未定义，直接用 order.asset_type 判断）
  const _lnIsOpt = order.asset_type === 'crypto_option';
  const _lnOptInfo = (() => { try { const oi = (order as any).option_info; return typeof oi === 'string' ? JSON.parse(oi) : (oi || null); } catch { return null; } })();
  const coin = (_lnIsOpt && _lnOptInfo?.coin ? _lnOptInfo.coin : (order.coin || 'ETH')) as CoinType;
  const qty = _lnIsOpt && _lnOptInfo?.buyQty ? parseFloat(_lnOptInfo.buyQty) : parseFloat(order.buy_quantity || '0');
  const buyPrice = parseFloat(order.buy_price || '0');
  const liveP = livePrices[coin] ?? null;
  const rawAmountCurrency = String((order as any).amount_currency || 'USDT').toUpperCase();
  const amountCurrency = rawAmountCurrency === 'U' ? 'USDT' : rawAmountCurrency;
  const storedAmountUsdt = parseFloat(order.amount || '0');
  const amountCurrencyPrice = livePrices[amountCurrency as CoinType];
  const buyPriceUsdt = amountCurrency === 'CNY'
    ? buyPrice / cnyRate
    : amountCurrency === 'USDT'
      ? buyPrice
      : (amountCurrencyPrice && amountCurrencyPrice > 0 ? buyPrice * amountCurrencyPrice : buyPrice);
  const calculatedFinancingDisplayAmount = amountCurrency === 'CNY'
    ? storedAmountUsdt * cnyRate
    : amountCurrency === 'USDT'
      ? storedAmountUsdt
      : (amountCurrencyPrice && amountCurrencyPrice > 0 ? storedAmountUsdt / amountCurrencyPrice : storedAmountUsdt);
  const financingDisplayAmount = getExactFinancingDisplayAmount(order, amountCurrency, calculatedFinancingDisplayAmount);
  const buyQuoteUnit = amountCurrency === 'CNY' ? '元' : amountCurrency === 'USDT' ? 'U' : amountCurrency;

  const currentValue = liveP !== null && qty > 0 ? liveP * qty : null;
  const buyValue = storedAmountUsdt > 0 ? storedAmountUsdt : (qty > 0 && buyPriceUsdt > 0 ? qty * buyPriceUsdt : 0);
  const floatPnl = currentValue !== null && buyValue > 0 ? currentValue - buyValue : null;
  const floatPct = floatPnl !== null && buyValue > 0 ? (floatPnl / buyValue) * 100 : null;
  const dir = priceDirection?.[coin] ?? 'same';
  const isStock = order.asset_type === 'stock';
  const isOption = order.asset_type === 'crypto_option';
  const pnlColor = floatPnl === null ? (isOption ? OPT_TEXT_SEC : SL_TEXT_SEC) : floatPnl >= 0 ? SL_GREEN : SL_RED;
  const priceDiff = liveP !== null && buyPriceUsdt > 0 ? liveP - buyPriceUsdt : null;
  const priceColor = priceDiff === null ? (isOption ? OPT_TEXT_PRI : SL_TEXT_PRI) : priceDiff >= 0 ? SL_GREEN : SL_RED;

  const _isParticipantLn = (order as any).order_perspective === 'other';
  const _participantInterestRateValue = _isParticipantLn ? (order as any).participantInfo?.interestRate : undefined;
  const _hasParticipantInterestRate = _participantInterestRateValue !== undefined && _participantInterestRateValue !== null && _participantInterestRateValue !== '';
  const _participantInterestRate = _hasParticipantInterestRate ? String(_participantInterestRateValue) : '';
  const rateStr = _isParticipantLn && _hasParticipantInterestRate ? _participantInterestRate : getRateStr(order);
  const isNegRate = rateStr.startsWith('-');
  const rateAbs = formatFunderAnnualRate(rateStr);
  const _effectiveInterestBase = _isParticipantLn ? ((order as any).participantInfo?.commissionBase || order.interest_base) : order.interest_base;
  const _effectiveInterestRate = _isParticipantLn && _hasParticipantInterestRate ? _participantInterestRate : order.interest_rate_annual;
  const accrued = useAccruedInterestFunder(
    order.status === 'active' ? _effectiveInterestBase : null,
    order.status === 'active' ? _effectiveInterestRate : null,
    order.status === 'active' ? order.interest_start_date : null,
    order.settled_at
  );
  const baseCur = order.interest_base_currency || 'USDT';
  const rateCur = order.interest_rate_currency || 'USDT';
  const interestUnit = rateCur === 'CNY' ? '元' : 'U';
  const baseUnit = baseCur === 'CNY' ? '元' : 'U';
  const convertAccrued = (val: number): number => {
    if (baseCur === rateCur) return val;
    if (baseCur === 'USDT' && rateCur === 'CNY') return val * cnyRate;
    if (baseCur === 'CNY' && rateCur === 'USDT') return val / cnyRate;
    return val;
  };
  const displayAccrued = convertAccrued(accrued);
  const totalPaid = (order as any).paidTotal ? parseFloat((order as any).paidTotal.amount || '0') : 0;
  const displayPaid = convertAccrued(totalPaid);
  const approxPaidMode = getDisplayMode(order, 'approxPaid', 'U');
  const approxPaidValue = approxPaidMode === 'U'
    ? (interestUnit === 'U' ? displayPaid : displayPaid / cnyRate)
    : (interestUnit === 'U' ? displayPaid * cnyRate : displayPaid);
  const approxPaidUnit = approxPaidMode === 'U' ? 'U' : '元';
  // 约等于换算
  const approxAccrued = interestUnit === '元' ? displayAccrued / cnyRate : displayAccrued * cnyRate;
  const approxUnit = interestUnit === '元' ? 'u' : '元';

  let collateralAssets: { coin: string; qty: string }[] = [];
  try {
    const rawCA = order.collateral_assets;
    if (rawCA) {
      const parsed = typeof rawCA === 'string' ? JSON.parse(rawCA) : rawCA;
      if (Array.isArray(parsed)) collateralAssets = parsed;
    }
  } catch {}

  // 担保价值计算
  const collateralItemValues: (number | null)[] = collateralAssets.map((a) => {
    const p = livePrices[a.coin as CoinType] ?? null;
    return p !== null ? p * parseFloat(a.qty || '0') : null;
  });
  const collateralValueKnown = collateralItemValues.every((v) => v !== null);
  const collateralValue = collateralValueKnown
    ? collateralItemValues.reduce((s, v) => s + (v ?? 0), 0)
    : null;
  // 担保缺口 = 担保价值 + 浮动盈亏 - 待收利息(U) + 已结利息(U)（与老订单模式一致）
  // 利息如果是元，需先除以cnyRate换算成U
  const effectiveCnyRate = cnyRate && cnyRate > 0 ? cnyRate : 6.8;
  const accruedInU = interestUnit === '元' ? displayAccrued / effectiveCnyRate : displayAccrued;
  const paidInU = interestUnit === '元' ? displayPaid / effectiveCnyRate : displayPaid;
  // 正数=充足，负数=缺口
  const collateralGap = collateralValue !== null
    ? floatPnl !== null
      ? collateralValue + floatPnl - accruedInU + paidInU
      : collateralValue - accruedInU + paidInU
    : null;
  const isSufficient = collateralGap !== null && collateralGap >= 0;

  // 读取 display_config 开关（与订单模式一致）
  const dc: Record<string, boolean> | null = (() => {
    try {
      const raw = order.display_config;
      if (!raw) return null;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch { return null; }
  })();
  const showField = (key: string) => dc ? (dc[key] !== false) : true;

  // 天数算法与 hook 一致：北京时间自然日，开始日算第1天
  const calcDays = (startDateStr: string, endTs: number): number => {
    // 直接用 startDateStr 构造北京时间零点，避免 toISOString() 转 UTC 导致日期偏移
    const startDay = new Date(startDateStr + 'T00:00:00+08:00').getTime();
    // 用 toLocaleString 获取北京时间日期字符串，再构造北京时间零点
    const endDateBJStr = new Date(endTs).toLocaleString('sv', { timeZone: 'Asia/Shanghai' }).slice(0, 10);
    const endDay = new Date(endDateBJStr + 'T00:00:00+08:00').getTime();
    return Math.max(0, Math.floor((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1);
  };

  const fmt = (v: number | null, digits = 2) =>
    v == null || isNaN(v) ? '--' : v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const fmtQty = (v: number | null) =>
    v == null || isNaN(v) ? '--' : v % 1 === 0
      ? v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rivets = [
    { top: '6px', left: '7px' },
    { top: '6px', right: '7px' },
    { bottom: '6px', left: '7px' },
    { bottom: '6px', right: '7px' },
  ];

  // 本人 / 他人仅决定列表归属；绿色主题仅表达真实参与者身份。
  const isParticipant = !!(order as any).participantInfo || !!(order as any)._isParticipant || !!(order as any)._fromFunder;
  const GRN_POSITIVE_COLOR = LN_EARN;  // 暂时恢复原始颜色
  // 动态文字颜色：参与者和期权卡片用白色系列，其他用黑色系列
  const TXT_PRI = (isParticipant || isOption) ? (isParticipant ? GRN_TEXT_PRI : OPT_TEXT_PRI) : SL_TEXT_PRI;
  const TXT_SEC = (isParticipant || isOption) ? (isParticipant ? GRN_TEXT_SEC : OPT_TEXT_SEC) : SL_TEXT_SEC;
  const TXT_DIM = (isParticipant || isOption) ? (isParticipant ? GRN_TEXT_DIM : OPT_TEXT_DIM) : SL_TEXT_DIM;
  const TXT_SHADOW = (isParticipant || isOption) ? (isParticipant ? GRN_TEXT_SHADOW : OPT_TEXT_SHADOW) : SL_TEXT_SHADOW;
  const TXT_SHADOW_LG = (isParticipant || isOption) ? (isParticipant ? GRN_TEXT_SHADOW_LG : OPT_TEXT_SHADOW_LG) : SL_TEXT_SHADOW_LG;
  const DIVIDER = (isParticipant || isOption) ? (isParticipant ? GRN_DIVIDER : OPT_DIVIDER) : SL_DIVIDER;
  const GOLD_BG = [
    // 层1：左上角高光（稍弱）
    'linear-gradient(135deg, rgba(255,255,255,0.50) 0%, rgba(255,255,255,0.15) 22%, rgba(255,255,255,0.0) 45%, rgba(0,0,0,0.0) 60%, rgba(0,0,0,0.28) 100%)',
    // 层2：左亮右暗（加强纵深感）
    'linear-gradient(90deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 35%, rgba(0,0,0,0.0) 55%, rgba(0,0,0,0.18) 100%)',
    // 层3：垂直弧面光影（中间亮上下暗）
    'linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(255,255,255,0.18) 35%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.08) 70%, rgba(0,0,0,0.14) 100%)',
    // 层4：黄金底色（上一版基础上饱和度+20%）
    'linear-gradient(160deg, #9e7c28 0%, #c89e32 18%, #ddb545 40%, #c49030 62%, #ceA03c 80%, #9e7c28 100%)',
  ].join(', ');
  const GOLD_BORDER = '1.5px solid rgba(150,108,12,0.95)';
  const GOLD_SHADOW = [
    '0 6px 20px rgba(0,0,0,0.35)',
    '0 1px 3px rgba(0,0,0,0.25)',
    'inset 0 1.5px 0 rgba(255,228,100,0.88)',
    'inset 0 -1.5px 0 rgba(80,48,0,0.62)',
    'inset 1.5px 0 rgba(245,205,65,0.28)',
    'inset -1.5px 0 rgba(0,0,0,0.16)',
  ].join(', ');

  return (
    <div
      ref={cardExportRef}
      className="rounded-2xl overflow-hidden silver-card"
      style={{
        position: 'relative',
        background: isParticipant ? GRN_BG : isStock ? GOLD_BG : isOption ? OPT_BG : SL_BG,
        border: isParticipant ? GRN_BORDER : isStock ? GOLD_BORDER : isOption ? OPT_BORDER : SL_BORDER,
        boxShadow: isParticipant ? GRN_SHADOW : isStock ? GOLD_SHADOW : isOption ? OPT_SHADOW : SL_SHADOW,
      }}
    >
      {/* SVG 磨砂噪点滤镜 */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id="brushed-metal-noise-ln" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.65 0.015" numOctaves="4" seed="3" result="noise" />
            <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise" />
            <feBlend in="SourceGraphic" in2="grayNoise" mode="overlay" result="blended" />
            <feComposite in="blended" in2="SourceGraphic" operator="in" />
          </filter>
        </defs>
      </svg>
      {/* 磨砂噪点覆盖层 */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 1, borderRadius: 'inherit', pointerEvents: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75 0.02' numOctaves='4' seed='7'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.18'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px',
          mixBlendMode: 'overlay',
        }}
      />
      {/* 四角铆钉 */}
      {rivets.map((pos, i) => (
        <div
          key={i}
          style={{
            position: 'absolute', width: '6px', height: '6px', borderRadius: '50%', zIndex: 10,
            ...pos,
            background: isParticipant ? GRN_RIVET_BG
              : isStock
              ? 'radial-gradient(circle at 35% 35%, #fff8d0 0%, #e8c050 35%, #a07010 65%, #6a4800 100%)'
              : SL_RIVET_BG,
            boxShadow: isParticipant
              ? '0 1px 2px rgba(0,0,0,0.55), inset 0 1px 1px rgba(167,243,208,0.9)'
              : isStock
              ? '0 1px 2px rgba(0,0,0,0.55), inset 0 1px 1px rgba(255,240,140,0.9)'
              : '0 1px 2px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.8)',
          }}
        />
      ))}

      {/* ── 页眉：身份、日期/行情与订单号同一行，左右预留铆钉安全距离 ── */}
      <div className="px-5 pt-2 pb-1.5" style={{ borderBottom: `1px solid ${DIVIDER}` }}>
        {(() => {
          const member = (membersData as any[])?.find((m: any) => Number(m.userId) === Number(order.user_id));
          const normalOwnerName = member?.nickname || (order as any).nickname || member?.username || order.owner_label || null;
          const orderOwnerName = isParticipant
            ? ((order as any).order_owner_name || (order as any).nickname || (order as any).username || normalOwnerName)
            : normalOwnerName;
          const participantName = isParticipant
            ? ((order as any).participant_name || order.owner_label || null)
            : null;
          const buyDateStr = order.buy_date ? fmtDate(order.buy_date) : null;
          const brokerText = order.asset_type === 'stock'
            ? [order.broker_name, order.broker_account].filter(Boolean).join(' · ')
            : null;
          const showLivePrice = coin !== 'CNY' && coin !== 'USDT';
          const livePriceColor = dir === 'up' ? SL_GREEN : dir === 'down' ? SL_RED : TXT_PRI;
          const ownerNameClass = String(orderOwnerName ?? '').length > 10 ? 'text-[8px]' : String(orderOwnerName ?? '').length > 6 ? 'text-[9px]' : 'text-[10px]';
          const participantNameClass = String(participantName ?? '').length > 10 ? 'text-[8px]' : String(participantName ?? '').length > 6 ? 'text-[9px]' : 'text-[10px]';
          const metadataLength = String(buyDateStr ?? '').length + String(brokerText ?? '').length + (showLivePrice ? String(coin).length + 10 : 0);
          const metadataClass = metadataLength > 28 ? 'text-[9px]' : 'text-[11px]';
          const identityMaxWidth = metadataLength > 24 ? '58px' : '70px';
          const hasMetadata = !!(buyDateStr || brokerText || showLivePrice);
          return (
            <div className="flex min-w-0 items-center">
              {orderOwnerName && (
                <div className="min-w-0" style={{ flex: '0 1 auto', maxWidth: isParticipant ? identityMaxWidth : '108px' }}>
                  <div className="text-[8px] leading-none" style={{ color: TXT_SEC }}>拥有者</div>
                  <div className={`mt-0.5 truncate font-semibold leading-tight ${ownerNameClass}`} style={{ color: TXT_PRI }} title={String(orderOwnerName)}>
                    {orderOwnerName}
                  </div>
                </div>
              )}
              {isParticipant && participantName && (
                <div
                  className="ml-0.5 min-w-0 pl-1"
                  style={{ flex: '0 1 auto', maxWidth: identityMaxWidth, borderLeft: orderOwnerName ? '1px solid rgba(255,255,255,0.5)' : undefined }}
                >
                  <div className="text-[8px] leading-none" style={{ color: TXT_SEC }}>参与者</div>
                  <div className={`mt-0.5 truncate font-semibold leading-tight ${participantNameClass}`} style={{ color: TXT_PRI }} title={String(participantName)}>
                    {participantName}
                  </div>
                </div>
              )}
              {hasMetadata && (
                <div className={`ml-1.5 flex min-w-0 flex-1 items-center gap-x-1 overflow-hidden whitespace-nowrap leading-tight ${metadataClass}`} style={{ color: TXT_SEC }}>
                  {buyDateStr && <span className="shrink-0 whitespace-nowrap">{buyDateStr}</span>}
                  {brokerText && <span className="min-w-0 flex-1 truncate" title={brokerText}>{brokerText}</span>}
                  {showLivePrice && (
                    <span className="inline-flex min-w-0 items-center gap-0.5 whitespace-nowrap font-medium">
                      {dir === 'up' && <span className="inline-flex items-center" style={{ color: SL_GREEN, animation: 'price-blink 1.5s ease-in-out infinite', lineHeight: 1 }}>▲</span>}
                      {dir === 'down' && <span className="inline-flex items-center" style={{ color: SL_RED, animation: 'price-blink 1.5s ease-in-out infinite', lineHeight: 1 }}>▼</span>}
                      <span style={{ color: TXT_PRI }}>{coin}</span>
                      <span className="truncate" style={{ marginLeft: '2px', color: livePriceColor }}>{liveP != null ? liveP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}</span>
                    </span>
                  )}
                </div>
              )}
              {order.order_no && (
                <span className="ml-1 max-w-[58px] shrink-0 truncate text-[10px] font-mono leading-tight" style={{ color: TXT_DIM, letterSpacing: '0.03em' }} title={String(order.order_no)}>
                  {order.order_no}
                </span>
              )}
              {allowImageDownload && (
                <span className="ml-1 shrink-0">
                  <OrderCardImageDownload
                    targetRef={cardExportRef}
                    currentUser={currentUser}
                    orderNo={order.order_no || order.id}
                    color={TXT_PRI}
                    captureFullContent
                  />
                </span>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── 行2：应收利息大字（左）+ 年化利率（右）── */}
      <div className="flex gap-0 px-5 py-3" style={{ borderBottom: `1px solid ${DIVIDER}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[10px]" style={{ color: TXT_SEC }}>应收利息 ({interestUnit})</span>
            {!isStock && !isOption && showField('showTradeDirection') && ((order as any).trade_direction === 'long' || (order as any).trade_direction === 'short') && (
              <span
                className="text-[10px] font-bold px-1.5 rounded"
                style={(order as any).trade_direction === 'long'
                  ? { backgroundColor: 'rgba(16,185,129,0.18)', color: '#10B981', border: '1px solid rgba(16,185,129,0.4)' }
                  : { backgroundColor: 'rgba(239,68,68,0.18)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.4)' }}
              >{(order as any).trade_direction === 'long' ? '多' : '空'}</span>
            )}
          </div>
          <div style={{ lineHeight: 1, display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 700, color: GRN_POSITIVE_COLOR, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', textShadow: TXT_SHADOW_LG }}>
              {displayAccrued > 0 ? '+' : ''}{fmt(displayAccrued, 2)}
            </span>
            <span className="text-[10px]" style={{ color: TXT_SEC, whiteSpace: 'nowrap' }}>
              ≈{approxAccrued > 0 ? approxAccrued.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '--'} {approxUnit}
            </span>
          </div>
        </div>
        <div className="text-right" style={{ flex: 1 }}>
          <div className="text-[10px] mb-1" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>年化利率</div>
          <div style={{ lineHeight: 1 }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: TXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: TXT_SHADOW_LG }}>
              {rateAbs ? `${rateAbs}%` : '--'}
            </span>
          </div>
        </div>
      </div>

      {/* ── 行2.5：今日/本月/全年利息折算 ── */}
      {rateAbs && parseFloat(order.interest_base || '0') > 0 && (() => {
        // 计息基数单位是baseCur，先算出baseCur单位的利息，再用convertAccrued换算成显示单位
        const base = parseFloat(order.interest_base!);
        const rate = parseFloat(rateAbs) / 100;
        const dailyRaw = base * rate / 365;
        const monthlyRaw = base * rate / 12;
        const yearlyRaw = base * rate;
        const daily = convertAccrued(dailyRaw);
        const monthly = convertAccrued(monthlyRaw);
        const yearly = convertAccrued(yearlyRaw);
        const fmtSmall = (n: number) => n >= 0.01 ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : n.toFixed(4);
        return (
          <div className="grid grid-cols-3 gap-0 px-4 py-2" style={{ fontFamily: SL_NUM_FONT, borderBottom: `1px solid ${DIVIDER}` }}>
            <div>
              <div className="text-[10px] mb-0.5" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>今日利息 ({interestUnit})</div>
              <div className="text-sm font-semibold" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: TXT_SHADOW }}>{fmtSmall(daily)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] mb-0.5" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>整月利息 ({interestUnit})</div>
              <div className="text-sm font-semibold" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: TXT_SHADOW }}>{fmtSmall(monthly)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] mb-0.5" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>全年利息 ({interestUnit})</div>
              <div className="text-sm font-semibold" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: TXT_SHADOW }}>{fmtSmall(yearly)}</div>
            </div>
          </div>
        );
      })()}

      {/* ── 行3：计息基数 / 计息天数 / 担保缺口 ── */}
      <div className="grid grid-cols-3 gap-0 px-4 py-2" style={{ fontFamily: SL_NUM_FONT }}>
        <div>
          <div className="text-[10px] mb-0.5" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>{isStock ? `仓位额度 (${baseUnit})` : `计息基数 (${baseUnit})`}</div>
          <div className="text-sm font-semibold" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: TXT_SHADOW }}>
            {order.interest_base ? fmt(parseFloat(order.interest_base), 0) : '--'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] mb-0.5" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>计息天数 (天)</div>
          <div className="text-sm font-semibold" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: TXT_SHADOW }}>
            {order.interest_start_date
              ? calcDays(order.interest_start_date, order.settled_at ? new Date(order.settled_at).getTime() : Date.now())
              : '--'}
          </div>
        </div>
        <div className="text-right">
          {!isNegRate ? (
            <>
              <div className="text-[10px] mb-0.5" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>已收利息 ({interestUnit})</div>
              <div className="text-sm font-semibold" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: TXT_SHADOW }}>
                {displayPaid > 0 ? fmt(displayPaid) : '--'}
              </div>
            </>
          ) : showField('collateral') ? (
            <>
              <div className="text-[10px] mb-0.5" style={{ color: TXT_SEC, textShadow: TXT_SHADOW }}>担保缺口</div>
              <div className="text-sm font-semibold" style={{ textShadow: TXT_SHADOW, color: TXT_PRI }}>
                {collateralGap !== null ? (collateralGap >= 0 ? '充足' : '不足') : '--'}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Tab 栏：详情 | 备注 ── */}
      <div className="flex" style={{ borderTop: `1px solid ${DIVIDER}` }}>
        <button
          className="flex-1 flex items-center justify-center gap-1 py-2 relative"
          style={{ background: feeExpanded ? 'rgba(0,0,0,0.03)' : 'transparent' }}
          onClick={() => toggleTab('detail')}
        >
          <span style={{ color: feeExpanded ? TXT_PRI : TXT_DIM, fontSize: '0.7rem', fontWeight: feeExpanded ? 600 : 400 }}>详情</span>
          {feeExpanded
            ? <ChevronUp className="w-3 h-3" style={{ color: TXT_DIM }} />
            : <ChevronDown className="w-3 h-3" style={{ color: TXT_DIM }} />}
          {/* 不顶天立地的垂直分隔线 */}
          <span style={{ position: 'absolute', right: 0, top: '20%', height: '60%', width: 1, background: DIVIDER }} />
        </button>
        <button
          className="flex-1 flex items-center justify-center gap-1 py-2"
          style={{ background: noteExpanded ? 'rgba(0,0,0,0.03)' : 'transparent' }}
          onClick={() => toggleTab('note')}
        >
          <span style={{ color: noteExpanded ? TXT_PRI : TXT_DIM, fontSize: '0.7rem', fontWeight: noteExpanded ? 600 : 400 }}>备注</span>
          {(() => { const cnt = parseNotes(order.public_note || '').length; return cnt > 0 ? <span style={{ color: TXT_DIM, fontSize: '0.65rem' }}>({cnt})</span> : null; })()}
          {noteExpanded
            ? <ChevronUp className="w-3 h-3" style={{ color: TXT_DIM }} />
            : <ChevronDown className="w-3 h-3" style={{ color: TXT_DIM }} />}
        </button>
      </div>

      {/* ── 展开区 ── */}
      {feeExpanded && (() => {
        const interestBase = order.interest_base ? parseFloat(order.interest_base) : 0;
        return (
          <div className="px-4 pt-4 pb-3 space-y-1.5 text-[10px]">
            {/* ── 利息块 ── */}
            {/* 计息基数 */}
            <div className="flex justify-between">
              <span style={{ color: TXT_SEC }}>{isStock ? '仓位额度' : '计息基数'}</span>
              <span style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
                {buyPrice > 0 && qty > 0
                  ? `${fmt(buyPrice, 0)}U（开仓币价）× ${fmtQty(qty)}${coin} = ${fmt(interestBase, 0)} ${baseUnit}`
                  : interestBase ? `${fmt(interestBase, 0)} ${baseUnit}` : '--'
                }
              </span>
            </div>
            {/* 计息日期 */}
{(() => {
              const startStr = order.interest_start_date || order.buy_date;
              if (!startStr) return null;
              const startD = new Date(startStr + 'T00:00:00+08:00');
              const endD = order.settled_at ? new Date(order.settled_at) : new Date();
              const toBeijing = (d: Date) => new Date(d.getTime() + (8 * 60 - (-d.getTimezoneOffset())) * 60000);
              const s = toBeijing(startD);
              const e = toBeijing(endD);
              const fmtBJ = (d: Date) => `${String(d.getFullYear()).slice(2)}年${d.getMonth()+1}月${d.getDate()}日`;
              const days = calcDays(startStr, endD.getTime());
              return (
                <div className="flex justify-between">
                  <span style={{ color: TXT_SEC }}>计息日期（{fmtBJ(s)}）</span>
                  <span style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums' }}>{fmtBJ(s)} ~ {fmtBJ(e)}  {days}天</span>
                </div>
              );
            })()}
            {/* 已结利息：卡片模式不显示 */}
            {showInterestHistory && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowInterestHistory(false)}>
                <div className="rounded-2xl p-4 w-80 max-h-[70vh] overflow-y-auto" style={{ background: '#F9FAFB', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold" style={{ color: '#1A2340' }}>已结利息记录</span>
                    <button onClick={() => setShowInterestHistory(false)} className="text-gray-400 text-lg leading-none">×</button>
                  </div>
                  {interestHistoryQuery.isLoading && <div className="text-xs text-gray-400 text-center py-4">加载中...</div>}
                  {interestHistoryQuery.data && (interestHistoryQuery.data as any[]).length === 0 && (
                    <div className="text-xs text-gray-400 text-center py-4">暂无结息记录</div>
                  )}
                  {interestHistoryQuery.data && (interestHistoryQuery.data as any[]).length > 0 && (
                    <div>
                      {(interestHistoryQuery.data as any[]).map((p: any, i: number) => {
                        const cur = (p.currency || 'U') === 'CNY' ? '元' : 'u';
                        const fmtD = (s: string) => { const d = s ? String(s).slice(0, 10) : ''; return d ? `${d.slice(2,4)}.${d.slice(5,7)}.${d.slice(8,10)}` : ''; };
                        const payDateFmt = fmtD(p.pay_date);
                        const ps = p.period_start ? fmtD(p.period_start) : '';
                        const pe = p.period_end ? fmtD(p.period_end) : '';
                        const periodLabel = ps && pe ? `${ps} → ${pe}` : ps ? `${ps} 起` : pe ? `至 ${pe}` : '';
                        const amtStr = `${parseFloat(p.amount || '0').toLocaleString(undefined, { maximumFractionDigits: 4 })} ${cur}`;
                        const mainLeft = periodLabel ? `结算周期 ${periodLabel}` : `${payDateFmt} 结息`;
                        const needSecondLine = !!(periodLabel && payDateFmt) || !!p.note;
                        return (
                          <div key={p.id || i} className="py-2.5" style={{ borderBottom: '1px solid #F0F0F5' }}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs" style={{ color: '#4B5563' }}>{mainLeft}</span>
                              <span className="text-xs font-semibold shrink-0" style={{ color: '#1A2340' }}>{amtStr}</span>
                            </div>
                            {needSecondLine && (
                              <div className="flex items-center gap-2 mt-0.5">
                                {periodLabel && payDateFmt && <span className="text-[11px]" style={{ color: '#9CA3AF' }}>{payDateFmt} 结息</span>}
                                {p.note && <span className="text-[11px] text-gray-400 truncate">{p.note}</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div className="pt-2 flex items-center justify-between">
                        <span className="text-xs text-gray-400">共结息 {(interestHistoryQuery.data as any[]).length} 笔</span>
                        <span className="text-xs font-bold" style={{ color: '#3B82F6' }}>
                          {(() => {
                            const rows = interestHistoryQuery.data as any[];
                            const uTotal = rows.filter(r => (r.currency || 'U') !== 'CNY').reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
                            const cnyTotal = rows.filter(r => (r.currency || 'U') === 'CNY').reduce((s, r) => s + parseFloat(r.amount || '0'), 0);
                            const parts = [];
                            if (uTotal > 0) parts.push(`${uTotal.toLocaleString(undefined, { maximumFractionDigits: 4 })} u`);
                            if (cnyTotal > 0) parts.push(`${cnyTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} 元`);
                            return parts.join(' + ') || '0 u';
                          })()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {/* 待收利息 */}
            <div className="flex justify-between items-center">
              <span style={{ color: TXT_SEC }}>待收利息{rateAbs ? `（年化${rateAbs}%）` : ''}</span>
              <span style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
                {rateAbs && interestBase > 0 ? (() => {
                  const endTs = order.settled_at ? new Date(order.settled_at).getTime() : Date.now();
                  const days = order.interest_start_date ? calcDays(order.interest_start_date, endTs) : null;
                  return (
                    <>
                      <span style={{ color: TXT_PRI }}>{fmt(interestBase, 0)}×{rateAbs}%÷365{days != null ? `×${days}天` : ''} = </span>
                      <span style={{ color: TXT_PRI }}>{fmt(displayAccrued, 2)} {interestUnit}</span>
                    </>
                  );
                })() : <span style={{ color: TXT_PRI }}>{fmt(displayAccrued, 2)} {interestUnit}</span>}
              </span>
            </div>
            {/* 已结利息 */}
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-1" style={{ color: TXT_SEC }}>
                已结利息
              </span>
              <span className="flex flex-col items-end" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
                <span>{displayPaid > 0 ? `+${fmt(displayPaid, 2)} ${interestUnit}` : `+0.00 ${interestUnit}`}</span>
                {approxPaidMode !== 'hidden' && (
                  <span className="text-[10px]" style={{ color: TXT_DIM }}>≈{fmt(approxPaidValue, 2)} {approxPaidUnit}</span>
                )}
              </span>
            </div>
            {/* 合计应收 = 待收利息 - 已结利息 */}
            {(() => {
              const net = displayAccrued - displayPaid;
              const label = net >= 0 ? '待收利息' : '超收利息';
              const numColor = net >= 0 ? GRN_POSITIVE_COLOR : '#16A34A';
              return (
                <div className="flex justify-between" style={{ borderTop: `1px solid ${DIVIDER}`, paddingTop: 4, marginTop: 4 }}>
                  <span style={{ color: TXT_SEC }}>合计应收</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '0.85rem' }}>
                    <span style={{ color: TXT_PRI, fontSize: '0.7rem', fontWeight: 500, marginRight: 3, opacity: 0.85 }}>{label}</span>
                    <span style={{ color: numColor }}>{fmt(Math.abs(net), 2)} {interestUnit}</span>
                  </span>
                </div>
              );
            })()}

            {/* ── 担保物块 ── */}
            <div style={{ borderTop: `1px solid ${DIVIDER}`, marginTop: 6, paddingTop: 6 }}>
              {/* 持有资产 */}
              {(qty > 0 || storedAmountUsdt > 0) && (
                <div className="flex justify-between mb-1 gap-3">
                  <span style={{ color: TXT_SEC }}>持有资产</span>
                  <span className="text-right" style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
                    {amountCurrency === 'CNY' && storedAmountUsdt > 0
                      ? `${financingDisplayAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} 元（≈${storedAmountUsdt.toLocaleString(undefined, { maximumFractionDigits: 2 })} U）`
                      : buyPrice > 0
                        ? `（开仓价 ${fmt(buyPrice, 2)} ${buyQuoteUnit}） ${fmtQty(qty)} ${coin}`
                        : `${fmtQty(qty)} ${coin}`}
                  </span>
                </div>
              )}

              {/* 担保价値（非共享模式才显示） */}
              {!isSharedMode && showField('collateral') && collateralValue !== null && (
                <div className="flex justify-between mb-1">
                  <span style={{ color: TXT_SEC }}>担保价値</span>
                  <span style={{ color: TXT_PRI, fontVariantNumeric: 'tabular-nums' }}>{fmt(collateralValue, 2)} U</span>
                </div>
              )}
              {/* 担保缺口 */}
              {showField('collateral') && (
                <>
                  {/* 弹出说明窗 */}
                  {showCollateralInfo && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowCollateralInfo(false)}>
                      <div className="rounded-2xl p-5 mx-4 w-full max-w-xs overflow-y-auto" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxHeight: '80vh' }} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-bold" style={{ color: '#1A2340' }}>担保缺口计算说明</span>
                          <button onClick={() => setShowCollateralInfo(false)} className="text-gray-400 text-lg leading-none">×</button>
                        </div>
                        <div className="text-xs space-y-2.5" style={{ color: '#4B5563' }}>
                          {isSharedMode ? (
                            <>
                              {/* 共享担保：三段式 */}
                              {/* ① 共享订单缺口汇总 */}
                              <div className="p-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
                                <div className="font-semibold mb-1.5" style={{ color: '#374151' }}>① 共享订单缺口汇总</div>
                                <div className="mb-1" style={{ color: '#9CA3AF' }}>每张订单缺口 = 浮动盈亏 - 待结利息</div>
                                {sharedPoolInfo ? (
                                  <>
                                    <div className="space-y-1.5">
                                      {((sharedPoolInfo as any).orders ?? []).map((o: any) => {
                                        const oQty = Number(o.quantity ?? 0);
                                        const oPrincipal = Number(o.principal ?? 0);
                                        const oCoin = (o.coin || '').toUpperCase();
                                        const oLiveP = livePrices[oCoin as CoinType] ?? (o.currentPrice !== null ? Number(o.currentPrice) : null);
                                        // CNY 订单：金额单位是人民币，除以汇率换算成 U
                                        const isCNY = oCoin === 'CNY';
                                        const oCurrentValue = isCNY ? oQty / cnyRate : (oLiveP !== null ? oLiveP * oQty : null);
                                        const oPrincipalU = isCNY ? oPrincipal / cnyRate : oPrincipal;
                                        const oFloatPnl = oCurrentValue !== null ? oCurrentValue - oPrincipalU : null;
                                        const oPendingInterestRaw = Number(o.pendingInterest ?? 0);
                                        const oPendingInterest = isCNY ? oPendingInterestRaw / cnyRate : oPendingInterestRaw;
                                        const oPrincipalLentOut = o.principalLentOut === true || o.principalLentOut === 1;
                                        const oPrincipalDeduct = oPrincipalLentOut ? oPrincipalU : 0;
                                        const gap = oFloatPnl !== null ? oFloatPnl - oPendingInterest - oPrincipalDeduct : null;
                                        return (
                                          <div key={o.orderId} className="flex justify-between items-center">
                                            <div>
                                              <span className="font-mono font-medium" style={{ color: '#374151' }}>{o.orderNo}</span>
                                              <span className="ml-1.5" style={{ color: '#9CA3AF' }}>{o.coin}</span>
                                            </div>
                                            <div className="text-right">
                                              {gap !== null
                                                ? <span className="font-mono font-semibold" style={{ color: gap >= 0 ? '#DC2626' : '#16A34A' }}>{gap >= 0 ? '+' : ''}{gap.toFixed(2)} u</span>
                                                : <span className="font-mono" style={{ color: '#9CA3AF' }}>计算中...</span>}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {(() => {
                                      const orders = (sharedPoolInfo as any).orders ?? [];
                                      let totalGapLive = 0; let allKnown = true;
                                      for (const o of orders) {
                                        const oQty = Number(o.quantity ?? 0); const oPrincipal = Number(o.principal ?? 0);
                                        const oCoin = (o.coin || '').toUpperCase();
                                        const isCNYt = oCoin === 'CNY';
                                        const oLiveP = livePrices[oCoin as CoinType] ?? (o.currentPrice !== null ? Number(o.currentPrice) : null);
                                        if (!isCNYt && oLiveP === null) { allKnown = false; continue; }
                                        const oCurrentValueT = isCNYt ? oQty / cnyRate : oLiveP! * oQty;
                                        const oPrincipalUT = isCNYt ? oPrincipal / cnyRate : oPrincipal;
                                        const oPendingInterestT = isCNYt ? Number(o.pendingInterest ?? 0) / cnyRate : Number(o.pendingInterest ?? 0);
                                        const oPrincipalLentOutT = o.principalLentOut === true || o.principalLentOut === 1;
                                        totalGapLive += oCurrentValueT - oPrincipalUT - oPendingInterestT - (oPrincipalLentOutT ? oPrincipalUT : 0);
                                      }
                                      return (
                                        <div className="mt-2 pt-1.5 flex justify-between font-semibold" style={{ borderTop: '1px solid #E5E7EB' }}>
                                          <span style={{ color: '#374151' }}>合计缺口需求</span>
                                          {allKnown
                                            ? <span className="font-mono" style={{ color: totalGapLive >= 0 ? '#DC2626' : '#16A34A' }}>{totalGapLive >= 0 ? '+' : ''}{totalGapLive.toFixed(2)} u</span>
                                            : <span className="font-mono" style={{ color: '#9CA3AF' }}>计算中...</span>}
                                        </div>
                                      );
                                    })()}
                                  </>
                                ) : <div className="text-gray-400">加载中...</div>}
                              </div>
                              {/* ② 共享担保物汇总 */}
                              <div className="p-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
                                <div className="font-semibold mb-1.5" style={{ color: '#374151' }}>② 共享担保物汇总</div>
                                {sharedPoolInfo ? (
                                  <>
                                    <div className="space-y-1.5">
                                      {((sharedPoolInfo as any).orders ?? []).map((o: any) => (
                                        <div key={o.orderId} className="flex justify-between items-center">
                                          <span className="font-mono" style={{ color: '#374151' }}>{o.orderNo}</span>
                                          {(o.collateralAssets ?? []).length === 0
                                            ? <span style={{ color: '#9CA3AF' }}>无担保物</span>
                                            : <span className="font-mono font-semibold" style={{ color: '#DC2626' }}>{o.collateralValue > 0 ? `+${o.collateralValue.toFixed(2)} u` : '+--- u'}</span>}
                                        </div>
                                      ))}
                                    </div>
                                    <div className="mt-2 pt-1.5 flex justify-between font-semibold" style={{ borderTop: '1px solid #E5E7EB' }}>
                                      <span style={{ color: '#374151' }}>合计担保物价値</span>
                                      <span className="font-mono" style={{ color: '#DC2626' }}>+{((sharedPoolInfo as any).totalCollateralValue ?? 0).toFixed(2)} u</span>
                                    </div>
                                  </>
                                ) : <div className="text-gray-400">加载中...</div>}
                              </div>
                              {/* ③ 总计风险敎口 */}
                              {sharedPoolInfo && (() => {
                                const orders = (sharedPoolInfo as any).orders ?? [];
                                let totalRequired = 0; let allHaveGap = true;
                                for (const o of orders) {
                                  const oQty = Number(o.quantity ?? 0); const oPrincipal = Number(o.principal ?? 0);
                                  const oCoin = (o.coin || '').toUpperCase();
                                  const isCNYr = oCoin === 'CNY';
                                  const oLiveP = livePrices[oCoin as CoinType] ?? (o.currentPrice !== null ? Number(o.currentPrice) : null);
                                  if (!isCNYr && oLiveP === null) { allHaveGap = false; continue; }
                                  const oCurrentValueR = isCNYr ? oQty / cnyRate : oLiveP! * oQty;
                                  const oPrincipalUR = isCNYr ? oPrincipal / cnyRate : oPrincipal;
                                  const oPendingInterestR = isCNYr ? Number(o.pendingInterest ?? 0) / cnyRate : Number(o.pendingInterest ?? 0);
                                  const oPrincipalLentOutR = o.principalLentOut === true || o.principalLentOut === 1;
                                  totalRequired += oCurrentValueR - oPrincipalUR - oPendingInterestR - (oPrincipalLentOutR ? oPrincipalUR : 0);
                                }
                                const totalColl = (sharedPoolInfo as any).totalCollateralValue ?? 0;
                                const totalBuyValue = (sharedPoolInfo as any).totalBuyValue ?? 0;
                                const diff = totalColl + totalRequired;
                                const diffColor = diff < 0 ? '#16A34A' : '#DC2626';
                                const marginRatio = totalBuyValue > 0 ? (diff / totalBuyValue) * 100 : null;
                                const ratioColor = marginRatio === null ? '#9CA3AF' : (marginRatio < 0 ? '#16A34A' : '#DC2626');
                                return (
                                  <>
                                    <div className="p-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
                                      <div className="font-semibold mb-1" style={{ color: '#374151' }}>③ 总计风险敎口</div>
                                      <div className="font-mono text-xs mb-1" style={{ color: '#6B7280' }}>担保物合计 + 净缺口合计</div>
                                      <div className="font-mono text-xs" style={{ color: '#6B7280' }}>
                                        {allHaveGap
                                          ? <>{totalColl.toFixed(2)} + ({totalRequired >= 0 ? '+' : ''}{totalRequired.toFixed(2)}) = <span className="font-bold text-sm" style={{ color: diffColor }}>{diff >= 0 ? '+' : ''}{diff.toFixed(2)} u</span></>
                                          : <span style={{ color: '#9CA3AF' }}>订单缺口加载中...</span>}
                                      </div>
                                    </div>
                                    <div className="p-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #E5E7EB' }}>
                                      <div className="font-semibold mb-1" style={{ color: '#374151' }}>④ 保证金比例</div>
                                      <div className="font-mono text-xs mb-1.5" style={{ color: '#6B7280' }}>风险敎口 ÷ 总订单买入价値</div>
                                      <div className="font-mono text-xs mb-1" style={{ color: '#6B7280' }}>
                                        {allHaveGap
                                          ? <>{diff >= 0 ? '+' : ''}{diff.toFixed(2)} ÷ {totalBuyValue.toFixed(2)} = <span className="font-bold text-sm" style={{ color: ratioColor }}>{marginRatio !== null ? `${marginRatio >= 0 ? '+' : ''}${marginRatio.toFixed(2)}%` : '--'}</span></>
                                          : <span style={{ color: '#9CA3AF' }}>订单缺口加载中...</span>}
                                      </div>
                                      <div className="text-xs" style={{ color: '#9CA3AF' }}>总买入价値 {totalBuyValue.toFixed(2)} u（各订单买入价 × 数量之和，不随币价变动）</div>
                                    </div>
                                  </>
                                );
                              })()}
                            </>
                          ) : (
                            <>
                              {/* 普通担保：原有三段式 */}
                              <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                                <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>① 浮动盈亏</div>
                                <div>= 当前市値 - 计息基数（正数为浮盈，负数为亏损）</div>
                                <div className="mt-1 font-mono">
                                  {floatPnl !== null
                                    ? <><span style={{ color: '#3B82F6' }}>= {(liveP! * qty).toFixed(2)} - {buyValue.toFixed(2)} = </span><strong style={{ color: floatPnl >= 0 ? '#DC2626' : '#16A34A' }}>{floatPnl >= 0 ? '+' : ''}{floatPnl.toFixed(2)} u{floatPnl >= 0 ? '（浮盈）' : '（亏损）'}</strong></>
                                    : <span className="text-gray-400">当前市値暂无实时价格，暂无法计算浮动盈亏</span>
                                  }
                                </div>
                              </div>
                              <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                                <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>② 担保价値</div>
                                {collateralAssets.length === 0
                                  ? <div className="font-mono mt-1" style={{ color: '#9CA3AF' }}>0.00 u（无担保物）</div>
                                  : <>
                                      {collateralAssets.map((a, idx) => {
                                        const itemVal = collateralItemValues[idx];
                                        return (
                                          <div key={idx} className="mt-1 flex justify-between">
                                            <span className="font-mono" style={{ color: '#6B7280' }}>{a.qty} {a.coin}</span>
                                            {itemVal !== null
                                              ? <span className="font-mono font-semibold" style={{ color: '#3B82F6' }}>{itemVal.toFixed(2)} u</span>
                                              : <span className="font-mono" style={{ color: '#D1D5DB' }}>暂无实时价</span>
                                            }
                                          </div>
                                        );
                                      })}
                                      {collateralAssets.length > 1 && collateralValue !== null && (
                                        <div className="font-mono mt-1 pt-1 font-semibold" style={{ borderTop: '1px solid #D1D5DB', color: '#1A2340' }}>
                                          合计 {collateralValue.toFixed(2)} u
                                        </div>
                                      )}
                                    </>
                                }
                              </div>
                              {collateralGap !== null && (
                                <div className="p-2.5 rounded-lg" style={{ background: isSufficient ? '#FFF1F1' : '#F0FDF4' }}>
                                  <div className="font-semibold mb-1" style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>③ 风险敎口</div>
                                  <div>担保物 + 浮动盈亏 − 待结利息(U) + 已结利息(U)（正数充足，负数缺口）</div>
                                  {interestUnit === '元' && (
                                    <div className="text-[10px] mt-0.5" style={{ color: '#9CA3AF' }}>利息已按汇率 {effectiveCnyRate.toFixed(2)} 换算为 U</div>
                                  )}
                                  <div className="mt-1 font-mono">
                                    {(() => {
                                      const gap = collateralGap!;
                                      return floatPnl !== null
                                        ? <span style={{ color: '#3B82F6' }}>= {(collateralValue ?? 0).toFixed(2)} + ({floatPnl >= 0 ? '+' : ''}{floatPnl.toFixed(2)}) − {accruedInU.toFixed(2)} + {paidInU.toFixed(2)} = <strong style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>{gap >= 0 ? '+' : ''}{gap.toFixed(2)} U</strong></span>
                                        : <span style={{ color: '#3B82F6' }}>= {(collateralValue ?? 0).toFixed(2)} + ---（暂无实时价） − {accruedInU.toFixed(2)} + {paidInU.toFixed(2)} = <strong style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>{gap >= 0 ? '+' : ''}{gap.toFixed(2)} U</strong></span>;
                                    })()}
                                  </div>
                                  <div className="mt-1.5" style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>
                                    {isSufficient
                                      ? `担保物充足，还有 ${collateralGap!.toFixed(2)} U 的余量空间`
                                      : `担保物不足，还需补充 ${Math.abs(collateralGap!).toFixed(2)} U 才能覆盖风险`
                                    }
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {/* 担保缺口行：共享模式显示共享池缺口，普通模式显示单订单缺口 */}
                  {(isSharedMode || collateralGap !== null) && (
                    <div className="flex justify-between mb-1 items-center">
                      <span className="flex items-center gap-1" style={{ color: TXT_SEC }}>
                        担保缺口
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); setShowCollateralInfo(true); }}
                          className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold leading-none"
                          style={{ backgroundColor: '#E5E7EB', color: '#6B7280', border: 'none', cursor: 'pointer', lineHeight: 1 }}
                        >?</button>
                      </span>
                      {isSharedMode ? (() => {
                        // 共享模式：用 livePrices 重算共享池缺口（与弹窗内①总计风险敞口同一口径）
                        if (!sharedPoolInfo) return <span style={{ color: '#9CA3AF', fontSize: '0.75rem' }}>计算中...</span>;
                        const orders = (sharedPoolInfo as any).orders ?? [];
                        let totalRequired = 0; let allKnown = true;
                        for (const o of orders) {
                          const oQty = Number(o.quantity ?? 0); const oPrincipal = Number(o.principal ?? 0);
                          const oCoin = (o.coin || '').toUpperCase();
                          const isCNYtl = oCoin === 'CNY';
                          const oPrincipalUtl = isCNYtl ? oPrincipal / cnyRate : oPrincipal;
                          const oPendingItl = isCNYtl ? Number(o.pendingInterest ?? 0) / cnyRate : Number(o.pendingInterest ?? 0);
                          const oPrincipalLentOutTl = o.principalLentOut === true || o.principalLentOut === 1;
                          const oPrincipalDeductTl = oPrincipalLentOutTl ? oPrincipalUtl : 0;
                          const isOptionNoQtyTl = o.assetType === 'crypto_option' || (oQty === 0 && oPrincipalLentOutTl);
                          if (isOptionNoQtyTl) {
                            totalRequired -= oPendingItl + oPrincipalDeductTl;
                            continue;
                          }
                          const oLiveP = livePrices[oCoin as CoinType] ?? (o.currentPrice !== null && o.currentPrice !== undefined ? Number(o.currentPrice) : null);
                          if (!isCNYtl && oLiveP === null) { allKnown = false; continue; }
                          const oCurrentValueTl = isCNYtl ? oQty / cnyRate : oLiveP! * oQty;
                          totalRequired += oCurrentValueTl - oPrincipalUtl - oPendingItl - oPrincipalDeductTl;
                        }
                        const totalColl = (sharedPoolInfo as any).totalCollateralValue ?? 0;
                        const diff = totalColl + totalRequired;
                        const diffSufficient = diff >= 0;
                        return allKnown
                          ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                              <span style={{ color: TXT_PRI, fontSize: '0.7rem', fontWeight: 500, marginRight: 3, opacity: 0.85 }}>{diffSufficient ? '充足' : '不足'}</span>
                              <span style={{ color: TXT_PRI }}>{diffSufficient ? '+' : ''}{diff.toFixed(2)} U</span>
                            </span>
                          : <span style={{ color: '#9CA3AF', fontSize: '0.75rem' }}>计算中...</span>;
                      })() : (
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ color: TXT_PRI, fontSize: '0.7rem', fontWeight: 500, marginRight: 3, opacity: 0.85 }}>{isSufficient ? '充足' : '不足'}</span>
                          <span style={{ color: TXT_PRI }}>{isSufficient ? '+' : ''}{fmt(collateralGap, 2)} U</span>
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

          </div>
        );
      })()}

      {/* ── 备注展开区 ── */}
      {noteExpanded && (
        <div className="px-4 pb-3 pt-2 text-xs" style={{ borderTop: `1px dashed ${DIVIDER}`, position: 'relative', zIndex: 2 }} onClick={e => e.stopPropagation()}>
          {/* 备注列表 */}
          {noteItems.length === 0 && noteEditingIdx === null && (
            <div style={{ color: TXT_DIM }} className="py-1">暂无备注</div>
          )}
          {noteItems.map((note, idx) => (
            <div key={idx}>
              {idx > 0 && <div style={{ borderTop: `1px solid ${DIVIDER}` }} className="my-1.5" />}
              {noteEditingIdx === idx ? (
                <div className="flex items-center gap-1 py-0.5">
                  <input
                    autoFocus
                    className="flex-1 text-xs border rounded px-1.5 py-0.5 outline-none"
                    style={{ borderColor: '#C7D7FF', color: '#1A2340', minWidth: 0 }}
                    value={noteEditValue}
                    onChange={e => setNoteEditValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        if (!noteEditValue.trim()) return;
                        saveNoteItems(noteItems.map((n, i) => i === idx ? { ...n, text: noteEditValue.trim(), time: new Date().toISOString() } : n));
                        setNoteEditingIdx(null);
                      }
                      if (e.key === 'Escape') { setNoteEditingIdx(null); if (!note.text) setNoteItems(noteItems.filter((_, i) => i !== idx)); }
                    }}
                    placeholder="输入备注..."
                    maxLength={200}
                  />
                  <button
                    onClick={() => {
                      if (!noteEditValue.trim()) return;
                      saveNoteItems(noteItems.map((n, i) => i === idx ? { ...n, text: noteEditValue.trim(), time: new Date().toISOString() } : n));
                      setNoteEditingIdx(null);
                    }}
                    disabled={noteSaving}
                    className="shrink-0 text-xs px-2 py-0.5 rounded"
                    style={{ background: '#3B82F6', color: '#fff' }}
                  >{noteSaving ? '...' : '保存'}</button>
                  <button
                    onClick={() => { setNoteEditingIdx(null); if (!note.text) setNoteItems(noteItems.filter((_, i) => i !== idx)); }}
                    className="shrink-0 text-xs px-1.5 py-0.5 rounded"
                    style={{ background: '#F3F4F6', color: '#6B7280' }}
                  >取消</button>
                </div>
              ) : (
                <div className="flex gap-2 py-0.5">
                  {/* 左侧头像 */}
                  <div className="shrink-0 self-start mt-0.5">
                    {(() => {
                      const avatarUrl = note.userAvatar || (note.userId ? (membersData as any[])?.find((m: any) => m.userId === note.userId)?.avatar : null);
                      const ownerMember = !note.userId ? (membersData as any[])?.find((m: any) => m.role === 'owner') : null;
                      const finalAvatar = avatarUrl || (!note.userId ? ownerMember?.avatar : null);
                      const name = note.userName || (!note.userId ? (ownerMember?.username || ownerMember?.nickname || '') : '');
                      if (finalAvatar) return <img src={finalAvatar} alt="" className="w-6 h-6 rounded-full object-cover" style={{ border: `1px solid ${DIVIDER}` }} />;
                      if (!name) return <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#E5E7EB' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>;
                      const initials = name.slice(0, 1).toUpperCase();
                      const colors = ['#6366F1','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6'];
                      const color = colors[name.charCodeAt(0) % colors.length] || '#6366F1';
                      return <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: color }}>{initials}</div>;
                    })()}
                  </div>
                  {/* 右侧内容 */}
                  <div className="flex-1 min-w-0">
                    {note.time && <div className="text-[10px] mb-0.5" style={{ color: TXT_DIM }}>{formatNoteTime(note.time)}</div>}
                    <div className="break-all" style={{ color: TXT_PRI, fontSize: '11px', lineHeight: '1.5' }}>{note.text}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyFunderNoteText(note.text)}
                    className="shrink-0 p-1 rounded self-start mt-0.5"
                    style={{ background: 'transparent', color: TXT_PRI, border: `1px solid ${TXT_PRI}` }}
                    title="复制备注"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          ))}
          {/* 添加备注按鈕 */}
          <div style={{ borderTop: noteItems.length > 0 ? `1px solid ${DIVIDER}` : 'none' }} className="mt-1 pt-1">
            <button
              type="button"
              onClick={() => {
                const newItems = [...noteItems, { text: '', time: new Date().toISOString(), userId: currentUser?.id, userName: currentUser?.username || currentUser?.name, userAvatar: currentUser?.avatar }];
                setNoteItems(newItems);
                setNoteEditingIdx(newItems.length - 1);
                setNoteEditValue('');
              }}
              className="flex items-center gap-1"
              style={{ color: TXT_PRI }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              <span style={{ fontSize: '11px' }}>添加备注</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

