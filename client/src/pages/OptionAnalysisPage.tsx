/**
 * OptionAnalysisPage.tsx
 * 期权分析总览页面
 * - 与 OrderFlowPage / PositionCalc 风格完全一致（OKX 深色主题）
 * - 读取 orderFlow.getOrders 中 market_type='option' 的持仓
 * - 功能：汇总卡片 / 到期预警 / 期权矩阵热力图 / P&L 曲线 / 希腊字母 / 订单管理
 * - v2：新增「订单」Tab，完整复用订单流卡片和表单，可直接增删改期权订单
 */
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Settings,
  BarChart2,
  Grid,
  Activity,
  List,
  Plus,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  blackScholes,
  calcPortfolioGreeks,
  calcExpiryPnL,
  type PositionForCalc,
} from "../../../shared/blackScholes";

// ===== 颜色常量（与 OrderFlowPage 完全一致）=====
const OKX_BG = "#0B0E11";
const OKX_CARD = "#161A1E";
const OKX_BORDER = "rgba(255,255,255,0.08)";
const OKX_TEXT_PRI = "#EAECEF";
const OKX_TEXT_SEC = "#848E9C";
const OKX_YELLOW = "#F0B90B";
const OKX_GREEN = "#0ECB81";
const OKX_RED = "#F6465D";
const OKX_CALL = "#0ECB81";
const OKX_PUT = "#F6465D";

// ===== 工具函数 =====
function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return "--";
  return n.toLocaleString("zh-CN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return "--";
  return s.slice(0, 10);
}
function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ===== Tab 类型 =====
type TabId = "summary" | "matrix" | "pnl" | "greeks";


// ===== 汇总曲线 Canvas组件（所有订单叠加）=====
function CombinedPnlCanvas({
  perOrderPnL,
  combinedPnL,
  currentPrice,
  highlightId,
  onHighlight,
}: {
  perOrderPnL: { id: number; label: string; color: string; strikePrice: number; data: { price: number; pnl: number }[] }[];
  combinedPnL: { price: number; pnl: number }[];
  currentPrice?: number;
  highlightId: number | null;
  onHighlight: (id: number | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragPrice, setDragPrice] = useState<number | null>(null);
  const [isDragMode, setIsDragMode] = useState(false);
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceRangeRef = useRef<{ minP: number; maxP: number; W: number; padL: number; padR: number } | null>(null);

  const resetDragTimer = useCallback(() => {
    if (dragTimerRef.current) clearTimeout(dragTimerRef.current);
    dragTimerRef.current = setTimeout(() => {
      setIsDragMode(false);
      setDragPrice(null);
    }, 30000);
  }, []);

  const xToPrice = useCallback((clientX: number): number | null => {
    const canvas = canvasRef.current;
    if (!canvas || !priceRangeRef.current) return null;
    const rect = canvas.getBoundingClientRect();
    const { minP, maxP, W, padL, padR } = priceRangeRef.current;
    const x = clientX - rect.left;
    const ratio = (x - padL) / (W - padL - padR);
    const logMin = Math.log(Math.max(minP, 1));
    const logMax = Math.log(Math.max(maxP, 1));
    const logP = logMin + ratio * (logMax - logMin);
    return Math.max(minP, Math.min(maxP, Math.exp(logP)));
  }, []);

  const handleMove = useCallback((clientX: number) => {
    if (!isDragMode) return;
    const p = xToPrice(clientX);
    if (p !== null) { setDragPrice(p); resetDragTimer(); }
  }, [isDragMode, xToPrice, resetDragTimer]);

  const displayPrice = dragPrice ?? currentPrice;

  // 计算拖动时的P&L
  const dragPnL = useMemo(() => {
    if (!dragPrice || combinedPnL.length < 2) return null;
    const sorted = [...combinedPnL].sort((a, b) => a.price - b.price);
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].price <= dragPrice && sorted[i + 1].price >= dragPrice) {
        const ratio = (dragPrice - sorted[i].price) / (sorted[i + 1].price - sorted[i].price);
        return sorted[i].pnl + ratio * (sorted[i + 1].pnl - sorted[i].pnl);
      }
    }
    return null;
  }, [dragPrice, combinedPnL]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || combinedPnL.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = 280;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const pad = { top: 28, right: 12, bottom: 28, left: 8 };
    const minP = 1200, maxP = 4000;
    const logMin = Math.log(Math.max(minP, 1));
    const logMax = Math.log(Math.max(maxP, 1));
    const toX = (p: number) => {
      const ratio = (Math.log(Math.max(p, 1)) - logMin) / (logMax - logMin);
      return pad.left + ratio * (W - pad.left - pad.right);
    };

    // 计算Y轴范围
    let allMin = Infinity, allMax = -Infinity;
    for (const s of perOrderPnL) {
      for (const d of s.data) { allMin = Math.min(allMin, d.pnl); allMax = Math.max(allMax, d.pnl); }
    }
    for (const d of combinedPnL) { allMin = Math.min(allMin, d.pnl); allMax = Math.max(allMax, d.pnl); }
    const margin = (allMax - allMin) * 0.12 || 1000;
    const minV = allMin - margin, maxV = allMax + margin;
    const vRange = maxV - minV;
    const chartH = H - pad.top - pad.bottom;
    const toY = (v: number) => pad.top + ((maxV - v) / vRange) * chartH;
    // 保存价格范围供 touch/mouse 事件使用
    priceRangeRef.current = { minP, maxP, W, padL: pad.left, padR: pad.right };

    // 背景网格
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 4]);
    for (let p = 1400; p <= 4000; p += 200) {
      const x = toX(p);
      ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, H - pad.bottom); ctx.stroke();
    }
    const step = 10000;
    const startY = Math.ceil(minV / step) * step;
    for (let v = startY; v <= maxV; v += step) {
      const y = toY(v);
      if (y < pad.top || y > H - pad.bottom) continue;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // 零轴线
    const zeroY = toY(0);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(W - pad.right, zeroY); ctx.stroke();

    // 三色分段辅助函数
    const getSegColor = (data: {price:number;pnl:number}[], idx: number, strike: number) => {
      const { price, pnl } = data[idx];
      if (pnl >= 0) return "#F6465D";
      if (price > strike) return "rgba(160,160,160,0.85)";
      return "#0ECB81";
    };
    const drawThreeColor = (
      data: {price:number;pnl:number}[],
      strike: number,
      lineWidth: number,
      alpha: number
    ) => {
      if (data.length < 2) return;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([]);
      for (let i = 0; i < data.length - 1; i++) {
        const a = data[i], b = data[i + 1];
        const ca = getSegColor(data, i, strike);
        const cb = getSegColor(data, i + 1, strike);
        if (a.pnl < 0 && b.pnl >= 0) {
          const ratio = Math.abs(a.pnl) / (Math.abs(a.pnl) + Math.abs(b.pnl));
          const cx2 = toX(a.price + ratio * (b.price - a.price));
          const cy2 = toY(0);
          ctx.strokeStyle = ca; ctx.beginPath(); ctx.moveTo(toX(a.price), toY(a.pnl)); ctx.lineTo(cx2, cy2); ctx.stroke();
          ctx.strokeStyle = "#F6465D"; ctx.beginPath(); ctx.moveTo(cx2, cy2); ctx.lineTo(toX(b.price), toY(b.pnl)); ctx.stroke();
        } else if (a.pnl >= 0 && b.pnl < 0) {
          const ratio = Math.abs(a.pnl) / (Math.abs(a.pnl) + Math.abs(b.pnl));
          const cx2 = toX(a.price + ratio * (b.price - a.price));
          const cy2 = toY(0);
          ctx.strokeStyle = "#F6465D"; ctx.beginPath(); ctx.moveTo(toX(a.price), toY(a.pnl)); ctx.lineTo(cx2, cy2); ctx.stroke();
          ctx.strokeStyle = cb; ctx.beginPath(); ctx.moveTo(cx2, cy2); ctx.lineTo(toX(b.price), toY(b.pnl)); ctx.stroke();
        } else if (ca !== cb) {
          const mx = (toX(a.price) + toX(b.price)) / 2, my = (toY(a.pnl) + toY(b.pnl)) / 2;
          ctx.strokeStyle = ca; ctx.beginPath(); ctx.moveTo(toX(a.price), toY(a.pnl)); ctx.lineTo(mx, my); ctx.stroke();
          ctx.strokeStyle = cb; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(toX(b.price), toY(b.pnl)); ctx.stroke();
        } else {
          ctx.strokeStyle = ca; ctx.beginPath(); ctx.moveTo(toX(a.price), toY(a.pnl)); ctx.lineTo(toX(b.price), toY(b.pnl)); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };

    // 绘制每个订单的曲线（细线、半透明、三色分段）
    for (const s of perOrderPnL) {
      if (s.data.length < 2) continue;
      const isHighlighted = highlightId === s.id;
      const alpha = highlightId === null ? 0.35 : isHighlighted ? 0.7 : 0.12;
      drawThreeColor(s.data, s.strikePrice, isHighlighted ? 1.5 : 0.8, alpha);
    }

    // 组合总曲线（粗线、高饱和度、三色分段）
    const combinedStrike = perOrderPnL.length > 0
      ? Math.min(...perOrderPnL.map(s => s.strikePrice))
      : 0;
    drawThreeColor(combinedPnL, combinedStrike, 2.5, 1);

    // 当前价格黄线（拖动时跟随 displayPrice）
    if (displayPrice) {
      const cx = toX(displayPrice);
      ctx.strokeStyle = "#F6C90E";
      ctx.lineWidth = 0.8;
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.85;
      if (zeroY > pad.top + 4) {
        ctx.beginPath(); ctx.moveTo(cx, pad.top); ctx.lineTo(cx, zeroY - 3); ctx.stroke();
      }
      if (zeroY < H - pad.bottom - 4) {
        ctx.beginPath(); ctx.moveTo(cx, zeroY + 3); ctx.lineTo(cx, H - pad.bottom); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // 实时价格标签在图表内侧（X轴数字上方）
      ctx.font = "bold 9px Inter, -apple-system, sans-serif";
      ctx.fillStyle = "#F6C90E";
      ctx.textAlign = "center";
      // 价格标签（底部内侧，与MiniPnlCanvas一致）
      ctx.font = "bold 9px Inter, -apple-system, sans-serif";
      const clabel = `${Math.round(displayPrice)}U`;
      const ctw = ctx.measureText(clabel).width;
      const clx = Math.min(cx - ctw / 2, W - pad.right - ctw - 2);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(clx - 2, H - pad.bottom - 14, ctw + 6, 12);
      ctx.fillStyle = "#F6C90E";
      ctx.textAlign = "left";
      ctx.fillText(clabel, clx, H - pad.bottom - 4);

      // 拖动时：在黄线顶部绘制该价格对应的组合 P&L
      if (dragPrice !== null) {
        const sorted = [...combinedPnL].sort((a, b) => a.price - b.price);
        let pnlAtDrag = 0;
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i - 1].price <= displayPrice && sorted[i].price >= displayPrice) {
            const t = (displayPrice - sorted[i - 1].price) / (sorted[i].price - sorted[i - 1].price);
            pnlAtDrag = sorted[i - 1].pnl + t * (sorted[i].pnl - sorted[i - 1].pnl);
            break;
          }
        }
        const pnlLabel = pnlAtDrag >= 0 ? `+${Math.round(pnlAtDrag)}U` : `${Math.round(pnlAtDrag)}U`;
        const pnlColor = pnlAtDrag >= 0 ? "#F6465D" : "#0ECB81";
        ctx.font = "bold 10px Inter, -apple-system, sans-serif";
        const ptw = ctx.measureText(pnlLabel).width;
        const plx = Math.max(pad.left + 2, Math.min(cx - ptw / 2, W - pad.right - ptw - 4));
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(plx - 3, pad.top + 4, ptw + 8, 15);
        ctx.fillStyle = pnlColor;
        ctx.textAlign = "left";
        ctx.fillText(pnlLabel, plx, pad.top + 15);
      }
    }

    // X轴底边线
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 0.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(pad.left, H - pad.bottom);
    ctx.lineTo(W - pad.right, H - pad.bottom);
    ctx.stroke();

    // X轴到10度（稀疏，避免拥挤）——放在最下面
    const xTicks = [1200, 1400, 1600, 1800, 2000, 2500, 3000, 3500, 4000];
    ctx.font = "9px Inter, -apple-system, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.textAlign = "center";
    for (const p of xTicks) {
      const x = toX(p);
      if (x < pad.left + 2 || x > W - pad.right - 2) continue;
      ctx.fillText(`${p}`, x, H - pad.bottom + 10);
    }

    // Y轴标注
    const yStep = 50000;
    const yStart = Math.ceil(minV / yStep) * yStep;
    ctx.font = "9px Inter, -apple-system, sans-serif";
    ctx.textAlign = "left";
    for (let v = yStart; v <= maxV; v += yStep) {
      const y = toY(v);
      if (y < pad.top + 4 || y > H - pad.bottom - 4) continue;
      const label = v === 0 ? "0" : v > 0 ? `+${Math.round(v / 1000)}k` : `${Math.round(v / 1000)}k`;
      ctx.fillStyle = v > 0 ? "rgba(246,70,93,0.7)" : v < 0 ? "rgba(14,203,129,0.7)" : "rgba(255,255,255,0.5)";
      ctx.fillText(label, pad.left + 2, y - 2);
    }

  }, [perOrderPnL, combinedPnL, displayPrice, highlightId]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const p = xToPrice(e.touches[0].clientX);
    if (p !== null) { setDragPrice(p); resetDragTimer(); }
  }, [xToPrice, resetDragTimer]);

  const handleTouchEnd = useCallback(() => {}, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const p = xToPrice(e.clientX);
    if (p !== null) { setDragPrice(p); resetDragTimer(); }
  }, [xToPrice, resetDragTimer]);

  const handleMouseUp = useCallback(() => {}, []);

  return (
    <div style={{ position: "relative", touchAction: isDragMode ? "none" : "auto" }}>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%", height: 280, display: "block",
          touchAction: isDragMode ? "none" : "auto",
          cursor: isDragMode ? "crosshair" : "default",
        }}
        onTouchMove={isDragMode ? handleTouchMove : undefined}
        onTouchEnd={isDragMode ? handleTouchEnd : undefined}
        onMouseMove={isDragMode ? handleMouseMove : undefined}
        onMouseUp={isDragMode ? handleMouseUp : undefined}
        onMouseLeave={isDragMode ? handleMouseUp : undefined}
      />
      {/* 拖动按鈕 */}
      <button
        onClick={() => {
          const next = !isDragMode;
          setIsDragMode(next);
          if (next) resetDragTimer();
          else { setDragPrice(null); if (dragTimerRef.current) clearTimeout(dragTimerRef.current); }
        }}
        style={{
          position: "absolute", bottom: 28, right: 6,
          width: 28, height: 28, borderRadius: "50%",
          border: isDragMode ? "1.5px solid #F6C90E" : "1.5px solid rgba(255,255,255,0.25)",
          background: isDragMode ? "rgba(246,201,14,0.18)" : "rgba(0,0,0,0.45)",
          color: isDragMode ? "#F6C90E" : "rgba(255,255,255,0.5)",
          fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 10, transition: "all 0.2s", lineHeight: 1, padding: 0,
        }}
        title={isDragMode ? "退出拖动" : "拖动黄线"}
      >↔</button>

      <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pb-2">
        {perOrderPnL.map(s => (
          <button
            key={s.id}
            onClick={() => onHighlight(highlightId === s.id ? null : s.id)}
            className="flex items-center gap-1 text-xs"
            style={{ color: highlightId === null || highlightId === s.id ? s.color : "rgba(255,255,255,0.3)", background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}
          >
            <span style={{ width: 16, height: 2, background: s.color, display: "inline-block", borderRadius: 1 }} />
            {s.label}
          </button>
        ))}
        <span className="flex items-center gap-1 text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
          <span style={{ width: 16, height: 2, background: "rgba(255,255,255,0.8)", display: "inline-block", borderRadius: 1 }} />
          组合
        </span>
      </div>
    </div>
  );
}

