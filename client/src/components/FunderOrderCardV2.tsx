// FunderOrderCardV2 —— OKX 深色风格订单卡片（资产感优先，服务费弱化）
// 仅用于对比展示，不影响原有 FunderOrderCard
import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  COIN_COLORS,
  CoinType,
  fmtDate,
  formatCoinQtyFunder,
  useAccruedInterestFunder,
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
              {order.interest_payment_type === "end_post" ? "结束后付" : order.interest_payment_type || "--"}
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
              {order.interest_payment_type === "end_post" ? "结束后付" : order.interest_payment_type || "--"}
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
// 凸起金属字效果：下方白色高光 + 上方暗色压影
const SL_TEXT_SHADOW = '0 1px 0 rgba(255,255,255,0.75), 0 -0.5px 0 rgba(0,0,0,0.25)';
// 大字加强版
const SL_TEXT_SHADOW_LG = '0 1.5px 0 rgba(255,255,255,0.80), 0 -1px 0 rgba(0,0,0,0.30), 0 2px 3px rgba(0,0,0,0.15)';
const SL_TEXT_SEC = 'rgba(0,0,0,0.45)';
const SL_TEXT_DIM = 'rgba(0,0,0,0.38)';  // 弱化但在銀色背景上可见
const SL_GOLD = SL_TEXT_PRI;     // 去掉金色，改用主文字色
const SL_DIVIDER = 'rgba(0,0,0,0.08)';
const SL_GREEN = '#A80000';      // 涨 = 深红（中国习惯）
const SL_RED = '#16A34A';        // 跌 = 深绿

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

  return (
    <div
      className="rounded-2xl overflow-hidden silver-card"
      style={{
        position: 'relative',
        background: SL_BG,
        border: SL_BORDER,
        boxShadow: SL_SHADOW,
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
            background: SL_RIVET_BG,
            boxShadow: '0 1px 2px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.8)',
          }}
        />
      ))}

      {/* ── 行1：标签行 ── */}
      <div className="flex items-center px-4 pt-3 pb-2" style={{ borderBottom: `1px solid ${SL_DIVIDER}` }}>
        {/* 左侧：竖线分隔的标签组 */}
        <div className="flex items-center text-xs" style={{ color: SL_TEXT_SEC, gap: 0 }}>
          {(() => {
            const ownerName = order.owner_label || (() => {
              const m = (membersData as any[])?.find((m: any) => m.userId === order.user_id);
              return m ? (m.nickname || m.username) : null;
            })();
            const items = [
              ownerName,
            ].filter(Boolean);
            return items.map((item, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ color: SL_TEXT_DIM, margin: '0 6px' }}>|</span>}
                <span style={{ color: i === 0 ? SL_TEXT_PRI : SL_TEXT_SEC, fontWeight: i === 0 ? 500 : 400 }}>{item}</span>
              </React.Fragment>
            ));
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
        {/* 持有数量：占 40% */}
        <div style={{ flex: '0 0 40%' }}>
          <div className="text-[10px] mb-1" style={{ color: SL_TEXT_SEC }}>持有数量 ({coin})</div>
          <div style={{ lineHeight: 1 }}>
            <span style={{ fontSize: '1.6rem', fontWeight: 700, color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', textShadow: SL_TEXT_SHADOW_LG }}>
              {fmt(qty, 2)}
            </span>
          </div>
        </div>

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
          {/* 涨跌幅合并到浮动盈亏列 */}
          {floatPct != null && (
            <div className="text-[9px] mt-0.5" style={{ color: pnlColor, fontFamily: SL_NUM_FONT, fontVariantNumeric: 'tabular-nums' }}>
              {floatPct >= 0 ? '+' : ''}{floatPct.toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      {/* ── 行3：次要数据行（3列）── */}
      <div className="grid grid-cols-3 gap-0 px-4 py-2" style={{ fontFamily: SL_NUM_FONT }}>
        <div>
          <div className="text-[10px] mb-0.5" style={{ color: SL_TEXT_SEC }}>当前市値 (U)</div>
          <div className="text-sm" style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
            {currentValue != null ? fmt(currentValue, 0) : '--'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] mb-0.5" style={{ color: SL_TEXT_SEC }}>开仓日期</div>
          <div className="text-sm" style={{ color: SL_TEXT_PRI }}>
            {order.buy_date ? fmtDate(order.buy_date) : '--'}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] mb-0.5" style={{ color: SL_TEXT_SEC }}>担保资产</div>
          <div className="text-sm" style={{ color: SL_TEXT_PRI }}>
            {collateralAssets.length > 0 ? collateralAssets.map((c) => `${c.qty} ${c.coin}`).join(' + ') : '--'}
          </div>
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
        const tradingFee = interestBase * 0.002; // 千分之一买 + 千分之一卖 = 千分之二
        return (
          <div className="px-4 pb-3 space-y-1.5 text-[10px]">
            <div className="flex justify-between">
              <span style={{ color: SL_TEXT_SEC }}>计息基数</span>
              <span style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
                {buyPrice > 0 && qty > 0
                  ? `${fmt(buyPrice, 0)}(U) × ${fmt(qty, qty % 1 === 0 ? 0 : 2)}(${coin}) = ${fmt(interestBase, 0)} ${interestUnit}`
                  : interestBase ? `${fmt(interestBase, 0)} ${interestUnit}` : '--'
                }
              </span>
            </div>
            {order.interest_start_date && (() => {
              // 计息日期起止（北京时间）
              const startD = new Date(order.interest_start_date + 'T00:00:00+08:00');
              const endD = order.settled_at ? new Date(order.settled_at) : new Date();
              const toBeijing = (d: Date) => {
                const bjOffset = 8 * 60;
                const local = new Date(d.getTime() + (bjOffset - (-d.getTimezoneOffset())) * 60000);
                return local;
              };
              const s = toBeijing(startD);
              const e = toBeijing(endD);
              const fmtBJ = (d: Date) => {
                const yy = String(d.getFullYear()).slice(2);
                return `${yy}年${d.getMonth()+1}月${d.getDate()}日`;
              };
              const days = Math.ceil((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24));
              return (
                <div className="flex justify-between">
                  <span style={{ color: SL_TEXT_SEC }}>计息日期{order.interest_payment_type ? `（${order.interest_payment_type === 'end_post' ? '结束后付' : order.interest_payment_type}）` : ''}</span>
                  <span style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums' }}>{fmtBJ(s)} ~ {fmtBJ(e)}  {days}天</span>
                </div>
              );
            })()}
            <div className="flex justify-between items-center">
              <span style={{ color: SL_TEXT_SEC }}>待付利息{rateAbs ? `（年化${rateAbs}%）` : ''}</span>
              <span style={{ color: SL_TEXT_PRI, fontVariantNumeric: 'tabular-nums' }}>
                {rateAbs && interestBase > 0 ? (() => {
                  const endTs = order.settled_at ? new Date(order.settled_at).getTime() : Date.now();
                  const startTs = order.interest_start_date ? new Date(order.interest_start_date + 'T00:00:00').getTime() : null;
                  const days = startTs ? Math.ceil((endTs - startTs) / (1000 * 60 * 60 * 24)) : null;
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
