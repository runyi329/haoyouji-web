// FunderOrderCardV2 —— OKX 深色风格订单卡片（资产感优先，服务费弱化）
// 仅用于对比展示，不影响原有 FunderOrderCard
import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  COIN_COLORS,
  CoinType,
  fmtDate,
  formatCoinQtyFunder,
  useAccruedInterestFunder,
  FunderNoteRow,
  parseNotes,
  formatNoteTime,
  NoteAvatar,
} from "./FunderOrderCard";

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

const DEFAULT_CNY_RATE = 7.25;

interface FunderOrderCardV2Props {
  order: any;
  livePrices: Record<string, number>;
  priceDirection?: Record<string, "up" | "down" | "same">;
  cnyRate?: number;
  membersData?: any[];
  ledgerId?: number;
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
  const floatPnl = currentValue !== null && buyValue > 0 ? currentValue - buyValue : null;
  const floatPct = floatPnl !== null && buyValue > 0 ? (floatPnl / buyValue) * 100 : null;
  const pnlColor = floatPnl === null ? OKX_TEXT_SEC : floatPnl >= 0 ? OKX_GREEN : OKX_RED;

  // 当前价涨跌
  const dir = priceDirection?.[coin] ?? "same";
  const priceDiff = liveP !== null && buyPrice > 0 ? liveP - buyPrice : null;
  const priceColor = priceDiff === null ? OKX_TEXT_PRI : priceDiff >= 0 ? OKX_GREEN : OKX_RED;

  // 利息计算
  const rateStr = String(order.interest_rate_annual || "");
  const isNegRate = rateStr.startsWith("-");
  const rateAbs = rateStr ? parseFloat(isNegRate ? rateStr.slice(1) : rateStr).toFixed(0) : "";
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
    const elapsed = endTs - new Date(order.buy_date + "T00:00:00").getTime();
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
          <div className="text-[10px] mb-1" style={{ color: OKX_TEXT_SEC }}>持有数量</div>
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
          <div className="text-sm" style={{ color: OKX_TEXT_PRI }}>
            {collateralAssets.length > 0
              ? collateralAssets.map((c) => `${c.qty} ${c.coin}`).join(" + ")
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
              {({'monthly_pre':'月付先付','monthly_post':'月付后付','semi_pre':'半年付先付','semi_post':'半年付后付','annual_pre':'年付先付','annual_post':'年付后付','end_post':'结束后付','monthly_prepaid':'月付先付','monthly_postpaid':'月付后付','quarterly':'季付','maturity':'到期付'} as any)[order.interest_payment_type] || order.interest_payment_type || '--'}
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
  const floatPnl = currentValue !== null && buyValue > 0 ? currentValue - buyValue : null;
  const floatPct = floatPnl !== null && buyValue > 0 ? (floatPnl / buyValue) * 100 : null;
  const pnlColor = floatPnl === null ? LT_TEXT_SEC : floatPnl >= 0 ? LT_GREEN : LT_RED;

  const dir = priceDirection?.[coin] ?? "same";
  const priceDiff = liveP !== null && buyPrice > 0 ? liveP - buyPrice : null;
  const priceColor = priceDiff === null ? LT_TEXT_PRI : priceDiff >= 0 ? LT_GREEN : LT_RED;

  const rateStr = String(order.interest_rate_annual || "");
  const isNegRate = rateStr.startsWith("-");
  const rateAbs = rateStr ? parseFloat(isNegRate ? rateStr.slice(1) : rateStr).toFixed(0) : "";
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
    const elapsed = endTs - new Date(order.buy_date + "T00:00:00").getTime();
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
          <span className="ml-auto text-[10px] font-mono" style={{ color: "rgba(0,0,0,0.20)", letterSpacing: "0.05em" }}>
            {order.order_no}
          </span>
        )}
      </div>

      {/* 行2：主数据行（4列） */}
      <div className="grid grid-cols-4 gap-0 px-3 py-3" style={{ borderTop: `1px solid ${LT_BORDER}` }}>
        <div>
          <div className="text-[10px] mb-1" style={{ color: LT_TEXT_SEC }}>持有数量</div>
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
          <div className="text-sm" style={{ color: LT_TEXT_PRI }}>
            {collateralAssets.length > 0 ? collateralAssets.map((c) => `${c.qty} ${c.coin}`).join(" + ") : "--"}
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
              {({'monthly_pre':'月付先付','monthly_post':'月付后付','semi_pre':'半年付先付','semi_post':'半年付后付','annual_pre':'年付先付','annual_post':'年付后付','end_post':'结束后付','monthly_prepaid':'月付先付','monthly_postpaid':'月付后付','quarterly':'季付','maturity':'到期付'} as any)[order.interest_payment_type] || order.interest_payment_type || '--'}
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
const SL_RED = '#16A34A';        // 跌 = 深绿
const LN_EARN = '#C00000';       // 收益型卡片应收利息颜色（深红）