// ===== 迷你P&L曲线 Canvas组件 =====
function MiniPnlCanvas({
  data,
  strikePrice,
  color,
  currentPrice,
}: {
  data: { price: number; pnl: number }[];
  strikePrice: number;
  color: string;
  currentPrice?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 拖动黄线状态：null 表示展示实时价格
  const [dragPrice, setDragPrice] = useState<number | null>(null);
  const [isLongPressed, setIsLongPressed] = useState(false);
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);
  const priceRangeRef = useRef<{ minP: number; maxP: number; W: number; padL: number; padR: number } | null>(null);

  const resetDragTimer = useCallback(() => {
    if (dragTimerRef.current) clearTimeout(dragTimerRef.current);
    dragTimerRef.current = setTimeout(() => { setDragPrice(null); setIsLongPressed(false); }, 30000);
  }, []);

  const xToPrice = useCallback((clientX: number) => {
    const range = priceRangeRef.current;
    const canvas = canvasRef.current;
    if (!range || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const { minP, maxP, W, padL, padR } = range;
    // 对数坐标逆变换
    const logMin = Math.log(Math.max(minP, 1));
    const logMax = Math.log(Math.max(maxP, 1));
    const ratio = (x - padL) / (W - padL - padR);
    const p = Math.exp(logMin + ratio * (logMax - logMin));
    return Math.max(minP, Math.min(maxP, p));
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();
    const p = xToPrice(e.touches[0].clientX);
    if (p !== null) { setDragPrice(p); resetDragTimer(); }
  }, [xToPrice, resetDragTimer]);

  const handleTouchEnd = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const p = xToPrice(e.clientX);
    if (p !== null) { setDragPrice(p); resetDragTimer(); }
  }, [xToPrice, resetDragTimer]);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // 点击按鈕切换拖动模式
  const toggleDragMode = useCallback(() => {
    if (isDraggingRef.current || dragPrice !== null) {
      // 退出拖动模式
      isDraggingRef.current = false;
      setIsLongPressed(false);
      setDragPrice(null);
      if (dragTimerRef.current) { clearTimeout(dragTimerRef.current); dragTimerRef.current = null; }
    } else {
      // 进入拖动模式，初始化到当前价格
      isDraggingRef.current = true;
      setIsLongPressed(true);
      if (currentPrice != null) { setDragPrice(currentPrice); resetDragTimer(); }
    }
  }, [dragPrice, currentPrice, resetDragTimer]);

  // 显示的价格：拖动时用 dragPrice，否则用 currentPrice
  const displayPrice = dragPrice ?? currentPrice;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const pad = { top: 24, right: 10, bottom: 28, left: 8 };
    const prices = data.map(d => d.price);
    const pnls = data.map(d => d.pnl);
    const minP = Math.min(...prices), maxP = Math.max(...prices);
    const rawMinV = Math.min(...pnls, 0);
    const rawMaxV = Math.max(...pnls, 0);
    const margin = Math.max((rawMaxV - rawMinV) * 0.15, 50);
    const minV = rawMinV - margin;
    const maxV = rawMaxV + margin;
    const pRange = maxP - minP || 1;
    const vRange = maxV - minV || 1;
    // 对数坐标
    const logMinP = Math.log(Math.max(minP, 1));
    const logMaxP = Math.log(Math.max(maxP, 1));
    const logPRange = logMaxP - logMinP || 1;
    const toX = (p: number) => pad.left + ((Math.log(Math.max(p, 1)) - logMinP) / logPRange) * (W - pad.left - pad.right);
    const toY = (v: number) => pad.top + ((maxV - v) / vRange) * (H - pad.top - pad.bottom);
    const zeroY = toY(0);
    // 保存价格范围供 touch/mouse 事件使用
    priceRangeRef.current = { minP, maxP, W, padL: pad.left, padR: pad.right };

    // 背景网格线
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 3; i++) {
      const y = pad.top + (i / 3) * (H - pad.top - pad.bottom);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    }

    // 计算行权价处插値 P&L
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
    profitGrad.addColorStop(0, "rgba(246,70,93,0.42)");
    profitGrad.addColorStop(1, "rgba(246,70,93,0.05)");
    ctx.fillStyle = profitGrad;
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    data.forEach(d => ctx.lineTo(toX(d.price), toY(d.pnl)));
    ctx.lineTo(W - pad.right, zeroY);
    ctx.closePath();
    ctx.fill();

    // 行权价之前亏损区（绿色）
    const lossGrad = ctx.createLinearGradient(0, zeroY, 0, H - pad.bottom);
    lossGrad.addColorStop(0, "rgba(14,203,129,0.05)");
    lossGrad.addColorStop(1, "rgba(14,203,129,0.42)");
    ctx.fillStyle = lossGrad;
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    data.filter(d => d.price <= strikePrice).forEach(d => ctx.lineTo(toX(d.price), toY(d.pnl)));
    ctx.lineTo(sX, sY);
    ctx.lineTo(sX, zeroY);
    ctx.closePath();
    ctx.fill();

    // 行权价到BE之间过渡区（灰色）
    const grayGrad = ctx.createLinearGradient(0, zeroY, 0, H - pad.bottom);
    grayGrad.addColorStop(0, "rgba(160,160,160,0.05)");
    grayGrad.addColorStop(1, "rgba(160,160,160,0.35)");
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

    // 零轴线（细实线）
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 0.8;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(W - pad.right, zeroY);
    ctx.stroke();

    // Y 轴标注
    ctx.font = "bold 10px Inter, -apple-system, sans-serif";

    // 左侧：只显示最大亏损一个数字（实际小数点后一位，偏上不压线）
    if (rawMinV < 0) {
      const maxLossY = toY(rawMinV);
      const clampedY = Math.max(pad.top + 14, Math.min(H - pad.bottom - 4, maxLossY));
      // 实际小数点后一位
      const lossLabel = `${Math.round(rawMinV * 10) / 10}`;
      ctx.fillStyle = "rgba(14,203,129,0.9)";
      ctx.textAlign = "left";
      // 偏上 12px 避免压着曲线
      ctx.fillText(lossLabel, pad.left + 2, clampedY - 4);
    }

    // Y 轴刻度 + 辅助线
    const yStep = 10000;
    const firstYTick = Math.ceil(0 / yStep) * yStep; // 从 0 开始
    for (let v = firstYTick; v <= maxV; v += yStep) {
      const rawY = toY(v);
      if (rawY < pad.top + 4 || rawY > H - pad.bottom - 4) continue;
      // 细横辅助线（跳过零轴，零轴已单独画）
      if (v !== 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 0.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(pad.left, rawY);
        ctx.lineTo(W - pad.right, rawY);
        ctx.stroke();
      }
      const absV = Math.abs(v);
      const label = v === 0
        ? "0"
        : absV >= 1000
        ? `+${Math.round(v / 1000)}k`
        : `+${Math.round(v)}`;
      const labelColor = v > 0 ? "rgba(246,70,93,0.9)" : "rgba(255,255,255,0.6)";
      ctx.fillStyle = labelColor;
      ctx.textAlign = "left";
      // 0 放在零轴上方，其他刻度居中
      const labelOffsetY = v === 0 ? rawY - 4 : rawY + 3.5;
      ctx.fillText(label, pad.left + 2, labelOffsetY);
    }

    // P&L 曲线（分段着色）
    ctx.lineWidth = 2;
    for (let i = 0; i < data.length - 1; i++) {
      const a = data[i], b = data[i + 1];
      // 跨越零轴处理
      if (a.pnl < 0 && b.pnl >= 0) {
        const ratio = Math.abs(a.pnl) / (Math.abs(a.pnl) + Math.abs(b.pnl));
        const cx = toX(a.price + ratio * (b.price - a.price));
        const segColorA = a.price > strikePrice ? "rgba(160,160,160,0.85)" : "#0ECB81";
        ctx.strokeStyle = segColorA; ctx.beginPath(); ctx.moveTo(toX(a.price), toY(a.pnl)); ctx.lineTo(cx, zeroY); ctx.stroke();
        ctx.strokeStyle = "#F6465D"; ctx.beginPath(); ctx.moveTo(cx, zeroY); ctx.lineTo(toX(b.price), toY(b.pnl)); ctx.stroke();
        continue;
      }
      let segColor: string;
      if (a.pnl >= 0) segColor = "#F6465D";
      else if (a.price > strikePrice) segColor = "rgba(160,160,160,0.85)";
      else segColor = "#0ECB81";
      ctx.strokeStyle = segColor;
      ctx.beginPath();
      ctx.moveTo(toX(a.price), toY(a.pnl));
      ctx.lineTo(toX(b.price), toY(b.pnl));
      ctx.stroke();
    }

    // BE 点 + 标签
    ctx.font = "bold 10px Inter, -apple-system, sans-serif";
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1], curr = data[i];
      if ((prev.pnl < 0 && curr.pnl >= 0) || (prev.pnl >= 0 && curr.pnl < 0)) {
        const ratio = Math.abs(prev.pnl) / (Math.abs(prev.pnl) + Math.abs(curr.pnl));
        const bePrice = prev.price + ratio * (curr.price - prev.price);
        const bx = toX(bePrice);
        // 圆点
        ctx.fillStyle = "#F0B90B";
        ctx.beginPath();
        ctx.arc(bx, zeroY, 3, 0, Math.PI * 2);
        ctx.fill();
        // 标签（右下方）
        const label = `${Math.round(bePrice)}U`;
        const tw = ctx.measureText(label).width;
        const lx = Math.min(bx + 5, W - pad.right - tw - 4);
        const ly = Math.min(zeroY + 14, H - pad.bottom - 2);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(lx - 2, ly - 10, tw + 6, 13);
        ctx.fillStyle = "#F0B90B";
        ctx.textAlign = "left";
        ctx.fillText(label, lx, ly);
      }
    }

    // X 轴刻度（对数坐标下用固定价格点）
    ctx.font = "9px Inter, -apple-system, sans-serif";
    ctx.fillStyle = "rgba(132,142,156,0.8)";
    ctx.textAlign = "center";
    const xTicks = [1200, 1400, 1600, 1800, 2000, 2500, 3000, 3500, 4000];
    for (const p of xTicks) {
      if (p < minP || p > maxP) continue;
      const x = toX(p);
      if (x < pad.left + 2 || x > W - pad.right - 2) continue;
      ctx.fillText(`${p}`, x, H - pad.bottom + 10);
    }

    // 行权价竖线（细虚线）
    if (strikePrice >= minP && strikePrice <= maxP) {
      const kx = toX(strikePrice);
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(kx, pad.top);
      ctx.lineTo(kx, H - pad.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      // 行权价标签
      ctx.font = "9px Inter, -apple-system, sans-serif";
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      const klabel = `K${Math.round(strikePrice)}`;
      const ktw = ctx.measureText(klabel).width;
      const klx = Math.min(kx - ktw / 2, W - pad.right - ktw - 2);
      ctx.fillRect(klx - 2, pad.top + 2, ktw + 6, 12);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.textAlign = "left";
      ctx.fillText(klabel, klx, pad.top + 12);
    }

    // 黄色竖线（displayPrice：拖动时跟手，否则为实时价格）
    if (displayPrice != null && displayPrice >= minP && displayPrice <= maxP) {
      const cx = toX(displayPrice);
      ctx.strokeStyle = "#F0B90B";
      ctx.lineWidth = 0.8;
      ctx.setLineDash([]);
      const gap = 3;
      if (zeroY - gap > pad.top) {
        ctx.beginPath(); ctx.moveTo(cx, pad.top); ctx.lineTo(cx, zeroY - gap); ctx.stroke();
      }
      if (zeroY + gap < H - pad.bottom) {
        ctx.beginPath(); ctx.moveTo(cx, zeroY + gap); ctx.lineTo(cx, H - pad.bottom); ctx.stroke();
      }
      // 价格标签（底部内侧）
      ctx.font = "bold 9px Inter, -apple-system, sans-serif";
      const clabel = `${Math.round(displayPrice)}U`;
      const ctw = ctx.measureText(clabel).width;
      const clx = Math.min(cx - ctw / 2, W - pad.right - ctw - 2);
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(clx - 2, H - pad.bottom - 14, ctw + 6, 12);
      ctx.fillStyle = "#F0B90B";
      ctx.textAlign = "left";
      ctx.fillText(clabel, clx, H - pad.bottom - 4);

      // 拖动时：在黄线顶部显示该价格对应的 P&L
      if (dragPrice !== null) {
        // 插值计算 P&L
        let pnlAtDrag = 0;
        for (let i = 1; i < data.length; i++) {
          if (data[i - 1].price <= displayPrice && data[i].price >= displayPrice) {
            const t = (displayPrice - data[i - 1].price) / (data[i].price - data[i - 1].price);
            pnlAtDrag = data[i - 1].pnl + t * (data[i].pnl - data[i - 1].pnl);
            break;
          }
        }
        const pnlLabel = pnlAtDrag >= 0
          ? `+${Math.round(pnlAtDrag)}U`
          : `${Math.round(pnlAtDrag)}U`;
        const pnlColor = pnlAtDrag >= 0 ? "#F6465D" : "#0ECB81";
        ctx.font = "bold 10px Inter, -apple-system, sans-serif";
        const ptw = ctx.measureText(pnlLabel).width;
        const plx = Math.max(pad.left + 2, Math.min(cx - ptw / 2, W - pad.right - ptw - 4));
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.fillRect(plx - 3, pad.top + 4, ptw + 8, 15);
        ctx.fillStyle = pnlColor;
        ctx.textAlign = "left";
        ctx.fillText(pnlLabel, plx, pad.top + 15);
      }
    }
  }, [data, strikePrice, color, displayPrice]);
  const isDragMode = dragPrice !== null;

  return (
    <div style={{ position: "relative", width: "100%", height: 300 }}>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%", height: 300, display: "block",
          touchAction: isDragMode ? "none" : "auto",
          cursor: isDragMode ? "crosshair" : "default"
        }}
        onTouchMove={isDragMode ? handleTouchMove : undefined}
        onTouchEnd={isDragMode ? handleTouchEnd : undefined}
        onMouseMove={isDragMode ? handleMouseMove : undefined}
        onMouseUp={isDragMode ? handleMouseUp : undefined}
        onMouseLeave={isDragMode ? handleMouseUp : undefined}
      />
      {/* 拖动模式切换按鈕 */}
      <button
        onClick={toggleDragMode}
        style={{
          position: "absolute",
          bottom: 28,
          right: 6,
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: isDragMode ? "1.5px solid #F6C90E" : "1.5px solid rgba(255,255,255,0.25)",
          background: isDragMode ? "rgba(246,201,14,0.18)" : "rgba(0,0,0,0.45)",
          color: isDragMode ? "#F6C90E" : "rgba(255,255,255,0.5)",
          fontSize: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 10,
          transition: "all 0.2s",
          lineHeight: 1,
          padding: 0,
        }}
        title={isDragMode ? "退出拖动" : "拖动黄线"}
      >
        ↔
      </button>
    </div>
  );
}

