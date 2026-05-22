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
  ChevronUp,
  Plus,
  TrendingUp,
  TrendingDown,
  X,
  Check,
  Pencil,
  Trash2,
  AlertCircle,
  MessageSquarePlus,
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

  // 盈亏平衡价（含手续费 + 累计资金费）
  // 多单：需要涨到 entry*(1+2*fee) + fundingCost/qty 才能回本
  // 空单：需要跌到 entry*(1-2*fee) - fundingCost/qty 才能回本
  const fundingAdj = (fundingCost != null && qty > 0) ? Math.abs(fundingCost) / qty : 0;
  const breakEven =
    direction === "long"
      ? entry * (1 + effectiveFeeRate * 2) + fundingAdj
      : entry * (1 - effectiveFeeRate * 2) - fundingAdj;

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

// ===== 订单备注子组件 =====
const OKX_BG_NOTES = "rgba(0,0,0,0.18)";
const OKX_BORDER_NOTES = "rgba(255,255,255,0.07)";

function OrderNotesSection({
  orderId, ledgerId, isExpanded, onToggle,
  noteInput, onNoteInputChange,
  editingNoteId, editingNoteContent,
  onStartEdit, onCancelEdit, onEditContentChange,
}: {
  orderId: number;
  ledgerId: number;
  isExpanded: boolean;
  onToggle: () => void;
  noteInput: string;
  onNoteInputChange: (v: string) => void;
  editingNoteId: number | null;
  editingNoteContent: string;
  onStartEdit: (id: number, content: string) => void;
  onCancelEdit: () => void;
  onEditContentChange: (v: string) => void;
}) {
  const utils = trpc.useUtils();
  const { data: notes = [] } = trpc.orderFlow.getNotes.useQuery(
    { orderId, ledgerId },
    { enabled: isExpanded, staleTime: 10000 }
  );
  const addNote = trpc.orderFlow.addNote.useMutation({
    onSuccess: () => {
      onNoteInputChange("");
      utils.orderFlow.getNotes.invalidate({ orderId, ledgerId });
    },
  });
  const updateNote = trpc.orderFlow.updateNote.useMutation({
    onSuccess: () => {
      onCancelEdit();
      utils.orderFlow.getNotes.invalidate({ orderId, ledgerId });
    },
  });
  const deleteNote = trpc.orderFlow.deleteNote.useMutation({
    onSuccess: () => utils.orderFlow.getNotes.invalidate({ orderId, ledgerId }),
  });

  function fmtNoteTime(ts: string) {
    const d = new Date(ts);
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${mo}月${day}日 ${h}:${m}`;
  }

  const OKX_TEXT_SEC = "rgba(255,255,255,0.45)";
  const OKX_BORDER = "rgba(255,255,255,0.07)";
  const OKX_YELLOW = "#F0B90B";

  return (
    <div style={{ borderTop: `1px solid ${OKX_BORDER}` }}>
      {/* 备注标题行（可点击折叠） */}
      <button
        className="w-full flex items-center justify-between px-3 py-2"
        style={{ background: OKX_BG_NOTES }}
        onClick={onToggle}
      >
        <div className="flex items-center gap-1.5">
          <MessageSquarePlus className="w-3.5 h-3.5" style={{ color: OKX_TEXT_SEC }} />
          <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>备注</span>
          {notes.length > 0 && (
            <span
              className="text-xs px-1 rounded"
              style={{ background: "rgba(240,185,11,0.15)", color: OKX_YELLOW }}
            >
              {notes.length}
            </span>
          )}
        </div>
        {isExpanded
          ? <ChevronUp className="w-3.5 h-3.5" style={{ color: OKX_TEXT_SEC }} />
          : <ChevronDown className="w-3.5 h-3.5" style={{ color: OKX_TEXT_SEC }} />}
      </button>

      {/* 展开内容 */}
      {isExpanded && (
        <div className="px-3 pb-3" style={{ background: OKX_BG_NOTES }}>
          {/* 备注列表 */}
          {notes.map((note: any) => (
            <div key={note.id} className="mb-2">
              {editingNoteId === note.id ? (
                // 编辑模式
                <div className="flex flex-col gap-1">
                  <textarea
                    className="w-full text-xs rounded px-2 py-1.5 resize-none"
                    style={{ background: "rgba(255,255,255,0.06)", color: "#fff", border: `1px solid rgba(240,185,11,0.4)`, minHeight: 56, outline: "none" }}
                    value={editingNoteContent}
                    onChange={e => onEditContentChange(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      className="text-xs px-2 py-0.5 rounded"
                      style={{ color: OKX_TEXT_SEC, background: "rgba(255,255,255,0.06)" }}
                      onClick={onCancelEdit}
                    >取消</button>
                    <button
                      className="text-xs px-2 py-0.5 rounded"
                      style={{ color: OKX_YELLOW, background: "rgba(240,185,11,0.12)" }}
                      onClick={() => updateNote.mutate({ id: note.id, content: editingNoteContent })}
                      disabled={!editingNoteContent.trim()}
                    >保存</button>
                  </div>
                </div>
              ) : (
                // 显示模式
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs flex-1" style={{ color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>{note.content}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>{fmtNoteTime(note.createdAt)}</span>
                    <button onClick={() => onStartEdit(note.id, note.content)} className="opacity-50 hover:opacity-100">
                      <Pencil className="w-3 h-3" style={{ color: OKX_TEXT_SEC }} />
                    </button>
                    <button onClick={() => deleteNote.mutate({ id: note.id })} className="opacity-50 hover:opacity-100">
                      <X className="w-3 h-3" style={{ color: "#F6465D" }} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* 添加新备注输入框 */}
          <div className="flex items-center gap-2 mt-1">
            <input
              type="text"
              className="flex-1 text-xs rounded px-2 py-1.5"
              style={{ background: "rgba(255,255,255,0.06)", color: "#fff", border: `1px solid ${OKX_BORDER}`, outline: "none" }}
              placeholder="+ 添加备注…"
              value={noteInput}
              onChange={e => onNoteInputChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && noteInput.trim()) {
                  addNote.mutate({ orderId, ledgerId, content: noteInput.trim() });
                }
              }}
            />
            <button
              className="text-xs px-2.5 py-1.5 rounded flex-shrink-0"
              style={{ background: noteInput.trim() ? "rgba(240,185,11,0.15)" : "rgba(255,255,255,0.05)", color: noteInput.trim() ? OKX_YELLOW : OKX_TEXT_SEC }}
              disabled={!noteInput.trim() || addNote.isPending}
              onClick={() => addNote.mutate({ orderId, ledgerId, content: noteInput.trim() })}
            >添加</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 主页面 =====
export default function OrderFlowPage() {
  const [, params] = useRoute("/ledger/:id/order-flow");
  const [, setLocation] = useLocation();
  const ledgerId = params ? parseInt(params.id) : 0;
  const { isAuthenticated } = useAuth();

    // 实时价格（3秒刷新）
  const { data: cryptoPricesRaw } = trpc.getCryptoPrices.useQuery(undefined, {
    refetchInterval: 3000,
    staleTime: 1000,
  });
  // 从价格缓存中按币种取价格
  const getPriceForSymbol = (symbol: string): number | null => {
    const coin = symbol.replace('USDT', '');
    const p = (cryptoPricesRaw as any)?.prices?.[coin];
    return (p && p > 0) ? p : null;
  };
  // 当前页面整体展示价格（用于汇总计算，取各订单自己的价格）
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  useEffect(() => {
    const ethPrice = (cryptoPricesRaw as any)?.prices?.ETH ?? (cryptoPricesRaw as any)?.ETH;
    if (ethPrice && ethPrice > 0) setCurrentPrice(ethPrice);
  }, [cryptoPricesRaw]);
  // 默认止盈价（来自智能仓位管理目标止盈）
  const [takeProfitModified, setTakeProfitModified] = useState(false); // 是否已手动修改止盈价
  const { data: defaultTpData } = trpc.orderFlow.getDefaultTakeProfit.useQuery(
    { ledgerId },
    { enabled: ledgerId > 0, staleTime: 30000 }
  );
    const defaultTakeProfit = defaultTpData?.targetExitPrice ?? null;
  // 最新资金费率（在form定义后使用，见下方UI状态块）
  const [fundingRate, setFundingRate] = useState<number | null>(null);
  // 订单列表
  const utils = trpc.useUtils();
  const { data: orders = [], isLoading } = trpc.orderFlow.getOrders.useQuery(
    { ledgerId, status: "all" },
    { enabled: isAuthenticated && ledgerId > 0 }
  );

  const [formError, setFormError] = useState<string | null>(null);
  const addOrderMutation = trpc.orderFlow.addOrder.useMutation({
    onSuccess: async () => {
      await utils.orderFlow.getOrders.invalidate({ ledgerId });
      setShowForm(false);
      setForm(defaultForm());
      setFormError(null);
    },
    onError: (err) => {
      console.error('[addOrder error]', err);
      setFormError(err.message || '保存失败，请重试');
    },
  });
  const updateOrderMutation = trpc.orderFlow.updateOrder.useMutation({
    onSuccess: async () => {
      await utils.orderFlow.getOrders.invalidate({ ledgerId });
      setEditingId(null);
      setForm(defaultForm());
      setShowForm(false);
      setFormError(null);
    },
    onError: (err) => {
      console.error('[updateOrder error]', err);
      setFormError(err.message || '保存失败，请重试');
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
  // 备注区域状态
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set()); // 已展开备注的订单ID
  const [noteInputs, setNoteInputs] = useState<Record<number, string>>({}); // 各订单的输入框内容
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null); // 正在编辑的备注ID
  const [editingNoteContent, setEditingNoteContent] = useState(""); // 编辑备注的内容

    // 当默认止盈价加载完成时，若弹窗处于新建状态且止盈价还是空，自动填入
  useEffect(() => {
    if (defaultTakeProfit && showForm && editingId === null && !form.takeProfit) {
      setForm(f => ({ ...f, takeProfit: String(defaultTakeProfit) }));
      setTakeProfitModified(false);
    }
  }, [defaultTakeProfit, showForm]);
  // 资金费率（在form定义后，按当前弹窗选择的币种）
  const formSymbol = form.symbol || 'ETHUSDT';
  const { data: fundingRateData } = trpc.orderFlow.getLatestFundingRate.useQuery(
    { symbol: formSymbol },
    { refetchInterval: 60000, staleTime: 30000 }
  );
  useEffect(() => {
    if (fundingRateData?.rate != null) setFundingRate(fundingRateData.rate);
  }, [fundingRateData]);
  const filteredOrders = useMemo(() => {
    if (filterStatus === "all") return orders as any[];
    return (orders as any[]).filter((o: any) => o.status === filterStatus);
  }, [orders, filterStatus]);

  // 汇总计算（基于当前筛选结果）
  const summary = useMemo(() => {
    let totalCost = 0;      // 总成本（保证金）
    let totalNotional = 0;  // 总名义价值
    let totalPnl = 0;       // 总浮动盈亏
    let pnlCount = 0;       // 有有效盈亏的订单数
    for (const order of filteredOrders as any[]) {
      const oPrice = getPriceForSymbol(order.symbol || 'ETHUSDT');
      const calc = calcOrder(order, oPrice, fundingRate);
      totalCost += calc.margin;
      totalNotional += calc.notional;
      if (calc.pnl != null) {
        totalPnl += calc.pnl;
        pnlCount++;
      }
    }
    const pnlPct = totalCost > 0 ? totalPnl / totalCost : null;
    return { totalCost, totalNotional, totalPnl, pnlPct, count: filteredOrders.length, pnlCount };
  }, [filteredOrders, cryptoPricesRaw, fundingRate]);

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
    const tp = order.take_profit ? String(order.take_profit) : "";
    const isDefaultTp = defaultTakeProfit && tp === String(defaultTakeProfit);
    setTakeProfitModified(!isDefaultTp && tp !== "");
    setEditingId(order.id);
    setShowForm(true);
  }

  function handleSubmit() {
    setFormError(null);
    const entryPrice = parseFloat(form.entryPrice);
    const quantity = parseFloat(form.quantity);
    const leverage = parseInt(form.leverage) || 1;
    console.log('[handleSubmit]', { entryPrice, quantity, leverage, ledgerId, isAuthenticated });
    if (!entryPrice || !quantity) {
      setFormError('请填写开仓价和数量');
      return;
    }
    if (ledgerId <= 0) {
      setFormError('账本ID无效，请返回重试');
      return;
    }

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

  // OKX 色系常量
  const OKX_YELLOW = "#F0B90B";          // OKX 主色金黄
  const OKX_BG = "#0B0E11";              // OKX 背景极深黑
  const OKX_CARD = "#161A1E";            // 卡片背景
  const OKX_BORDER = "rgba(255,255,255,0.08)"; // 边框
  const OKX_TEXT_PRI = "#EAECEF";        // 主文字
  const OKX_TEXT_SEC = "#848E9C";        // 次要文字
  const OKX_GREEN = "#F6465D";           // 多/涨 = 红（中国习惯）
  const OKX_RED = "#0ECB81";             // 空/跌 = 绿（中国习惯）
  const BTN_STYLE = { backgroundColor: "rgba(255,255,255,0.06)", color: OKX_TEXT_SEC, border: `1px solid ${OKX_BORDER}` };

  // 当前费率预览
  const previewFeeRate = getFeeRate(form.marketType, form.vipLevel, form.orderType);

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

        <div className="flex-1 min-w-0">
          <button
            onClick={() => setLocation(`/ledger/${ledgerId}/position-calc`)}
            className="flex items-center gap-1 font-semibold text-base"
            style={{
              letterSpacing: "0.02em",
              color: OKX_TEXT_PRI,
              fontWeight: 600,
            }}
          >
            <img
              src="https://haoyouji-images-1396946788.cos.ap-shanghai.myqcloud.com/assets/icons/eth-circle-icon.webp"
              alt="ETH"
              className="w-5 h-5 object-contain rounded-full flex-shrink-0"
            />
            <span>订单流管理</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" style={{ color: OKX_TEXT_SEC }} />
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
                ? { backgroundColor: "rgba(240,185,11,0.15)", color: OKX_YELLOW, border: `1px solid rgba(240,185,11,0.4)` }
                : { backgroundColor: "rgba(255,255,255,0.05)", color: OKX_TEXT_SEC, border: `1px solid ${OKX_BORDER}` }
            }
          >
            {s === "all" ? "全部" : s === "open" ? "持仓中" : "已平仓"}
          </button>
        ))}
        <span className="ml-auto text-xs" style={{ color: OKX_TEXT_SEC }}>
          {filteredOrders.length} 笔
        </span>
      </div>

      {/* ===== 汇总栏 ===== */}
      {!isLoading && summary.count > 0 && (
        <div
          className="mx-3 mb-3 rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(240,185,11,0.08) 0%, rgba(255,255,255,0.03) 60%, rgba(0,0,0,0.2) 100%)",
            border: "1px solid rgba(240,185,11,0.18)",
            boxShadow: "0 2px 16px rgba(240,185,11,0.06)",
          }}
        >
          {/* 顶部标题行 */}
          <div
            className="flex items-center justify-between px-4 pt-2.5 pb-1"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
          >
            <span className="text-xs font-medium" style={{ color: "rgba(240,185,11,0.7)", letterSpacing: "0.05em" }}>持仓汇总</span>
            <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>{summary.count} 笔订单</span>
          </div>
          {/* 主数据行：三列 */}
          <div className="flex items-stretch px-4 py-3 gap-3">
            {/* 左：总名义价值 */}
            <div className="flex-1">
              <div className="text-xs mb-1" style={{ color: OKX_TEXT_SEC }}>名义价值</div>
              <div
                className="text-base font-bold"
                style={{
                  color: "rgba(255,255,255,0.9)",
                  fontFamily: "Inter, -apple-system, sans-serif",
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.02em",
                }}
              >
                {fmt(summary.totalNotional, 0)}
                <span className="text-xs font-normal ml-0.5" style={{ color: OKX_TEXT_SEC }}>u</span>
              </div>
            </div>
            {/* 分隔线 */}
            <div style={{ width: 1, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />
            {/* 中：总成本 */}
            <div className="flex-1 text-center">
              <div className="text-xs mb-1" style={{ color: OKX_TEXT_SEC }}>总成本</div>
              <div
                className="text-base font-bold"
                style={{
                  color: "rgba(255,255,255,0.9)",
                  fontFamily: "Inter, -apple-system, sans-serif",
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.02em",
                }}
              >
                {fmt(summary.totalCost, 0)}
                <span className="text-xs font-normal ml-0.5" style={{ color: OKX_TEXT_SEC }}>u</span>
              </div>
            </div>
            {/* 分隔线 */}
            <div style={{ width: 1, background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />
            {/* 右：总浮动盈亏 */}
            <div className="flex-1 text-right">
              <div className="text-xs mb-1" style={{ color: OKX_TEXT_SEC }}>浮动盈亏</div>
              <div
                className="text-base font-bold"
                style={{
                  color: summary.totalPnl >= 0 ? OKX_RED : OKX_GREEN,
                  fontFamily: "Inter, -apple-system, sans-serif",
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.02em",
                }}
              >
                {summary.totalPnl >= 0 ? "+" : ""}{fmt(summary.totalPnl, 2)}
                <span className="text-xs font-normal ml-0.5" style={{ color: OKX_TEXT_SEC }}>u</span>
              </div>
              {summary.pnlPct != null && (
                <div
                  className="text-xs mt-0.5"
                  style={{
                    color: summary.totalPnl >= 0 ? "rgba(246,70,93,0.7)" : "rgba(14,203,129,0.7)",
                    fontFamily: "Inter, -apple-system, sans-serif",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {summary.totalPnl >= 0 ? "+" : ""}{(summary.pnlPct * 100).toFixed(2)}%
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== 订单卡片列表 ===== */}
      <div className="px-3 space-y-3 pb-4">
        {isLoading && (
          <div className="text-center py-12 text-sm" style={{ color: OKX_TEXT_SEC }}>加载中...</div>
        )}
        {!isLoading && filteredOrders.length === 0 && (
          <div className="text-center py-16">
            <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-20" style={{ color: OKX_TEXT_SEC }} />
            <p className="text-sm" style={{ color: OKX_TEXT_SEC }}>暂无订单，点击下方 + 新增</p>
          </div>
        )}

        {filteredOrders.map((order: any) => {
          const orderPrice = getPriceForSymbol(order.symbol || 'ETHUSDT');
          const calc = calcOrder(order, orderPrice, fundingRate);
          const isLong = order.direction === "long";
          const isOpen = order.status === "open";
          const isPerp = order.market_type !== "spot";
          const pnlPositive = (calc.pnl ?? 0) >= 0;
          const isNotesExpanded = expandedNotes.has(order.id);
          const dirColor = isLong ? "#F6465D" : "#0ECB81";  // 多=红 空=绿
          const pnlColor = pnlPositive ? "#F6465D" : "#0ECB81"; // 涨=红 跌=绿

          return (
            <div
              key={order.id}
              className="rounded-2xl overflow-hidden"
              style={{
                background: OKX_CARD,
                border: `1px solid ${isOpen ? "rgba(59,130,246,0.25)" : "rgba(192,192,192,0.12)"}`,
                boxShadow: isOpen ? "0 0 20px rgba(59,130,246,0.06)" : "none",
              }}
            >
              {/* 行1：方向 + 币种 + 杠杆 + 类型标签 + 状态 + 操作 */}
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
                {isPerp && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(240,185,11,0.12)", color: OKX_YELLOW }}>
                    {order.leverage}x
                  </span>
                )}
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(240,185,11,0.08)", color: OKX_TEXT_SEC }}>
                  {isPerp ? "永续" : "现货"}
                </span>
                {/* 开仓日期（持仓中）或开仓+平仓日期（已平仓） */}
                {isOpen ? (
                  <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>{order.entry_date}</span>
                ) : (
                  <div className="flex flex-col leading-tight">
                    <span className="text-xs" style={{ color: OKX_TEXT_SEC, fontSize: "0.65rem" }}>{order.entry_date}</span>
                    {order.exit_date && <span className="text-xs" style={{ color: OKX_TEXT_SEC, fontSize: "0.65rem" }}>{order.exit_date}</span>}
                  </div>
                )}

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
                <button onClick={() => openEdit(order)} className="p-1 rounded opacity-50 hover:opacity-100">
                  <Pencil className="w-3.5 h-3.5 text-gray-400" />
                </button>
              </div>

              {/* 行2：主要数据 - 开仓价 / 最新价 / 盈亏 */}
              <div className="grid grid-cols-3 gap-0 px-3 py-2" style={{ borderTop: `1px solid ${OKX_BORDER}` }}>
                <div>
                  <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>开仓价</div>
                  <div className="text-base font-bold" style={{ color: OKX_TEXT_PRI, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(parseFloat(order.entry_price), 1)} u
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>
                    {isOpen ? "最新价" : "平仓价"}
                  </div>
                  <div className="text-base font-bold" style={{ color: isOpen ? OKX_YELLOW : OKX_TEXT_SEC, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                    {isOpen
                      ? orderPrice ? `${fmt(orderPrice, 1)} u` : "--"
                      : order.exit_price ? `${fmt(parseFloat(order.exit_price), 1)} u` : "--"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>
                    {isOpen ? "浮动盈亏" : "实现盈亏"}
                  </div>
                  <div className="text-base font-bold" style={{ color: pnlColor, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                    {calc.pnl != null ? `${calc.pnl >= 0 ? "+" : "-"}${fmt(Math.abs(calc.pnl), 2)} u` : "--"}
                  </div>
                  {calc.pnlPct != null && (
                    <div className="text-xs" style={{ color: pnlColor, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                      {fmtPct(calc.pnlPct)}
                    </div>
                  )}
                </div>
              </div>

              {/* 行3：次要数据 - 数量 / 保证金 / 名义价值 */}
              <div className="grid grid-cols-3 gap-0 px-3 py-2" style={{ borderTop: `1px solid ${OKX_BORDER}` }}>
                <div>
                  <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>数量</div>
                  <div className="text-sm" style={{ color: OKX_TEXT_PRI, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(parseFloat(order.quantity), 4)} ETH
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>{isPerp ? "保证金" : "成本"}</div>
                  <div className="text-sm" style={{ color: OKX_TEXT_PRI, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(calc.margin, 2)} u
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs mb-0.5" style={{ color: OKX_TEXT_SEC }}>名义价值</div>
                  <div className="text-sm" style={{ color: OKX_TEXT_PRI, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(calc.notional, 0)} u
                  </div>
                </div>
              </div>

              {/* 行4：止盈止损 + 预计净利润/净亏损 */}
              {(order.take_profit || order.stop_loss) && (() => {
                const entry = parseFloat(order.entry_price);
                const qty = parseFloat(order.quantity);
                const feeRate = Math.max(0, calc.feeRate);
                const isLongDir = order.direction === "long";
                // 资金费率估算（当前周期费率 xd7 预计持仓天数，暂用当前费率估算）
                const estimatedFundingPerPeriod = fundingRate != null ? fundingRate * entry * qty : 0;
                const tpPrice = order.take_profit ? parseFloat(order.take_profit) : null;
                const slPrice = order.stop_loss ? parseFloat(order.stop_loss) : null;
                const calcNetPnl = (targetPrice: number) => {
                  const rawPnl = isLongDir ? (targetPrice - entry) * qty : (entry - targetPrice) * qty;
                  const openFee = entry * qty * feeRate;
                  const closeFee = targetPrice * qty * feeRate;
                  // 资金费估算：当前已累计（已有数据）+ 未来估算（用当前费率估算）
                  const fundingEst = calc.fundingCost != null ? Math.abs(calc.fundingCost) : 0;
                  return rawPnl - openFee - closeFee - fundingEst;
                };
                return (
                  <div className="px-3 py-1.5 space-y-1" style={{ borderTop: `1px solid ${OKX_BORDER}` }}>
                    {tpPrice && (() => {
                      const net = calcNetPnl(tpPrice);
                      const isDefaultTp = defaultTakeProfit && Math.round(tpPrice) === defaultTakeProfit;
                      return (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <TrendingUp className="w-3 h-3" style={{ color: OKX_GREEN }} />
                            <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>止盈 {fmt(tpPrice, 1)} u</span>
                            {isDefaultTp ? (
                              <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: OKX_TEXT_SEC }}>默认</span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openEdit(order); }}
                                className="text-xs px-1.5 py-0.5 rounded"
                                style={{ backgroundColor: "rgba(240,185,11,0.12)", color: OKX_YELLOW, cursor: "pointer" }}
                              >恢复默认</button>
                            )}
                          </div>
                          <span className="text-xs font-medium" style={{ color: net >= 0 ? OKX_GREEN : OKX_RED, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                            预计净利润 {net >= 0 ? "+" : ""}{fmt(net, 2)} u
                          </span>
                        </div>
                      );
                    })()}
                    {slPrice && (() => {
                      const net = calcNetPnl(slPrice);
                      return (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <TrendingDown className="w-3 h-3" style={{ color: OKX_RED }} />
                            <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>止损 {fmt(slPrice, 1)} u</span>
                          </div>
                          <span className="text-xs font-medium" style={{ color: net >= 0 ? OKX_GREEN : OKX_RED, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                            预计净亏损 {net >= 0 ? "+" : ""}{fmt(net, 2)} u
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* 行5：辅助数据 */}
              <div
                className="flex flex-col gap-y-1 px-3 py-2"
                style={{ borderTop: `1px solid ${OKX_BORDER}`, background: "rgba(0,0,0,0.25)" }}
              >
                {/* 盈亏平衡 + 手续费 合并一行 */}
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>盈亏平衡 {fmt(calc.breakEven, 2)} u</span>
                  <span className="text-xs" style={{ color: OKX_TEXT_SEC, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>-{fmt(calc.totalFee, 4)} u</span>
                </div>
                {isPerp && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>资金费率</span>
                    <span className="text-xs" style={{ color: fundingRate != null && fundingRate > 0 ? OKX_RED : OKX_GREEN, fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                      {fundingRate != null ? fmtPct(fundingRate) : "--"}
                      {calc.fundingCost != null && (
                        <span style={{ color: OKX_TEXT_SEC }}> &nbsp;—&nbsp; {calc.fundingCost >= 0 ? "-" : "+"}{fmt(Math.abs(calc.fundingCost), 4)} u</span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* 行6：多条备注区域（可折叠） */}
              <OrderNotesSection
                orderId={order.id}
                ledgerId={ledgerId}
                isExpanded={isNotesExpanded}
                onToggle={() => {
                  setExpandedNotes(prev => {
                    const next = new Set(prev);
                    if (next.has(order.id)) next.delete(order.id);
                    else next.add(order.id);
                    return next;
                  });
                }}
                noteInput={noteInputs[order.id] ?? ""}
                onNoteInputChange={(v) => setNoteInputs(prev => ({ ...prev, [order.id]: v }))}
                editingNoteId={editingNoteId}
                editingNoteContent={editingNoteContent}
                onStartEdit={(id, content) => { setEditingNoteId(id); setEditingNoteContent(content); }}
                onCancelEdit={() => { setEditingNoteId(null); setEditingNoteContent(""); }}
                onEditContentChange={setEditingNoteContent}
              />
            </div>
          );
        })}
      </div>

      {/* ===== 新增/编辑弹窗 ===== */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowForm(false); setEditingId(null); } }}
        >
          {/* 弹窗容器：固定宽度，禁止左右滑动 */}
          <div
            className="w-full max-w-md rounded-t-3xl px-5 pt-5 pb-8"
            style={{
              background: "#161A1E",
              border: `1px solid ${OKX_BORDER}`,
              maxHeight: "88vh",
              overflowY: "auto",
              overflowX: "hidden",
              touchAction: "pan-y",
              boxSizing: "border-box",
            }}
          >
            {/* 弹窗标题 */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold" style={{ color: OKX_TEXT_PRI }}>
                {editingId != null ? "编辑订单" : "新增订单"}
              </h3>
              <div className="flex items-center gap-2">
                {/* 编辑模式下显示删除按鈕 */}
                {editingId != null && (
                  deleteConfirmId === editingId ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>确认删除?</span>
                      <button
                        onClick={() => { deleteOrderMutation.mutate({ id: editingId, ledgerId }); setDeleteConfirmId(null); setShowForm(false); setEditingId(null); }}
                        className="px-2 py-0.5 rounded text-xs"
                        style={{ backgroundColor: "rgba(246,70,93,0.15)", color: OKX_RED, border: `1px solid rgba(246,70,93,0.3)` }}
                      >
                        删除
                      </button>
                      <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-0.5 rounded text-xs" style={{ color: OKX_TEXT_SEC }}>
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(editingId)}
                      className="p-1 rounded"
                      style={{ color: OKX_RED, opacity: 0.6 }}
                      title="删除订单"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )
                )}
                <button onClick={() => { setShowForm(false); setEditingId(null); setDeleteConfirmId(null); }}>
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            {/* 币种 + 交易类型 + 方向（一行三个下拉） */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {/* 币种 */}
              <div>
                <label className="block text-xs mb-1.5" style={{ color: OKX_TEXT_SEC }}>币种</label>
                <select
                  value={form.symbol}
                  onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
                  className="w-full px-2 py-2 rounded-xl text-sm"
                  style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${OKX_BORDER}`, color: OKX_TEXT_PRI }}
                >
                  <option value="ETHUSDT">ETH</option>
                  <option value="BTCUSDT">BTC</option>
                  <option value="SOLUSDT">SOL</option>
                  <option value="SUIUSDT">SUI</option>
                </select>
              </div>
              {/* 交易类型 */}
              <div>
                <label className="block text-xs mb-1.5" style={{ color: OKX_TEXT_SEC }}>类型</label>
                <select
                  value={form.marketType}
                  onChange={(e) => setForm((f) => ({ ...f, marketType: e.target.value as "perp" | "spot" }))}
                  className="w-full px-2 py-2 rounded-xl text-sm"
                  style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${OKX_BORDER}`, color: OKX_TEXT_PRI }}
                >
                  <option value="perp">永续合约</option>
                  <option value="spot">现货</option>
                </select>
              </div>
              {/* 方向 */}
              <div>
                <label className="block text-xs mb-1.5" style={{ color: OKX_TEXT_SEC }}>方向</label>
                <select
                  value={form.direction}
                  onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value as "long" | "short" }))}
                  className="w-full px-2 py-2 rounded-xl text-sm font-semibold"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${OKX_BORDER}`,
                    color: form.direction === "long" ? "#F6465D" : "#0ECB81",
                  }}
                >
                  <option value="long">做多</option>
                  <option value="short">做空</option>
                </select>
              </div>
            </div>

            {/* VIP等级 + 市价/限价 */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: OKX_TEXT_SEC }}>VIP 等级</label>
                <select
                  value={form.vipLevel}
                  onChange={(e) => setForm((f) => ({ ...f, vipLevel: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl text-sm"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${OKX_BORDER}`,
                    color: OKX_TEXT_PRI,
                    outline: "none",
                    appearance: "none",
                  }}
                >
                  {VIP_LEVELS.map((v) => (
                    <option key={v} value={v} style={{ background: "#1a1a1a", color: OKX_TEXT_PRI }}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: OKX_TEXT_SEC }}>挂单类型</label>
                <div className="flex gap-1.5">
                  {(["taker", "maker"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setForm((f) => ({ ...f, orderType: t }))}
                      className="flex-1 py-2 rounded-xl text-xs font-medium"
                      style={
                        form.orderType === t
                          ? { backgroundColor: "rgba(240,185,11,0.15)", color: OKX_YELLOW, border: "1px solid rgba(240,185,11,0.4)" }
                          : { backgroundColor: "rgba(255,255,255,0.05)", color: OKX_TEXT_SEC, border: `1px solid ${OKX_BORDER}` }
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
              style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${OKX_BORDER}` }}
            >
              <span className="text-xs" style={{ color: OKX_TEXT_SEC }}>
                {form.marketType === "perp" ? "合约" : "现货"} {form.orderType === "taker" ? "市价(Taker)" : "限价(Maker)"} 手续费
              </span>
              <span
                className="text-xs font-semibold" style={{ fontFamily: "Inter, -apple-system, sans-serif", fontVariantNumeric: "tabular-nums" }}
                style={{ color: previewFeeRate < 0 ? OKX_GREEN : OKX_YELLOW }}
              >
                {previewFeeRate < 0 ? "返佣 " : ""}{(previewFeeRate * 100).toFixed(4)}%
              </span>
            </div>

            {/* 数字输入字段 */}
            {[
              { label: "开仓价 (USDT)", key: "entryPrice", placeholder: "如 2500.00" },
              { label: "数量 (ETH)", key: "quantity", placeholder: "如 0.5" },
              ...(form.marketType === "perp" ? [{ label: "杠杆倍数", key: "leverage", placeholder: "如 5" }] : []),
              { label: "止损价 (可选)", key: "stopLoss", placeholder: "如 2200" },
            ].map(({ label, key, placeholder }) => (
              <div key={key} className="mb-3">
                <label className="block text-xs mb-1" style={{ color: OKX_TEXT_SEC }}>{label}</label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={(form as any)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 rounded-xl text-sm font-mono"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${OKX_BORDER}`,
                    color: OKX_TEXT_PRI,
                    outline: "none",
                    boxSizing: "border-box",
                    maxWidth: "100%",
                  }}
                />
              </div>
            ))}
            {/* 止盈价（带默认值跟踪） */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs" style={{ color: OKX_TEXT_SEC }}>止盈价 (可选)</label>
                {defaultTakeProfit && (
                  <button
                    type="button"
                    onClick={() => {
                      // 无论当前状态，点击都填入默认值
                      setForm(f => ({ ...f, takeProfit: String(defaultTakeProfit) }));
                      setTakeProfitModified(false);
                    }}
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: takeProfitModified ? "rgba(240,185,11,0.12)" : "rgba(255,255,255,0.08)",
                      color: takeProfitModified ? OKX_YELLOW : OKX_TEXT_SEC,
                    }}
                  >
                    {takeProfitModified ? "恢复默认" : "默认"}
                  </button>
                )}
              </div>
              <input
                type="number"
                inputMode="decimal"
                value={form.takeProfit}
                onChange={(e) => {
                  setForm(f => ({ ...f, takeProfit: e.target.value }));
                  setTakeProfitModified(e.target.value !== "" && e.target.value !== String(defaultTakeProfit));
                }}
                placeholder={defaultTakeProfit ? `默认 ${defaultTakeProfit}` : "如 3000"}
                className="w-full px-3 py-2 rounded-xl text-sm font-mono"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${takeProfitModified ? OKX_YELLOW : OKX_BORDER}`,
                  color: OKX_TEXT_PRI,
                  outline: "none",
                  boxSizing: "border-box",
                  maxWidth: "100%",
                }}
              />
            </div>

            {/* 开仓日期 */}
            <div className="mb-3">
              <label className="block text-xs mb-1" style={{ color: OKX_TEXT_SEC }}>开仓日期</label>
              <input
                type="date"
                value={form.entryDate}
                onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl text-sm"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${OKX_BORDER}`,
                  color: OKX_TEXT_PRI,
                  outline: "none",
                  boxSizing: "border-box",
                  maxWidth: "100%",
                  WebkitAppearance: "none",
                }}
              />
            </div>

            {/* 状态 */}
            <div className="mb-3">
              <label className="block text-xs mb-1" style={{ color: OKX_TEXT_SEC }}>状态</label>
              <div className="flex gap-2">
                {(["open", "closed"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setForm((f) => ({ ...f, status: s }))}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                    style={
                      form.status === s
                        ? { backgroundColor: "rgba(240,185,11,0.15)", color: OKX_YELLOW, border: `1px solid rgba(240,185,11,0.4)` }
                        : { backgroundColor: "rgba(255,255,255,0.05)", color: OKX_TEXT_SEC, border: `1px solid ${OKX_BORDER}` }
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
                  <label className="block text-xs mb-1" style={{ color: OKX_TEXT_SEC }}>平仓价 (USDT)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={form.exitPrice}
                    onChange={(e) => setForm((f) => ({ ...f, exitPrice: e.target.value }))}
                    placeholder="如 2800.00"
                    className="w-full px-3 py-2 rounded-xl text-sm font-mono"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: `1px solid ${OKX_BORDER}`,
                      color: OKX_TEXT_PRI,
                      outline: "none",
                      boxSizing: "border-box",
                      maxWidth: "100%",
                    }}
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-xs mb-1" style={{ color: OKX_TEXT_SEC }}>平仓日期</label>
                  <input
                    type="date"
                    value={form.exitDate}
                    onChange={(e) => setForm((f) => ({ ...f, exitDate: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-sm"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: `1px solid ${OKX_BORDER}`,
                      color: OKX_TEXT_PRI,
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
              <label className="block text-xs mb-1" style={{ color: OKX_TEXT_SEC }}>备注 (可选)</label>
              <textarea
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="如：趋势突破入场"
                rows={2}
                className="w-full px-3 py-2 rounded-xl text-sm resize-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${OKX_BORDER}`,
                  color: OKX_TEXT_PRI,
                  outline: "none",
                  boxSizing: "border-box",
                  maxWidth: "100%",
                }}
              />
            </div>

            {/* 错误提示 */}
            {formError && (
              <div
                className="mb-3 px-3 py-2 rounded-xl text-xs"
                style={{ background: "rgba(246,70,93,0.1)", border: "1px solid rgba(246,70,93,0.3)", color: OKX_RED }}
              >
                {formError}
              </div>
            )}
            {/* 提交按钮 */}
            <button
              onClick={handleSubmit}
              disabled={addOrderMutation.isPending || updateOrderMutation.isPending}
              className="w-full py-3 rounded-2xl text-sm font-semibold"
              style={{
                background: `linear-gradient(135deg, ${OKX_YELLOW}, #e6a800)`,
                color: "#000",
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
      {/* ===== 底部 FAB 新增按钮 ===== */}
      {!showForm && <button
        onClick={() => {
          setEditingId(null);
          const f = defaultForm();
          if (defaultTakeProfit) { f.takeProfit = String(defaultTakeProfit); }
          setForm(f);
          setTakeProfitModified(false);
          setShowForm(true);
        }}
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all inline-flex items-center justify-center"
        style={{ backgroundColor: OKX_YELLOW, color: "#000" }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>}
    </div>
  );
}