export function FunderOrderCardV2Silver({
  order,
  livePrices,
  priceDirection = {},
  cnyRate = DEFAULT_CNY_RATE,
  membersData = [],
}: FunderOrderCardV2Props) {
  const [feeExpanded, setFeeExpanded] = useState(false);

  const coin = (order.coin || 'ETH') as CoinType;
  const qty = parseFloat(order.buy_quantity || '0');
  const buyPrice = parseFloat(order.buy_price || '0');
  const liveP = livePrices[coin] ?? null;

  const currentValue = liveP !== null && qty > 0 ? liveP * qty : null;
  const buyValue = qty > 0 && buyPrice > 0 ? qty * buyPrice : parseFloat(order.amount || '0');
  const floatPnl = currentValue !== null && buyValue > 0 ? currentValue - buyValue : null;
  const floatPct = floatPnl !== null && buyValue > 0 ? (floatPnl / buyValue) * 100 : null;
  const pnlColor = floatPnl === null ? SL_TEXT_SEC : floatPnl >= 0 ? SL_GREEN : SL_RED;

  const dir = priceDirection?.[coin] ?? 'same';
  const priceDiff = liveP !== null && buyPrice > 0 ? liveP - buyPrice : null;
  const priceColor = priceDiff === null ? SL_TEXT_PRI : priceDiff >= 0 ? SL_GREEN : SL_RED;

  const rateStr = String(order.interest_rate_annual || '');
  const isNegRate = rateStr.startsWith('-');
  const rateAbs = rateStr ? parseFloat(isNegRate ? rateStr.slice(1) : rateStr).toFixed(0) : '';
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
  const cardBg = isStockCard ? GOLD_BG_SV : SL_BG;
  const cardBorder = isStockCard ? GOLD_BORDER_SV : SL_BORDER;
  const cardShadow = isStockCard ? GOLD_SHADOW_SV : SL_SHADOW;
  const rivetBg = isStockCard
    ? 'radial-gradient(circle at 35% 35%, #fff8d0 0%, #e8c050 35%, #a07010 65%, #6a4800 100%)'
    : SL_RIVET_BG;
  const rivetShadow = isStockCard
    ? '0 1px 2px rgba(0,0,0,0.55), inset 0 1px 1px rgba(255,240,140,0.9)'
    : '0 1px 2px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.8)';

  return (
    <div
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

      {/* ── 行1：名字 | 开仓日期 | 当前币价 + 订单号 ── */}
      <div className="flex items-center px-4 pt-3 pb-2" style={{ borderBottom: `1px solid ${SL_DIVIDER}` }}>
        {/* 左侧：竖线分隔的标签组 */}
        <div className="flex items-center text-xs" style={{ color: SL_TEXT_SEC, gap: 0 }}>
          {(() => {
            const ownerName = order.owner_label || (() => {
              const m = (membersData as any[])?.find((m: any) => m.userId === order.user_id);
              return m ? (m.nickname || m.username) : null;
            })();
            const buyDateStr = order.buy_date ? fmtDate(order.buy_date) : null;
            const items = [ownerName, buyDateStr].filter(Boolean);
            const priceDiff2 = liveP !== null && buyPrice > 0 ? liveP - buyPrice : null;
            const livePriceColor = priceDiff2 === null ? SL_TEXT_PRI : priceDiff2 >= 0 ? SL_GREEN : SL_RED;
            return (
              <>
                {items.map((item, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span style={{ color: SL_TEXT_DIM, margin: '0 6px' }}>|</span>}
                    <span style={{ color: i === 0 ? SL_TEXT_PRI : SL_TEXT_SEC, fontWeight: i === 0 ? 500 : 400 }}>{item}</span>
                  </React.Fragment>
                ))}
                {coin !== 'CNY' && coin !== 'USDT' && (
                  <>
                    <span style={{ color: SL_TEXT_DIM, margin: '0 6px' }}>|</span>
                    <span className="flex items-center gap-0.5" style={{ color: livePriceColor, fontWeight: 500 }}>
                      {dir === 'up' && <span className="text-[10px] inline-flex items-center" style={{ color: SL_RED, animation: 'price-blink 1.5s ease-in-out infinite', lineHeight: 1 }}>▲</span>}
                      {dir === 'down' && <span className="text-[10px] inline-flex items-center" style={{ color: SL_GREEN, animation: 'price-blink 1.5s ease-in-out infinite', lineHeight: 1 }}>▼</span>}
                      <span>{coin}</span>
                      <span style={{ marginLeft: '3px' }}>{liveP != null ? liveP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}</span>
                    </span>
                  </>
                )}
              </>
            );
          })()}
        </div>
        {/* 右侧：订单号 */}
        {order.order_no && (
          <span
            className="ml-auto text-[10px] font-mono"
            style={{ color: SL_TEXT_DIM, letterSpacing: '0.05em' }}
          >
            {order.order_no}
          </span>
        )}
      </div>

      {/* ── 行2：主数据行（持有数量占宽，其侙3列均分）── */}
      <div className="flex gap-0 px-5 py-3" style={{ borderBottom: `1px solid ${SL_DIVIDER}` }}>
        {/* 持有数量/持有资产：占 40% */}
        <div style={{ flex: '0 0 40%' }}>
          {isStockCard ? (
            // 股票类：显示持有资产（计息基数，单位元）
            <>
              <div className="text-[10px] mb-1" style={{ color: SL_TEXT_SEC }}>持有资产 (元)</div>
              <div style={{ lineHeight: 1 }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 700, color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', textShadow: SL_TEXT_SHADOW_LG }}>
                  {order.interest_base ? parseFloat(order.interest_base).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '--'}
                </span>
              </div>
            </>
          ) : (
            // 数字币：显示持有数量
            <>
              <div className="text-[10px] mb-1" style={{ color: SL_TEXT_SEC }}>持有数量 ({coin})</div>
              <div style={{ lineHeight: 1 }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 700, color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', textShadow: SL_TEXT_SHADOW_LG }}>
                  {fmt(qty, 2)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* 买入价 / 当前价 / 浮动盈亏：股票类隐藏 */}
        {!isStockCard && (
          <>
            {/* 买入价：占 20% */}
            <div className="text-center" style={{ flex: 1 }}>
              <div className="text-[10px] mb-1" style={{ color: SL_TEXT_SEC }}>买入价 (U)</div>
              <div style={{ lineHeight: 1 }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 400, color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: SL_TEXT_SHADOW }}>
                  {buyPrice > 0 ? fmt(buyPrice, 0) : '--'}
                </span>
              </div>
            </div>

            {/* 当前价：占 20% */}
            <div className="text-center" style={{ flex: 1 }}>
              <div className="text-[10px] mb-1" style={{ color: SL_TEXT_SEC }}>当前价 (U)</div>
              <div style={{ lineHeight: 1 }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 400, color: SL_GOLD, fontVariantNumeric: 'tabular-nums', textShadow: SL_TEXT_SHADOW }}>
                  {liveP != null ? fmt(liveP, 0) : '--'}
                </span>
              </div>
            </div>

            {/* 浮动盈亏：占 20%，包含涨跌幅 */}
            <div className="text-right" style={{ flex: 1 }}>
              <div className="text-[10px] mb-1" style={{ color: SL_TEXT_SEC }}>浮动盈亏 (U)</div>
              <div style={{ lineHeight: 1 }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 500, color: pnlColor, fontVariantNumeric: 'tabular-nums', textShadow: SL_TEXT_SHADOW }}>
                  {floatPnl != null ? `${floatPnl >= 0 ? '+' : ''}${fmt(floatPnl, 0)}` : '--'}
                </span>
              </div>
              {floatPct != null && (
                <div className="text-[9px] mt-0.5" style={{ color: pnlColor, fontFamily: SL_NUM_FONT, fontVariantNumeric: 'tabular-nums' }}>
                  {floatPct >= 0 ? '+' : ''}{floatPct.toFixed(2)}%
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── 行3：次要数据行（3列）── */}
      <div className="grid grid-cols-3 gap-0 px-4 py-2" style={{ fontFamily: SL_NUM_FONT }}>
        <div>
          {/* 股票类隐藏当前市値 */}
          {!isStockCard && (
            <>
              <div className="text-[10px] mb-0.5" style={{ color: SL_TEXT_SEC }}>当前市値 (U)</div>
              <div className="text-sm" style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
                {currentValue != null ? fmt(currentValue, 0) : '--'}
              </div>
            </>
          )}
        </div>
        <div className="text-center">
          <div className="text-[10px] mb-0.5" style={{ color: SL_TEXT_SEC }}>开仓日期</div>
          <div className="text-sm" style={{ color: SL_TEXT_PRI }}>
            {order.buy_date ? fmtDate(order.buy_date) : '--'}
          </div>
        </div>
        <div className="text-right">
          {isStockCard ? (
            // 股票类：显示证券公司 + 证券账号
            <>
              {order.broker_name && (
                <>
                  <div className="text-[10px] mb-0.5" style={{ color: SL_TEXT_SEC }}>证券公司</div>
                  <div className="text-sm" style={{ color: SL_TEXT_PRI }}>{order.broker_name}</div>
                </>
              )}
              {order.broker_account && (
                <>
                  <div className="text-[10px] mb-0.5 mt-1" style={{ color: SL_TEXT_SEC }}>证券账号</div>
                  <div className="text-sm font-mono" style={{ color: SL_TEXT_PRI }}>{order.broker_account}</div>
                </>
              )}
              {!order.broker_name && !order.broker_account && (
                <div className="text-sm" style={{ color: SL_TEXT_SEC }}>--</div>
              )}
            </>
          ) : (
            // 数字币类：显示担保资产
            <>
              <div className="text-[10px] mb-0.5" style={{ color: SL_TEXT_SEC }}>担保资产</div>
              <div className="text-sm" style={{ color: SL_TEXT_PRI }}>
                {collateralAssets.length > 0 ? collateralAssets.map((c) => `${c.qty} ${c.coin}`).join(' + ') : '--'}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 行4：服务费（极弱化，可折叠）── */}
      <button
        className="w-full flex items-center justify-between px-4 py-2"
        style={{ borderTop: `1px dashed ${SL_DIVIDER}` }}
        onClick={() => setFeeExpanded((v) => !v)}
      >
        <div />
        <div className="flex items-center">
          {feeExpanded
            ? <ChevronUp className="w-3 h-3" style={{ color: SL_TEXT_DIM }} />
            : <ChevronDown className="w-3 h-3" style={{ color: SL_TEXT_DIM }} />}
        </div>
      </button>

      {feeExpanded && (() => {
        const interestBase = order.interest_base ? parseFloat(order.interest_base) : 0;
        const tradingFee = interestBase * 0.002;
        // 计息基数单位按 interest_base_currency 判断
        const baseUnit2 = (order.interest_base_currency || 'USDT') === 'CNY' ? '元' : 'u';
        // 天数算法与 hook 一致：北京时间自然日，开始日算第1天
        const calcDays = (startDateStr: string, endTs: number): number => {
          const startDateBJ = new Date(startDateStr + 'T00:00:00+08:00');
          const endDateBJ = new Date(endTs + 8 * 3600 * 1000);
          const startDay = new Date(startDateBJ.toISOString().slice(0, 10) + 'T00:00:00+08:00').getTime();
          const endDay = new Date(endDateBJ.toISOString().slice(0, 10) + 'T00:00:00+08:00').getTime();
          return Math.max(0, Math.floor((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1);
        };
        return (
          <div className="px-4 pb-3 space-y-1.5 text-[10px]">
            <div className="flex justify-between">
              <span style={{ color: SL_TEXT_SEC }}>计息基数</span>
              <span style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
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
              return (
                <div className="flex justify-between">
                  <span style={{ color: SL_TEXT_SEC }}>计息日期{order.interest_payment_type ? `（${({'monthly_pre':'月付先付','monthly_post':'月付后付','semi_pre':'半年付先付','semi_post':'半年付后付','annual_pre':'年付先付','annual_post':'年付后付','end_post':'结束后付','monthly_prepaid':'月付先付','monthly_postpaid':'月付后付','quarterly':'季付','maturity':'到期付'} as any)[order.interest_payment_type] || order.interest_payment_type}）` : ''}</span>
                  <span style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums' }}>{fmtBJ(s)} ~ {fmtBJ(e)}  {days}天</span>
                </div>
              );
            })()}
            <div className="flex justify-between items-center">
              <span style={{ color: SL_TEXT_SEC }}>待付利息{rateAbs ? `（年化${rateAbs}%）` : ''}</span>
              <span style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
                {rateAbs && interestBase > 0 ? (() => {
                  const endTs = order.settled_at ? new Date(order.settled_at).getTime() : Date.now();
                  const days = order.interest_start_date ? calcDays(order.interest_start_date, endTs) : null;
                  return (
                    <>
                      <span style={{ color: SL_TEXT_PRI }}>{fmt(interestBase, 0)}×{rateAbs}%÷365{days != null ? `×${days}天` : ''} = </span>
                      <span style={{ color: SL_TEXT_PRI }}>{displayAccrued > 0 ? '-' : ''}{fmt(displayAccrued, 2)} {interestUnit}</span>
                    </>
                  );
                })() : <span style={{ color: SL_TEXT_PRI }}>{displayAccrued > 0 ? '-' : ''}{fmt(displayAccrued, 2)} {interestUnit}</span>}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: SL_TEXT_SEC }}>交易手续费 (1‰买+1‰卖)</span>
              <span style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
                {tradingFee > 0 ? '-' : ''}{fmt(tradingFee, 2)} {interestUnit}
              </span>
            </div>
            <div className="flex justify-between" style={{ borderTop: `1px solid ${SL_DIVIDER}`, paddingTop: 4, marginTop: 4 }}>
              <span style={{ color: SL_TEXT_SEC }}>合计待付</span>
              <span style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {(displayAccrued + tradingFee) > 0 ? '-' : ''}{fmt(displayAccrued + tradingFee, 2)} {interestUnit}
              </span>
            </div>
          </div>
        );
      })()}
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
}: FunderOrderCardV2Props) {
  const [activeTab, setActiveTab] = useState<'detail' | 'note' | null>(null);
  const feeExpanded = activeTab === 'detail';
  const noteExpanded = activeTab === 'note';
  const toggleTab = (tab: 'detail' | 'note') => setActiveTab(v => v === tab ? null : tab);
  // 备注相关 state
  const [noteItems, setNoteItems] = useState(() => parseNotes(order.public_note || ''));
  const [noteEditingIdx, setNoteEditingIdx] = useState<number | null>(null);
  const [noteEditValue, setNoteEditValue] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const updateNoteM = trpc.ledger.funderUpdatePublicNote.useMutation();
  const saveNoteItems = async (newItems: ReturnType<typeof parseNotes>) => {
    if (!ledgerId) return;
    setNoteSaving(true);
    try {
      const raw = JSON.stringify(newItems);
      await updateNoteM.mutateAsync({ id: order.id as number, ledgerId, publicNote: raw });
      setNoteItems(newItems);
      order.public_note = raw;
    } finally { setNoteSaving(false); }
  };
  const [showInterestHistory, setShowInterestHistory] = useState(false);
  const [showCollateralInfo, setShowCollateralInfo] = useState(false);
  const interestHistoryQuery = trpc.ledger.funderGetInterestPayments.useQuery(
    { ledgerId: ledgerId ?? 0, orderId: order.id as number },
    { enabled: showInterestHistory && !!ledgerId, staleTime: 0 }
  );

  const coin = (order.coin || 'ETH') as CoinType;
  const qty = parseFloat(order.buy_quantity || '0');
  const buyPrice = parseFloat(order.buy_price || '0');
  const liveP = livePrices[coin] ?? null;

  const currentValue = liveP !== null && qty > 0 ? liveP * qty : null;
  const buyValue = qty > 0 && buyPrice > 0 ? qty * buyPrice : parseFloat(order.amount || '0');
  const floatPnl = currentValue !== null && buyValue > 0 ? currentValue - buyValue : null;
  const floatPct = floatPnl !== null && buyValue > 0 ? (floatPnl / buyValue) * 100 : null;
  const pnlColor = floatPnl === null ? SL_TEXT_SEC : floatPnl >= 0 ? SL_GREEN : SL_RED;

  const dir = priceDirection?.[coin] ?? 'same';
  const priceDiff = liveP !== null && buyPrice > 0 ? liveP - buyPrice : null;
  const priceColor = priceDiff === null ? SL_TEXT_PRI : priceDiff >= 0 ? SL_GREEN : SL_RED;

  const rateStr = String(order.interest_rate_annual || '');
  const isNegRate = rateStr.startsWith('-');
  const rateAbs = rateStr ? parseFloat(isNegRate ? rateStr.slice(1) : rateStr).toFixed(0) : '';
  const accrued = useAccruedInterestFunder(
    order.status === 'active' ? order.interest_base : null,
    order.status === 'active' ? order.interest_rate_annual : null,
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
  const effectiveCnyRate = cnyRate && cnyRate > 0 ? cnyRate : 7.25;
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
    const startDateBJ = new Date(startDateStr + 'T00:00:00+08:00');
    const endDateBJ = new Date(endTs + 8 * 3600 * 1000);
    const startDay = new Date(startDateBJ.toISOString().slice(0, 10) + 'T00:00:00+08:00').getTime();
    const endDay = new Date(endDateBJ.toISOString().slice(0, 10) + 'T00:00:00+08:00').getTime();
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

  const isStock = order.asset_type === 'stock';
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
      className="rounded-2xl overflow-hidden silver-card"
      style={{
        position: 'relative',
        background: isStock ? GOLD_BG : SL_BG,
        border: isStock ? GOLD_BORDER : SL_BORDER,
        boxShadow: isStock ? GOLD_SHADOW : SL_SHADOW,
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
            background: isStock
              ? 'radial-gradient(circle at 35% 35%, #fff8d0 0%, #e8c050 35%, #a07010 65%, #6a4800 100%)'
              : SL_RIVET_BG,
            boxShadow: isStock
              ? '0 1px 2px rgba(0,0,0,0.55), inset 0 1px 1px rgba(255,240,140,0.9)'
              : '0 1px 2px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.8)',
          }}
        />
      ))}

      {/* ── 行1：名字 | 开仓日期 | 当前币价 + 订单号 ── */}
      <div className="flex items-center px-4 pt-3 pb-2" style={{ borderBottom: `1px solid ${SL_DIVIDER}` }}>
        <div className="flex items-center text-xs" style={{ color: SL_TEXT_SEC, gap: 0 }}>
          {(() => {
            const ownerName = order.owner_label || (() => {
              const m = (membersData as any[])?.find((m: any) => m.userId === order.user_id);
              return m ? (m.nickname || m.username) : null;
            })();
            const buyDateStr = order.buy_date ? fmtDate(order.buy_date) : null;
            const brokerStr = order.asset_type === 'stock'
              ? [order.broker_name, order.broker_account].filter(Boolean).join(' ')
              : null;
            const items = [ownerName, buyDateStr, brokerStr].filter(Boolean);
            // 当前币价（带红绿色+闪烁箭头）
            const priceDiff2 = liveP !== null && buyPrice > 0 ? liveP - buyPrice : null;
            const livePriceColor = priceDiff2 === null ? SL_TEXT_PRI : priceDiff2 >= 0 ? SL_GREEN : SL_RED;
            return (
              <>
                {items.map((item, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span style={{ color: SL_TEXT_DIM, margin: '0 6px' }}>|</span>}
                    <span style={{ color: i === 0 ? SL_TEXT_PRI : SL_TEXT_SEC, fontWeight: i === 0 ? 500 : 400 }}>{item}</span>
                  </React.Fragment>
                ))}
                {coin !== 'CNY' && coin !== 'USDT' && (
                  <>
                    <span style={{ color: SL_TEXT_DIM, margin: '0 6px' }}>|</span>
                    <span className="flex items-center gap-0.5" style={{ color: livePriceColor, fontWeight: 500 }}>
                      {dir === 'up' && <span className="text-[10px] inline-flex items-center" style={{ color: SL_RED, animation: 'price-blink 1.5s ease-in-out infinite', lineHeight: 1 }}>▲</span>}
                      {dir === 'down' && <span className="text-[10px] inline-flex items-center" style={{ color: SL_GREEN, animation: 'price-blink 1.5s ease-in-out infinite', lineHeight: 1 }}>▼</span>}
                      <span>{coin}</span>
                      <span style={{ marginLeft: '3px' }}>{liveP != null ? liveP.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}</span>
                    </span>
                  </>
                )}
              </>
            );
          })()}
        </div>
        {order.order_no && (
          <span className="ml-auto text-[10px] font-mono" style={{ color: SL_TEXT_DIM, letterSpacing: '0.05em' }}>
            {order.order_no}
          </span>
        )}
      </div>

      {/* ── 行2：应收利息大字（左）+ 年化利率（右）── */}
      <div className="flex gap-0 px-5 py-3" style={{ borderBottom: `1px solid ${SL_DIVIDER}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="text-[10px] mb-1" style={{ color: SL_TEXT_SEC }}>应收利息 ({interestUnit})</div>
          <div style={{ lineHeight: 1, display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 700, color: LN_EARN, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', textShadow: SL_TEXT_SHADOW_LG }}>
              {displayAccrued > 0 ? '+' : ''}{fmt(displayAccrued, 2)}
            </span>
            <span className="text-[10px]" style={{ color: SL_TEXT_SEC, whiteSpace: 'nowrap' }}>
              ≈{approxAccrued > 0 ? approxAccrued.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '--'} {approxUnit}
            </span>
          </div>
        </div>
        <div className="text-right" style={{ flex: 1 }}>
          <div className="text-[10px] mb-1" style={{ color: SL_TEXT_SEC, textShadow: SL_TEXT_ENGRAVE }}>年化利率</div>
          <div style={{ lineHeight: 1 }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: SL_TEXT_ENGRAVE_LG }}>
              {rateAbs ? `${rateAbs}%` : '--'}
            </span>
          </div>
        </div>
      </div>

      {/* ── 行2.5：今日/本月/全年利息折算 ── */}
      {rateAbs && parseFloat(order.interest_base || '0') > 0 && (() => {
        // 计息基数单位是baseCur，先算出baseCur单位的利息，再用convertAccrued换算成显示单位
        const base = parseFloat(order.interest_base!);
        const rate = rateAbs / 100;
        const dailyRaw = base * rate / 365;
        const monthlyRaw = base * rate / 12;
        const yearlyRaw = base * rate;
        const daily = convertAccrued(dailyRaw);
        const monthly = convertAccrued(monthlyRaw);
        const yearly = convertAccrued(yearlyRaw);
        const fmtSmall = (n: number) => n >= 0.01 ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : n.toFixed(4);
        return (
          <div className="grid grid-cols-3 gap-0 px-4 py-2" style={{ fontFamily: SL_NUM_FONT, borderBottom: `1px solid ${SL_DIVIDER}` }}>
            <div>
              <div className="text-[10px] mb-0.5" style={{ color: SL_TEXT_SEC, textShadow: SL_TEXT_SHADOW }}>今日利息 ({interestUnit})</div>
              <div className="text-sm font-semibold" style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: SL_TEXT_SHADOW }}>{fmtSmall(daily)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] mb-0.5" style={{ color: SL_TEXT_SEC, textShadow: SL_TEXT_SHADOW }}>整月利息 ({interestUnit})</div>
              <div className="text-sm font-semibold" style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: SL_TEXT_SHADOW }}>{fmtSmall(monthly)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] mb-0.5" style={{ color: SL_TEXT_SEC, textShadow: SL_TEXT_SHADOW }}>全年利息 ({interestUnit})</div>
              <div className="text-sm font-semibold" style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: SL_TEXT_SHADOW }}>{fmtSmall(yearly)}</div>
            </div>
          </div>
        );
      })()}

      {/* ── 行3：计息基数 / 计息天数 / 担保缺口 ── */}
      <div className="grid grid-cols-3 gap-0 px-4 py-2" style={{ fontFamily: SL_NUM_FONT }}>
        <div>
          <div className="text-[10px] mb-0.5" style={{ color: SL_TEXT_SEC, textShadow: SL_TEXT_SHADOW }}>计息基数 ({baseUnit})</div>
          <div className="text-sm font-semibold" style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: SL_TEXT_SHADOW }}>
            {order.interest_base ? fmt(parseFloat(order.interest_base), 0) : '--'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] mb-0.5" style={{ color: SL_TEXT_SEC, textShadow: SL_TEXT_SHADOW }}>计息天数 (天)</div>
          <div className="text-sm font-semibold" style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums', textShadow: SL_TEXT_SHADOW }}>
            {order.interest_start_date
              ? calcDays(order.interest_start_date, order.settled_at ? new Date(order.settled_at).getTime() : Date.now())
              : '--'}
          </div>
        </div>
        <div className="text-right">
          {showField('collateral') ? (
            <>
              <div className="text-[10px] mb-0.5" style={{ color: SL_TEXT_SEC, textShadow: SL_TEXT_SHADOW }}>担保缺口</div>
              <div className="text-sm font-semibold" style={{ textShadow: SL_TEXT_SHADOW, color: collateralGap === null ? SL_TEXT_SEC : collateralGap >= 0 ? LN_EARN : '#16A34A' }}>
                {collateralGap !== null ? (collateralGap >= 0 ? '充足' : '不足') : '--'}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Tab 栏：详情 | 备注 ── */}
      <div className="flex" style={{ borderTop: `1px dashed ${SL_DIVIDER}` }}>
        <button
          className="flex-1 flex items-center justify-center gap-1 py-2"
          style={{ borderRight: `1px dashed ${SL_DIVIDER}`, background: feeExpanded ? 'rgba(0,0,0,0.03)' : 'transparent' }}
          onClick={() => toggleTab('detail')}
        >
          <span style={{ color: feeExpanded ? SL_TEXT_PRI : SL_TEXT_DIM, fontSize: '0.7rem', fontWeight: feeExpanded ? 600 : 400 }}>详情</span>
          {feeExpanded
            ? <ChevronUp className="w-3 h-3" style={{ color: SL_TEXT_DIM }} />
            : <ChevronDown className="w-3 h-3" style={{ color: SL_TEXT_DIM }} />}
        </button>
        <button
          className="flex-1 flex items-center justify-center gap-1 py-2"
          style={{ background: noteExpanded ? 'rgba(0,0,0,0.03)' : 'transparent' }}
          onClick={() => toggleTab('note')}
        >
          <span style={{ color: noteExpanded ? SL_TEXT_PRI : SL_TEXT_DIM, fontSize: '0.7rem', fontWeight: noteExpanded ? 600 : 400 }}>备注</span>
          {(() => { const cnt = parseNotes(order.public_note || '').length; return cnt > 0 ? <span style={{ color: SL_TEXT_DIM, fontSize: '0.65rem' }}>({cnt})</span> : null; })()}
          {noteExpanded
            ? <ChevronUp className="w-3 h-3" style={{ color: SL_TEXT_DIM }} />
            : <ChevronDown className="w-3 h-3" style={{ color: SL_TEXT_DIM }} />}
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
              <span style={{ color: SL_TEXT_SEC }}>计息基数</span>
              <span style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
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
                  <span style={{ color: SL_TEXT_SEC }}>计息日期（{fmtBJ(s)}）</span>
                  <span style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums' }}>{fmtBJ(s)} ~ {fmtBJ(e)}  {days}天</span>
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
              <span style={{ color: SL_TEXT_SEC }}>待收利息{rateAbs ? `（年化${rateAbs}%）` : ''}</span>
              <span style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
                {rateAbs && interestBase > 0 ? (() => {
                  const endTs = order.settled_at ? new Date(order.settled_at).getTime() : Date.now();
                  const days = order.interest_start_date ? calcDays(order.interest_start_date, endTs) : null;
                  return (
                    <>
                      <span style={{ color: SL_TEXT_PRI }}>{fmt(interestBase, 0)}×{rateAbs}%÷365{days != null ? `×${days}天` : ''} = </span>
                      <span style={{ color: SL_TEXT_PRI }}>{fmt(displayAccrued, 2)} {interestUnit}</span>
                    </>
                  );
                })() : <span style={{ color: SL_TEXT_PRI }}>{fmt(displayAccrued, 2)} {interestUnit}</span>}
              </span>
            </div>
            {/* 合计应收 = 待收利息 - 已结利息 */}
            {(() => {
              const net = displayAccrued - displayPaid;
              const label = net >= 0 ? '待收利息' : '超收利息';
              const numColor = net >= 0 ? LN_EARN : '#16A34A';
              return (
                <div className="flex justify-between" style={{ borderTop: `1px solid ${SL_DIVIDER}`, paddingTop: 4, marginTop: 4 }}>
                  <span style={{ color: SL_TEXT_SEC }}>合计应收</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '0.85rem' }}>
                    <span style={{ color: SL_TEXT_PRI, fontSize: '0.7rem', fontWeight: 500, marginRight: 3, opacity: 0.85 }}>{label}</span>
                    <span style={{ color: numColor }}>{fmt(Math.abs(net), 2)} {interestUnit}</span>
                  </span>
                </div>
              );
            })()}

            {/* ── 担保物块 ── */}
            <div style={{ borderTop: `1px solid ${SL_DIVIDER}`, marginTop: 6, paddingTop: 6 }}>
              {/* 持有资产 */}
              {qty > 0 && (
                <div className="flex justify-between mb-1">
                  <span style={{ color: SL_TEXT_SEC }}>持有资产</span>
                  <span style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums' }}>{buyPrice > 0 ? `（开仓价 ${fmt(buyPrice, 0)} U） ${fmtQty(qty)} ${coin}` : `${fmtQty(qty)} ${coin}`}</span>
                </div>
              )}
              {/* 担保资产 */}
              {collateralAssets.length > 0 && (
                <div className="flex justify-between mb-1">
                  <span style={{ color: SL_TEXT_SEC }}>担保资产</span>
                  <span style={{ color: SL_TEXT_PRI }}>{collateralAssets.map((c) => `${c.qty} ${c.coin}`).join(' + ')}</span>
                </div>
              )}
              {/* 担保价值 */}
              {showField('collateral') && collateralValue !== null && (
                <div className="flex justify-between mb-1">
                  <span style={{ color: SL_TEXT_SEC }}>担保价值</span>
                  <span style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums' }}>{fmt(collateralValue, 2)} U</span>
                </div>
              )}
              {/* 担保缺口 */}
              {showField('collateral') && collateralGap !== null && (
                <>
                  {/* 弹出说明窗 */}
                  {showCollateralInfo && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowCollateralInfo(false)}>
                      <div className="rounded-2xl p-5 mx-4 w-full max-w-xs" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-bold" style={{ color: '#1A2340' }}>担保缺口计算说明</span>
                          <button onClick={() => setShowCollateralInfo(false)} className="text-gray-400 text-lg leading-none">×</button>
                        </div>
                        <div className="text-xs space-y-2.5" style={{ color: '#4B5563' }}>
                          <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                            <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>① 浮动盈亏</div>
                            <div>= 当前市值 - 计息基数（正数为浮盈，负数为亏损）</div>
                            <div className="mt-1 font-mono">
                              {floatPnl !== null
                                ? <><span style={{ color: '#3B82F6' }}>= {(liveP! * qty).toFixed(2)} - {buyValue.toFixed(2)} = </span><strong style={{ color: floatPnl >= 0 ? '#DC2626' : '#16A34A' }}>{floatPnl >= 0 ? '+' : ''}{floatPnl.toFixed(2)} u{floatPnl >= 0 ? '（浮盈）' : '（亏损）'}</strong></>
                                : <span className="text-gray-400">当前市值暂无实时价格，暂无法计算浮动盈亏</span>
                              }
                            </div>
                          </div>
                          <div className="p-2.5 rounded-lg" style={{ background: '#F0F4FF' }}>
                            <div className="font-semibold mb-1" style={{ color: '#1A2340' }}>② 担保价值</div>
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
                          <div className="p-2.5 rounded-lg" style={{ background: isSufficient ? '#FFF1F1' : '#F0FDF4' }}>
                            <div className="font-semibold mb-1" style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>③ 风险敞口</div>
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
                              })()
                              }
                            </div>
                            <div className="mt-1.5" style={{ color: isSufficient ? '#DC2626' : '#16A34A' }}>
                              {isSufficient
                                ? `担保物充足，还有 ${collateralGap!.toFixed(2)} U 的余量空间`
                                : `担保物不足，还需补充 ${Math.abs(collateralGap!).toFixed(2)} U 才能覆盖风险`
                              }
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between mb-1 items-center">
                    <span className="flex items-center gap-1" style={{ color: SL_TEXT_SEC }}>
                      担保缺口
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setShowCollateralInfo(true); }}
                        className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold leading-none"
                        style={{ backgroundColor: '#E5E7EB', color: '#6B7280', border: 'none', cursor: 'pointer', lineHeight: 1 }}
                      >?</button>
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ color: SL_TEXT_PRI, fontSize: '0.7rem', fontWeight: 500, marginRight: 3, opacity: 0.85 }}>{isSufficient ? '充足' : '不足'}</span>
                      <span style={{ color: isSufficient ? LN_EARN : '#16A34A' }}>{isSufficient ? '+' : ''}{fmt(collateralGap, 2)} U</span>
                    </span>
                  </div>
                </>
              )}
            </div>

          </div>
        );
      })()}

      {/* ── 备注展开区 ── */}
      {noteExpanded && (
        <div className="px-4 pb-3 pt-2 text-xs" style={{ borderTop: `1px dashed ${SL_DIVIDER}` }} onClick={e => e.stopPropagation()}>
          {/* 备注列表 */}
          {noteItems.length === 0 && noteEditingIdx === null && (
            <div style={{ color: SL_TEXT_DIM }} className="py-1">暂无备注</div>
          )}
          {noteItems.map((note, idx) => (
            <div key={idx}>
              {idx > 0 && <div style={{ borderTop: `1px solid ${SL_DIVIDER}` }} className="my-1.5" />}
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
                      if (finalAvatar) return <img src={finalAvatar} alt="" className="w-6 h-6 rounded-full object-cover" style={{ border: `1px solid ${SL_DIVIDER}` }} />;
                      if (!name) return <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#E5E7EB' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>;
                      const initials = name.slice(0, 1).toUpperCase();
                      const colors = ['#6366F1','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6'];
                      const color = colors[name.charCodeAt(0) % colors.length] || '#6366F1';
                      return <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: color }}>{initials}</div>;
                    })()}
                  </div>
                  {/* 右侧内容 */}
                  <div className="flex-1 min-w-0">
                    {note.time && <div className="text-[10px] mb-0.5" style={{ color: SL_TEXT_DIM }}>{formatNoteTime(note.time)}</div>}
                    <div className="break-all" style={{ color: SL_TEXT_PRI, fontSize: '11px', lineHeight: '1.5' }}>{note.text}</div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {/* 添加备注按鈕 */}
          <div style={{ borderTop: noteItems.length > 0 ? `1px solid ${SL_DIVIDER}` : 'none' }} className="mt-1 pt-1">
            <button
              type="button"
              onClick={() => {
                const newItems = [...noteItems, { text: '', time: new Date().toISOString() }];
                setNoteItems(newItems);
                setNoteEditingIdx(newItems.length - 1);
                setNoteEditValue('');
              }}
              className="flex items-center gap-1"
              style={{ color: '#9CA3AF' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              <span style={{ fontSize: '11px' }}>添加备注</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


