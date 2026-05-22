/**
 * OrderFlowPage.tsx
 * 订单流管理页面
 * - 黑色主题，与智能仓位管理风格一致
 * - 每张订单卡片：主/次/辅三层信息层次
 * - 实时抓取 ETH 最新价（3秒刷新）
 * - 自动计算：交易成本、实时盈亏、资金费率累计
 * - 支持现货/永续合约、VIP等级、市价/限价挂单
 */
import React, { useState, useEffect, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import {
  ChevronLeft,
  ChevronDown,
  Plus,
  TrendingUp,
  TrendingDown,
  X,
  Check,
  Pencil,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

// ===== 工具函数 =====
function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return "--";
  return n.toLocaleString("zh-CN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "--";
  const sign = n >= 0 ? "+" : "";
  return sign + (n * 100).toFixed(3) + "%";
}
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ===== OKX 手续费费率表（2026年最新）=====
// 现货 Spot: [Maker, Taker]
const SPOT_FEE: Record<string, [number, number]> = {
  "普通": [0.0008, 0.0010],
  "VIP1": [0.000675, 0.0008],
  "VIP2": [0.0006, 0.0007],
  "VIP3": [0.00055, 0.00065],
  "VIP4": [0.0003, 0.00045],
  "VIP5": [0.00025, 0.00035],
  "VIP6": [0.0000, 0.0003],
  "VIP7": [-0.00002, 0.00025],
  "VIP8": [-0.00005, 0.0002],
  "VIP9": [-0.000075, 0.000175],
};

// 合约 Perpetual/Futures 分组1: [Maker, Taker]
const PERP_FEE: Record<string, [number, number]> = {
  "普通": [0.0002, 0.0005],
  "VIP1": [0.00016, 0.00045],
  "VIP2": [0.00015, 0.00036],
  "VIP3": [0.0001, 0.00028],
  "VIP4": [0.00008, 0.00027],
  "VIP5": [0.00005, 0.00026],
  "VIP6": [0.0000, 0.00025],
  "VIP7": [-0.00002, 0.0002],
  "VIP8": [-0.00005, 0.0002],
  "VIP9": [-0.00005, 0.00015],
};

const VIP_LEVELS = ["普通", "VIP1", "VIP2", "VIP3", "VIP4", "VIP5", "VIP6", "VIP7", "VIP8", "VIP9"];

function getFeeRate(
  marketType: "spot" | "perp",
  vipLevel: string,
  orderType: "maker" | "taker"
): number {
  const table = marketType === "spot" ? SPOT_FEE : PERP_FEE;
  const rates = table[vipLevel] ?? table["普通"];
  return orderType === "maker" ? rates[0] : rates[1];
}

// ===== 计算订单 =====
interface OrderCalc {
  notional: number;
  margin: number;
  openFee: number;
  closeFee: number;
  totalFee: number;
  pnl: number | null;
  pnlPct: number | null;
  fundingCost: number | null;
  breakEven: number;
  feeRate: number;
}

function calcOrder(
  order: any,
  currentPrice: number | null,
  fundingRate: number | null
): OrderCalc {
  const entry = parseFloat(order.entry_price);
  const qty = parseFloat(order.quantity);
  const lev = order.leverage || 1;
  const direction = order.direction as "long" | "short";
  const marketType: "spot" | "perp" = order.market_type === "spot" ? "spot" : "perp";
  const vipLevel: string = order.vip_level || "普通";
  const orderType: "maker" | "taker" = order.order_type === "maker" ? "maker" : "taker";

  const feeRate = getFeeRate(marketType, vipLevel, orderType);
  const effectiveFeeRate = Math.max(0, feeRate); // 负费率（返佣）视为0成本

  const notional = entry * qty;
  const margin = marketType === "spot" ? notional : notional / lev;
  const openFee = notional * effectiveFeeRate;

  const closePrice = order.exit_price
    ? parseFloat(order.exit_price)
    : currentPrice;

  let closeFee = 0;
  let pnl: number | null = null;
  let pnlPct: number | null = null;

  if (closePrice && closePrice > 0) {
    const closeNotional = closePrice * qty;
    const closeFeeRate = Math.max(0, getFeeRate(marketType, vipLevel, orderType));
    closeFee = closeNotional * closeFeeRate;
    const rawPnl =
      direction === "long"
        ? (closePrice - entry) * qty
        : (entry - closePrice) * qty;
    pnl = rawPnl - openFee - closeFee;
    pnlPct = margin > 0 ? pnl / margin : null;
  }

  const totalFee = openFee + closeFee;

  // 资金费率成本（仅永续合约，每8小时一次）
  let fundingCost: number | null = null;
  if (marketType === "perp" && fundingRate != null) {
    const entryDate = new Date(order.entry_date);
    const now = new Date();
    const diffMs = now.getTime() - entryDate.getTime();
    const diffHours = Math.max(0, diffMs / (1000 * 60 * 60));
    const periods = Math.floor(diffHours / 8);
    fundingCost = periods * fundingRate * notional;
    if (direction === "short") fundingCost = -fundingCost;
  }

  // 盈亏平衡价（含手续费）
  const breakEven =
    direction === "long"
      ? entry * (1 + effectiveFeeRate * 2)
      : entry * (1 - effectiveFeeRate * 2);

  return { notional, margin, openFee, closeFee, totalFee, pnl, pnlPct, fundingCost, breakEven, feeRate };
}

// ===== 表单数据类型 =====
interface OrderFormData {
  symbol: string;
  direction: "long" | "short";
  marketType: "spot" | "perp";
  orderType: "maker" | "taker";
  vipLevel: string;
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  leverage: string;
  takeProfit: string;
  stopLoss: string;
  entryDate: string;
  exitDate: string;
  status: "open" | "closed";
  note: string;
}

const defaultForm = (): OrderFormData => ({
  symbol: "ETHUSDT",
  direction: "long",
  marketType: "perp",
  orderType: "taker",
  vipLevel: "普通",
  entryPrice: "",
  exitPrice: "",
  quantity: "",
  leverage: "1",
  takeProfit: "",
  stopLoss: "",
  entryDate: todayStr(),
  exitDate: "",
  status: "open",
  note: "",
});

// ===== 主页面 =====
export default function OrderFlowPage() {
  const [, params] = useRoute("/ledger/:id/order-flow");
  const [, setLocation] = useLocation();
  const ledgerId = params ? parseInt(params.id) : 0;
  const { isAuthenticated } = useAuth();

  // 实时价格（3秒刷新）
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, {
    refetchInterval: 3000,
    staleTime: 1000,
  });
  useEffect(() => {
    const ethPrice = (cryptoPricesRaw as any)?.prices?.ETH ?? (cryptoPricesRaw as any)?.ETH;
    if (ethPrice && ethPrice > 0) setCurrentPrice(ethPrice);
  }, [cryptoPricesRaw]);

  // 最新资金费率
  const [fundingRate, setFundingRate] = useState<number | null>(null);
  const { data: fundingRateData } = trpc.orderFlow.getLatestFundingRate.useQuery(
    { symbol: "ETHUSDT" },
    { refetchInterval: 60000, staleTime: 30000 }
  );
  useEffect(() => {
    if (fundingRateData?.rate != null) setFundingRate(fundingRateData.rate);
  }, [fundingRateData]);

  // 订单列表
  const utils = trpc.useUtils();
  const { data: orders = [], isLoading } = trpc.orderFlow.getOrders.useQuery(
    { ledgerId, status: "all" },
    { enabled: isAuthenticated && ledgerId > 0 }
  );

  const addOrderMutation = trpc.orderFlow.addOrder.useMutation({
    onSuccess: async () => {
      await utils.orderFlow.getOrders.invalidate({ ledgerId });
      setShowForm(false);
      setForm(defaultForm());
    },
  });
  const updateOrderMutation = trpc.orderFlow.updateOrder.useMutation({
    onSuccess: async () => {
      await utils.orderFlow.getOrders.invalidate({ ledgerId });
      setEditingId(null);
      setForm(defaultForm());
      setShowForm(false);
    },
  });
  const deleteOrderMutation = trpc.orderFlow.deleteOrder.useMutation({
    onSuccess: () => utils.orderFlow.getOrders.invalidate({ ledgerId }),
  });

  // UI 状态
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<OrderFormData>(defaultForm());
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "closed">("all");

  const filteredOrders = useMemo(() => {
    if (filterStatus === "all") return orders as any[];
    return (orders as any[]).filter((o: any) => o.status === filterStatus);
  }, [orders, filterStatus]);

  function openEdit(order: any) {
    setForm({
      symbol: order.symbol || "ETHUSDT",
      direction: order.direction || "long",
      marketType: order.market_type || "perp",
      orderType: order.order_type || "taker",
      vipLevel: order.vip_level || "普通",
      entryPrice: String(order.entry_price || ""),
      exitPrice: order.exit_price ? String(order.exit_price) : "",
      quantity: String(order.quantity || ""),
      leverage: String(order.leverage || 1),
      takeProfit: order.take_profit ? String(order.take_profit) : "",
      stopLoss: order.stop_loss ? String(order.stop_loss) : "",
      entryDate: order.entry_date || todayStr(),
      exitDate: order.exit_date || "",
      status: order.status || "open",
      note: order.note || "",
    });
    setEditingId(order.id);
    setShowForm(true);
  }

  function handleSubmit() {
    const entryPrice = parseFloat(form.entryPrice);
    const quantity = parseFloat(form.quantity);
    const leverage = parseInt(form.leverage) || 1;
    if (!entryPrice || !quantity) return;

    const payload = {
      ledgerId,
      symbol: form.symbol,
      direction: form.direction,
      marketType: form.marketType,
      orderType: form.orderType,
      vipLevel: form.vipLevel,
      entryPrice,
      quantity,
      leverage,
      takeProfit: form.takeProfit ? parseFloat(form.takeProfit) : undefined,
      stopLoss: form.stopLoss ? parseFloat(form.stopLoss) : undefined,
      entryDate: form.entryDate,
      note: form.note || undefined,
    };

    if (editingId != null) {
      updateOrderMutation.mutate({
        id: editingId,
        ...payload,
        exitPrice: form.exitPrice ? parseFloat(form.exitPrice) : undefined,
        exitDate: form.exitDate || undefined,
        status: form.status,
        note: form.note || null,
      });
    } else {
      addOrderMutation.mutate(payload);
    }
  }

  // 颜色常量
  const GOLD_GRAD = "linear-gradient(180deg, #f0f0f0 0%, #c8c8c8 30%, #a0a0a0 60%, #d0d0d0 100%)";
  const BORDER_DIM = "rgba(192,192,192,0.18)";
  const BTN_STYLE = { backgroundColor: "rgba(192,192,192,0.08)", color: "#c0c0c0", border: `1px solid ${BORDER_DIM}` };

  // 当前费率预览
  const previewFeeRate = getFeeRate(form.marketType, form.vipLevel, form.orderType);

  return (
    <div
      className="min-h-screen pb-24 max-w-md mx-auto relative"
      style={{ background: "#000000", overflowX: "hidden", touchAction: "pan-y" }}
    >
      {/* ===== 顶部导航 ===== */}
      <div
        className="sticky top-0 z-20 flex items-center px-4 py-3"
        style={{ background: "#000000", borderBottom: `1px solid ${BORDER_DIM}` }}
      >
        <button
          onClick={() => setLocation(`/ledger/${ledgerId}/position-calc`)}
          className="w-8 h-8 rounded-full flex items-center justify-center mr-3 flex-shrink-0"
          style={BTN_STYLE}
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </button>

        <div className="flex-1 min-w-0">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/position-calc`)}
            className="flex items-center gap-1 font-semibold text-base"
            style={{
              letterSpacing: "0.05em",
              background: GOLD_GRAD,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.8))",
            }}
          >
            <img
              src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/icons/eth-circle-icon.webp"
              alt="ETH"
              className="w-5 h-5 object-contain rounded-full flex-shrink-0"
            />
            <span>订单流管理</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" style={{ WebkitTextFillColor: "#a0a0a0" }} />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {currentPrice && (
            <span className="text-sm font-mono" style={{ color: "#e0c060" }}>
              ${fmt(currentPrice, 1)}
            </span>
          )}
          <button
            onClick={() => { setEditingId(null); setForm(defaultForm()); setShowForm(true); }}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.4)" }}
          >
            <Plus className="w-4 h-4 text-blue-400" />
          </button>
        </div>
      </div>

      {/* ===== 状态过滤 Tab ===== */}
      <div className="flex gap-2 px-4 pt-3 pb-2 items-center">
        {(["all", "open", "closed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className="px-3 py-1 rounded-full text-xs font-medium transition-all"
            style={
              filterStatus === s
                ? { backgroundColor: "rgba(59,130,246,0.25)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.5)" }
                : { backgroundColor: "rgba(255,255,255,0.05)", color: "#666", border: "1px solid rgba(255,255,255,0.1)" }
            }
          >
            {s === "all" ? "全部" : s === "open" ? "持仓中" : "已平仓"}
          </button>
        ))}
        <span className="ml-auto text-xs" style={{ color: "#555" }}>
          {filteredOrders.length} 笔
        </span>
      </div>

      {/* ===== 订单卡片列表 ===== */}
      <div className="px-3 space-y-3 pb-4">
        {isLoading && (
          <div className="text-center py-12 text-sm" style={{ color: "#555" }}>加载中...</div>
        )}
        {!isLoading && filteredOrders.length === 0 && (
          <div className="text-center py-16">
            <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-20" style={{ color: "#888" }} />
            <p className="text-sm" style={{ color: "#555" }}>暂无订单，点击右上角 + 新增</p>
          </div>
        )}

        {filteredOrders.map((order: any) => {
          const calc = calcOrder(order, currentPrice, fundingRate);
          const isLong = order.direction === "long";
          const isOpen = order.status === "open";
          const isPerp = order.market_type !== "spot";
          const pnlPositive = (calc.pnl ?? 0) >= 0;
          const dirColor = isLong ? "#22c55e" : "#ef4444";
          const pnlColor = pnlPositive ? "#22c55e" : "#ef4444";

          return (
            <div
              key={order.id}
              className="rounded-2xl overflow-hidden"
              style={{
                background: "linear-gradient(160deg, #0a0a0a 0%, #111 100%)",
                border: `1px solid ${isOpen ? "rgba(59,130,246,0.25)" : "rgba(192,192,192,0.12)"}`,
                boxShadow: isOpen ? "0 0 20px rgba(59,130,246,0.06)" : "none",
              }}
            >
              {/* 行1：方向 + 币种 + 杠杆 + 类型标签 + 状态 + 操作 */}
              <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1.5 flex-wrap">
                <span
                  className="text-xs font-bold px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: isLong ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: dirColor }}
                >
                  {isLong ? "多" : "空"}
                </span>
                <span className="text-sm font-semibold" style={{ color: "#d0d0d0" }}>
                  {order.symbol?.replace("USDT", "")} / USDT
                </span>
                {isPerp && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>
                    {order.leverage}x
                  </span>
                )}
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(139,92,246,0.12)", color: "#a78bfa" }}>
                  {isPerp ? "永续" : "现货"}
                </span>
                <span className="text-xs" style={{ color: "#444" }}>
                  {order.vip_level || "普通"} · {order.order_type === "maker" ? "限价" : "市价"}
                </span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded ml-auto"
                  style={
                    isOpen
                      ? { backgroundColor: "rgba(59,130,246,0.12)", color: "#60a5fa" }
                      : { backgroundColor: "rgba(100,100,100,0.15)", color: "#666" }
                  }
                >
                  {isOpen ? "持仓" : "已平"}
                </span>
                <button onClick={() => openEdit(order)} className="p-1 rounded opacity-50 hover:opacity-100">
                  <Pencil className="w-3.5 h-3.5 text-gray-400" />
                </button>
                {deleteConfirmId === order.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { deleteOrderMutation.mutate({ id: order.id, ledgerId }); setDeleteConfirmId(null); }}
                      className="p-1 rounded"
                      style={{ color: "#ef4444" }}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteConfirmId(null)} className="p-1 rounded opacity-50">
                      <X className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteConfirmId(order.id)} className="p-1 rounded opacity-30 hover:opacity-70">
                    <Trash2 className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                )}
              </div>

              {/* 行2：主要数据 - 开仓价 / 最新价 / 盈亏 */}
              <div className="grid grid-cols-3 gap-0 px-3 py-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <div>
                  <div className="text-xs mb-0.5" style={{ color: "#555" }}>开仓价</div>
                  <div className="text-base font-bold font-mono" style={{ color: "#e0e0e0" }}>
                    ${fmt(parseFloat(order.entry_price), 1)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs mb-0.5" style={{ color: "#555" }}>
                    {isOpen ? "最新价" : "平仓价"}
                  </div>
                  <div className="text-base font-bold font-mono" style={{ color: isOpen ? "#e0c060" : "#a0a0a0" }}>
                    {isOpen
                      ? currentPrice ? `$${fmt(currentPrice, 1)}` : "--"
                      : order.exit_price ? `$${fmt(parseFloat(order.exit_price), 1)}` : "--"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs mb-0.5" style={{ color: "#555" }}>
                    {isOpen ? "浮动盈亏" : "实现盈亏"}
                  </div>
                  <div className="text-base font-bold font-mono" style={{ color: pnlColor }}>
                    {calc.pnl != null ? `${calc.pnl >= 0 ? "+" : ""}$${fmt(Math.abs(calc.pnl), 2)}` : "--"}
                  </div>
                  {calc.pnlPct != null && (
                    <div className="text-xs font-mono" style={{ color: pnlColor }}>
                      {fmtPct(calc.pnlPct)}
                    </div>
                  )}
                </div>
              </div>

              {/* 行3：次要数据 - 数量 / 保证金 / 名义价值 */}
              <div className="grid grid-cols-3 gap-0 px-3 py-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <div>
                  <div className="text-xs mb-0.5" style={{ color: "#555" }}>数量</div>
                  <div className="text-sm font-mono" style={{ color: "#b0b0b0" }}>
                    {fmt(parseFloat(order.quantity), 4)} ETH
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs mb-0.5" style={{ color: "#555" }}>{isPerp ? "保证金" : "成本"}</div>
                  <div className="text-sm font-mono" style={{ color: "#b0b0b0" }}>
                    ${fmt(calc.margin, 2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs mb-0.5" style={{ color: "#555" }}>名义价值</div>
                  <div className="text-sm font-mono" style={{ color: "#b0b0b0" }}>
                    ${fmt(calc.notional, 0)}
                  </div>
                </div>
              </div>

              {/* 行4：止盈止损 */}
              {(order.take_profit || order.stop_loss) && (
                <div className="flex gap-4 px-3 py-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  {order.take_profit && (
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="w-3 h-3" style={{ color: "#22c55e" }} />
                      <span className="text-xs" style={{ color: "#555" }}>止盈</span>
                      <span className="text-xs font-mono" style={{ color: "#22c55e" }}>
                        ${fmt(parseFloat(order.take_profit), 1)}
                      </span>
                    </div>
                  )}
                  {order.stop_loss && (
                    <div className="flex items-center gap-1.5">
                      <TrendingDown className="w-3 h-3" style={{ color: "#ef4444" }} />
                      <span className="text-xs" style={{ color: "#555" }}>止损</span>
                      <span className="text-xs font-mono" style={{ color: "#ef4444" }}>
                        ${fmt(parseFloat(order.stop_loss), 1)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* 行5：辅助数据 */}
              <div
                className="grid grid-cols-2 gap-x-2 gap-y-1 px-3 py-2"
                style={{ borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.3)" }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "#444" }}>手续费</span>
                  <span className="text-xs font-mono" style={{ color: "#666" }}>
                    {(calc.feeRate * 100).toFixed(4)}% / -${fmt(calc.totalFee, 4)}
                  </span>
                </div>
                {isPerp && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "#444" }}>资金费率</span>
                    <span className="text-xs font-mono" style={{ color: fundingRate != null && fundingRate > 0 ? "#ef4444" : "#22c55e" }}>
                      {fundingRate != null ? fmtPct(fundingRate) : "--"}
                      {calc.fundingCost != null && (
                        <span style={{ color: "#555" }}> ({calc.fundingCost >= 0 ? "-" : "+"}${fmt(Math.abs(calc.fundingCost), 4)})</span>
                      )}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "#444" }}>盈亏平衡</span>
                  <span className="text-xs font-mono" style={{ color: "#888" }}>
                    ${fmt(calc.breakEven, 2)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: "#444" }}>开仓日期</span>
                  <span className="text-xs" style={{ color: "#666" }}>{order.entry_date}</span>
                </div>
                {order.note && (
                  <div className="col-span-2 flex items-start gap-1 mt-0.5">
                    <span className="text-xs flex-shrink-0" style={{ color: "#444" }}>备注</span>
                    <span className="text-xs" style={{ color: "#666" }}>{order.note}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ===== 新增/编辑弹窗 ===== */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowForm(false); setEditingId(null); } }}
        >
          {/* 弹窗容器：固定宽度，禁止左右滑动 */}
          <div
            className="w-full max-w-md rounded-t-3xl px-5 pt-5 pb-8"
            style={{
              background: "#111",
              border: "1px solid rgba(192,192,192,0.15)",
              maxHeight: "88vh",
              overflowY: "auto",
              overflowX: "hidden",
              touchAction: "pan-y",
              boxSizing: "border-box",
            }}
          >
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold" style={{ color: "#d0d0d0" }}>
                {editingId != null ? "编辑订单" : "新增订单"}
              </h3>
              <button onClick={() => { setShowForm(false); setEditingId(null); }}>
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* 现货 / 永续合约 */}
            <div className="mb-4">
              <label className="block text-xs mb-1.5" style={{ color: "#666" }}>交易类型</label>
              <div className="flex gap-2">
                {(["perp", "spot"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm((f) => ({ ...f, marketType: t }))}
                    className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
                    style={
                      form.marketType === t
                        ? { backgroundColor: "rgba(139,92,246,0.2)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.4)" }
                        : { backgroundColor: "rgba(255,255,255,0.05)", color: "#555", border: "1px solid rgba(255,255,255,0.1)" }
                    }
                  >
                    {t === "perp" ? "永续合约" : "现货"}
                  </button>
                ))}
              </div>
            </div>

            {/* 做多 / 做空 */}
            <div className="mb-4">
              <label className="block text-xs mb-1.5" style={{ color: "#666" }}>方向</label>
              <div className="flex gap-2">
                {(["long", "short"] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setForm((f) => ({ ...f, direction: d }))}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
                    style={
                      form.direction === d
                        ? d === "long"
                          ? { backgroundColor: "rgba(34,197,94,0.2)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.4)" }
                          : { backgroundColor: "rgba(239,68,68,0.2)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.4)" }
                        : { backgroundColor: "rgba(255,255,255,0.05)", color: "#555", border: "1px solid rgba(255,255,255,0.1)" }
                    }
                  >
                    {d === "long" ? "做多 Long" : "做空 Short"}
                  </button>
                ))}
              </div>
            </div>

            {/* VIP等级 + 市价/限价 */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: "#666" }}>VIP 等级</label>
                <select
                  value={form.vipLevel}
                  onChange={(e) => setForm((f) => ({ ...f, vipLevel: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#d0d0d0",
                    outline: "none",
                    appearance: "none",
                  }}
                >
                  {VIP_LEVELS.map((v) => (
                    <option key={v} value={v} style={{ background: "#1a1a1a", color: "#d0d0d0" }}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: "#666" }}>挂单类型</label>
                <div className="flex gap-1.5">
                  {(["taker", "maker"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setForm((f) => ({ ...f, orderType: t }))}
                      className="flex-1 py-2 rounded-xl text-xs font-medium"
                      style={
                        form.orderType === t
                          ? { backgroundColor: "rgba(245,158,11,0.2)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.4)" }
                          : { backgroundColor: "rgba(255,255,255,0.05)", color: "#555", border: "1px solid rgba(255,255,255,0.1)" }
                      }
                    >
                      {t === "taker" ? "市价" : "限价"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 费率预览 */}
            <div
              className="mb-4 px-3 py-2 rounded-xl flex items-center justify-between"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <span className="text-xs" style={{ color: "#555" }}>
                {form.marketType === "perp" ? "合约" : "现货"} {form.orderType === "taker" ? "市价(Taker)" : "限价(Maker)"} 手续费
              </span>
              <span
                className="text-xs font-mono font-semibold"
                style={{ color: previewFeeRate < 0 ? "#22c55e" : "#f59e0b" }}
              >
                {previewFeeRate < 0 ? "返佣 " : ""}{(previewFeeRate * 100).toFixed(4)}%
              </span>
            </div>

            {/* 数字输入字段 */}
            {[
              { label: "开仓价 (USDT)", key: "entryPrice", placeholder: "如 2500.00" },
              { label: "数量 (ETH)", key: "quantity", placeholder: "如 0.5" },
              ...(form.marketType === "perp" ? [{ label: "杠杆倍数", key: "leverage", placeholder: "如 5" }] : []),
              { label: "止盈价 (可选)", key: "takeProfit", placeholder: "如 3000" },
              { label: "止损价 (可选)", key: "stopLoss", placeholder: "如 2200" },
            ].map(({ label, key, placeholder }) => (
              <div key={key} className="mb-3">
                <label className="block text-xs mb-1" style={{ color: "#666" }}>{label}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={(form as any)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 rounded-xl text-sm font-mono"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#d0d0d0",
                    outline: "none",
                    boxSizing: "border-box",
                    maxWidth: "100%",
                  }}
                />
              </div>
            ))}

            {/* 开仓日期 */}
            <div className="mb-3">
              <label className="block text-xs mb-1" style={{ color: "#666" }}>开仓日期</label>
              <input
                type="date"
                value={form.entryDate}
                onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#d0d0d0",
                  outline: "none",
                  boxSizing: "border-box",
                  maxWidth: "100%",
                  WebkitAppearance: "none",
                }}
              />
            </div>

            {/* 状态 */}
            <div className="mb-3">
              <label className="block text-xs mb-1" style={{ color: "#666" }}>状态</label>
              <div className="flex gap-2">
                {(["open", "closed"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setForm((f) => ({ ...f, status: s }))}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                    style={
                      form.status === s
                        ? { backgroundColor: "rgba(59,130,246,0.2)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.4)" }
                        : { backgroundColor: "rgba(255,255,255,0.05)", color: "#555", border: "1px solid rgba(255,255,255,0.1)" }
                    }
                  >
                    {s === "open" ? "持仓中" : "已平仓"}
                  </button>
                ))}
              </div>
            </div>

            {/* 平仓信息（已平仓时显示） */}
            {form.status === "closed" && (
              <>
                <div className="mb-3">
                  <label className="block text-xs mb-1" style={{ color: "#666" }}>平仓价 (USDT)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={form.exitPrice}
                    onChange={(e) => setForm((f) => ({ ...f, exitPrice: e.target.value }))}
                    placeholder="如 2800.00"
                    className="w-full px-3 py-2 rounded-xl text-sm font-mono"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#d0d0d0",
                      outline: "none",
                      boxSizing: "border-box",
                      maxWidth: "100%",
                    }}
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-xs mb-1" style={{ color: "#666" }}>平仓日期</label>
                  <input
                    type="date"
                    value={form.exitDate}
                    onChange={(e) => setForm((f) => ({ ...f, exitDate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-sm"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#d0d0d0",
                      outline: "none",
                      boxSizing: "border-box",
                      maxWidth: "100%",
                      WebkitAppearance: "none",
                    }}
                  />
                </div>
              </>
            )}

            {/* 备注 */}
            <div className="mb-5">
              <label className="block text-xs mb-1" style={{ color: "#666" }}>备注 (可选)</label>
              <textarea
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="如：趋势突破入场"
                rows={2}
                className="w-full px-3 py-2 rounded-xl text-sm resize-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#d0d0d0",
                  outline: "none",
                  boxSizing: "border-box",
                  maxWidth: "100%",
                }}
              />
            </div>

            {/* 提交按钮 */}
            <button
              onClick={handleSubmit}
              disabled={addOrderMutation.isPending || updateOrderMutation.isPending}
              className="w-full py-3 rounded-2xl text-sm font-semibold"
              style={{
                background: "linear-gradient(135deg, #1d4ed8, #2563eb)",
                color: "#fff",
                opacity: addOrderMutation.isPending || updateOrderMutation.isPending ? 0.6 : 1,
              }}
            >
              {addOrderMutation.isPending || updateOrderMutation.isPending
                ? "保存中..."
                : editingId != null
                ? "保存修改"
                : "添加订单"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
