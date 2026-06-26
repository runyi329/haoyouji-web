/**
 * OptionAnalysisPage.tsx
 * 期权分析总览页面
 * - 与 OrderFlowPage / PositionCalc 风格完全一致（OKX 深色主题）
 * - 读取 orderFlow.getOrders 中 market_type='option' 的持仓
 * - 功能：汇总卡片 / 到期预警 / 期权矩阵热力图 / P&L 曲线 / 希腊字母
 */
import React, { useState, useEffect, useMemo, useRef } from "react";
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
const OKX_GREEN = "#0ECB81";   // 涨/多
const OKX_RED = "#F6465D";     // 跌/空
const OKX_CALL = "#0ECB81";    // Call = 绿
const OKX_PUT = "#F6465D";     // Put = 红

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
  const [showPageMenu, setShowPageMenu] = useState(false);

  // ===== Tab 状态 =====
  const [activeTab, setActiveTab] = useState<TabId>("summary");

  // ===== 获取期权订单 =====
  const { data: allOrders = [], isLoading } = trpc.orderFlow.getOrders.useQuery(
    { ledgerId, status: "open" },
    { enabled: isAuthenticated && ledgerId > 0 }
  );

  // ===== 过滤出期权订单 =====
  const optionOrders = useMemo(
    () => allOrders.filter((o: any) => o.market_type === "option"),
    [allOrders]
  );

  // ===== 转换为 PositionForCalc =====
  const positions = useMemo<PositionForCalc[]>(() => {
    return optionOrders
      .filter((o: any) => o.option_type && o.expiry_date)
      .map((o: any) => ({
        contractType: (o.option_type as "call" | "put") || "call",
        direction: (o.direction as "long" | "short") || "long",
        strikePrice: parseFloat(o.strike_price ?? o.entry_price ?? 0),
        entryPrice: parseFloat(o.premium ?? o.entry_price ?? 0),
        quantity: parseFloat(o.quantity ?? 1),
        expiryDate: fmtDate(o.expiry_date),
      }));
  }, [optionOrders]);

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

  // ===== P&L 曲线数据 =====
  const pnlData = useMemo(() => {
    if (positions.length === 0) return [];
    const minP = Math.max(100, S * 0.5);
    const maxP = S * 1.5;
    return calcExpiryPnL(positions, [minP, maxP], 80);
  }, [positions, S]);

  // ===== 分方向 P&L 数据 =====
  const pnlByDirection = useMemo(() => {
    if (positions.length === 0) return { buyCall: [], buyPut: [], sellCall: [], sellPut: [] };
    const minP = Math.max(100, S * 0.5);
    const maxP = S * 1.5;
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

  // ===== Canvas P&L 图 =====
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (activeTab !== "pnl" || pnlData.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    const pad = { top: 20, right: 16, bottom: 40, left: 56 };
    ctx.clearRect(0, 0, W, H);

    const allPnls = [
      ...pnlData.map((d) => d.pnl),
      ...pnlByDirection.buyCall.map((d) => d.pnl),
      ...pnlByDirection.buyPut.map((d) => d.pnl),
      ...pnlByDirection.sellCall.map((d) => d.pnl),
      ...pnlByDirection.sellPut.map((d) => d.pnl),
    ];
    const minPnl = Math.min(...allPnls, 0);
    const maxPnl = Math.max(...allPnls, 0);
    const pnlRange = maxPnl - minPnl || 1;
    const prices = pnlData.map((d) => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    const toX = (p: number) => pad.left + ((p - minPrice) / priceRange) * (W - pad.left - pad.right);
    const toY = (v: number) => pad.top + ((maxPnl - v) / pnlRange) * (H - pad.top - pad.bottom);

    // 零线
    const zeroY = toY(0);
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(W - pad.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 当前价格竖线
    const curX = toX(S);
    ctx.strokeStyle = "rgba(240,185,11,0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(curX, pad.top);
    ctx.lineTo(curX, H - pad.bottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // 绘制分方向细线
    const drawLine = (data: typeof pnlData, color: string, dash: number[] = [4, 3]) => {
      if (data.length === 0) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.setLineDash(dash);
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      data.forEach((d, i) => {
        const x = toX(d.price);
        const y = toY(d.pnl);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    };

    drawLine(pnlByDirection.buyCall, OKX_CALL);
    drawLine(pnlByDirection.buyPut, OKX_PUT);
    drawLine(pnlByDirection.sellCall, "rgba(14,203,129,0.5)");
    drawLine(pnlByDirection.sellPut, "rgba(246,70,93,0.5)");

    // 总计线（粗线 + 渐变填充）
    if (pnlData.length > 0) {
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      pnlData.forEach((d, i) => {
        const x = toX(d.price);
        const y = toY(d.pnl);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      // 颜色根据当前价格处的P&L决定
      const midIdx = Math.floor(pnlData.length / 2);
      const midPnl = pnlData[midIdx]?.pnl ?? 0;
      ctx.strokeStyle = midPnl >= 0 ? OKX_CALL : OKX_PUT;
      ctx.stroke();
    }

    // Y轴标签
    ctx.fillStyle = OKX_TEXT_SEC;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const v = minPnl + (pnlRange * i) / yTicks;
      const y = toY(v);
      const label = Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);
      ctx.fillText(label, pad.left - 4, y + 3);
    }

    // X轴标签
    ctx.textAlign = "center";
    const xTicks = 4;
    for (let i = 0; i <= xTicks; i++) {
      const p = minPrice + (priceRange * i) / xTicks;
      const x = toX(p);
      ctx.fillText(`$${Math.round(p)}`, x, H - pad.bottom + 14);
    }
  }, [activeTab, pnlData, pnlByDirection, S]);

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

      {/* ===== 空状态 ===== */}
      {!isLoading && optionOrders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="text-4xl opacity-30">📊</div>
          <div className="text-sm" style={{ color: OKX_TEXT_SEC }}>暂无期权持仓</div>
          <div className="text-xs" style={{ color: OKX_TEXT_SEC }}>
            请在「订单流管理」中添加期权订单
          </div>
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/order-flow`)}
            className="mt-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: "rgba(240,185,11,0.12)", color: OKX_YELLOW, border: "1px solid rgba(240,185,11,0.3)" }}
          >
            去添加订单
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
                        <div className="text-xs" style={{ color: OKX_TEXT_SEC }}>权利金 ${fmt(o.premium ?? o.entry_price)}</div>
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

          {/* 图例 */}
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

      {/* ===== P&L 曲线 Tab ===== */}
      {!isLoading && optionOrders.length > 0 && activeTab === "pnl" && (
        <div className="px-3 pt-2 space-y-3">
          <div className="rounded-2xl overflow-hidden" style={{ background: OKX_CARD, border: `1px solid ${OKX_BORDER}` }}>
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${OKX_BORDER}` }}>
              <div className="text-sm font-medium" style={{ color: OKX_TEXT_PRI }}>到期 P&L 曲线</div>
              <div className="text-xs mt-0.5" style={{ color: OKX_TEXT_SEC }}>
                竖线 = 当前 ETH 价格 ${fmt(S, 0)} · 虚线 = 各方向分项
              </div>
            </div>
            <div className="px-2 py-3">
              <canvas
                ref={canvasRef}
                width={340}
                height={220}
                style={{ width: "100%", height: 220 }}
              />
            </div>
            {/* 图例 */}
            <div className="flex flex-wrap gap-3 px-4 pb-3">
              {[
                { color: OKX_CALL, label: "Buy Call", dash: true },
                { color: OKX_PUT, label: "Buy Put", dash: true },
                { color: "rgba(14,203,129,0.5)", label: "Sell Call", dash: true },
                { color: "rgba(246,70,93,0.5)", label: "Sell Put", dash: true },
                { color: OKX_TEXT_PRI, label: "总计", dash: false },
              ].map(({ color, label, dash }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div
                    className="w-6 h-0.5"
                    style={{
                      background: color,
                      borderTop: dash ? `2px dashed ${color}` : `2px solid ${color}`,
                    }}
                  />
                  <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 盈亏平衡点 */}
          {pnlData.length > 0 && (() => {
            const breakevens: number[] = [];
            for (let i = 1; i < pnlData.length; i++) {
              const prev = pnlData[i - 1];
              const curr = pnlData[i];
              if ((prev.pnl < 0 && curr.pnl >= 0) || (prev.pnl >= 0 && curr.pnl < 0)) {
                const ratio = Math.abs(prev.pnl) / (Math.abs(prev.pnl) + Math.abs(curr.pnl));
                breakevens.push(prev.price + ratio * (curr.price - prev.price));
              }
            }
            if (breakevens.length === 0) return null;
            return (
              <div className="rounded-2xl px-4 py-3" style={{ background: OKX_CARD, border: `1px solid ${OKX_BORDER}` }}>
                <div className="text-xs mb-2" style={{ color: OKX_TEXT_SEC }}>盈亏平衡点</div>
                <div className="flex flex-wrap gap-2">
                  {breakevens.map((p, i) => (
                    <span key={i} className="text-sm font-semibold px-3 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.06)", color: OKX_TEXT_PRI }}>
                      ${fmt(p, 0)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
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
    </div>
  );
}