// ===== 主组件 =====
export default function OptionAnalysisPage() {
  const [, params] = useRoute("/ledger/:id/option-analysis");
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const ledgerId = parseInt(params?.id ?? "0");

  // ===== 设置面板状态 =====
  const [showSettings, setShowSettings] = useState(false);
  const [ethPrice, setEthPrice] = useState("2500");
  const [iv, setIv] = useState("0.80");
  const [riskFreeRate, setRiskFreeRate] = useState("0.05");
  // ===== 实时 ETH 价格（走服务器tRPC，3秒刷新） =====
  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, { refetchInterval: 3000, staleTime: 2000 });
  useEffect(() => {
    const price = (cryptoPricesRaw as any)?.prices?.ETH ?? (cryptoPricesRaw as any)?.ETH;
    if (price && price > 0) setEthPrice(String(Math.round(price)));
  }, [cryptoPricesRaw]);
  const [showPageMenu, setShowPageMenu] = useState(false);

  // ===== Tab 状态 =====
  const [activeTab, setActiveTab] = useState<TabId>("summary");

  // ===== 订单管理状态 =====
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "closed">("open");

  // ===== 获取所有订单（含已平仓，用于订单Tab）=====
  const { data: allOrdersRaw = [], isLoading } = trpc.orderFlow.getOrders.useQuery(
    { ledgerId, status: "all" },
    { enabled: isAuthenticated && ledgerId > 0 }
  );

  // ===== 过滤出期权订单 =====
  const allOptionOrders = useMemo(
    () => allOrdersRaw.filter((o: any) => o.market_type === "option"),
    [allOrdersRaw]
  );

  // ===== 分析用：只用持仓中的期权 =====
  const optionOrders = useMemo(
    () => allOptionOrders.filter((o: any) => o.status === "open"),
    [allOptionOrders]
  );

  // ===== 订单Tab过滤 =====
  const filteredOrders = useMemo(() => {
    if (filterStatus === "all") return allOptionOrders;
    return allOptionOrders.filter((o: any) => o.status === filterStatus);
  }, [allOptionOrders, filterStatus]);

  

  // ===== 转换为 PositionForCalc（带 id/label 用于逐单曲线）=====
  type PositionWithMeta = PositionForCalc & { id: number; label: string; color: string };
  const CURVE_COLORS = ["#F0B90B", "#0ECB81", "#F6465D", "#7B61FF", "#00C2FF", "#FF8A00", "#FF4FCB", "#A3E635"];
  const positions = useMemo<PositionWithMeta[]>(() => {
    return optionOrders
      .filter((o: any) => o.option_type && o.expiry_date)
      .map((o: any, idx: number) => ({
        id: o.id,
        label: `${o.direction === "long" ? "买" : "卖"}${o.option_type === "call" ? "Call" : "Put"} $${parseFloat(o.strike_price ?? o.entry_price ?? 0).toLocaleString()}`,
        color: CURVE_COLORS[idx % CURVE_COLORS.length],
        contractType: (o.option_type as "call" | "put") || "call",
        direction: (o.direction as "long" | "short") || "long",
        strikePrice: parseFloat(o.strike_price ?? o.entry_price ?? 0),
        // entryPrice 应为权利金单价（每ETH）= 总权利金 / 数量
        // o.premium 是总权利金，o.entry_price 是开仓价（即权利金单价）
        entryPrice: (() => {
          const qty = parseFloat(o.quantity ?? 1) || 1;
          const totalPremium = o.premium ? parseFloat(o.premium) : null;
          const unitPrice = parseFloat(o.entry_price ?? 0);
          // 优先用 entry_price（权利金单价），其次用 premium/qty
          if (unitPrice > 0) return unitPrice;
          if (totalPremium != null && totalPremium > 0) return totalPremium / qty;
          return 0;
        })(),
        quantity: parseFloat(o.quantity ?? 1),
        expiryDate: fmtDate(o.expiry_date),
      }));
  }, [optionOrders]);

  // ===== 逐单曲线高亮状态（null = 显示全部，id = 高亮单张）=====
  const [highlightId, setHighlightId] = useState<number | null>(null);

  // ===== 计算参数 =====
  const S = parseFloat(ethPrice) || 2500;
  const sigma = parseFloat(iv) || 0.8;
  const r = parseFloat(riskFreeRate) || 0.05;

  // ===== 希腊字母汇总 =====
  const greeks = useMemo(
    () => calcPortfolioGreeks(positions, S, sigma, r),
    [positions, S, sigma, r]
  );

  // ===== 到期预警（7天内）=====
  const expiringOrders = useMemo(
    () =>
      optionOrders.filter((o: any) => {
        if (!o.expiry_date) return false;
        const d = daysUntil(fmtDate(o.expiry_date));
        return d >= 0 && d <= 7;
      }),
    [optionOrders]
  );

  // ===== 组合总 P&L 曲线数据 =====
  const pnlData = useMemo(() => {
    if (positions.length === 0) return [];
    const minP = 1200;
    const maxP = 4000;
    return calcExpiryPnL(positions, [minP, maxP], 80);
  }, [positions, S]);

  // ===== 逐单 P&L 曲线数据 =====
  const perOrderPnL = useMemo(() => {
    if (positions.length === 0) return [];
    const minP = 1200;
    const maxP = 4000;
    return positions.map((pos) => ({
      id: pos.id,
      label: pos.label,
      color: pos.color,
      strikePrice: pos.strikePrice,
      data: calcExpiryPnL([pos], [minP, maxP], 80),
    }));
  }, [positions, S]);

  // ===== 分方向 P&L 数据（保留兼容）=====
  const pnlByDirection = useMemo(() => {
    if (positions.length === 0) return { buyCall: [], buyPut: [], sellCall: [], sellPut: [] };
    const minP = 1200;
    const maxP = 4000;
    const calc = (filter: (p: PositionForCalc) => boolean) =>
      calcExpiryPnL(positions.filter(filter), [minP, maxP], 80);
    return {
      buyCall: calc((p) => p.contractType === "call" && p.direction === "long"),
      buyPut: calc((p) => p.contractType === "put" && p.direction === "long"),
      sellCall: calc((p) => p.contractType === "call" && p.direction === "short"),
      sellPut: calc((p) => p.contractType === "put" && p.direction === "short"),
    };
  }, [positions, S]);

  // ===== 矩阵数据 =====
  const matrixData = useMemo(() => {
    const strikes = [...new Set(positions.map((p) => p.strikePrice))].sort((a, b) => a - b);
    const expiries = [...new Set(positions.map((p) => p.expiryDate))].sort();
    const cells: Record<string, { call: number; put: number; net: number }> = {};
    for (const p of positions) {
      const key = `${p.strikePrice}_${p.expiryDate}`;
      if (!cells[key]) cells[key] = { call: 0, put: 0, net: 0 };
      const sign = p.direction === "long" ? 1 : -1;
      const qty = sign * p.quantity;
      if (p.contractType === "call") cells[key].call += qty;
      else cells[key].put += qty;
      cells[key].net += qty;
    }
    return { strikes, expiries, cells };
  }, [positions]);

  // ===== 按到期日分组 =====
  const groupedByExpiry = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const o of optionOrders) {
      const key = fmtDate(o.expiry_date) || "未知";
      if (!map[key]) map[key] = [];
      map[key].push(o);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [optionOrders]);

  // ===== 浮盈计算 =====
  const floatingPnL = useMemo(() => {
    let total = 0;
    const now = new Date();
    for (const pos of positions) {
      const expiryMs = new Date(pos.expiryDate).getTime();
      const T = Math.max((expiryMs - now.getTime()) / (1000 * 60 * 60 * 24 * 365), 0);
      const bs = blackScholes({ S, K: pos.strikePrice, T, r, sigma, type: pos.contractType });
      const sign = pos.direction === "long" ? 1 : -1;
      total += sign * (bs.price - pos.entryPrice) * pos.quantity;
    }
    return total;
  }, [positions, S, sigma, r]);

  // ===== Canvas P&L 图（逐单彩色线 + 组合总线 + 区域填充）=====
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 360, h: 320 });

  // 监听容器尺寸变化，动态更新canvas尺寸
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setCanvasSize({ w: Math.round(width), h: Math.round(height) });
        }
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // 辅助函数：用盈利绿/亏损红画分段着色线
  // 判断某点颜色：
  // P&L >= 0 → 红色（盈利）
  // P&L < 0 且 price > strikePrice → 灰色（行权价到BE，减少亏损中）
  // P&L < 0 且 price <= strikePrice → 绿色（亏损区）
  const getSegmentColor = (
    data: { price: number; pnl: number }[],
    idx: number,
    strikePrice: number
  ): string => {
    const { price, pnl } = data[idx];
    if (pnl >= 0) return "#F6465D"; // 盈利 → 红色
    if (price > strikePrice) return "rgba(160,160,160,0.85)"; // 行权价到BE → 灰色
    return "#0ECB81"; // 行权价之前亏损 → 绿色
  };

  const drawSegmentedLine = (
    ctx: CanvasRenderingContext2D,
    data: { price: number; pnl: number }[],
    toX: (p: number) => number,
    toY: (v: number) => number,
    lineWidth: number,
    alpha: number,
    strikePrice: number = 0
  ) => {
    if (data.length < 2) return;
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([]);
    ctx.globalAlpha = alpha;
    let i = 0;
    while (i < data.length - 1) {
      const a = data[i], b = data[i + 1];
      const colorA = getSegmentColor(data, i, strikePrice);
      const colorB = getSegmentColor(data, i + 1, strikePrice);
      // 检测是否跨越零轴（负→正）
      if (a.pnl < 0 && b.pnl >= 0) {
        const ratio = Math.abs(a.pnl) / (Math.abs(a.pnl) + Math.abs(b.pnl));
        const crossX = toX(a.price + ratio * (b.price - a.price));
        const crossY = toY(0);
        ctx.strokeStyle = colorA;
        ctx.beginPath();
        ctx.moveTo(toX(a.price), toY(a.pnl));
        ctx.lineTo(crossX, crossY);
        ctx.stroke();
        ctx.strokeStyle = "#F6465D";
        ctx.beginPath();
        ctx.moveTo(crossX, crossY);
        ctx.lineTo(toX(b.price), toY(b.pnl));
        ctx.stroke();
        i++; continue;
      }
      // 正→负
      if (a.pnl >= 0 && b.pnl < 0) {
        const ratio = Math.abs(a.pnl) / (Math.abs(a.pnl) + Math.abs(b.pnl));
        const crossX = toX(a.price + ratio * (b.price - a.price));
        const crossY = toY(0);
        ctx.strokeStyle = "#F6465D";
        ctx.beginPath();
        ctx.moveTo(toX(a.price), toY(a.pnl));
        ctx.lineTo(crossX, crossY);
        ctx.stroke();
        ctx.strokeStyle = colorB;
        ctx.beginPath();
        ctx.moveTo(crossX, crossY);
        ctx.lineTo(toX(b.price), toY(b.pnl));
        ctx.stroke();
        i++; continue;
      }
      // 颜色变化时在中点切换
      if (colorA !== colorB) {
        const midX = (toX(a.price) + toX(b.price)) / 2;
        const midY = (toY(a.pnl) + toY(b.pnl)) / 2;
        ctx.strokeStyle = colorA;
        ctx.beginPath();
        ctx.moveTo(toX(a.price), toY(a.pnl));
        ctx.lineTo(midX, midY);
        ctx.stroke();
        ctx.strokeStyle = colorB;
        ctx.beginPath();
        ctx.moveTo(midX, midY);
        ctx.lineTo(toX(b.price), toY(b.pnl));
        ctx.stroke();
      } else {
        ctx.strokeStyle = colorA;
        ctx.beginPath();
        ctx.moveTo(toX(a.price), toY(a.pnl));
        ctx.lineTo(toX(b.price), toY(b.pnl));
        ctx.stroke();
      }
      i++;
    }
    ctx.globalAlpha = 1;
  };

  useEffect(() => {
    if (activeTab !== "pnl" || pnlData.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // DPR 高清修复
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvasSize.w;
    const cssH = canvasSize.h;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.scale(dpr, dpr);
    const W = cssW;
    const H = cssH;
    const pad = { top: 28, right: 12, bottom: 36, left: 8 };
    ctx.clearRect(0, 0, W, H);

    // 决定要画的数据
    const activeData = highlightId !== null
      ? (perOrderPnL.find((s) => s.id === highlightId)?.data ?? pnlData)
      : pnlData;
    const activeSeries = highlightId !== null
      ? perOrderPnL.filter((s) => s.id === highlightId)
      : perOrderPnL;

    // 计算范围
    const allPnls = [
      ...activeData.map((d) => d.pnl),
      ...activeSeries.flatMap((s) => s.data.map((d) => d.pnl)),
    ];
    const rawMin = Math.min(...allPnls, 0);
    const rawMax = Math.max(...allPnls, 0);
    const margin = Math.max((rawMax - rawMin) * 0.15, Math.abs(rawMax) * 0.1, 50);
    const minPnl = rawMin - margin;
    const maxPnl = rawMax + margin;
    const pnlRange = maxPnl - minPnl || 1;
    const prices = pnlData.map((d) => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    // 对数坐标：X 轴用 log 刻度，让右侧盈利区展开
    const logMin = Math.log(minPrice);
    const logMax = Math.log(maxPrice);
    const logRange = logMax - logMin || 1;
    const toX = (p: number) => pad.left + ((Math.log(Math.max(p, 1)) - logMin) / logRange) * (W - pad.left - pad.right);
    const toY = (v: number) => pad.top + ((maxPnl - v) / pnlRange) * (H - pad.top - pad.bottom);
    const zeroY = toY(0);

    // === 1. 背景填充（深色）===
    ctx.fillStyle = "#0d1117";
    ctx.fillRect(pad.left, pad.top, W - pad.left - pad.right, H - pad.top - pad.bottom);

    // === 2. 盈亏区域半透明填充 ===
    // 盈利区域（红色，中国风格）
    const profitGrad = ctx.createLinearGradient(0, pad.top, 0, zeroY);
    profitGrad.addColorStop(0, "rgba(246,70,93,0.42)");
    profitGrad.addColorStop(1, "rgba(246,70,93,0.06)");
    ctx.fillStyle = profitGrad;
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    activeData.forEach((d) => {
      ctx.lineTo(toX(d.price), Math.min(toY(d.pnl), zeroY));
    });
    ctx.lineTo(toX(activeData[activeData.length - 1].price), zeroY);
    ctx.closePath();
    ctx.fill();
    // 亏损区域分两段填充
    const activeStrikePrice = highlightId !== null
      ? (positions.find(p => p.id === highlightId)?.strikePrice ?? 0)
      : Math.min(...positions.map(p => p.strikePrice));
    const strikeX = toX(activeStrikePrice);

    // 计算行权价处的插値 P&L
    const strikeInterp = (() => {
      for (let i = 1; i < activeData.length; i++) {
        const a = activeData[i - 1], b = activeData[i];
        if (a.price <= activeStrikePrice && b.price >= activeStrikePrice) {
          const t = (activeStrikePrice - a.price) / (b.price - a.price);
          return a.pnl + t * (b.pnl - a.pnl);
        }
      }
      return activeData.find(d => d.price <= activeStrikePrice)?.pnl ?? 0;
    })();
    const strikeY = toY(strikeInterp);

    // 行权价之前：绿色亏损区
    const lossGrad = ctx.createLinearGradient(0, zeroY, 0, H - pad.bottom);
    lossGrad.addColorStop(0, "rgba(14,203,129,0.06)");
    lossGrad.addColorStop(1, "rgba(14,203,129,0.42)");
    ctx.fillStyle = lossGrad;
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    activeData.filter(d => d.price <= activeStrikePrice).forEach((d) => {
      ctx.lineTo(toX(d.price), toY(d.pnl));
    });
    ctx.lineTo(strikeX, strikeY); // 精确到达行权价点
    ctx.lineTo(strikeX, zeroY);
    ctx.closePath();
    ctx.fill();

    // 行权价到BE之间：灰色过渡区
    const grayGrad = ctx.createLinearGradient(0, zeroY, 0, H - pad.bottom);
    grayGrad.addColorStop(0, "rgba(160,160,160,0.06)");
    grayGrad.addColorStop(1, "rgba(160,160,160,0.35)");
    ctx.fillStyle = grayGrad;
    ctx.beginPath();
    ctx.moveTo(strikeX, zeroY);
    ctx.lineTo(strikeX, strikeY); // 从行权价点开始
    const negAfterStrike = activeData.filter(d => d.price >= activeStrikePrice && d.pnl < 0);
    negAfterStrike.forEach((d) => {
      ctx.lineTo(toX(d.price), toY(d.pnl));
    });
    const beIdx = activeData.findIndex((d, i) => i > 0 && activeData[i-1].pnl < 0 && d.pnl >= 0);
    if (beIdx > 0) {
      const prev = activeData[beIdx - 1];
      const curr = activeData[beIdx];
      const ratio = Math.abs(prev.pnl) / (Math.abs(prev.pnl) + Math.abs(curr.pnl));
      const beX = toX(prev.price + ratio * (curr.price - prev.price));
      ctx.lineTo(beX, zeroY);
    } else if (negAfterStrike.length > 0) {
      ctx.lineTo(toX(negAfterStrike[negAfterStrike.length - 1].price), zeroY);
    }
    ctx.closePath();
    ctx.fill();

    // === 3. 网格线 ===
    const yGridCount = 4;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    for (let i = 0; i <= yGridCount; i++) {
      const v = minPnl + (pnlRange * i) / yGridCount;
      const y = toY(v);
      ctx.strokeStyle = Math.abs(v) < 0.01 ? "rgba(255,255,255,0)" : "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // === 4. 零轴线（盈亏分界，细实线）===
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 0.8;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(W - pad.right, zeroY);
    ctx.stroke();
    // 零轴标签（内置）
    ctx.fillStyle = "rgba(13,17,23,0.6)";
    ctx.fillRect(pad.left + 2, zeroY - 9, 16, 12);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("0", pad.left + 4, zeroY + 1);

    // === 5. 行权价竖线（每张订单）===
    const strikesToMark = highlightId !== null
      ? positions.filter((p) => p.id === highlightId).map((p) => p.strikePrice)
      : [...new Set(positions.map((p) => p.strikePrice))];
    strikesToMark.forEach((strike) => {
      const sx = toX(strike);
      if (sx < pad.left || sx > W - pad.right) return;
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(sx, pad.top);
      ctx.lineTo(sx, H - pad.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      // 行权价标签
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`K${Math.round(strike)}`, sx, pad.top - 6);
    });

    // === 6. 当前价格竖线（在零轴处断开，不穿过成本线）===
    const curX = toX(S);
    if (curX >= pad.left && curX <= W - pad.right) {
      ctx.strokeStyle = "rgba(240,185,11,0.75)";
      ctx.lineWidth = 0.8;
      ctx.setLineDash([]);
      // 上半段：top 到 zeroY - 3
      ctx.beginPath();
      ctx.moveTo(curX, pad.top);
      ctx.lineTo(curX, zeroY - 3);
      ctx.stroke();
      // 下半段：zeroY + 3 到 bottom
      ctx.beginPath();
      ctx.moveTo(curX, zeroY + 3);
      ctx.lineTo(curX, H - pad.bottom);
      ctx.stroke();
    }

    // === 7. 盈亏分段着色线（盈利红/亏损绿/行权价到BE灰）===
    if (highlightId === null) {
      // 组合模式：用最小行权价作为灰色起始分界点
      const minStrike = Math.min(...positions.map(p => p.strikePrice));
      drawSegmentedLine(ctx, pnlData, toX, toY, 2.5, 1, minStrike);
    } else {
      // 单张模式：用该订单的行权价
      const series = perOrderPnL.find((s) => s.id === highlightId);
      const pos = positions.find(p => p.id === highlightId);
      if (series) drawSegmentedLine(ctx, series.data, toX, toY, 2.5, 1, pos?.strikePrice ?? 0);
    }

    // === 8. 盈亏平衡点标注 ===
    for (let i = 1; i < activeData.length; i++) {
      const prev = activeData[i - 1], curr = activeData[i];
      if ((prev.pnl < 0 && curr.pnl >= 0) || (prev.pnl >= 0 && curr.pnl < 0)) {
        const ratio = Math.abs(prev.pnl) / (Math.abs(prev.pnl) + Math.abs(curr.pnl));
        const bprice = prev.price + ratio * (curr.price - prev.price);
        const bx = toX(bprice);
        // 小实心圆点
        ctx.fillStyle = "#F0B90B";
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(bx, zeroY, 3, 0, Math.PI * 2);
        ctx.fill();
        // 标签放在圆点右下方（五点方位），零轴下方空白处
        const beLabel = `${Math.round(bprice)}U`;
        ctx.font = "bold 9px sans-serif";
        const beLabelW = ctx.measureText(beLabel).width;
        const beLx = bx + 6;
        const beLy = zeroY + 18;
        // 背景框
        ctx.fillStyle = "rgba(13,17,23,0.75)";
        ctx.fillRect(beLx - 2, beLy - 10, beLabelW + 4, 13);
        // 文字
        ctx.fillStyle = "#F0B90B";
        ctx.textAlign = "left";
        ctx.fillText(beLabel, beLx, beLy);
      }
    }

    // === 9. 当前价格标签（图表内侧，X轴上方）===
    if (curX >= pad.left && curX <= W - pad.right) {
      const label = `${Math.round(S)}U`;
      ctx.font = "bold 9px sans-serif";
      const tw = ctx.measureText(label).width;
      // 标签居中对齐竖线，在 X 轴上方 6px
      const lx = curX - tw / 2;
      const ly = H - pad.bottom - 6;
      ctx.fillStyle = "rgba(13,17,23,0.75)";
      ctx.fillRect(lx - 3, ly - 10, tw + 6, 13);
      ctx.fillStyle = "rgba(240,185,11,0.95)";
      ctx.textAlign = "left";
      ctx.fillText(label, lx, ly);
    }

    // === 10. Y轴刻度（内置在图表左上角）===
    ctx.font = "9px sans-serif";
    ctx.textAlign = "left";
    for (let i = 0; i <= yGridCount; i++) {
      const v = minPnl + (pnlRange * i) / yGridCount;
      if (Math.abs(v) < 0.01) continue;
      const y = toY(v);
      if (y < pad.top + 8 || y > H - pad.bottom - 8) continue;
      const label = Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);
      // 文字背景
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(13,17,23,0.6)";
      ctx.fillRect(pad.left + 2, y - 9, tw + 4, 12);
      ctx.fillStyle = v >= 0 ? "rgba(14,203,129,0.6)" : "rgba(246,70,93,0.6)";
      ctx.fillText(label, pad.left + 4, y + 1);
    }

    // === 11. X轴刻度（整百对齐）===
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    // 固定用 200 间距，确保显示足够多的整数刻度
    const xStep = 200;
    const xStart = Math.ceil(minPrice / xStep) * xStep;
    for (let p = xStart; p <= maxPrice; p += xStep) {
      const x = toX(p);
      if (x < pad.left || x > W - pad.right) continue;
      // 最左侧用左对齐，最右侧用右对齐，其他居中
      if (x < pad.left + 20) {
        ctx.textAlign = "left";
      } else if (x > W - pad.right - 20) {
        ctx.textAlign = "right";
      } else {
        ctx.textAlign = "center";
      }
      ctx.fillText(`${Math.round(p)}`, x, H - pad.bottom + 13);
    }

    // === 12. 左上角标注：当前价格对应的 P&L ===
    if (activeData.length > 0) {
      const midIdx = activeData.reduce((best, d, idx) =>
        Math.abs(d.price - S) < Math.abs(activeData[best].price - S) ? idx : best, 0);
      const curPnl = activeData[midIdx]?.pnl ?? 0;
      const pnlColor = curPnl >= 0 ? "#F6465D" : "#0ECB81";
      ctx.fillStyle = pnlColor;
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`当前 P&L: ${curPnl >= 0 ? "+" : ""}${Math.round(curPnl)} U`, pad.left + 6, pad.top + 14);
    }
  }, [activeTab, pnlData, perOrderPnL, positions, highlightId, S, canvasSize]);

  // ===== 矩阵颜色 =====
  function matrixCellColor(net: number, call: number, put: number): string {
    if (net === 0 && call === 0 && put === 0) return "rgba(255,255,255,0.03)";
    const maxAbs = Math.max(Math.abs(net), 0.01);
    const intensity = Math.min(Math.abs(net) / (maxAbs * 1.5 + 0.01), 1);
    if (call > 0 && put <= 0) return `rgba(14,203,129,${0.12 + intensity * 0.5})`;
    if (put > 0 && call <= 0) return `rgba(246,70,93,${0.12 + intensity * 0.5})`;
    if (net > 0) return `rgba(14,203,129,${0.08 + intensity * 0.35})`;
    if (net < 0) return `rgba(246,70,93,${0.08 + intensity * 0.35})`;
    return "rgba(240,185,11,0.12)";
  }

  const BTN_STYLE = { backgroundColor: "rgba(255,255,255,0.06)", color: OKX_TEXT_SEC, border: `1px solid ${OKX_BORDER}` };

  return (
    <div
      className="min-h-screen pb-28 max-w-md mx-auto relative"
      style={{ background: OKX_BG, overflowX: "hidden", touchAction: "pan-y" }}
    >
      {/* ===== 顶部导航 ===== */}
      <div
        className="sticky top-0 z-20 flex items-center px-4 py-3"
        style={{ background: OKX_BG, borderBottom: `1px solid ${OKX_BORDER}` }}
      >
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/position-calc`)}
          className="w-8 h-8 rounded-full flex items-center justify-center mr-3 flex-shrink-0"
          style={BTN_STYLE}
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1 min-w-0 relative">
          <button
            onClick={() => setShowPageMenu((v) => !v)}
            className="flex items-center gap-1 font-semibold text-base"
            style={{ color: OKX_TEXT_PRI }}
          >
            <img
              src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/icons/eth-circle-icon.webp"
              alt="ETH"
              className="w-5 h-5 object-contain rounded-full flex-shrink-0"
            />
            <span>期权分析总览</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" style={{ color: OKX_TEXT_SEC }} />
          </button>
          {showPageMenu && (
            <div
              className="absolute top-full left-0 mt-1 rounded-xl overflow-hidden z-50"
              style={{ background: "#1a1a1a", border: "1px solid rgba(192,192,192,0.2)", minWidth: "160px", boxShadow: "0 8px 32px rgba(0,0,0,0.8)" }}
            >
              <div className="px-3 py-2 text-xs" style={{ color: "#555", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>切换页面</div>
              <button
                className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2"
                style={{ color: "#c0c0c0" }}
                onClick={() => { setShowPageMenu(false); setLocation(`/ledger/${ledgerId}/position-calc`); }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-gray-600 flex-shrink-0" />
                智能仓位管理
              </button>
              <button
                className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2"
                style={{ color: "#c0c0c0" }}
                onClick={() => { setShowPageMenu(false); setLocation(`/ledger/${ledgerId}/order-flow`); }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-gray-600 flex-shrink-0" />
                订单流管理
              </button>
              <button
                className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2"
                style={{ color: "#c0c0c0", backgroundColor: "rgba(240,185,11,0.08)" }}
                onClick={() => setShowPageMenu(false)}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
                期权分析总览
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={BTN_STYLE}
        >
          <Settings className="w-4 h-4" style={{ color: OKX_TEXT_SEC }} />
        </button>
      </div>

      {/* ===== 设置面板 ===== */}
      {showSettings && (
        <div className="mx-3 mt-3 rounded-2xl p-4" style={{ background: OKX_CARD, border: `1px solid ${OKX_BORDER}` }}>
          <div className="text-sm font-medium mb-3" style={{ color: OKX_TEXT_PRI }}>计算参数</div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "ETH 价格", value: ethPrice, setter: setEthPrice, placeholder: "2500" },
              { label: "隐含波动率", value: iv, setter: setIv, placeholder: "0.80" },
              { label: "无风险利率", value: riskFreeRate, setter: setRiskFreeRate, placeholder: "0.05" },
            ].map(({ label, value, setter, placeholder }) => (
              <div key={label}>
                <div className="text-xs mb-1" style={{ color: OKX_TEXT_SEC }}>{label}</div>
                <input
                  type="number"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  placeholder={placeholder}
                  className="w-full px-2 py-1.5 rounded-lg text-sm"
                  style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${OKX_BORDER}`, color: OKX_TEXT_PRI, outline: "none" }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== 到期预警 ===== */}
      {expiringOrders.length > 0 && (
        <div
          className="mx-3 mt-3 rounded-xl px-4 py-3 flex items-start gap-3"
          style={{ background: "rgba(240,185,11,0.08)", border: "1px solid rgba(240,185,11,0.25)" }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: OKX_YELLOW }} />
          <div>
            <div className="text-xs font-medium mb-1" style={{ color: OKX_YELLOW }}>
              {expiringOrders.length} 张期权将在 7 天内到期
            </div>
            <div className="flex flex-wrap gap-1.5">
              {expiringOrders.map((o: any) => (
                <span
                  key={o.id}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(240,185,11,0.12)", color: OKX_YELLOW, border: "1px solid rgba(240,185,11,0.3)" }}
                >
                  {o.option_type?.toUpperCase()} ${o.strike_price ?? o.entry_price} · {daysUntil(fmtDate(o.expiry_date))}天
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== Tab 导航 ===== */}
      <div className="flex gap-1 px-3 pt-3 pb-1">
        {([
          { id: "summary" as TabId, label: "总览", icon: BarChart2 },
          { id: "matrix" as TabId, label: "矩阵", icon: Grid },
          { id: "pnl" as TabId, label: "曲线", icon: TrendingUp },
          { id: "greeks" as TabId, label: "希腊", icon: Activity },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className="flex-1 flex flex-col items-center py-2 rounded-xl text-xs font-medium gap-1 transition-all"
            style={
              activeTab === id
                ? { background: "rgba(240,185,11,0.12)", color: OKX_YELLOW, border: `1px solid rgba(240,185,11,0.3)` }
                : { background: "rgba(255,255,255,0.04)", color: OKX_TEXT_SEC, border: `1px solid ${OKX_BORDER}` }
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ===== 加载中 ===== */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="text-sm" style={{ color: OKX_TEXT_SEC }}>加载中...</div>
        </div>
      )}

      {/* ===== 空状态（非订单Tab）===== */}
      {!isLoading && optionOrders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="text-4xl opacity-30">📊</div>
          <div className="text-sm" style={{ color: OKX_TEXT_SEC }}>暂无期权持仓</div>
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/order-flow`)}
            className="mt-2 px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
            style={{ background: "rgba(240,185,11,0.12)", color: OKX_YELLOW, border: "1px solid rgba(240,185,11,0.3)" }}
          >
            <Plus className="w-4 h-4" />
            前往订单流管理添加期权订单
          </button>
        </div>
      )}

      {/* ===== 总览 Tab ===== */}
      {!isLoading && optionOrders.length > 0 && activeTab === "summary" && (
        <div className="px-3 pt-2 space-y-3">
          {/* 汇总卡片 */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "linear-gradient(135deg, rgba(240,185,11,0.08) 0%, rgba(255,255,255,0.03) 60%, rgba(0,0,0,0.2) 100%)", border: "1px solid rgba(240,185,11,0.18)" }}
          >
            <div className="px-4 pt-3 pb-2" style={{ borderBottom: `1px solid ${OKX_BORDER}` }}>
              <div className="text-xs font-medium" style={{ color: OKX_YELLOW }}>期权持仓汇总</div>
            </div>
            <div className="grid grid-cols-2 gap-0">
              {[
                { label: "持仓数量", value: `${optionOrders.length} 张` },
                { label: "总开仓成本", value: `$${fmt(greeks.totalCost < 0 ? -greeks.totalCost : greeks.totalCost)}` },
                {
                  label: "浮动盈亏",
                  value: `${floatingPnL >= 0 ? "+" : ""}$${fmt(floatingPnL)}`,
                  color: floatingPnL >= 0 ? OKX_GREEN : OKX_RED,
                },
                {
                  label: "净 Delta 方向",
                  value: greeks.netDelta > 0.05 ? "偏多 ▲" : greeks.netDelta < -0.05 ? "偏空 ▼" : "中性 ─",
                  color: greeks.netDelta > 0.05 ? OKX_GREEN : greeks.netDelta < -0.05 ? OKX_RED : OKX_TEXT_SEC,
                },
              ].map(({ label, value, color }) => (
                <div key={label} className="px-4 py-3" style={{ borderBottom: `1px solid ${OKX_BORDER}` }}>
                  <div className="text-xs mb-1" style={{ color: OKX_TEXT_SEC }}>{label}</div>
                  <div className="text-base font-semibold" style={{ color: color ?? OKX_TEXT_PRI }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 按到期日分组 */}
          {groupedByExpiry.map(([expiry, orders]) => {
            const days = daysUntil(expiry);
            const isExpiring = days >= 0 && days <= 7;
            return (
              <div
                key={expiry}
                className="rounded-2xl overflow-hidden"
                style={{ background: OKX_CARD, border: isExpiring ? "1px solid rgba(240,185,11,0.3)" : `1px solid ${OKX_BORDER}` }}
              >
                <div
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderBottom: `1px solid ${OKX_BORDER}` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: OKX_TEXT_PRI }}>{expiry}</span>
                    {isExpiring && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "rgba(240,185,11,0.15)", color: OKX_YELLOW }}>
                        {days}天后到期
                      </span>
                    )}
                  </div>
                  <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>{orders.length} 张</span>
                </div>
                {orders.map((o: any) => {
                  const isCall = o.option_type === "call";
                  const isLong = o.direction === "long";
                  return (
                    <div
                      key={o.id}
                      className="flex items-center justify-between px-4 py-2.5"
                      style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs px-2 py-0.5 rounded font-medium"
                          style={{
                            background: isCall ? "rgba(14,203,129,0.12)" : "rgba(246,70,93,0.12)",
                            color: isCall ? OKX_CALL : OKX_PUT,
                          }}
                        >
                          {isCall ? "Call" : "Put"}
                        </span>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                            background: isLong ? "rgba(14,203,129,0.08)" : "rgba(246,70,93,0.08)",
                            color: isLong ? OKX_GREEN : OKX_RED,
                          }}
                        >
                          {isLong ? "买入" : "卖出"}
                        </span>
                        <span className="text-sm font-medium" style={{ color: OKX_TEXT_PRI }}>
                          ${o.strike_price ?? o.entry_price}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm" style={{ color: OKX_TEXT_PRI }}>{fmt(o.quantity, 2)} ETH</div>
                        <div className="text-xs" style={{ color: OKX_TEXT_SEC }}>
                          权利金 {o.premium ? `${Math.round(parseFloat(o.premium)).toLocaleString("zh-CN")} U` : "--"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== 矩阵 Tab ===== */}
      {!isLoading && optionOrders.length > 0 && activeTab === "matrix" && (
        <div className="px-3 pt-2">
          <div className="rounded-2xl overflow-hidden" style={{ background: OKX_CARD, border: `1px solid ${OKX_BORDER}` }}>
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${OKX_BORDER}` }}>
              <div className="text-sm font-medium" style={{ color: OKX_TEXT_PRI }}>期权矩阵热力图</div>
              <div className="text-xs mt-0.5" style={{ color: OKX_TEXT_SEC }}>行：行权价 / 列：到期日 · 绿=Call多 红=Put多</div>
            </div>
            {matrixData.strikes.length === 0 ? (
              <div className="py-8 text-center text-sm" style={{ color: OKX_TEXT_SEC }}>
                请确保期权订单已填写 Call/Put 类型和行权价
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left" style={{ color: OKX_TEXT_SEC, minWidth: 64 }}>行权价</th>
                      {matrixData.expiries.map((exp) => (
                        <th key={exp} className="px-2 py-2 text-center" style={{ color: OKX_TEXT_SEC, minWidth: 72 }}>
                          {exp.slice(5)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixData.strikes.map((strike) => (
                      <tr key={strike}>
                        <td
                          className="px-3 py-2 font-medium"
                          style={{
                            color: Math.abs(strike - S) < S * 0.02 ? OKX_YELLOW : OKX_TEXT_PRI,
                            borderTop: `1px solid ${OKX_BORDER}`,
                          }}
                        >
                          ${strike.toLocaleString()}
                          {Math.abs(strike - S) < S * 0.02 && (
                            <span className="ml-1 text-xs" style={{ color: OKX_YELLOW }}>ATM</span>
                          )}
                        </td>
                        {matrixData.expiries.map((exp) => {
                          const key = `${strike}_${exp}`;
                          const cell = matrixData.cells[key] ?? { call: 0, put: 0, net: 0 };
                          const bg = matrixCellColor(cell.net, cell.call, cell.put);
                          return (
                            <td
                              key={exp}
                              className="px-2 py-2 text-center"
                              style={{ background: bg, borderTop: `1px solid ${OKX_BORDER}` }}
                            >
                              {(cell.call !== 0 || cell.put !== 0) ? (
                                <div>
                                  {cell.call !== 0 && (
                                    <div style={{ color: OKX_CALL }}>C{cell.call > 0 ? "+" : ""}{cell.call}</div>
                                  )}
                                  {cell.put !== 0 && (
                                    <div style={{ color: OKX_PUT }}>P{cell.put > 0 ? "+" : ""}{cell.put}</div>
                                  )}
                                </div>
                              ) : (
                                <span style={{ color: "rgba(255,255,255,0.12)" }}>─</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="flex gap-4 px-1 mt-3 mb-2">
            {[
              { color: OKX_CALL, label: "Call 净多" },
              { color: OKX_PUT, label: "Put 净多" },
              { color: OKX_YELLOW, label: "混合" },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: color, opacity: 0.6 }} />
                <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== P&L 曲线 Tab（含订单列表）===== */}
      {!isLoading && optionOrders.length > 0 && activeTab === "pnl" && (
        <div className="flex flex-col overflow-y-auto" style={{ height: "calc(100vh - 160px)" }}>
          {/* 汇总曲线图 */}
          {positions.length > 1 && (
            <div className="flex-shrink-0 px-3 pt-3 pb-2" style={{ borderTop: `1px solid ${OKX_BORDER}` }}>
              <div className="text-xs font-medium mb-2" style={{ color: OKX_TEXT_SEC }}>组合总览 · 所有订单叠加</div>
              <div className="rounded-2xl overflow-hidden" style={{ background: OKX_CARD, border: `1px solid ${OKX_BORDER}` }}>
                <CombinedPnlCanvas
                  perOrderPnL={perOrderPnL}
                  combinedPnL={pnlData}
                  currentPrice={S}
                  highlightId={highlightId}
                  onHighlight={setHighlightId}
                />
              </div>
            </div>
          )}
          {/* 订单列表 */}
          <div className="flex-shrink-0 px-3 pt-3 pb-2" style={{ borderTop: `1px solid ${OKX_BORDER}` }}>
            <div className="text-xs font-medium mb-2" style={{ color: OKX_TEXT_SEC }}>期权订单 · 点击卡片高亮曲线</div>
            <div className="space-y-3">
              {optionOrders.map((order: any) => {
                const series = perOrderPnL.find(s => s.id === order.id);
                const isSelected = highlightId === order.id;
                const isCall = order.option_type === "call";
                const isLong = order.direction === "long";
                const isOpen = order.status === "open";
                const dirColor = isLong ? "#F6465D" : "#0ECB81";
                let expiryDaysLeft: number | null = null;
                if (order.expiry_date) {
                  const expiry = new Date(order.expiry_date);
                  const now = new Date();
                  expiryDaysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                }
                const strike = order.strike_price ? parseFloat(order.strike_price) : null;
                const premium = order.premium ? parseFloat(order.premium) : null;
                const qty = parseFloat(order.quantity || 1);
                let breakeven: number | null = null;
                if (strike != null && premium != null && qty > 0) {
                  const ppu = premium / qty;
                  breakeven = isCall ? (isLong ? strike + ppu : strike - ppu) : (isLong ? strike - ppu : strike + ppu);
                }
                const maxLoss = isLong ? (premium != null ? Math.round(premium) : null) : null;
                let maxProfit: number | null | "无限" = null;
                if (isLong && strike != null && premium != null) {
                  maxProfit = isCall ? "无限" : Math.round(strike * qty - premium);
                } else if (!isLong && premium != null) {
                  maxProfit = Math.round(premium);
                }
                const seriesColor = series?.color ?? OKX_YELLOW;
                return (
                  <div
                    key={order.id}
                    onClick={() => setHighlightId(isSelected ? null : order.id)}
                    className="rounded-2xl overflow-hidden cursor-pointer transition-all"
                    style={{
                      background: OKX_CARD,
                      border: `1px solid ${isSelected ? seriesColor : isOpen ? "rgba(147,51,234,0.3)" : OKX_BORDER}`,
                      boxShadow: isSelected ? `0 0 16px ${seriesColor}44` : isOpen ? "0 0 20px rgba(147,51,234,0.06)" : "none",
                    }}
                  >
                    {/* 订单头部信息 */}
                    <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 flex-wrap">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: seriesColor }} />
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: isLong ? "rgba(246,70,93,0.15)" : "rgba(14,203,129,0.15)", color: dirColor }}>
                        {isLong ? "多" : "空"}
                      </span>
                      <span className="text-sm font-semibold" style={{ color: OKX_TEXT_PRI }}>
                        {order.symbol?.replace("USDT", "")} / USDT
                      </span>
                      {order.option_type && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: isCall ? "rgba(14,203,129,0.15)" : "rgba(246,70,93,0.15)", color: isCall ? OKX_CALL : OKX_PUT }}>
                          {isCall ? "CALL" : "PUT"}
                        </span>
                      )}
                      {expiryDaysLeft != null && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{
                          backgroundColor: expiryDaysLeft <= 3 ? "rgba(246,70,93,0.15)" : expiryDaysLeft <= 7 ? "rgba(240,185,11,0.12)" : "rgba(14,203,129,0.12)",
                          color: expiryDaysLeft <= 3 ? "#F6465D" : expiryDaysLeft <= 7 ? OKX_YELLOW : "#0ECB81",
                        }}>
                          {expiryDaysLeft > 0 ? `${expiryDaysLeft}天到期` : "已到期"}
                        </span>
                      )}
                      <span className="text-xs px-1.5 py-0.5 rounded ml-auto" style={isOpen ? { backgroundColor: "rgba(240,185,11,0.12)", color: OKX_YELLOW } : { backgroundColor: "rgba(255,255,255,0.05)", color: OKX_TEXT_SEC }}>
                        {isOpen ? "持仓" : "已平"}
                      </span>
                    </div>
                    {/* 行权价 / 开仓价 / 数量 */}
                    <div className="grid grid-cols-3 gap-0 px-3 py-2" style={{ borderTop: `1px solid ${OKX_BORDER}` }}>
                      <div>
                        <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>行权价</div>
                        <div className="text-base font-bold" style={{ color: OKX_TEXT_PRI, fontVariantNumeric: "tabular-nums" }}>{strike != null ? `$${strike.toLocaleString("zh-CN")}` : "--"}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>开仓价</div>
                        <div className="text-base font-bold" style={{ color: OKX_TEXT_PRI, fontVariantNumeric: "tabular-nums" }}>{fmt(parseFloat(order.entry_price), 1)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>数量</div>
                        <div className="text-base font-bold" style={{ color: OKX_TEXT_PRI, fontVariantNumeric: "tabular-nums" }}>{fmt(qty, 2)} ETH</div>
                      </div>
                    </div>
                    {/* 权利金 / 盈亏平衡 / 到期日 */}
                    <div className="grid grid-cols-3 gap-0 px-3 py-2" style={{ borderTop: `1px solid ${OKX_BORDER}` }}>
                      <div>
                        <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>权利金</div>
                        <div className="text-sm" style={{ color: OKX_TEXT_PRI, fontVariantNumeric: "tabular-nums" }}>{premium != null ? `${Math.round(premium).toLocaleString("zh-CN")} U` : "--"}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>盈亏平衡</div>
                        <div className="text-sm" style={{ color: OKX_YELLOW, fontVariantNumeric: "tabular-nums" }}>{breakeven != null ? `${Math.round(breakeven).toLocaleString("zh-CN")} U` : "--"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>到期日</div>
                        <div className="text-sm" style={{ color: OKX_TEXT_PRI }}>{order.expiry_date ? fmtDate(order.expiry_date) : "--"}</div>
                      </div>
                    </div>
                    {/* 最大亏损 / 最大盈利 */}
                    <div className="grid grid-cols-2 gap-0 px-3 py-2" style={{ borderTop: `1px solid ${OKX_BORDER}`, background: "rgba(0,0,0,0.2)" }}>
                      <div>
                        <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>最大亏损</div>
                         <div className="text-sm font-medium" style={{ color: "#0ECB81", fontVariantNumeric: "tabular-nums" }}>
                          {isLong ? (maxLoss != null ? `-${maxLoss.toLocaleString("zh-CN")} U` : "--") : <span style={{ fontSize: "0.7rem" }}>理论无限</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>最大盈利</div>
                         <div className="text-sm font-medium" style={{ color: "#F6465D", fontVariantNumeric: "tabular-nums" }}>
                          {maxProfit === "无限" ? <span style={{ fontSize: "0.7rem" }}>理论无限</span> : maxProfit != null ? `+${(maxProfit as number).toLocaleString("zh-CN")} U` : "--"}
                        </div>
                      </div>
                    </div>
                    {/* 小 P&L 曲线 */}
                    {series && (
                      <div style={{ borderTop: `1px solid ${OKX_BORDER}` }}>
                        <MiniPnlCanvas data={series.data} strikePrice={strike ?? 0} color={seriesColor} currentPrice={S} />
                      </div>
                    )}
                    {/* 备注 */}
                    {order.note && (
                      <div className="px-3 py-2" style={{ borderTop: `1px solid ${OKX_BORDER}`, background: "rgba(0,0,0,0.18)" }}>
                        <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>{order.note}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* 跳转订单流管理 */}
            <button
              onClick={() => setLocation(`/ledger/${ledgerId}/order-flow`)}
              className="w-full mt-3 py-3 rounded-2xl text-sm font-medium flex items-center justify-center gap-2"
              style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${OKX_BORDER}`, color: OKX_TEXT_SEC }}
            >
              <Plus className="w-4 h-4" />
              前往订单流管理添加期权订单
            </button>
          </div>
        </div>
      )}

      {/* ===== 希腊字母 Tab ===== */}
      {!isLoading && optionOrders.length > 0 && activeTab === "greeks" && (
        <div className="px-3 pt-2 space-y-3">
          <div className="rounded-2xl overflow-hidden" style={{ background: OKX_CARD, border: `1px solid ${OKX_BORDER}` }}>
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${OKX_BORDER}` }}>
              <div className="text-sm font-medium" style={{ color: OKX_TEXT_PRI }}>组合希腊字母汇总</div>
              <div className="text-xs mt-0.5" style={{ color: OKX_TEXT_SEC }}>
                基于 Black-Scholes 模型 · ETH=${fmt(S, 0)} · IV={fmt(sigma * 100, 0)}%
              </div>
            </div>
            <div className="divide-y" style={{ borderColor: OKX_BORDER }}>
              {[
                {
                  symbol: "Δ Delta",
                  value: fmt(greeks.netDelta, 4),
                  desc: "ETH 价格变动 $1 时，组合价值变化",
                  color: greeks.netDelta > 0 ? OKX_GREEN : greeks.netDelta < 0 ? OKX_RED : OKX_TEXT_SEC,
                },
                {
                  symbol: "Γ Gamma",
                  value: fmt(greeks.netGamma, 6),
                  desc: "ETH 价格变动 $1 时，Delta 的变化量",
                  color: OKX_TEXT_PRI,
                },
                {
                  symbol: "Θ Theta",
                  value: `${greeks.netTheta >= 0 ? "+" : ""}${fmt(greeks.netTheta, 4)} /天`,
                  desc: "每过一天，组合价值的时间损耗",
                  color: greeks.netTheta < 0 ? OKX_RED : OKX_GREEN,
                },
                {
                  symbol: "V Vega",
                  value: `${greeks.netVega >= 0 ? "+" : ""}${fmt(greeks.netVega, 4)} /1%IV`,
                  desc: "隐含波动率变化 1% 时，组合价值变化",
                  color: greeks.netVega > 0 ? OKX_GREEN : OKX_RED,
                },
              ].map(({ symbol, value, desc, color }) => (
                <div key={symbol} className="flex items-center justify-between px-4 py-3.5">
                  <div>
                    <div className="text-sm font-medium" style={{ color: OKX_TEXT_PRI }}>{symbol}</div>
                    <div className="text-xs mt-0.5" style={{ color: OKX_TEXT_SEC }}>{desc}</div>
                  </div>
                  <div className="text-base font-semibold text-right" style={{ color }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 各持仓希腊字母明细 */}
          <div className="rounded-2xl overflow-hidden" style={{ background: OKX_CARD, border: `1px solid ${OKX_BORDER}` }}>
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${OKX_BORDER}` }}>
              <div className="text-sm font-medium" style={{ color: OKX_TEXT_PRI }}>各持仓明细</div>
            </div>
            {positions.map((pos, idx) => {
              const now = new Date();
              const T = Math.max((new Date(pos.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365), 0);
              const bs = blackScholes({ S, K: pos.strikePrice, T, r, sigma, type: pos.contractType });
              const sign = pos.direction === "long" ? 1 : -1;
              const isCall = pos.contractType === "call";
              return (
                <div key={idx} className="px-4 py-3" style={{ borderTop: `1px solid ${OKX_BORDER}` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-0.5 rounded font-medium" style={{ background: isCall ? "rgba(14,203,129,0.12)" : "rgba(246,70,93,0.12)", color: isCall ? OKX_CALL : OKX_PUT }}>
                      {isCall ? "Call" : "Put"}
                    </span>
                    <span className="text-sm font-medium" style={{ color: OKX_TEXT_PRI }}>${pos.strikePrice}</span>
                    <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>{pos.expiryDate}</span>
                    <span className="text-xs ml-auto" style={{ color: OKX_TEXT_SEC }}>{pos.direction === "long" ? "买入" : "卖出"} {pos.quantity}ETH</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    {[
                      { k: "Δ", v: fmt(sign * bs.delta, 3) },
                      { k: "Γ", v: fmt(sign * bs.gamma, 5) },
                      { k: "Θ/天", v: fmt(sign * bs.theta, 4) },
                      { k: "V/1%", v: fmt(sign * bs.vega, 4) },
                    ].map(({ k, v }) => (
                      <div key={k} className="rounded-lg px-2 py-1.5 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
                        <div style={{ color: OKX_TEXT_SEC }}>{k}</div>
                        <div className="font-medium mt-0.5" style={{ color: OKX_TEXT_PRI }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* orders Tab 已合并到曲线 Tab */}
      {false && (
        <div>
          {/* 状态过滤 */}
          <div className="flex gap-2 px-4 pt-3 pb-2 items-center">
            {(["all", "open", "closed"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                style={
                  filterStatus === s
                    ? { backgroundColor: "rgba(240,185,11,0.15)", color: OKX_YELLOW, border: `1px solid rgba(240,185,11,0.4)` }
                    : { backgroundColor: "rgba(255,255,255,0.05)", color: OKX_TEXT_SEC, border: `1px solid ${OKX_BORDER}` }
                }
              >
                {s === "all" ? "全部" : s === "open" ? "持仓中" : "已平仓"}
              </button>
            ))}
            <span className="ml-auto text-xs" style={{ color: OKX_TEXT_SEC }}>
              {filteredOrders.length} 张
            </span>
          </div>

          {/* 订单卡片列表 */}
          <div className="px-3 space-y-3 pb-4">
            {filteredOrders.length === 0 && (
              <div className="text-center py-16">
                <div className="text-4xl opacity-20 mb-3">📋</div>
                <p className="text-sm" style={{ color: OKX_TEXT_SEC }}>暂无期权订单，点击下方 + 新增</p>
              </div>
            )}
            {filteredOrders.map((order: any) => {
              const isCall = order.option_type === "call";
              const isLong = order.direction === "long";
              const isOpen = order.status === "open";
              const dirColor = isLong ? "#F6465D" : "#0ECB81";
              // 到期倒计时
              let expiryDaysLeft: number | null = null;
              if (order.expiry_date) {
                const expiry = new Date(order.expiry_date);
                const now = new Date();
                expiryDaysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              }
              // 盈亏平衡计算
              const strike = order.strike_price ? parseFloat(order.strike_price) : null;
              const premium = order.premium ? parseFloat(order.premium) : null;
              const qty = parseFloat(order.quantity || 1);
              let breakeven: number | null = null;
              if (strike != null && premium != null && qty > 0) {
                const premiumPerUnit = premium / qty;
                if (isCall) {
                  breakeven = isLong ? strike + premiumPerUnit : strike - premiumPerUnit;
                } else {
                  breakeven = isLong ? strike - premiumPerUnit : strike + premiumPerUnit;
                }
              }
              // 最大亏损/盈利
              const maxLoss = isLong ? (premium != null ? Math.round(premium) : null) : null;
              let maxProfit: number | null | "无限" = null;
              if (isLong && strike != null && premium != null) {
                maxProfit = isCall ? "无限" : Math.round(strike * qty - premium);
              } else if (!isLong && premium != null) {
                maxProfit = Math.round(premium);
              }

              return (
                <div
                  key={order.id}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: OKX_CARD,
                    border: `1px solid ${isOpen ? "rgba(147,51,234,0.3)" : "rgba(192,192,192,0.12)"}`,
                    boxShadow: isOpen ? "0 0 20px rgba(147,51,234,0.06)" : "none",
                  }}
                >
                  {/* 行1：方向 + 类型标签 + 到期倒计时 + 状态 + 操作 */}
                  <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 flex-wrap">
                    <span
                      className="text-xs font-bold px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: isLong ? "rgba(246,70,93,0.15)" : "rgba(14,203,129,0.15)", color: dirColor }}
                    >
                      {isLong ? "多" : "空"}
                    </span>
                    <span className="text-sm font-semibold" style={{ color: OKX_TEXT_PRI }}>
                      {order.symbol?.replace("USDT", "")} / USDT
                    </span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(147,51,234,0.12)", color: "#a78bfa" }}>
                      期权
                    </span>
                    {order.option_type && (
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: isCall ? "rgba(14,203,129,0.15)" : "rgba(246,70,93,0.15)",
                          color: isCall ? OKX_CALL : OKX_PUT,
                        }}
                      >
                        {isCall ? "CALL" : "PUT"}
                      </span>
                    )}
                    {expiryDaysLeft != null && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{
                        backgroundColor: expiryDaysLeft <= 3 ? "rgba(246,70,93,0.15)" : expiryDaysLeft <= 7 ? "rgba(240,185,11,0.12)" : "rgba(14,203,129,0.12)",
                        color: expiryDaysLeft <= 3 ? "#F6465D" : expiryDaysLeft <= 7 ? OKX_YELLOW : "#0ECB81",
                      }}>
                        {expiryDaysLeft > 0 ? `${expiryDaysLeft}天到期` : "已到期"}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>{order.entry_date}</span>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded ml-auto"
                      style={
                        isOpen
                          ? { backgroundColor: "rgba(240,185,11,0.12)", color: OKX_YELLOW }
                          : { backgroundColor: "rgba(255,255,255,0.05)", color: OKX_TEXT_SEC }
                      }
                    >
                      {isOpen ? "持仓" : "已平"}
                    </span>
  
                  </div>

                  {/* 行2：行权价 / 开仓价 / 数量 */}
                  <div className="grid grid-cols-3 gap-0 px-3 py-2" style={{ borderTop: `1px solid ${OKX_BORDER}` }}>
                    <div>
                      <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>行权价</div>
                      <div className="text-base font-bold" style={{ color: OKX_TEXT_PRI, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                        {strike != null ? `$${strike.toLocaleString("zh-CN")}` : "--"}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>开仓价</div>
                      <div className="text-base font-bold" style={{ color: OKX_TEXT_PRI, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                        {fmt(parseFloat(order.entry_price), 1)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>数量</div>
                      <div className="text-base font-bold" style={{ color: OKX_TEXT_PRI, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                        {fmt(qty, 2)} ETH
                      </div>
                    </div>
                  </div>

                  {/* 行3：权利金 / 盈亏平衡 / 到期日 */}
                  <div className="grid grid-cols-3 gap-0 px-3 py-2" style={{ borderTop: `1px solid ${OKX_BORDER}` }}>
                    <div>
                      <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>权利金</div>
                      <div className="text-sm" style={{ color: OKX_TEXT_PRI, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                        {premium != null ? `${Math.round(premium).toLocaleString("zh-CN")} U` : "--"}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>盈亏平衡</div>
                      <div className="text-sm" style={{ color: OKX_TEXT_PRI, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                        {breakeven != null ? `$${breakeven.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}` : "--"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>到期日</div>
                      <div className="text-sm" style={{ color: OKX_TEXT_PRI }}>
                        {order.expiry_date ? fmtDate(order.expiry_date) : "--"}
                      </div>
                    </div>
                  </div>

                  {/* 行4：最大亏损 / 最大盈利 */}
                  <div className="grid grid-cols-2 gap-0 px-3 py-2" style={{ borderTop: `1px solid ${OKX_BORDER}`, background: "rgba(0,0,0,0.2)" }}>
                    <div>
                      <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>最大亏损</div>
                        <div className="text-sm font-medium" style={{ color: "#0ECB81", fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                        {isLong
                          ? (maxLoss != null ? `-${maxLoss.toLocaleString("zh-CN")} U` : "--")
                          : <span style={{ color: "#0ECB81", fontSize: "0.7rem" }}>理论无限</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>最大盈利</div>
                        <div className="text-sm font-medium" style={{ color: "#F6465D", fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                        {maxProfit === "无限"
                          ? <span style={{ color: "#F6465D", fontSize: "0.7rem" }}>理论无限</span>
                          : maxProfit != null ? `+${(maxProfit as number).toLocaleString("zh-CN")} U` : "--"}
                      </div>
                    </div>
                  </div>

                  {/* 备注 */}
                  {order.note && (
                    <div className="px-3 py-2" style={{ borderTop: `1px solid ${OKX_BORDER}`, background: "rgba(0,0,0,0.18)" }}>
                      <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>{order.note}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 跳转到订单流管理 */}
          <div className="px-3 pb-4">
            <button
              onClick={() => setLocation(`/ledger/${ledgerId}/order-flow`)}
              className="w-full py-3 rounded-2xl text-sm font-medium flex items-center justify-center gap-2"
              style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${OKX_BORDER}`, color: OKX_TEXT_SEC }}
            >
              <Plus className="w-4 h-4" />
              前往订单流管理添加期权订单
            </button>
          </div>
        </div>
      )}

    </div>
  );
}